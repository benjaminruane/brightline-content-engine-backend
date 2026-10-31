# B455 result

One pass of fixtures 01 to 20, cache off, frozen statements. The same harness as B446. No second pass.

Recorded build on the pass file: `259959b`. The prompt change is in this commit. The pass file records the parent, because the pass and the prompt are committed together.

## What was changed

The stage 2 explanation, in `lib/qc/pipeline-v4/prompts/stage2_v4.md`. This is the sentence stored as `matchExplanations`. The classification rules in that prompt were not rewritten. The explanation is now two or three sentences. The source is the subject. It quotes the source, then states the difference.

The stage 5 commentary, in `lib/qc/pipeline-v4/prompts/stage5_v2.md`. This is the sentence stored as `evidenceSummary`. It is a separate call from the classification. It now leads with what the source contains, quotes the source, and does not tell a reviewer what to do.

The framing note, in `lib/qc/framing-fidelity.mjs`. The decision to fire is the same call as the note. The fire rules were left in place. The note is now two sentences that quote the source and name what the sentence adds. One worked example no longer says the source confirms a figure.

## What was left alone

The reading note prompt. 155 notes on the B446 pass already passed the guard. That prompt is the register these three now follow.

The craft note prompt and its ban list.

`NOTE_BANNED_PHRASES`. The guard is unchanged.

The editorial prompt. Two of 131 editorial notes failed the guard on the B446 pass. Fixture 16 index 3 says a growth rate is not the right figure, and the note uses the word correct. Fixture 17 index 7 quotes the draft, and the draft itself says structurally supported. Changing the editorial prompt would move the editorial layer, which leave-alone counts, in order to dodge a word that is the finding or a quotation. Those two notes stay.

The widened multi-passage prompt, `stage2_v4_multipassage.md`. It returns passages and a class. It does not return the reader sentence. Changing it would move a verdict path without fixing a reader string.

`commentary-builder.mjs` and `evidence-authority.mjs`. Nothing imports them. They are not on the pass.

`displayedEvidenceProse` and the partial sentence are not producers. They repeat the matcher explanation or the commentary. They move when those two move.

## Acceptance

- Matcher explanations failing the guard. B446: 211 of 260. This pass: 31 of 260. Target: under 10.
- Partial cards showing a reason. B446, after the guard: 9 of 30. This pass: 40 of 44. Target: 44 of 44.
- reader_prose_withheld, evidenceSummary. B446: 234. This pass: 57.
- reader_prose_withheld, partialSentence. B446: 21. This pass: 4.
- reader_prose_withheld, displayedEvidenceProse. B446: 5. This pass: 0.
- reader_prose_withheld, framingFidelityConcerns. B446: 6. This pass: 5.
- reader_prose_withheld, editorialConcerns. B446: 2. This pass: 1. Left on the editorial prompt, as above.
- Reading notes failing the guard: 0 of 158.
- Catch. B446: 11 of 11. This pass: 11 of 11.
- Evidence leave-alone on the confirmed 74. B446: 45 of 74. This pass: 43 of 74.
- Combined quiet on the confirmed 74. B446: 29 of 74. This pass: 27 of 74.

## Where the target was missed

Matcher explanations failing the guard are 31 of 260. The target was under 10. Of those failures, 22 are the phrases aligns with or aligning with. The first sentence quotes the source. A later sentence then grades the draft, and that sentence is what the guard refuses. The other nine use confirmed, supported, correct, verified, or source confirms. Some of those words are the model's grading. Some are the source's own words, quoted. The guard was not changed, so a verbatim quote of those words still fails.

Evidence summaries withheld are 57, against a target near zero. The commentary improved from 234 and still closes by grading the sentence. displayedEvidenceProse is 0. partialSentence is 4. framingFidelityConcerns is 5.

Partial cards showing a reason are 40 of 44. The four that still show the unrecorded line are the partials whose finding still contains supported, confirmed, or aligns with.

A second pass was not run. This pass cost list USD 24.529925. The estimate for one pass was list USD 26.613613. Another full pass on the same harness would put the spec over the USD 40 ceiling.

Catch held at 11 of 11. A fall would have been a defect. There was no fall.

Evidence leave-alone moved from 45 of 74 to 43 of 74. The two confirmed cards that left are 04:6 and 19:3, both judged in the classification section. Combined quiet moved from 29 of 74 to 27 of 74. Three confirmed cards became quiet because an editorial or compliance concern dropped: 02:0, 03:1, and 13:3. Five left the quiet set: 04:6, 19:3, and three where an editorial concern appeared without an evidence change, 05:2, 13:11, and 15:17. The editorial prompt was not changed. Those three are the editorial model's own variance.

## Phrases still refused

- aligns with: 23
- source confirms: 12
- supported: 11
- confirms that: 8
- confirms the statement: 6
- confirmed: 3
- correct: 2
- aligning with: 1
- verified: 1

## Classification changes

30 cards changed displayVerdict or supportState against the B446 pass.

### 01:4

Shopify's strategic moat is its App Store, which two-thirds of customers actively use.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms that roughly two-thirds of Shopify's customers use at least one app from their App Store, supporting the statement about customer usage of the App Store.

Explanation after:

> The source states that 'roughly two-thirds of Shopify's customers utilize at least one app from their 'App Store'.' This matches the statement's claim that two-thirds of customers actively use the App Store. The strategic moat aspect is not directly addressed, but the usage statistic is confirmed.

Commentary before:

> The source confirms that roughly two-thirds of Shopify's customers use at least one app from their App Store, supporting the statement about customer usage of the App Store. The strategic moat aspect is not directly addressed, but the customer usage figure is confirmed.

Commentary after:

> The source states that 'roughly two-thirds of Shopify's customers utilize at least one app from their "App Store".' This confirms the usage statistic mentioned in the statement. However, the source does not address the claim that Shopify's strategic moat is its App Store.

