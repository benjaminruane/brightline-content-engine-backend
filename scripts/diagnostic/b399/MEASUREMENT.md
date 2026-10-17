# B399. Assembly, then the binding rule again

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  a77fe2c  main  166 files  1819 tests` |
| Cost | USD 0. No model calls. |
| Rules | `scripts/diagnostic/b399/ASSEMBLY.md`. A1 was written before the count and was not edited after it. A1 missed D2. A2 was added below it and was not edited after its own count. |
| Binding | B398 rule B2, unchanged. `scripts/diagnostic/b398/bind.mjs` exposes `collectBinding(loadSource)`. The diff is 23 lines added and 6 lines removed. Three call sites read through `loadSource`. The flag object also carries the window string so this report can quote it. That copy does not change whether a flag fires. |
| Untouched | The anchor rule, the weak-noun list `company companies group business period year years`, the score (distinct shared anchors), and the threshold `shared.length >= 2`. |
| Evidence | `scripts/diagnostic/b399/runs/measure.json`. Assembled text is `runs/assembled/` (A1) and `runs/assembled-a2/` (A2). |
| Clean set | `scripts/diagnostic/b399/CLEAN-SET.md`. `labels.json` was not edited. |

Non-breaking spaces: the HICL extract still has 26. JavaScript `\s` matches U+00A0, as B398 measured. Both assembly rules replace U+00A0 with a normal space before the join. No matcher change.

A segment, for A1 below, is what B398's splitter returns: a newline piece, then a split after `.` `!` or `?` when the next character is an uppercase letter. "No sentence ending" means the segment does not end with `.` `!` or `?`.

## A1. Segments

| Source | Before | No ending | Mean words | A1 segments | A1 no ending | A1 mean | A2 segments | A2 no ending | A2 mean |
|---|---|---|---|---|---|---|---|---|---|
| 3i | 115 | 61.7% | 10.2 | 83 | 47.0% | 14.0 | 80 | 40.0% | 14.5 |
| HICL | 81 | 49.4% | 22.6 | 81 | 17.3% | 21.1 | 83 | 16.9% | 20.6 |
| GP Industries | 84 | 69.0% | 9.1 | 43 | 39.5% | 17.6 | 39 | 33.3% | 19.4 |
| ClearPoint | 467 | 89.7% | 6.8 | 325 | 84.0% | 9.8 | 314 | 83.4% | 10.1 |

HICL's segment count does not fall under A1. Stripping the pipes makes a line end on the sentence's own stop, which is why the no-ending share falls from 49.4% to 17.3%. ClearPoint stays mostly without a stop because the financial tables are rows of figures. The rule does not join those rows to each other.

## A2. Letters and digits

Both rules drop the same classes, and nothing else: the form feed, the pipe, the bullet `•`, the middle dot `·`, and a lone leading `o` or `O` used as a sub-bullet. Whitespace, including a non-breaking space after it has been turned into a normal space, is ignored on both sides of the count.

The extracts contain 2 form feeds (3i), 93 pipes (HICL), 39 bullets, and 3 lone `o` markers (HICL).

| Source | Letters and digits, furniture ignored | After A1 | After A2 |
|---|---|---|---|
| 3i | 5936 | 5936 | 5936 |
| HICL | 10052 | 10052 | 10052 |
| GP Industries | 4242 | 4242 | 4242 |
| ClearPoint | 17289 | 17289 | 17289 |

No sentence content was lost.

## A3. Joins that should not have happened

Read in full: the A1 and A2 text of 3i, HICL and GP Industries, and the ClearPoint narrative plus the cash-flow table. Searched the assembled files for page markers, `St.`, `forward-looking`, `single-use`, and lowercase words glued to figure rows.

A1 joined text that should have stayed apart:

- GP Industries page furniture joins the next word. "Page 1 of 3 celebration, said..." and "Page 2 of 3 expand into..."
- A lowercase label that wrapped under a figure row joins that row. ClearPoint: "46,973 20,104 period", "(1,993 ) (1,305 ) awards", "923 -assets, non-current".
- "US. 98% of our Private Equity portfolio companies..." is two sentences. The splitter does not break when the next character is a digit.

A2 still joins the three ClearPoint figure rows, and it also pulls the label onto the figures: "Cash, cash equivalents and restricted cash, beginning of 46,973 20,104 period". It joins the footer because `Inc.` is not a sentence end: "SOURCE: ClearPoint Neuro, Inc. Source: ClearPoint Neuro, Inc. TAGS". It does not join the page markers. "Page 1 of 3" is its own line, and "anniversary celebration" is one sentence.

The eye also saw breaks the rules left on purpose. "Action and Royal" stays apart from "Sanders". The GP Industries headline "to serve" stays apart from "US market". A heading that does not end with a function word stays apart from the sentence under it.

## M1. Reach on the 37

Columns are B397 unbound, B398 B2 on raw lines, and B399 B2 on assembled sentences.

A1, the first rule:

| Type | Of the 37 | B397 | B398 | B399 A1 |
|---|---|---|---|---|
| quantity | 8 | 7 | 8 | 8 |
| date | 5 | 4 | 5 | 5 |
| name | 11 | 8 | 10 | 10 |
| ratio | 2 | 1 | 1 | 1 |
| rank | 1 | 1 | 1 | 1 |
| polarity | 3 | 3 | 3 | 3 |
| benchmark | 1 | 0 | 0 | 0 |
| set | 1 | 0 | 0 | 0 |
| open wording | 5 | 0 | 0 | 0 |
| Total | 37 | 24 | 28 | 28 |

No row changed from B398.

A2, measured on its own:

| Type | Of the 37 | B397 | B398 | B399 A2 |
|---|---|---|---|---|
| quantity | 8 | 7 | 8 | 8 |
| date | 5 | 4 | 5 | 5 |
| name | 11 | 8 | 10 | 10 |
| ratio | 2 | 1 | 1 | 1 |
| rank | 1 | 1 | 1 | 1 |
| polarity | 3 | 3 | 3 | 2 |
| benchmark | 1 | 0 | 0 | 0 |
| set | 1 | 0 | 0 | 0 |
| open wording | 5 | 0 | 0 | 0 |
| Total | 37 | 24 | 28 | 27 |

One row changed from B398: hicl-S6-a, polarity, caught by B398, missed by A2. The reason is "no opposite pole in the bound window." A2 splits "which was c.30% oversubscribed" into "which was c." and "30% oversubscribed, and which enabled a step-down..." because a digit after a full stop is treated as a new sentence.

## M2. Flags on the 38

Right or wrong is against the corrected clean set in CLEAN-SET.md. A flag is wrong when the token is in the source and the statement is right about it.

A1, 19 flags on 12 statements. Three are right. Sixteen are wrong.

| Statement | Flag | | 
|---|---|---|
| 3i S0 | name 3i Group | wrong |
| 3i S0 | quantity six | wrong. The period is six months. The error is the date. |
| 3i S0 | date 30 June 2025 | right |
| 3i S9 | name GIC | wrong |
| 3i S9 | quantity 62.3% | wrong |
| 3i S12 | name TCR | wrong |
| HICL S0 | name HICL Infrastructure | wrong |
| HICL S0 | quantity five | wrong. Five months is the span from 1 October 2025 to 28 February 2026. |
| HICL S0 | date 28 February 2026 | wrong |
| HICL S1 | name HCIL | right |
| HICL S3 | name London St. Pancras High Speed | wrong |
| HICL S4 | name St. Pancras | wrong |
| GPI S0 | date November 2025 | wrong |
| GPI S1 | name Thailand | wrong |
| GPI S1 | name UK | wrong |
| GPI S1 | name Asian | wrong |
| GPI S3 | name Malaysia | right. The Johor sentences do not say Malaysia. |
| ClearPoint S2 | quantity 16% | wrong |
| ClearPoint S7 | name Velocity Alpha MR High Speed Surgical Drill System | wrong |

A2, 16 flags on 11 statements. Three are right. Thirteen are wrong. TCR and the Velocity name and Thailand and Asian drop off. A2 adds 3i S13 name "3i", which is wrong: the dividend sentence is about 3i and does not need the name inside the bound lines to be true, and the source is the company's own release. UK remains wrong.

## M3. Catches lost

A1 lost none. Every substitution B397 or B398 caught, A1 still catches.

A2 lost hicl-S6-a. B397 caught it. B398 caught it. A2 does not.

## M4. The five presence misses

- 3i-S8-a. Bound under A1 and under A2. Caught, as in B398.
- 3i-S14-a. Bound under A1 and under A2. Caught, as in B398.
- hicl-S5-b. Bound under A1 and under A2. Caught, as in B398.
- clearpoint-S8-a. A window is selected under both rules, and FDA is still inside it. Not caught. Same as B398.
- clearpoint-S9-b. Bound under A1 and under A2. Caught, as in B398.

## M5. Windows for the wrong flags

The full strings are in `runs/measure.json`. Quoted here in full except where two flags share one window.

A1, 3i S0, name "3i Group" and quantity "six", one window. Still a fragment: the private-equity sentence stops at "(September 2024:". The title sentence that contains "six months to 30 September 2025" is not in the window, so "six" is flagged on a correct word.

> Total return of £3,291 million or 13% on opening shareholders' funds (September 2024: £2,046 million, 10%). Our Private Equity business delivered a gross investment return of £3,234 million or 14% (September 2024: The first raised €1.6 billion of total incremental term loan debt. "The total return of 13% represents a very good first half for the Group. Total return and net assets are the same under the Investment basis and IFRS and we provide a reconciliation of our Investment basis financial statements to the IFRS statements from page 20. Percentage return on opening shareholders' funds 13% 10% 25% 1 Total return is defined as Total comprehensive income for the period, under both the Investment basis and the IFRS basis.

A1, 3i S9, name GIC and quantity 62.3%, one window. These are whole sentences. They are the wrong sentences. The GIC acquisition and the "62.3%" sentence are not in the window.

> Subsequently, Action completed a capital restructuring with a pro-rata redemption of shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a further 2.2% stake in Action. The second financing transaction repriced €3.1 billion of Action's existing term loan debt, extending the maturity of a portion of the debt and generating an annual interest cost saving of €14 million.

A1, 3i S12, name TCR. A fragment. The sentence ends at "uplift in" because "TCR" starts with a capital and was not joined.

> NAV per share of 2,857 pence (31 March 2025: 2,542 pence), including a 78 pence per share gain on foreign exchange translation (September 2024: 48 pence per share loss), and after the payment of the 42.5 pence per share second FY2025 dividend in July 2025. Our Infrastructure business generated a gross investment return of £139 million, or 9% (September 2024: £43 million, 3%). This was driven primarily by a 14% increase in 3i Infrastructure plc's ("3iN") share price in the six-month period to 30 September 2025. 3iN's underlying portfolio continues to perform well, with a significant valuation uplift in Against a challenging macroeconomic and geopolitical backdrop, our Private Equity portfolio has maintained good momentum, while the infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month period. We remain cautious in the deployment of capital into new investment, but will continue to allocate selectively, including to lower-risk reinvestments in businesses we know and trust. However, we also report a non-GAAP "Investment basis", which we believe aids users of our report to assess the The Investment basis (which is unaudited) is an alternative performance measure ("APM") and is described on page 18.

A1, HICL S0, name "HICL Infrastructure". Whole sentences, and the wrong ones. The header "HICL Infrastructure PLC" is not in the window.

> Portfolio performance in line with expectations, with capex programmes across HICL's growth assets continuing to drive EBITDA growth. Operational performance across the portfolio in the period was in line with expectations, demonstrating the resilient nature of the underlying assets.

A1, HICL S0, quantity "five" and date "28 February 2026". The date sentence "from 1 October 2025 to 28 February 2026" is not in the window. "Five" is not in the source.

> Portfolio performance in line with expectations, with capex programmes across HICL's growth assets continuing to drive EBITDA growth. Operational performance across the portfolio in the period was in line with expectations, demonstrating the resilient nature of the underlying assets. Public markets have seen defensive infrastructure and utility company share prices increase strongly in recent months.

A1, HICL S3, name "London St. Pancras High Speed". A fragment. Assembly produces "London St. Pancras High Speed performed well...". B2's own splitter then cuts at "St." because the next word is a capital. The window starts at "Pancras".

> Pancras High Speed performed well in the period, with international train path bookings slightly ahead of forecast. The launch of new services remains subject to further regulatory approvals and delivery milestones; however, this progress reduces barriers to an increase in international train paths which would ultimately increase the valuation of HICL's investment. Latest actual inflation is tracking slightly below HICL's forecast for the period ending 31 March 2026 in the UK and France, and slightly ahead for New Zealand.

A1, HICL S4, name "St. Pancras". A fragment, same cut. The window ends the sentence at "from St."

> The period saw further progress in relation to a potential second international operator on the route, including announcements by Virgin Trains regarding its intentions for crossChannel operations from St. The launch of new services remains subject to further regulatory approvals and delivery milestones; however, this progress reduces barriers to an increase in international train paths which would ultimately increase the valuation of HICL's investment.

A1, GPI S0, date "November 2025". The date line "13 November 2025, Singapore" is not in the window. The window contains the page-furniture join "Page 1 of 3 celebration" and a cut at "European and".

> GP Industries to shift production to Southeast Asia to serve US market amid tariffs and rising geopolitical tensions To maintain competitiveness, GP Industries' SE Asia facilities will produce for US market, China for Europe and Asia GP Industries Limited (GP Industries), the world's second-largest producer of consumer batteries, is shifting production capacity to its manufacturing facilities in Southeast Asia to navigate US tariffs and rising geopolitical tensions. The diversification of its manufacturing network is proving to be a crucial and timely competitive advantage, offering operational flexibility amid the changing tariff landscape, GP Industries said. Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Page 1 of 3 celebration, said, "Over the past three decades, GP Industries has shown resilience and maintained steady growth through financial crises, a global pandemic, geopolitical tensions, and transformative technological changes including the ongoing AI revolution. After higher initial costs from diversifying production to Southeast Asia, GP Industries said margins have risen due to improved utilisation, lower commodity costs, and optimised supply chains.

A1, GPI S1, Thailand, UK and Asian. Fragments. "and one in" is the end of the facilities sentence with Thailand left off, then "Singapore this month" from a different sentence. "Asian" is cut off the end of "European and".

> To maintain competitiveness, GP Industries' SE Asia facilities will produce for US market, China for Europe and Asia The Group currently operates three facilities in Malaysia, two in Vietnam, and one in Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Asian markets.

A1, ClearPoint S2, quantity 16%. The highlight that contains "16% year-over-year total organic growth" is not in the window. The window joins a heading to a bullet, "43% Overall Gross margin expanded to 64%; and", which is a fragment.

> Record Revenue Achieved Including 25% Organic Growth in Devices and 43% Overall Gross margin expanded to 64%; and "While record revenue achievement and 25% organic devices growth made the headline, there is no shortage of meaningful strategic progress across the entire organization. The Company achieved a gross margin of 64% on its sales for the three months ended March 31, 2026, and a gross margin of 60% in the same period in 2025. The increase in gross margin is primarily due to lower excess and obsolete inventory for the three months ended

A1, ClearPoint S7, the drill name. A fragment. The sentence stops at "utilizing the" because "Velocity" starts with a capital.

> FDA clearance and successful completion of the first clinical procedure utilizing the Completion of the first commercial drug delivery case utilizing ClearPoint technology in the Asia-Pacific region; Biologics and drug delivery revenue, which include sales of disposable products and services related to customer-sponsored preclinical and clinical trials utilizing our products, increased slightly to $4.8 million for the three months ended March 31, 2026 from $4.7 million for the three months ended March 31, 2025. To date, thousands of procedures have been performed and supported by the Company's field-based clinical specialist team, which offers support and services to our customers and partners worldwide.

A2 windows that are still wrong, where they differ from A1:

3i S0, name and "six". The private-equity parenthesis is now whole. The title with "six months" is still not in the window. "The first raised..." is a different sentence that scored high enough to enter.

> Total return of £3,291 million or 13% on opening shareholders' funds (September 2024: £2,046 million, 10%). Our Private Equity business delivered a gross investment return of £3,234 million or 14% (September 2024: £2,071 million, 11%). The first raised €1.6 billion of total incremental term loan debt. "The total return of 13% represents a very good first half for the Group. Total return and net assets are the same under the Investment basis and IFRS and we provide a reconciliation of our Investment basis financial statements to the IFRS statements from page 20. Percentage return on opening shareholders' funds 13% 10% 25% 1 Total return is defined as Total comprehensive income for the period, under both the Investment basis and the IFRS basis.

3i S13, name "3i". Whole sentences. The dividend line does not contain the word "3i", and the window does not need it to be the right dividend.

> NAV per share of 2,857 pence (31 March 2025: 2,542 pence), including a 78 pence per share gain on foreign exchange translation (September 2024: 48 pence per share loss), and after the payment of the 42.5 pence per share second FY2025 dividend in July 2025. The first dividend of 36.5 pence per share for FY2026, set at 50% of the total dividend for FY2025, will be paid in January 2026. Dividend per ordinary share 36.5p 30.5p 73.0p

HICL S3 and HICL S4. Same fragments as A1. Assembly joins "London St. Pancras". B2's splitter cuts it again.

GPI S1, UK. The facilities sentence is now whole, including Thailand. The UK sentence, "It also has two other plants in the UK.", is not in the window.

> To maintain competitiveness, GP Industries' SE Asia facilities will produce for US market, China for Europe and Asia The Group currently operates three facilities in Malaysia, two in Vietnam, and one in Thailand. GP Industries, which is celebrating the 30th anniversary of its incorporation and listing in Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Asian markets.

ClearPoint S2, 16%. Still the heading joined to the bullet, and still not the sentence that contains 16%.

> Record Revenue Achieved Including 25% Organic Growth in Devices and 43% Overall Gross margin expanded to 64%; and Reported cash and cash equivalents totaling $35.6 million as of March 31, 2026. "While record revenue achievement and 25% organic devices growth made the headline, there is no shortage of meaningful strategic progress across the entire organization. The Company achieved a gross margin of 64% on its sales for the three months ended March 31, 2026, and a gross margin of 60% in the same period in 2025. The increase in gross margin is primarily due to lower excess and obsolete inventory for the three months ended

3i S9, HICL S0 and GPI S3 are unchanged from A1. GPI S0 no longer contains the page-furniture join. The date line is still absent.

## Decision

- D1. A1 met, 28. A2 not met, 27.
- D2. Not met. A1 raises 16 wrong flags. A2 raises 13. The unbound baseline is 3. The number that would make binding worth building is 1 or fewer.
- D3. A1 met, zero lost. A2 not met. hicl-S6-a was caught by B397 and by B398 and is missed now.
- D4. Met on both. ClearPoint doctored S3 is still not reached. It does not come back as agreeing with the source.
- D5. Met on both. Letter and digit counts match.

D2 is missed, at 16 on A1 and 13 on A2. The rules were not tuned after that.

## Judgement

Sentence assembly plus this binding rule is not worth moving into lib/.

A1 does the thing this pass was for. It joins "for the six months to 30 September 2025", and it keeps every catch B398 had, including four of the five presence misses. The clean-side cost does not come down to the bar. Sixteen wrong flags is the number. The usual shape is that the sentence which owns the token scores below 2, and other sentences about the same company score 2 or more and become the window. "Six" is in the title. The title does not bind. The window is the total-return line, a term-loan line, and a table header. Assembly cannot fix a score that ignores the sentence it just built.

A2 joins more of those wraps, including "uplift in TCR" and the drill name, and the wrong-flag count only moves from 16 to 13. It also splits "c.30%" and loses hicl-S6-a. That is a worse rule.

The binding question ends here. Had the clean-side number cleared, the join would belong in the extractor. B2's splitter cuts "London St. Pancras" after assembly has already joined it, so a join that lived only in the matcher would be undone by the matcher's own split.
