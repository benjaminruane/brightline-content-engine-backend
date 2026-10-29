# B446

One pass. Cache off. Frozen statements. Build recorded on the pass file: `40af2fd`. Product code measured is 40af2fd. Evidence, editorial, compliance, commentary, and the reader's note were on. No prompt, rule, or detector was changed in this spec.

## Spend

List USD 24.260542. Discounted USD 19.910142. Calls 1747. Unpriced 0. Unpriced models: none.
Ceiling USD 40. List is USD 15.74 under the ceiling. The ceiling was not approached.
Input 7421322. Cached input 3480320. Output 151975.

## Predicted contribution

Lines 2 to 6 are the scan. A miss there is a defect. Lines 7 to 9 follow the model. A move of one or two statements is inside the run-to-run band. The band named before the run was about five percent of statements, and the instruction for that band was a move of one or two.

- 1. Craft notes withheld. Predicted 0 or 1 of 20. Found 15 of 20. Missed.
- Fixture 01. Phrase: empty
- Fixture 02. Phrase: empty
- Fixture 03. Phrase: empty
- Fixture 04. Phrase: empty
- Fixture 07. Phrase: empty
- Fixture 08. Phrase: empty
- Fixture 09. Phrase: empty
- Fixture 10. Phrase: empty
- Fixture 11. Phrase: empty
- Fixture 14. Phrase: empty
- Fixture 15. Phrase: empty
- Fixture 16. Phrase: empty
- Fixture 17. Phrase: empty
- Fixture 19. Phrase: empty
- Fixture 20. Phrase: empty
Each withheld fixture stored the reason empty on both attempts, and both attempt texts are blank. The raw reply is not in the file, so this pass cannot separate a blank model answer from a reply the parser did not keep. Fixture 12 was shown on the second attempt after a first attempt that was also empty. No stored refusal is a phrase from the craft-note ban.
- 2. percentage_notation. Predicted 36 statements, 59 occurrences, 36 concerns. Found 36 statements, 59 occurrences, 36 concerns. Met.
- 3. em_dash. Predicted 28 statements, 34 occurrences, 28 concerns. Found 28 statements, 34 occurrences, 28 concerns. Met.
- 4. First person, filed as first_person_plural or voice_consistency. Predicted 27 statements, 30 occurrences, 27 concerns. Found 27 statements, 30 occurrences, 27 concerns. Met.
Code split on that line: first_person_plural 27. A press-release pronoun would be voice_consistency. This pass filed all 27 as first_person_plural.
- 5. First-person concerns on investor_letter or linkedin_post. Predicted 0. Found 0. Met.
- 6. A statement has at most one concern for a scanned rule. Predicted 0 statements over that. Found 0. Met.
Every scanned concern stored at least one span.
Every stored scan concern matches a fresh scanMechanics call on the same statement.

- 7. Combined quiet. Predicted 32 of 74. Found 29 of 74. Missed. The move is larger than the run-to-run band.
- 8. Evidence leave-alone. Predicted 48 of 74. Found 45 of 74. Missed. The move is larger than the run-to-run band.
- 9. Catch. Predicted 11 of 11. Found 11 of 11. Met.
No planted fault was missed.

## Leave-alone

Scored with scripts/diagnostic/lib/leave-alone.mjs. Catch is the B441 definition: a planted fault is caught when any of the six layers spoke.

Evidence leave-alone: 45 of 74.
House-style mentions:
- em_dash: 7 mentions on 7 statements.
- first_person_plural: 7 mentions on 7 statements.
- percentage_notation: 15 mentions on 15 statements.
Combined quiet: 29 of 74.
Catch: 11 of 11.

Confirmed statements whose combined quiet changed against the B441 file:
- Fixture 02 index 0. Quiet true -> false. supported_full -> supported_full. Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix in a transaction valuing the Company at an enterprise value of USD 4 billion.
- Fixture 03 index 1. Quiet true -> false. supported_full -> supported_full. The investment will be made via a continuation fund managed by current owner Suma Capital, with Partners Group acting as cornerstone investor and taking two seats on the Company's board.
- Fixture 05 index 2. Quiet false -> true. supported_full -> supported_full. Norwell, headquartered in Cleveland, Ohio, supplies the major commercial aircraft original equipment manufacturers and the leading US defense primes.
- Fixture 05 index 4. Quiet true -> false. supported_full -> supported_full. Revenue has grown at a compound annual rate of approximately 11 percent over the past five years, supported by the post-pandemic recovery in commercial aerospace and sustained strength in defense end markets.
- Fixture 06 index 2. Quiet true -> false. supported_full -> supported_full. Adjusted EBITDA grew from GBP 41 million to GBP 78 million over the same period, with margins expanding from 21.9 percent to 25.0 percent.
- Fixture 06 index 11. Quiet true -> false. supported_full -> supported_full. Female representation in senior management across the portfolio reached 31 percent at the end of 2025, up from 26 percent at the end of 2024.
- Fixture 07 index 5. Quiet true -> false. supported_full -> supported_full. We expect significant disruption to the incumbent vertical SaaS industry, deep changes to commercial models, and strong winner-takes-most dynamics emerging within each vertical category.
- Fixture 13 index 3. Quiet true -> false. supported_full -> supported_full. It serves over 1'200 freight forwarder and customs broker customers across 28 European countries and generates annual recurring revenue (ARR) of EUR 84 million as of October 2025, up from EUR 52 million two years prior.
- Fixture 14 index 6. Quiet true -> false. supported_full -> supported_partial. The opportunity is for products that genuinely improve clinical workflows.
- Fixture 16 index 6. Quiet true -> false. supported_full -> supported_full. Channel mix is approximately 64 percent direct-to-consumer, 19 percent Amazon, 14 percent premium wholesale, and 3 percent clinic channel.
- Fixture 17 index 8. Quiet true -> false. supported_full -> supported_full. Demand growth [em dash] driven by continued e-commerce penetration and same-day/next-day delivery expectations [em dash] is running well ahead of supply, which is constrained by urban planning priorities and political resistance to logistics development in city centres.
- Fixture 19 index 3. Quiet false -> true. supported_full -> supported_full. Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges.
- Fixture 19 index 5. Quiet true -> false. supported_full -> supported_full. Continental Plastics, acquired in March 2023, has had a more difficult 2025 with revenue growth of only 4 percent against an underwriting of 9 percent and broadly flat EBITDA.

