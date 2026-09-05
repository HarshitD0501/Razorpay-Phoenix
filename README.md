# Razorpay Phoenix

**Left-shifted revenue recovery.** Every recovery system — including Razorpay's own
default — acts *after* the payment fails. Phoenix's claim is that the cheapest
recovery is the one that never becomes a failure, so it optimises *when* to
intervene, not just *what* to send.

| Window | Time | Action | Blast radius |
|---|---|---|---|
| **W0** in-session | t ≈ 0s | rescue card — live downtime → consented method switch | 1 |
| **W1** pre-debit | t − 24h | merchant-side pre-flight before the debit burns a retry | 2 |
| **W2** pre-expiry | t − 7d | mandate migrator, card → UPI Autopay | 3 |
| **W3** post-failure | t + 1..3d | the dunning ladder everyone builds — here it is the *last* resort | 3–5 |

The blast-radius column is the structural argument: acting earlier does not just
recover more, it *reaches for less*. W0 renders a card in a session the customer
is already in. W3 sends messages and burns authorization attempts.

Left-shift also has an obvious cost, and it is measured rather than hidden: W1/W2
fire on *predicted* failure, so they spend customer attention on accounts that
would have paid anyway. That wasted-notification count is a column in the results
table below.

---

## Run it

```bash
npm install
npm run eval        # the numbers below, ~2s, no keys, no network, no database
npm test            # 12 structural invariant checks
npm run dev         # http://localhost:3000 checkout · /dashboard
```

No database to provision, no Redis, no API keys required. `npm run eval` is a pure
function of `(n, seed)`.

---

## The numbers

**Tier B** — deterministic simulation, n=600, seed 42, table classifier.
Reproduce: `npm run eval`.

Arms are **nested**: each row adds exactly one component to the row above, so
every delta is attributable to that component and nothing else. Arm A is
Razorpay's *documented* default behaviour (T+1/T+2/T+3, then `halted` plus a
card-update e-mail) — a real baseline, not a strawman.

| arm | policy | recovered | net ₹ | vs arm 0 | auth attempts | contacts | wasted | under-proposals |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| 0 | do nothing | 57 | 145,070 | — | 0 | 0 | 0 | 0 |
| A | **Razorpay default** T+1/2/3 → halted | 457 | 1,178,977 | +1,033,907 | 967 | 145 | 1 | 5 |
| B | + rules and gate, no EV | 435 | 1,073,244 | +928,174 | 0 | 1,007 | 57 | 0 |
| C | + EV pricing (table classifier) | 428 | 1,104,119 | +959,049 | 145 | 954 | 57 | 3 |
| D | + LLM classifier | 428 | 1,104,119 | +959,049 | 145 | 954 | 57 | 3 |
| E | **+ left-shift W0–W2** | 458 | 1,190,908 | +1,045,838 | 106 | 822 | 52 | 3 |

### What this actually says

**The headline is small and the cost side is large.** Arm E beats Razorpay's
documented default by **₹11,931 — about 1.0%** on net value. On its own that is
noise. What is not noise: E does it with **106 authorization attempts against A's
967, an 89% reduction**, at the same recovery count (458 vs 457).

That matters because recovery rate alone is gameable — you can win it by retrying
forever. Arm A does exactly that, and pays for it in issuer-visible declines. The
cost columns are what make the net column mean anything, which is why they are in
the table rather than in an appendix.

**Arm D equals arm C** because the LLM classifier never got to answer. Gemini's free
tier refused 590 of 600 calls on quota (10 more failed for other reasons), and
`classifyByLlm` falls back to the lookup table per failed call — so arm D is arm C
with a different label, and the run says so instead of reporting one number twice.
`results/arms-llm.json` carries the per-cause tally that proves it. See honest limit
5; `npm run eval -- --llm` on a paid key separates them.

**Arm B recovers less than arm A** and makes zero authorization attempts. Rules
plus a gate, with no EV pricing, is too conservative: it never retries, so it
loses the transient-infrastructure cases that a retry would have won.

### Classifier recall, split by perturbation class

Never reported as one aggregate — an average hides exactly where a model earns its
place.

| payload class | n | table classifier | LLM |
|---|--:|--:|--:|
| clean | 297 | 100.0% | quota-blocked |
| context-dependent (signal only in prose) | 101 | 50.5% | quota-blocked |
| contradictory (stale reason code, truthful source/step) | 103 | **0.0%** | quota-blocked |
| null reason, source+step intact | 99 | 59.6% | quota-blocked |

The LLM column is empty for a stated reason rather than left ambiguous: the free-tier
quota refused 590 of 600 calls, so every case fell back to the table and an "LLM" row
would have been the table's row twice. Honest limit 5 has the detail.

