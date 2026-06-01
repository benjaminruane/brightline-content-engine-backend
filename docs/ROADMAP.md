# Brightline Content Engine — Master Roadmap

> **Vision:** Enable investment writers to produce, review, and govern institutional-grade content with speed, auditability, and confidence.

Last updated: 2026-06-01 (R2.7.2 ship date corrected; diagnostic re-run 2026-06-01-122541; near-term review-quality work-streams logged)

---

## Working rules

### UI naming

- The app's **UI name** is **Content Engine** (working title). User-visible strings — footers, modals, disclaimers, exports, and other copy shown to reviewers — use **Content Engine** or no product name. **Brightline** does not appear in UI strings.
- **Brightline Content Engine** remains the **internal project name** (repos, roadmap, architecture docs, operator-facing material).

### Production baseline (post-R5)

- **Pipeline:** v4 in production.
- **Cost / call volume:** ~16 LLM calls per run at 4 statements / 1 source; production cost ~$2/run.
- **Current tags:** frontend `v8.53.0-r6.4b-publication-state-ui`; backend `r6.3-principle-based-suppression`.
- **Diagnostic re-run 2026-06-01** (batch `2026-06-01-122541`) confirmed in production that R6.3, R6.4 (incl. R6.4c jurisdiction-scope fix), and R6.5 landed: evidence layer strong (F18 cross-source aggregation resolved; no evidence regressions), editorial noise down, compliance jurisdiction miscalibration fixed. See `docs/diagnostic_rerun_findings_2026-06-01.md`.
- **Next arc:** Review output quality (R6), not further UI structure work.

---

## Completed

### Core Platform
- Generate, Rewrite, Adapt, Ask AI, Version History workflows
- Frontend/backend separation and clean repo naming
- Modularised UI: Draft Output, Sources, Versions, Ask AI, Rewrite panels
- `useDraftState` core hook with in-memory version model
- Auto-scroll, loading states, fade-in animations

### QC Pipeline — Three-Signal Framework
- Evidence QC: deterministic pipeline, statement extraction, evidence binding, support/conflict/unverifiable verdicts
- Editorial review: `gpt-4o`, temp 0 — precision, materiality, narrative coherence, register, overreach, structural integrity, audience calibration, house style
- Compliance review: `gpt-4o`, temp 0 — calibrated to output type and required version
- Parallel execution per statement; all statements parallelised
- Signal strip on each QC card with badges, concern notes, direction
- Worst-signal border logic driving card left border colour
- Review options popup: Evidence, Editorial, Compliance independently toggleable per run
- Pipeline v4 rebuild (R2.1–R3.6.1): ground-up replacement of the v3 evidence pipeline addressing the original Evidence Pipeline Quality Sprint items. Stages 1–5 owned by v4 modules; Editorial+Style consolidated into one call; Compliance separate; rule-based suppression of duplicate editorial concerns on conflicts; PDF source extraction; Visibility wiring; aligned summary blocks and pill logic. Sentence fragmentation, false `not_supported` verdicts, excerpt-quality issues, and subclaim atomisation corruption all resolved by architectural redesign rather than patching v3.

### Output Types & Adaptation
- Four output types: Reporting commentary, Investor letter, Press release, LinkedIn post
- Two required versions: Complete, Public
- Adapt flow: format-aware prompt per target type, direction-aware guidance
- Tabbed presentation of master + adaptations in Draft Output panel
- Version History unified across output types with grouped collapsible sections
- Output type prompt scaffolding: LP salutation, narrative arc, press release structure, LinkedIn first-person voice
- PDF source text extraction in adapt pipeline (`prepareUploadedSourcesForPipeline`)
- Conditional Adapt modal fields: press release quote attribution, LinkedIn post URL
- Required version pre-selection and locking per output type

### Writing Setup
- Event type selection (9 types)
- Banned words: prevention layer (injected into generate/rewrite/QC prompts) + detection layer (QC-stage scan); stored in localStorage
- Banned word highlights rendered as priority layer in Draft Context view
- Deal information fields: Investment name, Program/Mandate/Product name, Reference date, Transaction date — stored in session meta, not injected into prompts

### Version History
- Vertical timeline with LLM-synthesised change labels
- Expandable diffs
- Save draft (local checkpoint) vs Save as new version (formal commit)
- Adapted versions labelled with source version reference
- Version History unified across output types

### Export
- PDF and DOCX export
- Cover/header with output type, required version, word count, date
- Deal metadata in header (non-empty fields only)
- Draft text with meta
- Sources Used section
- Statement Review: verdict, evidence finding, excerpt, editorial note, compliance note — flat mapped, no raw QC objects
- PDF stack overflow resolved via full payload serialisation and footer removal
- Document title derived from session metadata

### Source Management
- LLM-generated source description on upload
- Source type detection (PDF, text, URL)
- Source text extraction pipeline (`lib/extract-text-from-source.mjs`)
- Assess module: paste/upload draft, run QC, reviewer synthesis in senior editor voice
- Reviewer Assessment in Quality Review panel (Writing view), Assess export, config panel aligned with Document Setup
- A10.3 polish - state persistence, layout, scroll, export order, refresh behaviour
- A10.4 - Assess final polish

### Backend Architecture
- LLM-last architecture: verdict, classification, and concern level deterministic; LLM commentary runs after
- `StatementReviewCard`, `statementAnalysisHelpers.js`, `qcWorkbenchFilters.js` extracted
- `qc-v2-pipeline.mjs` split into focused modules

---

## Recently shipped (closed specs)

### Diagnostic harness (closed 26 May 2026)

- **D1.1 — Diagnostic harness build** (closed 2026-05-26). In-process batch runner under `scripts/diagnostic/`; fixtures through v4 pipeline; timestamped `runs/` output.
- **D1.1.1 — Fixture regeneration from disk** (closed 2026-05-26). Inventory and fixture JSONs regenerated from actual `sources/` filenames.
- **D1.2 — JSON copy button restored** (closed 2026-05-26). Frontend `<>` control beside Backend status for ad-hoc QC JSON capture.
- **D1.3 — Populate fixture drafts** (closed 2026-05-26; **superseded by D1.3.2**). Initial load reported v2 drafts but disk state retained v1 content on several fixtures — follow-up required explicit grep verification (see D1.3.2).
- **D1.3.1 — Output type corrections** (closed 2026-05-26). Fixtures 01, 13, 16 set to `reporting_commentary` per v2 expected-outcomes doc.
- **D1.3.2 — V2 drafts into 8 fixtures with verification** (closed 2026-05-26). Fixtures 01, 04, 08, 10, 13, 14, 15, 18 updated; positive-anchor and v1-contaminant grep verification required in summary.

### R6.5 — Two-layer style guide framework (closed 27 May 2026)

- **R6.5 — Two-layer structured style guide live** (closed 2026-05-27). `lib/qc/style-guide.mjs` introduces `STYLE_GUIDE_LAYER_1` (5 universal rules) and `STYLE_GUIDE_LAYER_2_CLIENT` (9 client-specific rules). Editorial reviewer scaffolds prompt from structured rules at call time; Layer 2 overrides Layer 1 by matching rule id with override logging. Diagnostic harness includes per-rule fixtures and `npm run diagnostic:style-guide` for 10-minute rule edit cycles. Tag: `r6.5-style-guide-framework`.

- **R6.5.1 —** `date_format` and `oxford_comma` rule wording tightened; `number_spelling` fixture strengthened. Rule-authoring conventions comment added to `style-guide.mjs` (every rule must state standard, violation, AND explicit non-firing cases).

- **R6.5.2 —** Deterministic backstop framework introduced. New `STYLE_RULE_DETERMINISTIC_FILTERS` registry in `editorial-compliance-reviewer.mjs` (v4 combined editorial+style path only). `oxford_comma` filter drops concerns where the cited span structurally cannot be a three-or-more-item list (no comma + conjunction).

- **R6.5.3 —** `english_variant` deterministic backstop added. Drops concerns where cited span has no detectable British spelling. `US_ALLOWLIST` handles standalone `-ise` words (rise, wise, advise, etc.) as false-British matches.

- **R6.5.4 —** Three more deterministic backstops added: `thousand_separator` (drops when cited span uses apostrophe and no comma), `currency_format` (drops when ISO 4217 code precedes amount), `defined_term_capitalisation` (drops when cited span starts with capitalised defined term).

- **R6.5.5 —** Broadened `thousand_separator` and `currency_format` filters to statement scope (regex runs on full `statementText`, not the LLM-returned span which is often too narrow to contain the structural pattern).

- **R6.5.6 —** `defined_term_capitalisation` made draft-aware. Rule now only applies when the term is defined in the draft (e.g. "Shopify (the Company)"). When no definition exists, the rule is silent. When a definition exists, only genuine violations fire (lowercase noun or omitted "the"); correct mid-sentence "the Company" is suppressed. Tag: `r6.5.6-defined-term-refinement`.

- **F01 live regression validation:** total editorial concerns reduced from 8 (pre-R6.5) to 4 (post-R6.5.6). All remaining concerns are genuine (em-dash, marketing language, first-person plural in reporting commentary).

- **Deterministic filter framework** now covers 5 of the 9 Layer 2 rules. Pattern available for future rules that have a structurally-checkable property.

### R6.4 — Public version compliance (closed 2026-05-31)

R6.4 chapter closed across four sub-items addressing the diagnostic finding on Compliance over-firing on already-public PG content (F02/F03).

**R6.4a — Source publication state inference + Compliance suppression** (closed 2026-05-30, tag `r6.4a.3-restricted-rename` + frontend `v8.53.0-r6.4b-publication-state-ui`). See earlier "Recently shipped" entry for R6.4a/b detail.

**R6.4c — Regulatory rule scope refinement** (closed 2026-05-31, tag `r6.4c-regulatory-rule-scope`). Refined the `description` field of compliance rule `regulatory_prohibited_language` in `lib/rulebook/complianceRules.js` to make fund-vs-portfolio scope explicit. Rule now applies to fund/firm claims (fund performance superlatives, firm-level absolute claims, promissory phrasing) and to language that solicits investment or links portfolio performance to a fund marketing pitch; rule does NOT apply to ordinary portfolio-company descriptive language in transaction releases or operational updates. Jurisdictional variance (SEC, FCA, MAS, BaFin) acknowledged in rule wording; reviewer note added to frame concerns as review prompts rather than determinations. Validated across three test runs (portfolio-company superlative cleared; fund-level superlative caught; solicitation crossover caught).

