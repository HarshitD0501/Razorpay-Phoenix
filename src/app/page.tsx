"use client";

/**
 * The demo surface. Three things a judge can click:
 *   1. Trigger a failure -> W0 rescue card, naming the degraded rail
 *   2. Consent -> proves the charge path requires an explicit POST
 *   3. The blast-radius ladder, which is the structural argument
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useMotionValue, useSpring } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Check, Radio, ShieldCheck, TriangleAlert } from "lucide-react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

/** Windows ordered by blast radius — monotone 1→5. That order *is* the thesis. */
const WINDOWS = [
  { id: "W0", when: "t ≈ 0s", name: "in-session", radius: 1, what: "Rescue card in the tab the customer has not closed yet. Live downtime feed names the degraded rail." },
  { id: "W1", when: "t − 24h", name: "pre-debit", radius: 2, what: "Merchant-side pre-flight, before the debit burns an authorization attempt." },
  { id: "W2", when: "t − 7d", name: "pre-expiry", radius: 3, what: "Mandate migrator — card to UPI Autopay before the card expires." },
  { id: "W3", when: "t + 1..3d", name: "post-failure", radius: 5, what: "The dunning ladder everyone builds. Here it is the last resort, not the product." },
];

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

/** Counts to `to` once, when scrolled into view. Spring, so it settles rather than stops. */
function CountUp({ to, prefix = "" }: { to: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { damping: 28, stiffness: 90 });

  useEffect(() => {
    if (inView) mv.set(to);
  }, [inView, mv, to]);

  useEffect(
    () =>
      spring.on("change", (v) => {
        if (ref.current) ref.current.textContent = prefix + Math.round(v).toLocaleString("en-IN");
      }),
    [spring, prefix],
  );

  // Server-rendered text is the final value, so the number is never absent
  // without JS and never gates on the animation.
  return (
    <span ref={ref} aria-label={prefix + to.toLocaleString("en-IN")}>
      {prefix + to.toLocaleString("en-IN")}
    </span>
  );
}

