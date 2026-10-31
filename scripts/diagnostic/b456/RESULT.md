# B456 result

One pass of fixtures 01 to 20, cache off, frozen statements. The same harness as B455. The estimate printed before the calls was list USD 26.613613, under the ceiling of USD 40.

Recorded build on the pass file: `af221a3`. The account is in this commit. The pass file records the parent, because the pass and the account are committed together.

## What was built

`lib/qc/source-account.mjs`. Builds the reader account after the verdict exists. Returns a quote and a difference. It does not return a verdict.

`lib/qc/pipeline-v4/prompts/source-difference.md`. The separate call. It copies spans. It does not write a sentence and it does not choose the class.

`lib/qc/pipeline-v4/prompts/stage2_v4.md`. The explanation section that told the matcher how to talk to the reader is gone. The passage instruction no longer stops at 400 characters. The classification rules are the ones from before that section.

`lib/qc/framing-fidelity.mjs`. The judge no longer receives the commentary. The note the reader sees is built from a phrase copied out of the sentence. The model's own note is not shown.

`lib/qc/pipeline-v3/stage7-assemble-card.mjs`. The primary passage is no longer cut to 300 characters. The account is attached after the verdict, the framing demotion, the omission check, and the actor check.

The screen, `SourceQuote.jsx` and `sourceQuoteLayout.js`. A passage longer than 80 characters, or one with a line break, steps out on its own line at the craft note's 72-character measure.

## Why the wording cannot move the verdict

The verdict is finished before `buildSourceAccount` is called. That function's return is `sourceQuote` and `sourceDifference`. It is not passed to `applyOmissionConflictInvariant`, `applyActorOfTheAction`, or `detectFramingFidelity`. The stage 2 prompt does not contain the account's sentences. The difference prompt is a different file, loaded only by the account. The framing judge's user prompt is the statement and the passages. Editing the account templates changes `source-account.mjs` and `source-difference.md`. Neither file is an input to the classification call.

The quote is copied from the passage. A fully backed card has that quote and no second sentence. A partial or a conflict adds a sentence only by filling a fixed frame with spans that were checked as verbatim copies. There is no field whose job is to say the source agrees.

## How agreement was counted

The count is not the sixteen banned phrases. Quoted copies are removed first. What remains is an agreement when it says the source and the sentence fit: the source or the passage confirms, supports, verifies, matches, aligns, agrees, backs, or corroborates, or the sentence is said to be confirmed, supported, verified, or correct. The function is `assertsAgreement` in `lib/qc/source-account.mjs`.

```
export function assertsAgreement(text) {
  const bare = stripQuoted(text);
  return AGREEMENT_RELATION.some((pattern) => pattern.test(bare));
}
```

Statements that tell the reader the sources agree: 0.
- None.

Account sentences that are not one of the fixed frames: 0.
- None.

## Acceptance

- Partial cards showing a reason: 32 of 32.
- reader_prose_withheld, evidenceSummary. B446 234. B455 57. This pass 0.
- reader_prose_withheld, partialSentence. B446 21. B455 4. This pass 0.
- reader_prose_withheld, displayedEvidenceProse. B446 5. B455 0. This pass 0.
- reader_prose_withheld, framingFidelityConcerns. B446 6. B455 5. This pass 0.
- reader_prose_withheld, editorialConcerns. B446 2. B455 1. This pass 1. The editorial prompt was not changed.
- Catch. B446 11 of 11. B455 11 of 11. This pass 11 of 11.
- Evidence leave-alone. B446 45 of 74. B455 43 of 74. This pass 49 of 74.
- Combined quiet. B446 29 of 74. B455 27 of 74. This pass 32 of 74.

## Verbatim

Quoted passages checked against the fixture source text: 253. Not found in the cited source: 0.
- None.

Difference spans not found in the sentence or the passage: 0.
- None.

## Classification changes

35 cards differ from B455 or from B446 on displayVerdict or supportState.

### 01:4

Shopify's strategic moat is its App Store, which two-thirds of customers actively use.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> Roughly two-thirds of Shopify�s customers utilize at least one app from their �App Store�.

