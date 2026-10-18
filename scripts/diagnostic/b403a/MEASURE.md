# B403A. Measurement

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  5b3da79  main  169 files  1851 tests |
| Cost | Estimate printed before the reported run: primary 76 calls, 279820 input tokens at chars/4, output ceiling 300, USD 0.9275 list, `gpt-4o-2024-08-06`, no cache assumed. Part 7: 38 calls, 139901 input tokens at chars/4, output ceiling 300, USD 0.9845 list, `claude-opus-4-7`. Part 7 ceiling USD 3. Not crossed. Reported primary: 78 calls, input 242696, cached input 191488, output 4102, USD 0.408400 discounted, USD 0.647760 list. Reported part 7: 41 calls, input 232636, cached input 0, output 5821, USD 1.308705 discounted and list. Source: `spend` and `part7.spend` on `scripts/diagnostic/b403a/runs/reading.json`. |
| Gate | `QC_B403A_READING=1`. |

Two earlier passes are not this table. A first primary run finished in memory and died on the first Opus call, because that model rejects `temperature`. Last printed discounted figure USD 0.392840. Call count and list USD were not stored. The rejected Opus call returned no usage. A second pass completed before empty notes were refused: primary 78 calls, USD 0.353120 discounted, USD 0.633760 list; Opus 38 calls, USD 1.181690. That artefact is `scripts/diagnostic/b403a/runs/reading-before-empty-note.json`. The numbers below are the pass after the empty-note refusal.

Facts use whole-source presence. The line of a hit comes from `locateElement` in `lib/qc/b394-elements.mjs`. The note is one call per statement, retried once when `acceptNote` refuses it. The run is the eight drafts in `scripts/diagnostic/b401/reviewer-cost.mjs`. Writer notes from B402 are not repeated.

The footnote on every draft is: "Your facts are matched against the source and your interpretation is read and commented on. Your judgement still decides."

Structured output is the existing `responseFormat: "json"` path. OpenAI sends `response_format: { type: "json_object" }`. Anthropic sends an open tool schema. Neither is an enum. The pipe-joined bucket literal is not in the prompt. `acceptNote` allows only the four words, and it refuses an empty note unless the bucket is `none`.

`claude-opus-4-7` rejects a temperature field. `callLLM` still defaults temperature to 0, so every existing caller is unchanged. This measurement passes `null` for the Anthropic calls only, and the Anthropic request omits the field when the value is null. OpenAI still receives 0.

## How each draft would render

| Draft | Numbers | Line |
|---|---|---|
| 3i clean | 37 of 37 facts matched · 12 statements to look at | Figures all check out, but 1 statement conflicts with the source. |
| 3i doctored | 34 of 37 facts matched · 13 statements to look at | 3 facts are not in the source. |
| HICL clean | 14 of 15 facts matched · 5 statements to look at | 1 fact is not in the source. |
| HICL doctored | 8 of 17 facts matched · 8 statements to look at | 9 facts are not in the source. |
| GP Industries clean | 23 of 23 facts matched · 3 statements to look at | Figures all check out, but 1 statement conflicts with the source. |
| GP Industries doctored | 18 of 23 facts matched · 5 statements to look at | 5 facts are not in the source. |
| ClearPoint clean | 30 of 30 facts matched · 4 statements to look at | No second sentence. Wording and beyond, no conflicts. |
| ClearPoint doctored | 26 of 28 facts matched · 9 statements to look at | 2 facts are not in the source. |

HICL clean was 14 of 16 in B402, with the line "2 facts are not in the source." The dropped element is "five". The remaining absent fact is HCIL. The denominator is 15.

## The period rule

A cardinal that states the length of a period is not an element only when the source does not write that cardinal and the same sentence has a date the source also states. On these eight drafts the only removal is HICL clean S0, "five". 3i "six" and "nine" stay, because the source writes them. HICL doctored "six months to 31 December 2025" stays, because that date is not the source period.

## M1. sentenceState null

0. B402 left six statements with no state.

## M2. Refused notes

