# Delivery-check findings

Read-only diagnostic, 2026-09-10. No pipeline, extract, or evidence pass. No LLM calls. Metered spend for this pass: **USD 0.00**. The only file written is this one. P29 corpus files were not touched.

**Precedent.** Other diagnostic packs keep findings in-folder (`scripts/diagnostic/accuracy2/readiness-findings.md`, `scripts/diagnostic/extraction-check/REPORT.md`). This pack follows that pattern at the path the request named.

**Stored run used for counts.** `scripts/diagnostic/accuracy/runs/evidence-pass-lift-1/cards.json` (261 cards, `skipCommentary: true`, editorial and compliance off). That is the run B158 cites. Other `runs/*/cards.json` files were read for comparison only. Compacted card shape: `fixtureId`, `statement`, `occurrence`, `index`, `displayVerdict`, `hasConflict`, `sourceMatches` (classification + sourceIndex only), `supportSpans`, `primaryExcerpt`, `conflictExcerpt`. No commentary, no action-list proposals.

**Claude docs.** `claude/state-of-play.md` and `claude/accuracy-evidence-plan.md` are not in this repo. The claims tested are the ones quoted in the request, plus the same ideas already filed as **B153**, **B156**, **B158**, **B164**.

Card ids below are `F<fixtureId>:S<index>` (occurrence 0 on every lift-1 row).

---

## Q1 The card contract

**Verdict: the live qcCard is ~60 fields; the UI paints a badge, commentary, concerns, and a magnifier, and leaves most of the evidence payload unused, including the dedicated conflict excerpt.**

