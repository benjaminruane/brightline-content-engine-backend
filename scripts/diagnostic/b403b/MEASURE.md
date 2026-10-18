# B403B. Measurement

| | |
|---|---|
| SHIPPED | recorded after verify:ship |
| Cost | Estimates printed before each run, no cache assumed, output ceiling 300. gpt-4o: 76 calls, 288161 input tokens at chars/4, USD 0.9484 list. Sonnet: 76 calls, USD 1.2065 list. Opus: 76 calls, USD 2.0108 list. Sum of estimates USD 4.1657. Ceiling USD 6. Not crossed. Measured list USD 4.531344, discounted USD 4.235504, 245 calls. Source: `spend` on each model in `scripts/diagnostic/b403b/runs/reading.json`. |
| Gate | `QC_B403B_READING=1`. |

The Sonnet model configured in this repo is `claude-sonnet-4-6`. It is priced in `lib/observability.js` and used by `tests/r1_2_5_eval`. `STAGE_MODELS` does not name a Sonnet. Opus calls omit temperature, because that model rejects the field. Other callers of `callLLM` still default to 0.

Occurrence line text is not in the run file. The full file was 1.6 MB, over the 1 MB commit limit. The committed file keeps each fact's line ids and `occurrenceCount`. The HICL "20" extract is on `twenty` in that file. The lines can be rebuilt with `buildFacts`.

## HICL doctored "20"

One occurrence. Line L44: "Long term government bond yields in the UK have decreased slightly, by approximately 20 basis points, since the Company's valuation at 30 September 2025."

The sixteen-towers line is not an occurrence. That line says "Fortysouth delivered 16 new towers". `figuresMatch` does not treat 16 as 20, and this pass does not change that test. Showing every hit cannot add a line the matcher does not hit. The card shows the basis-points line and no "and N more".

## N1. Doctored statements flagged

25 of 25 on all three models. B403A was 25 of 25. Regressions: none.

## N2. Clean statements marked

Against 24 of 38 in B403A. Marked means the state is not `nothing_to_raise`. A wording note does not mark.

The recommended model is Sonnet. It marks 26 of 38.

Known errors, 6. All six from CLEAN-SET K3 are marked.

- 3i S0, conflicts. 30 September against 30 June.
- 3i S6, conflicts. "Several" against two financing transactions.
- 3i S11, conflicts. The 9% return is given the outperformance the source gives to the 3iN portfolio. The note does not deny that the source mentions outperformance.
- HICL S1, not in the source. HCIL against HICL.
- HICL S2, conflicts. "Budgets" against "expectations".
- GPI S3, beyond. The Johor sentence does not say Malaysia.

Notes worth having, 16. Each names a real addition or a real change of claim.

- 3i S1, vast majority.
- 3i S7, "meaningful" against €14 million.
- 3i S8, "significant" against £944 million.
- 3i S9, the stake is framed as the result of the GIC purchase.
- 3i S10, gross money multiples against sterling money multiples.
- 3i S13, the dividend is given a cause the source does not state.
- HICL S3, "significant holding".
- HICL S4, "commercial front".
- HICL S5, valuation gains against the valuation assumption.
- HICL S6, debt servicing costs against a step-down on debt margins.
- HICL S7, the benefit is drawn wider than the source.
- GPI S1, "one plant" and the source's China facility. The note does not say China is absent.
- ClearPoint S1, "driven by".
- ClearPoint S3, topline "driven by".
- ClearPoint S4, "from a low base".
- ClearPoint S7, one clinical procedure against procedures.

Noise, 4.

- 3i S2. The note says the Infrastructure return was not driven by Action. The statement is about Action driving the private-equity result. The note answers a different sentence.
- 3i S5. "Nine months" against "nine reporting periods" for the same span to 28 September 2025.
- HICL S0. "Positive" against "robust" and "in line". The note itself says the five-month span is consistent with the source dates.
- ClearPoint S2. The note says the 16%, 25% and 64% match, and that "allowances for" is a wording difference. The bucket is still conflicts.

gpt-4o marks 8. Opus marks 8. Those splits are under Part 4.

## N3. Wording notes, Sonnet

Counted, and none of them is the reason a sentence is marked. A wording note on a sentence that is already not in the source is still counted here.

| Draft | Wording notes |
|---|---|
| 3i clean | 3 |
| 3i doctored | 1 |
| HICL clean | 0 |
| HICL doctored | 0 |
| GP Industries clean | 0 |
| GP Industries doctored | 0 |
| ClearPoint clean | 1 |
| ClearPoint doctored | 2 |

## N4. The two acceptance cases, Sonnet

HICL clean S2, conflicts. "The source states that EBITDA is in line with expectations, whereas the statement says EBITDA is in line with budgets. Expectations and budgets are different benchmarks."

3i clean S6, conflicts. "The source describes exactly two financing transactions completed by Action in October 2025, not several."

Both are off wording.

gpt-4o left HICL S2 as wording. It moved 3i S6 to beyond, and the note talks about the words "balance sheet transactions" rather than the quantity. Opus left both as wording, and both notes say the claim is unchanged.

## N5. Bucket distribution, 76 statements

