# B426. The census

Read of the tree on 2026-10-26. No model calls. USD 0. No product code, no test, no flag was changed.

The counts in the partial-support, referent, and timing sections come from `scripts/diagnostic/b426/read.mjs`. The extract is `scripts/diagnostic/b426/readings.json`. It walked 922 committed JSON files. 2,069 partial-support rows, 316 unique statements. 48 unique drafts were paired with a source.

A site is a place where something the product has already worked out can be lost, hidden, contradicted, or mislabelled before the reader sees it. A guard that refuses bad input before any finding exists is not a site.

## The ten to fix first

1. A note the reader step refused is discarded, and the sentence is labelled Nothing raised, the same words as a note with nothing to say. The copy that separated them, Needs a look, is still declared and is never assigned.
2. A partial-support card is labelled Nothing raised and counted as confirmed. Partial is not written as an evidence finding, so a collapsed card has no marker that a finding exists.
3. Causal overreach is removed from the editorial verdict and from the editorial list on the card, then skipped on the evidence line because the headline already names that rule. The reader can get Goes beyond the source with no sentence.
4. The editorial and compliance filters drop a formed concern and can recompute the verdict to clean. The card carries no count of what was dropped. Fidelity, the style backstops, the no-op and no-change drops, the evidence-language drop, narrative coherence, the duplication judge, source awareness, and the forward-looking drop all work this way.
5. The reading header replaces the backend header whenever a fact is missing or a sentence is beyond, and the replacement does not mention conflicts.
6. The summary calls a beyond sentence partial support, calls Nothing raised confirmed, and then keeps three bullets. The words at the top are a different account from the words on the card.
7. When "the company" resolves to one antecedent, the partial is lifted to full support and the sentences that described the gap are deleted. That is the referent finding being removed.
8. Period, rounding, omission, and dateline backstops rewrite a classification the model already gave. The prior class is not stored on the card. A result rewritten to not supported also loses the passage.
9. Export prints `displayVerdict` and `reasoningParagraph`. It does not print the statement label or `displayedEvidenceProse`, so the file the reader can send is a different record from the card.
10. A re-check that is not marked stale writes the new sentence and leaves the previous verdict, note, and concerns on it.

## How a row was judged

Product knows: a field on the payload, a counter, a reason code, or a log line. A `console.log` or a Langfuse canary is "yes, log only" when nothing on the card names the drop.

User learns: words on the screen, or no.

Severity is a judgement of how easily a formed finding disappears, and how hard that is to see.

# 1. It missed something wrong

Sites in the tree: 0. This mode is a wrong thing that was never formed. Structural absences, where the owning layer has no rule, are under Wrong layer.

Measurement. Rescore the labelled accuracy set, fixtures 01 to 20, 261 statements, catch and leave-alone, on the current v4 path with evidence, editorial, compliance, and the note step on. Run it twice. Cache off. Compare each planted fault and each leave-alone sentence with the statement label, the support state, and the concern codes.

Cost. The last evidence-only pass of that set, 2026-10-06, was USD 2.9345 list (`docs/SPEND_LEDGER.md`, oct-06-b378). That pass does not include editorial, compliance, or the note step, so it does not answer this mode. One 3,698-word memo with every Stage 6 check was USD 16.44 list and 267 seconds (ledger 2026-09-20, run 4). A full pass of fixtures 01 to 20 is unpriced until the harness prints an estimate. Wall clock for the evidence-only pass is not in the ledger row.

# 2. It flagged something fine

Sites in the tree: 0. Known specimens are already filed (EBITDA extracted as a name, B433; an em dash read from a hyphen, B102). Prevalence is not countable from the code.

Measurement. The same two full passes as mode 1, scored on the leave-alone set: a mark, a concern, or a non-quiet label on a sentence the label file calls clean. Separately, count name-extractor hits that are not names on the four clean real runs already committed under `tests/fixtures/real-runs-*`. That second count is a read of stored cards. USD 0. The live rate still wants the fresh passes above.

# 3. It knew and did not say

