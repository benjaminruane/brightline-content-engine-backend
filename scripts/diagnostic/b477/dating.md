# B477. How a source is dated

The function is `extractSourceAsOfDate` in `lib/qc/source-recency.mjs`. It reads only the opening of the document: the first 15 non-empty lines, and, for a date standing on its own, the first 6 non-empty lines when that line is under 40 characters. It accepts a `Date:` or `Dated:` label, an `As of` or `As at` phrase, a dateline, or that short standalone line. It returns the first cue in that order of preference. A date in the body is not used. When nothing in that opening matches, it returns null. It does not return a date it considers uncertain.

`isConfidentlyDated` in `lib/qc/supersession.mjs` is about a match, not a source. It is true when that match's source has a date from `extractSourceAsOfDate`, or when the match carries a period token. The covering set then drops any match whose source has no as-of date. So a date this stage will sort on is a date `extractSourceAsOfDate` returned, and every such date is one the stage treats as confident. A source with no returned date is not called confident.

| Fixture | Source | Label | Date | Cue | Stage confidence |
| --- | --- | --- | --- | --- | --- |
| 01 | 0 | 01_bvp_shopify_memo | October 12, 2010 | Date: label | confident |
| 02 | 0 | 02_pg_atnorth_exit | 27 February 2026 | location; date header | confident |
| 03 | 0 | 03_pg_gestcompost_investment | 3 April 2025 | location; date header | confident |
| 04 | 0 | 04_synth_vc_pinterest_style_memo | 14 May 2011 | Date: label | confident |
| 05 | 0 | 05_synth_competitor_press_release | 6 November 2025 | dateline (city - date) | confident |
| 06 | 0 | 06_synth_listed_pe_report_excerpt | none |  | no date, not confident |
| 07 | 0 | 07_synth_vc_thesis_post | none |  | no date, not confident |
| 08 | 0 | 08_synth_industrial_buyout_memo | 14 March 2025 | Date: label | confident |
| 09 | 0 | 09_synth_portfolio_update_letter | 12 December 2025 | Date: label | confident |
| 10 | 0 | 10_synth_public_press_release | 8 October 2025 | dateline (city - date) | confident |
| 11 | 0 | 11_synth_investor_letter_exit | 22 January 2026 | Date: label | confident |
| 12 | 0 | 12_synth_linkedin_post | none |  | no date, not confident |
| 13 | 0 | 13_synth_internal_inconsistency_memo | 6 November 2025 | Date: label | confident |
| 14 | 0 | 14_synth_thesis_only_memo | 18 September 2025 | Date: label | confident |
| 15 | 0 | 15_synth_very_long_memo | 4 February 2026 | Date: label | confident |
| 16 | 0 | 16_synth_healthcare_consumer | 28 October 2025 | Date: label | confident |
| 17 | 0 | 17_synth_real_estate_logistics | 11 September 2025 | Date: label | confident |
| 18 | 0 | 18a_synth_cross_source_pair_initial | 15 April 2025 | Date: label | confident |
| 18 | 1 | 18b_synth_cross_source_pair_update | 28 May 2025 | Date: label | confident |
| 19 | 0 | 19_synth_annual_report | 31 December 2025 | As of [date] (header) | confident |
| 20 | 0 | 20_synth_fund_close_announcement | 11 December 2025 | Date: label | confident |

Sources: 21. No date: 3. A date the stage does not call confident: 0. The extractor does not return a low-confidence date.

Two sources with the same date do not establish an order. The stage sorts by the date and then requires the earlier date to be strictly earlier before it treats one source as older. An equal date is not older, so nothing is cleared and nothing is called a revision.

A source with a date and a source without one do not establish an order. A match with no as-of date is left out of the covering set, so it cannot be the authority and it cannot be the older source.

Sources whose body contains a date the stage did not use: 9.

