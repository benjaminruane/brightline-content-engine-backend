# CENSUS3. Third read of the B426 census

Read of current HEAD against the stored full pass. No model calls. USD 0. No product code was changed. This file is the only new file.

Method is the B451 read. A site is a place a formed finding can be lost, hidden, contradicted, or mislabelled before the reader sees it. Counts are the current display functions run on the stored cards. Where the pass has no field a later change would write, the count says so.

HEAD is `ce6db5e4`. The pass was produced at `d3080316`, so a label the current functions print can differ from `sentenceLabel` stored on the card. Those differences are named below.

## The pass

`scripts/diagnostic/b503/pass-1.json` is the newest stored full pass. It is later than `scripts/diagnostic/b490/pass-1.json`. No later `pass-1.json` exists. B510, B512, and B514 are not this fixture pass.

| | B490 | B503, used here |
| --- | --- | --- |
| Started | 2026-11-11 | 2026-11-14T16:32:17.399Z |
| gitSha on the file | `4814257d` | `d3080316` |
| Cards | 261 | 288 |
| Drafts | 20 | 24 |

Flags on the file: cache off, evidence, editorial, and compliance on, commentary not skipped.

Numbering follows B426. B451 swapped items 7 and 8: its 7 is export, its 8 is the company step.

## 1. The ten

| # | B426 site | Now | Closed by | On this pass |
| --- | --- | --- | --- | --- |
| 1 | A refused note is labelled Nothing raised. Needs a look is never assigned. | Partly closed | `statementVerdict` returns `note_withheld` when `note.refused` is true (`lib/qc/statement-verdict.mjs` 81-86). The label is Needs a look (`lib/qc/shown-verdict.mjs` 21). A refused note on a backed card stays Needs a look (`shown-verdict.mjs` 114-116). | 0 refused notes. |
| 2 | A partial is labelled Nothing raised and counted as confirmed, with no finding marker. | Partly closed | The partial label is now Goes beyond the source (`shown-verdict.mjs` 18). The summary counts `partial` in the beyond bucket (`src/utils/summariseReview.js` 21-22, frontend). | 35 partial cards. 24 read Goes beyond the source. 5 read Nothing raised, all branch `wordingUnrecorded` (fixtures 08/3, 12/1, 14/3, 14/8, 24/6). Summary: beyond 36, partial 0, nothing raised 199, confirmed 0. Stored findings include a partial row on every partial card. |
| 3 | Causal overreach can headline Goes beyond the source with nothing underneath. | Open | The function that wiped the editorial verdict is gone. The skip that dropped the finding because the headline named the rule is gone for this rule (`lib/qc/evidence-findings.mjs` 122-123 keeps the causal row). | 0 causal concerns. 0 beyond cards with an empty evidence line and no finding note. The empty path is still in the code. See 2a. |
| 4 | Filters drop a concern and can recompute clean, with no count on the card. | Partly closed | The main review writes a silence. The screen does not render `card.silences`. | Silences: `source_awareness` 10, `forward_looking` 1, `editorial_duplication` 1, `fidelity` 0, `same_phrase` 1, `reader_prose_withheld` 12, `wording_note_withheld` 67, `note_rejections` 17. |
| 5 | The attention line replaces the backend header and omits conflicts. | Partly closed | Conflicts, not-in-source, needs a look, and beyond are in the line (`src/modules/reading/attentionHeader.js` 33-46). Numbers stay (`attentionHeader.js` 81-89, `ReadingHeader.jsx` 118-120). | An attention line is set on 22 of 24 drafts. Drafts that have both a conflict and a beyond card: 11. Conflicts omitted from that line: 0. The backend sentence is still cleared when the attention line is non-empty. |
| 6 | The summary calls beyond partial, and Nothing raised confirmed. | Closed | B439. Beyond and partial share the beyond bucket. Nothing raised is its own bucket (`summariseReview.js` 17-34). The ready line says Nothing raised (`reviewSummaryDisplay.js` 163). | Beyond in the partial bucket: 0. Nothing raised in the confirmed bucket: 0. |
| 7 | "The company" lifts a partial and deletes the gap sentences. | Closed | The company step was removed, `fea5cd3f` (2026-11-12). `applyGenericCompanySuppress` is not in `lib/`. | `gap_sentences_stripped`: 0. |
| 8 | A backstop rewrites the class. A result rewritten to not supported loses the passage. | Open | A rewrite that keeps the matcher's sentence stores `writtenFor` and `classificationRewrites` (`lib/qc/worked-record.mjs` 56-88, `stage2-match-sources.mjs` 1131-1152). | `writtenFor` on 6 matches, none of them to `no_support`. Recorded rewrites to `no_support`: 0. See 2c. |
| 9 | Export prints a different verdict, or "Not recorded." | Closed | Export uses `shownLabel` and the reader sentence (`lib/qc/export-review-data.mjs` 13, 22-28). | "Not recorded.": 0. Seven stored `sentenceLabel` values differ from the current `shownLabel`. The screen uses the same function, so those seven are the pass being older than HEAD, not export disagreeing with the screen. |
| 10 | A re-check that is not stale writes the new sentence onto the old verdict. | Closed | B421. `recheckStatements` marks a real change `stale: true` (`lib/qc/reading-review.mjs` 916). The hooks copy the new verdict only when `stale` is true (`useAssessState.jsx` 1357, `useDraftState.jsx` 1862). | The pass is a full review, not a re-check. Count 0. |

