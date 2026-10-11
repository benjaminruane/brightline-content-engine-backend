# B381. Whole-draft LLM review, scored and fact-checked

Read-only on product code. Nothing in `lib/` changed. This measures one whole-draft reviewer. It does not authorise a pipeline change. No winner is declared. The numbers sit beside the pipeline's 9 of 11 and 65 of 74. The decision is Ben's.

Only one model was tried: `STAGE_MODELS["writing-rewrite"]`, `gpt-5.1-2025-11-13`. Temperature 0. Seed 1. Local cache off. The prompt was written once and not revised after the score.

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  bc35705  main  164 files  1805 tests` |

`npm test` before the billed passes: 164 files, 1805 tests, all passed. Labels, the freeze, the manifest, and `group-a-design.json` were not rewritten.

## The bar

oct-06-b378, the v4 pipeline on this hundred: catch 9 of 11, Wilson [0.5230, 0.9486]. Leave-alone 65 of 74.

Noise floor, from `scripts/diagnostic/accuracy/README.md`. Catch of 11: a move of one is not readable. Two or more counts away from 9 of 11 is outside that band. Leave-alone: identical cache-off runs moved 67 of 74 against 64 of 74, a swing of 3 counts. A count delta of 3 or fewer against 65 of 74 is inside that band. Four or more is outside it. Group A and Group B are not averaged.

B380, one statement at a time, called conflicting on 3 of these 11. That is the generosity comparison. It is not a second bar for leave-alone.

## The prompt

`scripts/diagnostic/b381/prompt.md`. sha256 `3bb3f1debea3abcf696408afb90b29fd8c2e2bc2f032dba0a030950dda0be3b0` on every pass. The first paragraph is Ben's wording. The rest is the four verdict names, the statement numbers, the exact-copy rule, and the JSON shape.

```
Review this draft text. Verify each statement against the source document attached. Present your findings showing the statement, the review result (confirmed, partially confirmed, unsupported) and a comment explaining the review result. Then prepare writer-facing feedback covering: overall assessment from the perspective of source-backing, narrative flow, text quality and readability, written in the role of a senior Financial Times editor; strengths; areas for improvement.

The review result on each claim uses exactly one of these four names.

confirmed
The sources support the claim.

partially_confirmed
Part of the claim is supported and part is not.

conflicting
The sources address the claim and contradict it.

not_supported
The sources do not address the claim.

The draft is followed by its statements, each numbered in brackets. A statement may contain more than one claim. Every claim must set statementIndex to the number of the statement it came from.

passage is copied exactly from the named source, character for character, or null when no source passage decides the claim. sourceId is the id of that source, or null when passage is null.

You may write your reasoning first. Then write one JSON object, and nothing after it.

