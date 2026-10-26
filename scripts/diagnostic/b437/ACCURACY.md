# Accuracy

B437 was free. This file is the measurement. Nothing in the product was changed.

## What the numbers say

The product catches the planted faults. It does not leave clean sentences alone.

Catch, both passes: **10 of 11**. The same fault was missed both times. Nine of the ten findings contain the planted number or the planted name. The tenth, F18 completion, does not contain the planted span as a substring. Its evidence line says the transaction has not been completed and the source is still a recommendation. That is the planted fault, named in other words.

Leave-alone is a confirmed label on which every layer stayed quiet. Pass 1: **20 of 74**. Pass 2: **21 of 74**. The other 54 on pass 1, and 53 on pass 2, were spoken about by at least one layer. Evidence by itself confirmed 60 of those 74 on both passes. The last evidence-only reading, 6 October, confirmed 65 of 74. This is not that run. Editorial, compliance, commentary, and the note were on, and five counts is outside the old identical-run noise of three counts. The evidence verdict moved. It is not only the note.

On pass 1 the note spoke on 38 of the 74, editorial on 20, evidence on 14, compliance on 6, recency on 4, and framing on 3. A statement can be in more than one of those. Thirty-five of the note's 38 are wording notes. A wording note says the claim is the same and the words are not. On a sentence the label calls confirmed, that is the product talking in order to agree.

Run to run, all 261 statements: **37 changed at all, 0 changed tier**. Tier is the sentence tier: demands, light, or quiet. Six changed display verdict. Six changed support state. Thirty-three changed concern codes, and that set includes the note's bucket. The sentence label did not change on any statement. Failure mode 10, on this set, is unstable notes and style codes. It is not an unstable tier, and it is not an unstable catch.

## What I would fix first to raise the catch rate

One sentence. "EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million." The source says both figures. The opening recommendation says the margin is approximately 13%. A later section says 11.1% on EUR 76 million. The card confirms the statement and quotes the 11.1% sentence. The note's bucket is none. Editorial and compliance are empty. The product found the sentence that agrees and never used the sentence that does not.

The fix is in evidence. A match on one figure is not confirmation when the same source states another figure for the same result. Do not ask the note to catch this. The note already speaks on 38 of the 74 clean statements.

## What I would fix first to lower the false alarms

Stop the note from writing when its own bucket would be wording. That is 35 of the 54 alarms on pass 1, and the note's text says the claim did not change. That fix does not catch the EBITDA miss. The two fixes do not have to fight. They fight if the way we chase the miss is to make the note more willing to dispute a number the evidence has already confirmed. That is the same note, pointed at the sentences it already comments on.

Editorial is the next pile, 20 of 74, and it is not catching the planted faults. On the two planted sentences where editorial spoke, it flagged "leading" and "meaningful capacity". It did not name Halden. Compliance spoke once, to ask for a hedge on "will support", and did not name Halden either. Style rules will keep firing on clean claims for as long as quiet includes style. That is a real tension with leave-alone, and it is a smaller one than the wording notes.

## How this was scored

Fixtures 01 to 20. Frozen statements from `scripts/diagnostic/accuracy/statements.json`, 261 of them. Stage 1 was not re-run. Labels from `labels.json`, unchanged. Group A from `group-a-design.json`, 11 planted spans, each mapping to one statement. Clean means the existing label `confirmed`: 74 statements, all in Group B. The other 26 labelled statements are partial, conflicting, or no support. They are not in the leave-alone rate. Nothing was relabelled.

A planted fault is caught when any layer raises it. Evidence raises it when the display verdict is not a confirmation, including `not reviewed`. Editorial, compliance, framing, and recency raise it when they have a concern. The note raises it when the bucket is conflicts, beyond, or wording. Naming the words means the finding contains the planted span, or a number or a capitalised name taken from that span. F18 completion is the one finding that names the fault without containing the span.

A clean statement is quiet when evidence confirms it and every other layer is empty and the note is `none` or absent. `not reviewed` is not quiet. On the two clean cards with that verdict, the summary says no source addresses the claim, and the excerpt is a source sentence that contains the figures. The reason field on both cards is empty.

The two passes are compared on sentence label, support state, display verdict, and concern codes. Concern codes include editorial, compliance, framing, and recency codes, plus `note:<bucket>`. Tier is `card.tier`.

The run used the local `AUTHORING_ORGANISATION` environment value. The log resolved it as Halden Group. One voice concern still said the authoring organisation is not identified in the draft.

Build under test: `dab9268`. Cache off (`QC_LLM_CACHE=0`, no disk cache). Evidence, editorial, compliance, and commentary on. The reader's note is the default, on.

## Estimate, then what it cost

The estimate uses `estimateReviewWork` with the system-token constants `api/analyse-statements.js` passes to preflight: editorial 9088, compliance 3000, stage 2 4000, stage 5 1600. Tokens are `ceil(chars/4)`. The scheduler's statement count from words was 273. The freeze is 261, and Stage 1 did not run, so the estimate is a little high on that part. The note step is not inside `estimateReviewWork`. Its tokens use the same `ceil(chars/4)` helper, priced at the opus rates in `lib/observability.js` (input 5.00, output 25.00 per million). Pipeline output is an allowance of 400 tokens a call. Note output is an allowance of 300 tokens a call. The scheduler does not estimate output.

Both passes, before any call: **USD 53.118025**. Pipeline USD 39.354215. Note USD 13.76381. That is under the USD 250 gate, so the passes ran.

One pass, scheduler request tokens, then the output allowance:

