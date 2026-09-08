# Judging bake-off v2

Whole-context grader (A) and whole-context fault finder (B) against the 100-statement labelled set. Control is the frozen accuracy pack. Nothing under `scripts/diagnostic/accuracy/` was modified.

Prompts were not iterated (zero times).

## Scoreboard

Decision rule, written before the run. Do not move it.

- WINS: agreement catch at least 7 of 11, AND leave-alone at least 68 of 76, AND locatability at or above 95% with a non-zero quote count, AND at least 5 of the 13 non-Confirmed Group B rows correctly flagged (detection, not exact label).
- LOSES: catch 4 of 11 or fewer, OR leave-alone below 60 of 76, OR locatability below 90% or zero quotes.
- BETWEEN: everything else. Ben decides from the disagreement list.

Pipeline numbers are pass 1 of `scripts/diagnostic/accuracy/score-result.json` unless noted. Variant numbers are `scripts/diagnostic/bakeoff/runs/score-summary.json`.

| Metric | Pipeline | A pass 1 | A pass 2 | B pass 1 | B pass 2 |
| --- | --- | --- | --- | --- | --- |
| Decision | control | **LOSES** | **LOSES** | **BETWEEN** | **LOSES** |
| Group A agreement | 3 of 11 (Wilson 9.7% to 56.6%) | 7 of 11 (35.4% to 84.8%) | 8 of 11 (43.4% to 90.3%) | 8 of 11 (43.4% to 90.3%) | 7 of 11 (35.4% to 84.8%) |
| Group A detection | 4 of 11 | 8 of 11 (43.4% to 90.3%) | 9 of 11 (52.3% to 94.9%) | 9 of 11 (52.3% to 94.9%) | 8 of 11 (43.4% to 90.3%) |
| Group B agreement | 75 of 89 (75.3% to 90.4%) | 76 of 89 (76.6% to 91.3%) | 75 of 89 (75.3% to 90.4%) | 65 of 89 (63.0% to 81.2%) | 61 of 89 (58.3% to 77.2%) |
| Group B detection | 12 of 89 | 4 of 89 (1.8% to 11.0%) | 3 of 89 (1.2% to 9.4%) | 16 of 89 (11.4% to 27.2%) | 22 of 89 (16.9% to 34.6%) |
| Leave-alone (Ben-Confirmed) | 70 of 76 (83.8% to 96.3%) | 74 of 76 (90.9% to 99.3%) | 74 of 76 (90.9% to 99.3%) | 63 of 76 (72.9% to 89.7%) | 58 of 76 (65.6% to 84.5%) |
| Coverage flagged of 100 | 16 | 12 | 12 | 25 | 30 |
| Coverage graded of 100 | 100 | 100 | 100 | 25 findings joined; silence maps to confirmed | 30 findings joined; silence maps to confirmed |
| Group B non-C flagged of 13 | 6 detected; 5 labelled correctly | 2 | 1 | 3 | 4 |
| Stability | 97 of 100 | 98 of 100 | (same pair) | 90 of 100 | (same pair) |
| Locatability | not measured here | 207 of 264 (78.4%) FAIL | 218 of 265 (82.3%) FAIL | 62 of 66 (93.9%) FAIL for WIN | 64 of 70 (91.4%) FAIL for WIN |
| F13 employs 320 | miss (architecture) | conflicting, noticed 285 | conflicting, noticed 285 | conflicting | conflicting |
| F18 ARR from 38 | miss (architecture) | confirmed (ACW) | conflicting, quoted 35m | conflicting | silent |
| Cost USD | n/a | 0.3342 | 0.2783 | 0.1916 | 0.1474 |
| Wall clock | 254 s / 250 s | 185218 ms | 146865 ms | 81006 ms | 73976 ms |

**Verdict.** Neither variant WINS. A LOSES both passes on locatability (78.4% and 82.3%, both below 90%). B pass 1 is BETWEEN. B pass 2 LOSES on leave-alone (58 of 76, below 60).