Judgement: Better. The source gives the two-thirds App Store figure. It does not say the App Store is the strategic moat. Partial is the right class. The explanation still ends by saying the usage figure is confirmed, so the guard withholds the reason.

### 01:7

We see significant headroom to accelerate growth through marketing investment, international expansion, and continued development of the App Store ecosystem.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the statement by identifying marketing investment, international expansion, and development of the App Store ecosystem as opportunities to accelerate growth.

Explanation after:

> The source states there is an opportunity to accelerate growth through marketing, international expansion, and business development for the App Store. The sentence mentions 'continued development of the App Store ecosystem,' which is broader than the source's focus on business development.

Commentary before:

> The source confirms the statement by identifying marketing investment, international expansion, and development of the App Store ecosystem as significant opportunities to accelerate growth. The mention of the Shopify App Store aligns with the statement's reference to the App Store ecosystem, confirming this aspect as well.

Commentary after:

> The source states that there is an enormous opportunity to accelerate growth by investing in marketing, international expansion and product localization, and business development to expand the applications available in the Shopify App Store. The sentence mentions 'continued development of the App Store ecosystem,' which is broader than the source's focus on business development.

Judgement: Better. Marketing and international expansion are in the source. Continued development of the App Store ecosystem is wider than the source's business development for the store. Partial names that.

### 01:9

Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

Before: conflict (conflicting). After: supported_full (supported).

Explanation before:

> The source confirms that Shopify's 24 employees are based in Ottawa and that the company recruits talent at 60-70% of the cost compared to Silicon Valley or New York, matching the statement.

Explanation after:

> The source states that Shopify's 24 employees are located in Ottawa and that the company has recruited top development and design talent at 60%-70% of the cost of similar talent in Silicon Valley or New York. This matches the statement's claim about employee location and recruitment costs.

Commentary before:

> The statement conflicts with the source regarding the location of Shopify's talent recruitment. The source specifies that Shopify recruits talent in Ottawa, not that all employees are based there. The source confirms that Shopify's 24 employees are based in Ottawa and that the company recruits talent at 60-70% of the cost compared to Silicon Valley or New York. The reviewer should reconcile the discrepancy about the recruitment location or remove the claim.

Commentary after:

> The source states that Shopify's 24 employees are located in Ottawa, Canada, and that the company has recruited top development and design talent at 60%-70% of the cost of similar talent in Silicon Valley or New York. This creates a conflict with the statement's claim about the company's base location.

Judgement: Better. The source gives 24 employees in Ottawa and the same 60 to 70 percent cost. The old conflict class contradicted its own explanation, which already said the source matched. The new commentary still invents a conflict about the base location. The class is the one that matches the source.

### 02:5

As AI workloads continue to drive demand for location-agnostic compute, atNorth is exceptionally well positioned to capitalize on this opportunity.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms that AI is driving growth in location-agnostic workloads and that atNorth is well positioned to capitalize on this opportunity due to its secured power bank and demand pipeline.

Explanation after:

> The source states that AI is accelerating growth in location-agnostic workloads and that atNorth has strong foundations to capitalize on this market opportunity. However, it does not specifically state that atNorth is 'exceptionally well positioned' to capitalize on this opportunity, which is an evaluative claim the source does not make.

Commentary before:

> The source confirms that AI is driving growth in location-agnostic workloads and that atNorth is well positioned to capitalize on this opportunity. It specifically mentions atNorth's secured power bank and extensive demand pipeline as strong foundations for expansion, aligning with the statement's claim.

Commentary after:

> The source states that AI is accelerating growth in location-agnostic workloads and that atNorth's secured power bank and extensive demand pipeline provide substantial expansion potential. These strong foundations will help atNorth capitalize on the market opportunity. However, the source does not specifically state that atNorth is 'exceptionally well positioned' to capitalize on this opportunity, which is an evaluative claim the source does not make.

Judgement: Better. The source says atNorth has strong foundations for this demand. It does not say the company is exceptionally well positioned. Partial is right.

### 04:6

These are exceptional engagement metrics for a consumer product at this stage.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source explicitly describes the engagement metrics as exceptional, aligning with the statement's characterization of the metrics as exceptional for a consumer product at this stage.

Explanation after:

> The source states that the engagement metrics are exceptional and the strongest signal of product-market fit seen in a consumer investment over the past two years. The sentence claims these are exceptional for a consumer product at this stage, which the source does not specify.

Commentary before:

> The source confirms the statement by explicitly describing the engagement metrics as exceptional, noting them as the strongest signal of product-market fit seen in a consumer investment over the past two years. This aligns with the statement's characterization of the metrics as exceptional for a consumer product at this stage.

Commentary after:

> The source states that the engagement metrics are exceptional and are the strongest single signal of product-market fit seen in a consumer investment over the past two years. It also mentions that strong engagement at the early stage tends to be predictive. However, the source does not specify that these metrics are exceptional specifically for a consumer product at this stage.

Judgement: Worse. The source already calls the metrics exceptional, and the strongest product-market-fit signal in a consumer investment over the past two years. That is a consumer product at this stage. Treating the wording as a gap moved a confirmed card off the leave-alone set.

### 06:5

Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period.

Before: conflict (conflicting). After: supported_partial (partial).

Explanation before:

> The source confirms the revenue and EBITDA margin figures for Moreno Iberica for the year ended 31 December 2025, matching the statement's figures and period.

Explanation after:

> The source states that revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of investment. It also gives the EBITDA margin as 14.2 percent, which it describes as broadly stable. The statement's claim of 'around 14 percent' for EBITDA margins is supported, but the source does not mention 'over the holding period' explicitly.

Commentary before:

> The statement conflicts with the source regarding the EBITDA margin. The source specifies an EBITDA margin of 14.2 percent, while the statement claims it is around 14 percent. The revenue figures of EUR 218 million for the year ended 31 December 2025 and EUR 196 million at the time of investment are confirmed by the source. The reviewer should reconcile the discrepancy in the EBITDA margin or adjust the statement accordingly.

Commentary after:

> The source states that revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of investment. It also gives the EBITDA margin as 14.2 percent, which it describes as broadly stable. However, the source does not explicitly mention 'over the holding period' in relation to the EBITDA margins.

Judgement: Better. The revenue and the margin match. Over the holding period is not in the source, so partial is fairer than the old conflict. The explanation says the margin claim is supported, so the reason is withheld.

### 08:6

Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%.

Before: conflict (conflicting). After: supported_partial (partial).

Explanation before:

> The source confirms the revenue growth from EUR 312 million in 2020 to EUR 587 million in 2024, with a compound annual growth rate of 17.1%, which aligns with the statement's 17% CAGR.

Explanation after:

> The source states that HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, with a compound annual growth rate of 17.1%. The statement rounds the CAGR to 17%.

Commentary before:

> The source contradicts the statement by reporting a compound annual growth rate of 17.1%, not 17% as claimed. The revenue growth from EUR 312 million in 2020 to EUR 587 million in 2024 is confirmed. The reviewer should reconcile the discrepancy in the growth rate or adjust the statement accordingly.

Commentary after:

> The source states that HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, with a compound annual growth rate of 17.1%. The statement rounds the compound annual growth rate to 17%, which differs slightly from the source's figure.

Judgement: Better. The source gives a compound annual growth rate of 17.1 percent and the sentence says 17 percent. That is the rounding the brief asked for. Conflict overstated it.

### 08:14

We have committed funding for two to three add-on acquisitions over the hold and have already identified the priority pipeline.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the expectation to complete two to three add-on acquisitions over the holding period, aligning with the statement's claim of committed funding for these acquisitions.

Explanation after:

> The source states that under their ownership, they expect to complete two to three add-on acquisitions over the holding period. However, it does not mention that funding has already been committed or that a priority pipeline has been identified, which the statement claims.

Commentary before:

> The source confirms the statement by indicating that there is an expectation to complete two to three add-on acquisitions over the holding period. Additionally, it mentions that five actionable targets have already been identified, which aligns with the statement's claim of having a priority pipeline.

Commentary after:

> The source states, 'under our ownership we expect to complete two to three add-on acquisitions over the holding period.' It also mentions that they have identified five actionable targets in the EUR 30–80 million enterprise value range. However, the source does not mention that funding has already been committed or that a priority pipeline has been identified, as the statement claims.

Judgement: Better. The source expects two to three add-on acquisitions. It does not say the funding is already committed. Partial is right. The explanation also says no pipeline has been identified, while the commentary says five targets are named. That second gap is overstated.

### 08:15

Principal risks include semiconductor cyclicality, customer concentration in medical implants, foreign exchange exposure, and the upcoming founder transition — each is understood and reflected in our planning, with specific mitigations in place.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the principal risks mentioned in the statement, including semiconductor cyclicality, customer concentration, foreign exchange exposure, and founder transition, and notes that these risks are understood and manageable.

Explanation after:

> The source identifies four principal risks: semiconductor cyclicality, customer concentration, foreign exchange exposure, and founder transition risk. It does not state that each risk is 'understood and reflected in our planning, with specific mitigations in place,' which the statement claims.

Commentary before:

> The source confirms the statement by identifying the principal risks, including semiconductor cyclicality, customer concentration in medical implants, foreign exchange exposure, and the upcoming founder transition. It also indicates that these risks are understood and manageable, aligning with the statement's claim of having specific mitigations in place.

Commentary after:

> The source identifies four principal risks: semiconductor cyclicality, customer concentration, foreign exchange exposure, and founder transition risk. It states that semiconductor exposure introduces cyclicality, with a 28% decline in semiconductor revenue during the 2023 downcycle. However, the source does not mention that each risk is 'understood and reflected in our planning, with specific mitigations in place,' as the statement claims.

Judgement: Better. The four risks are in the source. Specific mitigations in place is not. Partial is right.

### 08:16

In summary, the Company combines a defensible competitive position, structurally growing end markets, a clear operational improvement plan, and a credible M&A roadmap.

Before: supported_partial (partial). After: supported_full (supported).

Explanation before:

> The source confirms the statement by describing HPC as having a defensible competitive position, structurally growing markets, a clear operational improvement plan, and a credible M&A roadmap.

Explanation after:

> The source describes HPC as 'an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience.' This aligns with the statement's claims of a defensible competitive position, structurally growing end markets, and a clear operational improvement plan.

Commentary before:

> The source does not mention a 'credible M&A roadmap,' which creates a gap in the statement. It does confirm that HPC has a defensible competitive position, operates in structurally growing markets, and has a clear operational improvement plan. The reviewer should consider adding a source that addresses the M&A roadmap or revising the statement to reflect the confirmed elements.

Commentary after:

> The source describes HPC as 'an attractive opportunity to acquire a category leader in a structurally growing market with a clear operational improvement plan and proven through-cycle resilience.' This aligns with the statement's claims of a defensible competitive position, structurally growing end markets, and a clear operational improvement plan. The source does not explicitly mention a credible M&A roadmap, but the rest of the statement is confirmed.

Judgement: Worse. The commentary still says the source does not mention a credible M&A roadmap, and the class moved from partial to fully backed. The roadmap claim is now unmarked.

### 09:4

Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and commercial priorities identified at IC.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms that Petra Köhler assumed the CEO role in June and has made decisive progress on procurement, footprint, and commercial priorities, aligning with the statement.

Explanation after:

