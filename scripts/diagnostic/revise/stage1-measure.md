# Stage 1 measured: per-statement revision against the whole-draft path

Six runs, `gpt-5.1-2025-11-13`, temperature 0, seed 1, the committed production
Meridian fixtures and the committed Review. No Review re-run.

**Cost: 4.5 cents.** Arm OLD $0.0134 over 3 calls, arm NEW $0.0311 over 12.
Cache hit rate 93.9% on OLD and 85.9% on NEW overall, **96.7% on NEW once the
prefix is warm** — the prompt ordering works.

---

## Verdict first

**The equity cheque statement: OLD removed the figure 0 of 3. NEW removed it
3 of 3.** The statement the whole-draft path has never fixed, which appears in
its own prompt as a worked example with the exact edit it should receive, is now
fixed on every run.

| Dimension | Verdict |
|---|---|
| Edits made | **BETTER**, decisively. Refusal rate 0.0% against the 86.8% baseline. |
| Fidelity | **WORSE**. Two new failure modes, both measured below. |
| Cost | **WORSE**. 1.94x in steady state, against a 1.31x projection. |

**Stage 1 closes the coverage hole and opens a fidelity hole.** It is the right
architecture and it is not shippable as it stands. Both fidelity failures have
identifiable causes and neither is inherent to the design.

---

## Part 0, the attack before building

### (a) Span availability — one finding that changes the design

Across the four Review artefacts: **18 flagged statements, 8 carrying no span at
all**. The spec expected 7 of 33 from a wider corpus; the ratio here is higher
but the shape is the same, and every `not_supported` statement is in the no-span
group.

The spans that exist are reliable: **10 of 10 span texts are found verbatim in
their own `statementText`**, so they are statement-frame, not source-frame.

But they carry **text only — every span in the corpus has `start` and `end`
undefined**. There are no offsets to be in a frame. So `locateSpan` finds the
span by `indexOf` on the statement and ignores offsets entirely, which sidesteps
the coordinate-frame problem in ddf6ee8 rather than solving it.

**The finding that matters: the spans are coarse.** The equity cheque span is

> "control-oriented investments, with equity checks of EUR 80-100 million apiece."

which **includes "control-oriented investments"** — confirmed material. The
inverted rule protects everything *outside* the span, so it explicitly permits
deleting confirmed words that Review happened to enclose. This is not a bug in
the rule; it is the limit of what the rule can do. It predicted, before the run,
exactly the failure the run then produced.

The eight no-span statements behave as the spec requires: the whole statement is
the target, the inverted rule does not apply, and they are **not excluded**.
Excluding them would recreate the coverage hole. The consequence is that those
statements have **no fidelity constraint at all**, which is the second failure
mode below.

### (b) Cache prefix order — verified twice

Assembly is house style, then guardrails, then the JSON contract, then the kind
rule, then the statement. Everything kind-independent leads. A unit test asserts
`buildStage1Prompt(...).startsWith(buildStage1SharedPrefix())` for two different
kinds, and the live run confirms it: **96.7% on runs 2 and 3**, matching the
figure 1560579 measured on the whole-draft prompt. Run 1 shows 64.3% because the
prefix is cold.

### (c) Parallelism

Nothing in the call path holds shared mutable state that statements contend for.
`traceMetadataCache` in `lib/observability.js` is a `Map` keyed by trace id and
each call gets a distinct one; the Langfuse client is shared but every call is
wrapped in `safeLangfuseCall`; `didWarnCallOpenAIDeprecated` is a one-shot
boolean. **Four is the limit used**, which covers the 5.5-statement median in two
waves and the 8-statement maximum in two, without presenting a rate-limit
surface. A test asserts the limiter never exceeds its bound.

### (d) Anything else

- Statements can carry `evidence: null` with only an editorial concern. One does
  in the corpus. Kind resolution goes through the existing `concernKind`, which
  falls back to compliance then editorial and skips `craft`.
