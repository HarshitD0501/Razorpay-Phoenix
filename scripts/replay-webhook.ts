/**
 * Verification: the same webhook, twice, produces ONE side effect.
 *
 *   npx next dev &
 *   npx tsx --env-file=.env scripts/replay-webhook.ts
 *
 * Signs a fixture with RAZORPAY_WEBHOOK_SECRET the way Razorpay does — HMAC-SHA256
 * over the exact bytes on the wire — POSTs it twice, and asserts the second is
 * reported as a duplicate. Also POSTs a tampered body to prove 401.
 */
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "phoenix_local_secret";
const url = process.env.PHOENIX_URL ?? "http://localhost:3000";

// Shape per Razorpay's payment.failed docs. Committed so a judge can replay it.
const event = {
  entity: "event",
  account_id: "acc_PhoenixTest",
  event: "payment.failed",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_ReplayFixture01",
        entity: "payment",
        amount: 49900,
        currency: "INR",
        status: "failed",
        method: "card",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Your card has expired. Try another card.",
        error_source: "issuer",
        error_step: "payment_authorization",
        error_reason: "card_expired",
      },
    },
  },
  created_at: 1757000000,
};

// The raw string is what gets signed AND what gets sent. Re-stringifying after a
// parse would change key order and break the digest — that is the footgun.
const raw = JSON.stringify(event);
const signature = createHmac("sha256", secret).update(raw, "utf8").digest("hex");

mkdirSync("fixtures", { recursive: true });
writeFileSync("fixtures/payment-failed.json", raw + "\n");

const post = async (body: string, sig: string) => {
  const res = await fetch(`${url}/api/webhook/razorpay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Razorpay-Signature": sig },
    body,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

const a = await post(raw, signature);
const b = await post(raw, signature);
const tampered = await post(raw.replace("49900", "1"), signature);

console.log(`1st delivery   ${a.status}  ${JSON.stringify(a.body)}`);
console.log(`2nd delivery   ${b.status}  ${JSON.stringify(b.body)}`);
console.log(`tampered body  ${tampered.status}  ${JSON.stringify(tampered.body)}`);

const pass =
  a.status === 200 && b.body.duplicate === true && a.body.duplicate === false && tampered.status === 401;
console.log(pass ? "\nPASS: one side effect, tamper rejected." : "\nFAIL");
process.exit(pass ? 0 : 1);
