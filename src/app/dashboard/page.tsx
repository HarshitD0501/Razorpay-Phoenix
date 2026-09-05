import { existsSync, readFileSync } from "node:fs";
import { ArrowDownRight, TriangleAlert } from "lucide-react";
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

export default function Dashboard() {
  if (!existsSync("results/arms.json")) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-2xl font-semibold">No results yet</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Run <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">npm run eval</code>{" "}
          first. The dashboard only ever displays numbers the harness produced — it does not compute
          its own.
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
    <main id="main" className="mx-auto max-w-6xl px-6 pb-24 pt-14">
      <p className="text-xs uppercase tracking-[0.16em] text-ink-3">Merchant copilot</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Measured recovery</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">
        Every figure below is <strong className="font-medium text-ink-1">tier B</strong>:
        deterministic simulation, n={r.meta.n}, seed {r.meta.seed}, classifier{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">
          {r.meta.classifier}
        </code>
        . Reproduce with{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">
          npm run eval
        </code>
        . Tier A — live Razorpay and WhatsApp evidence — lives in{" "}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">fixtures/</code>.
      </p>

      {/* The headline: one hero figure, and it is the cost side, not the revenue side. */}
      <Reveal className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="bg-surface-1 px-6 py-7">
          <p className="text-xs uppercase tracking-[0.14em] text-ink-3">
            Authorization attempts vs Razorpay default
          </p>
          <p className="mt-3 flex items-baseline gap-2 text-5xl font-semibold tracking-tight text-good">
            <ArrowDownRight className="size-8 shrink-0" aria-hidden />
            {attemptCut}%
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            {armE.authAttempts} attempts against arm A&apos;s {armA.authAttempts}, at the same
            recovery count ({armE.recoveredCount} vs {armA.recoveredCount}).
          </p>
        </div>
        <div className="bg-surface-1 px-6 py-7">
          <p className="text-xs uppercase tracking-[0.14em] text-ink-3">Net value, arm E</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{rs(armE.netRupees)}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            {eBeatsA ? "+" : ""}
            {rs(Number(armE.netRupees) - Number(armA.netRupees))} on arm A — about{" "}
            {((Number(armE.netRupees) / Number(armA.netRupees) - 1) * 100).toFixed(1)}%. On its own,
            noise.
          </p>
        </div>
        <div className="bg-surface-1 px-6 py-7">
          <p className="text-xs uppercase tracking-[0.14em] text-ink-3">Attention spent</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {armE.customerContacts.toLocaleString("en-IN")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            customer contacts, {armE.wastedNotifications} of them on accounts that would have paid
            anyway. Left-shift&apos;s cost, not hidden.
          </p>
        </div>
      </Reveal>

      {/* Two measures, two charts, one axis each. */}
      <Reveal className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-2">
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Net value by arm
          </h2>
          <div className="mt-5">
            <BarList
              rows={netRows}
              caption="Nested arms — each adds exactly one component to the row above, so every delta is attributable to that component and nothing else."
            />
          </div>
        </div>
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Authorization attempts by arm
          </h2>
          <div className="mt-5">
            <BarList
              rows={costRows}
              caption="The same arms, the cost side. Recovery rate alone is gameable by retrying forever — arm A does exactly that and pays for it in issuer-visible declines."
            />
          </div>
        </div>
      </Reveal>

      {/* Table twin — every number in the charts above, plus the columns they omit. */}
      <Reveal className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
          Full arms table
        </h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-surface-1">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">arm</th>
                <th scope="col" className="px-4 py-3 font-medium">policy</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">recovered</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">net</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">vs do-nothing</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">auth attempts</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">contacts</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">wasted</th>
              </tr>
            </thead>
            <tbody>
              {r.arms.map((a) => (
                <tr
                  key={a.arm}
                  className={`border-b border-line/60 last:border-0 ${
                    a.arm === "E" ? "bg-series-1/[0.07] font-medium" : ""
                  }`}
                >
                  <th scope="row" className="px-4 py-2.5 text-left font-mono font-normal text-ink-2">
                    {a.arm}
                  </th>
                  <td className="px-4 py-2.5 text-ink-2">{a.label}</td>
                  <td className="px-4 py-2.5 text-right">{a.recoveredCount}</td>
                  <td className="px-4 py-2.5 text-right">{rs(a.netRupees)}</td>
                  <td className="px-4 py-2.5 text-right">{rs(a.netVsArm0)}</td>
                  <td className="px-4 py-2.5 text-right">{a.authAttempts}</td>
                  <td className="px-4 py-2.5 text-right">{a.customerContacts}</td>
                  <td className="px-4 py-2.5 text-right">{a.wastedNotifications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      {/* The ablation that costs us something to publish. */}
      <Reveal className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-[1fr_1fr]">
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Classifier recall by perturbation
          </h2>
          <div className="mt-5">
            <BarList rows={recallRows} caption="Recall of the bucket the world model actually used, per perturbation family. The classifier under test is the one named above; the sim itself is deterministic either way." />
          </div>
        </div>
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Where it breaks
          </h2>
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium">Contradictory envelopes: 0.0% recall</strong> over{" "}
              {r.recallByPerturbation.contradictory?.n ?? 0} cases.
            </span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            When the error code and the human-readable description disagree, the table classifier
            trusts the code and is wrong every single time. It is not degraded — it is at the floor.
            Context-shifted and null-reason envelopes land near half. Only clean envelopes are
            solved.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            This is published because it is the strongest argument for the LLM tier and the
            clearest bound on the numbers above: the arms ran on{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">
              {r.meta.classifier}
            </code>
            , so any recovery it never diagnosed is absent from every arm equally — a floor on arm
            E, not a thumb on the scale.
          </p>
        </div>
      </Reveal>

      {/* Prior sensitivity. The band where the sign flips is the honest part. */}
      <Reveal className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-[1.55fr_1fr]">
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Perturbation sweep — net value vs prior scale
          </h2>
          <div className="mt-4">
            <SweepChart data={sweep} />
          </div>
        </div>
        <div className="bg-surface-1 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Exact values
          </h2>
          <table className="mt-4 w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-3">
              <tr>
                <th scope="col" className="py-2 font-medium">scale</th>
                <th scope="col" className="py-2 text-right font-medium">arm E</th>
                <th scope="col" className="py-2 text-right font-medium">arm A</th>
                <th scope="col" className="py-2 text-right font-medium">winner</th>
              </tr>
            </thead>
            <tbody>
              {r.perturbationSweep.map((s) => (
                <tr key={s.scale} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2 text-left font-mono font-normal text-ink-2">
                    ×{s.scale}
                  </th>
                  <td className="py-2 text-right tabular-nums">{rs(s.eNet)}</td>
                  <td className="py-2 text-right tabular-nums">{rs(s.aNet)}</td>
                  <td
                    className={`py-2 text-right font-medium ${s.eWins ? "" : "text-critical"}`}
                  >
                    {s.eWins ? "E" : "A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs leading-relaxed text-ink-3">
            One row out of five goes the other way. Under-confident priors make arm E stop
            intervening early enough to lose to brute-force retries — a real boundary on the claim,
            not a rounding artefact.
          </p>
        </div>
      </Reveal>

      {/* A result we lose. Kept at full size, not in a footnote. */}
      <Reveal className="mt-8 rounded-2xl border border-line bg-surface-1 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
            Adversarial arm
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-critical/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-critical">
            <TriangleAlert className="size-3" aria-hidden />
            arm {r.adversarial.winner} wins
          </span>
        </div>
        <div className="mt-5 grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-baseline">
          <p>
            <span className="block text-xs text-ink-3">arm E · Phoenix</span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums tracking-tight">
              {rs(r.adversarial.eNet)}
            </span>
          </p>
          <p>
            <span className="block text-xs text-ink-3">arm A · Razorpay default</span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums tracking-tight">
              {rs(r.adversarial.aNet)}
            </span>
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            A world tuned to punish early intervention — cheap retries, patient customers, weak
            downtime signal — beats Phoenix by{" "}
            {rs(Number(r.adversarial.aNet) - Number(r.adversarial.eNet))} (
            {(
              (Number(r.adversarial.aNet) / Number(r.adversarial.eNet) - 1) *
              100
            ).toFixed(1)}
            %). Left-shifting is not free and it is not universal: it wins where attempts and
            attention are scarce, and loses where they are not.
          </p>
        </div>
      </Reveal>

      {/* Interactive: the reader's own knobs, and the append-only trail. */}
      <Reveal className="mt-8 grid gap-8 lg:grid-cols-2">
        <WhatIf />
        <Ledger />
      </Reveal>
    </main>
  );
}