The editorial and compliance reviewer runs this chain on a concern that already exists, in `lib/qc/editorial-compliance-reviewer.mjs` `runEditorialStyleReview`, then `assembleCard` runs another chain. v3 `applyMergedEditorialAndStyle` skips the style backstops, the no-op drops, and the in-reviewer narrative drop. Assembly runs for both routes. None of these writes a drop count onto the card.

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `reading-review.mjs` `readOne` around 151-165, then `attachReadingView` around 290-292. Second `acceptNote` fails. The refused object is replaced with `note: null` before `applyReadingContract`. | The note text and the refusal reason (`missing`, `bucket`, `empty_note`, `endorsing_language`). | No. The reason is used only to build the retry prompt. | No. `sentenceLabel` is Nothing raised, the same words as bucket `none`. | High. This is the known live instance of a withheld note. |
| `statement-verdict.mjs` `statementVerdict` 47-71 never returns `note_withheld`. `reading-contract.mjs` 30 and 542-546 still have the Needs a look line, and `draftHeader` still counts `note_withheld`, which stays 0. | The distinction between a refused note and nothing to say. | The copy exists. It is never assigned. | No. | High. The copy that drew the distinction is dead. B423 took the full assessment, which was the other place it lived. |
| `reading-contract.mjs` `acceptNote` 345-366 rejects a dispute, and `readOne` keeps `accepted.note` and drops `accepted.rejections`. | The rejection (`not_in_statement`, `not_named`, `index_out_of_range`, `wording_never_disputes`, `none_never_disputes`). | No payload field and no log. | No. | High. A dispute the note tried to name, that is not a figure, date, name, or benchmark, is dropped here. |
| `reading-contract.mjs` `suppressReassurance` 124-132. A `not_found` fact is present and every sentence of the note matches a reassurance phrase (`does not change the claim`, and the four siblings). | The note text. The bucket is kept, so the state can still be conflicts or beyond. | No log. The empty string is the text. | The state label stands with no sentence under it. | High. An assertion with the reason deleted. |
| `editorial-compliance-reviewer.mjs` `normalizeCombinedConcern` around 559-604, applied around 1967. Category is neither editorial nor style, the rule id is empty or in neither book, the note is empty, or the direction is empty. | That concern. | Log `[EDITORIAL_STYLE_REVIEW] concern dropped` and canary `editorial_concern_dropped`. Not on the card. | No. If every concern dies and the model said `concern`, the attempt is retried and can end `not_reviewed` (`editorialNotReviewedReason` `schema_invalid`). | High. A whole response can vanish into not reviewed. |
| Same function, 576-584. The stated category is the other book, and the id is in that book. | The stated category. The concern is kept. | Log and canary `editorial_concern_reclassified`. | The concern appears under the other category. No word says it was moved. | Medium. Mislabelled, not deleted. |
| `applyFidelityGate` / `verifyFidelity` around 717-746 and 1288-1303. A statement-cued quote is not in the statement, or an evidence-cued quote has no excerpt or is not in the excerpt. On the v4 editorial call the excerpt argument is null, so any evidence-cued quote drops the concern. | The whole concern. | Log `[FIDELITY_DROP]` with statement index, reviewer, rule, and reason. No canary. Not on the card. | No. An emptied list becomes `clean` around 2103. | High. The verdict can become clean. |
| `applyDeterministicStyleFilters` 1262-1286, table 900-1149. v4 combined path only. Each rule returns false on its own predicate: `active_voice_preference` when the span is not passive; `oxford_comma` when the span has no comma and has "and" or "or"; `english_variant` when no British spelling survives the US allowlist; `date_format` when the span is already DD Month YYYY; `number_spelling` on a percent, a quarter label, or a spelled 0 to 12; `percentage_notation` when the span or the statement already uses `%`; `thousand_separator` when there is no thousands separator, or the statement uses apostrophes only; `currency_format` when the statement already has an ISO code before the amount; `first_person_plural` when the span has no we/our/us; `voice_consistency` when the house is third person, the note says first person, and the span has no first-person pronoun; `defined_term_capitalisation` when the term is not defined in the draft, or the span already capitalises it; `smart_quotes` when the statement has no curly quotes; `em_dash` when the statement has no em dash or en dash. No usable span keeps the concern, except the four statement-scoped rules. | That style concern. | One `console.log` per drop. No canary. Not on the card. | No. | Medium. Several of these drop a concern that was already wrong. The drop is still silent, and a true miss of the predicate keeps a false one. |
| `suppressNoOpSuggestions` 1181-1194. `suggestedRewrite` equals the statement after whitespace collapse. | The concern. | Log `[style_guide] concern dropped, suggestedRewrite is identical`. No canary. | No. | Low. The rewrite would have changed nothing. The reader is not told a concern was raised and dropped. |
| `suppressNoChangeDirections` 1233-1252. Direction matches "no change needed", or every quoted replace-pair is identical. `smart_quotes`, `em_dash`, and `thousand_separator` are exempt from the identical-replace test. | The concern. | Log `[style_guide] concern dropped, suggestedDirection changes nothing`. | No. | Low. Same shape as the row above. |
| `suppressEvidenceLanguageConcerns` 1214-1230. Rule is `underreach_hedging` and the note or direction matches evidence, source, supported, unsupported, or substantiat. | That concern. `overreach_unsupported_causal` is not in the set. | Log `[editorial] underreach_hedging concern dropped`. No canary. | No. | Medium. An evidence point filed on an editorial rule is deleted rather than moved. |
| `dropNarrativeCoherenceConcerns` in `narrative-coherence.mjs` 27-31, called from the reviewer around 2094 and again in `stage7-assemble-card.mjs` around 892-908. Flag default off, and the rule id is `narrative_coherence`. | That concern. If none remain, the verdict becomes `clean`. | No log, no canary, no field. | No. | Medium. The only drop in this chain with no record at all. |
| `stage7-assemble-card.mjs` editorial duplication judge around 911-976. v4, evidence verdict conflicting, at least one editorial concern, and the judge returns that index in `suppressIndices`. | That editorial concern. The verdict is recomputed. | Canary `editorial_concern_suppressed_by_judgment` with rule id and concern text cut at 200 characters. Not on the card. A failed judge keeps the concerns. | No. | High. A conflicting card can lose the editorial note and read clean on that signal. |
| `applyDuplicateMerge` in the same file, grouping around 166-195. Spans overlap by at least 0.8 of the longer span, same rule id, and note/direction token overlap at least 0.85. | The later concern's separate identity. | Canary `editorial_duplicate_concerns_deduped` or `_merged`, and the compliance twins. Not on the card. | One concern, sometimes with notes joined as (i) (ii). | Low. The substance is still there. |
| `editorial-source-awareness.mjs` `applyEditorialSourceAwareness` 94-151. The concern's phrase is already in a matched passage. Causal and evaluative rules use their own phrase extract. Other rules need a phrase of at least two words. | That editorial concern. Verdict recomputed. Card-level direction and rewrite become null when the list empties. | Log `[editorial] source-awareness dropped` and slug `editorial_phrase_in_source`. The dropped array is not on the card. | No. | High. A real objection whose words also appear in the source is removed, and the verdict can become clean. |
| `dropForwardLookingInExcerpt` 869-898, called again from assembly around 1482-1494. Rule is `forward_looking_statement_without_qualifier` and the span's phrase is in the primary or conflict excerpt. | That compliance concern. An emptied reviewed list becomes `clean`. | Log `[compliance] forward_looking_statement_without_qualifier dropped` plus the phrase. Not on the card. | No. | Medium. The phrase is in the excerpt, so the drop may be right. It is still silent. |
| `stage7-assemble-card.mjs` 1593-1595. Any throw inside `assembleCard`. | Every concern already on the editorial result, and the evidence assembly. | No. The catch is empty. | A `not_reviewed` card with empty concern arrays and no reason. | High. A formed review becomes a blank miss. |
| `statement-verdict.mjs` `editorialVerdictWithoutCausal` 95-104, applied in `applyReadingContract` 597. At least one concern is `overreach_unsupported_causal`. If it was the only one, and the prior verdict was not `not_reviewed`, the editorial verdict becomes `clean`. | The editorial signal for that rule. The concern object stays on `editorialConcerns`. | Yes. The concern is still on the card, and `statementVerdict.setBy.rule` is that rule when it set the state. | The editorial row can say clean. The frontend then removes the concern from the editorial list (`StatementReviewCard.jsx` 475-476). | High. See the causal row under Wrong layer. |
| `evidence-findings.mjs` `cardEvidenceFindings` 96-100. An entry is kept only when its rule is `overreach_unsupported_causal` or `partial`. An entry whose rule already set the headline is skipped (`headlineStates` 64-67). Stage 2 never writes rule `partial`. | The evidence sentence for a causal concern, and every other action-list rule. | The concern remains on `editorialConcerns`. `evidenceFindings` simply omits it. | No evidence sentence. `displayedEvidenceProse` (`evidence-findings.mjs` 75-79) is `""` when the note is missing or matches confirms, confirmed, as stated, or aligns with. | High. Goes beyond the source with nothing underneath. |
| `generic-company.mjs` `applyGenericCompanySuppress` 132-156. `displayVerdict` is `supported_partial`, there is no `displayVerdictReason`, and "the company" resolves to one antecedent named in the previous sentence and in the confirming passage. | The partial, and any summary sentence that contains both "however" and "not" (`stripGapSentences` 117-125). | Log `[stage7] generic-company-suppress`. The antecedent is not a card field. The prior partial is not stored. | The card becomes full support. The gap sentences are gone. | High. The referent finding is deleted. |
| `stage2-match-sources.mjs` `applyPeriodGateBackstop` 902-975. Both periods normalise, they do not overlap, and a confirmed or conflicting class is rewritten to `no_support`. A same-frame case rewrites confirmed to conflicting. A frame mismatch rewrites conflicting to `partially_confirmed`. | The model's class. `preBackstopClassification` is set around 1052 and is not copied onto the card (it appears only in this file). | Canaries `period_gate_downgrade_fired` and `period_gate_frame_mismatch_partial` when a trace id is set. The fingerprint keeps `sourceIndex`, `sourceLabel`, `classification`, `systemFingerprint` (`stage7-assemble-card.mjs` around 1269-1282). | The user sees the rewritten class. For `no_support`, stage 4 sets `primaryExcerpt` null, so the passage that carried the period is not the quote. | High. A conflict becomes "no support" and the quote goes with it. |
| `applyRoundingToleranceBackstop` around 892-898. Conflicting plus `within_rounding` becomes confirmed. | The model's conflict. | `preBackstopClassification` stays off the card. | The card reads confirmed. | Medium. A small disagreement is relabelled as agreement. |
| `card-honesty.mjs` `applyOmissionConflictInvariant` 259-294. The only stated ground is "does not mention X" and a stored span already contains X. | The conflict. Support becomes `supported`, `displayVerdict` `supported_full`, `hasConflict` false. The omission sentences are deleted. | No log and no `applied` field. Fingerprints can still say conflicting. | The card reads full support. | High. A formed conflict is erased. |
| `source-dateline.mjs` `applySourceDatelineToCard` 227-255. A partial whose unsupported spans are announcement-only becomes `supported_full`, and `unsupportedSpans` is set to `[]`. `stripTimingSilence` 177-181 removes timing-silence sentences. | The partial and those sentences. | No field records the cleared spans. | The card reads full support. | Medium. A timing partial disappears. |
| `pipeline-v4/index.mjs` `marksForCards` around 181-193. `droppedMarks` is a count. The dropped surface and the reason (`offset`, `surface`, `statement-span`) are not on the payload. `entries` is passed empty, so a concern quote is not a mark unless the note also quotes it. | The mark. The note can still show. | Yes, the count `droppedMarks`. | No component reads `droppedMarks` (`useDraftState.jsx` stores it around 1864). | Medium. The reader is not told a mark was dropped. |
| `constructive-feedback.mjs` `stripUnquotedCraft` 1080-1105. A paragraph is not the readiness line, does not cover a named finding, and does not quote the draft. | That paragraph of the piece. The card concerns stay. | Log only when `CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT=1`. | The paragraph is absent. B423 took this piece off the review screen. The endpoint still drops it. | Low on the current screen. The drop is silent wherever the piece is still fetched. |
| `summariseReview.js` 18-22 and `review-summary.mjs` 108-119. `statementVerdict.state` `nothing_raised` counts as confirmed. `beyond` counts as partial. `displayVerdict` `supported_partial` is not read once a statement state exists. | The partial, as a count. The finding text can still be on the card. | Yes. `supportState` and `displayVerdict` stay on the card. | The summary can say all claims are backed. The bullet "only partial support" does not fire for these cards. | High. This is how a partial becomes invisible in the total. |
| `reviewSummaryDisplay.js` 73-181. Bullets stop at three, in a fixed order: unsupported, conflicting, not checked, partial, single source, missing deal fields, editorial or compliance, unbadged. | Later bullets. | The summary object still has the counts. | No word says the list was cut. Export sends the same three (`exportReport.js`). | Medium. An editorial concern never reaches the summary when two evidence bullets already filled it. |
| `attentionHeader.js` 9-32 and `ReadingHeader.jsx` 5-11. Any `not_found` fact or any `sentenceState` `beyond` produces the attention line, and that line is rendered instead of `header.numbers` and `header.line`. | Conflicts, disputed matches, wording notes, and compliance, as header text. | The backend header is still on the payload. | The reader sees the attention line only. | High. A conflict line the backend wrote is not shown. |
| `summariseReview.js` 55. `suppressInQcWorkbench === true` removes the card from every total. The list skips it (`StatementAnalysisPanel.jsx` around 2755). | The card. | The flag and the raw list. | No "N hidden" line. | Medium. A card the pipeline marked suppressed is gone from the screen totals. |
| `StatementAnalysisPanel.jsx` around 1073-1079. `recheckClearedDecisionIds` is non-empty. | `evidenceFindingsByStatement` for the whole run, not only the cleared ids. | The cleared ids. | No word says the map was cleared. | Medium. Findings that lived only on that map disappear from every card. |
| `actionListDisplay.js` around 357-369. Kind is not evidence, editorial, or compliance, or the check is off, or the finding row is missing. Framing and recency are dropped here. | The proposal. | `orphanCount` is computed and not rendered. | No "N proposals not shown". | Medium. |
| `readableExcerpt.js` 5-7 and `cardExcerptDisplay.js` 52 and 73. The passage has no letter or digit, and `excerptNotLocatable` is not true. | The extract. | The passage is on the payload. | No. The "No passage to show." line is only for `excerptNotLocatable === true`. | Medium. B425 stopped a bare quotation mark. A punctuation-only passage still vanishes with no words. |