Primary, `gpt-4o-2024-08-06`, all eight drafts. Before the retry: 2. Both are endorsing language ("aligns with"). 3i clean S2 and 3i doctored S2. After the retry: 0. Schema echoes: 0.

Part 7, `claude-opus-4-7`, four clean drafts. Before the retry: 3. 3i clean S13, HICL clean S0, ClearPoint clean S9. The bucket field was null, reason `bucket`. After the retry: 0. Schema echoes: 0.

## M3. Disputed links

45 resolved, 0 rejected. B402 resolved 1 of 29, and the other 28 were surfaces the statement did not contain. This run asks for an index into that statement's fact array. A surface is only a fallback, and a leading "name: " or "figure: " is stripped before that fallback. Nothing needed the fallback. One resolved index is the wrong fact: 3i clean S11 disputes "six", and the note is about outperformance.

## M4. Matched facts with no line

0 of 190. `lineGap` is false on every matched element. The extract is the matcher's line. A folded figure's line is the source's writing, so "GBP 3.3 billion" can extract as the line that says £3,291 million. The first hit wins when a token occurs more than once.

## M5. Doctored statements flagged

25 of 25. B402 was 24 of 25. The miss was ClearPoint doctored S8, which had no state. It is now `conflicts`. Regressions: none. A regression would be a statement B402 flagged that is now `nothing_to_raise`.

## M6. Clean statements marked

24 of 38. B402 was 13 of 38. Marked means the state is not `nothing_to_raise`. The six known errors from CLEAN-SET K3 are listed first.

Known errors, 5 of the 24. GPI S3 is the known error that is still `nothing_to_raise`.

- 3i S0, `conflicts`. The note names 30 September 2025 against 30 June 2025. Right.
- 3i S6, `worth_a_look`. The note says the two financing transactions can be read as the statement's "several". It does not say several is a different quantity.
- 3i S11, `beyond`. The note says the source does not mention outperforming expectations. That is wrong. The source says the infrastructure asset portfolio within 3iN outperformed its expected returns. The disputed fact is "six".
- HICL S1, `not_in_source`. The note names HCIL against HICL. Right.
- HICL S2, `worth_a_look`. The note names "budgets" against "expectations". The words are right. The bucket definition calls this conflicts, and the model said wording.

Notes worth having, 8. Each names a real addition or a real change of words.

- 3i S1, `beyond`. "Vast majority" is not in the source.
- 3i S2, `worth_a_look`. The statement makes Action the driver. The kept note says that. The first reply was refused for "aligns with".
- 3i S8, `worth_a_look`. "Significant proceeds" against the source's £944 million.
- 3i S10, `worth_a_look`. "Sale" and "exit" against "realisation".
- HICL S5, `beyond`. "Valuation gains" against growth in EBITDA in line with the valuation assumption.
- HICL S6, `worth_a_look`. The note quotes the oversubscribed refinancing and the step-down on debt margins.
- ClearPoint S1, `beyond`. "Driven by" the installed base and IRRAflow is not in the source.
- ClearPoint S2, `worth_a_look`. B402 marked this conflicts. The note now treats "allowances for excess and obsolete inventory" as a rephrasing of "lower excess and obsolete inventory".

Noise, 11. The sentence is marked and the note does not name a real gap, or the note is wrong.

- 3i S4. "Healthy" against "good".
- 3i S5. The note explains that EUR 11.2 billion is the source's €11,229 million, and that 6.3% matches.
- 3i S7. The note says the statement conveys the same information.
- 3i S12. "Rephrases", with no gap named.
- 3i S14. "Rephrases", with no gap named.
- HICL S0. The note calls the statement a summary of operational performance. It does not treat "five" as a missing fact.
- GP Industries S0. "Intends to shift" against "is shifting".
- GP Industries S1, `conflicts`. The note says the source does not mention a plant in China, and then cites the China facility. The source says "its China facility". The definition of wording covers "one plant" from that singular. This run left it as conflicts, so the header still says one statement conflicts.
- GP Industries S2. The note says the same intention in different words.
- ClearPoint S5. A slight increase called broadly flat.
- ClearPoint S6. A close rephrasing of the biopharma-partner line.

