# B385. The current route on the four doctored drafts

26 entries, 37 substitutions.

| Run | Entries | Substitutions |
|---|---:|---:|
| 3i | 6 | 6 |
| HICL | 8 | 13 |
| GPI | 5 | 10 |
| ClearPoint | 7 | 8 |
| TOTAL | 26 | 37 |

Payloads:

- 3i: `tests/fixtures/real-runs-2026-09-29/doc-review.json`. README build `a22e894`.
- HICL: `tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json`. README build `2b68499` (B371, wrong-company check off).
- GPI: `tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json`. The README records a HAR capture and no build.
- ClearPoint: `tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json`. The README records no build.

`conflictValues` is null on every one of these 26 cards. The script does not decide whether a comment names a fault. The sentences below are that separate read. "Names the fault" means the comment says what is wrong. It is not a label agreement.

## The four doctored drafts

### 29 September 2026, 3i, 15 statements

S0, billion written as million. Verdict conflict. supportState conflicting. hasConflict true. The comment sets GBP 3.3 million against GBP 3,291 million. It does not say the draft wrote million for a billion.

```
The statement claims a total return of GBP 3.3 million for the six months to 30 June 2025, while the source reports a total return of GBP 3,291 million for the first half of FY2026. The periods and figures do not match, leading to a conflict. The reviewer should reconcile these discrepancies or remove the claim.
```

S5, the period. Verdict conflict. supportState conflicting. hasConflict true. The comment names the fault.

```
The statement claims net sales of EUR 11.2 billion for the first half of 2026, while the source reports EUR 11.229 billion for the nine reporting periods ending on 28 September 2025. The periods do not match, leading to a conflict in the reported figures. The reviewer should reconcile these discrepancies or remove the claim.
```

S8, Action written as MAIT. Verdict supported_partial. supportState partial. hasConflict false. The comment does not name the fault. It discusses the word significant.

```
The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i. However, it does not specify that these proceeds were 'significant' for 3i, which is an evaluative claim not covered by the source. The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization.
```

S9, GIC written as AGIC. Verdict conflict. supportState conflicting. hasConflict true. The comment says the source does not mention a purchase from AGIC. It does not say the name is GIC.

```
The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. However, the source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC, which is part of the statement. The reviewer should reconcile this discrepancy or remove the claim about the earlier purchase from AGIC.
```

S12, gains on TCR widened to essentially all investments. Verdict supported_full. supportState supported. hasConflict false. The comment does not name the fault. It treats the widened claim as confirmed.

```
The source confirms the statement by indicating that the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price. Additionally, it notes that the underlying portfolio continues to perform well, which aligns with the statement's claim of positive performance across its portfolio.
```

S14, 3i's stance written as the UK government's. Verdict supported_partial. supportState partial. hasConflict false. The comment says the source does not mention the UK government. It does not say the stance is 3i's.

```
The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments. However, it does not specifically mention the UK government, which is a key element of the statement. The reviewer should either find a source that explicitly references the UK government's position or adjust the statement to align with the broader scope presented in the source.
```

### 4 October 2026, HICL, 8 statements, eleven planted changes

S0, HICL written as HCIL, and five months to 28 February 2026 written as six months to 31 December 2025. Verdict supported_full. supportState supported. hasConflict false. The comment names neither fault. It repeats both doctored phrases as the source.

```
The source confirms that HCIL Infrastructure's performance for the six months to 31 December 2025 was positive and largely in line with expectations. It specifically states that the portfolio performance was in line with expectations, supporting the statement's claim.
```

S1, "with EBITDA growth" written as "average 30% EBITDA growth". Verdict supported_partial. supportState partial. hasConflict false. The comment names the missing 30% figure.

```
The source does not specify the 30% EBITDA growth figure mentioned in the statement. It confirms robust operational performance and EBITDA growth driven by capital expenditure, as well as resilient cash generation supporting the dividend program. The reviewer should verify the 30% growth figure or adjust the statement to align with the source.
```

S2, "in line with budgets" written as "significantly outperform budgets". Verdict supported_partial. supportState partial. hasConflict false. The comment names the fault.

```
The source confirms that growth investments are performing well and are driving EBITDA growth through significant expansion programs. However, it does not state that this growth significantly outperforms budgets, which is a material gap in the statement. The reviewer should either find a source that confirms the budget outperformance or adjust the statement to align with the source.
```

S3, London St. Pancras High Speed written as Paris St. Germain High Speed. Verdict conflict. supportState conflicting. hasConflict true. The comment names the fault.

