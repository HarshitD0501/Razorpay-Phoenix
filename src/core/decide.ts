/**
 * L2 (price) + the orchestrator. Deterministic — no model, no I/O, no clock.
 * The caller supplies `istHour`, so a test can pin 22:00 without waiting.
 *
 * decide() is the ONLY entry point. All five modules (W0 rescue, W1 pre-flight,
 * W2 migrator, W3 ladder, What-If) call this same function; they differ only in
 * the window they pass. That is why the scope fits: one core, five surfaces.
 */
import Decimal from "decimal.js";
import { believedCost, believedSuccess } from "./beliefs";
import { gate, type GateContext } from "./gate";
import { BLAST, LEGAL_IN, type ActionKind, type Bucket } from "./types";

export type Candidate = {
  action: ActionKind;
  ev: Decimal; //     expected value, rupees
  gain: Decimal; //   p(success) * invoice
  cost: Decimal;
  p: Decimal;
  gateVetoes: string[];
};

export type Decision = {
  chosen: ActionKind;
  bucket: Bucket;
  candidates: Candidate[]; //   every option, priced — this is the audit payload
  vetoes: string[];
  /** true when the chosen action came out of a gate downgrade, not the ranking. */
  downgraded: boolean;
};

export type PriceInput = {
  bucket: Bucket;
  invoiceRupees: number | string;
  ctx: GateContext;
  /** Perturbation knob: scales every believed success probability. */
  beliefScale?: number;
  /** Arm switch. false = rank by gain only, ignoring cost (i.e. "rules only"). */
  useEv?: boolean;
  /** Adversarial arm: zero out fatigue and issuer penalties. */
  zeroCosts?: boolean;
};

export function decide(input: PriceInput): Decision {
  const { bucket, ctx } = input;
  const invoice = new Decimal(input.invoiceRupees);
  const scale = new Decimal(input.beliefScale ?? 1);
  const useEv = input.useEv ?? true;

  const candidates: Candidate[] = [];
  for (const action of LEGAL_IN[ctx.window]) {
    // Gate FIRST, then price what survived. Pricing a vetoed action and
    // discarding it later invites someone to rank on the pre-gate number.
    const g = gate(action, ctx);
    const effective = g.action;

    const p = believedSuccess(bucket, effective).times(scale).clamp(0, 0.95);
    const gain = p.times(invoice);
    const cost = input.zeroCosts
      ? new Decimal(0)
      : believedCost(effective, ctx.priorContacts, invoice, {
          discountFraction:
            effective === "discount_offer"
              ? new Decimal(ctx.discountRupees).div(invoice.gt(0) ? invoice : 1).toNumber()
              : undefined,
        });

    candidates.push({
      action: effective,
      p,
      gain,
      cost,
      ev: useEv ? gain.minus(cost) : gain,
      gateVetoes: g.vetoes,
    });
  }

  // Ties break toward the smaller blast radius, then toward the earlier action
  // in ACTIONS order. Deterministic: same input, same output, always.
  candidates.sort((a, b) => {
    const byEv = b.ev.comparedTo(a.ev);
    if (byEv !== 0) return byEv;
    return BLAST[a.action] - BLAST[b.action];
  });

  const best = candidates[0] ?? {
    action: "wait" as ActionKind,
    p: new Decimal(0),
    gain: new Decimal(0),
    cost: new Decimal(0),
    ev: new Decimal(0),
    gateVetoes: [],
  };

  // Negative EV means doing nothing is worth more than the best action.
  // Restraint is a decision, and it is recorded as one.
  const chosen = best.ev.lte(0) ? ("wait" as ActionKind) : best.action;

  return {
    chosen,
    bucket,
    candidates,
    vetoes: [...new Set(candidates.flatMap((c) => c.gateVetoes))],
    downgraded: best.gateVetoes.length > 0 && chosen === best.action,
  };
}
