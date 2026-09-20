# Architecture

How the QC pipeline runs after the v4 rebuild, as of 2026-09-20. Cursor reads this before a spec that touches Review. It is the pipeline contract, not the sprint board. For status and backlog see `docs/ROADMAP.md` and `docs/BACKLOG.md`. Last audit: `docs/DOC_TRUTH_AUDIT.md`.

High-level flow: uploaded sources plus draft text go through pipeline stages to one qcCard per sentence-level statement. The frontend renders that contract. It does not re-derive evidence verdicts.

---

## 1. Pipeline stages (v4)

The v4 route (`lib/qc/pipeline-v4/`) runs seven logical stages. QC LLM stages use the pinned snapshot in `lib/qc/model-config.mjs` (`gpt-4o-2024-08-06`) at temperature 0. Do not spec a floating `gpt-4o` alias.

| Stage | Purpose | LLM or deterministic | Frequency | Output shape |
|-------|---------|----------------------|-----------|--------------|
| **1 Statement extraction** | Split the draft into sentence-level statements with character offsets. | LLM, deterministic fallback if validation fails | Once per QC run | `{ text, charStart, charEnd, index }` plus `source` (llm or fallback), `errors`, and `droppedNonClaims` (text, offsets, reason) for sentences the model marked not-a-claim. The split is unchanged. Coverage after the split names remaining uncovered runs on `meta.draftCoverage` (**B249**). Residual: **B248** is one instance of that class. |
| **1b Claim-span extraction (B53a)** | For sentences that pass a deterministic compound pre-filter, extract internal claim spans (verbatim contiguous substrings of the parent). Failed validation reverts undecomposed. Flag `QC_CLAIM_SPANS` (default ON). | Deterministic pre-filter plus batched LLM; all-or-nothing code validation | Once per QC run, one batched call, up to 12 candidate sentences | Per decomposed sentence: 2-3 `{ text, localStart, localEnd, draftStart, draftEnd }`. Caps: 3 claims per sentence, 12 decomposed sentences per run (`claim-spans.mjs`). |
| **2 Source matching** | For each statement (and, when decomposed, each claim), ask each uploaded source whether the text is supported, partially supported, contradicted, or not addressed. | LLM | Once per statement x source pair (plus claim x source when 1b decomposed) | `{ statementIndex, sourceIndex, classification, passage, explanation, systemFingerprint }`. Classifications: `confirmed`, `partially_confirmed`, `conflicting`, `no_support`, `not_reviewed`. Cap `STAGE2_CONCURRENCY` (24). Every request sends `seed=1`. A throw or schema fail stamps `not_reviewed` and continues (**B250**). A passage the matcher cannot re-locate is emptied; the classification is kept (**B251**). |
| **3 Verdict aggregation** | Combine pair classifications into one evidence verdict, then optional B53a upgrade-only rollup. Each pair is first reduced to the most serious of its single-pick classification and every locatable widened `supportSpan` (conflicting, then partially_confirmed, then confirmed, then not_supported). `not_reviewed` pairs are non-voters. Widened passages are not extra Stage 3 voters. | Deterministic | Once per statement | `{ verdict, hasConflict, contributingSourceIndices }`. Precedence: any `conflicting` then conflicting; else any `confirmed` then confirmed; else any `partially_confirmed` then partial; else `not_supported`. If every pair is `not_reviewed`, the card is `not_reviewed`. `hasConflict` is true if any reduced pair is `conflicting`. Upgrade-only rollup (flag ON): if base is `partially_confirmed`, every claim is `confirmed`, no unclaimed verifiable anchor remains, and no whole-sentence source returned `conflicting`, verdict becomes `confirmed`. Claim spans may never downgrade a verdict, alter `hasConflict`, or override a sentence-level conflict. Supersession can demote a pair before this step. Coverage-union can promote a partial to confirmed only when `QC_MULTISOURCE_COVERAGE` is on (default OFF). |
| **4 Excerpt selection** | Pick which source passages appear on the QC card. | Deterministic | Once per statement | Stage 4 still builds excerpt objects with `passage` and `sourceLabel`. Assembly writes `primaryExcerpt` as a passage string or null, and only when a `supportSpan` locates that passage (**B259**). `conflictExcerpt` is still an object. Residual: some conflict cards carry the quote only in `primaryExcerpt` with `conflictExcerpt` empty (**B158**). |
| **5 Commentary generation** | Reviewer-facing prose explaining the evidence finding, not the verdict. | LLM | Once per statement | Success: prose on `evidenceSummary` / `reasoningParagraph`. Miss: empty strings plus `commentaryNotReviewed: true`. A miss is not a finding (**B254**). Pooled at `STAGE5_CONCURRENCY` 24. |
| **6 Editorial+Style and Compliance** | Apply rulebook-driven craft and regulatory concerns. Evaluation scope is the current statement. The editorial user payload still includes CONTEXT BEFORE / AFTER and the full draft marked `[REVIEW THIS]`. Those are different facts. Do not cite "current statement only" as a cost claim. | LLM, two calls per statement (combined Editorial+Style, Compliance separate) | Once per statement | `editorialVerdict`, `editorialConcerns[]`, `complianceVerdict`, `complianceConcerns[]`, notes, direction/rewrite. Optional `span` (R5.1). Pooled at `STAGE6_CONCURRENCY` 4, so peak in-flight is 8. A 429 exhausts retries and stamps honest `not_reviewed` (**B268**). |
| **7 Card assembly** | Merge evidence, commentary, and review results into the qcCard contract. | Deterministic | Once per statement | Shared assembler `lib/qc/pipeline-v3/stage7-assemble-card.mjs`. When editorial or compliance is off, the payload stamps `not_reviewed` (**B247**). An unlocatable primary excerpt is stored as null with `excerptNotLocatable: true` (**B259**, **B251**). |

