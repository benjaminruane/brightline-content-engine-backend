# Dead-read census

Read-only. 2026-09-19. No code changes in product paths. No model calls. No Review. Cost: **USD 0.00**.

Repos at start of pass: backend `main` `48414b8` with one pre-existing untracked file (`tests/b226-constructive-feedback-piece.test.mjs`, left untouched); frontend `main` `f0bc71f`, clean. B226 (`d41f3ea`, constructive feedback is a piece) landed on backend HEAD during the pass. This census is against HEAD including that commit.

Filed as **B227**–**B231** and standing rule **P31**. Not specs.

---

## Scoreboard

| Object | READ minus WRITE (real) | Vacant keys still read | WRITE minus READ (live product) | Silent path to a model or a client |
|---|---|---|---|---|
| **qcCard** | **2** top-level (`claimType`, `reviewerVerdict`) plus nested hover/concern aliases | **11** keys written empty/null/`[]` that consumers still branch on | **~18** computed and never shown on the card face | Assessment empty `concern`; export invented evidence line; constructive-feedback invented generic notes |
| **reviewSummary** | **0** | `needsAttention` on the summary object is unused (cards carry the same flag) | `editorial.hardConcerns` / `compliance.hardConcerns` not shown as their own numbers | No |
| **action list + governance** | **0** on the public entry | empty `thing2` becomes `"(none)"` in the model prompt | internal `card` is stripped from the public entry on purpose | Yes, to the reviser |
| **export payload** | `reviewerVerdict` unless the frontend overlay wrote it | `reasoningHeadline` always null; used as fallback | `editorialFlag` / `complianceFlag` computed, never printed as flags | Yes: `"No evidence finding recorded."` |
| **statement.meta** (legacy, extra) | **the whole matcher/supportingReferences path** | n/a | n/a | No on Assess cards (qcCard wins). Live landmine on the non-`inPage` panel |

Expectation before looking: five to fifteen dead card reads, mostly harmless, and one or two prose-writer hits as serious as the assessment notes. **That is about right.** Top-level missing names are few. The mass is vacant keys and empty *values* of names that still exist. The two prose-writer hits that matter are the assessment's empty `concern: ""` and the export's invented evidence sentence.

The card-face census of 2026-09-10 (`findings.md`) already had this class on the screen. This pass pointed it at the four writers. Same object, one audit short, now closed as a census.

---

## Method

**WRITE (qcCard).** Keys assigned in `assembleCard` / `safeCard` (`lib/qc/pipeline-v3/stage7-assemble-card.mjs`), `buildSkippedEvidenceQcCard` (`lib/qc/evidence-skipped-fast-path.mjs`), `notReviewedEditorialResult` (`lib/qc/pipeline-v4/index.mjs`), editorial-reviewer mutations (`lib/qc/editorial-compliance-reviewer.mjs`), and `stmt.qcCard.summaryClass = classifyCard(...)` (`api/analyse-statements.js`). Additive: `decomposed`, `claimUpgrade`, `claims`, `coverageUnion`. Spread `...editorialOut` is why `suppressInQcWorkbench` is written even though it is not a literal key on the `const card = { ... }` object.

**READ.** Static `qcCard.prop` in both repos; `card.prop` in files that mention `qcCard` or that are known card consumers (`lib/qc/review-summary.mjs`, `lib/revise-actions/silence.mjs`, and the rest of `lib/revise-actions/`). Bracket literals and destructuring included.

**Dynamic access that could not be resolved statically.** One live site: `row.qcCard[listKey]` in `src/utils/reviewerSynthesisPayload.js:38`. `listKey` is only `"editorialConcerns"` or `"complianceConcerns"`. Counted as those two names.

**Not resolved statically, checked by hand.** Nested keys (`citationHovers[].whatThisShows`, `concern.ruleId`). Identifier `card` in files that never mention `qcCard`. Spread-assigned keys. `statement.meta.*` (a different object; see A5).

Parser noise discarded: `Only`, `mjs`, nested `startChar`/`endChar`/`level`/`features` pulled out of `draftSpan` and `materiality` literals.

---

## A1. qcCard WRITE set

**v4 assembled card** (`assembleCard`, then `summaryClass` in the handler):

