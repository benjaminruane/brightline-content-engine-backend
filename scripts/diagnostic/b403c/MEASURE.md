# B403C. Measurement

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  99d6b14  main  171 files  1861 tests |
| Cost | Estimate printed before the run, no cache assumed, output ceiling 300 tokens. 76 calls, 288234 input tokens at chars/4, USD 2.0112 list. Model `claude-opus-4-7`. Ceiling USD 3. Not crossed. Measured list and discounted USD 2.622955, 80 calls, input 463721, output 12174, cached 0. Opus has no cached rate, so the two figures are equal. Source: `spend` in `scripts/diagnostic/b403c/runs/reading.json`. |
| Gate | `QC_B403C_READING=1`. |

## Clean ledger

`scripts/diagnostic/b403c/CLEAN-LEDGER.md` is the count used here and after. 38 clean statements. Firm errors: 3i clean S0, HICL clean S1, HICL clean S2. Soft: 3i clean S11. Rejected, not errors: 3i clean S6, GP Industries clean S3. The other 34 are correct. A mark on one of those 34, or on a rejected item, is noise.

## Why the list stops at six

The closed list is budget, expectation, forecast, guidance, target, consensus, plus the ordinary plurals budgets, expectations, forecasts, and targets. A word earns a place only when a swap inside the set always changes the claim. Outlook, estimate, plan, and assumption do not: each is often the same claim as forecast or guidance. Several and numerous are not elements. Two can be called several.

A hyphen before the word is not a boundary. The first count was 14, because ClearPoint S8 clean and doctored each contributed `MRI-guidance` as well as the free-standing word guidance. That compound is not a benchmark swap. With the hyphen excluded, the count is 12 occurrences, 10 matched, and the only two not_found are HICL clean S2 and HICL doctored S2, both `budgets`. That is the count this spec asked to confirm, so the note run went ahead.

## Why the note is Opus

Sonnet filed 41 of 76 statements as conflicts, which empties the label. Its 3i clean S2 note argues about the Infrastructure return on a sentence about Action. Its escalation of 3i clean S6 is a false positive under the ledger, not a catch. Opus leaves S6 alone, which is correct, and the benchmark element covers budgets without the model's help. The note step is `claude-opus-4-7`. Temperature is omitted, which is the handling already in place. The prompt was not rewritten for this pass.

## A year is weak evidence

The threshold is 8. A date that hits more lines than that is matching a season or a year, not a passage. On these eight drafts the next date below the line hits 3 lines (May 2026, and 2027). Full dates that repeat on a title and a table stay under 8, and their extracts still show.

Three date elements are above the line. The card shows the count and no extracts. The fact still keeps every line.

- ClearPoint clean S9, `2026`, 33 lines.
- ClearPoint clean S0, `first quarter of 2026`, 19 lines.
- ClearPoint doctored S0, `first quarter of 2026`, 19 lines.

The quarter phrase is the same weakness as the bare year: it agrees with every date in that quarter. No other date on these drafts is over 8, so the threshold stays.

## Header wording

The numbers line always has four clauses, including zeros. There is no percentage. `glance` does not take a plural. `1` is written out only for the three count clauses and for the second sentence.

Facts clause, for any count including 1 and 0: `N of M facts matched`.

Look clause: `1 to look at` when demands is 1, otherwise `N to look at`.

Glance clause: `1 worth a glance` when light is 1, otherwise `N worth a glance`.

Wording clause: `1 wording note` when the count is 1, otherwise `N wording notes`.

The four clauses joined: `N of M facts matched · {look} · {glance} · {wording}`.

The second sentence, first match wins. Banned words stay banned: verified, confirmed, clean, checked-off, ready-to-send.

