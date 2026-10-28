# B443

The six craft rules from B442, read against the draft-level note on `scripts/diagnostic/b441/pass-1.json`. No model call. No change to a rule.

The file has 261 statements and 20 drafts. It stores `writerFeedbackStatus` on each draft. It does not store the note. CONFIRMED: the fixture keys are `fixtureId`, `ok`, `statementCount`, `stage1Source`, `wallMs`, `noteSpend`, `wordingNotesWithheld`, `writerFeedbackStatus`. The runner kept the status and dropped the text. CONFIRMED `scripts/diagnostic/b441/run.mjs` before this spec, the line that assigned `writerFeedbackStatus` and nothing else.

22 craft concerns. 11 sit on a draft whose note was withheld. 11 sit on a draft whose note was shown. Neither group can be compared. A withheld note is not scored as the rule surviving. A shown note with no stored text is not scored either.

## Withheld, not scored

These 11 have nothing to compare against.

`marketing_language_excess`

- Fixture 02 index 5. 'exceptionally well positioned' is hyperbolic language without substantiation in the immediate context.
- Fixture 04 index 10. The phrase 'strong and underserved advertising audience' uses evaluative language without substantiation. Remove 'strong and underserved' to focus on the factual description.
- Fixture 15 index 31. The phrase 'exceptional category positioning' uses hyperbolic language without substantiation in the immediate context. Remove or substantiate.

`materiality`

- Fixture 04 index 2. The statement 'What attracted us was the user engagement profile.' is redundant as the surrounding context already discusses user engagement metrics in detail.
- Fixture 04 index 15. The statement 'The risks are clear.' adds no meaningful information or context to the surrounding discussion of risks.
- Fixture 11 index 7. The statement 'Four bolt-on acquisitions, anchored by HeatTech GmbH for SEK 1.1 billion, added meaningful scale.' does not add meaningful information or advance the argument in the context of the surrounding sentences.
- Fixture 11 index 8. The statement 'Manufacturing footprint optimisation and the new Polish facility completed the operational picture' does not add meaningful information or advance the argument. It lacks specific details or metrics that would substantiate its relevance to the investment thesis.
- Fixture 15 index 6. The statement 'Category leadership in the EUR 38 billion European premium homeware market [em dash] a structurally attractive category growing at 4-5% annually.' does not add meaningful information or advance the argument. It lacks context or explanation of how this leadership impacts the investment thesis. The stored text has an em dash where this file has the bracket.
- Fixture 15 index 19. The statement 'The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.' is vague and does not add meaningful information or advance the argument. It lacks specific details or context that would make it relevant to the investment thesis or risk assessment.

`underreach_hedging`

- Fixture 04 index 19. The phrase 'consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team' uses stacked hedging language that weakens the statement without adding precision.

`sentence_length`

- Fixture 15 index 18. The sentence is long and contains multiple clauses, which can make it difficult to read. Consider breaking it into shorter sentences for clarity.

## Shown, text not stored

These 11 are on drafts whose status is `shown`. The note text is not in the file, so there is no judgement of same, better, related, or silent.

`marketing_language_excess`

- Fixture 01 index 10. The phrase 'exceptional unit economics' uses hyperbolic language without substantiation in the immediate context.
- Fixture 05 index 2. The phrase 'leading US defense primes' implies an unsubstantiated superlative market position. Remove or substantiate.
- Fixture 05 index 7. The phrase 'meaningful capacity to grow share' implies a significant opportunity without substantiation in the immediate context.
- Fixture 08 index 3. The phrase 'competitive position is exceptional' uses hyperbolic language without substantiation in the immediate context.
- Fixture 12 index 8. 'genuinely exceptional' is hyperbolic and lacks substantiation in the immediate context.
- Fixture 13 index 8. The phrase 'clear competitive lead' asserts exceptionality without substantiation in the immediate context.
- Fixture 19 index 4. The phrase 'performed exceptionally' is a hyperbolic claim without substantiation in the immediate context.

`materiality`

- Fixture 19 index 3. The statement 'Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges' adds little value as it is vague and does not provide specific information about the performance or challenges of the portfolio companies.
- Fixture 19 index 8. The statement 'Portfolio ESG performance has continued to mature' is vague and does not add meaningful information or advance the argument. It lacks specific details or metrics that would provide insight into the ESG performance.

`cliche_and_filler`

- Fixture 12 index 5. The phrase 'the numbers tell one story; the team's transformation tells the bigger one' is a cliché and does not add substantive information.

`structural_integrity`

- Fixture 12 index 6. The statement 'Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.' is a sentence fragment. It lacks a main clause to form a complete sentence.

## Does the rule survive on this evidence

None of the six can be kept or cut from this file. The comparison the question needs is the note, and the note is not there.

- `marketing_language_excess`. 10 concerns. 3 withheld, not scored. 7 shown, text missing. Not decided.
- `materiality`. 8 concerns. 6 withheld, not scored. 2 shown, text missing. Not decided.
- `cliche_and_filler`. 1 concern, on a shown draft, text missing. Not decided.
- `structural_integrity`. 1 concern, on a shown draft, text missing. Not decided.
- `sentence_length`. 1 concern, withheld. Not scored.
- `underreach_hedging`. 1 concern, withheld. Not scored.
