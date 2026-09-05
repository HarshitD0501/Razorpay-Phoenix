/**
 * W3 — the WhatsApp retention agent, inbound turn.
 *
 * Twilio POSTs form-encoded. Split of responsibility, which is the whole point:
 *   - the LADDER RUNG and every rupee figure come from decide() — deterministic
 *   - the LLM only picks WORDING, and only if a key exists
 * So there is no prompt that can talk the system into a discount. The ceiling is
 * a gate input, not an instruction.
 *
 * Wire up: npx localtunnel --port 3000, then set the sandbox's "when a message
 * comes in" webhook to <url>/api/whatsapp.
 */
import { append, read } from "@/core/audit";
import { decide } from "@/core/decide";
import { intentOf, rungFor } from "@/core/ladder";
import { DEFAULTS } from "@/eval/arms";
import type { ActionKind } from "@/core/types";

const COPY: Record<ActionKind, (rs: number) => string> = {
  pause_offer: () =>
    "Done — I can hold your plan for 30 days. Nothing is charged while it's paused and you keep your data. Reply YES to pause.",
  reschedule_offer: () =>
    "I've moved your renewal to the 3rd, just after most salary credits. Nothing changes until then. Reply YES to confirm.",
  discount_offer: (rs) =>
    `I can apply ₹${rs} off this cycle — that's the most I'm authorised to offer. Reply YES and it's applied.`,
  wait: () => "Thanks — I can see the payment. Nothing more needed from you.",
  notify_whatsapp: () => "Sending you the payment link now.",
  notify_email: () => "I've emailed you the details.",
  preflight_notify: () => "Heads up — your card expires before the next renewal.",
  mandate_migrate: () =>
    "Your card expires before the next renewal. Want to switch to UPI Autopay? Takes about ten seconds.",
  downgrade_offer: () => "There's a lighter plan that keeps the essentials. Want the details?",
  retry_charge: () => "I'll try the renewal again shortly.",
  rescue_offer: () => "Try another payment method?",
  flag_internal: () => "Noted — someone will look at this.",
};

export async function POST(req: Request) {
  const form = await req.formData();
  const from = String(form.get("From") ?? "");
  const text = String(form.get("Body") ?? "");
  const messageSid = String(form.get("MessageSid") ?? "");

  const intent = intentOf(text);
  const invoiceRupees = 499;

  // The audit ledger is the conversation state — no separate store.
  const priorRungs = read()
    .filter((r) => r.caseId === from)
    .map((r) => (r.output as { rung?: string } | null)?.rung);
  const proposed = rungFor(intent, priorRungs);

  const d = decide({
    bucket: intent === "pay" ? "IMMINENT" : "LIKELY",
    invoiceRupees,
    ctx: {
      window: "W3_POST_FAILURE",
      // IST hour: the curfew must be evaluated on the real clock, not a default.
      istHour: Number(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }),
      ),
      priorContacts: 1, // they are replying to our message
      contactCapPerWeek: DEFAULTS.contactCapPerWeek,
      consentWhatsapp: true, // they messaged us; the sandbox "join" is on file
      retriesUsed: 1,
      retryCap: DEFAULTS.retryCap,
      mandateAmountRupees: invoiceRupees,
      upiAutopayCeilingRupees: DEFAULTS.upiAutopayCeilingRupees,
      discountRupees: Math.round(invoiceRupees * 0.2),
      discountCeilingRupees: DEFAULTS.discountCeilingRupees,
      railDegraded: false,
    },
  });

  // decide() ranks by EV over the whole ladder; the customer's intent is a
  // constraint on it, not an override of it. If the gate vetoed what they asked
  // for, they get the next rung down and the audit says which rule fired.
  const rung: ActionKind =
    d.candidates.find((c) => c.action === proposed && c.gateVetoes.length === 0)?.action ??
    d.chosen;

  const reply = COPY[rung](Math.min(DEFAULTS.discountCeilingRupees, Math.round(invoiceRupees * 0.2)));

  append({
    idempotencyKey: `wa:${messageSid || from + text.slice(0, 20)}`,
    stage: "execute",
    caseId: from,
    window: "W3_POST_FAILURE",
    input: { from, text, intent, proposed },
    output: { rung, reply, vetoes: d.vetoes },
  });

  // TwiML. Twilio wants XML here, not JSON.
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}
