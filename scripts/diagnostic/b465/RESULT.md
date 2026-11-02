# B465. The partial card says what the source says, and the guard stops firing on the source's own words.

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0 for parts 1 to 3.

A source dash is written here as a hyphen.

## What was built

A partial reason is two spans the card already holds. The first is the compliant account, the evidence line written in the source's register. The second is the matcher's explanation with the clause that grades the statement cut off. The cut is a pivot the explanation already has: "but does not", "However,", or "The statement". A cut that is not clean is not used, and that card keeps the sentence it had.

The finding row uses that same sentence. It does not also say the part was not recorded.

The endorsement guard now ignores a banned phrase inside a quotation that is in the card's own passage. A banned phrase outside the quotation is still withheld. The sixteen phrases are unchanged. The screen copies the span check and the cut, and the drift tests name the other file.

## Problem 1. The partial reason

Cards whose reason is the unrecorded line: 10 before, 2 after.

- 14:3. the difference still contains "supported".
- 18:9. the difference still contains "source confirms".

Cards whose reason changed: 24. Each one below is the statement, the old reason, and the new reason. Every new reason passed the guard. A quoted phrase in a new reason is in the account, the explanation, or the passage. Misses: 0.

### 01:10

In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway.

Old: The source discusses Shopify's product, growth, App Store differentiation, and customer acquisition economics, but it does not characterize the company with summary judgements like "exceptional unit economics," "defensible competitive position," or "clear growth runway." These framings add evaluative labels the source does not state.

New: The source discusses Shopify's product, growth, App Store differentiation, and customer acquisition economics, but it does not characterize the company with summary judgements like "exceptional unit economics," "defensible competitive position," or "clear growth runway." These framings add evaluative labels the source does not state. However, it does not explicitly mention 'exceptional unit economics,'.

### 02:5

As AI workloads continue to drive demand for location-agnostic compute, atNorth is exceptionally well positioned to capitalize on this opportunity.

Old: The source says AI is accelerating growth in location-agnostic workloads and that atNorth's secured power and demand pipeline provide substantial expansion potential. The statement adds the judgement that atNorth is "exceptionally well positioned," which goes further than the source's wording.

New: The source says AI is accelerating growth in location-agnostic workloads and that atNorth's secured power and demand pipeline provide substantial expansion potential. The statement adds the judgement that atNorth is "exceptionally well positioned," which goes further than the source's wording. but it does not explicitly state that atNorth is 'exceptionally well positioned.' The evaluative term 'exceptionally' is an additional checkable claim not covered by the source.

### 04:12

Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says references from Silbermann's time at Google describe him as exceptionally product-focused and unusually willing to listen to user feedback. but it does not specifically state that he is 'unusually focused on users and product' as a reputation at Google. The statement adds a broader evaluative claim about his reputation.

### 04:13

The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says six full-time employees plus the two founders, which totals eight including founders. However, the source does not explicitly confirm the inclusion of founders in the employee count, leading to partial confirmation.

### 04:20

In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction.

Old: The statement describes the company as having "a defensible consumer position," but the source explicitly says "Defensibility is uncertain" and notes the visual discovery mechanic is not patented and that durability against competitive responses is uncertain.

New: The statement describes the company as having "a defensible consumer position," but the source explicitly says "Defensibility is uncertain" and notes the visual discovery mechanic is not patented and that durability against competitive responses is uncertain. However, it does not explicitly mention a 'defensible consumer position,'.

### 05:7

Halden Group will support continued growth in commercial aerospace and an accelerated expansion of Norwell's space applications business, where the Company has identified meaningful capacity to grow share.

Old: The source identifies the acquirer as Westhaven Capital, not Halden Group. The source also does not mention any accelerated expansion of a space applications business or identified capacity to grow share in space.

New: The source identifies the acquirer as Westhaven Capital, not Halden Group. The source also does not mention any accelerated expansion of a space applications business or identified capacity to grow share in space. but does not specifically mention an accelerated expansion of Norwell's space applications business or the identification of meaningful capacity to grow share.

### 08:3

The Company's competitive position is exceptional.

Old: The source describes the company's competitive position as 'enviable' in a specific vertical, which supports the statement's claim of an 'exceptional' competitive position. However, 'exceptional' is a broader evaluative claim that the source does not state.

New: 08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position." However, 'exceptional' is a broader evaluative claim that the source does not explicitly state.

### 08:10

- End-market growth - structural exposure to medical implants and aerospace build rate increases supports 9% compound revenue growth over the hold.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. but does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.

### 08:12

- Operating leverage - the balance of EBITDA growth comes from operating leverage on the broader cost base.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source attributes approximately 60 bps of margin lift to operating leverage on incremental revenue. but it does not specifically state that the balance of EBITDA growth comes from operating leverage on the broader cost base. The statement is broader in scope.

