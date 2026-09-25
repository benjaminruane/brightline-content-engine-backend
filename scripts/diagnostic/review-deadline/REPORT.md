# B329. A review that cannot finish returns nothing, and says so

No production Review. No model calls. USD 0.

-----------------------------------------------------------------------------
PART 0A. FACTUAL CLAIMS
-----------------------------------------------------------------------------

C1 BLOCKING. PARTLY. Two different deaths are still reachable. Neither is "cards from a half-finished run" on the catch path. A pipeline that returned fewer cards than statements would have been accepted until this spec.

What a client receives today when the function is killed mid-Review with no handler catch: no JSON body. Frontend `apiAnalyseStatements` (`src/utils/api.js` L207-223) `fetch` then `res.json().catch(() => ({}))`. A 504 or empty body becomes `Analyse failed (504)`. A dropped connection throws. Writing stores `{ ok: false, error: safeNote, statements: [] }` (`useDraftState.jsx` L1012-1024). The panel shows `The review did not run.` plus that error (`StatementAnalysisPanel.jsx` L2414-2418). CONFIRMED B163 `scripts/diagnostic/delivery-check/b163-ingestion-reality.md` L86: d13 extract `fetch failed` at 301388 ms, no JSON. Same kill class on `analyse-statements` if Vercel stops the Function. Still reachable: extraction on the Review request can spend the cap (B315), and a Stage 2/6 call that starts with a few seconds left can overrun B278.

What a client receives when the handler catches before the kill: HTTP 200, `{ ok: false, error: "The review did not run.", statements: [], meta.reviewDidNotRun: true }` (`api/analyse-statements.js` catch). Frontend throws on `ok === false` and stores the same empty-card failure. CONFIRMED B290 `scripts/diagnostic/delivery-check/b290-what-hung.md` L15-17: four POSTs HTTP 200 after ~280 s, `[QC_V3_HANDLER_ERROR] rate limit bound reached`, cache hits=0 misses=0, nothing reviewed. The spec's "B285 four Reviews" is this hang, recorded in B290, cause B278 waits. Still reachable: overlapping reviews that 429 until the bound.

C2 BLOCKING. TRUE. Until this spec the refuse rule was `tpmFloorMs > 300000` (`lib/qc/preflight-guard.mjs` L34 as shipped in B277). 3698-word draft + 3558-word source accepted (`tests/b277-preflight-guard.test.mjs` L35-45). 80,000 + 80,000 refused. B328 `scripts/diagnostic/source-length/REPORT.md`: TPM trip at ~18,503 source words on a 3,698-word draft; busy wall fails around d12 (11,860) while that guard still accepted; idle wall stays under 300 s until past the TPM trip. B277 already recorded the guard refusing in the wrong place (too late vs the 3,700-word measured ceiling). Still true of the old rule.

C3 BLOCKING. PARTLY. B249 (`lib/qc/pipeline-v4/index.mjs` `draftCoverage`, tests `tests/b249-unchecked-sentences.test.mjs`) accounts for draft bytes that never became a card **after a completed split**. It does not run if the Function is killed, if the handler catch fires, or if Stage 1 never finishes. A cut-off run was not covered. A completed run with `not_reviewed` checks was already accounted for on the cards (B250, B268, B278).

C4 CHECK. TRUE as far as a clock existing, FALSE as a review-level check. The clock is `beginRequestBudget` ALS `startedAt` + `maxDurationMs` (`lib/qc/request-budget.mjs` L20-31, opened from `api/analyse-statements.js`). B278 uses it per model-call wait (`computeWaitBoundMs`). Nothing above that asked "will this Review still produce a card for every statement?". Hitting the bound stamped `not_reviewed` and continued.

-----------------------------------------------------------------------------
PART 0B. DESIGN
-----------------------------------------------------------------------------

B0. The check belongs in three cheap places, not in a new pipeline:

1. Pre-flight, fail-safe, before any model call. Recalibrated to B277 Run 4 idle pin (B328). Refuse only when predicted idle wall AND TPM floor both exceed 300 s, and never refuse the measured 3698 x 3558 cell. Cost: the existing estimator. Cannot catch a busy window. Relies on (2) and (3).
2. After Stage 1, before Stage 2. If remaining wall is at or below `REVIEW_RESPONSE_MARGIN_MS` (2 s), throw `ReviewDeadlineError` and return no cards. Cost: `Date.now()` vs the ALS clock. Cannot catch a single in-flight LLM call that started with time left and overran, or a platform SIGKILL.
3. After the pipeline returns: if Stage 1 produced N statements and the payload has anything other than N cards, discard every card and return the honest account. This is the last line so no path can leak a subset. Cost: a length compare.

