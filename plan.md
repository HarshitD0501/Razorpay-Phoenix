# Razorpay Phoenix — Build Plan

**Track 03 (AI Revenue Recovery)** · deadline today · clock at authoring: **13:45 IST, 5 Sept 2026** → ~9.5h

---

## 0. Status — steps 0–6 and 8 shipped

| # | Step | State | Evidence |
|---|---|---|---|
| 0 | Config: `package.json`, `tsconfig`, postcss, `.gitignore` (before any key), `.env.example` | **done** | `npx tsc --noEmit` clean |
| 1 | Simulator, `decide()` core, gate, append-only audit, eval harness | **done** | `src/core/`, `src/sim/`, `npm test` 13/13 |
| 2 | Arms 0–E, per-perturbation ablation, 0.3×–3× sweep, adversarial arm | **done** | `npm run eval` → `results/arms.json` |
| 3 | Tier A adapters + probes + poller + webhook HMAC + replay check | **written, unrun** | needs `rzp_test_` keys in `.env` |
| 4 | WhatsApp outbound (Twilio) | **written, unrun** | needs `TWILIO_*` + `join <code>` from the demo phone |
| 5 | W0 rescue surface + live downtime join | **done** | `/` → pick a failure → rescue card |
| 6 | Dashboard: arms table, ablation, sweep, What-If, audit viewer | **done** | `/dashboard` |
| 7 | WhatsApp inbound two-way agent | **done locally**, tunnel not attempted | `POST /api/whatsapp` → TwiML; 3-turn ladder verified over HTTP |
| 8 | README with per-number tier labels + honest limits | **done** | `README.md` |

`npx next build` compiles all 10 routes. Steps 3/4/7 are the only ones gated on
credentials I do not hold — the code paths exist and typecheck, and each one refuses
loudly rather than silently faking a result when its env vars are absent.

### What the numbers came out as

Arm E beats Razorpay's documented default by **₹11,931 (~1.0%)** on net value while
making **106 authorization attempts against A's 967 — an 89% reduction** at equal
recovery count (458 vs 457). The honest headline is the cost side, not the revenue side.

Two checks Phoenix **loses**, both reported in the README rather than dropped:
- the perturbation sweep **flips to arm A at ×0.3 belief scale** (thin margin, ₹1,368, but the sign changes)
- the **adversarial arm goes to naive** — zero out fatigue and issuer penalties and brute-force retrying is correct

The most useful ablation row: the lookup table is **0.0%** on contradictory payloads
(stale reason code, truthful `source`/`step`). Not weak — confidently wrong on every
case. That is the narrow, specific place the LLM classifier earns its bill.

### Deviations from this plan, and why

| Planned | Shipped | Reason |
|---|---|---|
| Prisma + SQLite, 8 tables | **append-only JSONL** (`src/core/audit.ts`) | Prisma CLI 7.10.0 installed with a broken `execa` tree. Nothing here needs SQL: one process, no concurrent writers, and a file in append mode makes "append-only" structural instead of a convention. Two deps and a generate step deleted. |
| SSE for the rescue push | **plain POST** | Every message in the rescue flow is client-initiated. There is no server push to carry, so SSE was transport for its own sake. Noted in the route. |
| `IdempotencyStore` interface | one module, two functions | No interface with one implementation. `append()` returning `false` on a repeat key *is* the guarantee. |
| Separate ablation/perturbation scripts | one runner | `run-arms.ts` prints all four sections; three fewer entry points to keep in sync. |

### Bugs my own checks caught (kept here because they are the argument for the checks)

1. **The "contradictory" perturbation was measuring nothing.** It corrupted only
   `description`, which the lookup table never reads — so the table scored **100.0%** on
   the exact class meant to break it. Rewrote it so the *reason code* comes from a wrong
   band while `source`/`step` stay truthful. Table recall fell to **0.0%**, and the sweep
   and adversarial arm started producing honest losses. The flattering number was the bug.
