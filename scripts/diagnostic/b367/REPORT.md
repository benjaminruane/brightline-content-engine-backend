# B367. What the product computes and never shows (recount)

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | this commit | see implementer response SHIPPED row |
| frontend | not touched | |

Ids used: B367 (this census). Filed **B368** for silent stand-downs. Did not file a row for anything on the delete list.

Cost: USD 0. No model calls. No product code changes.

Browser: skipped. Read-only census. No layout, control, or card-face change.

Payload: `tests/fixtures/real-runs-2026-10-02/doc-review.json` (15 cards, shipped pipeline). The 29 September set was not counted.

---

## Method

Reused the 10 September card-face tags in `scripts/diagnostic/delivery-check/findings.md` Q1 (RENDERED / PARTIALLY RENDERED / COMPUTED BUT NEVER SHOWN) and the 19 September WRITE/READ census in `dead-read-census.md` (A1 WRITE set, A4 WRITE minus READ, Q3 discard list, Layer 3 as an export with no production caller).

The brief said the 10 September census lived in `dead-read-census.md`. That file is dated 19 September. The 10 September card-face table is Q1 of `findings.md` (~60 fields). Both numbers are given where they differ.

Layer 2 READ means a frontend `src/` identifier of the form `qcCard.key` or `card.key` (tests excluded). A bare identifier `claims` or `index` that is not a qcCard property is not a read. Drawers, popovers, filters, and export are in scope for "reaches a user's eyes".

Layer 3 production caller means a `name(` call in `lib/` or `api/` other than the export declaration. Tests and `scripts/` do not count.

No new taxonomy. Nested `summaryClass` keys stay inside that one card field, as in A1.

---

## Layer 1. Computed in the pipeline and never put on the card

September Q3 named seven internals that die before the public card: `preBackstopClassification`, `periodAssessment`, `originalClassification` (supersession), the pre-lift span class, Stage 2 `explanation`, `sourceIngestionWarning` on the main path, and editorial-duplication-judge drops. `computeGuardrailForSource` was named in the same list but belongs in Layer 3 (never called).

Today, same list:

| Item | September | Today |
|------|-----------|-------|
| `preBackstopClassification` | Dies at `index.mjs` sourceMatches copy | Still dies. Copy is now L478-497, still no field. **B156** still open. |
| `periodAssessment` | On internal matches; not on qcCard or fingerprints | Copied onto in-memory `sourceMatches` (L484). Still not on fingerprints or the card. **B156**. |
| `originalClassification` | Set on the in-memory match; not on fingerprints | Unchanged. |
| Pre-lift span class | Winner only in the badge | Unchanged. |
| Stage 2 `explanation` | Fed to Stage 5, then dropped | Unchanged. |
| `sourceIngestionWarning` | Meta only on the skipped-evidence path | **Closed.** B164 copies it onto analyse-statements meta. Frontend reads `meta.sourceIngestionWarning` (`draftCoverageDisplay.js`). |
| Duplication-judge drops | Langfuse / console only | Unchanged. Already **B255**. |

New since September that the old discard list can express:

| Item | Where it dies |
|------|----------------|
| `passageRecovered` | Stage 2 writes it. `index.mjs` sourceMatches copy does not take it. |
| `matchNotReviewed` | Copied internally. Not on fingerprints. Public proxy is `skipped` / `not reviewed`. |
| `passageRejected` | Copied internally. Assemble uses it to set `excerptNotLocatable`. The flag itself is not on the card. |
| Actor / role / scale `standDown` | `leadingActor` / `rolePartyMismatch` / scale helpers return `{ standDown }`. Assembly writes `displayVerdictReason` only when the check fires. A stand-down leaves null and no log of the reason. |
| Last-finding backstop | `[stage7] comment-finding-backstop` log only. |
| `keepSecondPassage` drop | Second span discarded. No field. `conflictExcerptEmptyReason` covers only the empty-slot case, not a dropped distinct span that failed the claim-term test. |
| `window_bound` locate miss | `console.warn`. Some misses become `excerptNotLocatable`. Not all. |
| Editorial source-awareness drops | `[editorial] source-awareness dropped` log only. Same family as **B255**. |
| `statementFigures` / `sourceFigures` | Copied internally for figure demote. Not on the card. |

