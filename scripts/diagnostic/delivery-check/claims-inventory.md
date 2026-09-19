# Claims inventory. What the product says to a user.

Date: 2026-09-19. Read-only. No Review. No model calls.

**Limitation.** A saved `analyse-statements` payload cannot be restored into local Assess. Persist snapshots need `review_state` fields; the live JSON is the wrong shape. Empty Assess was walked at `http://localhost:5173/assess` (Build `2d8b6f6`, Backend: Up, grey `v4`, tooltip `Pipeline v4 · House name: Halden Group · Revise action list: on · Editorial review: on`). After-review, ruling, accept, rewrite, save, export modal, and exported file were enumerated from the components plus B196 screenshots (`scripts/diagnostic/delivery-check/b196-2026-09-18/`) and the 18 Sep Meridian live dump. `/writing` redirects to `/assess`; Writing-only strings are unreachable on the live route (B126 pile 2) and are not in Part 1.

Chrome that does not assert a fact (Cancel, Expand all, section headings used as navigation) is omitted. Action labels that only name a control are omitted. Action *results* are in CONFIRMATION.

---

## Part 1. The inventory, grouped by kind

### VALUE

| ID | Says | Where | State |
|----|------|-------|-------|
| C1 | `{n} words · {m} characters` | Draft meta, Assess | empty `0 words · 0 characters`; live thereafter |
| C2 | Word limit `{n}` (default 150) | Draft control | all |
| C3 | Filter counts: All / Needs attention / Conflicts / Editorial / Compliance / Not checked `{n}` | Results sidebar after review | after review; Needs attention drops after saved accept (B204) |
| C4 | QRS numeric claims: `N claim(s) have no source…` / `conflict…` / `could not be fully checked…` / `partial support…` / `editorial and/or compliance notes` | QRS bullets | after review |
| C5 | `{n} proposed change(s)` | Card pill | after review, when proposals exist |
| C6 | `{n} concern(s)` on Editorial / Compliance rows | Card | after review |
| C7 | Export `{exportedAt} \| {n} words \| {m} characters` | Exported file header | export |
| C8 | Export `(v{n})` and `({sourceCount})` | Export modal checkboxes | export modal |
| C9 | History `{n} words` / `264 → 244 words` | Version history | after save / rewrite |
| C10 | Deal dates shown as `{DD/MM/YYYY}` | Export file (and Writing rail, unreachable) | after review if deal fields set |
| C11 | `Last reviewed: {absolute time}` | Results footer | after review |
| C12 | `The draft is {n} words over the {max} word limit.` | QRS extra line; export QRS; rewrite notes | after review, live from current draft |

### LABEL

| ID | Says | Where | State |
|----|------|-------|-------|
| C13 | Evidence badge: `Confirmed` / `Partially confirmed` / `Conflicting` / `No support` / `Not reviewed` / `Unverifiable` | Card Evidence row; export `Verdict:` | after review; skipped evidence = `Not reviewed` |
| C14 | Readiness: `Ready` / `Not fully checked` / `Minor points to address` / `Needs work` / `Needs significant work` | QRS badge; export QRS | after review |
| C15 | `Backend: Up` / `Down` / `Checking` | Header | all |
| C16 | Env pill `{pipelineRoute}` (healthy: `v4`); warn: `no house name` / `editorial review off` / `{non-v4}` / `revise flags disagree` | Header | all |
| C17 | Output type chips: Reporting commentary / Investor letter / Press release / LinkedIn post | Review settings | all; empty default Reporting commentary |
| C18 | Visibility: Complete / Public | Review settings | all; empty default Complete |
| C19 | Filters: All, Needs attention, Conflicts, Editorial, Compliance, Not checked | Results sidebar | after review; Not checked hidden when count 0 |
| C20 | Signal names: Evidence, Editorial, Compliance, Source recency, Framing | Card | after review |
| C21 | `Clean` / `Not reviewed` on Editorial and Compliance | Card | after review; skipped check = `Not reviewed`; B202 incomplete check = `Not reviewed` plus manual-review sentence |
| C22 | `Clean: {Editorial, Compliance, Source recency, Framing}` collapsed | Card | after review when those are clean |
| C23 | Governance chips: `Matches the document you chose as governing.` / `Dealt with` / `Overridden` | Card | after ruling / after saved accept |
| C24 | `Proposed change` / `Proposed change pending` | Card | after review |
| C25 | Review options toggles: Evidence review / Editorial review / Compliance review | What to check modal | before review |
| C26 | Export section checkboxes: Reviewer assessment, Reviewed draft, Sources used, Quality review summary, Statement review | Export modal | export modal |
| C27 | `Excluded · Not reviewed` | Sources drawer | after review if any excluded |
| C28 | Source origin: `Web source` / `Uploaded source` | Card / drawer | after review |
| C29 | Export `File type` PDF/TXT/DOCX/WEB/Unknown | Exported file | export |