### 08:14

We have committed funding for two to three add-on acquisitions over the hold and have already identified the priority pipeline.

Old: The source says Halden expects to complete two to three add-on acquisitions over the holding period and has identified five actionable targets. It does not say funding for those add-ons has been committed; the statement adds that assertion.

New: The source says Halden expects to complete two to three add-on acquisitions over the holding period and has identified five actionable targets. It does not say funding for those add-ons has been committed; the statement adds that assertion. but does not mention that funding has been committed or that a priority pipeline has been identified.

### 09:8

Our base case returns remain intact but the segment will be a moderating factor through 2026.

Old: The source says base case returns of 2.4x MOIC and 19% IRR remain confident, and describes semiconductor weakness with flat revenue guidance for 12 months. The statement's characterization of "the segment" as a "moderating factor through 2026" is not stated in the source, which does not frame semiconductors as a moderating factor on returns across 2026.

New: The source says base case returns of 2.4x MOIC and 19% IRR remain confident, and describes semiconductor weakness with flat revenue guidance for 12 months. The statement's characterization of "the segment" as a "moderating factor through 2026" is not stated in the source, which does not frame semiconductors as a moderating factor on returns across 2026. but it does not explicitly state that the segment will be a moderating factor through 2026. The source mentions semiconductor weakness as a risk but does not directly link it to moderating factors through 2026.

### 12:3

NorTech today operates across the Nordic region, Germany, France, the UK, and Poland, with international revenue having grown from a fifth of total revenue at entry to more than 40 percent at exit.

Old: The source lists the geographic footprint (Nordic region, Germany, France, UK, Poland) but says nothing about international revenue growing from a fifth to more than 40 percent of total revenue. The statement adds specific figures the source does not provide.

New: The source lists the geographic footprint (Nordic region, Germany, France, UK, Poland) but says nothing about international revenue growing from a fifth to more than 40 percent of total revenue. The statement adds specific figures the source does not provide. However, it does not address the specific revenue growth from a fifth to more than 40 percent.

### 13:2

The Company has built strong fundamentals.

Old: The source describes CloudPivot as a high-quality vertical SaaS asset with strong unit economics and a defensible competitive position, but it does not make a general claim that the Company has built "strong fundamentals" as a summary characterization.

New: The source describes CloudPivot as a high-quality vertical SaaS asset with strong unit economics and a defensible competitive position, but it does not make a general claim that the Company has built "strong fundamentals" as a summary characterization. However, 'strong fundamentals' is a broader evaluative claim that the source does not explicitly state.

### 13:9

First, the European freight forwarding software market remains structurally underpenetrated, with approximately 40% of forwarders still on legacy systems or spreadsheets.

Old: The source states there are approximately 14,000 freight forwarders and customs brokers in Europe, with CloudPivot serving 1,200 (8.6% penetration). It does not state that 40% of forwarders remain on legacy systems or spreadsheets.

New: The source states there are approximately 14,000 freight forwarders and customs brokers in Europe, with CloudPivot serving 1,200 (8.6% penetration). It does not state that 40% of forwarders remain on legacy systems or spreadsheets. but it does not specify that approximately 40% of forwarders are still on such systems or spreadsheets. The statement's specific percentage is not addressed.

### 14:2

First, the regulatory pathway under the EU Medical Device Regulation (MDR) has matured.

Old: The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances, which partially supports the statement that the regulatory pathway has matured. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

New: The source says "the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances." However, 'matured' implies a broader conclusion about the regulatory environment that the source does not explicitly state.

### 14:4

Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source says "payer willingness to reimburse CDS software has improved markedly" and separately notes reimbursement codes for digital health products improved across major European markets. but it does not address digital health products more broadly, which the statement claims.

### 14:7

At the same time, generative AI is exposing incumbents that lack credible AI strategies to renewed competitive risk from challengers - and from each other.

Old: The source says generative AI creates pressure on incumbents who lack credible AI strategies but does not specify the source of that pressure as challengers or other incumbents. The statement adds a specific competitive dynamic the source does not state.

New: The source says generative AI creates pressure on incumbents who lack credible AI strategies but does not specify the source of that pressure as challengers or other incumbents. The statement adds a specific competitive dynamic the source does not state. but it does not mention renewed competitive risk from challengers or from each other, which is an additional checkable claim.

### 14:8

The European market is structurally distinct from the US in ways that favour a thoughtful financial sponsor.

Old: The source says the European CDS market is structurally distinct from the US in several ways, and separately says there is opportunity for a thoughtful financial sponsor because the category has been under-served by private equity. It does not link the structural distinctions from the US to favouring a financial sponsor.