`emptyConfirmationRefused` is no longer Layer 1 when true: Stage 7 stamps it onto `stage2SourceFingerprints`. Frontend does not read fingerprints, so it moved to Layer 2 nested. Closed in name only.

**Count.** September 7. Today 14. Direction: up.

---

## Layer 2. On the card and never rendered

October union of `statements[].qcCard` keys: **72**. The brief said 71. The 72nd is accounted for below. Q1 said ~60. A1 listed the assembler keys plus optional claim-span / coverage blocks; `coverageUnion` is absent on this payload (optional, not written).

### 72 keys, Q1 tags

**RENDERED** (value as copy, badge, or bullet on Assess, including expansion, popover, or drawer): `statement`, `displayVerdict`, `reasoningParagraph`, `primaryExcerpt`, `conflictExcerpt`, `primaryRefTitle`, `excerptNotLocatable`, `sourceRecencyConcerns`, `framingFidelityConcerns`, `editorialVerdict`, `editorialConcerns`, `complianceVerdict`, `complianceConcerns`, `originalClaimText`, `supportSpans`, `draftSpan`, `charStart`, `charEnd`, `summaryClass`, `commentaryNotReviewed`, `commentaryNotReviewedReason`, `editorialNotReviewedReason`, `complianceNotReviewedReason`.

That is **23**. `conflictExcerpt` was COMPUTED BUT NEVER SHOWN on 10 September (zero frontend identifier). It is now read by `cardExcerptDisplay.js` and painted as a second quote when the passage is distinct (**B360**). `excerptNotLocatable` and the not-reviewed reasons did not exist in Q1.

**PARTIALLY RENDERED** (control, filter, hide, or fallback; the value is not itself copy): `index`, `supportState`, `displayMode`, `hasConflict`, `supportRefIds`, `supportRefTitles`, `suppressInQcWorkbench`, `primaryExcerptText`, `primaryExcerptTrusted`, `primarySourceOrigin`, `citationHovers`, `whyItMatters`, `reasoningHeadline`, `concernLevel`, `secondarySupportCount`, `sentenceSubclaimCount`, `evidenceSummary`, `primaryRefId`.

Several of those never paint: `citationHovers` is always `[]` on this payload so source chips do not render; `concernLevel` still maps to `riskLabel` / `showConcernPill` which are still not in the JSX (export prints it, **B233**); `secondarySupportCount` is still always 0 and unmounted; `whyItMatters`, `reasoningHeadline`, `primaryRefId`, `sentenceSubclaimCount` are still vacant.

**COMPUTED BUT NEVER SHOWN** (no frontend `qcCard.key` / `card.key` read): 31 keys.

`claimUpgrade`, `claims`, `commentaryUnaddressed`, `complianceNote`, `complianceSuggestedDirection`, `complianceSuggestedRewrite`, `conflictEvidence`, `conflictExcerptEmptyReason`, `conflictValues`, `decomposed`, `displayVerdictReason`, `editorialNote`, `editorialSuggestedDirection`, `editorialSuggestedRewrite`, `evidenceConcernLevel`, `evidenceNotReviewedReason`, `evidenceTrace`, `excerptMatchType`, `hasRealExcerpt`, `materiality`, `pipelineVersion`, `primaryExcerptEnd`, `primaryExcerptStart`, `qcClaimId`, `selectedExcerptReason`, `stage2SourceFingerprints`, `suggestedImprovement`, `supersededSourceNotes`, `supportingReferenceIds`, `supportingReferenceTitles`, `unsupportedSpans`.

`claims` was a false READ in a bare-identifier scan (`claims.some` is a local array). Qualified qcCard read: none.