```
The statement incorrectly attributes the performance to Paris St. Germain High Speed, while the source specifies that it is London St. Pancras High Speed that performed well, with international train path bookings slightly ahead of forecast. The reviewer should reconcile this discrepancy or remove the incorrect claim about Paris St. Germain High Speed.
```

S4, operations from St. Pancras written as St. Germain. Verdict conflict. supportState conflicting. hasConflict true. The comment names the fault.

```
The statement conflicts with the source regarding the location of Virgin Trains' cross-Channel operations. The source specifies St. Pancras, not St. Germain, as the location for these operations. The source does confirm Virgin Trains' intentions for cross-Channel operations and mentions progress on adding a second international operator on the route. The reviewer should reconcile the location discrepancy or remove the incorrect location reference.
```

S5, Fortysouth and 16 towers written as TowerCo and 20. Verdict conflict. supportState conflicting. hasConflict true. The comment names the name and the figure. It does not name the separate change from "during the period" to "during the past year".

```
The source contradicts the statement by reporting that Fortysouth, not TowerCo, delivered 16 new towers, not 20. This discrepancy in both the entity and the number of towers delivered is significant. The source does confirm that there are ongoing co-location opportunities expected to support growth in EBITDA, but the entity and figures for tower delivery do not match. The reviewer should reconcile these differences or remove the claim.
```

S6, a reduction in debt costs written as an increase. Verdict conflict. supportState conflicting. hasConflict true. The comment names the contradiction.

```
The source contradicts the statement by indicating that the refinancing enabled a step-down on debt margins, rather than leading to an increase in debt servicing costs as claimed. The source describes the refinancing as accretive and approximately 30% oversubscribed, highlighting the quality and long-term visibility of Fortysouth's revenues. The reviewer should reconcile this contradiction or remove the claim about increased debt servicing costs.
```

S7, a new CEO written as a new CFO, and the UK government's water paper written as the French government's electricity paper. Verdict not_supported. supportState not_supported. hasConflict false. primaryExcerptText is empty. The comment names the CEO, the government, and the sector.

```
No source addresses the claim that Affinity Water appointed a new CFO with significant sector experience or that it stands to benefit from the French government's white paper on electricity sector reform. The source discusses a new CEO appointment and a UK Government white paper on water sector reform instead. Please add a relevant source or remove the claim.
```

### 6 October 2026, GP Industries, 5 statements

S0, October 2025, 75% of capacity, and escalating oil prices. Verdict supported_partial. supportState partial. hasConflict false. The comment names all three.

```
The source confirms that GP Industries is shifting production capacity to Southeast Asia due to US tariffs and rising geopolitical tensions, but it does not specify the 75% figure or the exact timing in October 2025. The source also does not mention escalating oil prices as a reason for the shift. The statement's claim about the percentage and timing is not addressed by the source. The reviewer should verify these details or adjust the statement accordingly.
```

S1, 15 facilities in Malaysia, and the China plant limited to the European market. Verdict conflict. supportState conflicting. hasConflict true. The comment names both.

```
The statement conflicts with the source regarding the number of facilities in Malaysia. The statement claims the company operates 15 facilities, while the source states it operates only three. Additionally, there is a contradiction about the focus of the China plant; the statement claims it will focus primarily on the European market, but the source indicates it will focus on both the European and Asian markets. The reviewer should reconcile these discrepancies or remove the conflicting claims.
```

S2, enhancing site security. Verdict supported_partial. supportState partial. hasConflict false. The comment names the fault.

```
The source does not mention enhancing site security, which is a gap in the statement. It confirms the intention to streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness. The reviewer should consider adding a source that addresses site security or revising the statement to align with the available information.
```

S3, Gold Peak Technology Group written as Silver Hill Technology. Verdict conflict. supportState conflicting. hasConflict true. The comment names the fault.

```
The statement incorrectly attributes the investment program in Johor to Silver Hill Technology. The source specifies that Gold Peak Technology Group, not Silver Hill Technology, is planning the investment to produce next-generation batteries for data centres. The statement should be revised to reflect the correct parent company, Gold Peak Technology Group, or the claim about Silver Hill Technology should be removed.
```

S4, second-largest written as the largest, over six billion written as over 60 billion, and sold written as bartered. Verdict conflict. supportState conflicting. hasConflict true. The comment names the rank and the six billion against 60 billion. It does not name sold written as bartered.