`index`, `statement`, `charStart`, `charEnd`, `supportState`, `hasConflict`, `primaryExcerpt` (string or null on v4 today), `conflictExcerpt`, `evidenceSummary`, `supportRefIds`, `supportRefTitles`, `primaryRefId` (always null), `primaryRefTitle`, `primarySourceOrigin` (always null), `primaryExcerptText`, `primaryExcerptStart`/`End` (always null), `secondarySupportCount` (always 0), `supportingReferenceIds`/`Titles` (always `[]`), `hasRealExcerpt`, `conflictValues` (always null), `reasoningHeadline` (always null), `reasoningParagraph`, `displayMode` (= `supportState`), `draftSpan`, `evidenceTrace` (always `[]`), `selectedExcerptReason` (always null), `excerptMatchType` (always `"none"`), `suggestedImprovement` (always null), `whyItMatters` (always null), `displayVerdict`, `concernLevel`, `sentenceSubclaimCount` (always null), `qcClaimId` (always null), `originalClaimText`, `citationHovers` (always `[]`), `primaryExcerptTrusted` (always false), `conflictEvidence` (always null), `pipelineVersion`, `supportSpans`, `unsupportedSpans`, `stage2SourceFingerprints`, `materiality`, `sourceRecencyConcerns`, `framingFidelityConcerns`, `supersededSourceNotes`, editorial/compliance block including `suppressInQcWorkbench`, optional `decomposed`/`claimUpgrade`/`claims`/`coverageUnion`, then `summaryClass`.

**Skipped-evidence cards** additionally write `concernState: "none"`, `supportState: "skipped"`, `displayVerdict: "Not reviewed"`, `displayMode: "unsupported"`, and omit most evidence payload keys.

v4 `supportState` values actually emitted: `supported` | `partial` | `conflicting` | `not_supported` (plus `skipped`). Not `confirmed` / `partially_confirmed`.

---

## A3. READ minus WRITE (qcCard), ranked

Silent absence that reaches a **model** first, then a **client file**, then the **screen**.

| Rank | Field | Who reads | When absent | Visible? | File |
|---|---|---|---|---|---|
| 1 | *(empty `editorialConcerns[].note` and `suggestedDirection`, field names exist)* | Assessment payload | Pushes `{ statement, concern: "" }` into the model | **Silent to the colleague. The paragraph is fluent.** | frontend `src/utils/reviewerSynthesisPayload.js:47` **B227** |
| 2 | `reasoningParagraph` / `reasoningHeadline` empty (names exist; headline never filled) | Export | Substitutes `"No evidence finding recorded."` | **Visible in the file as if it were a finding.** | backend `api/export.js:118–122` **B228** |
| 3 | empty evidence + empty concern notes on a not-clean card | Constructive feedback `collectMarginNotes` | Invents `"Sources do not confirm this statement."` / `"Editorial concern on this sentence."` / `"Compliance concern on this sentence."` | **Silent invention.** The piece treats a blank as a finding. | backend `lib/qc/constructive-feedback.mjs:817, 830–835, 849–854` **B229** |
| 4 | empty `thing2` / `suggestedDirection` | Implement Changes prompt | Becomes `"(none)"` in the user message | Loud-ish to the model, not to a human | backend `lib/revise-actions/prompt.mjs:20–23, 62–66` **B230** |
| 5 | `claimType` | Card excerpt cleaning; workbench claim-type filter | `""` / skip | Silent. Cleaning uses the empty branch. | frontend `StatementReviewCard.jsx:761`, `StatementAnalysisPanel.jsx:123` **B231** |
| 6 | `citationHovers[]` nested `whatThisShows` / `body` | Source chips | Chip list becomes `[]` on v4 (`v2PopupStrict`) | Silent. Magnifier still works via `supportSpans`. | frontend `StatementReviewCard.jsx:684–703, 818–829` **B231** |
| 7 | `reviewerVerdict` | Export | Line omitted | Silent skip, not invention. Overlay in `useDraftState.jsx:814` can write it; the pipeline never does. | backend `api/export.js:138, 300` |
| 8 | `concern.ruleId` / `concern.rule` | Inventory / revision prompt | Falls back to `concernCode` | Silent, harmless | backend `lib/revise-actions/inventory.mjs:30–36` |