### How many of the 72 reach a user's eyes

**23** paint on Assess in some state (the RENDERED list). Export additionally prints `concernLevel` (as evidence concern) and uses `hasRealExcerpt` / `primaryExcerptText`. Counting export, **25**.

September rendered count cannot be recovered as one number. Q1 mixed nine RENDERED with about sixteen PARTIALLY and did not publish a single "reaches eyes" total. A4 published ~18 never shown, not a rendered count. Today's 23 (Assess) / 25 (plus export) is the comparable figure going forward.

### New keys since the ~60 (the brief's 71, the payload's 72)

On the card today and absent from the Q1 table: `commentaryNotReviewed`, `commentaryNotReviewedReason`, `commentaryUnaddressed`, `conflictExcerptEmptyReason`, `displayVerdictReason`, `evidenceConcernLevel`, `evidenceNotReviewedReason`, `excerptNotLocatable`, `editorialNotReviewedReason`, `complianceNotReviewedReason`, `summaryClass` (A1 had it; Q1 did not tag it). That is eleven names. Q1 ~60 plus those eleven is 71. The payload also always writes `decomposed` / `claimUpgrade` / `claims` even when false or empty, which is how the union reaches **72**. `coverageUnion` dropped out of this run.

`primaryExcerptStart` / `primaryExcerptEnd` were vacant constants in D5 (always null). On this payload they are filled on 14 of 15 cards. Still unread by the frontend.

**Count for the table.** Layer 2 = on the card, no frontend qcCard read. September published **~18** (A4 WRITE minus READ). Today's method (qualified frontend read, tests out) on the October keys is **31**. A4 was narrower: it treated backend consumers as a read, and it mixed vacant values with missing identifiers. Recounting September with today's method cannot be done from the 19 September tree without checking out that frontend SHA. Direction: up.

---

## Layer 3. Exported, never called in production

September named one: `computeGuardrailForSource`. That method was too narrow.

Today: **96** exported functions in `lib/` and `api/` with no `name(` caller in those trees other than the export line. Full list in the appendix. Classes:

- Test hooks on a live module (`getStage2SystemPromptForTest`, `resetStage2PromptCache`, `setSqlOverrideForTests`, and kin). Not dead features.
- Orphaned feature modules: `computeGuardrailForSource`; `runDocumentLevelReview` and the rest of `document-level-review.mjs` (B275 measured and did not ship); `buildQcCommentary`; `lib/qc/evidence-authority.mjs`; `extractClaimsFromDraftLLM` / `verifyClaimWithLLM`; `corpusSearch` / `canonicalizeClaims`; `lib/corpus/dealterms-value-typing.mjs`; Partners Group writing helpers; `buildFindingPrompt` (the model path that used it is gone).

`computeGuardrailForSource` is still never called from `prepareUploadedSourcesForPipeline`. B164 closed a different warning.

**Count.** September 1 named (method too narrow). Today 96 under the method the brief asked for. Direction: up, mostly because the method widened.

---

## a. Old-census items, status now