The remaining hole on item 1. If the note is refused, the statement state is quiet or `note_withheld`, and the evidence display does not raise the card, `shownStateBase` returns Nothing raised (`shown-verdict.mjs` 123-128). That card did not occur on this pass.

The remaining hole on item 2 is `wordingUnrecordedQuiet` (`shown-verdict.mjs` 70-77 and 111). A partial whose displayed prose is the unrecorded sentence, and whose note bucket is wording or an empty none, is forced to Nothing raised. Five cards on this pass.

## 2. The three checks

### 2a. Causal overreach

Yes. A card can still headline Goes beyond the source with nothing underneath.

`displayedEvidenceProse` returns `""` for beyond, conflicts, and not in the source when the note is empty or matches confirms, confirmed, as stated, or aligns with (`lib/qc/evidence-findings.mjs` 81-85). The finding component renders a row only when the note is non-empty and not a stock explanation (`src/modules/drafting/CardEvidenceFindings.jsx` 167-179). The causal concern is removed from the editorial list (`StatementReviewCard.jsx` 493). If that was the only editorial concern, the editorial class can be set to clean (`StatementReviewCard.jsx` 498-504).

On this pass the path did not fire. Causal concerns: 0. Beyond cards with an empty displayed prose and no finding note: 0.

### 2b. The duplication judge and the compliance fidelity gate

The duplication judge writes a silence. When it removes a concern it pushes `id: "editorial_duplication"`, reason "the duplication judge removed it" (`lib/qc/assemble-card.mjs` 1032-1038). It also writes the canary `editorial_concern_suppressed_by_judgment` (`assemble-card.mjs` 1018). On this pass that silence is on 1 card.

The compliance fidelity gate writes a silence on the full review. `applyFidelityGate` appends `id: "fidelity"` and a drop when a card is passed (`lib/qc/editorial-compliance-reviewer.mjs` 1275-1280). The live compliance call passes `stmt.qcCard` (`editorial-compliance-reviewer.mjs` 2575-2581). The editorial combined path does not pass a card, and `noteDrop("fidelity", ...)` writes the same silence into the reviewer's array (`editorial-compliance-reviewer.mjs` 2085-2103), which assembly copies onto the card (`assemble-card.mjs` 1679). On this pass `fidelity` is 0, so the gate did not drop a concern on these drafts.

The changed-statement re-check does not write it. `reviewStatementConcerns` calls `applyFidelityGate` with no card (`editorial-compliance-reviewer.mjs` 2248-2254) and returns only the kept concerns (`2266-2270`). The local card at line 2243 is discarded. The place a silence would be written is the block at 1275-1280, which does not run because `card` is omitted. This pass is not a re-check, so that hole has no count here.

