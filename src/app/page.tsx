"use client";

/**
 * The demo surface. Three things a judge can click:
 *   1. Trigger a failure -> W0 rescue card, naming the degraded rail
 *   2. Consent -> proves the charge path requires an explicit POST
 *   3. The arms table, read from the committed results file
 */
import { useState } from "react";

type Rescue = {
  tier: "A" | "B";
  show: boolean;
  headline: string;
  subline: string;
  alternatives: { label: string; method: string }[];
  consentToken: string;
  bucket: string;
  liveDowntimeCount: number;
  rationale: string;
};

const FAILURES = [
  { label: "SBI UPI timeout", envelope: { paymentId: "pay_demo_upi", reason: "payment_timed_out", source: "bank", step: "payment_authorization", method: "upi", bank: "SBIN" } },
  { label: "HDFC card expired", envelope: { paymentId: "pay_demo_card", reason: "card_expired", source: "issuer", step: "payment_authorization", method: "card", bank: "HDFC" } },
  { label: "Insufficient funds", envelope: { paymentId: "pay_demo_funds", reason: "payment_failed_insufficient_funds", source: "issuer", step: "payment_authorization", method: "card", bank: "ICIC" } },
  { label: "Null reason (source only)", envelope: { paymentId: "pay_demo_null", source: "bank", step: "payment_authorization", method: "netbanking", bank: "UTIB" } },
];

export default function Checkout() {
  const [rescue, setRescue] = useState<Rescue | null>(null);
  const [consent, setConsent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function fail(envelope: Record<string, unknown>) {
    setBusy(true);
    setConsent(null);
    const res = await fetch("/api/rescue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...envelope, amountRupees: 499 }),
    });
    setRescue((await res.json()) as Rescue);
    setBusy(false);
  }

  async function accept(method: string) {
    if (!rescue) return;
    const res = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentToken: rescue.consentToken, method, paymentId: "pay_demo" }),
    });
    const j = (await res.json()) as { message?: string; duplicate?: boolean; error?: string };
    setConsent(j.error ?? `${j.message}${j.duplicate ? " (idempotent — second click ignored)" : ""}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-14">
      <p className="text-xs uppercase tracking-widest text-neutral-500">W0 · in-session · t ≈ 0s</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-3 text-sm text-neutral-600">
        Simulate a payment failure. Everyone else&apos;s recovery starts tomorrow morning; this one
        starts before the customer has closed the tab.
      </p>

      <div className="mt-6 rounded-xl border border-neutral-300 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-600">Pro plan · monthly</span>
          <span className="text-2xl font-semibold">₹499</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {FAILURES.map((f) => (
            <button
              key={f.label}
              onClick={() => fail(f.envelope)}
              disabled={busy}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm transition hover:border-neutral-900 disabled:opacity-40"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rescue && (
        <div className="slide-in mt-5 rounded-xl border-2 border-neutral-900 bg-white p-5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white">
              tier {rescue.tier}
            </span>
            <span className="text-xs text-neutral-500">
              {rescue.tier === "A"
                ? `live downtime feed · ${rescue.liveDowntimeCount} active`
                : "no keys — diagnosis from error envelope only"}
            </span>
            <span className="ml-auto text-xs font-medium">{rescue.bucket}</span>
          </div>
          <p className="mt-3 font-medium">{rescue.headline}</p>
          <p className="mt-1 text-sm text-neutral-600">{rescue.subline}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {rescue.alternatives.map((a) => (
              <button
                key={a.method}
                onClick={() => accept(a.method)}
                className="rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white transition hover:bg-neutral-700"
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Nothing is charged until you press one of these. The server has no path to another rail
            without this POST — that is enforced by <code>/api/consent</code>, not promised.
          </p>
          {consent && (
            <p className="mt-3 rounded-lg bg-neutral-100 p-3 text-sm">{consent}</p>
          )}
        </div>
      )}

      <p className="mt-10 text-sm">
        <a className="underline" href="/dashboard">
          Merchant dashboard, arms table and audit trail →
        </a>
      </p>
    </main>
  );
}
