# B451. Which of the ten are still open

Read of the current tree against `scripts/diagnostic/b446/pass-1.json`. No model calls. USD 0. No product code, no test, no prompt, and no rule was changed.

The pass is 261 cards, 20 drafts, build `40af2fd`. That build is after B432, B438, B439, B440, B441, B444, and B445. It is before B447, B449, and B450. A count is what the stored cards show under the current display functions. Where the pass does not carry the field a later change would write, the count says so.

`node scripts/diagnostic/b451/scan.mjs` prints the counts. The attention line is the frontend function. Fact status is not on the compact card, so that half of the header is not in the count.

B439 shipped as backend `504c8ac` and frontend `0990f51`. `docs/BACKLOG.md` has no B439 row. The code comment in `lib/qc/shown-verdict.mjs` is the name used here.

## The ten

| # | Status | On the pass |
| --- | --- | --- |
| 1. Refused note reads Nothing raised | PARTLY CLOSED | 2, both still Nothing raised |
| 2. Partial reads Nothing raised and counts as confirmed | PARTLY CLOSED | Label collision 0. Summary-as-confirmed 0. No partial finding on 30 of 30 |
| 3. Causal overreach, beyond with nothing under it | OPEN | Empty beyond line 0. One causal concern, editorial verdict clean, finding kept |
| 4. A drop recomputes the verdict to clean, no count on the card | PARTLY CLOSED | Recorded drops: source awareness 14. Judge and compliance fidelity are not stored |
| 5. Attention header replaces the backend header and omits conflicts | PARTLY CLOSED | Conflict omitted 0. Header replaced on 17 of 20 drafts |
| 6. Summary calls beyond partial, and Nothing raised confirmed | CLOSED | Beyond in the partial bucket 0. Nothing raised in confirmed 0 |
| 7. Export prints a different verdict or "Not recorded" | CLOSED | Verdict differs 0. Evidence differs 0. Not recorded 0 |
| 8. "The company" lifts a partial and deletes the gap | OPEN | Recorded strips 0. The lift itself is not a field |
| 9. Backstops rewrite a class and drop the prior, and no support drops the passage | PARTLY CLOSED | 15 rewrites marked. None of them is to no support. Omission and dateline markers 0 |
| 10. A re-check that is not stale writes the new sentence onto the old verdict | CLOSED | The pass is not a re-check. Count 0 |

## 1. PARTLY CLOSED. A refused note

Covered. B438, backend `019d886`. `attachReadingView` still passes `note: null` into the contract, and it sets `noteWithheldLine` to "A note was written for this sentence and could not be shown. That does not mean there was nothing to say." The reading detail prints that line (`SentenceDetail.jsx` 47-55). The silence `note_refused` is on the card.

Not covered. `statementVerdict` still returns `nothing_raised` when the note was refused (`statement-verdict.mjs` 71). `STATE_LABELS.note_withheld` is still "Needs a look" (`reading-contract.mjs` 32) and nothing assigns that state. The review card does not read `noteWithheld`. The sentence label stays Nothing raised, the same words as a sentence with nothing to say.

On the pass, 2 cards. Fixture 06 index 3, reason `bucket`. Fixture 17 index 7, reason `endorsing_language`. Both are `sentenceLabel` Nothing raised and `displayVerdict` `supported_full`. The compact file stores the silence and does not store `noteWithheldLine`. The line is in the code, not in this file.

## 2. PARTLY CLOSED. A partial labelled Nothing raised

Covered. B432, backend `e34503b`, frontend `3d2fd44`. A quiet `supported_partial` becomes state `partial` and the label Partly in the source (`shown-verdict.mjs` 30-37). The summary counts that state as partial, not confirmed (`review-summary.mjs` 109-121, and the same lift in `summariseReview.js` 21-29).

On the pass, 30 cards have `supportState` partial or `displayVerdict` `supported_partial`. 0 of them are labelled Nothing raised. The summary's confirmed bucket is 0. 12 of the 30 are state partial. The other 18 have a louder sentence state, and the summary counts that louder state.

Not covered. `cardEvidenceFindings` still keeps an entry only when the rule is `overreach_unsupported_causal` or `partial` (`evidence-findings.mjs` 113). Nothing writes rule `partial`. 30 of 30 partial cards have no such finding, so the collapsed "N findings" marker does not fire. The sentence, when the state is partial, is `partialSentence`, and it is behind the evidence chevron.

## 3. OPEN. Causal overreach with nothing underneath

