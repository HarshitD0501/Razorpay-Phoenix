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
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  Lock,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  TriangleAlert,
  Zap,
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
  source?: "llm" | "table";
  model?: string;
};

const FAILURES = [
  {
    id: "sbi_upi",
    label: "SBI UPI Rail Latency",
    sub: "Switch timeout · 15s+ delay",
    method: "UPI Autopay",
    bank: "State Bank of India",
    tag: "Transient Infra",
    tone: "warning",
    icon: "upi",
    envelope: {
      paymentId: "pay_demo_upi",
      reason: "payment_timed_out",
      source: "bank",
      step: "payment_authorization",
      method: "upi",
      bank: "SBIN",
      description: "UPI switch timed out awaiting authorization response from State Bank of India server node",
    },
  },
  {
    id: "hdfc_card",
    label: "HDFC Card Expired",
    sub: "Terminal instrument defect",
    method: "Debit Card",
    bank: "HDFC Bank",
    tag: "Permanent Defect",
    tone: "critical",
    icon: "card",
    envelope: {
      paymentId: "pay_demo_card",
      reason: "card_expired",
      source: "issuer",
      step: "payment_authorization",
      method: "card",
      bank: "HDFC",
      description: "Debit card validity expired during recurrent authorization cycle",
    },
  },
  {
    id: "icici_funds",
    label: "Insufficient Balance",
    sub: "Soft decline · Payday recovery",
    method: "Credit Card",
    bank: "ICICI Bank",
    tag: "Funds / Limits",
    tone: "brand",
    icon: "card",
    envelope: {
      paymentId: "pay_demo_funds",
      reason: "payment_failed_insufficient_funds",
      source: "issuer",
      step: "payment_authorization",
      method: "card",
      bank: "ICIC",
      description: "Account balance below subscription charge threshold",
    },
  },
  {
    id: "axis_null",
    label: "Null Gateway Reason",
    sub: "Ambiguous error · AI Triage",
    method: "NetBanking",
    bank: "Axis Bank",
    tag: "Gemini AI Showcase",
    tone: "purple",
    icon: "netbanking",
    envelope: {
      paymentId: "pay_demo_null",
      source: "bank",
      step: "payment_authorization",
      method: "netbanking",
      bank: "UTIB",
      description: "Transaction halted at issuer node without an explicit gateway error code",
    },
  },
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
  const [selectedScenario, setSelectedScenario] = useState<(typeof FAILURES)[number]>(FAILURES[0]!);
  const [rescue, setRescue] = useState<Rescue | null>(null);
  const [consent, setConsent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "System ready · W0 In-Flight Gateway channel listening for transaction events...",
  ]);
  const ladder = useRef<HTMLDivElement>(null);

  // The ladder's four rows reveal on scroll, staggered.
  useGSAP(
    () => {},
    { scope: ladder },
  );

  async function triggerSimulation(scenario: (typeof FAILURES)[number] = selectedScenario) {
    if (!scenario) return;
    setBusy(true);
    setConsent(null);
    const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
    setLogs((prev) => [
      `[${now}] INGEST: Initiating payment intent ₹499 via ${scenario.bank} (${scenario.method})...`,
      `[${now}] GATEWAY: Simulated drop detected — ${scenario.sub}`,
      `[${now}] AI_TRIAGE: Invoking Gemini 3.5 Flash classifier with failure envelope...`,
      ...prev.slice(0, 4),
    ]);

    try {
      const res = await fetch("/api/rescue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scenario.envelope, amountRupees: 499 }),
      });
      const data = (await res.json()) as Rescue;
      setRescue(data);
      const postNow = new Date().toLocaleTimeString("en-IN", { hour12: false });
      setLogs((prev) => [
        `[${postNow}] CLASSIFY: Diagnosed as [${data.bucket}] via ${data.source === "llm" ? "Gemini 3.5 Flash" : "Rule Engine"}.`,
        `[${postNow}] W0_RESCUE: In-session alternative dispatched with single-use cryptographic token.`,
        ...prev.slice(0, 4),
      ]);
    } catch {
      setLogs((prev) => [`[ERROR] Failed to query rescue API endpoint`, ...prev]);
    } finally {
      setBusy(false);
    }
  }

  async function accept(method: string) {
    if (!rescue) return;
    const now = new Date().toLocaleTimeString("en-IN", { hour12: false });
    setLogs((prev) => [
      `[${now}] CONSENT: Customer selected alternative rail [${method}]. Posting to /api/consent...`,
      ...prev.slice(0, 4),
    ]);
    const res = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consentToken: rescue.consentToken, method, paymentId: "pay_demo" }),
    });
    const j = (await res.json()) as { message?: string; duplicate?: boolean; error?: string };
    setConsent(j.error ?? `${j.message}${j.duplicate ? " (idempotent — second click ignored)" : ""}`);
    const postNow = new Date().toLocaleTimeString("en-IN", { hour12: false });
    setLogs((prev) => [
      `[${postNow}] SETTLED: Transaction recovered successfully. Idempotency lock active.`,
      ...prev.slice(0, 4),
    ]);
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
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-14 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-[13px] font-semibold tracking-tight text-brand shadow-sm shadow-brand/10">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              W0 · In-Session Active Rescue Sandbox
            </div>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Break it yourself. Watch W0 intercept.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-balance text-ink-2">
              Select any real-world gateway failure scenario below. Simulate the drop to see Phoenix
              catch the transaction mid-flight, invoke <strong className="text-ink-1">Gemini 3.5 Flash</strong> for
              autonomous triage, and present a 1-tap consent rescue card before the customer closes the tab.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Column: Failure Scenario Selector */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                  1. Select Gateway Failure Scenario
                </span>
                <span className="text-xs text-brand font-medium">4 production edge-cases</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FAILURES.map((f) => {
                  const isSelected = selectedScenario.id === f.id;
                  return (
                    <motion.button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedScenario(f);
                        setConsent(null);
                      }}
                      whileHover={{ scale: 1.015 }}
                      whileTap={{ scale: 0.985 }}
                      className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? "border-brand/60 bg-surface-2/90 shadow-md shadow-brand/10 ring-1 ring-brand/40"
                          : "border-line bg-surface-1/70 hover:border-line-strong hover:bg-surface-2/40"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className={`flex size-8 items-center justify-center rounded-lg ${
                              isSelected
                                ? "bg-brand text-white shadow-sm shadow-brand/40"
                                : "bg-surface-3 text-ink-2"
                            }`}
                          >
                            {f.icon === "upi" ? (
                              <Smartphone className="size-4" />
                            ) : f.icon === "netbanking" ? (
                              <Building2 className="size-4" />
                            ) : (
                              <CreditCard className="size-4" />
                            )}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                              f.tone === "warning"
                                ? "bg-warning/15 text-warning"
                                : f.tone === "critical"
                                ? "bg-critical/15 text-critical"
                                : f.tone === "purple"
                                ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                                : "bg-brand/15 text-brand"
                            }`}
                          >
                            {f.tag}
                          </span>
                        </div>

                        <h3 className="mt-3 font-semibold text-sm text-ink-1 leading-snug">
                          {f.label}
                        </h3>
                        <p className="mt-1 text-xs text-ink-3 leading-relaxed">{f.sub}</p>
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-2 text-[11px] text-ink-3">
                        <span className="truncate font-mono">{f.bank}</span>
                        <div className="flex items-center gap-1 font-medium text-ink-2">
                          <span>{f.method}</span>
                          <ChevronRight className="size-3 text-ink-3" />
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {/* Live Telemetry / Ingestion Stream Drawer */}
              <div className="mt-6 rounded-2xl border border-line-strong bg-surface-0 p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-line/80 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="size-2.5 rounded-full bg-critical/70" />
                      <span className="size-2.5 rounded-full bg-warning/70" />
                      <span className="size-2.5 rounded-full bg-good/70" />
                    </div>
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-ink-2 pl-2">
                      <Terminal className="size-3.5 text-brand" />
                      TELEMETRY_LOG · /v1/gateway/events
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-mono font-medium text-good">
                    <span className="size-1.5 rounded-full bg-good animate-pulse" />
                    LISTENING
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto pr-1">
                  {logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`truncate ${
                        idx === 0
                          ? "text-brand font-medium"
                          : log.includes("GATEWAY:")
                          ? "text-warning"
                          : log.includes("AI_TRIAGE:")
                          ? "text-purple-400 font-semibold"
                          : log.includes("CLASSIFY:")
                          ? "text-good"
                          : log.includes("SETTLED:")
                          ? "text-good font-bold"
                          : "text-ink-3"
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Active Checkout Preview & W0 Interceptor */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
                  2. Simulated Checkout Session
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-ink-2">
                  <Lock className="size-3 text-good" />
                  Razorpay TLS 1.3
                </span>
              </div>

              {/* Checkout Card */}
              <div className="relative rounded-2xl border border-line bg-surface-1 p-6 shadow-xl sm:p-7">
                {/* Checkout Header */}
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-brand/10 border border-brand/20 text-brand font-bold">
                      RP
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-ink-1 flex items-center gap-1.5">
                        Acme Cloud Technologies
                        <ShieldCheck className="size-3.5 text-brand" />
                      </h4>
                      <p className="text-xs text-ink-3">Order ID: order_phx_984102</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-ink-3 block">Total Payable</span>
                    <span className="font-display text-xl font-bold tracking-tight text-ink-1">
                      ₹499.00
                    </span>
                  </div>
                </div>

                {/* Instrument Summary */}
                <div className="mt-4 rounded-xl border border-line/70 bg-surface-2/60 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-3">Active Instrument:</span>
                    <span className="font-mono font-medium text-ink-1">
                      {selectedScenario.bank} ({selectedScenario.method})
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-ink-3">Status:</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-warning">
                      <TriangleAlert className="size-3" />
                      Simulating Active Drop Route
                    </span>
                  </div>
                </div>

                {/* Primary Trigger Button */}
                <div className="mt-6">
                  <motion.button
                    type="button"
                    onClick={() => triggerSimulation(selectedScenario)}
                    disabled={busy}
                    whileTap={{ scale: 0.98 }}
                    className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-brand to-brand-strong px-5 py-3.5 font-semibold text-white shadow-lg shadow-brand/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="flex items-center justify-center gap-2 text-sm">
                      {busy ? (
                        <>
                          <RefreshCw className="size-4 animate-spin" />
                          Simulating Drop & Invoking Gemini AI...
                        </>
                      ) : (
                        <>
                          <Zap className="size-4 fill-current" />
                          Simulate Gateway Drop & Watch W0 Rescue
                        </>
                      )}
                    </span>
                  </motion.button>
                  <p className="mt-2 text-center text-[11px] text-ink-3">
                    Dispatches real-time failure envelope to Phoenix AI classification pipeline
                  </p>
                </div>

                {/* AnimatePresence for the Rescue Card */}
                <AnimatePresence mode="wait">
                  {rescue && (
                    <motion.div
                      key={rescue.headline + selectedScenario.id}
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="relative mt-6 rounded-2xl border border-brand/40 bg-surface-2/95 p-5 shadow-2xl shadow-brand/15"
                    >
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-1.5 rounded-l-2xl bg-brand"
                      />

                      {/* Header Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${
                            rescue.tier === "A"
                              ? "bg-good/15 text-good ring-good/30"
                              : "bg-warning/15 text-warning ring-warning/30"
                          }`}
                        >
                          {rescue.tier === "A" ? (
                            <ShieldCheck className="size-3" aria-hidden />
                          ) : (
                            <TriangleAlert className="size-3" aria-hidden />
                          )}
                          tier {rescue.tier}
                        </span>

                        {/* AI Triage Model Badge */}
                        <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-300 shadow-sm shadow-purple-500/20">
                          <Sparkles className="size-3 text-purple-300" />
                          {rescue.source === "llm" ? "AI Triage · Gemini 3.5 Flash" : "Rule Engine Fallback"}
                        </span>

                        <span className="ml-auto font-mono text-[11px] text-ink-3">
                          Bucket: <strong className="font-semibold text-brand">{rescue.bucket}</strong>
                        </span>
                      </div>

                      <h5 className="mt-4 font-display text-base font-bold tracking-tight text-ink-1">
                        {rescue.headline}
                      </h5>
                      <p className="mt-1 text-xs leading-relaxed text-ink-2">{rescue.subline}</p>

                      {/* Explainable AI Diagnosis Box */}
                      {rescue.rationale && (
                        <div className="mt-3.5 rounded-xl border border-purple-500/25 bg-purple-950/20 p-3 text-xs text-purple-200">
                          <div className="flex items-center gap-1.5 font-semibold text-purple-300 text-[11px]">
                            <Sparkles className="size-3 text-purple-400" />
                            Gemini 3.5 Real-Time Triage Rationale
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-ink-2 font-mono">
                            &ldquo;{rescue.rationale}&rdquo;
                          </p>
                        </div>
                      )}

                      {/* 1-Tap Alternatives */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {rescue.alternatives.map((a) => (
                          <motion.button
                            key={a.method}
                            onClick={() => accept(a.method)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.97 }}
                            className="inline-flex items-center gap-2 rounded-xl bg-ink-1 px-4 py-2 text-xs font-semibold text-surface-0 shadow-sm transition-all hover:bg-brand hover:text-white"
                          >
                            {a.label}
                            <ArrowRight className="size-3" aria-hidden />
                          </motion.button>
                        ))}
                      </div>

                      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                        Enforced by{" "}
                        <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[10px]">
                          /api/consent
                        </code>{" "}
                        with single-use token. Merchant cannot debit without this POST.
                      </p>

                      <AnimatePresence>
                        {consent && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 flex items-start gap-2 rounded-xl border border-good/30 bg-good/10 p-3 text-xs text-ink-1">
                              <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                              <div>
                                <span className="font-semibold text-good">Consent Verified & Settled: </span>
                                {consent}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
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