2. **The ladder handed out a discount on a churn signal.** "too expensive, cancel it"
   returned ₹100 off, contradicting the documented discount-last ordering. Two causes:
   `cheaper` was tested before `cancel` in `intentOf`, and `cheaper` mapped straight to
   `discount_offer` with nothing in between. Fixed by reordering, mapping `cheaper` →
   `downgrade_offer`, and gating `discount_offer` behind a prior `downgrade_offer` in that
   customer's ledger. Extracted to `src/core/ladder.ts` so it is unit-testable rather than
   reachable only through an HTTP handler; test 13 asserts all four paths.
3. **Rescue copy claimed a decline that never happened.** A `source: "bank"` timeout
   rendered as "SBIN declined this attempt". A timeout is not a decline, and overstating it
   is the same sloppiness this repo argues against. Now: "SBIN didn't respond in time —
   payment timed out. That's their side, not your card."

---

## 1. Why this exists

20–30% of subscription revenue dies to payment failures. Razorpay's own default is four
attempts — T, T+1, T+2, T+3 — then `halted` and a card-update email. Static dunning gets ignored.

I surveyed the competing public entries (`payrecover-ai`, `RecoverPay`, `PayRevive`,
`Razorrecover-ai`, `RecoveryLoop-AI`, `razorpay-revenue-recovery`). All six are the same pipeline:
webhook → LLM diagnosis → rules gate → payment link → dashboard. **None reports a baseline arm.**
Two report 100% accuracy / F1 1.00 from the same synthetic generator that made their training data —
circular, and a judge will see it. Only `ramkirangaruda/Razorpay` ("Backstop") does this properly,
and it openly states it *loses* to naive on raw recovered value.

Razorpay's stated bar: *"Don't just identify the problem"* — money recovered over a batch,
compliant escalation, stopping rules, audit trail. Track 04 adds *"One cherry-picked match proves
nothing."* **So the headroom is measurement discipline, not module count.**

### Thesis

> The cheapest recovery is the one that never becomes a failure.

Every competitor — and Razorpay's default — acts *after* the failure. Phoenix moves the
intervention **left** along the timeline:

| Window | When | Action |
|---|---|---|
| **W0** in-session | t ≈ 0s | live downtime → consented method switch, no page reload |
| **W1** pre-debit | t − 24h | merchant-side pre-flight before the debit burns 1 of only 4 attempts |
| **W2** pre-expiry | t − 7d | card mandate → UPI Autopay migration |
| **W3** post-failure | t + 1..3d | the ladder everyone builds — here it is the **last** resort |

Falsifiable, and it has a real cost: W1/W2 fire on *predicted* failure, so they spend customer
attention on accounts that would have paid anyway. **That wasted-notification rate is measured and
reported in the README**, not hidden.

## 2. Evidence tiers — every number carries its label

The single most important credibility decision. A reader never guesses what is real.

| Tier | Meaning | Covers |
|---|---|---|
| **A — LIVE** | Real API, real network, response committed as a fixture | Razorpay test-mode execution, webhook HMAC verify, idempotency probe, one `active→pending→halted` walk, **WhatsApp outbound via Twilio** |
| **B — SIM** | Deterministic seeded simulator, `seed 42`, reproducible | Baseline arms, EV pricing, LLM ablation, perturbation, What-If |
| **C — STUB** | Built but not wired to a real provider; **named as such** | Bank TPS model (Razorpay downtime feed is real; a TPS predictor is not), WhatsApp inbound if the tunnel fails |

Tier B is not a fallback. Arms need N in the hundreds — nobody hand-clicks a dashboard 400 times.
It is the correct instrument for a measured claim.

### Verified environment facts

Checked, not assumed:

- `node v22.22.3`, `npm 11.11.0`, `git 2.54.0`. **No** `gh`, `vercel`, `cloudflared`, `ngrok`, `lt`.
- Installed and usable: `next@15.5.25`, `react@19.2.8`, `ai@7.0.93` (`generateObject` export
  confirmed present), `@ai-sdk/anthropic@4.0.49`, `zod@4.5.4`, `decimal.js@10.6.0`, `recharts`,
  `lucide-react`, `tailwindcss@4.3.3`, `tsx`, `vitest@4.1.11`.
