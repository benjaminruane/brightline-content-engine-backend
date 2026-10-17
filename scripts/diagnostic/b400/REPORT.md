# B400. A card with no factual badge

| | |
|---|---|
| SHIPPED | backend SHIP VERIFIED  cde0687  main  167 files  1828 tests. frontend SHIP VERIFIED  252b43e  main  46 files  264 tests |

USD 0. No model call.

## Flag

`QC_UNBADGED_RESIDUE` defaults on.

All three residue cards carry a real note about the sentence. None is the B369 filler "A source passage is shown on this card."

3i S4, `tests/fixtures/real-runs-2026-09-29/clean-review.json`, index 4. `displayVerdict` `supported_full`. Commentary: "The source confirms the statement by indicating that year-to-date like-for-like trading remains good despite a decline in consumer confidence since the summer. The wording in the source closely matches the statement, affirming its accuracy."

3i S14, same file, index 14. `displayVerdict` `supported_full`. Commentary: "The source confirms the statement by indicating that management remains cautious about deploying capital into new investments. It also states that they are open to selective allocations, particularly to lower-risk reinvestments in businesses they are familiar with and trust."

GP Industries S2, `tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json`, id 2. `displayVerdict` `supported_full`. Commentary: "The source confirms that the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness. The source explicitly states that the move will achieve these objectives, aligning with the statement."

Those three stored cards say Confirmed today, not "Not reviewed". The badge-less state is what replaces a factual badge, including the amber "Not reviewed" a sentence used to fall into when it had no badge of its own.

A reviewer now sees the existing note, a hollow slate ring, and no badge word.

## What shipped

`factualBadge` is written beside `displayVerdict` in `assembleCard`. Missing or true keeps today's badge. False is only the B397 residue class, and only when the evidence check ran and the verdict is not "not reviewed". Polarity, benchmark, and set keep the badge, which is why the class stays those three sentences and not HICL S6 or ClearPoint S5.

`displayVerdict` is unchanged. "not reviewed" still means the check did not run.

## Files

Backend:

- `lib/qc/pipeline-v3/stage7-assemble-card.mjs`
- `lib/qc/evidence-display-verdict.mjs`
- `lib/qc/review-summary.mjs`
- `lib/qc/export-review-data.mjs`
- `lib/qc/summary-bullets.mjs`
- `lib/revise-actions/silence.mjs`
- `api/_lib/env-flags.js`
- `tests/b400-unbadged-card.test.mjs`
- `tests/b232-export-verdict-label.test.mjs`
- `tests/b245-export-and-payloads.test.mjs`
- `tests/b296-card-colour-grid.test.mjs`
- `tests/health-build-and-flags.test.mjs`
- `tests/fixtures/review-summary-cases.json`
- `docs/ARCHITECTURE.md`
- `docs/BACKLOG.md`

Frontend:

- `src/modules/drafting/StatementReviewCard.jsx`
- `src/modules/drafting/displayVerdictLabels.js`
- `src/modules/drafting/verdictColors.js`
- `src/modules/drafting/checkStateDisplay.js`
- `src/modules/drafting/reviewSummaryDisplay.js`
- `src/modules/drafting/riskBucket.js`
- `src/modules/drafting/actionListDisplay.js`
- `src/modules/drafting/cardExcerptDisplay.js`
- `src/utils/summariseReview.js`
- `src/utils/resultsScreenClaims.js`
- `tests/b400-unbadged-display.test.mjs`
- `tests/b232-display-verdict-label.test.mjs`
- `tests/review-summary-surfaces.test.mjs`

`tests/b250-failed-match-not-supported.test.mjs`, `tests/b259-unlocatable-excerpt.test.mjs`, `tests/b366-party-and-empty-quote.test.mjs`, and `tests/b369-quote-without-comment.test.mjs` were not edited. They passed.