- Two kind rules qualify the kind before the colon — `e) kind "soften"
  (marketing_language_excess):` — so the rule-splitting regex must not require a
  colon. It did, and silently dropped `soften` and `craft`. Caught by a test that
  asserts all nine kinds extract.
- The inverted rule must compare **word sequences, not raw strings**. Cutting a
  trailing clause necessarily rewrites the punctuation joining it
  ("investments," becomes "investments."), and a byte comparison rejects every
  legitimate cut. A changed word still fails.

---

## Part 4, the measurement

### The equity cheque

| Arm | Figure removed |
|---|---|
| OLD, whole draft | **0 of 3** |
| NEW, stage 1 | **3 of 3** |

### Outcomes and refusal rate, arm NEW

| Kind | Edited | No change | Rejected |
|---|---|---|---|
| partial | 6 | 0 | 0 |
| soften | 3 | 0 | 0 |
| unsupported | 3 | 0 | 0 |

**Refusal rate 0.0%**, against the 86.8% baseline from c1fb2c1. Every flagged
statement was acted on in every run. Arm OLD, on the same findings, produced two
no-change markers per run.

### Unreported changes

| Arm | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| OLD | 1 | 1 | 1 |
| **NEW** | **0** | **0** | **0** |

The assertion holds. Code declared every change it made, so fc25060's detector
finds nothing on arm NEW. On arm OLD it fires every run, catching the model
silently deleting "and highly regarded" — the same defect c1fb2c1 found, still
present, still caught only by the detector.

### Validator rejections

**Zero.** No response tripped any of the four rules. That is a clean result and
also an unexercised one: the validator's behaviour against real model output is
unmeasured, and its four rules are covered only by unit tests. Do not read zero
rejections as evidence the validator works in production — read it as the model
having complied on this draft.

### Cost

| Arm | Total | Calls | Cache hit | Per run |
|---|---|---|---|---|
| OLD | $0.0134 | 3 | 93.9% | $0.0045 |
| NEW | $0.0311 | 12 | 85.9% | $0.0104 |

**NEW/OLD = 2.32x overall, 1.94x in steady state** (runs 2 and 3, warm cache).

The 1.31x projection in 1560579 was too optimistic, for two reasons it did not
model. Each of the four calls pays its own uncached tail and its own variable
block, and each produces its own JSON output — 499 output tokens against OLD's
300, billed at $10/M, eight times the input rate. Token-count projections
understate multi-call designs because they treat output as noise.

---

## Fidelity: the two failures

### 1. Confirmed material inside a coarse span

All three NEW runs produced:

> The fund intends to build a portfolio of 10-14 platform investments.

**"control-oriented" is gone in 3 of 3**, the same failure as 1560579 arm C. The
validator accepted it because those words sit *inside* the unsupported span, so
the inverted rule never applied to them. The substituted word "platform" comes
from the source excerpt, so the invented-fact check passed correctly too.

This is the coarse-span problem from Part 0(a), realised. The fix is not in the
validator — it is upstream, in Review emitting spans that stop at the unsupported
element rather than swallowing the confirmed noun phrase.

### 2. The no-span fallback has no constraint at all

Statement 1 carries a `partial` finding with no span. All three NEW runs turned

> In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR
> 1.2 billion flagship fund…

into

> Meridian Capital Partners V is a EUR 1.2 billion flagship fund…

**The commitment itself — who committed, and when — was deleted.** The whole
statement was the target, so nothing protected it. Arm OLD left this statement
alone, and on this statement leaving it alone was better.

The no-span statements cannot simply be excluded; that recreates the coverage
hole. They need a different constraint, and the obvious one is to require that a
no-span edit preserve the statement's named entities and dates unless the
finding names them.

### 3. A smaller one: draft-wide house style is lost

The original reads "annual EBITDA of EUR 5-25 million and defensible positions",
with no Oxford comma. Arm OLD **added** it, correctly, because the whole-draft
prompt applies house style across the entire draft. Arm NEW left it, because
that sentence carries no concern and stage 1 never sees unflagged text.

