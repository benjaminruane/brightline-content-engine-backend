# B379. What the card says out loud, and how close is close enough

Read-only. No product code. Nothing in `lib/` changed. No model calls. Spend USD 0.

| | |
|---|---|
| SHIPPED | pending. The line from `npm run verify:ship` is written into this table after the push. |

The ClearPoint fixtures were already on `origin/main` as `d258ff7` (`fixtures: ClearPoint Neuro Q1 2026, three clean runs and one doctored`). This pass did not recommit them.

## Population

14 stored review payloads. 126 statements. Nothing was added or regenerated.

| Payload | Kind | Statements |
|---|---|---|
| 2026-09-29/clean | clean | 15 |
| 2026-09-29/doc | doctored | 15 |
| 2026-10-02/doc | doctored | 15 |
| 2026-10-04-hicl/clean | clean | 8 |
| 2026-10-04-hicl/doc | doctored | 8 |
| 2026-10-06-gpi/doc | doctored | 5 |
| 2026-10-06-gpi/clean-run2 | clean | 5 |
| 2026-10-06-gpi/clean-run3 | clean | 5 |
| 2026-10-06-gpi/clean-run4 | clean | 5 |
| 2026-10-06-gpi/clean-run5 | clean | 5 |
| 2026-10-06-clearpoint/dirty1 | doctored | 10 |
| 2026-10-06-clearpoint/clean1 | clean | 10 |
| 2026-10-06-clearpoint/clean2 | clean | 10 |
| 2026-10-06-clearpoint/clean3 | clean | 10 |
| **Total** | | **126** |

Clean statements measured in Part 2: 73. Doctored statements that carry a planted fault and were not given verdict `conflict`: 13. That second set is Part 3.

## Part 1. Does the card affirm what it flags

The comment is `qcCard.evidenceSummary`. Sentences split on `.` `!` `?` followed by a capital letter. Abbreviations such as `St.` are not boundaries. A sentence is then split on `but`, `however`, `although`, and `whereas`, so a confirmation and a denial in one sentence are judged separately. `while` is not a split: it is often inside the claim ("while maintaining cost competitiveness").

A clause is an affirmation when it asserts that something is supported. Negatives are not affirmations: `does not confirm`, `is not`, `not confirmed`, `not supported`, `unsupported`, `contradict`, `incorrectly`, `mismatch`. Instructions are not affirmations: `the reviewer should`, `please verify`, `to fully support`.

### Trigger phrases found

These are the surface forms that qualified a clause. Counts are clause hits, before a clause is split into more than one phrase.

| Count | Trigger |
|---|---|
| 36 | confirms that |
| 34 | confirms the statement |
| 22 | match the source |
| 14 | confirms |
| 8 | match the statement |
| 7 | aligns with |
| 7 | is confirmed |
| 6 | does confirm |
| 5 | supporting the statement |
| 3 | are confirmed |
| 3 | directly supporting |
| 2 | aligns |
| 1 | are directly supported |
| 1 | are supported |
| 1 | are both supported |

Also seen in the comments, and not treated as affirmations: `does not confirm`, `mismatch`, `unsupported`, `contradicts`, `incorrectly`.

### How the phrase was pulled

This is the weak point. The rule, so the list below can be checked against it:

- Quoted text after `phrase`, `phrases`, `figure`, `figures`, `term`, or `date` is the phrase. Each quote is separate.
- Otherwise the object of `confirms`, `does confirm`, or `confirms that`, including the `by reporting that` form. `The claim of X` keeps X.
- `is confirmed`, `are confirmed`, `are supported`, and `match the source` / `match the statement` keep the subject.
- `aligns with the claim of X` or `claim that X` keeps X. `aligns with the statement` with no object is the statement itself.
- `supporting the claim of X` or `claim that X` keeps X. `supporting the statement` with no object is the statement itself.
- `and the` splits two objects. `as well as` splits two objects. `A and B` splits only when both sides are four words or fewer, so `43% and 175` becomes two phrases and `coverage of both MRI-guidance and iCT` stays one.
- A phrase that only names the statement (`the statement`, `all elements`, `these details`, `the wording`, `the specific figures and reasons`) is marked as the statement itself. Guard B does not fire on those. Guard A still can, if that whole statement overlaps an unsupported span.

187 affirming phrases. None left unextracted.


Every affirming sentence, and the phrase pulled from it.

- **2026-09-29/clean S1** supported_partial, trigger `confirms that`. Phrase: the private equity business generated a gross investment return of 14% for the period
  Sentence: The source confirms that the private equity business generated a gross investment return of 14% for the period.
- **2026-09-29/clean S2** supported_full, trigger `confirms the statement`. Phrase: Action continues to trade strongly
  Sentence: The source confirms the statement by indicating that Action continues to trade strongly.
- **2026-09-29/clean S2** supported_full, trigger `aligns`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns directly with the claim made in the statement.
- **2026-09-29/clean S3** supported_full, trigger `confirms that`. Phrase: the company's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception
  Sentence: The source confirms that the company's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception.
- **2026-09-29/clean S4** supported_full, trigger `confirms the statement`. Phrase: year-to-date like-for-like trading remains good despite a decline in consumer confidence since the summer
  Sentence: The source confirms the statement by indicating that year-to-date like-for-like trading remains good despite a decline in consumer confidence since the summer.
- **2026-09-29/clean S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The wording in the source closely matches the statement, affirming its accuracy.
- **2026-09-29/clean S5** supported_full, trigger `confirms the statement`. Phrase: net sales of €11.2 billion and like-for-like sales growth of 6.3% for the nine months ending on 28 September 2025
  Sentence: The source confirms the statement by reporting net sales of €11.2 billion and like-for-like sales growth of 6.3% for the nine months ending on 28 September 2025.
- **2026-09-29/clean S5** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: This matches the statement exactly.
- **2026-09-29/clean S6** unverifiable, trigger `confirms the statement`. Phrase: Action completed two financing transactions in October 2025
  Sentence: The source confirms the statement by detailing that Action completed two financing transactions in October 2025, which aligns with the claim of several balance sheet transactions being completed during that period.
- **2026-09-29/clean S7** unverifiable, trigger `confirms the statement`. Phrase: the company repriced €3.1 billion of existing term debt, extended maturities, and generated meaningful annual interest cost savings
  Sentence: The source confirms the statement by detailing that the company repriced €3.1 billion of existing term debt, extended maturities, and generated meaningful annual interest cost savings.
- **2026-09-29/clean S8** supported_full, trigger `confirms that`. Phrase: Action completed a pro-rata redemption of shares
  Sentence: The source confirms that Action completed a pro-rata redemption of shares, which generated significant proceeds for 3i.
- **2026-09-29/clean S8** supported_full, trigger `aligns with`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns with the statement provided.
- **2026-09-29/clean S10** unverifiable, trigger `confirms that`. Phrase: 3i completed the sale of MPM and signed an exit of MAIT, generating gross money multiples of 3.2x and 2.8x, respectively
  Sentence: The source confirms that 3i completed the sale of MPM and signed an exit of MAIT, generating gross money multiples of 3.2x and 2.8x, respectively, as stated in the statement.
- **2026-09-29/clean S11** supported_full, trigger `confirms the statement`. Phrase: a gross investment return of 9% for the infrastructure business during the six-month period to 30 September 2025
  Sentence: The source confirms the statement by reporting a gross investment return of 9% for the infrastructure business during the six-month period to 30 September 2025.
- **2026-09-29/clean S11** supported_full, trigger `aligns with`. Phrase: outperforming expectations
  Sentence: This aligns with the statement's claim of outperforming expectations.
- **2026-09-29/clean S12** supported_full, trigger `confirms the statement`. Phrase: the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price
  Sentence: The source confirms the statement by reporting that the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price.
- **2026-09-29/clean S12** supported_full, trigger `supporting the statement`. Phrase: meaningful gains on its investment in TCR
  Sentence: It also mentions a significant valuation uplift in TCR, supporting the claim of meaningful gains on its investment in TCR.
- **2026-09-29/clean S13** supported_full, trigger `confirms the statement`. Phrase: 3i declared a dividend of 36.5 pence per share
  Sentence: The source confirms the statement by specifying that 3i declared a dividend of 36.5 pence per share, which is equivalent to GBP 0.365, to be paid in January 2026.
- **2026-09-29/clean S13** supported_full, trigger `aligns with`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns with the statement's details regarding the dividend amount and payment timing.
- **2026-09-29/clean S14** supported_full, trigger `confirms the statement`. Phrase: management remains cautious about deploying capital into new investments
  Sentence: The source confirms the statement by indicating that management remains cautious about deploying capital into new investments.
- **2026-09-29/doc S1** supported_full, trigger `confirms the statement`. Phrase: the Private Equity business achieved a gross investment return of 14% for the period
  Sentence: The source confirms the statement by reporting that the Private Equity business achieved a gross investment return of 14% for the period.
- **2026-09-29/doc S1** supported_full, trigger `supporting the statement`. Phrase: it accounted for the vast majority of the total return
  Sentence: Additionally, the source implies that this return significantly contributed to the overall total return, supporting the statement's claim that it accounted for the vast majority of the total return.
- **2026-09-29/doc S2** supported_full, trigger `confirms the statement`. Phrase: Action continues to trade strongly
  Sentence: The source confirms the statement by indicating that Action continues to trade strongly.
- **2026-09-29/doc S2** supported_full, trigger `aligns`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns directly with the claim that Action is a significant driver of performance.
- **2026-09-29/doc S3** supported_full, trigger `confirms that`. Phrase: the company's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception
  Sentence: The source confirms that the company's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception.
- **2026-09-29/doc S4** supported_full, trigger `confirms the statement`. Phrase: year-to-date like-for-like trading remains good despite weakening consumer confidence since the summer
  Sentence: The source confirms the statement by asserting that year-to-date like-for-like trading remains good despite weakening consumer confidence since the summer.