`suppressInQcWorkbench` was a false READ-minus-WRITE: it is assigned via `...editorialOut`. Live reads in `StatementAnalysisPanel.jsx` and `review-summary.mjs` are real.

---

## A4. WRITE minus READ (qcCard)

Do not delete. Either dead weight or something we forgot to show.

| Field | Written | Live product read? | Note |
|---|---|---|---|
| `concernLevel` | always | Export only (`(high concern)` suffix). Card computes `riskLabel` / `showConcernPill` and **never mounts them** | Screen vs file disagree. **B231** |
| `supersededSourceNotes` | when supersession fires | No UI. Tests only | Historical note the reviewer never sees |
| `evidenceSummary` | same string as `reasoningParagraph` | Assessment and constructive feedback yes; card face reads `reasoningParagraph` only | Duplicate, not dead |
| `conflictExcerpt` | object or null | No frontend identifier. Silence tests + Stage 5 + revision | **B158** still the layout gap |
| `citationHovers` | always `[]` | Chip path built around it | Vacant |
| `whyItMatters` | always null | Popover fallback | Vacant |
| `reasoningHeadline` | always null | Export fallback before the invented sentence | Vacant |
| `secondarySupportCount` | always 0 | Computed on the card, not shown | Vacant |
| `supportingReferenceIds` / `Titles` | always `[]` | Schema requires them | Vacant aliases of `supportRefIds` |
| `primaryRefId` | always null | Schema | Vacant |
| `primaryExcerptStart` / `End` | always null | No live read | Dead |
| `suggestedImprovement` | always null | Box removed (A6.20) | Dead |
| `conflictValues` / `conflictEvidence` | always null | Silence structural tests | **B147** already filed |
| `evidenceTrace` | always `[]` | Schema optional | Dead |
| `excerptMatchType` / `selectedExcerptReason` | `"none"` / null | No live read | Dead |
| `sentenceSubclaimCount` / `qcClaimId` | always null | Popover original-sentence rule | Vacant |
| `concernState` | skipped-evidence only | No live read | Dead |
| `pipelineVersion` (on the card) | `v3`/`v4` | Diagnostics; UI does not | Dead on the face |
| `coverageUnion` | optional | No frontend | Architecture already says so |
| `decomposed` / `claimUpgrade` | optional | Frontend no; silence reads `claims[].role` | Architecture already says frontend does not read them |
| `materiality` | always | Revision prompt + flag register | Live, not shown |
| `unsupportedSpans` | always | Silence tests | Not on the card face |
| `stage2SourceFingerprints` | always | Silence + governance labels | Not on the card face |

---

## A5. Other boundary objects

### Review summary (`meta.reviewSummary`)

**WRITE** (`lib/qc/review-summary.mjs` `summariseReview`): `version`, `statements`, `evidence.{confirmed,partial,conflicting,notSupported}` or null, `editorial.{concerns,hardConcerns,notChecked}` or null, `compliance` same, `signalConcerns`, `notChecked`, `needsAttention`, `readiness`.

**READ minus WRITE:** none.

**WRITE minus READ:** `reviewSummary.needsAttention` is not read off the summary object. The sidebar count recomputes from `qcCard.summaryClass.needsAttention` plus governance (`qcWorkbenchFilters.js:34–43`). `editorial.hardConcerns` / `compliance.hardConcerns` feed readiness and are not printed as their own badges. `evidence.confirmed` is sent to the assessment model (`reviewerSynthesisPayload.js:87`) and is not a bullet on screen.

### Action list + governance

**WRITE** (`inventory` → `sort` → `publicEntry` in `lib/revise-actions/run.mjs:85–136`): `id`, `disposition`, `statementId`, `statement`, `kind`, `rule`, `thing1`, `thing1State`, `thing2`, `sort`, optional `explanation`, `explainCode`, `governancePair`, `disagreementPassages`, `confirmingPassage`/`Label`, `noProposalReason`, `proposedChange`, `resultingSentence`, `why`, `verification`. Internal `card` stays on the sorted entry and is stripped from the public response.