The three steps are still the code. `editorialVerdictWithoutCausal` sets the editorial verdict to clean when the causal rule was the only concern (`statement-verdict.mjs` 95-104). The review card removes that concern from the editorial list (`StatementReviewCard.jsx` 475-476). `cardEvidenceFindings` skips the entry when `statementVerdict.setBy.rule` is that rule (`evidence-findings.mjs` 66-68 and 114). `displayedEvidenceProse` for beyond is the reading note, not the concern note (`evidence-findings.mjs` 77-81). A beyond headline set only by the causal rule, with an empty or confirming note, still has nothing underneath.

On the pass that shape is 0. One card carries the rule: fixture 05 index 7. The editorial verdict is clean. The sentence state is `not_in_source`, set by the note, so the skip does not run. The evidence finding keeps the causal sentence. The empty line is latent on this file. The editorial row going clean is live, once, and the sentence survived on the finding.

## 4. PARTLY CLOSED. A drop with no count on the card

Covered. B438, backend `019d886`. The editorial combined path writes a silence when fidelity, a style backstop, the no-op drop, the no-change drop, the evidence-language drop, or narrative coherence removes a concern (`editorial-compliance-reviewer.mjs` 2055-2088). Assembly copies those onto the card, and it writes its own silences for narrative coherence, source awareness, the forward-looking drop, and a duplicate merge (`stage7-assemble-card.mjs` 918-920, 1501-1536, 405-410). The later LinkedIn credit-line drop uses the same `noteDrop` (`editorial-compliance-reviewer.mjs` 2082-2083). The count reaches the card. The screen does not read `silences`. A clean card with a silence still looks clean.

On the pass, the only one of those ids that fired is `source_awareness`, 14 cards. 12 of them have `editorialVerdict` clean. Fidelity, the style backstops, no-op, no-change, evidence language, narrative coherence, forward-looking, and duplicate merge are 0. Zero here means the drop did not happen. The silence would be on the card if it had.

Not covered. The duplication judge still drops a concern and recomputes the verdict with a canary and no silence (`stage7-assemble-card.mjs` 969-999). The compliance fidelity gate in the v4 reviewer does the same with no silence (`editorial-compliance-reviewer.mjs` 2519-2526). Those two are not a count of zero. The card has no field that would show them, so this file cannot say whether they fired.

## 5. PARTLY CLOSED. The attention header

Covered. B439, frontend `0990f51`. `attentionHeader` counts conflicts and puts them in the line (`attentionHeader.js` 26-38). On the pass, 0 drafts have a conflict and an attention line that does not say conflict. 8 drafts have both a conflict and a beyond or partial sentence, and the line names both.

Not covered. `ReadingHeader` still renders the attention line instead of `header.numbers` and `header.line` whenever the attention line is non-empty (`ReadingHeader.jsx` 5-11). The matched-facts count is still not in the replacement. On the pass the line is non-empty for 17 of 20 drafts. Fact status is not on the compact card, so the not-found half of that line is absent from the count. 17 is a floor.

## 6. CLOSED. The summary

B439, backend `504c8ac`, frontend `0990f51`. `summariseReview.js` 21-30 and `review-summary.mjs` 109-121 give `beyond` its own bucket and `nothing_raised` its own bucket. A quiet card whose display verdict is `supported_partial` is counted partial before it can be counted as nothing raised. The bullet for beyond says "goes beyond the source" (`reviewSummaryDisplay.js` 110-116). The ready line says "Nothing raised", not that the claims are backed (`reviewSummaryDisplay.js` 174-185).

On the pass, `summariseReview` of the 261 cards: beyond 23, partial 12, nothing raised 159, confirmed 0. The 23 beyond states are the 23 in the beyond bucket. The 159 nothing-raised states are the 159 in the nothing-raised bucket. The old miscount fires 0 times.

## 7. CLOSED. Export

B439, backend `504c8ac`. `buildReviewData` prints `shownLabel`, which is the card's sentence label (`export-review-data.mjs` 63-68). For partial, beyond, conflicts, and not in the source, `evidenceFindingForExport` uses the displayed prose or `shownEvidenceProse`, not a different paragraph (`export-review-data.mjs` 18-30).

On the pass, export verdict differs from `sentenceLabel` on 0 cards. Export evidence differs from `displayedEvidenceProse` on 0 cards where that prose is non-empty. "Not recorded" is 0. The compact row has no `reasoningParagraph`. The scan restores it from `evidenceSummary`, which is what assembly stores in that field. Every card on the pass has a summary, so an export that ignored the label and read only the summary would also have avoided "Not recorded". The disagreement the census named is the label and the prose. Those match.

## 8. OPEN. "The company" lifts a partial

`applyGenericCompanySuppress` still returns `supported_full` and strips a sentence that contains both "however" and "not" when "the company" resolves (`generic-company.mjs` 117-156). Assembly still applies it (`stage7-assemble-card.mjs` 1429-1451). A silence is written only when the summary text changes. A lift that does not change the summary stores nothing: no prior partial, no antecedent.

