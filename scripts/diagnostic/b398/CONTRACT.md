# B398. A card with no factual badge

Not implemented. B397 showed the contract has no such state. `displayVerdict` is set in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` by `mapSupportStateToDisplayVerdict` (the map is at line 444, the assignment at line 681). The map returns `supported_full`, `supported_partial`, `conflict`, `not reviewed`, or `not_supported`. `applyExcerptHonestyToDisplay` can replace a supported card that has no usable excerpt with `unverifiable`.

`lib/qc/evidence-display-verdict.mjs` maps a blank and the string "not reviewed" to the label "Not reviewed". Every other slug becomes a factual label, and an unknown slug becomes "Unverifiable". The frontend copy in `src/modules/drafting/displayVerdictLabels.js` does the same. `verdictToTone` in `src/modules/drafting/verdictColors.js` paints a blank and "not reviewed" amber.

The agreed design needs the model's note and an outline mark, and no factual badge. "Not reviewed" in amber is the state that was rejected.

## Two shapes

A new `displayVerdict` value, for example `outline`. Every current reader treats an unknown slug as Unverifiable or as not checked. The new value would read as a factual badge until each of those readers was updated, which is the failure the design is trying to leave.

A separate field that says whether a factual badge applies at all. `displayVerdict` stays the evidence result for sentences that are in the factual check. The new field tells the screen to draw no badge. Old cards, which lack the field, keep the badge they have.

The separate field is the one to build.

## C1. The field, and who reads it

Add `factualBadge` on the card. Boolean. Missing or true means the badge is the current `displayVerdict` label. False means the evidence row shows no factual badge: no "Confirmed", "Conflicting", "No support", "Unverifiable", or "Not reviewed". The row keeps the model's note and draws an outline mark. The tone is not green, not red, and not the amber used for "Not reviewed".

The writer is `assembleCard` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs`, beside the `displayVerdict` assignment.

Readers, and what they would show when the field is false:

| File | What it does now | With the field false |
|---|---|---|
| `lib/qc/evidence-display-verdict.mjs` `evidenceDisplayVerdictLabel` | Blank and "not reviewed" become "Not reviewed". Other slugs become a factual label. | Returns no label. |
| `lib/qc/evidence-display-verdict.mjs` `evidenceCountClass` | Blank and "not reviewed" count as not checked. | Counts as the new class in C2. |
| `lib/qc/evidence-display-verdict.mjs` `normalizeExportVerdict` | Blank and "not reviewed" export as null. Other slugs export a factual label. Unknown exports "Unverifiable". | Returns null, and the caller in C4 must not replace that null with "Not checked". |
| `lib/qc/review-summary.mjs` | Counts the card through `evidenceCountClass`. | Uses the new class. |
| `lib/qc/export-review-data.mjs` `buildReviewData` | A "not reviewed" slug exports as not checked. | Exports the note and an empty evidence verdict. |
| `lib/revise-actions/silence.mjs` | Treats `displayVerdict` "conflict" as a structural conflict. | Does not treat an unbadged card as a conflict. |
| Frontend `src/modules/drafting/displayVerdictLabels.js` | Same labels as the backend. | Returns no label. |
| Frontend `src/modules/drafting/verdictColors.js` | Blank and "not reviewed" are amber. `supported_full` is green. Conflict and no-support are red. | Outline, not amber. |
| Frontend `src/modules/drafting/StatementReviewCard.jsx` | The evidence row uses `evidenceDisplayVerdictLabel`. | The row shows the outline and the note, and no badge word. |
| Frontend `src/modules/drafting/checkStateDisplay.js` | Passes the label through. | Passes the empty label. |
| Frontend `src/utils/resultsScreenClaims.js` | Prints the evidence label. | Prints no evidence label on that row. |
| Frontend `src/utils/summariseReview.js` | Classifies `displayVerdict` locally, in parallel with the backend. | Uses the same new class as C2. |
| Frontend `src/modules/drafting/actionListDisplay.js` | Drops a card whose verdict is "not reviewed" from the action list. | Drops an unbadged card as well. It is not an evidence action. |
| Frontend `src/modules/drafting/cardExcerptDisplay.js` | A conflict verdict changes the excerpt treatment. | An unbadged card is not a conflict excerpt. |
| Frontend `src/modules/drafting/DraftContextPanel.jsx` | Skips a card with a null verdict. | An unbadged card stays in the draft context and shows no badge. |

## C2. The quality summary

`evidenceCountClass` needs a new class, `unbadged`. The summary counts it on its own line. It does not add the card to confirmed, partial, conflicting, not supported, unverifiable, or not checked. A sentence with no factual badge is not a failed check and it is not a pass.

The frontend classifier in `src/utils/summariseReview.js` has the same branches and needs the same class. If only one side learns the class, the on-screen summary and the stamped summary diverge.

## C3. "not reviewed"

It survives. It still means the check did not run: `supportState` "skipped", `commentaryNotReviewed`, a check that was turned off, and the B322 path only where it already sets `unverifiable` rather than "not reviewed". It does not mean "this sentence is characterisation". An unbadged sentence is `factualBadge: false`. It is not stored as "not reviewed".

## C4. Export

`normalizeExportVerdict` needs to see the field. When `factualBadge` is false it returns null, and `buildReviewData` must not then substitute the not-checked label it uses for a "not reviewed" slug. The export cell is empty. The note still exports. There is no new export word.

## C5. Tests that would have to change

- `tests/b232-export-verdict-label.test.mjs`
- `tests/b245-export-and-payloads.test.mjs`, where the export row is assembled
- `tests/b296-card-colour-grid.test.mjs`
- Frontend `tests/b232-display-verdict-label.test.mjs`
- Frontend `tests/review-summary-surfaces.test.mjs`

These stay as they are, because "not reviewed" survives for a check that did not run:

- `tests/b250-failed-match-not-supported.test.mjs`
- `tests/b259-unlocatable-excerpt.test.mjs`
- `tests/b366-party-and-empty-quote.test.mjs`
- `tests/b369-quote-without-comment.test.mjs`