**READ minus WRITE:** none on the public shape. Frontend `actionListDisplay.js` and `SourceGovernanceQuestion.jsx` read the whitelist.

**Empty value, not missing name:** `thing2: ""` and null `suggestedDirection` become `"(none)"` in `buildFindingPrompt`. **B230**.

### Export payload (`buildReviewData` in `api/export.js`)

**WRITE** per statement: `statementText`, `verdict`, `concernLevel`, `evidenceFinding`, `excerpt`, `editorialNote`, `complianceNote`, `reviewerVerdict`, `editorialFlag`, `complianceFlag`. QRS from `qualityReviewSummary.{readiness,bullets}` with fallback to `meta.reviewSummary.readiness` and **no bullets**.

**READ minus WRITE:** `reviewerVerdict` unless the client overlay stored it on the card.

**WRITE minus READ:** `editorialFlag` / `complianceFlag` are used only to decide whether to keep a note, not printed.

### Extra objects named so they are not missed

| Object | Do it? | Result |
|---|---|---|
| Reviewer synthesis payload (frontend → `/api/synthesize-review`) | Yes, as a writer | Empty `concern` **B227**. Unknown readiness refused (`api/synthesize-review.js:31–32`) then the UI shows `"Reviewer assessment unavailable."` — that refusal is already loud. |
| Constructive feedback bundles | Yes | Invented generic notes **B229** |
| `statement.meta` (legacy) | Yes | `getCanonicalBackendEvidenceIds` (`StatementAnalysisPanel.jsx:166–220`) reads `meta.supportingReferences` / `matcherSupport` / `supportingSourceIds`. v4 never writes them. Live Assess cards bypass this for chips via `qcCard.supportRefIds`. The non-`inPage` panel still counts `sourceCount` from this path and labels it **"supported"**. |
| `review_state` blob / `reviewer_decisions` | Named, not subtracted | Opaque persist shapes. Not field-enumerated here. |
| Analyse-statements `sources[]` / `excludedSources[]` | Named | Separate contract. Not this pass. |

The four prose writers confirmed: **assessment**, **constructive feedback**, **export**, **revise / Implement Changes**. No fifth writer of finding-prose from the card. Stage 5 commentary is a producer (writes `evidenceSummary` / `reasoningParagraph`), not a consumer of the assembled card.

---

## Audit B. Name versus meaning

Every number, count, label, and badge a user can see on Assess or in the export. One function. One sentence.