I would not refuse 3698 x 11860. B328 idle says it succeeds; busy says it fails. Uncertain. Accept. B2/B3 catch the busy miss.

B1 AGREE. Complete with `not_reviewed` gaps is untouched.
B2 AGREE. Incomplete means `statements: []`.
B3 AGREE. Cause slugs in `INCOMPLETE_CAUSES`. How-far in product words (sentences), not stages.
B4 AGREE. Named pin from B277 Run 4 / B328. Fail-safe AND. Measured cell never refused.
B5 AGREE. Copy in `REVIEW_COPY` and `REVIEW_NEXT_STEP` in `lib/qc/review-deadline.mjs`. Ben ruled the wording 2026-09-25.
B6 AGREE. Not built: progressive delivery, re-review, cache-for-retry, estimator internals, completed-review behaviour.

P34. `preflightReview` callers: `api/analyse-statements.js` (new refuse rule), `tests/b277-preflight-guard.test.mjs` (still passes on 3698 x 3558 and 80k), `scripts/diagnostic/source-length/model-source-length.mjs` (diagnostic only; re-run would show the new line). `throwIfReviewDeadlineExceeded` callers: `lib/qc/pipeline-v4/index.mjs` after Stage 1 only.

-----------------------------------------------------------------------------
PART 1. BUILD
-----------------------------------------------------------------------------

Shipped:

- `lib/qc/review-deadline.mjs` clock, pin, copy, incomplete body, completeness predicate.
- `lib/qc/preflight-guard.mjs` fail-safe refuse.
- `lib/qc/not-reviewed-reason.mjs` `INCOMPLETE_CAUSES`.
- `api/analyse-statements.js` preflight body, post-pipeline strip, catch maps deadline / capacity / billing.
- `lib/qc/pipeline-v4/index.mjs` deadline check after Stage 1.
- `tests/review-deadline.test.mjs`.
- Frontend (separate commit): `src/utils/exportReport.js` prints the same `error` string on `ok: false`.

-----------------------------------------------------------------------------
PART 2. PROVE IT
-----------------------------------------------------------------------------

## 2.1 Four responses, verbatim

From `scripts/diagnostic/review-deadline/four-responses.json`, produced by `node scripts/diagnostic/review-deadline/print-responses.mjs`. No model calls.

### Complete

```json
{
  "ok": true,
  "error": null,
  "statements": [
    {
      "id": "0",
      "text": "Revenue grew to EUR 92 million.",
      "qcCard": {
        "index": 0,
        "statement": "Revenue grew to EUR 92 million.",
        "editorialVerdict": "clean",
        "complianceVerdict": "clean",
        "displayVerdict": "supported_full"
      }
    },
    {
      "id": "1",
      "text": "Costs fell year on year.",
      "qcCard": {
        "index": 1,
        "statement": "Costs fell year on year.",
        "editorialVerdict": "clean",
        "complianceVerdict": "clean",
        "displayVerdict": "supported_full"
      }
    }
  ],
  "references": [],
  "meta": {
    "pipelineVersion": "v4",
    "reviewSummary": {
      "version": 1,
      "statements": 2,
      "notChecked": 0
    }
  }
}
```

### Complete with marked gaps

```json
{
  "ok": true,
  "error": null,
  "statements": [
    {
      "id": "0",
      "text": "Revenue grew to EUR 92 million.",
      "qcCard": {
        "index": 0,
        "statement": "Revenue grew to EUR 92 million.",
        "editorialVerdict": "not_reviewed",
        "complianceVerdict": "clean",
        "displayVerdict": "supported_full"
      }
    },
    {
      "id": "1",
      "text": "Costs fell year on year.",
      "qcCard": {
        "index": 1,
        "statement": "Costs fell year on year.",
        "editorialVerdict": "clean",
        "complianceVerdict": "clean",
        "displayVerdict": "supported_full"
      }
    }
  ],
  "references": [],
  "meta": {
    "pipelineVersion": "v4",
    "reviewSummary": {
      "version": 1,
      "statements": 2,
      "notChecked": 1
    }
  }
}
```