The JSON object has exactly these keys.
claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), passage (exact source text, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
assessment: a paragraph.
strengths: an array of strings.
improvements: an array of strings.
```

## How a call is built

One call per draft. The user message is the full text of every source, then the full draft, then the statements numbered in brackets. Accuracy passes use `statements.json` and the fixture draft. The real-run pass uses the doctored draft and the statement strings only. Verdicts, comments, spans, labels, and fixture READMEs are not sent. Reasoning before the JSON is kept out of the parse. Claims roll up by Ben's sentence rule: any conflicting claim makes the sentence conflict; else every claim not_supported makes it not_supported; else any claim that is not confirmed makes it supported_partial; else supported_full. A statement with no claim is null, not a guess.

## Scores

Scorer: `scripts/diagnostic/accuracy/score.mjs` against `labels.json` and `sample-manifest.json`. Unmatched labels 0. Unmatched predictions 161, the unlabelled remainder of the 261. Escapes 0 on both passes. Group B Ben-Confirmed n is 74 on both passes. Statements with no claim returned: 0 of 261 on draft-1, 0 of 261 on draft-2.

| | Catch | Catch Wilson | Leave-alone | Leave-alone Wilson | Against 9 of 11 | Against 65 of 74 | Conflict calls of the 11 |
|---|---|---|---|---|---|---|---|
| draft-1 | 7 of 11 (0.6364) | [0.3538, 0.8483] | 56 of 74 (0.7568) | [0.6479, 0.8402] | outside (2 counts) | outside (9 counts) | 7 |
| draft-2 | 7 of 11 (0.6364) | [0.3538, 0.8483] | 59 of 74 (0.7973) | [0.6921, 0.8731] | outside (2 counts) | outside (6 counts) | 7 |
| oct-06-b378 | 9 of 11 | [0.5230, 0.9486] | 65 of 74 | | the bar | the bar | |
| B380 llm-1 and llm-2 | 3 of 11 | [0.0975, 0.5657] | 62 and 63 of 74 | | | | 3 |

Catch and the conflict-call count are the same number on this arm because every Group A label is conflicting and catch is exact agreement. The conflict-call count is still the generosity measure: 7 of 11 here, 3 of 11 on B380.

Group B agreement, not averaged with Group A: draft-1 65 of 89, rate 0.7303, Wilson [0.6300, 0.8116]. draft-2 69 of 89, rate 0.7753, Wilson [0.6782, 0.8496]. Disagreement lists are in `runs/draft-1/score.txt` and `runs/draft-2/score.txt`.

## Two-pass agreement

90 of the 100 labelled statements got the same rolled verdict on draft-1 and draft-2. 10 moved. 0 were missing a card or a mapped verdict.

The pipeline's stability across billed pairs has been 97, 95, 96, and 94 of 100.

The ten movers, draft-1 mapped verdict then draft-2:

- Fixture 02: confirmed to partially_confirmed. "This transaction marks a successful control exit from the firm's data center portfolio, although Partners Group remains thematically focused on the data center sector across multiple geographies."
- Fixture 03: partially_confirmed to confirmed. "Partners Group's Infrastructure business manages USD 27 billion in assets globally."
- Fixture 05: partially_confirmed to conflicting. "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability."
- Fixture 08: confirmed to partially_confirmed. "End-market growth, structural exposure to medical implants and aerospace build rate increases supports 9% compound revenue growth over the hold."
- Fixture 09: partially_confirmed to confirmed. "Klaus Wenger joined as Chief Procurement Officer in September and has already secured EUR 2.1 million of annualised savings, against a year-one target of EUR 5 million."
- Fixture 13: partially_confirmed to confirmed. "We project ARR growth from EUR 81 million today to approximately EUR 195 million over a five-year hold, representing 19% CAGR."
- Fixture 14: partially_confirmed to confirmed. "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets."
- Fixture 17: confirmed to partially_confirmed. "Demand growth, driven by continued e-commerce penetration and same-day/next-day delivery expectations, is running well ahead of supply, which is constrained by urban planning priorities and political resistance to logistics development in city centres."
- Fixture 18: conflicting to partially_confirmed. "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A."
- Fixture 19: partially_confirmed to confirmed. "Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges."

## The four doctored drafts

One pass, `real-runs`. Not scored against labels. There are none. For each planted fault the README names, the comment is quoted and the rolled sentence verdict is stated. "Names the fault" means the comment says what is wrong. It is not a label agreement.

### 29 September 2026, 3i, 15 statements

S0, billion written as million. Rolled verdict supported_partial. The comment names the fault.

```
The source confirms a total return of £3,291 million and a 13% return on opening shareholders' funds, but the draft misstates the figure as £3.3 million instead of approximately £3.3 billion and gives the period as six months to 30 June 2025 rather than to 30 September 2025.
```

S5, the period. Rolled verdict supported_partial. The comment names the fault.

```
The figures for net sales (€11.229 billion) and like-for-like sales growth (6.3%) are supported, but the period is misstated. The source refers to nine reporting periods ending on 28 September 2025, not six months to 30 June 2026.
```

S8, Action written as MAIT. Rolled verdict conflict. The comment names the fault.

```
The source clearly attributes the pro-rata redemption of shares and the £944 million of gross proceeds to Action, not MAIT. The draft misattributes this transaction to MAIT, which conflicts with the source.
```

S9, GIC written as AGIC. Rolled verdict supported_partial. The comment names the fault.

```
The source confirms that part of the proceeds from Action's pro-rata redemption were redeployed to acquire a further 2.2% stake, and that together with a prior 2.2% acquisition from GIC this increased 3i's stake to 62.3%. However, the draft incorrectly names "AGIC" instead of GIC, so the counterparty detail is not supported.
```

S12, gains on TCR widened to essentially all investments. Rolled verdict supported_partial. The comment names the fault.

```
The source confirms that performance was driven primarily by a 14% increase in 3i Infrastructure plc's share price and that the underlying portfolio continues to perform well, with a significant uplift in TCR. However, it does not say that there were meaningful gains across essentially all investments; that extrapolation is not supported.
```

S14, 3i's stance written as the UK government's. Rolled verdict conflict. The comment names the fault.

```
The source attributes this cautious stance and selective allocation approach to 3i, not to the UK government. The draft misattributes the sentiment to the UK government, which conflicts with the source.
```

### 4 October 2026, HICL, 8 statements, eleven planted changes

S0, HICL written as HCIL, and five months to 28 February 2026 written as six months to 31 December 2025. Rolled verdict not_supported. Passage null. The comment names both faults.

```
The source refers to HICL Infrastructure PLC (not HCIL) and covers the period from 1 October 2025 to 28 February 2026, not the six months to 31 December 2025. While it does say performance was in line with expectations, the period and even the company name differ from the source, so this exact claim is not supported.
```

S1, "with EBITDA growth" written as "average 30% EBITDA growth". Rolled verdict supported_partial. The comment names the missing 30% figure.

```
The source confirms robust operational performance, capex programmes driving EBITDA growth, and resilient cash generation supporting dividend cover. However, it does not mention an average 30% EBITDA growth figure, nor does it refer to a dividend program in those terms, and the company name is HICL, not HCIL. Hence only part of the claim is supported.
```

S2, "in line with budgets" written as "significantly outperform budgets". Rolled verdict supported_partial. The comment names the fault.

```
The source supports that growth investments continue to perform well and that significant expansion capex programmes are being progressed. It states EBITDA is "in line with expectations", not that it "significantly outperform[s] budgets". Therefore the outperformance element is not supported.
```

S3, London St. Pancras High Speed written as Paris St. Germain High Speed. Rolled verdict conflict. The comment names the fault.

```
The source clearly identifies the asset as London St. Pancras High Speed, not Paris St. Germain High Speed. Performance and train path bookings being slightly ahead of forecast are supported, but the location/name is incorrect and contradicts the source.
```

S4, operations from St. Pancras written as St. Germain. Rolled verdict supported_partial. The comment names the fault.

```
The source confirms progress toward a potential second international operator and that Virgin Trains announced intentions for cross-Channel operations from St. Pancras. However, the draft misnames the station as St. Germain, which is not supported. The commercial-progress elements are correct; the location is not.
```

S5, Fortysouth and 16 towers written as TowerCo and 20. Rolled verdict supported_partial. The comment names the name and the figure. It does not name the separate change from "during the period" to "during the past year".

```
The source supports that the relevant tower company (Fortysouth) delivered new towers, is progressing co-location opportunities, and that these are expected to support continued EBITDA growth. However, the name is Fortysouth, not TowerCo; the number is 16 towers, not 20; and the source refers to EBITDA growth in line with valuation assumptions, not explicit valuation gains. Thus only part of the claim is supported.
```

S6, a reduction in debt costs written as an increase. Rolled verdict supported_partial. The comment names the contradiction and still the sentence was not rolled to conflict.

```
The source confirms that the company (Fortysouth) completed an oversubscribed refinancing. However, it states that this enabled a step-down in debt margins, implying lower, not higher, debt servicing costs. The claim that it will lead to an increase in debt servicing costs conflicts with the source, so only the refinancing and oversubscription elements are supported.
```

S7, a new CEO written as a new CFO, and the UK government's water paper written as the French government's electricity paper. Rolled verdict conflict. The comment names both.

```
The source states that Affinity Water appointed a new CEO (Mark Garth), not a CFO, and that the relevant white paper is from the UK Government on water sector reform, not the French government on electricity sector reform. These elements directly contradict the draft statement.
```

### 6 October 2026, GP Industries, 5 statements

S0, October 2025, 75% of capacity, and escalating oil prices. Rolled verdict not_supported. The comment names all three.

```
The source confirms that GP Industries is shifting production capacity to Southeast Asia to serve the US market amid US tariffs and rising geopolitical tensions, but it does not mention October 2025, any 75% figure, or escalating oil prices. The timing, percentage, and oil-price rationale are absent, so the specific claim as written is not supported.
```

S1, 15 facilities in Malaysia, and the China plant limited to the European market. Rolled verdict supported_partial. The comment names both.

```
The source confirms the existence and locations of facilities in Malaysia, Vietnam, Thailand, and the UK, and that the China facility will focus primarily on European and Asian markets. However, it states three facilities in Malaysia, not 15, and does not describe China as having only one plant or focusing solely on the European market. Thus, the facility count and the narrowing to only Europe are inaccurate, while the rest is supported.
```

S2, enhancing site security. Rolled verdict supported_partial. The comment names the fault.

```
The source explicitly supports that the move is intended to streamline supply chains, meet country-of-origin requirements, and maintain cost competitiveness (i.e., improve the cost structure). However, there is no mention of enhancing site security as an objective of the capacity adjustments. That part of the claim is unsupported, so the statement is only partially confirmed.
```

S3, Gold Peak Technology Group written as Silver Hill Technology. Rolled verdict conflict. The comment names the fault.

```
The source clearly identifies Gold Peak Technology Group, not Silver Hill Technology, as the parent of GP Industries and as the entity planning a multi-million-dollar investment in Johor to produce next-generation batteries to support data centres. The draft substitutes a different parent name, which directly conflicts with the source, although the Johor investment purpose is otherwise consistent.
```

S4, second-largest written as the largest, over six billion written as over 60 billion, and sold written as bartered. Rolled verdict conflict. The comment names all three.

```
The source states that GP Industries is the world's second-largest producer of consumer batteries, not the largest, and that it produces over six billion batteries annually, not 60 billion. It also says the batteries are sold, not bartered, through one million outlets worldwide. These are direct contradictions, although the one-million-outlets figure is correct.
```

### 6 October 2026, ClearPoint, 10 statements

The README's doctored run is set against eight planted faults. They are listed here as the substitutions in the dirty draft.

S0, May written as April. Rolled verdict conflict. The comment names the fault.

```
The company did announce financial results for Q1 2026, but the press release is dated May 13, 2026, not April 2026. Timing is misstated.
```

S2, organic growth of 16% written as -50%. Rolled verdict conflict. The comment names the fault.

```
The press release states 16% year-over-year total organic growth, not -50%. This directly contradicts the draft.
```

S3, the segment's $5.9 million written as the vast majority of revenue. Rolled verdict supported_partial. The comment names the overstatement.

```
Numerically, neurosurgery navigation, therapy and access revenue ($5.9m) is the single largest segment but is less than half of total revenue ($12.1m). Calling it "the vast majority" overstates its share. The segment contribution is supported; the "vast majority" characterization is not.
```

S7, FDA clearance and first clinical procedures written as a submission for FDA approval. Rolled verdict not_supported. Passage null. The comment names both the clearance and the clinical use.

```
The press release states that the Velocity Alpha MR High Speed Surgical Drill System has FDA clearance and has been used clinically, but does not mention any submission for FDA approval or timing thereof.
```

S8, Health Canada written as the FDA. Rolled verdict conflict. The comment names the fault.

```
The license described is a Medical Device License from Health Canada, not the FDA. The draft misattributes the issuing authority.
```

S8, the case was completed, written as has been commenced. The claim verdict is partially_confirmed. The sentence still rolls to conflict because of the FDA claim above. The comment names the difference and does not call it a contradiction.

```
The source confirms completion of the first commercial drug delivery case in Asia-Pacific. The draft says it "has been commenced," which understates the status but does not contradict the fact that the case occurred.
```

S9, guidance of $52.0 million to $56.0 million for 2026 written as USD 56 million for 2027. Rolled verdict conflict. The comment names the year and the range.

```
The guidance range of $52-56m is for 2026, not 2027, and is presented as a range rather than a single point of $56m. The draft misstates both the year and the form of the guidance.
```

## Fabrication checks

Every claim from draft-1, draft-2, and real-runs. Quotes use exact `indexOf`, then `locatePassageInSource` (whitespace collapse, curly quotes folded, dashes folded). A passage that matches neither is not found. Numbers and names are taken from comments, the assessment, strengths, and improvements. A number is the same token after currency symbols and thousands separators are stripped, after `5.9 million` and `$5.9m` are folded together, and after a number word from zero through twenty is folded to its digit. A range such as `48.0 to 52.0 million` gives both numbers the scale. A capitalised multi-word span is a name. It must occur, case-insensitively, in the draft or a source.

Strike rate, if the rule were enforced. A quote strike removes that claim's passage. The comment on that claim is withheld with it. A number or name strike withholds the text unit that contains it (a claim comment, the assessment, a strength, or an improvement).

| Pass | Passages | Exact | Normalised only | Not found | Null passage | Quote claims losing evidence | Quote comments withheld | Number units checked | Number units withheld | Number claim comments | Name units withheld | Name claim comments |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| draft-1 | 316 | 190 | 53 | 73 | 12 | 73 | 73 | 565 | 8 | 2 | 18 | 13 |
| draft-2 | 308 | 187 | 53 | 68 | 13 | 68 | 68 | 559 | 6 | 2 | 13 | 11 |
| real-runs | 44 | 15 | 8 | 21 | 2 | 21 | 21 | 98 | 5 | 3 | 3 | 1 |
| All three | 668 | 392 | 114 | 162 | 27 | 162 | 162 | 1222 | 19 | 7 | 34 | 25 |

Across all three passes the quote strike rate is 162 of 668 passages. The number strike rate is 19 of 1222 text units. The name strike rate is 34 of 1222 text units.

58 of the 73 draft-1 not-found passages, 48 of the 68 draft-2 not-found passages, and 9 of the 21 real-run not-found passages contain `...`. Those strings are not one contiguous stretch of the source.

Many name strikes are a capitalised article or verb plus an acronym (`The MRR`, `The EV`, `Using EUR`) or `Financial Times`, which is in the prompt's role line and not in the draft or the source. The rule as written counts them. It was not narrowed after the run.

### Known cases, against the ClearPoint doctored draft and its source

These three sentences are not this arm's output. They are the types Ben's own test produced. The same number and name rules were applied to them.

Biologics given as 4.1 million against 4.1 million, where the source says 4.8 million against 4.7 million. Both `4.1|million` tokens are absent from the draft and the source. The numbers rule catches them. The sentence has no capitalised multi-word name, so the names rule catches nothing.

A guidance range of 48.0 to 52.0 million attributed to an August release. `48|million` is absent, so that end is caught. `52|million` occurs in the source, because the document's own guidance is $52.0 million to $56.0 million, so 52.0 is not a strike. "August" is one word. The names rule finds no name in the sentence. The invented August attribution is not caught.

A segment described as the largest on an invented figure, tested as 9.4 million. `9.4|million` is absent, so the figure is caught. "largest" is not a number and not a capitalised multi-word name. That word is not caught.

Every strike is printed below. Characters inside the blocks are the arm's.

### Not found passages, draft-1

73 strikes.

**draft-1 01 statement 0** sourceId "0" label 01_bvp_shopify_memo

```
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs.
...
Shopify was founded in 2007 by two Ruby on Rails core developers.
...
Shopify�s 24 employees are located in Ottawa, Canada.
```

**draft-1 01 statement 4** sourceId "0" label 01_bvp_shopify_memo

```
Yet sophisticated features are also available without complicating the overall user experience. Shopify accomplishes this by making available an �App Store�.
...
This approach is a big competitive differentiator for Shopify.
...
Roughly two-thirds of Shopify�s customers utilize at least one app from their �App Store�.
```

**draft-1 01 statement 5** sourceId "0" label 01_bvp_shopify_memo

```
Shopify sells a simple SaaS solution that enables a business to quickly setup and run an online retail store. A typical customer signs up using their credit card and is up and running in a few hours with no long-term contract.
...
The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours.
```

**draft-1 01 statement 6** sourceId "0" label 01_bvp_shopify_memo

```
Roughly 65�70% of customers sign-up via word-of-mouth. Roughly 20% of customers sign-up via referrals from web design firms.
...
Finally, roughly 10�15% of customers sign-up via paid channels, which is largely keyword marketing and the occasional contest program.
...
We believe that Shopify has under-invested in marketing in a big way and that with a VP of Marketing and a few experienced people in place, the company can accelerate growth.
```

**draft-1 01 statement 10** sourceId "0" label 01_bvp_shopify_memo

```
Despite this, they are able to acquire a customer for between $175�225 and can pay back that spend in 7�9 months on a churn-adjusted basis.
...
We are excited by what we see as a great product that has struck a chord with customers.
...
This approach is a big competitive differentiator for Shopify.
...
Further, we think that there is an enormous opportunity to accelerate growth by investing in: i) marketing, ii) international expansion and product localization and iii) business development to expand the applications available in the Shopify App Store.
```

**draft-1 01 statement 11** sourceId "0" label 01_bvp_shopify_memo

```
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs.
...
We recommend this investment.
```

**draft-1 04 statement 4** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Average sessions per active user per week is approximately 6 — also exceptional. Users return to the product not as a check-in but as a destination.
...
Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
```

