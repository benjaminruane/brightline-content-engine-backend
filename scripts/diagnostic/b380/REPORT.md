# B380. A pure-LLM review arm, measured against the pipeline

Read-only on product code. Nothing in `lib/` changed. The arm does not authorise a pipeline change. No winner is declared here. The three numbers for each pass are below. The decision is Ben's.

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  94e32e9  main  164 files  1805 tests` |

`npm test` before the billed passes: 164 files, 1805 tests, all passed. Labels, the freeze, the manifest, and `group-a-design.json` were not rewritten. The prompt file was not edited after the first call.

## The bar

oct-06-b378, the v4 pipeline on this same hundred: catch 9 of 11, Wilson [0.5230, 0.9486]. Leave-alone 65 of 74.

Noise floor, from `scripts/diagnostic/accuracy/README.md`. Catch of 11: a move of one is not readable. Two or more counts away from 9 of 11 is outside that band. Leave-alone: identical cache-off runs moved 67 of 74 against 64 of 74, a swing of 3 counts. A count delta of 3 or fewer against 65 of 74 is inside that band. Four or more is outside it. Group A and Group B are not averaged.

## The prompt

Written once, in `scripts/diagnostic/b380/prompt.md`, and sent as the system message. sha256 `c5891e0f9e267364c5ded8b3e660f2776d6b22c3252335017ac96b81ab00549f` on both passes. It contains no labelled example. It was not iterated against the score.

```
You are a careful editor checking one statement against the sources supplied with it.

Decide whether those sources support the statement. Form is not the test. A faithful paraphrase is confirmed, because the writer is allowed to use their own words when the substance is the same.

Use exactly one of these four verdicts.

confirmed
Every material claim in the statement is supported by the sources. A faithful paraphrase is confirmed. Do not withhold confirmed because the wording differs from the source.

partially_confirmed
Part of the statement is supported and part is not. The unsupported part is a gap. It is not a contradiction of something the sources do say.

conflicting
The sources address the claim and contradict it. A different figure, date, name, direction, or actor, on a point the sources do speak to, is conflicting.

not_supported
The sources never address the claim. Silence is not a contradiction. When the sources do not speak to the point, the verdict is not_supported, not conflicting.

passage
The sentence or sentences from one source that decide the verdict. Copy them exactly from that source, character for character, including punctuation. Do not paraphrase the passage. Do not join words the source does not already have in that stretch. If no source passage decides the verdict, passage is null.

sourceId
The id of the source the passage was copied from, exactly as given in the input. If passage is null, sourceId is null.

reason
One sentence on what the sources do with the statement.

