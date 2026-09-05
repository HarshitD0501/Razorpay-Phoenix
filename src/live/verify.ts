/**
 * Webhook signature verification.
 *
 * HMAC-SHA256 over the UNMODIFIED request body against X-Razorpay-Signature.
 * The footgun this file exists to avoid: Razorpay's own Node sample verifies a
 * re-stringified body, which changes key order and whitespace and therefore
 * changes the digest. In App Router that means `await request.text()` BEFORE any
 * parse — the raw string is the only thing that can be verified.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // Length check first: timingSafeEqual throws on a mismatch instead of
  // returning false, which would leak length via an exception.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Dedup key for an inbound event. Razorpay's docs warn that a payment.failed
 * may be FOLLOWED by a capture for the same transaction and that "the webhook
 * sequence is not fixed", so the consumer must be idempotent and
 * order-independent. Keying on (event, entity id) gives both.
 */
export function eventKey(payload: {
  event?: string;
  payload?: { payment?: { entity?: { id?: string } }; subscription?: { entity?: { id?: string } } };
}): string {
  const id =
    payload.payload?.payment?.entity?.id ??
    payload.payload?.subscription?.entity?.id ??
    "unknown";
  return `${payload.event ?? "unknown"}:${id}`;
}