**R6.4d — Sensitivity-tier calibration** (closed 2026-05-31, no ship). Diagnostic evidence was hypothetical, not observed. Real PG behaviour (F02 IRR/MOIC suppression) confirms current architecture is correct: if content is in a published source, suppression is appropriate by definition (the source has been through compliance review). User can manually override per source via R6.4b pill if stricter handling needed. No new code; closed as non-issue.

### R2.7.2 — Stage 2 semantic frame matching (closed 2026-06-01)

**R2.7.2 — Stage 2 semantic frame matching.** Shipped (`r2.7.2-frame-matching`; production sign-off **2026-06-01** after explicit-vs-explicit gating re-test). Distinguishes numeric equivalence from semantic frame equivalence across metric, basis/scope, and period dimensions. Metric and basis land reliably. **PERIOD is scoped to EXPLICIT-vs-EXPLICIT only:** a deterministic backstop (`applyPeriodGateBackstop`) downgrades `confirmed`→`conflicting` when both statement and source periods normalise to recognised tokens (Q[1-4] YYYY or bare YYYY) and differ. **LIMITATION:** when the source states the period as a **RELATIVE** reference ('over the same period', 'today'), gpt-4o resolves it unreliably at temp 0 — it resolves to whichever period confirms the match — across both prose and structured-field prompt mechanisms. Relative-source-period resolution descoped to **R2.7.2.1**. Mechanism retained: Stage-2-internal structured `periodAssessment` field + deterministic backstop. Verified: explicit mismatch (draft 2018 vs source 2019) → conflicting; explicit match (2019) → supported; metric mismatch (revenue vs GMV) → conflicting; paraphrase regression → confirmed.

**fix-pipelineversion-label** (same session): `qcCard.pipelineVersion` in shared `stage7-assemble-card.mjs` now stamps from `assemblyContext.pipelineRoute` instead of hardcoding `"v3"`, aligning per-card label with handler `meta.pipelineVersion` on v4 runs.

### R6.3 — Principle-based Editorial concern suppression on Evidence conflict (closed 2026-05-31)

Closed 2026-05-31, tag `r6.3-principle-based-suppression`. Replaces R3.4's rule-ID-based suppression list with per-instance semantic judgment via a gpt-4o-mini call at card assembly time.

**Mechanism:** When Evidence verdict is `conflicting` and Editorial has concerns, a small LLM judge (gpt-4o-mini, temp 0, constrained JSON schema) reads the statement, the Evidence-conflict explanation, and the list of Editorial concerns. For each Editorial concern it decides DUPLICATE (the concern materially restates the Evidence finding) or INDEPENDENT (the concern is about register, voice, structure, defined terms, style, or any other dimension unrelated to the factual conflict). Defaults to INDEPENDENT when in doubt. Returns indices of concerns to suppress. Suppressed concerns are dropped from the card; remaining concerns render normally. Editorial verdict recomputes via existing `recomputeV4EditorialVerdictFromConcerns`; if all concerns suppress, Editorial renders Clean.

**Why principle-based not rule-ID:** Rule-ID matching is the wrong granularity. Two concerns from the same rule code on different statements may differ in whether they duplicate the Evidence finding. Per-instance LLM judgment handles per-instance variance; rule-ID matching produces brittle coverage gaps as new rules are added.

**Architecture:** Judge lives in new module `lib/qc/editorial-duplication-judge.mjs`. Suppression branch lives in `stage7-assemble-card.mjs` (replaced R3.4 logic, which is fully removed). Editorial review continues to run in parallel with Evidence — judge is downstream at card-assembly time only. `assembleCard` is now async, ripples to callers `qc-pipeline-v3.mjs` and `pipeline-v4/index.mjs` (await Promise.all).

**Failure mode:** Schema-validation failure after one retry → suppress nothing, emit canary `editorial_duplication_judge_failed`. System errs toward showing the reviewer everything.

**Observability:** Per-suppression canary `editorial_concern_suppressed_by_judgment` emitted via Langfuse `score()` with statementIndex, suppressedRuleId, and truncated concernText.

**Validated:** Three test runs against `r6_4c_test_source.txt`:
- Run 1 (Evidence Conflicting on IRR claim + hyperbole phrasing): judge suppressed the IRR-related Editorial concern (duplicative); kept the "absolutely stellar" hyperbole concern (independent). Editorial count: 1.
- Run 2 (Evidence Supported): judge did not fire. Editorial Clean naturally.
- Run 3 (Evidence Conflicting on IRR alone, no independent issues): judge suppressed all Editorial concerns. Editorial Clean.

Per-instance behaviour confirmed across statements.

- **R5 sequence — COMPLETE** (closed 2026-05-19). R5.1 (span derivation), R5.2 (span-based duplicate merge), R5.3a/b (overlay surface + traffic-light tints), R5.4 (Highlight in draft + concern scroll-and-underline), R5.4.1–R5.4.6 (card→draft navigation polish), R5.5 (disclaimer footer). Bidirectional draft↔card navigation is live. R5.1.2 remains planned separately.
- **R5.4.6 — Concern-click fallback underline** (shipped 2026-05-19). When a concern has no R5.1 spans, the click now blue-underlines the whole statement instead of yellow-highlighting it. Yellow highlighter is reserved exclusively for “Highlight in draft” clicks. Tag: `v8.50.6-concern-fallback-underline`.
- **R5.4.5 — Verdict tints clear during loading** (shipped 2026-05-19). Verdict tints hide when `analysisStatus === "loading"` on re-Review; toggle visual state unchanged.
- **R5.4.4 — Single statement highlight + re-Review clear + toggle link** (shipped 2026-05-19). One yellow statement highlight at a time; highlights clear on re-Review; “Remove highlighting” toggle on active card.
- **R5.4.3 — Highlight visibility under tints + statement/phrase coexistence** (shipped 2026-05-19). CSS cascade fix; split `activeStatementHighlight` / `activePhraseHighlight` state.
- **R5.4.2 — Highlighter-yellow statement visual** (shipped 2026-05-19). Statement highlight uses yellow highlighter background.
- **R5.4.1 — Statement highlight rendering fix + bolder phrase underline** (shipped 2026-05-19). Statement border → overlay highlighter; phrase underline weight increased.
- **R5.3b.2 — Tint hygiene and signal-colour alignment** (shipped 2026-05-20). Tint alpha bumped from 0.08–0.10 to 0.12–0.15 for better visibility. Tints auto-clear when draft text changes after Review. QC card left-border colour now uses worst-signal-wins (matches tint colour for the same statement). Tag: `v8.49.2-tint-hygiene`.
- **R5.3a — Convert “Your Draft” textarea to overlay-capable surface** (shipped 2026-05-18). Frontend foundation only; no visible behaviour change. Tag: `v8.48.0-draft-overlay`.
- **R5.2 — Span-based within-signal duplicate concern merge** (shipped 2026-05-18). Threshold: 80% overlap of the longer span. Format: numbered-list `(i)` `(ii)` … within a single concern. Multi-span derivation extended in R5.1 helper. Tag: `r5.2-duplicate-concern-merge`.
- **R5.5 — Compliance disclaimer footer** (shipped 2026-05-18). Results panel page footer plus PDF/DOCX export footer (canonical copy, single constant); timestamp consistency audit with shared `formatRelativeTime` / `formatAbsoluteTime` helpers. **Frontend:** `v8.47.0-disclaimer-and-timestamps`. **Backend:** `r5.5-export-disclaimer`.
- **R4.3 — Visibility wiring** (shipped 2026-05-17). Expanded confidential-detail rule, new disclosure-absent rule, new jargon rule (version-aware), Compliance and Editorial+Style system-prompt visibility calibration. Tag: `r4.3-visibility-wiring`.
- **R5.1 — Per-concern span derivation on v4** (shipped 2026-05-17). Editorial coverage ~96%, Compliance ~56%. Tag: `r5.1-concern-spans`.
- **R5.1.1 — Compliance prompt instructs phrase quoting** (shipped 2026-05-17). Compliance span coverage rose from ~56% to ~83% across post-deploy validation runs. Tag: `r5.1.1-compliance-phrase-quoting`.
- **Reviewer Assessment synthesis** (closed in R4.x). Narrative synthesis in senior editor voice; see Completed → Source Management.
- **Cost model spreadsheet** (closed in R1.x). See `docs/BACKLOG.md` Closed → P1.
- **R1.2 gpt-4o-mini Stage 2 source-matching evaluation** (closed via R1.2, R1.2.4, R1.2.5). Production Stage 2 remains gpt-4o + prompt v2.

### Governance docs (frontend repo)

- **`docs/FRONTEND_CONVENTIONS.md`** (brightline-content-engine-frontend) — created with R5.5. Documents the user-visible timestamp convention: **relative** time for lists and drawers (`formatRelativeTime`, tier definitions: Just now → minutes/hours → Yesterday at HH:MM → days ago → DD/MM/YYYY); **absolute** time for audit moments (`formatAbsoluteTime`, `DD/MM/YYYY, HH:MM GMT+8`). Canonical review disclaimer constant location also noted. **R5.3a:** `DraftOverlay` at `src/components/draft/DraftOverlay.jsx` — future “highlight in draft” work consumes it via the `highlights` prop; font config is shared with the textarea via `draftSurfaceFont.js` to prevent drift.

---

## QC rebuild backlog

Status of rebuild optimisation and cost items from the v4 planning track:

| ID | Item | Status |
|----|------|--------|
| **(A)** | LLM call consolidation | **R3.1 shipped** — Style+Editorial merged on v4 (`runEditorialStyleReview`). **Compliance deliberately kept separate** (different cognitive frame, reviewer trust; ~$0.02/run saving not worth signal dilution). **R3.2** (Stage 5 into Stage 2) **DEFERRED** — needs Stage 2 restructure; loses parallelisation. |
| **(B)** | Visibility wiring (Complete vs Public) | **CLOSED** via R4.3 (`r4.3-visibility-wiring`). |
| **(C)** | Stage 2 chunking cost ceiling for long sources | **Open** — not an immediate concern (F15 ran clean at ~4,800 words in diagnostic). Scope during **R6 Review Quality** when long-source warnings recur (see Parked → (C) below). |
| **(D)** | $2/run production cost target | **Tracking** — diagnostic pass scheduled inside **R6 scoping**; baseline call count and cost before prompt changes. |

---

## R5 — Concern spans & draft highlighting

Sequence locked in 2026-05-17 planning session (in delivery order):