A would also have failed the WIN clause on the 13 even if locatability had passed: it flagged only 2 and 1 of those 13.

## Asymmetry

The Stage 2 prompt has been tuned for months. These two prompts are first drafts. A challenger WIN would have been strong evidence. A challenger LOSS is weak evidence. This run is a LOSS / BETWEEN, not a WIN. Do not read that as "keep Stage 2, the architecture is fine." F13 says the opposite for that row.

## What I actually think

v2 is not malformed on the five accepted Part 0 objections. Detection is scored separately from agreement. Variant A was required to emit a per-source breakdown, and it did. Silence maps to confirmed and is quarantined by coverage, partials-ignored, and the WIN clause. Locatability uses `locatePassageInSource` and fails on zero quotes.

Residual protocol defects, none of which I used to move the decision rule:

1. Variant A was given the full `statements.json` freeze (261 sentences), not only the 100 labelled rows. Scoring still uses the 100. That matches how the pipeline was scored (261 cards, 100 labelled). CONFIRMED: `load-context.mjs` loads `flattenStatements(statements.json)`; `labels.json` has 100 rows; 161 sentences exist only in `statements.json`.
2. Coverage in the scorer is "flagged non-confirmed," not "received a grade." A graded all 100 labelled rows. The table above reports both.
3. Containment join can spray a long quote onto several statements. `multiJoinCount` was 0 on both B passes. CONFIRMED: `scripts/diagnostic/bakeoff/runs/score-summary.json` via `map-variant-b.mjs`.
4. A's locatability is dominated by confirmed paraphrases. Restricting quotes to the 100 labelled rows does not save it (82 of 104 and 86 of 106). CONFIRMED by a post-hoc slice of the same run files. So A's LOSS is not an artefact of grading the extra 161 sentences.
5. B never set `betweenDraftSentences: true`. Either it found no intra-draft contradictions, or it ignored the field. Off-list count is 43 and 40. Almost all of those quotes are unlabelled sentences from the same drafts. That is capability the 100 cannot score, which is what item 8 asked for.

Bottom line: the pipeline's 3 of 11 is not "the model cannot see these facts." Both variants catch F13. Pass 1 of B and pass 2 of A also catch F18. The remaining Group A misses are mixed (vocabulary on F05 Halden, silence, and A1 replaying any-confirmed-wins on F18). Do not replace Stage 2 with these prompts. Do treat one-passage / any-confirmed-wins as the cause of F13.

## Held fixed

- Frozen statement list from `scripts/diagnostic/accuracy/statements.json`. Neither variant re-split. `labels.json` was never in a prompt. CONFIRMED: `load-context.mjs` `buildVariantAUser` / `buildVariantBUser`.
- Model `gpt-4o-2024-08-06`, temperature 0, seed 1, cache off (`QC_LLM_CACHE=0`). CONFIRMED: run JSON headers.
- Two cache-off passes each. Groups never averaged.
- Estimate before the run: USD 1.416 for four runs (`variant-a-pass-1.json` `estimate.fourRuns`). Ceiling USD 15. Actual four-run total USD 0.9515. Did not stop.

## Variant A, per pass

### A pass 1 (`runs/variant-a-pass-1.json`)

1. Group A catch (agreement) 7 of 11 (Wilson 35.4% to 84.8%). Detection 8 of 11 (43.4% to 90.3%). Pipeline 3 of 11 and 4 of 11.
2. Group B agreement 76 of 89. Leave-alone 74 of 76. Pipeline 75 of 89 and 70 of 76.
3. Coverage flagged 12 of 100. Graded 100 of 100.
4. Partials ignored: 11 of 13 Group B non-Confirmed rows stayed confirmed. Flagged 2. Pipeline labelled 5 of 13 correctly.
5. Stability vs pass 2: 98 of 100. Moved: F14 "We will provide further detail..." `no_support` to `confirmed`; F18 ARR-from-38 `confirmed` to `conflicting`.
6. Locatability FAIL: 207 of 264 quotes located (78.4%). Non-zero quotes, so not a vacuous 100%. Below 90%, so LOSES.
7. Cost USD 0.3342. Wall clock 185218 ms.
8. Off-list: not applicable (A grades the list).
9. Diagnostic rows: see below.

