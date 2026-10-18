# B401. Measurements

| | |
|---|---|
| SHIPPED | SHIP VERIFIED  f922e5c  main  167 files  1828 tests |
| R3 | USD 0. `scripts/diagnostic/b401/runs/reviewer-cost.json` |
| R2 | USD 0.130465 discounted, 40 calls. Estimate before the run: USD 0.3359 list. Ceiling USD 5. Not crossed. |

## R3. What a tick is

B394 elements are a figure, a date, or a name, from `scripts/diagnostic/b392/elements.mjs`.

Settled means the element is absent from the whole source. The presence check flags it, and a person does not have to tick it to stop a green. A tick is an element the check finds somewhere in the source. That is the check B398 and B399 showed does not know which sentence the fact belongs to, so it does not settle the element.

A planted substitution still needs a tick to stop a green when no element inside the written text is absent from the source. Open wording, a ratio, a rank, a polarity, and a name that also occurs on another line are all in that set.

The two clean elements the check settles are both on HICL. "five" on S0 is a wrong flag. The span from 1 October 2025 to 28 February 2026 is five months, and the source does not write the word. HCIL on S1 is a right flag.

| Draft | Statements | Elements | Settled | Ticks | Planted | Ticks between a planted error and a green |
|---|---:|---:|---:|---:|---:|---:|
| 3i clean | 15 | 37 | 0 | 37 | 0 | 0 |
| 3i doctored | 15 | 37 | 3 | 34 | 6 | 3 |
| HICL clean | 8 | 16 | 2 | 14 | 0 | 0 |
| HICL doctored | 8 | 17 | 9 | 8 | 13 | 5 |
| GP Industries clean | 5 | 23 | 0 | 23 | 0 | 0 |
| GP Industries doctored | 5 | 23 | 5 | 18 | 10 | 5 |
| ClearPoint clean | 10 | 30 | 0 | 30 | 0 | 0 |
| ClearPoint doctored | 10 | 28 | 2 | 26 | 8 | 6 |

19 of the 37 planted substitutions are not blocked by absence. The 18 that are blocked include 3i-S0-a (million for billion), 3i-S5-a, 3i-S9-a, the HICL name and date substitutions hicl-S0-a, hicl-S0-b, hicl-S1-a, hicl-S3-a, hicl-S4-a, hicl-S5-a, hicl-S7-a, hicl-S7-b, and the GP Industries and ClearPoint rows named in the json.

The three real errors. The 3i period date is in the source on another sentence, so it is a tick, not a flag. HCIL is the settled flag above. "Budgets" is not an element. A tick of the elements on that sentence does not ask about the word.

## R2. Five commentary passes

Printed before the call: 40 calls, 70370 input tokens at characters divided by 4, output ceiling 400 tokens, USD 0.3359 list. `QC_B401_ENSEMBLE` was not 1 on the estimate run. The call run set it to 1.

The stored card does not have `sourceExplanations` or `claimInventory`. The replay omitted them and did not invent them. The verdict passed in is the stored Stage 2 classification. For all eight statements that classification is `confirmed`, and the Stage 5 prompt tells a confirmed card to say the source confirms the statement.

Measured: 40 calls, input 60030, output 2407, USD 0.130465 discounted. List from those tokens at the full rates is USD 0.174145. Cached tokens were not kept on the stored usage. The same shape on 15 statements is about USD 0.245 discounted.

E1. Runs that agree on the reading:

| Statement | Agree | Reading | Distinct texts |
|---|---:|---|---:|
| 0 | 5 | endorses | 2 |
| 1 | 5 | endorses | 1 |
| 2 | 5 | endorses | 1 |
| 3 | 5 | endorses | 2 |
| 4 | 5 | endorses | 4 |
| 5 | 5 | endorses | 4 |
| 6 | 5 | mixed | 4 |
| 7 | 5 | endorses | 3 |

A run endorses when it says the source confirms the statement or aligns with it. It objects when it says the source does not state the point. Both at once is mixed. The first scorer required the words "does not state" with nothing between them, and it scored statement 6 as an endorsement. The stored text says "does not explicitly state". It was rescored. No new call.

E2. Unanimity does not block HICL S2. All five texts are the same sentence: "The source confirms the statement by indicating that HICL's growth investments are performing well, with significant expansion capital expenditure programs driving EBITDA growth that aligns with expectations." The draft says budgets. The note substitutes expectations and still confirms the statement. A unanimous wrong answer is what makes this route worthless on the commentary step. That is the result.

Statement 6 shows the repetition is not always a copy. All five runs confirm the refinancing and then say the source does not state a reduction in debt servicing costs. That dissent is on a sentence the corrected clean set does not count as a known error. The sentence the test cared about produced no dissent.

E3. The figures are above. Five commentary passes are cheaper than the stored HICL review (USD 0.418035, 43 calls) and they do not fix the false green, because the verdict they are asked to write up is already confirmed.
