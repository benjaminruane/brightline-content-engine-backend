# B397. Claim types, and how many a rule can reach

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  56cf631  main  166 files  1819 tests` |
| Cost | USD 0. No model calls. |
| Taxonomy | `scripts/diagnostic/b397/TAXONOMY.md`. Written before the count. Not revised after it. |
| Evidence | `scripts/diagnostic/b397/runs/classify.json`, from `node scripts/diagnostic/b397/classify.mjs`. |
| Corpus | 37 planted substitutions in `scripts/diagnostic/b385/labels.json`. 38 clean statements: 3i clean-review, HICL clean-review, GP Industries clean-run2, ClearPoint clean1. |
| Sources | The extracted source files, the same paths B392 used. |
| Model notes | B390 ids-1, `scripts/diagnostic/b390/runs/ids-1/cards.json`. |

## T2. Deterministic reach

A rule reaches 24 of the 37.

Mechanical rules reach 19 of their 24. Partly mechanical rules reach 5 of their 8. The counterpart the partly mechanical rule asks for is present for 5 of those 8, and the rule catches all 5 of those.

| Type | Class | Of the 37 | Reached |
|---|---|---|---|
| quantity | mechanical | 8 | 7 |
| date | mechanical | 5 | 4 |
| name | mechanical | 11 | 8 |
| ratio | partly | 2 | 1 |
| rank | partly | 1 | 1 |
| polarity | partly | 3 | 3 |
| benchmark | partly | 1 | 0 |
| set | partly | 1 | 0 |
| open wording | not mechanical | 5 | 0 |

The five mechanical misses are presence misses. The token is in the source, on a different line:

- 3i-S8-a, MAIT. MAIT is a real exit. The sentence attributes Action's redemption to MAIT.
- 3i-S14-a, UK. The source says "UK adopted international accounting standards."
- hicl-S5-b, 20. The source says "20 basis points." The sentence says 20 new towers. The source says 16.
- clearpoint-S8-a, FDA. The license in the sentence is Health Canada's. FDA is elsewhere in the document.
- clearpoint-S9-b, 2027. The guidance year is 2026. 2027 appears in the risk-factor boilerplate and in a cash-neutrality line.

The three partly mechanical misses:

- clearpoint-S3-a, "the vast majority of the company's overall revenue." The rule takes the last long word after "of", which in this sentence is "software". It never reads the 5.9 against the 12.1. The counterpart is in the source. The written rule does not find it.
- hicl-S2-a, "significantly outperform budgets." The source says "in line with expectations" and "slightly ahead of forecast". It does not say "budgets", so the rule does not fire.
- gpi-S1-b. The label's written form is "European market only". The sentence does not contain "only". It says the China plant will focus on the European market. The source says European and Asian. The rule looks for "only" and does not fire.

Quantity reaches seven, including clearpoint-S9-a. "USD 56 million" occurs as the top of "between $52.0 million and $56.0 million", and the sentence does not state 52. That is the range-collapse clause. hicl-S5-b is the quantity the presence rule misses.

Ratio reaches one: 3i-S12-a, "essentially all", against a single holding, "uplift in TCR".

Rank reaches gpi-S4-a: draft "largest producer", source "second-largest producer".

Polarity reaches three. hicl-S6-a, "increase" against "step-down", sharing "refinancing" in the Fortysouth sentence. clearpoint-S7-a, "submission" against "clearance", sharing "Velocity". clearpoint-S8-b, "commenced" against "completion", sharing "first".

## T3. The irreducible set

13 of the 37 are not reached. Five have no rule. Eight have a rule that does not fire. The B390 ids-1 note names the fault on each of the 13. A reviewer can act on the note.

| Id | Why the rule stops | What the note says | Enough for a reviewer |
|---|---|---|---|
| 3i-S8-a | MAIT occurs as a real exit | Action, not MAIT, completed the redemption | Yes |
| 3i-S14-a | UK occurs in the accounting-standards line | The stance is 3i's, not the UK government's | Yes |
| hicl-S2-a | The source does not say "budgets" | EBITDA is in line with expectations, not outperforming budgets | Yes |
| hicl-S5-b | 20 occurs as basis points | 16 new towers during the period, not 20 | Yes |
| hicl-S5-c | "during the past year" is open wording | The source says "during the period" | Yes. Same note as S5-b |
| hicl-S7-c | "electricity sector reform" is open wording | The white paper is on water sector reform | Yes |
| gpi-S0-c | "escalating oil prices" is open wording | The source makes no reference to escalating oil prices | Yes |
| gpi-S1-b | The sentence does not say "only" | European and Asian markets, not the European market alone | Yes |
| gpi-S2-a | "enhancing site security" is open wording | The source does not mention site security | Yes |
| gpi-S4-c | "bartered" is open wording | Sold, not bartered | Yes |
| clearpoint-S3-a | The ratio rule takes the head word "software" | 5.9 is the largest segment, not a vast majority of the 12.1 total | Yes |
| clearpoint-S8-a | FDA occurs elsewhere | The license is from Health Canada | Yes |
| clearpoint-S9-b | 2027 occurs in the risk factors | Guidance is for 2026 | Yes |

The same ClearPoint S8 card has a second sentence that treats "has been commenced" as consistent with the source. That substitution is clearpoint-S8-b. The polarity rule reaches it, so it is not in this set.

## T5. What the same rules do to the 38 clean statements

Four clean statements are flagged. One flag is right. Three are wrong.

Quantity flags 1. HICL clean S0, the word "five" in "five months to 28 February 2026". The source states the period as 1 October 2025 to 28 February 2026 and does not write "five". The span is five months. The flag is wrong. It is the derived period B393 already recorded. The rule reaches 7 planted quantities. The cost on this clean set is one correct sentence. That is below the bar of four correct sentences, and the cost is real.

Date flags 0. The rule reaches 4 planted dates. The clean cost is zero on this set. The planted miss is 2027, above.

Name flags 1. HICL clean S1 writes "HCIL". The source writes "HICL". The flag is right. The rule reaches 8 planted names. On this clean set it does not flag a correct name. It misses the three presence swaps in T2.

Ratio flags 0. The one clean ratio sentence is 3i S1, "vast majority of the overall total return." The private-equity return is 3,234 million and the total return is 3,291 million. 3234 / 3291 is 0.983, above 2/3, so the rule does not flag it. That non-flag is right. The same rule misses the planted vast-majority sentence. It is not worth having for that sentence until the head word is the noun of the ratio. The essentially-all clause reaches the one planted case and flags no clean sentence.

Rank flags 0. It reaches the one planted rank, "largest" against "second-largest", and the clean sentence says "second-largest", which agrees. Worth having on this corpus. The clean cost is zero.

Polarity flags 1, and the flag is wrong. HICL clean S6 says "a reduction in debt servicing costs." The Fortysouth sentence says "a step-down on debt margins", the same direction. The rule flags the sentence because a different sentence, the dividend line, says "a 0.1p increase on the prior year" and both sentences contain "company". The rule reaches the three planted polarity substitutions, including the planted "increase" on this same debt sentence, where the shared noun is "refinancing". It is not worth having while "company" counts as the shared noun. One correct sentence is enough to say so.

Benchmark flags 1, and the flag is wrong. HICL clean S3 says "slightly ahead of forecast" for London St. Pancras. The source says the same thing in that bullet. An earlier bullet says "in line with forecast" about cash generation. The rule takes the first sentence that contains "forecast" and a comparison word, so it flags a sentence the source agrees with. It reaches none of the planted substitutions. It is not worth having.

Set flags 0 and reaches 0. The one planted narrowing does not use the word the rule looks for. Nothing here shows the rule is worth having.

## T1 and T4

T1. The 37, by the type of the substitution:

| Type | Count |
|---|---|
| quantity | 8 |
| date | 5 |
| name | 11 |
| ratio | 2 |
| rank | 1 |
| polarity | 3 |
| benchmark | 1 |
| set | 1 |
| causation | 0 |
| evaluation | 0 |
| open wording | 5 |

Figures, dates and names are 24 of the 37. The rules reach 19 of those 24.

T4. Clean statements that contain each type. A statement can contain several. Names use the B394 extractor with the whole draft as the corpus, so a sentence-initial "Year" is not counted.

| Type | Clean statements |
|---|---|
| quantity | 18 |
| date | 8 |
| name | 26 |
| ratio | 1 |
| rank | 1 |
| polarity | 8 |
| benchmark | 5 |
| set | 0 |
| causation | 6 |
| evaluation | 13 |
| open wording | 1 |

The open-wording statement is GP Industries S2, which has no other type. Two further statements contain only an evaluation: 3i S4, "trading remains healthy", and 3i clean S14, "cautious stance".

## Part 3

Q1. Claude is wrong about the contract. The field is `displayVerdict`. `assembleCard` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` sets it from `mapSupportStateToDisplayVerdict` (the map is at line 444, the assignment at line 681). The map returns `supported_full`, `supported_partial`, `conflict`, `not reviewed`, or `not_supported`. There is no value for a sentence with no factual badge. The frontend `evidenceDisplayVerdictLabel` maps a blank and the string "not reviewed" to "Not reviewed". `verdictToTone` maps a blank to amber, and "not reviewed" falls through to amber.