| Part | Tokens |
|---|---:|
| stage1 | 80069 |
| stage1b | 50000 |
| stage2 | 1875055 |
| stage5 | 491400 |
| editorial | 2678119 |
| compliance | 928200 |
| note input | 936881 |
| pipeline output allowance | 442000 |
| note output allowance | 87900 |

Scheduler wall for both passes is a TPM floor of 6.1 minutes at 2,000,000 tokens a minute. That is a rate-limit floor. The note step is one call after another, so the clock runs longer than the floor.

Actual, both stored passes: list **USD 50.432292**, discounted **USD 38.879812**, 3481 calls, 0 unpriced calls inside the meter. Input 15598539, cached input 9241984, output 300465. Local cache was off. The provider still cached input, which is why discounted is below list. Opus has no cached rate, so its list equals its discounted figure.

By model, both passes:

| Model | Calls | Input | Cached input | Output | Discounted USD |
|---|---:|---:|---:|---:|---:|
| openai/gpt-4o-2024-08-06 | 2782 | 12660032 | 9241984 | 201853 | 22.116130 |
| openai/gpt-4o-mini-2024-07-18 | 100 | 56426 | 0 | 4938 | 0.011427 |
| anthropic/claude-opus-4-7 | 599 | 2882081 | 0 | 93674 | 16.752255 |

Stored wall: pass 1 1139 seconds, pass 2 1187 seconds, sum 2325 seconds. Pass 1 includes the first fixture from the attempt that was stopped, because those cards were kept.

A first process was killed during fixture 02, after fixture 01 had been written. Fixture 02 was run again on resume, and that rerun is in the meter. The killed tail logged 9 stage 2 calls, 9 editorial completions, and 9 compliance completions. Commentary had been scheduled and the note had not started. Those calls were billed and the process died before it wrote their tokens. They are not in the 3481. Unpriced calls: at least 27, model `gpt-4o-2024-08-06`, tokens not stored.

## The miss

**F13-ebitda.** EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million.

Planted fault: Draft cites 11.1%. Source recommendation says approximately 13% and section 2 says 11.1%. Same-fact contradiction, no date defence.

Pass 1 and pass 2: display verdict `supported_full`, sentence state `nothing_raised`, note bucket none, editorial empty, compliance empty. The excerpt is: "Trailing twelve months revenue stands at EUR 76 million, with EBITDA of EUR 8.4 million representing an EBITDA margin of 11.1%." The summary says both figures are directly supported. The source's recommendation, earlier in the same file, says the margin is approximately 13%. Nothing in the card mentions 13. The matcher returned the agreeing sentence. No later layer reopened it.

## Caught faults

| Fault | Display verdict | Sentence state | Layers that spoke | Named the planted words |
|---|---|---|---|---|
| F05-acquirer | conflict | not_in_source | evidence (conflicting); editorial (concern); note (conflicts) | yes |
| F05-ownership | conflict | conflicts | evidence (conflicting); note (conflicts) | yes |
| F05-forward-support | supported_partial | not_in_source | evidence (partially_confirmed); editorial (concern); compliance (hard_concern); note (conflicts) | yes |
| F13-employees | conflict | nothing_raised | evidence (conflicting) | yes |
| F18-completion | conflict | nothing_raised | evidence (conflicting) | yes, in other words |
| F18-customers | conflict | not_in_source | evidence (conflicting); note (conflicts) | yes |
| F18-headcount | conflict | conflicts | evidence (conflicting); note (conflicts) | yes |
| F18-arr-current | conflict | not_in_source | evidence (conflicting); note (conflicts) | yes |
| F18-arr-growth | conflict | conflicts | evidence (conflicting); note (conflicts) | yes |
| F18-returns | conflict | beyond | evidence (conflicting); note (beyond) | yes |

F05 Halden support was a miss on the 6 October evidence-only run. It is a catch here: partial on the evidence, conflicts on the note, and the note names Halden. F13 employees was caught by evidence alone. The note stayed on none.

Editorial on F05-acquirer said 'leading' is an unsubstantiated superlative. Editorial on F05-forward-support said 'meaningful capacity to grow share' is unsubstantiated. Compliance on that same sentence asked for a hedge on 'will support'. None of those three findings name Halden or the missing actor. The fault was caught by evidence and by the note.

## False alarms

Every confirmed statement that a layer spoke on, pass 1. 54 statements. The sentence is the labelled statement. What it said is the finding, shortened.

**F01.** The Company is profitable and has raised just USD 1 million to date.

- note (wording): The source states Shopify is profitable and largely bootstrapped, having raised just $1mm to date. The statement conveys the same claim using "USD 1 million" instead of "$1mm."

**F01.** Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

- evidence (conflicting): conflict The statement conflicts with the source regarding the location of Shopify's talent recruitment. The source specifies that Shopify recruits talent in Ottawa at 60-70% of the cost compared to Silicon Valley or New York, but it does not state that all 24 employees are based in Ottawa. The source confirms the cost comparison figures of 60-70% and the reference to Silicon Valley and New York. The reviewer should reconcile the discrepancy about the employee location or adjust the statement...
- note (wording): The source states Shopify's 24 employees are in Ottawa and that the company recruits top development and design talent at 60-70% of the cost of similar talent in Silicon Valley or New York. The statement says "design and engineering" rather than "development and design," which is the same claim in other words.
- recency (recency): source_recency This claim rests on a source dated 12 October 2010 (16 years old) and is presented as current - confirm it's still accurate or add the timeframe.

**F01.** We recommend approval.

