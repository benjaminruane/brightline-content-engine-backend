B492. The saved B490 runs read through the current code.
No model call. USD 0. Build includes B491.

A. Leave-alone drop
B488 replay of B486: 53 quiet of 74. B490 pass 1 with B491 applied: 48 quiet of 74. Pass 2: 50 quiet of 74.

Quiet in the B488 replay, raised on pass 1
02:0
statement: Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform, to Canada Pension Plan Investment Board and Equinix in a transaction valuing the Company at an enterprise value of USD 4 billion.
B488 label: Nothing raised
pass 1 label: Nothing raised
pass 2 label: Nothing raised
readingNote bucket: none
readingNote completion: pending
displayVerdict: supported_full
branch: readingState -> nothing_raised
leave-alone layers raised on pass 1: editorial
DIFFERS BETWEEN PASSES

03:1
statement: The investment will be made via a continuation fund managed by current owner Suma Capital, with Partners Group acting as cornerstone investor and taking two seats on the Company's board.
B488 label: Nothing raised
pass 1 label: Nothing raised
pass 2 label: Nothing raised
readingNote bucket: none
readingNote completion: none
displayVerdict: supported_full
branch: readingState -> nothing_raised
leave-alone layers raised on pass 1: compliance
SAME BOTH PASSES

06:4
statement: Moreno Iberica has had a more challenging period.
B488 label: Nothing raised
pass 1 label: Nothing raised
pass 2 label: Nothing raised
readingNote bucket: wording
readingNote completion: none
displayVerdict: supported_full
branch: readingState -> nothing_raised
leave-alone layers raised on pass 1: editorial
SAME BOTH PASSES

07:5
statement: We expect significant disruption to the incumbent vertical SaaS industry, deep changes to commercial models, and strong winner-takes-most dynamics emerging within each vertical category.
B488 label: Nothing raised
pass 1 label: Nothing raised
pass 2 label: Nothing raised
readingNote bucket: wording
readingNote completion: none
displayVerdict: supported_full
branch: readingState -> nothing_raised
leave-alone layers raised on pass 1: compliance
SAME BOTH PASSES

13:12
statement: We project ARR growth from EUR 81 million today to approximately EUR 195 million over a five-year hold, representing 19% CAGR.
B488 label: Nothing raised
pass 1 label: Conflicts with the source
pass 2 label: Conflicts with the source
readingNote bucket: conflicts
readingNote completion: none
displayVerdict: supported_full
branch: readingState -> conflicts
leave-alone layers raised on pass 1: editorial, note
SAME BOTH PASSES

Raised in the B488 replay, quiet on pass 1
none
Pass 2 against the same B488 set
quiet then raised: 03:1, 06:4, 07:5, 13:12
raised then quiet: 12:7

B. Which part was not recorded
pass 1
08:3
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

14:3
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

15:9
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

24:6
bucket: none
displayVerdict: supported_partial
shown label: Partly in the source
why: the bucket is none, not wording, so wordingUnrecordedQuiet does not return nothing_raised.

pass 2
14:3
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

14:8
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

15:30
bucket: wording
displayVerdict: supported_partial
shown label: Nothing raised
why: the rule did apply. The bucket is wording and the prose is the unrecorded sentence, so the shown state is nothing_raised. The prose on the card is still that sentence.

24:6
bucket: none
displayVerdict: supported_partial
shown label: Partly in the source
why: the bucket is none, not wording, so wordingUnrecordedQuiet does not return nothing_raised.

C. Raised with no reason
Shown tier light or demands, and readerEvidenceSentence empty.
The B490 gate counts a card only when shownState is one of beyond, conflicts, not_in_source, partial. Needs a look is note_withheld. Its tier is demands, and it is not in that set, so the gate counted 0 while these cards are still empty.
The same gate on these files: pass 1 0, pass 2 0.
pass 1
06:3	Needs a look	demands	note_withheld	We see continued strong demand for managed IT services in the UK and Irish mid-market and view Cirrus as well positioned to keep gaining share.
08:8	Needs a look	demands	note_withheld	Our value creation plan rests on four pillars, which we believe can deliver attractive returns over our planned five-year hold:
17:7	Needs a look	demands	note_withheld	Urban last-mile is one of the most structurally supported segments of European commercial real estate.

pass 2
06:3	Needs a look	demands	note_withheld	We see continued strong demand for managed IT services in the UK and Irish mid-market and view Cirrus as well positioned to keep gaining share.
11:11	Needs a look	demands	note_withheld	CEO Magnus Karlsson and the management team supported the Brookfield offer at the indicative stage; Brookfield's commitment to retain the Stockholm headquarters was an additional factor in the Company's preference.
12:0	Needs a look	demands	note_withheld	After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.
17:7	Needs a look	demands	note_withheld	Urban last-mile is one of the most structurally supported segments of European commercial real estate.

