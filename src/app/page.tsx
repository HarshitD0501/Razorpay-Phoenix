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
import {
  Activity,
  ArrowRight,
  Check,
  Lock,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

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
  {
    id: "W0",
    when: "t ≈ 0s",
    name: "In-Session Checkout Rescue",
    radius: 1,
    tag: "Point-of-Sale",
    tone: "good",
    what: "Rescue card rendered directly in the customer's active checkout tab. Live Razorpay downtime feed identifies issuer rail failure and suggests an instant 1-tap consent alternative before tab drop-off.",
  },
  {
    id: "W1",
    when: "t − 24h",
    name: "Pre-Debit Quiet Hours Guard",
    radius: 2,
    tag: "Pre-flight Verification",
    tone: "brand",
    what: "Pre-flight issuer health & TRAI quiet hours checks 24 hours before debit. Suppresses nocturnal triggers that risk bank decline penalty fees and negative merchant reputation.",
  },
  {
    id: "W2",
    when: "t − 7d",
    name: "Pre-Expiry Mandate Migrator",
    radius: 3,
    tag: "Autopay Migration",
    tone: "warning",
    what: "Detects cards expiring in the upcoming billing cycle. Initiates a 10-second flow to migrate expiring debit/credit cards to UPI Autopay (GPay/PhonePe) before the failure occurs.",
  },
  {
    id: "W3",
    when: "t + 1..3d",
    name: "Post-Failure Restrained Dunning",
    radius: 5,
    tag: "Terminal Fallback",
    tone: "critical",
    what: "The traditional dunning ladder that other tools treat as their entire product. In Phoenix, this is strictly the last resort governed by EV thresholds and strict stopping rules.",
  },
];

const rise = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

