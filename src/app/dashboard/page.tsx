import { existsSync, readFileSync } from "node:fs";
import WhatIf from "./whatif";
import Ledger from "./ledger";

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

const rs = (s: string) => "₹" + Number(s).toLocaleString("en-IN");

export default function Dashboard() {
  if (!existsSync("results/arms.json")) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-2xl font-semibold">No results yet</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Run <code className="rounded bg-neutral-200 px-1">npm run eval</code> first. The dashboard
          only ever displays numbers the harness produced — it does not compute its own.
        </p>
      </main>
    );
  }
  const r = JSON.parse(readFileSync("results/arms.json", "utf8")) as Results;
  const armE = r.arms.find((a) => a.arm === "E");
  const armA = r.arms.find((a) => a.arm === "A");
  const eBeatsA = armE && armA && Number(armE.netRupees) > Number(armA.netRupees);

  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <p className="text-xs uppercase tracking-widest text-neutral-500">Merchant copilot</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Phoenix — measured recovery</h1>
      <p className="mt-3 max-w-2xl text-sm text-neutral-600">
        Every figure below is <strong>tier B</strong>: deterministic simulation, n={r.meta.n}, seed{" "}
        {r.meta.seed}, classifier <code>{r.meta.classifier}</code>. Reproduce with{" "}
        <code className="rounded bg-neutral-200 px-1">npm run eval</code>. Tier A (live Razorpay and
        WhatsApp evidence) lives in <code>fixtures/</code>.
      </p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-widest text-neutral-500">
        Nested arms — each row adds exactly one component
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-3 py-2">arm</th>
              <th className="px-3 py-2">policy</th>
              <th className="px-3 py-2 text-right">recovered</th>
              <th className="px-3 py-2 text-right">net</th>
              <th className="px-3 py-2 text-right">vs do-nothing</th>
              <th className="px-3 py-2 text-right">auth attempts</th>
              <th className="px-3 py-2 text-right">contacts</th>
              <th className="px-3 py-2 text-right">wasted</th>
            </tr>
          </thead>
          <tbody>
            {r.arms.map((a) => (
              <tr key={a.arm} className={a.arm === "E" ? "bg-neutral-50 font-medium" : ""}>
                <td className="px-3 py-2">{a.arm}</td>
                <td className="px-3 py-2">{a.label}</td>
                <td className="px-3 py-2 text-right">{a.recoveredCount}</td>
                <td className="px-3 py-2 text-right">{rs(a.netRupees)}</td>
                <td className="px-3 py-2 text-right">{rs(a.netVsArm0)}</td>
                <td className="px-3 py-2 text-right">{a.authAttempts}</td>
                <td className="px-3 py-2 text-right">{a.customerContacts}</td>
                <td className="px-3 py-2 text-right">{a.wastedNotifications}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Auth attempts and contacts are not decoration. Recovery rate alone is gameable by retrying
        forever, so the cost columns are what make the net column mean anything.{" "}
        {eBeatsA ? (
          <>
            Arm E beats Razorpay&apos;s default by {rs(String(Number(armE!.netRupees) - Number(armA!.netRupees)))} using{" "}
            {Math.round((1 - armE!.authAttempts / Math.max(1, armA!.authAttempts)) * 100)}% fewer
            authorization attempts.
          </>
        ) : (
          <>Arm E does not beat Razorpay&apos;s default here. That is the finding, stated plainly.</>
        )}
      </p>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            Classifier recall, per perturbation
          </h2>
          <div className="mt-3 rounded-xl border border-neutral-300 bg-white p-4 text-sm">
            {Object.entries(r.recallByPerturbation).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-neutral-100 py-1.5 last:border-0">
                <span className="text-neutral-600">
                  {k} <span className="text-neutral-400">n={v.n}</span>
                </span>
                <span className="tabular-nums">
                  table {v.table} · llm {v.llm}
                </span>
              </div>
            ))}
            <p className="mt-3 text-xs text-neutral-500">
              Never reported as one aggregate — an average hides exactly where the model earns its
              place. Clean cases are correct by construction for the table; the other three rows are
              the honest test.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
            Does the conclusion survive wrong beliefs?
          </h2>
          <div className="mt-3 rounded-xl border border-neutral-300 bg-white p-4 text-sm">
            {r.perturbationSweep.map((s) => (
              <div key={s.scale} className="flex justify-between border-b border-neutral-100 py-1.5 last:border-0">
                <span className="text-neutral-600">beliefs × {s.scale}</span>
                <span className="tabular-nums">
                  E {rs(s.eNet)} · A {rs(s.aNet)}{" "}
                  <span className={s.eWins ? "text-neutral-900" : "text-red-600"}>
                    {s.eWins ? "E wins" : "A wins"}
                  </span>
                </span>
              </div>
            ))}
            <p className="mt-3 text-xs text-neutral-500">
              The agent&apos;s priors are scaled 0.3×–3× while the world is left untouched. Adversarial
              arm (fatigue and issuer penalties zeroed): winner {r.adversarial.winner}.
            </p>
          </div>
        </section>
      </div>

      <WhatIf />
      <Ledger />
    </main>
  );
}