Judgement: Worse. The two-thirds figure is in the passage. The claim that the App Store is the strategic moat is not, and the card is fully backed again.

### 01:7

We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> Further, we think that there is an enormous opportunity to accelerate growth by investing in: i) marketing, ii) international expansion and product localization and iii) business development to expand the applications available in the Shopify App Store.

Judgement: Worse. Marketing and international expansion are in the passage. Continued development of the App Store ecosystem is wider than that, and the card is fully backed again.

### 01:9

Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

B446: conflict (conflicting). B455: supported_full (supported). This pass: conflict (conflicting).

Quote:

> Shopify�s 24 employees are located in Ottawa, Canada. Based on Shopify�s reputation in Ottawa as a local internet startup success story, and based upon Tobi�s reputation among the developer community, the company has been able to recruit some of the best development and design talent in Ottawa at 60%-70% of the cost of similar talent in Silicon Valley or New York.

Difference:

> The sentence says "where the Company has recruited strong design and engineering talent". The passage says "the company has been able to recruit some of the best development and design talent in Ottawa".

Judgement: Worse. The passage gives 24 employees in Ottawa and the same cost band. The card is a conflict over talent wording.

### 02:5

As AI workloads continue to drive demand for location-agnostic compute, atNorth is exceptionally well positioned to capitalize on this opportunity.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> As AI continues to accelerate growth in location-agnostic workloads, atNorth's secured power bank combined with an extensive demand pipeline provides substantial expansion potential. These strong foundations will help atNorth capitalize on the market opportunity.

Difference:

> The sentence says "AI workloads continue to drive demand for location-agnostic compute". The passage does not.

Judgement: Equivalent. The card stays partial. The passage says AI is accelerating location-agnostic workloads and that atNorth has strong foundations. It does not say exceptionally well positioned. The difference points at the demand clause, whose meaning is already in the passage.

### 04:6

These are exceptional engagement metrics for a consumer product at this stage.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> First, the engagement metrics are exceptional and are the strongest single signal of product-market fit we have seen in a consumer investment over the past two years. Strong engagement at the early stage tends to be predictive.

Judgement: Better. The passage already calls the metrics exceptional for a consumer investment. Fully backed is the fair class, and a confirmed card is quiet again.

### 04:7

The Company's user base is unusual in two respects.

B446: supported_partial (partial). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> The mechanic sounds simple but the product has unusual characteristics. Most social products are conversation-focused; users post, others respond, and the engagement is fundamentally about communication between people. Pinterest is different. Users come to the site primarily to discover and organise — engagement is fundamentally with the content rather than with other people. This makes the engagement model unusually robust to network dynamics.

Judgement: Worse. The passage describes one unusual engagement model. The sentence says the user base is unusual in two respects. The card is fully backed and names no difference.

### 04:19

We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team.

B446: supported_partial (partial). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> The downside case is total loss, which we have stress-tested and consider tolerable given the conviction in the engagement signal.

Judgement: Worse. The passage covers a total-loss stress test and the engagement signal. It does not mention the founder team. The card is fully backed.

### 06:5

Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period.

B446: conflict (conflicting). B455: supported_partial (partial). This pass: conflict (conflicting).

Quote:

> Revenue for the year
> ended 31 December 2025 was EUR 218 million, only modestly above the EUR 196 million at the
> time of our investment. EBITDA of EUR 31 million represented a margin of 14.2 percent, broadly
> stable over the holding period.

Difference:

> The sentence says "EBITDA margins have been broadly stable at around 14 percent". The passage says "EBITDA of EUR 31 million represented a margin of 14.2 percent".

Judgement: Equivalent. The revenue matches. The difference sets around 14 percent beside 14.2 percent, and the class is a conflict, which is the class it had before the shared prompt.

### 08:6

Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%.

B446: conflict (conflicting). B455: supported_partial (partial). This pass: conflict (conflicting).

Quote:

> HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual growth rate of 17.1%.

Difference:

