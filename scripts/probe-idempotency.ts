/**
 * Tier A probe: does Razorpay dedupe on its own?
 *
 * Razorpay's documented Idempotency-Key header is scoped to Payouts/Transfers,
 * not Orders — so the answer determines whether app-level dedup is doing the
 * real work. This probe finds out instead of assuming.
 *
 *   npx tsx --env-file=.env scripts/probe-idempotency.ts
 *
 * Two calls each, identical bodies:
 *   orders.create        with the same `receipt`
 *   payment_links.create with the same `reference_id`
 * Both request/response pairs land in fixtures/razorpay.jsonl either way.
 */
import { rzp } from "../src/live/razorpay";

const stamp = Date.now();

const orderBody = {
  amount: 49900,
  currency: "INR",
  receipt: `phoenix_probe_${stamp}`,
};

console.log("orders.create x2, identical receipt =", orderBody.receipt);
const o1 = await rzp<{ id?: string; error?: { description?: string } }>("/orders", {
  method: "POST",
  body: orderBody,
});
const o2 = await rzp<{ id?: string; error?: { description?: string } }>("/orders", {
  method: "POST",
  body: orderBody,
});
const ordersDedupe = !!o1.body?.id && o1.body.id === o2.body?.id;
console.log(`  1st ${o1.status} ${o1.body?.id ?? o1.body?.error?.description}`);
console.log(`  2nd ${o2.status} ${o2.body?.id ?? o2.body?.error?.description}`);
console.log(`  -> orders dedupe on receipt: ${ordersDedupe ? "YES" : "NO"}`);

const linkBody = {
  amount: 49900,
  currency: "INR",
  description: "Phoenix idempotency probe",
  reference_id: `phoenix_probe_${stamp}`,
  accept_partial: false,
  notify: { sms: false, email: false },
  reminder_enable: false,
};

console.log("\npayment_links.create x2, identical reference_id =", linkBody.reference_id);
const l1 = await rzp<{ id?: string; error?: { description?: string } }>("/payment_links", {
  method: "POST",
  body: linkBody,
});
const l2 = await rzp<{ id?: string; error?: { description?: string } }>("/payment_links", {
  method: "POST",
  body: linkBody,
});
const linksDedupe = l1.body?.id !== l2.body?.id ? l2.status >= 400 : true;
console.log(`  1st ${l1.status} ${l1.body?.id ?? l1.body?.error?.description}`);
console.log(`  2nd ${l2.status} ${l2.body?.id ?? l2.body?.error?.description}`);
console.log(`  -> payment_links reject duplicate reference_id: ${linksDedupe ? "YES" : "NO"}`);

console.log(
  `\nFINDING: orders receipt dedupe=${ordersDedupe ? "yes" : "no"}, ` +
    `payment_links reference_id dedupe=${linksDedupe ? "yes" : "no"}.`,
);
console.log("Captured to fixtures/razorpay.jsonl");