- **2026-09-29/doc S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The wording in the source closely matches the statement, affirming its accuracy.
- **2026-09-29/doc S6** unverifiable, trigger `confirms the statement`. Phrase: Action completed two financing transactions in October 2025
  Sentence: The source confirms the statement by detailing that Action completed two financing transactions in October 2025, which aligns with the claim of several balance sheet transactions being completed during that period.
- **2026-09-29/doc S7** unverifiable, trigger `confirms the statement`. Phrase: the company repriced €3.1 billion of existing term debt, extended maturities, and generated meaningful annual interest cost savings
  Sentence: The source confirms the statement by detailing that the company repriced €3.1 billion of existing term debt, extended maturities, and generated meaningful annual interest cost savings.
- **2026-09-29/doc S8** supported_partial, trigger `confirms that`. Phrase: a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i
  Sentence: The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i.
- **2026-09-29/doc S10** unverifiable, trigger `confirms that`. Phrase: 3i completed the sale of MPM and signed an exit of MAIT, generating gross money multiples of 3.2x and 2.8x, respectively
  Sentence: The source confirms that 3i completed the sale of MPM and signed an exit of MAIT, generating gross money multiples of 3.2x and 2.8x, respectively, as stated in the statement.
- **2026-09-29/doc S11** supported_full, trigger `confirms the statement`. Phrase: a gross investment return of 9% for the infrastructure business over the six-month period
  Sentence: The source confirms the statement by reporting a gross investment return of 9% for the infrastructure business over the six-month period, which aligns with the statement's claim of outperforming expectations.
- **2026-09-29/doc S12** supported_full, trigger `confirms the statement`. Phrase: the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price
  Sentence: The source confirms the statement by indicating that the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price.
- **2026-09-29/doc S12** supported_full, trigger `aligns with`. Phrase: positive performance across its portfolio
  Sentence: Additionally, it notes that the underlying portfolio continues to perform well, which aligns with the statement's claim of positive performance across its portfolio.
- **2026-09-29/doc S13** supported_full, trigger `confirms the statement`. Phrase: 3i declared a dividend of 36.5 pence per share
  Sentence: The source confirms the statement by specifying that 3i declared a dividend of 36.5 pence per share, which is equivalent to GBP 0.365, to be paid in January 2026.
- **2026-09-29/doc S13** supported_full, trigger `aligns with`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns with the statement's details regarding the dividend amount and payment timing.
- **2026-09-29/doc S14** supported_partial, trigger `confirms`. Phrase: the cautious stance on capital deployment into new investments
  Sentence: The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments.
- **2026-09-29/doc S14** supported_partial, trigger `confirms`. Phrase: the openness to selective allocations to lower-risk reinvestments
  Sentence: The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments.
- **2026-10-02/doc S0** conflict, trigger `confirms`. Phrase: a 13% return on opening shareholders' funds
  Sentence: Additionally, the source confirms a 13% return on opening shareholders' funds, but the mismatch in figures and dates needs to be reconciled.
- **2026-10-02/doc S1** supported_full, trigger `confirms that`. Phrase: the private equity business generated a gross investment return of 14% for the period
  Sentence: The source confirms that the private equity business generated a gross investment return of 14% for the period, as stated.
- **2026-10-02/doc S1** supported_full, trigger `supporting the statement`. Phrase: it accounted for the vast majority
  Sentence: It also implies that this return contributed significantly to the overall total return, supporting the claim that it accounted for the vast majority.
- **2026-10-02/doc S1** supported_full, trigger `are confirmed`. Phrase: (the statement itself) [statement itself]
  Sentence: All elements of the statement are confirmed by the source.
- **2026-10-02/doc S2** supported_full, trigger `confirms that`. Phrase: (the statement itself) [statement itself]
  Sentence: The source confirms that Action continues to trade strongly, directly supporting the statement.
- **2026-10-02/doc S3** supported_full, trigger `confirms the statement`. Phrase: Action's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception
  Sentence: The source confirms the statement by stating that Action's new store expansion program is on track for another record year, with new stores in Switzerland and Romania receiving an excellent reception.
- **2026-10-02/doc S4** supported_full, trigger `confirms the statement`. Phrase: year-to-date like-for-like trading remains good despite weakening consumer confidence since the summer
  Sentence: The source confirms the statement by asserting that year-to-date like-for-like trading remains good despite weakening consumer confidence since the summer.
- **2026-10-02/doc S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The language used in the source closely matches the statement, affirming its accuracy.
- **2026-10-02/doc S5** conflict, trigger `confirms`. Phrase: a like-for-like sales growth of 6.3%
  Sentence: Additionally, the source confirms a like-for-like sales growth of 6.3%, which aligns with the statement.
- **2026-10-02/doc S6** supported_full, trigger `confirms the statement`. Phrase: Action successfully completed several balance sheet transactions in October 2025
  Sentence: The source confirms the statement that Action successfully completed several balance sheet transactions in October 2025.
- **2026-10-02/doc S7** supported_full, trigger `confirms the statement`. Phrase: the company repriced €3.1 billion of existing term debt, extended maturities, and generated an annual interest cost saving of €14 million
  Sentence: The source confirms the statement by detailing that the company repriced €3.1 billion of existing term debt, extended maturities, and generated an annual interest cost saving of €14 million.
- **2026-10-02/doc S7** supported_full, trigger `confirms`. Phrase: the raising of €1.6 billion in new term loan debt
  Sentence: Additionally, it confirms the raising of €1.6 billion in new term loan debt.
- **2026-10-02/doc S7** supported_full, trigger `are directly supported`. Phrase: €3.1 billion
  Sentence: Both financial figures, €3.1 billion and €1.6 billion, are directly supported by the source.
- **2026-10-02/doc S7** supported_full, trigger `are directly supported`. Phrase: €1.6 billion
  Sentence: Both financial figures, €3.1 billion and €1.6 billion, are directly supported by the source.
- **2026-10-02/doc S9** conflict, trigger `confirms the statement`. Phrase: a portion of the proceeds was redeployed to acquire a further 2.2% stake in Action, which, along with an earlier 2.2% stake purchase, raised 3i's stake to 62.3%
  Sentence: The source confirms the statement that a portion of the proceeds was redeployed to acquire a further 2.2% stake in Action, which, along with an earlier 2.2% stake purchase, raised 3i's stake to 62.3%.
- **2026-10-02/doc S9** conflict, trigger `are confirmed`. Phrase: 2.2%
  Sentence: Both the figures of 2.2% and 62.3% are confirmed by the source.
- **2026-10-02/doc S9** conflict, trigger `are confirmed`. Phrase: 62.3%
  Sentence: Both the figures of 2.2% and 62.3% are confirmed by the source.
- **2026-10-02/doc S11** supported_full, trigger `confirms the statement`. Phrase: gross investment returns for the infrastructure side stood at 9% for the period, outperforming expectations for the six-month period
  Sentence: The source confirms the statement that gross investment returns for the infrastructure side stood at 9% for the period, outperforming expectations for the six-month period.
- **2026-10-02/doc S13** supported_full, trigger `confirms the statement`. Phrase: a dividend of 36.5 pence per share will be paid in January 2026
  Sentence: The source confirms the statement by specifying that a dividend of 36.5 pence per share will be paid in January 2026.
- **2026-10-02/doc S13** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: This matches the statement's claim of a GBP 0.365 dividend per share and its payment timing.
- **2026-10-02/doc S14** supported_partial, trigger `confirms`. Phrase: the cautious stance on capital deployment into new investments
  Sentence: The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments.
- **2026-10-02/doc S14** supported_partial, trigger `confirms`. Phrase: the openness to selective allocations to lower-risk reinvestments
  Sentence: The source confirms the cautious stance on capital deployment into new investments and the openness to selective allocations to lower-risk reinvestments.
- **2026-10-04-hicl/clean S0** supported_full, trigger `confirms that`. Phrase: HICL Infrastructure's performance for the five months to 28 February 2026 was positive and in line with expectations
  Sentence: The source confirms that HICL Infrastructure's performance for the five months to 28 February 2026 was positive and in line with expectations.
- **2026-10-04-hicl/clean S0** supported_full, trigger `supporting the statement`. Phrase: positive performance
  Sentence: The source specifically states that the portfolio performance was in line with expectations, supporting the statement's claim of positive performance.
- **2026-10-04-hicl/clean S0** supported_full, trigger `are confirmed`. Phrase: 28 February 2026
  Sentence: All items in the claim inventory, including the date '28 February 2026' and the term 'largely,' are confirmed by the source.
- **2026-10-04-hicl/clean S0** supported_full, trigger `are confirmed`. Phrase: largely,
  Sentence: All items in the claim inventory, including the date '28 February 2026' and the term 'largely,' are confirmed by the source.
- **2026-10-04-hicl/clean S1** supported_full, trigger `confirms the statement`. Phrase: robust operational performance, with EBITDA growth driven by capital expenditure and resilient cash generation across the portfolio
  Sentence: The source confirms the statement by describing robust operational performance, with EBITDA growth driven by capital expenditure and resilient cash generation across the portfolio.
- **2026-10-04-hicl/clean S2** supported_full, trigger `confirms that`. Phrase: growth investments across the portfolio are performing well, with significant expansion programs driving EBITDA growth in line with expectations
  Sentence: The source confirms that growth investments across the portfolio are performing well, with significant expansion programs driving EBITDA growth in line with expectations.
- **2026-10-04-hicl/clean S2** supported_full, trigger `aligns with`. Phrase: (the statement itself) [statement itself]
  Sentence: This aligns with the statement's claim.
- **2026-10-04-hicl/clean S3** supported_full, trigger `confirms that`. Phrase: London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast
  Sentence: The source confirms that London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast, as stated.