**draft-1 04 statement 6** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Average session length is 14 minutes — exceptional for a social product.
...
Average sessions per active user per week is approximately 6 — also exceptional.
...
Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
...
We are willing to invest at a USD 40mm pre-money valuation — which is undeniably expensive on conventional venture metrics — for three reasons.
First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years.
```

**draft-1 04 statement 9** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
...the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics.
```

**draft-1 04 statement 10** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
...
We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
...
The user demographic and behavioural profile creates unusual monetisation potential. The combination of high-intent commercial categories (home decor, fashion, weddings) and a desirable demographic (women, 25 to 44) is genuinely scarce. We can envision multiple paths to a multi-billion-dollar revenue business.
```

**draft-1 04 statement 11** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Ben Silbermann (co-founder, CEO) is a former Google product manager. Evan Sharp (co-founder, head of design) joined from Facebook earlier this year and has been instrumental in the product's distinctive visual aesthetic. Both founders are first-time founders.
...
Our diligence on Ben has been deep. References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it. We have spent significant time with both founders and find them thoughtful, deliberate, and genuinely passionate about the product.
```

**draft-1 04 statement 13** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Pinterest is a young company. The product has been in market for roughly 16 months. The team is small — six full-time employees plus the two founders.
...
Current monthly active users are approximately 1.5 million, growing rapidly.
```

**draft-1 04 statement 19** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
We acknowledge that this is a higher-than-typical entry valuation for a Series A investment with zero revenue. We are comfortable with this on the basis that consumer products with the engagement profile we are seeing here are rare, and entry valuation in such cases is less important to ultimate returns than getting the call right.
...
Our base case envisages a hold of approximately 5 to 7 years with a target return of 10 times or better. The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.
```

**draft-1 04 statement 20** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years.
...
Third, the founders are exceptional. Our consistent experience is that the team is the principal determinant of outcomes in early-stage consumer investments. We have high conviction in Ben and Evan as builders.
...
Defensibility is uncertain. The visual discovery mechanic is not patented. We see two potential sources of competitive moat... Whether these prove durable in the face of well-funded competitive responses is uncertain.
```

**draft-1 06 statement 6** sourceId "0" label 06_synth_listed_pe_report_excerpt

```
We have introduced several operational changes during 2025, including the recruitment of a new Chief Commercial Officer and the appointment of a new Chairman with deep Iberian consumer experience. We are also implementing a structured cost reduction programme targeting approximately EUR 5 million of annualised savings. We expect these changes to begin contributing meaningfully in 2026.
...
We continue to view the underlying business as fundamentally sound and well-positioned for recovery as the operational programme takes effect and as the Iberian consumer environment improves.
```

**draft-1 06 statement 8** sourceId "0" label 06_synth_listed_pe_report_excerpt

```
Northstar Partners' environmental, social and governance ("ESG") programme has continued to mature during 2025.
...
We continue to integrate ESG considerations into our investment process from sourcing through diligence and into post-investment value creation planning. We see ESG performance as both a values commitment and a meaningful contributor to long-term commercial performance.
```

**draft-1 07 statement 0** sourceId "0" label 07_synth_vc_thesis_post

```
We expect a meaningful share of new vertical SaaS company formation to be agent-first rather than workflow-first.

We expect significant disruption to the incumbent vertical SaaS industry.
```

**draft-1 08 statement 2** sourceId "0" label 08_synth_industrial_buyout_memo

```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company")... Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
...
The Schiller family will retain a 15% economic interest. Management will hold the remaining 7%.
```

**draft-1 08 statement 8** sourceId "0" label 08_synth_industrial_buyout_memo

```
Our base case underwrites a five-year hold with the following value drivers.
...
The base case generates a 2.4x gross MOIC and a 19% gross IRR.
```

**draft-1 08 statement 9** sourceId "0" label 08_synth_industrial_buyout_memo

```
Third, there is a clear margin expansion path. HPC's current EBITDA margin of 17.5% trails best-in-class peers... and our diligence has identified a coherent set of operational levers we believe can deliver 300 to 400 basis points of margin uplift over five years. The principal levers are: footprint consolidation in Switzerland (closing the Winterthur facility and absorbing volumes into Olten), procurement consolidation across the now-fragmented supplier base inherited from the Indianapolis acquisition, and a programme of automation investment in the Brno facility.
```

**draft-1 08 statement 10** sourceId "0" label 08_synth_industrial_buyout_memo

```
Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.
...
Second, the end markets HPC serves are structurally attractive. The orthopaedic implants market is forecast to grow at 5–6% annually through 2030... Aerospace component demand is recovering strongly post-COVID, with Airbus and Boeing collectively targeting build-rate increases of approximately 40% over the next five years.
```

**draft-1 08 statement 12** sourceId "0" label 08_synth_industrial_buyout_memo

```
EBITDA margin expansion from 17.5% to 21.0% over the hold period... The margin lift is sourced from the footprint consolidation programme (approximately 120 bps), procurement initiatives (approximately 80 bps), automation investment in Brno (approximately 60 bps), and operating leverage on incremental revenue (approximately 60 bps).
```

**draft-1 08 statement 15** sourceId "0" label 08_synth_industrial_buyout_memo

```
We have identified four principal risks.

The semiconductor exposure introduces cyclicality that the medical and aerospace segments do not.
...
Customer concentration is a watch item. HPC's largest customer, a global orthopaedic implants manufacturer, accounted for 18% of revenue in 2024.
...
Foreign exchange exposure is significant.
...
Founder transition risk is moderate.
...
We are comfortable with this exposure given (a) the structural growth in EUV, and (b) HPC's flexible cost base, which allowed the Company to maintain EBITDA margins above 15% throughout the 2023 downturn.
```

**draft-1 08 statement 16** sourceId "0" label 08_synth_industrial_buyout_memo

```
First, the Company occupies an enviable competitive position.
Second, the end markets HPC serves are structurally attractive.
Third, there is a clear margin expansion path.
Fourth, we see meaningful M&A opportunity.
...
HPC represents an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience.
```

**draft-1 09 statement 3** sourceId "0" label 09_synth_portfolio_update_letter

```
The leadership transition has gone better than expected.
```

**draft-1 09 statement 9** sourceId "0" label 09_synth_portfolio_update_letter

```
Medical device customer quality issue: In October, our second-largest medical customer raised a quality concern relating to a specific component lot manufactured in the Olten facility. ... Petra Köhler met the customer's COO in November and the customer is satisfied with the corrective action plan.
```

**draft-1 09 statement 10** sourceId "0" label 09_synth_portfolio_update_letter

```
The cost impact to HPC is limited — approximately EUR 3 million in returns, rework, and credit — but the relationship cost is more significant. ... However the customer has placed HPC on enhanced quality monitoring for 12 months, which is an unwelcome development.
```

**draft-1 09 statement 11** sourceId "0" label 09_synth_portfolio_update_letter

```
Klaus Wenger joined as Chief Procurement Officer in September, having previously held the same role at Belimo. ... EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: ... early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million)
```

**draft-1 11 statement 5** sourceId "0" label 11_synth_investor_letter_exit

```
International expansion. At entry, the Company generated SEK 3.4 billion (81%) of revenue from the Nordic region. ... By the time of exit, international revenue had grown to SEK 4.8 billion, representing 42% of total revenue.
```

**draft-1 11 statement 9** sourceId "0" label 11_synth_investor_letter_exit

```
At the time of our investment, the Company generated revenue of SEK 4.2 billion and EBITDA of SEK 480 million, representing an EBITDA margin of 11.4%.
...
By the time of exit, international revenue had grown to SEK 4.8 billion, representing 42% of total revenue. Total Company revenue at exit was SEK 11.4 billion.
...
Combined with the modularity programme, this drove EBITDA margins from 11.4% at entry to 18.2% at exit. Absolute EBITDA grew from SEK 480 million to SEK 2.08 billion over the hold.
```

**draft-1 13 statement 7** sourceId "0" label 13_synth_internal_inconsistency_memo

```
CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.
...
The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.
```

**draft-1 14 statement 0** sourceId "0" label 14_synth_thesis_only_memo

```
This memo sets out a thematic investment thesis on European clinical decision support ("CDS") software.
...
We believe the European market is at an inflection point.
```

**draft-1 14 statement 1** sourceId "0" label 14_synth_thesis_only_memo

```
Clinical decision support software helps clinicians make better, faster, more consistent treatment decisions at the point of care.
...
We believe the European market is at an inflection point. Three forces are aligning.
```

**draft-1 14 statement 2** sourceId "0" label 14_synth_thesis_only_memo

```
Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.
...
First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances.
```

**draft-1 14 statement 3** sourceId "0" label 14_synth_thesis_only_memo

```
Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.
...
First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances.
```

**draft-1 14 statement 4** sourceId "0" label 14_synth_thesis_only_memo

```
Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
...
Second, payer willingness to reimburse CDS software has improved markedly.
```

**draft-1 14 statement 8** sourceId "0" label 14_synth_thesis_only_memo

```
The European CDS market is structurally distinct from the US market in several ways.
...
The thesis fits our European healthcare investment platform well.
...
The category has been under-served by private equity to date. ... There is meaningful opportunity for a thoughtful financial sponsor to play a constructive consolidation role.
```

**draft-1 14 statement 11** sourceId "0" label 14_synth_thesis_only_memo

```
We are not recommending any specific investment at this time. We are seeking endorsement of the thesis and authorisation to invest sourcing time accordingly.
...
Plan to return to the Committee within six months with either a specific transaction memo or a refreshed thesis based on what we have learned.
```

**draft-1 15 statement 2** sourceId "0" label 15_synth_very_long_memo

```
The transaction will be funded with EUR 720 million of equity from Halden Group, EUR 110 million of co-investment from two of our long-standing LP relationships... The Esposito family will retain a 10% interest. Management will retain 6%. Halden Group and co-investors will hold 84% in aggregate.
```

**draft-1 15 statement 4** sourceId "0" label 15_synth_very_long_memo

```
The Company has grown... with operations across Italy, France, Spain, and Germany. The Company currently operates 184 retail stores...
```

**draft-1 15 statement 4** sourceId "0" label 15_synth_very_long_memo

```
...and a wholesale business that supplies independent design-led homeware retailers across Europe.
```

**draft-1 15 statement 7** sourceId "0" label 15_synth_very_long_memo

```
...with payback on new store openings averaging 2.4 years.
```

**draft-1 15 statement 7** sourceId "0" label 15_synth_very_long_memo

```
The unit economics of Casa Verde stores are exceptional. The Company's average four-wall store EBITDA margin is 22%...
```

**draft-1 15 statement 11** sourceId "0" label 15_synth_very_long_memo

```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores...
```

**draft-1 15 statement 11** sourceId "0" label 15_synth_very_long_memo

```
Our thesis rests on five pillars.
...
Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar.
```

**draft-1 15 statement 16** sourceId "0" label 15_synth_very_long_memo

```
We have identified five principal risks.
...
The principal risks are well-understood and we have built specific mitigations into our approach.
```

**draft-1 15 statement 17** sourceId "0" label 15_synth_very_long_memo

```
International expansion (contributing approximately EUR 240 million of incremental revenue, primarily from the UK and Nordic launches),
```

**draft-1 15 statement 30** sourceId "0" label 15_synth_very_long_memo

```
Commercial diligence was conducted by Bain & Company over a ten-week period...
Financial and tax diligence was conducted by Deloitte.
Legal diligence was conducted by Latham & Watkins.
ESG diligence was conducted by ERM.
...
The Bain report (circulated separately) confirms market positioning, validates the international expansion thesis, and provides detailed competitive mapping.
```

**draft-1 15 statement 31** sourceId "0" label 15_synth_very_long_memo

```
Casa Verde represents one of the most attractive opportunities... The Company combines a strong direct-to-consumer brand with category-leading market share... demonstrably strong unit economics, and a clear runway for international expansion that has been deliberately constrained under family ownership.
```

**draft-1 15 statement 32** sourceId "0" label 15_synth_very_long_memo

```
The management team is strong.
...
The management team is strong, the value creation plan is well-defined, and the financing structure is appropriately conservative.
...
We recommend approval of an investment of up to EUR 720 million of equity from Halden Group...
```

**draft-1 16 statement 0** sourceId "0" label 16_synth_healthcare_consumer

```
We seek IC approval for an investment of EUR 195 million for a 72% controlling stake in Bloom Nutrition Holdings Limited ("Bloom" or "the Company"), a London-headquartered premium women's nutrition and wellness brand with a multi-channel European presence.