- 06:0 06_synth_listed_pe_report_excerpt: March 2022 ("Partners invested in Cirrus in March 2022 through Northstar Partners Fund VI, acquiring a"); 31 December 2025 ("the time of our investment to GBP 312 million for the financial year ended 31 December 2025,"); November 2021 ("and ambient grocery products. Northstar Partners invested in Moreno in November 2021 through"); 31 December 2025 ("ended 31 December 2025 was EUR 218 million, only modestly above the EUR 196 million at the"); 31 December 2025 ("As of 31 December 2025, Northstar Partners Fund VI is fully deployed across 14 portfolio")
- 08:0 08_synth_industrial_buyout_memo: 31 March 2025 ("We have agreed exclusivity through 31 March 2025 and expect to sign definitive documentation by 28 March. Closing is targeted for mid-June, ")
- 09:0 09_synth_portfolio_update_letter: June 2025 ("Period: June 2025 - November 2025"); November 2025 ("Period: June 2025 - November 2025"); June 2026 ("Winterthur footprint review: Site closure is now under formal consultation with the workforce, with a target closure date of June 2026. Appr"); January 2026 ("M&A pipeline: We have advanced two of the five targets identified pre-close. The first - a French specialist in titanium machining - is in s"); June 2026 ("The next major milestones are: completion of the French add-on (Q1 2026), Brno automation phase one going live (Q3 2026), and Winterthur con")
- 10:0 10_synth_public_press_release: June 2025 ("Frankfurt, Germany - 8 October 2025 - Meridian Capital ("Meridian"), the global private markets firm, today announced the successful complet")
- 11:0 11_synth_investor_letter_exit: 19 January 2026 ("on 19 January 2026. This letter sets out the headline outcomes, the value creation journey, and"); May 2021 ("We acquired NorTech in May 2021 in a competitive process led by SEB. The Company is a"); March 2023 ("of SEK 1.8 billion. The most significant was the acquisition of HeatTech GmbH in March 2023 for"); September 2025 ("We launched the exit process in September 2025 with Goldman Sachs as lead advisor. The"); August 2025 ("in August 2025 at hard cap.")
- 13:0 13_synth_internal_inconsistency_memo: October 2025 ("CloudPivot generates annual recurring revenue ("ARR") of EUR 84 million as of October 2025, up from EUR 52 million two years prior - represe"); September 2025 ("The Company has been free cash flow positive since 2023. Cash on balance sheet at September 2025 stood at EUR 18 million with no debt.")
- 15:0 15_synth_very_long_memo: 31 December 2025 ("Total group revenue in the financial year ended 31 December 2025 was EUR 612 million, with EBITDA of EUR 149 million representing a margin o"); January 2026 ("Commercial diligence was conducted by Bain & Company over a ten-week period concluding in early January 2026. The Bain report (circulated se")
- 18:0 18a_synth_cross_source_pair_initial: March 2025 ("The Company employs 142 people, with the majority based at the Stockholm headquarters and smaller offices in Oslo (12 people) and Helsinki (")
- 19:0 19_synth_annual_report: June 2025 ("Investment date: June 2025 Sector: Precision manufacturing Total Fund equity: EUR 480 million"); June 2025 ("Helvetia Precision Components ("HPC") was acquired in June 2025 in a transaction valuing the"); October 2025 ("Investment date: October 2025 Sector: Specialty chemicals Total Fund equity: EUR 340 million"); October 2025 ("Lumen Specialty Chemicals was acquired in October 2025 in a transaction first announced in"); November 2022 ("Investment date: November 2022 Sector: Industrial coatings Total Fund equity: EUR 285 million"); March 2023 ("Investment date: March 2023 Sector: Specialty plastics Total Fund equity: EUR 220 million"); July 2023 ("Investment date: July 2023 Sector: Electrical equipment Total Fund equity: EUR 195 million"); January 2024 ("Investment date: January 2024 Sector: Energy efficiency software and services Total Fund equity:"); April 2024 ("Investment date: April 2024 Sector: Third-party logistics Total Fund equity: EUR 240 million"); September 2024 ("Investment date: September 2024 Sector: Pharmaceutical contract manufacturing Total Fund"); 19 January 2026 ("NorTech Industries AB. The realisation of NorTech Industries closed on 19 January 2026 (post")

Fixture 18 sources dated and ordered: yes.
Earlier: 18a_synth_cross_source_pair_initial, 15 April 2025. Later: 18b_synth_cross_source_pair_update, 28 May 2025.