This is structural, not a bug. Stage 1 buys its accuracy by narrowing context and
pays for it by losing every draft-wide rule. The 999 tokens of ENFORCEABLE style
rules identified in 1560579 — Oxford comma, percentage notation, currency format,
dates — are the obvious place to recover it, in code, over the whole draft, after
stage 1 returns. That reframes them: not a token saving, but the repair for a
gap stage 1 creates.

---

## Note quality, side by side

Arm OLD, run 1:

> No change was made - which are not supported by the source, while keeping the
> fund description. Confirm before publishing.

Arm NEW, run 1:

> Replaced "control-oriented investments, with equity checks of EUR 80-100
> million apiece." with "platform investments." - the source backs only part of
> this. Confirm before publishing.

Every NEW note states a real change with a traceable reason, because code builds
them from the diff and the concern class rather than asking the model for marker
syntax. This is a clear improvement and it comes free with the architecture.

---

## What I would do next

1. **Tighten Review's spans** so they stop at the unsupported element. This fixes
   failure 1 and is upstream of everything here.
2. **Add a named-entity and date preservation check to the no-span path.** Fixes
   failure 2, and is a small addition to the existing validator.
3. **Build the ENFORCEABLE style normalisers** and run them draft-wide after
   stage 1. Fixes failure 3.
4. **Only then reconsider cost.** At 1.94x for a path that goes from 0/3 to 3/3
   on findings it currently ignores, the price is arguable — but not while it is
   also deleting confirmed material.

---

## Technical summary

- **New** `lib/revise-stage1-prompt.mjs`. Slices the house style guide,
  guardrails and per-kind rules out of the live prompt rather than copying them,
  so they cannot drift. Assembles kind-independent content first for caching.
  Excludes the MARKERS section, the other kinds' rules and all whole-draft
  framing. Exports `STAGE1_OUTPUT_CONTRACT`, `buildStage1SharedPrefix`,
  `buildStage1Prompt`, `livePromptBlocks`.
- **New** `lib/revise-stage1.mjs`. `validateStage1Response` enforces the four
  rejection rules; `checkOutsideSpanUnchanged` implements the inverted span rule
  on word sequences; `locateSpan` finds spans by text because offsets do not
  exist; `checkNoInventedFacts` rejects figures, dates and proper nouns absent
  from statement and source. `runStage1` runs statements in parallel to
  `DEFAULT_CONCURRENCY` (4), substitutes accepted revisions **already wrapped in
  marker syntax** so the existing finalise chain owns notes, deterministic
  removal and the honesty check unchanged, and records a rejection event with a
  reason instead of retrying.
- **Modified** `api/suggest-revision.js`. Flag wiring only: `body.perStatementRevise
  === true` swaps how `raw` is produced. Everything downstream is untouched, and
  production does not pass the flag.
- **New** `tests/revise-stage1.test.mjs`, 21 cases: prompt ordering, all nine
  kinds extractable, each of the four rejection rules, the no-span fallback on a
  real no-span statement, concurrency bound, and an end-to-end assertion that the
  unreported-change detector finds zero.
- **New** `scripts/diagnostic/revise/stage1-measure.mjs` and `stage1-measure.json`.
- Suite green, 595 tests, 35 files. The whole-draft prompt and path are unchanged.

## Plain-language summary

We built and tested a new way of revising documents that asks the model about one
sentence at a time instead of the whole document at once, kept behind a switch
that is off by default. It works: on a test document it fixed all four flagged
problems every time, where the current system fixed none of them and left two
untouched with a note saying it had declined. Every change it makes now carries an
accurate explanation. But it also introduced two new problems — it deleted a
supported detail from one sentence and dropped who committed the money from
another — and it costs about twice as much, so it is not ready to turn on yet.
Each of those problems has a clear fix, listed in the report.