| Item | Status |
|------|--------|
| `preBackstopClassification` dies at the sourceMatches copy | **Still open.** **B156**. Line numbers moved (L364-377 then, L478-497 now). The discard is the same. |
| `periodAssessment` not on the card | **Still open.** Copied internally. Not public. **B156**. |
| `computeGuardrailForSource` never called | **Still open** as Layer 3. B164 closed `sourceIngestionWarning`, not this function. |
| `sourceIngestionWarning` missing on the main path | **Closed.** B164 + frontend read of `meta.sourceIngestionWarning`. |
| `conflictExcerpt` never painted | **Closed in name only, then reopened as honesty.** Frontend now reads it (**B360**). Copying primary into an empty slot was recorded as closed and reversed by **B362**, which reopened **B158**. This payload: 3 of 15 cards have a distinct second quote; 4 conflict cards carry `conflictExcerptEmptyReason: no_distinct_passage` and show one quote. |
| Empty conflict slot | **Closed in name only.** The worked example in the brief. Still **B158**. |
| `concernLevel` pill never mounted | **Still open.** **B231**. Export renamed the print (**B233**) so the file is honest; the workbench still does not mount `riskLabel` / `showConcernPill`. |
| `citationHovers` always `[]`, chips do not render | **Still open.** **B231**. Occupancy 0/15 on this payload. |
| Vacant constants (`primaryRefId`, `whyItMatters`, `reasoningHeadline`, `suggestedImprovement`, `evidenceTrace`, `excerptMatchType`, `selectedExcerptReason`, `qcClaimId`, `conflictValues`, `conflictEvidence`, `supportingReferenceIds` / `Titles`, `secondarySupportCount` always 0) | **Still open** as vacant writes. **B231**. Do not connect. See delete list. |
| `primaryExcerptText` unread | **Closed in name only.** `cardExcerptDisplay.js` now falls back to it. v4 assembly already emits `primaryExcerpt` as a string, so the fallback does not change what the reviewer sees. |
| `primaryExcerptStart` / `End` always null | **Closed in name only.** D5 said never. This payload fills them on 14/15. Still unread. A vacant-constant story that became a filled-and-unread story. |
| Assessment empty `concern: ""` | **Closed.** **B227**. |
| Export invented evidence line | **Closed.** **B228** prints `Not recorded.` |
| Constructive feedback invented notes | **Closed.** **B229**. |
| Implement Changes `"(none)"` | **Closed.** **B230**. |
| `claimType` read, never written | **Still open.** **B231**. Still absent on v4 cards. |

Other closed-in-name-only of the same shape as the empty conflict slot: `emptyConfirmationRefused` now lives on fingerprints when true, and the frontend never reads fingerprints; `evidenceConcernLevel` duplicates `concernLevel` onto the card and nobody reads it (B233 renamed the export print, not this field).

---

## b. Adding versus connecting

| | September | Today |
|--|-----------|-------|
| Card field count | ~60 (Q1). A1 assembler set plus optionals. | **72** (union of October qcCard keys). Brief said 71; 72 is the measured union. |
| Never shown / never frontend-read | ~18 (A4). Q1 NEVER SHOWN was larger because it counted reads that do not paint. | **31** no qcCard-qualified frontend read. |
| Reaches a user's eyes | Not recoverable as one number. Q1 did not publish it. | **23** on Assess. **25** if export is included. |

We have been adding faster than we have been connecting. Twelve names landed on the card since Q1. Three of those paint (`excerptNotLocatable`, `commentaryNotReviewed` and the not-reviewed reasons, plus `summaryClass` if Q1 missed it). `conflictExcerpt` is the one old field that got connected. The rest of the new names are unread (`displayVerdictReason`, `commentaryUnaddressed`, `conflictExcerptEmptyReason`, `evidenceConcernLevel`, `evidenceNotReviewedReason`).

---

## c. User-visible loss versus plumbing

Would actually argue for, ranked by what a reviewer notices on a card:

1. **Period gate still looks like silence or conflict.** `preBackstopClassification` / `periodAssessment` never reach the card. S0 and S5 on this payload are Conflicting with a period mismatch in the commentary. There is still no fifth display state. **B156**. This is the same loss as September.

2. **A Conflicting card with one quote does not say why there is no second.** The empty slot is honest (**B362**). `conflictExcerptEmptyReason` is on 4 of 15 cards and is never rendered. A reviewer sees one italic passage under a Conflicting badge and has to guess whether a competing quote was dropped. Fold into **B158**, do not add a row.

3. **Source chips still do not render.** `citationHovers` is always empty. Magnifier still works via `supportSpans`. **B231**.

