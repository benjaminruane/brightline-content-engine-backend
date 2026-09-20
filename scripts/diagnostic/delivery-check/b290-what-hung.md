# B290. What hung

Date: 2026-09-20. No production Review. Cost so far USD 0.00.

B285 fixed a real bug (unbounded wait on eleven endpoints that never opened a budget). It did not cause, and could not have caused, the observed hang. The hang was `POST /api/analyse-statements` itself, waiting on 429s until the Function bound. Confirmed from production logs below, not from reasoning.

---

## Part 1. What actually hung

Window: 2026-09-20, 13:40Z to 13:50Z. Same window as the review-state lines in `b285-shared-wait-regression.md`. Source: `npx vercel logs --environment production --since 2026-09-20T13:40:00Z --until 2026-09-20T13:50:00Z --query "/api/analyse-statements" --json`.

The CLI JSON has no duration field. Duration below is reconstructed from the wait logs: first `boundMs` is remaining Function time at attempt 1 (~299.8 s), last `boundMs` is remaining at attempt 24 (~20 s). Elapsed ≈ first bound minus last bound. That matches the triangular sleep sum 1+2+...+23 = 276 s, plus overhead.

### Q1. Every POST /api/analyse-statements, duration and status

Four POSTs. All HTTP **200**. All ended `[QC_V3_HANDLER_ERROR] rate limit bound reached after 24 attempt(s)`. The handler catches that and returns 200 with `ok: false` (CONFIRMED `api/analyse-statements.js` L408-421). No pipeline stages ran (`[QC_LLM_CACHE] pipeline hits=0 misses=0`).

| Log id | Timestamp (end) | Status | Duration (reconstructed) |
|--------|-----------------|--------|--------------------------|
| `hlddr-1789911682575-f4850341fe07` | 2026-09-20T13:41:22.575Z | 200 | ~279.7 s (boundMs 299808 → 20136) |
| `ldzhf-1789911791272-ff5f0c22dbcb` | 2026-09-20T13:43:11.272Z | 200 | ~279.8 s (boundMs 299803 → 19990) |
| `kxm72-1789911935914-8969fa38a147` | 2026-09-20T13:45:35.914Z | 200 | ~279.5 s (boundMs 299747 → 20228) |
| `hnfnl-1789911960579-fa44483a27f1` | 2026-09-20T13:46:00.579Z | 200 | ~279.8 s (boundMs 299849 → 20036) |

Four OPTIONS in the same window are CORS preflights, 200, not reviews.

The four POSTs overlap. A request that lasts ~280 s and ends at 13:41:22 started around 13:36:42, before this window. The window captures the ends.

### Q2. [SCHEDULE] and [RATE_LIMIT] lines

**No `[SCHEDULE]` line on any of the four.** The scheduler never ran.

**No `attempt=prelaunch` line on any of the four.** `waitUntilTokensFit` did not hold a launch. The wait is `withRateLimitRetry` on a 429, `requested=0` (the error had no "Requested N"), so each delay is `RATE_LIMIT_MIN_WAIT_MS * attempt` = 1 s, 2 s, ... 24 s.

Quoted in full for the last request (`hnfnl`, rid `mu9vd81o-45qkqm`), which is the same shape as the other three:

```
[RATE_LIMIT] waitMs=1000 boundMs=299849 marginMs=0 requested=0 attempt=1
[RATE_LIMIT] waitMs=2000 boundMs=298693 marginMs=0 requested=0 attempt=2
[RATE_LIMIT] waitMs=3000 boundMs=296555 marginMs=0 requested=0 attempt=3
[RATE_LIMIT] waitMs=4000 boundMs=293385 marginMs=0 requested=0 attempt=4
[RATE_LIMIT] waitMs=5000 boundMs=289220 marginMs=0 requested=0 attempt=5
[RATE_LIMIT] waitMs=6000 boundMs=284079 marginMs=0 requested=0 attempt=6
[RATE_LIMIT] waitMs=7000 boundMs=277926 marginMs=0 requested=0 attempt=7
[RATE_LIMIT] waitMs=8000 boundMs=270758 marginMs=0 requested=0 attempt=8
[RATE_LIMIT] waitMs=9000 boundMs=262616 marginMs=0 requested=0 attempt=9
[RATE_LIMIT] waitMs=10000 boundMs=253474 marginMs=0 requested=0 attempt=10
[RATE_LIMIT] waitMs=11000 boundMs=243306 marginMs=0 requested=0 attempt=11
[RATE_LIMIT] waitMs=12000 boundMs=232148 marginMs=0 requested=0 attempt=12
[RATE_LIMIT] waitMs=13000 boundMs=219950 marginMs=0 requested=0 attempt=13
[RATE_LIMIT] waitMs=14000 boundMs=206809 marginMs=0 requested=0 attempt=14
[RATE_LIMIT] waitMs=15000 boundMs=192666 marginMs=0 requested=0 attempt=15
[RATE_LIMIT] waitMs=16000 boundMs=177470 marginMs=0 requested=0 attempt=16
[RATE_LIMIT] waitMs=17000 boundMs=161271 marginMs=0 requested=0 attempt=17
[RATE_LIMIT] waitMs=18000 boundMs=144130 marginMs=0 requested=0 attempt=18
[RATE_LIMIT] waitMs=19000 boundMs=125906 marginMs=0 requested=0 attempt=19
[RATE_LIMIT] waitMs=20000 boundMs=106757 marginMs=0 requested=0 attempt=20
[RATE_LIMIT] waitMs=21000 boundMs=86614 marginMs=0 requested=0 attempt=21
[RATE_LIMIT] waitMs=22000 boundMs=65387 marginMs=0 requested=0 attempt=22
[RATE_LIMIT] waitMs=23000 boundMs=43174 marginMs=0 requested=0 attempt=23
[RATE_LIMIT] waitMs=24000 boundMs=20036 marginMs=0 requested=0 attempt=24
[QC_V3_HANDLER_ERROR] rate limit bound reached after 24 attempt(s); wait 24000ms exceeds bound 20036ms
```

The other three POSTs are the same 24 lines, same `requested=0`, same death at attempt 24 when `waitMs=24000` exceeds remaining bound ~20 s. Sleeps 1..23 already consumed ~276 s.

### Q3. Which is true?

**(a). `analyse-statements` itself ran long, mostly spent waiting for capacity.**

Not (b). `POST /api/synthesize-review` in this window: **no logs**. Zero requests. Synthesis never started.

The screen showing "7 of 8 statements reviewed" was the frontend estimate crawling toward M-1 while the Function sat in 429 retries. No statements had been reviewed. Cache `hits=0 misses=0`. No `[SCHEDULE]`.

### Q4. What ends the reviewing state and hides the counter?

Frontend, `StatementAnalysisPanel.jsx`:

```
const isReviewing = isRunningAnalysis || analysisStatus === "loading" || analysisStatus === "pending";
const showReviewProgress = isReviewing;
```

`isRunningAnalysis` is set false only after `apiAnalyseStatements` returns or throws, in `useDraftState.jsx`:

```
      setIsRunningAnalysis(false);
      analysisAbortRef.current = null;
      return data;
```

That is **after** the analyse-statements await, **before** `apiSynthesizeReview` is fired (that call is `void (async () => { ... })()` and does not hold `isRunningAnalysis`). Assess is the same: `setAnalysisStatus("done")` then fire-and-forget synthesis.

**Does it depend on synthesize-review completing? No.** The B285 report was right about that. There is no contradiction. B285 fixed a different real bug (the eleven endpoints). It did not fix this hang.

### Q5. B277 measurement token spend

Committed extracts `scripts/diagnostic/delivery-check/b277-runs/*-extract.json`. Limit 2,000,000 tokens per minute (Tier 4 gpt-4o, B276).

| Run | Wall | gpt-4o input tokens | All-model input | vs 2M/min |
|-----|-----:|--------------------:|----------------:|-----------|
| 1 150w | 16.8 s | 158,175 | 158,627 | 8% of one minute |
| 2 500w | 20.4 s | 649,414 | 650,337 | 32% of one minute |
| 3 1500w | 35.8 s | 1,804,152 | 1,805,991 | 90% of one minute |
| 4 memo | 266.7 s | 6,280,063 | 6,283,089 | 3.14 minutes of allowance |