Clean cases are 100% **by construction** — the table maps reason codes and clean
cases carry a truthful reason code. The other three rows are the honest test, and
the contradictory row is the finding: a reason-first lookup table is not merely
weak there, it is **confidently wrong on every case**. That is the specific,
narrow place an LLM classifier is worth its latency and its bill, and it is why
arms C and D differ by exactly one component.

### Two robustness checks that Phoenix loses

**Perturbation sweep** — the agent's priors are scaled while the world model is
left untouched, to check the evaluation is not measuring itself:

| agent beliefs | E net ₹ | A net ₹ | winner |
|---|--:|--:|:--|
| ×0.3 | 1,177,609 | 1,178,977 | **A** |
| ×0.5 | 1,184,316 | 1,178,977 | E |
| ×1.0 | 1,190,908 | 1,178,977 | E |
| ×2.0 | 1,216,566 | 1,178,977 | E |
| ×3.0 | 1,230,984 | 1,178,977 | E |

At ×0.3 the conclusion **flips**: an agent that badly under-estimates its own
success rates becomes so restrained that Razorpay's brute-force default beats it.
The margin is thin (₹1,368, 0.1%) but the sign changes, and the sign is the claim.

**Adversarial arm** — fatigue and issuer-penalty costs zeroed, i.e. the world where
restraint buys nothing:

```
E net 1,170,748   A net 1,178,977   winner: A
```

**Naive wins.** If customer attention is free and issuers never penalise declines,
retry-until-it-works is the correct policy and Phoenix is overhead. Phoenix's
entire advantage rests on those two costs being real. That is a load-bearing
assumption, so it is stated here rather than buried.


---

## Evidence tiers

Every number and every screenshot in this repo carries a tier. A reader never has
to guess which claims are real.

