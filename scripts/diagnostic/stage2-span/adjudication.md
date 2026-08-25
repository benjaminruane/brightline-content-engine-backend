# B88 adjudication extract: 28 Stage 2 span verdict changes

Read-only extract. No judgement about whether a flip is correct.

rows.json does not contain matchesOff or a Stage 2 passage field on matchesOn.
Per-pair OFF classifications and Stage 2 passages below are the stored Stage 2 payloads from scripts/diagnostic/.llm-cache.json, keyed by the OFF or ON promptHash. Surrounding sentences, where added, are exact substrings of the fixture source files (or Nordholt files under ~/Downloads).

## Part 1. Changed cards

## 1. nordholt-clean statement 0

Change class: supported_full to non-full

Fixture id and statement index:
nordholt-clean, statement 0

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
PLANTED FAULT at this statement: not recorded

Statement text, verbatim:
```
Nordholt Logistics continues to perform in line with underwriting, and the fund has generated a net IRR to date of 14 per cent.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- IC memo: no_support
- press release: no_support
- fact sheet: confirmed
- LP update: partially_confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- IC memo: no_support
- press release: no_support
- fact sheet: partially_confirmed
- LP update: partially_confirmed

ON-arm unsupportedSpan:
- IC memo: (none)
- press release: (none)
- fact sheet:
```
Nordholt Logistics continues to perform in line with underwriting
```
- LP update:
```
the fund has generated a net IRR to date of 14 per cent
```

Stage 2 matched passage, per pair:
### IC memo

OFF passage:
```
The Committee notes that projected returns are attractive but are not guaranteed.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
The Committee notes that projected returns are attractive but are not guaranteed.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### press release

OFF passage:
```
Nordholt Logistics today announced the completion of its acquisition of Baltic ColdCo, extending the group's cold-chain network into Finland. Following the transaction, Nordholt operates 14 facilities across the Nordic region.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Nordholt Logistics today announced the completion of its acquisition of Baltic ColdCo, extending the group's cold-chain network into Finland.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### fact sheet

OFF passage:
```
Net IRR to date (Ashford Fund IV): 14 per cent
```
Surrounding sentence from the source file:
```
Net IRR to date (Ashford Fund IV): 14 per cent

```

ON passage:
```
Net IRR to date (Ashford Fund IV): 14 per cent
```
Surrounding sentence from the source file:
```
Net IRR to date (Ashford Fund IV): 14 per cent

```

### LP update

OFF passage:
```
Nordholt Logistics continues to perform in line with our underwriting.
```
Surrounding sentence from the source file:
```
Nordholt Logistics continues to perform in line with our underwriting.
Following the completion of the Baltic ColdCo acquisition in June, the Company
```

ON passage:
```
Nordholt Logistics continues to perform in line with our underwriting.
```
Surrounding sentence from the source file:
```
Nordholt Logistics continues to perform in line with our underwriting.
Following the completion of the Baltic ColdCo acquisition in June, the Company
```

## 2. nordholt-clean statement 2

Change class: supported_full to non-full

Fixture id and statement index:
nordholt-clean, statement 2

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
PLANTED FAULT at this statement: not recorded

Statement text, verbatim:
```
Following the acquisition of Baltic ColdCo in June 2026, combined annual revenue stands at approximately EUR 155 million, of which around 70 per cent is contracted, providing a solid base of recurring income.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- IC memo: no_support
- press release: partially_confirmed
- fact sheet: confirmed
- LP update: partially_confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- IC memo: no_support
- press release: partially_confirmed
- fact sheet: partially_confirmed
- LP update: partially_confirmed

ON-arm unsupportedSpan:
- IC memo: (none)
- press release:
```
of which around 70 per cent is contracted, providing a solid base of recurring income
```
- fact sheet:
```
Following the acquisition of Baltic ColdCo in June 2026
```
- LP update:
```
combined annual revenue stands at approximately EUR 155 million
```

Stage 2 matched passage, per pair:
### IC memo

OFF passage:
```
Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### press release

OFF passage:
```
Combined annual revenue for the enlarged group stands at approximately EUR 155 million.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Combined annual revenue for the enlarged group stands at approximately EUR 155 million.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### fact sheet

OFF passage:
```
Contracted revenue: 70 per cent of total revenue
Combined annual revenue: EUR 155 million
```
Surrounding sentence from the source file:
```
Contracted revenue: 70 per cent of total revenue
Combined annual revenue: EUR 155 million
Net IRR to date (Ashford Fund IV): 14 per cent
```

ON passage:
```
Contracted revenue: 70 per cent of total revenue
Combined annual revenue: EUR 155 million
```
Surrounding sentence from the source file:
```
Contracted revenue: 70 per cent of total revenue
Combined annual revenue: EUR 155 million
Net IRR to date (Ashford Fund IV): 14 per cent
```

### LP update

OFF passage:
```
Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

## 3. supersession statement 1

Change class: supported_full to non-full

Fixture id and statement index:
supersession, statement 1

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
PLANTED FAULT at this statement: not recorded

Statement text, verbatim:
```
The company employs 720 people.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- source_A_annual_report_2019: conflicting
- source_B_fy2024_results: no_support
- source_C_fund_update_2026: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- source_A_annual_report_2019: conflicting
- source_B_fy2024_results: no_support
- source_C_fund_update_2026: partially_confirmed