...offering a focused range of evidence-based supplement products targeting four primary use cases: hormonal balance, energy and recovery, skin and hair health, and pregnancy and postnatal nutrition.
```

**draft-1 16 statement 1** sourceId "0" label 16_synth_healthcare_consumer

```
We seek IC approval for an investment of EUR 195 million for a 72% controlling stake in Bloom Nutrition Holdings Limited ("Bloom" or "the Company")... The transaction values Bloom at an enterprise value of EUR 310 million, representing 14.8x trailing twelve months EBITDA of EUR 21 million.
```

**draft-1 16 statement 4** sourceId "0" label 16_synth_healthcare_consumer

```
Gross margin is 71.4%, reflecting the premium pricing and direct-to-consumer channel weight. EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage...
```

**draft-1 16 statement 9** sourceId "0" label 16_synth_healthcare_consumer

```
The Company's clinical advisory board, in-house formulation capability, and disciplined product development cadence (typically two new product launches per year) create meaningful competitive moats.

...all formulated in-house, manufactured under contract by GMP-certified European facilities...
```

**draft-1 16 statement 10** sourceId "0" label 16_synth_healthcare_consumer

```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.

Bloom has built a defensible position in a category where most competitors are either single-product brands (limiting customer lifetime value) or insufficiently differentiated. The Company's clinical advisory board, in-house formulation capability, and disciplined product development cadence (typically two new product launches per year) create meaningful competitive moats.

International expansion runway is significant. Bloom is strong in the UK and increasingly strong in DACH, but underdeveloped in France, Italy, and Spain. The brand has demonstrable cross-border appeal — DACH revenue has grown from zero in 2021 to EUR 18 million in 2024 — and we see clear opportunity to replicate this in the Romance language markets.

We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR. The growth is sourced from continued UK growth (modest, reflecting maturation), continued strong DACH growth, accelerated entry into France and Spain, and selective US market entry in year three.

The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**draft-1 16 statement 11** sourceId "0" label 16_synth_healthcare_consumer

```
We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR.
...
The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**draft-1 16 statement 12** sourceId "0" label 16_synth_healthcare_consumer

```
Customer acquisition cost inflation in direct-to-consumer is the principal risk. Bloom's current 5.2-month payback period has lengthened from 3.8 months in 2022, reflecting both increased competition and broader paid social media cost inflation.

Brand-driven categories are subject to founder-dependency risk. Sarah Whitmore in particular is closely associated with the brand through content, podcast appearances, and visible founder presence.

Regulatory risk in women's health is real. Several of Bloom's products make claims around hormonal support and pregnancy wellness that are subject to evolving regulatory scrutiny across European markets. The Company has invested appropriately in regulatory affairs and has a clean track record, but the regulatory environment for nutrition claims is becoming more demanding.
```

**draft-1 17 statement 9** sourceId "0" label 17_synth_real_estate_logistics

```
We have budgeted EUR 38 million of value-add capital expenditure across the hold period. The principal investments are EUR 14 million in modernising the Park Royal asset ... EUR 8 million in the San Fernando asset, EUR 6 million in the Schiphol asset, and the remainder spread across smaller modernisation works across the Portfolio.
```

**draft-1 17 statement 9** sourceId "0" label 17_synth_real_estate_logistics

```
Rental growth of approximately 6% annually (a moderation from the recent 8% pace)... and exit at a 5.0% yield reflecting modest yield compression supported by continued strong investor demand for the asset class.
```

**draft-1 17 statement 10** sourceId "0" label 17_synth_real_estate_logistics

```
Levered at 55% loan-to-value, the equity gross IRR is 16.8% and the MOIC is 2.1x.
...
Senior debt of EUR 337 million (55% LTV) has been pre-arranged
```

**draft-1 17 statement 10** sourceId "0" label 17_synth_real_estate_logistics

```
Levered at 55% loan-to-value, the equity gross IRR is 16.8% and the MOIC is 2.1x.
Our base case underwrites a five-year hold
```

**draft-1 18 statement 2** sourceId "0" label 18a_synth_cross_source_pair_initial

```
We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company").
```

**draft-1 18 statement 3** sourceId "0" label 18a_synth_cross_source_pair_initial

```
The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240,000 residential units.

The Company currently serves 412 property management companies, not 380 as stated in our initial memo.
```

**draft-1 18 statement 4** sourceId "1" label 18b_synth_cross_source_pair_update

```
Annual recurring revenue stands at EUR 38 million as of March 2025, up from EUR 28 million the prior year — representing 36% year-on-year growth.

Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million. Growth on a cleaned basis is 28% year-on-year rather than the 36% previously reported.
```

**draft-1 18 statement 5** sourceId "1" label 18b_synth_cross_source_pair_update

```
The Company employs 142 people, with the majority based at the Stockholm headquarters and smaller offices in Oslo (12 people) and Helsinki (8 people).

The Company employs 167 people as of 28 May, not 142 as stated in our initial memo.
```

**draft-1 18 statement 6** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity. Three factors drive our conviction.

First, the product is genuinely market-leading.

Second, the Nordic property management technology market remains structurally underpenetrated.

Third, the founder team is exceptional.
```

**draft-1 18 statement 6** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH was founded in 2013 by Erik Lindqvist (current CEO) and three co-founders.

The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
```

**draft-1 18 statement 7** sourceId "1" label 18b_synth_cross_source_pair_update

```
Our base case envisages ARR growth from EUR 38 million today to approximately EUR 95 million over a five-year hold. This is supported by continued strong organic growth (we underwrite 22% ARR CAGR over the hold period), modest expansion into adjacent verticals (commercial property management), and selective add-on M&A.

Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million.
```

**draft-1 18 statement 8** sourceId "1" label 18b_synth_cross_source_pair_update

```
The base case generates a 2.8x MOIC and 23% IRR.

The combined effect of the above updates is a modest reduction in our underwritten returns. Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
```

**draft-1 18 statement 9** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity.

Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
```

**draft-1 19 statement 3** sourceId "0" label 19_synth_annual_report

```
Across the remaining eight portfolio companies, performance has been broadly positive with two notable challenges.
...
Continental Plastics has had a more challenging 2025.
...
Drift Logistics had a mixed 2025.
```

**draft-1 19 statement 4** sourceId "0" label 19_synth_annual_report

```
1. Helvetia Precision Components AG
Investment date: June 2025 Sector: Precision manufacturing Total Fund equity: EUR 480 million
Status: Active, year 1 of hold
...
Six months post-close, the Company is tracking modestly ahead of our underwriting on both revenue and EBITDA
```

**draft-1 19 statement 4** sourceId "0" label 19_synth_annual_report

```
2. Lumen Specialty Chemicals GmbH
Investment date: October 2025...
The integration into the Fund's portfolio is proceeding well. The 100-day plan is on track, with the new financial reporting infrastructure substantially in place and the procurement initiative beginning to deliver early wins.
```

### Number strikes, draft-1

10 strikes.

**draft-1 01 comment statement 6** 80 (80|)

```
However, it does not literally say acquisition has been "almost entirely organic"; that is a fair synthesis of the 80–90% non‑paid share but still interpretive.
```

**draft-1 01 comment statement 6** 90% (90|percent)

```
However, it does not literally say acquisition has been "almost entirely organic"; that is a fair synthesis of the 80–90% non‑paid share but still interpretive.
```

**draft-1 01 comment statement 9** 60 (60|)

```
Employee count, location, talent quality, and the 60–70% cost comparison are all explicitly stated.
```

**draft-1 01 improvement statement null** 90% (90|percent)

```
The phrase “almost entirely organic” for customer acquisition is directionally correct but somewhat absolute; you might anchor it more explicitly in the numbers (“around 85–90% of sign‑ups come from non‑paid channels”).
```

