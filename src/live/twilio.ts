/**
 * Tier A — WhatsApp outbound via the Twilio sandbox. Plain fetch, form-encoded,
 * Basic auth. No SDK needed for one endpoint.
 *
 * Why Twilio and not Meta Cloud API: this build machine's TLS to
 * graph.facebook.com is intercepted and re-signed by a Sophos CA, so Node fetch
 * fails with SELF_SIGNED_CERT_IN_CHAIN (--use-system-ca does not help).
 * api.twilio.com returns a clean 401 over a DigiCert chain. That is an
 * environment limitation, not a Meta one.
 *
 * Consent: the sandbox opt-in is a literal "join <code>" message the customer
 * sends first. That is a real consent artifact, and gate() will not select
 * notify_whatsapp without it.
 */
export async function sendWhatsapp(args: { to: string; body: string }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) throw new Error("TWILIO_* env not set");
  if (process.env.PHOENIX_LIVE_EXECUTION !== "true") {
    return { status: 0, body: { skipped: "PHOENIX_LIVE_EXECUTION=false" } };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: args.to, Body: args.body }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
