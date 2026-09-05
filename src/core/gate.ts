/**
 * L3 — the gate. Pure functions, no I/O, no model.
 *
 * ONE-WAY VALVE: a gate may VETO or DOWNGRADE. It may never widen. An attempt
 * to return an action with a higher blast radius than it received throws —
 * in production, not only under test. Shape credited to Backstop
 * (github.com/ramkirangaruda/Razorpay); it is the right shape.
 */
import { BLAST, LEGAL_IN, PROMOTIONAL, type ActionKind, type Window } from "./types";

export type GateContext = {
  window: Window;
  /** IST hour, 0-23. TCCCPR curfews PROMOTIONAL messages only. */
  istHour: number;
  priorContacts: number;
  contactCapPerWeek: number;
  /** Explicit, per-channel. No consent -> no personal-channel contact, full stop. */
  consentWhatsapp: boolean;
  /** Razorpay only allows 3 retries per invoice; a 4th is not ours to spend. */
  retriesUsed: number;
  retryCap: number;
  /** UPI Autopay clears without AFA up to Rs 15,000 (Rs 1L, select MCCs). */
  mandateAmountRupees: number;
  upiAutopayCeilingRupees: number;
  /** Discount must stay inside the merchant's LTV/CAC envelope. */
  discountRupees: number;
  discountCeilingRupees: number;
  /** Downtime feed says this rail is degraded right now. */
  railDegraded: boolean;
};

export type GateResult = {
  action: ActionKind;
  vetoes: string[]; //     rules that fired, in order
  downgraded: boolean;
};

const NOOP: ActionKind = "wait";

/** Ordered rules. Each may return a replacement action (or NOOP to veto). */
const RULES: {
  id: string;
  applies: (a: ActionKind, c: GateContext) => boolean;
  to: ActionKind;
}[] = [
  {
    id: "window_illegal",
    applies: (a, c) => !LEGAL_IN[c.window].includes(a),
    to: NOOP,
  },
  {
    id: "no_whatsapp_consent",
    applies: (a, c) => a === "notify_whatsapp" && !c.consentWhatsapp,
    to: "notify_email", // downgrade, not veto: e-mail needs no opt-in
  },
  {
    id: "tcccpr_promotional_curfew",
    // 09:00-21:00 IST for promotional only. Service notices are NOT time-barred;
    // a blanket quiet-hours rule would wrongly suppress them.
    applies: (a, c) => PROMOTIONAL.includes(a) && (c.istHour < 9 || c.istHour >= 21),
    to: NOOP,
  },
  {
    id: "contact_cap",
    applies: (a, c) => BLAST[a] >= 2 && c.priorContacts >= c.contactCapPerWeek,
    to: NOOP,
  },
  {
    id: "retry_cap_exhausted",
    applies: (a, c) => a === "retry_charge" && c.retriesUsed >= c.retryCap,
    to: NOOP,
  },
  {
    id: "retry_into_degraded_rail",
    // Retrying into a rail the downtime feed says is down spends an
    // authorization attempt to learn what we already know.
    applies: (a, c) => a === "retry_charge" && c.railDegraded,
    to: NOOP,
  },
  {
    id: "upi_autopay_ceiling",
    applies: (a, c) =>
      a === "mandate_migrate" && c.mandateAmountRupees > c.upiAutopayCeilingRupees,
    to: "notify_email", // the swap is not available; say so, don't offer it
  },
  {
    id: "discount_unpriced",
    // A discount of Rs 0 is not a free discount, it is a missing input. Priced at
    // zero it costs nothing, so it wins on EV against every honest rung — the exact
    // unpriced-concession error this repo argues against. One guard here rather than
    // in each caller: any caller that has not decided the amount cannot offer one.
    applies: (a, c) => a === "discount_offer" && !(c.discountRupees > 0),
    to: "reschedule_offer",
  },
  {
    id: "discount_ceiling",
    applies: (a, c) => a === "discount_offer" && c.discountRupees > c.discountCeilingRupees,
    to: "reschedule_offer", // cheaper rung of the same ladder
  },
];

export function gate(proposed: ActionKind, ctx: GateContext): GateResult {
  const ceiling = BLAST[proposed];
  let action = proposed;
  const vetoes: string[] = [];

  // Re-run until stable: a downgrade can itself be illegal (whatsapp -> email
  // in a window where e-mail is also capped).
  for (let pass = 0; pass < RULES.length + 1; pass++) {
    const rule = RULES.find((r) => r.applies(action, ctx));
    if (!rule) break;
    vetoes.push(rule.id);
    action = rule.to;
  }

  if (BLAST[action] > ceiling) {
    throw new Error(
      `one-way valve violated: gate raised ${proposed}(${ceiling}) -> ${action}(${BLAST[action]})`,
    );
  }
  return { action, vetoes, downgraded: action !== proposed };
}
