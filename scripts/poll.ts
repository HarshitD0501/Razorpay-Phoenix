/**
 * Ingest — poller-primary.
 *
 * The webhook route exists and works, but ingest does not DEPEND on a public URL
 * existing. Razorpay's own downtime docs tell you to poll "if you have not
 * received any webhook notifications due to technical issues", and their
 * payments-webhook page warns that a payment.failed may be FOLLOWED by a capture
 * for the same transaction and that "the webhook sequence is not fixed".
 *
 * A correct consumer therefore has to be idempotent and order-independent
 * anyway. Polling first makes that structural instead of aspirational: both
 * paths call append() with the same key, so whichever arrives second is a no-op.
 *
 *   npx tsx --env-file=.env scripts/poll.ts
 */
import { append } from "../src/core/audit";
import { classifyByTable } from "../src/core/classify";
import { decide } from "../src/core/decide";
import { DEFAULTS } from "../src/eval/arms";
import { rzp } from "../src/live/razorpay";

type Payment = {
  id: string;
  status: string;
  amount: number;
  method?: string;
  error_reason?: string | null;
  error_source?: string | null;
  error_step?: string | null;
  error_description?: string | null;
};

// Last 24h. `from`/`to` are unix seconds.
const from = Math.floor(Date.now() / 1000) - 86400;
const { status, body } = await rzp<{ items?: Payment[]; error?: { description?: string } }>(
  `/payments?from=${from}&count=100`,
);
if (status !== 200) {
  console.error(`poll failed ${status}: ${body?.error?.description ?? JSON.stringify(body)}`);
  process.exit(1);
}

const failed = (body.items ?? []).filter((p) => p.status === "failed");
console.log(`polled ${body.items?.length ?? 0} payments, ${failed.length} failed`);

let acted = 0;
let deduped = 0;
for (const p of failed) {
  const envelope = {
    paymentId: p.id,
    reason: p.error_reason ?? undefined,
    source: p.error_source ?? undefined,
    step: p.error_step ?? undefined,
    description: p.error_description ?? undefined,
    method: p.method,
  };
  const cls = classifyByTable(envelope);
  const d = decide({
    bucket: cls.bucket,
    invoiceRupees: p.amount / 100,
    ctx: {
      window: "W3_POST_FAILURE",
      istHour: Number(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }),
      ),
      priorContacts: 0,
      contactCapPerWeek: DEFAULTS.contactCapPerWeek,
      consentWhatsapp: false,
      retriesUsed: 0,
      retryCap: DEFAULTS.retryCap,
      mandateAmountRupees: p.amount / 100,
      upiAutopayCeilingRupees: DEFAULTS.upiAutopayCeilingRupees,
      discountRupees: 0,
      discountCeilingRupees: DEFAULTS.discountCeilingRupees,
      railDegraded: false,
    },
  });

  // Identical key to the webhook path: `payment.failed:<id>`. Whichever source
  // sees it second writes nothing.
  const first = append({
    idempotencyKey: `payment.failed:${p.id}`,
    stage: "ingest",
    caseId: p.id,
    window: "W3_POST_FAILURE",
    input: { via: "poller", envelope },
    output: { bucket: cls.bucket, chosen: d.chosen, vetoes: d.vetoes },
  });
  if (first) acted++;
  else deduped++;
  console.log(`  ${p.id}  ${cls.bucket.padEnd(10)} -> ${d.chosen}${first ? "" : "  (already seen)"}`);
}
console.log(`\n${acted} new, ${deduped} already handled by the webhook path.`);
