"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

const code = "rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px]";

type Row = {
  ts: string;
  idempotencyKey: string;
  stage: string;
  caseId: string;
  window?: string;
  input: unknown;
  output: unknown;
};

export default function Ledger() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch("/api/ledger")
      .then((r) => r.json() as Promise<{ rows: Row[]; count: number }>)
      .then((j) => {
        setRows(j.rows);
        setCount(j.count);
      })
      .catch(() => setRows([]));
  }, []);

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
        Audit trail — append-only, {count} records
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">
        Every stage&apos;s input and output. The module backing this exposes only{" "}
        <code className={code}>append</code> and <code className={code}>read</code> — no update, no
        delete, no truncate, so no code path can rewrite history.{" "}
        <code className={code}>tests/invariants.test.ts</code> asserts that export surface, which
        means adding a delete breaks the build.
      </p>
      <div className="mt-3 max-h-96 overflow-auto rounded-2xl border border-line bg-surface-1">
        {rows.length === 0 ? (
          <p className="p-4 text-sm leading-relaxed text-ink-3">
            Empty. Trigger a failure on the checkout page, or POST a webhook fixture.
          </p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.3) }}
                  className="border-b border-line/60 align-top last:border-0"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-3">
                    {r.ts.slice(11, 19)}
                  </td>
                  <td className="px-3 py-2 font-medium text-ink-1">{r.stage}</td>
                  <td className="px-3 py-2 text-ink-3">{r.window ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-ink-3">
                    {r.idempotencyKey}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-ink-2">
                    {JSON.stringify(r.output).slice(0, 90)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