Execution in `runPipelineV4`: Stage 1, then 1b when the flag is on, then Stage 2, then the widened matcher, then Stage 3 (and supersession / coverage-union), then Stage 6, then Stage 5, then Stage 7. Stage numbers follow the architecture spec (evidence block first, then commentary, then craft/compliance), not wall-clock order.

Stage 1b pre-filter (all required): two or more verifiable anchors (number, date, or Title-Case name); an additive coordinating boundary (`, and `, `, with `, `, while `, `, including `, `; `, ` as well as `); no relational connective (`driven by`, `because`, `up from`, and the rest, word-boundary match). The batched LLM must return verbatim contiguous substrings. Validation uses the same substring / Levenshtein-<=2 locate standard as Stage 1. Each claim must also contain a verifiable anchor (B64). Any failure reverts that sentence undecomposed.

Why the Stage 3 rollup is upgrade-only: decomposition is lossy. A sentence can assert a relation that lives in the connective. Whole-sentence Stage 2/3 stays authoritative.

Function cap: `vercel.json` `api/*.js` `maxDuration` 300 (**B263**). Extraction timeout tracks that cap (**B267**). `callLLM` retries 429 with the server delay, 4 attempts, 2000 ms cap (**B266**).

---

## 2. Core principles

### LLM-last

Deterministic code is the referee. The LLM is the commentator, and in Stages 2 and 6 the classifier inside a fixed rubric.

- Evidence verdict (Stage 3) and display fields (`supportState`, `displayVerdict`, `concernLevel`) are computed in code from Stage 2 classifications. Commentary cannot change the verdict.
- A failed commentary call does not downgrade a `confirmed` or upgrade a `not_supported`.
- For Editorial and Compliance, the model flags concerns and quotes phrases. It does not return character offsets. Spans are derived in code. See section 4.

### Three-signal separation

Evidence, Editorial+Style, and Compliance are separate LLM calls with separate prompts and rulebooks.

- Different cognitive frames do not share a prompt. R3.1 merged Style into Editorial on v4 because both are craft. Compliance stayed separate.
- Do not merge Compliance to save money. B99 already shows sibling draft text misattributes concerns. The 2026-05 "~$0.02/run" figure is not the live cost. On a real memo, Stage 6 was most of the Langfuse bill. The product rule is still: keep Compliance separate.

### Conflicts always surface

Stage 3 is conflict-wins. If any reduced pair is `conflicting`, the card verdict is `conflicting` and `hasConflict` is true. A confirming source does not outrank a contradicting one. Residual excerpt layout: **B158**.

### Deterministic verdicts

