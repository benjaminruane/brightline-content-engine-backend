# B448 craft read

The six craft rules, read against the draft-level note stored in `scripts/diagnostic/b448/notes.json`. The concerns are the ones on `scripts/diagnostic/b446/pass-1.json`. No rule was cut. No pipeline was run.

A concern is `same` when the note already made this point, `better` when it made the point and made it more useful, `related` when it touched the subject and did not make this point, and `silent` when it did not touch the subject. Those are the B446 words. All twenty notes are shown, so `silent` here means the note discussed something else.

The writer step on the fix from f89c0c4 stored 20 notes. Each call stopped on tool_use and the tool input's note is the stored text. Calls 20. Discounted USD 0.327255. Input 31661. Output 6758. Cached input 0. Unpriced 0. Opus has no cached rate, so discounted USD is the list figure. Ceiling USD 2. Not crossed.

## marketing_language_excess

14 concerns. Same 0. Better 2. Related 10. Silent 2.

- Fixture 01 index 8. Related. The note says summary adjectives are asserted rather than evidenced, and it names "exceptional unit economics" and "defensible competitive position". It does not name "strong product and management instincts".
  Concern: The phrase 'strong product and management instincts' implies an evaluative judgment without supporting evidence in the immediate context.
- Fixture 01 index 10. Better. The note quotes "exceptional unit economics" and says to replace the adjective with the underlying numbers. That is this point, and the instruction is more useful than a flag that only names the phrase.
  Concern: The phrase 'exceptional unit economics' uses hyperbolic language without substantiation in the immediate context.
- Fixture 02 index 5. Related. The note says the AI story and the competitive edge are asserted rather than developed. It does not name "exceptionally well positioned".
  Concern: 'exceptionally well positioned' is hyperbolic language without substantiation in the immediate context.
- Fixture 04 index 10. Related. The note says the letter leans on assertions the reader is asked to take on trust, and that the language should be softened to match what is known. It does not name "strong and underserved advertising audience".
  Concern: 'strong and underserved advertising audience' is a distinction-claim without substantiation in the immediate context. Remove or substantiate.
- Fixture 05 index 0. Silent. The note is about missing deal terms and an unsubstantiated space-applications line. It does not mention "a leading manufacturer".
  Concern: The phrase 'a leading manufacturer' is an unsubstantiated superlative. Remove or substantiate.
- Fixture 06 index 0. Related. The note names other conclusions the figures do not carry ("well positioned", "fundamentally sound"). It does not name "perform strongly".
  Concern: The phrase 'perform strongly' is a qualitative evaluation without specific supporting data in the immediate context.
- Fixture 08 index 8. Related. The note says the returns math should show how the four pillars become 2.4x and 19 percent, and that the tone is confident where the support is thin. It does not name "attractive returns".
  Concern: The phrase 'attractive returns' is a subjective evaluation without specific figures or context to substantiate it.
- Fixture 12 index 2. Silent. The note praises the metrics and then discusses the people section. It does not mention "substantial" or the transformation sentence.
  Concern: 'substantial' is an evaluative word that implies a significant degree of transformation without providing specific evidence in the immediate context.
- Fixture 12 index 8. Related. The note says the people section leans on soft adjectives and names grace, decisiveness, patience, and integrity. It does not name "genuinely exceptional".
  Concern: The phrase 'genuinely exceptional' is hyperbolic and asserts exceptionality without substantiation. Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.
- Fixture 13 index 8. Related. The note says the memo under-develops competitive response from legacy incumbents. It does not name "clear competitive lead".
  Concern: The phrase 'clear competitive lead' is a distinction-claim without substantiation in the immediate context.
- Fixture 14 index 3. Related. The note treats the regulatory-clearance moat as a strength. It does not say "real barriers to entry" is unsubstantiated.
  Concern: The phrase 'real barriers to entry' implies a strong competitive advantage without substantiation in the immediate context.
- Fixture 15 index 31. Related. The note says strong assertions sit on a single unsized mitigant, and that the upside language should be softened or the risks quantified. It does not name "exceptional category positioning".
  Concern: The phrase 'exceptional category positioning' uses hyperbolic language without substantiation in the immediate context.
