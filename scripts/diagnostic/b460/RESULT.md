# B460. A figure pair does not invent a conflict.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.

A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.

## What was built

Rule (b) in `confirmingPassageVerdict` no longer treats two figures as one quantity when the draft figure's number is already in the passage, or when the source number rounded to the draft's decimal places equals the draft. That is the same rounding test the magnitude backstop already uses. Rule (a), the single-money case, is unchanged. A class the model already set to conflicting is not opened.

Every step that changes a classification appends `{ rule, from, to, evidence }`. The evidence is the two figures, the two periods, or the span's passage and its class. The record is copied onto the match explanation and onto the card. The screen does not read it. The next stored pass will, through `compactCard`.

Rules recorded: `figure_pair`, `date_pair`, `single_money`, `magnitude_gap`, `within_rounding`, `procedural_closer`, `period_non_overlap`, `period_same_frame`, `period_frame_mismatch`, `empty_confirmation`, `span_outvote`, `second_value`, `superseded_source`, `coverage_union`, `omission_covered`, `empty_confirmation_recovery`, `excerpt_not_locatable`, `excerpt_honesty`, `framing_fidelity`, `actor_mismatch`, `scale_cause`, `role_party`, `generic_company`, `announcement_dateline`.

`lib/qc/pipeline-v4/prompts/source-difference.md` was already removed in B457. The test that asserts it is gone still passes. `buildSourceAccount` is removed from `lib/qc/source-account.mjs`. The live path did not import it. `assertsAgreement`, `sentenceIsTemplate`, `productSentences`, and `renderDifference` stay, because the B456 score and the B459 read still use them to recognise a stored sentence. The live quote check is `quoteIsVerbatim` in `lib/qc/evidence-line.mjs`.

## The 16 that can both be true

| Card | Before | After | Why |
| --- | --- | --- | --- |
| 01:9 | conflict | supported_full | the demote was the only conflict. Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable ... |
| 04:3 | conflict | supported_full | the demote was the only conflict. Average session length on the Company's platform is approximately 14 minutes, compared to roughly 7 minutes on Facebook and 2-3 minutes o... |
| 06:5 | conflict | supported_full | the demote was the only conflict. Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EB... |
| 08:6 | conflict | supported_full | the demote was the only conflict. Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%. |
| 09:1 | conflict | supported_full | the demote was the only conflict. Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above plan with margins of 18.3 pe... |
| 11:7 | conflict | conflict | The stored match is confirmed and says the source agrees. The conflict is a span, and the card's silence is source_difference_missing, so no difference was written. Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale. |
| 12:0 | conflict | conflict | The stored match is confirmed. The conflict is a span: the sentence says more than four years, and the source also gives the acquisition year. The span is not on the card. After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week. |
| 14:11 | conflict | conflict | Labelled conflicting. The stored match is partial, not a demoted confirmation. The sentence is already Goes beyond the source. Clearing the conflict would drop catch. We expect to bring a specific potential investment to consider over the coming months. |
| 15:10 | conflict | supported_full | the demote was the only conflict. The Atelier 73 growth concept - Atelier 73 is the Company's smaller, design-led store format positioned at a younger urban customer. |
| 15:11 | conflict | conflict | The stored match is confirmed. The source uses both fifth and third for the same format. The conflict is a span, not a figure pair. The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above. |
| 15:24 | conflict | supported_full | the demote was the only conflict. 167 of 184 stores are leased with average remaining term of 7.2 years. |
| 16:4 | conflict | supported_full | the demote was the only conflict. Gross margin is 71.4 percent and EBITDA margin is 32.8 percent. |
| 17:2 | conflict | supported_full | the demote was the only conflict. The Portfolio comprises 337,000 square metres of lettable area distributed across Greater London (89,000 sqm in three assets), Greater Pa... |
| 19:1 | conflict | conflict | The quoted passage contains both 0.94x and 2.13x, so this guard does not demote it. The stored match is still confirmed. The conflict was a span that was not stored. As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x. |
| 19:7 | conflict | conflict | The stored match is partial. 2024 is the investment year and the 2025 figures are in the passage. This was not a confirmed class demoted by a figure pair. Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 perc... |
| 19:13 | conflict | conflict | The stored match is partial. The sentence adds the quarters. The label is already Goes beyond the source. This was not a figure pair. Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch ... |

The nine demotions: 9 of 9 cleared.

The other seven of the sixteen were not this demote. They stay conflicts because a span or the model wrote them, not because a figure pair did:
- 11:7 stays conflict. The stored match is confirmed and says the source agrees. The conflict is a span, and the card's silence is source_difference_missing, so no difference was written. Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale.
- 12:0 stays conflict. The stored match is confirmed. The conflict is a span: the sentence says more than four years, and the source also gives the acquisition year. The span is not on the card. After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
- 14:11 stays conflict. Labelled conflicting. The stored match is partial, not a demoted confirmation. The sentence is already Goes beyond the source. Clearing the conflict would drop catch. We expect to bring a specific potential investment to consider over the coming months.
- 15:11 stays conflict. The stored match is confirmed. The source uses both fifth and third for the same format. The conflict is a span, not a figure pair. The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.
- 19:1 stays conflict. The quoted passage contains both 0.94x and 2.13x, so this guard does not demote it. The stored match is still confirmed. The conflict was a span that was not stored. As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x.
- 19:7 stays conflict. The stored match is partial. 2024 is the investment year and the 2025 figures are in the passage. This was not a confirmed class demoted by a figure pair. Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 perc...
- 19:13 stays conflict. The stored match is partial. The sentence adds the quarters. The label is already Goes beyond the source. This was not a figure pair. Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch ...