> The sentence says "a compound annual rate of 17%". The passage says "a compound annual growth rate of 17.1%".

Judgement: Equivalent. The passage gives 17.1 percent and the sentence says 17 percent. The difference states that rounding. The class is a conflict, as it was before the shared prompt.

### 08:10

- End-market growth — structural exposure to medical implants and aerospace build rate increases supports 9% compound revenue growth over the hold.

B446: supported_partial (partial). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029. This growth is composed of: 5% organic growth in line with end-market expansion, 2% from share gain in medical implants, and 2% from contemplated M&A.

Judgement: Worse. The passage gives a 9 percent growth build. It does not mention aerospace. The card is fully backed.

### 08:14

We have committed funding for two to three add-on acquisitions over the hold and have already identified the priority pipeline.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> Fourth, we see meaningful M&A opportunity. The European precision machining sector remains highly fragmented, with the top 10 players accounting for less than 30% of the market. We have already identified five actionable targets in the EUR 30–80 million enterprise value range that would be accretive on both growth and margin grounds. The founding family has historically been reluctant to pursue M&A; under our ownership we expect to complete two to three add-on acquisitions over the holding period.

Difference:

> The sentence says "committed funding". The passage does not. The sentence says "priority pipeline". The passage does not.

Judgement: Better. The passage expects two to three add-on acquisitions. It does not say the funding is committed, and it does not say a priority pipeline has been identified. Partial is right.

### 08:15

Principal risks include semiconductor cyclicality, customer concentration in medical implants, foreign exchange exposure, and the upcoming founder transition — each is understood and reflected in our planning, with specific mitigations in place.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> The semiconductor exposure introduces cyclicality that the medical and aerospace segments do not. In the 2023 downcycle, HPC's semiconductor revenue declined by 28% year-on-year, though overall Company revenue still grew due to offsetting strength in the other segments. We are comfortable with this exposure given (a) the structural growth in EUV, and (b) HPC's flexible cost base, which allowed the Company to maintain EBITDA margins above 15% throughout the 2023 downturn.
> 
> Customer concentration is a watch item. HPC's largest customer, a global orthopaedic implants manufacturer, accounted for 18% of revenue in 2024. While the relationship is multi-decade and contractually backed by long-term supply agreements, any meaningful disruption to this account would materially impact Company performance.

Judgement: Worse. The four risks are in the passage. Specific mitigations in place is not, and the card is fully backed again.

### 08:16

In summary, the Company combines a defensible competitive position, structurally growing end markets, a clear operational improvement plan, and a credible M&A roadmap.

B446: supported_partial (partial). B455: supported_full (supported). This pass: supported_partial (partial).

Quote:

> HPC represents an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience.

Difference:

> The sentence says "the Company combines a defensible competitive position". The passage does not. The sentence says "a credible M&A roadmap". The passage does not.

Judgement: Better. The passage does not mention a credible M&A roadmap. Partial names that, where the previous pass had marked the card fully backed.

### 09:4

Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and commercial priorities identified at IC.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> The CEO transition has gone better than expected. Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities — restructuring the procurement function, initiating the Winterthur footprint review, and establishing a monthly operating cadence with the Halden Group team.

Judgement: Worse. June, the chief executive, procurement, and the footprint are in the passage. Commercial priorities identified at IC is not, and the card is fully backed again.

### 09:7

We have lowered our 2026 semiconductor revenue forecast to EUR 105 million from the original underwriting of EUR 122 million.

B446: supported_full (supported). B455: not reviewed (skipped). This pass: supported_full (supported).

Quote:

> We do not expect a deep downturn — the demand picture for EUV remains structurally strong — but we are guiding to flat semiconductor revenue for the next 12 months and have adjusted our full-year forecast accordingly. The full-year 2026 budget assumes semiconductor revenue of EUR 105 million versus our original underwriting of EUR 122 million.

Judgement: Better. The passage gives EUR 105 million against EUR 122 million. The card is fully backed again, after a pass that had marked it not reviewed.

### 09:9

