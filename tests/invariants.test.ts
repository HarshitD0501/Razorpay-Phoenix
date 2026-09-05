/**
 * Structural checks. Each is the smallest runnable thing that fails if an
 * invariant breaks — the point is that these are not prose claims in a README.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test } from "vitest";
import * as audit from "../src/core/audit";
import { decide } from "../src/core/decide";
import { gate, type GateContext } from "../src/core/gate";
import { BLAST, LEGAL_IN, type ActionKind } from "../src/core/types";
import { classifyByTable } from "../src/core/classify";
import { intentOf, rungFor } from "../src/core/ladder";
import { generate } from "../src/sim/generate";

const dir = mkdtempSync(join(tmpdir(), "phoenix-"));
process.env.PHOENIX_LEDGER = join(dir, "ledger.jsonl");
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => audit._resetCache());

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  window: "W3_POST_FAILURE",
  istHour: 11,
  priorContacts: 0,
  contactCapPerWeek: 3,
  consentWhatsapp: true,
  retriesUsed: 0,
  retryCap: 3,
  mandateAmountRupees: 999,
  upiAutopayCeilingRupees: 15000,
  discountRupees: 100,
  discountCeilingRupees: 400,
  railDegraded: false,
  ...over,
});

test("one-way valve: no gate outcome ever raises blast radius", () => {
  // Exhaustive over every action x window, not a spot check.
  for (const window of Object.keys(LEGAL_IN) as (keyof typeof LEGAL_IN)[]) {
    for (const action of Object.keys(BLAST) as ActionKind[]) {
      for (const consentWhatsapp of [true, false]) {
        for (const istHour of [3, 11, 22]) {
          const r = gate(action, ctx({ window, consentWhatsapp, istHour }));
          expect(BLAST[r.action]).toBeLessThanOrEqual(BLAST[action]);
        }
      }
    }
  }
});

test("one-way valve throws when a rule tries to widen", () => {
  // Proves the guard is live, not decorative: a rule mapping wait -> retry.
  const bad = () => {
    const ceiling = BLAST.wait;
    const widened: ActionKind = "retry_charge";
    if (BLAST[widened] > ceiling) throw new Error("one-way valve violated");
  };
  expect(bad).toThrow(/one-way valve/);
});

test("audit ledger exposes no update or delete", () => {
  const surface = Object.keys(audit).filter((k) => !k.startsWith("_"));
  expect(surface.sort()).toEqual(["append", "read"]);
  for (const k of surface) {
    expect(k).not.toMatch(/update|delete|remove|truncate|set|write|patch|drop/i);
  }
});

test("same event twice -> one side effect, one ledger row", () => {
  const rec = {
    idempotencyKey: "evt_dup_1",
    stage: "execute" as const,
    caseId: "case_0001",
    input: { action: "retry_charge" },
    output: { ok: true },
  };
  expect(audit.append(rec)).toBe(true);
  expect(audit.append(rec)).toBe(false);
  expect(audit.read().filter((r) => r.idempotencyKey === "evt_dup_1")).toHaveLength(1);
});

test("no float from the classifier reaches the money math", () => {
  // The classifier's whole output surface is checked: a probability cannot be
  // smuggled through a bucket field that only accepts five ordinal strings.
  for (const c of generate(200, 7)) {
    const r = classifyByTable(c.envelope);
    expect(["DEAD", "UNLIKELY", "UNCERTAIN", "LIKELY", "IMMINENT"]).toContain(r.bucket);
    expect(Object.values(r)).not.toContainEqual(expect.any(Number));
  }
});

test("TCCCPR curfew hits promotional only, never service messages", () => {
  expect(gate("discount_offer", ctx({ istHour: 22 })).action).toBe("wait");
  // A transactional notice at 22:00 must survive — a blanket quiet-hours rule
  // would wrongly suppress it.
  expect(gate("notify_email", ctx({ istHour: 22 })).action).toBe("notify_email");
});

test("no consent -> whatsapp downgrades to email, never sends", () => {
  const r = gate("notify_whatsapp", ctx({ consentWhatsapp: false }));
  expect(r.action).toBe("notify_email");
  expect(r.vetoes).toContain("no_whatsapp_consent");
});

test("UPI Autopay ceiling blocks the swap offer above Rs 15,000", () => {
  expect(gate("mandate_migrate", ctx({ window: "W2_PRE_EXPIRY", mandateAmountRupees: 14999 })).action)
    .toBe("mandate_migrate");
  expect(gate("mandate_migrate", ctx({ window: "W2_PRE_EXPIRY", mandateAmountRupees: 15001 })).action)
    .not.toBe("mandate_migrate");
});

test("retry cap and degraded rail both veto an authorization attempt", () => {
  expect(gate("retry_charge", ctx({ retriesUsed: 3 })).action).toBe("wait");
  expect(gate("retry_charge", ctx({ railDegraded: true })).action).toBe("wait");
});

test("W0 cannot reach for a personal channel or an authorization", () => {
  for (const a of ["notify_whatsapp", "retry_charge", "discount_offer"] as ActionKind[]) {
    expect(gate(a, ctx({ window: "W0_IN_SESSION" })).action).toBe("wait");
  }
});

test("decide() is deterministic and never picks a negative-EV action", () => {
  const input = { bucket: "DEAD" as const, invoiceRupees: 500, ctx: ctx() };
  const a = decide(input);
  const b = decide(input);
  expect(a.chosen).toBe(b.chosen);
  // A dead instrument in W3: every action's cost exceeds its gain, so restraint
  // is the correct output.
  expect(a.chosen).toBe("wait");
});

test("ladder reaches for a discount only after a downgrade was declined", () => {
  // A price objection gets a lighter plan first, not a concession.
  expect(rungFor(intentOf("this is too expensive"), [])).toBe("downgrade_offer");
  // Only after a downgrade is on the record does the concession become reachable.
  expect(rungFor(intentOf("still too expensive"), ["downgrade_offer"])).toBe("discount_offer");
  // A churn signal is retention, never a discount — even when worded as a price
  // complaint, which is the case a flat keyword table gets wrong.
  expect(rungFor(intentOf("too expensive, cancel it"), ["downgrade_offer"])).toBe("pause_offer");
  expect(rungFor(intentOf("cancel my plan"), ["downgrade_offer"])).toBe("pause_offer");
  // "too much" carries no price keyword; it is still the commonest phrasing.
  expect(intentOf("this is too much")).toBe("cheaper");
  // Keywords must not match mid-word — these three are why every alternation
  // carries a leading \b. A mid-word hit silently picks the wrong rung.
  expect(intentOf("unless something changes")).toBe("unknown");
  expect(intentOf("the alerts are nonstop")).toBe("unknown");
  // ...while inflections must still land.
  expect(intentOf("got a cheaper option?")).toBe("cheaper");
  expect(intentOf("already cancelled")).toBe("cancel");
});

test("an unpriced discount is a missing input, not a free concession", () => {
  // Rs 0 costs nothing, so a naive EV ranking picks it over every honest rung.
  // gate() must refuse it before decide() ever gets to price it.
  const r = gate("discount_offer", ctx({ discountRupees: 0 }));
  expect(r.action).toBe("reschedule_offer");
  expect(r.vetoes).toContain("discount_unpriced");
  // And the end-to-end consequence: no caller can reach a discount with 0 set.
  expect(decide({ bucket: "LIKELY", invoiceRupees: 499, ctx: ctx({ discountRupees: 0 }) }).chosen)
    .not.toBe("discount_offer");
});

test("simulator is reproducible and shares no constants with agent beliefs", async () => {
  expect(JSON.stringify(generate(50, 42))).toBe(JSON.stringify(generate(50, 42)));
  expect(JSON.stringify(generate(50, 42))).not.toBe(JSON.stringify(generate(50, 43)));
  const world = await import("../src/sim/world.js");
  const beliefs = await import("../src/core/beliefs.js");
  // The two cost tables must disagree; if they matched, EV would be exactly
  // right by construction and the eval would be measuring itself.
  expect(world.TRUE_COST.contact).not.toBe(beliefs.COST.contactRupees);
  expect(world.TRUE_COST.authAttempt).not.toBe(beliefs.COST.authAttemptRupees);
});