## The 14 real conflicts

All 14 stayed conflicts.

- 05:0 conflict -> conflict. Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium m...
- 05:5 conflict -> conflict. During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.
- 08:2 conflict -> conflict. We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the ba...
- 13:4 conflict -> conflict. EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million.
- 13:7 conflict -> conflict. The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.
- 15:2 conflict -> conflict. We have invested EUR 720 million of equity for an 84% stake.
- 18:0 conflict -> conflict. We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS pla...
- 18:2 conflict -> conflict. We have invested EUR 158 million for a 60% controlling stake.
- 18:3 conflict -> conflict. The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more th...
- 18:4 conflict -> conflict. It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior ...
- 18:5 conflict -> conflict. The Company employs 142 people across Stockholm, Oslo, and Helsinki.
- 18:7 conflict -> conflict. Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued orga...
- 18:8 conflict -> conflict. The base case generates 2.8x MOIC and 23% gross IRR.
- 19:2 conflict -> conflict. The exit of NorTech Industries - which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross I...

## The modality shape

`18:2` is the labelled case: invested against a source that still recommends the investment. `08:2`, `15:2`, and `18:0` are the same shape, a status the model wrote, and the figures match. The guard does not read status words, and it does not open a class the model set to conflicting.

- 18:2 conflict -> conflict. We have invested EUR 158 million for a 60% controlling stake.
- 08:2 conflict -> conflict. We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the ba...
- 15:2 conflict -> conflict. We have invested EUR 720 million of equity for an 84% stake.
- 18:0 conflict -> conflict. We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS pla...

All four are untouched.

## Catch, and what is left alone

Labelled faults: 13 of 13.
Group A: 11 of 11.

B458, on this same pass: old definition 49 of 74 and combined quiet 32 of 74, on the stored cards and on the B457 and B458 replays. New definition on the stored cards: 47 of 74 and 30 of 74. On the B457 and B458 replays the new numbers are 49 and 32.

This replay uses the same fact build as the B458 replay, then the display verdict after the guard.

Before, old definition: evidence leave-alone 49 of 74, combined quiet 32 of 74.
Before, new definition: evidence leave-alone 49 of 74, combined quiet 32 of 74.
After, old definition: evidence leave-alone 51 of 74, combined quiet 32 of 74.
After, new definition: evidence leave-alone 51 of 74, combined quiet 32 of 74.

Evidence leave-alone rose by 2, on both definitions: 09:1 (another layer still speaks), 16:4 (another layer still speaks). Combined quiet stayed 32 because those two still have another layer speaking. 01:9 is in the 74 and is no longer a contradiction. A source-recency concern still speaks, so it does not enter the leave-alone count. The other six demotions are not in the 74.

## Conflict cards that explain themselves

Before: 10 of 30. A conflict counts as explained when every conflicting match was written by the model and the explanation does not say the two sides agree, or a second value is stored and there is no flipped match.
After: 12 of 21. A flipped match is explained when the guard still names the pair, or a magnitude gap can be recomputed from the statement and the stored passage. A span that outvoted the pair is still not on this file.

Still not explainable from this stored card:
- 08:2. We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the ba...
- 11:7. Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale.
- 12:0. After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
- 13:7. The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.
- 14:11. We expect to bring a specific potential investment to consider over the coming months.
- 15:11. The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.
- 19:1. As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x.
- 19:7. Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 perc...
- 19:13. Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch ...

What would need storing, and what a later pass now stores: the span's passage and class, on `classificationRewrites`, rule `span_outvote`. This pass was stored before that field existed, so the replay cannot invent the span.

## Tests

`tests/b460-figure-pair.test.mjs` is new. It locks the four false pairs, the 12 percent against 9 percent demotion and its record, 320 against 285, a model conflict left untouched, a span outvote that records the passage and the class, and an empty confirmation that records the refusal.

`tests/b456-source-account.test.mjs` no longer calls `buildSourceAccount`. The writer was removed. The template, agreement, and refusal assertions stay. The quote assertion now calls `quoteIsVerbatim` in `lib/qc/evidence-line.mjs`, which is the live check. `productSentences` of an empty difference is still empty.

No test assertion was loosened. T5 in `tests/confirming-passage-cannot-confirm.test.mjs` still requires 12 percent against 9 percent to conflict.

## Census

The recount is `scripts/diagnostic/b460/CENSUS3.md`. It is every table row in sections 3 to 12 of the B426 census, plus the mode that has no row. Ordered by how often it fires. A site the code describes is restated as what the reviewer sees.

## Browser

Skipped. The visible change is a verdict on a future Review. Replaying a Review to see a label would spend a model call, and this spec spends nothing. The cards are not on the local screen.