Source of the payload: `assembleCard` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs`, returned unchanged as `statements[].qcCard` from `api/analyse-statements.js`. Wrapper fields `id`, `text`, `draftSpan` sit beside the card. Types are what assembly actually emits, which is not always what `lib/qc/qc-api-schema.mjs` declares.

Render tags:

- **RENDERED** — the user sees the value as copy, a badge, or a bullet.
- **PARTIALLY RENDERED** — used for highlight, filter, drawer, or a control, or only some nested fields show.
- **COMPUTED BUT NEVER SHOWN** — on the response; no UI surface reads it for display.

| Field | Type | Optional? | Render | Where |
|---|---|---|---|---|
| `index` | number | required | PARTIALLY RENDERED | `StatementReviewCard` `data-statement-index`; join key, not shown as text |
| `statement` | string | required | RENDERED | `StatementReviewCard` header; also `row.text` |
| `charStart` / `charEnd` | number | required | PARTIALLY RENDERED | `actionListDisplay.spanFromRow`; draft highlight via `draftSpan` |
| `draftSpan` | `{ startChar, endChar }` | required (`sentence` never set) | PARTIALLY RENDERED | `StatementReviewCard` / `AssessModule` highlight; `draftSpan.sentence` is never populated |
| `displayVerdict` | `"supported_full" \| "supported_partial" \| "conflict" \| "not_supported"` | required | RENDERED | Short badge via `evidenceDisplayVerdictLabel` in `StatementReviewCard`. Longer line from `evidenceVerdictLineFromCard` is computed as `verdictLabel` and never mounted |
| `supportState` | `"supported" \| "partial" \| "conflicting" \| "not_supported"` | required | PARTIALLY RENDERED | Skipped-evidence test; `isEvidenceGap`. Card code also checks `"confirmed"` / `"partially_confirmed"`, which v4 never emits |
| `displayMode` | same as `supportState` | required | PARTIALLY RENDERED | `StatementReviewCard` compares to `"conflict"` and `"confirmed"`, which do not match `"conflicting"` / `"supported"`. `"partial"` does match. Net: conflict/confirmed branches on `displayMode` are dead |
| `hasConflict` | boolean | required | PARTIALLY RENDERED | Workbench filter `conflicts` in `qcWorkbenchFilters.js`. Not a badge |
| `concernLevel` | `"none" \| "moderate" \| "high"` | required | COMPUTED BUT NEVER SHOWN | Mapped into `riskLabel` / `showConcernPill`, neither of which is in the JSX |
| `primaryExcerpt` | `{ sourceLabel, passage } \| null` on the wire (schema says `string \| null`) | required, nullable | PARTIALLY RENDERED | UI only accepts a string (`typeof === "string"`). Object form therefore does not fill the citation popover. Compacted diagnostic cards store the passage string |
| `primaryExcerptText` | `string \| null` | required, nullable | COMPUTED BUT NEVER SHOWN | String copy of the passage. UI never reads it. Export (`api/export.js`) does |
| `primaryRefTitle` | `string \| null` | required, nullable | PARTIALLY RENDERED | Magnifier resolution and citation title; chips usually empty (see `citationHovers`) |
| `primaryRefId` | `null` | required, always null | COMPUTED BUT NEVER SHOWN | Hardcoded null at assembly |
| `conflictExcerpt` | `{ sourceLabel, passage } \| null` | required, nullable | COMPUTED BUT NEVER SHOWN | **No frontend identifier `conflictExcerpt`.** Backend: Stage 5 prompt, `lib/revise-actions/silence.mjs`, `lib/build-revision-prompt.mjs` |
| `evidenceSummary` | string | required | COMPUTED BUT NEVER SHOWN | Same string as `reasoningParagraph`. UI reads only the latter |
| `reasoningParagraph` | `string \| null` | required, nullable | RENDERED | Evidence expansion in `StatementReviewCard` (`confirmationSentence`) |
| `reasoningHeadline` | `null` | required, always null | COMPUTED BUT NEVER SHOWN | Logged only |
| `supportRefIds` | `number[]` | required | PARTIALLY RENDERED | Confirming matches only. Drives source chips. Chips then require `citationHovers` body + `whatThisShows`, which are empty, so chips do not render on v4 |
| `supportRefTitles` | `string[]` | required | PARTIALLY RENDERED | Chip title fallback |
| `supportingReferenceIds` / `supportingReferenceTitles` | `[]` | required, always empty | COMPUTED BUT NEVER SHOWN | Hardcoded empty |
| `secondarySupportCount` | number, always `0` | required | COMPUTED BUT NEVER SHOWN | Assigned, never mounted |
| `hasRealExcerpt` | boolean | required | COMPUTED BUT NEVER SHOWN | Export only |
| `primaryExcerptStart` / `primaryExcerptEnd` | `null` | required | COMPUTED BUT NEVER SHOWN | Always null |
| `primarySourceOrigin` | `null` | required | PARTIALLY RENDERED | Citation header `"WEB SEARCH"` vs `"SOURCE"`; always null on v4 uploaded path, so defaults to uploaded |
| `primaryExcerptTrusted` | `false` | required | PARTIALLY RENDERED | Skips excerpt cleaning when true; always false on v4 |
| `conflictValues` | `null` | required, always null | COMPUTED BUT NEVER SHOWN | **B147.** Legacy helpers in `statementAnalysisHelpers.js` still know the shape; assembly never fills it |
| `conflictEvidence` | `null` | required, always null | COMPUTED BUT NEVER SHOWN | Silence test only |
| `evidenceTrace` | `[]` | required, always empty | COMPUTED BUT NEVER SHOWN | |
| `citationHovers` | `[]` | required, always empty | COMPUTED BUT NEVER SHOWN | The chip/popover path is built around this and never receives rows |
| `selectedExcerptReason` | `null` | required | COMPUTED BUT NEVER SHOWN | |
| `excerptMatchType` | `"none"` | required | COMPUTED BUT NEVER SHOWN | Always `"none"` |
| `suggestedImprovement` / `whyItMatters` | `null` | required | COMPUTED BUT NEVER SHOWN | Suggested-improvement box was removed (`StatementReviewCard` comment A6.20) |
| `sentenceSubclaimCount` / `qcClaimId` | `null` | required | COMPUTED BUT NEVER SHOWN | Popover original-sentence rule; never populated |
| `originalClaimText` | `string \| null` | required, nullable | PARTIALLY RENDERED | Citation popover fallback; duplicates `statement` |
| `claimType` | absent on v4 cards | absent | COMPUTED BUT NEVER SHOWN | UI reads it for excerpt cleaning / filters; assembly does not set it |
| `pipelineVersion` | `"v3" \| "v4"` | required | COMPUTED BUT NEVER SHOWN | |
| `supportSpans[]` | `{ sourceRefId, classification, statementId, passage, start, end }[]` | required | PARTIALLY RENDERED | Magnifier + `SourceReaderPanel` highlights and hover. Passage is not printed on the card |
| `unsupportedSpans[]` | array | required | COMPUTED BUT NEVER SHOWN | No frontend read |
| `stage2SourceFingerprints[]` | `{ sourceIndex, sourceLabel, classification, systemFingerprint }[]` | required | COMPUTED BUT NEVER SHOWN | Unreduced pair class. Silence tests and compacted `sourceMatches`. Not on the card face |
| `materiality` | `{ level, features }` | required | COMPUTED BUT NEVER SHOWN | No frontend read |
| `sourceRecencyConcerns[]` | concern objects | required | RENDERED | `StatementReviewCard` "Source recency" row via `buildConcernText` |
| `framingFidelityConcerns[]` | concern objects | required | RENDERED | `StatementReviewCard` "Framing goes beyond the source" |
| `supersededSourceNotes[]` | array | required | COMPUTED BUT NEVER SHOWN | No frontend read |
| `editorialVerdict` | string | required | RENDERED | Editorial row label / dot; `deriveTintClass` border |
| `editorialConcerns[]` | `{ concernCode, note, category, suggestedDirection?, suggestedRewrite?, concernText?, span? }[]` | required | RENDERED | Bullets via `buildConcernText`; `span` drives draft phrase highlight |
| `editorialNote` / `editorialSuggestedDirection` / `editorialSuggestedRewrite` | `string \| null` | required, nullable | COMPUTED BUT NEVER SHOWN | Card-level; UI reads the per-concern fields instead |
| `complianceVerdict` | string | required | RENDERED | Compliance row / border |
| `complianceConcerns[]` | same concern shape | required | RENDERED | Same as editorial |
| `complianceNote` / `complianceSuggestedDirection` / `complianceSuggestedRewrite` | `string \| null` | required, nullable | COMPUTED BUT NEVER SHOWN | Card-level, unused |
| `suppressInQcWorkbench` | boolean | required | PARTIALLY RENDERED | Hides the card in `StatementAnalysisPanel` / `DraftContextPanel` |
| `decomposed` / `claimUpgrade` / `claims[]` | additive when Stage 1b ran | optional | COMPUTED BUT NEVER SHOWN | Architecture already says the frontend does not read them |
| `coverageUnion` | `{ promoted, contributingSourceIndices, union }` | optional | COMPUTED BUT NEVER SHOWN | No frontend read |

Concern nested `note` / `suggestedDirection` / `suggestedRewrite` / `concernText` are RENDERED as one bullet. `concernCode` / `category` are COMPUTED BUT NEVER SHOWN on the card (used in merge/reclassify, not painted).

---

## Q2 Self-contradiction sweep

**Verdict: on stored lift-1 cards, the three asked shapes are 0, 0, and 0. The real on-card disagreement is conflict layout (11) and pair fingerprints that still say confirmed after the reducer has made the badge Conflicting (6), not silent-verdict-plus-quote.**

Every accuracy run sets `skipCommentary: true`. Compacted cards have no `reasoningParagraph`, no `evidenceSummary`, and no proposed-edit fields. Counts below are from lift-1 unless named.

### Shape A — verdict says sources do not address, card also carries a quote

**0.**

`displayVerdict === "not_supported"` is the badge **"No support"** / line **"No support from sources"**. Nine such cards on lift-1. All have empty `primaryExcerpt`, empty `conflictExcerpt`, and zero `supportSpans`. Example ids with empty quote slots: `F01:S11` ("We recommend approval."), `F04:S15` ("The risks are clear."), `F14:S12` ("We will provide further detail when the work is sufficiently advanced."). Stage 4 sets `primaryExcerpt` null when the verdict is `not_supported`, so this shape cannot appear on a v4 card unless a later writer stuffs a quote in. It does not.

Partials are not this shape. Their badge says **"Partially confirmed"**, which does not claim silence. The "no source speaks" sentence lives on the Implement Changes acknowledge path (**B153**), which these stored cards do not carry.

### Shape B — commentary cites a source the card has just called silent

**0.**

Not present on the stored artifacts. Every `runs/*/cards.json` has `skipCommentary: true` and no commentary fields. No near-miss hunt.

### Shape C — proposed edit supplies a value the verdict says cannot be determined

**0.**

No `suggestedImprovement`, no `editorialSuggestedRewrite`, no `resultingSentence` on stored cards. Action-list proposals are a later endpoint. No near-miss hunt.

### Other on-card disagreements (not the three asked)

These are real. They are listed so they are not mistaken for Shape A.

| Shape | Count (lift-1) | What disagrees |
|---|---|---|
| **B158** quote in `primaryExcerpt`, `conflictExcerpt` empty, badge `conflict` | **11** | Dedicated conflict slot empty while the competing passage sits in primary. Ids and quotes in Q4 |
| Span-owned conflict: badge `conflict`, compacted `sourceMatches` have no `conflicting` class | **6** | Reducer voted a locatable span; fingerprints still show the losing single-pick. `F12:S0`, `F13:S7`, `F14:S11`, `F15:S11`, `F18:S7`, `F19:S13` |
| Dual-signal F18: one match `confirmed`, another `conflicting`, badge `conflict` | **5** | `supportRefIds` would list the confirming source. `F18:S0`, `F18:S3`, `F18:S4`, `F18:S5`, `F18:S8` |

Three span-only examples (badge Conflicting; stored pair class is not):

1. **`F13:S7`.** Statement: "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore." `sourceMatches`: `confirmed`. Conflicting span: "The total team of 285 people is split approximately as follows…".
2. **`F12:S0`.** Statement: "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week." `sourceMatches`: `partially_confirmed`. Conflicting span: "After eighteen months of work alongside the team…".
3. **`F18:S7`.** Statement: "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million…". `sourceMatches`: `confirmed` + `partially_confirmed`. Conflicting span: "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million…".

The B153 acknowledge line on every conflict-free partial is a live product contradiction. It is not in these stored cards, so it is not counted here.

---

## Q3 The discard list

**Verdict: the pattern is real. Several computations that are true at the point they run are stripped, overwritten, or never painted. Two of the named items do reach the payload and are only half-shown; they are not fully discarded.**

### Widened multi-passage match

- **Computed:** `matchMultipassagePair` in `lib/qc/pipeline-v4/stage2-match-multipassage.mjs`, gated by `pairNeedsWidenedPass` (`WIDENED_SCOPE = "supporting_pairs"` — `no_support` pairs skipped). Built into `supportSpans` via `buildSupportSpans`.
- **Reaches payload:** yes, `qcCard.supportSpans`. Not merged into `sourceMatches` (comment in `index.mjs`: "Single-pick matches ONLY — never append widened passages here").
- **UI:** PARTIALLY. Magnifier + Sources drawer highlights. Not printed as the card excerpt. Intra-source reducer reads locatable span classes; less-serious spans on the same pair are not labelled as losers.

### Verdict held before a later rule overwrote it

Several overwrite sites. The pre-overwrite value is not on the public card.

| Rule | Where | What is kept | What the user sees |
|---|---|---|---|
| Period gate | `applyPeriodGateBackstop` in `stage2-match-sources.mjs` | `preBackstopClassification` on the raw Stage 2 object; **dropped** when `index.mjs` copies `sourceMatches` (no `preBackstopClassification` field in that map). Non-overlapping periods rewrite `confirmed`/`conflicting` → `no_support` | Badge follows the rewrite. The fact that the model called it a conflict is gone. **B156** |
| Rounding lift on spans | `spanVoteClassification` in `intra-source-reducer.mjs` | Lifted class only | Pre-lift conflicting span class not stored |
| Supersession | `resolveSupersession` in `index.mjs` | `originalClassification` on the in-memory match; **not** copied onto `stage2SourceFingerprints` | `supersededSourceNotes` reach the card and are never rendered |
| Claim-span upgrade | `rollupClaimVerdicts` may set `verdictResult.verdict = "confirmed"` | `claimUpgrade` + `claims[]` on the card | Frontend does not read them. Badge shows the upgraded verdict |
| Coverage-union promote | `shouldPromoteCoverageUnion` | `coverageUnion` on the card | Frontend does not read it |
| Editorial duplication judge | `assembleCard` when evidence is `conflicting` | Suppressed concerns logged to Langfuse only | Dropped editorial bullets never appear |

### `computeGuardrailForSource` when a source looks mangled

- **Computed:** `lib/extract-text-from-source.mjs`. Production `prepareUploadedSourcesForPipeline` never calls it. Confirmed **B164**.
- **Reaches payload:** no, on the analyse-statements path.
- **UI:** never.

`prepareUploadedSourcesForPipeline` does compute `sourceIngestionWarning` and `totalTextLowWarning`. `api/analyse-statements.js` does not put them on the response (no `prep.sourceIngestionWarning` in the JSON). They reach `meta` only on the evidence-skipped fast path (`lib/qc/evidence-skipped-fast-path.mjs`).

### Error when a file cannot be parsed

- **Computed:** extractor warnings + empty text / `unsupported_scanned`. `splitSourcesForResponse` drops those rows.
- **Reaches payload:** yes, as `excludedSources[]` with a reason **code** (`empty_after_extraction`, `extraction_failed`, `no_text_field`, `unsupported_scanned`). Detailed `meta.extraction` warnings and the unused guardrail object do not.
- **UI:** PARTIALLY. Sources drawer lists excluded files via `reasonLabel` in `excludedSourceReason.js` ("No readable text could be extracted", etc.). Not on the finding card. Fatal route exceptions return `meta.fatal` / `extractionQuality: "failed"`; frontend has no read of those keys.

### Intra-source reducer losing candidate

- **Computed:** `applyIntraSourceReducer` — most-serious of unreduced single-pick and locatable span votes. The losing class is the unreduced `sourceMatches[i].classification` when a span outranks it.
- **Reaches payload:** the **loser** is what gets stored, as `stage2SourceFingerprints` (unreduced). The **winner** is folded into `displayVerdict` / `hasConflict` only. There is no pair-level "reducedClassification" field.
- **UI:** fingerprints never shown. The 6 span-only conflict cards on lift-1 are this: badge Conflicting, stored pair class confirmed or partial.

On lift-1 those six also get identical `primaryExcerpt` and `conflictExcerpt` from the span fallback in Stage 4 (`3214646`). That is the path that fills the dedicated field. The 11 B158 cards never enter it because the unreduced match already has a conflicting passage.

### Further discards that fit the claim

- **Stage 2 `explanation` and `periodAssessment`.** Copied onto internal `sourceMatches`. `periodAssessment` does not reach `qcCard`. `explanation` is fed to Stage 5 as `sourceExplanations` then dropped; with `skipCommentary` it never becomes user copy.
- **`conflictExcerpt` on conflict-wins cards.** Stage 4 sets `conflictExcerpt` only when `hasConflict && verdict !== "conflicting"`, or via the span fallback. After conflict-wins, verdict **is** `conflicting`, so the dedicated field stays empty whenever the unreduced match already supplied a conflicting passage. Computed quote goes to `primaryExcerpt` instead. Frontend still would not show `conflictExcerpt` if it were filled.
- **Object `primaryExcerpt` vs string UI.** Assembly emits `{ sourceLabel, passage }`. Citation popover requires a string. `primaryExcerptText` is the string and is unused by the UI. The quote is on the payload and not on the card face.
- **Confirming-only `supportRefIds`.** On a conflict-with-confirmation card, chips would name the confirming source. Chips do not actually render (empty `citationHovers`), so this contradiction is latent on the Review card and live in any consumer that prints `supportRefIds`.
- **Editorial concerns suppressed by the duplication judge.** True craft flags dropped because evidence already said conflict. Logged, not shown.

---

## Q4 The excerpt gap

**Verdict: Claude's 11 is exact on `evidence-pass-lift-1`. No UI consumer reads `conflictExcerpt`. Three backend consumers do.**

Lift-1: **18** cards with `displayVerdict === "conflict"`.

- **11** nonempty `primaryExcerpt`, empty `conflictExcerpt` (**B158**, confirmed).
- **7** both slots filled, and in all 7 the two passages are the same string (span fallback copied one quote into both).
- **0** conflict-only in the dedicated field.
- **0** conflict cards with both slots empty on this run (older runs before span-owned excerpts had 8–23 empty).

The 11 B158 ids, with the primary quote:

1. **`F05:S0`.** "Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint"
2. **`F05:S5`.** "The Company has invested significantly in new composite manufacturing capability during the Bridgepoint ownership period…"
3. **`F15:S2`.** "We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A."
4. **`F17:S9`.** "Embedded rental reversion is estimated at approximately 18% across the portfolio…"
5. **`F18:S0`.** "We recommend an investment of EUR 158 million for a 60% controlling stake in Nordic SaaS Holdings AB…"
6. **`F18:S2`.** "We recommend an investment of EUR 158 million for a 60% controlling stake…"
7. **`F18:S3`.** "The Company currently serves 412 property management companies, not 380 as stated in our initial memo."
8. **`F18:S4`.** "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo."
9. **`F18:S5`.** "The Company employs 167 people as of 28 May, not 142 as stated in our initial memo."
10. **`F18:S8`.** "Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation."
11. **`F19:S2`.** "The realisation of NorTech Industries closed on 19 January 2026… The exit generated gross proceeds of SEK 12.8 billion…"

Mechanism: `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`. For `verdict === "conflicting"`, primary is the first unreduced conflicting match with a passage. `conflictExcerpt` is assigned from matches only when `hasConflict === true && v !== "conflicting"`. Conflict-wins makes those two conditions opposite. Span fallback fills `conflictExcerpt` only when no unreduced conflicting match has a usable passage.

**Who reads `conflictExcerpt` today**

| Consumer | Reads it? |
|---|---|
| Frontend (`brightline-content-engine-frontend`) | **No.** Zero hits for `conflictExcerpt` |
| Stage 5 commentary prompt | Yes (`stage5-generate-commentary.mjs`) |
| `statementIsSilent` / `STRUCTURAL_TESTS` | Yes (`conflictExcerpt_nonempty` in `lib/revise-actions/silence.mjs`) |
| Suggest / reviser prompt | Yes (`extractConflictExcerptPassage` in `lib/build-revision-prompt.mjs`, after conflicting `supportSpans`) |

Filling the dedicated field without a UI change would not put a second quote on the Review card. It would change silence tests and Stage 5 prompts.

---

## Q5 Backlog status

**Verdict: both rows are still open as written. None of B153's wording pass has shipped. None of B156's fifth display state has shipped. One cited line-number in B156 is stale; the discard it describes is not.**

### B153 — quoted from `docs/BACKLOG.md`

> **WORDING PASS owns these structural labels together.** Carved out of the freeze: proposed-sentence caption, header pill, Save count (`Save with no changes` / `Save with 1 change` / `Save with N changes`), `Expand all`, `Collapse all`, `Proposed change pending`. `Bulk accept` and `Bulk reject` stay wrong until that pass. Also owns the acknowledgement copy on a conflict-free partial: `silence_no_edit` (`lib/revise-actions/sort.mjs` L13-14) asserts that no supplied source speaks to the claim, either way. That line fires on every conflict-free partial (`statementIsSilent`: evidence gap and no structural conflict signal), so it is wrong on honest partials too, sitting directly under a Partially confirmed badge. Systematic, not occasional. Do not fix in this filing. Standard: `ai/AI_OPERATING_MANUAL.md` QC Output Language Standard. Sequenced after the Review group (**B155**, **B154**); operator ranking 2026-09-02.

**In code today (not a fix):** those strings still exist.

- `PROPOSED_SENTENCE_CAPTION = "the sentence if this change is made"` — `actionListDisplay.js`
- Save count — `saveButtonLabel` in `actionListDecisions.js` (`Save with no changes` / `Save with 1 change` / `Save with N changes`)
- `EXPAND_ALL_LABEL` / `COLLAPSE_ALL_LABEL` / `PROPOSED_CHANGE_PENDING`
- `Bulk accept` / `Bulk reject` still those words in `StatementAnalysisPanel.jsx`
- `NO_PROPOSAL.silence_no_edit` is still: "No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours." (`sort.mjs` L13-14, as cited)
- `statementIsSilent` still returns true for every evidence-gap card with no structural conflict signal, and `supported_partial` is an evidence gap (`silence.mjs`)

B155 shipped `first_person_unnamed` in the same `NO_PROPOSAL` object. That is a different row. It is not B153.

### B156 — quoted from `docs/BACKLOG.md`

> **OPEN. Scoped 2026-09-03. Not built.** Fifth evidence **display** state: a source spoke and gave a different period or value. Not a conflict. Do not present as one. Stage 2 classification stays `no_support`. Do not move `applyPeriodGateBackstop`. Do not change the Stage 2 pin. Copy `preBackstopClassification` and `periodAssessment` onto the public card (today they die at `lib/qc/pipeline-v4/index.mjs` L364-377). Stage 4 should still emit the competing excerpt. Stage 5 must not say no source addresses. Unlock of Implement Changes is a **later slice** and needs an exact-quote locator (29 August rails: only the source's stated value, only the addressed element, never a surrounding rewrite, no proposal if it cannot be quoted exactly). Wording is Ben's; fifth freeze carve-out on **B153**, not invented here. Hash-pinned R10 blast scores `classification`, not `displayVerdict`.

**In code today:**

- No fifth `displayVerdict`. Frontend labels are still four (`displayVerdictLabels.js`).
- `applyPeriodGateBackstop` is unmoved. Stage 2 pin unmoved.
- `preBackstopClassification` is still computed in `stage2-match-sources.mjs` and still omitted from the `sourceMatches` copy in `pipeline-v4/index.mjs`. It does not reach `qcCard`.
- `periodAssessment` **is** copied onto internal `sourceMatches` (B156's L364-377 now sit on the widened-await block; the citation is stale). It is **not** copied onto `stage2SourceFingerprints` / the public card, and `analyse-statements.js` does not return `stage2`.
- Stage 4 still sets `primaryExcerpt` null for `not_supported`, so a period-gated pair does not keep its competing excerpt on the card.
- Implement Changes unlock is still the later slice.

---

## Q6 Rank

**Verdict: the smallest user-visible win is to stop calling conflict-free partials silent. The change most likely to break other machinery is a fifth `displayVerdict`.**

**Most contradiction removed per line of diff.** Narrow `statementIsSilent` so `supported_partial` / `displayVerdict === "supported_partial"` is not treated as silence, or stop mapping that path to `silence_no_edit`. Every conflict-free partial currently gets "No supplied source speaks to this claim, either way" under a Partially confirmed badge (**B153**). That is copy the user already reads. The stored-card B158 hole is not that: the UI never paints `conflictExcerpt`, and it does not unwrap object `primaryExcerpt` onto the card face, so filling the dedicated field would not by itself remove a visible contradiction. Unwrapping `primaryExcerpt.passage` would show quotes, including on conflict cards, but that is a display bugfix of a type mismatch, not the self-contradicting sentence.

**Most likely to break something else.** **B156** fifth display state. `displayVerdict` is the join key for the accuracy scorer, the workbench filters, card tint, skipped-evidence tests, and `isEvidenceGap` / silence. Adding a fifth enum while Stage 2 `classification` stays `no_support` (as scoped) means every consumer that treats `not_supported` as "nothing spoke" must be taught the new value. Miss one and you get a new self-contradiction (badge says "different period", filter still files it as no-support, silence copy still fires). The row itself says the R10 blast scores `classification`, not `displayVerdict` — that split is load-bearing. Filling `conflictExcerpt` on conflict-wins cards is the next-riskiest small change: it would flip `conflictExcerpt_nonempty` on the 11 B158 cards and duplicate the same quote on the 7 span-owned cards, which changes silence and Stage 5 prompts without a UI gain.

Do not fold B158 into B147. Do not move the period gate to "fix" silence copy.

---

## Claim check (Claude's two sentences)

**"What fails the trust bar is not wrong verdicts but cards that contradict themselves."** Half right on this pack. The three asked self-contradiction shapes are **absent** from stored cards. Wrong-verdict work is a separate track (corpus). What this pack does show is layout and fingerprint disagreement on conflict cards (11 + 6), plus a live wording contradiction on partials that these cards do not store. Trust-bar failure from silent-verdict-plus-quote is **not** evidenced here.

**"This product repeatedly computes something true and then discards it before the user sees it."** Confirmed as a pattern. Period-gate pre-class, reducer winner-at-pair-level, guardrail, ingestion warnings, `conflictExcerpt` on conflict-wins, object excerpt vs string UI, duplication-judge drops. Several of those are already filed (**B156**, **B158**, **B164**).

---

## Technical summary

Read-only pass over `assembleCard`, `api/analyse-statements.js`, Stage 4 excerpt selection, the intra-source reducer, `computeGuardrailForSource`, frontend `StatementReviewCard` / `displayVerdictLabels` / `silence.mjs`, and stored `runs/evidence-pass-lift-1/cards.json` (plus sibling runs). No code changes except this file. B158 count is 11 on that run. The three requested on-card contradiction shapes are zero in the stored artifacts because not_supported cards carry no quotes, commentary was skipped, and proposals are not on these cards. `conflictExcerpt` has no frontend reader.

## Plain-language summary

Reviewers already see a Partially confirmed badge sitting above a sentence that says no source spoke; that wording is still live and was not in the stored accuracy cards. The dedicated conflict-quote slot is empty on 11 conflict cards, but the Review screen does not read that slot today, so filling it would not by itself change what a reviewer looks at. This pass billed nothing.
