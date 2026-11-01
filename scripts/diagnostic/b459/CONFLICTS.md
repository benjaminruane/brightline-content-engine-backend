# B459. Why a correct sentence is called a conflict.

Read of `scripts/diagnostic/b456/pass-1.json`, compared with `scripts/diagnostic/b446/pass-1.json` and `scripts/diagnostic/b455/pass-1.json`. No model call. USD 0. No product code, prompt, rule, or test was changed.

A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.

## What decides the class

All 30 cards have `displayVerdict` conflict and `supportState` conflicting. `displayVerdictReason` is empty on every one, so none of them was flipped by the scale check, the actor check, or the role check.

Stage 3 marks the statement conflicting when any source pair is conflicting. The pair class is the model's class, then the rounding and period backstops, then `demoteConfirmedClassifications` in `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs`. A confirmed passage is demoted when two figures share a name and differ in value. The name is the words sitting beside the figure. Two different measures that share a word, such as margin or net or a city, count as the same figure. A later support span can outvote the pair. The compact card keeps the pair's explanation and, when a backstop changed the class, `writtenFor`. It does not keep the span.

The line the card shows, `The sentence says ... The passage says ...`, was written afterwards from the quoted passage. On the false cards it is often a different difference from the pair that flipped the class.

## The four known-wrong cards do not share one cause

Three do. `01:9`, `09:1`, and `16:4` were confirmed by the model. The explanation was written for that class and says the figures match. `writtenFor` is confirmed. The demote then paired two figures that are not the same measure, and Stage 3 took the pair to conflicting. `01:9` pairs 60 with 24. `09:1` pairs 7 percent and 18.3 percent with 4 percent. `16:4` pairs gross margin 71.4 with EBITDA margin 32.8. On each, the passage states every figure the sentence states.

`01:9` is conflict, then fully supported, then conflict again across B446, B455, and B456. The demote runs on the passage the model returned. A different passage does not pair 60 with 24, so the class can sit still as confirmed. `09:1` and `16:4` are conflict on all three passes, because the passage that quotes both margins is the passage the model keeps returning.

`18:2` is the other cause. The model classified the initial source as conflicting and wrote the explanation for that class. The explanation says the draft has invested and the source recommends the investment. No figure pair fires. The same class is on all three passes. The figures match. The label calls the statement confirmed. Suppressing this shape of status conflict would also suppress `08:2`, `15:2`, and `18:0`, which are the same shape and are real. That trade is not available.

## Count

16 of the 30 can both be true. 14 of the 30 cannot.

Can both be true: 01:9, 04:3, 06:5, 08:6, 09:1, 11:7, 12:0, 14:11, 15:10, 15:11, 15:24, 16:4, 17:2, 19:1, 19:7, 19:13.

Cannot both be true: 05:0, 05:5, 08:2, 13:4, 13:7, 15:2, 18:0, 18:2, 18:3, 18:4, 18:5, 18:7, 18:8, 19:2.

Of the 15 with no label, 12 can both be true and 3 cannot. `14:11` carries a conflicting label, and the two passages can still both be true. `18:2` carries a confirmed label, and the status words cannot both be current. Those two are the places this reading and the worksheet disagree.

## The reader as a veto

Agreeing means the note bucket is conflicts. Wording, none, and beyond do not agree.

Of the 11 statements the labels call conflicting, the reader agrees on 6 and does not agree on 5: 13:4 (none), 13:7 (none), 14:11 (beyond), 18:0 (none), 18:8 (beyond).

Of the 4 statements the labels call confirmed, the reader agrees on none. A rule that showed a conflict only when the reader agreed would catch 4 of those 4 and would suppress 5 of the 11. The 11 include real conflicts the reader missed, among them the 142 against 167 headcount and the 2.8x base case against the updated 2.6x. The veto is not a fix.

## What a conflict card stores

The pair stores a class, a passage, and an explanation. When the demote or another backstop changes the class, `writtenFor` names the class the explanation was written for. It does not name the backstop or the two figures. The explanation on the three demoted label-confirmed cards says the source matches, so the stored sentence and the class contradict each other. The element is recoverable only by replaying the demote on the stored passage, which is what this read did.

When a span outvotes the pair, the span's passage and explanation are not on the card. `11:7` and `17:2` also have the silence `source_difference_missing`. The class is conflicting and the card has no difference. What would need storing, on the pair, is the backstop name and the two figure strings. On a span that changes the class, the span's passage, class, and explanation.

## Recommendation

Deterministic. Do not change what the model is asked. Do not require the reader to agree.

In `confirmingPassageVerdict`, do not treat a figure as clashing when that same value is already in the passage, and do not treat a pair as clashing when the rounding backstop already calls it within rounding. The first clause is what pairs 71.4 with 32.8, 60 with 24, and 7.2 years with 184 stores, even though the passage also states the draft's own number. The second is what pairs 17% with 17.1%. The guard stops the demote from creating a conflict. It does not clear a conflict the model already wrote, including a passage that repeats the draft figure in order to deny it.

