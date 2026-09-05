/**
 * The AGENT'S beliefs. Deliberately a separate file from src/sim/world.ts, and
 * deliberately importing nothing from it.
 *
 * Anti-circularity: if the agent's beliefs and the simulator's ground truth
 * shared constants or functional form, the evaluation would be measuring
 * itself. The agent believes a flat per-(bucket, action) table. The world runs
 * a logistic decay over an unobserved instrument state. Different form,
 * different numbers, no shared import — grep the two files to check.
 *
 * These numbers are the agent's PRIORS. eval/run-arms.ts scales them 0.3x-3x
 * in the perturbation run; if the conclusions move, that gets reported.
 */
import Decimal from "decimal.js";
import type { ActionKind, Bucket } from "./types";

const d = (n: number | string) => new Decimal(n);

/** Believed p(the money lands | bucket, action). Ordinal in, Decimal out. */
const BASE: Record<Bucket, number> = {
  DEAD: 0.01,
  UNLIKELY: 0.08,
  UNCERTAIN: 0.25,
  LIKELY: 0.45,
  IMMINENT: 0.7,
};

/** Multiplier on BASE for what the action actually does. */
const LIFT: Record<ActionKind, number> = {
  wait: 0.35, //             some accounts self-heal
  flag_internal: 0.35,
  rescue_offer: 1.6, //      the customer is present; nothing converts better
  preflight_notify: 1.35, // fix it before the retry is spent
  notify_email: 0.8,
  notify_whatsapp: 1.1,
  mandate_migrate: 1.45,
  pause_offer: 0.9, //       saves the relationship, not this rupee
  downgrade_offer: 1.0,
  reschedule_offer: 1.25,
  retry_charge: 1.0,
  discount_offer: 1.3,
};

/**
 * Cost side, in rupees. This is what makes recovery rate un-gameable: retrying
 * forever wins on recovery count and loses here.
 *   contact  — attention spent; compounds with prior contacts (fatigue)
 *   auth     — issuer-visible declines raise scrutiny and burn 1 of 3 retries
 */
export const COST = {
  contactRupees: 6,
  fatigueRupeesPerPriorContact: 11,
  authAttemptRupees: 14,
  /** Fraction of the invoice given up by discount_offer. */
  discountFraction: 0.2,
} as const;

export function believedSuccess(bucket: Bucket, action: ActionKind): Decimal {
  return d(BASE[bucket]).times(LIFT[action]).clamp(0, 0.95);
}

export function believedCost(
  action: ActionKind,
  priorContacts: number,
  invoice: Decimal,
  overrides: { discountFraction?: number } = {},
): Decimal {
  let cost = d(0);
  const isContact =
    action === "notify_email" ||
    action === "notify_whatsapp" ||
    action === "preflight_notify" ||
    action === "mandate_migrate" ||
    action === "pause_offer" ||
    action === "downgrade_offer" ||
    action === "reschedule_offer" ||
    action === "discount_offer";
  if (isContact) {
    cost = cost
      .plus(COST.contactRupees)
      .plus(d(COST.fatigueRupeesPerPriorContact).times(priorContacts));
  }
  if (action === "retry_charge") cost = cost.plus(COST.authAttemptRupees);
  if (action === "discount_offer") {
    cost = cost.plus(invoice.times(overrides.discountFraction ?? COST.discountFraction));
  }
  return cost;
}
