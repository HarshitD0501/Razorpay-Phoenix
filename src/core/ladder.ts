/**
 * The retention ladder. Domain logic, not HTTP — the WhatsApp route is one
 * caller, `decide()` and `gate()` still own the money.
 *
 * Pause -> Downgrade -> Payday reschedule -> capped discount, discount LAST.
 * The rule that makes it a ladder rather than a menu: intent narrows what may be
 * reached for, it never unlocks a rung. A customer asking for a lower price gets
 * a lighter plan; the concession is only reachable once they have declined one.
 */
import type { ActionKind } from "./types";

export type Intent = "pause" | "later" | "cheaper" | "cancel" | "pay" | "unknown";

export function intentOf(text: string): Intent {
  const t = text.toLowerCase();
  // Order matters: "too expensive, cancel it" is a churn signal first and a
  // price objection second, so cancel is tested before cheaper.
  if (/\bpaid|paying|done\b/.test(t)) return "pay";
  if (/\bcancel|stop|quit|unsubscribe\b/.test(t)) return "cancel";
  if (/\bpause|hold|freeze\b/.test(t)) return "pause";
  if (/\blater|payday|salary|next month|delay\b/.test(t)) return "later";
  if (/\bcheap|discount|less|expensive|afford|offer\b/.test(t)) return "cheaper";
  return "unknown";
}

const RUNG: Record<Intent, ActionKind> = {
  pause: "pause_offer",
  later: "reschedule_offer",
  cheaper: "downgrade_offer", // NOT discount_offer — see escalation below
  cancel: "pause_offer", //     retention before concession
  pay: "wait",
  unknown: "reschedule_offer",
};

/**
 * @param priorRungs every rung already offered to this customer, from the audit
 *   ledger. The ledger IS the conversation state; there is no second store.
 */
export function rungFor(intent: Intent, priorRungs: (string | undefined)[]): ActionKind {
  if (intent === "cheaper" && priorRungs.includes("downgrade_offer")) return "discount_offer";
  return RUNG[intent];
}
