# B470. A reason is a sentence, and a sentence nobody checked does not say nothing was raised

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

Problems: none.

## What was built

An absent element is named in a sentence. The element is the one the card already stored. The sentence says the source does not contain it, and nothing else about the source.

A sentence whose evidence check did not run is shown as Needs a look, at demands. The reason is the sentence B467 already wrote for that refusal. The stored verdict, sentence state, label, and tier are not rewritten.

A reason that is not a sentence is refused. A comma inside a quotation is not treated as the start of a fragment.

Callers. absentElementLine: absenceOverQuote on both sides. sentenceFault: reasonFault on both sides. uncheckedLook: shownState, statementVerdictState, both readerEvidenceSentence copies, and the export. The screen copy of the sentences is src/modules/drafting/contradictionFloor.js. The screen copy of the sentence check is src/modules/drafting/partialReason.js.

## Problem 1. The reason is a sentence

01:0 before: Canadian, not in the source.

01:0 after: The source does not describe the company as Canadian.

19:7 before: 14, not in the source.

19:7 after: The source does not give the 14 percent figure.

Fragment reasons before: 2. Fragment reasons after: 0.

## Problem 2. A sentence nobody checked

11:9 before: Nothing raised. quiet. No reason under the label.

11:9 after: Needs a look. demands. This check did not run, because the match came back empty.

15:12 before: Nothing raised. quiet. No reason under the label.

15:12 after: Needs a look. demands. This check did not run, because the match came back empty.

Cards shown as Nothing raised whose evidence check did not run: 0.

Cards whose label moved from the label shipped in B469: 11:9 (empty_confirmation_refused); 15:12 (empty_confirmation_refused).

11:9 is in the labelled 74. Its accuracy label is confirmed. Its stored display verdict is not reviewed, so the evidence layer already counted it as raised before this label moved. 15:12 is not in the labelled 74. Evidence leave-alone stays 48 of 74. Combined quiet stays 30 of 74. With the sentence label: 48 of 74 and 30 of 74. The cause is the stored not-reviewed verdict, not the new label.

Membership detail: 11:9 confirmed display not reviewed evidence raised true shown Needs a look.

## What stayed

05:0 Conflicts with the source demands. 19:2 Conflicts with the source demands. 18:8 Conflicts with the source demands. 19:4 Nothing raised quiet. 19:13 Goes beyond the source light.

## Headers

Draft 11: 1 statement needs a look. 1 worth a glance

Draft 15: 2 statements conflict with the source. 1 statement needs a look. 3 worth a glance

## Readability

Gate failures: none.

Unrecorded line: 2. Unrecorded line more than once: 0. Findings whose note repeats the reason: 0.

Longest reason: 16:10, 436 characters.

The source states that premium women's health is a structurally attractive emerging category, growing at approximately 14% annually in Europe. It also mentions that Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand. However, the source does not specifically mention the international expansion runway in France, Italy, Spain, and selectively in the US over a five-year hold.

## Invariants

Catch: 13 of 13. Group A: 11 of 11.

Evidence leave-alone 48 of 74. Combined quiet 30 of 74.

With the sentence label: evidence leave-alone 48 of 74. Combined quiet 30 of 74.

Screen reasons that differ: 0. Screen states that differ: 0. Export sentences that differ from the card: 0. Wording notes shown: 0. Raised cards with no reason: 0.

The stored pass was not rewritten. displayVerdict, sentenceState, sentenceLabel, and tier on the file are unchanged.

## Assertions that moved

tests/b469-contradiction-floor.test.mjs required 01:0 to read "Canadian, not in the source." and 19:7 to read "14, not in the source." The frontend copy is src/modules/drafting/__tests__/b469-contradiction-floor.test.js. Those strings are the element and a label pushed together. They were true and they were not sentences. The assertion was wrong.

tests/b466-reason-reads.test.mjs required a card with no stored reason to keep an empty shown reason, apart from eight partial joins. 11:9 and 15:12 had no stored reason because the check did not run. They now show the sentence that says so. The assertion was wrong.

tests/b462-summary-lines.test.mjs required the B456 pass to keep its line counts. Drafts 11 and 15 each gain a needs-a-look line for the same two sentences. One draft moves from 4 lines to 5, and one from 5 lines to 6. The assertion counted the labels from before an unchecked sentence was Needs a look.

The browser was not opened. The confirming measurement is this replay of the stored pass.