Second, a quality issue at our second-largest medical customer was identified in October and is being addressed through a corrective action programme.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> In October, our second-largest medical customer raised a quality concern relating to a specific component lot manufactured in the Olten facility. Initial root cause analysis points to a tooling wear issue that was not detected by in-process inspection. The cost impact to HPC is limited — approximately EUR 3 million in returns, rework, and credit — but the relationship cost is more significant.

Judgement: Better. A corrective action plan in October at the second-largest medical customer is the same fact. Fully backed is right.

### 11:5

International expansion took revenue contribution from outside the Nordic region from 19 percent at entry to 42 percent at exit.

B446: not reviewed (skipped). B455: supported_full (supported). This pass: supported_full (supported).

Quote:

> International expansion. At entry, the Company generated SEK 3.4 billion (81%) of revenue from
> the Nordic region. We made meaningful investment in commercial capability in Germany, France,
> and the United Kingdom, opening dedicated offices in each market and recruiting country
> managers from larger competitors. By the time of exit, international revenue had grown to SEK 4.8
> billion, representing 42% of total revenue.

Judgement: Better. The passage gives 42 percent international at exit and 81 percent Nordic at entry, which is the 19 percent. The card is no longer not reviewed.

### 11:7

Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale.

B446: supported_full (supported). B455: supported_full (supported). This pass: conflict (conflicting).

Quote:

> We completed four bolt-on acquisitions over the hold period for a combined enterprise value
> of SEK 1.8 billion. The most significant was the acquisition of HeatTech GmbH in March 2023 for
> SEK 1.1 billion, which added German market presence and a complementary high-temperature
> product line.

Judgement: Worse. The passage states four bolt-on acquisitions and HeatTech at SEK 1.1 billion, which is the sentence. The card is a conflict and the difference was not recorded.

### 12:5

The numbers tell one story; the team's transformation tells the bigger one.

