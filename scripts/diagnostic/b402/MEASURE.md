# B402. Measurement

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  d45145e  main  168 files  1842 tests |
| Cost | Estimate printed before the run: 84 calls, 268353 input tokens at chars/4, output ceiling 300, USD 0.9229 list. No cache assumed. Ceiling USD 5. Not crossed. Measured: 85 calls, input 226245, cached input 179072, output 3534, USD 0.377113 discounted, USD 0.600953 list. The extra call is one writer-note retry. Model `gpt-4o-2024-08-06`. Source: `spend` on `scripts/diagnostic/b402/runs/reading.json`. |
| Gate | `QC_B402_READING=1`. |

Facts use whole-source presence. No matcher line was passed, so every matched element is `lineGap: true`. The note is one call per statement. The run is the eight drafts in `scripts/diagnostic/b401/reviewer-cost.mjs`.

The footnote on every draft is: "Your facts are matched against the source and your interpretation is read and commented on. Your judgement still decides."

## How each draft would render

| Draft | Numbers | Line |
|---|---|---|
| 3i clean | 37 of 37 facts matched · 6 statements to look at | No second sentence. One beyond, two wording, three refusals. |
| 3i doctored | 34 of 37 facts matched · 10 statements to look at | 3 facts are not in the source. |
| HICL clean | 14 of 16 facts matched · 4 statements to look at | 2 facts are not in the source. |
| HICL doctored | 8 of 17 facts matched · 8 statements to look at | 9 facts are not in the source. |
| GP Industries clean | 23 of 23 facts matched · 1 statement to look at | Figures all check out, but 1 statement conflicts with the source. |
| GP Industries doctored | 18 of 23 facts matched · 5 statements to look at | 5 facts are not in the source. |
| ClearPoint clean | 30 of 30 facts matched · 2 statements to look at | Figures all check out, but 1 statement conflicts with the source. |
| ClearPoint doctored | 26 of 28 facts matched · 7 statements to look at | 2 facts are not in the source. |

The two HICL clean facts that are not in the source are the figure "five" on S0 and the name "HCIL" on S1. "five" is the wrong flag from B397. The header leads with that count, so the wrong flag and the real misspelling share the line.

The 3i doctored writer note was refused. The other seven writer notes were stored.

## M1. The 37 planted substitutions

18 produce a `not_found` element. 25 produce a `conflicts` or `beyond` note. 11 do both. 5 produce neither.

Only `not_found`, 7: 3i-S0-a, 3i-S5-a, hicl-S1-a, hicl-S5-a, gpi-S0-a, gpi-S0-b, gpi-S3-a.

Only a conflicts or beyond note, 14: 3i-S8-a, 3i-S12-a, 3i-S14-a, hicl-S2-a, hicl-S6-a, hicl-S7-c, gpi-S1-b, gpi-S2-a, gpi-S4-a, gpi-S4-c, clearpoint-S3-a, clearpoint-S7-a, clearpoint-S9-a, clearpoint-S9-b.

Both, 11: 3i-S9-a, hicl-S0-a, hicl-S0-b, hicl-S3-a, hicl-S4-a, hicl-S7-a, hicl-S7-b, gpi-S1-a, gpi-S4-b, clearpoint-S0-a, clearpoint-S2-a.

Neither, 5:

- hicl-S5-b, "20 new towers". The figure "20" is in the source. The statement is `not_in_source` because hicl-S5-a, "TowerCo", is absent. The note on that statement was refused: the bucket field came back as the schema text `conflicts|beyond`.
- hicl-S5-c, "during the past year". No element in the written span. Same refused note.
- gpi-S0-c, "escalating oil prices". No element in the written span. The statement is `not_in_source` because the date and the 75% on that sentence are absent. Same kind of refused bucket, `conflicts|beyond`.
- clearpoint-S8-a, "the FDA". FDA is in the source. The note was refused for the same schema bucket. The statement has no state.
- clearpoint-S8-b, "has been commenced". No element. Same refused note. The statement has no state.

## M2. The three real errors, clean drafts

3i S0, the period date. No state. The note text was "The source states the total return was for the six months to 30 September 2025, not 30 June 2025." The bucket field was the schema text `conflicts|beyond|wording|none`, so the contract refused the note. The date is in the source on another sentence, so no element is `not_found`. The refusal is why the statement does not read "Conflicts with the source".

HICL S1, HCIL. `not_in_source`, label "Not in the source". The name is absent. The note was kept, bucket `conflicts`: "The statement uses 'HCIL' while the source uses 'HICL'."

HICL S2, "budgets". No state. The model wrote that the source's "expectations" aligns with the statement's point about budgets, and it labelled the bucket `wording`. `acceptNote` refused it for "aligns with". The endorsement is not on the card. The conflict is not the state either. "budgets" is not a figure, a date, or a name, so the facts on that sentence do not catch it.

## M3. Wording on the 32 genuinely clean statements

1. 3i S4. The note quotes the source line on year-to-date like-for-like trading. The other wording note in the clean set is 3i S6, "several" against "two financing transactions", and that statement is one of the six known errors, so it is not in this 32.

## M4. Endorsing notes that landed

0. Seven texts were refused and not stored. Six are statement notes: 3i clean S2, 3i clean S12, 3i doctored S2, HICL clean S2, GP Industries doctored S3, ClearPoint doctored S8. One is the 3i doctored writer note. Five of the six statement notes were refused for "aligns with" or "aligning with". GP Industries doctored S3 was refused because it says the source confirms the Johor investment.

## M5. Rejected disputed surfaces

28, all `not_in_statement`. None were `wording_never_disputes`. The model usually sent a kind prefix or a sentence, not the element's surface, so `matched_disputed` almost never fired. The statement state still follows the bucket.

- 3i clean S11: "figure: 9%"
- 3i doctored S8: "name: MAIT"
- 3i doctored S9: "name: AGIC"
- 3i doctored S11: "figure: 9%"
- 3i doctored S12: "name: 3i Infrastructure"
- 3i doctored S14: "name"
- HICL clean S1: "name: HCIL"
- HICL doctored S0: "figure", "date"
- HICL doctored S3: "name"
- HICL doctored S4: "name: St. Germain"
- GP Industries clean S1: an object `{"figure":"one","name":"China"}`
- GP Industries doctored S1: "figure: 15", "name: Malaysia"
- GP Industries doctored S4: "figure: 60 billion"
- ClearPoint clean S1: "figure: 43%", "figure: USD 12.1 million", "figure: 175", "name: IRRAflow"
- ClearPoint doctored S0: "date"
- ClearPoint doctored S1: the same four ClearPoint S1 strings
- ClearPoint doctored S2: "figure: -50%", "figure: 64%"
- ClearPoint doctored S3: "figure: 80%"
- ClearPoint doctored S9: "date"

One element did match a surface exactly and became `matched_disputed`: HICL clean S5, "EBITDA", on a `beyond` note.
