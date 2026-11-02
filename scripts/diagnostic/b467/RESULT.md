# B467. Six sites, and the instrument that ranks them

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

## What was built

Agreement is tested on the whole sentence. A possessive is not treated as a quotation, so the verb is still visible. The verb has to be about the statement. A negation, and a sentence that only reports what the source contains, stay.

A joined difference that starts with a bare verb takes the subject the model already wrote before the join. No new word is added.

Source awareness drops a concern only when the objection is causal or evaluative. House style, number form, and whether a sentence belongs in the draft stay. On a stored card those three drops are shown again.

A stored reason for a check that did not run is shown as a sentence. The slug is not shown.

The header names a conflict that sits on a card whose sentence state is not conflicts, when the draft would otherwise not say conflict. A needs-a-look card leads when nothing heavier is in the line. A draft that already names a conflict keeps its line.

The census counts the fault named by the reviewer sentence. Where the fault cannot be split from the population, the row says it cannot be counted.

Callers. assertsAgreement: reader-reason accept, the B456 score, the B460 replay, the B456 test, and the screen's allowed(). asOwnSentence: partial reason on both sides, and the reader reason that asks for it when the stored sentence is missing. applyEditorialSourceAwareness: stage 7 assemble, and the editorial tests. attentionHeader: the reading header, the B460 census, and the reading-view test.

## Problem 1. Agreement

08:3 now shows:

08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position."

14:2 now shows:

The source says "the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances."

Sentences on the pass that the wider test withholds, and that the eighty-character test did not. Each of these was a stored explanation or the stored prose. The shown reason changes only where that text was the sentence on the card.

- 08:3
  Before: The source describes the company's competitive position as 'enviable' in a specific vertical, which supports the statement's claim of an 'exceptional' competitive position. However, 'exceptional' is a broader evaluative claim that the source does not state.
  After: 08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position."
- 14:2
  Before: The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances, which partially supports the statement that the regulatory pathway has matured. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.
  After: The source says "the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances."

The other withheld explanations are 02:7, 04:15, 13:1, 13:2, 14:11, and 19:12. They were not the sentence on the card, so the card's reason is unchanged.

Cards with no reason under a raised verdict: 0.

## Problem 2. A joined sentence with no subject

08:10 before: The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. Does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.

08:10 after: The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. The source does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.

18:6 was the same shape. Before, the second sentence began "Does not specifically mention". The model wrote "but does not", and the subject "The source" is the opening of that explanation.

18:6 after: 18a_synth_cross_source_pair_initial states "Three factors drive our conviction." The source does not specifically mention the comparison with Yardi Nordic or the market underpenetration and founder team claims.

Reason faults, including a bare verb, a lowercase connective after a stop, a comma inside a closing quote, and a reason past three sentences: 0.

## Problem 3. House style survives

Shown again, verdict before clean, after concern:

- 16:0. Before: clean. After: concern.
  The list 'hormonal balance, energy and recovery, skin and hair health, and pregnancy and postnatal nutrition' is missing an Oxford comma before 'and pregnancy and postnatal nutrition'.
- 15:24. Before: clean. After: concern.
  The number '7.2' should be spelled out as it is below 13 and not a percentage, currency amount, date, age, or measured physical unit. Change '7.2 years' to 'seven years'.
- 09:12. Before: clean. After: concern.
  The statement 'Sophie Lehmann joined as Chief Commercial Officer in October' does not add meaningful information or advance the argument in the context of the draft. It merely states a fact without providing additional context or relevance to the investment commentary.

Still dropped:

- 04:6. The phrase 'exceptional engagement metrics' uses hyperbolic language without substantiation in the immediate context. Remove the evaluative word.
- 04:20. The phrase 'exceptional engagement' uses hyperbolic language without substantiation in the immediate context. Remove the evaluative word to maintain a factual tone.
- 05:6. The phrase 'three of the most advanced automated composite layup facilities' uses hyperbolic language without substantiation. Remove the evaluative language or provide supporting evidence.
- 07:5. The phrase 'strong winner-takes-most dynamics' uses hyperbolic language without substantiation. Remove or substantiate the claim.
- 10:0. The phrase 'a leading European producer' is a distinction-claim without substantiation in the immediate context.
- 13:10. The phrase 'very high switching costs' is a distinction-claim without substantiation in the immediate context.
- 14:6. The phrase 'genuinely improve' uses hyperbolic language without substantiation. The remaining clause still informs the reader about the opportunity for products that improve clinical workflows.
- 14:10. The phrase 'meaningful pan-European presence' implies a significant and exceptional presence without substantiation. Remove or substantiate the claim.
- 15:7. 'Exceptional' is a hyperbolic claim without substantiation in the immediate context.
- 18:6. The phrase 'genuinely market-leading' is hyperbolic without substantiation. The remaining clause still informs the reader about the product's strengths.
- 18:6. The phrase 'exceptional founder team' is hyperbolic without substantiation. The remaining clause still informs the reader about the leadership.

Leave-alone before the restore: evidence 48 of 74, combined quiet 30 of 74. With the label: 48 and 30.

After the three objections are restored: evidence 48, combined quiet 30. With the label: 48 and 30.

Cards whose editorial layer starts speaking because of the restore, inside the 74 confirmed statements: none. The three restored cards are not in that confirmed set, so both leave-alone figures stay.

## Problem 4. Not checked

11:9: This check did not run, because the match came back empty.
15:12: This check did not run, because the match came back empty.

## Problem 5. The header

Draft 19. Heaviest card verdict: conflict. Before: 2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance. After: 3 statements conflict with the source. 2 facts are not in the source, across 2 of your 14 statements

Draft 02. Heaviest card verdict: Needs a look. Before: 1 worth a glance. After: 1 statement needs a look. 1 worth a glance

Drafts whose header changed: 02, 19.

## Invariants

Verdict fields present on every card: 261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier are the stored values. None of this spec writes them.

Catch 13 of 13. Group A 11 of 11.

Screen drift: 0. Export differs from the card sentence: 0. Wording notes shown: 0. Unrecorded line: 2.

The B466 test required every stored sentence to stay, including 08:3 and 14:2. That assertion was wrong: those sentences tell the reader the source supports the statement. They are withheld, and the evidence line is what the card shows. The same test also required 08:10 to begin its second sentence with "Does not". That was the subjectless join this spec removes. The words after "does not" are unchanged.

The three B465 quote lines are still released. The banned word sits inside a quotation from the card's own passage.

- 06:3: 06_synth_listed_pe_report_excerpt states "Looking forward, we see continued growth opportunity for Cirrus in the UK and Irish mid-market, supported by structural demand for managed IT services as enterprises migrate to h
- 15:9: 15_synth_very_long_memo states "The Company's own-brand product penetration has grown from 38% in 2020 to 54% in 2025, supported by investment in the in-house design studio." It does not explicitly state the 'continued r
- 17:7: 17_synth_real_estate_logistics states "Urban last-mile logistics is one of the most structurally supported segments of European commercial real estate."