- One fact not in the source: `1 fact is not in the source.`
- More than one: `N facts are not in the source.`
- No missing fact, one conflicts statement: `Figures all check out, but 1 statement conflicts with the source.`
- No missing fact, more than one conflicts statement: `Figures all check out, but N statements conflict with the source.`
- No missing fact, no conflicts, one beyond, no wording note, no withheld note: `Figures all check out. 1 statement goes further than the source does.`
- The same with more than one beyond: `Figures all check out. N statements go further than the source does.`
- No conflicts, no beyond, no withheld note, including a draft whose only notes are wording: `Well sourced. Every figure, date and name in this draft appears in the source, and nothing reads as going beyond it.`
- Only withheld notes: `1 statement needs a look.` or `N statements need a look.`
- Beyond mixed with a wording note, and no demands: no second sentence.
- Beyond mixed with a withheld note: no second sentence.

`note_withheld` is demands. It is the state for a refused note, and it must not be quiet and must not take the positive line by itself. This run had no withheld note after the retry.

Tiers: demands is `not_in_source`, `conflicts`, and `note_withheld`. Light is `beyond`. Quiet is `nothing_to_raise`. A wording note stays on that last state and never sets a tier.

## P1. Doctored statements flagged

25 of 25. Flagged means the tier is not quiet. Regressions against the B403B Opus run: none. Four first replies were refused because the bucket field was not one word. Each retry was accepted. No statement was left as needs a look.

## P2. Clean statements by tier

| Draft | Demands | Light | Quiet |
|---|---:|---:|---:|
| 3i | 1 | 1 | 13 |
| HICL | 2 | 1 | 5 |
| GP Industries | 0 | 1 | 4 |
| ClearPoint | 0 | 2 | 8 |
| Total | 3 | 5 | 30 |

Demands is 3, inside the bar of 4. Demands plus light is 8, on the bar of 8.

## P3. What each mark is

Demands, all three firm errors:

- 3i clean S0, conflicts, demands. The source states the six months to 30 September 2025. The statement says 30 June 2025. The date element still matches, because 30 June 2025 is a different statistic in the same source. The note is what marks it.
- HICL clean S1, not in the source, demands. The missing fact is the name HCIL. The note called it wording. The missing name sets the state.
- HICL clean S2, not in the source, demands. See P4.

The soft error, 3i clean S11, was not marked. Opus filed it as wording, so the tier is quiet. The note treats the 9% return and the 3iN outperformance as the same assertions in different words. The ledger calls that unsupported attribution. It was not caught.

Light, five. Each sits on a statement the ledger calls correct, so each is noise. None is in demands.

- 3i clean S7, beyond. "Meaningful" for a saving the source states as EUR 14 million.
- HICL clean S5, beyond. The statement adds valuation gains.
- GP Industries clean S1, beyond. The note says the source does not state a count of one plant in China.
- ClearPoint clean S1, beyond. The note says the statement adds a cause for the revenue growth.
- ClearPoint clean S9, beyond. The note says the source does not call the range updated guidance.

Noise in demands: 0.

## P4. The two budgets sentences

Both are `not_in_source`, tier demands. The benchmark element marks both: `budgets` is not_found. The note also marks both, bucket conflicts. The missing element sets the state, because a missing fact beats the note.

The card shows `budgets, not in the source`. Beside it, the benchmark words the source does use, each with its first line:

- expectations, L22. "Portfolio performance in line with expectations, with capex programmes across HICL's growth assets continuing to drive EBITDA growth."
- forecast, L25. "Dividend outlook reaffirmed, with the Company on track to deliver its target dividend of 8.35p per share for the year ending 31 March 2026 (forecast cash cover of c.1.1x) and reiterating its target dividend of 8.50p per share for the year ending 31 March 2027."
- guidance, L40. "Cash generation from the PPP portfolio continues to be in line with expectations, underpinning dividend cover in line with market guidance."
- target, L16. "HICL has delivered robust operational performance during the period, with capex programmes driving EBITDA growth, alongside resilient cash generation across the portfolio, supporting our confidence in achieving our target dividend cash cover of 1.1x for the year."

No sentence of explanation is stored on the fact. The same four source words are shown for the clean sentence and the doctored sentence, because they share the source.