ON-arm unsupportedSpan:
- source_A_annual_report_2019 WHOLE:
```
The company employs 720 people.
```
- source_B_fy2024_results: (none)
- source_C_fund_update_2026 WHOLE:
```
The company employs 720 people.
```

Stage 2 matched passage, per pair:
### source_A_annual_report_2019

OFF passage:
```
At 31 December 2019 the fund held 12 portfolio companies across three sectors, and the underlying businesses employed 640 people in aggregate.
```
Surrounding sentence from the source file:
```
At 31 December 2019 the fund held 12 portfolio companies across three sectors, and the underlying businesses employed 640 people in aggregate.

```

ON passage:
```
At 31 December 2019 the fund held 12 portfolio companies across three sectors, and the underlying businesses employed 640 people in aggregate.
```
Surrounding sentence from the source file:
```
At 31 December 2019 the fund held 12 portfolio companies across three sectors, and the underlying businesses employed 640 people in aggregate.

```

### source_B_fy2024_results

OFF passage:
```
Adjusted EBITDA for FY2024 was EUR 45 million, reflecting margin expansion across the core holdings.
```
Surrounding sentence from the source file:
```
Adjusted EBITDA for FY2024 was EUR 45 million, reflecting margin expansion across the core holdings.

```

ON passage:
```
Adjusted EBITDA for FY2024 was EUR 45 million, reflecting margin expansion across the core holdings.
```
Surrounding sentence from the source file:
```
Adjusted EBITDA for FY2024 was EUR 45 million, reflecting margin expansion across the core holdings.

```

### source_C_fund_update_2026

OFF passage:
```
The fund now holds 15 portfolio companies, and the underlying businesses employ 720 people in aggregate.
```
Surrounding sentence from the source file:
```
The fund now holds 15 portfolio companies, and the underlying businesses employ 720 people in aggregate.

```

ON passage:
```
The fund now holds 15 portfolio companies, and the underlying businesses employ 720 people in aggregate.
```
Surrounding sentence from the source file:
```
The fund now holds 15 portfolio companies, and the underlying businesses employ 720 people in aggregate.

```

## 4. F04 statement 7

Change class: supported_full to non-full

Fixture id and statement index:
F04, statement 7

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_vc_pinterest_style_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 04_synth_vc_pinterest_style_memo.txt

Statement text, verbatim:
```
The Company's user base is unusual in two respects.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: partially_confirmed

ON-arm unsupportedSpan:
- 04_synth_vc_pinterest_style_memo:
```
in two respects
```

Stage 2 matched passage, per pair:
### 04_synth_vc_pinterest_style_memo

OFF passage:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
```
Surrounding sentence from the source file:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.

```

ON passage:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
```
Surrounding sentence from the source file:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.

```

## 5. F04 statement 10

Change class: supported_full to non-full

Fixture id and statement index:
F04, statement 10

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_vc_pinterest_style_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 04_synth_vc_pinterest_style_memo.txt

Statement text, verbatim:
```
This combination — engaged users, female-skewed, older demographic — represents a strong and underserved advertising audience and supports a credible long-term monetization path through native advertising in categories such as home decor, fashion, and weddings.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: partially_confirmed

ON-arm unsupportedSpan:
- 04_synth_vc_pinterest_style_memo:
```
This combination — engaged users, female-skewed, older demographic — represents a strong and underserved advertising audience and supports a credible long-term monetization path
```

Stage 2 matched passage, per pair:
### 04_synth_vc_pinterest_style_memo

OFF passage:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
```
Surrounding sentence from the source file:
```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.

```

ON passage:
```
The product currently has no monetisation strategy. We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
```
Surrounding sentence from the source file:
```
The product currently has no monetisation strategy. We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.

```

## 6. F04 statement 12

Change class: supported_full to non-full

Fixture id and statement index:
F04, statement 12

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_vc_pinterest_style_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 04_synth_vc_pinterest_style_memo.txt

Statement text, verbatim:
```
Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: partially_confirmed

ON-arm unsupportedSpan:
- 04_synth_vc_pinterest_style_memo:
```
for being unusually focused on users
```

Stage 2 matched passage, per pair:
### 04_synth_vc_pinterest_style_memo

OFF passage:
```
References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it.
```
Surrounding sentence from the source file:
```
Our diligence on Ben has been deep. References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it. We have spent significant time with both founders and find them thoughtful, deliberate, and genuinely passionate about the product.
```

ON passage:
```
References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it.
```
Surrounding sentence from the source file:
```
Our diligence on Ben has been deep. References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it. We have spent significant time with both founders and find them thoughtful, deliberate, and genuinely passionate about the product.
```

## 7. F04 statement 19

Change class: supported_full to non-full

Fixture id and statement index:
F04, statement 19

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_vc_pinterest_style_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 04_synth_vc_pinterest_style_memo.txt

Statement text, verbatim:
```
We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: partially_confirmed

ON-arm unsupportedSpan:
- 04_synth_vc_pinterest_style_memo:
```
consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team
```

Stage 2 matched passage, per pair:
### 04_synth_vc_pinterest_style_memo

OFF passage:
```
The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.
```
Surrounding sentence from the source file:
```
We recommend approval. Our base case envisages a hold of approximately 5 to 7 years with a target return of 10 times or better. The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.

