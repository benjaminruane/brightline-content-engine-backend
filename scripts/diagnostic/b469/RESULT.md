# B469. A contradiction is never shown as something lighter

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

Problems: none.

## What was built

The floor reads a conflicting match that was not written for a confirmed repair. When the stored label is lighter than Conflicts with the source, the reader is shown that label, at demands. The stored verdict, sentence state, label, and tier are not rewritten. A fully backed card is not given a demand.

Where that match is the finding and the note is not already a conflict, the reason is the match's explanation. Where the note is already a conflict, that note stays.

An absence headline whose reason quotes the source stating the draft is replaced by the absent fact the card already stored. The measure of a headline that contradicts its evidence is no longer limited to a fully backed verdict. The old count is still printed.

A sentence that says the source supports the statement keeps the clause in front of that relative clause, then the difference. A reason may not open with However, But, or Although. A reason that names the difference names what the source says.

Callers. floorState: shownState, the reader reason, the screen's statementVerdictState, and the screen's readerEvidenceSentence. absenceOverQuote: both readerEvidenceSentence copies. shownLabel: the reading payload, the export label, and the leave-alone tally. The screen copy is src/modules/drafting/contradictionFloor.js.

## Problem 1. The disagreement is what the reviewer sees

05:0 before: Not in the source. demands. The source states Westhaven Capital is the acquirer and Bridgepoint is the seller. The statement names Halden Group as acquirer and Westhaven Capital as seller.

05:0 after: Conflicts with the source. demands. The source states Westhaven Capital is the acquirer and Bridgepoint is the seller. The statement names Halden Group as acquirer and Westhaven Capital as seller.

Finding: The statement claims Halden Group is acquiring Norwell Aerospace Components from Westhaven Capital, while the source states that Westhaven Capital is acquiring Norwell from Bridgepoint. This is a conflict in the named entities involved in the acquisition.

19:2 before: Not in the source. demands. The source states the NorTech exit generated gross proceeds of SEK 12.8 billion, not SEK 18.4 billion as the statement claims.

19:2 after: Conflicts with the source. demands. The source states the NorTech exit generated gross proceeds of SEK 12.8 billion, not SEK 18.4 billion as the statement claims.

Finding: The source confirms the exit date, MOIC, IRR, and that NorTech is the largest realisation in the Fund's history. However, the source states the gross proceeds as SEK 12.8 billion, conflicting with the statement's SEK 18.4 billion.

18:8 before: Goes beyond the source. light. The source states the base case generates a 2.8x MOIC and 23% IRR but does not specify that the IRR is gross. The statement adds "gross" as a qualifier not present in the source.

18:8 after: Conflicts with the source. demands. The source states that the updated base case generates a 2.6x MOIC and 21% IRR, which conflicts with the statement's claim of a 2.8x MOIC and 23% IRR.

Finding: The source states that the updated base case generates a 2.6x MOIC and 21% IRR, which conflicts with the statement's claim of a 2.8x MOIC and 23% IRR.

Other cards whose label or tier moved: none.

Cards whose label became heavier: 3. Cards whose label became lighter: 0.

19:4 stays Nothing raised, quiet. 19:13 stays Goes beyond the source, light. No other label moved, so the seven cards whose figures are backed while the sentence adds a claim stay Goes beyond the source, and the four cards whose note was already the heavier finding stay on that label.

## Problem 2. The headline no longer contradicts the quotation

19:7 before: Not in the source. 19_synth_annual_report states "The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year."

19:7 after: Not in the source. 14, not in the source.

01:0 is the other card in this condition. Its label stays Not in the source. Before, the reason quoted the founding sentence the draft also states. After: Canadian, not in the source.

Cards in this condition, every verdict: 0.

## Problem 3. The measure reads every card

Old reading, fully backed and the stored state Not in the source: 1. That is 01:0, the figure carried since B464. Before B457 it was 24. On the replay of the old pass it was 0.

New reading, any verdict, the shown label Not in the source, and the reason quoting the source stating the draft. Before this change: 2. After: 0.

## Problem 4. Both halves of the reason

08:3 before: However, 'exceptional' is a broader evaluative claim that the source does not state.

08:3 after: The source describes the company's competitive position as 'enviable' in a specific vertical. However, 'exceptional' is a broader evaluative claim that the source does not state.

14:2 before: However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

14:2 after: The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.

Reasons opening with a dangling connective: 0.

## Headers

Draft 05 before: 1 statement conflicts with the source. 2 facts are not in the source, across 2 of your 8 statements

Draft 05 after: 2 statements conflict with the source. 1 fact is not in the source, across 1 of your 8 statements

Draft 18 before: 6 statements conflict with the source. 3 worth a glance

Draft 18 after: 7 statements conflict with the source. 2 worth a glance

Draft 19 before: 2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance

Draft 19 after: 1 statement conflicts with the source. 1 fact is not in the source, across 1 of your 14 statements. 1 worth a glance

Draft 02 before: 1 statement needs a look. 1 worth a glance

Draft 02 after: 1 statement needs a look. 1 worth a glance

## Readability

Gate failures: none.

Partial headlines that name the source and not the difference: 0.

Unrecorded line: 2. Findings whose note repeats the reason: 0.

Longest reason: 16:10, 436 characters.

The source states that premium women's health is a structurally attractive emerging category, growing at approximately 14% annually in Europe. It also mentions that Bloom is well-positioned within this category as a clinically-credible, premium-positioned, multi-product brand. However, the source does not specifically mention the international expansion runway in France, Italy, Spain, and selectively in the US over a five-year hold.

## Invariants

Catch: 13 of 13. Group A: 11 of 11.

Evidence leave-alone 48 of 74. Combined quiet 30 of 74.

With the sentence label: evidence leave-alone 48 of 74. Combined quiet 30 of 74.

Confirmed cards whose shown state became conflicts while the rebuilt state was not: none.

Screen reasons that differ: 0. Export sentences that differ from the card: 0. Wording notes shown: 0. Raised cards with no reason: 0.

The stored pass was not rewritten. 05:0 and 19:2 still store Not in the source. 18:8 still stores Goes beyond the source.

## Assertions that moved

tests/b468-clause-kept.test.mjs required 08:3 and 14:2 to be only the However sentence. That dropped the clause naming what the source contains, which is the half this spec keeps. The assertion was wrong.

tests/b466-reason-reads.test.mjs required every stored prose that did not assert agreement to be shown unchanged. The screen copy of that assertion is src/modules/drafting/__tests__/b466-reason-reads.test.js. 18:8's stored prose is the lighter note that the statement adds gross, while the conflicting check names 2.6x and 21% against 2.8x and 23%. 01:0 and 19:7's stored prose quotes the source stating a fact the headline calls absent. Those three are no longer required to equal the stored prose.

tests/b468-header-agrees.test.mjs required draft 19's header to omit conflict, counting the stored label. 19:2's stored label is still Not in the source. The label the reader sees is Conflicts with the source, and the header counts that.

tests/b462-summary-lines.test.mjs required draft 18 on the B456 pass to keep a beyond line. 18:8 on that pass is a disagreement, the same finding as on this pass. The summary now counts it as a conflict, and that draft no longer has a separate beyond line. The expected lengths go from three drafts at 5 lines to two.

The browser was not opened. The confirming measurement is this replay of the stored pass.