### A pass 2 (`runs/variant-a-pass-2.json`)

1. Group A catch 8 of 11 (43.4% to 90.3%). Detection 9 of 11 (52.3% to 94.9%).
2. Group B agreement 75 of 89. Leave-alone 74 of 76.
3. Coverage flagged 12 of 100.
4. Partials ignored: 12 of 13. Flagged 1.
5. Stability 98 of 100 (same pair as above).
6. Locatability FAIL: 218 of 265 (82.3%). LOSES.
7. Cost USD 0.2783. Wall clock 146865 ms.

Group A A1 disagreements (agreement): F05 Halden space-applications mapped `no_support` (detected, wrong vocabulary); F13 EBITDA 11.1% mapped `confirmed`; F18 completion-of-transaction mapped `confirmed`; F18 ARR-from-38 mapped `confirmed`. CONFIRMED: `score-summary.json` `groupADisagreementsA1`.

## Variant B, per pass

Join: NFC, collapsed whitespace, either string contains the other. Mapping frozen: contrary_fact -> conflicting; else outruns_source -> partially_confirmed; else not_addressed -> no_support. "Does not support" without a contrary fact never maps to conflicting. Several findings: most serious wins. Silence -> confirmed.

### B pass 1 (`runs/variant-b-pass-1.json`)

1. Group A catch 8 of 11 (43.4% to 90.3%). Detection 9 of 11 (52.3% to 94.9%).
2. Group B agreement 65 of 89. Leave-alone 63 of 76.
3. Coverage: 25 of 100 frozen statements received any finding.
4. Partials ignored: 10 of 13. Flagged 3. Below the WIN floor of 5.
5. Stability vs pass 2: 90 of 100. Ten rows moved (listed in `score-summary.json` `stabilityB.moved`).
6. Locatability: 62 of 66 (93.9%). Quotes non-zero. Below 95% so not WIN. At or above 90% so not LOSE on this clause.
7. Cost USD 0.1916. Wall clock 81006 ms.
8. Off-list: 43 findings. `betweenDraftSentences` true: 0. Full list below.
9. Diagnostic rows: F13 and F18 both conflicting.

BETWEEN because catch 8 of 11, leave-alone 63 of 76 (below 68, at or above 60), locatability 93.9%, flagged 3 of 13.

### B pass 2 (`runs/variant-b-pass-2.json`)

1. Group A catch 7 of 11 (35.4% to 84.8%). Detection 8 of 11 (43.4% to 90.3%).
2. Group B agreement 61 of 89. Leave-alone 58 of 76.
3. Coverage: 30 of 100.
4. Partials ignored: 9 of 13. Flagged 4.
5. Stability 90 of 100.
6. Locatability: 64 of 70 (91.4%). Non-zero. Below 95%, at or above 90%.
7. Cost USD 0.1474. Wall clock 73976 ms.
8. Off-list: 40 findings. `betweenDraftSentences` true: 0.
9. F13 conflicting. F18 silent (maps to confirmed).

LOSES because leave-alone 58 of 76 is below 60.

B1 Group A: silent on F05 Westhaven-invested and F18 completion-of-transaction. F05 Halden mapped `no_support` (detected, not X). That is F05.5: an invented actor described as absence rather than contradiction. Detection still counts. CONFIRMED: `score-summary.json` `groupARowsB1`.

## The two diagnostic rows

### F13. "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore."

Ben: conflicting. Source states 320 and 285, 4,890 characters apart. Unreachable by one-passage Stage 2.