- **2026-10-04-hicl/clean S3** supported_full, trigger `are supported`. Phrase: (the statement itself) [statement itself]
  Sentence: Both elements of the claim are supported by the source.
- **2026-10-04-hicl/clean S4** supported_full, trigger `confirms the statement`. Phrase: progress on adding a second international operator on the route and Virgin Trains' announcement of its intentions for cross-Channel operations from St. Pancras
  Sentence: The source confirms the statement by noting progress on adding a second international operator on the route and Virgin Trains' announcement of its intentions for cross-Channel operations from St. Pancras.
- **2026-10-04-hicl/clean S5** supported_full, trigger `confirms that`. Phrase: Fortysouth delivered 16 new towers during the period and is actively progressing additional co-location opportunities
  Sentence: The source confirms that Fortysouth delivered 16 new towers during the period and is actively progressing additional co-location opportunities.
- **2026-10-04-hicl/clean S6** supported_partial, trigger `confirms that`. Phrase: Fortysouth, a part of the company, completed an oversubscribed refinancing and achieved a reduction in debt margins
  Sentence: The source confirms that Fortysouth, a part of the company, completed an oversubscribed refinancing and achieved a reduction in debt margins, which aligns with the statement's claim of reduced debt servicing costs.
- **2026-10-04-hicl/clean S7** supported_full, trigger `confirms that`. Phrase: Affinity Water appointed Mark Garth as the new CEO, who has significant sector experience from United Utilities
  Sentence: The source confirms that Affinity Water appointed Mark Garth as the new CEO, who has significant sector experience from United Utilities.
- **2026-10-04-hicl/clean S7** supported_full, trigger `is confirmed`. Phrase: (the statement itself) [statement itself]
  Sentence: Therefore, the statement is confirmed.
- **2026-10-04-hicl/doc S0** supported_full, trigger `confirms that`. Phrase: HCIL Infrastructure's performance for the six months to 31 December 2025 was positive and largely in line with expectations
  Sentence: The source confirms that HCIL Infrastructure's performance for the six months to 31 December 2025 was positive and largely in line with expectations.
