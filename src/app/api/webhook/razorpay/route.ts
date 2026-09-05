/**
 * Inbound webhook. Secondary to the poller by design — ingest must not depend on
 * a public URL existing. Both paths feed the identical dedup key, so a webhook
 * and a poll for the same event produce one side effect.
 */
import { NextResponse } from "next/server";
import { append } from "@/core/audit";
import { eventKey, verifySignature } from "@/live/verify";

export async function POST(req: Request) {
  // RAW body first. Any parse before this point invalidates the signature.
  const raw = await req.text();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "no webhook secret" }, { status: 500 });

  if (!verifySignature(raw, req.headers.get("x-razorpay-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as Parameters<typeof eventKey>[0];
  const first = append({
    idempotencyKey: eventKey(payload),
    stage: "ingest",
    caseId: eventKey(payload),
    input: { event: payload.event, bytes: raw.length },
    output: { accepted: true },
  });

  // 200 either way: a retried delivery is not an error, and returning non-200
  // makes Razorpay redeliver something already handled.
  return NextResponse.json({ ok: true, duplicate: !first });
}
