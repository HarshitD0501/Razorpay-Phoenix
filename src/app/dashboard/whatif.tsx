"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Out = {
  verdict: string;
  deltaVsPhoenixDefaults: string;
  n: number;
  baseline: { doNothing: string; razorpayDefault: string; phoenixDefaults: string };
  tuned: {
    net: string;
    recovered: number;
    authAttempts: number;
    contacts: number;
    wastedNotifications: number;
    vetoesByRule: Record<string, number>;
  };
};

const KNOBS = [
  { key: "graceDays", label: "Grace / ladder days", min: 1, max: 21, dflt: 7 },
  { key: "contactCapPerWeek", label: "Contact cap per week", min: 1, max: 10, dflt: 3 },
  { key: "discountCeilingRupees", label: "Discount ceiling ₹", min: 0, max: 2000, dflt: 400 },
  { key: "retryCap", label: "Retry cap", min: 0, max: 8, dflt: 3 },
] as const;

const rs = (s: string) => "₹" + Number(s).toLocaleString("en-IN");

export default function WhatIf() {
  const [vals, setVals] = useState<Record<string, number>>(
    Object.fromEntries(KNOBS.map((k) => [k.key, k.dflt])),
  );
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const res = await fetch("/api/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vals),
    });
    setOut((await res.json()) as Out);
    setBusy(false);
  }

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        What-if — same engine, same batch
      </h2>
      <div className="mt-3 rounded-2xl border border-line bg-surface-1 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {KNOBS.map((k) => (
            <label key={k.key} className="block text-sm">
              <span className="flex justify-between text-ink-2">
                {k.label}
                <span className="font-medium tabular-nums text-ink-1">{vals[k.key]}</span>
              </span>
              <input
                type="range"
                min={k.min}
                max={k.max}
                value={vals[k.key]}
                onChange={(e) => setVals({ ...vals, [k.key]: Number(e.target.value) })}
                className="mt-2 w-full cursor-pointer accent-series-1"
                aria-label={k.label}
              />
            </label>
          ))}
        </div>
        <motion.button
          onClick={run}
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          className="mt-5 rounded-xl bg-ink-1 px-4 py-2 text-sm font-medium text-surface-0 transition-colors hover:bg-white disabled:opacity-40"
        >
          {busy ? "Re-running the batch…" : "Re-run the batch"}
        </motion.button>

        <AnimatePresence mode="wait">
          {out && (
            <motion.div
              key={out.verdict + out.tuned.net}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 border-t border-line pt-4 text-sm"
            >
              <p className="text-base font-medium">{out.verdict}</p>
              <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                <Row k="do nothing" v={rs(out.baseline.doNothing)} />
                <Row k="Razorpay default" v={rs(out.baseline.razorpayDefault)} />
                <Row k="Phoenix defaults" v={rs(out.baseline.phoenixDefaults)} />
                <Row k="your settings" v={rs(out.tuned.net)} />
                <Row k="recovered" v={String(out.tuned.recovered)} />
                <Row k="auth attempts" v={String(out.tuned.authAttempts)} />
                <Row k="customer contacts" v={String(out.tuned.contacts)} />
                <Row
                  k="wasted notifications"
                  v={`${out.tuned.wastedNotifications} (would have paid anyway)`}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                Vetoes fired:{" "}
                {Object.entries(out.tuned.vetoesByRule)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k} ×${v}`)
                  .join(" · ") || "none"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-3">
                n={out.n}, seed 42. Loosening a cap can lower net — the ladder spends attention and
                attention has a price.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-line/60 py-1.5">
      <span className="text-ink-2">{k}</span>
      <span className="tabular-nums text-ink-1">{v}</span>
    </div>
  );
}