Sites: 32. The three worst are the refused note, the partial that the summary counts as confirmed and that never becomes an evidence finding, and the filter chain that can recompute a verdict to clean with no count on the card.

# 4. Two parts of the screen disagree

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `summariseReview.js` 21-22 and `reviewSummaryDisplay.js` 109-114. State `beyond` increments `evidence.partial`. The bullet says "N claims have only partial support from the cited sources." The card label for that state is Goes beyond the source (`combinedVerdict.js` 11). | One name for the state. | Both strings exist. | The summary says partial support. The card says Goes beyond the source. | High. This is the partial-support label B432 is holding. |
| `summariseReview.js` 22 and `reviewSummaryDisplay.js` 164-175. State `nothing_raised` increments confirmed. Readiness Ready with every check on uses "All claims are backed by sources and no editorial or compliance concerns were found." | The difference between nothing raised and backed. | `sentenceLabel` is still Nothing raised on the card. | The summary says backed. The card says Nothing raised. A `supported_partial` card whose statement state is `nothing_raised` is in the backed count. | High. |
| `displayVerdictLabels.js` around 59-64. When `statementVerdict.state` is set, `displayVerdict` is not the label. `supported_full` is labelled Nothing raised. `factualBadge === false` returns an empty label. | The Stage 2 verdict as a label. | `displayVerdict` and `supportState` remain on the card. | The evidence row can read Nothing raised, or be blank, while `displayVerdict` is `supported_partial` or `conflict`. | High. |
| `combinedVerdict.js` 59-66 and `cardBorderTone` in `checkStateDisplay.js` 76-86. After the causal rule is filtered out, no remaining editorial or compliance concern yields nothing_raised and a green edge. | The edge as a signal of the causal finding. | The concern is still on `editorialConcerns`. | A green edge can sit beside an evidence row that still has a finding, or beside nothing, depending on the evidence-findings join. | High. |
| `summariseReview.js` 59-66 and `qcWorkbenchFilters.js` 34-43. `needsAttention` is true for not supported, conflicting, and editorial or compliance concern. It is false for partial, beyond, unverifiable, and unbadged. | Beyond cards from the "To look at" filter. | Both the flag and the state. | The filter's closed label does not say that beyond is excluded. `unverifiable` is added to the summary not-checked count and is not in the Not checked filter (`qcWorkbenchFilters.js` 54-59). | Medium. The totals and the filter disagree. |
| `appliedDecisions.js` 37-38 and `qcWorkbenchFilters.js` 36-42. A written statement id is forced to `dealt_with`. | The card from "To look at". | The chip and the concern list both exist. | The chip says Dealt with. The concern text is still on the card until a later re-check replaces it. | Medium. |
| `combinedVerdict.js` 100-104 and `AssessModule.jsx` around 360-364. Wording and nothing-raised get no draft wash. After the draft changes, marks are withheld while the Verdicts switch can stay on and the cards keep the previous verdict. The banner says the draft has changed and asks for a re-run. | Draft colour for wording, and all colour after an edit. | The cards still hold the old verdict. | The banner does not say the colours were removed. | Medium. |
| `sourceHighlightSegments.js` 8-12 and `sourceRelationPrefix.js` 2-6. Any classification other than confirmed, partial, or conflicting is painted amber and prefixed "Relates to the statement:". | The actual class, as a colour and a prefix. | `classification` is on the span. | Amber, and that prefix, for a class the screen does not name. | Low. |
| `StatementReviewCard.jsx` around 1360. The framing row title is fixed as "Framing goes beyond the source". | The concern's own ground, as a title. | `framingFidelityConcerns` still hold the text. | The title says beyond even when the concern says something else. | Low. |
| `export-review-data.mjs` `buildReviewData` 46-54 and `evidenceFindingForExport` 16-28. The verdict string comes from `displayVerdict`. The finding text is `reasoningParagraph`, then `reasoningHeadline`, else "Not recorded." | `sentenceLabel`, `statementVerdict`, and `displayedEvidenceProse`. | Those fields are on the card. | The file can say a different verdict from the card, or "Not recorded." when the prose was moved onto `displayedEvidenceProse`. | High. The record and the screen disagree. |

