# B413. The review screen

Narrow screens are out of scope. The three columns are the desktop layout.

The passage change does not change stored statement text. The clean ledger stands: demands 3, light 5, quiet 30, noise in demands 0. No statement moves. No model call was made. USD 0.

`supported_full` is labelled **Nothing raised**. Green still means nothing was raised. The internal count class stays `confirmed`.

## S1. The header for both HICL drafts

HICL clean: `16 of 18 facts matched · 2 to look at · 1 worth a glance`

Then: `2 facts are not in the source.`

HICL doctored: `10 of 20 facts matched · 8 to look at`

Then: `10 facts are not in the source.`

A count of zero is left out. The doctored draft has nothing worth a glance, so that clause is not shown.

## S2. Marked statements, and word-level marks

Word-level marks are the B410 span list. Statement tint follows the sentence state, and a statement that has only an action mark is tinted with that mark.

HICL clean. 4 statements tinted. 4 word-level marks, on 3 of those statements.

| Statement | Tint | Word-level marks |
|-----------|------|------------------|
| S1 | red, not in the source | `HCIL`, and the action phrase about EBITDA growth |
| S2 | red, not in the source | `budgets` |
| S5 | amber, goes beyond the source | none |
| S6 | amber, from the action mark | the action phrase about debt servicing costs |

HICL doctored. 8 statements tinted, which is every statement. 11 word-level marks.

| Statement | Tint | Word-level marks |
|-----------|------|------------------|
| S0 | red | `HCIL Infrastructure`, `31 December 2025` |
| S1 | red | `30%`, `HCIL` |
| S2 | red | `budgets` |
| S3 | red | `Paris St. Germain High Speed` |
| S4 | red | `St. Germain` |
| S5 | red | `TowerCo` |
| S6 | red, conflicts | the action phrase about debt servicing costs |
| S7 | red | `CFO`, `French` |

## S3. The HICL clean draft

Tinted: S1 and S2 red, S5 amber, S6 amber because of its action mark.

Plain: S0, S3, S4, S7. Nothing was raised on those four, and they have no word mark.

## The eight HICL doctored passages

One passage per card. Where the stored passage already contains the counterpart, it is kept. Where it does not, the passage is the source sentence that does. A passage does not start or end mid-name.

| Card | Passage |
|------|---------|
| S0, the date | The Board of HICL is issuing this Interim Update Statement, which relates to the period from 1 October 2025 to 28 February 2026. |
| S0, the name | HICL Infrastructure PLC 04 March 2026 |
| S1 | HICL has delivered robust operational performance during the period, with capex programmes driving EBITDA growth, alongside resilient cash generation across the portfolio, supporting our confidence in achieving our target dividend cash cover of 1.1x for the year. |
| S2 | HICL's growth investments continue to perform well, progressing significant expansion capex programmes and delivering EBITDA in line with expectations. |
| S3 | London St. Pancras High Speed performed well in the period, with international train path bookings slightly ahead of forecast. |
| S4 | The period saw further progress in relation to a potential second international operator on the route, including announcements by Virgin Trains regarding its intentions for crossChannel operations from St. Pancras and approach to rolling stock procurement having been awarded depot capacity by the UK rail regulator. |
| S5 | Fortysouth delivered 16 new towers during the period and is actively progressing incremental co-location opportunities, both of which are expected to support continued growth in EBITDA in line with HICL's valuation assumption. |
| S6 | The company recently completed an accretive refinancing which was c.30% oversubscribed, and which enabled a step-down on debt margins earlier than forecast, underlining the quality and long-term visibility of Fortysouth's revenues. |
| S7, the appointment | During the period, the company appointed Mark Garth as Chief Executive Officer, who brings significant sector experience from United Utilities particularly in relation to achieving industry-leading operational performance. |
| S7, the white paper | The Company notes the publication of the UK Government white paper on water sector reform, which is largely consistent with the final recommendations of the Cunliffe Report, many of which are expected to be beneficial for strong performers such as Affinity Water. |

S0 and S7 each have two findings, so each has two lines. The second is the line that finding came from, not a second answer to the same question. S3 no longer starts at "Pancras".

## The five excerpt-blocked proposals

All five now pass `offeredTokenLicensedByExcerptTokens`, by the passage containing the counterpart or the form it was folded from.

