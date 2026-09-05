/**
 * What-If. The form posts merchant policy knobs; this re-runs the SAME batch
 * through the SAME arms as `npm run eval` and returns the diff.
 *
 * That identity is the point: the what-if numbers are not a separate fiction
 * with its own assumptions, they come out of the engine that produced the
 * headline numbers. Nothing here is a lookup table of pre-computed answers.
 */
import { NextResponse } from "next/server";
import Decimal from "decimal.js";
import { readJson } from "@/core/req";
import { DEFAULTS, runArm, type Params } from "@/eval/arms";
import { generate } from "@/sim/generate";

// 300 cases keeps a form submission under a second. `npm run eval` uses 600.
const cases = generate(300, 42);

/**
 * Plausible range per knob. The form is the only untrusted caller of runArm — the
 * eval CLI supplies its own params — and an out-of-range knob does not crash the
 * sim, which is the problem: `retryCap: "abc"` makes every cap comparison false and
 * `discountCeilingRupees: -5` prices a concession below zero, so the run returns
 * authoritative-looking rupee figures produced by nonsense. On a submission judged
 * for honest numbers, a dashboard that renders those is worse than one that 400s.
 */
const RANGE: Record<keyof Omit<Params, "zeroCosts">, [number, number]> = {
  graceDays: [0, 90],
  contactCapPerWeek: [0, 50],
  discountCeilingRupees: [0, 100_000],
  retryCap: [0, 10],
  upiAutopayCeilingRupees: [0, 1_000_000],
  istHour: [0, 23],
  beliefScale: [0.1, 10],
};

export async function POST(req: Request) {
  const over = await readJson<Partial<Params>>(req);
  if (over instanceof Response) return over;

  // Reject rather than silently clamp: a merchant who typed 1e9 should see that the
  // number was refused, not a plausible result they will quote later.
  const bad: string[] = [];
  for (const [k, [lo, hi]] of Object.entries(RANGE) as [keyof typeof RANGE, [number, number]][]) {
    const v = over[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      bad.push(`${k} must be a number in [${lo}, ${hi}]`);
    }
  }
  if (over.zeroCosts !== undefined && typeof over.zeroCosts !== "boolean") {
    bad.push("zeroCosts must be a boolean");
  }
  if (bad.length) return NextResponse.json({ error: bad.join("; ") }, { status: 400 });

  const params: Params = { ...DEFAULTS, ...over };

  const [base0, baseA, baseE, tuned] = await Promise.all([
    runArm("0", cases, DEFAULTS),
    runArm("A", cases, DEFAULTS),
    runArm("E", cases, DEFAULTS),
    runArm("E", cases, params),
  ]);

  const delta = new Decimal(tuned.netRupees).minus(baseE.netRupees);

  return NextResponse.json({
    tier: "B",
    params,
    n: cases.length,
    baseline: {
      doNothing: base0.netRupees,
      razorpayDefault: baseA.netRupees,
      phoenixDefaults: baseE.netRupees,
    },
    tuned: {
      net: tuned.netRupees,
      recovered: tuned.recoveredCount,
      authAttempts: tuned.authAttempts,
      contacts: tuned.customerContacts,
      wastedNotifications: tuned.wastedNotifications,
      vetoesByRule: tuned.vetoesByRule,
    },
    deltaVsPhoenixDefaults: delta.toFixed(0),
    // Blunt, because a what-if that only ever reports upside is a sales tool.
    verdict: delta.gt(0)
      ? `+₹${delta.toFixed(0)} over ${cases.length} cases`
      : delta.eq(0)
        ? "no change"
        : `₹${delta.abs().toFixed(0)} WORSE than Phoenix defaults`,
  });
}