Sites: 10. The three worst are the summary calling beyond partial support, the summary counting Nothing raised as backed, and export printing a different verdict and a different evidence sentence from the card.

# 5. It cannot show me why

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `displayedEvidenceProse` in `evidence-findings.mjs` 75-79. State is beyond, conflicts, or not_in_source, and the note is empty or matches confirms, confirmed, as stated, or aligns with. | The why sentence. Stage 5's paragraph is not used for these states. | The note and `reasoningParagraph` stay stored. | The label stands. The prose is empty. | High. |
| `cardEvidenceFindings` skips the causal rule when `setBy.rule` is that rule, and never receives a `partial` rule from Stage 2. | A line of source, or of the concern, under the headline. | `evidenceSummary` can still describe the gap. | On a collapsed evidence row, excerpts and `evidenceSummary` render only after the chevron (`StatementReviewCard.jsx` around 1117). The "N findings" marker is driven by `evidenceFindings`. An empty list has no marker. | High. The partial's reason is behind a control that does not say a reason is there. |
| `not-reviewed-reason.mjs` 1-4. Reason slugs are on the card. The module says they are not shown to the reviewer. | The specific miss (`schema_invalid`, `empty_completion`, `rate_limit_window`, and the rest of `NOT_REVIEWED_REASONS`). | Yes. `editorialNotReviewedReason`, `complianceNotReviewedReason`, and sometimes `commentaryNotReviewedReason`. | The row says Not checked. The summary sentence is the generic not-fully-checked line, or the capacity line when `rateLimitBoundHits.statements > 0` (`reviewSummaryDisplay.js` 91-105). One capacity sentence covers every not-checked claim in the run. | High. The product recorded why. The screen does not say it. |
| `concernDisplayText.js` `buildConcernText` 60-64. Neither `note` nor `concernText` is non-empty. | The bullet. | The row is still in the array. The label uses the array length (`StatementReviewCard.jsx` 484-485). | The row can say "2 concerns" and the opened list can be empty. | Medium. A count with no sentence. |
| `SentenceDetail.jsx` count-only occurrences. A date with more lines than `DATE_EXTRACT_LIMIT` (8, `reading-contract.mjs` 36) shows the count and no extracts. | The lines. | The count. | "N lines", and not the lines. | Low. This one is labelled. |
| Stage 2 fingerprint (`stage7-assemble-card.mjs` around 1269-1282) keeps classification and omits `periodAssessment`, `explanation`, `preBackstopClassification`, and `passageRejected`. | Why a class was rewritten, and the passage that was rejected. | In memory during Stage 2. A canary for some period-gate cases. | The rewritten class, with no period sentence, once the excerpt has been nulled. | High. |
| `StatementReviewCard.jsx` citation chips around 854-867. When `displayVerdict` is set, a source is kept only if it has both `body` and `whatThisShows`, then the list is cut at 5. | Sources past five, and sources missing either field. | `supportRefIds.length`. | No "N more". | Medium. |

Sites: 7. The three worst are the empty evidence prose, the partial with no finding marker, and the not-reviewed reason that stays on the payload.

# 6. It did not cover all of my draft

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `stage1-extract-statements.mjs` 264-287. `isClaim === false`, and at least one statement is a claim. Those rows leave the reviewed set. If every row is a non-claim, all are kept. | A review of that sentence. | Log `dropped N non-claim statement(s)`. `meta.draftCoverage.dropped` with reason `not_a_claim` (`draft-coverage.mjs`). | Yes, when coverage is on the payload. The screen heading is "Not checked as claims" and the fallback words are "Not checked as a claim (heading, salutation, or transition)." (`draftCoverageDisplay.js` 21-24). | Low. This drop is disclosed. The known exhibit is B248, the last sentence of the R6 draft. |
| `computeDraftCoverage` uncovered runs. Text no card and no drop covers. | A review of that slice. | `draftCoverage.uncovered`. | "Not covered by the review", when the field is present. | Low when the field is present. |
| `draftCoverageDisplay.js` `coverageIsVisible`. `meta.draftCoverage` is absent. | The fact that coverage was not computed. | Nothing on the payload. | The section is not rendered. Both counts are treated as 0. | Medium. Absence looks like full coverage. |
| `StatementAnalysisPanel.jsx` around 626-628 and `DraftContextPanel.jsx` around 167 and 344. `draftSpan` does not locate the statement, and the Quality-page overlap stays under 0.6. | The highlight. The card can remain. | The span and the locate failure. | "This sentence could not be found in the draft." unless the draft was classified replaced, in which case that note is suppressed. | Medium. On a replaced draft the reader is not told the highlight missed. |
| `stage2-match-multipassage.mjs` `pairNeedsWidenedPass` around 196-201. A `no_support` pair is not sent for extra passages. B253. | Extra passages on a no-support pair. | No user-facing count. The skip is the code. | No. | Low. Cost control by design. The reader is not told the search stopped. |
| `stage2-match-sources.mjs` around 878-879, inside the rounding backstop. A recommendation or sign-off sentence is forced to `no_support`. | The model's class on a closer. | The rewritten class only. | No support, with no word that the sentence was treated as a closer. | Medium. |
| `claim-spans.mjs` `rollupClaimVerdicts` forces `upgrade = false`. The branch in `pipeline-v4/index.mjs` around 645 cannot currently turn a partial into confirmed. | A claim-span upgrade that the code's comment still describes. | `claimUpgrade` stays false. | The partial stays partial. The reader is not told a span check was switched off. | Low. This one refuses a change rather than hiding a finding. |