- evidence (no_support): not_supported No source addresses the recommendation for approval. Add a source that supports this recommendation or remove the claim.
- editorial (concern) [voice_consistency]: voice_consistency The statement 'We recommend approval.' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisation is not identified in this draft.
- note (wording): The source says "We recommend this investment" and seeks approval for BVP to invest. The statement rephrases this as "We recommend approval," which conveys the same assertion in different words.

**F02.** This transaction marks a successful control exit from the firm's data center portfolio, although Partners Group remains thematically focused on the data center sector across multiple geographies.

- note (wording): The source quotes Esther Peiner saying the sale of atNorth "marks a successful control exit from our data center portfolio" and that the firm remains "thematically focused on data center assets across the globe." The statement restates this in other words.

**F04.** The median active user pins around eight items per week.

- note (wording): The source states the median active user pins approximately 8 items per week. The statement says "around eight," which is the same claim phrased differently.

**F04.** These are exceptional engagement metrics for a consumer product at this stage.

- note (wording): The source repeatedly describes the engagement metrics (session length, sessions per week, repeat visit rate) as "exceptional" and calls them the strongest signal of product-market fit seen in a consumer investment in two years. The statement restates that same judgement.

**F04.** The Company's user base is unusual in two respects.

- evidence (partially_confirmed): supported_partial The source confirms that the company's user base is unusual in that engagement is primarily with content rather than with other people, which is atypical for social products. However, it does not address a second respect in which the user base is unusual. The reviewer should specify the second unusual aspect or adjust the statement to reflect only the confirmed characteristic. The mechanic sounds simple but the product has unusual characteristics. Most social products are co...
- note (beyond): The source describes the user demographic as unusual, citing that ~82% of active users are women and the base is weighted to 25-44 age range. The statement claims the user base is unusual in "two respects," framing it as a specific count, which the source does not enumerate as two distinct respects.

**F04.** The founders, Mr. Ben Silbermann and Mr. Evan Sharp, are first-time founders but our diligence has been deeply positive.

- evidence (partially_confirmed): supported_partial The source confirms that both Ben Silbermann and Evan Sharp are first-time founders. However, it only mentions that the diligence on Ben Silbermann has been deep, without addressing Evan Sharp. To fully support the statement, additional information on the diligence regarding Evan Sharp is needed. Consider adding this detail or revising the statement. Both founders are first-time founders. Our diligence on Ben has been deep. The source names the founders as Ben Silbermann and...
- editorial (concern) [voice_consistency]: voice_consistency The statement switches from third-person to first-person plural with 'our diligence has been deeply positive'. Investor letters should maintain a consistent first-person plural voice.
- note (wording): The source names the founders as Ben Silbermann and Evan Sharp without honorifics; the statement adds "Mr." but makes the same claim about them being first-time founders with positive diligence.

**F04.** The Company currently has 8 employees, including the founders, and 1.5 million monthly active users.

- evidence (partially_confirmed): supported_partial The source confirms the company has approximately 1.5 million monthly active users, but it provides a different context for the employee count. It mentions six full-time employees plus two founders, totaling eight, but does not clarify if the founders are included in the employee count. Verify the employee count context or adjust the statement to reflect the source's details. The team is small - six full-time employees plus the two founders. Current monthly active users are ...
- note (wording): The source says six full-time employees plus the two founders, which totals eight including the founders. The statement's "8 employees, including the founders" conveys the same count. MAU of 1.5 million matches.
- recency (recency): source_recency This claim rests on a source dated 14 May 2011 (15 years old) and is presented as current - confirm it's still accurate or add the timeframe.

**F04.** The current engagement profile may not survive scaling beyond the early adopter cohort.

- note (wording): The source states a meaningful risk that the strong engagement profile reflects the self-selected current user base rather than a sustainable property, and that it is unknown whether engagement metrics will hold as the user base broadens beyond the early adopter cohort. The statement restates this same concern in different words.

**F04.** We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team.

- evidence (partially_confirmed): supported_partial The source confirms that stress-testing for total loss has been conducted and is considered tolerable due to conviction in the engagement signal. However, it does not address the risk-adjusted return profile or mention the founder team. To fully support the statement, additional information on these aspects should be provided or the statement should be revised to align with the source. The downside case is total loss, which we have stress-tested and consider tolerable given ...
- note (beyond): The source says the downside case is total loss, stress-tested and tolerable given conviction in the engagement signal. The statement adds the founder team as a basis for tolerating the downside, which the source does not include in that specific justification.
- framing (framing): framing_fidelity The statement suggests that the risk-adjusted return profile is acceptable, which implies a stronger positive evaluation than what the source indicates by calling it tolerable.

**F05.** Norwell, headquartered in Cleveland, Ohio, supplies the major commercial aircraft original equipment manufacturers and the leading US defense primes.

- editorial (concern) [hyperbole_vs_qualitative]: hyperbole_vs_qualitative The phrase 'leading US defense primes' is a superlative market-position claim without substantiation in the immediate context.
- note (wording): The source says Norwell "counts" these customers among its long-standing customers; the statement says it "supplies" them. Same claim in different words.

**F05.** Revenue has grown at a compound annual rate of approximately 11 percent over the past five years, supported by the post-pandemic recovery in commercial aerospace and sustained strength in defense end markets.

- note (wording): The source states Norwell has grown revenue at a compound annual rate of approximately 11 percent over the past five years, benefiting from the post-pandemic recovery in commercial aerospace build rates and from sustained strength in defense end markets. The statement conveys the same assertion with minor rephrasing.

**F06.** Moreno Iberica has had a more challenging period.