- Fixture 18 index 6. Better. The note names "exceptional" among the unsourced superlatives in that thesis sentence, with the Yardi comparison and the 40 percent figure, and it asks for attribution and a downside. That is this point, and it is more useful than deleting the word.
  Concern: The phrase 'exceptional founder team' is hyperbolic and asserts exceptionality without substantiation. Remove the evaluative word.
- Fixture 19 index 4. Related. The note says the strong companies are told through favourable metrics with little risk, which gives the letter a promotional tilt. It does not name "performed exceptionally".
  Concern: The phrase 'performed exceptionally' is hyperbolic and asserts exceptionality without substantiation in the immediate context.

The rule earns its place. On twelve of the fourteen concerns the note does not name the flagged phrase. Twice it makes the point and is more useful, which shows the draft note can do this work and does not show that it replaces the sentence flag.

## materiality

11 concerns. Same 0. Better 2. Related 4. Silent 5.

- Fixture 01 index 5. Silent. The note discusses structure, one-sided risk, and summary adjectives. It does not mention the product-simplicity sentence.
  Concern: The statement about the product's simplicity does not add meaningful information or advance the argument in the context of the draft. It is an incidental fact without relevance to the thesis.
- Fixture 04 index 2. Silent. The note treats the engagement data as the letter's strength. It does not say "What attracted us was the user engagement profile" repeats that data.
  Concern: The statement 'What attracted us was the user engagement profile.' is redundant as the surrounding context already discusses user engagement metrics in detail.
- Fixture 04 index 15. Related. The note says the risk section gestures at "stress-tested for total loss" without the reasoning. It does not say "The risks are clear" adds nothing.
  Concern: The statement 'The risks are clear.' adds no meaningful information or context to the surrounding discussion of risks.
- Fixture 11 index 8. Better. The note names the Polish facility, with footprint optimisation, as asserted and not connected to the EBITDA step-up. That is this sentence, and the instruction to attribute it is more useful.
  Concern: The statement 'Manufacturing footprint optimisation and the new Polish facility completed the operational picture' does not add meaningful information or advance the argument. It lacks specific details or metrics that would substantiate its relevance to the investment thesis.
- Fixture 14 index 5. Better. The note asks the question the generative-AI sentence leaves out: if the technology pressures incumbents, why are the cleared incumbents the platforms rather than the vulnerable party. That advances the argument the sentence does not.
  Concern: The statement 'Third, generative AI is creating both opportunity and competitive pressure.' is vague and does not add meaningful information or advance the argument without further context or specifics.
- Fixture 14 index 8. Silent. The note discusses the MDR moat, buy-and-build, reimbursement, and AI gaps. It does not mention the Europe-versus-US sentence.
  Concern: The statement 'The European market is structurally distinct from the US in ways that favour a thoughtful financial sponsor' does not add meaningful information or advance the argument. It is a general observation without specific relevance to the surrounding discussion.
- Fixture 15 index 6. Silent. The note discusses pillars, mitigants, and upside against downside. It does not mention category leadership or the EUR 38 billion market.
  Concern: The statement 'Category leadership in the EUR 38 billion European premium homeware market [em dash] a structurally attractive category growing at 4-5% annually.' does not add meaningful information or advance the argument. It lacks context or explanation of how this leadership impacts the investment thesis.
- Fixture 15 index 9. Related. The note names "margin expansion to 70% own-brand" as quantified upside beside a qualitative downside. It does not say the 70 percent clause repeats the move from 38 percent to 54 percent.
  Concern: The phrase 'with continued runway to 70% contributing material gross margin expansion' adds little value as it repeats the idea of growth potential already implied by the increase from 38% to 54%.
- Fixture 15 index 27. Related. The note quotes "underlying relationships stable" as an assertion that is not sized or shown. The concern is that the sentence repeats the concentration point. Those are different points about the same line.
  Concern: The statement 'Underlying relationships are stable but the dependency is noted' does not add meaningful information or advance the argument. It restates the idea of dependency already implied by the previous mention of customer concentration.
- Fixture 17 index 7. Related. The note praises the urban last-mile tailwind as a clean link to the value-creation levers. It does not say the sentence lacks evidence.
  Concern: The statement 'Urban last-mile is one of the most structurally supported segments of European commercial real estate' does not add meaningful information or advance the argument. It is a general statement that does not directly support the investment thesis or provide specific evidence.