Sites: 7. The three worst are a missing `draftCoverage` field that looks like full coverage, a sentence the highlight cannot find on a replaced draft, and a closer forced to no support with no word that this happened.

# 7. It complains but will not fix, where the correction was derivable

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `concernDisplayText.js` 16-22 and 45-52. The last sentence starts with delete, remove, replace, rephrase, rewrite, keep, cut, or "the phrase becomes". If every sentence is a command, the text is kept. | The trailing correction. The complaint sentence remains. | The full `note` or `concernText` is on the payload. `suggestedDirection` is a separate field and is not the bullet (`buildConcernText` comment at 56-58). | The bullet shows the complaint. The direction is not in that bullet. | High. The derivable fix is on the payload and off the bullet. |
| `reading-review.mjs` `proposeDraft` 216-218. The statement has no `not_found` fact. | A proposal. The note may already say what to change. | `called: false` on that diagnostic shape. The review card does not say a proposal was skipped because every fact matched. | No proposal control. | High. A partial whose facts all matched, including the HICL refinancing sentence, never gets this call. The correction is often derivable from the note. |
| `actionListDisplay.js` 368-369. Kind is `framing` or `recency`. | The proposed change. | The concern row can still render. | The concern shows. The proposal does not. | Medium. |
| `StatementReviewCard.jsx` around 581. `sort.reasonCode === "first_person_unnamed"`. | `noProposalReason` and any acknowledgement. | The reason code is on the sort. | Nothing rendered for that row. | Medium. |
| `actionListDisplay.js` 264-268. The sentence is no longer the sentence the proposal was built for. | The proposed sentence. | The proposal is still in the list until this branch. | "You have rewritten this sentence in the draft." | Low. The reader is told. The proposed sentence is not shown. |
| `CardEvidenceFindings.jsx` around 81-95. `noProposalReason` is rendered for an `ACKNOWLEDGE` finding that made it onto the card. Any other disposition with a reason does not get that line. | The reason there is no fix. | The reason is on the entry. | No, except the acknowledge case. | Medium. |

Sites: 6. The three worst are the trailing fix stripped from the bullet, the proposal call skipped whenever every extracted fact matched, and framing and recency proposals never attached.

# 8. It ranks trivia above risk

The order itself, read from the tree:

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `combinedVerdict.js` `COMBINED_RANK` 16-23. Order is not in the source, conflicts, compliance risk, beyond, wording, nothing raised. The statement list sorts by that rank, then draft position (`StatementAnalysisPanel.jsx` around 2194-2207). | Nothing in this order. Wording sits below source and compliance risk. | The rank. | The list follows that order. | Low as a defect. This order does not put wording above a source conflict. |
| `attentionHeader.js` 23-30. Not-found facts are named. Beyond is "N worth a glance". Conflicts are not in the line. | A conflict, as the lead sentence, whenever the attention line is non-empty. | The backend header still has the conflict line. | The glance line can be the only header while a conflict is on a sentence. | High. A light item is the headline and a demand is not in it. |
| `reviewSummaryDisplay.js` 73-151. The three-bullet cap is spent on unsupported and conflicting before any editorial or compliance bullet. | The editorial or compliance count, as a summary sentence. | `signalConcerns` is on the summary. | The cards still list those concerns. The summary does not, once two evidence bullets exist. | Medium. Risk in the evidence layer crowds out the other layers. It does not put a style note above a conflict. |
| `materiality.mjs` `computeCardMateriality`. Editorial craft and marketing score minor. Style-format codes score mechanical. The concern is not removed. | A rank, not the concern. | `card.materiality.level`. | The level is on the card for whatever surface reads it. A mechanical style note and a partial can share a screen with no order between them driven by this score. | Low. The score does not delete the finding. |

Sites: 4. The three worst are the attention header leading with a glance while a conflict is unmentioned, the three-bullet cap, and materiality scoring craft as minor while a partial has no rank of its own.

Prevalence, not run. On each committed review payload, list the cards in `COMBINED_RANK` order and list the three summary bullets. Count drafts where a wording or mechanical card appears in the summary or the header while a conflict, a not-in-source sentence, or a beyond sentence does not. That read is USD 0. It was not done in this census. A live rate, on fresh reviews, is the same two full passes as mode 1, and the same unpriced full-pipeline cost.

# 9. My edit did not land, or the finding did not clear

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `useDraftState.jsx` 1837-1852 and the same branch in `useAssessState.jsx` around 1292-1307. `next.stale` is not true. | The new verdict. `text` and `draftSpan` change. Facts, note, `sentenceState`, concerns, and prose stay. The reading sentence does the same (`useDraftState.jsx` around 1874). | The new text and the old verdict are both on the row. | No word says the finding belongs to the previous sentence. The banner for a changed draft is a different path and does ask for a re-run. | High. The finding did not clear, and it did not move onto the new words on purpose. It simply stayed. |
| `appliedDecisions.js` 37-38. The statement id was written. | A cleared concern. The text of the concern stays until a later re-check. | The dealt-with chip and the concern list. | "Dealt with." The finding is still visible. The card leaves "To look at". | High. |
| `StatementAnalysisPanel.jsx` around 1122-1124 and `actionListDisplay.js` 9. Apply does not write, or the action-list fetch fails. | A clear account of which failure it was. | The error. | The toast is "Failed to load version" for both. A zero-length `writtenStatementIds` returns before any toast. | Medium. The reader cannot tell a missed edit from a missed load. |
| `applyNoticeCopy.js` 10-18. Overlap and modify have their own sentences. Any other notice uses `notice.message`. An empty notice renders nothing (`StatementReviewCard.jsx` around 1199). | The notice. | The notice object, when present. | Nothing, when the notice is empty. | Low. |

Sites: 4. The three worst are the non-stale re-check, the dealt-with chip on a finding that is still on the card, and the shared failure toast.

# 10. It answered differently on the same draft

Sites in the tree: 0 as a rate. One stored disagreement is already visible and is named under partial support: the clean ClearPoint card says the 25 percent device figure is not confirmed, and a longer stored summary of the same sentence says it is confirmed. That is two payloads, not a controlled repeat.

Measurement. Run the four clean drafts named in `scripts/diagnostic/b403c/measure.mjs` (`DOCS`: 3i, HICL, GPI, ClearPoint), twice, cache off, same code. Compare `sentenceState`, `supportState`, `displayVerdict`, and concern codes per statement index. Temperature 0 does not pin `hasConflict` (B61). P2 asks for two or three runs.

Cost. One note-step pass of the eight drafts (clean and doctored) was USD 2.622955 list, 80 calls (ledger 2026-10-18, b403c). That is the note step only. B429 describes one clean HICL review as about USD 0.81, of which the note step was about USD 0.30. Those are B429's figures, not a ledger cell for a two-run full pipeline. A fresh pair of full reviews is unpriced until the harness prints an estimate. Wall clock for the b403c note pass is not in the ledger row. The 3,698-word full review was 267 seconds for one draft.

