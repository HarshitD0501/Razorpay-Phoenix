/**
 * Append-only audit ledger.
 *
 * Structurally append-only, not append-only by convention: this module exports
 * `append` and `read` and nothing else. There is no update, no delete, no
 * upsert, no truncate — so there is no code path that can rewrite history.
 * tests/invariants.test.ts asserts the export surface, so adding one fails CI.
 *
 * Also the idempotency store: `append` returns false if the key already exists.
 * The plan called for Redis; a single process with no network needs a file.
 * ponytail: O(n) key scan over the loaded ledger. Swap in a Set-backed index
 * or Redis if the ledger ever outgrows memory.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type AuditRecord = {
  ts: string;
  /** Dedup key. Same key twice = one side effect, second call is a no-op. */
  idempotencyKey: string;
  stage: "ingest" | "classify" | "price" | "gate" | "execute";
  caseId: string;
  window?: string;
  /** Full stage input and output. An auditor should never need the code. */
  input: unknown;
  output: unknown;
};

const path = () => process.env.PHOENIX_LEDGER ?? "./data/ledger.jsonl";

/** Returns false if `idempotencyKey` was already written — the dedup guarantee. */
export function append(rec: Omit<AuditRecord, "ts">): boolean {
  const p = path();
  if (seen(p).has(rec.idempotencyKey)) return false;
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n");
  cache.get(p)?.add(rec.idempotencyKey);
  return true;
}

export function read(file = path()): AuditRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AuditRecord);
}

const cache = new Map<string, Set<string>>();
function seen(file: string): Set<string> {
  let s = cache.get(file);
  if (!s) {
    s = new Set(read(file).map((r) => r.idempotencyKey));
    cache.set(file, s);
  }
  return s;
}

/** Test-only: forget the in-memory dedup index. Does not touch the file. */
export function _resetCache() {
  cache.clear();
}