## M7. Header lines

The table at the top is the render. No draft uses the positive well-sourced line. No statement is `note_withheld`.

## Bucket changes against B402

B402's bucket, or `refused` where the note was discarded.

| Statement | B402 | This run |
|---|---|---|
| 3i clean S0 | refused | conflicts |
| 3i clean S1 | none | beyond |
| 3i clean S2 | refused | wording |
| 3i clean S5 | none | wording |
| 3i clean S7 | none | wording |
| 3i clean S8 | none | wording |
| 3i clean S10 | none | wording |
| 3i clean S12 | refused | wording |
| 3i clean S14 | none | wording |
| 3i doctored S0 | refused | conflicts |
| 3i doctored S1 | none | beyond |
| 3i doctored S2 | refused | wording |
| 3i doctored S5 | refused | conflicts |
| 3i doctored S7 | none | wording |
| 3i doctored S10 | none | wording |
| 3i doctored S14 | beyond | conflicts |
| HICL clean S0 | none | wording |
| HICL clean S2 | refused | wording |
| HICL clean S6 | none | wording |
| HICL doctored S1 | refused | conflicts |
| HICL doctored S5 | refused | conflicts |
| GP Industries clean S0 | none | wording |
| GP Industries clean S2 | none | wording |
| GP Industries doctored S0 | refused | conflicts |
| GP Industries doctored S3 | refused | conflicts |
| ClearPoint clean S2 | conflicts | wording |
| ClearPoint clean S5 | none | wording |
| ClearPoint clean S6 | none | wording |
| ClearPoint doctored S5 | none | wording |
| ClearPoint doctored S6 | none | wording |
| ClearPoint doctored S8 | refused | conflicts |

ClearPoint clean S2 moved off conflicts. That is the allowances paraphrase. GP Industries clean S1 did not move. It is still conflicts on this model.

Primary bucket counts on 76 statements: conflicts 22, beyond 13, wording 24, none 17, withheld 0.

## Part 7. The stronger model

Same note step, four clean drafts only, `claude-opus-4-7`.

| | gpt-4o, four clean | Opus, four clean |
|---|---|---|
| Refusals before retry | 1 (3i S2, endorsing) | 3 (3i S13, HICL S0, ClearPoint S9, empty bucket) |
| Refusals after retry | 0 | 0 |
| Schema echoes | 0 | 0 |
| conflicts / beyond / wording / none | 3 / 4 / 17 / 14 | 2 / 8 / 18 / 10 |
| Cost | USD 0.204792 discounted, summed from the four clean segments of the running total | USD 1.308705 |

Notes whose text is wrong on the facts:

- gpt-4o, GP Industries S1. Says the source does not mention a plant in China. The source says "its China facility".
- gpt-4o, 3i S11. Says the source does not mention outperforming expectations. It does, for the 3iN portfolio.
- gpt-4o, 3i S6. Treats "several" as a reading of "two".
- Opus, 3i S6. Calls "several balance sheet transactions" a paraphrase of two financing transactions.

Opus is right on the two gpt-4o factual errors. GP Industries S1 becomes beyond, and the note says the source has a China facility and does not state the number of plants. The definition wanted wording, so the bucket is still one step harder than the design, and the header no longer says the draft conflicts. 3i S11 becomes beyond, and the note separates the 9% Infrastructure return from the 3iN outperformance. Opus also names "Malaysia" on GP Industries S3, which gpt-4o left as nothing to raise, and it marks ClearPoint S7 conflicts because the source says one clinical procedure and the draft says procedures. ClearPoint S2 stays wording on both, and the Opus note quotes both inventory phrases. HICL S2 stays wording on both. The words "budgets" and "expectations" are in the note. Neither model files that sentence as conflicts.

The note step should use `claude-opus-4-7`. The cheaper model states two absences that the source does not have. The difference on these four drafts is USD 1.103913 discounted (USD 1.308705 against USD 0.204792).
