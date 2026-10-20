# B403. Can a fact table carry a verdict

Estimate before the calls: 2 calls, 3458 input tokens at chars/4, output ceiling 16384, USD 0.3450 list. Model `gpt-4o-2024-08-06`. Ceiling USD 3. No cache assumed. Not crossed. No retry.

Measured: 2 calls, input 5584, output 2691, cached 2560. List USD 0.040870. Discounted USD 0.037670. `runs/spend.json`.

## S1. What each gate did

| | Rows in | G1 kept | G1 dropped | G5 kept | G5 dropped | G2 kept | G2 dropped |
|--|--------:|--------:|-----------:|--------:|-----------:|--------:|-----------:|
| Call 1 | 25 | 25 | 0 | 13 | 12 | 13 | 0 |
| Call 2 | 23 | 23 | 0 | 11 | 12 | 11 | 0 |

G3 kept 4 rows. Those 4 are 8 of the 24 occurrences that reached G3. Dropped at G3: 16 occurrences.

G1 dropped nothing. Every cited value was on the cited line under the verbatim rule. The B394 fold was not needed to keep them.

G5 dropped 12 rows on each call, the same lines both times. The subject was HICL. The lines say "the Company" and do not say HICL: the 8.35p and 8.50p dividends (L25, L42), the £50m drawn and £147m cash (L29), the £4m and £154m buybacks (L31), and the 23 investors (L46). The values are on those lines. The gate dropped them because the subject word is not.

G2 dropped nothing. No row had the element total. No subject and period held one percentage and exactly two figures. No subject and element repeated one period with two values.

## S2. Survivors

`runs/facts-gated.json`. Four rows.

1. HICL Infrastructure PLC, Interim Update Statement period, `1 October 2025 to 28 February 2026`, period empty, L12.
2. HICL, operational performance, `robust operational performance during the period`, period empty, L16.
3. HICL, target dividend cash cover, `1.1x for the year`, period empty, L16.
4. Fortysouth, new towers delivered, `16 new towers during the period`, period empty, L39.

## S3. Agreement

Rate 8/24, which is one in three. No pair agreed on the four fields and disagreed on the line.

Different value, 8 occurrences, 4 pairs. Same subject, element and period. The values are a longer copy and a shorter copy of the same line, which the gate still classes as a different value:

- Equity commitment to Affinity Water, L30. `£50m of the sale proceeds was allocated` against `£50m of the sale proceeds`.
- Affinity Water, CEO appointment, L37. `appointed Mark Garth as Chief Executive Officer` against `Mark Garth`.
- Affinity Water, distributions expectation, L37. The whole expectation sentence against `ahead of 31 March 2026`.
- London St. Pancras High Speed, performance, L38. The sentence including `slightly ahead of forecast` against `performed well in the period`.

Absent, 8 occurrences. Present in one extraction only: resuming accretive share buybacks (call 1, L16); the Blankenburg and B247 commitment, whose value and period also differ (L30); Fortysouth's c.30% oversubscribed refinancing (call 1, L39); inflation tracking, where the element name also differs (L43); UK bond yields, where call 2 names the subject `UK government bond yields` and the element `change` (L44).

## W1. Wrong survivors

0 of 4.

Checked against the source, not against the cited line alone.

1. L12 says the Interim Update relates to the period from 1 October 2025 to 28 February 2026. The subject is the company named on L1 and L6. The row does not invent a period.
2. L16, the chair, says HICL has delivered robust operational performance during the period. L35 says operational performance was in line with expectations. The row states the robust clause and does not deny the other.
3. L16 calls 1.1x the target dividend cash cover for the year, as a target the board is confident of achieving. L42 says forecast cover is anticipated to be in line with previous guidance at 1.1x. The element says target. The row does not say the cover was delivered.
4. L39 says Fortysouth delivered 16 new towers during the period. That is the row.

## W2. What should have caught them

Nothing. There is no wrong survivor to assign to a gate.

