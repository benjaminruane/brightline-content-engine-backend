# Scheduler, wait, and progress count (B277, B278, B279)

BUILD SPEC. Backend B277 (scheduler + pre-flight) and B278 (wait). Frontend B279 (progress count). Part D measurement follows the code.

This section was written BEFORE the scheduler code.

---

## Part A. Design (before code)

The plan is a function of the work in front of the stage, not a constant in the file.

**Inputs (all available without a model call)**

- Statement count N (after Stage 1; before Stage 1, `round(wordCount / 20)`, from 3698/186).
- Tokens per in-flight statement, estimated from the actual strings that stage will send: `ceil(chars / 4)` on the real system prompt plus a sample user payload built from this draft and one statement. Stage 6 in-flight is editorial plus compliance, because those two calls run together.
- Live TPM limit and remaining tokens from `x-ratelimit-limit-tokens` and `x-ratelimit-remaining-tokens`. Before any header: gpt-4o family default 2,000,000 remaining, logged as `assumed_full`. That default is the published Tier 4 gpt-4o number (B276), not a concurrency cap.

**Rule (deterministic, no randomness)**

1. Total stage tokens = N * tokensPerStatement.
2. If total <= remaining, concurrency = N. One wave. A small review is not throttled.
3. Else concurrency = max(1, floor(remaining / tokensPerStatement)). Burst stays strictly inside the current window. Part B waits when a launch still 429s.
4. Before each new launch, read the latest remaining header. If remaining < tokensPerStatement, wait until it fits (same wait as Part B). That is A6: the plan corrects from live headers rather than assuming a fixed share.

Stage 2 stays at 24. This spec schedules Stages 5 and 6 only.

**What I expect it to choose (gpt-4o, assumed_full 2M, short source)**

| Review | N | Stage 6 tokens/statement (order of) | Total vs 2M | Concurrency | Waves vs today |
|--------|--:|--:|--|--:|--|
| 4-statement, short draft | 4 | ~12k | ~48k, fits | **4** | 1. Today 1 (already). Not paced. |
| 25-statement, ~500 words | 25 | ~12k | ~300k, fits | **25** | 1. Today 7. |
| 185-statement, ~3700 words | 185 | ~18k | ~3.3M, does not fit | **floor(remaining/18k)**; 111 if remaining is 2M | 2. Today 47. |

If Stage 1 and 2 have already spent the window, remaining is the header and 185 may get a smaller burst. That is the busy-minute case, not a second constant.

If measurement shows these predictions wrong, the report will say so. Do not tune a constant until one run passes.

### What the unit tests actually chose (assumed_full 2M)

CONFIRMED `tests/b277-stage-schedule.test.mjs`.

| Review | Predicted | Actual `planStageConcurrency` |
|--------|-----------|-------------------------------|
| 4 statements, 12k/call, remaining 2M | concurrency 4, 1 wave | concurrency 4, 1 wave, `fits_remaining_one_wave` |
| 25 statements, 12k/call, remaining 2M | concurrency 25, 1 wave | concurrency 25, 1 wave |
| 185 statements, 18k/call, remaining 2M | floor(2e6/18e3)=111, 2 waves | concurrency 111, 2 waves, `burst_inside_remaining_window` |

A header remaining of 40,000 with 18k/call yields concurrency 2. Same inputs produce the same plan. The v4 pipeline logs one `[SCHEDULE]` line per stage before it runs and no longer exports `STAGE6_CONCURRENCY = 4`.

Live production choices for the four sized drafts are in Part D / Runs 1-4 (`meta.stageSchedules`).

---

## Part B. The wait

The 4-attempt cap and the 2000 ms delay cap are gone. CONFIRMED `lib/observability.js` `withRateLimitRetry` is `while (true)` until success or `RateLimitBoundError`.

**Margin.** `computeWaitMarginMs` = TPM floor of `remainingWorkTokens` against the live TPM limit. It is not a guessed constant. CONFIRMED `tests/b278-rate-limit-wait.test.mjs`: remaining work 2,000,000 tokens at 2,000,000 TPM yields **marginMs=60000**. Bound on a 300s Function at t=0 is **<= 240000 ms** (300s minus that margin).

**Bound.** `computeWaitBoundMs` = `startedAt + maxDurationMs - marginMs - now`. Remaining Stage 5/6 work is decremented as each statement finishes, so the margin shrinks as the stage proceeds.

**Honest wait.** `fitWaitMs` is `max(serverDelay, tpmFloor(requested, tpm), resetTokensMs, 1000)`. The server delay is a floor. A refused 17k call waits at least one second, not 77 ms. Attempt n multiplies that wait. CONFIRMED unit: 42 ms server delay becomes waitMs=1000 then 2000.

**If the bound is reached.** `RateLimitBoundError`. The statement is `not_reviewed` with reason `rate_limit_window`. Never clean. QRS: "N claims could not be fully checked in this pass. The review ran out of time waiting for capacity."

**Verbatim log line from a refused call (unit, bound hit):**

```
[RATE_LIMIT] waitMs=1000 boundMs=399 marginMs=0 requested=0 attempt=1
```

