"use client";

import { useEffect, useState } from "react";

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
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
        Audit trail — append-only, {count} records
      </h2>
      <p className="mt-2 text-xs text-neutral-500">
        Every stage&apos;s input and output. The module backing this exposes only{" "}
        <code>append</code> and <code>read</code> — no update, no delete, no truncate, so no code
        path can rewrite history. <code>tests/invariants.test.ts</code> asserts that export surface,
        which means adding a delete breaks the build.
      </p>
      <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-neutral-300 bg-white">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">
            Empty. Trigger a failure on the checkout page, or POST a webhook fixture.
          </p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                    {r.ts.slice(11, 19)}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.stage}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.window ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-neutral-500">
                    {r.idempotencyKey}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px]">
                    {JSON.stringify(r.output).slice(0, 90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