### QUOTE

| ID | Says | Where | State |
|----|------|-------|-------|
| C30 | Statement text (`qcCard.statement`) | Card face; export quoted statement | after review |
| C31 | Card-face excerpt under `Source excerpt` / `Confirmed excerpt` | Card | after review when `resolveCardExcerpt` returns a passage |
| C32 | Highlighted passages in the sources drawer, plus relation prefix `Supports the statement:` / `Partially supports…` / `Conflicts with…` / `Relates to…` | Sources drawer | after review |
| C33 | Export `Excerpt: "{passage}"` | Exported file | export, when `hasRealExcerpt` |
| C34 | Disagreement / confirming passages on the expanded evidence row | Card | after review, conflict/partial |
| C35 | Additional excerpts popover | Card | after review, when extra spans exist |
| C36 | Draft textarea contents (user or product) | Your draft | all; empty placeholder is not a quote |

### PROSE

| ID | Says | Where | State |
|----|------|-------|-------|
| C37 | Reviewer assessment paragraph | Results; export Reviewer assessment | after review |
| C38 | Evidence finding (`reasoningParagraph` / `reasoningHeadline`) | Card expanded Evidence; export `Evidence finding` | after review; export hole is `Not recorded.` (B228) |
| C39 | Editorial / compliance concern notes and suggested directions | Card | after review |
| C40 | Constructive feedback body | Feedback modal | after review, on demand |
| C41 | Decision explanations (`The source gives…`, `Two of your sources disagree…`, …) | Card evidence explanation | after review / after ruling |
| C42 | NO_PROPOSAL lines (policy_forbids, silence_no_edit, partial_no_edit, visible_signal, first_person_unnamed, GENERIC_CONTRADICTION) | Card when no wording change | after review |
| C43 | Disclaimer: `Compliance flags are based on commonly-observed principles…` | Page footer; export footer | after review / export |
| C44 | Stale banner: `Draft has changed since the last review: re-run Review to refresh.` | Results | after edit of a reviewed draft |
| C45 | Empty results: `Paste a draft and upload sources to begin.` | Results | empty |
| C46 | History empty: `No versions yet. Generate, rewrite, save, or run Review to create one.` | History drawer | empty |
| C47 | Sources empty: `No reviewed sources` / `Run Review to load extracted source text in this drawer.` | Sources drawer | empty / before review |
| C48 | Exclusion reasons: `No readable text could be extracted` / `No content provided` / scanned-image sentence / `Could not be read` | Sources drawer | after review, excluded sources |
| C49 | Editorial incomplete: `The editorial check could not be completed for this statement. Please review it manually.` | Card | B202 not_reviewed while editorial was on |
| C50 | Methodology note body | Under draft after generate/rewrite | after generate/rewrite |
| C51 | `Summary not available for this saved review. Run Review again to refresh it.` | QRS | legacy snapshot |
| C52 | `Which document governs?` plus `Asked once for these two documents…` / `Neither, they are separate sources` / `You set {label} as governing…` / `You left this sentence as written…` | Governance question | after review, cross-document conflict |
| C53 | Upload / size / fetch errors (`Could not read one of the files…`, size messages, `Quality Review failed.`) | Toast | error |
| C54 | `Select at least one check.` | Review options | error |
| C55 | Writing beta banner (unreachable on /assess) | n/a | not on live route |

### DRAFT TEXT

| ID | Says | Where | State |
|----|------|-------|-------|
| C56 | Generate output written into the draft | Your draft | after generate |
| C57 | Rewrite output written into the draft | Your draft | after rewrite |
| C58 | Proposed `resultingSentence` under Proposed change | Card | after review |
| C59 | Modify-box text (user-edited proposal) | Card | after modify |
| C60 | Draft after Accept / Save (applied sentences) | Your draft | after accept+save |
| C61 | Adapt output | Your draft | after adapt |

### COVERAGE CLAIM