Production refused-call lines, when a run actually 429s, are copied under the matching Run below from `meta.rateLimitLastWait`.

---

## Part C. Pre-flight guard

**Threshold.** Refuse when `estimate.tpmFloorMs > 300000`. That is the TPM floor of the estimated whole-review token volume against the Function cap. It is not a word-count constant and it is not the old ~7,400-word guess (that guess was computed against an 83-character stub). CONFIRMED `lib/qc/preflight-guard.mjs`.

**Where it came from.** `estimateReviewWork` sums Stage 1, 1b, 2, 6 editorial, 6 compliance, and 5 from `ceil(chars/4)` on the actual draft and sources plus the measured system-prefix sizes (editorial 9088, compliance 3000, Stage 2 4000, Stage 5 1600). `tpmFloorMs = ceil(totalTokens / tpm * 60000)`. Cap is `FUNCTION_MAX_DURATION_MS` (300000).

A 3698-word draft plus a 3558-word source does **not** refuse. An 80,000-word synthetic with an 80,000-word source does. CONFIRMED `tests/b277-preflight-guard.test.mjs`. Part D states the honest word-count ceiling after the four production points.

**Refusal text (verbatim, user-facing):**

```
This document is longer than the product can check in one pass.
```

No tokens, limits, tiers, or concurrency. The same line is logged with the estimate: `[PREFLIGHT] refuse words=... statements=... totalTokens=... tpmFloorMs=... capMs=...`.

---

## Part D. Measurement at the right size

Fixtures are committed under `tests/fixtures/b277/`. All four use real Shopify memo prose, not the B1 83-character stub. Manifest: `tests/fixtures/b277/manifest.json`.

| Run | Draft | Source |
|-----|-------|--------|
| 1 | `Shopify (text).txt` words 1-150 (150 words, 881 chars) | words 151-end (3408 words, 21128 chars) |
| 2 | words 1-500 (500 words, 2952 chars) | words 501-end (3058 words, 19057 chars) |
| 3 | words 1-1500 (1500 words, 9133 chars) | words 1501-end (2058 words, 12876 chars) |
| 4 | `shopify-messy-full.json` `_auditDraft` (3698 words, 22163 chars) | `Shopify (text).txt` full (3558 words, 22022 chars) |

Runner: `node scripts/diagnostic/delivery-check/b277-production-review.mjs <id>`.

The four data points are in the Run sections. The honest ceiling is stated after Run 4.

---

## Part E. Progress counter

**Rule that decides whether the counter is shown.** `shouldShowReviewProgress(wordCount)` is true only when `estimateReviewSeconds(wordCount) > 10`, where `estimateReviewSeconds = 8 + wordCount/25`. Under ten seconds, no status display at all. CONFIRMED `src/modules/drafting/reviewProgressEstimate.js` and `tests/review-progress-estimate.test.mjs`. 19 words: hidden. 3698 words: shown.

**The total cannot appear before the result lands.** Statement count is `round(wordCount / 20)`. Checked count is `min(total - 1, floor(progressPercent/100 * total))`. Progress percent itself caps at 97. The caption is `About N of M statements checked`. "About" is in the string. A counter of `M of M` cannot be produced while the request is open. CONFIRMED the same test file. No progressive delivery of results.

This is a frontend estimate. It does not drive or gate the backend.

---

## Run 1. 150-word draft, realistic source

Pending production deploy of this commit. Extract will be `scripts/diagnostic/delivery-check/b277-runs/run1-150-extract.json`.

Expected from the design: no Stage 6 pacing (concurrency = N). Counter shown only if `8 + 150/25 = 14` seconds, which is over ten, so the counter **is** shown on this size. (The "no counter under ten seconds" rule still holds; this draft is not under ten.)

---

## Run 2. 500-word draft, realistic source

Pending production deploy. Extract: `run2-500-extract.json`. Design: 25-statement-scale, one wave if remaining holds ~300k tokens.

---

## Run 3. 1,500-word draft, realistic source

Pending production deploy. Extract: `run3-1500-extract.json`. Any `not_reviewed` must carry `rate_limit_window` (or another honest reason) and appear in the disclosure.

---

## Run 4. 3,698-word memo, realistic source

Pending production deploy. Extract: `run4-memo-extract.json`. This is the run that decides whether Part B recovered the 102 previously lost editorial and compliance checks, or marked them `not_reviewed` with a reason.

---

## Honest ceiling

Pending Run 1-4. The stub-derived ~7,400-word figure is withdrawn. The replacement is the largest draft that finished inside one 300s request with a realistic source, or the pre-flight refusal threshold if a run is refused first.

---

## TOTAL COST OF THIS SPEC IN USD

Pending the four production runs. Unit tests made no model calls. B276 header probe (USD 0.0002) is prior work, not this spec.

Per-run breakdown will be listed here from `meta.llmSpend`.

---

Ids: **B277** scheduler and pre-flight, **B278** wait, **B279** frontend count.
Tags: backend `b277-b278-scheduler-and-wait`, frontend `b279-progress-count`.