On the pass, `gap_sentences_stripped` is 0. That is a strip count, not a lift count. 19 statements open with "the company", "the firm", or "the group". 4 of them are still partial. 12 are `supported_full`. The 12 are not evidence of a lift. The sources are not on the card, so the resolver cannot be re-run from this file.

## 9. PARTLY CLOSED. A rewritten class

Covered, for a rewrite that keeps the matcher's sentence. B440, backend `3f1cf6d`. `matchExplanationsFromMatches` stores `writtenFor` when that class differs from the class on the card (`worked-record.mjs` 63-75). On the pass, 15 matches on 15 cards carry it. 9 are confirmed rewritten to conflicting. 1 is partially confirmed rewritten to conflicting. 5 are confirmed rewritten to not reviewed. The file records the pair. It does not name which backstop fired. None of the 15 is a rewrite to no support. A rounding lift would be conflicting rewritten to confirmed. That pair is 0.

Not covered. When the period gate replaces the explanation, `explanationFor` is set to the new class (`stage2-match-sources.mjs` 1087-1088), so `writtenFor` is not stored. The non-overlap path returns `no_support` and a new explanation (`stage2-match-sources.mjs` 935-941). Stage 4 sets `primaryExcerpt` null for every verdict that is not confirmed, conflicting, or partially confirmed (`stage4-select-excerpts.mjs` 515-516), so a result rewritten to no support still loses the passage.

On the pass, 10 matches are class `no_support` and none of them carries `writtenFor`. 7 cards with `displayVerdict` `not_supported` have an empty passage. Those 7 cannot be split into "the model said no support" and "a backstop rewrote it". The marker that would split them is the one this path does not write.

Omission still rewrites a conflict to `supported_full` and stores no prior and no silence (`card-honesty.mjs` 286-293, applied at `stage7-assemble-card.mjs` 1027-1040). The dateline lift still clears `unsupportedSpans` and stores no prior (`source-dateline.mjs` 245-254). `displayVerdictReason` `announcement_dateline` is the disagree path, not the lift. That reason is 0 on the pass. The lift would not have shown up in that 0.

## 10. CLOSED. A re-check that is not stale

B421, backend `d9b11d0`, frontend `4af5ac0`. `statementChanges` treats a sentence it cannot find in the draft as a change. `recheckStatements` marks every change `stale: true` and writes the new text with a new note, verdict, and concerns (`reading-review.mjs` 609 and 671-699). The frontend copies those fields only when `stale` is true (`useDraftState.jsx` 1837-1851, `useAssessState.jsx` 1292-1307).

When `stale` is not true, both hooks still write `text` and `draftSpan` and leave the verdict, the note, and the concerns. The text on that path is the sentence the locator still found (`reading-review.mjs` 615-622), so the verdict belongs to that sentence. A new sentence is not sent with `stale: false`.

The pass is a full review, not a re-check. Count 0.

## The 210

The census: 316 unique partial-support statements across every committed payload, 210 with no finding sentence. 206 of those had an empty summary. 4 said specific commentary was unavailable.

This pass is one architecture, not that corpus. 30 partial cards, 30 unique statements. 0 have an empty summary. 0 use the unavailable-commentary sentence. 30 of 30 have a stored reason: 24 from a `partially_confirmed` match explanation, 6 from `partialGround.source` `evidence_summary`.

It is not fixed everywhere. `partialSentence` reads a `partially_confirmed` explanation, then `partialGround` only when the source is `stage2_explanation` (`partial-sentence.mjs` 81-90). It does not read `evidence_summary`. That is the path B440 touched, and only that path supplies the sentence the partial state shows.

6 cards hold the reason in the summary and still produce "Part of this statement is in the source. Which part was not recorded." 3 of those 6 are state partial, so that unrecorded line is the sentence the reader gets:

- Fixture 08 index 16. The summary names the missing "credible M&A roadmap".
- Fixture 15 index 9. The summary names the own-brand margin figure.
- Fixture 15 index 25. The summary names the lease-renegotiation test.

The other 3 are `not_in_source` or `beyond` (fixture 04 indexes 11, 12, and 19). Their evidence line is the reading note, not the partial sentence. The summary is stored and is not that line.

A partial with no match explanation and no summary still gets `recorded: false` from `partialGroundFromCard` (`worked-record.mjs` 91-98). That card did not occur on this pass. The hole is in the code.

## What is left

Ordered by how often the remaining condition fires on this pass. Inside one band, the smaller change is first. A fix is deterministic when the inputs are already on the card or in the fixture, so a replay can show it. A live call is a new review.