| Tier | Meaning | What is in it |
|---|---|---|
| **A — live** | Real API, real network, request/response pair captured to `fixtures/` | Razorpay test-mode adapter, webhook HMAC verification, the idempotency probe, the downtime feed, WhatsApp outbound via Twilio |
| **B — seeded sim** | Deterministic simulator, `seed 42`, no network | The arms table, EV pricing, the ablation, the perturbation sweep, the adversarial arm |
| **C — stub** | Named as not shipped. No screenshot implies otherwise. | Bank-health TPS model (Phoenix reads Razorpay's downtime feed instead of modelling throughput); WhatsApp **inbound** unless a tunnel is running |

Arms need n in the hundreds — you cannot hand-click a dashboard 600 times. Tier B
is the *right* tool for the measurement, not a fallback for lack of keys.

### Tier A: how to reproduce the live evidence

```bash
cp .env.example .env          # then paste TEST-mode keys (rzp_test_...)
npm run probe:downtime        # GET /v1/payments/downtimes
npm run probe:idempotency     # duplicate receipt vs duplicate reference_id
npm run poll                  # reconciliation poller over /v1/payments
npm run replay                # same webhook twice -> one side effect; tamper -> 401
npm run whatsapp:send         # real WhatsApp + real Razorpay test payment link
```

The adapter **refuses any key that does not start with `rzp_test_`** — a live key
would move real money, so that is a hard guard, not a convention. `PHOENIX_LIVE_EXECUTION`
defaults to `false`; while it is false, `sendWhatsapp()` makes no network call at all.

`npm run probe:idempotency` answers a question rather than assuming an answer:
Razorpay's documented `Idempotency-Key` header is scoped to Payouts and Transfers,
**not Orders**, so whether `receipt` and `reference_id` dedupe determines how much
work app-level dedup is really doing. Whatever it returns, the finding and the
captured request/response pair go in `fixtures/razorpay.jsonl`.


---

## The spine

One decision function, five stages. Each stage may only narrow what the last one
proposed.

```
ingest(event)                verify HMAC over RAW body → dedupe → append   [tier A]
  └─ classify(payload)       L1: reason + ordinal bucket   ← the ONLY LLM stage
      └─ price(candidates)   L2: EV per action, in Decimal      deterministic
          └─ gate(action)    L3: compliance veto / downgrade    pure functions
              └─ execute()   L4: idempotent, adapter-dispatched
                  └─ audit() append-only, every stage's input and output
```

All five surfaces — W0 rescue, W1 pre-flight, W2 migrator, W3 WhatsApp ladder,
What-If — call the same `decide()`. They differ only in which window they pass.
There is no second engine, which is also why the What-If numbers cannot drift from
the headline numbers: `/api/whatif` re-runs the identical batch through the
identical arms.

### Three invariants, each with a test that fails if it breaks

**1. One-way valve.** Every action carries an integer blast radius. `gate()` may
lower it or veto; it may never raise it. A raise **throws in production**, not just
under test. `tests/invariants.test.ts` checks this exhaustively over every
action × window × consent × hour combination, not as a spot check.
*(Shape credited openly to [Backstop](https://github.com/ramkirangaruda/Razorpay) — it is the right shape.)*

**2. No model float reaches the money math.** `classify()` returns one of five
**ordinal** buckets, never a probability. A probability cannot be smuggled through
a field that only accepts five enum strings — zod rejects it at the boundary and
the request falls back to the lookup table. All rupee arithmetic is `decimal.js`.

**3. Append-only audit.** `src/core/audit.ts` exports `append` and `read` and
nothing else. There is no update, no delete, no upsert, no truncate — so there is
no code path that can rewrite history. The test asserts the module's *export
surface*, which means adding a `delete` breaks the build.

### Consent is two endpoints, not a promise

`/api/rescue` diagnoses and **offers**. `/api/consent` is the only path that can
act, and it refuses without a token that this server issued for a session that
actually failed. The guarantee is not that the system chooses not to charge another
rail — it is that **the charge path does not exist** without the customer's POST.
A double-clicked button produces one authorization, because `append()` returns
`false` on a repeated idempotency key.

### Ingest is poller-primary

Webhooks need a public URL; ingest must not depend on one existing. Razorpay's own
downtime docs tell you to poll "if you have not received any webhook notifications
due to technical issues", and their payments-webhook page warns that a
`payment.failed` may be *followed* by a capture for the same transaction and that
"the webhook sequence is not fixed". A correct consumer has to be idempotent and
order-independent anyway — polling first makes that structural instead of
aspirational. Both paths call `append()` with the same key, so whichever arrives
second is a no-op.

Signature verification is HMAC-SHA256 over the **unmodified** body. In App Router
that means `await request.text()` before any parse. Razorpay's own Node sample
verifies a re-stringified body, which changes key order and therefore the digest —
that is the footgun `src/live/verify.ts` exists to avoid.

### Two compliance details most entries get wrong

**RBI E-mandate Framework 2026.** The **issuer** sends the 24-hour pre-debit
notification. A merchant cannot claim to send it. W1 is therefore a *merchant-side
pre-flight* in that same T−24h window — mandate expiry, instrument validity, this
customer's failure history — not a claim to be the notifier.

**TRAI TCCCPR.** The 09:00–21:00 IST restriction applies to **promotional**
messages. Transactional and service messages are not time-barred. So `gate()`
classifies message intent and curfews only the discount-bearing rungs; a blanket
quiet-hours rule would wrongly suppress a legitimate service notice. The test
asserts both directions.

**UPI Autopay** clears without additional factor authentication up to ₹15,000
(₹1 lakh for select MCCs). That ceiling is a **gate input**, so W2 only offers the
card → UPI Autopay swap where the mandate amount actually clears it.

### WhatsApp: the LLM picks wording, never the rung

The retention ladder is Pause → Downgrade → Payday reschedule → capped discount,
discount last. The customer's reply sets an *intent*; `decide()` and `gate()` set
the rung and every rupee figure. There is no prompt that can talk the system into
a discount, because the ceiling is a gate input rather than an instruction.

The rule that makes it a ladder rather than a menu: **intent narrows what may be
reached for, it never unlocks a rung.** "This is too expensive" returns a lighter
plan, not a concession; `discount_offer` only becomes reachable once a
`downgrade_offer` is already on that customer's ledger. And a churn signal routes
to retention even when it is worded as a price complaint — "too expensive, cancel
it" gets the pause, which is the case a flat keyword table gets wrong. Both are
asserted in `tests/invariants.test.ts`; the escalation state is read from the
audit ledger, so there is no second conversation store to fall out of sync.

Consent has a real artifact: the Twilio sandbox opt-in is a literal
`join <two-word-code>` message the customer sends first. `gate()` will not select
`notify_whatsapp` without it, and downgrades to e-mail instead.


---

## Honest limits

Drafted before the numbers existed, so it could not be tuned to flatter them.

1. **Arm E's net-value win over Razorpay's default is ~1.0%.** The defensible claim
   is the cost side (89% fewer authorization attempts at equal recovery), not the
   revenue side.
2. **The conclusion flips at ×0.3 belief scale**, and **the adversarial arm goes to
   naive.** Phoenix's advantage depends on contact fatigue and issuer-decline
   penalties being real costs. If they are not, brute-force retrying wins.
3. **Synthetic ground truth is exact by construction.** The simulator knows each
   account's true state; no production system does. The anti-circularity guard is
   that `src/sim/world.ts` and `src/core/beliefs.ts` share no import, no constant
   and no functional form — the world runs a logistic over hidden instrument
   health, the agent believes a flat per-bucket table, and a test asserts their
   cost tables disagree. That guard reduces circularity; it does not eliminate it.
4. **Clean-payload classifier recall is 100% by construction** and should be read
   as such. Only the context / contradictory / null-reason rows carry information.
5. **Arm D did not exercise the LLM, and the reason is a quota wall, not a missing
   key.** Gemini's free tier caps `generate_content_free_tier_requests` hard enough
   that a 600-case ablation cannot be funded on it: the committed
   `results/arms-llm.json` records **590 cases lost to quota and 10 to other errors**,
   so the LLM classified nothing and arms C and D are identical. That file is
   evidence of the wall, not an ablation — read `llmFallbackCauses` in it.
   `classifyByLlm` degrades a failed call to the lookup table *by design*, which is
   the right production behaviour and a measurement trap: the first run of this
   reported "LLM recall == table recall" on all four payload classes and looked like
   a tidy negative result. The harness now paces its calls, re-sweeps only the cases
   a quota error stole at half the rate each pass, aggregates the fallback *cause*,
   and prints `!! N% of cases fell back to the table. Arms D/E are NOT a clean LLM
   measurement in this run.` A paced partial run did separate them in the direction
   predicted — the contradictory class, where the table is 0.0% by construction, was
   the only class the model improved materially — but it is not committed here
   because it was not a clean run, and an uncommitted number is not a number.
   `npm run eval -- --llm` on a paid key produces the real row.
6. **Left-shift spends notifications on accounts that would have paid anyway** — 52
   of them in arm E. That is the thesis's cost and it is a column, not a footnote.
7. **Bank health is Razorpay's downtime feed, not a TPS model.** Test mode usually
   returns an empty list; the rescue card then names the failing rail from the error
   envelope instead. The empty response is captured as real evidence rather than
   presented as an outage.
8. **WhatsApp runs on the Twilio sandbox**, so recipients must opt in with
   `join <code>` and the session window is time-limited. Production needs an
   approved sender and approved templates.
9. **Meta Cloud API was the first choice and was abandoned for an environment
   reason, not a technical one.** This build machine's TLS to `graph.facebook.com`
   is intercepted and re-signed by a Sophos CA, so Node `fetch` fails with
   `SELF_SIGNED_CERT_IN_CHAIN` (`--use-system-ca` does not help). `api.twilio.com`
   and `api.razorpay.com` both return a clean 401 over DigiCert chains. Twilio is
   not technically superior here; it is reachable here.
10. **Test-mode dashboard failures are operator-chosen**, not natural. "Charge as
    Failure" produces a real `payment.failed` from Razorpay, but which failure and
    when is my choice, not the world's.
11. **Persistence is a single-process append-only JSONL file**, not a database.
    Deliberate: one process, no concurrent writers, and it makes the append-only
    property structural rather than a convention. It will not survive horizontal
    scaling. `ponytail:` swap `src/core/audit.ts` for Postgres + Redis if it needs to.

---

## Repo map

```
src/core/       the spine — types, beliefs, classify, price+decide, gate, audit
src/sim/        world.ts (ground truth) + generate.ts (seeded cases)
src/eval/       arms.ts (arms 0–E) + run-arms.ts (the runner)
src/live/       razorpay.ts, twilio.ts, verify.ts   ← tier A adapters
src/app/        checkout (W0), /dashboard, and the API routes
scripts/        probes, poller, webhook replay, WhatsApp send
tests/          12 structural invariant checks
results/        arms.json — committed, reproducible from (n, seed)
fixtures/       captured live request/response pairs
```

Deliberately **not** here: Redis (one process, no keys, no network), PostgreSQL
(nothing needs SQL), LangChain (`generateObject` + zod is the whole LLM surface),
Framer Motion (one CSS keyframe), the `razorpay` npm SDK (four endpoints, and the
SDK re-stringifies bodies), WebSockets (every message in the rescue flow is
client-initiated, so there is no server push to carry).

---

## Sources

Bar and tracks: [razorpay.com/buildathon](https://razorpay.com/buildathon) ·
Retries: [Payment Retries](https://razorpay.com/docs/payments/subscriptions/payment-retries/), [Test Subscriptions](https://razorpay.com/docs/payments/subscriptions/test) ·
Downtime: [API](https://razorpay.com/docs/api/payments/downtime/) ·
Errors: [cards](https://razorpay.com/docs/errors/payments/cards), [source/step enums](https://razorpay.com/docs/errors/payments/payment-methods-error-parameters/) ·
Webhooks: [events](https://razorpay.com/docs/webhooks/payments/), [validation](https://razorpay.com/docs/webhooks/validate-test/) ·
Compliance: [RBI E-mandate 2026 (KPMG)](https://kpmg.com/in/en/insights/2026/06/reserve-bank-of-india-rbi-digital-payments-e-mandate-framework-2026.html), [TCCCPR](http://www.trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf) ·
Blast-radius pattern credited to [Backstop](https://github.com/ramkirangaruda/Razorpay).