Reply as a JSON object with exactly these keys: verdict, passage, sourceId, reason.
verdict is one of: confirmed, partially_confirmed, conflicting, not_supported.
Do not write anything outside that JSON object.
```

## How the arm was run

One call per statement. Input is the frozen statement plus the full text of every source for that fixture. No Stage 1, no Stage 1b, no per-source pairing, no Stage 3, no Stage 7. Model `STAGE_MODELS["writing-rewrite"]`, which is `gpt-5.1-2025-11-13`. Temperature 0. Seed 1. Local cache off (`QC_LLM_CACHE=0`). Fixtures 01 to 20. Statements from `scripts/diagnostic/accuracy/statements.json` (261). The arm did not read labels or pipeline output.

`displayVerdict` uses the pipeline vocabulary so `scripts/diagnostic/accuracy/score.mjs` runs unchanged: confirmed to supported_full, partially_confirmed to supported_partial, conflicting to conflict, not_supported to not_supported. An unparsed reply would have left `displayVerdict` null. Both passes parsed 261 of 261.

## Scores

Scorer: `scripts/diagnostic/accuracy/score.mjs` against `labels.json` and `sample-manifest.json`. Unmatched labels 0. Unmatched predictions 161, which is the unlabelled remainder of the 261. Escapes 0 on both passes. Group B Ben-Confirmed n is 74 on both passes.

| | Catch | Catch Wilson | Leave-alone | Leave-alone Wilson | Against 9 of 11 | Against 65 of 74 |
|---|---|---|---|---|---|---|
| llm-1 | 3 of 11 (0.2727) | [0.0975, 0.5657] | 62 of 74 (0.8378) | [0.7376, 0.9047] | outside (6 counts) | inside (3 counts) |
| llm-2 | 3 of 11 (0.2727) | [0.0975, 0.5657] | 63 of 74 (0.8514) | [0.7531, 0.9149] | outside (6 counts) | inside (2 counts) |
| oct-06-b378 | 9 of 11 | [0.5230, 0.9486] | 65 of 74 | | the bar | the bar |

Group A on both passes is the same confusion. All 11 labels are conflicting. The arm returned conflict on 3, supported_partial on 5, not_supported on 2, and supported_full on 1. The full disagreement lists are in `runs/llm-1/score.txt` and `runs/llm-2/score.txt`.

Group B agreement, reported separately and not averaged with Group A: 69 of 89 on both passes, rate 0.7753, Wilson [0.6782, 0.8496].

## Stability

Of the 100 labelled statements, 97 received the same mapped verdict on llm-1 and llm-2. 3 moved. 0 were missing a card or a mapped verdict.

The pipeline's stability across billed pairs has been 97, 95, 96, and 94 of 100.

The three movers, llm-1 mapped verdict then llm-2:

- Fixture 09, occurrence 0: partially_confirmed to no_support. "Our base case returns remain intact but the segment will be a moderating factor through 2026."
- Fixture 12, occurrence 0: partially_confirmed to confirmed. "Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness."
- Fixture 12, occurrence 0: conflicting to partially_confirmed. "And the wider NorTech team across Stockholm and the new international footprint, who built something genuinely exceptional."

## Quote fidelity

For every passage the arm returned, exact `indexOf` against the named source, then `locatePassageInSource` (whitespace collapse, curly quotes folded, dashes folded). A passage that matches neither is not found. The helper is the repo's. No new matcher was written. Every named source existed (`claimedSourceMissing` 0).

| Pass | Passages returned | Exact | Normalised only | Not found | No passage at all | Confirmed or conflicting with no passage |
|---|---:|---:|---:|---:|---:|---:|
| llm-1 | 243 | 165 | 33 | 45 | 18 | 0 of 187 |
| llm-2 | 242 | 168 | 30 | 44 | 19 | 0 of 187 |

The no-passage cards are all `not_supported` (18 on llm-1, 19 on llm-2). The arm returned a passage on every confirmed card and every conflicting card.

33 of the 45 llm-1 not-found passages, and 33 of the 44 llm-2 not-found passages, contain `...`. Those strings are not one contiguous stretch of the source. The rest fail the same two checks without that marker.

Every not-found passage is printed below, in full, beside the source it claimed. Characters inside those blocks are the arm's, including punctuation the sources already use.

### llm-1

45 passages.

**llm-1 01 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 01_bvp_shopify_memo.

```
Shopify was founded in 2007 by two Ruby on Rails core developers. One of the co-founders left soon after starting the business. The other, Tobi L�tke, stayed on and is serving as CEO. ... Shopify�s 24 employees are located in Ottawa, Canada.
...
Shopify, a provider of e-commerce software to SMBs.
```

**llm-1 01 index 4 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 01_bvp_shopify_memo.

```
Yet sophisticated features are also available without complicating the overall user experience. Shopify accomplishes this by making available an �App Store�. ... This approach is a big competitive differentiator for Shopify.
...
From a customer�s perspective, they can add a feature by accessing Shopify�s �App Store�. Customer take-up has been impressive, with roughly two-thirds (66%) of customers using at least one third-party app.
```

**llm-1 01 index 5 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 01_bvp_shopify_memo.

```
We are excited by what we see as a great product that has struck a chord with customers. The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours.
...
In many ways, its strength lies in its simplicity, which is ideally suited to small businesses. A non-techie can start taking orders from a professional-looking online store in a few hours after sign-up.
```

**llm-1 01 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 01_bvp_shopify_memo.

```
Despite this, they are able to acquire a customer for between $175�225 and can pay back that spend in 7�9 months on a churn-adjusted basis.
...
We believe that Shopify�s technology solution is better positioned than competitors to provide these solutions to the growing number of �Main Street� retailers who are coming online.
...
Further, we think that there is an enormous opportunity to accelerate growth by investing in: i) marketing, ii) international expansion and product localization and iii) business development to expand the applications available in the Shopify App Store.
```

**llm-1 02 index 6 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 02_pg_atnorth_exit.

```
As a result, Partners Group has committed to reinvest and acquire up to 10% of the Company.
...
We congratulate CPP Investments and Equinix as they partner with the Company and management team. We are excited to reinvest alongside them for the next chapter of growth.
```

**llm-1 04 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
We seek partnership approval for a Series A investment of USD 10mm in Pinterest, Inc., a visual discovery and bookmarking platform, at a USD 40mm pre-money valuation.

Pinterest is a visual discovery tool. Users create themed boards onto which they "pin" images they want to remember, organise, or return to.
```

**llm-1 04 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
What gives us conviction is the depth of user engagement we have observed.

USER BEHAVIOUR

What persuaded us is the user behaviour we have observed in diligence.
```

**llm-1 04 index 4 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
Average sessions per active user per week is approximately 6 — also exceptional.
...
Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
```

**llm-1 04 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
...
We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
...
Second, the user demographic and behavioural profile creates unusual monetisation potential. The combination of high-intent commercial categories (home decor, fashion, weddings) and a desirable demographic (women, 25 to 44) is genuinely scarce.
```

**llm-1 04 index 12 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
Ben Silbermann (co-founder, CEO) is a former Google product manager.
...
References from his time at Google are uniformly positive — he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it.
```

**llm-1 04 index 13 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
Pinterest is a young company. The product has been in market for roughly 16 months. The team is small — six full-time employees plus the two founders.
...
The product has not yet been pressure-tested at meaningful scale. Current monthly active users are approximately 1.5 million, growing rapidly.
```

**llm-1 04 index 20 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years.
...
Third, the founders are exceptional. Our consistent experience is that the team is the principal determinant of outcomes in early-stage consumer investments. We have high conviction in Ben and Evan as builders.
...
Defensibility is uncertain. The visual discovery mechanic is not patented. We see two potential sources of competitive moat: (1) network effects from the collaborative pinning and following dynamics, and (2) the accumulation of organised, categorised content that becomes increasingly valuable as it grows. Whether these prove durable in the face of well-funded competitive responses is uncertain.
```

**llm-1 05 index 2 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 05_synth_competitor_press_release.

```
Norwell, headquartered in Cleveland, Ohio, is a leading manufacturer of structural composite components and titanium machined parts used in commercial aerospace, defense, and space applications.
...
Norwell counts the major commercial aircraft original equipment manufacturers and the leading US defense primes among its long-standing customers.
```

**llm-1 06 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 06_synth_listed_pe_report_excerpt.