```

ON passage:
```
The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.
```
Surrounding sentence from the source file:
```
We recommend approval. Our base case envisages a hold of approximately 5 to 7 years with a target return of 10 times or better. The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.

```

## 8. F04 statement 20

Change class: supported_full to non-full

Fixture id and statement index:
F04, statement 20

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_vc_pinterest_style_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 04_synth_vc_pinterest_style_memo.txt

Statement text, verbatim:
```
In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 04_synth_vc_pinterest_style_memo: partially_confirmed

ON-arm unsupportedSpan:
- 04_synth_vc_pinterest_style_memo:
```
a defensible consumer position
```

Stage 2 matched passage, per pair:
### 04_synth_vc_pinterest_style_memo

OFF passage:
```
What gives us conviction is the depth of user engagement we have observed.
```
Surrounding sentence from the source file:
```
What gives us conviction is the depth of user engagement we have observed.

```

ON passage:
```
The product currently has no monetisation strategy. We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
```
Surrounding sentence from the source file:
```
The product currently has no monetisation strategy. We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.

```

## 9. F06 statement 5

Change class: supported_full to non-full

Fixture id and statement index:
F06, statement 5

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_listed_pe_report_excerpt
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 06_synth_listed_pe_report_excerpt.pdf

Statement text, verbatim:
```
Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 06_synth_listed_pe_report_excerpt: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 06_synth_listed_pe_report_excerpt: partially_confirmed

ON-arm unsupportedSpan:
- 06_synth_listed_pe_report_excerpt:
```
modestly above the EUR 196 million at the time of our investment
```

Stage 2 matched passage, per pair:
### 06_synth_listed_pe_report_excerpt

OFF passage:
```
Revenue for the year ended 31 December 2025 was EUR 218 million, only modestly above the EUR 196 million at the time of our investment. EBITDA of EUR 31 million represented a margin of 14.2 percent, broadly stable over the holding period.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Revenue for the year ended 31 December 2025 was EUR 218 million, only modestly above the EUR 196 million at the time of our investment. EBITDA of EUR 31 million represented a margin of 14.2 percent, broadly stable over the holding period.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

## 10. F09 statement 4

Change class: supported_full to non-full

Fixture id and statement index:
F09, statement 4

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_portfolio_update_letter
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 09_synth_portfolio_update_letter.txt

Statement text, verbatim:
```
Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and commercial priorities identified at IC.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 09_synth_portfolio_update_letter: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 09_synth_portfolio_update_letter: partially_confirmed

ON-arm unsupportedSpan:
- 09_synth_portfolio_update_letter:
```
commercial priorities identified at IC
```

Stage 2 matched passage, per pair:
### 09_synth_portfolio_update_letter

OFF passage:
```
Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team.
```
Surrounding sentence from the source file:
```
The CEO transition has gone better than expected. Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team. Andreas Schiller has integrated comfortably into his board role and continues to provide useful customer-facing support.
```

ON passage:
```
Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team.
```
Surrounding sentence from the source file:
```
The CEO transition has gone better than expected. Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team. Andreas Schiller has integrated comfortably into his board role and continues to provide useful customer-facing support.
```

## 11. F12 statement 0

Change class: supported_full to non-full

Fixture id and statement index:
F12, statement 0

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_linkedin_post
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 12_synth_linkedin_post.txt

Statement text, verbatim:
```
After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 12_synth_linkedin_post: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 12_synth_linkedin_post: partially_confirmed

ON-arm unsupportedSpan:
- 12_synth_linkedin_post:
```
After more than four years of partnership
```

Stage 2 matched passage, per pair:
### 12_synth_linkedin_post

OFF passage:
```
After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
```
Surrounding sentence from the source file:
```
After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week. NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and one of those quiet category leaders that the Nordic region produces so well.
```

ON passage:
```
After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
```
Surrounding sentence from the source file:
```
After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week. NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and one of those quiet category leaders that the Nordic region produces so well.
```

## 12. F12 statement 2

Change class: supported_full to non-full

Fixture id and statement index:
F12, statement 2

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_linkedin_post
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 12_synth_linkedin_post.txt

Statement text, verbatim:
```
The transformation since has been substantial.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 12_synth_linkedin_post: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 12_synth_linkedin_post: partially_confirmed

ON-arm unsupportedSpan:
- 12_synth_linkedin_post WHOLE:
```
The transformation since has been substantial.
```

Stage 2 matched passage, per pair:
### 12_synth_linkedin_post

OFF passage:
```
Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.
```
Surrounding sentence from the source file:
```
When we acquired NorTech in 2021 it was an excellent company with a clear ceiling — strong in Sweden, under-exposed everywhere else, and held back by a fragmented shareholder structure. Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.

```

ON passage:
```
Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.
```
Surrounding sentence from the source file:
```
When we acquired NorTech in 2021 it was an excellent company with a clear ceiling — strong in Sweden, under-exposed everywhere else, and held back by a fragmented shareholder structure. Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.