**draft-1 06 improvement statement null** 18.5 percent (18.5|percent)

```
"representing a compound annual growth rate of 18.6 percent" or "approximately 18.5 percent" rather than rounding up to 19 percent, to avoid any perception of embellishment.
```

**draft-1 12 improvement statement null** 40 (40|)

```
Remove or substantiate the detailed financial metrics (international revenue moving from one-fifth to over 40 per cent, nearly threefold revenue growth, EBITDA margins from 11 to 18 per cent).
```

**draft-1 12 improvement statement null** 11 (11|)

```
Remove or substantiate the detailed financial metrics (international revenue moving from one-fifth to over 40 per cent, nearly threefold revenue growth, EBITDA margins from 11 to 18 per cent).
```

**draft-1 13 improvement statement null** 300 (300|)

```
“approximately 300+ people”), but avoid stating 320 as an unqualified fact without reconciling the discrepancy.
```

**draft-1 18 strength statement null** 1 (1|)

```
The narrative flows logically from company description to thesis to base case and conclusion, making the memo easy to read in one pass.
```

**draft-1 20 assessment statement null** 1 (1|)

```
From a source-backing perspective, the draft is very strong: all factual elements that are present in the source are accurately reflected, with only one substantive addition (pipeline preparation and Q2 2026 capital calls) that is not supported by the document.
```

### Name strikes, draft-1

18 strikes.

**draft-1 01 comment statement 2** The MRR

```
The MRR figures and the >150% year-on-year growth are directly supported by the source.
```

**draft-1 01 assessment statement null** For Financial Times

```
For Financial Times standards, you could sharpen the distinction between sourced fact and editorial judgment by slightly tempering or explicitly attributing superlatives, but overall the piece reads as a clear, well‑supported investment summary.
```

**draft-1 02 comment statement 0** The EV

```
The EV of USD 4 billion is directly stated in the source.
```

**draft-1 02 assessment statement null** Financial Times

```
Overall text quality and readability are high, with clear, economical sentences and a coherent structure that would meet Financial Times standards with modest tightening of precision around timeframes and characterisations.
```

**draft-1 03 comment statement 8** Given Partners Group

```
The source states that the Infrastructure business has USD 27 billion in overall AUM but does not explicitly use the word "globally." Given Partners Group is a global firm, the inference is reasonable but not directly stated, so the geographic qualifier is not fully supported.
```

**draft-1 06 comment statement 8** Describing ESG

```
Describing ESG performance as continuing to improve is consistent with these statements.
```

**draft-1 06 assessment statement null** Cirrus CAGR

```
Nearly all statements are directly supported by the annual report excerpt, with only a minor rounding of the Cirrus CAGR figure.
```

**draft-1 06 improvement statement null** Cirrus CAGR

```
Adjust the Cirrus CAGR description to match the source more precisely, e.g.
```

**draft-1 08 comment statement 6** The CAGR

```
The CAGR is rounded to 17% in the draft versus 17.1% in the source, so the claim is mostly but not exactly supported.
```

**draft-1 09 comment statement 10** The EUR

```
The EUR 3 million figure and the 12‑month enhanced quality monitoring are confirmed.
```

**draft-1 10 strength statement null** Dr Annika Brandt

```
Leadership continuity is correctly represented, with Dr Annika Brandt remaining in charge, consistent with the source.
```

**draft-1 11 comment statement 13** Fund V’s August

```
This sentence is effectively identical to the source, confirming both the three remaining companies and Fund V’s August 2025 hard-cap close.
```

**draft-1 12 comment statement 4** No EBITDA

```
No EBITDA margin figures or changes are mentioned in the source.
```

**draft-1 13 comment statement 12** The ARR

```
The ARR starting point, target, time frame, and 19% CAGR are all explicitly supported.
```

**draft-1 16 comment statement 1** The EV

```
The EV of EUR 310m and the 72% stake are both correct, but the source does not phrase this as "EUR 310m for a 72% stake"; rather, EUR 195m is being invested for the 72% stake and the EV is a separate valuation metric.
```

**draft-1 18 comment statement 4** Using EUR

```
Using EUR 38m as the current ARR conflicts with the updated source.
```

**draft-1 18 comment statement 7** Using EUR

```
Using EUR 38m as the current base conflicts with the updated figures that the team has agreed to adopt.
```

**draft-1 19 comment statement 2** The MOIC

```
The MOIC and IRR figures match the source exactly.
```

### Not found passages, draft-2

68 strikes.

**draft-2 01 statement 0** sourceId "0" label 01_bvp_shopify_memo

```
Shopify was founded in 2007 by two Ruby on Rails core developers... Shopify�s 24 employees are located in Ottawa, Canada.
...
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs.
```

**draft-2 01 statement 4** sourceId "0" label 01_bvp_shopify_memo

```
Yet sophisticated features are also available without complicating the overall user experience. Shopify accomplishes this by making available an �App Store�.
...
This approach is a big competitive differentiator for Shopify.
...
Roughly two-thirds of Shopify�s customers utilize at least one app from their �App Store�.
```

**draft-2 01 statement 5** sourceId "0" label 01_bvp_shopify_memo

```
Shopify sells a simple SaaS solution that enables a business to quickly setup and run an online retail store. A typical customer signs up using their credit card and is up and running in a few hours with no long-term contract.
...
The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours.
```

**draft-2 01 statement 6** sourceId "0" label 01_bvp_shopify_memo

```
Roughly 65�70% of customers sign-up via word-of-mouth. Roughly 20% of customers sign-up via referrals from web design firms.
...
Finally, roughly 10�15% of customers sign-up via paid channels, which is largely keyword marketing and the occasional contest program.
...
We believe that Shopify has under-invested in marketing in a big way and that with a VP of Marketing and a few experienced people in place, the company can accelerate growth.
```

**draft-2 01 statement 10** sourceId "0" label 01_bvp_shopify_memo

```
Despite this, they are able to acquire a customer for between $175�225 and can pay back that spend in 7�9 months on a churn-adjusted basis.
...
We are excited by what we see as a great product that has struck a chord with customers.
...
This approach is a big competitive differentiator for Shopify.
...
Further, we think that there is an enormous opportunity to accelerate growth by investing in: i) marketing, ii) international expansion and product localization and iii) business development to expand the applications available in the Shopify App Store.
```

**draft-2 01 statement 11** sourceId "0" label 01_bvp_shopify_memo

```
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify...
...
We recommend this investment.
```

**draft-2 04 statement 4** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Average sessions per active user per week is approximately 6 — also exceptional. ... Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
```

**draft-2 04 statement 6** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Average session length is 14 minutes — exceptional for a social product. ... Average sessions per active user per week is approximately 6 — also exceptional. ... Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
```

**draft-2 04 statement 10** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
The user demographic is unusual. ... This is a desirable advertising audience.

We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
```

**draft-2 04 statement 13** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
Pinterest is a young company. The product has been in market for roughly 16 months. The team is small — six full-time employees plus the two founders.
...
Current monthly active users are approximately 1.5 million, growing rapidly.
```

**draft-2 04 statement 20** sourceId "0" label 04_synth_vc_pinterest_style_memo

```
First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years.
...
Third, the founders are exceptional. Our consistent experience is that the team is the principal determinant of outcomes in early-stage consumer investments. We have high conviction in Ben and Evan as builders.
...
Defensibility is uncertain.
```

**draft-2 06 statement 6** sourceId "0" label 06_synth_listed_pe_report_excerpt

```
We have introduced several operational changes during 2025, including the recruitment of a new Chief Commercial Officer and the appointment of a new Chairman with deep Iberian consumer experience. We are also implementing a structured cost reduction programme targeting approximately EUR 5 million of annualised savings. We expect these changes to begin contributing meaningfully in 2026.
...
We continue to view the underlying business as fundamentally sound and well-positioned for recovery as the operational programme takes effect and as the Iberian consumer environment improves.
```

**draft-2 06 statement 8** sourceId "0" label 06_synth_listed_pe_report_excerpt

```
Northstar Partners' environmental, social and governance ("ESG") programme has continued to mature during 2025. Eighty-five percent of our portfolio companies now report Scope 1 and Scope 2 emissions on a comparable basis, up from 72 percent in 2024.
...
Female representation in senior management across the portfolio reached 31 percent at the end of 2025, up from 26 percent at the end of 2024.
```

**draft-2 08 statement 2** sourceId "0" label 08_synth_industrial_buyout_memo

```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company")… Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.

The Schiller family will retain a 15% economic interest. Management will hold the remaining 7%.
```

**draft-2 08 statement 8** sourceId "0" label 08_synth_industrial_buyout_memo

```
Our base case underwrites a five-year hold with the following value drivers.

The base case generates a 2.4x gross MOIC and a 19% gross IRR.
```

**draft-2 08 statement 10** sourceId "0" label 08_synth_industrial_buyout_memo

```
Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.

Second, the end markets HPC serves are structurally attractive. The orthopaedic implants market is forecast to grow at 5–6% annually through 2030, driven by ageing demographics in Europe and the United States. Aerospace component demand is recovering strongly post-COVID, with Airbus and Boeing collectively targeting build-rate increases of approximately 40% over the next five years.
```

**draft-2 08 statement 14** sourceId "0" label 08_synth_industrial_buyout_memo

```
Fourth, we see meaningful M&A opportunity. The European precision machining sector remains highly fragmented… We have already identified five actionable targets in the EUR 30–80 million enterprise value range that would be accretive on both growth and margin grounds.

Under our ownership we expect to complete two to three add-on acquisitions over the holding period.

The transaction will be funded with EUR 480 million of equity from Halden Group, EUR 130 million of equity from co-investors (currently anticipated to include two existing LP relationships), and EUR 540 million of senior and second-lien debt.
```

**draft-2 08 statement 15** sourceId "0" label 08_synth_industrial_buyout_memo

```
We have identified four principal risks.

The semiconductor exposure introduces cyclicality that the medical and aerospace segments do not.

Customer concentration is a watch item. HPC's largest customer, a global orthopaedic implants manufacturer, accounted for 18% of revenue in 2024.

Foreign exchange exposure is significant.

Founder transition risk is moderate.

We expect to hedge transaction exposure systematically post-close and have factored a normalised CHF/EUR rate of 0.98 into our base case.

We have completed extensive reference checks. Andreas Schiller has committed to remain on the board for the first three years post-close and will rollover approximately 8% of his proceeds into the transaction.
```

