# B463. Every drop records what it dropped.

Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed. Nothing new is shown to the reader.

A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.

## What was built

A drop, a suppression, a merge, or a rewrite made while a card is built is a record `{ rule, reason, content }`. `content` is the words that were removed, in the source's or the model's own words. The records sit on `card.drops`. A diagnostic lists that array and does not need to know which rule wrote which row.

A silence that already existed keeps its id, its reason, and its count. It gains `content`, the same words. The numbers measured since B438 still read.

## Recorded on the next card

These are the census rows whose count was null, or whose silence carried only an id, a reason, and a count. The artefact is written when the rule runs. This stored pass was built before that write, so the words are not on this file.

- note_rejections. Census: A point the note tried to name never appears. The dispute surfaces are the silence content.
- reassurance_stripped. Census: The sentence keeps a conflicts or beyond label and the reason under it is gone. The removed sentences are the content. A partial strip is recorded as reassurance_sentence.
- note_refused. Census: A note was refused. The refused note text is the content. The rejections array stays.
- style_backstop, no_op, no_change, evidence_language, narrative_coherence, linkedin_credit_line, fidelity. Census: A style, no-op, direction, evidence-language, narrative, or fidelity concern is removed. The concern's own note is the content. The count stays the number removed.
- normalize_combined. Census: A formed editorial concern disappears. The concern note, or the category and rule when the note is empty. A schema failure is still the retry, not this record.
- category_moved. Census: A concern shows under the other heading. The note, and the reason names the stated category and the category on the card.
- editorial_duplication. Census: On a conflict, an editorial note can disappear. The concern text the duplication judge removed.
- duplicate_merge. Census: Two overlapping notes become one. The texts that were folded. The count stays the size of the group.
- source_awareness. Census: An objection whose words also appear in the source disappears. The concern text. The dropped row also keeps its code and family.
- forward_looking. Census: A forward-looking compliance note disappears. The concern text.
- fidelity on compliance. Census: A compliance concern whose quote is not in the sentence disappears. The concern text and the fidelity reason. The editorial path was already a silence. The compliance path now writes the same silence.
- gap_sentences_stripped. Census: A partial becomes fully backed and the sentence that named the gap is gone. The summary before the strip. The count is 1.
- assemble_failed. Census: The whole review of that sentence becomes Not checked. The error message.
- classificationRewrites copied into drops. Census: A class is rewritten. Period, rounding, closer, omission, and the other rewrites already stored as classificationRewrites are copied into the one list. The rewrite record itself is unchanged.
- dropped_marks. Census: A mark was dropped. The surface and the reason, on the card the mark belonged to, and on the review silence that already carried the count.
- draft_coverage_dropped. Census: A heading or a salutation is not a claim. The dropped text is a review-level drop, because a heading is not a card. draftCoverage.dropped was already on the review. It is now also in the review drops list.
- date_extract_limit. Census: A date says N lines and does not show the lines. The lines, on the card, when a date fact has more than eight occurrences. The screen still shows the count.
- unquoted_craft. Census: A paragraph of the writer note is missing. The paragraph, on the writer-note response. The writer note is not a card.
- commentary_skipped. Census: Commentary was skipped. The statement, and the silence that already said commentary was not run.
- wording_note_withheld. Census: A wording note is not shown. The note text is added to the silence. The note was already on wordingNoteWithheld.
- reader_prose_withheld. Census: A string fails the endorsement guard. The withheld sentence is the content. It is not rewritten.

## Left unrecorded

Out of scope. A pass cannot produce them. The census names them as session or interface state.

- recheckClearedDecisionIds, the Dealt with chip, and the stale flag. They live in the re-check map.
- The colour wash after an edit, the proposal compared with a rewritten sentence, and a locate failure on a replaced draft. They are post-edit.
- The apply error, the empty notice, and a save that fails, including 413. They are save failures.
- meta.replayed. It is the replay flag.
- A second run of the same draft. That is a later pass, not a field on one card.

