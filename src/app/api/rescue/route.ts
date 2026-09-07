/**
 * W0 — the rescue diagnosis. The customer is still in the session.
 *
 * Returns a card naming the actual degraded instrument, joined against the LIVE
 * downtime feed when keys are present. It NEVER charges: the consent to switch
 * rails comes back as a separate POST to /api/consent. That separation is the
 * RBI/consent claim, expressed as two endpoints rather than a promise.
 *
 * ponytail: plain POST, not SSE. Every message in this flow is client-initiated,
 * so there is no server push to carry. Add SSE if the server ever needs to
 * volunteer "SBI is back up" mid-session.
 */
import { NextResponse } from "next/server";
import { append } from "@/core/audit";
import { classifyByLlm } from "@/core/classify";
import { decide } from "@/core/decide";
import { readJson } from "@/core/req";
import { DEFAULTS } from "@/eval/arms";
import { downtimes, type Downtime } from "@/live/razorpay";
import type { FailureEnvelope } from "@/core/types";

const ALT: Record<string, { label: string; method: string }[]> = {
  card: [
    { label: "UPI — Google Pay / PhonePe", method: "upi" },
    { label: "Net banking", method: "netbanking" },
  ],
  upi: [
    { label: "Card", method: "card" },
    { label: "Net banking", method: "netbanking" },
  ],
  netbanking: [
    { label: "UPI — Google Pay / PhonePe", method: "upi" },
    { label: "Card", method: "card" },
  ],
};

export async function POST(req: Request) {
  const env = await readJson<FailureEnvelope & { amountRupees?: number }>(req);
  if (env instanceof Response) return env;
  if (!env.paymentId) {
    // paymentId is the idempotency key and the consent token; without it the
    // ledger cannot dedupe and /api/consent has nothing to verify against.
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  // Live join. No keys -> tier drops to B and the response says so, rather than
  // implying a feed we did not read.
  let live: Downtime[] = [];
  let tier: "A" | "B" = "B";
  try {
    live = await downtimes();
    tier = "A";
  } catch {
    /* no keys; envelope-only diagnosis */
  }

  const degradedHere = live.find(
    (d) =>
      d.status !== "resolved" &&
      (d.method === env.method ||
        (env.bank && (d.instrument?.bank === env.bank || d.instrument?.issuer === env.bank))),
  );

  const cls = await classifyByLlm(env);
  const d = decide({
    bucket: cls.bucket,
    invoiceRupees: env.amountRupees ?? 499,
    ctx: {
      window: "W0_IN_SESSION",
      istHour: 11,
      priorContacts: 0,
      contactCapPerWeek: DEFAULTS.contactCapPerWeek,
      consentWhatsapp: false,
      retriesUsed: 1,
      retryCap: DEFAULTS.retryCap,
      mandateAmountRupees: env.amountRupees ?? 499,
      upiAutopayCeilingRupees: DEFAULTS.upiAutopayCeilingRupees,
      discountRupees: 0,
      discountCeilingRupees: DEFAULTS.discountCeilingRupees,
      railDegraded: !!degradedHere,
    },
  });

  const who =
    degradedHere?.instrument?.bank ??
    degradedHere?.instrument?.psp ??
    env.bank ??
    (env.method ?? "this method");

  append({
    idempotencyKey: `rescue:${env.paymentId}`,
    stage: "classify",
    caseId: env.paymentId,
    window: "W0_IN_SESSION",
    input: { envelope: env, liveDowntimes: live.length, tier },
    output: { bucket: cls.bucket, chosen: d.chosen, vetoes: d.vetoes },
  });

  // Copy must not overstate what we know. A timeout from source=bank is not a
  // decline, and calling it one would be the same sloppiness the rest of this
  // repo is arguing against.
  const bankSide = env.source === "bank" || env.source === "gateway";
  const headline = degradedHere
    ? `${who} ${env.method ?? "payments"} is degraded right now (${degradedHere.severity} severity, reported by Razorpay).`
    : bankSide
      ? `${who} didn't respond in time — ${cls.reason.replace(/_/g, " ")}. That's their side, not your card.`
      : `${who} declined this attempt — ${cls.reason.replace(/_/g, " ")}.`;

  return NextResponse.json({
    tier,
    show: d.chosen === "rescue_offer",
    bucket: cls.bucket,
    // Names the instrument rather than saying "payment failed".
    headline,
    subline: degradedHere
      ? "Not your card. Another rail will go through immediately."
      : "Your money has not moved. Nothing was charged.",
    alternatives: ALT[env.method ?? "card"] ?? ALT.card,
    // The client must echo this back to /api/consent. No consent, no charge.
    consentToken: `rescue:${env.paymentId}`,
    liveDowntimeCount: live.length,
    rationale: cls.rationale,
    source: cls.source,
    model: cls.source === "llm" ? "Gemini 3.5 Flash" : "Fallback Rule Table",
  });
}
