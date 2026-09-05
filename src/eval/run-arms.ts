/**
 * Runner. Prints the arms table, the LLM ablation split by perturbation class,
 * the belief-perturbation sweep, and the adversarial arm.
 *
 *   npx tsx src/eval/run-arms.ts            # 600 cases, seed 42
 *   npx tsx src/eval/run-arms.ts --n 2000
 *
 * Writes results/arms.json. Same seed -> same bytes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import Decimal from "decimal.js";
import { classifyByLlm, classifyByTable } from "../core/classify";
import { generate } from "../sim/generate";
import type { Bucket } from "../core/types";
import { DEFAULTS, runArm, type ArmId, type ArmResult, type Params } from "./arms";

const argOf = (k: string, dflt: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};

const N = argOf("n", 600);
const SEED = argOf("seed", 42);
const withLlm = process.argv.includes("--llm") && !!process.env.ANTHROPIC_API_KEY;

const cases = generate(N, SEED);

/** Arm D's classifier. Without --llm it is the table, and the run says so. */
const llmClassifier = async (c: (typeof cases)[number]) => {
  if (!withLlm) {
    const r = classifyByTable(c.envelope);
    return { bucket: r.bucket, fellBack: true, llm: false };
  }
  const r = await classifyByLlm(c.envelope);
  return { bucket: r.bucket, fellBack: r.source === "table", llm: r.source === "llm" };
};

const arms: ArmId[] = ["0", "A", "B", "C", "D", "E"];
const results: ArmResult[] = [];
for (const arm of arms) {
  results.push(
    await runArm(arm, cases, DEFAULTS, arm === "D" || arm === "E" ? llmClassifier : undefined),
  );
}
const base = new Decimal(results[0]!.netRupees);
for (const r of results) r.netVsArm0 = new Decimal(r.netRupees).minus(base).toFixed(0);

function table(rows: ArmResult[]) {
  const head = [
    "arm",
    "policy",
    "recovered",
    "net Rs",
    "vs arm0",
    "auth",
    "contacts",
    "wasted",
    "under",
  ];
  const body = rows.map((r) => [
    r.arm,
    r.label.slice(0, 34),
    String(r.recoveredCount),
    r.netRupees,
    r.netVsArm0,
    String(r.authAttempts),
    String(r.customerContacts),
    String(r.wastedNotifications),
    String(r.underProposals),
  ]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(w[i]!)).join("  ");
  console.log(line(head));
  console.log(w.map((x) => "-".repeat(x)).join("  "));
  for (const b of body) console.log(line(b));
}

console.log(`\nPHOENIX EVAL  n=${N}  seed=${SEED}  tier B (deterministic sim)`);
console.log(`classifier for arms D/E: ${withLlm ? "LLM (claude-sonnet-5)" : "table (no --llm / no key)"}\n`);
table(results);

// ---- classifier recall, split by perturbation class -----------------------
// Aggregate recall hides where a model earns its place, so it is never reported
// on its own.
const classes = ["clean", "context", "contradictory", "null_reason"] as const;
const recall: Record<string, { table: string; llm: string; n: number }> = {};
for (const cls of classes) {
  const subset = cases.filter((c) => c.perturbation === cls);
  let tHits = 0;
  let lHits = 0;
  for (const c of subset) {
    if (classifyByTable(c.envelope).bucket === (c.trueBucket as Bucket)) tHits++;
    if (withLlm) {
      const r = await classifyByLlm(c.envelope);
      if (r.bucket === (c.trueBucket as Bucket)) lHits++;
    }
  }
  recall[cls] = {
    n: subset.length,
    table: subset.length ? ((tHits / subset.length) * 100).toFixed(1) + "%" : "-",
    llm: withLlm && subset.length ? ((lHits / subset.length) * 100).toFixed(1) + "%" : "not run",
  };
}
console.log("\nCLASSIFIER RECALL by perturbation class");
for (const [k, v] of Object.entries(recall)) {
  console.log(`  ${k.padEnd(14)} n=${String(v.n).padStart(4)}  table ${v.table.padStart(6)}  llm ${v.llm}`);
}

// ---- anti-circularity: does the conclusion survive wrong beliefs? --------
console.log("\nPERTURBATION SWEEP (agent's beliefs scaled; world untouched)");
const sweep: { scale: number; eNet: string; aNet: string; eWins: boolean }[] = [];
for (const scale of [0.3, 0.5, 1, 2, 3]) {
  const p: Params = { ...DEFAULTS, beliefScale: scale };
  const a = await runArm("A", cases, p);
  const e = await runArm("E", cases, p, llmClassifier);
  const eWins = new Decimal(e.netRupees).gt(a.netRupees);
  sweep.push({ scale, eNet: e.netRupees, aNet: a.netRupees, eWins });
  console.log(
    `  ${String(scale).padStart(4)}x   E net ${e.netRupees.padStart(9)}   A net ${a.netRupees.padStart(9)}   E>${eWins ? "A" : "A? NO"}`,
  );
}

// ---- adversarial: the world where restraint buys nothing ------------------
const advA = await runArm("A", cases, { ...DEFAULTS, zeroCosts: true });
const advE = await runArm("E", cases, { ...DEFAULTS, zeroCosts: true }, llmClassifier);
const advWinner = new Decimal(advE.netRupees).gt(advA.netRupees) ? "E" : "A";
console.log("\nADVERSARIAL ARM (agent told fatigue and issuer penalties are free)");
console.log(`  E net ${advE.netRupees}   A net ${advA.netRupees}   winner: ${advWinner}`);
if (advWinner === "A") {
  console.log("  -> naive wins when restraint is free. Reported, not hidden.");
}

const out = {
  meta: {
    n: N,
    seed: SEED,
    tier: "B",
    classifier: withLlm ? "llm" : "table",
    generatedAt: new Date().toISOString(),
  },
  arms: results,
  recallByPerturbation: recall,
  perturbationSweep: sweep,
  adversarial: { eNet: advE.netRupees, aNet: advA.netRupees, winner: advWinner },
};
mkdirSync("results", { recursive: true });
// generatedAt is excluded from the byte-reproducibility claim; everything else
// is a pure function of (n, seed).
writeFileSync("results/arms.json", JSON.stringify(out, null, 2) + "\n");
console.log("\nwrote results/arms.json");