Left unrecorded for a reason that is not scope.

- summaryClass is not written onto the card. The screen treats a present summaryClass as the check having been requested. Writing it would change what the reader sees. The off-versus-miss split stays in the verdict and the not-reviewed reason, which are already stored.
- orphanCount, first_person_unnamed, noProposalReason, and the proposal that was never called. Proposals are not built while the card is built. They are not on this pass.
- The bullet that cuts a sentence starting with delete. That cut is not in the card build.
- Citation chips cut at five. supportRefIds are already written on the assembled card. This compact pass omitted them. The cut itself is the screen.
- materiality and claimUpgrade are already written on the assembled card when the card is built. This compact pass omitted them. They are not drops.
- VITE_REVISE_ACTION_LIST is an interface flag.
- Coverage was not computed. The review writes draftCoverage whenever the pipeline returns. Absence of that field is the record that it was not computed. A card-only file cannot show it.

## What this pass can already be read for

The dropped sentences are not on this file. Replaying the card cannot rebuild a note rejection or a source-awareness drop, because the removed item was gone before the card was stored. The next pass is what shows those words.

Wording notes already stored, which the silence can now carry: 115. Their text is 26254 bytes. Copying that text onto the matching silence grows the card JSON from 681765 bytes to 709954 bytes, 4.13 percent. That is the only content this file can add. The other drops have no words here, so their size is not guessed.

Silences on this pass. Content is 0 on every one of them.

- wording_note_withheld: 115 on 115 cards. With content: 0.
- note_rejections: 19 on 14 cards. With content: 0.
- source_awareness: 14 on 13 cards. With content: 0.
- reassurance_stripped: 3 on 3 cards. With content: 0.
- note_refused: 2 on 2 cards. With content: 0.
- source_difference_missing: 2 on 2 cards. With content: 0.
- reader_prose_withheld: 1 on 1 cards. With content: 0.

## The reader-facing strings

261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier unchanged: 261 of 261.
Reason sentence unchanged: 261 of 261. Screen differs from the reason: 0. Export differs from a shown reason: 0.
Evidence findings unchanged: 261 of 261. Summary bullets unchanged: 20 of 20 drafts.

## Verdicts

Labelled faults: 13 of 13.
Group A: 11 of 11.

Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the old definition.
Evidence leave-alone 51 of 74, combined quiet 32 of 74, on the new definition.

## Tests

`tests/b463-drop-record.test.mjs` locks the shape, the silence that keeps its count and gains the words, a rewrite copied into that shape, and a craft paragraph that is stored while the piece the reader gets stays the kept text.

No assertion was given an exemption.

## Files

- `lib/qc/drop-record.mjs`. The one shape, and the helpers that copy a silence or a rewrite into it.
- `lib/qc/reading-review.mjs`. Note rejections, a refused note, a stripped reassurance, a wording note, and date lines past the limit.
- `lib/qc/editorial-compliance-reviewer.mjs`. Concern drops, a category move, and the compliance fidelity gate.
- `lib/qc/assemble-card.mjs`. The duplication judge, the merge, source awareness, forward looking, the gap sentence, the assemble failure, and the copy of classification rewrites.
- `lib/qc/editorial-source-awareness.mjs`. The dropped concern keeps its text.
- `lib/qc/reader-prose-guard.mjs`. A withheld sentence is stored and not rewritten.
- `lib/qc/pipeline-v4/index.mjs`. Dropped marks on the card, coverage drops on the review, and a skipped commentary.
- `lib/qc/worked-record.mjs`. The mark silence gains the surfaces.
- `lib/qc/constructive-feedback.mjs` and `api/constructive-feedback.js`. A dropped writer paragraph is kept on the response.
- `tests/b463-drop-record.test.mjs`. The shape.
- `scripts/diagnostic/b463/replay.mjs`. This measurement.
- `scripts/diagnostic/b463/RESULT.md`. This report.

## Browser

Not opened. Nothing new is shown. A Review would ask a model.

