/**
 * Phoenix domain types.
 *
 * Two invariants live here and nowhere else:
 *   1. The classifier returns one of five ORDINAL buckets, never a probability.
 *      No float produced by a model reaches the money math.
 *   2. Every action carries an integer blast radius. gate() may lower it or
 *      veto; it may never raise it. See gate().
 */

/** Recoverability, five ordinal buckets. Index = severity, 0 = hopeless. */
export const BUCKETS = ["DEAD", "UNLIKELY", "UNCERTAIN", "LIKELY", "IMMINENT"] as const;
export type Bucket = (typeof BUCKETS)[number];

/** The left-shift windows. Earlier is cheaper. */
export const WINDOWS = [
  "W0_IN_SESSION", // t ~ 0s      rescue modal, customer is still here
  "W1_PRE_DEBIT", //  t - 24h     merchant-side pre-flight before the debit
  "W2_PRE_EXPIRY", // t - 7d      mandate migration
  "W3_POST_FAILURE", // t + 1..3d dunning ladder — the last resort
] as const;
export type Window = (typeof WINDOWS)[number];

export const ACTIONS = [
  "wait",
  "rescue_offer", //     W0: render a card in a session the customer already has
  "flag_internal",
  "notify_email", //     transactional
  "preflight_notify", // W1: transactional, "your card expires before the debit"
  "notify_whatsapp",
  "mandate_migrate", //  W2: card -> UPI Autopay swap offer
  "pause_offer",
  "downgrade_offer",
  "reschedule_offer",
  "retry_charge", //     issuer-visible, burns one of only three retries
  "discount_offer", //   permanent revenue give-up
] as const;
export type ActionKind = (typeof ACTIONS)[number];

/**
 * Blast radius, by irreversibility toward the customer.
 *   0 nothing · 1 internal or in-session UI · 2 transactional contact
 *   3 personal channel / mandate change · 4 authorization attempt
 *   5 monetary concession
 *
 * Note the shape: the further left the window, the lower the ceiling. W0's
 * rescue card is radius 1 because the customer is already in the session —
 * left-shift does not just recover more, it reaches for less.
 */
export const BLAST: Record<ActionKind, number> = {
  wait: 0,
  rescue_offer: 1,
  flag_internal: 1,
  notify_email: 2,
  preflight_notify: 2,
  notify_whatsapp: 3,
  mandate_migrate: 3,
  pause_offer: 3,
  downgrade_offer: 3,
  reschedule_offer: 3,
  retry_charge: 4,
  discount_offer: 5,
};

/** Which actions are legal in which window. A window is not a label. */
export const LEGAL_IN: Record<Window, readonly ActionKind[]> = {
  W0_IN_SESSION: ["wait", "rescue_offer", "flag_internal"],
  W1_PRE_DEBIT: ["wait", "flag_internal", "preflight_notify", "notify_email", "mandate_migrate"],
  W2_PRE_EXPIRY: ["wait", "flag_internal", "notify_email", "mandate_migrate", "notify_whatsapp"],
  W3_POST_FAILURE: [
    "wait",
    "flag_internal",
    "notify_email",
    "notify_whatsapp",
    "retry_charge",
    "pause_offer",
    "downgrade_offer",
    "reschedule_offer",
    "discount_offer",
  ],
};

/** Discount-bearing actions are promotional under TCCCPR; the rest are not. */
export const PROMOTIONAL: readonly ActionKind[] = ["discount_offer", "downgrade_offer"];

/** L1 output. `reason` is a real Razorpay error code, not an invented one. */
export type Classification = {
  reason: string;
  bucket: Bucket;
  rationale: string;
  source: "llm" | "table";
  /** Set when the LLM was tried and rejected/failed, so the ablation can count it. */
  fellBackBecause?: string;
};

/** The failure as it arrives from Razorpay (poller or webhook, same shape). */
export type FailureEnvelope = {
  paymentId: string;
  code?: string; //     e.g. BAD_REQUEST_ERROR
  source?: string; //   bank | gateway | customer | issuer ...
  step?: string; //     payment_authentication | payment_authorization ...
  reason?: string; //   card_expired | payment_timed_out | ...
  description?: string;
  method?: string; //   card | upi | netbanking
  bank?: string; //     HDFC | SBI | ICIC ...
};