New: The source says the European CDS market is structurally distinct from the US in several ways, and separately says there is opportunity for a thoughtful financial sponsor because the category has been under-served by private equity. It does not link the structural distinctions from the US to favouring a financial sponsor. but it does not specifically state that these distinctions favor a thoughtful financial sponsor. The statement includes an evaluative claim not covered by the source.

### 15:9

Continued own-brand penetration uplift - own-brand share has grown from 38% in 2020 to 54% in 2025, with continued runway to 70% contributing material gross margin expansion.

Old: Part of this statement is in the source. Which part was not recorded.

New: 15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio." However, it does not explicitly state the 'continued runway to 70%' or the 'material gross margin expansion' as claimed in the statement.

### 15:30

We have completed comprehensive diligence covering commercial, financial, legal, and ESG dimensions; the conclusions are circulated separately.

Old: Part of this statement is in the source. Which part was not recorded.

New: The source describes commercial (Bain), financial/tax (Deloitte), legal (Latham & Watkins), and ESG (ERM) diligence streams, and notes the Bain report is circulated separately. However, it does not explicitly state that the conclusions are circulated separately.

### 15:32

We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses.

Old: The source expresses that the management team is strong and the value creation plan is well-defined, and recommends approval, but it does not use language of "high conviction" nor make any forward-looking promise about providing "further updates as the hold progresses." The statement adds a commitment the source does not contain.

New: The source expresses that the management team is strong and the value creation plan is well-defined, and recommends approval, but it does not use language of "high conviction" nor make any forward-looking promise about providing "further updates as the hold progresses." The statement adds a commitment the source does not contain. but does not address the value creation plan or the intention to provide further updates as the hold progresses.

### 16:2

The unit economics are exceptional for a brand at this stage.

Old: The source describes the EBITDA margin of 32.8% as "exceptional for a brand at this growth stage," not the unit economics generally. It says unit economics have "continued to improve" and remain attractive, but does not characterize the unit economics themselves as exceptional.

New: The source describes the EBITDA margin of 32.8% as "exceptional for a brand at this growth stage," not the unit economics generally. It says unit economics have "continued to improve" and remain attractive, but does not characterize the unit economics themselves as exceptional. However, the statement's broader claim about overall unit economics being exceptional is not fully addressed in the source.

### 18:6

The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen.

Old: Part of this statement is in the source. Which part was not recorded.

New: 18a_synth_cross_source_pair_initial states "Three factors drive our conviction." but does not specifically mention the comparison with Yardi Nordic or the market underpenetration and founder team claims.

### 20:8

Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026.

Old: The source does not mention pipeline preparation duration or the timing of first capital calls. The statement adds a Q2 2026 capital call expectation not present in the source.

New: The source does not mention pipeline preparation duration or the timing of first capital calls. The statement adds a Q2 2026 capital call expectation not present in the source. However, it does not mention the expectation of first capital calls in the second quarter of 2026.

## Problem 2. The unrecorded line in two places

Cards whose reason already named the gap and whose finding still said the part was not recorded: 12 before, 0 after.

The finding stays. When the card has a reason, the finding uses that reason. The unrecorded line is not repeated under it.

## Problem 3. The guard and the source's own words

Strings withheld on the stored pass that the guard now shows: 3.

- 06:3, evidenceSummary. 06_synth_listed_pe_report_excerpt states "Looking forward, we see continued growth opportunity for Cirrus in the UK and Irish mid-market, supported by structural demand for managed IT services as enterprises migrate to hybrid cloud architectures and address heightened cybersecurity requirements."

- 15:9, evidenceSummary. 15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio."

- 17:7, evidenceSummary. 17_synth_real_estate_logistics states "Urban last-mile logistics is one of the most structurally supported segments of European commercial real estate."

The five probe sentences from B462 are still an empty reason. A sentence that quotes the source and then grades the figure in the product's own voice is still withheld. A quotation that is not in the passage is still withheld.

## Invariants

Verdict, state, label, and tier: 261 of 261 unchanged.
Labelled faults: 13 of 13. Group A: 11 of 11.
Evidence leave-alone 48 of 74, combined quiet 30 of 74, on the old definition.
Evidence leave-alone 48 of 74, combined quiet 30 of 74, on the new definition.
Screen reason equals backend reason: 261 of 261.
Export sentence equals card sentence: every raised card.
Wording notes shown: 0.

## Tests

tests/b465-partial-reason.test.mjs. tests/b465-quoted-endorsement.test.mjs. src/modules/drafting/__tests__/b465-parity.test.js, which names lib/qc/quoted-span.mjs and lib/qc/partial-reason.mjs.

No existing assertion had to move. The partial editor's own tests still expect the explanation when the card has no compliant account, and that is still what they get.

Part 4 is the second look, in scripts/diagnostic/b465/NOTES.md. 8 of 113 wording notes change the claim a reader would act on. Discounted USD 1.5578. List USD 1.5578. 196 calls. Unpriced 0.