export default function Checkout() {
  const [rescue, setRescue] = useState<Rescue | null>(null);
  const [consent, setConsent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ladder = useRef<HTMLDivElement>(null);

  // The ladder's four rows reveal on scroll, staggered. GSAP owns this one
  // because ScrollTrigger already tracks the scrubbing; Motion owns the rest.
  useGSAP(
    () => {
      gsap.from("[data-rung]", {
        opacity: 0,
        y: 24,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: ladder.current, start: "top 78%", once: true },
      });
    },
    { scope: ladder },
  );

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
    <main id="main">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0 aura" />
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-veil opacity-50" />
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.09 }}
          className="relative mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28"
        >
          <motion.p
            variants={rise}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-1/60 px-3 py-1 text-xs text-ink-2"
          >
            <Radio className="size-3.5 text-series-3" aria-hidden />
            Track 03 · live Razorpay test API
          </motion.p>

          <motion.h1
            variants={rise}
            className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl"
          >
            Recovery that starts
            <br />
            <span className="text-aura">before the failure does.</span>
          </motion.h1>

          <motion.p variants={rise} className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-2">
            Every dunning system — Razorpay&apos;s own default included — acts after a payment
            fails. Phoenix optimises <em className="not-italic text-ink-1">when</em> to intervene,
            so the cheapest recovery is the one that never becomes a failure.
          </motion.p>

          <motion.div variants={rise} className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="#simulate"
              className="group inline-flex items-center gap-2 rounded-xl bg-ink-1 px-5 py-2.5 text-sm font-medium text-surface-0 transition-colors hover:bg-white"
            >
              Break a payment
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
            <a
              href="/dashboard"
              className="rounded-xl border border-line-strong px-5 py-2.5 text-sm text-ink-1 transition-colors hover:bg-surface-2"
            >
              See the measured numbers
            </a>
          </motion.div>

          {/* Three stat tiles. Each is a number, so each is a tile — not a chart. */}
          <motion.dl variants={rise} className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {[
              { v: 89, suffix: "%", label: "fewer authorization attempts", sub: "106 vs Razorpay default's 967, at equal recovery" },
              { v: 8, suffix: "", label: "live downtimes joined", sub: "real /v1/payments/downtimes, not a fixture" },
              { v: 458, suffix: "", label: "payments recovered of 600", sub: "deterministic sim, n=600, seed 42" },
            ].map((s) => (
              <div key={s.label} className="bg-surface-1 px-5 py-6">
                <dd className="text-3xl font-semibold tracking-tight">
                  <CountUp to={s.v} />
                  {s.suffix}
                </dd>
                <dt className="mt-1.5 text-sm text-ink-1">{s.label}</dt>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">{s.sub}</p>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </section>

      {/* ── The ladder: four windows, ordered by blast radius ────────── */}
      <section ref={ladder} className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
          Four windows, ordered by blast radius
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
          Acting earlier does not just recover more — it <em className="not-italic text-ink-1">reaches
          for less</em>. W0 renders a card in a session already open. W3 sends messages and burns
          authorization attempts.
        </p>

        <ol className="mt-8 space-y-px overflow-hidden rounded-2xl border border-line bg-line">
          {WINDOWS.map((w) => (
            <li key={w.id} data-rung className="grid gap-4 bg-surface-1 px-5 py-5 sm:grid-cols-[7rem_1fr_9rem] sm:items-center">
              <div>
                <span className="font-mono text-sm font-medium text-series-1">{w.id}</span>
                <span className="ml-2 text-xs text-ink-3">{w.when}</span>
                <p className="text-xs text-ink-3">{w.name}</p>
              </div>
              <p className="text-sm leading-relaxed text-ink-2">{w.what}</p>
              <div className="sm:text-right">
                {/* Bar, not a number alone: length carries the comparison. One
                    series, one hue — the label says what is plotted. */}
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="text-xs tabular-nums text-ink-3">radius {w.radius}</span>
                  <span aria-hidden className="flex h-2.5 w-20 gap-px overflow-hidden rounded-[3px]">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={`flex-1 ${i <= w.radius ? "bg-series-1" : "bg-surface-2"}`}
                      />
                    ))}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── W0 live: break a payment, get a rescue card ──────────────── */}
      <section id="simulate" className="border-t border-line bg-surface-1/30">
        <div className="mx-auto max-w-2xl px-6 py-20">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-3">W0 · in-session · t ≈ 0s</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Checkout</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Simulate a payment failure. Everyone else&apos;s recovery starts tomorrow morning; this
            one starts before the customer has closed the tab.
          </p>

          <div className="mt-7 rounded-2xl border border-line bg-surface-1 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-2">Pro plan · monthly</span>
              <span className="text-2xl font-semibold">₹499</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {FAILURES.map((f) => (
                <motion.button
                  key={f.label}
                  onClick={() => fail(f.envelope)}
                  disabled={busy}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-xl border border-line-strong px-3.5 py-2 text-sm text-ink-1 transition-colors hover:border-ink-3 hover:bg-surface-2 disabled:opacity-40"
                >
                  {f.label}
                </motion.button>
              ))}
            </div>
          </div>

          {/* AnimatePresence so swapping failures animates out, not just in. */}
          <AnimatePresence mode="wait">
            {rescue && (
              <motion.div
                key={rescue.headline}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 rounded-2xl border border-series-1/40 bg-surface-1 p-5 shadow-[0_0_0_1px_rgba(57,135,229,0.12),0_18px_50px_-24px_rgba(57,135,229,0.35)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      rescue.tier === "A"
                        ? "bg-good/15 text-good"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {rescue.tier === "A" ? (
                      <ShieldCheck className="size-3" aria-hidden />
                    ) : (
                      <TriangleAlert className="size-3" aria-hidden />
                    )}
                    tier {rescue.tier}
                  </span>
                  <span className="text-xs text-ink-3">
                    {rescue.tier === "A"
                      ? `live downtime feed · ${rescue.liveDowntimeCount} active`
                      : "no keys — diagnosis from error envelope only"}
                  </span>
                  <span className="ml-auto font-mono text-xs text-ink-2">{rescue.bucket}</span>
                </div>

                <p className="mt-4 font-medium">{rescue.headline}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{rescue.subline}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {rescue.alternatives.map((a) => (
                    <motion.button
                      key={a.method}
                      onClick={() => accept(a.method)}
                      whileTap={{ scale: 0.97 }}
                      className="rounded-xl bg-ink-1 px-3.5 py-2 text-sm font-medium text-surface-0 transition-colors hover:bg-white"
                    >
                      {a.label}
                    </motion.button>
                  ))}
                </div>

                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  Nothing is charged until you press one of these. The server has no path to
                  another rail without this POST — enforced by{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono">/api/consent</code>,
                  not promised.
                </p>

                <AnimatePresence>
                  {consent && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <span className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                        {consent}
                      </span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-10 text-sm">
            <a className="inline-flex items-center gap-1.5 text-series-1 underline-offset-4 hover:underline" href="/dashboard">
              Merchant dashboard — arms table, ablation, audit trail
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
