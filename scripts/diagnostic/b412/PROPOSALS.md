# B412. The form has to fit. The flag stays off.

`QC_PROPOSALS` is off. The bar was not met.

## Bar, written before the run

Both false-proposal counts stay 0. At least ten of the fifteen survive the form rule and the house rules, and the resulting sentence reads as correct English. Each repeated call gives the same answer three times out of three.

## Part 1. The form

The replacement is the shortest form that passes the matcher's equivalence and matches the shape the sentence already used. A month stays a month. An abbreviation stays an abbreviation. A figure keeps the draft's currency token and its scale word.

The before column is the B411 replacement. The after column is the fitted form, then house style.

| # | Fact | Before | After | Survives |
| --- | --- | --- | --- | --- |
| 1 | 3i doctored S0 `GBP 3.3 million` | `£3,291 million` | `GBP 3,291 million` | yes |
| 2 | 3i doctored S5 `30 June 2026` | `28 September 2025` | `28 September 2025` | yes |
| 3 | 3i doctored S9 `AGIC` | `GIC` | `GIC` | no, excerpt |
| 4 | HICL doctored S0 `HCIL Infrastructure` | `HICL Infrastructure PLC` | `HICL Infrastructure PLC` | no, excerpt |
| 5 | HICL doctored S0 `31 December 2025` | `28 February 2026` | `28 February 2026` | no, excerpt |
| 6 | HICL doctored S1 `HCIL` | `HICL` | `HICL` | yes |
| 7 | HICL doctored S3 `Paris St. Germain High Speed` | `London St. Pancras High Speed` | `London St. Pancras High Speed` | no, excerpt |
| 8 | HICL doctored S4 `St. Germain` | `St. Pancras` | `St. Pancras` | yes |
| 9 | HICL doctored S5 `TowerCo` | `Fortysouth` | `Fortysouth` | yes |
| 10 | HICL doctored S7 `CFO` | `Chief Executive Officer` | `CEO` | no, no passage |
| 11 | HICL doctored S7 `French` | `UK` | `UK` | no, no passage |
| 12 | GPI doctored S1 `15` | `three` | `three` | yes |
| 13 | GPI doctored S3 `Silver Hill Technology` | `Gold Peak Technology Group` | `Gold Peak Technology Group` | yes |
| 14 | ClearPoint doctored S0 `April 2026` | `May 13, 2026` | `May 2026` | no, no passage |
| 15 | ClearPoint doctored S2 `-50%` | `16%` | `16%` | no, excerpt |

The resulting sentence, before this rule and after it.

1. Before: 3i Group delivered a total return of £3,291 million for the six months to 30 June 2025, representing a 13% return on opening shareholders funds.
   After: 3i Group delivered a total return of GBP 3,291 million for the six months to 30 June 2025, representing a 13% return on opening shareholders funds.

2. Before and after: Net sales for the six months to 28 September 2025 amounted to EUR 11.2 billion, with like-for-like sales growth of 6.3%.

3. Before and after: A portion of these proceeds was redeployed to acquire a further 2.2% stake in the business, which together with an earlier 2.2% stake purchase from GIC, raised 3i's stake in Action to 62.3%.

4. Before and after: HICL Infrastructure PLC's performance for the six months to 31 December 2025 was positive and largely in line with expectations.

5. Before and after: HCIL Infrastructure's performance for the six months to 28 February 2026 was positive and largely in line with expectations.

6. Before and after: Across the portfolio, operational performance was robust, with average 30% EBITDA growth driven by capital expenditure, and resilient cashflow generation supporting HICL's dividend program.

7. Before and after: Among the significant holdings, London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast.

8. Before and after: On the commercial front, progress has been made on adding a second international operator on the route, while Virgin Trains recently announced its intentions for cross-Channel operations from St. Pancras.

9. Before and after: Elsewhere, Fortysouth delivered 20 new towers during the past year and is actively progressing additional co-location opportunities, both of which are expected to support continued growth in EBITDA and valuation gains.

10. Before: Meanwhile, Affinity Water appointed a new Chief Executive Officer with significant sector experience and stands to benefit from the French government's recently published white paper on electricity sector reform.
    After: Meanwhile, Affinity Water appointed a new CEO with significant sector experience and stands to benefit from the French government's recently published white paper on electricity sector reform.

11. Before and after: Meanwhile, Affinity Water appointed a new CFO with significant sector experience and stands to benefit from the UK government's recently published white paper on electricity sector reform.

12. Before and after: The company currently operates three facilities in Malaysia, two in Vietnam, and one in Thailand, alongside two other plants in the UK and one plant in China, which will now focus primarily on the European market.