```

## 13. F13 statement 8

Change class: supported_full to non-full

Fixture id and statement index:
F13, statement 8

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_internal_inconsistency_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 13_synth_internal_inconsistency_memo.txt

Statement text, verbatim:
```
It has built a clear competitive lead in the European mid-market against entrenched legacy software competitors.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 13_synth_internal_inconsistency_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 13_synth_internal_inconsistency_memo: partially_confirmed

ON-arm unsupportedSpan:
- 13_synth_internal_inconsistency_memo:
```
It has built a clear competitive lead in the European mid-market
```

Stage 2 matched passage, per pair:
### 13_synth_internal_inconsistency_memo

OFF passage:
```
CloudPivot is a high-quality vertical SaaS asset with strong unit economics, a defensible competitive position, and a clear growth runway.
```
Surrounding sentence from the source file:
```
CloudPivot is a high-quality vertical SaaS asset with strong unit economics, a defensible competitive position, and a clear growth runway. We have strong conviction in the founders and the team.
```

ON passage:
```
The principal competition is fragmented legacy software (Riege, CargoWise — which is the dominant player in larger forwarders — and a long tail of regional incumbents). Most legacy products are visibly aged and customer satisfaction is consistently low.
```
Surrounding sentence from the source file:
```
Large addressable market with limited modern competition. There are approximately 14,000 freight forwarders and customs brokers in Europe. CloudPivot serves 1,200 of these — an 8.6% penetration rate. The principal competition is fragmented legacy software (Riege, CargoWise — which is the dominant player in larger forwarders — and a long tail of regional incumbents). Most legacy products are visibly aged and customer satisfaction is consistently low.

```

## 14. F14 statement 3

Change class: supported_full to non-full

Fixture id and statement index:
F14, statement 3

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_thesis_only_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 14_synth_thesis_only_memo.txt

Statement text, verbatim:
```
Incumbents with serious clinical software have built up meaningful regulatory clearances, creating real barriers to entry.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 14_synth_thesis_only_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 14_synth_thesis_only_memo: partially_confirmed

ON-arm unsupportedSpan:
- 14_synth_thesis_only_memo:
```
have built up meaningful regulatory clearances, creating real barriers to entry
```

Stage 2 matched passage, per pair:
### 14_synth_thesis_only_memo

OFF passage:
```
Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.
```
Surrounding sentence from the source file:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority. Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years. Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.

```

ON passage:
```
Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.
```
Surrounding sentence from the source file:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority. Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years. Medical Device Regulation has created higher barriers to entry for serious clinical software, advantaging incumbents who have invested in the regulatory pathway.

```

## 15. F14 statement 7

Change class: supported_full to non-full

Fixture id and statement index:
F14, statement 7

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_thesis_only_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 14_synth_thesis_only_memo.txt

Statement text, verbatim:
```
At the same time, generative AI is exposing incumbents that lack credible AI strategies to renewed competitive risk from challengers — and from each other.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 14_synth_thesis_only_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 14_synth_thesis_only_memo: partially_confirmed

ON-arm unsupportedSpan:
- 14_synth_thesis_only_memo:
```
to renewed competitive risk from challengers — and from each other
```

Stage 2 matched passage, per pair:
### 14_synth_thesis_only_memo

OFF passage:
```
Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.
```
Surrounding sentence from the source file:
```
We believe the European market is at an inflection point. Three forces are aligning. First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances. Second, payer willingness to reimburse CDS software has improved markedly. Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.

```

ON passage:
```
Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.
```
Surrounding sentence from the source file:
```
We believe the European market is at an inflection point. Three forces are aligning. First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances. Second, payer willingness to reimburse CDS software has improved markedly. Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.

```

## 16. F14 statement 8

Change class: supported_full to non-full

Fixture id and statement index:
F14, statement 8

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_thesis_only_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 14_synth_thesis_only_memo.txt

Statement text, verbatim:
```
The European market is structurally distinct from the US in ways that favour a thoughtful financial sponsor.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 14_synth_thesis_only_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 14_synth_thesis_only_memo: partially_confirmed

ON-arm unsupportedSpan:
- 14_synth_thesis_only_memo:
```
in ways that favour a thoughtful financial sponsor
```

Stage 2 matched passage, per pair:
### 14_synth_thesis_only_memo

OFF passage:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority.
```
Surrounding sentence from the source file:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority. Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
```

ON passage:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority.
```
Surrounding sentence from the source file:
```
The European CDS market is structurally distinct from the US market in several ways. European healthcare is dominated by national payers, which gives CDS products a clearer route to scale once adopted by a national authority. Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
```

## 17. F15 statement 9

Change class: supported_full to non-full

Fixture id and statement index:
F15, statement 9

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_very_long_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 15_synth_very_long_memo.txt

Statement text, verbatim:
```
Continued own-brand penetration uplift — own-brand share has grown from 38% in 2020 to 54% in 2025, with continued runway to 70% contributing material gross margin expansion.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 15_synth_very_long_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 15_synth_very_long_memo: partially_confirmed

ON-arm unsupportedSpan:
- 15_synth_very_long_memo:
```
with continued runway to 70% contributing material gross margin expansion
```

Stage 2 matched passage, per pair:
### 15_synth_very_long_memo

OFF passage:
```
The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio. Each percentage point of own-brand penetration uplift is worth approximately EUR 4 million in gross margin. We see a credible path to 70% own-brand penetration over a five-year hold, contributing approximately 250 basis points of gross margin expansion.
```
Surrounding sentence from the source file:
```
Fourth, there is meaningful product-side opportunity. The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio. Each percentage point of own-brand penetration uplift is worth approximately EUR 4 million in gross margin. We see a credible path to 70% own-brand penetration over a five-year hold, contributing approximately 250 basis points of gross margin expansion.

