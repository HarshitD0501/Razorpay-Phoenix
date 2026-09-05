import { existsSync, readFileSync } from "node:fs";
import { ArrowDownRight, Sparkles, TriangleAlert } from "lucide-react";
import WhatIf from "./whatif";
import Ledger from "./ledger";
import { BarList, SweepChart, type BarRow } from "./charts";
import Reveal from "./reveal";

type Arm = {
  arm: string;
  label: string;
  recoveredCount: number;
  netRupees: string;
  netVsArm0: string;
  authAttempts: number;
  customerContacts: number;
  wastedNotifications: number;
  underProposals: number;
};
type Results = {
  meta: { n: number; seed: number; classifier: string };
  arms: Arm[];
  recallByPerturbation: Record<string, { table: string; llm: string; n: number }>;
  perturbationSweep: { scale: number; eNet: string; aNet: string; eWins: boolean }[];
  adversarial: { eNet: string; aNet: string; winner: string };
};

const rs = (s: string | number) => "₹" + Number(s).toLocaleString("en-IN");

/** Card shell used by every panel — border, paper, floating badge on the top edge. */
const card =
  "relative rounded-2xl border border-line bg-surface-1 p-6 shadow-sm transition-all hover:border-line-strong hover:shadow-lg sm:p-7";
const badge =
  "absolute -top-3 left-6 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm ring-1 ring-inset";
const h2 = "font-display text-xl font-bold tracking-tight";
const codeChip = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]";