```
We have introduced several operational changes during 2025, including the recruitment of a new Chief Commercial Officer and the appointment of a new Chairman with deep Iberian consumer experience. We are also implementing a structured cost reduction programme targeting approximately EUR 5 million of annualised savings. We expect these changes to begin contributing meaningfully in 2026.
...
We continue to view the underlying business as fundamentally sound and well-positioned for recovery as the operational programme takes effect and as the Iberian consumer environment improves.
```

**llm-1 07 index 5 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 07_synth_vc_thesis_post.

```
We expect significant disruption to the incumbent vertical SaaS industry. Incumbents have built defensible positions around workflow ownership, but those workflows are precisely what agents are positioned to replace.

We expect deep changes to the buyer journey and to commercial models.
...
We expect to see strong winner-takes-most dynamics in specific verticals, with the leading agent in each category establishing a sustainable advantage through accumulation of training data, customer trust, and integration depth.
```

**llm-1 08 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company")... Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
...
The Schiller family will retain a 15% economic interest. Management will hold the remaining 7%.
```

**llm-1 08 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
Second, the end markets HPC serves are structurally attractive. The orthopaedic implants market is forecast to grow at 5–6% annually through 2030, driven by ageing demographics in Europe and the United States. Aerospace component demand is recovering strongly post-COVID, with Airbus and Boeing collectively targeting build-rate increases of approximately 40% over the next five years.
...
Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.
```

**llm-1 08 index 15 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We have identified four principal risks.

The semiconductor exposure introduces cyclicality that the medical and aerospace segments do not.
...
Customer concentration is a watch item. HPC's largest customer, a global orthopaedic implants manufacturer, accounted for 18% of revenue in 2024.
...
Foreign exchange exposure is significant.
...
Founder transition risk is moderate.
```

**llm-1 08 index 16 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We are attracted to HPC for four reasons.

First, the Company occupies an enviable competitive position.

Second, the end markets HPC serves are structurally attractive.

Third, there is a clear margin expansion path.

Fourth, we see meaningful M&A opportunity.
```

**llm-1 09 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 09_synth_portfolio_update_letter.

```
Period revenue of EUR 318 million represents growth of 11% versus the prior comparable period. The medical implants segment grew 14%, well ahead of expectations, driven by a 22% increase from our largest orthopaedic customer following their successful US product launch.

EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX (CHF weakened to 1.02 against EUR over the period, against our base case of 0.98).
```

**llm-1 09 index 8 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 09_synth_portfolio_update_letter.

```
We remain confident in our base case returns of 2.4x MOIC and 19% IRR. The early traction on procurement and the strength in medical implants are partial offsets to the semiconductor weakness and the customer quality issue. We do not at this stage see reason to revise our underwriting.

Semiconductor slowdown: We flagged this as a cyclical risk in our underwriting and the early signals are now visible. Two semiconductor capital equipment customers have pushed orders by one to two quarters. We do not expect a deep downturn — the demand picture for EUV remains structurally strong — but we are guiding to flat semiconductor revenue for the next 12 months and have adjusted our full-year forecast accordingly. The full-year 2026 budget assumes semiconductor revenue of EUR 105 million versus our original underwriting of EUR 122 million.
```

**llm-1 09 index 11 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 09_synth_portfolio_update_letter.

```
We have recruited two of the three new senior hires planned in our underwriting. Klaus Wenger joined as Chief Procurement Officer in September, having previously held the same role at Belimo.
...
EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX (CHF weakened to 1.02 against EUR over the period, against our base case of 0.98).
```

**llm-1 11 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 11_synth_investor_letter_exit.

```
At the time of our investment, the Company generated revenue of SEK 4.2 billion and EBITDA of SEK 480 million, representing an EBITDA margin of 11.4%.
...
By the time of exit, international revenue had grown to SEK 4.8
billion, representing 42% of total revenue. Total Company revenue at exit was SEK 11.4 billion.
...
Combined with the modularity
programme, this drove EBITDA margins from 11.4% at entry to 18.2% at exit. Absolute EBITDA
grew from SEK 480 million to SEK 2.08 billion over the hold.
```

**llm-1 13 index 3 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 13_synth_internal_inconsistency_memo.

```
The Company serves over 1,200 freight forwarder and customs broker customers across 28 European countries.

CloudPivot generates annual recurring revenue ("ARR") of EUR 84 million as of October 2025, up from EUR 52 million two years prior — representing 27% CAGR.
```

**llm-1 14 index 1 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 14_synth_thesis_only_memo.

```
Clinical decision support software helps clinicians make better, faster, more consistent treatment decisions at the point of care.
...
We believe the European market is at an inflection point. Three forces are aligning.
```

**llm-1 14 index 4 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 14_synth_thesis_only_memo.

```
Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
...
Second, payer willingness to reimburse CDS software has improved markedly.
```

**llm-1 14 index 8 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 14_synth_thesis_only_memo.

```
The European CDS market is structurally distinct from the US market in several ways.
...
The category has been under-served by private equity to date. Most scaled European CDS businesses are either bootstrapped, owned by clinical professional bodies, or sit inside larger health IT groups. There is meaningful opportunity for a thoughtful financial sponsor to play a constructive consolidation role.
```

**llm-1 15 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 15_synth_very_long_memo.

```
The transaction will be funded with EUR 720 million of equity from Halden Group, EUR 110 million of co-investment from two of our long-standing LP relationships (Singapore and Canadian institutions, both already informally committed), EUR 90 million of management rollover from the Esposito family and senior management, and EUR 480 million of senior debt and EUR 150 million of mezzanine financing.
...
The Esposito family will retain a 10% interest. Management will retain 6%. Halden Group and co-investors will hold 84% in aggregate.
```