> The source states that Petra Köhler took over as CEO on 16 June and has moved decisively on early priorities, including restructuring the procurement function and initiating the Winterthur footprint review. However, it does not mention 'commercial priorities identified at IC,' which the statement claims.

Commentary before:

> The source confirms that Petra Köhler assumed the CEO role in June, specifically on the 16th, and has made decisive progress on procurement, footprint, and commercial priorities. The source details her actions, including restructuring the procurement function, initiating a footprint review, and establishing a new operating cadence, which aligns with the statement.

Commentary after:

> The source states that Petra Köhler took over from Andreas Schiller on 16 June and has moved decisively on early priorities, including restructuring the procurement function and initiating the Winterthur footprint review. However, the source does not mention 'commercial priorities identified at IC,' which the statement claims.

Judgement: Better. June, the chief executive, procurement, and the footprint review are in the source. Commercial priorities identified at IC is not. Partial is right.

### 09:7

We have lowered our 2026 semiconductor revenue forecast to EUR 105 million from the original underwriting of EUR 122 million.

Before: supported_full (supported). After: not reviewed (skipped).

Explanation before:

> The source confirms the statement by stating the same revised semiconductor revenue forecast for 2026 and the original underwriting figure.

Explanation after:

> The source states that the full-year 2026 budget assumes semiconductor revenue of EUR 105 million, compared to the original underwriting of EUR 122 million. This matches the statement's claim of lowering the 2026 semiconductor revenue forecast to EUR 105 million from EUR 122 million.

Commentary before:

> The source confirms the statement by stating that the 2026 semiconductor revenue forecast has been lowered to EUR 105 million from the original underwriting of EUR 122 million. All figures and the year mentioned in the statement are supported by the source.

Commentary after:

> The sources do not address the statement. They do not mention the lowering of the 2026 semiconductor revenue forecast to EUR 105 million from EUR 122 million.

Judgement: Worse. The matcher says the source gives EUR 105 million against the original EUR 122 million, which is the sentence. The card is now not reviewed, and the commentary says the sources do not address it. A backed sentence was dropped.

### 09:9

Second, a quality issue at our second-largest medical customer was identified in October and is being addressed through a corrective action programme.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the identification of a quality issue with the second-largest medical customer in October and describes the corrective action plan being implemented, matching the statement.

Explanation after:

> The source states that in October, the second-largest medical customer raised a quality concern related to a component lot. It mentions a corrective action plan but does not specify that it is being addressed through a corrective action programme. The sentence claims the issue is being addressed, which the source does not explicitly state.

Commentary before:

> The source confirms the statement by detailing that a quality issue was identified in October with the second-largest medical customer. It describes the corrective action plan being implemented to address the issue, aligning with the statement. The specific mention of October in the claim is confirmed by the source.

Commentary after:

> The source states that in October, the second-largest medical customer raised a quality concern related to a specific component lot manufactured in the Olten facility. It mentions a corrective action plan but does not specify that the issue is being addressed through a corrective action programme. The source does not explicitly state that the issue is being addressed.

Judgement: Worse. A corrective action plan, raised in October by the second-largest medical customer, is the same fact as a corrective action programme. The new class treats the wording as a missing fact.

### 11:5

International expansion took revenue contribution from outside the Nordic region from 19 percent at entry to 42 percent at exit.

Before: not reviewed (skipped). After: supported_full (supported).

Explanation before:

> The source confirms the statement by showing that international revenue grew to 42% of total revenue by the time of exit, aligning with the statement's claim about revenue contribution from outside the Nordic region.

Explanation after:

> The source states that by the time of exit, international revenue represented 42% of total revenue. This matches the statement's claim about the revenue contribution from outside the Nordic region at exit.

Commentary before:

> No source addresses the claim that international expansion took revenue contribution from outside the Nordic region from 19 percent at entry to 42 percent at exit. The source does confirm the 42 percent figure, but it does not mention the initial 19 percent. Add a source for the 19 percent figure or remove it from the statement.

Commentary after:

> The source states that at entry, the company generated SEK 3.4 billion, which was 81% of its revenue from the Nordic region. By the time of exit, international revenue had grown to SEK 4.8 billion, representing 42% of total revenue. This confirms the statement's claim about the revenue contribution from outside the Nordic region at exit. The source does not explicitly mention the 19 percent figure at entry, but it can be inferred from the 81% Nordic revenue.

Judgement: Better. The source gives 42 percent of revenue from outside the region at exit, and 81 percent Nordic at entry, which is the 19 percent. The old card was not reviewed.

### 12:5

The numbers tell one story; the team's transformation tells the bigger one.

Before: not_supported (not_supported). After: supported_partial (partial).

Explanation before:

> The source does not address the claim about the numbers or the team's transformation. It discusses the sale of NorTech Industries and its international expansion but does not provide any specific figures or details about the team's transformation.

Explanation after:

> The source describes NorTech's transformation from being 'strong in Sweden, under-exposed everywhere else' to 'a genuinely international business.' It does not address 'the numbers' or provide any quantitative data, which the sentence implies.

Commentary before:

> No source addresses the claim about the numbers or the team's transformation. The source discusses the sale of NorTech Industries and its international expansion but does not provide any specific figures or details about the team's transformation. Add a source that supports this claim or remove it.

Commentary after:

> The source describes NorTech's transformation from being 'strong in Sweden, under-exposed everywhere else' to 'a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.' However, the source does not address 'the numbers' or provide any quantitative data, which the sentence implies.

Judgement: Better. The source describes the move from a Swedish business to an international one. Partial keeps that and still marks the numbers as absent. Not supported had hidden the transformation.

### 13:9

First, the European freight forwarding software market remains structurally underpenetrated, with approximately 40% of forwarders still on legacy systems or spreadsheets.

Before: not_supported (not_supported). After: supported_partial (partial).

Explanation before:

> The source discusses the competition from legacy software but does not provide specific data on the percentage of forwarders still using legacy systems or spreadsheets, nor does it quantify the market penetration.

Explanation after:

> The source states that CloudPivot serves 1,200 out of approximately 14,000 freight forwarders and customs brokers in Europe, indicating an 8.6% penetration rate. It mentions fragmented legacy software as the principal competition but does not specify that approximately 40% of forwarders are still on legacy systems or spreadsheets.

Commentary before:

> No source addresses the claim that approximately 40% of European freight forwarders are still using legacy systems or spreadsheets. The source mentions competition from legacy software but does not provide specific data on market penetration. Add a source that supports this claim or remove it.

Commentary after:

> The source states that there are approximately 14,000 freight forwarders and customs brokers in Europe, with CloudPivot serving 1,200 of them, indicating an 8.6% penetration rate. It mentions that the principal competition is fragmented legacy software, but it does not specify that approximately 40% of forwarders are still on legacy systems or spreadsheets.

Judgement: Better. The source gives 1,200 of about 14,000 firms and names legacy software. It does not give 40 percent. Partial shows both. Not supported had said nothing was there.

### 13:13

Our base case generates 2.6x MOIC and 21% gross IRR.

Before: supported_full (supported). After: conflict (conflicting).

Explanation before:

> The source directly states the same base case metrics of 2.6x MOIC and 21% IRR as the statement, confirming the claim.

Explanation after:

> The source states, 'Returns: our base case generates a 2.6x MOIC and 21% IRR.' This matches the statement exactly, confirming both the MOIC and IRR figures.

Commentary before:

> The source confirms the statement by directly stating that the base case generates a 2.6x MOIC and a 21% IRR. Both figures are explicitly supported.

Commentary after:

> The source states, 'Returns: our base case generates a 2.6x MOIC and 21% IRR.' This matches the statement's figures for MOIC and IRR. However, the source does not specify that the IRR is 'gross,' which is a detail included in the statement.

Judgement: Worse. The source states a 2.6x MOIC and a 21 percent IRR, and the explanation says that matches. The class moved to conflict because the source does not say the IRR is gross. That is a missing word, not a conflicting figure.

### 14:2

First, the regulatory pathway under the EU Medical Device Regulation (MDR) has matured.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms that the regulatory pathway under the EU MDR is now well-understood, aligning with the statement that it has matured.

Explanation after:

> The source states that the regulatory pathway under EU MDR is now well-understood and that incumbents have built up significant clearances. The sentence claims the pathway has matured, which implies a broader development than the source's focus on incumbents.

Commentary before:

> The source confirms that the regulatory pathway under the EU Medical Device Regulation (MDR) has matured, as it states that the pathway is now well-understood and that incumbents have built up significant clearances.

Commentary after:

> The source states that the regulatory pathway under the EU Medical Device Regulation (MDR) is now well-understood and that incumbents have built up significant clearances. However, the source does not explicitly mention that the pathway has 'matured,' which implies a broader development beyond the focus on incumbents.

Judgement: Equivalent. Both passes say the EU MDR pathway is well understood and that incumbents hold clearances. The new class treats matured as a further claim. The reader is not shown a different fact.

### 15:10

The Atelier 73 growth concept — Atelier 73 is the Company's smaller, design-led store format positioned at a younger urban customer.

Before: supported_full (supported). After: conflict (conflicting).

Explanation before:

> The source confirms that Atelier 73 is a smaller, design-led store format targeting younger urban customers, aligning with the statement.

Explanation after:

> The source states that the Atelier 73 banner operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment. This supports the statement's description of Atelier 73 as a smaller, design-led store format positioned at a younger urban customer.

Commentary before:

> The statement conflicts with the source regarding the description of Atelier 73.' The statement's characterization of Atelier 73 as a 'growth concept' is not supported by the source. The phrase 'The Atelier' matches the source.

Commentary after:

> The source states that the Atelier 73 banner operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment. This supports the statement's description of Atelier 73 as a smaller, design-led store format positioned at a younger urban customer. However, the source does not mention the term 'growth concept,' which is a key part of the statement.

Judgement: Worse. The source describes Atelier 73 as a small, design-led format aimed at a younger urban customer. The class moved to conflict because the source does not use the words growth concept. The description matches.

### 15:19

The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.

Before: supported_partial (partial). After: supported_full (supported).

Explanation before:

> The source confirms that homeware is a discretionary purchase and discusses varying demand across European markets, implying sensitivity to macroeconomic conditions. However, it does not explicitly link this to the company's discretionary positioning.

Explanation after:

> The source states that 'homeware is a discretionary purchase' and describes the uneven European consumer environment, highlighting demand sensitivity to macroeconomic conditions. This aligns with the statement's claim about discretionary positioning and demand sensitivity.

Commentary before:

> The source confirms that homeware is a discretionary purchase and that demand varies across European markets, implying sensitivity to macroeconomic conditions. However, it does not explicitly link this sensitivity to the company's discretionary positioning. The reviewer should consider adding a source that directly connects the company's positioning to macroeconomic demand sensitivity or revise the statement to reflect the partial confirmation.

Commentary after:

> The source states that 'homeware is a discretionary purchase' and describes the uneven European consumer environment in 2025, highlighting demand sensitivity to macroeconomic conditions. This aligns with the statement's claim about discretionary positioning and demand sensitivity. The source does not specifically mention 'The Company,' but it confirms the general concept of discretionary positioning affecting demand sensitivity.

Judgement: Equivalent. Both passes say the source calls homeware a discretionary purchase and describes demand that moves with the economy. The class moved from partial to fully backed. Neither pass produces a different fact.

### 15:25

The model has been stress-tested for modest lease renegotiation.

Before: supported_partial (partial). After: supported_full (supported).

Explanation before:

> The source confirms that the model has been stress-tested for lease renegotiation, aligning with the statement's claim of stress-testing for modest lease renegotiation.

Explanation after:

> The source states that the model has been stress-tested for a scenario where 10% of leases are renegotiated upward by 20%. This supports the statement that the model has been stress-tested for modest lease renegotiation.

Commentary before:

> The source confirms that the model has been stress-tested for lease renegotiation, specifically stating that 10% of leases are renegotiated upward by 20% at the next break, resulting in a modest impact on returns. However, the statement does not specify these details, creating a gap in precision. To improve accuracy, the statement should include the specific percentage of leases and the renegotiation rate tested.

Commentary after:

> The source states, "We have stress-tested our model for the scenario in which 10% of leases are renegotiated upward by 20% at the next break, and the impact on returns is modest." This confirms that the model has been stress-tested for modest lease renegotiation.

Judgement: Better. The source says the model was stress-tested for 10 percent of leases renegotiated upward by 20 percent, with a modest impact. That is the sentence. Fully backed is right. The old partial treated detail the sentence left out as a gap in the source.

### 15:32

We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source expresses high confidence in the management team, aligning with the statement's assertion of high conviction in the management team and value creation plan.

Explanation after:

> The source describes the management team as strong and highlights the impressive qualities of Elena Conti, the incoming CEO. However, it does not mention 'high conviction in the value creation plan' or 'providing further updates as the hold progresses,' which the statement claims.

Commentary before:

> The source confirms the statement by expressing high confidence in the management team and describing the value creation plan as well-defined. This aligns with the statement's assertion of high conviction in both the management team and the value creation plan.

Commentary after:

> The source describes the management team as strong and the value creation plan as well-defined. However, it does not mention having 'high conviction' in the value creation plan or the intention to provide further updates as the hold progresses.

Judgement: Better. The source calls the team strong and the plan well defined. It does not say high conviction, and it does not say further updates will follow. Partial is right.

### 16:1

The proposed transaction values Bloom at an enterprise value of EUR 310 million for a 72 percent stake.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> 

Explanation after:

> The source states, "The transaction values Bloom at an enterprise value of EUR 310 million," and confirms the 72% controlling stake. The statement and the source align on both the enterprise value and the stake percentage.

Commentary before:

> The source confirms the statement by indicating that the transaction values Bloom at an enterprise value of EUR 310 million for a 72% controlling stake. Both the enterprise value and the percentage stake are explicitly supported by the source.

Commentary after:

> The source states, "The transaction values Bloom at an enterprise value of EUR 310 million," and confirms the 72% controlling stake.

Judgement: Worse. The source states an enterprise value of EUR 310 million and a 72 percent stake, and the explanation says the two agree. The class moved to partial without a gap in that explanation.

### 16:10

Our investment thesis rests on the structural attractiveness of premium women's health (a EUR-denominated category growing at approximately 14 percent annually), Bloom's defensible product credibility and brand position, and a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the statement's claim about the growth rate of the premium women's health category and Bloom's position within it. The international expansion runway is also supported by the source.

Explanation after:

> The source states that the premium women's health category is growing at approximately 14% annually in Europe and describes Bloom's defensible product credibility and brand position. It also mentions Bloom's international expansion potential in France, Italy, and Spain. The statement's elements are covered by the source.

Commentary before:

> The source confirms the statement. It specifies that the premium women's health category is growing at approximately 14% annually in Europe, aligning with the statement's claim. Additionally, the source supports Bloom's strong brand position and highlights the significant international expansion opportunities in France, Italy, Spain, and selectively in the US, consistent with the statement's investment thesis.

Commentary after:

> The source states that the premium women's health category is growing at approximately 14% annually in Europe and describes Bloom as a clinically-credible, premium-positioned, multi-product brand. It also mentions Bloom's potential for international expansion in France, Italy, and Spain. However, the source does not mention the US market or the specific five-year hold period mentioned in the statement.

Judgement: Better. The category growth, the brand, and France, Italy, and Spain are in the source. The United States and the five-year hold are not. Partial is right.

### 17:9

Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex programme to modernise three older assets, and benefiting from continued rental growth and modest yield compression.

Before: conflict (conflicting). After: supported_full (supported).

Explanation before:

> The statement claims an embedded reversion of approximately 40 percent, while the source estimates it at approximately 18 percent. This is a magnitude conflict beyond rounding for the same reversion metric.

Explanation after:

> The source gives the embedded rental reversion as approximately 18% across the portfolio. The statement claims it is approximately 40% during the hold period. These figures are mutually exclusive and cannot be reconciled by rounding.

Commentary before:

> The statement claims an embedded reversion of approximately 40 percent, but the source estimates it at approximately 18 percent, creating a significant conflict in the reversion metric. The source does confirm the plan to modernize three older assets, but it does not specify the EUR 38 million value-add capex program. The reviewer should reconcile the conflicting reversion figures and verify the capex amount before relying on this statement.

Commentary after:

> The source states that the embedded rental reversion is estimated at approximately 18% across the portfolio, with the strongest potential in the London and Amsterdam assets. The statement claims that the embedded reversion is approximately 40% of leases during the hold period, which conflicts with the source's figure. EUR 38 million matches the source.

Judgement: Worse. The source says the embedded reversion is about 18 percent. The sentence says about 40 percent. The explanation says those figures cannot sit together. The class moved from conflict to fully backed, so the card no longer marks the conflict.

### 18:6

The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms the statement's claim about NSH's product being market-leading and rated higher than Yardi Nordic on usability and feature completeness. It also supports the underpenetrated market and exceptional founder team claims.

Explanation after:

> The source states that the product is 'genuinely market-leading' and that 'independent customer research' rated NSH 'significantly higher than the principal Nordic competitor (Yardi Nordic) on usability, feature completeness, and customer support.' The statement's claim about the product and its comparison to Yardi Nordic is covered by the source.