On this pass the stored pair was flipped from confirmed, `writtenFor` confirmed, on `01:9`, `04:3`, `06:5`, `08:6`, `09:1`, `15:10`, `15:24`, `16:4`, and `17:2`. `19:1` is the same pair on the quoted passage, 0.94x against 2.13x, while the stored pair is still confirmed, so the flip sat on a span. The guard does not touch a labelled conflict. Those classes were set by the model, by the magnitude gap, or by a second value in the same source. `13:4` and `13:7` stay conflicts because the source states a second figure. `19:2` stays a conflict because the magnitude gap raises it. `08:2`, `15:2`, `18:0`, and `18:2` stay as they are, because they are status classes the model wrote, and clearing them clears real ones with them.

`11:7`, `12:0`, `15:11`, `14:11`, `19:7`, and `19:13` are not this demote. `12:0` quotes eighteen months while the same source states four and a half years. Clearing that wants the whole source, not a tighter pair, and it is a separate change. Storing the winning span comes first, so the next read is not guessing.

## The thirty

### 01:9

Label: confirmed. B446: conflict. B455: supported_full. B456: conflict.

Sentence: Shopify's 24 employees are based in Ottawa, where the Company has recruited strong design and engineering talent at 60-70% of comparable Silicon Valley or New York costs.

Passage: Shopify's 24 employees are located in Ottawa, Canada. Based on Shopify's reputation in Ottawa as a local internet startup success story, and based upon Tobi's reputation among the developer community, the company has been able to recruit some of the best development and design talent in Ottawa at 60%-70% of the cost of similar talent in Silicon Valley or New York.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 60 against 24.

Stored match (conflicting, 01_bvp_shopify_memo). Written for confirmed. The source confirms that Shopify's 24 employees are based in Ottawa and that the company recruits design and engineering talent at 60-70% of the costs in Silicon Valley or New York, matching the statement.

Line on the card: The sentence says "where the Company has recruited strong design and engineering talent". The passage says "the company has been able to recruit some of the best development and design talent in Ottawa".

Reader: wording. The source states Shopify's 24 employees are in Ottawa and that the company recruits top development and design talent at 60%-70% of the cost of similar talent in Silicon Valley or New York. The statement says "design and engineering" instead of "development and design," which conveys the same claim in other words.

The sentence and the source can both be true.

The passage states 24 employees in Ottawa and talent at 60-70% of Silicon Valley or New York cost. The code paired the 60 in that range with the 24, because both sit near the word Ottawa. The two sentences can both be true. The line the card shows is about design and engineering versus development and design.

### 04:3

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: Average session length on the Company's platform is approximately 14 minutes, compared to roughly 7 minutes on Facebook and 2-3 minutes on most social bookmarking products.

Passage: Average session length is 14 minutes - exceptional for a social product. By comparison, the average session length on Facebook is 7 minutes, and on most social bookmarking products is 2 to 3 minutes.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 3 against 2, and the draft value is also in the passage.

Stored match (conflicting, 04_synth_vc_pinterest_style_memo). Written for confirmed. The source confirms the average session lengths for Pinterest, Facebook, and other social bookmarking products as stated in the statement.

Line on the card: The sentence says "Average session length on the Company's platform is approximately 14 minutes". The passage says "Average session length is 14 minutes - exceptional for a social product".

Reader: none. No note.

The sentence and the source can both be true.

The passage states 14 minutes, 7 on Facebook, and 2 to 3 on bookmarking products. The code paired the 3 in the draft's 2-3 with the 2 in the source's 2 to 3. The 3 is also in the passage. The two sentences can both be true.

### 05:0

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: Halden Group has agreed to acquire Norwell Aerospace Components, a leading manufacturer of structural composite components and titanium machined parts, from Westhaven Capital.

Passage: Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint

Second passage on the card: Norwell Aerospace Components is a leading manufacturer of structural composite components and titanium machined parts

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 05_synth_competitor_press_release). The statement claims Halden Group has agreed to acquire Norwell Aerospace Components from Westhaven Capital, while the source states that Westhaven Capital has agreed to acquire Norwell Aerospace Components from Bridgepoint. This is a conflict in the named entities involved in the acquisition.

Line on the card: The sentence says "Halden Group has agreed to acquire Norwell Aerospace Components". The passage says "Westhaven Capital agrees to acquire Norwell Aerospace Components".

Reader: conflicts. The source states that Westhaven Capital is acquiring Norwell from Bridgepoint, not that Halden Group is acquiring it from Westhaven. Both the buyer and the seller named in the statement are wrong.

The sentence and the source cannot both be true.

The draft names Halden as the buyer and Westhaven as the seller. The passage names Westhaven as the buyer and Bridgepoint as the seller. Those cannot both be the deal.

### 05:5

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability.

Passage: The Company has invested significantly in new composite manufacturing capability during the Bridgepoint ownership period and now operates three of the most advanced automated composite layup facilities in North America.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 05_synth_competitor_press_release). The source states that Norwell invested significantly in composite manufacturing during the Bridgepoint ownership period, not during Westhaven's ownership. This is a direct conflict in the ownership context of the investment claim.