| ID | Says | Where | State |
|----|------|-------|-------|
| C62 | Evidence `Not reviewed` (check not run, or displayVerdict `Not reviewed`) | Card | evidence skipped |
| C63 | Editorial / Compliance `Not reviewed` (check off, or B202 incomplete) | Card | skipped or failed check |
| C64 | Export `Not checked.` on editorial or compliance note | Exported file | when `classifyCard` returns notChecked and no note |
| C65 | QRS `1 claim could not be fully checked…` | QRS; export QRS | notChecked > 0 |
| C66 | QRS Ready success: `All claims are backed by sources…` / `Evidence review was not run for this output.` | QRS; export QRS | readiness Ready |
| C67 | Filter `Not checked` (editorial or compliance `summaryClass` only, not Evidence) | Results sidebar | after review when count > 0 |
| C68 | `Evidence review` / `Editorial review` / `Compliance review` as what was chosen | Review options; implied by C62-C67 | before and after |
| C69 | QRS 3-bullet cap: later classes of problem are not printed | QRS; export QRS | after review when more than 3 bullet classes fire |

### CONFIRMATION

| ID | Says | Where | State |
|----|------|-------|-------|
| C70 | `Review complete.` / `Quality Review complete.` | Toast | after review |
| C71 | `Draft saved to version history.` / `Saved as Version {n}` / `Save with {n} change(s)` | Toast / footer | after save |
| C72 | `Copied. Draft output copied to clipboard.` / `Copied` (QC JSON) | Toast | after copy |
| C73 | `Draft generated.` / `Draft rewritten.` / `Adapted to {label}` | Toast | after those actions |
| C74 | `Loaded Version {n}` | Toast | after history load |
| C75 | `You have rewritten this sentence in the draft.` | Card | after accept into live draft |
| C76 | `Assessment cleared.` / confirm `Clear this assessment?` / `Start a new output?` | Toast / dialog | clear / new output |
| C77 | Placeholder guard: rewrite refused, draft unchanged (422) | Toast / draft | after rewrite that invented brackets (B209) |
| C78 | Failures: `Copy failed…` / `Generate failed.` / `Rewrite failed.` / `Export failed…` / `Failed to load version` | Toast | error |

### PROVENANCE

| ID | Says | Where | State |
|----|------|-------|-------|
| C79 | `(Build: {commit\|dev})` | Header | all; local walk `(Build: 2d8b6f6)` |
| C80 | Build tooltip `{branch} · {builtAt}` | Header hover | all |
| C81 | Env tooltip `Pipeline {route} · House name: {name\|unset} · Revise action list: {on\|off} · Editorial review: {on\|off}` | Header hover | all; local walk House name Halden Group |
| C82 | `Assessed as: {outputTypeLabel}, {requiredVersionLabel}` | Results header | after review |
| C83 | Sources used: name, file type, description, used-for | Export file; sources list | after sources added / export |
| C84 | Excluded sources list | Sources drawer | after review |
| C85 | Export `Output type` / `Required version` / `Version` | Exported file | export |
| C86 | `Content Engine` | Header | all (product name, not a review fact) |
| C87 | House name inside generated/rewritten draft (configured organisation) | Draft text | after generate/rewrite (B209) |

---

## Part 2. Trace. One row per item

Shapes: S1 default toward reassurance. S2 invented when empty. S3 same fact, two places, disagree. S4 name does not mean what it says. S5 dead branch. S6 computed and dropped, or read and never produced. S7 two versions where one should exist.

