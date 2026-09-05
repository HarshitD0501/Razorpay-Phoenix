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
import { LLM_MODEL, classifyByLlm, classifyByTable, geminiKey } from "../core/classify";
import { generate } from "../sim/generate";
import type { Bucket } from "../core/types";
import { DEFAULTS, runArm, type ArmId, type ArmResult, type Params } from "./arms";

const argOf = (k: string, dflt: number) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};

const N = argOf("n", 600);
const SEED = argOf("seed", 42);
const withLlm = process.argv.includes("--llm") && !!geminiKey();

const cases = generate(N, SEED);

/**
 * One LLM call per case, shared by arm D, arm E and the recall table. Those are
 * three consumers of the same answer, not three bills — and a sequential 3x600
 * run at Gemini's flash latency is hours, which is how an ablation quietly stops
 * being run at all. classifyByLlm never throws: it falls back to the table and
 * records why, so a failed call degrades exactly one case.
 */
const llmCache = new Map<string, Awaited<ReturnType<typeof classifyByLlm>>>();

/**
 * classifyByLlm turns a 429 into a per-case table fallback, so hammering a free-tier
 * quota does not fail loudly — it quietly produces an arm D that IS arm C with a
 * different label. A 600-case run at concurrency 8 fell back on 593/600 for exactly
 * that reason, and 60/min still lost ~55%.
 *
 * Rather than guess the undocumented free-tier ceiling, converge on it: sweep, then
 * re-sweep ONLY the cases a quota error stole, each pass at half the rate. A quota
 * miss is infrastructure, not model behaviour, so retrying it is not cherry-picking —
 * whereas keeping it would report the table's answer as the LLM's.
 * ponytail: fixed-rate cursor, no token bucket. Raise START_RPM with a paid key.
 */
const START_RPM = 60;
let gapMs = 60_000 / START_RPM;
let nextAt = 0;
async function slot() {
  const now = Date.now();
  const at = Math.max(now, nextAt);
  nextAt = at + gapMs;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** Why the LLM fell back, coarsely — a count with no cause is how a quota wall reads as a model finding. */
const fallbackCauses = new Map<string, number>();
function causeOf(why: string | undefined) {
  if (!why) return null;
  if (/quota|rate|429|exceeded/i.test(why)) return "quota/rate-limit";
  if (/not confident/i.test(why)) return "model not confident";
  if (/no GOOGLE|no key/i.test(why)) return "no key";
  return "other error";
}

const started = Date.now();
async function sweepBatch(batch: typeof cases, concurrency = 4) {
  const queue = [...batch];
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let c = queue.pop(); c; c = queue.pop()) {
        await slot();
        llmCache.set(c.envelope.paymentId, await classifyByLlm(c.envelope));
        if (++done % 25 === 0 || done === batch.length) {
          process.stderr.write(
            `  ${LLM_MODEL} ${done}/${batch.length} @${Math.round(60_000 / gapMs)}/min` +
              `  ${((Date.now() - started) / 60_000).toFixed(1)}m   \r`,
          );
        }
      }
    }),
  );
}

async function prefetchLlm() {
  let batch = cases;
  for (let pass = 1; pass <= 4 && batch.length; pass++) {
    await sweepBatch(batch);
    batch = batch.filter(
      (c) => causeOf(llmCache.get(c.envelope.paymentId)?.fellBackBecause) === "quota/rate-limit",
    );
    process.stderr.write(
      `\n  pass ${pass}: ${batch.length} of ${cases.length} still quota-blocked\n`,
    );
    gapMs *= 2;
  }
  // Tally causes once, after the last pass, so a retried case is counted by how it
  // finally landed rather than once per attempt.
  for (const c of cases) {
    const cause = causeOf(llmCache.get(c.envelope.paymentId)?.fellBackBecause);
    if (cause) fallbackCauses.set(cause, (fallbackCauses.get(cause) ?? 0) + 1);
  }
}
if (withLlm) await prefetchLlm();