```
The statement incorrectly claims that GP Industries is the largest producer of consumer batteries globally, producing over 60 billion batteries annually. The source contradicts this by stating that GP Industries is the second-largest producer and produces over six billion batteries annually. The claim of distribution through one million outlets is confirmed. The reviewer should reconcile these discrepancies or remove the unsupported claims.
```

### 6 October 2026, ClearPoint, 10 statements

The README's doctored run is set against eight planted faults. They are the substitutions below.

S0, May written as April. Verdict conflict. supportState conflicting. hasConflict true. primaryExcerptText is empty. The comment names the fault.

```
The statement conflicts with the source regarding the announcement date. The statement claims ClearPoint Neuro announced its financial results in April 2026, but the source specifies the announcement was made on May 13, 2026. The year 2026 is confirmed, but the month is not. The reviewer should reconcile the discrepancy in the announcement date or remove the claim about the month.
```

S2, organic growth of 16% written as -50%. Verdict conflict. supportState conflicting. hasConflict true. The comment names the fault.

```
The statement's claim of -50% year-on-year organic growth conflicts with the source, which reports a 16% year-over-year total organic growth. The source confirms the 25% organic growth for devices and the gross margin expansion to 64%. The reviewer should reconcile these discrepancies or remove the conflicting claim about total organic growth.
```

S3, the segment's $5.9 million written as the vast majority of revenue. Verdict supported_full. supportState supported. hasConflict false. The comment does not name the fault.

```
80% and 3.0 match the source.
```

S7, FDA clearance and first clinical procedures written as a submission for FDA approval. Verdict conflict. supportState conflicting. hasConflict true. primaryExcerptText is empty. The comment names clearance already obtained against a submission. It does not mention clinical use.

```
The statement conflicts with the source, which indicates that FDA clearance has already been obtained for the Velocity Alpha MR High Speed Surgical Drill System, rather than a submission being made. The statement suggests a pending approval process, while the source confirms completion. The reviewer should reconcile this discrepancy or remove the claim about the submission. The source does confirm the existence of the Velocity Alpha High Speed Surgical Drill.
```

S8, Health Canada written as the FDA. Verdict supported_partial. supportState partial. hasConflict false. The comment names the fault. The same comment is the card's only comment, and it also covers the commencement entry below.

```
The source indicates that the Medical Device License for the ClearPoint Neuro Navigation System was issued by Health Canada, not the FDA, which creates a gap in the statement regarding the regulatory body. The source does confirm the coverage of both MRI-guidance and iCT guidance workflows and the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region. The reviewer should verify the correct regulatory body and adjust the statement accordingly.
```

S8, the case was completed, written as has been commenced. Verdict supported_partial. supportState partial. hasConflict false. The comment names the Health Canada fault above and says the source confirms the commencement. It does not say the case was completed.

```
The source indicates that the Medical Device License for the ClearPoint Neuro Navigation System was issued by Health Canada, not the FDA, which creates a gap in the statement regarding the regulatory body. The source does confirm the coverage of both MRI-guidance and iCT guidance workflows and the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region. The reviewer should verify the correct regulatory body and adjust the statement accordingly.
```

S9, guidance of $52.0 million to $56.0 million for 2026 written as USD 56 million for 2027. Verdict not_supported. supportState not_supported. hasConflict false. primaryExcerptText is empty. The comment names the year. It does not say the guidance is a range rather than a single figure of 56 million.

```
No source addresses the company's updated revenue guidance of USD 56 million for 2027. The source only provides revenue guidance for 2026, with no mention of 2027. Please add a source that supports this claim or remove it from the statement.
```

## Payloads captured before the extraction fixes

The GP Industries and ClearPoint payloads were captured before B382, B383 and B384. The ClearPoint fixture README already records that those payloads predate B382 and B383. The source text has improved since: columns no longer splice through sentences, and IRRAflow is one word. Those changes can only have helped the route, so a fault missed on these payloads is missed on easier-than-current input. Re-running them is deliberately not part of this pass. It would cost live spend to produce a result that is already conservative.

## Technical summary

`scripts/diagnostic/b385/labels.json` is the planted list transcribed from the four fixture READMEs and the B381 doctored-draft section: 26 entries, 37 substitutions. `scripts/diagnostic/b385/score-current-route.mjs` reads those labels and the four committed review payloads, prints each card's verdict, comment, spans, and whether the excerpt is empty, and stops. It does not match words and it does not call a model. The naming sentences in this report are a separate read of that printout.

## Plain-language summary

The four doctored drafts already stored in the repo were read against one shared list of planted mistakes. The current review cards are quoted in full so they can be set beside the whole-draft model arm. Nothing in the product changed, and no new review was run.