13. Before and after: Meanwhile, Gold Peak Technology Group (parent of GP Industries) is planning an investment program in Johor, Malaysia, to produce next-generation batteries to support data centres.

14. Before: ClearPoint Neuro announced in May 13, 2026 its financial results for the first quarter of 2026.
    After: ClearPoint Neuro announced in May 2026 its financial results for the first quarter of 2026.

15. Before and after: Organic growth amounted to 16% year on year (25% for devices), while the gross margin expanded to 64% over the period on account of lower allowances for excess and obsolete inventory.

Sentences 1, 2, 6, 8, 9, 12 and 13 are correct English and they survive. That is 7. The bar was 10.

## Part 2. The house rules

`houseStyleOfferedToken` is applied to every fitted form. It is what turns `£3,291 million` into `GBP 3,291 million` once the figure rule has kept `GBP` and `million`. No fitted form then failed the matcher.

Banned words. These reviews carry no banned-word list, so the check dropped none. A replacement that introduces a word on the list is dropped. The test uses `gic`.

Editorial. The check is the structural part of the editorial rules: a sentence that newly crosses 40 words, a cliche the rule names, and a first-person pronoun the sentence did not have. None of the fifteen introduced one. The judgement rules were not sent back to a model.

`offeredTokenLicensedByExcerptTokens`. Five fail because the card's passage does not contain the offered token.

- `GIC`. The passage is Action's financing, not the GIC purchase.
- `HICL Infrastructure PLC`. The passage says "HICL's growth assets". It does not contain the offered name.
- `28 February 2026`. Same passage. The date is not in it.
- `London St. Pancras High Speed`. The passage starts mid-name, at "Pancras High Speed".
- `16%`. The passage is the gross-margin line, not the organic-growth line.

## Part 3. The same question

Q1. The prompt is one text, `PROPOSAL_PROMPT`, on every call. It is not the cause. The statements are not the same sentence. Clean S1 is the HCIL dividend sentence. Doctored S1 adds "average 30%". Clean S2 says "in line with budgets". Doctored S2 says "significantly outperform budgets". The same prompt and the same clean sentence also produced both answers on the re-run, so the model is the other cause. Statement context changes how often an answer appears. Doctored S1 said `HICL` every time. Clean S1 did not.

Q2. Four calls, three times each. The three from the spec, plus doctored S1 so the HCIL split had both sentences. `claude-opus-4-7`, temperature omitted, cache off. No retry.

| Call | Answers |
| --- | --- |
| HICL clean S1 `HCIL` | `HICL`, `none`, `HICL` |
| HICL clean S2 `budgets` | `none`, `expectations`, `none` |
| HICL doctored S2 `budgets` | `expectations`, `expectations`, `expectations` |
| HICL doctored S1 `HCIL` | `HICL`, `HICL`, `HICL`. `30%` was `none` each time. |

Q3. The prompt was not changed. The twenty-two were not re-measured.

Q4. The source says EBITDA is delivered in line with expectations. On the clean sentence, "in line with budgets", that should be proposed: the resulting sentence is "in line with expectations", which is what the source says. On the doctored sentence, "significantly outperform budgets", it should not. "significantly outperform expectations" is a claim the source does not make. The benchmark card already shows the source's words, and that is the better answer there. The card lets the reader see `expectations` without the product publishing the outperform sentence.

## Part 4. No passage

The proposal is suppressed. A card with no passage does not get a line of the proposal's own choosing, labelled or otherwise. There is no second answer to the same question.

The three are HICL doctored S7 `CFO` to `CEO`, HICL doctored S7 `French` to `UK`, and ClearPoint doctored S0 `April 2026` to `May 2026`. Each after-sentence above is correct English. None is emitted.

## Part 5. The bar

Shape 1 is 0 and shape 2 is 0 among the seven that survive. The other eight are not offered.

Seven survive. The bar was ten. Clean S1 and clean S2 were not the same answer three times out of three.

`QC_PROPOSALS` stays off.

What would have to change: the card's passage has to contain the offered token. Five correct sentences fail only on that check. Three of those five would take the count from 7 to 10. That is excerpt selection, and this spec does not change it. The repeated call would also have to be stable. It was not, on two of the four sentences, and the prompt is not where that split lives.

## Part 6. Cost

The form check used the stored B411 proposals. USD 0.

The consistency calls: estimate before the call USD 0.7510 list. Ceiling USD 2. Not crossed.

List USD 0.316245. Discounted USD 0.316245. 12 calls. Input 59379, output 774, cached 0. USD 0.026354 per call.