- **TLS interception on this machine**: `graph.facebook.com` is re-signed by a Sophos CA → Node
  `fetch` dies with `SELF_SIGNED_CERT_IN_CHAIN`; `--use-system-ca` does not fix it.
  `api.twilio.com` (DigiCert) and `api.razorpay.com` (RapidSSL) both return a clean `401`.
  **This is why WhatsApp goes through Twilio, not Meta Cloud API.** Environment constraint, not a
  judgement about Meta — the README will say exactly that.
- **Prisma version mismatch**: CLI `8.0.0-rc.13` vs client `7.10.0`. Pin CLI to `7.10.0` in step 0
  or `generate` fights an rc.
- `vitest`, `dotenv`, `ws` exist on disk but are **transitive-only** — must be declared.
- `package.json` is still a bare `commonjs` stub: `main: index.js`, no Next scripts.
- `node:sqlite` is available (experimental) — but Prisma + SQLite file is the plan; no extra dep.

### Stack deviations from the original brief

Each one buys time and loses nothing:

| Brief | Plan | Why |
|---|---|---|
| WebSockets (`ws`) | **SSE** via `ReadableStream` route handler | Rescue is server→client push only; consent returns as a normal POST. Native `EventSource`, no custom server, works in App Router. |
| Redis / Upstash idempotency | **`IdempotencyStore` interface**, SQLite-backed | Single process. Redis is infra for a claim the demo makes in-process. Interface keeps the swap to one file. |
| PostgreSQL / Supabase | **SQLite** via Prisma | Zero provisioning, committable, deterministic. |
| LangChain | **AI SDK `generateObject` + zod** | Already installed. LLM only classifies and words things. |
| Framer Motion | **CSS transitions** | Not installed. The modal is one slide-in. |
| Meta WhatsApp Cloud API | **Twilio WhatsApp sandbox** | TLS interception (above) + skips Business verification and template approval, neither of which completes today. |

`razorpay` npm SDK deliberately **not** added — the live adapter is ~20 lines of `fetch`, and fewer
deps is fewer failure modes.

## 3. The spine

One decision path. Five stages. **Each stage may only narrow what the previous one proposed.**

```
ingest(event)              verify HMAC → dedupe → persist        [tier A]
  └─ classify(payload)     L1: reason + bucket + rationale       [LLM — only here]
      └─ price(candidates) L2: EV per action, Decimal            [deterministic]
          └─ gate(action)  L3: compliance veto / downgrade       [pure functions]
              └─ execute() L4: idempotent, adapter-dispatched
                  └─ audit() append-only, every stage in and out
```

Three invariants, each with a test that fails if it breaks:

1. **One-way valve.** Every action carries an integer blast radius (`RETRY_NOW` 5 … `STOP` 0).
   `gate()` may lower or veto; **never raise**. A raise `throw`s in production, not just tests.
   (Shape credited to Backstop in the README — it is right, and pretending otherwise is worse.)
2. **No model float touches money.** `classify()` returns one of five *ordinal buckets*, never a
   probability. `ScoreContext` rejects a float at the type boundary. Every rupee is `decimal.js`.
3. **Audit is append-only.** `AuditLog` exposes no update or delete. A test reflects over the class
   method names and fails if one appears.

### `decide()` is shared by all five modules

W0–W3 differ only in *which window fires* and *which actions are legal there*. That single fact is
why five modules fit in the remaining hours instead of five codebases.

### Failure taxonomy — real Razorpay strings, not invented ones

Verified against Razorpay's card error reference. The exact values (a competitor guessing these
gets them wrong): `payment_timed_out`, `gateway_technical_error`, `payment_cancelled`,
`card_declined`, `insufficient_funds`, `card_not_enrolled`, `bank_technical_error`,
`card_disabled_for_online_payments`, `authentication_failed`, `payment_risk_check_failed`,
`payment_failed`, `incorrect_cvv`, `debit_instrument_inactive`, `debit_instrument_blocked`,
`card_expired`, `transaction_limit_exceeded`.

Note there is **no** `incorrect_otp` (OTP errors land in `authentication_failed`) and it is
`card_expired`, not `expired_card`. `source` ∈ {`customer`, `business`, `internal`, `gateway`,
`issuer_bank`} and `step` ∈ {`payment_initiation`, `card_enrollment_check`,
`payment_authentication`, `payment_authorization`, `payment_capture`} for cards; UPI has its own
larger set including `mandate_creation`.