Fires on this pass.

- 30 cards. No evidence finding with rule `partial`, so the collapsed marker stays empty. The label is already Partly in the source on the 12 whose state is partial. The smallest change is to put `partialSentence` on one finding when the state is partial. Deterministic. Replay.
- 17 drafts. The attention line replaces the backend header. Conflicts are already in the line. The smallest change is to keep `header.numbers` and put the attention line under it. Deterministic. Replay. The not-found count is not on this file.
- 14 cards. Source awareness dropped a concern, the count is on `silences`, and the screen does not show it. 12 of them are editorial clean. The smallest change is to render the silence. Deterministic. Replay. The same render covers the other silences on the file: wording notes 113, note rejections 12, refused notes 2, reassurance stripped 1.
- 3 cards. State partial, and the sentence says the split was not recorded, while `partialGround` holds the summary. The smallest change is for `partialSentence` to use `evidence_summary` the way it uses `stage2_explanation`. Deterministic. Replay. The three are named above.
- 2 cards. A refused note, label Nothing raised. The reading detail already has the withheld line. The smallest change is to use that line as the statement label, which assigns the distinction `Needs a look` was written for. Deterministic. Replay.

Does not fire on this pass. The code is still there. The smallest change is first.

- The causal skip. Do not skip the finding when the headline was set by that rule, and copy the concern note when the reading note is empty. Deterministic. A replay of this pass changes nothing: the empty line is 0, and the one causal card already has the finding. A constructed card shows the skip. No live call.
- The company lift. Stop applying `applyGenericCompanySuppress`, or store the prior partial and the antecedent on the card. Deterministic. Replay needs the fixture sources. This file shows 0 strips and cannot show a lift that did not change the summary.
- The prior class and the passage. Store `preBackstopClassification` on the card when the explanation text was replaced, and do not null the passage for a class that was rewritten to no support. Store the prior verdict when omission or the dateline lift rewrites the card. Deterministic. Replay on a fixture that trips the gate. This pass has 0 marked rewrites to no support, 0 dateline reasons, and no omission marker. The 7 empty not-supported passages are not attributed.

Not a count of zero. The card does not record them, so a replay of this file cannot show them. Seeing the rate means a live review.

- The duplication judge (`stage7-assemble-card.mjs` 969-999).
- The compliance fidelity gate (`editorial-compliance-reviewer.mjs` 2519-2526).

The change for both is the same silence the other filters already write. Writing it is deterministic. Proving it fired on these drafts is not, because the dropped concern is gone.

## What the census did not have

The mechanics scan, the grouped concern, the split leave-alone, the required note schema, and the LinkedIn exception are all after `dab9268`.

The wording withhold is a new site. B440, backend `3f1cf6d`. A wording note is still formed. `wordingLine` is set null, `noteForReader` drops the bucket, and the reading sentence does not show it (`reading-review.mjs` 440-449). The card stores `wordingNoteWithheld` and the silence `wording_note_withheld`. The census still had the screen showing "1 wording note". On the pass, 113 statements formed one. 75 of them are labelled Nothing raised. The product knows. The reader does not get the note. It fires more often than anything left of the ten. Showing the stored text is deterministic, and it is a product decision B440 made the other way.

The mechanics scan does not open one. `scanMechanics` adds at most one concern per rule, with every match as a span (`mechanics-scan.mjs` 139-167). Source awareness keeps those rule ids (`editorial-source-awareness.mjs` 112-115). On the pass, 92 concerns use those codes and 24 of them have more than one span. An occurrence is on the span list. It is not dropped.

The split leave-alone is a score in the diagnostic. It is not a path on the card.

The required note schema does not open one. `writerJsonSchemaForSpan` requires a `note` string on the writer call only (`reading-review.mjs` 127-136). The per-sentence note does not use it. The pass withheld the writer note on 15 of 20 drafts, both attempts empty. That pass is `40af2fd`, before the schema (`f89c0c4`). The current writer call refuses `{}`. A banned phrase is still withheld, and that withhold already has a line.

The LinkedIn exception does not open a silent site on v4. `suppressLinkedInCreditLines` drops a `structural_integrity` concern that quotes a credit line, and the v4 path records `linkedin_credit_line` (`editorial-compliance-reviewer.mjs` 2082-2083). The pass is before that code (`34e7ae7`). The silence count on the pass is 0, and it would have been 0 anyway. The v3 merge path drops the same concern with a log and no silence (`editorial-compliance-reviewer.mjs` 2291). Production is v4.

`partialSentence` ignoring `evidence_summary` is the hole in the 210, above. It is not a fifth new site. The field did not exist when the census was written.