| Proposal | Passage that licenses it |
|----------|--------------------------|
| AGIC to GIC | In September 2025, 3i acquired 2.2% of Action equity from GIC in exchange for newly issued 3i Group plc shares, with an equivalent consideration value of £739 million. |
| HCIL Infrastructure to HICL Infrastructure PLC | HICL Infrastructure PLC 04 March 2026 |
| 31 December 2025 to 28 February 2026 | The Board of HICL is issuing this Interim Update Statement, which relates to the period from 1 October 2025 to 28 February 2026. |
| Paris St. Germain High Speed to London St. Pancras High Speed | London St. Pancras High Speed performed well in the period, with international train path bookings slightly ahead of forecast. |
| -50% to 16% | Reported first quarter revenue of $12.1 million, including $2.3 million of IRRAflow revenue, representing 43% overall growth and 16% year-over-year total organic growth compared with the first quarter of 2025; |

B412 said three of the five would take the count from seven to ten. All five pass.

## S4. The Affinity Water card

The statement: Meanwhile, Affinity Water appointed a new CFO with significant sector experience and stands to benefit from the French government's recently published white paper on electricity sector reform.

The card had no passage. It now shows two verified proposals. Each quotes the line it came from.

CFO becomes CEO. The line: During the period, the company appointed Mark Garth as Chief Executive Officer, who brings significant sector experience from United Utilities particularly in relation to achieving industry-leading operational performance.

French becomes UK. The line: The Company notes the publication of the UK Government white paper on water sector reform, which is largely consistent with the final recommendations of the Cunliffe Report, many of which are expected to be beneficial for strong performers such as Affinity Water.

The label on each line is "Line it came from".

## S5. The proposal count

B412 offered 7 of the 15.

After the passage rule, the no-passage rule, and the outperform rule, 15 of the 15 are offered. Both false-proposal shapes are 0 among those offered. The bar holds. `QC_PROPOSALS` defaults on.

The outperform case is not one of the fifteen. "in line with budgets" becomes "in line with expectations" and is offered. "significantly outperform budgets" becomes "significantly outperform expectations" and is not offered.

## S6. Tests changed because Confirmed went

The label asserted for `supported_full` is now "Nothing raised".

Backend:

- `tests/evidence-card-no-excerpt.test.mjs`
- `tests/b232-export-verdict-label.test.mjs`
- `tests/b400-unbadged-card.test.mjs`
- `tests/excerpt-from-source.test.mjs`
- `tests/b245-export-and-payloads.test.mjs`
- `tests/fixtures/b245/meridian-2026-09-18.export.txt`
- `tests/b413-no-confirmed.test.mjs` (new)

Frontend:

- `tests/b232-display-verdict-label.test.mjs`
- `tests/b400-unbadged-display.test.mjs`
- `tests/b298-turned-off-line.test.mjs`
- `tests/b245-results-screen-claims.test.mjs`

The excerpt headings changed in `tests/card-excerpt-display.test.mjs` and `tests/proposal-preview.test.mjs`. "Confirmed excerpt" and "Conflicting excerpt" are now "Also appears at". The primary heading is "Source".

## S7. Decisions this spec left open

The wording for `supported_full` is "Nothing raised". "Partially confirmed" is unchanged. The count class slug `confirmed` is unchanged, so the summary buckets do not move. Green is unchanged.

A card with no passage labels the proposal's source line "Line it came from". A second line, when it is another place the same thing appears, is labelled "Also appears at".

"May 2026" is licensed by the line "SOLANA BEACH, Calif., May 13, 2026 (Newswire.com) - ClearPoint Neuro, Inc." The fitted form is not a contiguous string in that line. The line contains "May 13, 2026", which is the form the month was folded from, so the proposal is offered.

Where several sentences contain the counterpart, the earliest one that also shares the statement's words is kept. That is what sends UK to the Affinity Water white paper rather than an earlier UK in the document, and May 2026 to the dateline rather than the press-release kicker.

The title line "HICL Infrastructure PLC" is followed by "04 March 2026" with no sentence end between them, so the name passage includes that date line. It does not start mid-name.

Two proposals on one statement are both shown. Accepting both still applies neither, because a whole-statement splice cannot apply two writes. That constraint was already there.

The editorial check is still the structural one: a sentence newly over 40 words, the named cliches, and first person. No editorial model call.

The review screen sends the source text with the action list, so a proposal can be checked. With the flag on, that list calls the proposal model when the source text is present. If the source text is missing, the list logs and still returns. It does not throw.

The filter labels in the card column are "To look at" and "Conflicts with the source". Editorial and compliance stay, because they are not fact states.

The Verdicts toggle is remembered on the page for as long as it stays open, including across a new review.

Narrow screens stack. No separate narrow layout was built.