| Spec | Summary | Status |
|------|---------|--------|
| **R5.1** | Per-concern span derivation on v4 | **SHIPPED** — `r5.1-concern-spans` |
| **R5.1.1** | Compliance prompt encourages phrase quoting | **SHIPPED** — `r5.1.1-compliance-phrase-quoting` |
| **R5.1.2** | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. “3.2x net of fees”, “delivered 4.5x”). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | Planned |
| **R5.2** | Span-based within-signal duplicate concern merge (supersedes product backlog “merge duplicate concerns”; uses R5.1 spans) | **SHIPPED** — `r5.2-duplicate-concern-merge` |
| **R5.3a** | Convert “Your Draft” textarea to overlay-capable surface (frontend foundation). **Path Y locked**; DraftContextPanel revival ruled out | **SHIPPED** — `v8.48.0-draft-overlay`. Ready for R5.3b/R5.4 consumers. |
| **R5.3b** | Statement-level traffic-light colour-coding in draft area with toggle (auto-on after Review unless reviewer toggles off); draft→card click navigation; word/char count — consumes R5.3a overlay | **SHIPPED** — follow-ups **R5.3b.1** (transparent textarea, auto-on on `statementRows`, toggle keyboard), **R5.3b.2** (`v8.49.2-tint-hygiene`) |
| **R5.4** | Wire existing “Highlight in draft” button (dead since R4.1) plus concern bullets, using R5.1 spans, to scroll-and-highlight phrases in the draft area on the R5.3a surface | **SHIPPED** — `v8.50.6-concern-fallback-underline` (base card→draft navigation) |
| **R5.4.1** | Statement highlight rendering fix + bolder phrase underline | **SHIPPED** |
| **R5.4.2** | Highlighter-yellow as the statement highlight visual | **SHIPPED** |
| **R5.4.3** | Highlight visibility under tints + statement/phrase coexistence | **SHIPPED** |
| **R5.4.4** | Single statement highlight, clear on re-Review, toggle link text | **SHIPPED** |
| **R5.4.5** | Verdict tints clear during loading state | **SHIPPED** |
| **R5.4.6** | Concern-click fallback as whole-statement blue underline | **SHIPPED** — `v8.50.6-concern-fallback-underline` |
| **R5.5** | Compliance disclaimer footer (Results panel + PDF/DOCX exports); timestamp consistency audit | **SHIPPED** — frontend `v8.47.0-disclaimer-and-timestamps`, backend `r5.5-export-disclaimer` |

**R5 sequence: COMPLETE.** All R5.x specs above shipped except **R5.1.2** (unlabelled return multiples — remains planned). **Bidirectional draft↔card navigation is live:** draft→card (R5.3b verdict tints + textarea click), card→draft (R5.4 concern underline + “Highlight in draft” yellow marker).

**Span contract (R5.1 → R5.2 → R5.4):** R5.1 introduced `span` as a single `{ startChar, endChar, source }` object on each concern. R5.2 generalises this to an **array** of one or more such entries (multi-phrase concerns emit multiple spans; merge concatenates and dedupes). **R5.4** consumes the array for click-to-highlight in the Assess draft overlay (phrase underline from spans; whole-statement blue underline when spans are absent — see R5.4.6).

**Note — macOS Safari keyboard accessibility:** The Verdicts toggle (R5.3b) uses correct ARIA switch semantics on a native `<button>`, but macOS Safari does not tab to buttons by default. Users on Safari must enable **Preferences → Advanced → “Press Tab to highlight each item on a webpage”** to navigate the toggle via keyboard. This is a Safari preference, not a code defect.

---

## R6 — Review Quality

**Status:** **SCOPING** (diagnostic batch complete 26 May 2026; candidates below informed by diagnostic findings)

**Objective:** Lift the quality, reliability, and insight of Review output. This is the moat. Pure-UI sprints have diminishing returns until Review output catches up.

**Evidence base:** Diagnostic batch runs `2026-05-26-205208` and `2026-05-26-212900` (see `docs/diagnostic_findings.md` and per-fixture `runs/` output); re-run `2026-06-01-122541` (see `docs/diagnostic_rerun_findings_2026-06-01.md`).

Items in scope (order indicative, not locked):

| Spec | Summary | Priority | Prior backlog |
|------|---------|----------|---------------|
| **R6.1** | **Direction intensity** — surface how strong a concern is, not just that one exists | — | Was product backlog #2 |
| **R6.2** | **Reviewer comments house style** — tighten commentary tone, remove filler, enforce QC Output Language Standard from AI Operating Manual | — | Was product backlog #3 |
| **R6.3** | **Hide Editorial on conflict** — principle-based suppression of duplicative Editorial concerns when Evidence is conflicting | **SHIPPED 2026-05-31** | `r6.3-principle-based-suppression` |
| **R6.4** | **Public version compliance** — R4.3 shipped wiring; sub-items R6.4a/b shipped 2026-05-30; R6.4c shipped 2026-05-31; R6.4d closed as non-issue | **SHIPPED — chapter closed 2026-05-31** | See Recently shipped → R6.4 |
| **R6.5** | **House style framework** — Layer 1 (universal writing quality) + Layer 2 (client default) + structured style guide input to the editorial reviewer | **SHIPPED 2026-05-27** | `r6.5.6-defined-term-refinement` — Framework + 5 deterministic backstops. See Recently shipped. |
| **R6.6** | **Document-type appropriateness** — salutations, business descriptions at first mention, completed-investment framing for investor letters, no internal-process references in external commentary; **expanded 2026-06-01:** document-type-aware voice/register (editorial norms must relax for social formats — LinkedIn over-firing, fixture 12). See near-term work-stream **R6.6 — DOCUMENT-TYPE-AWARE VOICE/REGISTER**. | Medium | Diagnostic (F04, F12, F18); comments review 2026-06-01 |
| **R6.7** | **Forward-looking statement review** — distinguish forward-looking claims; hedging, plausibility, visibility-calibration, alignment with stated risks | Medium | Diagnostic (F02, F03, F05, F08, F09) |
| **R6.8** | **Cross-source display semantics** — cross-source detection now **works** (F18 resolved — 0→3 conflicting, correctly). Open question is **display semantics only:** statements supported-by-source-A but contradicted-by-source-B currently read 'supported + conflict flag' (F18 S3/4/5/7). Decision needed: keep supported-with-flag, or escalate to partial/conflicting. Risk: a reviewer skimming green verdicts may miss the flag on a material discrepancy. Ben's lean: escalate — but **decide only after** reviewing how prominently the conflict flag surfaces in the UI. Reframed from 'fix aggregation' to 'decide display'. | Medium | Diagnostic (F18); re-run 2026-06-01 |
| **R6.9** | **Non-claim statement handling** — Stage 1 classifies each statement as claim/non-claim and drops pure non-claims (salutations, closings, bare transitions) after span mapping, so they never become QC cards or reach evidence/editorial/compliance review. Classification is statement-level: a statement is dropped only if entirely structural with no verifiable content; mixed structural+factual sentences are kept. Bias toward keeping when uncertain. All-non-claim safeguard prevents empty results. **Confirmed by 2026-06-01 diagnostic** as still scoped to functional-element / non-claim noise: recommendations ('We recommend approval'), salutations, sentiment lines return `not_supported` as if failed verification. Unchanged from 26-May; not regressed. | **SHIPPED 2026-05-28** — `r6.9-non-claim-handling` | Diagnostic (F04, F11, F12, F14, F18, F20) |
| **R6.10** | **Source quality audit** — independent of draft, audit each source for internal inconsistencies | Low | Diagnostic (F13 — caught 2/3 deliberate inconsistencies) |

**R6.2 sub-items (commentary quality):**

- **R6.2a** — Disentangle promotional-language flags into hyperbole vs qualitative-descriptor. **SHIPPED 2026-05-30** — `r6.2a.1-promotional-language-calibration` (combined R6.2a + R6.2a.1). Option A locked: flag explicit hyperbole only when unsubstantiated; never flag standard qualitative descriptors. Three coordinated edits: `marketing_language_excess` (editorial rulebook) hyperbole list tightened with explicit do-not-flag list for standard descriptors; `hyperbole_vs_qualitative` (style guide Layer 1) aligned same; `VISIBILITY_CALIBRATION_EDITORIAL_STYLE` no longer tightens on promotional language. R6.2a.1 follow-up strengthened the substantiation carve-out (adjacent figure/comparator suppresses flag — Run E example: "exceptional 22% net IRR vs benchmark 14%" no longer fires), softened compliance "typically restricted under fund marketing regulations" prose, and removed schoolroom framing ("not permissible", "is not acceptable") from editorial concern text. Validated across 6-run suite: standard descriptors clean on both Complete and Public; hyperbole still fires when bare; substantiated hyperbole does not fire.
- **R6.2b** — Structural recommendations as editorial sub-dimension (bullet candidates, paragraph breaks). Evidence: F08, F11.
- **R6.2c** — Dimension-naming for "off phrasing" feedback. Evidence: F08, F11, F19.
- Low-materiality / cosmetic-change over-firing (observed R6.9 edge-case testing 2026-05-28): editorial reviewer fired a concern suggesting "Yours sincerely," → "Sincerely," — a cosmetic change with no codified house rule behind it and no material improvement to the copy. Proposed R6.2 calibration principle: a concern is only worth surfacing if acting on it would change the copy in a way the writer would care about. Do not flag stylistic preferences that are not codified house rules, and do not flag changes whose substance is unchanged. Testable principle for R6.2a/c scoping.
- **Side observation 2026-05-30** — R6.2a.1 Run F: the previously-observed voice misread ("The Fund has" interpreted as first-person, recommending "The Fund reports") did NOT recur after the schoolroom-framing guidance was added to `CONCERN_TEXT_META`. Plausible reason: the gatekeeping guidance generally raised the LLM's threshold for emitting concerns, so borderline/wrong-direction concerns dropped below the firing bar. Single observation only — do not treat as a fix; if the voice misread recurs in future testing, log under a dedicated rule-misclassification item.

### Layer 2 style rules backlog (running list)

The R6.5 two-layer style guide is designed to accrete client-specific rules over time. As the editorial reviewer fires stylistic concerns that contradict actual PG house style, those gaps are logged here and batched into periodic rule-addition passes (fast edit cycle: `style-guide.mjs` + `npm run diagnostic:style-guide`).

Rules to add:
- Salutation conventions per output type. PG house style uses "Dear valued investors," as the salutation for investor letter outputs. The editorial reviewer currently flags this as too personal and suggests "Dear Investors," because no Layer 2 rule covers salutations. Add a rule codifying correct salutations by output type. Surfaced 2026-05-28 (R6.9 edge-case testing).

(Future salutation/style gaps appended here as discovered.)

### R6.2d — Editorial fidelity discipline