D. The company step
applyGenericCompanySuppress lifts a partial to fully backed and stripGapSentences deletes a sentence that says however and not. The stored rewrite generic_company and the silence gap_sentences_stripped are the record. A card is counted when the shown label changes once that prior verdict is put back, or a gap sentence was stored.
pass 1
0
none
pass 2
0
none
E. Reasons led by a file name
A shown reason that contains a token of the form 04_synth_... or 18a_...
pass 1
17
01:0	01_bvp_shopify_memo states "Shopify was founded in 2007 by two Ruby on Rails core developers."
04:12	04_synth_vc_pinterest_style_memo states "References from his time at Google are uniformly positive - he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it." It does not explicitly state that he is 'unusually focused on users and product' as a reputation at Google. The statement's emphasis on reputation is broader than the source's description.
08:10	08_synth_industrial_buyout_memo states "Revenue growth of 9% CAGR, taking 2024 revenue of EUR 587 million to approximately EUR 905 million by 2029." The source does not specifically attribute it to structural exposure to medical implants and aerospace build rate increases. The statement's causal link is an additional checkable claim not covered by the source.
11:7	11_synth_investor_letter_exit states "The most significant was the acquisition of HeatTech GmbH in March 2023 for SEK 1.1 billion, which added German market presence and a complementary high-temperature product line."
12:3	12_synth_linkedin_post states "Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland."
14:2	14_synth_thesis_only_memo states "First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances." 'matured' implies a broader conclusion about the regulatory environment that the source does not explicitly state.
14:4	14_synth_thesis_only_memo states "Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years." It does not address digital health products more broadly across the major European markets. The statement is broader in scope than the source.
14:8	14_synth_thesis_only_memo states "The European CDS market is structurally distinct from the US market in several ways." It does not specifically state that these distinctions favor a thoughtful financial sponsor. The statement includes an evaluative claim not directly addressed by the source.
14:11	14_synth_thesis_only_memo states "We are not yet in dialogue with any specific company."
15:11	15_synth_very_long_memo states "The 18 stores operating today generate average four-wall margins of 18%, slightly below the core Casa Verde concept, but the format is younger, less proven, and at much earlier scale."
15:19	15_synth_very_long_memo states "Consumer discretionary exposure." It does not explicitly link this sensitivity to the Company's discretionary positioning.
15:30	15_synth_very_long_memo states "Commercial diligence was conducted by Bain & Company over a ten-week period concluding in early January 2026." It does not mention financial, legal, or ESG diligence being completed, nor does it confirm the comprehensiveness of the diligence across all dimensions stated.
17:9	17_synth_real_estate_logistics states "Embedded rental reversion is estimated at approximately 18% across the portfolio, with the strongest reversion potential in the London and Amsterdam assets where market rents have grown most rapidly over the past three years."
18:0	18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."
18:9	18a_synth_cross_source_pair_initial states "NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity." The statement's use of 'defensible' and 'credible' adds evaluative framing not explicitly stated in the source. It does not address the claim about a credible operational team.
19:7	19_synth_annual_report states "The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year."
25:9	18a_synth_cross_source_pair_initial states "NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity." It does not explicitly state that the category is growing, making the statement broader in scope. It does not address the operational team or the growing category.

pass 2
15
01:0	01_bvp_shopify_memo states "Shopify was founded in 2007 by two Ruby on Rails core developers."
04:12	04_synth_vc_pinterest_style_memo states "References from his time at Google are uniformly positive - he is described as exceptionally product-focused, calm under pressure, and unusually willing to listen to user feedback and to evolve product decisions based on it." It does not specifically state that he is 'unusually focused on users and product' as a reputation at Google. The statement's emphasis on reputation is broader than the source's description.
04:13	04_synth_vc_pinterest_style_memo states "We expect this to remain a defining cultural attribute as the team grows." It states the team size as six full-time employees plus the two founders.
08:3	08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position." 'exceptional' is a broader evaluative claim not directly stated in the source.
12:3	12_synth_linkedin_post states "Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland."
14:2	14_synth_thesis_only_memo states "First, the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances." 'matured' implies a broader conclusion about the regulatory environment that the source does not explicitly confirm.
14:4	14_synth_thesis_only_memo states "Reimbursement codes for digital health products have improved meaningfully across the major European markets over the past three years." It does not address digital health products more broadly, which the statement claims.
14:11	14_synth_thesis_only_memo states "We are not yet in dialogue with any specific company."
15:9	15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio." It does not explicitly state the 'continued runway to 70%' or the 'material gross margin expansion' as the statement does.
15:32	15_synth_very_long_memo states "The management team is strong, the value creation plan is well-defined, and the financing structure is appropriately conservative." The source does not address the value creation plan or the intention to provide further updates as the hold progresses.
18:0	18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."
18:9	18a_synth_cross_source_pair_initial states "NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity."
19:7	19_synth_annual_report states "The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year."
25:0	18a_synth_cross_source_pair_initial states "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector."
25:9	18a_synth_cross_source_pair_initial states "NSH occupies a strong position in a deeply specialised vertical with high switching costs and a clear consolidation opportunity."

Summary
A. pass 1: 5 quiet then raised, 0 raised then quiet. pass 2: 4 quiet then raised, 1 raised then quiet.
B. pass 1: 4. pass 2: 4.
C. pass 1: 3. pass 2: 4.
D. pass 1: 0. pass 2: 0.
E. pass 1: 17. pass 2: 15.