**llm-1 15 index 10 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 15_synth_very_long_memo.

```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

...

Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar. The 18 stores operating today generate average four-wall margins of 18%, slightly below the core Casa Verde concept, but the format is younger, less proven, and at much earlier scale. The format's appeal to a clearly differentiated customer cohort (younger, more design-led, more urban) gives the Company a vehicle to capture share in segments where the core Casa Verde brand does not naturally resonate.
```

**llm-1 15 index 11 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 15_synth_very_long_memo.

```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

...

Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar.
```

**llm-1 15 index 30 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 15_synth_very_long_memo.

```
DUE DILIGENCE OBSERVATIONS

Commercial diligence was conducted by Bain & Company over a ten-week period concluding in early January 2026. The Bain report (circulated separately) confirms market positioning, validates the international expansion thesis, and provides detailed competitive mapping.

Financial and tax diligence was conducted by Deloitte. No issues of material consequence.

Legal diligence was conducted by Latham & Watkins.

ESG diligence was conducted by ERM.
```

**llm-1 16 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 16_synth_healthcare_consumer.

```
The Company's clinical advisory board, in-house formulation capability, and disciplined product development cadence (typically two new product launches per year) create meaningful competitive moats.

The product range comprises 24 SKUs, all formulated in-house, manufactured under contract by GMP-certified European facilities, and sold direct-to-consumer through Bloom's own website and Amazon, alongside a select wholesale presence in premium retailers including Selfridges, Le Bon Marché, KaDeWe, and Sephora.
```

**llm-1 16 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 16_synth_healthcare_consumer.

```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.

International expansion runway is significant. Bloom is strong in the UK and increasingly strong in DACH, but underdeveloped in France, Italy, and Spain. The brand has demonstrable cross-border appeal — DACH revenue has grown from zero in 2021 to EUR 18 million in 2024 — and we see clear opportunity to replicate this in the Romance language markets.

We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR. The growth is sourced from continued UK growth (modest, reflecting maturation), continued strong DACH growth, accelerated entry into France and Spain, and selective US market entry in year three.
```

**llm-1 16 index 11 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 16_synth_healthcare_consumer.

```
We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR.
...
The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**llm-1 16 index 12 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 16_synth_healthcare_consumer.

```
Customer acquisition cost inflation in direct-to-consumer is the principal risk. Bloom's current 5.2-month payback period has lengthened from 3.8 months in 2022, reflecting both increased competition and broader paid social media cost inflation.

Brand-driven categories are subject to founder-dependency risk. Sarah Whitmore in particular is closely associated with the brand through content, podcast appearances, and visible founder presence.

Regulatory risk in women's health is real. Several of Bloom's products make claims around hormonal support and pregnancy wellness that are subject to evolving regulatory scrutiny across European markets. The Company has invested appropriately in regulatory affairs and has a clean track record, but the regulatory environment for nutrition claims is becoming more demanding.
```

**llm-1 17 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 17_synth_real_estate_logistics.

```
Our base case underwrites a five-year hold with the following return drivers. Rental growth of approximately 6% annually (a moderation from the recent 8% pace), capture of embedded reversion as approximately 40% of leases roll during the hold period, value-add capex returning a yield-on-cost of approximately 8.5%, and exit at a 5.0% yield reflecting modest yield compression supported by continued strong investor demand for the asset class.
...
We have budgeted EUR 38 million of value-add capital expenditure across the hold period. The principal investments are EUR 14 million in modernising the Park Royal asset (enabling a rent uplift from the current EUR 8 per square foot to an estimated EUR 14 per square foot at next renewal), EUR 8 million in the San Fernando asset, EUR 6 million in the Schiphol asset, and the remainder spread across smaller modernisation works across the Portfolio.
```

**llm-1 18 index 3 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240,000 residential units.
...
UPDATED CUSTOMER COUNT

The Company currently serves 412 property management companies, not 380 as stated in our initial memo.
```

**llm-1 18 index 4 occurrence 0**
verdict conflicting (conflict). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
Annual recurring revenue stands at EUR 38 million as of March 2025, up from EUR 28 million the prior year — representing 36% year-on-year growth.

Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million. Growth on a cleaned basis is 28% year-on-year rather than the 36% previously reported.
```

**llm-1 18 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
Three factors drive our conviction.

First, the product is genuinely market-leading. Independent customer research conducted as part of diligence rated NSH significantly higher than the principal Nordic competitor (Yardi Nordic) on usability, feature completeness, and customer support.

Second, the Nordic property management technology market remains structurally underpenetrated. Approximately 40% of Nordic property management companies still use legacy systems or spreadsheets. NSH has a clear runway to continue penetrating this addressable market.

Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
```

**llm-1 18 index 8 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
The base case generates a 2.8x MOIC and 23% IRR.
...
Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
```

**llm-1 18 index 9 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity.
...
NSH is a high-quality Nordic vertical SaaS asset with strong unit economics, exceptional product strength, and a clear growth runway.
...
Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
...
Bain & Company's customer reference work confirmed the strength of the product and the relationship picture.
```

**llm-1 19 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
This has been an exceptional year for the Fund, characterised by strong portfolio
performance across the substantial majority of our investments, the successful realisation of
NorTech Industries at outstanding economics, and meaningful progress on operational
improvement initiatives at our remaining portfolio companies.
...
The Fund's net IRR as of 31 December 2025 stands at 19.7%, with a net MOIC of 2.13x and net
DPI of 0.94x.
```

**llm-1 19 index 3 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
This has been an exceptional year for the Fund, characterised by strong portfolio
performance across the substantial majority of our investments, the successful realisation of
NorTech Industries at outstanding economics, and meaningful progress on operational
improvement initiatives at our remaining portfolio companies.
...
The Fund is now fully deployed across nine investments, of which one (NorTech)
has been fully realised and the remaining eight continue to be held actively.
...
Continental Plastics has had a more challenging 2025.
...
Drift Logistics had a mixed 2025.
```