## P5. The two rejected items

3i clean S6 is quiet. The note is wording: two financing transactions, called several. GP Industries clean S3 is quiet. The note is wording: Johor, and Malaysia as the country. Neither is marked. Neither is noise.

## P6. Benchmark elements

12 occurrences. 10 matched. 2 not_found. No false positive. Each matched word occurs in the source as that word. Both missing words are `budgets`, and the source does not use budgets.

| Draft | Statement | Word | Status |
|---|---|---|---|
| 3i clean | S11 | expectations | matched |
| 3i doctored | S11 | expectations | matched |
| HICL clean | S0 | expectations | matched |
| HICL clean | S2 | budgets | not_found |
| HICL clean | S3 | forecast | matched |
| HICL doctored | S0 | expectations | matched |
| HICL doctored | S2 | budgets | not_found |
| HICL doctored | S3 | forecast | matched |
| ClearPoint clean | S8 | guidance | matched |
| ClearPoint clean | S9 | guidance | matched |
| ClearPoint doctored | S8 | guidance | matched |
| ClearPoint doctored | S9 | guidance | matched |

Source words shown beside each not_found are expectations, forecast, guidance, and target, with the lines in P4.

## P7. Header line for each draft

- 3i clean: `38 of 38 facts matched · 1 to look at · 1 worth a glance · 11 wording notes`. Second sentence: `Figures all check out, but 1 statement conflicts with the source.`
- 3i doctored: `35 of 38 facts matched · 5 to look at · 2 worth a glance · 7 wording notes`. Second sentence: `3 facts are not in the source.`
- HICL clean: `16 of 18 facts matched · 2 to look at · 1 worth a glance · 4 wording notes`. Second sentence: `2 facts are not in the source.`
- HICL doctored: `10 of 20 facts matched · 8 to look at · 0 worth a glance · 0 wording notes`. Second sentence: `10 facts are not in the source.`
- GP Industries clean: `23 of 23 facts matched · 0 to look at · 1 worth a glance · 2 wording notes`. No second sentence. One statement goes further, and two wording notes are on the same draft.
- GP Industries doctored: `18 of 23 facts matched · 4 to look at · 1 worth a glance · 0 wording notes`. Second sentence: `5 facts are not in the source.`
- ClearPoint clean: `32 of 32 facts matched · 0 to look at · 2 worth a glance · 5 wording notes`. No second sentence. Two statements go further, and five wording notes are on the same draft.
- ClearPoint doctored: `28 of 30 facts matched · 6 to look at · 1 worth a glance · 3 wording notes`. Second sentence: `2 facts are not in the source.`

## P8. Cost

USD 2.622955 for eight drafts, 80 calls. Per draft, USD 0.327869. For 2,000 drafts, USD 655.74. List and discounted are the same figure.

## Criteria

| Criterion | Result |
|---|---|
| P1 is 25 of 25 | Met |
| P2 within both bars | Met. Demands 3. Demands plus light 8. |
| P3 noise in demands is 1 or fewer | Met. 0. |
| P5 quiet on both | Met |
| P6 no false positive | Met |

## Callers

`extractElements` is called from `lib/qc/reading-contract.mjs` (`buildFacts`), `scripts/diagnostic/b392/cross-table.mjs`, `scripts/diagnostic/b396/element-check-nine.mjs`, `scripts/diagnostic/b397/classify.mjs`, `scripts/diagnostic/b398/bind.mjs`, and `scripts/diagnostic/b401/reviewer-cost.mjs`. A re-run of those diagnostics on text that contains a benchmark word will count that word as an element. Stored results from earlier passes are unchanged. `elementFound` for a figure, a date, or a name is unchanged. `locateElement` is still called only from `buildFacts`. `benchmarksInSource` is new and is called when a benchmark fact is not_found.

Card assembly does not call the reading contract. A live Review does not show the tier, the benchmark card, or the new header until a later spec wires them. The frontend repo was not touched.