The spec's 6,280,063 is run 4 gpt-4o input (`llmSpend.byModel["openai/gpt-4o-2024-08-06"].inputTokens`).

Sum of walls if sequential: 340 s (~5.7 minutes). Sum of gpt-4o input: 8,891,804 tokens, which is 4.45 minutes of the 2M/min allowance. Run 4 alone is 6,280,063 tokens in 267 s of wall. Its Stage 6 plan opened with `remainingTokens: 1000558` on a 2,000,000 limit (`remainingSource: header`), so that run started on a partly spent minute.

The 13:40Z hang is a later, separate set of four overlapping analyse-statements calls. Those four never billed a completed pipeline (0 cache hits, 0 misses, error at the first 429 loop).

### Kill condition

(a) explains the hang. Continue.

---

## Part 2. The screen says what it is doing

### 2.1 Backend `meta.capacityWait`

`waitUntilTokensFit` (prelaunch) and `withRateLimitRetry` (429 sleep) both call `recordCapacityWait`. The handler stamps `meta.capacityWait: { prelaunchCount, waitMs }` beside `rateLimitBoundHits` on success and on the `ok: false` catch path. CONFIRMED `api/analyse-statements.js`, `lib/qc/request-budget.mjs`.

The 13:40Z hang had `prelaunchCount = 0` and would now report `waitMs` of the 1+2+...+23 s sleeps (~276000). A silent 429 loop is still a capacity wait. Counting only prelaunch would have left this hang unnamed.

### 2.2 Frontend caption while stalled

Threshold: `CAPACITY_WAIT_HINT_AFTER_MS = 8000`, equal to `REVIEW_PROGRESS_BASE_SECONDS`. Longer than the 200 ms tick and the opening `0 of M` window on a typical draft. Short enough to speak during a real wait. After 8 s at the same checked count, a second line appears: `The review is waiting for capacity and will continue on its own.` No tokens, limits, or provider names. No blink, animation, or countdown.

### 2.3 Counter unchanged

Still `N of M statements reviewed`. Still capped at `M - 1` until the result lands.

### 2.4 After landing

If `meta.capacityWait.waitMs > 0`, one quiet fact: `This review spent N seconds waiting for capacity.` (or minutes, or less than a second). Not an error. A failed analyse still carries `err.meta` through so this hang can say how long it waited.

---

## Part 3. Can the 6-second fallback leak?

### 3.1 Answer

Yes it could, before this spec. `requireStore` used `storage.enterWith(created)`. `enterWith` sets the store on the current execution and its descendants. On a warm Function the next invocation can start on that same execution. A later review that had not yet opened its own budget would inherit a 6 s deadline and fail fast for no reason.

### 3.2 Fix

`requireStore` returns a throwaway store. It does not `enterWith`. `withRateLimitRetry`, when there is no budget, wraps the call in `runWithFallbackBudget` (`storage.run`). That store cannot outlive the call. Handlers still open their own 300 s budget at entry (B286). CONFIRMED `lib/qc/request-budget.mjs`, `lib/observability.js`.

### 3.3 Test

`tests/b290-capacity-wait.test.mjs`. `requireStore` source has no `enterWith`. A throwaway does not remain on the current execution. A later 300 s review does not inherit 6 s. `runWithFallbackBudget` restores the outer store.

---

## Did B285 fix the reported hang?

No. B285 fixed a different, real bug: eleven endpoints waited without a deadline. The reported hang was `POST /api/analyse-statements` itself, waiting on 429 retries with `requested=0` until the Function bound (~280 s). That endpoint already opened a budget. The screen was honest about being in a review and dishonest about why the counter had stopped.

---

## TOTAL COST OF THIS SPEC IN USD

**0.00**. No production Review. No model calls.

---

## Ship

Backend and frontend commits: `B290 — say when the review is waiting for capacity rather than thinking`.