**The classifier's real job** is the hard slice: `reason` is `null` but `source` and `step` are
intact. Reading `source × step` to infer cause is what the LLM buys over a lookup table, and the
ablation measures exactly that.

## 4. Module detail

### W0 — In-flight Rescue *(flagship)*

Checkout holds an SSE connection. On `rzp.on('payment.failed')` the client POSTs the error envelope;
the server joins it against live `GET /v1/payments/downtimes` and pushes back a card naming the
**actual** degraded instrument (`instrument.bank`, `psp`, `vpa_handle`, `severity`).

Consent is a **separate POST**. The server never charges another rail on its own — that is the RBI
consent guarantee, enforced structurally: the execute path has no code branch that fires without a
consent row.

Framed as a *customer-facing consented switch*, explicitly **not** backend rail-switching — that is
Razorpay Optimizer's job, and duplicating it would read as not knowing the product.

### W1 — Pre-debit pre-flight

**Precision matters here.** Under the RBI E-mandate Framework 2026 the **issuer** sends the 24h
pre-debit notification. A merchant cannot claim to send it. Phoenix runs a *merchant-side pre-flight*
in that same T−24h window: mandate expiry, instrument validity, this customer's failure history →
act before the debit burns one of four attempts. The README states this distinction outright;
claiming to send the RBI notice would be a factual error a payments judge catches instantly.

### W2 — Mandate Migrator

Card mandate expiring ≤7d → offer UPI Autopay swap. The **₹15,000 no-AFA ceiling** (₹1L for select
MCCs) is a *gate input*, so the offer is only made where the mandate amount actually clears it.

### W3 — Retention ladder → **live WhatsApp**

Rungs in order, discount **last** and LTV/CAC-bounded: **pause → downgrade → payday reschedule →
capped discount**.

- **Outbound — tier A, no blockers.**
  `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`, Basic auth, form-encoded
  `From=whatsapp:+14155238886`, `To=whatsapp:+91…`, `Body=…`. Plain `fetch`. No SDK, no public URL.
  Real message, real phone, real Razorpay test payment link.
- **Inbound (two-way agent) — needs a public URL.** `npx localtunnel --port 3000` (no global
  install). **Sequenced last** — it is the only step whose external dependency can simply refuse.
  Outbound ships first so a tunnel failure costs the conversation, not the WhatsApp claim.

Agent turn: inbound → intent classified by the same L1 → rung chosen by `decide()` → gate applies
the TCCCPR intent-curfew and discount cap → reply. **The LLM picks wording; the rung and every
rupee come from the deterministic core.** Blind discounts are structurally impossible — the ceiling
is a gate input, not a prompt instruction.

Two things that came out better than expected:

- The sandbox opt-in is a literal `join <code>` message **the customer sends first** — a real
  consent artifact, better evidence for consent-first than any simulated opt-in.
- **TCCCPR nuance:** the 09:00–21:00 IST restriction applies to *promotional* communication;
  transactional/service messages are not time-barred. So the gate classifies message **intent** and
  curfews only discount-bearing messages. A blanket quiet-hours rule — what a careless build ships —
  would wrongly suppress legitimate service notices.

### Merchant Copilot + What-If

The What-If simulator **is** the batch runner behind a params form: change grace days / contact cap /
discount ceiling / retry cap → re-run the seeded batch → diff the net. Nearly free, and the what-if
numbers come from the same engine as the headline numbers rather than a separate fiction.

## 5. Ingest — poller-primary, webhook-secondary

Inbound webhooks need a public URL. **The demo must not hinge on a tunnel.** So the primary ingest is
a reconciliation **poller** over the Payments/Subscriptions APIs, with the webhook route present and
feeding the *identical* dedup path.

This is not a workaround, it is what the docs ask for. Razorpay's downtime docs tell you to poll "if
you have not received any webhook notifications due to technical issues", and their payments-webhook
page warns a `payment.failed` may be *followed* by a capture for the same transaction and that "The
webhook sequence is not fixed". **A correct consumer must therefore be idempotent and
order-independent regardless.** Building the poller first makes that structural instead of
aspirational.