### 2c. A result rewritten to not supported

Yes. The passage is still dropped at excerpt selection.

The period gate, on a non-overlap, returns `no_support` and keeps the passage on the match (`stage2-match-sources.mjs` 936-942). Rounding, period, and empty-confirmation rewrites append `classificationRewrites` and set `preBackstopClassification` (`stage2-match-sources.mjs` 1131-1152). Stage 4 then sets `primaryExcerpt` to null for every verdict that is not confirmed, conflicting, or partially confirmed (`stage4-select-excerpts.mjs` 515-516). A class rewritten to `no_support` therefore loses the quote the reader would have seen.

On this pass:

- Recorded rewrites whose `to` is `no_support`: 0.
- Matches classified `no_support`: 18, on cards whose `writtenFor` is empty for that class.
- Cards with `displayVerdict` `not_supported` or `no_clear_support` and an empty passage: 7 (fixtures 01/11, 08/17, 12/4, 13/15, 14/12, 22/3, 23/4).

Those 7 cannot be split into "the model said no support" and "a backstop rewrote it". The marker that would split them was not written on these cards.

Omission now records the rewrite. When it fires, assembly pushes `omission_covered` (`assemble-card.mjs` 1091-1097). On this pass that rule fired twice, conflict to `supported_full`. The dateline disagree path (`displayVerdictReason` `announcement_dateline`) is 0.

## 3. The rest of the list

Rows that are one of the ten are scored above and not counted again. Modes 1, 2, and 10 have no sites in the census tables.

A row is **gone** when the code is deleted or the path no longer changes the screen. **Changed** means the drop is now recorded, or the screen now says the thing, and the old silent shape is not what runs. **Present** means the reader can still lose, miss, or misread a formed finding. Named rows are the present ones that can change what a reader sees. A silence the screen does not render is still named, because the finding is gone from the screen.

| Mode | Rest rows | Present | Changed | Gone | Reader-visible, named below |
| --- | --- | --- | --- | --- | --- |
| 1 Missed something wrong | 0 | 0 | 0 | 0 | 0 |
| 2 Flagged something fine | 0 | 0 | 0 | 0 | 0 |
| 3 Knew and did not say | 13 | 8 | 3 | 2 | 11 |
| 4 Two parts disagree | 7 | 4 | 2 | 1 | 3 |
| 5 Cannot show me why | 5 | 2 | 2 | 1 | 2 |
| 6 Did not cover the draft | 7 | 3 | 2 | 2 | 3 |
| 7 Complains but will not fix | 6 | 3 | 1 | 2 | 3 |
| 8 Ranks trivia above risk | 3 | 1 | 0 | 2 | 0 |
| 9 Edit did not land | 3 | 2 | 0 | 1 | 1 |
| 10 Answered differently | 0 | 0 | 0 | 0 | 0 |
| 11 Ran without telling me | 9 | 3 | 3 | 3 | 3 |
| 12 Cannot show my work | 5 | 3 | 2 | 0 | 3 |

Gone or changed, not named:

- The three-bullet cap is gone. `summaryBullets` returns the full list (`reviewSummaryDisplay.js` 61-175).
- `stripUnquotedCraft` is not in `lib/qc`.
- `needsAttention` now includes beyond (`summariseReview.js` 62-66). The filter reads that flag (`qcWorkbenchFilters.js` 43).
- A not-checked row can show the reason sentence (`notCheckedReason.js` 7-25, used at `StatementReviewCard.jsx` 564). The slug itself is not shown.
- A replaced draft says "These cards belong to a previous draft." (`StatementAnalysisPanel.jsx` 2833-2834). The per-sentence locate note is suppressed on that path (`615-616`), and the banner is the notice.
- Non-claim drops still say "Not checked as claims" (`draftCoverageDisplay.js` 6).
- The ready summary no longer calls Nothing raised "backed".
- The writer-note panel returns the stored withheld line when one is stored (`ReviewSummaryPanel.jsx` 37-39).
- The draft-wash sentence from the census is not in `src/`. The changed-draft banner is `DRAFT_CHANGED_COPY`.

