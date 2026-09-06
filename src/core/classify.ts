/**
 * L1 — the only stage an LLM touches.
 *
 * Contract: returns an ordinal Bucket, never a probability. The LLM cannot
 * hand a float to the money math even if it tries; zod rejects anything but
 * the five enum members, and a rejection falls back to the table.
 *
 * Reason strings below are the real ones from Razorpay's error docs
 * (card_expired, payment_timed_out, ...) — not invented near-misses like
 * "expired_card" or "incorrect_otp", which do not exist in their taxonomy.
 */
import { z } from "zod";
import { BUCKETS, type Bucket, type Classification, type FailureEnvelope } from "./types";

/** reason -> bucket. Deterministic, offline, and the arm-C classifier. */
const TABLE: Record<string, Bucket> = {
  // instrument is gone; no schedule of retries fixes it
  card_expired: "DEAD",
  card_disabled: "DEAD",
  invalid_card: "DEAD",
  card_blocked_by_bank: "DEAD",
  mandate_revoked: "DEAD",
  payment_upi_vpa_invalid: "DEAD",

  // funds or limits — time helps, payday helps more
  payment_failed_insufficient_funds: "LIKELY",
  card_limit_exceeded: "LIKELY",
  payment_declined_by_bank_due_to_insufficient_balance: "LIKELY",

  // transient infra — retry soon, but not into the same degraded node
  payment_timed_out: "IMMINENT",
  gateway_technical_error: "IMMINENT",
  server_error: "IMMINENT",
  bank_server_down: "IMMINENT",
  payment_pending: "IMMINENT",

  // customer-side friction
  payment_cancelled_by_user: "UNCERTAIN",
  payment_authentication_failed: "UNCERTAIN",
  payment_upi_collect_request_expired: "UNCERTAIN",

  // issuer said no, no reason given
  payment_declined_by_bank: "UNLIKELY",
  card_declined_by_issuer: "UNLIKELY",
  risk_threshold_exceeded: "UNLIKELY",
};

/**
 * When `reason` is null — a real and common case — source+step still carry
 * signal. This is the perturbation class the LLM should earn its keep on.
 */
function fromSourceStep(e: FailureEnvelope): Bucket {
  if (e.source === "bank" || e.source === "gateway") return "IMMINENT";
  if (e.step === "payment_authentication") return "UNCERTAIN";
  if (e.step === "payment_authorization") return "UNLIKELY";
  if (e.source === "customer") return "UNCERTAIN";
  return "UNCERTAIN";
}

export function classifyByTable(e: FailureEnvelope): Classification {
  const key = (e.reason ?? "").trim();
  const hit = key ? TABLE[key] : undefined;
  return {
    reason: key || `${e.source ?? "unknown"}/${e.step ?? "unknown"}`,
    bucket: hit ?? fromSourceStep(e),
    rationale: hit
      ? `lookup: ${key}`
      : `no table entry; inferred from source=${e.source ?? "-"} step=${e.step ?? "-"}`,
    source: "table",
  };
}

const LlmOut = z.object({
  bucket: z.enum(BUCKETS),
  reason: z.string().min(1),
  rationale: z.string().min(1),
  confident: z.boolean(),
});

/**
 * Two constraints picked this model, both verified against the live API rather than
 * assumed:
 *
 *  1. Gemini 2.5 Flash — the natural choice — is NOT usable: the API answers
 *     "no longer available to new users" for 2.5-flash and 2.5-flash-lite on a
 *     freshly issued key.
 *  2. gemini-3.5-flash works, but its free tier allows only 20 requests
 *     (`generate_content_free_tier_requests, limit: 20`). A 600-case ablation
 *     exhausts that in seconds, and because a 429 degrades to the table per-case,
 *     the run does not fail — it silently returns an arm D that IS arm C. That is
 *     precisely the measurement lie this repo is built to avoid, so the ablation
 *     pins the model it can actually run 600 times on a free key.
 *
 * -lite is the weaker classifier: spot-checking found it call `card_expired`
 * UNLIKELY where 3.5-flash says DEAD. That cost is left in the reported recall
 * instead of being tuned away — a measured weakness beats an unmeasured strength.
 * Pinned to a concrete id, not a `-latest` alias, so a committed results file says
 * exactly what produced it.
 */
export const LLM_MODEL = "gemini-3.5-flash-lite";

/**
 * The AI SDK's Google provider reads GOOGLE_GENERATIVE_AI_API_KEY. GEMINI_API_KEY
 * is what Google's own console and docs hand you, so accept either and normalise —
 * a key in the wrong variable name is the least interesting way for arm D to
 * silently degrade to arm C.
 */
export function geminiKey(): string | undefined {
  const k = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (k) process.env.GOOGLE_GENERATIVE_AI_API_KEY = k;
  return k;
}

/**
 * Arm D's classifier. No key, no model, low confidence, or a schema violation
 * -> table, with the cause recorded so the ablation can report WHY, not just
 * that it happened.
 */
export async function classifyByLlm(e: FailureEnvelope): Promise<Classification> {
  const table = classifyByTable(e);
  if (!geminiKey()) {
    return { ...table, fellBackBecause: "no GOOGLE_GENERATIVE_AI_API_KEY" };
  }
  try {
    const [{ generateObject }, { google }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/google"),
    ]);
    const { object } = await generateObject({
      model: google(LLM_MODEL),
      schema: LlmOut,
      system:
        "You triage Razorpay payment failures. Output a recoverability bucket only — " +
        "never a probability, never a rupee figure, never an action. " +
        "DEAD=instrument is gone, no retry schedule fixes it. UNLIKELY=issuer refused, no stated cause. " +
        "UNCERTAIN=customer-side friction. LIKELY=funds or limits, time or payday helps. " +
        "IMMINENT=transient infrastructure, will succeed shortly. " +
        "Fields may conflict or be null. When `reason` is missing, weigh source and step. " +
        "When `reason` conflicts with source/step, treat the reason code as possibly stale or " +
        "mis-mapped by the gateway and weigh source, step and `description` above it. " +
        "Set confident=false only if no field resolves the conflict.",
      prompt: JSON.stringify(e),
    });
    if (!object.confident) {
      return { ...table, fellBackBecause: "llm not confident" };
    }
    return {
      reason: object.reason,
      bucket: object.bucket,
      rationale: object.rationale,
      source: "llm",
    };
  } catch (err) {
    return { ...table, fellBackBecause: `llm error: ${(err as Error).message.slice(0, 80)}` };
  }
}
