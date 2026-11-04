# B462. One endorsement rule, no hidden summary lines, and a readable quote.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.

A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.

## What was built

The sixteen endorsement phrases live in `lib/qc/endorsement-phrases.mjs`. `NOTE_BANNED_PHRASES` is that list, so every existing importer still reads it from the reading contract. The screen reads the same records from `src/utils/endorsementPhrases.js`. A sentence that hits the list is not shown and is not rewritten. The reading note's own guard and the craft note's own guard are the same functions they were.

The agreement test stays in `lib/qc/source-account.mjs`. The equivalence filter stays in `lib/qc/evidence-line.mjs`. The screen copy of each is compared, pattern for pattern, by a test that names the other file when they diverge.

The summary cap is gone. `summaryBulletsFromReview` and `summaryBullets` return every check that has a non-zero count, in the same order and the same copy. The line that said how many points were cut is gone with the cap. The summary panel already renders every bullet it is given.

Where the reason is written from a stored passage, it quotes the one sentence of that passage that carries the most of what the statement turns on. A figure in the statement counts more than a shared word. Line breaks and runs of whitespace become a single space. A sentence that already ends keeps that one full stop. The quoted words are otherwise the source's words, and the sentence is a span of the whitespace-collapsed passage. When no sentence carries a figure the statement turns on, the whole passage is quoted, and that card is named below.

## The endorsement rule

Before: the screen's four-term check returned these five sentences. The backend returned an empty reason for every one.

- "The source states revenue of EUR 318 million, so the figure is verified."
- "The passage is supported by the source for this period."
- "The source states the headcount, aligning with the sentence."
- "The statement treats the pilot as a programme."
- "The sentence is stated without supporting context in the passage."

After: both sides return an empty reason for all five. None of the 261 stored reasons on this pass hits the list, so the guard withholds 0 sentences here. The fault was latent.

Backend and screen reasons that differ: 0.

## The summary

Before: 10 of 20 drafts kept the first three points and added a line of the form "N more points are not shown". The line cut was the editorial and compliance line.

After: drafts carrying that line: 0. Drafts whose editorial or compliance count is missing from the list: 0. Bullet lists that differ between the two sides: 0.

Line counts: 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5.

01: 3. 02: 3. 03: 2. 04: 3. 05: 3. 06: 3. 07: 2. 08: 5. 09: 3. 10: 1. 11: 4. 12: 4. 13: 4. 14: 4. 15: 5. 16: 4. 17: 4. 18: 5. 19: 4. 20: 2.

## The eight passage cards

Reasons that contain a line break: 0. Reasons that close a quote with a stop inside and a stop outside: 0.

One stored difference, 18:2, already ended its first quote with a full stop and then added another after the quotation mark. The extra stop after the mark is removed. The quoted words are unchanged. It is not one of these eight.

No card fell back to the whole passage. Each of the eight has one sentence that carries what the statement turns on.

### 10:5

Statement:

The transaction represents the eighth investment from Meridian's European Industrials strategy.

Stored passage:

The acquisition is the eighth investment from Meridian's flagship European Industrials strategy and brings the firm's total invested capital in the specialty chemicals sector to over EUR 2 billion across its global platforms.

Sentence chosen:

The acquisition is the eighth investment from Meridian's flagship European Industrials strategy and brings the firm's total invested capital in the specialty chemicals sector to over EUR 2 billion across its global platforms.

### 13:6

Statement:

The team is led by founder-CEO Mr. Tom Fairfield and CTO Mr. James O'Brien.

Stored passage:

CloudPivot was founded in London in 2014 by Tom Fairfield (currently CEO) and James O'Brien (currently CTO).

Sentence chosen:

CloudPivot was founded in London in 2014 by Tom Fairfield (currently CEO) and James O'Brien (currently CTO).

### 13:10

Statement:

Second, the Company's vertical product depth creates very high switching costs.

Stored passage:

Mission-critical software with very low churn. Once a forwarder is operating on CloudPivot, switching costs are very high. The platform integrates with customs authorities, carrier networks, and customer systems; reverting to alternative software would mean rebuilding all of these integrations. Gross retention of 94% reflects this.

Sentence chosen:

Once a forwarder is operating on CloudPivot, switching costs are very high.

### 15:13

Statement:

Our value creation plan envisages revenue growth from EUR 612 million to approximately EUR 1.04 billion by 2031, a 9.2% CAGR.

Stored passage:

Our base case envisages revenue growth from EUR 612 million in 2025 to approximately EUR 1.04 billion in 2031, a compound annual growth rate of 9.2%.

Sentence chosen:

Our base case envisages revenue growth from EUR 612 million in 2025 to approximately EUR 1.04 billion in 2031, a compound annual growth rate of 9.2%.

### 15:27

Statement:

Underlying relationships are stable but the dependency is noted.

Stored passage:

The wholesale channel - accounting for 14% of revenue - has meaningful customer concentration, with the top five wholesale accounts representing 40% of channel revenue. We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.

Sentence chosen:

We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.

### 17:2

Statement:

The Portfolio comprises 337,000 square metres of lettable area distributed across Greater London (89,000 sqm in three assets), Greater Paris (72,000 sqm in three assets), Greater Amsterdam (64,000 sqm in two assets), Greater Madrid (71,000 sqm in two assets), and Greater Milan (41,000 sqm in one asset).

Stored passage:

The Portfolio comprises 11 last-mile logistics assets totalling 337,000 square metres of lettable
area. Geographic distribution is: Greater London (3 assets, 89,000 sqm), Greater Paris (3 assets,
72,000 sqm), Greater Amsterdam (2 assets, 64,000 sqm), Greater Madrid (2 assets, 71,000 sqm),
and Greater Milan (1 asset, 41,000 sqm).