# 11. It ran without telling me it did not run

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| The refused per-statement note, same site as mode 3. The call ran, refused its own output, and the sentence is Nothing raised. | The fact of the refusal. | No, after `attachReadingView` nulls the note. | No. Indistinguishable from a run with nothing to say. | High. |
| `not-reviewed-reason.mjs` 1-4, with the summary line in `reviewSummaryDisplay.js` 91-105. A requested check finished `not_reviewed`. | The reason slug, as words. | Yes, the slug. | "Not checked", plus either the capacity sentence or "could not be fully checked. Read them yourself or run Review again." | Medium. The reader learns it did not finish. The reader does not learn why, except the one capacity sentence. |
| Toggle off. `classifySignal` returns null when the flag is not true (`review-summary.mjs` 151). Assembly forces `not_reviewed` and an empty list when the flag is not true. | A per-statement reason. Off is not the same slug as a miss. | The summary class is null for that signal. | "Turned off for this run: ..." (`checkStateDisplay.js`, `TURNED_OFF_LINE_PREFIX`). | Low. This one is said. |
| `runEditorialComplianceReview` returns immediately when `BRIGHTLINE_EDITORIAL_REVIEW !== "1"` (reviewer around 2337-2339). Assembly then treats a null verdict, with the toggle still on, as `not_reviewed` and writes no reason. | The difference between off and a miss. | Log `[EDITORIAL_REVIEW] gated off`. | Looks like a miss: Not checked, empty concerns, reason null. The turned-off line depends on the summary class being null, which this path does not set. | High. It did not run, and the screen describes a failed check. |
| `assembleCard` empty catch, 1593-1595. | The review that threw. | No. | Not reviewed, no reason. | High. |
| `stage5-generate-commentary.mjs` empty result after retry, no key, or a thrown call. `commentary` `""`, `notReviewed` true. Schema failure sets a canary `stage5_schema_validation_failed`. `commentaryNotReviewedReason` is `rate_limit_window` only for that error. | The commentary. The verdict is unchanged. | `commentaryNotReviewed: true`. Reason null except the rate-limit case. | Not checked on the evidence row when the classifier sees the flag. The schema-failure reason is not on the card. | Medium. |
| `pipeline-v4/index.mjs` around 774-775. `skipCommentary` stores `commentary: ""` and does not set `notReviewed`. | Commentary, by option. | The empty string. The flag that would mean "did not run" is absent. | An empty evidence line that looks like a finished card with nothing to say. | High. |
| `StatementAnalysisPanel.jsx` around 1007-1010. `VITE_REVISE_ACTION_LIST` is off. Entries and findings are set empty and fetch state is idle. | The action list. | The flag. | No sentence says proposals were not loaded. | Medium. |
| `StatementAnalysisPanel.jsx` around 2514-2523. `result.ok === false` or `meta.reviewDidNotRun`. | Any statements that payload also contained. | The flag. | "The review did not run." Cancelled: "Review cancelled." Plus "The draft and sources are unchanged." | Low. This one is said. |
| `checkStateDisplay.js` `turnedOffLineOf` around 129-134. `summaryClass` itself is null. | The turned-off line and, with it, the concern lists (`StatementReviewCard.jsx` 448-451). | The concern arrays may still be on the card. | No row and no turned-off line. | High. Off, a miss, and a missing class object look the same: nothing. |

Sites: 10. The three worst are the refused note that looks like a finished quiet sentence, the editorial gate that looks like a failed check, and `skipCommentary` storing an empty line with no not-reviewed flag.

# 12. I cannot show my work

| site | what is lost | product knows | user learns | severity |
| --- | --- | --- | --- | --- |
| `export-review-data.mjs` 16-54, and the frontend export of the three summary bullets. | The statement label, `displayedEvidenceProse`, `evidenceFindings`, and `readingNote`, as the exported finding. Card text travels only inside `qcResult` when "Statement review" stays selected. | The fields are on the payload. | The quality-review section is readiness plus at most three bullets. The finding cell can be "Not recorded." | High. |
| `ExportModal.jsx` around 63-65. `writerFeedbackStatus === "withheld"`. | The reviewer-assessment section. | `writerFeedbackStatus`, `writerFeedbackRefused`, and `writerFeedbackRefusal` are on `reading` for the writer note (`reading-review.mjs` 256-260). | The reading view says "The writer note was withheld." (`ReadingView.jsx` 39-40). The export modal does not. The card summary panel returns null (`ReviewSummaryPanel.jsx` 32-37). | Medium. One surface says it. The export and the card screen do not. |
| `droppedMarks` stored and never rendered or exported. | Which marks were dropped, and why. | The count. | No. | Medium. |
| `useReviewStatePersistence.js` around 49. `meta.replayed === true`. | The autosave. | The replayed flag. | No notice. | Medium. A refresh loses a replayed review and does not say so. |
| `useReviewStatePersistence.js` around 88-97. A 413 or `state_too_large`. Other save failures. | The review, after a refresh. | The error. | The too-large case says "This review is too large to save automatically. Your work will not be restored if you refresh." Other failures are a console warning. | Medium. The too-large case is said. The other failures are not. |
| `not-reviewed-reason.mjs` 1-4. The slug is on the card and is not in the export words. | The reason, in the file the reader can hand to someone else. | The slug. | The export uses the same Not checked label as the screen. | Medium. |

Sites: 6. The three worst are export omitting the reading line, a withheld writer note that the export does not mention, and a save failure that is only a console warning.

# Silent nothings

Every place the product produces nothing and says nothing about why. Wording is not proposed here.

The known live instance. The per-statement note. `acceptNote` can refuse the note. After one retry, `readOne` still holds `{ refused: true }` only until `attachReadingView` replaces a refused note with null. `statementVerdict` then returns `nothing_raised`. `sentenceLabel` is Nothing raised. `note_withheld` and the line "1 statement needs a look" are still in `reading-contract.mjs` and are never assigned, because no statement state is ever `note_withheld`. In the committed reading artefacts the script scanned (`reading.json` and `notes.json` under `scripts/diagnostic`), 6 attempts carry a refusal reason and 0 of those statements have an empty shown note afterwards. The stored runs recovered on retry. The live path still has nothing to show when the retry also fails.

The rest.

1. `suppressReassurance` leaves the bucket and deletes every sentence. The label has no why.
2. `dropNarrativeCoherenceConcerns` removes the concern with no log. An emptied list becomes clean.
3. The `assembleCard` catch returns a not-reviewed card with no reason and no log.
4. Fidelity, each style backstop, the no-op drop, the no-change drop, and the evidence-language drop log and do not put a count or a reason on the card. The screen shows a shorter list, or clean.
5. Source awareness and the forward-looking drop log the phrase and do not put it on the card.
6. The duplication judge records a canary and not a card field.
7. `stripGapSentences` inside the generic-company lift deletes the gap sentences as part of turning a partial into full support.
8. `stripUnquotedCraft` deletes a paragraph and logs only when `CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT=1`.
9. A passage with no letter or digit, and `excerptNotLocatable` not set, renders nothing. There is no "No passage" line for that case.
10. `skipCommentary` stores an empty commentary and does not set `notReviewed`.
11. `summaryClass` null hides the concern arrays and the turned-off line together.
12. The action list, when `VITE_REVISE_ACTION_LIST` is off, is cleared and the screen does not say proposals were not loaded.
13. `rejections` from `acceptNote` are dropped with no field.
14. `droppedMarks` is a count nobody renders.
15. `orphanCount` for proposals is computed and not rendered.
16. A save failure that is not "too large" is a console warning.
17. A replayed result is not autosaved, and there is no notice.
18. The writer note, on the card screen and in the export modal. The reading view does say it was withheld. Those two surfaces say nothing.