**llm-1 19 index 4 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
Helvetia Precision Components ("HPC") was acquired in June 2025 in a transaction valuing the Company at EUR 1.15 billion. HPC manufactures complex precision machined components for the medical devices, aerospace, and semiconductor end markets. Six months post-close, the Company is tracking modestly ahead of our underwriting on both revenue and EBITDA, with strong early traction on procurement programmes and the leadership transition proceeding well.
...
The 100-day plan is on track, with the new financial reporting infrastructure substantially in place and the procurement initiative beginning to deliver early wins.
...
Brightway has had a strong 2025, with revenue growing 14% year-on-year and EBITDA growing 21%.
...
Eltex Power Systems has performed strongly, benefiting from substantial increases in European power infrastructure investment. Revenue grew 23% year-on-year and EBITDA grew 31%. The order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date.
```

**llm-1 19 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
We have introduced operational changes during the year, including the replacement of the Chief Operating Officer and the launch of a structured cost reduction programme targeting EUR 22 million of annualised savings. Early progress on this programme is encouraging.
...
The Company remains a long-term high-quality asset but the realisation timeline has lengthened by approximately 12 months from our original underwriting.
```

### llm-2

44 passages.

**llm-2 01 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 01_bvp_shopify_memo.

```
Shopify was founded in 2007 by two Ruby on Rails core developers. One of the co-founders left soon after starting the business. The other, Tobi L�tke, stayed on and is serving as CEO. ... Shopify�s 24 employees are located in Ottawa, Canada.
...
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs.
```

**llm-2 01 index 4 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 01_bvp_shopify_memo.

```
Yet sophisticated features are also available without complicating the overall user experience. Shopify accomplishes this by making available an �App Store�. A customer can click and install an �App� that extends the functionality of their online store beyond what Shopify provides. To make the �App Store� possible, Shopify exposes an open API that allows third party software developers to integrate into its platform. This approach is a big competitive differentiator for Shopify.
...
From a customer�s perspective, they can add a feature by accessing Shopify�s �App Store�. Customer take-up has been impressive, with roughly two-thirds (66%) of customers using at least one third-party app.
```

**llm-2 01 index 5 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 01_bvp_shopify_memo.

```
We are excited by what we see as a great product that has struck a chord with customers. The product is simple enough so that anyone can set up a fully functioning online store in a matter of hours.
...
Product
Shopify is a SaaS application for setting up and running an online store. In many ways, its strength lies in its simplicity, which is ideally suited to small businesses. A non-techie can start taking orders from a professional-looking online store in a few hours after sign-up.
```

**llm-2 01 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 01_bvp_shopify_memo.

```
We are enthusiastic about the potential for Shopify to disrupt existing solutions with a consumer-like product that has resonated with customers and enabled the company to demonstrate strong organic growth. Further, uptake of the App Store�by both third-party developers and customers�provides differentiation and a path to break away from the pack.
...
Despite this, they are able to acquire a customer for between $175�225 and can pay back that spend in 7�9 months on a churn-adjusted basis.
...
Further, we think that there is an enormous opportunity to accelerate growth by investing in: i) marketing, ii) international expansion and product localization and iii) business development to expand the applications available in the Shopify App Store.
```

**llm-2 02 index 6 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 02_pg_atnorth_exit.

```
As a result, Partners Group has committed to reinvest and acquire up to 10% of the Company.
...
We congratulate CPP Investments and Equinix as they partner with the Company and management team. We are excited to reinvest alongside them for the next chapter of growth.
```

**llm-2 03 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 03_pg_gestcompost_investment.

```
Partners Group will invest over EUR 120 million in the Gestcompost continuation fund via its infrastructure secondaries business
...
Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to acquire a significant minority stake in Gestcompost (or "the Company"), the largest organic waste treatment manager in Spain. Partners Group will invest over EUR 120 million through its infrastructure secondaries business, acting as a cornerstone investor in a continuation fund for Gestcompost that was successfully established and will be managed by current owner Suma Capital.
```

**llm-2 04 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
We seek partnership approval for a Series A investment of USD 10mm in Pinterest, Inc., a visual discovery and bookmarking platform, at a USD 40mm pre-money valuation.

Pinterest is a visual discovery tool. Users create themed boards onto which they "pin" images they want to remember, organise, or return to.
```

**llm-2 04 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
What gives us conviction is the depth of user engagement we have observed.

USER BEHAVIOUR

What persuaded us is the user behaviour we have observed in diligence.
```

**llm-2 04 index 4 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
Average sessions per active user per week is approximately 6 — also exceptional.
...
Repeat visit rate after the first 30 days is 68%, which is at the very high end of social product benchmarks.
```

**llm-2 04 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
The user demographic is unusual. Approximately 82% of active users are women, and the user base is heavily weighted to the 25 to 44 age range — meaningfully older than typical social product demographics. This is a desirable advertising audience.
...
We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.
...
Second, the user demographic and behavioural profile creates unusual monetisation potential. The combination of high-intent commercial categories (home decor, fashion, weddings) and a desirable demographic (women, 25 to 44) is genuinely scarce.
```