## C1. The sixteen statements

A surviving row for the fact the statement asserts:

| Statement | Row for the fact it asserts | Missing |
|-----------|-----------------------------|---------|
| clean S0 | No | In line with expectations, and five months. The table has the 1 October to 28 February bounds only. |
| clean S1 | The robust clause only | EBITDA growth driven by capital expenditure. HCIL. |
| clean S2 | No | In line with budgets. |
| clean S3 | No | London St. Pancras, slightly ahead of forecast. The two calls extracted it and G3 dropped it as a different value. |
| clean S4 | No | Virgin Trains, St. Pancras. Not extracted. |
| clean S5 | The 16 towers | Valuation gains. Co-location. |
| clean S6 | No | A reduction in debt servicing costs. Call 1 extracted the c.30% refinancing and call 2 did not. |
| clean S7 | No | CEO, and water sector reform. Both calls extracted Mark Garth and G3 dropped the pair as a different value. The white paper was not extracted. |
| doc S0 | No | Six months to 31 December 2025 is not a row. |
| doc S1 | No | Average 30% EBITDA growth is not a row. |
| doc S2 | No | Significantly outperform budgets is not a row. |
| doc S3 | No | Paris St. Germain is not a row. |
| doc S4 | No | St. Germain is not a row. |
| doc S5 | No | TowerCo, 20, and the past year are not a row. The true Fortysouth 16 row is a different fact. |
| doc S6 | No | An increase in debt servicing costs is not a row. |
| doc S7 | No | CFO, the French government, and electricity sector reform are not a row. |

## C2. The four errors no rule has reached

Typed lookup, no model judgement. A finding requires subject, element and period to agree and the value to differ. None of the four returned a finding. No row to quote.

- hicl-S2-a, doc-S2, `significantly outperform budgets`. Partial, and only because the query period is empty and a survivor's period is empty. Subject, element and value do not agree with any survivor.
- hicl-S5-b, doc-S5, 20 towers. None. The survivor is Fortysouth, `16 new towers during the period`. The query is TowerCo, 20, during the past year. No field agrees.
- hicl-S5-c, the same query, `during the past year`. None. The period does not agree with the empty period on the Fortysouth row, and the subject and the value do not agree either, so the rule returns no finding.
- hicl-S7-c, doc-S7b, `electricity sector reform`. Partial on the empty period only. The white paper is not a survivor.

## C3. Clean S2, in line with budgets

The lookup is partial on the empty period only. It is not a finding. There is no survivor whose value is expectations, or budgets.

The benchmark element rule already catches this one: budgets is not a word the source uses for that claim. The table adds nothing.

## C4. False greens

0. No lookup returned a match. A match on doc-S2, doc-S5, doc-S7b, or clean-S2 would have been a false green. None of those matched.

## Cost at volume

The pair is the cost of one source document, because agreement uses both calls. List USD 0.040870. Discounted USD 0.037670.

Spread over fifty drafts, list USD 0.000817 per draft (0.040870 / 50). The reading review's USD 0.33 a draft is about 404 times that share. Against a single draft the pair is USD 0.040870, about one eighth of USD 0.33.

The pair is cheap because the model returned 25 and 23 rows and then stopped. A fuller table would cost more output. This figure is the measured pair, not a projection.

## Verdict

On these numbers a verdict may be built on a gated table only in the sense the deciding count allows, and only pending the same result on a second source: zero of the four survivors misstate the source. That is not a reason to build it. Agreement was 8 of 24. The subject gate dropped true dividend, cash and buyback rows because the line says the Company and the subject was HICL. Every typed lookup missed. The four errors and clean S2 produced no finding, and the benchmark rule already catches clean S2 without the table. What the table is worth today is four true rows and a false-green count of zero. What would have to change is the subject test, so a line that says the Company can keep a HICL row, and the value test, so a shorter copy of the same line is not a different value. Until those rows survive, and a lookup can see them, the table does not decide a draft.