Commentary before:

> The source confirms the statement. It states that independent customer research rated NSH significantly higher than Yardi Nordic on usability and feature completeness, supporting the claim of a market-leading product. The source also confirms the presence of an exceptional founder team, highlighting Erik Lindqvist as a domain-deep CEO and Pekka Virtanen as a stable and capable CTO. Additionally, the source supports the claim of a structurally underpenetrated market, although it does not specify the 40% figure. Overall, the statement is well-supported by the source.

Commentary after:

> The source states that the product is 'genuinely market-leading' and that 'independent customer research' rated NSH 'significantly higher than the principal Nordic competitor (Yardi Nordic) on usability, feature completeness, and customer support.' It also mentions that approximately 40% of Nordic property management companies still use legacy systems or spreadsheets. However, the source does not mention the founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.

Judgement: Equivalent. One passage quotes the market-leading product and the comparison with Yardi Nordic. Another says Bain's reference work confirmed the product and is silent on the founder team. The new class marks that silence. The word confirmed, which is in the explanation, is why that passage fails the guard.

### 19:2

The exit of NorTech Industries — which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR — is the largest realisation in the Fund's history and the principal driver of the Fund's current returns trajectory.

Before: conflict (conflicting). After: supported_full (supported).

Explanation before:

> The source confirms the exit date, MOIC, IRR, and that it is the largest realisation in the Fund's history. However, the source states the proceeds as SEK 12.8 billion, conflicting with the statement's SEK 18.4 billion.

Explanation after:

> The source states that the exit of NorTech Industries generated gross proceeds of SEK 12.8 billion, with a 3.56x gross MOIC and 31.4% gross IRR, and that it is the largest single realisation in Fund IV's history. The statement claims the exit closed at SEK 18.4 billion, which the source does not support.

Commentary before:

> The statement conflicts with the source regarding the proceeds from the exit of NorTech Industries. The statement claims the exit closed at SEK 18.4 billion, while the source states it was SEK 12.8 billion. The source confirms the exit date in January 2026, the 3.56x gross MOIC, the 31.4% gross IRR, and that it is the largest realisation in the Fund's history. The reviewer should reconcile the discrepancy in the proceeds figure or remove the claim.

Commentary after:

> The source states that the exit of NorTech Industries generated gross proceeds of SEK 12.8 billion, with a 3.56x gross MOIC and 31.4% gross IRR, and that it is the largest single realisation in Fund IV's history. The statement claims the exit closed at SEK 18.4 billion, which the source does not support. January and 2026 match the source.

Judgement: Worse. The source says gross proceeds of SEK 12.8 billion. The sentence says SEK 18.4 billion. The explanation names that. The class moved from conflict to fully backed.

### 19:3

Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges.

Before: supported_full (supported). After: supported_partial (partial).

Explanation before:

> The source confirms that the performance across the remaining active portfolio companies has been broadly positive, aligning with the statement's claim of broadly positive performance with some challenges.

Explanation after:

> The source describes 'strong portfolio performance across the substantial majority of our investments' and mentions 'two issues' being managed actively. The sentence claims 'performance has been broadly positive with two notable challenges,' which aligns with the source. However, the source does not explicitly state 'broadly positive' for all eight companies, making the support partial.

Commentary before:

> The source confirms the statement, noting that the year has been exceptional for the Fund with strong portfolio performance across the majority of investments and progress on operational improvements at the remaining portfolio companies. This aligns with the statement's claim of broadly positive performance with some challenges.

Commentary after:

> The source describes 'strong portfolio performance across the substantial majority of our investments' and mentions 'two issues' being managed actively, which aligns with the statement's claim of broadly positive performance with two notable challenges. However, the source does not explicitly state 'broadly positive' for all eight active portfolio companies, making the support partial.

Judgement: Equivalent. Strong performance across the substantial majority, with two issues, is the same picture as broadly positive with two challenges. The new class treats the wording, and the count of eight companies, as a gap. This is the other confirmed card that left the leave-alone set. No figure changed.

### 19:4

Helvetia Precision Components, acquired in June 2025, is six months into the hold and tracking modestly ahead of underwriting; the recently-acquired Lumen Specialty Chemicals is on track with its 100-day plan; Brightway Industrial Coatings has had a strong 2025 with revenue and EBITDA growing 14 percent and 21 percent respectively; Eltex Power Systems has performed exceptionally, with revenue growing 23 percent and EBITDA growing 31 percent year-on-year supported by an order backlog that has grown from EUR 285 million at acquisition to EUR 480 million today.

Before: not reviewed (skipped). After: supported_full (supported).

Explanation before:

> The source confirms the performance metrics and periods for Helvetia, Lumen, Brightway, and Eltex as stated, including revenue and EBITDA growth figures and order backlog changes.

Explanation after:

> The source states that Brightway's revenue grew 14% and EBITDA grew 21% in 2025. It also states that Eltex Power Systems' revenue grew 23% and EBITDA grew 31% year-on-year, with the order backlog increasing from EUR 285 million at acquisition to EUR 480 million. These figures match the statement's claims for 2025.

Commentary before:

> No source addresses the claims about Helvetia Precision Components, Lumen Specialty Chemicals, Brightway Industrial Coatings, or Eltex Power Systems, including their acquisition dates, performance metrics, or growth figures. The statement mentions specific growth percentages and timelines, but these are not supported by any source provided. The reviewer should add a source that confirms these details or remove the claims.

Commentary after:

> The source states that Brightway Industrial Coatings had a strong 2025, with revenue growing 14% year-on-year and EBITDA growing 21%. It also mentions that Eltex Power Systems' revenue grew 23% year-on-year and EBITDA grew 31%, with the order backlog increasing from EUR 285 million at acquisition to EUR 480 million. This creates a conflict with the statement, which includes these additional details. The phrase 'Helvetia Precision Components' and June match the source.