Line on the card: The sentence says "During Westhaven's ownership". The passage says "during the Bridgepoint ownership period".

Reader: conflicts. The source states that Norwell invested significantly in new composite manufacturing capability during the Bridgepoint ownership period, not during Westhaven's ownership. The acquisition by Westhaven has only just been announced.

The sentence and the source cannot both be true.

The draft places the investment during Westhaven's ownership. The passage places it during the Bridgepoint ownership period. Those cannot both be the period.

### 06:5

Label: unlabelled. B446: conflict. B455: supported_partial. B456: conflict.

Sentence: Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period.

Passage: Revenue for the year ended 31 December 2025 was EUR 218 million, only modestly above the EUR 196 million at the time of our investment. EBITDA of EUR 31 million represented a margin of 14.2 percent, broadly stable over the holding period.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: EUR 196 million against EUR 31 million, and the draft value is also in the passage.

Stored match (conflicting, 06_synth_listed_pe_report_excerpt). Written for confirmed. The source confirms the revenue and EBITDA margin figures for Moreno Iberica for the year ended 31 December 2025, matching the statement's figures and period.

Line on the card: The sentence says "EBITDA margins have been broadly stable at around 14 percent". The passage says "EBITDA of EUR 31 million represented a margin of 14.2 percent".

Reader: none. No note.

The sentence and the source can both be true.

The passage states revenue of EUR 218 million, modestly above EUR 196 million, and an EBITDA margin of 14.2 percent. The code paired the EUR 196 million with the EUR 31 million of EBITDA, because both sit near the word margin. The two sentences can both be true.

### 08:2

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.

Passage: Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.

Second passage on the card: The transaction will be funded with EUR 480 million of equity from Halden Group, EUR 130 million of equity from co-investors (currently anticipated to include two existing LP relationships), and EUR 540 million of senior and second-lien debt.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (partially_confirmed, 08_synth_industrial_buyout_memo). The source confirms the stake size and the parties involved but shows the transaction as proposed, not completed. The statement asserts a definite completed action, creating a modality conflict.

Line on the card: The sentence says "with the founding Schiller family and management retaining the balance". The passage says "with the remainder retained by management".

Reader: conflicts. The source describes the EUR 480 million equity investment and 78% stake as a proposed acquisition seeking committee approval, not a completed investment. The statement asserts "We have invested," which conflicts with the memo's forward-looking posture (exclusivity through 31 March, signing targeted 28 March, closing mid-June).

The sentence and the source cannot both be true.

The passage says Halden would acquire the stake, and the funding is described as what the transaction will use. The draft says we have invested. A proposed deal and a completed deal cannot both be the status. The stored pair is only partial. The explanation already names that status. The line the card shows is about who retains the balance, which is a different point.

### 08:6

Label: unlabelled. B446: conflict. B455: supported_partial. B456: conflict.

Sentence: Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%.

Passage: HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual growth rate of 17.1%.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 17% against 17.1%.

Stored match (conflicting, 08_synth_industrial_buyout_memo). Written for confirmed. The source confirms the revenue growth from EUR 312 million in 2020 to EUR 587 million in 2024, with a compound annual growth rate of 17.1%, which aligns with the statement's 17% CAGR.

Line on the card: The sentence says "a compound annual rate of 17%". The passage says "a compound annual growth rate of 17.1%".

Reader: wording. The source gives the CAGR as 17.1%; the statement rounds to 17%. The other figures and dates match exactly.

The sentence and the source can both be true.

The passage states EUR 312 million in 2020, EUR 587 million in 2024, and a compound annual growth rate of 17.1%. The code paired 17% with 17.1%. That is the rounding the magnitude check already calls within rounding. The two sentences can both be true.

### 09:1

Label: confirmed. B446: conflict. B455: conflict. B456: conflict.

Sentence: Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above plan with margins of 18.3 percent.

Passage: Revenue for the period reached EUR 318 million, 4% above plan. EBITDA of EUR 58 million was 7% above plan, with margins of 18.3% reflecting early traction on the procurement programme and favourable mix.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 7 percent against 4%, and the draft value is also in the passage; 18.3 percent against 4%, and the draft value is also in the passage.

Stored match (conflicting, 09_synth_portfolio_update_letter). Written for confirmed. The source confirms the statement's figures for revenue and EBITDA, including the percentage above plan and the EBITDA margin, for the same period.

Line on the card: The sentence says "Period revenue of EUR 318 million was 4 percent above plan". The passage says "Revenue for the period reached EUR 318 million, 4% above plan".

Reader: none. No note.

The sentence and the source can both be true.

The passage states EUR 318 million, 4% above plan, EBITDA of EUR 58 million, 7% above plan, and a margin of 18.3%. The code paired the 7 percent and the 18.3 percent with the 4%. The two sentences can both be true.

### 11:7

Label: unlabelled. B446: supported_full. B455: supported_full. B456: conflict.

Sentence: Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale.