- **2026-10-04-hicl/doc S0** supported_full, trigger `supporting the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: It specifically states that the portfolio performance was in line with expectations, supporting the statement's claim.
- **2026-10-04-hicl/doc S1** supported_partial, trigger `confirms`. Phrase: robust operational performance and EBITDA growth driven by capital expenditure,
  Sentence: It confirms robust operational performance and EBITDA growth driven by capital expenditure, as well as resilient cash generation supporting the dividend program.
- **2026-10-04-hicl/doc S1** supported_partial, trigger `confirms`. Phrase: resilient cash generation supporting the dividend program
  Sentence: It confirms robust operational performance and EBITDA growth driven by capital expenditure, as well as resilient cash generation supporting the dividend program.
- **2026-10-04-hicl/doc S2** supported_partial, trigger `confirms that`. Phrase: growth investments are performing well and are driving EBITDA growth through significant expansion programs
  Sentence: The source confirms that growth investments are performing well and are driving EBITDA growth through significant expansion programs.
- **2026-10-04-hicl/doc S4** conflict, trigger `does confirm`. Phrase: Virgin Trains' intentions for cross-Channel operations and mentions progress on adding a second international operator on the route
  Sentence: The source does confirm Virgin Trains' intentions for cross-Channel operations and mentions progress on adding a second international operator on the route.
- **2026-10-04-hicl/doc S5** conflict, trigger `does confirm`. Phrase: there are ongoing co-location opportunities expected to support growth in EBITDA
  Sentence: The source does confirm that there are ongoing co-location opportunities expected to support growth in EBITDA, but the entity and figures for tower delivery do not match.
- **2026-10-06-gpi/doc S0** supported_partial, trigger `confirms that`. Phrase: GP Industries is shifting production capacity to Southeast Asia due to US tariffs and rising geopolitical tensions
  Sentence: The source confirms that GP Industries is shifting production capacity to Southeast Asia due to US tariffs and rising geopolitical tensions, but it does not specify the 75% figure or the exact timing in October 2025.
- **2026-10-06-gpi/doc S2** supported_partial, trigger `confirms`. Phrase: the intention to streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness
  Sentence: It confirms the intention to streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness.
- **2026-10-06-gpi/doc S4** conflict, trigger `is confirmed`. Phrase: distribution through one million outlets
  Sentence: The claim of distribution through one million outlets is confirmed.
- **2026-10-06-gpi/clean-run2 S0** supported_partial, trigger `confirms that`. Phrase: GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions
  Sentence: The source confirms that GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions, but it does not specify that the announcement was made in November 2025.
- **2026-10-06-gpi/clean-run2 S0** supported_partial, trigger `is confirmed`. Phrase: The shift to Southeast Asia
  Sentence: The shift to Southeast Asia is confirmed.
- **2026-10-06-gpi/clean-run2 S1** supported_partial, trigger `confirms`. Phrase: the number of facilities in Malaysia, Vietnam, Thailand,
  Sentence: It confirms the number of facilities in Malaysia, Vietnam, Thailand, and the UK.
- **2026-10-06-gpi/clean-run2 S1** supported_partial, trigger `confirms`. Phrase: the UK
  Sentence: It confirms the number of facilities in Malaysia, Vietnam, Thailand, and the UK.
- **2026-10-06-gpi/clean-run2 S2** supported_full, trigger `confirms that`. Phrase: the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness
  Sentence: The source confirms that the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness.
- **2026-10-06-gpi/clean-run2 S3** supported_full, trigger `confirms that`. Phrase: Gold Peak Technology Group, the parent of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres
  Sentence: The source confirms that Gold Peak Technology Group, the parent of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres.
- **2026-10-06-gpi/clean-run2 S4** supported_full, trigger `confirms that`. Phrase: GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide
  Sentence: The source confirms that GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide.
- **2026-10-06-gpi/clean-run2 S4** supported_full, trigger `are both supported`. Phrase: 6 billion
  Sentence: The figures '6 billion' and '1 million' are both supported by the source.
- **2026-10-06-gpi/clean-run2 S4** supported_full, trigger `are both supported`. Phrase: 1 million
  Sentence: The figures '6 billion' and '1 million' are both supported by the source.
- **2026-10-06-gpi/clean-run3 S0** supported_partial, trigger `confirms that`. Phrase: GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions
  Sentence: The source confirms that GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions, but it does not specify that the announcement was made in November 2025.
- **2026-10-06-gpi/clean-run3 S0** supported_partial, trigger `is confirmed`. Phrase: The shift to Southeast Asia
  Sentence: The shift to Southeast Asia is confirmed.
- **2026-10-06-gpi/clean-run3 S1** supported_full, trigger `match the source`. Phrase: UK
  Sentence: The phrase 'UK' matches the source.
- **2026-10-06-gpi/clean-run3 S2** supported_full, trigger `confirms that`. Phrase: the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness
  Sentence: The source confirms that the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness.
- **2026-10-06-gpi/clean-run3 S2** supported_full, trigger `directly supporting`. Phrase: (the statement itself) [statement itself]
  Sentence: The source explicitly states that the move will achieve these objectives, directly supporting the statement.
- **2026-10-06-gpi/clean-run3 S3** supported_full, trigger `confirms that`. Phrase: Gold Peak Technology Group, the parent company of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres
  Sentence: The source confirms that Gold Peak Technology Group, the parent company of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres.
- **2026-10-06-gpi/clean-run3 S4** supported_full, trigger `confirms the statement`. Phrase: GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide
  Sentence: The source confirms the statement that GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide.
- **2026-10-06-gpi/clean-run3 S4** supported_full, trigger `directly supporting`. Phrase: (the statement itself) [statement itself]
  Sentence: The source specifically states that GP Industries produces over six billion batteries annually and sells them through one million outlets, directly supporting the figures in the statement.
- **2026-10-06-gpi/clean-run4 S0** supported_partial, trigger `confirms that`. Phrase: GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions
  Sentence: The source confirms that GP Industries is shifting production capacity to Southeast Asia to navigate US tariffs and rising geopolitical tensions, but it does not specify that this announcement was made in November 2025.
- **2026-10-06-gpi/clean-run4 S0** supported_partial, trigger `is confirmed`. Phrase: The shift to Southeast Asia
  Sentence: The shift to Southeast Asia is confirmed.
- **2026-10-06-gpi/clean-run4 S1** supported_full, trigger `match the source`. Phrase: UK
  Sentence: The phrase 'UK' matches the source.
- **2026-10-06-gpi/clean-run4 S2** supported_full, trigger `confirms that`. Phrase: the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness
  Sentence: The source confirms that the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness.
- **2026-10-06-gpi/clean-run4 S2** supported_full, trigger `directly supporting`. Phrase: (the statement itself) [statement itself]
  Sentence: The source explicitly states that the move will achieve these objectives, directly supporting the statement.
- **2026-10-06-gpi/clean-run4 S3** supported_full, trigger `confirms that`. Phrase: Gold Peak Technology
  Sentence: The source confirms that Gold Peak Technology, which owns 86.18% of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres.
- **2026-10-06-gpi/clean-run4 S4** supported_full, trigger `confirms that`. Phrase: GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide
  Sentence: The source confirms that GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide.
- **2026-10-06-gpi/clean-run4 S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: These details match the statement precisely.
- **2026-10-06-gpi/clean-run5 S0** supported_full, trigger `confirms that`. Phrase: GP Industries is shifting production capacity to its manufacturing sites in Southeast Asia to serve the US market amid tariffs and rising geopolitical tensions
  Sentence: The source confirms that GP Industries is shifting production capacity to its manufacturing sites in Southeast Asia to serve the US market amid tariffs and rising geopolitical tensions.
- **2026-10-06-gpi/clean-run5 S0** supported_full, trigger `aligns with`. Phrase: (the statement itself) [statement itself]
  Sentence: The source specifically states that GP Industries is making this shift to navigate US tariffs and geopolitical tensions, which aligns with the statement.
- **2026-10-06-gpi/clean-run5 S0** supported_full, trigger `is confirmed`. Phrase: (the statement itself) [statement itself]
  Sentence: The claim about the timing ('In November 2025') is not addressed by the source, but the rest of the statement is confirmed.
- **2026-10-06-gpi/clean-run5 S1** supported_full, trigger `match the source`. Phrase: UK
  Sentence: The phrase 'UK' matches the source.
- **2026-10-06-gpi/clean-run5 S2** supported_full, trigger `confirms that`. Phrase: the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness
  Sentence: The source confirms that the capacity adjustments are intended to streamline supply chains to meet country-of-origin requirements while maintaining cost competitiveness.
- **2026-10-06-gpi/clean-run5 S3** supported_full, trigger `confirms that`. Phrase: Gold Peak Technology Group, the parent company of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres
  Sentence: The source confirms that Gold Peak Technology Group, the parent company of GP Industries, is planning a multi-million-dollar investment in Johor, Malaysia, to produce next-generation batteries for data centres.
- **2026-10-06-gpi/clean-run5 S4** supported_full, trigger `confirms the statement`. Phrase: GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide
  Sentence: The source confirms the statement that GP Industries is the second-largest producer of consumer batteries globally, producing over six billion batteries annually and selling them through one million outlets worldwide.
- **2026-10-06-clearpoint/dirty1 S0** conflict, trigger `is confirmed`. Phrase: The year 2026
  Sentence: The year 2026 is confirmed, but the month is not.
- **2026-10-06-clearpoint/dirty1 S1** supported_full, trigger `match the source`. Phrase: 43%
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/dirty1 S1** supported_full, trigger `match the source`. Phrase: 175
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/dirty1 S2** conflict, trigger `confirms`. Phrase: the 25% organic growth for devices
  Sentence: The source confirms the 25% organic growth for devices and the gross margin expansion to 64%.
- **2026-10-06-clearpoint/dirty1 S2** conflict, trigger `confirms`. Phrase: the gross margin expansion to 64%
  Sentence: The source confirms the 25% organic growth for devices and the gross margin expansion to 64%.
- **2026-10-06-clearpoint/dirty1 S3** supported_full, trigger `match the source`. Phrase: 80%
  Sentence: 80% and 3.0 match the source.
- **2026-10-06-clearpoint/dirty1 S3** supported_full, trigger `match the source`. Phrase: 3.0
  Sentence: 80% and 3.0 match the source.
- **2026-10-06-clearpoint/dirty1 S4** supported_full, trigger `confirms the statement`. Phrase: a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units
  Sentence: The source confirms the statement by reporting a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units.
- **2026-10-06-clearpoint/dirty1 S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The specific figures and reasons for the increase match the statement precisely.
- **2026-10-06-clearpoint/dirty1 S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The specific figures and reasons for the increase match the statement precisely.
- **2026-10-06-clearpoint/dirty1 S4** supported_full, trigger `match the source`. Phrase: due to
  Sentence: The phrase 'due to' matches the source.
- **2026-10-06-clearpoint/dirty1 S6** supported_full, trigger `confirms that`. Phrase: (the statement itself) [statement itself]
  Sentence: The source confirms that the company is making progress in its clinical trial program with more than 60 active biopharma partners, directly supporting the statement.
- **2026-10-06-clearpoint/dirty1 S7** conflict, trigger `confirms`. Phrase: completion
  Sentence: The statement suggests a pending approval process, while the source confirms completion.
- **2026-10-06-clearpoint/dirty1 S7** conflict, trigger `does confirm`. Phrase: the existence of the Velocity Alpha High Speed Surgical Drill
  Sentence: The source does confirm the existence of the Velocity Alpha High Speed Surgical Drill.
- **2026-10-06-clearpoint/dirty1 S8** supported_partial, trigger `does confirm`. Phrase: the coverage of both MRI-guidance and iCT guidance workflows
  Sentence: The source does confirm the coverage of both MRI-guidance and iCT guidance workflows and the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region.
- **2026-10-06-clearpoint/dirty1 S8** supported_partial, trigger `does confirm`. Phrase: the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region
  Sentence: The source does confirm the coverage of both MRI-guidance and iCT guidance workflows and the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region.
- **2026-10-06-clearpoint/clean1 S0** supported_full, trigger `match the source`. Phrase: 2026
  Sentence: 2026 matches the source.
- **2026-10-06-clearpoint/clean1 S1** supported_full, trigger `match the source`. Phrase: 43%
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean1 S1** supported_full, trigger `match the source`. Phrase: 175
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean1 S2** supported_partial, trigger `does confirm`. Phrase: the 16% overall organic growth year on year
  Sentence: It does confirm the 16% overall organic growth year on year and the gross margin expansion to 64%.
- **2026-10-06-clearpoint/clean1 S2** supported_partial, trigger `does confirm`. Phrase: the gross margin expansion to 64%
  Sentence: It does confirm the 16% overall organic growth year on year and the gross margin expansion to 64%.
- **2026-10-06-clearpoint/clean1 S3** supported_full, trigger `confirms the statement`. Phrase: an 80% increase in revenue to USD 5.9 million for the neurosurgery navigation, therapy, and access division
  Sentence: The source confirms the statement by reporting an 80% increase in revenue to USD 5.9 million for the neurosurgery navigation, therapy, and access division.
- **2026-10-06-clearpoint/clean1 S4** supported_full, trigger `confirms the statement`. Phrase: a 177% increase in capital equipment and software revenue, rising to $1.4 million from $0.5 million
  Sentence: The source confirms the statement by reporting a 177% increase in capital equipment and software revenue, rising to $1.4 million from $0.5 million.
- **2026-10-06-clearpoint/clean1 S4** supported_full, trigger `match the source`. Phrase: due to
  Sentence: The phrase 'due to' matches the source.
- **2026-10-06-clearpoint/clean1 S6** supported_full, trigger `confirms that`. Phrase: (the statement itself) [statement itself]
  Sentence: The source confirms that the company is making progress in its clinical trial program with more than 60 active biopharma partners, directly supporting the statement.
- **2026-10-06-clearpoint/clean1 S7** supported_full, trigger `match the source`. Phrase: Velocity Alpha
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean1 S7** supported_full, trigger `match the source`. Phrase: High Speed Surgical Drill
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean1 S7** supported_full, trigger `match the source`. Phrase: FDA
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean1 S7** supported_full, trigger `match the source`. Phrase: MR
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean1 S8** supported_full, trigger `match the source`. Phrase: Health Canada
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean1 S8** supported_full, trigger `match the source`. Phrase: Neuro Navigation System
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean1 S8** supported_full, trigger `match the source`. Phrase: MRI
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean1 S9** conflict, trigger `confirms`. Phrase: the revenue guidance range of USD 52-56 million for 2026, matching the statement
  Sentence: The source confirms the revenue guidance range of USD 52-56 million for 2026, matching the statement.
- **2026-10-06-clearpoint/clean2 S0** supported_full, trigger `match the source`. Phrase: 2026
  Sentence: 2026 matches the source.
- **2026-10-06-clearpoint/clean2 S1** supported_full, trigger `match the source`. Phrase: 43%
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean2 S1** supported_full, trigger `match the source`. Phrase: 175
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean2 S2** supported_partial, trigger `confirms`. Phrase: the 16% overall organic growth
  Sentence: It confirms the 16% overall organic growth and the 64% gross margin expansion, attributing the latter to lower excess and obsolete inventory.
- **2026-10-06-clearpoint/clean2 S2** supported_partial, trigger `confirms`. Phrase: the 64% gross margin expansion, attributing the latter to lower excess and obsolete inventory
  Sentence: It confirms the 16% overall organic growth and the 64% gross margin expansion, attributing the latter to lower excess and obsolete inventory.
- **2026-10-06-clearpoint/clean2 S3** supported_full, trigger `match the source`. Phrase: 80%
  Sentence: 80% and 3.0 match the source.
- **2026-10-06-clearpoint/clean2 S3** supported_full, trigger `match the source`. Phrase: 3.0
  Sentence: 80% and 3.0 match the source.
- **2026-10-06-clearpoint/clean2 S4** supported_full, trigger `confirms the statement`. Phrase: a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units
  Sentence: The source confirms the statement by reporting a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units.
- **2026-10-06-clearpoint/clean2 S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The specific figures and reasons for the increase match the statement precisely.
- **2026-10-06-clearpoint/clean2 S4** supported_full, trigger `match the statement`. Phrase: (the statement itself) [statement itself]
  Sentence: The specific figures and reasons for the increase match the statement precisely.
- **2026-10-06-clearpoint/clean2 S4** supported_full, trigger `match the source`. Phrase: due to
  Sentence: The phrase 'due to' matches the source.
- **2026-10-06-clearpoint/clean2 S6** supported_full, trigger `confirms that`. Phrase: the company is making progress in its clinical trial program with more than 60 active biopharma partners
  Sentence: The source confirms that the company is making progress in its clinical trial program with more than 60 active biopharma partners, as stated.
- **2026-10-06-clearpoint/clean2 S7** supported_full, trigger `match the source`. Phrase: Velocity Alpha
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean2 S7** supported_full, trigger `match the source`. Phrase: High Speed Surgical Drill
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean2 S7** supported_full, trigger `match the source`. Phrase: FDA
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean2 S7** supported_full, trigger `match the source`. Phrase: MR
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean2 S8** supported_full, trigger `match the source`. Phrase: Health Canada
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean2 S8** supported_full, trigger `match the source`. Phrase: Neuro Navigation System
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean2 S8** supported_full, trigger `match the source`. Phrase: MRI
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean2 S9** conflict, trigger `confirms`. Phrase: the company's revenue guidance for 2026 as being between USD 52 million and USD 56 million, matching the statement exactly
  Sentence: The source confirms the company's revenue guidance for 2026 as being between USD 52 million and USD 56 million, matching the statement exactly.
- **2026-10-06-clearpoint/clean3 S0** supported_full, trigger `match the source`. Phrase: 2026
  Sentence: 2026 matches the source.
- **2026-10-06-clearpoint/clean3 S1** supported_full, trigger `match the source`. Phrase: 43%
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean3 S1** supported_full, trigger `match the source`. Phrase: 175
  Sentence: 43% and 175 match the source.
- **2026-10-06-clearpoint/clean3 S2** supported_partial, trigger `does confirm`. Phrase: the 16% overall organic growth
  Sentence: It does confirm the 16% overall organic growth and the 25% growth for devices, as well as the 64% gross margin expansion.
- **2026-10-06-clearpoint/clean3 S2** supported_partial, trigger `does confirm`. Phrase: the 25% growth for devices,
  Sentence: It does confirm the 16% overall organic growth and the 25% growth for devices, as well as the 64% gross margin expansion.
- **2026-10-06-clearpoint/clean3 S2** supported_partial, trigger `does confirm`. Phrase: the 64% gross margin expansion
  Sentence: It does confirm the 16% overall organic growth and the 25% growth for devices, as well as the 64% gross margin expansion.
- **2026-10-06-clearpoint/clean3 S3** supported_full, trigger `confirms the statement`. Phrase: an 80% increase in revenue to USD 5.9 million for the neurosurgery navigation, therapy, and access division
  Sentence: The source confirms the statement by reporting an 80% increase in revenue to USD 5.9 million for the neurosurgery navigation, therapy, and access division.
- **2026-10-06-clearpoint/clean3 S4** supported_full, trigger `confirms the statement`. Phrase: a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units
  Sentence: The source confirms the statement by reporting a 177% increase in capital equipment and software revenue, attributing this growth to increased placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units.
- **2026-10-06-clearpoint/clean3 S4** supported_full, trigger `match the source`. Phrase: due to
  Sentence: The phrase 'due to' matches the source.
- **2026-10-06-clearpoint/clean3 S6** supported_full, trigger `confirms that`. Phrase: (the statement itself) [statement itself]
  Sentence: The source confirms that the company is making progress in its clinical trial program with more than 60 active biopharma partners, directly supporting the statement.
- **2026-10-06-clearpoint/clean3 S7** supported_full, trigger `match the source`. Phrase: Velocity Alpha
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean3 S7** supported_full, trigger `match the source`. Phrase: High Speed Surgical Drill
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean3 S7** supported_full, trigger `match the source`. Phrase: FDA
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean3 S7** supported_full, trigger `match the source`. Phrase: MR
  Sentence: The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source.
- **2026-10-06-clearpoint/clean3 S8** supported_full, trigger `match the source`. Phrase: Health Canada
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean3 S8** supported_full, trigger `match the source`. Phrase: Neuro Navigation System
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean3 S8** supported_full, trigger `match the source`. Phrase: MRI
  Sentence: The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source.
- **2026-10-06-clearpoint/clean3 S9** conflict, trigger `confirms`. Phrase: the company's revenue guidance for 2026 as being between USD 52 million and USD 56 million, matching the statement exactly
  Sentence: The source confirms the company's revenue guidance for 2026 as being between USD 52 million and USD 56 million, matching the statement exactly.


### Guard A

The affirmed phrase overlaps an unsupported span on the same card. Overlap is content words, stopwords dropped. Two words match when they are equal or share a prefix of at least 6 letters and the shorter word is within 4 letters of that prefix (`commencement` and `commenced`). A phrase of three content words or fewer fires on one match. A longer phrase fires when at least two content words match and those are at least 45% of the phrase.

17 firings, 13 cards. 4 firings are on clean cards (3 cards).

| Payload | Statement | Verdict | Phrase | Span it overlapped |
|---|---|---|---|---|
| 2026-09-29/doc | S8 | supported_partial | a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i | MAIT also completed a pro-rata redemption of shares, which generated significant proceeds for 3i. |
| 2026-09-29/doc | S14 | supported_partial | the cautious stance on capital deployment into new investments | the UK government maintains its cautious stance on capital deployment into new investments, but remains open to selective allocations to lower-risk reinvestments in existing portfolio companies. |
| 2026-09-29/doc | S14 | supported_partial | the openness to selective allocations to lower-risk reinvestments | the same span |
| 2026-10-02/doc | S0 | conflict | a 13% return on opening shareholders' funds | the whole return sentence, including GBP 3.3 million and the 13% |
| 2026-10-02/doc | S14 | supported_partial | the cautious stance on capital deployment into new investments | the UK government sentence |
| 2026-10-02/doc | S14 | supported_partial | the openness to selective allocations to lower-risk reinvestments | the same span |
| 2026-10-04-hicl/doc | S2 | supported_partial | growth investments are performing well and are driving EBITDA growth through significant expansion programs | driving EBITDA growth that continues to significantly outperform budgets |
| 2026-10-06-gpi/doc | S0 | supported_partial | GP Industries is shifting production capacity to Southeast Asia due to US tariffs and rising geopolitical tensions | the whole October / 75% / oil sentence, which also contains the shift |
| 2026-10-06-clearpoint/dirty1 | S0 | conflict | The year 2026 | ClearPoint Neuro announced in April 2026 its financial results for the first quarter of 2026. |
| 2026-10-06-clearpoint/dirty1 | S2 | conflict | the 25% organic growth for devices | the whole sentence, which also contains -50% |
| 2026-10-06-clearpoint/dirty1 | S2 | conflict | the gross margin expansion to 64% | the same whole sentence |
| 2026-10-06-clearpoint/dirty1 | S7 | conflict | the existence of the Velocity Alpha High Speed Surgical Drill | a submission for FDA approval has been made for the company's Velocity Alpha MR High Speed Surgical Drill System |
| 2026-10-06-clearpoint/dirty1 | S8 | supported_partial | the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region | the first commercial drug delivery case utilizing ClearPoint technology has been commenced in the Asia-Pacific region. |
| 2026-10-06-clearpoint/clean1 | S2 | supported_partial | the gross margin expansion to 64% | the gross margin expanded to 64% over the period on account of lower allowances for excess and obsolete inventory. |
| 2026-10-06-clearpoint/clean2 | S2 | supported_partial | the 16% overall organic growth | the whole organic-growth sentence |
| 2026-10-06-clearpoint/clean2 | S2 | supported_partial | the 64% gross margin expansion, attributing the latter to lower excess and obsolete inventory | the same whole sentence |
| 2026-10-06-clearpoint/clean3 | S2 | supported_partial | the 64% gross margin expansion | while the gross margin expanded to 64% over the period on account of lower allowances for excess and obsolete inventory. |

Correct firings: 1 of 17. ClearPoint dirty S8. The highlight is that clause, and the comment affirms "the commencement". The source says "Completion of the first commercial drug delivery case". The card tells the author the unsupported clause is confirmed.

False firings: 16 of 17, including all 4 on clean cards.

The pattern is a wide highlight. The span is the whole sentence, or a clause that bundles a true figure with the real gap, so a fair confirmation shares words with it.

- ClearPoint dirty S0. The comment says the year 2026 is confirmed and the month is not. The span is "announced in April 2026". The year is a fair confirmation. The guard fires because `2026` sits inside the month span.
- ClearPoint clean S2, all three runs. The comment confirms 16% or the expansion to 64%, both of which the source states. The span is the whole growth sentence or the margin clause that also carries the inventory cause. The confirmation is fair.
- GP doctored S0. The comment confirms the shift to Southeast Asia, which the draft does say. The span is the whole planted sentence (October, 75%, oil, and the shift). The confirmation of the shift is fair.
- 3i doctored S14, both the September and the October payloads. The comment confirms the cautious stance. The span is the whole UK-government sentence, so the stance words are inside the highlight. The stance is the author's claim and the source's claim. The wrong actor is "the UK government", which this phrase does not affirm.
- 3i October doctored S0. The comment confirms the 13% return, which is in the draft and in the source. The span is the whole sentence, whose fault is million against billion. The 13% confirmation is fair.
- HICL doctored S2. The comment says growth investments are performing well. The span is the planted "significantly outperform budgets". The shared words are `driving`, `EBITDA`, `growth`, and `significant`. The comment does not affirm "outperform".
- 3i September doctored S8. The comment confirms the pro-rata redemption and the proceeds to 3i, which the source says of Action. The span is the whole MAIT sentence, so the redemption words are inside the highlight. The comment does not affirm MAIT. The redemption confirmation is fair.
- ClearPoint dirty S2 and S7. The 25% for devices, the 64% margin, and the existence of the drill are in the draft and in the source. The spans are the whole planted sentences (-50%, and the FDA submission).

A guard that fires when the highlight is a whole sentence will fire on any card that confirms the true half of that sentence. That is most of these 16. It is not shippable on this measurement.

### Guard B

The affirmed phrase, lowercased, punctuation stripped, is not a substring of the author's statement. Meta phrases that name the statement itself do not fire.

93 firings, 76 cards. 51 firings are on clean cards (43 cards).

Correct firings: 4 of 93. The card affirms wording the author did not write, and that wording is not a fair restatement of the author's claim.

| Payload | Statement | Verdict | Affirmed phrase | What the author wrote |
|---|---|---|---|---|
| 2026-10-06-gpi/doc | S2 | supported_partial | the intention to streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness | "improving the cost structure". "maintain cost competitiveness" is the source's line. |
| 2026-10-06-gpi/doc | S4 | conflict | distribution through one million outlets | "bartered through 1 million outlets". |
| 2026-10-06-clearpoint/dirty1 | S8 | supported_partial | the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region | "has been commenced". The source says completion. |
| 2026-10-06-clearpoint/dirty1 | S7 | conflict | completion | "a submission for FDA approval has been made". The card is already a conflict, and the comment still affirms the source's word. |

False firings: 89 of 93. Fifty-one of those are on clean drafts. A firing is false when the comment is restating the author's own claim: inflection, word order, a synonym, a digit written as a word, or a source detail added onto a claim the author did make.

Examples, the same weight as the catches:

- 3i 29 September clean S2, green. Phrase: "Action continues to trade strongly". Statement: "This was driven largely by Action, which continues to trade strongly." The words are the author's. They are not contiguous in that order.
- GP clean S4, green on all four runs. Phrase: "producing over six billion batteries annually and selling them through one million outlets worldwide". Statement: "producing over 6 billion batteries annually, which are sold through 1 million outlets worldwide." Same figures, the author's verb `sold`, the source's `selling` and `six` and `one`.
- HICL clean S6, partial. Phrase: "Fortysouth, a part of the company, completed an oversubscribed refinancing and achieved a reduction in debt margins". Statement: "The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs." A careful editor would accept the cost sentence as a paraphrase. The guard fires anyway. That card is written up in Part 2.
- ClearPoint clean S9, conflict, all three runs. The comment confirms guidance of USD 52 million to USD 56 million for 2026. The draft says "USD 52-56 million for 2026". The affirmation is fair. The string is not a substring because of the hyphen. The verdict on that card is a separate false red. The guard is not detecting it.
- HICL clean S0. Phrase "positive performance" against "was positive and largely in line with expectations". Fair.
- GP clean runs 2 and 3, S0. Phrase "The shift to Southeast Asia" against "shift production capacity to its manufacturing sites in Southeast Asia". Fair.

The other false firings are the same shape: the comment retells a green or partial card in the source's word order, and the retelling is not a copy of the draft. The full firing list is the Guard B rows inside the sentence list above, and in `affirm-guards.json`.

Guard B catches the three substitutions it was aimed at, and it also fires on 43 clean cards. A guard that fires on honest paraphrase is not shippable. This measurement does not propose a replacement.

### Anchors

| Anchor | Result |
|---|---|
| ClearPoint dirty1 S8. Draft "has been commenced". Unsupported span is that clause. Comment affirms "the commencement". Guard A must fire. | Fired. Phrase: "the commencement of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region". Judged correct. |
| GP doc S4. Draft "bartered through 1 million outlets". Comment affirms "distribution through one million outlets". Guard B must fire. | Fired. Judged correct. |
| GP doc S2. Draft "improving the cost structure". Comment affirms "maintain cost competitiveness". Guard B must fire. | Fired, inside the longer phrase "the intention to streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness". Judged correct. |

The same S8 sentence also produces a Guard B firing on "the coverage of both MRI-guidance and iCT guidance workflows". The draft says "which covers both MRI-guidance and iCT guidance workflows". That half is a fair inflection (`covers` / `coverage`). It is one of the 89 false Guard B firings.

## Part 2 and Part 3. The same axis

Content words only. Stopwords dropped. Case folded. Punctuation stripped. Apostrophes dropped. Digits and `%` kept. A word is counted once.

The fraction is shared content words of the statement, divided by content words of the statement. The passage is the card's confirmed `supportSpans`, plus `primaryExcerpt` when that excerpt is under 2,000 characters. A longer `primaryExcerpt` on these payloads is the source pasted whole (ClearPoint clean S0 and S7, about 8,000 to 13,000 characters, three runs). Those six cards are marked `no tight passage` and are not given a fraction. Confirmed spans were empty on them.

This fraction is a measurement of the stored cards. It is not a threshold. It is not a proposal to wire any overlap into the matcher. The ban on the Jaccard name matcher in product code is unchanged.

Part 3 keeps a planted fault whose stored `displayVerdict` is not `conflict`. The planted lists are the fixture READMEs. A statement the product did call `conflict` is left out, including HICL doctored S5, where "during the past year" was missed inside a card that was already a conflict on TowerCo and 20 towers. HICL doctored S1 and S2 are in the table because the README calls those plants caught and the verdict is still `supported_partial`. October doctored S14 is in the table because the README calls the six plants caught and the verdict is still `supported_partial`.


Sorted from least shared wording to most. `clean` is every clean statement. `doctored-miss` is a planted fault the stored verdict did not call `conflict`.

| Overlap | Shared | Side | Payload | Statement | Verdict | Note |
|---|---|---|---|---|---|---|
| none | 0/19 | clean | 2026-09-29/clean | S10 Elsewhere, within the private equity portfolio, 3i completed the sale of MPM and signed... | unverifiable | no tight passage |
| none | 0/19 | doctored-miss | 2026-10-04-hicl/doc | S7 Meanwhile, Affinity Water appointed a new CFO with significant sector experience and st... | not_supported | new CFO, French government, electricity sector |
| none | 0/9 | clean | 2026-10-06-clearpoint/clean1 | S0 In May 2026, ClearPoint Neuro reported its financial results for the first quarter of 2... | supported_full | long excerpt left out |
| none | 0/18 | clean | 2026-10-06-clearpoint/clean1 | S7 Notably, FDA clearance was received and first clinical procedures completed utilizing t... | supported_full | long excerpt left out |
| none | 0/9 | clean | 2026-10-06-clearpoint/clean2 | S0 In May 2026, ClearPoint Neuro reported its financial results for the first quarter of 2... | supported_full | long excerpt left out |
| none | 0/18 | clean | 2026-10-06-clearpoint/clean2 | S7 Notably, FDA clearance was received and first clinical procedures completed utilizing t... | supported_full | long excerpt left out |
| none | 0/9 | clean | 2026-10-06-clearpoint/clean3 | S0 In May 2026, ClearPoint Neuro reported its financial results for the first quarter of 2... | supported_full | long excerpt left out |
| none | 0/18 | clean | 2026-10-06-clearpoint/clean3 | S7 Notably, FDA clearance was received and first clinical procedures completed utilizing t... | supported_full | long excerpt left out |
| none | 0/9 | doctored-miss | 2026-10-06-clearpoint/dirty1 | S9 The company provided updated revenue guidance of USD 56 million for 2027. | not_supported | USD 56 million for 2027 |
| 0.10 | 2/21 | clean | 2026-10-06-gpi/clean-run3 | S1 The company currently operates three facilities in Malaysia, two in Vietnam, and one in... | supported_full |  |
| 0.10 | 2/21 | clean | 2026-10-06-gpi/clean-run4 | S1 The company currently operates three facilities in Malaysia, two in Vietnam, and one in... | supported_full |  |
| 0.10 | 2/21 | clean | 2026-10-06-gpi/clean-run5 | S1 The company currently operates three facilities in Malaysia, two in Vietnam, and one in... | supported_full |  |
| 0.17 | 2/12 | doctored-miss | 2026-10-04-hicl/doc | S0 HCIL Infrastructure’s performance for the six months to 31 December 2025 was positive a... | supported_full | HCIL, and six months to 31 December 2025 |
| 0.30 | 3/10 | clean | 2026-10-06-clearpoint/clean1 | S9 The company provided updated revenue guidance of USD 52-56 million for 2026. | conflict |  |
| 0.30 | 3/10 | clean | 2026-10-06-clearpoint/clean2 | S9 The company provided updated revenue guidance of USD 52-56 million for 2026. | conflict |  |
| 0.30 | 3/10 | clean | 2026-10-06-clearpoint/clean3 | S9 The company provided updated revenue guidance of USD 52-56 million for 2026. | conflict |  |
| 0.33 | 2/6 | clean | 2026-09-29/clean | S2 This was driven largely by Action, which continues to trade strongly. | supported_full |  |
| 0.33 | 7/21 | doctored-miss | 2026-09-29/doc | S14 Looking ahead, the UK government maintains its cautious stance on capital deployment in... | supported_partial | management rewritten as the UK government |
| 0.33 | 7/21 | doctored-miss | 2026-10-02/doc | S14 Looking ahead, the UK government maintains its cautious stance on capital deployment in... | supported_partial | management rewritten as the UK government |
| 0.35 | 7/20 | clean | 2026-09-29/clean | S14 Looking ahead, management maintains its cautious stance on capital deployment into new ... | supported_full |  |
| 0.36 | 5/14 | clean | 2026-09-29/clean | S13 In light of the overall good performance of the portfolio, 3i declared a dividend of GB... | supported_full |  |
| 0.38 | 10/26 | doctored-miss | 2026-10-06-clearpoint/dirty1 | S8 Elsewhere, the FDA issued a medical device license for the ClearPoint Neuro Navigation ... | supported_partial | FDA for Health Canada, and commenced for completed |
| 0.40 | 4/10 | clean | 2026-09-29/clean | S6 Meanwhile, Action successfully completed several balance sheet transactions in October ... | unverifiable |  |
| 0.40 | 4/10 | clean | 2026-10-06-clearpoint/clean1 | S5 Meanwhile, biologics and drug delivery revenue was broadly flat compared with the prior... | supported_partial |  |
| 0.40 | 4/10 | clean | 2026-10-06-clearpoint/clean2 | S5 Meanwhile, biologics and drug delivery revenue was broadly flat compared with the prior... | supported_partial |  |
| 0.40 | 4/10 | clean | 2026-10-06-clearpoint/clean3 | S5 Meanwhile, biologics and drug delivery revenue was broadly flat compared with the prior... | supported_partial |  |
| 0.42 | 5/12 | clean | 2026-10-04-hicl/clean | S0 HICL Infrastructure’s performance for the five months to 28 February 2026 was positive ... | supported_full |  |
| 0.42 | 11/26 | doctored-miss | 2026-10-06-clearpoint/dirty1 | S3 Topline growth was driven by the neurosurgery navigation, therapy and access division, ... | supported_full | segment called the vast majority of total revenue |
| 0.44 | 8/18 | clean | 2026-09-29/clean | S0 3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025... | conflict |  |
| 0.44 | 8/18 | doctored-miss | 2026-09-29/doc | S12 Performance was driven primarily by share price gains at 3i Infrastructure plc, which c... | supported_full | gains widened from TCR to essentially all investments |
| 0.44 | 8/18 | clean | 2026-10-06-clearpoint/clean1 | S2 Organic growth amounted to 16% year on year (25% for devices), while the gross margin e... | supported_partial |  |
| 0.46 | 6/13 | clean | 2026-10-06-clearpoint/clean1 | S6 Meanwhile, the company continues to progress its clinical trial program, which now cove... | supported_full |  |
| 0.46 | 6/13 | clean | 2026-10-06-clearpoint/clean2 | S6 Meanwhile, the company continues to progress its clinical trial program, which now cove... | supported_full |  |
| 0.46 | 6/13 | clean | 2026-10-06-clearpoint/clean3 | S6 Meanwhile, the company continues to progress its clinical trial program, which now cove... | supported_full |  |
| 0.46 | 12/26 | doctored-miss | 2026-10-06-gpi/doc | S0 In October 2025, GP Industries announced that it intends to shift 75% of its global pro... | supported_partial | October 2025, 75% of capacity, escalating oil prices |
| 0.47 | 7/15 | clean | 2026-09-29/clean | S1 The private equity business generated gross investment returns of 14% for the period an... | supported_partial |  |
| 0.50 | 9/18 | clean | 2026-10-04-hicl/clean | S7 Meanwhile, Affinity Water appointed a new CEO with significant sector experience and st... | supported_full |  |
| 0.50 | 8/16 | doctored-miss | 2026-10-04-hicl/doc | S2 Across the portfolio, growth investments continue to perform well, with significant inv... | supported_partial | significantly outperform budgets |
| 0.50 | 8/16 | doctored-miss | 2026-10-06-gpi/doc | S2 The capacity adjustments are intended to streamline supply chains to meet country-of-or... | supported_partial | enhancing site security |
| 0.53 | 10/19 | clean | 2026-10-04-hicl/clean | S4 On the commercial front, progress has been made on adding a second international operat... | supported_full |  |
| 0.56 | 10/18 | doctored-miss | 2026-10-04-hicl/doc | S1 Across the portfolio, operational performance was robust, with average 30% EBITDA growt... | supported_partial | average 30% EBITDA growth |
| 0.57 | 8/14 | clean | 2026-09-29/clean | S3 The company’s new store expansion program is set for another record year with new store... | supported_full |  |
| 0.58 | 14/24 | clean | 2026-10-06-clearpoint/clean1 | S3 Topline growth was driven by the neurosurgery navigation, therapy and access division, ... | supported_full |  |
| 0.58 | 14/24 | clean | 2026-10-06-clearpoint/clean2 | S3 Topline growth was driven by the neurosurgery navigation, therapy and access division, ... | supported_full |  |
| 0.58 | 14/24 | clean | 2026-10-06-clearpoint/clean3 | S3 Topline growth was driven by the neurosurgery navigation, therapy and access division, ... | supported_full |  |
| 0.59 | 10/17 | clean | 2026-09-29/clean | S12 Performance was driven primarily by share price gains at 3i Infrastructure plc, which c... | supported_full |  |
| 0.60 | 6/10 | doctored-miss | 2026-09-29/doc | S8 MAIT also completed a pro-rata redemption of shares, which generated significant procee... | supported_partial | Action renamed to MAIT |
| 0.60 | 9/15 | clean | 2026-10-04-hicl/clean | S2 Across the portfolio, growth investments continue to perform well, with significant inv... | supported_full |  |
| 0.60 | 6/10 | clean | 2026-10-04-hicl/clean | S6 The company also recently completed an oversubscribed refinancing, which will lead to a... | supported_partial |  |
| 0.62 | 13/21 | clean | 2026-09-29/clean | S7 The company repriced EUR 3.1 billion of existing term debt, extending maturities and ge... | unverifiable |  |
| 0.63 | 10/16 | clean | 2026-09-29/clean | S9 A portion of these proceeds was redeployed to acquire a further 2.2% stake in the busin... | conflict |  |
| 0.63 | 10/16 | clean | 2026-10-04-hicl/clean | S1 Across the portfolio, operational performance was robust, with EBITDA growth driven by ... | supported_full |  |
| 0.63 | 15/24 | clean | 2026-10-06-clearpoint/clean1 | S1 The company delivered 43% year-on-year growth in revenue to USD 12.1 million, driven by... | supported_full |  |
| 0.63 | 15/24 | clean | 2026-10-06-clearpoint/clean2 | S1 The company delivered 43% year-on-year growth in revenue to USD 12.1 million, driven by... | supported_full |  |
| 0.63 | 15/24 | clean | 2026-10-06-clearpoint/clean3 | S1 The company delivered 43% year-on-year growth in revenue to USD 12.1 million, driven by... | supported_full |  |
| 0.64 | 9/14 | clean | 2026-09-29/clean | S5 Net sales for the nine months to 28 September 2025 amounted to EUR 11.2 billion, with l... | supported_full |  |
| 0.67 | 12/18 | clean | 2026-10-06-clearpoint/clean2 | S2 Organic growth amounted to 16% year on year (25% for devices), while the gross margin e... | supported_partial |  |
| 0.67 | 12/18 | clean | 2026-10-06-clearpoint/clean3 | S2 Organic growth amounted to 16% year on year (25% for devices), while the gross margin e... | supported_partial |  |
| 0.67 | 14/21 | clean | 2026-10-06-gpi/clean-run2 | S0 In November 2025, GP Industries announced that it intends to shift production capacity ... | supported_partial |  |
| 0.67 | 14/21 | clean | 2026-10-06-gpi/clean-run3 | S0 In November 2025, GP Industries announced that it intends to shift production capacity ... | supported_partial |  |
| 0.67 | 14/21 | clean | 2026-10-06-gpi/clean-run4 | S0 In November 2025, GP Industries announced that it intends to shift production capacity ... | supported_partial |  |
| 0.67 | 14/21 | clean | 2026-10-06-gpi/clean-run5 | S0 In November 2025, GP Industries announced that it intends to shift production capacity ... | supported_full |  |
| 0.69 | 9/13 | clean | 2026-09-29/clean | S11 On the infrastructure side, gross investment returns stood at 9% for the period, outper... | supported_full |  |
| 0.69 | 9/13 | clean | 2026-10-06-gpi/clean-run2 | S2 The capacity adjustments are intended to streamline supply chains to meet country-of-or... | supported_full |  |
| 0.69 | 9/13 | clean | 2026-10-06-gpi/clean-run3 | S2 The capacity adjustments are intended to streamline supply chains to meet country-of-or... | supported_full |  |
| 0.69 | 9/13 | clean | 2026-10-06-gpi/clean-run4 | S2 The capacity adjustments are intended to streamline supply chains to meet country-of-or... | supported_full |  |
| 0.69 | 9/13 | clean | 2026-10-06-gpi/clean-run5 | S2 The capacity adjustments are intended to streamline supply chains to meet country-of-or... | supported_full |  |
| 0.70 | 7/10 | clean | 2026-09-29/clean | S8 Action also completed a pro-rata redemption of shares, which generated significant proc... | supported_full |  |
| 0.74 | 14/19 | clean | 2026-10-06-gpi/clean-run2 | S3 Meanwhile, Gold Peak Technology (parent of GP Industries) is planning an investment pro... | supported_full |  |
| 0.74 | 14/19 | clean | 2026-10-06-gpi/clean-run3 | S3 Meanwhile, Gold Peak Technology (parent of GP Industries) is planning an investment pro... | supported_full |  |
| 0.74 | 14/19 | clean | 2026-10-06-gpi/clean-run4 | S3 Meanwhile, Gold Peak Technology (parent of GP Industries) is planning an investment pro... | supported_full |  |
| 0.74 | 14/19 | clean | 2026-10-06-gpi/clean-run5 | S3 Meanwhile, Gold Peak Technology (parent of GP Industries) is planning an investment pro... | supported_full |  |
| 0.76 | 16/21 | clean | 2026-10-06-gpi/clean-run2 | S1 The company currently operates three facilities in Malaysia, two in Vietnam, and one in... | supported_partial |  |
| 0.81 | 22/27 | clean | 2026-10-06-clearpoint/clean1 | S8 Elsewhere, Health Canada issued a medical device license for the ClearPoint Neuro Navig... | supported_full |  |
| 0.81 | 22/27 | clean | 2026-10-06-clearpoint/clean2 | S8 Elsewhere, Health Canada issued a medical device license for the ClearPoint Neuro Navig... | supported_full |  |
| 0.81 | 22/27 | clean | 2026-10-06-clearpoint/clean3 | S8 Elsewhere, Health Canada issued a medical device license for the ClearPoint Neuro Navig... | supported_full |  |
| 0.83 | 10/12 | clean | 2026-09-29/clean | S4 Year to date like-for-like trading remains healthy despite weakening consumer confidenc... | supported_full |  |
| 0.83 | 15/18 | clean | 2026-10-04-hicl/clean | S3 Among the significant holdings, London St. Pancras High Speed performed well during the... | supported_full |  |
| 0.84 | 16/19 | clean | 2026-10-06-clearpoint/clean1 | S4 Capital equipment and software revenue increased by 177% from a low base due to an incr... | supported_full |  |
| 0.84 | 16/19 | clean | 2026-10-06-clearpoint/clean2 | S4 Capital equipment and software revenue increased by 177% from a low base due to an incr... | supported_full |  |
| 0.84 | 16/19 | clean | 2026-10-06-clearpoint/clean3 | S4 Capital equipment and software revenue increased by 177% from a low base due to an incr... | supported_full |  |
| 0.85 | 17/20 | clean | 2026-10-04-hicl/clean | S5 Elsewhere, Fortysouth delivered 16 new towers during the period and is actively progres... | supported_full |  |
| 0.94 | 15/16 | clean | 2026-10-06-gpi/clean-run2 | S4 GP Industries is the second-largest producer of consumer batteries globally, producing ... | supported_full |  |
| 0.94 | 15/16 | clean | 2026-10-06-gpi/clean-run3 | S4 GP Industries is the second-largest producer of consumer batteries globally, producing ... | supported_full |  |
| 0.94 | 15/16 | clean | 2026-10-06-gpi/clean-run4 | S4 GP Industries is the second-largest producer of consumer batteries globally, producing ... | supported_full |  |
| 0.94 | 15/16 | clean | 2026-10-06-gpi/clean-run5 | S4 GP Industries is the second-largest producer of consumer batteries globally, producing ... | supported_full |  |


### Are the clean ambers the ones with the least shared wording?

No.

On the 73 clean statements, among cards that have a passage:

| Band | Cards | With a passage | Minimum | Median | Maximum |
|---|---|---|---|---|---|
| confirmed (green) | 53 | 47 | 0.10 | 0.67 | 0.94 |
| partial (amber) | 12 | 12 | 0.40 | 0.63 | 0.76 |
| conflict (red) | 5 | 5 | 0.30 | 0.30 | 0.63 |
| unverifiable | 3 | 2 | 0.40 | 0.51 | 0.62 |

The partial median sits next to the confirmed median. The lowest fractions on the clean set are green: GP clean runs 3, 4, and 5, S1, at 2 of 21 content words (0.10). Those three cards have no confirmed support span. The excerpt is the 39-character line "It also has two other plants in the UK." The card is still `supported_full`. GP clean run 2 on the same sentence is partial at 0.76, with a real passage. The low-overlap copies are the green ones.

The five clean reds are not a low-overlap cluster either. Three of them are ClearPoint S9, the false conflict on guidance of USD 52-56 million, at 0.30. 3i September clean S9, a real conflict, is at 0.63, on the confirmed median.

### ClearPoint clean S2

Amber on all three runs. `supported_partial`.

Statement: "Organic growth amounted to 16% year on year (25% for devices), while the gross margin expanded to 64% over the period on account of lower allowances for excess and obsolete inventory."

The source headline includes "25% Organic Growth in Devices". The body says "The increase in gross margin is primarily due to lower excess and obsolete inventory".

| Run | Overlap | What the comment does | What the card's own passage does |
|---|---|---|---|
| clean1 | 0.44 (8 of 18) | Says the source does not confirm 25% organic growth for devices, and does not specify the gross-margin cause. | A confirmed span and the excerpt are the sentence that states the cause: "primarily due to lower excess and obsolete inventory". The headline is not among the confirmed spans, which is why `25%` and `devices` are missing from the 8 shared words. |
| clean2 | 0.67 (12 of 18) | Says the source does not specify the 25%, and does attribute the margin to lower excess and obsolete inventory. | A confirmed span is "record revenue achievement and 25% organic devices growth made the headline". The comment denies a line that is on the card. |
| clean3 | 0.67 (12 of 18) | Says the source does confirm the 25% for devices, and does not confirm the gross-margin cause. | The excerpt and a confirmed span state "lower excess and obsolete inventory". The comment denies a line that is on the card. |

A careful editor would call both the 25% device growth and the gross-margin cause confirmed. The source states each of them. The amber is the comment arguing with the quote on its own card. It is not a low-overlap card. Runs 2 and 3 sit on the confirmed median of 0.67.

### ClearPoint clean S5

Amber on all three runs. `supported_partial`. Overlap 0.40 on each (4 of 10).

Statement: "Meanwhile, biologics and drug delivery revenue was broadly flat compared with the prior year."

Passage, the same on all three: "Biologics and drug delivery revenue ... increased slightly to $4.8 million for the three months ended March 31, 2026 from $4.7 million for the three months ended March 31, 2025."

Shared words: biologics, drug, delivery, revenue. `broadly` and `flat` are not in the passage.

A rise from 4.7 to 4.8 is about 2%. A careful editor would accept "broadly flat" as a fair characterisation of that movement. The period is a separate, narrower point: the draft says "the prior year" and the passage is the prior-year quarter. The fixture README already calls that arguable. It does not make the paraphrase false. Runs 2 and 3 of the comment say a slight increase is not "broadly flat". That is the harsh reading.

Overlap 0.40 is toward the low side because the two characterising words are not shared. It is still above the green floor of 0.10, and above several confirmed cards. This amber is not "the least shared wording".

### The debt-servicing card

The brief names this as "gpi clean S6". There is no such card. The GP clean drafts have five statements, S0 to S4. None of them is about debt servicing. The sentence is HICL clean S6.

Statement: "The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs."

Passage: "The company recently completed an accretive refinancing which was c.30% oversubscribed, and which enabled a step-down on debt margins earlier than forecast, underlining the quality and long-term visibility of Fortysouth's revenues."

Verdict: `supported_partial`. Overlap 0.60 (6 of 10). Shared: company, recently, completed, oversubscribed, refinancing, debt. Not shared: reduction, servicing, costs, lead.

The comment says the source "aligns with the statement's claim of reduced debt servicing costs" and then marks the card partial because the source names Fortysouth rather than the whole company.

A careful editor would call the cost claim confirmed. A step-down on debt margins is a reduction in debt servicing costs. The actor is a separate question, and a careful editor could still mark that partial. The overlap of 0.60 does not put the card at the low end of the clean set. It sits between the partial median (0.63) and the confirmed median (0.67).

### Are the misses the statements with the most shared wording?

No.

The 13 planted faults that were not called `conflict`, with the fraction:

| Overlap | Payload | Statement | Verdict | Plant |
|---|---|---|---|---|
| none | 2026-10-04-hicl/doc | S7 | not_supported | new CFO, French government, electricity sector. No passage was attached. |
| none | 2026-10-06-clearpoint/dirty1 | S9 | not_supported | USD 56 million for 2027. No passage was attached. The product refused support. |
| 0.17 | 2026-10-04-hicl/doc | S0 | supported_full | HCIL, and six months to 31 December 2025. Green miss. Low overlap. |
| 0.33 | 2026-09-29/doc | S14 | supported_partial | management rewritten as the UK government |
| 0.33 | 2026-10-02/doc | S14 | supported_partial | the same sentence, October payload |
| 0.38 | 2026-10-06-clearpoint/dirty1 | S8 | supported_partial | FDA for Health Canada, and commenced for completed |
| 0.42 | 2026-10-06-clearpoint/dirty1 | S3 | supported_full | a segment at $5.9 million called the vast majority of a $12.1 million total. Green. |
| 0.44 | 2026-09-29/doc | S12 | supported_full | gains widened from TCR to essentially all investments. Green. |
| 0.46 | 2026-10-06-gpi/doc | S0 | supported_partial | October 2025, 75% of capacity, escalating oil prices |
| 0.50 | 2026-10-04-hicl/doc | S2 | supported_partial | significantly outperform budgets |
| 0.50 | 2026-10-06-gpi/doc | S2 | supported_partial | enhancing site security |
| 0.56 | 2026-10-04-hicl/doc | S1 | supported_partial | average 30% EBITDA growth |
| 0.60 | 2026-09-29/doc | S8 | supported_partial | Action renamed to MAIT |

The highest of these is 0.60, below the clean confirmed median of 0.67. The green misses are not at the top. HICL doctored S0 is at 0.17. ClearPoint dirty S3, the vast-majority card, is at 0.42 (11 of 26). "vast" and "majority" are not in the matched passage, so the wrong characterisation lowers the fraction, and the card is still green. ClearPoint dirty S8, the commenced case, is at 0.38.

Two of the 13 have no passage and verdict `not_supported`. Those are refusals, not green misses. They sit at the empty end of the axis, not the high end.

### Plain statement

On this corpus the product is not scoring shared wording in place of substance. Clean partials and clean confirmed cards occupy the same overlap band. The lowest overlaps are green. The planted faults that stayed green are not the statements with the most shared words.

The false reassurance in the comment is real. The three anchors are in the stored cards: the commencement, "distribution through one million outlets", and "maintain cost competitiveness". A string guard on the comment catches them and also catches ordinary restatement, especially on clean drafts. That is the measurement. It is not a rule, and it is not a threshold.

## Technical summary

`scripts/diagnostic/b379/affirm-guards.mjs` reads the 14 stored payloads, splits `evidenceSummary`, and lists every affirming clause with the phrase pulled from it. Guard A is content-word overlap with `unsupportedSpans`, including a 6-letter prefix so `commencement` meets `commenced`. Guard B is a normalised substring test against `qcCard.statement`. Both anchors that must fire, do. Output: `affirm-guards.json`.

`scripts/diagnostic/b379/paraphrase-axis.mjs` measures content-word overlap of each clean statement against confirmed support spans and a short `primaryExcerpt`, and the same measure on 13 doctored statements that carry a planted fault and were not verdict `conflict`. Output: `paraphrase-axis.json`.

No file under `lib/` changed. No verdict, label, or fixture changed. `npm test` before the diagnostic commit: 164 files, 1805 tests, passed. Browser check skipped: this pass has no screen.

## Plain-language summary

The review sometimes tells an author that the source confirms a phrase the author did not write, including a phrase the same card has marked unsupported. A simple check for that mistake also lights up on honest wording, including clean drafts, so it is not safe to turn on. Separately, cards that come back amber are not the ones that share the fewest words with the source, and the planted mistakes that slipped through are not the ones that share the most. The product is not, on these runs, marking a sentence down just because the author used their own words.