- note (wording): The source says the Moreno Iberica investment has progressed more slowly than originally underwritten due to a challenging Iberian consumer environment and execution challenges. The statement restates this as a "more challenging period," which conveys the same assertion in different words.

**F06.** Operational changes introduced during 2025 - including a new Chief Commercial Officer and a new Chairman - are expected to begin contributing meaningfully in 2026, and we continue to view the underlying business as fundamentally sound.

- note (wording): The statement restates the source's claims about 2025 operational changes (new CCO and new Chairman), their expected meaningful contribution in 2026, and the view that the underlying business is fundamentally sound. The phrasing differs but the assertions match.

**F07.** This is not a thesis about general intelligence.

- note (wording): The source says "This is not a prediction about general intelligence." The statement rephrases "prediction" as "thesis" but makes the same assertion.

**F07.** We expect significant disruption to the incumbent vertical SaaS industry, deep changes to commercial models, and strong winner-takes-most dynamics emerging within each vertical category.

- compliance (hard_concern) [comparative_claim_without_basis]: comparative_claim_without_basis 'strong winner-takes-most dynamics' is a comparative claim without a named benchmark or supporting figure. Add a named benchmark or supporting figure.

**F08.** The Company's competitive position is exceptional.

- evidence (partially_confirmed): supported_partial The source describes the Company's competitive position as 'enviable' and highlights its status as one of three qualified suppliers globally for specific medical implants, but it does not use the term 'exceptional.' This is a material gap in terminology. The reviewer should consider revising the statement to align with the source's language or provide additional evidence to support the claim of being 'exceptional.' First, the Company occupies an enviable competitive position...
- editorial (concern) [marketing_language_excess]: marketing_language_excess 'exceptional' is a hyperbolic claim without substantiation in the immediate context.
- note (wording): The source calls HPC's competitive position "enviable" and describes it as one of three qualified global suppliers with durable customer relationships. "Exceptional" restates that same favorable judgement in different words.
- framing (framing): framing_fidelity The statement claims the competitive position is 'exceptional,' which is a stronger characterization than the source's description of it as 'enviable.' This is a material overstatement.

**F08.** Switching costs for medical device customers are very high - supplier qualification typically takes 18 to 24 months and involves clinical trial impact assessments.

- editorial (concern) [em_dash]: em_dash The statement uses an em-dash ( - ) instead of a regular hyphen (-).
- note (wording): The source says switching costs are "substantial"; the statement says "very high." Both convey the same judgement about magnitude, and the 18-24 month qualification timeline and clinical trial impact assessments match the source.
- recency (recency): source_recency This claim rests on a source dated 14 March 2025 (1.6 years old) and is presented as current - confirm it's still accurate or add the timeframe.

**F08.** The base case generates 2.4x MOIC and 19% gross IRR.

- note (wording): The source states the base case generates a 2.4x gross MOIC and a 19% gross IRR. The statement omits "gross" before MOIC but otherwise matches the figures.

**F08.** Principal risks include semiconductor cyclicality, customer concentration in medical implants, foreign exchange exposure, and the upcoming founder transition - each is understood and reflected in our planning, with specific mitigations in place.

- note (wording): The source lists the same four principal risks (semiconductor cyclicality, customer concentration, FX exposure, founder transition) and describes mitigations/comfort factors for each. The statement restates this in condensed form without altering the claim.
- recency (recency): source_recency This claim rests on a source dated 14 March 2025 (1.6 years old) and is presented as current - confirm it's still accurate or add the timeframe.

**F09.** Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above plan with margins of 18.3 percent.

- evidence (conflicting): conflict The source confirms the statement's figures for revenue of EUR 318 million, which was 4% above plan, and EBITDA of EUR 58 million, which was 7% above plan, with margins of 18.3%. However, there is a conflict noted in the source explanations, suggesting a discrepancy that needs to be reconciled. The reviewer should verify the source details and resolve any inconsistencies before relying on this information. Revenue for the period reached EUR 318 million, 4% above plan. EBITDA of EUR 5...

**F09.** We continue to expect base case returns of 2.4x MOIC and 19 percent IRR.

- editorial (concern) [voice_consistency, percentage_notation]: voice_consistency The statement uses first-person plural 'We continue to expect', which is inconsistent with the third-person voice required for reporting commentary. percentage_notation The statement uses '19 percent' instead of the '%' symbol.
- compliance (soft_concern) [return_figure_gross_net_qualifier_missing]: return_figure_gross_net_qualifier_missing The return figures '2.4x MOIC' and '19 percent IRR' are presented without a gross-or-net-of-fees qualifier.

**F10.** It supplies more than 600 customers worldwide, with particular strength in ultra-high-purity solvents used in semiconductor wafer fabrication and pharmaceutical active ingredient manufacturing.

- note (wording): The source says "active pharmaceutical ingredient manufacturing" and the statement says "pharmaceutical active ingredient manufacturing." This is the same assertion in reordered words.

**F11.** The realisation generates gross proceeds to Fund IV of SEK 12.8 billion on invested capital of SEK 3.6 billion - a gross MOIC of 3.56x and a gross IRR of 31.4 percent over a 4.7-year hold.

- editorial (concern) [percentage_notation, em_dash]: percentage_notation The statement uses '31.4 percent' instead of the '%' symbol for percentages. em_dash The statement uses an em-dash ( - ) instead of a regular hyphen (-).

**F11.** NorTech is the largest single realisation in Fund IV's history and moves the Fund's overall net IRR from 16.8 percent to 19.7 percent.

