# B442

What editorial said about writing that is already correct. Read from `scripts/diagnostic/b441/pass-1.json`. 261 statements. Every check on. Build recorded on that file: `896b514`. No model call. USD 0.

The clean set is the 74 statements the labels call confirmed. All 74 joined to a card.

## The two totals

On those 74 statements, editorial and style raised 25 concerns across 23 statements.

**17 are mechanics. 8 are craft.**

That is the split. Across all 261 statements the same grouping is 46 mechanics and 22 craft, 68 concerns on 61 statements. The clean-set pair is the one that matters here.

No statement in the clean set carries both a mechanics concern and a craft concern. Two clean statements carry two mechanics concerns: fixture 09 index 14 (person and percent) and fixture 11 index 2 (percent and em dash).

## How a concern was counted

A firing is one object in `editorialConcerns`. That array is the combined editorial and style review. Compliance, framing, and recency are not in it. Four voice concerns contain two numbered sentences under one object. Each of those is one firing.

The card stores `concernCode` and `text`. It does not store category. CONFIRMED `scripts/diagnostic/b441/run.mjs` lines 44 to 53. The stated category below is the book the id belongs to, which is the category salvage writes when the model's tag disagrees with the book. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` lines 252 and 559 to 599. A mis-tag that was rewritten is not visible on this file.

Editorial ids and their `category: "editorial"` field: `lib/rulebook/editorialRules.js`. Style ids: `lib/qc/style-guide.mjs`. The style objects have no category field. The prompt requires the tag `style_guide`. Every id that fired is in exactly one of those two books.

An evidence finding, for the overlap below, is a display verdict other than `supported_full`. That includes partial, conflict, no support, and not reviewed. `evidenceFindings` is empty on all 261 cards, so it is not the count. The editorial verdict matches the concern list on every card.

## Each rule

Fired, then clean firings, then clean statements. The example is verbatim from the card.

### percentage_notation

Stated category style_guide. Mechanics. 18 firings, 18 statements. Clean: 6 firings, 6 statements.

Fixture 17 index 1: The statement uses '5.4 percent' instead of the '%' symbol for percentages.

### voice_consistency

Stated category editorial. Mechanics. 17 firings, 17 statements. Clean: 6 firings, 6 statements.

Fixture 06 index 6: The statement uses first-person plural 'we' in a reporting commentary, which requires third-person voice.

The book calls this editorial. The notes are about person. Fourteen of the seventeen tell a reporting commentary to stop saying we or our. One, fixture 04 index 11, is an investor letter and tells the sentence to stay in the first person because it switched. One, fixture 12 index 1, is a LinkedIn post and flags a switch. One, fixture 15 index 0, says the first person is already right. See below.

### marketing_language_excess

Stated category editorial. Craft. 10 firings, 10 statements. Clean: 3 firings, 3 statements.

Fixture 05 index 2: The phrase 'leading US defense primes' implies an unsubstantiated superlative market position. Remove or substantiate.

`hyperbole_vs_qualitative`, the style-book rule for the same kind of word, did not fire.

### materiality

Stated category editorial. Craft. 8 firings, 8 statements. Clean: 2 firings, 2 statements.

Fixture 19 index 3: The statement 'Across the remaining eight active portfolio companies, performance has been broadly positive with two notable challenges' adds little value as it is vague and does not provide specific information about the performance or challenges of the portfolio companies.

### em_dash

Stated category style_guide. Mechanics. 5 firings, 5 statements. Clean: 2 firings, 2 statements.

Fixture 08 index 5: The statement uses an em-dash (the em dash character) instead of a regular hyphen (-). The stored text has that character between the parentheses. It is named here so this file does not contain it. The rest of the sentence is verbatim.

### first_person_plural

Stated category style_guide. Mechanics. 4 firings, 4 statements. Clean: 2 firings, 2 statements.

Fixture 13 index 12: The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary., so the first-person concern must be raised.

On reporting commentary this is the same instruction as `voice_consistency`. The two ids did not land on the same statement.

### cliche_and_filler

Stated category editorial. Craft. 1 firing, 1 statement. Clean: 0.

Fixture 12 index 5: The phrase 'the numbers tell one story; the team's transformation tells the bigger one' is a cliché and does not add substantive information.

### number_spelling

Stated category style_guide. Mechanics. 1 firing, 1 statement. Clean: 1 firing, 1 statement.