Judgement: Better. The old label was not reviewed even though the explanation said the Brightway and Eltex figures match. The source gives 14 percent and 21 percent, and 23 percent and 31 percent, and the backlog from EUR 285 million to EUR 480 million. The new commentary still talks about a conflict those figures do not show.

### 20:8

Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026.

Before: supported_partial (partial). After: not_supported (not_supported).

Explanation before:

> The source confirms that the investment team has been preparing Fund V's pipeline by engaging with prospective LPs throughout the year. However, it does not mention the expectation of first capital calls in the second quarter of 2026.

Explanation after:

> The source discusses the engagement of investment teams with prospective LPs and the completion of the fundraise. It does not address the preparation of Fund V's pipeline or the timing of first capital calls in Q2 2026.

Commentary before:

> The source confirms that the investment team has been preparing Fund V's pipeline by engaging with prospective LPs throughout the year. However, it does not address the expectation of first capital calls in the second quarter of 2026. The reviewer should add a source that confirms the timing of the capital calls or adjust the statement to reflect the available information.

Commentary after:

> The sources do not address the statement. They do not mention the preparation of Fund V's pipeline or the expectation of first capital calls in the second quarter of 2026.

Judgement: Worse. The old card said the pipeline preparation was in the source and the second-quarter capital call was not. The new card says the sources do not address the sentence at all, so the backed half disappeared.

## Ten explanations

Full text, one per draft where the pass has that class.

Read against the brief: the partials on 02:5 and 04:6 lead with the source and then the difference. The conflicts on 05:0 and 08:2 do the same. The fully backed cards still add a grading close, such as matching the statement or confirming the investment. Fixture 01:4 still says the usage statistic is confirmed. Fixture 04:3 is classed as a conflict while the explanation says the figures match.

### partial, fixture 01:4, supported_partial

> The source states that 'roughly two-thirds of Shopify's customers utilize at least one app from their 'App Store'.' This matches the statement's claim that two-thirds of customers actively use the App Store. The strategic moat aspect is not directly addressed, but the usage statistic is confirmed.

### partial, fixture 02:5, supported_partial

> The source states that AI is accelerating growth in location-agnostic workloads and that atNorth has strong foundations to capitalize on this market opportunity. However, it does not specifically state that atNorth is 'exceptionally well positioned' to capitalize on this opportunity, which is an evaluative claim the source does not make.

### partial, fixture 04:6, supported_partial

> The source states that the engagement metrics are exceptional and the strongest signal of product-market fit seen in a consumer investment over the past two years. The sentence claims these are exceptional for a consumer product at this stage, which the source does not specify.

### conflicting, fixture 04:3, conflict

> The source states, 'Average session length is 14 minutes,' and compares it to 'the average session length on Facebook is 7 minutes, and on most social bookmarking products is 2 to 3 minutes.' This matches the statement's figures and comparisons.

### conflicting, fixture 05:0, conflict

> The source states that Westhaven Capital has agreed to acquire Norwell Aerospace Components from Bridgepoint. The statement claims that Halden Group has agreed to acquire Norwell from Westhaven Capital, which is a different entity in the same acquisition role.

### conflicting, fixture 08:2, conflict

> The source states that Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management. The statement claims the investment has already been made, while the source shows it as a proposed transaction seeking approval.

### fully backed, fixture 01:1, supported_full

> The source states that Shopify's customers have increased from 5,500 a year ago to nearly 10,000 today. This matches the statement's claim of customer growth over the same period.

### fully backed, fixture 02:0, supported_full

> The source states that Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix. It also states that the transaction values atNorth at an enterprise value of USD 4 billion. This matches the statement in both the parties involved and the valuation.

### fully backed, fixture 03:0, supported_full

> The source states that Partners Group will invest over EUR 120 million through its infrastructure secondaries business in Gestcompost. It confirms the investment amount and the business unit involved, matching the statement.

### fully backed, fixture 04:0, supported_full

> The source states, 'We seek partnership approval for a Series A investment of USD 10mm in Pinterest, Inc., a visual discovery and bookmarking platform.' This matches the statement's description of Pinterest as a 'visual discovery and bookmarking platform.'

## Spend

Estimate before the calls: USD 26.613613 list. The estimate is the B446-shaped one-pass figure. It does not add tokens for the longer explanation. Ceiling USD 40.

This pass. List USD 24.529925. Discounted USD 20.120965. Calls 1738. Unpriced 0.
B446. List USD 24.260542. Discounted USD 19.910142. Calls 1747.

By model. gpt-4o is the matcher, the commentary, editorial, and compliance. gpt-4o-mini is the framing judge and the duplication judge. Opus is the reading note and the craft note. The reading note and the craft note prompts were not changed.

- openai/gpt-4o-2024-08-06. Calls 1396 (B446 1393). List is inside the pass total. Discounted USD 11.803658 (B446 11.577732). Output tokens 107434 (B446 101885).
- openai/gpt-4o-mini-2024-07-18. Calls 55 (B446 54). List is inside the pass total. Discounted USD 0.006607 (B446 0.006030). Output tokens 2827 (B446 2585).
- anthropic/claude-opus-4-7. Calls 287 (B446 300). List is inside the pass total. Discounted USD 8.310700 (B446 8.326380). Output tokens 44438 (B446 47505).

Note-step calls stored on the fixtures, the reading note and the craft note together: 287 calls, USD 8.310700. That figure is inside the pass total. Neither prompt was changed.

## What stayed put

The classification rules, the reading note, the craft note, and the endorsement list were not edited. A card whose class moved did so because the same call writes the class and the explanation, or because the commentary the framing judge reads is now in the new register.