**llm-2 04 index 13 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
Pinterest is a young company. The product has been in market for roughly 16 months. The team is small — six full-time employees plus the two founders.
...
The product has not yet been pressure-tested at meaningful scale. Current monthly active users are approximately 1.5 million, growing rapidly.
```

**llm-2 04 index 20 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 04_synth_vc_pinterest_style_memo.

```
First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years.
...
Third, the founders are exceptional. Our consistent experience is that the team is the principal determinant of outcomes in early-stage consumer investments. We have high conviction in Ben and Evan as builders.
...
Defensibility is uncertain. The visual discovery mechanic is not patented. We see two potential sources of competitive moat: (1) network effects from the collaborative pinning and following dynamics, and (2) the accumulation of organised, categorised content that becomes increasingly valuable as it grows. Whether these prove durable in the face of well-funded competitive responses is uncertain.
```

**llm-2 05 index 2 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 05_synth_competitor_press_release.

```
Norwell, headquartered in Cleveland, Ohio, is a leading manufacturer of structural composite components and titanium machined parts used in commercial aerospace, defense, and space applications.
...
Norwell counts the major commercial aircraft original equipment manufacturers and the leading US defense primes among its long-standing customers.
```

**llm-2 06 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 06_synth_listed_pe_report_excerpt.

```
We have introduced several operational changes during 2025, including the recruitment of a new Chief Commercial Officer and the appointment of a new Chairman with deep Iberian consumer experience. We are also implementing a structured cost reduction programme targeting approximately EUR 5 million of annualised savings. We expect these changes to begin contributing meaningfully in 2026.
...
We continue to view the underlying business as fundamentally sound and well-positioned for recovery as the operational programme takes effect and as the Iberian consumer environment improves.
```

**llm-2 07 index 5 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 07_synth_vc_thesis_post.

```
We expect significant disruption to the incumbent vertical SaaS industry. Incumbents have built defensible positions around workflow ownership, but those workflows are precisely what agents are positioned to replace.

We expect deep changes to the buyer journey and to commercial models.
...
We expect to see strong winner-takes-most dynamics in specific verticals, with the leading agent in each category establishing a sustainable advantage through accumulation of training data, customer trust, and integration depth.
```

**llm-2 08 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company")... Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
...
The transaction will be funded with EUR 480 million of equity from Halden Group, EUR 130 million of equity from co-investors (currently anticipated to include two existing LP relationships), and EUR 540 million of senior and second-lien debt.
...
The Schiller family will retain a 15% economic interest. Management will hold the remaining 7%.
```

**llm-2 08 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
Second, the end markets HPC serves are structurally attractive. The orthopaedic implants market is forecast to grow at 5–6% annually through 2030, driven by ageing demographics in Europe and the United States. Aerospace component demand is recovering strongly post-COVID, with Airbus and Boeing collectively targeting build-rate increases of approximately 40% over the next five years.
...
Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.
```

**llm-2 08 index 15 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We have identified four principal risks.

The semiconductor exposure introduces cyclicality that the medical and aerospace segments do not.
...
Customer concentration is a watch item. HPC's largest customer, a global orthopaedic implants manufacturer, accounted for 18% of revenue in 2024.
...
Foreign exchange exposure is significant.
...
Founder transition risk is moderate.
```

**llm-2 08 index 16 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 08_synth_industrial_buyout_memo.

```
We are attracted to HPC for four reasons.

First, the Company occupies an enviable competitive position.

Second, the end markets HPC serves are structurally attractive.

Third, there is a clear margin expansion path.

Fourth, we see meaningful M&A opportunity.
```

**llm-2 09 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 09_synth_portfolio_update_letter.

```
Period revenue of EUR 318 million represents growth of 11% versus the prior comparable period. The medical implants segment grew 14%, well ahead of expectations, driven by a 22% increase from our largest orthopaedic customer following their successful US product launch.

EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX (CHF weakened to 1.02 against EUR over the period, against our base case of 0.98).
```

**llm-2 09 index 11 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 09_synth_portfolio_update_letter.

```
We have recruited two of the three new senior hires planned in our underwriting. Klaus Wenger joined as Chief Procurement Officer in September, having previously held the same role at Belimo.
...
EBITDA of EUR 58 million versus a budget of EUR 54 million was driven by three factors: favourable mix (the strength in medical was higher-margin than budgeted), early procurement wins (Klaus Wenger has already secured EUR 2.1 million of annualised savings against a year-one target of EUR 5 million), and modest favourable FX (CHF weakened to 1.02 against EUR over the period, against our base case of 0.98).
```

**llm-2 11 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 11_synth_investor_letter_exit.

```
At the time of our investment, the Company generated revenue of SEK 4.2 billion and EBITDA of SEK 480 million, representing an EBITDA margin of 11.4%.
...
By the time of exit, international revenue had grown to SEK 4.8
billion, representing 42% of total revenue. Total Company revenue at exit was SEK 11.4 billion.
...
Combined with the modularity
programme, this drove EBITDA margins from 11.4% at entry to 18.2% at exit. Absolute EBITDA
grew from SEK 480 million to SEK 2.08 billion over the hold.
```

**llm-2 13 index 3 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 13_synth_internal_inconsistency_memo.

```
The Company serves over 1,200 freight forwarder and customs broker customers across 28 European countries.

CloudPivot generates annual recurring revenue ("ARR") of EUR 84 million as of October 2025, up from EUR 52 million two years prior — representing 27% CAGR.
```

**llm-2 14 index 1 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 14_synth_thesis_only_memo.

```
Clinical decision support software helps clinicians make better, faster, more consistent treatment decisions at the point of care.
...
We believe the European market is at an inflection point. Three forces are aligning. First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances. Second, payer willingness to reimburse CDS software has improved markedly. Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.
```