Confirmed statements whose evidence leave-alone changed against the B441 file:
- Fixture 02 index 0. Evidence-quiet true -> false. supported_full -> supported_full. Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix in a transaction valuing the Company at an enterprise value of USD 4 billion.
- Fixture 03 index 1. Evidence-quiet true -> false. supported_full -> supported_full. The investment will be made via a continuation fund managed by current owner Suma Capital, with Partners Group acting as cornerstone investor and taking two seats on the Company's board.
- Fixture 05 index 2. Evidence-quiet false -> true. supported_full -> supported_full. Norwell, headquartered in Cleveland, Ohio, supplies the major commercial aircraft original equipment manufacturers and the leading US defense primes.
- Fixture 07 index 5. Evidence-quiet true -> false. supported_full -> supported_full. We expect significant disruption to the incumbent vertical SaaS industry, deep changes to commercial models, and strong winner-takes-most dynamics emerging within each vertical category.
- Fixture 13 index 3. Evidence-quiet true -> false. supported_full -> supported_full. It serves over 1'200 freight forwarder and customs broker customers across 28 European countries and generates annual recurring revenue (ARR) of EUR 84 million as of October 2025, up from EUR 52 million two years prior.
- Fixture 14 index 1. Evidence-quiet false -> true. not reviewed -> supported_full. The category [em dash] software that helps clinicians make better, faster, more consistent treatment decisions at the point of care [em dash] is at a structural inflection point driven by three forces.
- Fixture 14 index 6. Evidence-quiet true -> false. supported_full -> supported_partial. The opportunity is for products that genuinely improve clinical workflows.
- Fixture 16 index 3. Evidence-quiet true -> false. supported_full -> supported_full. Trailing twelve months revenue is EUR 64 million, up from EUR 19 million in 2022 [em dash] a 47 percent compound annual growth rate.
- Fixture 17 index 10. Evidence-quiet false -> true. not reviewed -> supported_full. Levered at 55 percent loan-to-value, the base case generates an equity gross IRR of 16.8 percent and an MOIC of 2.1x over a five-year hold.
- Fixture 19 index 3. Evidence-quiet false -> true. supported_full -> supported_full. Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges.
- Fixture 20 index 0. Evidence-quiet true -> false. supported_full -> supported_full. We are pleased to announce the final close of Meridian European Industrials Fund V at hard cap, with total commitments of EUR 4.8 billion.

Planted faults whose catch changed against the B441 file:
None.

The house-style counts match the prediction made before the run: percentage_notation 15 on 15, em_dash 7 on 7, first_person_plural 7 on 7. The combined number is 3 below 32, and evidence leave-alone is 3 below 48. The gap between those two numbers is still 16, which is what the scan was predicted to open.
Five confirmed statements left quiet for a reason the scan did not predict. Fixture 02 index 0, editorial hyperbole_vs_qualitative. Fixture 03 index 1, compliance. Fixture 07 index 5, compliance. Fixture 13 index 3, editorial oxford_comma. Fixture 14 index 6, the evidence verdict moved from supported_full to supported_partial.
Two confirmed statements became quiet for a reason the scan did not predict. Fixture 05 index 2 lost a marketing_language_excess concern. Fixture 19 index 3 lost a materiality concern.
Evidence leave-alone also moved on statements that were already not combined-quiet. Fixture 16 index 3 gained internal_plausibility beside the percentage and the long dash. Fixture 20 index 0 gained a compliance concern beside first_person_plural. Fixture 14 index 1 and fixture 17 index 10 were not reviewed on B441 and are supported_full here, so they joined evidence leave-alone and stayed out of the combined number on a house-style concern.

## Craft

The comparison is in `scripts/diagnostic/b446/CRAFT.md`.