```

ON passage:
```
The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio. Each percentage point of own-brand penetration uplift is worth approximately EUR 4 million in gross margin.
```
Surrounding sentence from the source file:
```
Fourth, there is meaningful product-side opportunity. The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio. Each percentage point of own-brand penetration uplift is worth approximately EUR 4 million in gross margin. We see a credible path to 70% own-brand penetration over a five-year hold, contributing approximately 250 basis points of gross margin expansion.
```

## 18. F15 statement 11

Change class: supported_full to non-full

Fixture id and statement index:
F15, statement 11

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_very_long_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 15_synth_very_long_memo.txt

Statement text, verbatim:
```
The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 15_synth_very_long_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 15_synth_very_long_memo: partially_confirmed

ON-arm unsupportedSpan:
- 15_synth_very_long_memo:
```
and represents a fifth value driver alongside the four pillars above
```

Stage 2 matched passage, per pair:
### 15_synth_very_long_memo

OFF passage:
```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.
```
Surrounding sentence from the source file:
```
The retail network is organised under three brand banners. Casa Verde itself accounts for 142 of the stores and approximately 78% of revenue, focused on the premium end of the everyday homeware market — ceramics, glassware, kitchen tools, table linens, and decorative objects. The Bellucci banner, acquired by Casa Verde in 2018, operates 24 stores at a higher price point with a stronger fashion-led aesthetic. The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

```

ON passage:
```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.
```
Surrounding sentence from the source file:
```
The retail network is organised under three brand banners. Casa Verde itself accounts for 142 of the stores and approximately 78% of revenue, focused on the premium end of the everyday homeware market — ceramics, glassware, kitchen tools, table linens, and decorative objects. The Bellucci banner, acquired by Casa Verde in 2018, operates 24 stores at a higher price point with a stronger fashion-led aesthetic. The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

```

## 19. F15 statement 25

Change class: supported_full to non-full

Fixture id and statement index:
F15, statement 25

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_very_long_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 15_synth_very_long_memo.txt

Statement text, verbatim:
```
The model has been stress-tested for modest lease renegotiation.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 15_synth_very_long_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 15_synth_very_long_memo: partially_confirmed

ON-arm unsupportedSpan:
- 15_synth_very_long_memo:
```
for modest lease renegotiation
```

Stage 2 matched passage, per pair:
### 15_synth_very_long_memo

OFF passage:
```
We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest.
```
Surrounding sentence from the source file:
```
Real estate exposure. The Company leases 167 of its 184 store locations (the remainder are owned). Lease commitments are EUR 38 million annually with a weighted average remaining term of 7.2 years. Most leases include break clauses at the five-year mark. We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest. We have not stress-tested for a more severe scenario but flag it as a watch item.
```

ON passage:
```
We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest.
```
Surrounding sentence from the source file:
```
Real estate exposure. The Company leases 167 of its 184 store locations (the remainder are owned). Lease commitments are EUR 38 million annually with a weighted average remaining term of 7.2 years. Most leases include break clauses at the five-year mark. We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest. We have not stress-tested for a more severe scenario but flag it as a watch item.
```

## 20. F15 statement 27

Change class: supported_full to non-full

Fixture id and statement index:
F15, statement 27

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_very_long_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 15_synth_very_long_memo.txt

Statement text, verbatim:
```
Underlying relationships are stable but the dependency is noted.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 15_synth_very_long_memo: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 15_synth_very_long_memo: partially_confirmed

ON-arm unsupportedSpan:
- 15_synth_very_long_memo:
```
Underlying relationships are stable
```

Stage 2 matched passage, per pair:
### 15_synth_very_long_memo

OFF passage:
```
We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.
```
Surrounding sentence from the source file:
```
Wholesale channel concentration. The wholesale channel — accounting for 14% of revenue — has meaningful customer concentration, with the top five wholesale accounts representing 40% of channel revenue. We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.

```

ON passage:
```
The wholesale channel — accounting for 14% of revenue — has meaningful customer concentration, with the top five wholesale accounts representing 40% of channel revenue. We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.
```
Surrounding sentence from the source file:
```
Wholesale channel concentration. The wholesale channel — accounting for 14% of revenue — has meaningful customer concentration, with the top five wholesale accounts representing 40% of channel revenue. We have reviewed each of these relationships in diligence and they are stable, but we note the dependency.

```

## 21. F16 statement 2

Change class: supported_full to non-full

Fixture id and statement index:
F16, statement 2

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_healthcare_consumer
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 16_synth_healthcare_consumer.txt