B446: not_supported (not_supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> When we acquired NorTech in 2021 it was an excellent company with a clear ceiling — strong in Sweden, under-exposed everywhere else, and held back by a fragmented shareholder structure. Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.

Difference:

> The sentence says "the team's transformation tells the bigger one". The passage does not.

Judgement: Better. The passage describes the move from a Swedish business to an international one. Partial keeps that and marks the numbers as absent.

### 13:9

First, the European freight forwarding software market remains structurally underpenetrated, with approximately 40% of forwarders still on legacy systems or spreadsheets.

B446: not_supported (not_supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> Large addressable market with limited modern competition. There are approximately 14,000 freight forwarders and customs brokers in Europe. CloudPivot serves 1,200 of these — an 8.6% penetration rate. The principal competition is fragmented legacy software (Riege, CargoWise — which is the dominant player in larger forwarders — and a long tail of regional incumbents). Most legacy products are visibly aged and customer satisfaction is consistently low.

Difference:

> The sentence says "40% of forwarders still on legacy systems or spreadsheets". The passage does not.

Judgement: Better. The passage gives 1,200 of about 14,000 firms and names legacy software. It does not give 40 percent. Partial shows both.

### 13:13

Our base case generates 2.6x MOIC and 21% gross IRR.

B446: supported_full (supported). B455: conflict (conflicting). This pass: supported_full (supported).

Quote:

> Returns: our base case generates a 2.6x MOIC and 21% IRR.

Judgement: Better. The passage states 2.6x MOIC and 21 percent IRR. Fully backed is right. A missing word, gross, is not a conflicting figure.

### 14:2

First, the regulatory pathway under the EU Medical Device Regulation (MDR) has matured.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> We believe the European market is at an inflection point. Three forces are aligning. First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances.

Difference:

> The sentence says "has matured". The passage does not.

Judgement: Equivalent. The passage says the EU MDR pathway is well understood. The card treats matured as a further claim. No figure changed.

### 14:6

The opportunity is for products that genuinely improve clinical workflows.

B446: supported_partial (partial). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> Third, generative AI is creating both opportunity and pressure: opportunity to genuinely improve clinical workflows, pressure on incumbents who lack credible AI strategies.

Judgement: Better. The passage says there is an opportunity to genuinely improve clinical workflows. That is the sentence. Fully backed is right.

### 15:10

The Atelier 73 growth concept — Atelier 73 is the Company's smaller, design-led store format positioned at a younger urban customer.

B446: supported_full (supported). B455: conflict (conflicting). This pass: conflict (conflicting).

Quote:

> The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

Difference:

> The sentence says "Atelier 73 is the Company's smaller, design-led store format". The passage says "The Atelier 73 banner — relaunched in 2022 — operates 18 small-format stores".

Judgement: Worse. The passage describes Atelier 73 as a small, design-led format for a younger urban customer. The card is a conflict.

### 15:19

The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.

B446: supported_partial (partial). B455: supported_full (supported). This pass: supported_full (supported).

Quote:

> Consumer discretionary exposure. Homeware is a discretionary purchase, and the European consumer environment in 2025 is uneven.

Judgement: Equivalent. The passage calls homeware a discretionary purchase and describes demand that moves with the economy. Fully backed does not add a fact.

### 15:25

The model has been stress-tested for modest lease renegotiation.

B446: supported_partial (partial). B455: supported_full (supported). This pass: supported_partial (partial).

Quote:

> We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest.

Difference:

> The sentence says "modest lease renegotiation". The passage does not.

Judgement: Worse. The passage says the model was stress-tested and the impact on returns is modest. The card treats modest lease renegotiation as absent.

### 15:32

We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> The management team is strong, the value creation plan is well-defined, and the financing structure is appropriately conservative.

Judgement: Worse. The passage calls the team strong and the plan well defined. High conviction and further updates are not there, and the card is fully backed again.

### 16:1

The proposed transaction values Bloom at an enterprise value of EUR 310 million for a 72 percent stake.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> We seek IC approval for an investment of EUR 195 million for a 72% controlling stake in Bloom Nutrition Holdings Limited ("Bloom" or "the Company"), a London-headquartered premium women's nutrition and wellness brand with a multi-channel European presence. The transaction values Bloom at an enterprise value of EUR 310 million, representing 14.8x trailing twelve months EBITDA of EUR 21 million.

Judgement: Better. The passage states an enterprise value of EUR 310 million and a 72 percent stake. Fully backed is right.

### 16:10

Our investment thesis rests on the structural attractiveness of premium women's health (a EUR-denominated category growing at approximately 14 percent annually), Bloom's defensible product credibility and brand position, and a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> Premium women's health is a structurally attractive emerging category. Women's health has been historically under-served by both mainstream and premium consumer health brands. The category is growing at approximately 14% annually in Europe, with significantly faster growth in dedicated direct-to-consumer brands. Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand.

Difference:

> The sentence says "a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold". The passage does not.

Judgement: Better. The category, the brand, and France, Italy, and Spain are in the passage. The United States and the five-year hold are not. Partial is right.

### 17:9

Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.

B446: conflict (conflicting). B455: supported_full (supported). This pass: supported_full (supported).

Quote:

> Embedded rental
> reversion is estimated at approximately 18% across the portfolio, with the strongest reversion
> potential in the London and Amsterdam assets where market rents have grown most rapidly over
> the past three years.

Judgement: Worse. The passage says the embedded reversion is about 18 percent. The sentence says about 40 percent. The card is fully backed.

### 18:6

The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_partial (partial).

Quote:

> First, the product is genuinely market-leading. Independent customer research conducted as part of diligence rated NSH significantly higher than the principal Nordic competitor (Yardi Nordic) on usability, feature completeness, and customer support.

Difference:

> The sentence says "a structurally underpenetrated market". The passage does not. The sentence says "an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen". The passage does not.

Judgement: Equivalent. The difference names the underpenetrated market and the founder team as absent. The product comparison can still sit in another passage. No figure in the class is new.

### 19:2

The exit of NorTech Industries — which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR — is the largest realisation in the Fund's history and the principal driver of the Fund's current returns trajectory.

B446: conflict (conflicting). B455: supported_full (supported). This pass: conflict (conflicting).

Quote:

> The realisation of NorTech Industries closed on 19 January 2026 (post
> year-end, but discussed here given its significance to the Fund). The exit generated gross
> proceeds of SEK 12.8 billion to Fund IV on invested capital of SEK 3.6 billion, representing a
> 3.56x gross MOIC and 31.4% gross IRR. NorTech becomes the largest single realisation in Fund
> IV's history.

Difference:

> The sentence says "SEK 18.4 billion". The passage says "SEK 12.8 billion".

Judgement: Better. The passage says SEK 12.8 billion. The sentence says SEK 18.4 billion. The card is a conflict again, and the difference names both figures.

### 19:3

Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges.

B446: supported_full (supported). B455: supported_partial (partial). This pass: supported_full (supported).

Quote:

> This has been an exceptional year for the Fund, characterised by strong portfolio
> performance across the substantial majority of our investments, the successful realisation of
> NorTech Industries at outstanding economics, and meaningful progress on operational
> improvement initiatives at our remaining portfolio companies.

Judgement: Equivalent. Strong performance across the substantial majority, with two issues, is the same picture as broadly positive with two challenges. Fully backed does not change a figure.

### 19:4

Helvetia Precision Components, acquired in June 2025, is six months into the hold and tracking modestly ahead of underwriting; the recently-acquired Lumen Specialty Chemicals is on track with its 100-day plan; Brightway Industrial Coatings has had a strong 2025 with revenue and EBITDA growing 14 percent and 21 percent respectively; Eltex Power Systems has performed exceptionally, with revenue growing 23 percent and EBITDA growing 31 percent year-on-year supported by an order backlog that has grown from EUR 285 million at acquisition to EUR 480 million today.

B446: not reviewed (skipped). B455: supported_full (supported). This pass: supported_full (supported).

Quote:

> Eltex Power Systems has performed strongly, benefiting from substantial increases in European
> power infrastructure investment. Revenue grew 23% year-on-year and EBITDA grew 31%. The
> order backlog stands at EUR 480 million, up from EUR 285 million at our acquisition date.

Judgement: Better. The passage gives the Brightway and Eltex growth rates and the backlog from EUR 285 million to EUR 480 million. The card is no longer not reviewed.

### 20:8

Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026.

B446: supported_partial (partial). B455: not_supported (not_supported). This pass: supported_partial (partial).

Quote:

> The Investment teams across our European Industrials platform have engaged with prospective LPs throughout the year and have been instrumental in conveying the depth and quality of our work.

Difference:

> The sentence says "Our investment team has been preparing Fund V's pipeline for many months". The passage does not. The sentence says "we expect first capital calls in the second quarter of 2026". The passage does not.

Judgement: Equivalent. The card is partial again. The difference treats both the pipeline preparation and the second-quarter capital call as absent, which is a harder reading than the class.

## Ten cards

### partial, fixture 01:10, supported_partial

In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.

Quote:

> Shopify�s target focus on SMBs and the potential market size of online retail were seen as key risks, but their organic growth and profitable business was hard to ignore.

Difference:

> The sentence says "exceptional unit economics". The passage does not. The sentence says "defensible competitive position". The passage does not.

### partial, fixture 02:5, supported_partial

As AI workloads continue to drive demand for location-agnostic compute, atNorth is exceptionally well positioned to capitalize on this opportunity.

Quote:

> As AI continues to accelerate growth in location-agnostic workloads, atNorth's secured power bank combined with an extensive demand pipeline provides substantial expansion potential. These strong foundations will help atNorth capitalize on the market opportunity.

Difference:

> The sentence says "AI workloads continue to drive demand for location-agnostic compute". The passage does not.

### partial, fixture 04:10, supported_partial

This combination — engaged users, female-skewed, older demographic — represents a strong and underserved advertising audience and supports a credible long-term monetization path through native advertising in categories such as home decor, fashion, and weddings.

Quote:

> We expect monetisation to come eventually from native advertising — particularly from advertisers in categories such as home decor, fashion, and weddings that align naturally with user behaviour — but we have not underwritten any specific revenue projections.

Difference:

> The sentence says "engaged users, female-skewed, older demographic". The passage does not. The sentence says "represents a strong and underserved advertising audience". The passage does not.

### conflicting, fixture 01:9, conflict

Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

Quote:

> Shopify�s 24 employees are located in Ottawa, Canada. Based on Shopify�s reputation in Ottawa as a local internet startup success story, and based upon Tobi�s reputation among the developer community, the company has been able to recruit some of the best development and design talent in Ottawa at 60%-70% of the cost of similar talent in Silicon Valley or New York.

Difference:

> The sentence says "where the Company has recruited strong design and engineering talent". The passage says "the company has been able to recruit some of the best development and design talent in Ottawa".

### conflicting, fixture 04:3, conflict

Average session length on the Company's platform is approximately 14 minutes, compared to roughly 7 minutes on Facebook and 2-3 minutes on most social bookmarking products.

Quote:

> Average session length is 14 minutes — exceptional for a social product. By comparison, the average session length on Facebook is 7 minutes, and on most social bookmarking products is 2 to 3 minutes.

Difference:

> The sentence says "Average session length on the Company's platform is approximately 14 minutes". The passage says "Average session length is 14 minutes — exceptional for a social product".

### conflicting, fixture 05:0, conflict

Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium machined parts, from Westhaven Capital.

Quote:

> Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint

Difference:

> The sentence says "Halden Group has agreed to acquire Norwell Aerospace Components". The passage says "Westhaven Capital agrees to acquire Norwell Aerospace Components".

### fully backed, fixture 01:1, supported_full

The Company has grown rapidly, with customers increasing from 5'500 a year ago to nearly 10'000 today.

Quote:

> Shopify has grown at an impressive rate. With limited marketing, customers have increased from 5,500 a year ago to nearly 10,000 today (+81% Y/Y).

Difference:

> (none)

### fully backed, fixture 02:0, supported_full

Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix in a transaction valuing the Company at an enterprise value of USD 4 billion.

Quote:

> Partners Group, one of the largest firms in the global private markets industry, acting on behalf of its clients, has agreed to sell atNorth (or "the Company"), a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board ("CPP Investments") and Equinix, the world's digital infrastructure company. The transaction values atNorth at an enterprise value ("EV") of USD 4 billion.

Difference:

> (none)

### fully backed, fixture 03:0, supported_full

Partners Group, through its infrastructure secondaries business, has agreed to invest over EUR 120 million in Gestcompost, the largest organic waste treatment manager in Spain.

Quote:

> Partners Group will invest over EUR 120 million through its infrastructure secondaries business, acting as a cornerstone investor in a continuation fund for Gestcompost that was successfully established and will be managed by current owner Suma Capital.

Difference:

> (none)

### fully backed, fixture 04:0, supported_full

We are writing to inform you of a new investment in Pinterest (the "Company"), a visual discovery and bookmarking platform that lets users organize images they find interesting onto themed boards.

Quote:

> Pinterest is a visual discovery tool. Users create themed boards onto which they "pin" images they want to remember, organise, or return to. Boards are organised by topic — recipes, home decor projects, fashion, weddings, gardening, and so on.

Difference:

> (none)


## Spend

Estimate before the calls: USD 26.613613 list. The harness estimate does not add the difference call. Ceiling USD 40.

This pass. List USD 24.207730. Discounted USD 19.326290. Calls 1813. Unpriced 0.
B455. List USD 24.529925. Discounted USD 20.120965. Calls 1738.

- openai/gpt-4o-2024-08-06. Calls 1464 (B455 1396). Discounted USD 11.067325 (B455 11.803658). Output tokens 108081 (B455 107434).
- openai/gpt-4o-mini-2024-07-18. Calls 63 (B455 55). Discounted USD 0.007080 (B455 0.006607). Output tokens 3526 (B455 2827).
- anthropic/claude-opus-4-7. Calls 286 (B455 287). Discounted USD 8.251885 (B455 8.310700). Output tokens 44284 (B455 44438).