Same draft plus same sources should yield the same aggregated evidence verdict given fixed Stage 2 outputs. Temperature 0 on QC LLM stages. Run-to-run variance on Editorial concerns at temp 0 is a known API property. Flag `QC_LLM_CACHE` (default ON; set `0`/`false`/`off` to disable) replays Stages 1, 1b, and 2 from a process-local LRU. Production does not set `QC_LLM_CACHE_DISK`, so the store is memory only and dies on cold start. Neither mode closes residual `hasConflict` drift (**B61**). Stage 5 and Stage 6 are not in that cache.

### No extra cards from decomposition

One sentence is one QC card. The legacy pipeline split sentences into subclaims and produced multiple cards. v4 does not. Claim spans never create additional cards.

### Backend authority

The backend produces the qcCard JSON contract. The frontend renders badges, borders, and copy from those fields. It does not re-derive evidence verdicts, re-run rules, or reinterpret concern severity.

---

## 3. Three-signal framework

### Evidence (Stages 1-5 plus assembly)

| | |
|---|---|
| Evaluates | Whether each statement is supported, partially supported, contradicted, or not addressed by uploaded sources. |
| Does not evaluate | Writing quality, regulatory framing, or marketing register. |
| qcCard fields | `supportState`, `displayVerdict`, `concernLevel`, `hasConflict`, `statement`, `charStart` / `charEnd`, `draftSpan`, `primaryExcerpt` (string or null), `conflictExcerpt` (object or null), `evidenceSummary`, `reasoningParagraph`, `commentaryNotReviewed`, `supportRefIds`, `supportRefTitles`, `hasRealExcerpt`, `supportSpans`. When claim spans ran: additive `decomposed`, `claimUpgrade`, `claims[]` (frontend does not read these; verdict still flows through `displayVerdict` / `supportState`). |
| Interaction | R6.3 (v4 only): when evidence verdict is `conflicting`, editorial concerns that duplicate the Evidence-conflict finding are dropped at card assembly via a gpt-4o-mini judgment (`lib/qc/editorial-duplication-judge.mjs`). The judge runs only on `conflicting`. Errs toward keeping. Canary: `editorial_concern_suppressed_by_judgment`. Editorial and Compliance on the same promotional phrase may both appear. Intentional. |

### Editorial+Style (Stage 6, combined on v4)

| | |
|---|---|
| Evaluates | Craft, per `lib/rulebook/editorialRules.js` and `lib/rulebook/styleGuide.js`. House voice is one table: `lib/prompt-library/house-voice.mjs`. |
| Does not evaluate | Source-by-source factual matching, or fund-marketing regulatory rules. |
| qcCard fields | `editorialVerdict`, `editorialConcerns[]`, `editorialNote`, `editorialSuggestedDirection`, `editorialSuggestedRewrite`. |
| Interaction | Subject to R6.3 on conflicting evidence. Otherwise independent of Compliance. |

A requested editorial check that does not complete is `editorialVerdict: "not_reviewed"`. A genuine clean note is `No editorial or style concerns identified under the listed rules.` Style rules with a structurally checkable property have a deterministic backstop in `STYLE_RULE_DETERMINISTIC_FILTERS`.

### Compliance (Stage 6, separate call)

| | |
|---|---|
| Evaluates | Regulatory and disclosure risk, per `lib/rulebook/complianceRules.js`, filtered by output type and visibility. |
| Does not evaluate | Whether a source confirms a number, or whether a sentence is clumsy. |
| qcCard fields | `complianceVerdict`, `complianceConcerns[]`, `complianceNote`, `complianceSuggestedDirection`, `complianceSuggestedRewrite`. |
| Interaction | Independent of Editorial except shared sentence text. Visibility (section 5) changes which rules are in the prompt. |

Concern list shape: `concernCode`, `note`, `category`. Optional: `suggestedDirection`, `suggestedRewrite`, `concernText`, `span: { startChar, endChar, source }`.

---

## 4. Span derivation (R5.1)

Spans tell the UI which phrase in the statement a concern refers to, without asking the model for character positions.

1. The LLM writes concerns with quoted phrases in `note` and/or `suggestedDirection`.
2. Code runs `extractQuotedSnippets` (same parser as the compliance fidelity gate) on those fields.
3. For each quoted phrase (length >= 4), code searches `statementText` case-insensitively and takes the earliest match.
4. On success, the concern gains `span: { startChar, endChar, source }` where `source` is `note_quote` or `direction_quote`.

The LLM is never asked for offsets. Statement-level concerns, and concerns with no quote, are valid without a span. Reserved `source: "code_match"` is not implemented. v3 path does not attach spans. Coverage figures from early dogfooding are not current; canaries `editorial_concern_span_coverage` and `compliance_concern_span_coverage` still fire.