Sentence chosen:

Geographic distribution is: Greater London (3 assets, 89,000 sqm), Greater Paris (3 assets, 72,000 sqm), Greater Amsterdam (2 assets, 64,000 sqm), Greater Madrid (2 assets, 71,000 sqm), and Greater Milan (1 asset, 41,000 sqm).

### 17:4

Statement:

Occupancy is 96 percent and the weighted average unexpired lease term is 6.8 years.

Stored passage:

The Portfolio is 96% occupied, with weighted
average unexpired lease terms of 6.8 years.

Sentence chosen:

The Portfolio is 96% occupied, with weighted average unexpired lease terms of 6.8 years.

### 17:6

Statement:

Importantly, embedded rental reversion across the Portfolio is estimated at approximately 18 percent, concentrated in the London and Amsterdam assets where market rents have grown most rapidly over the past three years.

Stored passage:

Embedded rental
reversion is estimated at approximately 18% across the portfolio, with the strongest reversion
potential in the London and Amsterdam assets where market rents have grown most rapidly over
the past three years.

Sentence chosen:

Embedded rental reversion is estimated at approximately 18% across the portfolio, with the strongest reversion potential in the London and Amsterdam assets where market rents have grown most rapidly over the past three years.

## Verdicts

261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier are the values on the stored card. This replay does not write them.

Labelled faults: 13 of 13.
Group A: 11 of 11.

Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the old definition.
Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the new definition.

These are the B460 figures, measured the same way. This spec does not move a verdict.

Export sentence equals card sentence: 261 of 261.

## The guard and the notes

Reader-facing strings withheld by the endorsement guard: 0.

None. A withheld sentence would be listed here and would not be rewritten.

Wording notes on this pass: 115. Shown as the reason: 0.

## Tests

`tests/b462-endorsement-parity.test.mjs` names `src/utils/endorsementPhrases.js` and `src/modules/drafting/readerReason.js` when the phrase list, the agreement test, or the equivalence filter diverges. It requires the five probes to be empty on both sides, and the same reason on all 261 cards.

`src/modules/drafting/__tests__/b462-parity.test.js` names `lib/qc/endorsement-phrases.mjs`, `lib/qc/source-account.mjs`, and `lib/qc/evidence-line.mjs` when those copies diverge.

`tests/b462-summary-lines.test.mjs` requires the line counts 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, no disclosure line, the editorial or compliance line wherever that count is non-zero, and identical lists on both sides.

`tests/b462-passage-sentence.test.mjs` requires 17:2, 17:4, and 17:6 to quote a sentence that contains the figure, the quoted sentence to be a span of the collapsed passage, and no reason on the pass to contain a line break or a doubled full stop.

`tests/b461-shown-reason.test.mjs` required a fourth line that said the rest were not shown, and it required a full stop inside the quotation mark and another outside it. Both assertions locked the defects this spec removes. The summary fixture has six non-zero checks, because the unchecked count is its own line, so the test now requires those six lines and no disclosure. The two quote assertions now end on the stop inside the quotation mark.

`src/modules/drafting/__tests__/b461-screen.test.js` required the same disclosure line. It now requires every non-zero check, including the editorial line, and no disclosure.

`tests/b457-form-and-line.test.mjs` required `note states "Urban last-mile logistics is supported.".` The second stop was the defect. The assertion now ends on the stop inside the quotation mark. The quote that does not already end, `shopify-memo states "customers have increased from 5,500".`, still takes the one stop after the quotation mark.

`tests/b360-two-passages.test.mjs` required the evidence line to contain "two financing transactions". That phrase is a different sentence of the passage. The statement turns on the further 2.2% stake. The line now quotes that sentence, and the assertion matches it. The shown passage still contains the GIC slice, and it still does not name AGIC.

No assertion was given an exemption.

## Files

- `lib/qc/endorsement-phrases.mjs`. The sixteen phrases, stated once.
- `src/utils/endorsementPhrases.js`. The same records on the screen.
- `lib/qc/reading-contract.mjs`. `NOTE_BANNED_PHRASES` is that list. The stored evidence line is given the statement, so a future card stores the sentence rather than the whole passage.
- `lib/qc/evidence-line.mjs`. Collapses whitespace, picks the bearing sentence, and writes one full stop.
- `lib/qc/reader-reason.mjs`. Passes the statement into the evidence line. Removes a stop that sits after a quote which already ended.
- `lib/qc/source-account.mjs`. Exports the agreement patterns so the drift test can name them.
- `lib/qc/summary-bullets.mjs`. Returns every non-zero check.
- `lib/qc/assemble-card.mjs`. Passes the statement into the evidence line. The verbatim check stays on the full passage.
- `src/modules/drafting/readerReason.js`. The same phrase check, the same sentence, and the same one stop.
- `src/modules/drafting/reviewSummaryDisplay.js`. Returns every non-zero check.
- `tests/b462-endorsement-parity.test.mjs`. The drift lock, the five probes, and the 261 reasons.
- `tests/b462-summary-lines.test.mjs`. The line counts.
- `tests/b462-passage-sentence.test.mjs`. The three figures, the span, and the stops.
- `src/modules/drafting/__tests__/b462-parity.test.js`. The same lock, read from the screen.
- `scripts/diagnostic/b462/replay.mjs`. This measurement.
- `scripts/diagnostic/b462/RESULT.md`. This report.

## Browser

Not run against a Review. A Review would ask a model, and this spec spends nothing. The summary panel already renders every bullet it is given, so removing the cap does not change a container. The quote and the empty reason are the functions above, measured on the stored pass.