- Fixture 19 index 8. Silent. The note lists ESG as one stop in the letter's order. It does not discuss "Portfolio ESG performance has continued to mature".
  Concern: The statement 'Portfolio ESG performance has continued to mature' is vague and does not add meaningful information or advance the argument. It lacks specific details or metrics that would provide value to the reader.

The rule earns its place. Five of the eleven sentences are untouched. Four are touched as a different point. Two are made more usefully, which is overlap, not a replacement. B446 kept this rule because the note was empty. The notes exist now, and the sentence flag is still the only voice on the silent five.

## underreach_hedging

0 concerns. Same 0. Better 0. Related 0. Silent 0.

No concern to judge.

There is no comparison. The rule's job is stacked hedging, and the B446 pass did not raise one. Some notes ask the writer to soften a claim or to show the downside. That is a different instruction, and it is not a miss of a rule that did not speak. The rule should not be cut from a pass where it raised nothing.

## sentence_length

2 concerns. Same 0. Better 0. Related 0. Silent 2.

- Fixture 15 index 4. Silent. The note is about structure and about claims that rest on one mitigant. It does not mention the store-count sentence or its length.
  Concern: The sentence is long and contains multiple clauses, which may hinder readability. Consider breaking it into shorter sentences for clarity.
- Fixture 15 index 18. Silent. The note does not mention the UK-mitigation sentence or ask for any sentence to be broken up.
  Concern: The sentence is long and contains multiple clauses, which can make it difficult to read. Breaking it into shorter sentences would improve clarity.

The rule earns its place on these two sentences. Both sit on fixture 15, whose note is about claims and mitigants and never about length. Nothing else on this read asked for either sentence to be broken up.

## cliche_and_filler

0 concerns. Same 0. Better 0. Related 0. Silent 0.

No concern to judge.

There is no comparison. The rule's examples are stock fillers such as "at the end of the day" and "moving forward". The fixture 12 draft contains "the numbers tell one story; the team's transformation tells the bigger one." The stored note does not quote that line, and the line is not one of the rule's examples. The rule should not be cut from a pass where it did not speak.

## structural_integrity

2 concerns. Same 0. Better 0. Related 1. Silent 1.

- Fixture 12 index 6. Related. The note treats the Magnus line as a credit that should name something he did, and it quotes the soft adjectives grace and decisiveness. It does not call the line a fragment.
  Concern: The phrase 'Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.' is a sentence fragment. It lacks a main clause to form a complete sentence.
- Fixture 15 index 19. Silent. The note does not mention discretionary positioning, demand sensitivity, or a sentence that is grammatically incomplete.
  Concern: The statement 'The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.' is incomplete and lacks a main verb or clause to fully convey its meaning.

This rule does not earn the LinkedIn concern. Fixture 12 is a linkedin_post on the B446 pass. The rule's reviewer note for that output says a name plus a relative clause is acceptable and should not be flagged as a fragment. The stored note discusses the Magnus line as a credit to be made concrete. It does not call the line a fragment, so it agrees with the reviewer note and not with the flag.
The investor-letter concern had a note, and the note did not touch the sentence. That flag is the only voice on it. Keep the rule. Do not treat the LinkedIn fragment as a point in its favour.

## The LinkedIn line

CONFIRMED `lib/rulebook/editorialRules.js`, `structural_integrity`, `reviewerNoteByOutput.linkedin_post`:

> On linkedin_post: name-plus-relative-clause fragments and short list-style credit lines are acceptable structure [em dash] do not flag as sentence fragments. Flag only genuine grammatical breaks: dangling modifiers, run-ons, agreement errors.

CONFIRMED `scripts/diagnostic/b446/pass-1.json`: fixture 12 `outputType` is `linkedin_post`. Fixture 15 `outputType` is `investor_letter`.

The stored note for fixture 12 says the praise for Magnus leans on soft adjectives, grace and decisiveness, and that each credit should name a specific thing the person did. It agrees that the line is a credit, not a fragment.

## What this file can decide

Keep `marketing_language_excess`. The note names a phrase twice and leaves the other twelve to the sentence flag.

Keep `materiality`. The comparison is no longer an empty note. The rule is still the only voice on five of the eleven sentences.

Keep `sentence_length`. Both concerns are silent in a note that exists.

Leave `underreach_hedging` and `cliche_and_filler` where they are. Neither spoke.

Keep `structural_integrity`. The LinkedIn concern does not count in its favour. The investor-letter concern does, because the note never reached that sentence.

