# B285-B289. Shared wait regression

Date: 2026-09-20. No production Review run. Cost USD 0.00.

## REGRESSION NOTE

B278 is the cause. It replaced a four-attempt, two-second retry cap in `withRateLimitRetry` with a wait bounded by remaining Function time. That bound comes from the AsyncLocalStorage store that `beginRequestBudget` opens. Only `api/analyse-statements.js` opened one. The other eleven model-calling endpoints did not. In those eleven, `requireStore()` fabricated a new store with `startedAt = Date.now()` and `maxDurationMs = 300000` on every compute. The bound re-based on every attempt, so a refused call (typical: `synthesize-review` immediately after a review has spent the minute's token budget) could wait until the platform killed the Function. Observed 20 September: a review reached "7 of 8 statements reviewed" and hung. Console: `Fetch API cannot load ... due to access control checks`.

B278's long wait stays correct inside a review that knows its deadline. It is wrong everywhere else. This spec does not revert B278.

---

## Part 1. The wait cannot stretch without a real deadline. B285

**Fallback value.** `NO_BUDGET_FALLBACK_BOUND_MS = 6000`.

Why: pre-B278 waited at most three gaps of `RATE_LIMIT_MAX_DELAY_MS = 2000` (four attempts, three sleeps). Total wait 6 seconds. The fallback restores that ceiling as a total, not as a per-attempt cap.

**Loud once per request.** When there is no ALS budget, `requireStore()` enters a fallback store and logs once:

```
[REQUEST_BUDGET] no budget context; falling back to 6000ms total wait
```

`fallbackLogged` on the store stops a second line on later attempts.

**The bound cannot re-base.** First compute freezes `waitDeadlineAt` and `waitBoundMs`. `recordWaitedMs` accumulates sleeps. Remaining wait is `min(deadline - now, waitBoundMs - totalWaitedMs)`. A frozen `now` in tests still shrinks remaining because of the accumulator. Proof: `tests/b278-rate-limit-wait.test.mjs`, "a second attempt cannot get a later deadline than the first" (6000 then 4000 after a 2000ms recorded wait) and "without a budget, a refused loop dies in a few attempts" (hits 4, then `RateLimitBoundError`, boundMs=0).

**Attempt ceiling.** `RATE_LIMIT_MAX_ATTEMPTS = 1000` in `withRateLimitRetry`. Why: a 1-second retry-after fills a 300-second review bound around attempt 300. 1000 stays above that so the time bound remains the primary control inside a review. A pathological `waitMs = 0` loop (clock and accumulator both stuck) still ends. This is a backstop, not the primary control. The 2-second delay cap stays gone.

---

## Part 2. Every model-calling endpoint opens a budget. B286

`beginRequestBudget({ startedAt: Date.now(), maxDurationMs: FUNCTION_MAX_DURATION_MS, model: STAGE_MODELS[...].model })` at the top of each of the eleven handlers. No pre-flight guard. They are single calls.

Enumeration test `tests/b286-endpoint-budget.test.mjs` scans `api/*.js` for `callLLM(`. Output, all eleven:

```
adapt.js
constructive-feedback.js
generate.js
query-sources.js
query.js
rewrite.js
suggest-revision.js
summarize-rewrite-label.js
summarize-source-usage.js
summarize-source.js
synthesize-review.js
```

Each opens a budget before its first `callLLM`. A new `api/` file that calls the model without `beginRequestBudget` fails this scan. `analyse-statements.js` does not call `callLLM` directly (pipeline modules do) and already opened a budget under B278.

After this, the Part 1 fallback should not fire in production. It stays as the backstop. Its log line is how we find the next endpoint that forgets.

---

## Part 3. What synthesize-review returns when refused. B285

Today, and unchanged, the catch is an honest empty narrative. Not a hang, not a crash, not an invented assessment.

Quoted from `api/synthesize-review.js`:

```
  } catch {
    return res.status(200).json({ ok: false, narrative: "" });
  }
```

The frontend still shows every card (synthesis is fire-and-forget after the review lands). Empty narrative copy is now: `The assessment could not be written this time.` Constant `ASSESSMENT_UNAVAILABLE_COPY` in `reviewSummaryDisplay.js`.

---

## Part 4. Diagnostic. The save. Read only

Origin is not the cause. The frontend is served from `https://brightline-content-engine-frontend.vercel.app`, which is the origin `api/review-state.js` hard-codes.

Production Vercel runtime logs, 20 September 2026, `npx vercel logs --environment production --since 2026-09-20T00:00:00Z --query "review-state"`. The application line is `[review-state] ${method} db=configured|UNSET`. It does not print duration. Status codes are on the platform request record.

### Q1. Did POST /api/review-state execute?

Yes. Writes ran and returned 200. Quoted JSON records (ISO from `timestamp`):

- `[review-state] POST db=configured` POST `/api/review-state` status **200** at 2026-09-20T13:46:02.393Z (`l268l-1789911962393-301dd025400f`)
- `[review-state] POST db=configured` POST `/api/review-state` status **200** at 2026-09-20T13:45:36.614Z (`ln8hr-1789911936614-fb98991bab0d`)
- `[review-state] POST db=configured` POST `/api/review-state` status **200** at 2026-09-20T13:43:12.184Z (`dnbhc-1789911792184-d3699ef6be1d`)
- `[review-state] GET db=configured` GET `/api/review-state` status **404** at 2026-09-20T13:42:56.977Z (`knjch-1789911776977-046c3e992b77`)
- `[review-state] GET db=configured` GET `/api/review-state` status **200** at 2026-09-20T13:47:46.408Z (`72599-1789912066408-13aa767d43fb`)

CLI table (local time 21:xx, same events) also prints the same `[review-state]` lines. No duration field on either the application line or the CLI JSON.

### Q2. Is DATABASE_URL configured in production?

Yes. Every quoted line says `db=configured`. GET 404 proves reads reach the database (not 503 `db_not_configured`). POST 200 proves writes do too: `saveReviewState` ran and returned.

### Q3. How large is the POST body?

Platform reject over 4.5 MB never ran the Function, so it would carry no CORS headers. Measured UTF-8 JSON bytes, no production Review:

| Body | Bytes | vs 4.5 MB |
|------|------:|----------:|
| 8-statement analyse-statements request (short draft + short source) | 887 | 0.02% |
| 8 Shopify cards as a review-state POST (first 8 statements from `tests/fixtures/b247/shopify-messy-full.json` plus a 5 KB source) | 76,682 | 1.6% |
| Meridian analyse-statements request with `meridian_production_source.txt` | 3,897 | 0.08% |
| Meridian review-state POST (7 cards from `1-meridian-reporting-live-2026-09-18.json` plus that source) | 64,040 | 1.4% |
| Full Shopify 184-card result JSON | 565,871 | 12% |

None of these approach 4.5 MB. A 4.5 MB reject is not the hang.

### Q4. Is the review-state save awaited on the path that renders the cards?

No. The save does not gate the render. No change to the save path.

`useReviewStatePersistence.js` L82 awaits the POST **inside** `flushSave`:

```
      const data = await apiSaveReviewState(reviewId, state);
```

Callers fire it and do not await it. L119 (debounced schedule) and L185 (visibilitychange):

```
      void flushSave();
```

`api.js` L388-394 (current; spec's "around 388"):

```
export async function apiSaveReviewState(reviewId, state) {
  const res = await fetch(apiFetchUrl("/api/review-state"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ownerKeyHeaders() },
    body: JSON.stringify({ reviewId, state }),
  });
```

Card render is driven by `analyse-statements` completing in `useDraftState` / `useAssessState`. Persistence is a side effect of live state.

### Q5. Does a 404 on the initial load get logged as an error?

No. L159-160:

```
        if (status === 404) {
          // No saved state; start normally.
        }
```

A 404 means the review has not been saved before.

**Kill condition.** The save is not involved in the hang. Parts 1-3 reproduce the hang as an unbounded no-budget wait and close it in tests (4 attempts, then `RateLimitBoundError`). No further frontend save-path guessing.

---

## Part 5. The counter shows on every review. B287

Ten-second threshold removed. `shouldShowReviewProgress` is true for any non-negative word count. Short-draft hide test replaced, not deleted: "a short draft still shows the counter".

Caption string: `N of M statements reviewed`. No "About". Still never reaches M before the result lands (`reviewCheckedCount` caps at `total - 1`).

---

## Part 6. Cancel. B288

While a review is running, Cancel sits beside the counter. It aborts the in-flight `fetch` via `AbortController` (`apiAnalyseStatements(..., signal)`). The screen returns to the pre-review analysis snapshot, with draft and sources intact. Copy: `Review cancelled.` plus `The draft and sources are unchanged. Review again when you want to continue.` The Review button is enabled. A cancelled run appends no history and does not write a new analysis result, so it saves nothing new.

No backend change. The Function finishes on its own.

**A cancelled review has still been paid for.** Aborting the browser request does not stop the Function or the model calls.

---

## Part 7. Dead buttons go flat. B289

With no live proposals (`hasProposedChanges` false), bulk accept, bulk reject, discard, and save are `disabled`. `Button` already uses a slate, reduced-opacity, `cursor-not-allowed` style when `disabled`. Save label at count 0 is `Save`, not `Save with no changes`.

---

## Tests

Backend: `tests/b278-rate-limit-wait.test.mjs` (fallback, no re-base, few-attempt death), `tests/b286-endpoint-budget.test.mjs` (enumeration of the eleven), `tests/b266-rate-limit-retry.test.mjs` (2s cap still gone).

Frontend: `tests/review-progress-estimate.test.mjs`, `tests/b288-b289-cancel-and-dead-buttons.test.mjs`, `tests/action-list-decisions.test.mjs`.

## Browser

Local `localhost:5173/assess` was open (Vite running). I pasted `Halden Group expects growth this year.` into the draft box. What I SAW: Sources empty, Review still disabled (no source), Results heading with no cards, no counter, no Cancel, no Bulk accept/reject/discard/save. I did not click Review. Counter, Cancel, and dead action buttons were not on this screen. Tests cover those states.

## Operating manual

`ai/AI_OPERATING_MANUAL.md` Change Surface Discipline: a spec that changes a shared helper must enumerate every caller and state the effect on each. B278 considered 1 of 12.

## Total cost of this spec in USD

**USD 0.00.** No production Review. No billed model calls.
