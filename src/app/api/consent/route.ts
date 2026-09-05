/**
 * The consent endpoint. Separate from /api/rescue on purpose.
 *
 * /api/rescue diagnoses and OFFERS. This route is the only path that can act,
 * and it refuses without an explicit token that the customer's click produced.
 * That is the "no forced auto-debit on an alternate rail" guarantee as code: it
 * is not that the system chooses not to charge, it is that the charge path does
 * not exist without this POST.
 */
import { NextResponse } from "next/server";
import { append, read } from "@/core/audit";

export async function POST(req: Request) {
  const { consentToken, method, paymentId } = (await req.json()) as {
    consentToken?: string;
    method?: string;
    paymentId?: string;
  };

  // The token must match a diagnosis this server actually issued — a client
  // cannot mint consent for a session that never failed.
  const issued = read().some(
    (r) => r.stage === "classify" && r.idempotencyKey === consentToken,
  );
  if (!consentToken || !issued) {
    return NextResponse.json({ error: "no valid consent token" }, { status: 403 });
  }

  // Idempotent: a double-clicked button produces one authorization, not two.
  // This is the Double-Debit guarantee — append() returns false on a repeat.
  const first = append({
    idempotencyKey: `consent:${consentToken}:${method}`,
    stage: "execute",
    caseId: paymentId ?? "unknown",
    window: "W0_IN_SESSION",
    input: { consentToken, method, consentedAt: new Date().toISOString() },
    output: { authorized: true, live: process.env.PHOENIX_LIVE_EXECUTION === "true" },
  });

  return NextResponse.json({
    ok: true,
    duplicate: !first,
    // With the master switch off nothing reaches a network. The demo is honest
    // about which of the two it just did.
    charged: false,
    next: process.env.PHOENIX_LIVE_EXECUTION === "true" ? "razorpay_checkout" : "simulated",
    message:
      `Consent recorded for ${method}. ` +
      (first ? "Opening checkout." : "Already authorized — not charging twice."),
  });
}