- editorial (concern) [percentage_notation]: percentage_notation The statement uses 'percent' instead of the '%' symbol for percentages.

**F11.** Manufacturing footprint optimisation and the new Polish facility completed the operational picture.

- editorial (concern) [voice_consistency]: voice_consistency The statement 'Manufacturing footprint optimisation and the new Polish facility completed the operational picture.' uses third-person voice, which is inconsistent with the first-person plural voice used elsewhere in the investor letter.
- note (wording): The source describes the manufacturing footprint optimisation (consolidating four Swedish facilities into two) and the new Polish facility opened in 2023 as the operational improvement pillar. The statement restates this in different words without changing the claim.

**F11.** Total Company revenue grew from SEK 4.2 billion at entry to SEK 11.4 billion at exit, with EBITDA expanding from SEK 480 million to SEK 2.08 billion and margins from 11.4 percent to 18.2 percent.

- evidence (not reviewed): not reviewed No source addresses the claim about Total Company's revenue, EBITDA, and margin growth. The statement mentions specific figures for revenue growth from SEK 4.2 billion to SEK 11.4 billion, EBITDA growth from SEK 480 million to SEK 2.08 billion, and margin expansion from 11.4% to 18.2%, but there is no source provided to confirm these details. The reviewer should add a source that supports these claims or remove the statement. At the time of our investment, the Company generated r...

**F12.** Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.

- editorial (concern) [structural_integrity]: structural_integrity The statement 'Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.' is a sentence fragment. It lacks a main clause to complete the thought.
- compliance (soft_concern) [named_individual_attribution_in_public_content]: named_individual_attribution_in_public_content Magnus Karlsson is attributed in this external post. Confirm consent has been obtained.

**F12.** Mikael Bergström, who navigated three generations of founding-family shareholder dynamics with patience and integrity.

- compliance (soft_concern) [named_individual_attribution_in_public_content]: named_individual_attribution_in_public_content Mikael Bergström is attributed in this external post. Confirm consent has been obtained.

**F12.** And the wider NorTech team across Stockholm and the new international footprint, who built something genuinely exceptional.

- editorial (concern) [marketing_language_excess]: marketing_language_excess The phrase 'genuinely exceptional' is hyperbolic and asserts exceptionality without substantiation. Removing 'genuinely exceptional' still leaves the reader with the information that the team built something significant.
- note (wording): The source says the wider NorTech team in Stockholm and across the new international footprint built something exceptional. The statement conveys the same assertion with "across Stockholm and the new international footprint" and "genuinely exceptional," which restates the source's phrasing.

**F13.** The Company has built strong fundamentals.

- evidence (partially_confirmed): supported_partial The source partially confirms the statement by describing CloudPivot as a high-quality asset with strong unit economics and a defensible competitive position. However, the term 'strong fundamentals' is broader and more evaluative than the specific attributes mentioned. The source does not address other potential aspects of 'strong fundamentals' such as financial stability or market performance. Consider clarifying or narrowing the statement to align with the specific attribu...
- editorial (concern) [hyperbole_vs_qualitative]: hyperbole_vs_qualitative The phrase 'strong fundamentals' is a qualitative descriptor that does not require substantiation. It is part of the working vocabulary of investment writing and does not constitute hyperbole.
- note (beyond): The source describes CloudPivot as a high-quality vertical SaaS asset with strong unit economics, a defensible position, and a clear growth runway, but it does not state that the Company has built "strong fundamentals" as a general characterization.
- framing (framing): framing_fidelity The statement uses 'strong fundamentals' which is broader and more evaluative than what the source confirms.

**F13.** It serves over 1'200 freight forwarder and customs broker customers across 28 European countries and generates annual recurring revenue (ARR) of EUR 84 million as of October 2025, up from EUR 52 million two years prior.

- evidence (not reviewed): not reviewed No source addresses the claim. The statement mentions serving over 1,200 freight forwarder and customs broker customers across 28 European countries and generating an annual recurring revenue of EUR 84 million as of October 2025, up from EUR 52 million two years prior, but there is no source provided to confirm these details. Please add a source or remove the claim. The Company serves over 1,200 freight forwarder and customs broker customers across 28 European countries.

**F13.** Third, the addressable European market of 14'000 forwarders gives meaningful headroom from the Company's current 8.6% penetration.

- note (wording): The source states there are approximately 14,000 freight forwarders and customs brokers in Europe and that CloudPivot's 1,200 customers represent an 8.6% penetration rate. The statement conveys the same figures and claim in different words.

**F13.** We project ARR growth from EUR 81 million today to approximately EUR 195 million over a five-year hold, representing 19% CAGR.

- editorial (concern) [first_person_plural]: first_person_plural The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisation is not identified in this draft.

**F14.** The category - software that helps clinicians make better, faster, more consistent treatment decisions at the point of care - is at a structural inflection point driven by three forces.

- note (wording): The source describes CDS as helping clinicians make better, faster, more consistent treatment decisions at the point of care, says the European market is at an inflection point, and lists three aligning forces. The statement restates the same claims in condensed form.

**F14.** Second, payer willingness to reimburse digital health products has improved markedly across the major European markets.

- evidence (partially_confirmed): supported_partial The source specifically mentions that reimbursement codes for digital health products have improved meaningfully across major European markets over the past three years, but it does not directly address payer willingness. This creates a gap between the statement and the source, as the statement claims a marked improvement in payer willingness. The reviewer should consider revising the statement to align with the source's focus on reimbursement codes or provide additional evi...
- note (wording): The source says "payer willingness to reimburse CDS software has improved markedly" as the second force, and separately notes reimbursement codes for digital health products have improved across major European markets. The statement combines these into payer willingness to reimburse digital health products improving across major European markets, which restates the same assertion.

