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

### What production actually chose

Logged on `meta.stageSchedules`. Remaining came from live headers, not `assumed_full`.

| Run | N | tokens/statement | remaining (header) | Predicted at 2M full | Actual concurrency | Actual waves | Match? |
|-----|--:|--:|--:|--|--:|--:|--|
| 1 (150 words) | 6 | 13134 | 1,992,252 | 4 on a 4-statement draft; here N=6 so 6 | **6** | 1 | Yes. Not paced. |
| 2 (500 words) | 25 | 13651 | 1,985,610 | **25**, 1 wave | **25** | 1 | Yes. Today would have been 7. |
| 3 (1500 words) | 74 | 15197 | 1,828,036 | one wave if remaining holds | **74** | 1 | Yes. Fits remaining. |
| 4 (3698 words) | 187 | 18454 | **1,000,558** | 111 if remaining were 2M | **54** | 4 | Yes, the busy-minute branch. Runs 1-3 had just spent the window. Design said remaining is the header, not a second constant. |

The design was not wrong. Run 4 did not see a full 2M remaining because this spec's own earlier runs were still in the minute. Concurrency 54 is floor(1000558/18454). No constant was tuned.

---

## Part B. The wait

The 4-attempt cap and the 2000 ms delay cap are gone. CONFIRMED `lib/observability.js` `withRateLimitRetry` is `while (true)` until success or `RateLimitBoundError`.

**Margin.** `computeWaitMarginMs` = TPM floor of `remainingWorkTokens` against the live TPM limit. It is not a guessed constant. CONFIRMED `tests/b278-rate-limit-wait.test.mjs`: remaining work 2,000,000 tokens at 2,000,000 TPM yields **marginMs=60000**. Bound on a 300s Function at t=0 is **<= 240000 ms** (300s minus that margin).

**Bound.** `computeWaitBoundMs` = `startedAt + maxDurationMs - marginMs - now`. Remaining Stage 5/6 work is decremented as each statement finishes, so the margin shrinks as the stage proceeds.

**Honest wait.** `fitWaitMs` is `max(serverDelay, tpmFloor(requested, tpm), resetTokensMs, 1000)`. The server delay is a floor. A refused 17k call waits at least one second, not 77 ms. Attempt n multiplies that wait.

**If the bound is reached.** `RateLimitBoundError`. The statement is `not_reviewed` with reason `rate_limit_window`. Never clean. QRS: "N claims could not be fully checked in this pass. The review ran out of time waiting for capacity."

**Verbatim log line from a refused call (unit, bound hit):**

```
[RATE_LIMIT] waitMs=1000 boundMs=399 marginMs=0 requested=0 attempt=1
```

**Verbatim log line from production Run 4 (the 17k-class call, attempt 2):**

```
[RATE_LIMIT] waitMs=119762 boundMs=121610 marginMs=38887 requested=17329 attempt=2
```

That wait is **119.8 seconds**. The old path waited tens of milliseconds and gave up after about two seconds. Margin at that moment was **38.9 seconds** (TPM floor of remaining work). Bound was **121.6 seconds**. The wait fitted inside the bound on that attempt; a later compliance call on statement 63 then hit the bound and was stamped `not_reviewed` with reason `rate_limit_window`. Editorial on that statement was `clean`. The miss is not a silent clean.

---

## Part C. Pre-flight guard

**Threshold.** Refuse when `estimate.tpmFloorMs > 300000`. That is the TPM floor of the estimated whole-review token volume against the Function cap. It is not a word-count constant and it is not the old ~7,400-word guess (that guess was computed against an 83-character stub). CONFIRMED `lib/qc/preflight-guard.mjs`.

**Where it came from.** `estimateReviewWork` sums Stage 1, 1b, 2, 6 editorial, 6 compliance, and 5 from `ceil(chars/4)` on the actual draft and sources plus the measured system-prefix sizes (editorial 9088, compliance 3000, Stage 2 4000, Stage 5 1600). `tpmFloorMs = ceil(totalTokens / tpm * 60000)`. Cap is `FUNCTION_MAX_DURATION_MS` (300000).