Q2. Read aloud, the card says "Not reviewed", in amber. That is the state the owner rejected at the end of B396. The agreed design, an outline mark and the model's note with no factual badge, is not a card the contract can show.

Q3. Yes, it hides the vast-majority case. That sentence is a ratio in this taxonomy, and the written ratio rule does not catch it. The sentence also contains 80% and the names IRRAflow and 3.0, so it sits inside the factual population. A badge on those tokens would cover the ratio. The same hiding is the five presence misses in T2: a token found somewhere else in the source would badge the sentence. The three sentences with no mechanical or partly mechanical claim are not where this hiding sits.

Q4. 3 of the 38. They are 3i S4 ("trading remains healthy"), 3i clean S14 ("cautious stance"), and GP Industries S2 (supply chains and cost competitiveness). Names are in 26 of the 38, which is why the class is smaller than a figure-and-date count.

## Claude's predictions

Recorded before the run. Scored against the count above.

- "Figures, dates and names reach 25 of the 37." Does not hold. They are 24 of the 37, and the rules reach 19.
- "Ratio and quantifier arithmetic adds 2 or 3." Does not hold. It adds 1, the essentially-all case. The vast-majority case is the one it misses.
- "Direction and rank claims add 3 or 4." Holds. Polarity reaches 3 and rank reaches 1.
- "Deterministic reach lands near 31 of 37." Does not hold. The reach is 24 of 37.
- "The irreducible class is 4 to 6 of the 37." Does not hold. 13 are not reached. Five of the 13 are the open-wording class, which is inside 4 to 6. The other eight are rules that do not fire.
- "Claude's reconciliation in Part 3 is correct: the residue dissolves." Does not hold. The contract has no badge-less state, so the card still says "Not reviewed". Under the full taxonomy, 3 of the 38 clean statements are outside the factual population, and the vast-majority sentence is not one of them.

## What this pass could not establish

Same-subject binding. The mechanical rules are presence rules. A token anywhere in the source counts as found. This pass did not write a rule that ties the token to the same license, the same tower count, or the same year.

The ratio head. The rule was not revised after the count, so this pass did not measure a version that stops the "of" phrase at "and".

The labelled hundred. These 37 and these 38 are the corpus.

No product code was changed. No verdict was changed. No model was called.