| What the user sees | Function | What it actually counts or means | Misleading? | Given to a model? |
|---|---|---|---|---|
| Evidence badge `Confirmed` / `Partially confirmed` / `Conflicting` / `No support` / `Not reviewed` | `evidenceDisplayVerdictLabel` | Maps `displayVerdict`. Empty/`not reviewed` → Not reviewed. **Any other slug, including unknown, → Confirmed.** | Yes: unknown → Confirmed. Export maps unknown to **Unverifiable**. | No |
| Longer evidence line `Confirmed by sources` etc. | `evidenceVerdictLineFromCard` | Same slugs. Computed as `verdictLabel` and **not mounted** on the card | Dead longer line. Badge is what shows. | No |
| Editorial/compliance badge `Clean` / `Soft concern` / `Concern` / `—` | `getBadgeLabel` | `hard_concern` → "Concern". `not_reviewed` → "—" (the row has a separate Not-checked path) | `concern` and `soft_concern` both exist; only `soft_concern` is labelled Soft | No |
| Readiness pill `Ready` / `Not fully checked` / `Minor points to address` / `Needs work` / `Needs significant work` | `readinessFromCounts` | Hard = notSupported + conflicting + hardConcern cards. Conflict forces significant. Partial or soft → minor. | `Needs work` is one hard card; `Needs significant work` is a conflict or three hards. Fine. | Yes: first sentence of the assessment, exact words |
| QRS bullets (`N claims have no source…`) | `summaryBullets` | `evidence.notSupported` / `conflicting` / `partial`, `notChecked`, `signalConcerns`. Max 3. | "claim" = counted card, not a Stage 1b claim span | Indirectly (readiness, not the bullets) |
| Filter `All` count | `workbenchFilterCounts` × `rowMatchesQcWorkbenchFilter("all")` | Visible, non-suppressed cards | Fine | No |
| Filter `Needs attention` count | same, plus governance | `summaryClass.needsAttention` **minus** dealt-with / overridden / matches-governing | **Disagrees with** `reviewSummary.needsAttention`, which does not drop dealt-with. Intentional **B204**. Assessment still uses the Review-time summary. | No |
| Filter `Conflicts` count | `cls.evidence === "conflicting"` | Display-verdict conflict only. Not `hasConflict` | A `hasConflict` card that is not `conflict` (known **B39** class) is not in this filter | No |
| Filter `Editorial` / `Compliance` / `Not checked` | `summaryClass` signal | Concern or hardConcern; notChecked | Fine | Counts yes, via `editorialFlagCount` |
| Word-limit bullet | `wordLimitOverBy` | Draft words minus maxWords | Fine | No (export QRS only) |
| Export verdict | `normalizeVerdict` | Same four labels, unknown → **Unverifiable**, skipped → omitted | Disagrees with the badge default of Confirmed | No |
| Export `(high concern)` / `(moderate concern)` | raw `qcCard.concernLevel` | Evidence-only map: supported→none, partial→moderate, else high. **Ignores editorial/compliance.** | Name says concern. It is the evidence map. **Not on the card.** | No |
| Export evidence finding | `reasoningParagraph` or invented sentence | Stage 5 commentary, or `"No evidence finding recorded."` | The invented sentence looks like a finding **B228** | No |
| Card `Clean: Editorial, Compliance, …` | count of empty concern arrays | Not the verdict. A `not_reviewed` editorial row is not in that Clean list | Fine if you read the row | No |
| Governance chip `Matches the document you chose as governing.` | overlay copy | A stored ruling, not a new Review verdict | Fine (B218) | No |
| Non-`inPage` line `N supported · M require sourcing` | `summaryKpis` from `sourceCount > 0` | **Any** backend evidence id, via the dead `meta.supportingReferences` path. On v4 that path is empty, so this would read as 0 supported. Assess uses `inPage` and does not show this line. | Classic "supported includes partial" **and** a dead counter. Latent. | No |

Two that look like the same thing and are not:

1. **Confirmed badge** (`displayVerdict === supported_full`) vs **filter Conflicts** (`summaryClass.evidence === conflicting`) vs **`hasConflict`**. Three bits.
2. **Needs attention** on the sidebar vs **`reviewSummary.needsAttention`** vs **readiness**. Sidebar shrinks on accept; pill and assessment do not (**B204**).
3. **`evidence.confirmed`** sent to the model vs **no Confirmed count on screen**.

Dead branches still testing values v4 never writes (card census, never filed): `supportState === "confirmed" | "partially_confirmed"` and `displayMode === "confirmed"` in `StatementReviewCard.jsx:550–551, 721`. `displayMode === "partial"` does match. Net: confirmed/conflict branches on `displayMode` are dead; partial is live. **B231**.

---

## Audit C. Where a missing input is silent

Four writers confirmed. No fifth.

| Writer | Today, finding text empty | Would anyone see it? | Smallest refusal (do not build) | Refuse or log? |
|---|---|---|---|---|
| **Assessment** | `concernItemsFromRow` still pushes `{ concern: "" }` when note and direction are both blank. The model receives a statement and an empty concern. | No. The paragraph is fluent. Same class as reading missing `editorialNote`. | Same shape as the readiness check: if a row is classified concern/hardConcern and the joined note+direction is empty, **do not call**. Surface `"Reviewer assessment unavailable."` (already the empty-narrative path). | **Refuse.** The output is a colleague's paragraph. An empty input is a fabrication risk. |
| **Constructive feedback** | `collectMarginNotes` (live after B226) invents a generic `cardNote` when evidence or concern text is empty. The old bundle path still drops empty cards (`bundleHasContent`); the piece path no longer uses that filter. | Yes, as a margin note, looking authored. | Do not invent. Omit the note, or refuse that card with a log. Same family as the export invented sentence. | **Refuse the sentence.** A generic `"Editorial concern on this sentence."` is worse than a hole. |
| **Export** | `"No evidence finding recorded."` | Yes, in the file, looking like a finding. | Do not invent a sentence. Omit the evidence line, or print `Evidence finding: (missing)` as a visible fault. Same family as the placeholder guard: a blank is not copy. | **Refuse the sentence**, not the whole file. A client export can still ship; that row must not look authored. |
| **Revise / Implement Changes** | `block()` writes `What is wrong: (none)`. | Only if you read the prompt. The resulting sentence can still look confident. | If disposition is ACTION and `thing2` and `suggestedDirection` are both empty, **ACKNOWLEDGE** with the existing no-proposal copy instead of calling the model. Same cheap shape as the placeholder guard. | **Refuse the model call** (downgrade to ACKNOWLEDGE). Logging only leaves the invention path open. |