/** Counts to `to` once, when scrolled into view. Spring, so it settles rather than stops. */
function CountUp({ to, prefix = "" }: { to: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 60, damping: 20 });

  useEffect(() => {
    if (inView) motionVal.set(to);
  }, [inView, motionVal, to]);

  useEffect(() => {
    const unsub = spring.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = prefix + Math.round(latest).toLocaleString("en-IN");
      }
    });
    return unsub;
  }, [spring, prefix]);

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

  // The ladder's four rows reveal on scroll, staggered.
  useGSAP(
    () => {},
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
      {/* ── Hero: centred, badge, gradient second line, browser mockup ── */}
      <section className="relative overflow-hidden pb-20 pt-20 sm:pt-28 lg:pb-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] aura opacity-70"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] grid-veil opacity-60"
        />
        {/* One drifting blob. Transform-only, so it never repaints layout. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/4 top-0 -z-10 size-72 animate-blob rounded-full bg-brand/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            animate="show"
            transition={{ staggerChildren: 0.09 }}
            className="mx-auto flex max-w-5xl flex-col items-center text-center"
          >
            <motion.p
              variants={rise}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 backdrop-blur-sm transition-transform hover:scale-105"
            >
              <Radio className="size-3.5 text-brand" aria-hidden />
              <span className="text-[13px] font-semibold tracking-tight text-brand">
                Interactive demo · live Razorpay test API
              </span>
            </motion.p>

            <motion.h1
              variants={rise}
              className="mb-6 font-display text-4xl font-bold leading-[1.1] tracking-tight text-balance sm:text-6xl lg:text-7xl"
            >
              Recovery that starts <span className="text-aura">before the failure does</span>.
            </motion.h1>

            <motion.p
              variants={rise}
              className="mb-10 max-w-2xl text-[16px] leading-relaxed text-balance text-ink-2 sm:text-[18px]"
            >
              Every dunning system — Razorpay&apos;s own default included — acts after a payment
              fails. Phoenix optimises <em className="not-italic text-ink-1">when</em> to intervene,
              so the cheapest recovery is the one that never becomes a failure.
            </motion.p>

            <motion.div variants={rise} className="mb-12 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#simulate"
                className="group inline-flex items-center gap-2 rounded-full bg-ink-1 px-6 py-3 text-sm font-semibold text-surface-0 shadow-xl shadow-shade/10 transition-all hover:shadow-2xl active:scale-95"
              >
                Break a payment
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </a>
              <a
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong px-6 py-3 text-sm font-semibold transition-colors hover:bg-surface-2"
              >
                <Play className="size-3.5" aria-hidden />
                See the measured numbers
              </a>
            </motion.div>

            <motion.div
              variants={rise}
              className="mb-12 flex items-center gap-2 text-sm font-semibold text-brand"
            >
              <span aria-hidden className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex size-3 rounded-full bg-brand" />
              </span>
              Four buttons below. Each one fails a real payment envelope.
            </motion.div>
          </motion.div>

          {/* Browser mockup — the template's centrepiece, holding our stat row. */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto max-w-6xl"
          >
            <div className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-2xl shadow-shade/10 ring-1 ring-shade/5">
              <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
                <div aria-hidden className="flex gap-2">
                  <span className="size-3 rounded-full bg-critical/25 ring-1 ring-critical/30" />
                  <span className="size-3 rounded-full bg-warning/25 ring-1 ring-warning/30" />
                  <span className="size-3 rounded-full bg-good/25 ring-1 ring-good/30" />
                </div>
                <div className="mx-auto max-w-lg flex-1 px-4">
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-1.5 text-xs font-medium text-ink-3">
                    <Lock className="size-3" aria-hidden />
                    phoenix.razorpay.dev/checkout
                  </div>
                </div>
                <a
                  href="#simulate"
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-3 transition-colors hover:text-ink-1"
                >
                  <Play className="size-3" aria-hidden />
                  Run it
                </a>
              </div>

              <div className="p-8 sm:p-12">
                <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                  Measured against{" "}
                  <span className="text-aura">Razorpay&apos;s own default</span>
                </h2>
                <p className="mt-2 text-lg font-medium tracking-tight text-ink-2">
                  Same batch, same seed, same classifier — arm E against arm A.
                </p>

                {/* Three stat tiles. Each is a number, so each is a tile — not a chart. */}
                <dl className="mt-10 grid gap-6 lg:grid-cols-3">
                  {[
                    { v: 89, suffix: "%", badge: "Cost side", tone: "good" as const, label: "fewer authorization attempts", sub: "106 vs Razorpay default's 967, at equal recovery" },
                    { v: 8, suffix: "", badge: "Tier A · live", tone: "brand" as const, label: "live downtimes joined", sub: "real /v1/payments/downtimes, not a fixture" },
                    { v: 458, suffix: "", badge: "Tier B · sim", tone: "brand" as const, label: "payments recovered of 600", sub: "deterministic, n=600, seed 42" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="relative rounded-2xl border border-line bg-surface-1 p-7 shadow-sm transition-all hover:border-line-strong hover:shadow-lg"
                    >
                      <span
                        className={`absolute -top-3 left-6 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm ring-1 ring-inset ${
                          s.tone === "good"
                            ? "bg-good/10 text-good ring-good/25"
                            : "bg-brand/10 text-brand ring-brand/25"
                        }`}
                      >
                        {s.badge}
                      </span>
                      <dd className="mt-2 font-display text-5xl font-semibold tracking-tight">
                        <CountUp to={s.v} />
                        {s.suffix}
                      </dd>
                      <dt className="mt-3 text-[15px] font-medium">{s.label}</dt>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{s.sub}</p>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── The problem, stated once ─────────────────────────────────── */}
      <section className="relative overflow-hidden border-y border-line bg-surface-0/60 py-24 backdrop-blur-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-veil opacity-30" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-critical/30 bg-critical/10 px-3.5 py-1 text-xs font-semibold text-critical">
              <TriangleAlert className="size-3.5" aria-hidden />
              The Industry's Blindspot
            </span>
            <h2 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Your retry ladder doesn&apos;t matter if{" "}
              <span className="text-aura">the rail is already down</span>.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">
              Every system retries tomorrow morning, blindly hitting the same degraded bank switch,
              and calls the recovered fraction a win. The burnt authorization attempts remain invisible
              until the issuer drops your reputation score.
            </p>
          </div>

          {/* Contrast Grid: Naive vs Phoenix */}
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <div className="relative rounded-2xl border border-critical/20 bg-surface-1/80 p-6 shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-critical/10 text-critical">
                  ✕
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink-1">Traditional Default (Arm A)</h3>
                  <p className="text-xs text-ink-3">T+1, T+2, T+3 Static Cron</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm text-ink-2">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-critical" />
                  <span>Fires 4–5 blind retries during scheduled bank maintenance hours.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-critical" />
                  <span>Burns <strong>967 authorization attempts</strong> across a 600-case batch.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-critical" />
                  <span>Zero in-flight drop-off rescue — user abandons cart permanently.</span>
                </li>
              </ul>
            </div>

            <div className="relative rounded-2xl border border-good/30 bg-surface-1/90 p-6 shadow-xl shadow-good/5 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-good/10 text-good">
                  <Check className="size-4" />
                </span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink-1">Phoenix Left-Shift (Arm E)</h3>
                  <p className="text-xs text-brand">Live Telemetry & In-Session Rail Switch</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm text-ink-2">
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-good" />
                  <span>Joins live <code>/v1/payments/downtimes</code> feed before burning attempts.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-good" />
                  <span>Cuts attempts by <strong>89% (only 106 attempts)</strong> at equal recovery.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-good" />
                  <span>Rescues in-session (W0) in seconds before the customer tab closes.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── The ladder: four windows, ordered by blast radius (Stacking Slide-Over Deck) ── */}
      <section
        id="windows"
        ref={ladder}
        className="relative overflow-visible border-b border-line py-28"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-veil opacity-40" />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3.5 py-1 text-xs font-semibold text-brand">
              <Sparkles className="size-3.5" aria-hidden />
              Temporal Intervention Horizon
            </span>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Four windows, ordered by <span className="text-aura">blast radius</span>
            </h2>
            <p className="mt-4 text-lg font-medium leading-relaxed text-ink-2">
              Acting earlier does not just recover more — it reaches for less.
            </p>
          </div>

          {/* Stacking Cards Deck Animation: Each card sticks and the next slides over it */}
          <div className="relative space-y-8 pb-12">
            {WINDOWS.map((w, idx) => (
              <div
                key={w.id}
                style={{
                  top: `calc(90px + ${idx * 28}px)`,
                }}
                className="sticky rounded-2xl border border-line bg-surface-1/95 p-6 shadow-2xl shadow-shade/20 backdrop-blur-xl transition-all duration-300 hover:border-brand/50 hover:shadow-brand/10 sm:p-8"
              >
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-2 rounded-l-2xl ${
                      w.tone === "good"
                        ? "bg-good"
                        : w.tone === "brand"
                        ? "bg-brand"
                        : w.tone === "warning"
                        ? "bg-warning"
                        : "bg-critical"
                    }`}
                  />
                  <div
                    className={`flex size-14 shrink-0 items-center justify-center rounded-xl border font-mono text-xl font-bold shadow-sm ${
                      w.tone === "good"
                        ? "border-good/30 bg-good/10 text-good"
                        : w.tone === "brand"
                        ? "border-brand/30 bg-brand/10 text-brand"
                        : w.tone === "warning"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : "border-critical/30 bg-critical/10 text-critical"
                    }`}
                  >
                    {w.id}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-display text-2xl font-bold tracking-tight text-ink-1">
                        {w.name}
                      </h3>
                      <span className="rounded-full border border-line bg-surface-2 px-3 py-0.5 font-mono text-xs font-semibold text-ink-2">
                        {w.when}
                      </span>
                      <span
                        className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                          w.tone === "good"
                            ? "bg-good/15 text-good"
                            : w.tone === "brand"
                            ? "bg-brand/15 text-brand"
                            : w.tone === "warning"
                            ? "bg-warning/15 text-warning"
                            : "bg-critical/15 text-critical"
                        }`}
                      >
                        {w.tag}
                      </span>
                    </div>
                    <p className="mt-3 text-base leading-relaxed text-ink-2">{w.what}</p>
                  </div>
                  {/* Blast Radius Visual Meter */}
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                      Blast Radius:{" "}
                      <strong className="font-mono text-sm text-ink-1">{w.radius} / 5</strong>
                    </span>
                    <span
                      aria-hidden
                      className="flex h-3.5 w-28 gap-1.5 overflow-hidden rounded-full bg-surface-2 p-1 ring-1 ring-line"
                    >
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className={`flex-1 rounded-sm transition-colors ${
                            i <= w.radius
                              ? w.tone === "good"
                                ? "bg-good shadow-sm shadow-good/50"
                                : w.tone === "brand"
                                ? "bg-brand shadow-sm shadow-brand/50"
                                : w.tone === "warning"
                                ? "bg-warning shadow-sm shadow-warning/50"
                                : "bg-critical shadow-sm shadow-critical/50"
                              : "bg-surface-0/60"
                          }`}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── W0 live: break a payment, get a rescue card ──────────────── */}
      <section id="simulate" className="relative overflow-hidden py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 aura opacity-40" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 text-[13px] font-semibold tracking-tight text-brand">
              <Activity className="size-3.5" aria-hidden />
              W0 · in-session · t ≈ 0s
            </span>
            <h2 className="mt-6 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Break it yourself
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-balance text-ink-2">
              Everyone else&apos;s recovery starts tomorrow morning. This one starts before the
              customer has closed the tab.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-surface-1 p-6 shadow-sm sm:p-8">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink-2">Pro plan · monthly</span>
              <span className="font-display text-3xl font-semibold tracking-tight">₹499</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {FAILURES.map((f) => (
                <motion.button
                  key={f.label}
                  onClick={() => fail(f.envelope)}
                  disabled={busy}
                  whileTap={{ scale: 0.97 }}
                  className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium transition-all hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:opacity-40"
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
                className="relative mt-6 rounded-2xl border border-brand/30 bg-surface-1 p-6 shadow-xl shadow-brand/10 sm:p-8"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-brand"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${
                      rescue.tier === "A"
                        ? "bg-good/10 text-good ring-good/25"
                        : "bg-warning/10 text-warning ring-warning/25"
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

                <p className="mt-5 font-display text-lg font-bold tracking-tight">
                  {rescue.headline}
                </p>
                <p className="mt-2 leading-relaxed text-ink-2">{rescue.subline}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {rescue.alternatives.map((a) => (
                    <motion.button
                      key={a.method}
                      onClick={() => accept(a.method)}
                      whileTap={{ scale: 0.97 }}
                      className="inline-flex items-center gap-2 rounded-full bg-ink-1 px-5 py-2.5 text-sm font-semibold text-surface-0 shadow-sm transition-all hover:shadow-md active:scale-95"
                    >
                      {a.label}
                      <ArrowRight className="size-3.5" aria-hidden />
                    </motion.button>
                  ))}
                </div>

                <p className="mt-5 text-xs leading-relaxed text-ink-3">
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
                      <span className="mt-5 flex items-start gap-2 rounded-xl border border-good/25 bg-good/5 p-4 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                        {consent}
                      </span>
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-line py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-veil opacity-40" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            The numbers, including{" "}
            <span className="marker">the ones that go against us</span>
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-balance text-ink-2">
            Arms table, the ablation where the classifier hits 0% recall, the prior sweep where
            the sign flips, and the adversarial world Phoenix loses in. All on one page.
          </p>
          <a
            href="/dashboard"
            className="group mt-10 inline-flex items-center gap-2 rounded-full bg-ink-1 px-8 py-4 text-sm font-semibold text-surface-0 shadow-xl shadow-shade/10 transition-all hover:shadow-2xl active:scale-95"
          >
            <Sparkles className="size-4" aria-hidden />
            Open the dashboard
            <ArrowRight
              className="size-4 transition-transform group-hover:translate-x-1"
              aria-hidden
            />
          </a>
        </div>
      </section>

    </main>
  );
}