**draft-2 08 statement 16** sourceId "0" label 08_synth_industrial_buyout_memo

```
We are attracted to HPC for four reasons.

First, the Company occupies an enviable competitive position.

Second, the end markets HPC serves are structurally attractive.

Third, there is a clear margin expansion path.

Fourth, we see meaningful M&A opportunity.
```

**draft-2 08 statement 17** sourceId "0" label 08_synth_industrial_buyout_memo

```
HPC represents an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience. The base case returns of 2.4x / 19% are in line with our private equity portfolio benchmarks, and we see meaningful upside optionality from M&A and end-market acceleration. The risks are well-understood and manageable. We recommend approval.

Petra Köhler… Reference checks across customers, suppliers, and former colleagues have been uniformly positive.
```

**draft-2 09 statement 2** sourceId "0" label 09_synth_portfolio_update_letter

```
The medical implants segment grew 14%, well ahead of expectations, driven by a 22% increase from our largest orthopaedic customer following their successful US product launch.

EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX...
```

**draft-2 09 statement 3** sourceId "0" label 09_synth_portfolio_update_letter

```
The leadership transition has gone better than expected.
```

**draft-2 09 statement 11** sourceId "0" label 09_synth_portfolio_update_letter

```
Klaus Wenger joined as Chief Procurement Officer in September, having previously held the same role at Belimo. He brings strong category management discipline that the Company has historically lacked.

EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX...
```

**draft-2 11 statement 5** sourceId "0" label 11_synth_investor_letter_exit

```
International expansion. At entry, the Company generated SEK 3.4 billion (81%) of revenue from the Nordic region. ... By the time of exit, international revenue had grown to SEK 4.8 billion, representing 42% of total revenue.
```

**draft-2 11 statement 9** sourceId "0" label 11_synth_investor_letter_exit

```
At the time of our investment, the Company generated revenue of SEK 4.2 billion and EBITDA of SEK 480 million, representing an EBITDA margin of 11.4%.
...
By the time of exit, international revenue had grown to SEK 4.8 billion, representing 42% of total revenue. Total Company revenue at exit was SEK 11.4 billion.
...
Combined with the modularity programme, this drove EBITDA margins from 11.4% at entry to 18.2% at exit. Absolute EBITDA grew from SEK 480 million to SEK 2.08 billion over the hold.
```

**draft-2 11 statement 13** sourceId "0" label 11_synth_investor_letter_exit

```
With three remaining portfolio companies and approximately SEK 2.1 billion of unrealised value, Fund IV is now solidly tracking to deliver above the 2.5x net MOIC target communicated at fund close.
...
Our focus now turns to the three remaining portfolio companies and to deployment of Fund V, which closed in August 2025 at hard cap.
```

**draft-2 13 statement 7** sourceId "0" label 13_synth_internal_inconsistency_memo

```
CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.
...
The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.
```

**draft-2 14 statement 1** sourceId "0" label 14_synth_thesis_only_memo

```
Clinical decision support software helps clinicians make better, faster, more consistent treatment decisions at the point of care.
...
We believe the European market is at an inflection point. Three forces are aligning.
```

**draft-2 14 statement 3** sourceId "0" label 14_synth_thesis_only_memo

```
Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.
...
First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances.
```

**draft-2 14 statement 4** sourceId "0" label 14_synth_thesis_only_memo

```
Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
...
Second, payer willingness to reimburse CDS software has improved markedly.
```

**draft-2 14 statement 8** sourceId "0" label 14_synth_thesis_only_memo

```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority.
...
The thesis fits our European healthcare investment platform well.
...
The category has been under-served by private equity to date. ... There is meaningful opportunity for a thoughtful financial sponsor to play a constructive consolidation role.
```

**draft-2 14 statement 11** sourceId "0" label 14_synth_thesis_only_memo

```
We are not recommending any specific investment at this time. We are seeking endorsement of the thesis and authorisation to invest sourcing time accordingly.
...
Plan to return to the Committee within six months with either a specific transaction memo or a refreshed thesis based on what we have learned.
```

**draft-2 15 statement 2** sourceId "0" label 15_synth_very_long_memo

```
The transaction will be funded with EUR 720 million of equity from Halden Group, EUR 110 million of co-investment from two of our long-standing LP relationships... The Esposito family will retain a 10% interest. Management will retain 6%. Halden Group and co-investors will hold 84% in aggregate.
```

**draft-2 15 statement 4** sourceId "0" label 15_synth_very_long_memo

```
The Company has grown... with operations across Italy, France, Spain, and Germany. The Company currently operates 184 retail stores...
```

**draft-2 15 statement 4** sourceId "0" label 15_synth_very_long_memo

```
...and a wholesale business that supplies independent design-led homeware retailers across Europe.
```

**draft-2 15 statement 6** sourceId "0" label 15_synth_very_long_memo

```
Casa Verde is a category leader in a structurally attractive sector. ... The Company holds an estimated 4.1% share of the addressable European premium market — a meaningful position in a fragmented category where the next largest specialist competitor holds roughly 2.7%.
```

**draft-2 15 statement 7** sourceId "0" label 15_synth_very_long_memo

```
Second, the unit economics of Casa Verde stores are exceptional. The Company's average four-wall store EBITDA margin is 22%... This is materially better than premium homeware peers and reflects strong product margins...
```

**draft-2 15 statement 8** sourceId "0" label 15_synth_very_long_memo

```
The next logical markets are the UK, the Netherlands, and the Nordic region, none of which have been entered. Our commercial diligence suggests substantial unmet demand...
```

**draft-2 15 statement 11** sourceId "0" label 15_synth_very_long_memo

```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores...
```

**draft-2 15 statement 11** sourceId "0" label 15_synth_very_long_memo

```
Our thesis rests on five pillars.

First, Casa Verde is a category leader...
Second, the unit economics...
Third, there is a clear and well-defined international expansion runway.
Fourth, there is meaningful product-side opportunity.
Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar.
```

**draft-2 15 statement 16** sourceId "0" label 15_synth_very_long_memo

```
We have identified five principal risks.
...
We have mitigated this risk through detailed commercial diligence... Even so, this risk warrants close governance attention...
We have stress-tested our model... and the returns remain attractive.
...
We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest.
...
We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.
```

**draft-2 15 statement 17** sourceId "0" label 15_synth_very_long_memo

```
The principal drivers are international expansion (contributing approximately EUR 240 million of incremental revenue, primarily from the UK and Nordic launches)...
```

**draft-2 15 statement 19** sourceId "0" label 15_synth_very_long_memo

```
Homeware is a discretionary purchase, and the European consumer environment in 2025 is uneven. ... A broader European consumer downturn would put pressure on the plan; we are comfortable that the Company's premium positioning and resilient unit economics give meaningful downside protection.
```

**draft-2 15 statement 22** sourceId "0" label 15_synth_very_long_memo

```
Marco Esposito, son of the founder, has served as Chairman and CEO since 2008. He will step back from day-to-day responsibilities post-close but will remain Chairman for at least three years. The current Chief Operating Officer, Elena Conti, will assume the CEO role. Elena has been with the Company for 17 years...
```

**draft-2 15 statement 30** sourceId "0" label 15_synth_very_long_memo

```
Commercial diligence was conducted by Bain & Company over a ten-week period... Financial and tax diligence was conducted by Deloitte. ... Legal diligence was conducted by Latham & Watkins. ... ESG diligence was conducted by ERM. ... The Bain report (circulated separately) confirms market positioning...
```

**draft-2 15 statement 31** sourceId "0" label 15_synth_very_long_memo

```
Casa Verde represents one of the most attractive opportunities our European Consumer team has reviewed... The Company combines a strong direct-to-consumer brand with category-leading market share... and a clear runway for international expansion... Second, the unit economics of Casa Verde stores are exceptional.
```

**draft-2 15 statement 32** sourceId "0" label 15_synth_very_long_memo

```
The management team is strong. ... The management team is strong, the value creation plan is well-defined, and the financing structure is appropriately conservative.
...
We recommend approval of an investment of up to EUR 720 million of equity from Halden Group...
```

**draft-2 16 statement 0** sourceId "0" label 16_synth_healthcare_consumer

```
We seek IC approval for an investment of EUR 195 million for a 72% controlling stake in Bloom Nutrition Holdings Limited ("Bloom" or "the Company"), a London-headquartered premium women's nutrition and wellness brand with a multi-channel European presence.

Bloom was founded in 2018 by Sarah Whitmore and Dr. Lara Bennett, both Cambridge-trained scientists. The Company operates in the premium women's health and nutrition category, offering a focused range of evidence-based supplement products targeting four primary use cases: hormonal balance, energy and recovery, skin and hair health, and pregnancy and postnatal nutrition.
```

**draft-2 16 statement 9** sourceId "0" label 16_synth_healthcare_consumer

```
Bloom has built a defensible position in a category where most competitors are either single-product brands (limiting customer lifetime value) or insufficiently differentiated. The Company's clinical advisory board, in-house formulation capability, and disciplined product development cadence (typically two new product launches per year) create meaningful competitive moats.

The product range comprises 24 SKUs, all formulated in-house, manufactured under contract by GMP-certified European facilities, and sold direct-to-consumer through Bloom's own website and Amazon, alongside a select wholesale presence in premium retailers including Selfridges, Le Bon Marché, KaDeWe, and Sephora.
```

**draft-2 16 statement 10** sourceId "0" label 16_synth_healthcare_consumer

```
Three pillars support our investment thesis.

Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.

International expansion runway is significant. Bloom is strong in the UK and increasingly strong in DACH, but underdeveloped in France, Italy, and Spain. The brand has demonstrable cross-border appeal — DACH revenue has grown from zero in 2021 to EUR 18 million in 2024 — and we see clear opportunity to replicate this in the Romance language markets.

We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR. The growth is sourced from continued UK growth (modest, reflecting maturation), continued strong DACH growth, accelerated entry into France and Spain, and selective US market entry in year three.

The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**draft-2 16 statement 11** sourceId "0" label 16_synth_healthcare_consumer

```
We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR.
...
The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**draft-2 16 statement 12** sourceId "0" label 16_synth_healthcare_consumer

```
Customer acquisition cost inflation in direct-to-consumer is the principal risk. Bloom's current 5.2-month payback period has lengthened from 3.8 months in 2022, reflecting both increased competition and broader paid social media cost inflation.

Brand-driven categories are subject to founder-dependency risk. Sarah Whitmore in particular is closely associated with the brand through content, podcast appearances, and visible founder presence.

Regulatory risk in women's health is real. Several of Bloom's products make claims around hormonal support and pregnancy wellness that are subject to evolving regulatory scrutiny across European markets. The Company has invested appropriately in regulatory affairs and has a clean track record, but the regulatory environment for nutrition claims is becoming more demanding.
```

