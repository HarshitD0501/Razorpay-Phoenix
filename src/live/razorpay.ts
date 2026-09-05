/**
 * Tier A — the live Razorpay adapter. Plain fetch, no SDK: with test keys there
 * are four endpoints to call and the SDK re-stringifies bodies (see verify.ts
 * for why that matters).
 *
 * Every call captures its request/response pair to fixtures/ so a judge without
 * keys can still read the live evidence offline.
 */
import { appendFileSync, mkdirSync } from "node:fs";

const BASE = "https://api.razorpay.com/v1";

function auth(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
  if (!id.startsWith("rzp_test_")) {
    // Guard, not a nicety: a live key here would move real money.
    throw new Error(`refusing non-test key: ${id.slice(0, 9)}...`);
  }
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/** Appends the request/response pair to fixtures/razorpay.jsonl. */
function capture(entry: Record<string, unknown>) {
  mkdirSync("fixtures", { recursive: true });
  appendFileSync("fixtures/razorpay.jsonl", JSON.stringify(entry) + "\n");
}

export async function rzp<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const method = init.method ?? "GET";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: auth(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    body = text as T;
  }
  capture({
    ts: new Date().toISOString(),
    method,
    path,
    request: init.body ?? null,
    status: res.status,
    response: body,
  });
  return { status: res.status, body };
}

export type Downtime = {
  id: string;
  method: string;
  status: "scheduled" | "started" | "resolved";
  severity: "low" | "medium" | "high";
  instrument?: { bank?: string; psp?: string; vpa_handle?: string; issuer?: string };
  begin?: number;
  end?: number | null;
};

/** W0's live input: which rail is actually degraded right now. */
export async function downtimes(): Promise<Downtime[]> {
  const { body } = await rzp<{ items?: Downtime[] }>("/payments/downtimes");
  return body?.items ?? [];
}

/** Returns the checkout-ready short_url. reference_id is our dedup key. */
export async function paymentLink(args: {
  amountRupees: number;
  referenceId: string;
  description: string;
  contact?: string;
}) {
  return rzp<{ id?: string; short_url?: string; error?: { description?: string } }>(
    "/payment_links",
    {
      method: "POST",
      body: {
        amount: Math.round(args.amountRupees * 100), // paise
        currency: "INR",
        description: args.description,
        reference_id: args.referenceId,
        accept_partial: false,
        notify: { sms: false, email: false }, // Phoenix owns the notification
        reminder_enable: false,
      },
    },
  );
}
