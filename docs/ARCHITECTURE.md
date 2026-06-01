# Architecture

Reference for how the Brightline Content Engine QC pipeline is designed after the v4 rebuild (R2–R5). Written for new contributors and new chat sessions — not a file-by-file map. For sprint status and backlog, see `docs/ROADMAP.md`.

**High-level flow:** uploaded sources + draft text → pipeline stages → one **qcCard** per sentence-level statement → frontend QC Workbench (no re-interpretation of verdicts on the client).

---

## 1. Pipeline stages (v4)

The v4 route (`lib/qc/pipeline-v4/`) runs seven logical stages. Unless noted, LLM stages use **gpt-4o** at **temperature 0** (`lib/qc/model-config.mjs`).

| Stage | Purpose | LLM or deterministic | Frequency | Output shape (informal) |
|-------|---------|----------------------|-----------|-------------------------|
| **1 — Statement extraction** | Split the draft into sentence-level statements reviewers can work with, with character offsets into the draft. | **LLM** (deterministic fallback if extraction fails validation) | **Once per QC run** | List of `{ text, charStart, charEnd, index }` plus metadata (`source`: llm \| fallback, `errors`). |
| **2 — Source matching** | For each statement, ask each uploaded source whether the statement is supported, partially supported, contradicted, or not addressed. | **LLM** | **Once per statement × source pair** | Per pair: `{ statementIndex, sourceIndex, classification, passage, explanation }`. Classifications: `confirmed`, `partially_confirmed`, `conflicting`, `no_support`. |
| **3 — Verdict aggregation** | Combine all source-level classifications for one statement into a single evidence verdict. | **Deterministic** | **Once per statement** | `{ verdict, hasConflict, contributingSourceIndices }`. Precedence: any `confirmed` → confirmed; else any `conflicting` → conflicting; else any `partially_confirmed` → partial; else `not_supported`. `hasConflict` is true if any source returned `conflicting`. |
| **4 — Excerpt selection** | Pick which source passages appear on the QC card for the reviewer. | **Deterministic** | **Once per statement** | `{ primaryExcerpt, conflictExcerpt }` — each excerpt has `passage`, `sourceLabel`, etc. Conflict excerpts are retained even when another source confirms the statement. |
| **5 — Commentary generation** | Produce reviewer-facing prose explaining the evidence finding (not the verdict itself). | **LLM** | **Once per statement** | `{ commentary }` — plain-language summary stored on the card as `evidenceSummary` / `reasoningParagraph`. |
| **6 — Editorial+Style and Compliance review** | Apply rulebook-driven craft and regulatory concerns to the **current statement only**. | **LLM** (two parallel calls per statement on v4) | **Once per statement** (Editorial+Style **one** combined call; Compliance **separate**) | Partial qcCard fields: `editorialVerdict`, `editorialConcerns[]`, `complianceVerdict`, `complianceConcerns[]`, notes, suggested direction/rewrite. Each concern: `{ concernCode, note, category, … }`; v4 may add optional `span` (R5.1). |
| **7 — Card assembly** | Merge evidence, commentary, and review results into the stable **qcCard** contract the frontend already expects. | **Deterministic** | **Once per statement** | Full qcCard object (index, statement, spans, evidence fields, editorial/compliance fields, display mappings). |

**Execution note:** In `runPipelineV4`, Stage 6 (editorial/compliance) runs before Stage 5 (commentary) for each statement, then Stage 7 assembles everything. Stage numbers follow the architecture spec (evidence block first, then human-facing commentary, then craft/compliance).

**Example (one statement):** Draft sentence *"Revenue grew 12% year on year."* Stage 2 might return `partially_confirmed` from an annual report (growth mentioned but period unclear) and `no_support` from a second source. Stage 3 yields `partially_confirmed`. Stage 5 explains the gap in plain language. Stage 6 might flag a style rule on phrasing and a compliance rule on missing gross/net qualifier — independent of the evidence verdict.

---

## 2. Core principles

### LLM-last

Deterministic code is the **referee**; the LLM is the **commentator** (and, in Stages 2 and 6, the **classifier** within fixed rubrics).

