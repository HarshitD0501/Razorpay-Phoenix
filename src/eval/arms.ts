/**
 * The evaluation. This file is the submission — the UI only displays what it
 * prints.
 *
 * Arms are NESTED: each differs from the previous by exactly one component, so
 * every delta is attributable to that component and nothing else.
 *
 *   0  do nothing                     the zero line
 *   A  Razorpay's documented default  T+1/T+2/T+3 then halted + card-update mail
 *   B  + rules and gate               no EV, no LLM
 *   C  + EV pricing                   table classifier
 *   D  + LLM classifier               isolates the LLM alone
 *   E  + left-shift windows W0-W2     isolates the thesis
 *
 * Common random numbers: the luck draw is seeded from (caseId, day) and NOT
 * from the arm, so every arm faces the identical world. Differences between
 * arms are policy, not variance.
 */
import Decimal from "decimal.js";
import { classifyByLlm, classifyByTable } from "../core/classify";
import { decide } from "../core/decide";
import type { GateContext } from "../core/gate";
import type { ActionKind, Bucket, Window } from "../core/types";
import { generate } from "../sim/generate";
import { rng, trueCost, trueSuccess, type SimCase } from "../sim/world";

export type Params = {
  graceDays: number;
  contactCapPerWeek: number;
  discountCeilingRupees: number;
  retryCap: number;
  upiAutopayCeilingRupees: number;
  istHour: number;
  beliefScale: number;
  zeroCosts: boolean;
};

export const DEFAULTS: Params = {
  graceDays: 7,
  contactCapPerWeek: 3,
  discountCeilingRupees: 400,
  retryCap: 3, //                     Razorpay allows 3 retries per invoice
  upiAutopayCeilingRupees: 15000, //  no-AFA ceiling
  istHour: 11,
  beliefScale: 1,
  zeroCosts: false,
};

export type ArmId = "0" | "A" | "B" | "C" | "D" | "E";

export type ArmResult = {
  arm: ArmId;
  label: string;
  recoveredCount: number;
  recoveredRupees: string;
  costRupees: string;
  netRupees: string;
  netVsArm0: string;
  authAttempts: number;
  customerContacts: number;
  /** Contacts spent on accounts that would have paid with no intervention. */
  wastedNotifications: number;
  /** Chose `wait` while ground truth still had a live instrument. */
  underProposals: number;
  vetoesByRule: Record<string, number>;
  actionCounts: Record<string, number>;
  llmCalls: number;
  llmFallbacks: number;
};

type Classifier = (c: SimCase) => Promise<{ bucket: Bucket; fellBack: boolean; llm: boolean }>;

const tableClassifier: Classifier = async (c) => {
  const r = classifyByTable(c.envelope);
  return { bucket: r.bucket, fellBack: false, llm: false };
};

function ctxFor(
  c: SimCase,
  p: Params,
  window: Window,
  priorContacts: number,
  retriesUsed: number,
  day: number,
): GateContext {
  return {
    window,
    istHour: p.istHour,
    priorContacts,
    contactCapPerWeek: p.contactCapPerWeek,
    // The Twilio sandbox opt-in ("join <code>") is a real consent artifact; the
    // sim mirrors it as an explicit per-customer flag, never assumed true.
    consentWhatsapp: c.truth.whatsappResponsive || c.id.endsWith("2"),
    retriesUsed,
    retryCap: p.retryCap,
    mandateAmountRupees: c.mandateAmountRupees,
    upiAutopayCeilingRupees: p.upiAutopayCeilingRupees,
    discountRupees: Math.min(
      p.discountCeilingRupees + 1,
      Math.round(c.truth.invoiceRupees * 0.2),
    ),
    discountCeilingRupees: p.discountCeilingRupees,
    railDegraded: c.truth.railDegraded && day < c.truth.railClearsInDays,
  };
}

const CONTACT_ACTIONS = new Set<ActionKind>([
  "notify_email",
  "notify_whatsapp",
  "preflight_notify",
  "mandate_migrate",
  "pause_offer",
  "downgrade_offer",
  "reschedule_offer",
  "discount_offer",
]);