Statement text, verbatim:
```
The unit economics are exceptional for a brand at this stage.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 16_synth_healthcare_consumer: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 16_synth_healthcare_consumer: partially_confirmed

ON-arm unsupportedSpan:
- 16_synth_healthcare_consumer WHOLE:
```
The unit economics are exceptional for a brand at this stage.
```

Stage 2 matched passage, per pair:
### 16_synth_healthcare_consumer

OFF passage:
```
EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency.
```
Surrounding sentence from the source file:
```
Gross margin is 71.4%, reflecting the premium pricing and direct-to-consumer channel weight. EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency. Customer acquisition cost payback is 5.
```

ON passage:
```
EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency.
```
Surrounding sentence from the source file:
```
Gross margin is 71.4%, reflecting the premium pricing and direct-to-consumer channel weight. EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency. Customer acquisition cost payback is 5.
```

## 22. F16 statement 10

Change class: supported_full to non-full

Fixture id and statement index:
F16, statement 10

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_healthcare_consumer
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 16_synth_healthcare_consumer.txt

Statement text, verbatim:
```
Our investment thesis rests on the structural attractiveness of premium women's health (a EUR-denominated category growing at approximately 14 percent annually), Bloom's defensible product credibility and brand position, and a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 16_synth_healthcare_consumer: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 16_synth_healthcare_consumer: partially_confirmed

ON-arm unsupportedSpan:
- 16_synth_healthcare_consumer:
```
and a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold
```

Stage 2 matched passage, per pair:
### 16_synth_healthcare_consumer

OFF passage:
```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands.
```
Surrounding sentence from the source file:
```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.
```

ON passage:
```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands.
```
Surrounding sentence from the source file:
```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.
```

## 23. F19 statement 4

Change class: supported_full to non-full

Fixture id and statement index:
F19, statement 4

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_annual_report
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 19_synth_annual_report.pdf

Statement text, verbatim:
```
Helvetia Precision Components, acquired in June 2025, is six months into the hold and tracking modestly ahead of underwriting; the recently-acquired Lumen Specialty Chemicals is on track with its 100-day plan; Brightway Industrial Coatings has had a strong 2025 with revenue and EBITDA growing 14 percent and 21 percent respectively; Eltex Power Systems has performed exceptionally, with revenue growing 23 percent and EBITDA growing 31 percent year-on-year supported by an order backlog that has grown from EUR 285 million at acquisition to EUR 480 million today.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- 19_synth_annual_report: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 19_synth_annual_report: partially_confirmed

ON-arm unsupportedSpan:
- 19_synth_annual_report:
```
supported by an order backlog that has grown from EUR 285 million at acquisition to EUR 480 million today
```

Stage 2 matched passage, per pair:
### 19_synth_annual_report

OFF passage:
```
Eltex Power Systems has performed strongly, benefiting from substantial increases in European power infrastructure investment. Revenue grew 23% year-on-year and EBITDA grew 31%. The order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```

```

## 24. F23 statement 0

Change class: supported_full to non-full

Fixture id and statement index:
F23, statement 0

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
Fixture file label: crf_multisource
PLANTED FAULT at this statement: not recorded
Fixture file notes field: R7 Stage-2 diagnostic: multi-source CRF pair (confirm+conflict, cross-source multi-passage, en-dash offset stress, noise trap).

Statement text, verbatim:
```
The fund holds a majority stake in a renewable-energy generation platform.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- CRF_IC_memo: confirmed
- CRF_diligence_update: no_support

ON arm:
Card verdict: conflicting
Per-pair classification:
- CRF_IC_memo: conflicting
- CRF_diligence_update: no_support

ON-arm unsupportedSpan:
- CRF_IC_memo WHOLE:
```
The fund holds a majority stake in a renewable-energy generation platform.
```
- CRF_diligence_update: (none)

Stage 2 matched passage, per pair:
### CRF_IC_memo

OFF passage:
```
We recommend an investment of EUR 200 million for a 70% stake in the holding company of a renewable-energy generation platform (the Platform).
```
Surrounding sentence from the source file:
```
Recommendation: We recommend an investment of EUR 200 million for a 70% stake in the holding company of a renewable-energy generation platform (the Platform).

```

ON passage:
```
We recommend an investment of EUR 200 million for a 70% stake in the holding company of a renewable-energy generation platform (the Platform).
```
Surrounding sentence from the source file:
```
Recommendation: We recommend an investment of EUR 200 million for a 70% stake in the holding company of a renewable-energy generation platform (the Platform).

```

### CRF_diligence_update

OFF passage:
```
Confirmatory Diligence Update — Project Cascade

Capacity: Independent technical diligence confirmed installed capacity of 1.4 GW as of April 2025, not 1.2 GW as recorded in the initial memo, following completion of a solar phase during the diligence period.
```
Surrounding sentence from the source file:
```
Confirmatory Diligence Update — Project Cascade

Capacity: Independent technical diligence confirmed installed capacity of 1.4 GW as of April 2025, not 1.2 GW as recorded in the initial memo, following completion of a solar phase during the diligence period.

```

ON passage:
```
Confirmatory Diligence Update — Project Cascade

Capacity: Independent technical diligence confirmed installed capacity of 1.4 GW as of April 2025, not 1.2 GW as recorded in the initial memo, following completion of a solar phase during the diligence period.
```
Surrounding sentence from the source file:
```
Confirmatory Diligence Update — Project Cascade

