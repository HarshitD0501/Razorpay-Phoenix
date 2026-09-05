/**
 * Case generator. Seeded, deterministic: `seed 42` reproduces byte-for-byte.
 *
 * The envelope is generated FROM the hidden truth and then degraded, which is
 * the honest way round: the agent sees a lossy projection of a world it cannot
 * inspect. The four perturbation classes are how the LLM ablation gets split.
 */
import { rng, type Perturbation, type SimCase, type Truth } from "./world";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const REASONS = {
  DEAD: ["card_expired", "card_disabled", "invalid_card", "mandate_revoked"],
  UNLIKELY: ["payment_declined_by_bank", "card_declined_by_issuer", "risk_threshold_exceeded"],
  UNCERTAIN: [
    "payment_cancelled_by_user",
    "payment_authentication_failed",
    "payment_upi_collect_request_expired",
  ],
  LIKELY: ["payment_failed_insufficient_funds", "card_limit_exceeded"],
  IMMINENT: ["payment_timed_out", "gateway_technical_error", "bank_server_down"],
} as const;

const SOURCE_OF = {
  DEAD: "issuer",
  UNLIKELY: "issuer",
  UNCERTAIN: "customer",
  LIKELY: "issuer",
  IMMINENT: "bank",
} as const;

const STEP_OF = {
  DEAD: "payment_authorization",
  UNLIKELY: "payment_authorization",
  UNCERTAIN: "payment_authentication",
  LIKELY: "payment_authorization",
  IMMINENT: "payment_authorization",
} as const;

type B = keyof typeof REASONS;

/** health -> bucket. The world's mapping; the agent never sees this function. */
function bucketOf(t: Truth): B {
  if (t.terminal) return "DEAD";
  if (t.railDegraded) return "IMMINENT";
  if (t.daysToPayday > 0 && t.health < 0.55) return "LIKELY";
  if (t.health < 0.3) return "UNLIKELY";
  if (t.health > 0.72) return "IMMINENT";
  return "UNCERTAIN";
}

export function generate(n: number, seed = 42): SimCase[] {
  const r = rng(seed);
  const cases: SimCase[] = [];

  for (let i = 0; i < n; i++) {
    // ~24% of a realistic batch is structurally unrecoverable. This is why
    // absolute recovered value is a bad headline and arm 0 has to exist.
    const terminal = r() < 0.24;
    const railDegraded = !terminal && r() < 0.18;
    const truth: Truth = {
      health: terminal ? r() * 0.08 : 0.18 + r() * 0.82,
      invoiceRupees: Math.round((299 + r() * 4700) / 10) * 10,
      whatsappResponsive: r() < 0.62,
      daysToPayday: Math.floor(r() * 9),
      terminal,
      railDegraded,
      railClearsInDays: 1 + Math.floor(r() * 2),
      // Would it have paid with nothing done at all? Arm 0's whole point, and
      // the denominator of the wasted-notification rate.
      selfHeals: !terminal && r() < 0.11,
    };

    const bucket = bucketOf(truth);
    const perturbation: Perturbation = pick(r, [
      "clean",
      "clean",
      "clean",
      "context",
      "contradictory",
      "null_reason",
    ] as const);

    const trueReason = pick(r, REASONS[bucket]);
    let reason: string | undefined = trueReason;
    let description: string | undefined;
    let source: string | undefined = SOURCE_OF[bucket];
    let step: string | undefined = STEP_OF[bucket];

    if (perturbation === "null_reason") {
      // Real and common: reason is null, source+step survive. The table has to
      // guess from source/step; this is where the LLM should earn its place.
      reason = undefined;
    } else if (perturbation === "context") {
      // The code is generic; the only real signal is in the prose.
      reason = "payment_failed";
      description = `Bank declined: ${trueReason.replace(/_/g, " ")}`;
    } else if (perturbation === "contradictory") {
      // The structured fields disagree with EACH OTHER: a mis-mapped gateway
      // code carries the wrong reason while source+step still describe what
      // really happened. A reason-first lookup is confidently wrong here; that
      // is the point, and it is why this class is reported separately.
      const wrongBand = (Object.keys(REASONS) as B[]).filter((b) => b !== bucket);
      reason = pick(r, REASONS[pick(r, wrongBand)]);
      description = `Gateway code may be stale; bank reported a ${SOURCE_OF[bucket]}-side ${bucket.toLowerCase()} condition at ${STEP_OF[bucket]}.`;
    }
    if (r() < 0.08) source = undefined;

    const detectableIn = terminal
      ? // A dead instrument is visible BEFORE the debit — that is the thesis.
        r() < 0.55
        ? "W2_PRE_EXPIRY"
        : "W1_PRE_DEBIT"
      : railDegraded
        ? "W0_IN_SESSION"
        : r() < 0.22
          ? "W1_PRE_DEBIT"
          : "W3_POST_FAILURE";

    cases.push({
      id: `case_${String(i).padStart(4, "0")}`,
      truth,
      perturbation,
      envelope: {
        paymentId: `pay_SIM${String(i).padStart(6, "0")}`,
        reason,
        source,
        step,
        description,
        method: pick(r, ["card", "card", "upi", "netbanking"]),
        bank: pick(r, ["HDFC", "SBIN", "ICIC", "UTIB", "PUNB"]),
      },
      detectableIn,
      mandateAmountRupees: Math.round((499 + r() * 24000) / 10) * 10,
      trueBucket: bucket,
    });
  }
  return cases;
}