- Fidelity discipline — eliminate fabricated quotes in editorial commentary. Evidence: `[FIDELITY_DROP]` log entries from both diagnostic runs; feeds **D1.5**.
- **Fidelity-drop-on-corrected-phrase pattern** (observed R6.5.1 testing): LLM cites the corrected form of a violation rather than the offending text. Examples: `number_spelling` cites `'12'` when statement contains `'7 investments'`; `currency_format` cites `'EUR 445 million'` when statement contains `'€445m'`; `english_variant` cites `'organize'` when statement contains `'organise'`. Fidelity guard correctly rejects but the concern is lost.
- **Contradictory-concern-field pattern** (observed R6.5.1, R6.5.4 testing): LLM produces a concern where the note acknowledges the text is correct, the `suggestedDirection` asks for a change, and the `suggestedRewrite` is identical to the input. Examples: S3 `defined_term_capitalisation` pre-R6.5.4 produced "Change 'The Company is profitable' to 'The Company is profitable'"; S9 `defined_term_capitalisation` pre-R6.5.6 produced "Change 'the Company' to 'the Company'".
- **Source-style conflation pattern** (observed R6.5 F01 live regression): LLM treats source text style as authoritative over house style. Statement uses `5'500` (PG-correct apostrophe separator); source uses `5,500` (comma separator); LLM fires `thousand_separator` concern recommending changing the correct draft to match the source's incorrect form. Resolved at the filter layer via R6.5.5.

**R6.4 sub-items (Public version compliance):**