---

## 5. Visibility calibration (R4.3)

QC runs carry required version: Complete or Public. This drives which rules appear in Stage 6 prompts.

### Complete (NDA-bound, existing-investor audience)

- Standard threshold on existing rules.
- Compliance rules omitted because they only apply to Public:
  - `precise_confidential_detail_in_public_version`
  - `named_individual_attribution_in_public_content`
- Editorial+Style: borderline promotional or hedging language may be allowed when substance is accurate.

### Public (wider, non-NDA audience)

- Stricter calibration in Editorial+Style and Compliance system prompts.
- Additional Compliance rules engaged: `precise_confidential_detail_in_public_version`, `expected_disclosure_language_absent_on_public`.
- Editorial rule with version-aware calibration: `jargon_outside_audience_competence`.

Implemented via `appliesToVersion` on rulebook entries and `filterRulesForRun` in `lib/qc/editorial-compliance-reviewer.mjs`.

---

## 6. What v2 dropped

- Subclaim atomisation (multiple QC cards per sentence). Internal claim spans exist. They do not create extra cards.
- Component-level deterministic matching as primary evidence logic.
- Role compatibility gates.
- Numeric tuple authorisation.
- Excerpt quality gates as verdict drivers.
- Binding diagnostics.
- Multi-candidate classification with opaque precedence.

Evidence quality now flows: Stage 2 LLM rubric, Stage 3 aggregation, Stage 4 excerpt pick, Stage 5 explanation.

---

## 7. What v4 kept from v3

- LLM-based statement splitting with deterministic validation fallback (Stage 1).
- Three-signal review framework, with Style merged into Editorial on v4 only.
- qcCard as the frontend contract. The shape has grown. New fields are additive.
- Regression suite (`scripts/run_qc_regression.mjs`, `npm run qc:test`).
- Product plumbing: version history, export (PDF/DOCX), banned words.

---

## 8. Pipeline routing

| Mechanism | Behaviour |
|-----------|-----------|
| `QC_PIPELINE_V4=1` | Selects v4 (`runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`). |
| Unset or other | Falls back to legacy v3 (`lib/qc/pipeline-v3/`). |
| Request body | `options.pipelineRoute === "v4"` also selects v4. |

Production is configured to run v4. v3 remains in the tree as the unset-env fallback and is still statically imported on every Review request. `qcCard.pipelineVersion` is stamped from the route `assembleCard` runs under.

R4.2 (remove v3) is parked. Handler logs `[handler] route selected: v4|v3` and does not print the env var.

---

## 9. Persistence

Neon Postgres in AWS Europe Central 1 (Frankfurt), matching Vercel `fra1`. Repo docs say Postgres 18.

`review_state` is an autosave buffer, not an audit record. One row per `review_id`, opaque JSON `state`, plus `owner_key`. Overwriting the row is correct. API: GET / POST / DELETE `/api/review-state`.

`reviewer_decisions` is append-only (**B186**). First kinds: `source_governance` and `source_override`. Changing a ruling appends a new row. There is no update or delete path. POST / GET `/api/reviewer-decisions`. Missing database returns 503 and Review continues. Per-finding accept/reject is still not recorded. That is still B9.

`owner_key` (`x-owner-key` header) stops one browser reading another browser's row. It is not authentication.

Pooled `DATABASE_URL` for routes. Unpooled `DATABASE_URL_UNPOOLED` for migrations (`npm run db:migrate`).

---

## Related documents

| Document | Role |
|----------|------|
| `docs/ROADMAP.md` | Sprint status, watches, backlog of sequencing. Not the pipeline contract. |
| `docs/BACKLOG.md` | Open work, standing rules, closed rows. |
| `docs/ROADMAP.md` Review Correctness Principles | Evidence invariants. Principle 6 (draft-vs-draft out of scope) is current code and sits next to **Pr16**, which is not built. Principle 7 (explain, do not rewrite) does not describe Implement Changes or `suggestedRewrite`. |
| `docs/SPEND_LEDGER.md` | Named USD. Use this, not a baseline paragraph. |
| `ai/AI_OPERATING_MANUAL.md` | How Cursor works on this codebase. |
| `ai/SPEC_TEMPLATE.md` | Spec form in use. |