| ID | Producing function | Birth | Shapes |
|----|--------------------|-------|--------|
| C1 | `countWords` / char length on `draftText` | Frontend, live draft | none on empty walk |
| C2 | Assess word-limit input | User; default 150 | none |
| C3 | `workbenchFilterCounts` via `rowMatchesQcWorkbenchFilter` | `qcCard.summaryClass` stamped by `classifyCard` at `summariseReview` in `api/analyse-statements.js`; Needs attention overlaid by governance/dealt_with | S3 with QRS `needsAttention` after a ruling (by design, B204); S4 `Not checked` is editorial/compliance only |
| C4 | `summaryBullets` | `summariseReview` → `meta.reviewSummary` | S1 unknown evidence slug not counted (see C14/C13); S7 3-cap drops later classes (C69) |
| C5 | `proposedChangePillLabel` | revise-actions ACTION items | none |
| C6 | concern array lengths on the card | editorial/compliance concerns from reviewer | none |
| C7 | `renderPdf` / `buildDocx` header | export payload `meta.wordCount` from frontend live count | S3 vs QRS snapshot counts if draft changed and Review not re-run (stale banner C44 is the warning) |
| C8 | `ExportModal` / `versionNumberForExport` | History list (B212) | none since B212 |
| C9 | version capture in Assess history | save/rewrite/review | none |
| C10 | `formatDealDateForExport` | dealInfo on the payload | none |
| C11 | ReviewResultsFooter | last analysis timestamp | S3 vs QRS after rewrite without re-review (by design) |
| C12 | live `wordLimitOverBy = countWords(draftText) - maxWords` in `StatementAnalysisPanel`; export `buildExportQualityReviewSummary` extras | live draft, not the review snapshot | none in current code (live). Distinct from QRS issue bullets, which are snapshotted |
| C13 | Screen: `evidenceDisplayVerdictLabel` in frontend `displayVerdictLabels.js` and backend `evidence-display-verdict.mjs`. Export: `normalizeExportVerdict` | `qcCard.displayVerdict` from Stage 7 `mapSupportStateToDisplayVerdict` or skipped path `buildSkippedEvidenceQcCard` (`Not reviewed`) | S7 two allowlist copies. S1 closed on the badge by B232 (unknown is Unverifiable). Skipped path writes a display string, not a slug |
| C14 | `summaryBadge` reads `reviewSummary.readiness` | `readinessFromCounts` in `summariseReview` | S1: `classifyEvidence` returns null for any slug outside the four assembler slugs, so unknown cards do not block Ready. S3 with C13 Unverifiable |
| C15 | App health poll | `GET /api/health` | none |
| C16 | `environmentPillView` | `/health` `environment.pipelineRoute` | none |
| C17 | Assess output-type buttons | user; default reporting commentary | none |
| C18 | Assess visibility buttons | user; default Complete | none |
| C19 | `QC_WORKBENCH_FILTERS` / `visibleQcWorkbenchFilters` | static labels; counts from C3 | S4 Not checked |
| C20 | StatementReviewCard static | static | none |
| C21 | `editorialSkippedOnRun` / `complianceSkippedOnRun` / `editorialNotReviewed` | `meta.reviewOptions`; `editorialVerdict` null when off (`clearEditorialQcCard`); `not_reviewed` when requested and incomplete (B202) | S3 with export C64 |
| C22 | `cleanSecondarySignals` join | same as C21 | none |
| C23 | `MATCHES_GOVERNING_CHIP` / `DEALT_WITH_CHIP` / `OVERRIDDEN_CHIP` | `governanceStatusFromEntry` / saved accept overlay | S3 Conflicting badge can sit next to Matches governing (by design, B218) |
| C24 | `actionListDisplay` | revise-actions | none |
| C25 | ReviewOptionsPopup | user | none |
| C26 | ExportModal sections | user | none |
| C27 | SourceReaderPanel excluded section | extraction / ingest | none |
| C28 | sourceType on refs | ingest | none |
| C29 | `formatSourceFileType` | source metadata | S2 empty type prints `Unknown` (honest) |
| C30 | card / export `statementText` | Stage 1 statement | none |
| C31 | `resolveCardExcerpt` | Stage 4 `primaryExcerpt` / `primaryExcerptText` | S3 vs drawer C32 when `conflictExcerpt` empty (B158); S6 span-only empty primary (B165) |
| C32 | SourceReaderPanel highlights | `supportSpans[].classification` + passage | S3 vs card verdict (B89) |
| C33 | export excerpt field | `primaryExcerptText` if `hasRealExcerpt` | S6 skipped evidence forces null |
| C34 | card disagreement/confirming passages | decision-copy locators / conflict fields | B158 if competing passage is in the wrong slot |
| C35 | additional excerpts | extra evidence items | `citationHovers` always `[]` so source chips do not render (B231 S6) |
| C36 | textarea | user / C56-C61 | none |
| C37 | `api/synthesize-review.js` | model over findings; dummy finding is text (B227) | S7 second prose writer vs C40; snapshot vs cards (B194, by design) |
| C38 | Stage 5 `reasoningParagraph` | model; export `evidenceFindingForExport` | S2 closed by B228 (`Not recorded.`). Distinct skip omits the line |
| C39 | editorial/compliance reviewer | model; empty notes omitted from feedback (B229) | S3 competing proposals (B166) |
| C40 | `api/constructive-feedback.js` | model over `collectMarginNotes` | S7 vs C37; no agreement check |
| C41 | `fillDecisionCopy` | locators + templates in `decision-copy.mjs` | none |
| C42 | `noProposalReason` / `acknowledgeReasonFor` | `sort.mjs` NO_PROPOSAL | none since B214 |
| C43 | `REVIEW_DISCLAIMER_TEXT` | static `copy.js` | none |
| C44 | `draftHasChangedSinceLastAssess` | draft hash vs last review | none |
| C45 | Assess empty results copy | static | none; seen on local walk |
| C46 | AssessVersionsPanel empty | static | none; seen on local walk |
| C47 | SourceReaderPanel empty | static | none; seen on local walk |
| C48 | `reasonLabel` in `excludedSourceReason.js` | ingest failure codes | none |
| C49 | StatementReviewCard branch | `editorialVerdict === "not_reviewed"` while enabled | none |
| C50 | generate/rewrite split | writing API | none |
| C51 | `LEGACY_SUMMARY_MESSAGE` | missing `reviewSummary.version === 1` | none |
| C52 | SourceGovernanceQuestion | static + chosen doc name | none |
| C53 | `showToast` in useAssessState / useDraftState | errors | none |
| C54 | ReviewOptionsPopup guard | static | none |
| C55 | App Writing banner | static | S5 unreachable on live route |
| C56 | generate API | model | P20: model is the spec for the draft |
| C57 | rewrite API | model; placeholder refused (B209) | P20 |
| C58 | revise-actions ACTION `resultingSentence` | model; blank finding ACKNOWLEDGE (B230) | P20; S3 vs source excerpt if model invents a figure |
| C59 | card modify field | user | none |
| C60 | `revise-actions-apply` | accepted proposals | none |
| C61 | adapt API | model | P20 |
| C62 | `evidenceSkippedOnRun` or label path | `supportState === "skipped"` or displayVerdict `not reviewed`; birth `buildSkippedEvidenceQcCard` | none when evidence is off (QRS evidence key is null). Hole is C14 when evidence is on and slug is unknown |
| C63 | skipped/not_reviewed branches | `clearEditorialQcCard` (null) vs `markEditorialNotReviewed` (`not_reviewed`) | S3 with C64 |
| C64 | `buildReviewData` in `api/export.js` | `classifyCard(qcCard)` **with no reviewOptions**; `asOptions` defaults all three checks on; null verdict becomes notChecked; missing note becomes `Not checked.` | S3 vs C63. S4 Not checked vs Not reviewed. **When the check was off, the file claims a check ran and could not complete.** |
| C65 | `summaryBullets` notChecked line | `summariseReview` notChecked (editorial/compliance only, and only when that check is enabled) | S1 unknown *evidence* is not this counter |
| C66 | `summaryBullets` Ready branch | readiness Ready plus which of evidence/editorial/compliance keys are non-null | S1 if unknown evidence slugs left counts at zero while evidence key is non-null: prints `All claims are backed by sources.` |
| C67 | `rowMatchesQcWorkbenchFilter` `not_checked` | `cls.editorial === "notChecked" \|\| cls.compliance === "notChecked"` | S4 does not include Evidence Not reviewed |
| C68 | Review options + implied by cards | user + `meta.reviewOptions` | none |
| C69 | `summaryBullets` early returns at 3 | display helper | S6 fourth class computed, not shown. Badge still reflects counts |
| C70 | useAssessState / useDraftState | analysis success | none |
| C71 | save handlers | version append | none |
| C72 | clipboard handlers | clipboard API | none |
| C73 | generate/rewrite/adapt handlers | those APIs | none |
| C74 | AssessVersionsPanel | load | none |
| C75 | `actionListDisplay` rewritten line | live draft vs analysed statement | none |
| C76 | New output / Clear | reset | B216 residue: word limit can stick |
| C77 | placeholder-guard | rewrite 422 | none |
| C78 | error toasts | those APIs | none |
| C79 | `getAppVersion` | `VITE_BUILD_COMMIT` | none; local walk matched |
| C80 | `getAppVersionTitle` | build stamp | none |
| C81 | `environmentTitle` | `/health` environment | S7 house name is a per-deployment global (B96, B124), not the user's house |
| C82 | AssessModule results header | session output type + visibility | none since B215 |
| C83 | export sources section | payload sources | none |
| C84 | SourceReaderPanel excluded | ingest | none |
| C85 | `renderPdf` meta lines | export payload; version from History (B212) | none |
| C86 | App.jsx static | static | none |
| C87 | rewrite/generate house-name path | `AUTHORING_ORGANISATION` | B96 fixture name in deployed env |