| Run | Mapped | Detected | What it quoted |
| --- | --- | --- | --- |
| A1 | conflicting | yes | source 0 conflicting: "The total team of 285 people is split approximately as follows..." Only one source on that fixture. CONFIRMED: `score-summary.json` `f13A1perSource`. |
| A2 | conflicting | yes | same 285-people passage. CONFIRMED: `variant-a-pass-2.json` statementIndex 7. |
| B1 | conflicting | yes | contrary_fact, same 285-people passage. CONFIRMED: `variant-b-pass-1.json` F13 findings. |
| B2 | conflicting | yes | same. |

**If either variant catches F13, decomposition was the cause.** Both did, on both passes. A noticed the contrary figure. It did not need a second source. It did not replay any-confirmed-wins on this row. Pipeline miss on F13 is the window, not the model and not the four labels.

### F18. "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million..."

Ben: conflicting. Newer source has cleaned ARR of EUR 35 million.

| Run | Mapped | Detected | What it did |
| --- | --- | --- | --- |
| A1 | confirmed | no | source 0 confirmed on the old "EUR 38 million today" line. source 1 confirmed with an empty passage. That is any-confirmed-wins behaviour, visible because the per-source breakdown exists. CONFIRMED: `score-summary.json` `f18A1perSource`. |
| A2 | conflicting | yes | source 0 conflicting (same 38 million line); source 1 conflicting on "The cleaned ARR ... is EUR 35 million." CONFIRMED: `variant-a-pass-2.json` statementIndex 7 on F18. |
| B1 | conflicting | yes | contrary_fact, quoted "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo." CONFIRMED: `variant-b-pass-1.json` F18 finding. |
| B2 | confirmed | no | silent. CONFIRMED: `score-summary.json` `b2.f18`. |

F18 is reachable by whole-context judging and unstable at temp 0 seed 1. Pipeline miss is consistent with any-confirmed-wins plus one passage. It is not a clean "architecture made it impossible" the way F13 is.

## Cost and clock

Estimate (chars/4, gpt-4o-2024-08-06 list prices) USD 1.416 for four runs. Actual USD 0.9515. Ceiling USD 15. CONFIRMED: `variant-a-pass-1.json` `estimate`; `score-summary.json` `totals`.

| Run | USD | ms |
| --- | --- | --- |
| A1 | 0.3342 | 185218 |
| A2 | 0.2783 | 146865 |
| B1 | 0.1916 | 81006 |
| B2 | 0.1474 | 73976 |
| Total | 0.9515 | 487065 |

## Tests

`tests/bakeoff-mapping.test.mjs`, 9 passed:

- containment join, shorter and longer quote
- most-serious-wins
- "does not support" without a contrary fact never maps to X
- silent variant coverage 0 cannot WIN
- zero quoted passages fails locatability (rate 0, not 100%)
- detection and agreement are separate

## Off-list findings, Variant B

These did not contain and were not contained by any of the 100 labelled statements. Most are other sentences from `statements.json` (161 unlabelled sentences exist in that freeze). The labelled set cannot score them. `betweenDraftSentences` true: **0 of 43** on pass 1, **0 of 40** on pass 2.

### B pass 1 (43)