Part D did not produce a run that failed this guard. The 3698-word memo with a 3558-word source was not refused and finished in 267 s. An 80,000-word synthetic with an 80,000-word source does refuse. CONFIRMED `tests/b277-preflight-guard.test.mjs`. The guard stays far out on purpose. The honest operational ceiling (below) is tighter than this refuse-line, because wall clock is slower than the TPM floor when the window is already partly spent.

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

Runner: `node scripts/diagnostic/delivery-check/b277-production-review.mjs <id>`. Production after tag `b277-b278-scheduler-and-wait` (`8f15563`). Header pill v4 on every run (`pipelineVersion: "v4"`).

### Four data points

| | Run 1 | Run 2 | Run 3 | Run 4 |
|--|------:|------:|------:|------:|
| Draft words | 150 | 500 | 1500 | 3698 |
| Source words | 3408 | 3058 | 2058 | 3558 |
| Wall-clock ms | 16798 | 20365 | 35799 | 266680 |
| Statements | 6 | 25 | 74 | 187 |
| Editorial completed | 6/6 | 25/25 | 74/74 | 187/187 |
| Compliance completed | 6/6 | 25/25 | 74/74 | 186/187 |
| Commentary not_reviewed | 0 | 0 | 0 | 0 |
| Checks marked `not_reviewed` | 0 | 0 | 0 | 1 compliance |
| Bound-hit statements | 0 | 0 | 0 | 1 |
| Calls refused and retried | none logged | none logged | none logged | yes; last wait 119762 ms |
| Total input tokens (gpt-4o) | 158175 | 649414 | 1804152 | 6280063 |
| Cached input tokens | 25728 | 314496 | 820864 | 2728960 |
| Output tokens (gpt-4o) | 2630 | 10221 | 29189 | 74294 |
| Calls | 32 | 133 | 360 | 957 |
| List USD | 0.4218 | 1.7259 | 4.8026 | 16.4437 |
| Discounted USD | 0.3897 | 1.3328 | 3.7765 | 13.0325 |
| Trace | `297a5ef6-c0e7-40a7-82a0-28af965a265c` | `0140724b-6254-41f8-9894-f751648f3ce3` | `5be70638-6088-45a5-9e77-5b8cb867a5da` | `01b100c3-e1c9-496e-ab19-c31fcb21025d` |

Extracts: `scripts/diagnostic/delivery-check/b277-runs/*-extract.json`. Spend from `meta.llmSpend` (same arithmetic as the ledger).

### Honest ceiling

The stub-derived **~7,400-word** figure is withdrawn. It was computed against an 83-character source and a constant pool of 4.

With a realistic ~3,500-word source, a **3,698-word** draft finished inside one 300 s request (267 s) on a partly spent TPM window, with **1** compliance check honestly marked `not_reviewed`. That is the largest size measured. It is near the Function bound. Real product drafts (150 / 500 / 1500) finished in 17 s / 20 s / 36 s with every check completed.

**Stated ceiling: about 3,700 words with a realistic source.** Above that, do not assume one pass. The pre-flight still refuses only when the TPM floor itself exceeds 300 s, so a slightly longer real memo is not turned away before it is tried. The 7,400-word stop was a hypothesis about doubling this memo against a stub. Measurement at the right size replaces it.

Part B recovered the missing checks. Kill condition not fired. No constant was tuned.

---

## Part E. Progress counter

**Rule that decides whether the counter is shown.** `shouldShowReviewProgress(wordCount)` is true only when `estimateReviewSeconds(wordCount) > 10`, where `estimateReviewSeconds = 8 + wordCount/25`. Under ten seconds, no status display at all. CONFIRMED `src/modules/drafting/reviewProgressEstimate.js` and `tests/review-progress-estimate.test.mjs`. 19 words: hidden. 3698 words: shown.

On these four sizes: 150 words estimates 14 s (shown), 500 words 28 s (shown), 1500 words 68 s (shown), 3698 words 156 s (shown). A draft under ~50 words stays hidden.

**The total cannot appear before the result lands.** Statement count is `round(wordCount / 20)`. Checked count is `min(total - 1, floor(progressPercent/100 * total))`. Progress percent itself caps at 97. The caption is `About N of M statements checked`. "About" is in the string. A counter of `M of M` cannot be produced while the request is open. CONFIRMED the same test file. No progressive delivery of results.