Passage: We completed four bolt-on acquisitions over the hold period for a combined enterprise value of SEK 1.8 billion. The most significant was the acquisition of HeatTech GmbH in March 2023 for SEK 1.1 billion, which added German market presence and a complementary high-temperature product line.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (confirmed, 11_synth_investor_letter_exit). The source confirms the statement by detailing the completion of four bolt-on acquisitions, including HeatTech GmbH for SEK 1.1 billion, which aligns with the statement's claim of adding meaningful scale.

Line on the card: (none)

Reader: wording. The source describes four bolt-on acquisitions totalling SEK 1.8 billion in enterprise value, with HeatTech GmbH as the most significant at SEK 1.1 billion. The statement says the same, phrasing the aggregate contribution as "added meaningful scale."

The sentence and the source can both be true.

The passage states four bolt-on acquisitions and HeatTech at SEK 1.1 billion. The stored pair is confirmed, and the explanation says the source matches. No figure pair fires on that passage, and the card records no difference. The sentence and the passage can both be true.

### 12:0

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.

Passage: After eighteen months of work alongside the team, I'm delighted that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (confirmed, 12_synth_linkedin_post). The source confirms that Meridian Capital has completed the sale of NorTech Industries to Brookfield this week, matching the statement's claim.

Line on the card: The sentence says "After more than four years of partnership". The passage says "After eighteen months of work alongside the team".

Reader: wording. The source says the company was acquired in 2021 and sold four and a half years later, which the statement paraphrases as "more than four years." This is the same assertion in other words.

The sentence and the source can both be true.

The passage quoted on the card is eighteen months of work alongside the team. The same source says NorTech was acquired in 2021 and, four and a half years later, is an international business. More than four years and four and a half years can both be true. Eighteen months is a different duration in the same note. The stored pair is confirmed and talks about the sale.

### 13:4

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million.

Passage: On a trailing basis the Company generates an EBITDA margin of approximately 13%, reflecting continued investment in product and go-to-market.

Second passage on the card: Trailing twelve months revenue stands at EUR 76 million, with EBITDA of EUR 8.4 million representing an EBITDA margin of 11.1%.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 11.1% against 13%.
Second value in the source: 11.1% vs 13%.

Stored match (confirmed, 13_synth_internal_inconsistency_memo). The source confirms the statement by providing the same EBITDA margin of 11.1% on trailing twelve months revenue of EUR 76 million.

Line on the card: The sentence says "EBITDA margin is 11.1%". The passage says "EBITDA margin of approximately 13%".

Reader: none. No note.

The sentence and the source cannot both be true.

One passage states an EBITDA margin of about 13%. Another states 11.1% on EUR 76 million. The draft states 11.1%. The source's two margins cannot both be the margin. The second value is stored.

### 13:7

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.

Passage: The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.

Second passage on the card: CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: yes. Pairs: 320 against 285.
Second value in the source: employs 320 vs team of 285.

Stored match (confirmed, 13_synth_internal_inconsistency_memo). The source confirms that CloudPivot employs 320 people across the specified offices, matching the statement exactly.

Line on the card: The sentence says "The Company employs 320 people". The passage says "The total team of 285 people".

Reader: none. No note.

The sentence and the source cannot both be true.

One passage states 320 people in the named offices. Another states a team of 285. Those cannot both be the headcount. The stored explanation is the 320 passage and says they match. The card quotes the 285 passage.

### 14:11

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: We expect to bring a specific potential investment to consider over the coming months.

Passage: We are not yet in dialogue with any specific company. The purpose is to seek Committee endorsement of the thesis itself, which would authorise the team to begin active sourcing and to engage with potential targets at the appropriate level.

Second passage on the card: We are not recommending any specific investment at this time.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (partially_confirmed, 14_synth_thesis_only_memo). The source indicates that they are not yet in dialogue with any specific company, which partially supports the statement's expectation of bringing a specific potential investment to consider. The source outlines plans to begin active sourcing, but does not confirm the existence of a specific potential investment.

Line on the card: The sentence says "We expect to bring a specific potential investment to consider". The passage says "We are not yet in dialogue with any specific company".

Reader: beyond. The source says the team will return within six months with either a specific transaction memo or a refreshed thesis. The statement asserts a specific potential investment will be brought forward, dropping the alternative outcome the source presents.

The sentence and the source can both be true.

The passage says the team is not yet in dialogue with any specific company. The draft expects to bring a candidate over the coming months. Those can both be true. The source also says it will return with either a specific memo or a refreshed thesis, and that it is not recommending an investment now. The draft drops the second branch. The sentence label is already Goes beyond the source. The label on the statement is conflicting. On the two passages, the conflict verdict is the wrong class.

### 15:2

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: We have invested EUR 720 million of equity for an 84% stake.

Passage: We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A.

Second passage on the card: The Esposito family will retain a 10% interest. Management will retain 6%. Halden Group and co-investors will hold 84% in aggregate.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 15_synth_very_long_memo). The statement asserts a definite completed action ('We have invested'), while the source indicates that the investment is still proposed and pending approval ('We seek IC approval'). This is a status/modality conflict.

Line on the card: The sentence says "We have invested EUR 720 million of equity". The passage says "We seek IC approval for an investment of up to EUR 720 million of equity".