1. F01. outruns_source. "The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today." Problem: draft states customer growth from 5,500 to nearly 10,000, but the source specifies this as an 81% year-over-year increase.
2. F01. outruns_source. "Monthly recurring revenue has grown from USD 164'000 to USD 438'000 over the same period, representing growth of more than 150% year on year." Problem: draft states more than 150%, source specifies 151%.
3. F01. outruns_source. "Shopify's strategic moat is its App Store, which two-thirds of customers actively use." Problem: source says two-thirds utilize at least one app.
4. F01. outruns_source. "Customer acquisition has been almost entirely organic, with paid marketing remaining underdeveloped - paid channels account for 10-15% of sign-ups." Problem: source specifies 65-70% word-of-mouth and 10-15% paid.
5. F01. outruns_source. "The team, led by founder-CEO Mr. Lutke, has demonstrated strong product and management instincts despite Mr. Lutke being a first-time CEO." Problem: source praises instincts without implying a challenge.
6. F02. outruns_source. "Partners Group originally acquired atNorth in 2022. Under its ownership, atNorth has expanded to eight operational data centers across the Nordics, alongside several sites under development." Problem: source does not specify the expansion happened during ownership.
7. F02. outruns_source. "Contracted EBITDA has grown 14-fold over the four-year holding period, delivering compounded annual returns of more than 30% and a 2.5x multiple on invested capital for Partners Group's clients." Problem: source does not specify a four-year holding period.
8. F02. contrary_fact. "Partners Group will reinvest alongside CPP Investments and Equinix and retain up to 10% of the Company going forward." Problem: source says acquire up to 10%, not retain.
9. F02. outruns_source. "Partners Group's Infrastructure business has USD 36 billion in assets under management globally." Problem: source does not specify that USD 36 billion is the Infrastructure business.
10. F03. outruns_source. "Gestcompost was founded in 2003 and operates three organic waste management sites with combined treatment capacity of 1.2 million tons of waste per year." Problem: source does not say whether 1.2 million is current or a target.
11. F03. outruns_source. "This is Partners Group's tenth continuation vehicle investment in the past three years and the firm's second investment in Spain since 2023." Problem: source does not specify the number of Spain investments since 2023.
12. F04. outruns_source. "Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product." Problem: draft omits other qualities in the source.
13. F06. contrary_fact. "Revenue grew to GBP 312 million for the year, up from GBP 187 million at the time of our investment in March 2022 - a compound annual growth rate of approximately 19 percent." Problem: source states 18.6 percent.
14. F06. contrary_fact. "EBITDA margins have been broadly stable at around 14 percent over the holding period." Problem: source specifies 14.2 percent.
15. F06. outruns_source. "The holding period has lengthened from our original underwriting; we now expect a total hold of seven to eight years rather than the originally envisaged five to six years." Problem: source indicates that expectation was already established.
16. F07. outruns_source. "We've made fifteen investments in this category over the past two years and are continuing to invest actively." Problem: source says the broader agent category.
17. F08. contrary_fact. "Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%." Problem: source specifies 17.1%.
18. F08. contrary_fact. "The Schiller family and management retaining the balance." Problem: source specifies 15% family and 7% management.
19. F10. not_addressed. "Meridian Capital today announced the completion of its acquisition of Lumen Specialty Chemicals..." Problem: draft omits first announced in June 2025.
20. F10. not_addressed. "The Company will be led by its existing Chief Executive, Dr. Annika Brandt." Problem: omits in role since 2019.
21. F10. not_addressed. "Meridian intends to support an acceleration of the Company's expansion strategy, with a focus on the Asian electronics market and on selective acquisitions in adjacent specialty chemical categories." Problem: omits that the Asian electronics market is rapidly growing.
22. F10. not_addressed. "Total invested capital from the Meridian platform in the specialty chemicals sector now exceeds EUR 2 billion across the firm's global investments." Problem: omits "global platforms."
23. F11. contrary_fact. "The value creation story is straightforward. International expansion took revenue contribution from outside the Nordic region from 19 percent at entry to 42 percent at exit." Problem: source states 19 percent within the Nordic region.
24. F11. outruns_source. "Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale." Problem: omits combined enterprise value.
25. F11. outruns_source. "The exit process attracted seven preliminary offers, with Brookfield's SEK 18.4 billion bid meaningfully ahead of the next bid at SEK 16.9 billion." Problem: omits that the next bid was from a US-headquartered strategic.
26. F12. contrary_fact. "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week." Problem: source indicates four and a half years.
27. F12. not_addressed. "NorTech today operates across the Nordic region, Germany, France, the UK, and Poland, with international revenue having grown from a fifth of total revenue at entry to more than 40 percent at exit." Problem: source does not provide revenue proportions.
28. F12. not_addressed. "Total revenue grew nearly threefold over the hold period and EBITDA margins moved from 11 to 18 percent." Problem: source does not mention these figures.
29. F12. outruns_source. "Three people deserve particular credit." Problem: source names two individuals.
30. F14. outruns_source. "The regulatory pathway under the EU Medical Device Regulation (MDR) has matured." Problem: source says well-understood.
31. F15. outruns_source. "The Company was founded in 1973 as a single shop in Milan." Problem: omits founder Giovanni Esposito.
32. F15. outruns_source. "The agreed enterprise value reflects a discount of approximately 10-15% to fair competitive value, in line with the family's stated preference for a partner over the highest price." Problem: omits bilateral negotiation over 18 months.
33. F16. outruns_source. "The proposed transaction values Bloom at an enterprise value of EUR 310 million for a 72 percent stake." Problem: source states EUR 310 million as total enterprise value.
34. F16. outruns_source. "The unit economics are exceptional for a brand at this stage." Problem: subjective claim without source support.
35. F16. outruns_source. "Product development cadence is two new product launches per year, supported by in-house formulation capability and contract manufacturing through GMP-certified European facilities." Problem: source does not specify that cadence.
36. F16. outruns_source. "Base case revenue growth from EUR 64 million to approximately EUR 195 million by 2030 generates 2.9x MOIC and 24 percent IRR." Problem: omits CAGR stated in the source.
37. F17. outruns_source. "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression." Problem: source names the three assets and amounts.
38. F17. outruns_source. "Urban last-mile is one of the most structurally supported segments of European commercial real estate." Problem: source gives specific reasons the draft omits.
39. F18. outruns_source. "The Company provides software that automates property management workflows - including rent management, maintenance scheduling, tenant communications, and regulatory reporting - for residential property managers across the Nordic region." Problem: sources do not specify those workflows.
40. F18. outruns_source. "independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness" Problem: source also includes customer support.
41. F19. contrary_fact. "The exit of NorTech Industries - which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR - is the largest realisation in the Fund's history" Problem: source states closed at SEK 12.8 billion.
42. F19. outruns_source. Long Helvetia / Lumen / Brightway / Eltex sentence. Problem: omits issues faced by Helvetia Precision Components.
43. F20. not_addressed. "We expect first capital calls in the second quarter of 2026." Problem: source does not address that timeline.