- **R6.4a** — Visibility-context awareness (recognise when source is already public). **SHIPPED 2026-05-30** — `r6.4a-source-publication-state` (backend) + `v8.52.0-r6.4a-publication-state` (frontend). Combined R6.4a + R6.4a.1 + R6.4a.2 in one tag.

  **Scope shipped:**
  - R6.4a: structured publicationState field on source objects (published_external / restricted / unknown). LLM inference at upload via api/summarize-source.js. Persistence through pipeline. Compliance receives per-source publication state in user payload. New SOURCE PUBLICATION STATE AWARENESS block in VISIBILITY_CALIBRATION_COMPLIANCE instructs the LLM to suppress confidential-detail, hyperbole, and marketing-language-superlative concerns when the offending content is materially present in a published_external source. Suppression is content-bound (new claims still fire) and rule-scoped (forward-looking, comparative, selective-hedging rules unaffected).
  - R6.4a.1: classifier prompt recalibration — explicit markers list (FOR IMMEDIATE RELEASE, location+date header, media contact, About boilerplate, SEC identifiers, etc.) treated as sufficient for published_external without independent verification. Conservatism reframed as tie-breaker, not default.
  - R6.4a.2: missing call site wired. The Assess upload path (useAssessState.jsx handleUploadSourceFiles) had never called apiSummarizeSource — every source defaulted to "unknown". Ported summariseSourceInBackground pattern from useDraftState.jsx. This was the actual unlock; R6.4a.1's prompt iteration was diagnosing a problem in the wrong layer because the classifier was never running.

  **Validated end-to-end:**
  - Published press release → published_external → Compliance suppressed (hyperbole + EV concerns dropped)
  - Generic source → unknown → Compliance unchanged (regression intact)
  - Mixed draft (source content + new claim) → suppression on source content, new claim still flagged correctly (content-bound)

  **Out of scope, deferred:**
  - Full source metadata UI (description display, drawer context) — R6.4b shipped publicationState pill + override in Assess Sources panel (2026-05-30); description display and drawer redesign deferred to R7.

  **R6.4a.3 + R6.4b — Combined ship 2026-05-30:**
  - Backend tag: `r6.4a.3-restricted-rename`
  - Frontend tag: `v8.53.0-r6.4b-publication-state-ui`

  R6.4a.3 (backend): Renamed the publicationState enum value `internal_or_draft` to `restricted`. The previous name was misleading for external-but-restricted documents (e.g. an external fund's investor report is neither internal nor a draft, but it is restricted-distribution and should not relax Compliance). Broadened classifier criteria to recognise:
    - External-but-restricted: investor letters, LP reports, capital call notices, distribution notices, fund quarterly/annual reports, AGM/EGM materials, pitch decks for defined audiences
    - Internal: IC papers, valuation papers, strategy/market decks, internal AGM materials, board papers (criteria already present, retained)

  Calibration note added to classifier prompt: polished production format does NOT equal public distribution. A professionally-designed LP presentation deck is still 'restricted' if its audience is a defined set of investors rather than the general public. Judge audience and distribution, not production quality.

  R6.4b (frontend): Added a small pill component to each source row in the Assess Sources panel showing the current publicationState as a plain English label ("Published externally" / "Restricted" / "Unclassified"). Clicking the pill opens a dropdown allowing the user to override the LLM's auto-inference. Override is session-scoped (resets on page reload / re-upload). Pill order in the dropdown: Published externally, Restricted, Unclassified.

  Validation across four phases:
  - Phase A (rename regression): published_press_release.txt → published_external; internal_memo.txt → restricted; generic_text.txt → unknown
  - Phase B (broadened criteria): external_fund_investor_letter.txt, internal_valuation_paper.txt, lp_capital_call.txt all classify as restricted
  - Phase C (UI override): override reaches Compliance; user can change pill value via dropdown; Compliance applies the user-selected state on next Review
  - Phase D (R6.4a regression): R6.4a headline suppression behaviour preserved after rename; hyperbole and EV concerns on AtNorth draft still suppressed when source is published_external

  **Suppression boundary — subject substitution.** Phase C live testing surfaced that Compliance suppression engages cleanly for confidential-detail concerns (specific figures present in the source) but does NOT engage for hyperbole concerns when the draft renames the subject of the claim. Example: source contains "the asset is exceptionally well positioned in its niche"; draft contains "Project Lumen is exceptionally well positioned in its niche". With the source overridden to published_external, the EV concern on a separate statement suppressed cleanly, but the hyperbole concern on the renamed statement still fired.

  The LLM appears to treat subject renaming (a generic noun becoming a specific named entity not in the source) as breaking the content-bound link, even though the hyperbole language itself is verbatim from the source. This is defensible behaviour — it prevents abuse where someone could lift hyperbolic language from one source and apply it to a different subject — but it limits the perceived effectiveness of override on hyperbole concerns.

  Confirmed across two test cases (AtNorth where subject "AtNorth" appears verbatim in source → suppression worked; Project Lumen where "the asset" was renamed to "Project Lumen" → suppression did not engage).

  Possible future fix: prompt edit to explicitly instruct that subject substitution is a normal editorial choice that does not unbind content from the source. Risk: looser suppression opens potential abuse (applying source hyperbole to a different subject). Not addressing tonight; revisit if real reviewer usage surfaces complaints. Logged 2026-05-30.
- **R6.4b** — Jurisdiction-aware fund marketing rules. Evidence: F02.S5 `hard_concern` on "exceptionally well positioned" was fund-marketing-regulation flag misapplied to portfolio transaction release. **Addressed by R6.4c** (regulatory rule scope refinement) — see Recently shipped → R6.4.
- **R6.4c** — Regulatory rule scope refinement. **SHIPPED 2026-05-31** — `r6.4c-regulatory-rule-scope`. See Recently shipped → R6.4.
- **R6.4d** — Sensitivity-tier calibration. **CLOSED 2026-05-31 as non-issue** — see Recently shipped → R6.4.

**Side observation 2026-05-30** (R5.2(a) Run 3): compliance correctly fired on "The Fund is genuinely exceptional and unparalleled" (fund performance superlatives) and "is genuinely best-in-class" (fund performance superlative) in Runs 1 and 2, but did NOT fire on "the team is unparalleled" in Run 3 — superlative applied to the team, not fund performance or returns. This is correct behaviour: `regulatory_prohibited_language` is calibrated to flag superlatives applied to fund characteristics and performance, where fund marketing regulations apply. Confirms that compliance is well-calibrated on the "which superlatives carry regulatory weight" dimension. No action needed; banked as positive calibration evidence.

**Watch items to fold into R6 scoping:**

- **R2.7.1** — **Watch OPEN** (see **Watch items → R2.7.1**). Shipped 2026-05-28; ongoing trace review for conflict/partial edge cases. **Not modified by R2.7.2** — period work did not touch conflict/partial routing for relative or absent-fact statements.
- **Rebuild backlog (C)** — Stage 2 chunking ceiling. Not immediate (F15 clean at ~4,800 words). Scope when long-source warnings recur.
- **Rebuild backlog (D)** — Production cost tracking. Diagnostic pass complete; baseline ~16 calls / 4 statements / 1 source; ~$2/run.

---

## R2.7.1 — Stage 2 conflict vs partial (spec candidate)

**Status:** **SHIPPED 2026-05-28** — `r2.7.1-conflict-partial-calibration`

**Shipped scope (prompt-only, stage2_v4.md):** (1) Voice/framing/person differences are not contradictions when the underlying fact is identical (F12.S0 fix). (2) Resolved an internal prompt contradiction on entity handling: a different entity in the same role (replacement) is `conflicting`; a missing entity not replaced (omission) is `partially_confirmed`. (3) A statement with no verifiable claim cannot be `conflicting` (at most `no_support`). Validated across four cases: voice difference -> confirmed; entity replacement -> conflicting; entity omission -> partially_confirmed; figure contradiction guard -> conflicting.

**One-line:** Tighten Stage 2 distinction between `conflicting` and `partially_confirmed` — absent-fact statements, voice rephrasing, and semantic disagreement should not land as `conflicting` when the source does not directly contradict.

**Why elevated now:** Diagnostic batch confirmed the issue is live — F12 voice-rephrasing-as-conflict; broader Stage 2 classification observations across fixtures. This is upstream of R6 editorial/compliance work and may need to ship sooner than the R6 umbrella.

**Relationship to R2.7.2:** Semantic frame matching (R2.7.2) improves partial-vs-conflict discrimination on numeric/frame mismatches; R2.7.1 addresses classification tone and absence-vs-contradiction boundaries.

**Scope when specced:** Stage 2 prompt and classification guidance. No new verdict enum values.

---

## R2.7.2 — Stage 2 semantic frame matching

**Status:** **SHIPPED 2026-06-01** — `r2.7.2-frame-matching`. See **Recently shipped → R2.7.2** for full scope, period limitation, and verification notes.

---

## R2.7.2.1 — Relative-source-period resolution

**Status:** **LOGGED** (backlog **B17**)

**One-line:** Stage 2 period matching fails when the **source** expresses the period relatively ('over the same period', 'today') requiring inference from the document date.

Four prompt-mechanism attempts (two prose, two structured-field) all failed: the model resolves the relative reference to whatever period confirms the statement rather than computing it from the document date. Prompt-only approaches exhausted (B14 pattern).

**Proposed mechanism:** a **deterministic date-resolution pass** that computes the source's calendar period from the document date **before** Stage 2 and hands the matcher a pre-normalised `sourcePeriod`. New capability, not a prompt tweak.

**Priority:** M. Independent of R6.

**PARKED (practical blocker, 2026-06-01 scoping).** Diagnostic confirmed no structured source publication date exists anywhere in the upload→Stage1→Stage2 path; only `publicationState` survives to Stage 2 and is dropped before matching. The deterministic date-resolution pass would require threading a new date field through the pipeline PLUS an upstream date-extraction step. Extraction is reliable only for press-release datelines; GP reports / IC docs carry dates unstructured and often multiple-per-document, where extraction would resolve the wrong date — re-introducing the inference unreliability upstream. Decision: stay parked at M; explicit-vs-explicit gating (shipped in R2.7.2) covers the tractable case. Reactivate only if relative-source-period mismatches prove common in real reviewer drafts.

---

## Near-term — Review output (2026-06-01 diagnostic + comments review)

**Recommended order:** commentary calibration → editorial rule bug-fix pass → schema-fallback (below) → then R6.6 / source-public-state / R7. Front-loads cheap, broad, low-risk wins; defers feature-sized work.

| Item | Summary | Priority |
|------|---------|----------|
| **COMMENTARY CALIBRATION (Stage 5 / reviewer-prompt)** | **Status: LOGGED, recommended first.** Principle-based prose calibration of evidence/editorial/compliance commentary. Anchor issue: the 'excerpt' meta-phrasing (53 instances in batch 2026-06-01) — commentary refers to internal tool plumbing ('as stated in the excerpt') and redundantly narrates the source AND the excerpt (which is a fragment of the source). Principle: describe the source's relationship to the statement ONCE; never refer to the evidence-selection mechanism or 'the excerpt'. Also: simplify technical register (voice_consistency phrased as active/passive not abstract terms; 'causal relationship/causation' → plainer wording; 'uncertainty qualifier' → 'hedging language'); remove preachy phrasing ('which is not appropriate for…'); cut verbosity where the Direction repeats the flagged phrase verbatim (state the change concisely, exclude the quoted statement); abstract marketing_language meta-clauses ('in the same or adjacent sentence' → 'in the immediate context' or omit); standardise the 'leading' flag to a short line ('"leading" is an unsubstantiated superlative; remove or substantiate'). **GUARDRAIL:** PRESERVE the depth and framing-commentary that works (e.g. evidence notes that observe framing like 'an unusual demographic concentration'; narrative_coherence and materiality substance). Reduce register/verbosity WITHOUT flattening substantive editorial observation. Prompt-only; principle-based, not per-example patching. | **H** |
| **EDITORIAL RULE BUG-FIX PASS** | **Status: LOGGED, recommended second.** DIAGNOSE-FIRST: these are wrong/un-actionable outputs, not wording. Items: (1) `date_format` directs a correct date '19 January 2026' to be changed to a wrong format — rule's 'required format' is inverted/wrong; (2) `thousand_separator` flags the SOURCE/excerpt's comma style and directs a change to the statement — rule scoping bug; (3) `number_spelling` mis-targets ('5.4 percent' — numeral is fine; issue is 'percent' vs '%'); (4) `internal_plausibility` flags a deliberately-rounded figure (17% vs 17.1%) as implausible and garbles 'compound annual rate'/'growth rate' — over-firing on rounding; (5) `structural_integrity` false-positives a normal appositive sentence as a fragment; (6) `passive_voice_overuse` generates an incoherent rewrite Direction. PLUS minor scoping note: `materiality` fires 'no named benchmark' on 'largest in Meridian's history' where the basis IS stated — the legitimate half is 'add the figure'; possible miscategorisation (materiality vs comparative-claim). PLUS: `forward_looking_statement_without_qualifier` should recognise existing hedging ('we expect' IS the hedge) and not demand a second qualifier. Several are structurally checkable → candidates for `STYLE_RULE_DETERMINISTIC_FILTERS` backstops. Diagnose actual rule logic before fixing. | **H** |
| **EDITORIAL SCHEMA-FALLBACK (silent failure)** | **Status: SCHEDULED NEXT (before R7).** The editorial reviewer applies a silent 'clean fallback' when its structured output fails schema validation twice, emitting zero concerns indistinguishably from a genuine clean pass (5 events/4 fixtures in batch 2026-06-01-122541; F14 ×2). Two parts: (a) **Observability** — mark a fallback distinctly from a real clean pass so the reviewer is not given a false 'clean' signal (primary concern; silent failure is unacceptable on an audit-safe product regardless of rate); (b) **Reliability** — diagnose why validation fails twice (F14 thesis-only clustering suggests a statement-type pattern); read malformed model output in `pipeline.log` first. Diagnose-first. | **H** |
| **R6.6 — DOCUMENT-TYPE-AWARE VOICE/REGISTER (expand existing R6.6 scope)** | Editorial voice/register rules apply reporting-commentary norms to ALL document types, including LinkedIn posts — flagging 'Excited to see' (legitimate LinkedIn register) and third-person company description as wrong-voice/wrong-register. Rules must know the document type and relax voice/register enforcement for social formats. Folds the comments-review LinkedIn over-firing (fixture 12) into R6.6. | **M** |
| **SOURCE-PUBLIC-STATE AWARENESS (one capability, three rules)** | Compliance must reason whether a figure/name/claim already appears in an already-public source, and suppress accordingly. Serves: (i) `precise_confidential_detail_in_public_version` (currently 'machine-guns' any figure, e.g. EUR 1.2bn, and fires on content from a published PR — F02.S0); (ii) `named_individual_attribution_in_public_content` (consent-check should survive for genuinely-unsourced names but suppress when the named individual appears in a public-state source — Ben confirmed); (iii) the broad public-source gap from the diagnostic. This is the top remaining compliance accuracy item; hits documents first PG users will recognise as their own cleared output. | **H** (within R6 compliance) |

---

## R7 — Sources Drawer Revival

**Status:** **LOGGED** (pre-spec discussion pending)

**Objective:** Restore the Sources drawer to the UI and wire card→source navigation, completing the draft↔card↔source triangle.

**Intended behaviour** (subject to pre-spec discussion):

- Sources drawer reopens as a panel in the UI.
- Drawer shows uploaded source files with their content browsable.
- Clicking an Evidence comment / excerpt on a QC card opens the drawer and scrolls to the relevant source passage.
- Excerpt span back to source is expected to come from existing `evidenceTrace`; no new backend extraction work anticipated.

Frontend-heavy, modest backend work. Can run after R6 or in parallel since the surfaces do not overlap.

**Updated 2026-05-30 (R6.4a context):** R6.4a added structured `publicationState` per source (published_external / restricted / unknown) inferred at upload, with no UI surface at ship time. The Sources Drawer is the natural home for displaying source metadata to reviewers (description, publicationState, possibly manual override of classification). R7 scope now plausibly includes:

  (a) source list display with metadata (description, publicationState as a read-only field)
  (b) card→source navigation (original R7 intent)
  (c) eventual user override of publicationState (separate spec)

A small interim spec (R6.4b candidate) may surface publicationState in the existing Sources panel before the full R7 drawer is built — preserving R7's scope for the navigation work while addressing the immediate transparency gap from R6.4a.

**Further update 2026-05-30:** R6.4b shipped per-source publicationState display + override in the existing Sources panel — partial fulfilment of the metadata-display intent originally noted for R7. R7 scope is now more focused:
  - Card→source navigation (original R7 intent) — still pending
  - Full source description display (not in R6.4b due to row-height concerns) — natural for R7
  - File preview / browsable source content — natural for R7
  - publicationState badge can be reused; override control may need redesign for the drawer context

---

## R4.2 — Dead-code cleanup (parked)

Parked pending dogfooding evidence. Bundle:

- **Cosmetic:** `[EDITORIAL_REVIEW] starting` log prints `visibility: null` before `normalize*` — stale pre-normalisation values (`lib/qc/editorial-compliance-reviewer.mjs`).
- **v3 retirement:** decommission v3 route and dual-path editorial/compliance code once dogfooding evidence accumulates (target: 15–25 production traces, no canary fires; see Architectural debt → R3.1).
- **Legacy timestamp formatting (frontend):** `DraftOutputPanel.jsx`, `WritingBadge.jsx`, and `DraftContextPanel.jsx` still use `toLocaleString` for timestamp display (legacy Writing/Quality surfaces). Intentionally not touched in R5.5 — surfaces may be unreachable post-R4.1 and could be removed with dead code. **R4.2 scoping:** confirm reachability; either migrate to `formatRelativeTime` / `formatAbsoluteTime` (see frontend `docs/FRONTEND_CONVENTIONS.md`) or delete with the unreachable panels.

---

## Diagnostic harness backlog

Infrastructure follow-ups from the 26 May 2026 diagnostic session (not R6 product work):

| ID | Summary | Priority |
|----|---------|----------|
| **D1.4** | Incremental `INDEX.md` write per fixture — currently written only at end of batch run; deviates from D1.1 spec | Low |
| **D1.5** | Pipeline log analysis — CLOSED 2026-05-27 without completion. Investigation found the diagnostic harness did not capture stdout to disk, so the historical `[FIDELITY_DROP]`, `[EDITORIAL_STYLE_REVIEW]`, and `[stage2]` log entries from runs `2026-05-26-205208` and `2026-05-26-212900` are not recoverable. Decision: skip the data-collection. The three qualitative **R6.2d** candidate patterns captured in R6.5 testing (fidelity-drop-on-corrected-phrase, contradictory-concern-fields, source-style-conflation) carry forward as primary evidence for **R6.2d** scoping. | Closed |
| **D1.6** | Diagnostic harness stdout capture — modify `scripts/diagnostic/run-batch.mjs` to capture per-fixture stdout to a `pipeline.log` file alongside `result.json`. Surfaced during D1.5 attempt: the bracketed pipeline log entries (`[FIDELITY_DROP]` et al.) print to stdout but are not persisted to disk, making post-hoc analysis impossible. Small change; do before next diagnostic batch. | Low |
| **D1.7** | Re-audit fixtures with unexpected verdict deltas (F06, F08, F09, F11, F17, F19) — per-statement walk to determine whether pipeline or expected outcome is correct | Low |

---

## Open product backlog (prioritised)

Tracked here for roadmap visibility; detail rows also live in `docs/BACKLOG.md`. Top = highest priority.

1. **R6 — Review Quality** (active scoping) — umbrella for R6.1–R6.10. **R6.5** house style framework shipped 2026-05-27. **R6.4** chapter closed 2026-05-31 (R6.4a/b/c shipped; R6.4d closed as non-issue). **R6.3** shipped 2026-05-31. Near-term work-streams from 2026-06-01 diagnostic + comments review — see **Near-term — Review output** above.
2. **EDITORIAL SCHEMA-FALLBACK (silent failure)** — **SCHEDULED NEXT (before R7).** Observability + reliability; see **Near-term — Review output** table.
3. **COMMENTARY CALIBRATION** → **EDITORIAL RULE BUG-FIX PASS** → **SOURCE-PUBLIC-STATE AWARENESS** / **R6.6** — recommended sequence before R7; see **Near-term — Review output**.
4. **Relative-source-period resolution (R2.7.2.1)** — **parked** (2026-06-01 scoping); see **R2.7.2.1** above and backlog **B17**.
5. **R7 — Sources Drawer Revival** (logged, pre-spec) — see **R7 — Sources Drawer Revival** above.
6. **Align Direction intensity (R6.1)** — surface how strong a concern is, not just that one exists. Folded into R6.
7. **Reviewer comments house style (R6.2)** — tighten commentary tone; sub-items R6.2a–R6.2d from diagnostic.
8. ~~**Hide Editorial on conflict (R6.3)**~~ — **SHIPPED** 2026-05-31. See Recently shipped → R6.3.
9. ~~**Public version compliance (R6.4)**~~ — **SHIPPED — chapter closed** 2026-05-31. See Recently shipped → R6.4.
10. **House style framework (R6.5)** — **SHIPPED** 2026-05-27. See Recently shipped → R6.5.
11. **Document-type appropriateness (R6.6)** — Medium; expanded for document-type-aware voice/register (2026-06-01). **Forward-looking statement review (R6.7)** — Medium. **Cross-source display semantics (R6.8)** — Medium. **Non-claim statement handling (R6.9)** — shipped; residual functional-element noise confirmed 2026-06-01. **Source quality audit (R6.10)** — Low.
12. **Tool output style compliance (R6.2b candidate).** The Content Engine reviews drafts against house style but the tool's own user-facing prose — concern text, suggested directions, suggested rewrites, evidence summaries, Stage 5 commentary, Quality Review Summary bullets, Reviewer Assessment synthesis, sign-off verdict labels — is not held to the same standard. Symptoms already surfaced and patched piecemeal: schoolroom framing ("not permissible") removed in R6.2a.1; absolute compliance prose ("restricted under fund marketing regulations") softened in R6.2a.1. Broader gap remains — house style rules like em-dash replacement, smart quotes, English variant, and hyperbole avoidance probably apply to tool output prose too, but no codified standard exists for the tool's own voice register.

    **Scope when picked up:**
    - Inventory all tool-output text surfaces (~7 known: editorial concerns, compliance concerns, evidence summary, Stage 5 commentary, Quality Review Summary, Reviewer Assessment, sign-off labels).
    - Determine which house-style rules apply to tool prose vs draft prose (e.g. thousand separators probably don't; em-dashes and hyperbole probably do; defined-term capitalisation probably doesn't).
    - Define the tool's own voice register: direct, descriptive, third-person, no first-person plural, no schoolroom framing, no hyperbole — likely a short character document, not a rulebook.
    - Choose mechanism per surface: prompt-level guidance (LLM-generated prose), deterministic post-filter (structural rules like em-dash, smart quotes), or both. The existing R6.5 deterministic-backstop pattern is a strong candidate for structural rules.
    - Sequence by impact: editorial/compliance concern text is highest volume and most directly visible; Reviewer Assessment is the most prominent piece of prose.

    **Connection to existing work:** `AI_OPERATING_MANUAL.md` already includes a "QC Output Language Standard" that articulates principles for tool prose but is not rigorously enforced via prompts or filters. This item is partly about strengthening that standard's enforcement, partly about extending it to cover house-style rules the standard doesn't currently mention.

    **Priority:** High-leverage (touches every Review output) but not urgent — symptoms are addressable piecemeal as observed. Scope as R6.2b when ready. Logged 2026-05-30 from a one-off observation.
13. **Fidelity log traceability** — folded into **R6.2d** and **D1.5** pipeline log analysis.
14. **E2 deterministic reimplementation** — open.
15. **Implement-changes sprint** (`suggestedRewrite` → UI) — see Active Backlog → Implement-Changes Sprint.
16. **`visibility:null` stale log (R4.2)** — parked in **R4.2**; `[EDITORIAL_REVIEW] starting` log before normalisation.
17. **Unlabelled return-multiple watch (R5.1.2)** — expand confidential-detail rule for MOIC-style figures.
18. **Web Search relook** — **DEFERRED** behind R6 and R7. Pre-spec: UI placement, verdict contract for web-sourced confirmation, cost/latency on ~16 calls/run.
19. **Diagnostic harness follow-ups (D1.4, D1.5, D1.7)** — see **Diagnostic harness backlog** above.
20. **Short-draft visual balance.** On very short drafts (e.g. a single 13-word sentence), Review output volume is disproportionate to input — Reviewer Assessment prose, Quality Review Summary, and fixed-format QC cards combine to a >15:1 output-to-input ratio. Reviewer Assessment is the largest fixed-size contributor and its length does not scale with draft length.

    Possible directions when picked up:
    - Length-scaled Reviewer Assessment: synthesise-review generates prose proportional to draft length (~30 words for short drafts scaling to ~150 words for long ones).
    - Collapse Reviewer Assessment behind "Show assessment" by default; Quality Review Summary continues to handle quick triage.
    - More structural — examine whether the assessment is doing real work beyond the Quality Review Summary bullets and card list, and either repurpose it (see next backlog item) or remove.

    UX-shaped, not calibration-shaped. Worth a small scoping pass when next addressing UI. Logged 2026-05-30.
19. **Reviewer Assessment purpose reframe.** Currently the Reviewer Assessment prose largely restates the QC cards in narrative form, duplicating information available in the Quality Review Summary bullets and the card list. Ben (practitioner) considers this high-value UI surface but in its current form it is under-earning its visual weight.

    Intended direction: shift Reviewer Assessment from "restate the cards" to "writer-facing feedback — constructive suggestions and craft-oriented criticism, in the voice of a senior editor". The assessment should comment on the draft's overall shape (argument, flow, tone, register, what's working, what's not), not the mechanics of individual flags. Likely a meaningful change to `api/synthesize-review.js` system prompt, and possibly to the calling shape (the assessment may need different inputs than today to do constructive editing rather than card synthesis).

    Cousin to **R6.2b (tool output style compliance)** — both touch tool-generated prose and benefit from the same voice/register standard. Could scope together or independently. Higher product value than several R6 calibration items but is a UX/voice reshape, not a calibration patch. Logged 2026-05-30.

**Also tracked (below top 19):** Spring clean / refactor — defer until after R6; see Active Backlog → Spring Clean.

**Closed (removed from open list):**

| Item | Closed via |
|------|------------|
| Merge duplicate concerns | R5.2 (`r5.2-duplicate-concern-merge`) |
| Align Direction intensity | Folded into **R6.1** |
| Reviewer comments follow house style | Folded into **R6.2** |
| Hide Editorial on conflict | Folded into **R6.3** |
| Public version prompt | Folded into **R6.4** (R4.3 shipped wiring) |
| R6.5 (house style framework) | Shipped via `r6.5.6-defined-term-refinement` |
| R6.3 (Hide Editorial on conflict) | Shipped via `r6.3-principle-based-suppression` |
| R6.4 (Public version compliance, chapter) | Shipped via `r6.4a.3-restricted-rename`, `v8.53.0-r6.4b-publication-state-ui`, `r6.4c-regulatory-rule-scope` |
| Stage 2 conflict vs partial (R2.7.1) | `r2.7.1-conflict-partial-calibration` |
| Stage 2 semantic frame matching (R2.7.2) | `r2.7.2-frame-matching` |
| qcCard.pipelineVersion label | `fix-pipelineversion-label` |

---

## Watch items

No spec until trigger conditions met. Do not schedule ahead of dogfooding signal.

### R5.2 — Duplicate-merge threshold tuning

Two related issues observed across multiple R6.2a / R6.2a.1 test runs:

(a) **Dedupe gap on functionally-identical concerns. SHIPPED 2026-05-30** — `r5.2a-concern-dedupe`. Backend `lib/qc/pipeline-v3/stage7-assemble-card.mjs`: added DUPLICATE_TEXT_SIMILARITY_THRESHOLD (0.85), normaliseConcernText and concernTextSimilarity helpers (token-set Jaccard on normalised text), and a dedupe pass inside mergeConcernGroup that runs after span grouping. When two concerns under the SAME concernCode have ≥85% normalised text similarity, the later one is dropped. Single survivors emit as unnumbered concerns (no "(i)" prefix), restoring the natural single-concern shape. ≥2 survivors continue to emit with "(i)/(ii)" labelling unchanged. New canary `${signalName}_duplicate_concerns_deduped` fires when the dedupe collapses a group. Validated across three live runs — previously duplicated concerns (R6.2a Run D, R6.2a.1 Runs D + F) now emit as single concerns; multi-concern path untouched. Item (b) (threshold tuning) remains in place and evidence-gated.

(b) **Threshold tuning** (original watch item content). Merge canary fires (`editorial_duplicate_concerns_merged`, `compliance_duplicate_concerns_merged`) — initial test runs produced zero merges, all correctly per 80% threshold. If reviewer use surfaces under-merging — especially nested Compliance concerns on the same phrase (e.g. forward-looking + comparative basis) — revisit threshold (lower overlap to 60–65%, or add containment rule).

### R2.7.1 — Stage 2 conflict vs partial

**SHIPPED 2026-05-28** (`r2.7.1-conflict-partial-calibration`). Voice/framing no longer classified as conflict; entity replacement vs omission distinguished; no-claim statements cannot conflict. **Watch remains OPEN** for the next 10–20 production traces — conflict/partial routing on relative or absent-fact edge cases. **R2.7.2 did not modify this routing** (period work is a separate dimension; frame-mismatch guidance coexists with R2.7.1 voice/entity rules in `stage2_v4.md`). **R2.7.2** shipped separately (`r2.7.2-frame-matching`); relative-source-period gap descoped to **R2.7.2.1**.

### R4.3 — Public version prompt quality (folded into R6.4)

**R4.3** shipped visibility wiring (`r4.3-visibility-wiring`, 2026-05-17). Prompt calibration for Public visibility is tracked as **R6.4**, not a standalone backlog item. Lineage preserved here so R4.3 scope is not mistaken for complete.

### R5.1 — Span coverage gap (concern click fallback)

After **R5.4.6**, concerns without R5.1 quoted-phrase spans get a **whole-statement blue underline** in the draft rather than a phrase-level underline. Visually heavier than span-derived highlights. **Action if reviewers find this noisy:** improve R5.1 span coverage in a future sprint (Editorial ~96%, Compliance ~83% post-R5.1.1 — gaps remain on concerns that omit quoted phrases). No frontend change required until then.

### Evidence concern click-to-highlight

Evidence findings (supported / partial / conflicting) currently lack the click-to-highlight-in-draft behaviour that editorial and compliance concerns have (R5.4). Clicking an evidence finding does not highlight the relevant text in the draft.

- Minimum fix: clicking an evidence finding highlights the whole statement in the draft (reuse the R5.4.6 whole-statement blue-underline fallback).
- Stretch: for partial / conflicting verdicts, highlight the specific unsupported or conflicting clause rather than the whole statement. Requires evidence sub-spans emitted from Stage 2 / Stage 4 — backend work, not just frontend wiring.

Frontend-heavy for the minimum fix; backend work for the stretch. Belongs near R7 (Sources Drawer Revival) bidirectional-navigation work, or as an R5.x follow-up. Logged 2026-05-28.

---

## Active Backlog (Rough Priority Order)

1. *(Consolidated into Watch items → R2.7.1.)* Stage 2 conflict-vs-partial classification — see **Watch items** above.

2. *(Bundled into R4.2 — parked.)* Misleading `[EDITORIAL_REVIEW] starting` log (`visibility: null` before normalisation) in `lib/qc/editorial-compliance-reviewer.mjs`.

3. EventType is not reaching the backend on v4 runs. On the R3.2 test runs, `outputType` resolved correctly (`press_release`) and visibility resolved correctly (`PUBLIC` / `COMPLETE` based on rule firing), but `eventType` resolved to `null`. The Setup screen does not currently include an event-type control, so this may be intentional. Action: decide whether `eventType` is required in the MVP. If not required, remove `eventType` from the Editorial and Compliance prompt user payloads and from the `documentContext` shape rather than leaving `null` placeholders. If required, add the control to the Setup screen and wire it through.

4. Route selection should fail loud. Today, an unset `QC_PIPELINE_V4` env var silently falls back to v3 without any warning. R3.2 testing was nearly invalidated because `vercel dev` did not load `.env.local` into the function process and the selector defaulted to v3 without indicating the env var was undefined. Action: add a one-line log in `api/analyse-statements.js` at the route selection point that prints the resolved env var value alongside the route choice, every request. Example: `console.log(\`[handler] route: ${route} (QC_PIPELINE_V4=${process.env.QC_PIPELINE_V4 ?? "unset"})\`);` — makes the env var state observable in dev logs without needing a Langfuse trace or a temporary log.

5. Document the Vercel dev env setup in the backend README. Today the v4 route selection silently fell back to v3 because `vercel dev` did not load `.env.local` into the function process. The durable fix is registering env vars in Vercel directly: `npx vercel env add QC_PIPELINE_V4 development` then `npx vercel env pull .env.development.local`. Add a "Local development environment" section to the backend README documenting this process — the env vars that must be registered for v4 to work locally (`QC_PIPELINE_V4` at minimum, plus any other vars discovered as the rebuild progresses), the two commands above, and a note that simply having a value in `.env.local` is not sufficient for `vercel dev` to inject it into the function process. This protects future sessions (and any future collaborators) from the same lost-hour debugging cycle.

6. *(Closed — R5.2 shipped; Product backlog #1.)* Within-signal duplicate concern merge. **R3.4 superseded by R6.3 (closed 2026-05-31):** per-instance LLM judgment via `editorial-duplication-judge.mjs` replaces the old rule-ID suppression set; canary `editorial_concern_suppressed_by_judgment`. Editorial-vs-Compliance overlap on promotional language remains intentional unless reviewer feedback says otherwise. Threshold tuning: see **Watch items → R5.2**.

7. Recalibrate signoffVerdict thresholds. The current logic in `useAssessState.jsx` and `useDraftState.jsx` grades a single Conflicting evidence verdict as "Needs targeted revision". Reviewer feedback (R3.6 testing) suggests this is too soft — a direct numeric contradiction warrants stronger language than a "targeted revision". Action: review the thresholds in the signoffVerdict computation; consider grading any Conflicting evidence as "Needs significant work" regardless of overall concern count, or introduce a separate signoff state for unresolved factual contradictions.

8. Tune the synthesise-review system prompt voice. Reviewer feedback (R3.6 testing) flagged two phrasings as off-key: "given the high concern level for evidence" reads as system language leaking into reviewer-facing prose; "aligning with our publication's standards" sounds canned and corporate. Action: revise the system prompt at `api/synthesize-review.js` to instruct the LLM against system-vocabulary leakage ("concern level", "verdict", "signal") and against generic corporate filler ("aligning with our standards", "ensures adherence to guidelines"). Replace with specific, concrete reviewer language.

9. Investigate Editorial review run-to-run variance. R3.6 testing observed that the same draft (causal claim about GDP growth being "driven by expansion of real incomes") produced an editorial concern on one run and no concern on a later run, despite temperature 0. This is a known property of LLM APIs (provider-side variance even at temp 0). Action: assess the scale of the variance with a small repeatability study (run the same 5–10 drafts through Assess 3 times each, log which concerns fire each time, compare). If variance is material, consider mitigations: lower-variance models, ensemble-of-N voting on borderline cases, prompt strengthening on the specific rules that show variance. **Additional evidence (R6.5.4):** F01 live regression S10 `marketing_language_excess` fires on R6.5.4 run, does not fire on R6.5.5 run, with identical statement text and identical source.

10. Confirm that the Statement 1 currency hallucination bug from v3 does not recur on v4. Origin: Evidence Pipeline Quality Sprint (now retired). The v3 pipeline could produce a hallucinated currency reference on the first statement of certain drafts. v4's redesigned Stage 1 (LLM-based extraction with deterministic fallback) should not exhibit this, but it has not been explicitly tested. Action: construct a test draft known to have triggered the bug in v3 (or any draft whose first statement contains ambiguous currency phrasing), run on v4, confirm Stage 1 output and Stage 5 commentary are clean.

11. Consider whether an editorial plausibility cross-check on evidence verdicts adds reviewer value. Origin: Evidence Pipeline Quality Sprint (now retired). The original idea: after Stage 3 deterministically aggregates the evidence verdict, run a lightweight LLM check that asks "given the statement and the source passages, does this verdict look reasonable?" — flagging cases where the deterministic aggregation might be brittle. v4's stages are individually more accurate than v3 was, so the marginal value of this cross-check has decreased. Not on active backlog. Reactivate if pilot testing surfaces cases where v4's verdict logic produces unintuitive results that a plausibility pass would have caught.

12. Stage 1 should filter sign-off blocks and document-structure text. Today Stage 1 sentence extraction treats sign-offs ("Yours sincerely,"), salutations, signature blocks ("The Investment Team"), dates, and "To:" / "From:" / "Re:" headers as content statements requiring evidence verification. This produces false-negative QC cards (Evidence Not Supported on text that shouldn't be checked) and downstream Editorial false positives (voice/tone concerns on closing blocks). Surfaced during R4.1.6 testing using the Lumin Robotics investment memo. Action: extend Stage 1's prompt or add a post-extraction filter to identify and exclude document-structure text. Document the patterns to filter (salutations, dates, signature blocks, header lines) and test against a fixture that contains them.

13. *(Consolidated into Watch items → R2.7.1.)*

14. *(Closed 2026-05-31 via R6.3.)* Expand R3.4 suppression scope to additional editorial rules. **CLOSED 2026-05-31 via R6.3.** Principle-based per-instance LLM judgment replaces rule-ID suppression entirely. New rules added to the editorial rulebook automatically participate in the duplication judgment without requiring suppression-list maintenance. The brittleness this item was attempting to address is dissolved by the architecture change.

15. Upload draft button placement in Your Draft section. R4.1.8 made the Your Draft section flex-grow so the textarea resizes when other sections expand. The Upload draft button remains visible but its visual placement at the bottom of the textarea looks awkward when sections are tight — the button appears to overlap the textarea bottom edge rather than sitting cleanly below it. Two candidate fixes considered and deferred: (a) move the Upload draft button into the section header row alongside History/Save draft/Rewrite, treating it as a draft-loading action consistent with the other draft-management actions, or (b) reduce the textarea's minimum height to give the button more space. Action: pick a fix when next polishing the Setup panel; (a) is the recommended approach as it groups all draft-management actions in one location.

16. **Two-direction concern violations.** `SUGGESTED_DIRECTION_FORMAT_META` in `lib/qc/editorial-compliance-reviewer.mjs` requires every `suggestedDirection` to be a single complete imperative sentence ("Do not emit two fragments joined by 'and'"). Observed in R6.2a.1 Run C that the LLM emitted two directions in one concern: "Replace with more measured language or provide supporting evidence. Replace 'genuinely exceptional and unparalleled in its sector' with 'strong performer in its sector' or similar language." First half is high-level guidance, second half is the specific rewrite — both useful, but split into two sentences violates the meta-rule and produces awkward UI output. Likely fix: strengthen the meta-rule wording to make explicit that "Replace... or provide..." constructions count as two directions, OR introduce a separate `suggestedGuidance` field for the high-level hint distinct from the concrete rewrite. The latter is the cleaner product fix but requires schema work. Lower priority than R5.2 (a). Logged 2026-05-30.

    **Additional evidence 2026-05-30** (R5.2(a) validation runs): pattern observed across all three R5.2(a) test runs. Editorial concerns under `marketing_language_excess` consistently emit two-sentence suggestedDirection of the form "Replace with [high-level guidance]. Replace 'X' with [specific rewrite]." First sentence is generic guidance; second is the specific rewrite. Both are useful but the two-sentence format violates SUGGESTED_DIRECTION_FORMAT_META. Pattern is reproducible — fix is now well-supported by evidence. Likely the right product fix is a separate field for high-level guidance vs concrete rewrite, but a stronger meta-rule wording could also work as a contained interim fix.

17. **Review-toggle wiring not honoured.** The Review modal exposes individual toggles for Editorial / Compliance / Evidence reviews. Observed during R6.4a testing (2026-05-30): selecting only Compliance and running Review still appears to invoke all three reviews. Wasted compute (~3x LLM cost on toggle-restricted runs) and confusing UX (the toggles imply selectivity that isn't honoured). Fix: trace the toggle state through to the analyse-statements call and ensure disabled signals are skipped end-to-end. Medium priority — affects cost on dev/test runs more than production, but the UX inconsistency erodes trust in the toggle controls.

18. **R6.4b UI polish (deferred).** Two cosmetic items from R6.4b live testing (2026-05-30):
  (a) Pills initially show "Unclassified" for several seconds while the LLM classifier runs in the background, then update to the inferred value once classification completes. Visually confusing — looks like the system is wrong, then "fixes itself". Replace initial pill state with an explicit in-flight indicator ("Classifying..." or a subtle loading state). Show one of the three terminal labels only once the publicationState is final.
  (b) Pill positions are inconsistent across source rows because the filename column has variable width. Right-align pills (adjacent to the X remove button) so they line up in a column for cleaner scanning.

Both items are cosmetic, not behavioural. Defer to R7 (Sources Drawer Revival) or fold into a small polish pass when the broader source-row UI is touched.

### Web Search Functionality Sprint
- Scope and reliability of public search integration
- Citation transparency (URLs and snippets surfaced to user)
- Blending rules: draft first, sources second, web last

### Implement-Changes Sprint
- Surface `suggestedRewrite` from QC cards to UI
- Accept / reject / refine workflow for suggested rewrites
- Rewrite notes redesign — deferred from earlier sprint, belongs here

### Spring Clean / Refactor Sprint
- `analyse-statements-impl.mjs` ~38k lines — high risk without test surface coverage; do not start until regression coverage is sufficient
- DEV TOOLS bar removal
- Selection mode removal (identified as legacy)
- Scrolling fix in Draft Output panel — deferred, low priority

### Audio Input
- Optional microphone input for selected text fields: Generate notes, Rewrite instructions, Ask AI
- Browser-native Web Speech API preferred (no backend speech-to-text responsibility)
- Transcribed text treated identically to typed input
- Must not interfere with existing Enter-to-execute behaviour

### Quality Scores
- Definition and rubric TBD — blocked until scoring criteria confirmed
- Word limit behaviour in Adapt (overrides not respected — known bug) — fix in this sprint once rubric is defined

---

## Parked, evidence-gated

These items are intentionally not in the active rebuild backlog. They stay visible so design intent is not lost, but work does not resume until the stated evidence triggers.

### Adapt (parked R4.1)

Adapt is parked. The `api/adapt.js` endpoint and supporting code remain in the codebase but are not linked from any UI. Reactivation trigger: pilot user feedback indicating multi-output workflows are needed, OR an explicit product decision to launch multi-output capability.

### (C) Stage 2 chunking — cost ceiling for long sources

**Open in QC rebuild backlog (C); not an immediate concern.** R3.3 instrumentation logs a warning when any source exceeds 60,000 characters. Initial real-world testing with a 71,463-character PDF source confirmed Stage 2 (`gpt-4o`) still produces clean verdicts at this scale. **Diagnostic evidence (26 May 2026):** F15 (`synth_very_long_memo`, ~4,800 words) ran clean without chunking issues. Reactivate implementation when source-length warnings appear regularly in dev or production logs, OR when typical pilot source documents exceed ~100k characters, OR when verdict quality degrades on long sources. Architecture document section 10 defines the chunking strategy; this is sequencing, not design.

### (D) $2/run production cost target

**Tracking in QC rebuild backlog (D).** Diagnostic pass scheduled inside **R6 scoping** to baseline call count and cost before prompt changes. Current baseline: ~16 LLM calls per run at 4 statements / 1 source; ~$2/run in production. Depends on Stage 2 chunking (C), model choices, and cost-model baseline from R1.x.

### Collapsible left rail post-Review

The left Setup panel takes significant horizontal space post-Review.
The "Hide assessment summary" toggle (in the Results panel header)
already addresses most vertical cramping for QC cards.

A future enhancement could collapse the left Setup panel to an
expandable rail post-Review, with Setup section icons visible (Sources,
Drafting, Your Draft, Review settings) and click-to-expand behaviour.
Reviewer Assessment and Quality Review Summary would move to a
collapsible header above the cards (default expanded on first view of
a run, collapsed after first card interaction).

Three-panel composition post-Review:
- Left: collapsed rail with Setup section icons
- Middle: Your Draft (with R5.3a overlay surface)
- Right: QC cards, full vertical height

Reactivation trigger: vertical cramping recurs as a real issue in
dogfooding, OR a demo/pilot reveals the current layout is hurting the
reviewer experience.

Discussed and parked 2026-05-27.

---

## Architectural debt to revisit when v3 retires

### R3.4 — Rule-ID Editorial suppression on Evidence conflict (superseded)

**R3.4 superseded by R6.3 (closed 2026-05-31).** R6.3 removed the `SUPPRESSED_ON_EVIDENCE_CONFLICT` set and the rule-ID suppression branch entirely from `stage7-assemble-card.mjs`. Editorial concern suppression on Evidence conflict is now handled by per-instance LLM judgment via `editorial-duplication-judge.mjs`. The R3.4 entry is retained here as historical context; no further code references remain.

### R3.1 — Editorial+Style consolidation routing

R3.1 introduced a v4-only combined Editorial+Style review call
while leaving v3's separate Style and Editorial calls in place.
Two coupling points were accepted as pragmatic trade-offs at
the time and should be cleaned up when v3 is decommissioned:

1. `runEditorialComplianceReview` in
   `lib/qc/editorial-compliance-reviewer.mjs` now contains an
   internal branch that selects between the legacy three-call
   path (style + editorial + compliance) and the combined
   two-call path (editorial+style + compliance) based on
   `documentContext.pipelineRoute === "v4"`. The shared wrapper
   carries pipeline-aware logic, which is slightly more coupling
   than ideal. When v3 retires, the wrapper should be simplified
   to call the combined function directly and the route flag
   should be removed.

2. The merged editorial result shape (`editorialConcerns`,
   `editorialVerdict`, `editorialNote`, `editorialSuggestedDirection`,
   `editorialSuggestedRewrite`) is now produced in two places:
   `applyMergedEditorialAndStyle` (used by v3) and the
   combined `runEditorialStyleReview` return contract (used by
   v4). The two paths must stay in sync until v3 retires. When
   v3 is removed, `applyMergedEditorialAndStyle` and the two
   separate functions `runStyleGuideReview` and
   `runEditorialReview` can all be deleted.

No action required today. Note exists so the next person (or
future Ben) doesn't wonder why two code paths produce the same
shape.

### R3.3 — PDF extraction step shared by v3 and v4 routes

R3.3 wired `prepareUploadedSourcesForPipeline` into `api/analyse-statements.js`, which feeds both v3 and v4. This is a preprocessing step in the API handler, not in either pipeline module. When v3 retires, the preprocessing step stays put — it is route-level, not pipeline-level. No cleanup needed. Logged here only so the location of source extraction is documented for future maintainers.

---

## Future Capabilities

### Writing & Intelligence
- Style Guide Engine: persistent investment-writing rules per team, brand, or output type (tone constraints, forbidden phrases, preferred language patterns) — extends current banned words into a full rule set
- Multilingual: draft translation (input or output)
- Guided revision: stepwise editing suggestions with structured improve cycles
- Multi-model orchestration: large models for reasoning, cheaper models for summarisation

### Export & Audit
- Export Packager: full bundle — draft + source trace + statement table + Q&A log + version trail
- Document traceability and audit logs: each version logged with full metadata

### Knowledge & Memory
- Org document embeddings: private corpus grounding for long-term projects
- Knowledge memory retrieval: persistent source library across sessions

### Analytics & Dashboards (Pre-Enterprise)
- Writer-facing dashboard: personal QC history, recurring flags, common evidence gaps, quality trends over time
- Management-facing dashboard: team output volume, QC pass/fail rates, common compliance and editorial issues across the team, coverage by output type
- Both views require a persistent session/document store — currently all state is in-memory

### Quality Score Visualisation (Pre-Enterprise)
- Radar/web chart displaying quality score across defined axes (e.g. evidence strength, editorial clarity, compliance risk, structural integrity)
- Requires Quality Scores to be defined and implemented first (currently parked in backlog)
- Intended as a writer-facing tool for understanding draft quality at a glance

### Enterprise
- Multi-user accounts: reviewer comments, approvals, link-share
- Enterprise connectors: eFront, OneSource, SharePoint, Teams, Outlook, Drive
- Approval chain and audit trail logging
- No-public-domain safety setting (compliance mode, non-web search option)
- Customer tenant deployment / managed hosting
- Workflow automation: job triggers, job queuing, assignment to writers, post-approval upload to Content Management Systems (CMS connectors will be client-specific; Export Packager is the prerequisite)

---

## Where This File Lives

Backend repo only (`brightline-content-engine-backend`), at `docs/ROADMAP.md`. Single source of truth. Do not duplicate into the frontend repo or the repo root.

---

## Review Correctness Principles (Non-Negotiable)

These invariants define the minimum trust bar for the QC evidence pipeline. If any are violated, Review output must be treated as unreliable. All backend development affecting statement analysis must be checked against these before handoff.

1. **Truthful absence claims** — Review must never say a fact, term, or number is "not mentioned" or "not supported" unless a corpus-level search over the full uploaded text was performed and found no match.
2. **No false "missing sources" language** — If uploaded sources exist, Review must not imply the user "provided no sources" or that "no sources exist."
3. **Citation–evidence consistency** — If citations are present, evidence must be resolvable to reference titles or URLs. Uploaded sources may have `url: null` and are still valid. "Citations missing" only when citations are actually empty.
4. **Correctness over confidence** — Review must not emit confident absence claims if the system has not checked the full relevant corpus.
5. **Ambiguity is not absence** — If multiple plausible anchor values exist (e.g. multiple valuations), Review must flag ambiguity and name the competing values — never claim "not mentioned."
6. **Contradiction scope** — "Contradicted" applies only to statement-vs-sources conflicts. Draft-to-draft internal consistency is out of scope for Review.
7. **Explain, don't rewrite** — Review diagnoses and explains; it may provide structural or evidentiary guidance but must not propose rewritten sentences verbatim.
8. **Deterministic safeguards for anchors** — Numeric and anchor facts (valuation, funding, dates, percentages) must be normalised (e.g. `$25mm` == `$25 million`) before declaring mismatch or absence.