**draft-2 17 statement 9** sourceId "0" label 17_synth_real_estate_logistics

```
We have budgeted EUR 38 million of value-add capital expenditure across the hold period. The principal investments are EUR 14 million in modernising the Park Royal asset ... EUR 8 million in the San Fernando asset, EUR 6 million in the Schiphol asset, and the remainder spread across smaller modernisation works across the Portfolio.
```

**draft-2 17 statement 9** sourceId "0" label 17_synth_real_estate_logistics

```
Rental growth of approximately 6% annually (a moderation from the recent 8% pace)... and exit at a 5.0% yield reflecting modest yield compression supported by continued strong investor demand for the asset class.
```

**draft-2 17 statement 10** sourceId "0" label 17_synth_real_estate_logistics

```
Levered at 55% loan-to-value, the equity gross IRR is 16.8% and the MOIC is 2.1x.
...
Senior debt of EUR 337 million (55% LTV) has been pre-arranged
```

**draft-2 17 statement 10** sourceId "0" label 17_synth_real_estate_logistics

```
Our base case underwrites a five-year hold with the following return drivers. ... Levered at 55% loan-to-value, the equity gross IRR is 16.8%
```

**draft-2 18 statement 2** sourceId "0" label 18a_synth_cross_source_pair_initial

```
We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company").
```

**draft-2 18 statement 3** sourceId "0" label 18a_synth_cross_source_pair_initial

```
The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240,000 residential units.

The Company currently serves 412 property management companies, not 380 as stated in our initial memo.
```

**draft-2 18 statement 4** sourceId "1" label 18b_synth_cross_source_pair_update

```
Annual recurring revenue stands at EUR 38 million as of March 2025, up from EUR 28 million the prior year — representing 36% year-on-year growth.

Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million. Growth on a cleaned basis is 28% year-on-year rather than the 36% previously reported.
```

**draft-2 18 statement 5** sourceId "1" label 18b_synth_cross_source_pair_update

```
The Company employs 142 people, with the majority based at the Stockholm headquarters and smaller offices in Oslo (12 people) and Helsinki (8 people).

The Company employs 167 people as of 28 May, not 142 as stated in our initial memo.
```

**draft-2 18 statement 6** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity. Three factors drive our conviction.

First, the product is genuinely market-leading.

Second, the Nordic property management technology market remains structurally underpenetrated.

Third, the founder team is exceptional.
```

**draft-2 18 statement 6** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH was founded in 2013 by Erik Lindqvist (current CEO) and three co-founders.

The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
```

**draft-2 18 statement 8** sourceId "1" label 18b_synth_cross_source_pair_update

```
The base case generates a 2.8x MOIC and 23% IRR.

Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
```

**draft-2 18 statement 9** sourceId "0" label 18a_synth_cross_source_pair_initial

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity.

Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.

NSH is a high-quality Nordic vertical SaaS asset with strong unit economics, exceptional product strength, and a clear growth runway.
```

**draft-2 19 statement 3** sourceId "0" label 19_synth_annual_report

```
Across the remaining eight portfolio companies, performance has been broadly positive with two notable challenges.
...
Continental Plastics has had a more challenging 2025.
...
Drift Logistics had a mixed 2025.
```

**draft-2 19 statement 4** sourceId "0" label 19_synth_annual_report

```
Helvetia Precision Components AG
Investment date: June 2025 Sector: Precision manufacturing Total Fund equity: EUR 480 million
Status: Active, year 1 of hold
... Six months post-close, the Company is tracking modestly ahead of our underwriting on both revenue and EBITDA...

Lumen Specialty Chemicals GmbH
Investment date: October 2025 ... The integration into the Fund's portfolio is proceeding well. The 100-day plan is on track...

Brightway Industrial Coatings Ltd
... Brightway has had a strong 2025, with revenue growing 14% year-on-year and EBITDA growing 21%.

Eltex Power Systems AS
... Revenue grew 23% year-on-year and EBITDA grew 31%. The order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date.
```

**draft-2 19 statement 5** sourceId "0" label 19_synth_annual_report

```
Continental Plastics Holdings
Investment date: March 2023 ... Continental Plastics has had a more challenging 2025. Revenue grew 4% year-on-year (against an underwriting of 9%) and EBITDA was broadly flat.
```

**draft-2 19 statement 7** sourceId "0" label 19_synth_annual_report

```
Drift Logistics Group BV
Investment date: April 2024 Sector: Third-party logistics ... Drift Logistics had a mixed 2025. The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year. The Company has nevertheless gained share, with revenue growing 6% against the negative market backdrop. EBITDA margins have been pressured by overcapacity in the market and have compressed from 14% to 12% year-on-year.
```

### Number strikes, draft-2

9 strikes.

**draft-2 01 comment statement 9** 60 (60|)

```
The memo confirms the 24 employees are in Ottawa and that development and design talent has been recruited at 60–70% of Silicon Valley or New York cost.
```

**draft-2 06 assessment statement null** 18.6 (18.6|)

```
The only minor deviation is the rounding of Cirrus’s revenue CAGR from 18.6 per cent to “approximately 19 per cent”, which is acceptable but should be treated consciously as a rounding choice.
```

**draft-2 06 assessment statement null** 19 (19|)

```
The only minor deviation is the rounding of Cirrus’s revenue CAGR from 18.6 per cent to “approximately 19 per cent”, which is acceptable but should be treated consciously as a rounding choice.
```

**draft-2 06 improvement statement null** 18.6 (18.6|)

```
Consider aligning the Cirrus CAGR wording more precisely with the source by either retaining the 18.6 per cent figure or explicitly noting it as “approximately 18.5 per cent” rather than rounding up to 19 per cent, to avoid any perception of embellishment.
```

**draft-2 06 improvement statement null** 18.5 (18.5|)

```
Consider aligning the Cirrus CAGR wording more precisely with the source by either retaining the 18.6 per cent figure or explicitly noting it as “approximately 18.5 per cent” rather than rounding up to 19 per cent, to avoid any perception of embellishment.
```

**draft-2 06 improvement statement null** 19 (19|)

```
Consider aligning the Cirrus CAGR wording more precisely with the source by either retaining the 18.6 per cent figure or explicitly noting it as “approximately 18.5 per cent” rather than rounding up to 19 per cent, to avoid any perception of embellishment.
```

**draft-2 07 improvement statement null** 0 (0|)

```
Optionally reintroduce a short nod to the continued importance of non-agent, human-centric software (as in the source) to avoid the impression that the thesis is zero-sum about agents replacing all software.
```

**draft-2 08 comment statement 2** 22% (22|percent)

```
The 78% stake and the residual 22% split between the Schiller family and management are supported.
```

**draft-2 13 improvement statement null** 300 (300|)

```
"around 300 employees"), or clarifying which figure is current and why, if that information is available.
```

### Name strikes, draft-2

16 strikes.

**draft-2 01 assessment statement null** Financial Times

```
Readability is strong, though a few evaluative phrases could be sharpened or more explicitly tied to the cited numbers to maintain the Financial Times–level discipline around evidentiary support and to avoid over-claiming relative to the source language.
```

**draft-2 02 comment statement 0** The EV

```
The EV of USD 4 billion is explicitly stated in the source.
```

**draft-2 05 comment statement 4** The CAGR

```
The CAGR of approximately 11 percent over the past five years is directly stated in the source.
```

**draft-2 06 improvement statement null** Cirrus CAGR

```
Consider aligning the Cirrus CAGR wording more precisely with the source by either retaining the 18.6 per cent figure or explicitly noting it as “approximately 18.5 per cent” rather than rounding up to 19 per cent, to avoid any perception of embellishment.
```

**draft-2 08 comment statement 6** The CAGR

```
The CAGR is given as 17.1% in the source, while the draft rounds this to 17%.
```

**draft-2 08 comment statement 13** The MOIC

```
The MOIC and IRR figures match the source exactly.
```

**draft-2 09 comment statement 10** The EUR

```
The EUR 3 million figure and its limited nature, as well as the 12‑month enhanced quality monitoring, are explicitly supported.
```

**draft-2 12 comment statement 4** No EBITDA

```
No EBITDA margin data or percentages appear in the source, so this numerical claim is unsupported.
```

**draft-2 13 comment statement 12** The ARR

```
The ARR starting point, target, time frame, and CAGR all match the source language exactly.
```

**draft-2 16 comment statement 1** The EV

```
The EV of EUR 310m and the 72% stake are both correct, but the EV is for the whole company, not specifically "for a 72 percent stake".
```

**draft-2 17 comment statement 4** The WAULT

```
The WAULT of 6.8 years is explicitly given.
```

**draft-2 18 comment statement 4** Presenting EUR

```
Presenting EUR 38m as the current ARR without qualification conflicts with the updated source.
```

**draft-2 19 comment statement 4** For Helvetia

```
For Helvetia, the acquisition date (June 2025), six months post-close timing, and tracking modestly ahead of underwriting are all supported.
```

**draft-2 19 comment statement 4** For Lumen

```
For Lumen, the 100‑day plan being on track is supported.
```

**draft-2 19 comment statement 4** For Brightway

```
For Brightway, the revenue and EBITDA growth figures and the characterisation of a strong 2025 are supported.
```

**draft-2 19 comment statement 4** For Eltex

```
For Eltex, the revenue and EBITDA growth figures and the increase in order backlog from EUR 285m to EUR 480m are supported.
```

### Not found passages, real-runs

21 strikes.

**real-runs 2026-10-04-hicl statement 1** sourceId "0" label source-hicl-interim-extracted

```
"HICL has delivered robust operational performance during the period, with capex programmes driving EBITDA growth, alongside resilient cash generation across the portfolio, supporting our confidence in achieving our target dividend cash cover of 1.1x for the year."
```

**real-runs 2026-10-04-hicl statement 2** sourceId "0" label source-hicl-interim-extracted

```
"HICL's growth investments continue to perform well, progressing significant expansion capex programmes and delivering EBITDA in line with expectations."
```

**real-runs 2026-10-04-hicl statement 3** sourceId "0" label source-hicl-interim-extracted

```
"London St. Pancras High Speed performed well in the period, with international train path bookings slightly ahead of forecast."
```

**real-runs 2026-10-04-hicl statement 4** sourceId "0" label source-hicl-interim-extracted

```
"The period saw further progress in relation to a potential second international operator on the route, including announcements by Virgin Trains regarding its intentions for crossChannel operations from St. Pancras and approach to rolling stock procurement having been awarded depot capacity by the UK rail regulator."
```

**real-runs 2026-10-04-hicl statement 5** sourceId "0" label source-hicl-interim-extracted

```
"Fortysouth delivered 16 new towers during the period and is actively progressing incremental co-location opportunities, both of which are expected to support continued growth in EBITDA in line with HICL's valuation assumption."
```

**real-runs 2026-10-04-hicl statement 6** sourceId "0" label source-hicl-interim-extracted

```
"The company recently completed an accretive refinancing which was c.30% oversubscribed, and which enabled a step-down on debt margins earlier than forecast, underlining the quality and long-term visibility of Fortysouth's revenues."
```

**real-runs 2026-10-04-hicl statement 7** sourceId "0" label source-hicl-interim-extracted

```
"At Affinity Water, the management team remains focused on delivering the AMP8 business plan. During the period, the company appointed Mark Garth as Chief Executive Officer, who brings significant sector experience from United Utilities particularly in relation to achieving industry-leading operational performance. HICL continues to expect distributions from Affinity Water ahead of 31 March 2026. The Company notes the publication of the UK Government white paper on water sector reform, which is largely consistent with the final recommendations of the Cunliffe Report, many of which are expected to be beneficial for strong performers such as Affinity Water."
```

**real-runs 2026-10-06-gpi statement 0** sourceId "0" label source-gpi-press-release-extracted

```
GP Industries Limited (GP Industries), the world’s second-largest producer of consumer batteries, is shifting production capacity to its manufacturing facilities in Southeast Asia to navigate US tariffs and rising geopolitical tensions.
...
GP Industries, which is celebrating the 30th anniversary of its incorporation and listing in Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Asian markets.
```

**real-runs 2026-10-06-gpi statement 1** sourceId "0" label source-gpi-press-release-extracted

```
The Group currently operates three facilities in Malaysia, two in Vietnam, and one in Thailand. It also has two other plants in the UK.
...
GP Industries, which is celebrating the 30th anniversary of its incorporation and listing in Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Asian markets.
```

**real-runs 2026-10-06-gpi statement 2** sourceId "0" label source-gpi-press-release-extracted

```
GP Industries, which is celebrating the 30th anniversary of its incorporation and listing in Singapore this month, said production capacity in Southeast Asia will be ramped up to serve the US market while its China facility will now focus primarily on the European and Asian markets. The move will streamline supply chains to meet country-of-origin requirements and maintain cost competitiveness.
...
After higher initial costs from diversifying production to Southeast Asia, GP Industries said margins have risen due to improved utilisation, lower commodity costs, and optimised supply chains.
```

**real-runs 2026-10-06-gpi statement 4** sourceId "0" label source-gpi-press-release-extracted

```
GP Industries Limited (GP Industries), the world’s second-largest producer of consumer batteries, is shifting production capacity to its manufacturing facilities in Southeast Asia to navigate US tariffs and rising geopolitical tensions.
...
It has since grown into a global manufacturer, producing over six billion batteries annually, sold through one million outlets worldwide.
```

**real-runs 2026-10-06-clearpoint statement 0** sourceId "0" label source-clearpoint-q1-2026-extracted

```
SOLANA BEACH, Calif., May 13, 2026 (Newswire.com) - ClearPoint Neuro, Inc. (Nasdaq:CLPT) (the "Company"), a global device, cell, and gene therapy-enabling company offering precise navigation to the brain and spine, today announced financial results for its first quarter ended March 31, 2026.
```

**real-runs 2026-10-06-clearpoint statement 1** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Reported first quarter revenue of $12.1 million, including $2.3 million of IRRAflow revenue, representing 43% overall growth and 16% year-over-year total organic growth compared with the first quarter of 2025;
The activated installed base across all ClearPoint technology including IRRAflow systems now includes over 175 global centers;
Achievement of measurable revenue and cost synergies through the continuing integration of the IRRAflow product portfolio and team;
```