Reader: conflicts. The source says Halden Group and co-investors together hold 84% in aggregate, with EUR 720 million of equity from Halden Group plus EUR 110 million of co-investment and EUR 90 million of management rollover. The statement attributes the full 84% stake to the EUR 720 million alone, which conflicts with the source's allocation.

The sentence and the source cannot both be true.

The passage says the firm seeks investment-committee approval for an investment of up to EUR 720 million. The draft says we have invested. A request for approval and a completed investment cannot both be the status.

### 15:10

Label: unlabelled. B446: supported_full. B455: conflict. B456: conflict.

Sentence: The Atelier 73 growth concept - Atelier 73 is the Company's smaller, design-led store format positioned at a younger urban customer.

Passage: The Atelier 73 banner - relaunched in 2022 - operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 73 against 18, and the draft value is also in the passage.

Stored match (conflicting, 15_synth_very_long_memo). Written for confirmed. The source confirms that Atelier 73 is a smaller, design-led store format targeting younger urban customers, aligning with the statement's description.

Line on the card: The sentence says "Atelier 73 is the Company's smaller, design-led store format". The passage says "The Atelier 73 banner - relaunched in 2022 - operates 18 small-format stores".

Reader: wording. The source describes Atelier 73 as small-format stores targeting younger urban customers with a curated, design-led assortment. The statement restates this as a smaller, design-led store format positioned at a younger urban customer, which is the same assertion in other words.

The sentence and the source can both be true.

The passage says Atelier 73 operates 18 small-format stores aimed at younger urban customers, with a design-led assortment. The code paired the 73 in the name with the 18 stores. The two sentences can both be true.

### 15:11

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.

Passage: Fifth, the Atelier 73 concept has the potential to become a meaningful third growth pillar. The 18 stores operating today generate average four-wall margins of 18%, slightly below the core Casa Verde concept, but the format is younger, less proven, and at much earlier scale.

Second passage on the card: The Atelier 73 banner - relaunched in 2022 - operates 18 small-format stores targeting younger urban customers with a curated, design-led assortment.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (confirmed, 15_synth_very_long_memo). The source confirms that the Atelier 73 format operates 18 stores, matching the statement. The mention of it as a value driver aligns with the source's description of its potential as a growth pillar.

Line on the card: The sentence says "represents a fifth value driver". The passage says "has the potential to become a meaningful third growth pillar".

Reader: wording. The source states Atelier 73 operates 18 stores and presents it as the fifth pillar of the investment thesis, following four prior pillars. The statement restates this without changing the claim.

The sentence and the source can both be true.

The source says Fifth, then that Atelier 73 has the potential to become a meaningful third growth pillar, and that 18 stores operate today. The draft says a fifth value driver and 18 stores. The source uses both ordinals for two different roles. The sentence and the source can both be true.

### 15:24

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: 167 of 184 stores are leased with average remaining term of 7.2 years.

Passage: The Company leases 167 of its 184 store locations (the remainder are owned). Lease commitments are EUR 38 million annually with a weighted average remaining term of 7.2 years.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 7.2 against 184, and the draft value is also in the passage.

Stored match (conflicting, 15_synth_very_long_memo). Written for confirmed. The source confirms that 167 out of 184 stores are leased and states the average remaining lease term as 7.2 years, matching the statement exactly.

Line on the card: The sentence says "167 of 184 stores are leased". The passage says "The Company leases 167 of its 184 store locations".

Reader: none. No note.

The sentence and the source can both be true.

The passage states 167 of 184 stores leased and a remaining term of 7.2 years. The code paired 7.2 years with the 184. The two sentences can both be true.

### 16:4

Label: confirmed. B446: conflict. B455: conflict. B456: conflict.

Sentence: Gross margin is 71.4 percent and EBITDA margin is 32.8 percent.

Passage: Gross margin is 71.4%, reflecting the premium pricing and direct-to-consumer channel weight. EBITDA margin is 32.8%, which is exceptional for a brand at this growth stage and reflects both strong gross margins and disciplined marketing efficiency.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 71.4 percent against 32.8%, and the draft value is also in the passage.

Stored match (conflicting, 16_synth_healthcare_consumer). Written for confirmed. The source confirms the gross margin of 71.4% and EBITDA margin of 32.8% as stated in the statement. Both figures match exactly.

Line on the card: The sentence says "Gross margin is 71.4 percent". The passage says "Gross margin is 71.4%".

Reader: none. No note.

The sentence and the source can both be true.

The passage states gross margin of 71.4% and EBITDA margin of 32.8%. The code paired 71.4 with 32.8, because both sit near the word margin. The two sentences can both be true.

### 17:2

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: The Portfolio comprises 337,000 square metres of lettable area distributed across Greater London (89,000 sqm in three assets), Greater Paris (72,000 sqm in three assets), Greater Amsterdam (64,000 sqm in two assets), Greater Madrid (71,000 sqm in two assets), and Greater Milan (41,000 sqm in one asset).