# Wrong layer

A finding filed in a layer that does not own it, because the layer that should has no rule.

The four known instances, still in the tree.

1. Causal overreach. The detector is the editorial rule `overreach_unsupported_causal`. Stage 2 has no causal class. `statementVerdict` treats the rule as evidence and can set `beyond`. `editorialVerdictWithoutCausal` then cleans the editorial verdict. `cardEvidenceFindings` omits the entry because the headline was set by that rule. `displayedEvidenceProse` does not copy the concern's note. The revise inventory files the action as `evidence` (`inventory.mjs` around 119). The concern's sentence stays on `editorialConcerns`, which the card then filters out of the editorial list. The evidence line can be empty.

2. Partial support. Stage 2 owns `partially_confirmed`. The statement verdict has no partial state. With every fact matched and no conflicts or beyond note, the state is `nothing_raised`. The summary counts that as confirmed. B432 is this split. The ledger consequence is in the next section.

3. A disputed phrase that is not a figure, date, or name. B435 marks a phrase the note puts in quotation marks (`locatedDisputes` in `reading-contract.mjs` around 277-299, `buildDraftMarks` origin `note`). What remains: `settleFacts` only flips an extracted element, and `extractElements` is figure, date, name, and benchmark. An unquoted verb, scope phrase, or referent is not a mark. `acceptNote` rejections for anything else are discarded. A wording note never disputes, and `combinedVerdict` does not read the wording bucket. Wording there comes from a leftover editorial or compliance concern.

4. Timing, achieved versus promised. Tense is not an element. Nothing compares a draft `will` with a source that states the outcome as done. The period gate compares period tokens, and only when both sides have one. It rewrites the class and then, for `no_support`, drops the passage as the quote. Source recency flags a stale as-of against present tense. It does not read future versus achieved, and it does not change the evidence verdict. The announcement dateline is month versus month for an announcement verb.

How often the achieved-versus-future pattern appears in the committed cards. A screen that requires a future auxiliary in the statement (`will lead`, `will enable`, `will now`, `going to`, `expects to`, and the siblings) and an achieved verb in the excerpt (`completed`, `enabled`, `achieved`, `delivered`, `appointed`, `step-down`), and requires that the excerpt itself does not say `will`, returns 2 unique statements. Both are the HICL refinancing sentence: the clean wording "will lead to a reduction in debt servicing costs", and the doctored wording "will lead to an increase". The excerpt says the refinancing was completed and "enabled a step-down on debt margins earlier than forecast". A looser screen that also matched `delivered` in the excerpt returned 4 unique statements. The other two are the tower sentences, and the source there also says "expected to", so they are not this pattern. Neighbouring timing partials that are not this pattern are listed in the next section: a missing date, a prior year against a first quarter, a marked return stated as a returned one.

The others.

5. Actor, role, scale, dateline, and framing. Each can write `displayVerdict` and sometimes `displayVerdictReason` during assembly. `statementVerdict` does not read those reasons. When the statement state is `nothing_raised`, the headline and the summary ignore a conflict or a partial those checks just wrote. The sentence, if one was prepended, sits in `evidenceSummary` under Nothing raised. Role on an already partial or conflict card keeps the verdict and sets `displayVerdictReason` to null, so the role reason is dropped while the sentence is still prepended.

6. Contradictions stored as partial. Read out of the 106 prose partials: Health Canada issued the licence and the draft says FDA; the source estimates embedded rental reversion at 18 percent and the draft says 40 percent; the source says an eighteen-month partnership and the draft says more than four years. Stage 2 had a conflict available. The card was filed partial. The statement verdict will not call these conflicts unless the note's bucket is `conflicts`.

7. Referent. There is no referent-clarity rule. `applyGenericCompanySuppress` does the opposite of filing one: a resolved "the company" lifts a partial to full and strips the gap sentences. It stands down when resolution fails. Issuer versus subsidiary is the case it does not file. The HICL refinancing card is that case, and it survived only because resolution did not fire.

8. Status of a figure. "Fund IV has returned 1.9 times" against a source that says the fund is currently marked at 1.9 times. "We have committed" against a source that says approval is still sought. These are filed as partial. Neither is thin evidence and neither is a referent. The owning layer would be a status or a tense the element list does not have.

9. `underreach_hedging` when the note uses the word evidence or source. The concern is dropped. It is not refiled on the evidence layer.

10. A wording note. The bucket is real. It does not set `sentenceState`. The statement stays `nothing_raised` unless something else sets it. The screen shows "1 wording note" from `wordingLine` when the bucket is wording. The edge and the summary follow `nothing_raised`.

# What is inside partial support

Population. Every committed JSON card or row whose own `supportState` is `partial` or `partially_confirmed`, or whose `displayVerdict` is `supported_partial`, or whose own `classification` is `partially_confirmed` and which is not a span inside another card. 2,069 rows. 316 unique statements, deduped on the statement text. Ablation files repeat the same sentence many times, so the decision uses unique statements. Occurrence counts would let the Shopify summary sentence, stored 56 times, decide the question.

210 of the 316 have no finding sentence. 206 have an empty summary. 4 say specific commentary is unavailable. Their kind cannot be classified. They are the something-else residue of "a label without a reason", and they are also a silent nothing: the card knew the class and stored no why.

106 unique statements have a finding sentence. `read.mjs` assigns a first class from that sentence. That first pass is in `readings.json` under `primary`: thin 86, something else 16, scope 2, timing 2. Each of those 106 was then read. Eleven of the 16 "something else" rows are the same shape as thin, an extra evaluative word or an extra clause the source does not state, and they are counted as thin. Eleven of the script's thin rows are a date or a period, a referent or a perimeter, or a contradiction, and they were moved. Two of the script's something-else rows are a status disagreement and were moved to timing.

After that reading, of the 106:

| class | unique statements |
| --- | --- |
| Thin evidence. Part of the claim is not in the source. The rest is confirmed. | 86 |
| Timing. A date, a period, a missing timeframe, or a future or achieved status. | 8 |
| Scope or referent. The draft's subject or perimeter is wider than the source's, or is a different party. | 6 |
| Something else. A contradiction filed as partial, a count that still adds up, or a heading vaguer than the source. | 6 |

Thin evidence, three examples.

- "In summary, Shopify combines exceptional unit economics, a defensible competitive position, and clear growth runway." The stored summary says the source supports the growth runway and the competitive position, and does not mention exceptional unit economics.
- 3i clean S1. "The private equity business generated gross investment returns of 14% for the period and accounted for the vast majority of the overall total return." The 14 percent is confirmed. The vast majority is not stated.
- "The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above." The 18 stores are confirmed. The fifth value driver is not addressed.

Timing, three examples.