Capacity: Independent technical diligence confirmed installed capacity of 1.4 GW as of April 2025, not 1.2 GW as recorded in the initial memo, following completion of a solar phase during the diligence period.

```

## 25. F23 statement 1

Change class: supported_full to non-full

Fixture id and statement index:
F23, statement 1

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
Fixture file label: crf_multisource
PLANTED FAULT at this statement: not recorded
Fixture file notes field: R7 Stage-2 diagnostic: multi-source CRF pair (confirm+conflict, cross-source multi-passage, en-dash offset stress, noise trap).

Statement text, verbatim:
```
The platform benefits from long-term contracted cash flows and meaningful geographic diversification.
```

OFF arm:
Card verdict: supported_full
Per-pair classification:
- CRF_IC_memo: confirmed
- CRF_diligence_update: confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- CRF_IC_memo: partially_confirmed
- CRF_diligence_update: partially_confirmed

ON-arm unsupportedSpan:
- CRF_IC_memo:
```
and meaningful geographic diversification
```
- CRF_diligence_update:
```
long-term
```

Stage 2 matched passage, per pair:
### CRF_IC_memo

OFF passage:
```
Revenue: The Platform generates contracted revenue of EUR 44 million per annum, up from EUR 34 million two years ago, underpinned by long-term power purchase agreements.

Contract profile: Approximately 85% of revenue is secured under power purchase agreements with a weighted-average remaining tenor of eleven years.
```
Surrounding sentence from the source file:
```
Revenue: The Platform generates contracted revenue of EUR 44 million per annum, up from EUR 34 million two years ago, underpinned by long-term power purchase agreements.

Contract profile: Approximately 85% of revenue is secured under power purchase agreements with a weighted-average remaining tenor of eleven years.

```

ON passage:
```
The Platform generates contracted revenue of EUR 44 million per annum, up from EUR 34 million two years ago, underpinned by long-term power purchase agreements. Contract profile: Approximately 85% of revenue is secured under power purchase agreements with a weighted-average remaining tenor of eleven years.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### CRF_diligence_update

OFF passage:
```
Geographic profile: The Platform's assets are distributed across four grid jurisdictions, providing meaningful diversification of merchant and regulatory exposure.

Contract quality: Diligence confirmed that the power purchase agreement counterparties are predominantly investment-grade utilities, supporting the durability of contracted cash flows.
```
Surrounding sentence from the source file:
```
Geographic profile: The Platform's assets are distributed across four grid jurisdictions, providing meaningful diversification of merchant and regulatory exposure.

Contract quality: Diligence confirmed that the power purchase agreement counterparties are predominantly investment-grade utilities, supporting the durability of contracted cash flows.

```

ON passage:
```
Geographic profile: The Platform's assets are distributed across four grid jurisdictions, providing meaningful diversification of merchant and regulatory exposure. Contract quality: Diligence confirmed that the power purchase agreement counterparties are predominantly investment-grade utilities, supporting the durability of contracted cash flows.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

## 26. F15 statement 32

Change class: non-full to supported_full

Fixture id and statement index:
F15, statement 32

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_very_long_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 15_synth_very_long_memo.txt

Statement text, verbatim:
```
We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses.
```

OFF arm:
Card verdict: not_supported
Per-pair classification:
- 15_synth_very_long_memo: no_support

ON arm:
Card verdict: supported_full
Per-pair classification:
- 15_synth_very_long_memo: confirmed

ON-arm unsupportedSpan:
- 15_synth_very_long_memo: (none)

Stage 2 matched passage, per pair:
### 15_synth_very_long_memo

OFF passage:
```
The management team is strong. Elena Conti (incoming CEO) is well-known to our team — we have had three independent diligence conversations with her over the past four months and the consistency and depth of her thinking across operating, financial, and strategic dimensions has been impressive.…
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
The management team is strong. Elena Conti (incoming CEO) is well-known to our team — we have had three independent diligence conversations with her over the past four months and the consistency and depth of her thinking across operating, financial, and strategic dimensions has been impressive.
```
Surrounding sentence from the source file:
```
The management team is strong. Elena Conti (incoming CEO) is well-known to our team — we have had three independent diligence conversations with her over the past four months and the consistency and depth of her thinking across operating, financial, and strategic dimensions has been impressive. Marco Esposito (continuing Chairman) has run the business for 18 years with a steady hand and continues to bring genuine strategic value through customer relationships and industry credibility.
```

## 27. nordholt-dirty statement 2

Change class: non-full to different non-full

Fixture id and statement index:
nordholt-dirty, statement 2

Fixture provenance:
not recorded
scripts/diagnostic/README.md does not list this fixture in the real-published table, and the fixture label is not a synth_ prefix.
PLANTED FAULT at this statement: not recorded

Statement text, verbatim:
```
Following our acquisition of Baltic ColdCo, combined revenue has surged to $155m, of which virtually all is locked in under long-term contracts.
```

OFF arm:
Card verdict: conflicting
Per-pair classification:
- IC memo: no_support
- press release: conflicting
- fact sheet: conflicting
- LP update: partially_confirmed

ON arm:
Card verdict: supported_partial
Per-pair classification:
- IC memo: no_support
- press release: partially_confirmed
- fact sheet: partially_confirmed
- LP update: partially_confirmed

ON-arm unsupportedSpan:
- IC memo: (none)
- press release:
```
of which virtually all is locked in under long-term contracts
```
- fact sheet:
```
of which virtually all is locked in under long-term contracts
```
- LP update:
```
virtually all is locked in under long-term contracts
```

Stage 2 matched passage, per pair:
### IC memo

OFF passage:
```
Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### press release

