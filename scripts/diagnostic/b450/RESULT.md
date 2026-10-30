# B450

## Which rules apply to the note

The note is prose an editor writes to a writer. It is not the draft. Universal house-style rules are the candidates. Voice, person, and rules whose job is to judge the draft's argument or register are excluded, because the note is allowed to talk about those things and must not be forced into the draft's voice.

Excluded:
- `first_person_plural`. The note speaks as an editor to a colleague. House voice and person do not apply to it.
- `defined_term_capitalisation`. The rule applies after a draft defines a term. The note is not that draft, and it defines nothing.
- `active_voice_preference`. This is a preference about the draft's sentences. The note's job is to discuss those sentences.
- `hyperbole_vs_qualitative`. The note exists to talk about this kind of language. Putting the rule on the note would fight that job.
- `register_consistency`. This is the draft's register. The note's register is already set by the prompt.
- `sentence_structure_clarity`. Clarity of the draft is what the note discusses. It is not a mechanical rule for the note's own characters.

The code enforces a rule only when one pattern has one correct form.

Enforced:
- `em_dash`. A long dash has one replacement, a hyphen. It is replaced inside a quotation as well, because the character must not reach the reader.
- `percentage_notation`. A number written as percent or per cent has one replacement, the % symbol. Inside a quotation the word stays, because the note may be quoting the draft.
- `smart_quotes`. A curly quote or apostrophe has one straight replacement. The words do not change.

Prompt only:
- `thousand_separator`. A comma is also a list comma, and a quoted figure must stay what the draft wrote. The rule also accepts a number with no separator. A rewrite cannot tell those apart.
- `currency_format`. Turning a symbol and a scale into an ISO code needs a table, and forms such as $4bn are ambiguous.
- `oxford_comma`. A list of two items must not gain a comma. The rule says to count the items before deciding. A rewrite cannot see that reliably.
- `english_variant`. Proper nouns keep their spelling, and licence is either a noun or a verb. A blind replace is not safe.
- `number_spelling`. Percentages, money, dates, ages, and units stay numerals, and month counts under 13 stay words. A rewrite will correct a number the rule says to leave.
- `date_format`. A numeric date such as 05/06/2026 does not say which number is the month.

## The prompt

```
Write one short note to the writer about the draft as a whole.
Speak as a senior editor talking to a colleague. Say what is strong and what is weak, plainly.
Do not label the parts of the note and do not go sentence by sentence.
Where a weakness has a clear example in the draft, quote the example rather than describing the problem in the abstract.
Do not claim the draft has been checked against the source.
These rules govern the note you are writing, not the draft you are reading. Do not comment on the draft's punctuation, number formatting, or house style. A separate check covers that.
Follow them in the note itself:
- thousand_separator: Use a high comma (apostrophe) thousands separator (5'500, 10'000), not a low comma or bare apostrophe in the wrong position. Write like this: The portfolio held 5'500 units at year end.
- currency_format: Currency amounts use the ISO 4217 code before the amount (EUR 445 million, USD 4 billion). Write like this: The transaction value was EUR 445 million.
- em_dash: Replace em-dashes with regular hyphens (-). Write like this: The Fund exited the position - ahead of plan.
- oxford_comma: Use the Oxford comma in lists of three or more items (A, B, and C). Write like this: The team included legal and tax advisers.
- smart_quotes: Use straight quotation marks (") and apostrophes (') only. No smart quotes. Write like this: The CEO said "growth remains on track".
- english_variant: Use US English spellings in general prose: organize, color, behavior, center, realize, recognize, defense, license, etc. Write like this: The team will organize the investor day in New York and recognize top performers.
- number_spelling: Spell out numbers 0-12; use numerals for 13 and above. Carve-outs: percentages, currency amounts, dates, ages, and measured physical units (km, kg, MW, %) always use numerals. Month and year counts in prose (twelve months, three years) follow the 0-12 spell-out rule - do not flag spelled-out forms. Write like this: The Fund made twelve investments and deployed capital across 14 sectors.
- percentage_notation: Percentages use the '%' symbol, not the word 'percent' or the two-word British 'per cent' (e.g. '5.4%' or '88%', not '5.4 percent' or '88 per cent'). Write like this: Net initial yield is 5.4%.
- date_format: Dates in prose use DD FullMonthName YYYY (e.g. '19 January 2026'). Write like this: The closing occurred on 19 January 2026.
Return JSON only: {"note":"..."}
```

## The writer step

Same twenty drafts. Writer only. No pipeline. The stored note is the text after substitution. `rawNote` is the tool input before it.