Fixture 04 index 13: The number '8' should be spelled out as 'eight' because it is less than 13.

The sentence is "The Company currently has 8 employees". The live rule's carve-out is percentages, currency, dates, ages, and measured physical units. Headcount is not in that list. CONFIRMED `lib/qc/style-guide.mjs` lines 169 to 171.

### oxford_comma

Stated category style_guide. Mechanics. 1 firing, 1 statement. Clean: 0.

Fixture 15 index 4: The list 'Italy, France, Spain, and Germany' is missing an Oxford comma before 'and'.

The list it quotes already has the comma. See below.

### sentence_length

Stated category editorial. Craft. 1 firing, 1 statement. Clean: 1 firing, 1 statement.

Fixture 15 index 18: The sentence is long and contains multiple clauses, which can make it difficult to read. Consider breaking it into shorter sentences for clarity.

The sentence is 34 words. The rule's length line is roughly 40 words. The note is about clauses. CONFIRMED the rule text at `lib/rulebook/editorialRules.js` lines 165 to 170.

### structural_integrity

Stated category editorial. Craft. 1 firing, 1 statement. Clean: 1 firing, 1 statement.

Fixture 12 index 6: The statement 'Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.' is a sentence fragment. It lacks a main clause to form a complete sentence.

### underreach_hedging

Stated category editorial. Craft. 1 firing, 1 statement. Clean: 1 firing, 1 statement.

Fixture 04 index 19: The phrase 'consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team' uses stacked hedging language that weakens the statement without adding precision.

The rule names two hedges doing the work of one. This sentence has "consider". See below.

## Which group, and why

Judgement of what the rule did on this file, not of the book's label.

Mechanics. A writer could satisfy it by find and replace, or a check could enforce it without reading for meaning.

- `percentage_notation`. The word percent against the symbol.
- `em_dash`. One character against a hyphen.
- `number_spelling`. A numeral under 13 against the spelled form.
- `oxford_comma`. A comma before and.
- `first_person_plural`. we or our, against third person, on reporting commentary.
- `voice_consistency`. Person, on fourteen of seventeen notes. The other three are still person: a switch, or a note that the person is already the one the output type wants. None of them ask whether a claim is earned.

Craft. Someone has to read the sentence and form a view.

- `marketing_language_excess`. A superlative with nothing under it.
- `materiality`. Whether the sentence earns its place.
- `cliche_and_filler`. Whether a line is empty.
- `sentence_length`. A readability view. This firing is not a word count.
- `structural_integrity`. Whether the sentence is finished.
- `underreach_hedging`. Whether the hedge weakens the claim.

On the clean set that is 17 and 8.

Of the 17 mechanics concerns on confirmed statements, 8 are person (`voice_consistency` 6, `first_person_plural` 2), 6 are percent, 2 are the em dash, and 1 is number spelling.

Of the 8 craft concerns, 3 are superlatives, 2 are materiality, and the fragment, the length note, and the hedge are one each.

Rules in the two books that did not fire are not in the table. `overreach_unsupported_causal` did not fire. `defined_term_capitalisation` did not fire. `narrative_coherence` is off by standing ruling and did not fire.

## Mechanics beside an evidence finding

40 statements carry at least one mechanics concern. 14 of those 40 also have a display verdict other than `supported_full`. 18 of the 46 mechanics concerns sit on those 14 statements.

Of the 14: 3 conflict, 6 partial, 3 no support, 2 not reviewed. The 12 that are not "not reviewed" are the ones where evidence returned a result and a mechanics note is on the same statement.

On the clean set, 15 statements carry a mechanics concern. 2 of those 15 also have an evidence result that is not a full confirmation. Both are person notes.

- Fixture 01 index 11. Confirmed label. Display verdict `not_supported`. `voice_consistency` on "We recommend approval."
- Fixture 04 index 11. Confirmed label. Display verdict `supported_partial`. `voice_consistency` on the switch to "our diligence has been deeply positive".

The cluster off the clean set is fixture 19. Index 1, conflict, percent. Index 2, conflict, em dash and percent. Index 7, conflict, first person and percent. Index 4, not reviewed, percent beside a superlative note.

## Planted faults

Eleven planted sentences. One editorial concern. It does not name the fault.