How many of those 43 identify a contradiction between two draft sentences: **0**.

### B pass 2 (40)

1. F01. outruns_source. Same 5'500-to-10'000 customer sentence. Problem: source specifies +81% Y/Y, not the exact numbers.
2. F01. outruns_source. Same MRR sentence. Problem: source specifies +151% Y/Y.
3. F01. outruns_source. Same App Store sentence. Problem: source says roughly two-thirds utilize at least one app.
4. F01. outruns_source. Same organic-acquisition sentence. Problem: source specifies 65-70% word-of-mouth and 20% referrals.
5. F01. outruns_source. Same Lutke sentence. Problem: draft implies sole founder; source mentions two co-founders.
6. F02. outruns_source. Same atNorth eight-centres sentence.
7. F02. outruns_source. Same 14-fold EBITDA sentence.
8. F02. contrary_fact. Same retain-up-to-10% sentence. Source says acquire, not retain.
9. F03. outruns_source. Gestcompost 1.2 million tons. Problem: draft omits types of waste.
10. F03. outruns_source. Tenth continuation vehicle / second Spain investment.
11. F04. outruns_source. "The Company has no monetization strategy yet." Problem: source expects future native advertising.
12. F06. contrary_fact. Same ~19 percent CAGR vs 18.6 percent.
13. F06. outruns_source. Holding period lengthened. Problem: omits Iberian consumer environment and execution challenges.
14. F07. outruns_source. Fifteen investments in this category.
15. F08. contrary_fact. Same 17% vs 17.1%.
16. F08. outruns_source. "The Schiller family will retain a 15% economic interest. Management will hold the remaining 7%." Problem: source does not specify those percentages.
17. F10. not_addressed. Lumen completion announcement omits June 2025 announcement.
18. F10. not_addressed. Dr. Annika Brandt omits since 2019.
19. F10. not_addressed. Expansion strategy omits operational improvement and international expansion.
20. F10. not_addressed. EUR 2 billion omits global platforms.
21. F11. outruns_source. SEK 12.8 billion realisation sentence. Problem: omits approximately EUR 1.13 billion.
22. F11. not_addressed. "The value creation story is straightforward." Problem: source does not make that claim.
23. F11. outruns_source. Four bolt-ons omit combined EV of SEK 1.8 billion.
24. F11. outruns_source. Seven preliminary offers. Problem: omits four parties progressed to confirmatory diligence.
25. F12. contrary_fact. More than four years vs four and a half years.
26. F12. not_addressed. International revenue from a fifth to more than 40 percent. Source has no such figures.
27. F12. not_addressed. Revenue nearly threefold / EBITDA 11 to 18 percent. Source has no such figures.
28. F15. outruns_source. Founded 1973 in Milan. Omits Giovanni Esposito.
29. F15. contrary_fact. Atelier 73 as a fifth value driver vs source "potential to become a third growth pillar."
30. F15. outruns_source. 10-15% discount omits 18-month bilateral negotiation.
31. F16. outruns_source. EUR 310 million for a 72 percent stake vs total EV.
32. F16. outruns_source. Unit economics exceptional.
33. F16. outruns_source. Two launches per year / in-house formulation. Source does not specify.
34. F16. outruns_source. 2.9x MOIC and 24 percent IRR. Source does not specify those exact figures.
35. F17. outruns_source. Same EUR 38 million capex / three older assets sentence.
36. F17. outruns_source. Same urban last-mile sentence.
37. F18. outruns_source. Same property-management workflows sentence.
38. F19. contrary_fact. NorTech closed at SEK 18.4 billion vs source SEK 12.8 billion.
39. F19. outruns_source. Same Helvetia/Lumen/Brightway/Eltex sentence. Omits Helvetia issues.
40. F20. not_addressed. First capital calls in Q2 2026.