**llm-2 14 index 4 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 14_synth_thesis_only_memo.

```
Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years.
...
Second, payer willingness to reimburse CDS software has improved markedly.
```

**llm-2 14 index 8 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 14_synth_thesis_only_memo.

```
The European CDS market is structurally distinct from the US market in several ways.
...
The category has been under-served by private equity to date. Most scaled European CDS businesses are either bootstrapped, owned by clinical professional bodies, or sit inside larger health IT groups. There is meaningful opportunity for a thoughtful financial sponsor to play a constructive consolidation role.
```

**llm-2 15 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 15_synth_very_long_memo.

```
The transaction will be funded with EUR 720 million of equity from Halden Group, EUR 110 million of co-investment from two of our long-standing LP relationships (Singapore and Canadian institutions, both already informally committed), EUR 90 million of management rollover from the Esposito family and senior management, and EUR 480 million of senior debt and EUR 150 million of mezzanine financing.
...
The Esposito family will retain a 10% interest. Management will retain 6%. Halden Group and co-investors will hold 84% in aggregate.
```

**llm-2 15 index 11 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 15_synth_very_long_memo.

```
The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

...

Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar.
```

**llm-2 15 index 30 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 15_synth_very_long_memo.

```
DUE DILIGENCE OBSERVATIONS

Commercial diligence was conducted by Bain & Company over a ten-week period concluding in early January 2026. The Bain report (circulated separately) confirms market positioning, validates the international expansion thesis, and provides detailed competitive mapping.

Financial and tax diligence was conducted by Deloitte. No issues of material consequence.

Legal diligence was conducted by Latham & Watkins.

ESG diligence was conducted by ERM.
```

**llm-2 15 index 32 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 15_synth_very_long_memo.

```
The management team is strong... the value creation plan is well-defined, and the financing structure is appropriately conservative.
```

**llm-2 16 index 2 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 16_synth_healthcare_consumer.

```
EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency.
...
The recent twelve-month period has shown some deceleration to 31% year-on-year growth as the Company has scaled, but absolute growth remains strong and the unit economics have continued to improve.
```

**llm-2 16 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 16_synth_healthcare_consumer.

```
The Company's clinical advisory board, in-house formulation capability, and disciplined product development cadence (typically two new product launches per year) create meaningful competitive moats.

The product range comprises 24 SKUs, all formulated in-house, manufactured under contract by GMP-certified European facilities, and sold direct-to-consumer through Bloom's own website and Amazon, alongside a select wholesale presence in premium retailers including Selfridges, Le Bon Marché, KaDeWe, and Sephora.
```

**llm-2 16 index 10 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 16_synth_healthcare_consumer.

```
Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.

International expansion runway is significant. Bloom is strong in the UK and increasingly strong in DACH, but underdeveloped in France, Italy, and Spain. The brand has demonstrable cross-border appeal — DACH revenue has grown from zero in 2021 to EUR 18 million in 2024 — and we see clear opportunity to replicate this in the Romance language markets.

We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR. The growth is sourced from continued UK growth (modest, reflecting maturation), continued strong DACH growth, accelerated entry into France and Spain, and selective US market entry in year three.

The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**llm-2 16 index 11 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 16_synth_healthcare_consumer.

```
We underwrite revenue growth from EUR 64 million in 2025 to approximately EUR 195 million by 2030, an 25% CAGR.
...
The base case generates a 2.9x MOIC and 24% IRR over a five-year hold.
```

**llm-2 16 index 12 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 16_synth_healthcare_consumer.

```
Customer acquisition cost inflation in direct-to-consumer is the principal risk. Bloom's current 5.2-month payback period has lengthened from 3.8 months in 2022, reflecting both increased competition and broader paid social media cost inflation.

Brand-driven categories are subject to founder-dependency risk. Sarah Whitmore in particular is closely associated with the brand through content, podcast appearances, and visible founder presence.

Regulatory risk in women's health is real. Several of Bloom's products make claims around hormonal support and pregnancy wellness that are subject to evolving regulatory scrutiny across European markets. The Company has invested appropriately in regulatory affairs and has a clean track record, but the regulatory environment for nutrition claims is becoming more demanding.
```

**llm-2 17 index 9 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 17_synth_real_estate_logistics.

```
Our base case underwrites a five-year hold with the following return drivers. Rental growth of approximately 6% annually (a moderation from the recent 8% pace), capture of embedded reversion as approximately 40% of leases roll during the hold period, value-add capex returning a yield-on-cost of approximately 8.5%, and exit at a 5.0% yield reflecting modest yield compression supported by continued strong investor demand for the asset class.
...
We have budgeted EUR 38 million of value-add capital expenditure across the hold period. The principal investments are EUR 14 million in modernising the Park Royal asset (enabling a rent uplift from the current EUR 8 per square foot to an estimated EUR 14 per square foot at next renewal), EUR 8 million in the San Fernando asset, EUR 6 million in the Schiphol asset, and the remainder spread across smaller modernisation works across the Portfolio.
```

**llm-2 18 index 3 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240,000 residential units.
...
UPDATED CUSTOMER COUNT

The Company currently serves 412 property management companies, not 380 as stated in our initial memo.
```