- GPI clean S0. "In November 2025, GP Industries announced that it intends to shift production capacity..." The shift is confirmed. November 2025 is not in the source. The summary calls it a timing detail.
- ClearPoint clean S5. "Meanwhile, biologics and drug delivery revenue was broadly flat compared with the prior year." The source is the first quarter, a slight increase from 4.7 million to 4.8 million. The summary calls it a period mismatch.
- "Brightway Industrial Coatings and Eltex Power Systems are both progressing toward exit-readiness, with formal processes likely to launch in the first and third quarters." The source has 2026. It does not have those two quarters.

Scope or referent, three examples.

- HICL clean S6. "The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs." The summary says Fortysouth, not the entire company. The unsupported span is the future cost reduction, and the excerpt says the refinancing enabled a step-down earlier than forecast. This one statement is scope and timing together. The class here follows the summary's own however-sentence, which is the party.
- "Second, payer willingness to reimburse digital health products has improved markedly across the major European markets." The source says CDS software, which the summary calls a subset.
- "NorTech ... when we invested in 2021 it was a strong business ... dominant in the broader Nordics." The source says strong in Sweden. Two stored wordings of this sentence are in the six.

Something else, three examples.

- "Elsewhere, the FDA issued a medical device license for the ClearPoint Neuro Navigation System..." The source says Health Canada.
- "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll..." The source estimates the reversion at 18 percent, not 40.
- "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week." The source says an eighteen-month partnership.

The other three in that six are: a draft that expects to bring a specific investment while the source says they are not yet in dialogue with any specific company; "8 employees, including the founders" against "six full-time employees plus two founders", where the total agrees; and the heading "The two challenges" against a source that names the two challenges.

Clean ledger. The bar is demands 3, light 5, quiet 30, noise in demands 0. The clean set is 38 statements. Six of them carry a partial-support card in the clean review payload. All six are ledger "correct" in `scripts/diagnostic/b403c/runs/reading.json`. Five are quiet (`nothing_to_raise`). One is already light (`beyond`): GPI clean, the facilities sentence, whose unsupported span is the China plant and the "will now focus" clause.

The five quiet statements, and the class of each from that card's own text:

| statement | class | tier now |
| --- | --- | --- |
| 3i clean S1, vast majority | thin | quiet |
| HICL clean S6, the company / Fortysouth, will lead | scope, and also timing | quiet |
| GPI clean S0, November 2025 | timing | quiet |
| ClearPoint clean S2, 25 percent for devices, and the cause of the margin | thin | quiet |
| ClearPoint clean S5, prior year against the first quarter | timing | quiet |

Ledger consequence of each option. Nothing here was changed.

Map every partial onto beyond. The five quiet statements move to light. The one that is already light stays. Demands 3, light 10, quiet 25, noise in demands 0. The bar fails on light and on quiet. All five are ledger-correct, so the move does not add noise in demands. Beyond would then mean thin evidence, a missing date, a period mismatch, and a wrong party, because all four are in the five.

Map only thin evidence onto beyond. 3i S1 and ClearPoint S2 move. Demands 3, light 7, quiet 28, noise in demands 0. The bar still fails. The two that move are "part of the claim is not in the source", which is what beyond is for. HICL S6, the November date, and the prior-year sentence stay quiet, still labelled Nothing raised.

Map thin and timing, and hold the referent statement out. Four statements move (3i S1, ClearPoint S2, GPI S0, ClearPoint S5). Demands 3, light 9, quiet 26, noise in demands 0. HICL S6 stays quiet. That hold is unstable: the same sentence also has the future-versus-achieved cost claim, so a rule that moves any timing ground on the sentence moves HICL too, and the result collapses into the first option.

Map only the scope and referent partials onto beyond. HICL S6 moves. Demands 3, light 6, quiet 29, noise in demands 0. The label Goes beyond the source would be doing the work of a referent finding. The other four quiet partials stay under Nothing raised.

Leave the ledger where it is. Demands 3, light 5, quiet 30, noise in demands 0. The partial stays under Nothing raised. The finding text, where a summary was stored, stays on the card, under a headline that says nothing was raised, and the summary counts the card as confirmed.

Across the 106, thin evidence is the majority, 86 of 106. Scope is 6, and one of those six is also the achieved-versus-future case. A single mapping of partial onto beyond would move the clean ledger, and it would give one state to four different grounds. The 210 statements with no prose cannot be placed in any of the four until a reason is stored.

# The referent rule

The rule that was counted: the source defines a capitalised term, and the draft uses that term with a lowercase noun. Defined terms are Company, Fund, Group, Partnership, Manager, Adviser, Advisor, Issuer, Borrower, Sponsor, Investment, and Platform. A definition is a parenthetical, `(the "Company")` or `(the Company)`, or a quoted `"the Company"`. The HICL source matches the quoted form: `"HICL" or "the Company"`. The correct form `the Company` and `The Company` does not fire. `The company`, `the company`, and `the company's` do.

Population. 48 unique drafts. 28 corpus fixtures under `scripts/diagnostic/fixtures`. 20 review payloads under `tests/fixtures` that carry statements and a source text. 19 of the 48 have a source that defines at least one of those terms. 12 of those 19 have no ambiguous use. The careful rule stays quiet on them.

Careful firings: 16, in 7 drafts.

| draft | firings | what they are |
| --- | --- | --- |
| `fixtures/23_crf_multisource.json` | 2 | Sentence-initial "The platform", and the source defines Platform. |
| `fixtures/24_synth_peer_sources.json` | 2 | Sentence-initial "The fund". |
| `tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json` | 1 | "The fund intends to build a portfolio..." |
| HICL clean review | 1 | "The company also recently completed an oversubscribed refinancing..." |
| HICL doctored review | 1 | The same sentence, with "increase" in place of "reduction". |
| ClearPoint clean1 | 4 | "The company delivered", "Meanwhile, the company continues", "the company's Velocity", "The company provided". |
| ClearPoint dirty1 | 5 | The clean four, plus "the company's overall revenue", with one wording changed. |

11 of the 16 are sentence-initial `The company`, `The fund`, or `The platform`. 5 are mid-sentence, and they are all on the ClearPoint drafts, including two possessives.

Correct capitalised uses of a defined term, which this rule does not flag: 31.

A blunt rule that flags every `the company`, `the fund`, `the group`, `the firm`, `the partnership`, `the manager`, `the adviser`, `the issuer`, `the borrower`, or `the sponsor`, with no definition test and no capital test: 109 uses in the same 48 drafts.

The decision. The gap the rule is for is the HICL refinancing sentence, where "the company" is Fortysouth in the source and the issuer in the draft. That sentence is 2 of the 16 firings, clean and doctored. The other 14 are the defined party named in the ordinary way with a lowercase noun. ClearPoint's "The company delivered 43% year-on-year growth" is the issuer. A rule that fires on every lowercase use in a defining draft fires seven times on ordinary references for each time it fires on the HICL sentence, and the blunt rule fires 109 times. That is a worse miss rate than the gap. The count says not to ship a rule that flags the word. The HICL case is a party disagreement between the sentence and the passage, which is the partial already stored on that card, and it is the generic-company lift that currently deletes this kind of partial when it thinks it has resolved.