**Computed, never shown (not in Part 1).** `recommendationDisplayText` / `getStatementVerdict` / `deriveAdvisoryLine` still run on every card (`StatementReviewCard.jsx`), keyed off legacy `row.sourceCount` / `row.level`, and the string is never mounted. S5+S6. `citationHovers` always `[]` (B231). `concernLevel` is shown in the export, not on the card (B231, B233).

---

## Part 3. Asserted end to end

Strict: a test that runs from real input (draft + sources, or a stored review payload through the live writers) to the string the user sees on screen or in the file. A unit test that hands a helper its input does not count.

**B244 / B245 (2026-09-19).** Stored live payload `tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json` through the same writers the results screen, canonical export, assessment payload, margin notes, and revise-action list use. Vitest node. React is not mounted. Count: **20 of 87**.

**B233 / B234 / B235 (2026-09-19).** Same 20. The corruptions now fail when QRS names a check that was off, or when unknown slugs would have read Ready. Export verdict lines name evidence concern. No new inventory IDs moved to yes.

| ID | e2e |
|----|-----|
| C1 | no |
| C2 | no |
| C3 | yes |
| C4 | yes |
| C5 | no |
| C6 | yes |
| C7 | no |
| C8 | no |
| C9 | no |
| C10 | no |
| C11 | no |
| C12 | yes |
| C13 | yes |
| C14 | yes |
| C15 | no |
| C16 | yes |
| C17 | no |
| C18 | no |
| C19 | yes |
| C20 | no |
| C21 | yes |
| C22 | no |
| C23 | no |
| C24 | no |
| C25 | no |
| C26 | no |
| C27 | no |
| C28 | no |
| C29 | no |
| C30 | yes |
| C31 | yes |
| C32 | yes |
| C33 | yes |
| C34 | no |
| C35 | no |
| C36 | yes |
| C37 | no |
| C38 | yes |
| C39 | yes |
| C40 | no |
| C41 | no |
| C42 | no |
| C43 | yes |
| C44 | no |
| C45 | no |
| C46 | no |
| C47 | no |
| C48 | no |
| C49 | no |
| C50 | no |
| C51 | no |
| C52 | no |
| C53 | no |
| C54 | no |
| C55 | no |
| C56 | no |
| C57 | no |
| C58 | no |
| C59 | no |
| C60 | no |
| C61 | no |
| C62 | no |
| C63 | yes |
| C64 | no |
| C65 | no |
| C66 | no |
| C67 | yes |
| C68 | no |
| C69 | no |
| C70 | no |
| C71 | no |
| C72 | no |
| C73 | no |
| C74 | no |
| C75 | no |
| C76 | no |
| C77 | no |
| C78 | no |
| C79 | no |
| C80 | no |
| C81 | yes |
| C82 | no |
| C83 | no |
| C84 | no |
| C85 | no |
| C86 | no |
| C87 | no |