**llm-2 18 index 4 occurrence 0**
verdict conflicting (conflict). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
Annual recurring revenue stands at EUR 38 million as of March 2025, up from EUR 28 million the prior year — representing 36% year-on-year growth.

Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million. Growth on a cleaned basis is 28% year-on-year rather than the 36% previously reported.
```

**llm-2 18 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
Three factors drive our conviction.

First, the product is genuinely market-leading. Independent customer research conducted as part of diligence rated NSH significantly higher than the principal Nordic competitor (Yardi Nordic) on usability, feature completeness, and customer support.

Second, the Nordic property management technology market remains structurally underpenetrated. Approximately 40% of Nordic property management companies still use legacy systems or spreadsheets. NSH has a clear runway to continue penetrating this addressable market.

Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
```

**llm-2 18 index 9 occurrence 0**
verdict partially_confirmed (supported_partial). sourceId "0". label 18a_synth_cross_source_pair_initial.

```
NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity.
...
Third, the founder team is exceptional. Erik Lindqvist is a domain-deep CEO who has rebuilt the product from the ground up over the past four years. The technical leadership has been stable and capable, with the CTO (Pekka Virtanen) having been with the Company since 2015.
...
NSH is a high-quality Nordic vertical SaaS asset with strong unit economics, exceptional product strength, and a clear growth runway.
```

**llm-2 19 index 0 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
This has been an exceptional year for the Fund, characterised by strong portfolio performance across the substantial majority of our investments, the successful realisation of NorTech Industries at outstanding economics, and meaningful progress on operational improvement initiatives at our remaining portfolio companies.
...
The Fund's net IRR as of 31 December 2025 stands at 19.7%, with a net MOIC of 2.13x and net DPI of 0.94x.
```

**llm-2 19 index 3 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
We are pleased to present the 2025 Annual Portfolio Review for Meridian European Industrials
Fund IV. This has been an exceptional year for the Fund, characterised by strong portfolio
performance across the substantial majority of our investments, the successful realisation of
NorTech Industries at outstanding economics, and meaningful progress on operational
improvement initiatives at our remaining portfolio companies.
...
The Fund is now fully deployed across nine investments, of which one (NorTech)
has been fully realised and the remaining eight continue to be held actively.
...
Continental Plastics has had a more challenging 2025.
...
Drift Logistics had a mixed 2025.
```

**llm-2 19 index 4 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
Helvetia Precision Components ("HPC") was acquired in June 2025 in a transaction valuing the Company at EUR 1.15 billion. HPC manufactures complex precision machined components for the medical devices, aerospace, and semiconductor end markets. Six months post-close, the Company is tracking modestly ahead of our underwriting on both revenue and EBITDA, with strong early traction on procurement programmes and the leadership transition proceeding well.
...
The 100-day plan is on track, with the new financial reporting infrastructure substantially in place and the procurement initiative beginning to deliver early wins.
...
Brightway has had a strong 2025, with revenue growing 14% year-on-year and EBITDA growing 21%.
...
Eltex Power Systems has performed strongly, benefiting from substantial increases in European power infrastructure investment. Revenue grew 23% year-on-year and EBITDA grew 31%. The order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date.
```

**llm-2 19 index 6 occurrence 0**
verdict confirmed (supported_full). sourceId "0". label 19_synth_annual_report.

```
We have introduced operational changes during the year, including the replacement of the Chief Operating Officer and the launch of a structured cost reduction programme targeting EUR 22
million of annualised savings. Early progress on this programme is encouraging.
...
The Company remains a long-term high-quality asset but the realisation timeline has lengthened
by approximately 12 months from our original underwriting.
```


## Metered spend

Recorded usage. Rates from `getLlmPricingTable()` for `gpt-5.1-2025-11-13`: input 1.25, cached input 0.125, output 10.00 per million. List prices every input token at 1.25. Discounted is `calculateLlmCostUsd`. Unpriced calls 0. Ceiling USD 10 across both passes, on the discounted meter. Not crossed. Combined discounted USD 1.763705.

| Pass | List USD | Discounted USD | Calls | Input tokens | Cached input tokens | Output tokens |
|---|---:|---:|---:|---:|---:|---:|
| llm-1 | 1.1234475 | 1.1234475 | 261 | 654326 | 0 | 30554 |
| llm-2 | 1.1233775 | 0.6402575 | 261 | 654326 | 429440 | 30547 |
| Both | 2.2468250 | 1.7637050 | 522 | | | |

Local cache was off on both passes. On llm-2 the provider still cached 429440 of 654326 input tokens, which is why discounted sits below list. The prompt, temperature, and seed were the same.

## What the arm cannot do that the pipeline does

It does not mark a span in the draft. It does not apply the dateline rule, confirming-passage demotion, or empty-confirmation refusal. It returns one passage, not the pipeline's support spans. It does not run editorial or compliance. A quoted passage is the model's copy, checked afterwards by this diagnostic, not a slice the code took from the source.

## Technical summary

`scripts/diagnostic/b380/run-llm-review.mjs` sends one JSON review call per frozen statement, with the full source text, and writes `runs/<pass>/cards.json` in the shape `score.mjs` already reads. `prompt.md` is the system brief and was not retuned. `quote-fidelity.mjs` checks each returned passage with exact match and then `locatePassageInSource`, and counts how many of the 100 labels kept the same mapped verdict across llm-1 and llm-2. No file under `lib/` changed. Two passes, 261 calls each, discounted USD 1.763705 combined, under the USD 10 ceiling.

## Plain-language summary

A plain model review, given the statement and the whole sources and nothing else, caught 3 of the 11 planted faults on both passes, against the pipeline's 9 of 11. It left alone 62 and then 63 of the 74 sentences Ben had already confirmed, against the pipeline's 65, which sits inside the noise already measured on identical pipeline runs. The two passes agreed on 97 of the 100 labelled sentences. On quote fidelity, 45 and 44 of the passages it cited do not occur in the source it named.