Passage: The Portfolio comprises 11 last-mile logistics assets totalling 337,000 square metres of lettable area. Geographic distribution is: Greater London (3 assets, 89,000 sqm), Greater Paris (3 assets, 72,000 sqm), Greater Amsterdam (2 assets, 64,000 sqm), Greater Madrid (2 assets, 71,000 sqm), and Greater Milan (1 asset, 41,000 sqm).

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 72 against 3, and the draft value is also in the passage; 64 against 2, and the draft value is also in the passage; 71 against 2, and the draft value is also in the passage; 41 against 1, and the draft value is also in the passage.

Stored match (conflicting, 17_synth_real_estate_logistics). Written for confirmed. The source confirms the statement by providing the same figures for the total lettable area and its distribution across the specified regions.

Line on the card: (none)

Reader: none. No note.

The sentence and the source can both be true.

The passage states 337,000 square metres and the same city figures the draft states, including the asset counts. The code paired a city's area with that city's asset count. The two sentences can both be true. The card records no difference.

### 18:0

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.

Passage: We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.

Second passage on the card: We continue to recommend completion of the transaction on the terms set out in the original recommendation, subject to acknowledgment of the updated financial and operational figures above.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 18a_synth_cross_source_pair_initial). The statement asserts the completion of a transaction, while the source shows the transaction as still being recommended and not yet completed. This is a modality conflict.
Stored match (conflicting, 18b_synth_cross_source_pair_update). The statement asserts that the transaction with Nordic SaaS Holdings is completed, while the source indicates that the transaction is still recommended for completion, implying it has not yet been finalized. This is a status/modality conflict.

Line on the card: The sentence says "completion of the transaction". The passage says "recommend an investment".

Reader: none. No note.

The sentence and the source cannot both be true.

Both sources still recommend the transaction. The draft says the firm is writing to confirm completion. A recommendation and a completed deal cannot both be the status.

### 18:2

Label: confirmed. B446: conflict. B455: conflict. B456: conflict.

Sentence: We have invested EUR 158 million for a 60% controlling stake.

Passage: We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB ("NSH" or "the Company"), a Stockholm-headquartered B2B SaaS platform serving the Nordic real estate and property management sector.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 18a_synth_cross_source_pair_initial). The statement asserts a definite completed action ('We have invested'), while the source shows the transaction as a recommendation, indicating it is not yet completed. This is a modality conflict.
Stored match (no_support, 18b_synth_cross_source_pair_update). The source does not address the specific investment amount or stake percentage. It discusses updates to financial and operational figures but does not confirm or deny the investment details stated.

Line on the card: The sentence says "We have invested EUR 158 million for a 60% controlling stake.". The passage says "We recommend an investment of EUR 158 million for a 60% controlling stake".

Reader: wording. The source recommends an investment of EUR 158 million for a 60% controlling stake, while the statement phrases it as already invested. The figures match the source.

The sentence and the source cannot both be true.

The initial source says we recommend an investment of EUR 158 million for a 60% stake. The update still says the firm continues to recommend completion. The draft says we have invested. Those status words cannot both be the current state. The figures are the same. The label calls the statement confirmed, so the adjudication does not treat the tense as a conflict. This is not the figure-pairing fault.

### 18:3

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.

Passage: The Company currently serves 412 property management companies, not 380 as stated in our initial memo.

Second passage on the card: The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240,000 residential units.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 380 against 412, and the draft value is also in the passage.

Stored match (confirmed, 18a_synth_cross_source_pair_initial). The source confirms that the company serves over 380 property management companies across the specified Nordic countries, managing more than 240,000 residential units, matching the statement.
Stored match (conflicting, 18b_synth_cross_source_pair_update). The source states that the company serves 412 property management companies, which conflicts with the statement's claim of serving 380 companies.

Line on the card: The sentence says "serves 380 property management companies". The passage says "serves 412 property management companies".

Reader: conflicts. The statement says the Company currently serves 380 property management companies. The updated diligence memo states the Company currently serves 412, and that 380 was the figure from the initial memo that has since been corrected.

The sentence and the source cannot both be true.

The initial source states over 380 property management companies. The update states 412, and says 380 was the earlier figure. The draft states 380 as current. The current figures cannot both be true.

### 18:4

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year.

Passage: Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million.

Second passage on the card: Annual recurring revenue stands at EUR 38 million as of March 2025, up from EUR 28 million the prior year - representing 36% year-on-year growth.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: EUR 38 million against EUR 35 million, and the draft value is also in the passage; EUR 38 million against EUR 35 million, and the draft value is also in the passage; EUR 28 million against EUR 35 million; EUR 28 million against EUR 35 million.

Stored match (confirmed, 18a_synth_cross_source_pair_initial). The source confirms the statement by providing the same ARR figures for March 2025 and the prior year, along with the growth percentage.
Stored match (conflicting, 18b_synth_cross_source_pair_update). The source states the ARR as EUR 35 million at the end of April 2025, which conflicts with the statement's EUR 38 million as of March 2025. The source also clarifies the basis of the ARR figure, indicating a different reporting convention.

Line on the card: The sentence says "EUR 38 million as of March 2025". The passage says "EUR 35 million".