**Raw-body detail, get it right once:** verification is HMAC-SHA256 over the **unmodified** body
against the `X-Razorpay-Signature` header. In App Router: `await request.text()` *before* any parse,
and compare with `crypto.timingSafeEqual`. Razorpay's own Node sample re-stringifies an
already-parsed body — a real footgun that silently breaks on key ordering.

## 6. Evaluation — the part that actually scores

**Nested arms**, each differing from the previous by exactly one component, so every delta is
attributable:

| Arm | What | Isolates |
|---|---|---|
| **0** | Do nothing | the zero line — most of a realistic batch is unrecoverable, so absolute figures are dominated by losses no policy avoids |
| **A** | **Razorpay's documented default** — T+1/T+2/T+3 → `halted` + card email | a real baseline, not a strawman |
| **B** | Rules only | — |
| **C** | + EV pricing, table classifier | the EV layer |
| **D** | + LLM classifier | **the LLM alone** |
| **E** | + left-shift W0–W2 | **the thesis** |

Reported per arm: net value vs arm 0, recovered count, **authorization attempts**, **customer
contacts**, veto counts by rule, **under-proposal rate** (quit on something ground truth says was
live), and **wasted notifications** (W1/W2 fired on an account that would have paid anyway).

The cost columns are not decoration. Recovery rate alone is gameable by retrying forever — attempts
and contacts are what make the headline number mean anything.

### Three checks the crowd skips

1. **LLM ablation, per-perturbation.** Recall split by payload type — clean / context-dependent /
   contradictory / `null`-reason-with-`source`+`step` — never one aggregate. Aggregate hides where
   the model earns its keep. Fall back to the table below a confidence threshold.
2. **Anti-circularity.** The simulator's world model must not share constants *or functional form*
   with the agent's beliefs, or the eval measures itself. Ship a perturbation run feeding the agent
   deliberately wrong parameters (0.3×–3×). If conclusions survive, say so. **If they don't, report
   that instead** — that is the honest result and it scores better than a hidden one.
3. **Adversarial arm.** Zero out fatigue and issuer-penalty costs — the world where restraint buys
   nothing. If naive wins there, that goes in the README.

### Structural tests, not prose claims

- `AuditLog` exposes no update/delete → reflect over method names.
- `gate()` throws on blast-radius escalation.
- Same webhook fixture twice → **one** side effect, one audit chain.
- Consent-gated execute: no consent row → no charge path reachable.

### The live idempotency probe (tier A)

Call `orders.create` twice with an identical `receipt`; call `payment_links.create` twice with an
identical `reference_id`. Report what each **actually** does. Prior art suggests `receipt` does *not*
dedupe while `reference_id` does — **I verify rather than assume**, and whichever way it lands, the
finding plus the captured request/response pair goes in the README.

Razorpay's documented `Idempotency-Key`-style headers are scoped to **Payouts/Transfers, not
Orders** — so app-level dedup is doing the real work here. Stating that gap explicitly is worth more
than claiming an idempotency guarantee the API does not give.

## 7. Build order

Step 0 is not optional — `package.json` is a bare stub today.

| # | Step | Gate to pass |
|---|---|---|
| **0** | ✅ `package.json` (type/scripts, declare `vitest`+`dotenv`), `tsconfig.json`, Tailwind v4 postcss, `.gitignore` with `.env*` **before any key is pasted**, `.env.example` | `npm run typecheck` runs |
| **1** | ✅ Seeded simulator, `decide()` core, append-only audit, **eval harness** (~~Prisma schema~~ → JSONL) | arms runnable before any UI exists |
| **2** | ✅ Arms 0–E + ablation + perturbation + adversarial → committed results file | `npm run eval` reproduces byte-for-byte |
| **3** | ⏳ Tier A: key wiring, poller, HMAC verify, idempotency probe, one `Charge as Failure` walk → fixtures | needs `rzp_test_` keys |
| **4** | ⏳ **WhatsApp outbound live** (Twilio `join` opt-in → real message + real payment link) | needs `TWILIO_*` + demo phone |
| **5** | ✅ Rescue surface (~~SSE~~ → POST) + live downtime join | card names the real degraded instrument |
| **6** | ✅ Dashboard: arms table, ablation, sweep, What-If form, audit viewer | — |
| **7** | ⏳ **WhatsApp inbound** two-way agent via `npx localtunnel` — route written, tunnel not attempted | — |
| **8** | ✅ README with per-number tier labels, honest limits | — |