### Named, still able to change what a reader sees

These are outside the ten. File and line are current HEAD.

Mode 3.

1. Disputes the note rejected are stored as silence `note_rejections` and not rendered (`reading-review.mjs` 365-371). 17 cards on the pass.
2. A reassuring sentence is removed. The silence is `reassurance_stripped` or `reassurance_sentence` (`reading-review.mjs` 344-360). The screen does not render it. 0 on this pass.
3. A combined concern that fails the shape check is dropped. The record is a log and the canary `editorial_concern_reclassified` is a different branch. The drop itself is `normalizeCombinedConcern` (`editorial-compliance-reviewer.mjs` 572). Not on the card.
4. A concern filed in the other book is kept and moved. The canary is `editorial_concern_reclassified` (`editorial-compliance-reviewer.mjs` 2002). No word on the card says it was moved.
5. Overlapping concerns are merged into one (`assemble-card.mjs` 379, `applyDuplicateMerge`). The second concern is not its own line.
6. A throw inside assembly replaces the review with a failure card. The silence `assemble_failed` is written (`assemble-card.mjs` 1819-1832) and not rendered.
7. `droppedMarks` is a count. The hooks store it (`useDraftState.jsx` 1889). No component renders it.
8. `suppressInQcWorkbench` removes the card from the totals (`summariseReview.js` 58) and the list skips it (`StatementAnalysisPanel.jsx` 1612). No "N hidden" line.
9. A re-check with any cleared id sets `evidenceFindingsByStatement` to null for the whole run (`StatementAnalysisPanel.jsx` 1082-1088).
10. Framing and recency proposals are not attached (`actionListDisplay.js` 386-387). `orphanCount` is not rendered.
11. A passage with no letter or digit is not shown (`readableExcerpt.js` 5-7, `cardExcerptDisplay.js` 73). The "No passage" line is only for `excerptNotLocatable`.

Mode 4.

12. A written statement id is forced to `dealt_with` (`appliedDecisions.js` 37-38). The concern text stays until a later re-check.
13. The framing row title is fixed as "Framing goes beyond the source" (`StatementReviewCard.jsx` 1377).
14. Any source class other than confirmed, partial, conflicting, no support, or not reviewed is prefixed "Relates to the statement:" (`sourceRelationPrefix.js` 8).

Mode 5.

15. Citation chips are cut at five (`StatementReviewCard.jsx` 923). No "N more".
16. A date with more than eight lines shows the count and not the lines (`reading-contract.mjs` 45 and 510-512). The count is said.

Mode 6.

17. Absent `draftCoverage` is not a section. `coverageIsVisible` is false when the object is missing (`draftCoverageDisplay.js` 44-46), so the gap looks like nothing to report.
18. A recommendation or sign-off is forced to `no_support` and the rewrite is recorded as `procedural_closer` (`stage2-match-sources.mjs` 1107). The reader is not told the sentence was treated as a closer. The passage loss is item 8.
19. A `no_support` pair is not sent for a widened pass (`stage2-match-multipassage.mjs` 196, called from `pipeline-v4/index.mjs` 471). The reader is not told the search stopped.

Mode 7.

20. A trailing command sentence is stripped from the bullet (`concernDisplayText.js` 45-67). The complaint stays. The direction stays on the payload.
21. `proposeDraft` does not call when every extracted fact matched (`reading-review.mjs` 431-433).
22. A row whose `sort.reasonCode` is `first_person_unnamed` renders nothing (`StatementReviewCard.jsx` 632, `actionListDisplay.js` 58-59).

Mode 9.

23. Apply and the action-list load share the toast "Failed to load version" (`StatementAnalysisPanel.jsx` 1133 and 1141, `actionListDisplay.js` 9).