Working examples this should copy: placeholder guard (`lib/prompt-library/placeholder-guard.mjs`, 422, draft unchanged) and readiness refusal (`api/synthesize-review.js:31–32`).

---

## Three to fix first

1. **B227 — assessment empty `concern`.** Same defect class as the notes that were missing for weeks. It still hands the model a blank and asks for a paragraph. Cheap refusal. Highest reach.
2. **B228 — export invented evidence line.** Nobody reads an export closely until a client does. The sentence looks authored. Stop inventing; leave a hole or a fault mark.
3. **B229 — constructive feedback invented notes.** B226 made the piece a margin-note writer. Empty card text now becomes `"Editorial concern on this sentence."` and kin. That is the export defect, on a model-facing path.

**B230** is the same shape on Implement Changes and can ride with those refusals. **B231** is the leftover card-face dead reads; after, not launch.

---

## What is wrong or incomplete about this method

Set arithmetic on **names** is exhaustive for missing keys and is silent on **wrong values**. Audit B is the bound. It found the unknown-verdict→Confirmed default, the export Unverifiable disagreement, and concernLevel meaning "evidence map" while wearing the word concern. Name-matching cannot find those.

It also cannot see **vacant writes**. `citationHovers: []` is a written key. Subtracting names hides it. The useful extra pass is: for every written key, is the runtime value ever non-empty on a v4 card? That is still free (read `assembleCard` literals).

`statement.meta` is a second object the Assess card mostly stopped reading, and the enumerator that starts at `qcCard` will not catch `getCanonicalBackendEvidenceIds`. Any later pass should subtract `meta` the same way, or delete the path.

Dynamic `qcCard[listKey]` was one site and resolved. A future `Object.keys` / computed property would slip through. There is none live today.

This pass did not execute a Review and did not inspect a stored production card. Vacant-vs-sometimes-filled for `supersededSourceNotes` and `claims` is from the assembler, not from a dump.

---

## Findings filed

| ID | What | Launch |
|---|---|---|
| **B227** | Assessment still sends empty `concern: ""` to the model | LAUNCH |
| **B228** | Export invents `"No evidence finding recorded."` | LAUNCH |
| **B229** | Constructive feedback invents generic notes when card text is empty | LAUNCH |
| **B230** | Implement Changes prompt substitutes `"(none)"` and still calls the model | AFTER |
| **B231** | Remaining card dead reads and vacant chip path (claimType, confirmed-branches, citationHovers, concernLevel face vs export) | AFTER |
| **P31** | Missing input must be loud at the point it goes missing | RECORD |

Not re-filed: **B147** (`conflictValues` null), **B158** (conflict excerpt layout), **B204** (Needs attention vs accept).

---

## D5 postscript. assembleCard vacant values (2026-09-19)

Read-only. Every key `assembleCard` assigns on the v4 `const card = { ... }` object plus the `...editorialOut` spread and the two optional claim-span / coverage blocks. "Ever non-empty" means a v4 live card can carry a useful value, not the constant empty/null/zero/false/"none" the assembler always writes. From `lib/qc/pipeline-v3/stage7-assemble-card.mjs` L779-839. Do not act on this table.