| Model | conflicts | beyond | wording | none |
|---|---:|---:|---:|---:|
| B403A gpt-4o | 22 | 13 | 24 | 17 |
| gpt-4o | 22 | 15 | 26 | 13 |
| Sonnet | 41 | 19 | 7 | 9 |
| Opus | 24 | 11 | 32 | 9 |

No withheld notes. Sonnet moved the mass from wording into conflicts.

## N6. Facts with more than one occurrence

117 of 190 matched facts. Largest count on each draft:

| Draft | Largest |
|---|---:|
| 3i clean | 15 |
| 3i doctored | 15 |
| HICL clean | 5 |
| HICL doctored | 4 |
| GP Industries clean | 15 |
| GP Industries doctored | 15 |
| ClearPoint clean | 33 |
| ClearPoint doctored | 23 |

The 33 is the date "2026" on ClearPoint. A draft year matches every source date in that year, which is the existing date rule. The card shows the first three lines in document order and "and 30 more". It does not choose among them.

## N7. Header lines, Sonnet

| Draft | Numbers | Line |
|---|---|---|
| 3i clean | 37 of 37 facts matched · 11 statements to look at · 3 wording notes | Figures all check out, but 6 statements conflict with the source. |
| 3i doctored | 34 of 37 facts matched · 13 statements to look at · 1 wording note | 3 facts are not in the source. |
| HICL clean | 14 of 15 facts matched · 8 statements to look at · 0 wording notes | 1 fact is not in the source. |
| HICL doctored | 8 of 17 facts matched · 8 statements to look at · 0 wording notes | 9 facts are not in the source. |
| GP Industries clean | 23 of 23 facts matched · 2 statements to look at · 0 wording notes | Figures all check out. 2 statements go further than the source does. |
| GP Industries doctored | 18 of 23 facts matched · 5 statements to look at · 0 wording notes | 5 facts are not in the source. |
| ClearPoint clean | 30 of 30 facts matched · 5 statements to look at · 1 wording note | Figures all check out, but 2 statements conflict with the source. |
| ClearPoint doctored | 26 of 28 facts matched · 8 statements to look at · 2 wording notes | 2 facts are not in the source. |

## N8. sentenceState null

0 on all three models.

## Part 4. The three models

| | gpt-4o-2024-08-06 | claude-sonnet-4-6 | claude-opus-4-7 |
|---|---|---|---|
| Refusals before retry | 9, all endorsing language: 3i clean S2, 3i clean S7, 3i doctored S2, 3i doctored S7, ClearPoint clean S1, ClearPoint clean S2, ClearPoint clean S5, ClearPoint doctored S1, ClearPoint doctored S5 | 4, all endorsing language: 3i clean S1, 3i clean S9, 3i doctored S1, GP Industries clean S1 | 4, empty bucket: HICL doctored S6, GP Industries doctored S0, ClearPoint clean S5, ClearPoint doctored S5 |
| Refusals after retry | 0 | 0 | 0 |
| Schema echoes | 0 | 0 | 0 |
| Clean marks | 8 | 26 | 8 |
| Discounted, eight drafts | USD 0.457018 | USD 1.150641 | USD 2.627845 |
| Per draft on this set | USD 0.057127 | USD 0.143830 | USD 0.328481 |
| 2,000 drafts a year | USD 114.25 | USD 287.66 | USD 656.96 |

gpt-4o's list cost is USD 0.752858, USD 0.094107 per draft, USD 188.21 for 2,000 drafts. Sonnet and Opus have no cached rate, so list equals discounted. The year figure is this set's average draft, not a 15-statement draft.

Notes whose text is wrong on the facts:

- gpt-4o, 3i clean S11. Says the source does not mention outperforming expectations. The source says the infrastructure asset portfolio within 3iN outperformed its expected returns.
- gpt-4o, GP Industries clean S1. Says the source does not mention a plant in China, then cites the China facility. The source says "its China facility".
- Sonnet does not make either of those. Sonnet, 3i clean S2, is wrong on a different fact: it says the Infrastructure return was not driven by Action. That statement is about Action.
- Opus does not make either of the gpt-4o errors. Opus, HICL clean S2 and 3i clean S6, say the claim is the same. "Budgets" is not "expectations", and "several" is not two.

Use `claude-sonnet-4-6` for the note step. It is the only one of the three that moves both acceptance cases off wording, and it does not invent the two absences gpt-4o invents. The cost against gpt-4o on this set is USD 0.086703 more per draft, USD 173.41 more for 2,000 drafts. It marks 26 clean statements, so the header on a clean draft is still busy. Opus is the one that marks 8 and gets the China sentence and the outperformance sentence right, and it still files both acceptance cases as wording.

## Criteria

| | |
|---|---|
| D1 | Met. N1 is 25 of 25. |
| D2 | Not met. N2 marks 26 clean statements. The bar is 8 or fewer. |
| D3 | Not met. Noise within N2 is 4. The bar is 2 or fewer. |
| D4 | Met. Both acceptance cases are conflicts on Sonnet. |
| D5 | Met. 190 matched facts, 0 without a line, 0 whose `occurrenceCount` differs from the list. |