/** Arm D's classifier. Without --llm it is the table, and the run says so. */
const llmClassifier = async (c: (typeof cases)[number]) => {
  if (!withLlm) {
    const r = classifyByTable(c.envelope);
    return { bucket: r.bucket, fellBack: true, llm: false };
  }
  const r = llmCache.get(c.envelope.paymentId) ?? (await classifyByLlm(c.envelope));
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
console.log(`classifier for arms D/E: ${withLlm ? `LLM (${LLM_MODEL})` : "table (no --llm / no key)"}\n`);
table(results);

// ---- classifier recall, split by perturbation class -----------------------
// Aggregate recall hides where a model earns its place, so it is never reported
// on its own.
const classes = ["clean", "context", "contradictory", "null_reason"] as const;
const recall: Record<string, { table: string; llm: string; llmFellBack: number; n: number }> = {};
for (const cls of classes) {
  const subset = cases.filter((c) => c.perturbation === cls);
  let tHits = 0;
  let lHits = 0;
  let lFell = 0;
  for (const c of subset) {
    if (classifyByTable(c.envelope).bucket === (c.trueBucket as Bucket)) tHits++;
    if (withLlm) {
      const r = llmCache.get(c.envelope.paymentId)!;
      if (r.bucket === (c.trueBucket as Bucket)) lHits++;
      // A fallback is the table's answer wearing the LLM's arm, so count it:
      // otherwise a broken key reads as "the LLM matched the table exactly".
      if (r.source === "table") lFell++;
    }
  }
  recall[cls] = {
    n: subset.length,
    table: subset.length ? ((tHits / subset.length) * 100).toFixed(1) + "%" : "-",
    llm: withLlm && subset.length ? ((lHits / subset.length) * 100).toFixed(1) + "%" : "not run",
    llmFellBack: lFell,
  };
}
console.log("\nCLASSIFIER RECALL by perturbation class");
for (const [k, v] of Object.entries(recall)) {
  const fell = withLlm ? `  (llm fell back on ${v.llmFellBack})` : "";
  console.log(
    `  ${k.padEnd(14)} n=${String(v.n).padStart(4)}  table ${v.table.padStart(6)}  llm ${v.llm}${fell}`,
  );
}
// A fallback COUNT with no CAUSE is how an infrastructure failure gets read as a
// model finding: a rate-limited run reports "llm recall == table recall" and looks
// like a tidy negative result. So name the cause, and if the run was mostly
// fallbacks, say outright that the ablation measured nothing.
if (withLlm) {
  const causes = [...fallbackCauses].sort((a, b) => b[1] - a[1]);
  const fellTotal = causes.reduce((s, [, v]) => s + v, 0);
  console.log(
    `  fallback causes: ${causes.map(([k, v]) => `${k} ${v}`).join(", ") || "none"}` +
      `  (${fellTotal}/${cases.length})`,
  );
  if (fellTotal > cases.length * 0.1) {
    console.log(
      `  !! ${((fellTotal / cases.length) * 100).toFixed(0)}% of cases fell back to the table.` +
        ` Arms D/E are NOT a clean LLM measurement in this run.`,
    );
  }
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
    classifier: withLlm ? LLM_MODEL : "table",
    generatedAt: new Date().toISOString(),
  },
  arms: results,
  recallByPerturbation: recall,
  llmFallbackCauses: Object.fromEntries(fallbackCauses),
  perturbationSweep: sweep,
  adversarial: { eNet: advE.netRupees, aNet: advA.netRupees, winner: advWinner },
};
mkdirSync("results", { recursive: true });
// generatedAt is excluded from the byte-reproducibility claim; everything else
// is a pure function of (n, seed) — for the table run. The --llm run goes to its
// own file: it costs an API key to reproduce and a model can drift under a pinned
// id, so it must not overwrite the one number anybody can regenerate offline.
const outFile = withLlm ? "results/arms-llm.json" : "results/arms.json";
writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote ${outFile}`);
