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
  reason: z.string().min(1).max(64),
  rationale: z.string().min(1).max(240),
  confident: z.boolean(),
});

/**
 * Arm D's classifier. No key, no model, low confidence, or a schema violation
 * -> table, with the cause recorded so the ablation can report WHY, not just
 * that it happened.
 */
export async function classifyByLlm(e: FailureEnvelope): Promise<Classification> {
  const table = classifyByTable(e);
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...table, fellBackBecause: "no ANTHROPIC_API_KEY" };
  }
  try {
    const [{ generateObject }, { anthropic }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/anthropic"),
    ]);
    const { object } = await generateObject({
      model: anthropic("claude-sonnet-5"),
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
