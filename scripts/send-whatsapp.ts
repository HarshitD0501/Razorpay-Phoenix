/**
 * Tier A: one real WhatsApp message carrying one real Razorpay test payment
 * link. The demo moment.
 *
 *   1. On the demo phone, send "join <two-word-code>" to +1 415 523 8886
 *      (Twilio Console -> Messaging -> Try it out -> Send a WhatsApp message).
 *      That join message IS the consent artifact.
 *   2. Set TWILIO_*, DEMO_CUSTOMER_WHATSAPP and PHOENIX_LIVE_EXECUTION=true in .env
 *   3. npx tsx --env-file=.env scripts/send-whatsapp.ts
 *
 * The rung and the rupee figure come from decide(), not from a prompt. The LLM
 * is not in this path at all.
 */
import { decide } from "../src/core/decide";
import { DEFAULTS } from "../src/eval/arms";
import { paymentLink } from "../src/live/razorpay";
import { sendWhatsapp } from "../src/live/twilio";

const to = process.env.DEMO_CUSTOMER_WHATSAPP;
if (!to) throw new Error("DEMO_CUSTOMER_WHATSAPP not set");

const invoiceRupees = 499;

// Deterministic core picks the rung. LIKELY = funds shortfall, so the ladder
// should reach for a reschedule long before it reaches for a discount.
const d = decide({
  bucket: "LIKELY",
  invoiceRupees,
  ctx: {
    window: "W3_POST_FAILURE",
    istHour: new Date().getUTCHours() + 5, // ~IST; the gate curfews on this
    priorContacts: 0,
    contactCapPerWeek: DEFAULTS.contactCapPerWeek,
    consentWhatsapp: true, // the "join" message above
    retriesUsed: 1,
    retryCap: DEFAULTS.retryCap,
    mandateAmountRupees: invoiceRupees,
    upiAutopayCeilingRupees: DEFAULTS.upiAutopayCeilingRupees,
    discountRupees: 0,
    discountCeilingRupees: DEFAULTS.discountCeilingRupees,
    railDegraded: false,
  },
});
console.log(`decide() chose: ${d.chosen}  (vetoes: ${d.vetoes.join(", ") || "none"})`);

const link = await paymentLink({
  amountRupees: invoiceRupees,
  referenceId: `phoenix_demo_${Date.now()}`,
  description: "Phoenix recovery — subscription renewal",
});
const url = link.body?.short_url;
if (!url) throw new Error(`payment link failed: ${JSON.stringify(link.body)}`);
console.log(`payment link: ${url}`);

const body =
  `Your ₹${invoiceRupees} renewal didn't go through — your bank reported insufficient funds, ` +
  `not a problem with your card.\n\n` +
  `No rush: pay when you're ready and nothing is interrupted.\n${url}\n\n` +
  `Reply PAUSE to hold the plan for a month, or LATER to move the date to your payday.`;

const res = await sendWhatsapp({ to, body });
console.log(`twilio ${res.status}`, res.body.sid ?? res.body);