OFF passage:
```
Combined annual revenue for the enlarged group stands at approximately EUR 155 million.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Combined annual revenue for the enlarged group stands at approximately EUR 155 million.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

### fact sheet

OFF passage:
```
Combined annual revenue: EUR 155 million
```
Surrounding sentence from the source file:
```
Combined annual revenue: EUR 155 million
Net IRR to date (Ashford Fund IV): 14 per cent
```

ON passage:
```
Combined annual revenue: EUR 155 million
```
Surrounding sentence from the source file:
```
Combined annual revenue: EUR 155 million
Net IRR to date (Ashford Fund IV): 14 per cent
```

### LP update

OFF passage:
```
Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

## 28. F08 statement 2

Change class: non-full to different non-full

Fixture id and statement index:
F08, statement 2

Fixture provenance:
INVENTED
scripts/diagnostic/README.md: "Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes)."
Fixture file label: synth_industrial_buyout_memo
PLANTED FAULT at this statement: not recorded
Fixture file notes field: Source: 08_synth_industrial_buyout_memo.txt

Statement text, verbatim:
```
We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.
```

OFF arm:
Card verdict: conflicting
Per-pair classification:
- 08_synth_industrial_buyout_memo: conflicting

ON arm:
Card verdict: supported_partial
Per-pair classification:
- 08_synth_industrial_buyout_memo: partially_confirmed

ON-arm unsupportedSpan:
- 08_synth_industrial_buyout_memo:
```
We have invested EUR 480 million of equity
```

Stage 2 matched passage, per pair:
### 08_synth_industrial_buyout_memo

OFF passage:
```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ... Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
```
Surrounding sentence: not added (passage is not an exact substring of the source file).

ON passage:
```
Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
```
Surrounding sentence from the source file:
```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets. The transaction values HPC at an enterprise value of EUR 1.15 billion, representing 11.2x trailing twelve months EBITDA of EUR 103 million. Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management. The seller is being advised by Lincoln International.
```

## Part 2. Three questions

### a. Is nordholt-clean the no-planted-fault control arm of a clean/dirty pair?

scripts/diagnostic/README.md does not say that.

Quoted from scripts/diagnostic/README.md layout table:

```
`b67-probe/` | Planted Nordholt-dirty ARR probe: IC memo `conflicting` is correct (B67, preserve); press/fact-sheet `conflicting` on EUR 155m revenue is B60
```

Quoted from scripts/diagnostic/README.md, Real vs invented sources:

```
Three sources are real published documents. Keep them verbatim. Do not edit them to plant a test case. A real document with an invented fault in it is no longer either thing.
```

The nordholt-clean draft file (`~/Downloads/draft_hold_update_clean.txt`) has no provenance label and no planted-fault note.

scripts/diagnostic/claim-spans/README.md (not the INPUT README, quoted because it names the pair) says:

```
1. Nordholt expanded CLEAN (`~/Downloads/draft_hold_update_clean.txt` + four sources)
2. Nordholt expanded DIRTY (`~/Downloads/draft_hold_update_DIRTY.txt`)
```

Nothing in those records states that nordholt-clean is the no-planted-fault control arm.

### b. Do nordholt-dirty statement 2 and F08 statement 2 carry planted contradictions?

scripts/diagnostic/README.md does not record a planted contradiction at either statement.

nordholt-dirty statement 2: there is no fixture JSON. The draft file has no planted-fault annotation. scripts/diagnostic/README.md's b67-probe line is about ARR (`ARR reached EUR 95 million`), not this statement.

Quoted nordholt-dirty statement 2 from rows.json:
```
Following our acquisition of Baltic ColdCo, combined revenue has surged to $155m, of which virtually all is locked in under long-term contracts.
```

F08 fixture file notes field:
```
Source: 08_synth_industrial_buyout_memo.txt
```

Quoted F08 statement 2 from rows.json:
```
We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.
```

The record does not say that either statement carries a planted contradiction.

### c. Cross-tab of WHOLE-statement span vs strictly shorter span

A card received a WHOLE-statement span if any ON-arm validated unsupportedSpan equals the statement. It received a strictly shorter span if any ON-arm validated unsupportedSpan is a proper substring. Mixed cards are in both overlapping counts. Partition counts are also given.

Main-corpus rows used: 293.
supported_full to non-full flips counted: 25 (expected 25).
Already non-full in the OFF arm: 41.

Of the 25 supported_full to non-full flips:
- received a WHOLE-statement span (overlapping): 4
- received a strictly shorter span (overlapping): 21
- mixed (both): 0
- only WHOLE: 4
- only shorter: 21
- no validated span: 0

Of cards that were already non-full in the OFF arm:
- received a WHOLE-statement span (overlapping): 14
- received a strictly shorter span (overlapping): 22
- mixed (both): 3
- only WHOLE: 11
- only shorter: 19
- no validated span: 8