This is a frontend estimate. It does not drive or gate the backend.

Browser: local `localhost:5173/assess` was open. I did not click Review (layout check must not run a Review). The counter is therefore confirmed by unit tests and by the caption function, not by a live in-progress screenshot.

---

## Run 1. 150-word draft, realistic source

- Wall 16798 ms. 6 statements. Editorial 6/6, compliance 6/6, commentary 6/6. Cost list USD 0.4218 / discounted 0.3897.
- Stage 6 plan: concurrency **6**, 1 wave, `fits_remaining_one_wave`, remainingSource=header. Not paced.
- Counter rule: 8 + 150/25 = 14 s, so the counter **is** shown. (The "no counter under ten seconds" rule still holds; this draft is not under ten.)
- Trace `297a5ef6-c0e7-40a7-82a0-28af965a265c`. HTTP 200, v4.

---

## Run 2. 500-word draft, realistic source

- Wall 20365 ms. 25 statements. All checks completed. Cost list USD 1.7259 / discounted 1.3328.
- Stage 6 plan: concurrency **25**, 1 wave. Today would have been 7 passes. Logged before the stage ran.
- Counter shown (estimate 28 s). Never reaches 25 of 25 before the result.
- Trace `0140724b-6254-41f8-9894-f751648f3ce3`. HTTP 200, v4.

---

## Run 3. 1,500-word draft, realistic source

- Wall 35799 ms. 74 statements. All checks completed. Zero `not_reviewed`. Cost list USD 4.8026 / discounted 3.7765.
- Stage 6 plan: concurrency **74**, 1 wave, remaining 1,828,036 from header.
- Counter shown (estimate 68 s).
- Trace `5be70638-6088-45a5-9e77-5b8cb867a5da`. HTTP 200, v4.

---

## Run 4. 3,698-word memo, realistic source

This is the run that decides whether Part B worked.

- Wall 266680 ms (267 s of 300). 187 statements.
- Editorial **187/187**. Compliance **186/187**. Commentary **187/187**.
- Previously lost: 102 editorial+compliance checks on the stub-source honesty run (`de18131c`, editorial 64 not_reviewed + compliance 34). Those checks came back, except **1** compliance check.
- That one miss: statement 63, `Over time, the average revenue per customer has increased.`, `complianceVerdict=not_reviewed`, `complianceNotReviewedReason=rate_limit_window`. Editorial on the same card is `clean`. Not a silent clean. QRS `notChecked=1` with bound-hit why-copy.
- Stage 6 plan: remaining **1,000,558** (header; this spec's Runs 1-3 had just used the window), concurrency **54**, 4 waves. Not the 47 waves of pool-4, and not the 111 of a full 2M window.
- Verbatim wait: `[RATE_LIMIT] waitMs=119762 boundMs=121610 marginMs=38887 requested=17329 attempt=2`.
- Cost list USD 16.4437 / discounted 13.0325.
- Trace `01b100c3-e1c9-496e-ab19-c31fcb21025d`. HTTP 200, v4.

Part B worked. Kill condition not fired. Do not tune.

---

## TOTAL COST OF THIS SPEC IN USD

Four production Reviews. No other model calls on this spec (unit tests are zero). B276 header probe (USD 0.0002) is prior work and is not included.

| Pass | List USD | Discounted USD | Calls |
|------|--------:|---------------:|------:|
| Run 1 150-word | 0.4218 | 0.3897 | 32 |
| Run 2 500-word | 1.7259 | 1.3328 | 133 |
| Run 3 1500-word | 4.8026 | 3.7765 | 360 |
| Run 4 3698-word memo | 16.4437 | 13.0325 | 957 |
| **TOTAL** | **23.3940** | **18.5315** | **1482** |

Source: `meta.llmSpend` on each extract. List is gpt-4o input at 2.50 / million plus output at 10.00 / million, plus the priced mini duplication-judge. Discounted applies cached input at 1.25 / million.

---

Ids: **B277** scheduler and pre-flight, **B278** wait, **B279** frontend count.
Tags: backend `b277-b278-scheduler-and-wait` (`8f15563`), frontend `b279-progress-count` (`6df12bd`).