Reader: conflicts. The initial memo stated ARR of EUR 38 million as of March 2025, but the post-signing confirmatory diligence memo corrects this to EUR 35 million on a cleaned basis, with prior-year growth of 28% rather than 36%.

The sentence and the source cannot both be true.

The initial source states ARR of EUR 38 million. The update states EUR 35 million and says 38 was the earlier figure. The draft states 38 as of March 2025. Those cannot both be the current ARR.

### 18:5

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: The Company employs 142 people across Stockholm, Oslo, and Helsinki.

Passage: The Company employs 167 people as of 28 May, not 142 as stated in our initial memo. The difference reflects (a) the closing of two Norwegian hiring rounds that completed in late April and (b) the inclusion of approximately 18 contractors who function as full-time team members but had been excluded from the headcount provided to us initially.

Second passage on the card: The Company employs 142 people, with the majority based at the Stockholm headquarters and smaller offices in Oslo (12 people) and Helsinki (8 people).

Figure check on the stored passage: conflicting (rule b). Magnitude gap: yes. Pairs: 142 against 167, and the draft value is also in the passage; 142 against 18, and the draft value is also in the passage.

Stored match (confirmed, 18a_synth_cross_source_pair_initial). The source confirms the statement by stating that the company employs 142 people across Stockholm, Oslo, and Helsinki, with specific numbers for each location.
Stored match (conflicting, 18b_synth_cross_source_pair_update). The source states that the company employs 167 people, not 142 as mentioned in the statement. This is a direct conflict in the employee count.

Line on the card: The sentence says "The Company employs 142 people". The passage says "The Company employs 167 people".

Reader: conflicts. The initial memo stated 142 employees, but the updated confirmatory diligence memo states the Company employs 167 people as of 28 May, not 142.

The sentence and the source cannot both be true.

The initial source states 142 people. The update states 167 as of 28 May and says 142 was the earlier figure. The draft states 142 as current. Those cannot both be the headcount.

### 18:7

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.

Passage: Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure. The cleaned ARR (representing live, billing customer contracts only) is EUR 35 million.

Second passage on the card: Our base case envisages ARR growth from EUR 38 million today to approximately EUR 95 million over a five-year hold. This is supported by continued strong organic growth (we underwrite 22% ARR CAGR over the hold period), modest expansion into adjacent verticals (commercial property management), and selective add-on M&A.

Figure check on the stored passage: no demote. Magnitude gap: yes. Pairs: EUR 38 million against EUR 35 million, and the draft value is also in the passage; EUR 38 million against EUR 35 million, and the draft value is also in the passage.

Stored match (confirmed, 18a_synth_cross_source_pair_initial). The source confirms the statement's ARR growth projection from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by organic growth, expansion into commercial property management, and selective M&A.
Stored match (conflicting, 18b_synth_cross_source_pair_update). Written for partially_confirmed. The source provides a different starting ARR figure of EUR 35 million instead of EUR 38 million, which partially supports the statement. The source does not address the projected growth to EUR 95 million or the specific growth strategies mentioned.

Line on the card: The sentence says "EUR 38 million". The passage says "EUR 35 million".

Reader: conflicts. The statement gives the starting ARR as EUR 38 million. The source's updated memo states ARR is EUR 35 million, not EUR 38 million.

The sentence and the source cannot both be true.

The update states ARR of EUR 35 million, not the EUR 38 million the draft uses as the start of the base case. The magnitude check raised a partial reading to conflicting. The start figure cannot be both.

### 18:8

Label: conflicting. B446: conflict. B455: conflict. B456: conflict.

Sentence: The base case generates 2.8x MOIC and 23% gross IRR.

Passage: Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.

Second passage on the card: The base case generates a 2.8x MOIC and 23% IRR.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 2.8x against 2.6x, and the draft value is also in the passage; 23% against 21%, and the draft value is also in the passage.

Stored match (confirmed, 18a_synth_cross_source_pair_initial). The source directly states the same base case metrics of 2.8x MOIC and 23% IRR as the statement.
Stored match (conflicting, 18b_synth_cross_source_pair_update). The source states that the updated base case generates a 2.6x MOIC and 21% IRR, which conflicts with the statement's figures of 2.8x MOIC and 23% IRR.

Line on the card: The sentence says "The base case generates 2.8x MOIC and 23% gross IRR.". The passage says "Our updated base case generates a 2.6x MOIC and 21% IRR".

Reader: beyond. The source states the base case generates a 2.8x MOIC and 23% IRR, without specifying whether the IRR is gross or net. The statement adds "gross," a qualifier the source does not provide.

The sentence and the source cannot both be true.

The initial source states a 2.8x MOIC and 23% IRR. The update states an updated base case of 2.6x and 21%, and mentions the old 2.8x and 23% as the initial recommendation. The draft states 2.8x and 23% as the base case. The current base case cannot be both.

### 19:1

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x.

Passage: As of 31 December 2025: - Net IRR: 19.7% - Net MOIC: 2.13x - Net DPI: 0.94x