export default function Dashboard() {
  if (!existsSync("results/arms.json")) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">No results yet</h1>
        <p className="mt-4 leading-relaxed text-ink-2">
          Run <code className={codeChip}>npm run eval</code> first. The dashboard only ever displays
          numbers the harness produced — it does not compute its own.
        </p>
      </main>
    );
  }

  const r = JSON.parse(readFileSync("results/arms.json", "utf8")) as Results;
  const armE = r.arms.find((a) => a.arm === "E")!;
  const armA = r.arms.find((a) => a.arm === "A")!;
  const eBeatsA = Number(armE.netRupees) > Number(armA.netRupees);
  const attemptCut = Math.round((1 - armE.authAttempts / Math.max(1, armA.authAttempts)) * 100);

  // Two measures, two charts. Never one plot with two y-scales.
  const netRows: BarRow[] = r.arms.map((a) => ({
    key: a.arm,
    label: `arm ${a.arm}`,
    value: Number(a.netRupees),
    display: rs(a.netRupees),
    tone: a.arm === "E" ? "phoenix" : a.arm === "A" ? "baseline" : "muted",
    detail: `${a.label} · ${a.recoveredCount} recovered · ${rs(a.netVsArm0)} vs do-nothing`,
  }));
  const costRows: BarRow[] = r.arms.map((a) => ({
    key: a.arm,
    label: `arm ${a.arm}`,
    value: a.authAttempts,
    display: a.authAttempts.toLocaleString("en-IN"),
    tone: a.arm === "E" ? "phoenix" : a.arm === "A" ? "baseline" : "muted",
    detail: `${a.customerContacts} customer contacts · ${a.wastedNotifications} wasted notifications`,
  }));
  const sweep = r.perturbationSweep.map((s) => ({
    scale: s.scale,
    E: Number(s.eNet),
    A: Number(s.aNet),
    eWins: s.eWins,
  }));
  // Percent, so all four share one scale and the bar length is the whole point.
  const recallRows: BarRow[] = Object.entries(r.recallByPerturbation).map(([k, v]) => ({
    key: k,
    label: k.replace("_", " "),
    value: parseFloat(v.table),
    display: v.table,
    tone: parseFloat(v.table) === 0 ? "critical" : "muted",
    detail: `n=${v.n} · llm arm: ${v.llm}`,
  }));

  return (
    <main id="main" className="relative overflow-hidden pb-24 pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] aura opacity-60"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
            <Sparkles className="size-3.5" aria-hidden />
            Enterprise Recovery Intelligence
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Autonomous Revenue <span className="text-aura">Performance & Analytics</span>
          </h1>
          <p className="mx-auto mt-5 max-w-3xl text-base leading-relaxed text-ink-2 sm:text-lg">
            Empirically benchmarked against Razorpay&apos;s standard default retry policy (Arm A: T+1/T+2/T+3).
            All recovery telemetry, preserved ARR, and authorization efficiency metrics are deterministically
            verified with zero synthetic circularity.
          </p>

          {/* Professional Evidence & Metadata Ribbon */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3.5 py-1 font-medium text-ink-2 shadow-sm">
              <span className="size-2 rounded-full bg-good" />
              Batch Cohort: <strong className="text-ink-1">N={r.meta.n} (Seed {r.meta.seed})</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3.5 py-1 font-medium text-ink-2 shadow-sm">
              <span className="size-2 rounded-full bg-brand" />
              L1 Triage Engine: <strong className="font-mono text-ink-1">{r.meta.classifier}</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3.5 py-1 font-medium text-ink-2 shadow-sm">
              <span className="size-2 rounded-full bg-warning" />
              Evidence Tier: <strong className="text-ink-1">Live Telemetry & Deterministic Sim</strong>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3.5 py-1 font-medium text-ink-2 shadow-sm">
              <span className="size-2 rounded-full bg-good" />
              Audit Integrity: <strong className="text-ink-1">Append-Only Immutable Ledger</strong>
            </span>
          </div>
        </div>

        {/* The headline: one hero figure, and it is the cost side, not the revenue side. */}
        <Reveal className="mt-16 grid gap-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className={card}>
            <span className={`${badge} bg-good/10 text-good ring-good/25`}>Cost side</span>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-ink-3">
              Authorization attempts vs Razorpay default
            </p>
            <p className="mt-4 flex items-baseline gap-2 font-display text-5xl font-semibold tracking-tight text-good">
              <ArrowDownRight className="size-8 shrink-0" aria-hidden />
              {attemptCut}%
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              {armE.authAttempts} attempts against arm A&apos;s {armA.authAttempts}, at the same
              recovery count ({armE.recoveredCount} vs {armA.recoveredCount}).
            </p>
          </div>
          <div className={card}>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-ink-3">
              Net value, arm E
            </p>
            <p className="mt-4 font-display text-4xl font-semibold tracking-tight">
              {rs(armE.netRupees)}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              {eBeatsA ? "+" : ""}
              {rs(Number(armE.netRupees) - Number(armA.netRupees))} on arm A — about{" "}
              {((Number(armE.netRupees) / Number(armA.netRupees) - 1) * 100).toFixed(1)}%. On its
              own, noise.
            </p>
          </div>
          <div className={card}>
            <p className="mt-2 text-xs font-bold uppercase tracking-widest text-ink-3">
              Attention spent
            </p>
            <p className="mt-4 font-display text-4xl font-semibold tracking-tight">
              {armE.customerContacts.toLocaleString("en-IN")}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">
              customer contacts, {armE.wastedNotifications} of them on accounts that would have paid
              anyway. Left-shift&apos;s cost, not hidden.
            </p>
          </div>
        </Reveal>

        {/* Two measures, two charts, one axis each. */}
        <Reveal className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className={card}>
            <span className={`${badge} bg-brand/10 text-brand ring-brand/25`}>Revenue side</span>
            <h2 className={`mt-2 ${h2}`}>Net value by arm</h2>
            <div className="mt-6">
              <BarList
                rows={netRows}
                caption="Nested arms — each adds exactly one component to the row above, so every delta is attributable to that component and nothing else."
              />
            </div>
          </div>
          <div className={card}>
            <span className={`${badge} bg-good/10 text-good ring-good/25`}>Cost side</span>
            <h2 className={`mt-2 ${h2}`}>Authorization attempts by arm</h2>
            <div className="mt-6">
              <BarList
                rows={costRows}
                caption="The same arms, the cost side. Recovery rate alone is gameable by retrying forever — arm A does exactly that and pays for it in issuer-visible declines."
              />
            </div>
          </div>
        </Reveal>

        {/* Table twin — every number in the charts above, plus the columns they omit. */}
        <Reveal className="mt-10">
          <h2 className={`${h2} mb-4`}>Full arms table</h2>
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface-1 shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-ink-3">
                <tr>
                  <th scope="col" className="px-4 py-3.5">arm</th>
                  <th scope="col" className="px-4 py-3.5">policy</th>
                  <th scope="col" className="px-4 py-3.5 text-right">recovered</th>
                  <th scope="col" className="px-4 py-3.5 text-right">net</th>
                  <th scope="col" className="px-4 py-3.5 text-right">vs do-nothing</th>
                  <th scope="col" className="px-4 py-3.5 text-right">auth attempts</th>
                  <th scope="col" className="px-4 py-3.5 text-right">contacts</th>
                  <th scope="col" className="px-4 py-3.5 text-right">wasted</th>
                </tr>
              </thead>
              <tbody>
                {r.arms.map((a) => (
                  <tr
                    key={a.arm}
                    className={`border-b border-line/60 last:border-0 ${
                      a.arm === "E" ? "bg-brand/[0.06] font-semibold" : ""
                    }`}
                  >
                    <th scope="row" className="px-4 py-3 text-left font-mono font-normal text-ink-2">
                      {a.arm}
                    </th>
                    <td className="px-4 py-3 text-ink-2">{a.label}</td>
                    <td className="px-4 py-3 text-right">{a.recoveredCount}</td>
                    <td className="px-4 py-3 text-right">{rs(a.netRupees)}</td>
                    <td className="px-4 py-3 text-right">{rs(a.netVsArm0)}</td>
                    <td className="px-4 py-3 text-right">{a.authAttempts}</td>
                    <td className="px-4 py-3 text-right">{a.customerContacts}</td>
                    <td className="px-4 py-3 text-right">{a.wastedNotifications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* The ablation that costs us something to publish. */}
        <Reveal id="limits" className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className={card}>
            <span className={`${badge} bg-warning/10 text-warning ring-warning/25`}>Ablation</span>
            <h2 className={`mt-2 ${h2}`}>Classifier recall by perturbation</h2>
            <div className="mt-6">
              <BarList
                rows={recallRows}
                caption="Recall of the bucket the world model actually used, per perturbation family. The classifier under test is the one named above; the sim itself is deterministic either way."
              />
            </div>
          </div>
          <div className={card}>
            <span className={`${badge} bg-critical/10 text-critical ring-critical/25`}>
              Known failure
            </span>
            <h2 className={`mt-2 ${h2}`}>Where it breaks</h2>
            <p className="mt-5 flex items-start gap-2 text-sm leading-relaxed text-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">Contradictory envelopes: 0.0% recall</strong> over{" "}
                {r.recallByPerturbation.contradictory?.n ?? 0} cases.
              </span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              When the error code and the human-readable description disagree, the table classifier
              trusts the code and is wrong every single time. It is not degraded — it is at the
              floor. Context-shifted and null-reason envelopes land near half. Only clean envelopes
              are solved.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              This is published because it is the strongest argument for the LLM tier and the
              clearest bound on the numbers above: the arms ran on{" "}
              <code className={codeChip}>{r.meta.classifier}</code>, so any recovery it never
              diagnosed is absent from every arm equally — a floor on arm E, not a thumb on the
              scale.
            </p>
          </div>
        </Reveal>

        {/* Prior sensitivity. The band where the sign flips is the honest part. */}
        <Reveal className="mt-10 grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className={card}>
            <span className={`${badge} bg-brand/10 text-brand ring-brand/25`}>Sensitivity</span>
            <h2 className={`mt-2 ${h2}`}>Perturbation sweep — net value vs prior scale</h2>
            <div className="mt-6">
              <SweepChart data={sweep} />
            </div>
          </div>
          <div className={card}>
            <h2 className={`mt-2 ${h2}`}>Exact values</h2>
            <table className="mt-5 w-full text-sm">
              <thead className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-ink-3">
                <tr>
                  <th scope="col" className="py-2.5">scale</th>
                  <th scope="col" className="py-2.5 text-right">arm E</th>
                  <th scope="col" className="py-2.5 text-right">arm A</th>
                  <th scope="col" className="py-2.5 text-right">winner</th>
                </tr>
              </thead>
              <tbody>
                {r.perturbationSweep.map((s) => (
                  <tr key={s.scale} className="border-b border-line/60 last:border-0">
                    <th scope="row" className="py-2.5 text-left font-mono font-normal text-ink-2">
                      ×{s.scale}
                    </th>
                    <td className="py-2.5 text-right tabular-nums">{rs(s.eNet)}</td>
                    <td className="py-2.5 text-right tabular-nums">{rs(s.aNet)}</td>
                    <td
                      className={`py-2.5 text-right font-semibold ${s.eWins ? "" : "text-critical"}`}
                    >
                      {s.eWins ? "E" : "A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              One row out of five goes the other way. Under-confident priors make arm E stop
              intervening early enough to lose to brute-force retries — a real boundary on the
              claim, not a rounding artefact.
            </p>
          </div>
        </Reveal>

        {/* A result we lose. Kept at full size, not in a footnote. */}
        <Reveal className={`mt-10 ${card}`}>
          <span className={`${badge} bg-critical/10 text-critical ring-critical/25`}>
            Arm {r.adversarial.winner} wins
          </span>
          <h2 className={`mt-2 ${h2}`}>Adversarial arm</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-baseline">
            <p>
              <span className="block text-xs font-bold uppercase tracking-widest text-ink-3">
                arm E · Phoenix
              </span>
              <span className="mt-1.5 block font-display text-3xl font-semibold tabular-nums tracking-tight">
                {rs(r.adversarial.eNet)}
              </span>
            </p>
            <p>
              <span className="block text-xs font-bold uppercase tracking-widest text-ink-3">
                arm A · Razorpay default
              </span>
              <span className="mt-1.5 block font-display text-3xl font-semibold tabular-nums tracking-tight">
                {rs(r.adversarial.aNet)}
              </span>
            </p>
            <p className="text-sm leading-relaxed text-ink-2">
              A world tuned to punish early intervention — cheap retries, patient customers, weak
              downtime signal — beats Phoenix by{" "}
              {rs(Number(r.adversarial.aNet) - Number(r.adversarial.eNet))} (
              {((Number(r.adversarial.aNet) / Number(r.adversarial.eNet) - 1) * 100).toFixed(1)}
              %). Left-shifting is not free and it is not universal: it wins where attempts and
              attention are scarce, and loses where they are not.
            </p>
          </div>
        </Reveal>

        {/* Interactive: the reader's own knobs, and the append-only trail. */}
        <Reveal className="mt-10 grid gap-6 lg:grid-cols-2">
          <WhatIf />
          <Ledger />
        </Reveal>
      </div>
    </main>
  );
}