Mode 11.

24. `runEditorialComplianceReview` returns immediately when `BRIGHTLINE_EDITORIAL_REVIEW` is not `"1"` (`editorial-compliance-reviewer.mjs` 2418-2420). The log is the only record. The screen then looks like a check that failed.
25. `skipCommentary` writes silence `commentary_skipped` (`pipeline-v4/index.mjs` 907-917). The screen does not render it, so the empty line can still look finished. This pass did not skip commentary.
26. A null `summaryClass` makes the turned-off line null (`checkStateDisplay.js` 121-122). Off, a miss, and a missing class then share the same absence.

Mode 12.

27. A replayed result sets `replaySilence` and is not announced (`analysisReplayGuard.js` 24-25). No component reads that silence.
28. A save failure other than "too large" is `console.warn` plus `lastSaveSilence` (`useReviewStatePersistence.js` 103-107). The too-large case is said. The other failure is not.
29. Export of a commentary that was not reviewed is the words "Not checked." (`export-review-data.mjs` 16 and 24). The specific reason sentence the screen can show is not that cell.

Mode 9's other present row is the dealt-with chip, named above as row 12. One mode 9 row was not re-opened: an empty apply notice in `applyNoticeCopy.js`. It is not in this list and not in the count.

The rank order and the materiality score do not remove a finding. They are present and not named.

## 4. New sites since 30 October 2026

A new site here is code, added after 2026-10-30, that drops, hides, or overwrites a formed finding and does not write a silence, a drop, or a `classificationRewrites` row for that act. `console.log` and a canary do not count as a record.

These four overwrite the label the reader sees. The match classification or the note stays on the card. None of them writes a silence.

1. A context-only disagreement becomes Nothing raised when a facts source or the reading note supports the sentence, and Needs a look otherwise (`shown-verdict.mjs` 174-208, `applyContextRole`). `ce1249a2`, 2026-11-15.
2. When the reading note supports the sentence and the evidence check did not finish, the label becomes Nothing raised (`shown-verdict.mjs` 267-281, `applyReaderSupportedIncomplete`). The reason slug can remain on `evidenceNotReviewedReason`. The label overwrite is not a silence. `511ea237`, 2026-11-15.
3. When the reading note's bucket is none or wording, a conflict or a partial becomes Needs a look (`shown-verdict.mjs` 291-303, `applyReaderDecides`). `9d673326`, 2026-11-15. A figure or date miss is left as it is.
4. When the deal status covers the sentence, a conflict, a partial, or a beyond becomes Nothing raised (`shown-verdict.mjs` 307-311, `applyStatusSupport`). A figure or date miss is left as it is. The status work landed across `891c192b` and `9d673326`, 2026-11-12 to 2026-11-15.

`wordingUnrecordedQuiet` is the remaining hole of item 2, not a fifth site. It is what labels the five partials Nothing raised.

Recorded after 30 October, so not in the list above. The screen still does not render the silence, which is why several of them are named in section 3.

- `wording_note_withheld`. 67 cards on this pass. The note was formed and is not shown.
- `editorial_duplication`, `fidelity` on the full-review path, `reader_prose_withheld` (12), `same_phrase` (1), `commentary_skipped`, `assemble_failed`, `classificationRewrites` including `omission_covered`, `span_outvote`, `figure_pair`, and `second_value`.
- The company step was removed, not added.

## What "open" counts

A reader-visible site is open when the current code can still change what a reader sees: a finding dropped or hidden, a label overwritten, or two surfaces disagreeing. The six open or partly closed items in the ten that still do that are 1, 2, 3, 4, 5, and 8. The 29 named rows in section 3 are the rest. The four new branches in section 4 are further sites. 6 + 29 + 4 = 39.

Items 6, 7, 9, and 10 are not in the 39. Rows marked gone or changed in the table above are not in the 39, except where the change still hides the finding and the row is named. The empty-notice row that was not re-opened is not in the 39.

CENSUS3 COMPLETE 39 reader-visible sites open