**real-runs 2026-10-06-clearpoint statement 2** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Reported first quarter revenue of $12.1 million, including $2.3 million of IRRAflow revenue, representing 43% overall growth and 16% year-over-year total organic growth compared with the first quarter of 2025;
```

**real-runs 2026-10-06-clearpoint statement 2** sourceId "0" label source-clearpoint-q1-2026-extracted

```
"While record revenue achievement and 25% organic devices growth made the headline, there is no shortage of meaningful strategic progress across the entire organization."
```

**real-runs 2026-10-06-clearpoint statement 3** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Biologics and drug delivery revenue... increased slightly to $4.8 million...
Neurosurgery navigation, therapy and access revenue... increased 80% to $5.9 million...
Capital equipment and software revenue... increased 177% to $1.4 million...
Total revenue was $12.1 million...
```

**real-runs 2026-10-06-clearpoint statement 3** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Neurosurgery navigation, therapy and access revenue... increased 80% to $5.9 million for the three months ended March 31, 2026, from $3.3 million for the same period in 2025.
```

**real-runs 2026-10-06-clearpoint statement 3** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Neurosurgery navigation, therapy and access revenue... increased 80% to $5.9 million... The increase is driven by additional revenues from sales of the IRRAflow product of as well as the introduction of our 3.0 operating room navigation software, which has positively impacted procedural volumes in the operating room during the three months ended March 31, 2026, compared to the same period in 2025.
```

**real-runs 2026-10-06-clearpoint statement 4** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Capital equipment and software revenue... increased 177% to $1.4 million... from $0.5 million for the same period in 2025 due to an increase in placements of ClearPoint navigation capital and software, IRRAflow control units, and Prism laser units.
```

**real-runs 2026-10-06-clearpoint statement 5** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Biologics and drug delivery revenue... increased slightly to $4.8 million for the three months ended March 31, 2026 from $4.7 million for the three months ended March 31, 2025.
```

**real-runs 2026-10-06-clearpoint statement 8** sourceId "0" label source-clearpoint-q1-2026-extracted

```
Received Medical Device License (MDL) from Health Canada for the ClearPoint Neuro Navigation System, covering both MRI-guidance and iCT guidance workflows with first cases now scheduled;
```

### Number strikes, real-runs

5 strikes.

**real-runs 2026-09-29 comment statement 0** £3.3 billion (3.3|billion)

```
The source confirms a total return of £3,291 million and a 13% return on opening shareholders’ funds, but the draft misstates the figure as £3.3 million instead of approximately £3.3 billion and gives the period as six months to 30 June 2025 rather than to 30 September 2025.
```

**real-runs 2026-09-29 comment statement 5** €11.229 billion (11.229|billion)

```
The figures for net sales (€11.229 billion) and like-for-like sales growth (6.3%) are supported, but the period is misstated.
```

**real-runs 2026-09-29 improvement statement null** £3.3bn (3.3|billion)

```
£3.3bn), not £3.3 million, and it relates to the six months to 30 September 2025, not to 30 June 2025; similarly, the Action sales and LFL data are for nine reporting periods to 28 September 2025, not six months to 30 June 2026.
```

**real-runs 2026-10-06-clearpoint comment statement 9** $52 (52|)

```
The guidance range of $52–56m is for 2026, not 2027, and is presented as a range rather than a single point of $56m.
```

**real-runs 2026-10-06-clearpoint improvement statement null** $52 (52|)

```
The company provides a 2026 revenue estimate range of $52–56m, not a single-point guidance of $56m for 2027.
```

### Name strikes, real-runs

3 strikes.

**real-runs 2026-10-06-gpi assessment statement null** Financial Times

```
Text quality and readability are acceptable for a news-style summary, yet the piece would not meet Financial Times standards for precision and sourcing in its current form.
```

**real-runs 2026-10-06-clearpoint comment statement 2** The CEO

```
The CEO quote explicitly mentions 25% organic devices growth, but does not specify that this is year-on-year.
```

**real-runs 2026-10-06-clearpoint assessment statement null** Health Canada Medical Device License

```
However, there are significant factual errors around organic growth (including an invented -50% figure), the timing of the results announcement, the nature and issuer of regulatory approvals (confusing FDA clearance with a Health Canada Medical Device License and introducing an unsubstantiated FDA submission), and the year and structure of revenue guidance.
```


## Metered spend

Recorded usage. Rates for `gpt-5.1-2025-11-13`: input 1.25, cached input 0.125, output 10.00 per million. List prices every input token at 1.25. Discounted is `calculateLlmCostUsd`. Unpriced calls 0. Ceiling USD 10 on the discounted meter across every pass. Not crossed. Combined discounted USD 1.2826400.

| Pass | List USD | Discounted USD | Calls | Input tokens | Cached input tokens | Output tokens |
|---|---:|---:|---:|---:|---:|---:|
| draft-1 | 0.59707375 | 0.59707375 | 20 | 54883 | 0 | 52847 |
| draft-2 | 0.61236375 | 0.56268375 | 20 | 54883 | 44160 | 54376 |
| real-runs | 0.12288250 | 0.12288250 | 4 | 14074 | 0 | 10529 |
| All | 1.33232000 | 1.28264000 | 44 | | | |

Local cache was off. On draft-2 the provider cached 44160 of 54883 input tokens. The prompt, temperature, and seed were the same.

## Technical summary

`scripts/diagnostic/b381/run-draft-review.mjs` sends one review call per draft, with the sources, the full draft, and the numbered statements, and rolls the claims up to a sentence card that `score.mjs` already reads. `prompt.md` was written once from Ben's wording plus the scoring fields, and was not retuned. `fabrication-checks.mjs` tests every passage against the named source and every number and capitalised multi-word name in the comments and the writer-facing feedback against the draft and the sources. Nothing under `lib/` changed. Three passes, 44 calls, discounted USD 1.2826400, under the USD 10 ceiling.

## Plain-language summary

A whole-draft review, one call per memo, called 7 of the 11 planted conflicts on both passes, against the pipeline's 9 of 11 and against 3 of 11 when the same model saw one sentence at a time. It left alone 56 and then 59 of the 74 sentences Ben had already confirmed, against the pipeline's 65, which is outside the noise already measured on identical pipeline runs. The two passes agreed on 90 of the 100 labelled sentences. Of the passages it cited, 162 of 668 do not occur in the source it named.