Withheld: 0 of 20. B449 was 0 of 20.
Mean note length: 1252 characters. B449 was 1152. B448, before the hand-written line, was 933.
Raw model output, before substitution: em dashes 0, en dashes 0, unquoted percent words 0, quoted percent words 2. B449 raw was 4 em dashes and 0 unquoted percent words.
Shown note, after substitution: em dashes 0, en dashes 0, unquoted percent words 0, quoted percent words 2.
British spellings, read from the notes rather than from the word list. The list matches endings, so it also catches ordinary words. On this run it matched raised (fixture 01), detours (fixture 17), and raising (fixture 20). None of those is a British spelling. Three more matches are the draft's own words inside a quotation: labour (fixture 07), annualised (fixture 09), and realisation (fixture 11). The note's own prose has one British spelling: fixture 19 writes "front and centre". B449, read the same way, had three, all in the note's own prose: realisation (fixture 11, "a single realisation"), standardised (fixture 13), and favour (fixture 17, "in favour of a hyphen"). The same word list on B449 also matched raised, labour, annualised, and precise, which are the same kind of miss. The target was 0. This run is 1.
Calls 20. Discounted USD 0.451005. Input 47241. Output 8592. Cached input 0. Unpriced 0.
Ceiling USD 2. Not crossed.
Opus records no cached input on this path, so discounted USD is the list figure.

## Each draft

- Fixture 01: shown. 1287 characters. Raw em 0, en 0, percent words 0.
- Fixture 02: shown. 1059 characters. Raw em 0, en 0, percent words 0.
- Fixture 03: shown. 1288 characters. Raw em 0, en 0, percent words 0.
- Fixture 04: shown. 1123 characters. Raw em 0, en 0, percent words 0.
- Fixture 05: shown. 1162 characters. Raw em 0, en 0, percent words 0.
- Fixture 06: shown. 1346 characters. Raw em 0, en 0, percent words 0.
- Fixture 07: shown. 1328 characters. Raw em 0, en 0, percent words 0.
- Fixture 08: shown. 1489 characters. Raw em 0, en 0, percent words 0.
- Fixture 09: shown. 1424 characters. Raw em 0, en 0, percent words 0.
- Fixture 10: shown. 1226 characters. Raw em 0, en 0, percent words 0.
- Fixture 11: shown. 1084 characters. Raw em 0, en 0, percent words 0.
- Fixture 12: shown. 930 characters. Raw em 0, en 0, percent words 0.
- Fixture 13: shown. 1216 characters. Raw em 0, en 0, percent words 0.
- Fixture 14: shown. 1421 characters. Raw em 0, en 0, percent words 0.
- Fixture 15: shown. 1535 characters. Raw em 0, en 0, percent words 0.
- Fixture 16: shown. 1112 characters. Raw em 0, en 0, percent words 0.
- Fixture 17: shown. 1413 characters. Raw em 0, en 0, percent words 0.
- Fixture 18: shown. 1180 characters. Raw em 0, en 0, percent words 0.
- Fixture 19: shown. 1356 characters. Raw em 0, en 0, percent words 0.
- Fixture 20: shown. 1056 characters. Raw em 0, en 0, percent words 0.

## House-style commentary

Read of all twenty stored notes. A note counts when it tells the writer to change the draft's punctuation, number formatting, or house style. Quoting a figure, or a percent word, as evidence for a substantive point does not count.

1 of 20. The target was 0.

Fixture 07: Also worth reconsidering the US/UK spelling mix ("labour", then presumably US readership) - pick a lane.

The other nineteen do not. Fixture 06 no longer closes by listing percentages. Fixture 16 quotes "approximately 14 percent annually" and the point is that one market figure is carrying the category thesis. Fixture 20 quotes "96 percent by capital" as evidence of franchise strength. Neither tells the writer to change the symbol.

Thousand separator. Fixture 13 does not mention 1'200 or 14'000. It asks the writer to reconcile EUR 84 million with EUR 81 million, to evidence the switching-cost claim, and to add the missing risks. Fixture 18 does not mention a thousands separator. It asks for churn and retention, a split of the ARR bridge, and a check on the Denmark office. Neither note contradicts the rule that an apostrophe thousands separator is correct when it is used consistently. B449 fixture 13 did, with "the thousands separators (1'200, 14'000) should be standardised to house style."

Length did not fall. Mean 1252 characters, against 1152 on B449 and 933 on B448. The formatting lectures fell from 14 of 20 to 1 of 20. The notes stayed long. The composed block is much longer than the one line it replaced.

Dashes and percent words improved on the raw output and stayed clean after substitution. Raw em dashes 0, against B449's 4. Raw en dashes 0. Raw unquoted percent words 0, the same as B449. Shown notes: 0 em dashes, 0 en dashes, 0 unquoted percent words. Two percent words remain, both inside quotations of the draft (fixtures 16 and 20). The carve-out keeps them.

Withheld stayed 0 of 20.

The number_spelling line in the composed block still contains the guide's words "do not flag spelled-out forms". The renderer drops a reviewer sentence that begins with "Do not flag". In this rule the phrase sits after a hyphen in the same sentence, so it stays. It points the same way as the scope line: do not police a spelled-out form. It was not rewritten by hand, and the run was not repeated to remove it.

