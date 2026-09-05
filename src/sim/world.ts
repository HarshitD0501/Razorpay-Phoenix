/**
 * The SIMULATOR'S ground truth. Imports nothing from src/core/.
 *
 * Anti-circularity, concretely: the agent believes a flat
 * per-(bucket, action) table (src/core/beliefs.ts). This world runs a logistic
 * function over a hidden instrument-health scalar the agent never observes, with
 * its own unrelated constants. Different functional form, different numbers, no
 * shared import. If these two files ever share a constant the evaluation stops
 * measuring anything.
 *
 * Deterministic: mulberry32 seeded, so `--seed 42` reproduces byte-for-byte.
 */

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hidden state the agent cannot see. `health` in [0,1] drives everything. */
export type Truth = {
  /** Instrument health. 0 = card is dead, 1 = perfectly good. */
  health: number;
  /** Rupees the merchant loses if this never recovers. */
  invoiceRupees: number;
  /** Does the customer read WhatsApp? Unobserved. */
  whatsappResponsive: boolean;
  /** Days until salary credit. Drives the funds-shortfall cases. */
  daysToPayday: number;
  /** True when the instrument is structurally gone — nothing recovers it. */
  terminal: boolean;
  /** Rail is degraded at t0; clears after `railClearsInDays`. */
  railDegraded: boolean;
  railClearsInDays: number;
  /** Would this account have paid with NO intervention at all? */
  selfHeals: boolean;
};

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * p(action lands). Deliberately a different shape from believedSuccess():
 * logistic over health, with an additive per-action offset and a hard zero on
 * terminal instruments.
 */
export function trueSuccess(
  t: Truth,
  action: string,
  day: number,
  priorContacts: number,
): number {
  if (t.terminal) {
    // Only a mandate swap or a rescue-time method switch can save a dead
    // instrument. Retrying it is pure waste — this is what arm A pays for.
    if (action === "mandate_migrate") return 0.34;
    if (action === "rescue_offer") return 0.41;
    return 0.0;
  }

  const railPenalty = t.railDegraded && day < t.railClearsInDays ? -2.1 : 0;
  const paydayBonus = day >= t.daysToPayday ? 1.3 : 0;
  // Attention is finite: each prior contact costs real conversion.
  const fatigue = -0.42 * priorContacts;

  const offset: Record<string, number> = {
    wait: -1.4,
    flag_internal: -1.4,
    rescue_offer: 1.9,
    preflight_notify: 1.15,
    notify_email: -0.25,
    notify_whatsapp: t.whatsappResponsive ? 0.85 : -0.9,
    mandate_migrate: 1.0,
    pause_offer: 0.15,
    downgrade_offer: 0.35,
    reschedule_offer: day >= t.daysToPayday ? 1.4 : 0.2,
    retry_charge: 0.4,
    discount_offer: 0.95,
  };

  const z =
    -1.7 + 4.2 * t.health + (offset[action] ?? -1.4) + railPenalty + paydayBonus + fatigue;
  return Math.min(0.97, Math.max(0, logistic(z)));
}

/**
 * The world's REAL costs, in rupees. Different numbers from the agent's
 * believedCost() on purpose — the agent is not given the true cost table, it is
 * given a guess at it. If these matched, every EV calculation would be exactly
 * right and the evaluation would be flattering itself.
 */
export const TRUE_COST = {
  contact: 4,
  /** Attention burns superlinearly: the 4th message annoys more than the 1st. */
  fatiguePerPriorContact: 14,
  /** An issuer-visible decline: gateway fee plus a real scrutiny cost. */
  authAttempt: 19,
} as const;

export function trueCost(action: string, priorContacts: number): number {
  const contactActions = new Set([
    "notify_email",
    "notify_whatsapp",
    "preflight_notify",
    "mandate_migrate",
    "pause_offer",
    "downgrade_offer",
    "reschedule_offer",
    "discount_offer",
  ]);
  let c = 0;
  if (contactActions.has(action)) {
    c += TRUE_COST.contact + TRUE_COST.fatiguePerPriorContact * priorContacts;
  }
  if (action === "retry_charge") c += TRUE_COST.authAttempt;
  return c;
}

/** The four perturbation classes the LLM ablation reports separately. */
export type Perturbation = "clean" | "context" | "contradictory" | "null_reason";
export type SimCase = {
  id: string;
  truth: Truth;
  perturbation: Perturbation;
  /** What the API actually hands us — lossy on purpose. */
  envelope: {
    paymentId: string;
    reason?: string;
    source?: string;
    step?: string;
    description?: string;
    method?: string;
    bank?: string;
  };
  /** Which left-shift window this case is detectable in, if any before W3. */
  detectableIn: "W0_IN_SESSION" | "W1_PRE_DEBIT" | "W2_PRE_EXPIRY" | "W3_POST_FAILURE";
  mandateAmountRupees: number;
  /** Ground-truth bucket, for classifier recall. Derived from health, not shared. */
  trueBucket: "DEAD" | "UNLIKELY" | "UNCERTAIN" | "LIKELY" | "IMMINENT";
};