Would not argue for connecting: `displayVerdictReason` (S9 and S12 already say the finding in `reasoningParagraph`), `commentaryUnaddressed` (ARCHITECTURE already calls it diagnostic; S7's "unaddressed" figures are in the quote), `evidenceConcernLevel` (duplicate of `concernLevel`), `stage2SourceFingerprints`, `materiality`, `pipelineVersion`, `decomposed` / `claimUpgrade` / `claims`, `unsupportedSpans`, `supersededSourceNotes`, the vacant constants.

Plumbing: offsets (`primaryExcerptStart` / `End`), fingerprints, match types, traces, card-level notes the UI already reads per-concern, `hasRealExcerpt` (export only).

---

## d. Delete rather than connect

Not backlog. Dead weight that makes the next census harder.

**Vacant card fields to stop writing, not to paint:** `suggestedImprovement` (box removed, A6.20), `excerptMatchType` (always `"none"`), `selectedExcerptReason` (always null), `evidenceTrace` (always `[]`), `conflictValues` / `conflictEvidence` (always null, **B147**), `qcClaimId` (always null), `reasoningHeadline` (always null), `whyItMatters` (always null), `supportingReferenceIds` / `supportingReferenceTitles` (always `[]`), `primaryRefId` (always null), `primarySourceOrigin` (always null), `secondarySupportCount` (always 0), `citationHovers` (always `[]`; deleting the write without deleting the chip path is a landmine, so delete the path and the field together or leave both).

**Exports / modules with no production caller, not a test hook:** `computeGuardrailForSource`; `lib/qc/document-level-review.mjs` (B275); `lib/qc/commentary-builder.mjs`; `lib/qc/evidence-authority.mjs`; `lib/qc/llm-claim-extraction.mjs` / `llm-claim-verifier.mjs`; `lib/corpusSearch.js` and `lib/canonicalClaims.js` (and the `api/_lib` copies); `lib/corpus/dealterms-value-typing.mjs`; `assemblePgDraftOutput` / `getPgWritingPromptTemplate`; `buildFindingPrompt` (caller gone).

Do not delete test hooks (`*ForTest`, `reset*Cache`, `setSqlOverrideForTests`) in the same sweep.

---

## e. The product's own behaviour, unreported

The last fortnight added checks that stand down, refuse, or recover, and almost none of that is on the card.

| Check | When it fires, the card | When it stands down / refuses / recovers |
|-------|-------------------------|------------------------------------------|
| Actor of the action | `displayVerdictReason: actor_mismatch` (unread). Log `[stage7] actor-mismatch`. | `{ standDown: no_actor \| first_person \| ambiguous_actor }`. Nothing written. |
| Role-party | `role_party_mismatch` on this payload S9. Commentary already names AGIC vs GIC. | Ambiguity / geography-not-a-party stands down. Nothing written. |
| Scale / cause | `scale_set_one_holding` on S12. Commentary already names TCR vs "essentially all". | No comparable figures: stand down. Nothing written. |
| Empty-confirmation refusal | Classification becomes `not_reviewed`; locate may recover. | Flag on fingerprints when true (0/15 on this stored run). Frontend does not read it. |
| Last-finding backstop | Finding sentence kept. | Log only. |
| Second-passage claim-term test | Second quote omitted. | No reason field for a dropped span. |
| Locate `window_bound` | Sometimes `excerptNotLocatable`. | Warn log. |
| Duplication judge / source-awareness / fidelity drops | Fewer editorial bullets. | **B255**. Console / Langfuse. |

A reviewer cannot see when a check decided to say nothing. Neither can the operator, except by grepping function logs. Filed **B368**.

---

## Appendix. Layer 3 names (96)

`canonicalizeClaims` (api/_lib and lib), `corpusSearch` (both), `resolveNumericCorpusHitExcerpt`, `applyDealTermsTypingTelemetryAndGuards`, `computeDealTermsValueType`, `createDealTermsTelemetryAccumulator`, `findValueSpan`, `incrementDealTermsTelemetry`, `mergeDealTermsTelemetryWarnings`, `resetSqlCache`, `setSqlOverrideForTests`, `buildReviewerDecisionPayload`, `computeGuardrailForSource`, `cacheHitRate`, `callOpenAI`, `formatLlmSpend`, `getLlmPricingTable`, `hasAnthropicClient`, `hasOpenAIClient`, `hasCheckableParticular`, `markerSpanStatus`, `buildWhatClause`, `assemblePgDraftOutput`, `getPgWritingPromptTemplate`, `assessmentStateOf`, `computeQuantityMismatchInferencePolicy`, `countBindingPolicyMetrics`, `countDirectSupportingBindings`, `sentenceExplainsFinding`, `deriveQcCardReferences`, `validateProposedClaims`, `buildQcCommentary`, `assembleConstructiveFeedbackPiece`, `assembleCraftAndCardFeedback`, `buildConstructiveFeedbackCraftUserPayload`, `buildConstructiveFeedbackUserPayload`, `checkConstructiveFeedbackPiece`, `feedbackSkeleton`, `normalizeConstructiveFeedbackCraftText`, `selectConstructiveFeedbackPoints`, `skeletonsCollide`, `splitCardFeedbackSections`, `attachedByIndex`, `documentLevelMeta`, `mergeDocumentLevelConcerns`, `runDocumentLevelReview`, `sentenceLocalEditorialRules`, `coverageIsWorthNaming`, `applyEvaluativeDeletionDirection`, `getEvaluativeRestatementDiscardCount`, `hasStrandedEvaluativeScaffolding`, `buildClaimEvidenceAuthority`, `buildSyntheticStatementAuthority`, `deriveStatementEvidenceFromAuthorities`, `evidenceDisplayVerdictLabel`, `evaluateSupportRelevance`, `finalizeEvidenceSkippedReview`, `excerptHasLocatablePosition`, `excerptsAreSame`, `renderCanonicalExportText`, `droppedModalityHedges`, `isAgentlessFirstPersonRecast`, `isLeaveFirstPersonInPlaceDirection`, `hasPotentialFramingJudgment`, `buildCacheKey`, `getCacheRunStats`, `getLlmCacheStore`, `resetLlmCacheStore`, `resolvedModelId`, `setCacheVersionOverride`, `setLlmCacheStore`, `extractClaimsFromDraftLLM`, `validateLLMVerifierOutput`, `verifyClaimWithLLM`, `resetInProcessDriftMemory`, `hasDateSuffix`, `resetStage1bPromptCache`, `getStage2SpanElicitPromptForTest`, `getStage2SystemPromptForTest`, `getStage2UnsupportedSpanMultiOccurrenceCount`, `getStage2UnsupportedSpanRejectionCount`, `getStage2UnsupportedSpanWholeCount`, `resetStage2PromptCache`, `resetStage2UnsupportedSpanRejectionCount`, `resetStage2UnsupportedSpanStats`, `runWithoutRequestBudget`, `surfacesFromReviewPayload`, `flagEnabled`, `cleanLineFromNames`, `evidenceRowLabel`, `buildAsOfBySourceIndex`, `resolveQcTestSourceFiles`, `resolveConflictEngagement`, `buildFindingPrompt`.

Some of these are used inside the defining file as non-call identifiers, or only from tests. `finalizeEvidenceSkippedReview` is not imported by `api/`; the pipeline imports `buildSkippedEvidenceQcCard` from the same file. `renderCanonicalExportText` is tests and diagnostics; `api/export.js` calls `buildReviewData`. `evidenceDisplayVerdictLabel` lives in backend and is unused there; the frontend has its own copy.

---

## The table

| Layer | September | Today | Direction |
|-------|-----------|-------|-----------|
| 1. Pipeline, never on the card | 7 | 14 | up |
| 2. On the card, never frontend-read | ~18 (A4). ~60 fields on the card (Q1). | 31 unread of 72 keys. 23 reach Assess eyes (25 with export). | up |
| 3. Exported, no production caller | 1 named (`computeGuardrailForSource`). Method too narrow. | 96 | up (method widened) |