Existing tests that still do **not** count on their own: `tests/review-summary.test.mjs` (hands `summariseReview` cards), `tests/b232-display-verdict-label.test.mjs` / `tests/b232-export-verdict-label.test.mjs` (hand a slug to a label function), `tests/b228-export-finding-hole.test.mjs` (hands `evidenceFindingForExport` a card), `tests/b213-export-summary.test.mjs` (hands `buildExportQualityReviewSummary` a result), frontend `tests/b214-no-proposal-card-copy.test.mjs` (string present in source). B196 was a live production walk, not a regression test. B245 does count for the yes rows above because the input is the stored review payload and the writer is the same one the screen or file uses.

---

## Ranked findings

Ranked by one question: could this make the product say something untrue to a user?

| Rank | Finding | Untrue to a user? | Already filed? |
|------|---------|-------------------|----------------|
| 1 | Export `classifyCard(qcCard)` ignores `reviewOptions`, so a check the user turned off prints `Not checked.` | Yes. The file claims a check ran. | **B234** this pass |
| 2 | `classifyEvidence` drops unknown / `Not reviewed` slugs while evidence is on, so QRS can still say Ready / `All claims are backed by sources` while the badge says Unverifiable | Yes, on the same unknown-slug class B232 closed on the badge | **B235** this pass |
| 3 | Drawer `supportSpans[].classification` vs card verdict | Yes | B89, do not refile |
| 4 | Card excerpt vs competing passage in the wrong slot / empty `conflictExcerpt` | Yes | B158, B165, do not refile |
| 5 | Export `(high concern)` is evidence-only, named as if it were overall | Misleading | B233, do not refile |
| 6 | Assessment paragraph and constructive feedback are two model writers of overlapping prose, never checked against each other | Can | **B236** this pass, AFTER until an observed contradiction |
| 7 | QRS prints at most 3 bullets, so a fourth class of problem is silent | Omission; badge still honest | **B237** this pass, AFTER |
| 8 | Filter `Not checked` does not include Evidence `Not reviewed` | Naming | **F24** this pass, AFTER |
| 9 | `recommendationDisplayText` / `getStatementVerdict` still run, never mounted | Not today | **B238** this pass, AFTER |
| 10 | Two allowlists for the evidence badge (frontend `displayVerdictLabels.js`, backend `evidence-display-verdict.mjs`) | Only if they drift | **B239** this pass, AFTER |