How many of those 40 identify a contradiction between two draft sentences: **0**.

Several off-list contrary_fact rows are real (retain vs acquire, 18.4 vs 12.8, 19 vs 18.6). They are evidence the fault finder will nibble rounding and omitted colour as well as contradictions. That is why leave-alone collapsed on B and why B cannot WIN without a quieter prompt. This report does not iterate that prompt.

## Files

New, as specified, plus two helpers:

- `scripts/diagnostic/bakeoff/run-variant-a.mjs`
- `scripts/diagnostic/bakeoff/run-variant-b.mjs`
- `scripts/diagnostic/bakeoff/prompts/variant-a.md`
- `scripts/diagnostic/bakeoff/prompts/variant-b.md`
- `scripts/diagnostic/bakeoff/map-variant-b.mjs`
- `scripts/diagnostic/bakeoff/score-bakeoff.mjs`
- `scripts/diagnostic/bakeoff/REPORT.md` (this file)
- `scripts/diagnostic/bakeoff/load-context.mjs` (shared loader and price estimate)
- `scripts/diagnostic/bakeoff/dump-score.mjs` (combines the four run files into `runs/score-summary.json`)
- `tests/bakeoff-mapping.test.mjs`
- `.gitignore` ignores `scripts/diagnostic/bakeoff/runs/`

Run artefacts are gitignored. Re-score with `node scripts/diagnostic/bakeoff/dump-score.mjs` or `node scripts/diagnostic/bakeoff/score-bakeoff.mjs --variant a|b --run <file>`.
