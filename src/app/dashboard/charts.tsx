"use client";

/**
 * Charts for the dashboard. Two rules from the spec drive the shape here:
 * net rupees and authorization attempts are different scales, so they are two
 * charts and never one dual-axis plot; and every value on screen is also in the
 * arms table below, so no number is gated behind a hover.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type Tone = "phoenix" | "baseline" | "muted" | "critical";

const FILL: Record<Tone, string> = {
  phoenix: "var(--color-series-1)",
  baseline: "var(--color-series-2)",
  // Chart chrome, so it tracks the theme rather than pinning a dark grey.
  muted: "var(--color-baseline)",
  // Reserved for a failing measurement, never for emphasis. Wherever it is
  // used, a written label says what failed — colour never carries it alone.
  critical: "var(--color-critical)",
};

export type BarRow = {
  key: string;
  label: string;
  value: number;
  display: string;
  tone: Tone;
  detail?: string;
};

/**
 * Horizontal bar list. One baseline at zero, ≤24px thick marks, 4px rounded
 * data-end, value at the tip. The mark is the hit target and carries the
 * breakdown on hover *and* keyboard focus.
 */
export function BarList({ rows, caption }: { rows: BarRow[]; caption: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <figure className="m-0">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="relative">
            <div
              tabIndex={r.detail ? 0 : -1}
              onPointerEnter={() => setActive(r.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(r.key)}
              onBlur={() => setActive(null)}
              className="grid grid-cols-[4.5rem_1fr] items-center gap-3 rounded-lg py-1"
            >
              <span className="truncate text-xs text-ink-3">{r.label}</span>
              <div className="flex items-center gap-2.5">
                <div className="h-2.5 flex-1 rounded-[3px] bg-surface-2">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${(r.value / max) * 100}%` }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: FILL[r.tone] }}
                    className="h-full rounded-l-[1px] rounded-r-[4px]"
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs tabular-nums text-ink-1">
                  {r.display}
                </span>
              </div>
            </div>

            <AnimatePresence>
              {active === r.key && r.detail && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                  role="status"
                  className="pointer-events-none absolute left-[4.5rem] top-full z-20 -mt-0.5 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-2 shadow-xl"
                >
                  {r.detail}
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3.5 text-xs leading-relaxed text-ink-3">{caption}</figcaption>
    </figure>
  );
}

export type SweepPoint = { scale: number; E: number; A: number; eWins: boolean };

/**
 * The perturbation sweep. Two series on ONE axis — both are net rupees, so a
 * single scale is honest. The shaded band is where the conclusion flips, which
 * is the whole reason this chart exists.
 */
export function SweepChart({ data }: { data: SweepPoint[] }) {
  const flip = data.filter((d) => !d.eWins).map((d) => d.scale);
  const lo = Math.min(...data.flatMap((d) => [d.E, d.A]));
  const hi = Math.max(...data.flatMap((d) => [d.E, d.A]));

  return (
    <figure className="m-0">
      {/* Legend is always present for two series — identity is never colour alone. */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-series-1" />
          Arm E · Phoenix
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full bg-series-2" />
          Arm A · Razorpay default
        </span>
        {flip.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-critical">
            <span aria-hidden className="size-2 rounded-sm bg-critical/35" />
            conclusion flips at ×{flip.join(", ×")}
          </span>
        )}
      </div>

      <div className="mt-4 h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--color-grid)" strokeWidth={1} vertical={false} />
            {flip.map((s) => (
              <ReferenceArea
                key={s}
                x1={s}
                x2={s}
                fill="var(--color-critical)"
                fillOpacity={0.14}
                strokeOpacity={0}
              />
            ))}
            <XAxis
              dataKey="scale"
              tickFormatter={(v: number) => `×${v}`}
              stroke="var(--color-baseline)"
              tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              domain={[lo - (hi - lo) * 0.4, hi + (hi - lo) * 0.25]}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              stroke="var(--color-baseline)"
              tick={{ fill: "var(--color-ink-3)", fontSize: 11 }}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-ink-3)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-xl">
                    <p className="text-ink-3">beliefs ×{String(label)}</p>
                    {payload.map((p) => (
                      <p key={String(p.name)} className="mt-1 flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-0.5 w-3 rounded-full"
                          style={{ background: p.color }}
                        />
                        <span className="font-medium tabular-nums text-ink-1">
                          ₹{Number(p.value).toLocaleString("en-IN")}
                        </span>
                        <span className="text-ink-3">arm {String(p.name)}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="A"
              stroke="var(--color-series-2)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface-1)" }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="E"
              stroke="var(--color-series-1)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface-1)" }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="mt-3 text-xs leading-relaxed text-ink-3">
        The agent&apos;s priors are scaled 0.3×–3× while the world model is left untouched — a check
        that the evaluation is not measuring itself. At ×0.3 the sign changes, and the sign is the
        claim. Exact values are in the table below.
      </figcaption>
    </figure>
  );
}