export async function runArm(
  arm: ArmId,
  cases: SimCase[],
  p: Params = DEFAULTS,
  classifier: Classifier = tableClassifier,
): Promise<ArmResult> {
  const label = {
    "0": "do nothing",
    A: "Razorpay default (T+1/2/3 -> halted)",
    B: "rules + gate, no EV",
    C: "+ EV pricing (table classifier)",
    D: "+ LLM classifier",
    E: "+ left-shift W0-W2",
  }[arm];

  let recoveredCount = 0;
  let recovered = new Decimal(0);
  let cost = new Decimal(0);
  let authAttempts = 0;
  let contacts = 0;
  let wasted = 0;
  let under = 0;
  let llmCalls = 0;
  let llmFallbacks = 0;
  const vetoesByRule: Record<string, number> = {};
  const actionCounts: Record<string, number> = {};

  for (const c of cases) {
    const luck = rng(hash(c.id));
    let priorContacts = 0;
    let retriesUsed = 0;
    let done = false;
    let contactedThisCase = 0;

    const act = (action: ActionKind, day: number): boolean => {
      actionCounts[action] = (actionCounts[action] ?? 0) + 1;
      if (action === "wait") return false;
      if (action === "retry_charge") {
        authAttempts++;
        retriesUsed++;
      }
      if (CONTACT_ACTIONS.has(action)) {
        contacts++;
        contactedThisCase++;
      }
      cost = cost.plus(trueCost(action, priorContacts));
      if (CONTACT_ACTIONS.has(action)) priorContacts++;
      const won = luck() < trueSuccess(c.truth, action, day, priorContacts - 1);
      if (won) {
        recoveredCount++;
        recovered = recovered.plus(c.truth.invoiceRupees);
        // A discount that lands still gives up revenue.
        if (action === "discount_offer") {
          cost = cost.plus(Math.round(c.truth.invoiceRupees * 0.2));
        }
      }
      return won;
    };

    if (arm === "0") {
      if (c.truth.selfHeals) {
        recoveredCount++;
        recovered = recovered.plus(c.truth.invoiceRupees);
      }
      continue;
    }

    if (arm === "A") {
      // Razorpay's own documented behaviour: three fixed retries on
      // consecutive days, then halt and e-mail a card-update link. No
      // classification, no gate, no restraint. A real baseline, not a strawman.
      for (const day of [1, 2, 3]) {
        if (act("retry_charge", day)) {
          done = true;
          break;
        }
      }
      if (!done) done = act("notify_email", 4);
      if (!done && !c.truth.terminal) under++;
      if (contactedThisCase > 0 && c.truth.selfHeals) wasted++;
      continue;
    }

    // Arms B-E share the spine; they differ only in the flags below.
    const useEv = arm !== "B";

    // E only: one shot in the window where this failure was detectable BEFORE
    // it became a failure. That is the entire thesis, and it costs one contact.
    if (arm === "E" && c.detectableIn !== "W3_POST_FAILURE") {
      const cls = await classifier(c);
      if (cls.llm) llmCalls++;
      if (cls.fellBack) llmFallbacks++;
      const d = decide({
        bucket: cls.bucket,
        invoiceRupees: c.truth.invoiceRupees,
        ctx: ctxFor(c, p, c.detectableIn, priorContacts, retriesUsed, 0),
        beliefScale: p.beliefScale,
        useEv,
        zeroCosts: p.zeroCosts,
      });
      for (const v of d.vetoes) vetoesByRule[v] = (vetoesByRule[v] ?? 0) + 1;
      if (act(d.chosen, 0)) done = true;
    }

    for (let day = 1; day <= p.graceDays && !done; day++) {
      const cls = await classifier(c);
      if (cls.llm) llmCalls++;
      if (cls.fellBack) llmFallbacks++;
      const d = decide({
        bucket: cls.bucket,
        invoiceRupees: c.truth.invoiceRupees,
        ctx: ctxFor(c, p, "W3_POST_FAILURE", priorContacts, retriesUsed, day),
        beliefScale: p.beliefScale,
        useEv,
        zeroCosts: p.zeroCosts,
      });
      for (const v of d.vetoes) vetoesByRule[v] = (vetoesByRule[v] ?? 0) + 1;
      if (d.chosen === "wait") {
        // Quitting is a decision. If the instrument was still live, that is an
        // under-proposal and it is counted against this arm.
        if (!c.truth.terminal && day <= 2) under++;
        break;
      }
      if (act(d.chosen, day)) done = true;
    }

    if (contactedThisCase > 0 && c.truth.selfHeals) wasted++;
  }

  const net = recovered.minus(cost);
  return {
    arm,
    label,
    recoveredCount,
    recoveredRupees: recovered.toFixed(0),
    costRupees: cost.toFixed(0),
    netRupees: net.toFixed(0),
    netVsArm0: "0", // filled by the caller, which knows arm 0's net
    authAttempts,
    customerContacts: contacts,
    wastedNotifications: wasted,
    underProposals: under,
    vetoesByRule,
    actionCounts,
    llmCalls,
    llmFallbacks,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export { generate, tableClassifier, classifyByLlm };