**Triage rule:** if the clock runs out it runs out at 6/7 — **never before 2**, because steps 1–2
*are* the submission. Step 4 deliberately precedes step 5: a real message on a real phone is worth
more in a 5-minute video than one more polished screen, and costs less to build.

## 8. Verification

- `npm run typecheck` and `npm test` clean.
- `npm run eval -- --seed 42` reproduces the committed results file byte-for-byte.
- Same webhook fixture POSTed twice → one recovery session, one audit chain, one side effect.
- Rescue: open checkout → force a failure → the card names the degraded instrument from the **real**
  downtime response → **no charge occurs until consent POSTs**.
- WhatsApp: `join <code>` from a real phone → agent replies → tap the link → real Razorpay test
  checkout opens.
- Tier-A fixtures readable offline, so a judge without keys still sees the live evidence.

## 9. Honest limits — drafted now, before the numbers exist

Written first so it cannot be tuned to flatter results:

- Synthetic ground truth is exact **by construction**; real labels are noisier.
- Test-mode failures are **operator-chosen** via the dashboard, not naturally occurring.
- Bank health is Razorpay's **downtime feed**, not a TPS prediction model. The brief said TPS; the
  feed is what actually exists.
- **WhatsApp runs on the Twilio sandbox** — recipients must `join <code>`, and the session window is
  time-limited. Production needs an approved sender and Meta-approved templates.
- Meta Cloud API was the **first choice**, abandoned because this machine's TLS interception breaks
  the Graph handshake. Environment limitation, not a Meta limitation — the README says so rather
  than implying Twilio is technically superior.
- Left-shift **spends notifications on accounts that would have paid anyway**; that rate is reported.
- **If arm E does not beat arm A on net value, the README says so in the summary — not a footnote.**

## 10. Sources

Bar/tracks: [razorpay.com/buildathon](https://razorpay.com/buildathon) ·
deadline: [LeetCode](https://leetcode.com/discuss/post/8474425/razorpay-buildathon-2026-internship-oppo-ee1p/),
[Backstop](https://github.com/ramkirangaruda/Razorpay).
Retries: [Payment Retries](https://razorpay.com/docs/payments/subscriptions/payment-retries/) ·
[Test Subscriptions](https://razorpay.com/docs/payments/subscriptions/test).
Downtime: [API](https://razorpay.com/docs/api/payments/downtime/) ·
[entity](https://razorpay.com/docs/api/payments/downtime/entity/).
Errors: [cards](https://razorpay.com/docs/errors/payments/cards) ·
[source/step](https://razorpay.com/docs/errors/payments/payment-methods-error-parameters/).
Webhooks: [events](https://razorpay.com/docs/webhooks/payments/) ·
[validation](https://razorpay.com/docs/webhooks/validate-test/).
Keys: [API Keys](https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/).
Compliance: [RBI E-mandate 2026 (KPMG)](https://kpmg.com/in/en/insights/2026/06/reserve-bank-of-india-rbi-digital-payments-e-mandate-framework-2026.html) ·
[TCCCPR](http://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf).
Reviewed: [payrecover-ai](https://github.com/IMRIKRUPA/payrecover-ai),
[RecoverPay](https://github.com/divyanshnigam14/RecoverPay),
[PayRevive](https://github.com/adityahere26/PayRevive),
[Razorrecover-ai](https://github.com/heyyaman64/Razorrecover-ai),
[RecoveryLoop-AI](https://github.com/mahimasisodiya049-blip/RecoveryLoop-AI),
[razorpay-revenue-recovery](https://github.com/VachepalliDevishReddy/razorpay-revenue-recovery).



