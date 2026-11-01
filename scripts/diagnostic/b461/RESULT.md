# B461. Show what the product already knows.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.

A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.

## What was built

`lib/qc/reader-reason.mjs` is the one sentence under a raised verdict. The screen copy is `src/modules/drafting/readerReason.js`. They agree on every card of this pass. The export calls the same sentence.

The sentence is, in order: the prose already stored for the reader; a difference, summary, or evidence line already on the card; the partial sentence when this card is a partial; the source half of a stored note; the evidence line written from the stored passage. A wording note is not a candidate. A sentence that says the two sides agree is not a candidate. A sentence that fails the endorsement guard is not shown.

`applyReadingContract` stores that sentence on `displayedEvidenceProse` when the field would have been empty. On this pass the field is still empty, because the pass was stored before that write. The replay reads the other fields and produces the sentence. The next review stores it.

A partial card carries that stored partial sentence as a finding, including when the sentence state is beyond or not in the source. The state, the label, and the tier stay where they were.

To look at includes a beyond sentence. The flag is `needsAttention` in `lib/qc/review-summary.mjs` and the same check in `src/utils/summariseReview.js`.

A summary longer than three points keeps the first three and adds one line that says how many were cut. When editorial or compliance notes are among the cut points, that line names them. The same helper is in `lib/qc/summary-bullets.mjs` and `src/modules/drafting/reviewSummaryDisplay.js`.

`no_support` is named Does not support the statement. `not_reviewed` is named Not checked against the statement. Both stay amber.

## The 44

Empty reasons after the sentence is read: 0.

Reason was stored: 36. 21 were already a field on the card, a difference or a summary, and the screen was not reading it. 15 were the source half of a note already on the card. The agreement half of that note stays hidden.

Reason had to be stored: 8. The note was an agreement note, or it did not say what the source says. The passage was on the card. The evidence line the product already writes from a passage is now the sentence, and the writer stores it. The filename is not on this compact card, so the line says "The source" and the missing filename is logged.

## The other five

Export sentences that differ from the card: 0. Screen sentences that differ from the export: 0.

Beyond sentences left out of To look at: 0.

Partial or beyond headlines with no finding: 0.

Summaries that cut the list and do not say so: 0. Editorial or compliance notes cut and not named: 0.

The cut adds one line. 10 drafts go from 3 lines to 4. The three evidence points stay. The fourth line is the count, and it names editorial or compliance when those notes were among the points cut. It does not replace an evidence point with the editorial sentence.

- 08: 5 points, shown as 3 plus "2 more points are not shown, including editorial or compliance notes."
- 11: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 12: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 13: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 14: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 15: 5 points, shown as 3 plus "2 more points are not shown, including editorial or compliance notes."
- 16: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 17: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."
- 18: 5 points, shown as 3 plus "2 more points are not shown, including editorial or compliance notes."
- 19: 4 points, shown as 3 plus "1 more point is not shown, including editorial or compliance notes."

Amber classes with no name: 0.
- not_reviewed: Not checked against the statement:
- no_support: Does not support the statement:

## The guard, the notes, and the silences

Newly shown strings withheld by the endorsement guard: 0.

Wording notes on this pass: 115. Shown as the reason: 0. They stay on the card as a withheld note. The reader does not see them.

A silence written for a withheld sentence has an id and a count. It does not carry the sentence. None of these 261 needed one.

## Verdicts

261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier are the values on the stored card.

Labelled faults: 13 of 13.
Group A: 11 of 11.

Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the old definition.
Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the new definition.

These are the B460 figures. This spec does not move a verdict, so the leave-alone count is the same measurement as that replay.

## Eight cards

03:7. Conflicts with the source. State conflicts. Verdict supported_full. Tier demands.
This is Partners Group's tenth continuation vehicle investment in the past three years and the firm's second investment in Spain since 2023.
The source says Partners Group has completed ten continuation vehicle investments in the last three years, with the Gestcompost deal being one of them, and describes it as their second continuation vehicle investment in Spain since 2023. The statement calls it the firm's second investment in Spain since 2023 generally, rather than the second continuation vehicle investment in Spain.

06:5. Conflicts with the source. State conflicts. Verdict conflict. Tier demands.
Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period.
The sentence says "EBITDA margins have been broadly stable at around 14 percent". The passage says "EBITDA of EUR 31 million represented a margin of 14.2 percent".

08:3. Partly in the source. State partial. Verdict supported_partial. Tier light.
The Company's competitive position is exceptional.
The sentence says "exceptional". The passage does not.
The sentence says "exceptional". The passage does not.

01:4. Goes beyond the source. State beyond. Verdict supported_full. Tier light.
Shopify's strategic moat is its App Store, which two-thirds of customers actively use.
The source describes the App Store as "a big competitive differentiator" and says roughly two-thirds of customers use at least one app. It does not characterize the App Store as Shopify's "strategic moat," which adds a stronger claim than the source states.

01:5. Nothing raised. State nothing_raised. Verdict supported_full. Tier quiet.
The product is simple enough that a non-technical user can set up a fully functioning online store within a few hours.
(no reason under this label)

10:5. Not in the source. State not_in_source. Verdict supported_full. Tier demands.
The transaction represents the eighth investment from Meridian's European Industrials strategy.
The source states "The acquisition is the eighth investment from Meridian's flagship European Industrials strategy and brings the firm's total invested capital in the specialty chemicals sector to over EUR 2 billion across its global platforms.".

01:1. Not in the source. State not_in_source. Verdict supported_full. Tier demands.
The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today.
The source states customers increased from 5,500 a year ago to nearly 10,000 today.

01:0. Not in the source. State not_in_source. Verdict not reviewed. Tier demands.
Shopify (the "Company") is a Canadian e-commerce platform serving small and medium businesses, founded in 2007 in Ottawa.
The sources do not address the statement. They do not mention Shopify being a Canadian e-commerce platform serving small and medium businesses, nor its founding in 2007 in Ottawa.

## Tests

`tests/b461-shown-reason.test.mjs` is new. It locks the shared sentence, the hidden wording note, the passage line, a withheld certifying sentence, beyond inside To look at, the summary line, and the partial finding.

`src/modules/drafting/__tests__/b461-screen.test.js` is new. It locks the same sentence on the screen, the summary line, and the two class names.

`tests/b453-partial-finding.test.mjs` used to require an empty finding list when a supported_partial card's sentence state was not_in_source. That empty list is the defect. The test now requires the stored partial sentence, and it requires the state, the label, and the verdict to stay put.

No assertion was given an exemption.

## Files

- `lib/qc/reader-reason.mjs`. The sentence under a raised verdict, shared by the writer and the export.
- `src/modules/drafting/readerReason.js`. The same sentence on the screen. The screen cannot import the backend.
- `tests/b461-shown-reason.test.mjs`. Locks the sentence, the guard, the filter, and the summary line.
- `src/modules/drafting/__tests__/b461-screen.test.js`. Locks the screen copy.
- `scripts/diagnostic/b461/replay.mjs`. This measurement.
- `scripts/diagnostic/b461/RESULT.md`. This report.

## Browser

Not run against a Review. A Review would ask a model, and this spec spends nothing. The sentences, the filter flag, the summary line, and the class names are the functions above, measured on the stored pass.

