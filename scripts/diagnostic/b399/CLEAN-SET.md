# B399. The clean set

`scripts/diagnostic/b385/labels.json` is not edited. This file is the record.

## K1. 3i clean S0

Confirmed. The statement says the total return was for the six months to 30 June 2025. The source says the results are for the six months to 30 September 2025. The 30 June 2025 in the source is a different statistic.

Statement: "3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025, representing a 13% return on opening shareholders funds."

Source, the title: "3i Group plc announces results for the six months to 30 September 2025."

Source, the other date: "98% of our Private Equity portfolio companies by value grew earnings in the 12 months to 30 June 2025."

The total-return line itself is "Total return of £3,291 million or 13% on opening shareholders' funds (September 2024: £2,046 million, 10%)." It does not carry a period end. The period end sits on the title and on the table header "Six months to/as at 30 September".

B398 flagged this date and it was scored as a wrong flag. The flag is right.

## K2. Notes against the 38

Every clean statement was read against the B390 ids-1 comment and against the source. A candidate is a statement the note contradicts. The read is mine.

| Statement | Note | Read of the source |
|---|---|---|
| 3i S0 | Conflicting. The figure and the 13% are right. The period is 30 September 2025, not 30 June 2025. | Confirmed. See K1. Known error. |
| 3i S1 | Partially confirmed. 14% is right. "Vast majority" is not stated. | The private-equity return is £3,234 million of a £3,291 million total. The proportion is in the figures. The words are not. Not a known error. |
| 3i S2 | Partially confirmed. "Driven largely by Action" is not stated. | The source gives Action's value growth and does not say the private-equity return was driven by Action. Attribution, not a swapped fact. |
| 3i S6 | Partially confirmed. The source says two financing transactions, not several. | Confirmed. Source: "In October 2025, Action successfully completed two financing transactions." Known error. |
| 3i S8 | Partially confirmed. "Significant" is not in the source. The £944 million is. | Adjective. Not a known error. |
| 3i S11 | Partially confirmed. The 9% is right. The source does not say the 9% itself was above expectations. | Confirmed as a mis-attachment. The 9% sentence is the gross investment return. The outperformance sentence is "the infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month period." Known error. |
| 3i S12 | Partially confirmed. The share-price line and the TCR uplift are right. "Continues to report positive performance across its portfolio" is not the source's wording. | The source says the underlying portfolio "continues to perform well, with a significant valuation uplift in TCR." Paraphrase. Not a known error. |
| 3i S13 | Partially confirmed. 36.5 pence and January 2026 are right. "In light of the overall good performance" is not stated. | Causal framing. Not a known error. |
| HICL S1 | Partially confirmed. The draft spells the company HCIL. | Confirmed. Known error. |
| HICL S2 | The note confirms the sentence, including "in line with budgets." | The note is wrong. The source says "delivering EBITDA in line with expectations." It does not say budgets. Known error. |
| HICL S5 | Partially confirmed. 16 towers and the EBITDA point are right. "Valuation gains" is not stated. | Added words. Not a swapped fact. |
| HICL S6 | Partially confirmed. The refinancing and the step-down are right. "Reduction in debt servicing costs" is an inference. | Inference from "step-down on debt margins." Not a known error. |
| HICL S7 | Partially confirmed. The CEO appointment is right. "Stands to benefit" is broader than the source. | Generalisation. Not a known error. |
| GPI S1 | Partially confirmed. The Malaysia, Vietnam, Thailand and UK counts are right. "One plant in China" is not stated. | The source says "its China facility" and does not say "one plant." The rest of the sentence matches. Not counted as a known error. |
| GPI S3 | Partially confirmed. The parent and the Johor investment are right. "Malaysia" is not in that sentence. | Confirmed. Source: "a multi-million-dollar investment in Johor to produce next-generation battery." Malaysia appears only in "three facilities in Malaysia," which is a different sentence. Known error. |
| ClearPoint S1 | One claim confirmed, one partially confirmed. The 43%, $12.1 million, 175 centres and IRRAflow are right. "Driven by" is not stated. | Causal framing. Not a known error. |
| ClearPoint S3 | One claim partially confirmed, one confirmed. The 80% and $5.9 million are right. "Topline growth was driven by" this division is not stated. | Causal framing. Not a known error. |
| ClearPoint S4 | Partially confirmed. The 177% and the placements are right. "From a low base" is not stated. | Interpretive. Not a known error. |

The other clean statements are confirmed by the notes, and the source agrees. HICL S0, HICL S3 and HICL S4 are among them.

## K3. Corrected composition

32 of the 38 are genuinely clean.

Six are known errors:

- 3i S0, period end 30 June 2025 against 30 September 2025.
- 3i S6, "several" against "two financing transactions."
- 3i S11, the 9% return is said to have outperformed expectations. The source gives that outperformance to 3iN's asset portfolio.
- HICL S1, HCIL against HICL.
- HICL S2, "budgets" against "expectations."
- GPI S3, "Johor, Malaysia." The Johor sentence does not say Malaysia.

## K4. Earlier clean-side numbers, restated

B397 raised four flags. One is right on this set: HICL S1, HCIL. Three stay wrong: HICL S0 "five" (the span 1 October 2025 to 28 February 2026 is five months, and the note confirms the sentence), HICL S3 benchmark (the note and the St Pancras sentence agree the bookings were ahead of forecast), HICL S6 polarity on the noun "company." B397 did not flag the other five known errors. Its wrong-flag count on the corrected set is still 3.

B398 rule B2 raised 28 flags on 18 statements. Three of those flags are right on this set: 3i S0 date 30 June 2025, HICL S1 HCIL, and GPI S3 Malaysia. The other 25 are wrong. They land on tokens the source does contain and the statement gets right, including 3i S0 "six" and "3i Group," which sit on the same statement as the right date flag. Counting 3i S0 as one wrong statement, the way B398 did, scores a right flag as if it had been wrong.