B437, on an earlier pass, found two planted sentences where editorial spoke, and neither named the fault. It flagged "leading" on the acquirer sentence and "meaningful capacity" on the forward-support sentence. CONFIRMED `scripts/diagnostic/b437/ACCURACY.md` lines 27 and 104. That count does not hold on this file.

| Fault | Fixture index | Editorial concerns | Names the fault |
| --- | --- | --- | --- |
| F05-acquirer | 05 index 0 | none | no |
| F05-ownership | 05 index 5 | none | no |
| F05-forward-support | 05 index 7 | `marketing_language_excess` | no |
| F13-employees | 13 index 7 | none | no |
| F13-ebitda | 13 index 4 | none | no |
| F18-completion | 18 index 0 | none | no |
| F18-customers | 18 index 3 | none | no |
| F18-headcount | 18 index 5 | none | no |
| F18-arr-current | 18 index 4 | none | no |
| F18-arr-growth | 18 index 7 | none | no |
| F18-returns | 18 index 8 | none | no |

The one concern, fixture 05 index 7: The phrase 'meaningful capacity to grow share' implies a significant opportunity without substantiation in the immediate context.

The planted fault is that the draft has Halden supporting growth and the source never names Halden. The concern does not say Halden, does not say the supporter is wrong, and does not quote the span. The same word check the accuracy harness uses, on the concern text alone, hits no token of the span. The span's only name token is Halden.

The acquirer sentence contains "a leading manufacturer" and drew nothing. The "leading US defense primes" note is fixture 05 index 2, which the labels call confirmed. It is a different sentence.

## Drops

B438 records a filter drop as a silence with an id, a reason, and a count. It does not record the rule id. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` lines 2077 to 2081, and `lib/qc/pipeline-v3/stage7-assemble-card.mjs` lines 1501 to 1506. The source-awareness function does know the code, and it logs it. That code is not copied onto the card. CONFIRMED `lib/qc/editorial-source-awareness.mjs` lines 107 to 116. `scripts/diagnostic/b441/progress.log` does not contain those lines.

On this file the only editorial drop record is `source_awareness`. 26 concerns, 25 statements. Five of those statements are in the clean set, one drop each. 22 of the 25 statements have no editorial concern left. Three kept a different concern: fixture 06 index 1 and index 9 kept `percentage_notation`, and fixture 15 index 18 kept `sentence_length`. The dropped id on those three is not on the card.

The other recorded editorial filters wrote no silence. They write one only when the list shrinks, so on this pass they dropped nothing: fidelity, the style backstop, no-op, no-change, evidence language, narrative coherence, and duplicate merge.

68 concerns reached a card and 26 were removed by source awareness before that. The 26 cannot be split by rule. No rule can be called mostly dropped from this file.

The duplication judge, which can remove an editorial concern when the evidence verdict is conflicting, does not write a silence. CONFIRMED `lib/qc/pipeline-v3/stage7-assemble-card.mjs` lines 937 to 1000. Those drops, if any, are not in this file.

## Left as found

Fixture 15 index 4, `oxford_comma`. The concern quotes 'Italy, France, Spain, and Germany' and says the Oxford comma is missing. The draft has that comma: "across Italy, France, Spain, and Germany". The deterministic filter drops a two-item list with no comma. It does not drop a list that already has the comma before and. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` lines 906 to 916. The firing reached the card.

Fixture 15 index 0, `voice_consistency`. The note says first person "is appropriate for an investor letter" and tells the writer to keep that voice. Fixture 15 is an investor letter. The concern describes a sentence it calls correct. The prompt says a compliant statement returns an empty list. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` line 248.

Three clean-set notes end with the words "so the first-person concern must be raised." Fixture 01 index 11 (`voice_consistency`), fixture 13 index 12 and fixture 19 index 12 (both `first_person_plural`). That sentence is not in the repo.

Four `voice_consistency` concerns say the same thing twice, numbered (i) and (ii). Fixture 09 index 14, fixture 19 index 6, fixture 20 index 0, and fixture 20 index 8. Three of those four are in the clean set. Each is one object on the card.

Fixture 04 index 19, `underreach_hedging`, is in the clean set. The rule is two or more hedges doing the work of one, with examples such as "seems to suggest" and "may possibly indicate". CONFIRMED `lib/rulebook/editorialRules.js` lines 57 to 61. The sentence is "We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team." The note calls that stacked hedging.

Nothing in this file was changed to suit any of these.