- **Evidence verdict** (Stage 3) and **display fields** (`supportState`, `displayVerdict`, `concernLevel`) are computed in code from Stage 2 classifications. Commentary (Stage 5) cannot change the verdict.
- A failed or empty commentary generation does **not** downgrade a correct `confirmed` or upgrade a `not_supported`.
- For Editorial and Compliance, the model flags concerns and quotes phrases in prose; it does **not** return character offsets. **Spans** (where in the sentence a concern applies) are derived in code from those quotes — see [§4 Span derivation](#4-span-derivation-r51).

### Three-signal separation

**Evidence**, **Editorial+Style**, and **Compliance** are separate LLM calls with separate prompts and rulebooks.

- Different cognitive frames (source risk vs writing craft vs regulatory risk) do not share a single prompt.
- Marginal cost saving from merging Compliance into Editorial was judged **not worth signal dilution** (~$0.02/run in planning estimates).
- **R3.1** merged **Style + Editorial** on v4 into one call (`runEditorialStyleReview`) because both are writing-craft judgments. **Compliance stayed separate.**

### Conflicts always surface

If any source returns `conflicting` for a statement, `hasConflict` is true and conflict excerpts are available on the card — even when another source `confirmed` the same sentence. The reviewer sees both signals and decides materiality. Nothing in the pipeline suppresses a conflict because a confirming source exists.

### Deterministic verdicts

Same draft + same sources → same aggregated evidence verdict on repeated runs. Temperature **0** on all QC LLM stages. (Run-to-run variance on Editorial concerns at temp 0 is a known LLM API property; evidence aggregation itself is deterministic given fixed Stage 2 outputs.)

### No subclaim atomisation

**One sentence = one QC card.** The legacy pipeline split sentences into subclaims and produced multiple cards per sentence. v4 does not. Stage 2 assesses each fact within the sentence against each source; Stage 3 returns the **weakest** classification across sources (with the precedence rules above). A long sentence with one weak link can still yield `partially_confirmed` or `not_supported` for the whole card.

### Backend authority

The backend produces the **qcCard** JSON contract. The frontend renders badges, borders, and copy from those fields — it does not re-derive evidence verdicts, re-run rules, or reinterpret concern severity.

---

## 3. Three-signal framework

### Evidence (Stages 1–5 + assembly)

| | |
|---|---|
| **Evaluates** | Whether each statement is supported, partially supported, contradicted, or not addressed by uploaded sources. |
| **Does not evaluate** | Writing quality, regulatory framing, or marketing register — delegated to Editorial+Style and Compliance. |
| **qcCard fields** | `supportState`, `displayVerdict`, `concernLevel`, `hasConflict`, `statement`, `charStart` / `charEnd`, `draftSpan`, `primaryExcerpt`, `conflictExcerpt`, `evidenceSummary`, `reasoningParagraph`, `supportRefIds`, `supportRefTitles`, `hasRealExcerpt`, and related excerpt metadata. |
| **Interaction with other signals** | **R6.3 (v4 only):** When evidence verdict is `conflicting`, editorial concerns that duplicate the Evidence-conflict finding are dropped at card assembly via a gpt-4o-mini judgment call (`lib/qc/editorial-duplication-judge.mjs`). The judge runs only when Evidence verdict is `conflicting`. Errs toward keeping concerns when duplication is unclear. Tracked via Langfuse canary `editorial_concern_suppressed_by_judgment`. Editorial and Compliance concerns on the same promotional phrase may both appear — intentional (craft vs regulatory). |

### Editorial+Style (Stage 6, combined on v4)

| | |
|---|---|
| **Evaluates** | Craft: clarity, structure, register, overreach relative to evidence shown, narrative coherence (with adjacent context), style-guide mechanics, marketing language, audience-appropriate jargon — per rules in `lib/rulebook/editorialRules.js` and `lib/rulebook/styleGuide.js`. |
| **Does not evaluate** | Source-by-source factual matching (Evidence) or fund-marketing regulatory rules (Compliance). |
| **qcCard fields** | `editorialVerdict`, `editorialConcerns[]`, `editorialNote`, `editorialSuggestedDirection`, `editorialSuggestedRewrite`. |
| **Interaction** | Subject to R6.3 principle-based suppression on conflicting evidence (above). Otherwise independent of Compliance; overlap on promotional language is accepted unless product feedback says otherwise. |

### Compliance (Stage 6, separate call)

| | |
|---|---|
| **Evaluates** | Regulatory and disclosure risk: promissory language, forward-looking qualifiers, gross/net on returns, material omission, selective presentation, public-version confidential detail, missing disclosure language — per `lib/rulebook/complianceRules.js`, filtered by output type and visibility. |
| **Does not evaluate** | Whether a source passage confirms a number (Evidence) or whether a sentence is clumsy (Editorial+Style). |
| **qcCard fields** | `complianceVerdict`, `complianceConcerns[]`, `complianceNote`, `complianceSuggestedDirection`, `complianceSuggestedRewrite`. |
| **Interaction** | Independent of Editorial except shared sentence text. Visibility (R4.3) changes which rules are in the prompt — see [§5](#5-visibility-calibration-r43). |

**Concern list shape (Editorial and Compliance):** Each item includes at least `concernCode`, `note`, and `category`. Optional: `suggestedDirection`, `suggestedRewrite`, `concernText`. On v4, optional `span: { startChar, endChar, source }` when R5.1 derivation succeeds.

**2026-06-01 diagnostic + comments review:** A class of **rule bugs** (wrong or un-actionable outputs — inverted `date_format`, `thousand_separator` scoping, and related style-guide failures) and **commentary-register issues** (Stage 5 / concern prose meta-phrasing such as references to "the excerpt") are now scheduled in `docs/ROADMAP.md` under **Near-term — Review output** (**COMMENTARY CALIBRATION**, **EDITORIAL RULE BUG-FIX PASS**, **EDITORIAL SCHEMA-FALLBACK**, **SOURCE-PUBLIC-STATE AWARENESS**). These are prompt/rulebook calibration items, not changes to the three-signal contract above.

---

## 4. Span derivation (R5.1)

Spans tell the UI **which phrase** in the statement a concern refers to, without asking the model for character positions.

1. The LLM writes concerns with **quoted phrases** in `note` and/or `suggestedDirection` (existing prompt habit).
2. Code runs `extractQuotedSnippets` (same parser as the compliance **fidelity gate**) on those fields.
3. For each quoted phrase (length ≥ 4 characters), code searches `statementText` case-insensitively and takes the **earliest** match.
4. On success, the concern gains `span: { startChar, endChar, source }` where `source` is `note_quote` or `direction_quote`.

**The LLM is never asked for offsets.** Offset reliability from models is poor; quoting prose is reliable enough to locate text deterministically.

**Valid without a span:** Statement-level concerns, or concerns where the model did not quote the triggering phrase. Downstream work (R5.2 merge, R5.4 highlight) must handle missing `span` gracefully.

**Reserved:** `source: "code_match"` (map concern codes to canonical phrases) — not implemented; future follow-up.

**Coverage (early dogfooding):** Editorial ~96%, Compliance ~56% of concerns receive a span; Langfuse canaries `editorial_concern_span_coverage` and `compliance_concern_span_coverage` track this per run. R5.1.1 may tighten Compliance prompts to encourage quoting.

**v3 path:** Spans are **not** attached on the legacy v3 editorial/compliance path.

---

## 5. Visibility calibration (R4.3)

QC runs carry **required version** (visibility): **Complete** or **Public**. This drives which rules appear in Stage 6 prompts and how strict the model is asked to be — not just UI metadata.

### Complete (NDA-bound, existing-investor audience)

- Standard threshold on existing rules.
- **Compliance rules omitted** from the run (not in prompt) because they only apply to Public:
  - `precise_confidential_detail_in_public_version`
  - `named_individual_attribution_in_public_content`
- Editorial+Style system prompt: borderline promotional or hedging language may be allowed when substance is accurate.

### Public (wider, non-NDA audience)

- Stricter calibration in Editorial+Style and Compliance system prompts: forward-looking claims without qualifiers, comparatives without basis, selective hedging, marketing superlatives.
- **Additional Compliance rules engaged:**
  - `precise_confidential_detail_in_public_version` — flags content with the *shape* of confidential detail (specific LP names, fund-level return metrics, valuation multiples, deal terms, etc.) for human confirmation. Example watch case: *"3.2x net of fees"* without an explicit *"MOIC"* label.
  - `expected_disclosure_language_absent_on_public` — investor letter / press release performance or forward-looking content without expected disclaimer language nearby.
- **Editorial rule with version-aware calibration:** `jargon_outside_audience_competence` — on Complete, only deep-insider terms; on Public, any term an outside professional reader might not know.

Rule filtering is implemented via `appliesToVersion` on rulebook entries and `filterRulesForRun` in `lib/qc/editorial-compliance-reviewer.mjs`. Visibility calibration paragraphs are injected into Editorial+Style and Compliance system prompts.

---

## 6. What is removed (legacy v2 pipeline)

The v4 rebuild deliberately dropped mechanisms that added complexity without improving reviewer trust:

- **Subclaim atomisation** — multiple QC cards per sentence.
- **Component-level deterministic matching** — brittle pattern matching as primary evidence logic.
- **Role compatibility gates** — blocking verdicts based on entity roles.
- **Numeric tuple authorisation** — pre-authorising number pairs outside LLM rubric.
- **Excerpt quality gates as verdict drivers** — downgrading verdicts when excerpt retrieval failed.
- **Binding diagnostics** — internal coupling between extraction and binding layers.
- **Multi-candidate classification with precedence rules** — opaque winner selection among competing classifiers.

Evidence quality now flows: Stage 2 LLM rubric → Stage 3 aggregation → Stage 4 excerpt pick → Stage 5 explanation.

---

## 7. What is kept (v3 → v4 rebuild)

- **LLM-based statement splitting** with deterministic validation fallback (Stage 1).
- **Three-signal review framework** (Evidence + Editorial + Compliance), with Style merged into Editorial on v4 only.
- **qcCard contract** — stable shape for frontend; rebuild did not require qcCard field changes for existing UI.
- **Regression suite** (`scripts/run_qc_regression.mjs`, `npm run qc:test`).
- **Product plumbing:** version history, export (PDF/DOCX), banned words (prevention + QC detection).

---

## 8. Pipeline routing

| Mechanism | Behaviour |
|-----------|-----------|
| **`QC_PIPELINE_V4=1`** | Selects v4 rebuild (`runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`). |
| **Unset or other** | Falls back to legacy v3 pipeline (`lib/qc/pipeline-v3/`). |
| **Request body** | `options.pipelineRoute === "v4"` also selects v4 (used by API clients). |

**As of 2026-05-17:** Production and development are configured to run **v4**. v3 remains in the codebase as a fallback during dogfooding.

**qcCard.pipelineVersion:** Stamped from the route `assembleCard` runs under (`assemblyContext.pipelineRoute` → `"v3"` or `"v4"` in `lib/qc/pipeline-v3/stage7-assemble-card.mjs`), so it matches handler `meta.pipelineVersion` on the same response. Fixed 2026-05-31 (`fix-pipelineversion-label`); v3 Stage 7 assembler is still shared by both routes.

**Planned retirement:** **R4.2** — remove v3 route and dual-path editorial code after 15–25 production traces with no canary fires (see `docs/ROADMAP.md`).

**Operational gap:** Route selection should log the resolved env var on every request so a missing `QC_PIPELINE_V4` in local `vercel dev` is obvious (roadmap item).

---

## Related documents

| Document | Role |
|----------|------|
| `docs/ROADMAP.md` | Sprint status, R5 sequence, watches, backlog |
| `docs/BACKLOG.md` | Deferred bugs and polish rows |
| `docs/ROADMAP.md` → Review Correctness Principles | Non-negotiable evidence invariants |
| `ai/AI_OPERATING_MANUAL.md` | How agents should work on this codebase |

---

## Review correctness principles (summary)

Full list lives at the end of `docs/ROADMAP.md`. In short: never claim “not mentioned” without corpus search; never say no sources when sources exist; contradictions are statement-vs-sources only; explain, don’t rewrite in Review; normalise numeric anchors before mismatch.
