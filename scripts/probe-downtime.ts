/**
 * Tier A probe: the live bank-health feed that W0's rescue card names.
 *
 *   npx tsx --env-file=.env scripts/probe-downtime.ts
 *
 * Test mode usually returns an empty list — no outage is in progress. That empty
 * response is still the real API answering, and it is captured as such; the
 * rescue card falls back to naming the failing rail from the error envelope.
 */
import { downtimes } from "../src/live/razorpay";

const items = await downtimes();
console.log(`GET /payments/downtimes -> ${items.length} active`);
for (const d of items) {
  const who = d.instrument?.bank ?? d.instrument?.psp ?? d.instrument?.vpa_handle ?? "?";
  console.log(`  ${d.method.padEnd(12)} ${who.padEnd(8)} ${d.severity.padEnd(6)} ${d.status}`);
}
if (!items.length) {
  console.log("  (empty = no outage in progress; captured as real evidence, tier A)");
}
console.log("Captured to fixtures/razorpay.jsonl");