Second passage on the card: The Fund's net IRR as of 31 December 2025 stands at 19.7%, with a net MOIC of 2.13x and net DPI of 0.94x.

Figure check on the stored passage: conflicting (rule b). Magnitude gap: no. Pairs: 0.94x against 2.13x, and the draft value is also in the passage.

Stored match (confirmed, 19_synth_annual_report). The source confirms the statement by providing the same net IRR, net MOIC, and net DPI figures as of 31 December 2025.

Line on the card: The sentence says "the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x". The passage says "- Net IRR: 19.7% - Net MOIC: 2.13x - Net DPI: 0.94x".

Reader: none. No note.

The sentence and the source can both be true.

The passage states net IRR 19.7%, net MOIC 2.13x, and net DPI 0.94x. The code paired 0.94x with 2.13x, because both sit near the word net. The two sentences can both be true.

### 19:2

Label: unlabelled. B446: conflict. B455: supported_full. B456: conflict.

Sentence: The exit of NorTech Industries - which closed in January 2026 at SEK 18.4 billion and generated a 3.56x gross MOIC / 31.4 percent gross IRR - is the largest realisation in the Fund's history and the principal driver of the Fund's current returns trajectory.

Passage: The realisation of NorTech Industries closed on 19 January 2026 (post year-end, but discussed here given its significance to the Fund). The exit generated gross proceeds of SEK 12.8 billion to Fund IV on invested capital of SEK 3.6 billion, representing a 3.56x gross MOIC and 31.4% gross IRR. NorTech becomes the largest single realisation in Fund IV's history.

Figure check on the stored passage: no demote. Magnitude gap: yes. Pairs: no figure pair on the stored passage.

Stored match (conflicting, 19_synth_annual_report). Written for partially_confirmed. The source confirms the exit date, MOIC, IRR, and that NorTech is the largest realisation in the Fund's history. However, the source states the gross proceeds as SEK 12.8 billion, conflicting with the statement's SEK 18.4 billion.

Line on the card: The sentence says "SEK 18.4 billion". The passage says "SEK 12.8 billion".

Reader: conflicts. The source states the NorTech exit generated gross proceeds of SEK 12.8 billion, not SEK 18.4 billion as the statement claims.

The sentence and the source cannot both be true.

The passage states gross proceeds of SEK 12.8 billion. The draft states SEK 18.4 billion. The other figures in the sentence match. The proceeds cannot be both. The magnitude check raised the class. The explanation names both figures.

### 19:7

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.

Passage: Drift Logistics had a mixed 2025. The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year. The Company has nevertheless gained share, with revenue growing 6% against the negative market backdrop. EBITDA margins have been pressured by overcapacity in the market and have compressed from 14% to 12% year-on-year.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: 6 percent against 14%, and the draft value is also in the passage; 12 percent against 14%, and the draft value is also in the passage.

Stored match (partially_confirmed, 19_synth_annual_report). The source confirms the figures for parcel volume decline, revenue growth, and EBITDA margin compression. However, there is a period-role mismatch: the statement refers to 2024 as the investment vintage, while the source provides figures for the operating year 2025.

Line on the card: The sentence says "our 2024 third-party logistics investment". The passage says "Drift Logistics had a mixed 2025".

Reader: none. No note.

The sentence and the source can both be true.

The draft's 2024 is the year of the investment. The passage is the 2025 year and states parcel volumes down about 3%, revenue up 6%, and EBITDA margin from 14% to 12%. Those can both be true. The stored pair is partial and calls it a period mismatch. The raise from partial to conflicting is not stored.

### 19:13

Label: unlabelled. B446: conflict. B455: conflict. B456: conflict.

Sentence: Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch in the first and third quarters respectively.

Passage: We anticipate two additional realisations during 2026, with Brightway Industrial Coatings and Eltex Power Systems both progressing toward exit-readiness.

Second passage on the card: We have begun preliminary conversations regarding a potential exit in late 2026 or early 2027, although no formal process has been launched.

Figure check on the stored passage: no demote. Magnitude gap: no. Pairs: no figure pair on the stored passage.

Stored match (partially_confirmed, 19_synth_annual_report). The source confirms that both companies are progressing toward exit-readiness but does not specify the formal process launch periods as the statement does. The statement's specific timing for formal processes is not supported by the source.

Line on the card: The sentence says "formal processes likely to launch in the first and third quarters respectively". The passage says "two additional realisations during 2026".

Reader: beyond. The source says both companies are progressing toward exit-readiness and anticipates two realisations in 2026, but it does not specify Q1 and Q3 timing for formal process launches. For Brightway, the source says preliminary conversations have begun but no formal process has been launched.

The sentence and the source can both be true.

The passage says both companies are progressing toward exit-readiness and names two realisations in 2026. It does not give a first quarter and a third quarter. A later line says no formal process has been launched. A future launch and no process yet can both be true. The sentence adds timing. The sentence label is already Goes beyond the source.

## Files

- `scripts/diagnostic/b459/read.mjs`. Replays the demote, the magnitude gap, and the second-value check on the stored cards. No model call.
- `scripts/diagnostic/b459/CONFLICTS.md`. This report.