**F14.** The opportunity is for products that genuinely improve clinical workflows.

- note (wording): The source says generative AI creates an opportunity to genuinely improve clinical workflows. The statement restates this as the opportunity being for products that genuinely improve clinical workflows, which is the same assertion in other words.

**F15.** The UK and Nordic launches are the largest single contributor to growth.

- editorial (concern) [voice_consistency]: voice_consistency The statement 'The UK and Nordic launches are the largest single contributor to growth.' uses third-person voice, which is inconsistent with the first-person plural voice used elsewhere in the investor letter.
- note (wording): The source states that "The UK and Nordic launches are the largest single contributor to our base case." The statement rephrases this as the largest single contributor to growth, which conveys the same assertion in different words.

**F15.** We have direct experience of homeware concepts that have failed in the UK market and have mitigated through detailed commercial diligence, a phased rollout, and a recruited UK country manager subject to deal completion.

- note (wording): The source says the team has direct experience of homeware concepts that have failed to translate into the UK market, and lists the same three mitigations: commercial diligence, a UK country manager (from Heal's) joining subject to deal completion, and a phased rollout. The statement conveys the same assertion in condensed form.

**F15.** Germany has been notably weak in 2025, while Italy and Spain remain strong.

- note (wording): The source states Germany's like-for-like growth was -2.8% in 2025 (actively negative) while Italy and Spain showed 5.2% and 6.1% like-for-like growth respectively. The statement restates this in general terms.

**F15.** We have stress-tested the model for sustained German weakness and the returns remain attractive.

- note (wording): The source states "We have stress-tested our model assuming sustained German weakness through 2027 and the returns remain attractive." The statement omits the "through 2027" timeframe but makes the same assertion.

**F16.** Trailing twelve months revenue is EUR 64 million, up from EUR 19 million in 2022 - a 47 percent compound annual growth rate.

- editorial (concern) [percentage_notation]: percentage_notation The statement uses '47 percent' - percentages should use the '%' symbol.
- compliance (soft_concern) [material_omission]: material_omission The statement 'a 47 percent compound annual growth rate' omits the specific time period over which this growth rate is calculated. Add the specific time period to provide full context.

**F16.** Gross margin is 71.4 percent and EBITDA margin is 32.8 percent.

- evidence (conflicting): conflict The source confirms the gross margin of 71.4% and the EBITDA margin of 32.8%, matching the statement exactly. However, the verdict is marked as conflicting, which suggests there may be an issue elsewhere not captured in the provided excerpts. The reviewer should verify the context or additional sources to resolve this apparent discrepancy before relying on the confirmation. Gross margin is 71.4%, reflecting the premium pricing and direct-to-consumer channel weight. EBITDA margin is 3...

**F17.** The transaction values the Portfolio at EUR 612 million, representing a going-in net initial yield of 5.4 percent and approximately EUR 1,820 per lettable square metre.

- editorial (concern) [percentage_notation]: percentage_notation The statement uses '5.4 percent' instead of the '%' symbol for percentages.

**F17.** Demand growth - driven by continued e-commerce penetration and same-day/next-day delivery expectations - is running well ahead of supply, which is constrained by urban planning priorities and political resistance to logistics development in city centres.

- editorial (concern) [em_dash]: em_dash The statement uses an em-dash (' - ') instead of a regular hyphen ('-').
- note (wording): The source states e-commerce penetration growth and same/next-day delivery expectations drive demand, while supply is constrained by urban planning priorities and local political resistance to logistics traffic. The statement restates these same drivers in paraphrased form.

**F18.** We have invested EUR 158 million for a 60% controlling stake.

- evidence (conflicting): conflict The statement claims a completed investment of EUR 158 million for a 60% controlling stake, but the source only recommends this investment, indicating it has not yet occurred. This is a modality conflict. The source does not confirm the specific investment amount or stake percentage as completed. The reviewer should reconcile this discrepancy or remove the claim. We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Compan...
- note (wording): The source recommends an investment of EUR 158 million for a 60% controlling stake, while the statement phrases this as already invested. The figures match the source.

**F19.** Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges.

- note (wording): The source describes strong performance across the substantial majority of investments, with Continental Plastics having a "more challenging" year and Drift Logistics having a "mixed" year - two notable challenges among the eight active companies. The statement restates this in summary form.

**F19.** Continental Plastics, acquired in March 2023, has had a more difficult 2025 with revenue growth of only 4 percent against an underwriting of 9 percent and broadly flat EBITDA.

- note (wording): The source says "more challenging 2025"; the statement says "more difficult 2025". This is a synonym and does not change the claim. All figures and dates match the source.

**F19.** We have responded with operational changes including a new Chief Operating Officer and a structured cost reduction programme targeting EUR 22 million of annualised savings; early progress is encouraging but the realisation timeline has lengthened by approximately 12 months.

- editorial (concern) [voice_consistency]: voice_consistency (i) The statement uses first-person plural 'We have responded', which is inconsistent with the third-person voice required for reporting commentary. (ii) The statement uses first-person plural 'We have responded', which is not acceptable in reporting commentary.

**F19.** All eight active portfolio companies have completed or are in the final stages of SBTi submission.

- note (wording): The source says all eight portfolio companies have completed SBTi submissions or are in the final stages of doing so. The statement says the same thing, specifying "active" which matches the source's eight active companies.

**F19.** We expect two further realisations during 2026.

- editorial (concern) [voice_consistency]: voice_consistency The statement uses first-person plural 'We expect', which is inconsistent with the third-person voice required for reporting commentary.
- note (wording): The source says "We anticipate two further realisations during 2026." The statement uses "expect" instead of "anticipate", which is a synonym and does not change the claim.

**F20.** We are pleased to announce the final close of Meridian European Industrials Fund V at hard cap, with total commitments of EUR 4.8 billion.

- editorial (concern) [voice_consistency]: voice_consistency (i) The statement uses first-person plural 'We are pleased' in a reporting commentary, which should use third-person voice. Replace 'We are pleased to announce' with 'The firm is pleased to announce'. (ii) The statement uses first-person plural 'We are pleased' in a reporting commentary, which requires third-person voice. Replace 'We are pleased to announce' with 'The firm is pleased to announce'.

**F20.** Demand exceeded the hard cap by approximately EUR 1.2 billion.

- compliance (soft_concern) [comparative_claim_without_basis]: comparative_claim_without_basis The statement 'Demand exceeded the hard cap by approximately EUR 1.2 billion' lacks a named benchmark or supporting figure for the hard cap. Add the specific hard cap figure or benchmark to provide context for the claim.

## Per layer

Catch is out of 11 planted faults. False alarms are out of 74 confirmed statements. Pass 1.

| Layer | Caught | Named the planted words | False alarms |
|---|---:|---:|---:|
| evidence | 10 | 10 (F18 completion counted by reading) | 14 |
| editorial | 2 | 0 | 20 |
| compliance | 1 | 0 | 6 |
| note | 8 | 8 | 38 |
| framing | 0 | 0 | 3 |
| recency | 0 | 0 | 4 |

The misses do not cluster in editorial or compliance. Those layers almost never raise the planted fault, and when they do they raise a style or a hedge point on the same sentence. The one miss is evidence, and the note did not rescue it. The false alarms cluster in the note, then editorial, then evidence.

Note false alarms by bucket: wording 35, beyond 3. The three beyond notes are on sentences the label calls confirmed: a user base that is "unusual in two respects", a downside that adds the founder team, and "strong fundamentals".

Evidence false alarms: 4 conflicting, 7 partially confirmed, 1 no support, 2 not reviewed. The no-support card is "We recommend approval." The label calls it confirmed. The summary says no source addresses the recommendation. A wording note on the same card says the source says "We recommend this investment" and the statement is the same claim. The two layers disagree with each other.

## Run to run

261 statements in both passes. **37 changed at all. 0 changed tier.**

Changed at all means sentence label, support state, display verdict, or concern codes differed. Changed tier means `demands`, `light`, or `quiet` differed. No sentence label changed.

| Fixture | What changed | Statement |
|---|---|---|
| 01 | supportState: supported -> skipped; displayVerdict: supported_full -> not reviewed | Shopify (the "Company") is a Canadian e-commerce platform serving small and medium businesses, founded in 2007 in Ottawa. |
| 01 | concerns: editorial:marketing_language_excess / framing:framing_fidelity / note:beyond -> editorial:marketing_language_excess / note:beyond | In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway. |
| 04 | concerns: note:wording / recency:source_recency -> note:none / recency:source_recency | Average session length on the Company's platform is approximately 14 minutes, compared to roughly 7 minutes on Facebook and 2-3 minutes on most social bookmarking products. |
| 04 | concerns: editorial:em_dash / editorial:marketing_language_excess / framing:framing_fidelity / note:beyond -> editorial:marketing_language_excess / framing:framing_fidelity / note:beyond | This combination - engaged users, female-skewed, older demographic - represents a strong and underserved advertising audience and supports a credible long-term monetization path... |
| 04 | supportState: partial -> supported; displayVerdict: supported_partial -> supported_full | Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product. |
| 04 | concerns: editorial:voice_consistency / note:wording -> note:wording | There is no revenue yet - the founders have deliberately deferred monetization in favour of growing engagement. |
| 04 | concerns: framing:framing_fidelity / note:beyond -> editorial:underreach_hedging / framing:framing_fidelity / note:beyond | We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team. |
| 04 | concerns: framing:framing_fidelity / note:conflicts -> editorial:marketing_language_excess / framing:framing_fidelity / note:conflicts | In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction. |
| 05 | concerns: compliance:forward_looking_statement_without_qualifier / editorial:marketing_language_excess / note:conflicts -> compliance:forward_looking_statement_without_qualifier / editorial:marketing_language_excess / framing:framing_fidelity / note:conflicts | Halden Group will support continued growth in commercial aerospace and an accelerated expansion of Norwell's space applications business, where the Company has identified meanin... |
| 06 | concerns: note:wording -> note:none | Operational changes introduced during 2025 - including a new Chief Commercial Officer and a new Chairman - are expected to begin contributing meaningfully in 2026, and we contin... |
| 08 | concerns: editorial:marketing_language_excess / framing:framing_fidelity / note:wording -> editorial:marketing_language_excess / note:wording | The Company's competitive position is exceptional. |
| 08 | concerns: note:wording / recency:source_recency -> editorial:voice_consistency / note:wording / recency:source_recency | - End-market growth - structural exposure to medical implants and aerospace build rate increases supports 9% compound revenue growth over the hold. |
| 08 | supportState: partial -> supported; displayVerdict: supported_partial -> supported_full | We have committed funding for two to three add-on acquisitions over the hold and have already identified the priority pipeline. |
| 08 | supportState: supported -> partial; displayVerdict: supported_full -> supported_partial; concerns: note:wording -> editorial:marketing_language_excess / framing:framing_fidelity / note:wording | In summary, the Company combines a defensible competitive position, structurally growing end markets, a clear operational improvement plan, and a credible M&A roadmap. |
| 09 | concerns: editorial:first_person_plural / note:wording -> note:wording | Six months after closing, our investment in Helvetia Precision Components is tracking modestly ahead of underwriting. |
| 12 | supportState: partial -> conflicting; displayVerdict: supported_partial -> conflict; concerns: compliance:comparative_claim_without_basis / editorial:em_dash / editorial:voice_consistency / framing:framing_fidelity / note:conflicts -> compliance:comparative_claim_without_basis / editorial:em_dash / editorial:voice_consistency / note:conflicts | NorTech is a Stockholm-headquartered manufacturer of industrial heating and cooling systems, and when we invested in 2021 it was a strong but underexposed business - dominant in... |
| 12 | concerns: compliance:comparative_claim_without_basis / editorial:marketing_language_excess / note:wording -> compliance:comparative_claim_without_basis / note:wording | The transformation since has been substantial. |
| 12 | concerns: compliance:named_individual_attribution_in_public_content / note:none -> compliance:named_individual_attribution_in_public_content / editorial:structural_integrity / note:none | Mikael Bergström, who navigated three generations of founding-family shareholder dynamics with patience and integrity. |
| 13 | concerns: editorial:hyperbole_vs_qualitative / framing:framing_fidelity / note:beyond -> note:beyond | The Company has built strong fundamentals. |
| 13 | concerns: editorial:first_person_plural / note:beyond -> note:beyond | Our base case generates 2.6x MOIC and 21% gross IRR. |
| 14 | concerns: framing:framing_fidelity / note:wording -> editorial:marketing_language_excess / framing:framing_fidelity / note:wording | Incumbents with serious clinical software have built up meaningful regulatory clearances, creating real barriers to entry. |
| 14 | concerns: note:beyond -> framing:framing_fidelity / note:beyond | At the same time, generative AI is exposing incumbents that lack credible AI strategies to renewed competitive risk from challengers - and from each other. |
| 14 | concerns: note:none -> note:wording | The competitive landscape is fragmented across national markets, with leaders in the UK, Germany, France, and the Nordics but few players with meaningful pan-European presence -... |
| 15 | concerns: note:none -> editorial:voice_consistency / note:none | We are writing to inform you of a new investment in Casa Verde Group (the "Company"), a Milan-headquartered premium European homeware and kitchenware specialist. |
| 15 | concerns: note:wording -> editorial:voice_consistency / note:wording | A well-defined international expansion runway - the Company has executed successful launches in France, Spain, and Germany, and we plan to enter the UK, Netherlands, and Nordics. |
| 15 | concerns: editorial:voice_consistency / note:none -> note:none | The base case generates 2.7x MOIC and 22% gross IRR. |
| 15 | concerns: note:wording -> editorial:sentence_length / note:wording | We have direct experience of homeware concepts that have failed in the UK market and have mitigated through detailed commercial diligence, a phased rollout, and a recruited UK c... |
| 15 | concerns: editorial:materiality / note:wording -> editorial:structural_integrity / note:wording | The Company's discretionary positioning means demand sensitivity to macroeconomic conditions. |
| 15 | concerns: note:none -> note:wording | This transaction has been negotiated bilaterally over an 18-month period with the Esposito family. |
| 16 | concerns: editorial:marketing_language_excess / note:beyond -> note:beyond | The unit economics are exceptional for a brand at this stage. |
| 16 | concerns: compliance:material_omission / editorial:percentage_notation / note:none -> compliance:material_omission / editorial:em_dash / editorial:percentage_notation / note:none | Trailing twelve months revenue is EUR 64 million, up from EUR 19 million in 2022 - a 47 percent compound annual growth rate. |
| 16 | concerns: note:none -> editorial:percentage_notation / note:none | Gross margin is 71.4 percent and EBITDA margin is 32.8 percent. |
| 16 | supportState: supported -> partial; displayVerdict: supported_full -> supported_partial | Our investment thesis rests on the structural attractiveness of premium women's health (a EUR-denominated category growing at approximately 14 percent annually), Bloom's defensi... |
| 17 | concerns: (empty) -> editorial:materiality | Urban last-mile is one of the most structurally supported segments of European commercial real estate. |
| 17 | concerns: note:none -> editorial:english_variant / editorial:voice_consistency / note:none | Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll during the hold period, executing a EUR 38 million value-add capex p... |
| 19 | concerns: note:wording -> editorial:hyperbole_vs_qualitative / note:wording | Meridian European Industrials Fund IV continues to perform strongly. |
| 19 | concerns: editorial:em_dash / editorial:percentage_notation / note:conflicts -> note:conflicts | The exit of NorTech Industries - which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR - is the largest realisation in the F... |

## Files

- `scripts/diagnostic/b437/estimate.mjs` prints the estimate. `estimate.json` is that print.
- `scripts/diagnostic/b437/run.mjs` is the harness. Two passes, cache off, frozen statements, all four layers on.
- `scripts/diagnostic/b437/pass-1.json` and `pass-2.json` are the cards and the spend.
- `scripts/diagnostic/b437/spend.json` is the combined meter.
- `scripts/diagnostic/b437/score.mjs` joins the labels. `extract.json` is that join.
- `scripts/diagnostic/b437/render-report.mjs` writes this file from those extracts.
- `scripts/diagnostic/b437/ACCURACY.md` is this report.

The clean ledger was not recomputed and not edited. The label files were not edited.