Already shipped against this class: B232 (unknown badge Confirmed), B228 (export invented finding sentence), B227/B229/B230 (empty finding into assessment / feedback / reviser), B213 (export QRS ≠ screen QRS), B212 (export version).

---

## Where Claude's four-surface framing was wrong

Claude named four surfaces: the badge, the counts, the finding prose, the export. Those are four *writers of finding prose derived from the card*, plus the badge and the counts. They are not the set of things that can lie.

Confirmed as reaching a user and **not** on that list:

- Quotes: card excerpt, drawer highlights, export excerpt, disagreement passages
- Draft text: generate, rewrite, proposed wording, modify, applied save, adapt
- Coverage claims: `Not reviewed`, export `Not checked.`, Ready success sentence, `Evidence review was not run`, filter Not checked, QRS `could not be fully checked`
- Confirmations: saved, copied, applied, rewritten-this-sentence, placeholder refusal
- Provenance: Build, env pill, house name, sources in and out, version, Assessed as, last reviewed
- Governance chips and the Which document governs question
- Word count and the over-limit line
- Reviewer assessment paragraph (a different prose writer than the card finding)
- Constructive feedback (a third prose writer)
- Decision-copy / NO_PROPOSAL lines
- Disclaimer
- Exclusion reasons
- Backend Up / Down
- Stale banner
- Empty-state sentences

Claude's unverified guesses, checked:

| Guess | Verdict |
|-------|---------|
| Highlighted passage in the sources drawer | Confirmed. C32. Can disagree with the card (B89) |
| Excerpt on the card face | Confirmed. C31. Can disagree with the drawer (B158) |
| Proposed wording, rewrite, generate | Confirmed. C56-C58. Draft text, not finding prose |
| Version number | Confirmed. C8, C85. Fixed as B212 |
| Environment pill | Confirmed. C16, C81 |
| Governance chip | Confirmed. C23 |
| Source in-and-out list | Confirmed. C83, C84, C27 |
| Word count | Confirmed. C1, C7, C12 |
| Not reviewed and Not checked | Confirmed. C62-C67. Two names for related misses; export can print the wrong one |
| Save and copy confirmations | Confirmed. C71, C72 |

---

## What this method still cannot see

- Any after-review state on the local app, because a canned analyse-statements JSON cannot be injected into `review_state`
- Exact model sentences on a given run (only templates and writers)
- PDF/DOCX layout versus extracted text
- Hover titles unless inspected (C81 was read from the DOM on the empty walk)
- Writing-route UI (redirects to Assess)
- Feature-flagged surfaces that are off
- Console-only or log-only claims
- Whether assessment and constructive feedback actually contradicted on 18 Sep (not compared here)

---

## Fixture

`tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json` is the real 18 Sep Meridian analyse-statements dump. It is **not** a replacement for `tests/fixtures/b226/1-meridian-reporting.json`.

The reconstructed fixture 1 is a slim B226 test object: `reviewOptions`, `expectedReviewSummary`, and short cards. The live dump is a full pipeline payload (`ok`, `supportSpans`, `citationHovers`, `pipelineVersion`, …). Card 0 wording also differs (live: "timing as June 2026"; reconstructed: "month of June 2026"). B226 tests load fixture 1. Replacing it would break those tests and mix two shapes. The live dump is committed beside it.