| Key | Ever non-empty on a v4 card? |
|---|---|
| `index` | Yes (number, including 0) |
| `statement` | Yes |
| `charStart` / `charEnd` | Yes (numbers; 0 is a real offset) |
| `supportState` | Yes (`supported` / `partial` / `conflicting` / `not_supported`) |
| `hasConflict` | Yes (boolean; true on conflicts) |
| `primaryExcerpt` | Sometimes. Null when there is no real passage |
| `conflictExcerpt` | Sometimes. Object when Stage 4 selected a conflict passage |
| `evidenceSummary` | Sometimes. Empty string when Stage 5 returned nothing |
| `supportRefIds` / `supportRefTitles` | Sometimes. From confirming matches |
| `primaryRefId` | **Never.** Always `null` |
| `primaryRefTitle` | Sometimes. Source label when an excerpt exists |
| `primarySourceOrigin` | **Never.** Always `null` |
| `primaryExcerptText` | Sometimes. Same occupancy as `primaryExcerpt` |
| `primaryExcerptStart` / `primaryExcerptEnd` | **Never.** Always `null` |
| `secondarySupportCount` | **Never non-zero.** Always `0` |
| `supportingReferenceIds` / `supportingReferenceTitles` | **Never.** Always `[]` |
| `hasRealExcerpt` | Yes (boolean; true when the passage is non-empty) |
| `conflictValues` | **Never.** Always `null` |
| `reasoningHeadline` | **Never.** Always `null` |
| `reasoningParagraph` | Sometimes. `evidenceSummary` or `null` |
| `displayMode` | Yes. Copy of `supportState` |
| `draftSpan` | Yes (object with offsets) |
| `evidenceTrace` | **Never.** Always `[]` |
| `selectedExcerptReason` | **Never.** Always `null` |
| `excerptMatchType` | **Never a real match type.** Always `"none"` |
| `suggestedImprovement` | **Never.** Always `null` |
| `whyItMatters` | **Never.** Always `null` |
| `displayVerdict` | Yes (`supported_full` / `supported_partial` / `conflict` / `not_supported`) |
| `concernLevel` | Yes (`none` / `moderate` / `high`), evidence-only |
| `sentenceSubclaimCount` | **Never.** Always `null` |
| `qcClaimId` | **Never.** Always `null` |
| `originalClaimText` | Yes. Copy of `statement` |
| `citationHovers` | **Never.** Always `[]` |
| `primaryExcerptTrusted` | **Never true.** Always `false` |
| `conflictEvidence` | **Never.** Always `null` |
| `pipelineVersion` | Yes |
| `supportSpans` / `unsupportedSpans` | Sometimes `[]`, sometimes filled (R7) |
| `stage2SourceFingerprints` | Sometimes |
| `materiality` | Yes (object) |
| `sourceRecencyConcerns` / `framingFidelityConcerns` | Sometimes `[]`, sometimes filled |
| `supersededSourceNotes` | Sometimes `[]`, filled when supersession fires |
| `editorialVerdict` / `complianceVerdict` | Yes (`clean` / `concern` / `soft_concern` / `hard_concern` / `not_reviewed`) |
| `editorialConcerns` / `complianceConcerns` | Sometimes `[]`, filled when a rule fires |
| `editorialNote` / `complianceNote` | Sometimes null, sometimes a string |
| `editorialSuggestedDirection` / `complianceSuggestedDirection` | Sometimes |
| `editorialSuggestedRewrite` / `complianceSuggestedRewrite` | Sometimes |
| `suppressInQcWorkbench` | Yes as boolean; true is rare |
| `decomposed` / `claimUpgrade` / `claims` | Only when `entry.claimSpans` is present |
| `coverageUnion` | Only when `entry.coverageUnion` is present |
| `summaryClass` | Yes. Stamped after assemble, in the handler |

Vacant constants that consumers still read: `primaryRefId`, `primarySourceOrigin`, `primaryExcerptStart`/`End`, `secondarySupportCount`, `supportingReferenceIds`/`Titles`, `conflictValues`, `reasoningHeadline`, `evidenceTrace`, `selectedExcerptReason`, `excerptMatchType`, `suggestedImprovement`, `whyItMatters`, `sentenceSubclaimCount`, `qcClaimId`, `citationHovers`, `primaryExcerptTrusted`, `conflictEvidence`. Filed under **B231**. Do not delete in a drive-by.