### Cut off

```json
{
  "ok": false,
  "error": "The review could not be completed within the time limit for a single review. Of the 2 sentences in your draft, 1 had been checked when it stopped. Please try again. If it keeps happening, try a shorter draft.",
  "statements": [],
  "references": [],
  "meta": {
    "pipelineVersion": "v4",
    "incomplete": {
      "complete": false,
      "cause": "deadline",
      "howFar": "Of the 2 sentences in your draft, 1 had been checked when it stopped.",
      "nextStep": "Please try again. If it keeps happening, try a shorter draft.",
      "account": "deadline",
      "expectedSentences": 2,
      "reachedSentences": 1
    }
  }
}
```

### Refused before starting

```json
{
  "ok": false,
  "error": "This draft and its sources exceed the size limit for a single review. Of the 4000 sentences in your draft, 0 had been checked when it stopped. Try reviewing the draft in sections, or with fewer sources at a time.",
  "statements": [],
  "references": [],
  "meta": {
    "pipelineVersion": "v4",
    "incomplete": {
      "complete": false,
      "cause": "too_large",
      "howFar": "Of the 4000 sentences in your draft, 0 had been checked when it stopped.",
      "nextStep": "Try reviewing the draft in sections, or with fewer sources at a time.",
      "account": "too_large",
      "expectedSentences": 4000,
      "reachedSentences": 0
    },
    "preflight": {
      "wordCount": 80000,
      "statementCount": 4000,
      "totalTokens": 1172198723,
      "tpmFloorMs": 35165962,
      "idleWallMs": 31543516,
      "capMs": 300000
    }
  }
}
```

Ben ruled the wording 2026-09-25. Screen copy is `REVIEW_COPY` plus how-far plus `REVIEW_NEXT_STEP`. The recorded `cause` and `account` are the slug. Display wording does not go into the stored account.

## 2.2 The new guard line

Named constants (`lib/qc/review-deadline.mjs`):

- `PREFLIGHT_PIN_DRAFT_WORDS = 3698`
- `PREFLIGHT_PIN_SOURCE_WORDS = 3558`
- `PREFLIGHT_PIN_EST_TOKENS = 5459667`
- `PREFLIGHT_PIN_IDLE_MS = 146918`

Measurement: B277 Run 4, 3698-word draft, 3558-word source, wall 266680 ms, last wait 119762 ms, idle remainder 146918 ms. Estimator tokens at that cell from B328. Predicted idle wall = `totalTokens / 5459667 * 146918`.

Refuse when idle wall > 300 s AND TPM floor > 300 s. Never refuse draft words <= 3698 AND max source words <= 3558.

Against the B163 twenty, as a single source:

- 500-word draft: refuses **none**.
- 1,500-word draft: refuses **none**.
- 3,698-word draft: refuses **d01** (24,473) and **d13** (36,853).

The source-length grid predicted 3698 x 11860 (d12) would succeed on idle wall (211 s) and fail on busy wall (383 s). This guard **accepts** that cell. Fail-safe. It does not refuse a combination the grid predicted would succeed on idle. Busy-window death is the deadline path, not a pre-flight refuse.

It does not refuse 3698 x 3558, which the product handled in B277 Run 4.

## 2.3 What this cannot catch

A deadline is a prediction of remaining wall, checked after Stage 1 and after the pipeline returns. It cannot catch:

- Vercel SIGKILL / `FUNCTION_INVOCATION_TIMEOUT` during an in-flight LLM call that started with time left. The process never runs the catch. The client still sees no JSON (`fetch failed` / 504). Same class as B163 d13.
- Extraction that consumes the 300 s before Stage 1 (B315). The deadline check has not run yet.
- A missing ALS budget (fail-safe: we do not abort). Production opens one.

Those still need the platform to return a body, which it does not.

-----------------------------------------------------------------------------
COST
-----------------------------------------------------------------------------

USD 0. No model calls. No production Review.

-----------------------------------------------------------------------------
NOT BUILT
-----------------------------------------------------------------------------

Progressive delivery. Re-review. Caching finished work. Estimator internals. Any change to a completed review, including `not_reviewed` stamps.
