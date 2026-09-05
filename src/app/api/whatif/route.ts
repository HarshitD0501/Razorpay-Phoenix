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

export async function POST(req: Request) {
  const over = await readJson<Partial<Params>>(req);
  if (over instanceof Response) return over;
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
