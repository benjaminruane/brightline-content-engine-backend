# Brightline Content Engine — Master Roadmap

> **Vision:** Enable investment writers to produce, review, and govern institutional-grade content with speed, auditability, and confidence.

Last updated: 2026-05-18

---

## Working rules

### UI naming

- The app's **UI name** is **Content Engine** (working title). User-visible strings — footers, modals, disclaimers, exports, and other copy shown to reviewers — use **Content Engine** or no product name. **Brightline** does not appear in UI strings.
- **Brightline Content Engine** remains the **internal project name** (repos, roadmap, architecture docs, operator-facing material).

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

- **R5.5 — Compliance disclaimer footer** (shipped 2026-05-18). Results panel page footer plus PDF/DOCX export footer (canonical copy, single constant); timestamp consistency audit with shared `formatRelativeTime` / `formatAbsoluteTime` helpers. **Frontend:** `v8.47.0-disclaimer-and-timestamps`. **Backend:** `r5.5-export-disclaimer`.
- **R4.3 — Visibility wiring** (shipped 2026-05-17). Expanded confidential-detail rule, new disclosure-absent rule, new jargon rule (version-aware), Compliance and Editorial+Style system-prompt visibility calibration. Tag: `r4.3-visibility-wiring`.
- **R5.1 — Per-concern span derivation on v4** (shipped 2026-05-17). Editorial coverage ~96%, Compliance ~56%. Tag: `r5.1-concern-spans`.
- **R5.1.1 — Compliance prompt instructs phrase quoting** (shipped 2026-05-17). Compliance span coverage rose from ~56% to ~83% across post-deploy validation runs. Tag: `r5.1.1-compliance-phrase-quoting`.
- **Reviewer Assessment synthesis** (closed in R4.x). Narrative synthesis in senior editor voice; see Completed → Source Management.
- **Cost model spreadsheet** (closed in R1.x). See `docs/BACKLOG.md` Closed → P1.
- **R1.2 gpt-4o-mini Stage 2 source-matching evaluation** (closed via R1.2, R1.2.4, R1.2.5). Production Stage 2 remains gpt-4o + prompt v2.

### Governance docs (frontend repo)

- **`docs/FRONTEND_CONVENTIONS.md`** (brightline-content-engine-frontend) — created with R5.5. Documents the user-visible timestamp convention: **relative** time for lists and drawers (`formatRelativeTime`, tier definitions: Just now → minutes/hours → Yesterday at HH:MM → days ago → DD/MM/YYYY); **absolute** time for audit moments (`formatAbsoluteTime`, `DD/MM/YYYY, HH:MM GMT+8`). Canonical review disclaimer constant location also noted.

---

## QC rebuild backlog

Status of rebuild optimisation and cost items from the v4 planning track:

| ID | Item | Status |
|----|------|--------|
| **(A)** | LLM call consolidation | **R3.1 shipped** — Style+Editorial merged on v4 (`runEditorialStyleReview`). **Compliance deliberately kept separate** (different cognitive frame, reviewer trust; ~$0.02/run saving not worth signal dilution). **R3.2** (Stage 5 into Stage 2) **DEFERRED** — needs Stage 2 restructure; loses parallelisation. |
| **(B)** | Visibility wiring (Complete vs Public) | **CLOSED** via R4.3 (`r4.3-visibility-wiring`). |
| **(C)** | Stage 2 chunking cost ceiling for long sources | **Open** — evidence-gated; see Parked → (C) below. |
| **(D)** | $2/run production cost target | **Open** — no spec yet; depends on (C), model choices, and call-count baseline after v4 dogfooding. |

---

## R5 — Concern spans & draft highlighting

Sequence locked in 2026-05-17 planning session (in delivery order):

| Spec | Summary | Status |
|------|---------|--------|
| **R5.1** | Per-concern span derivation on v4 | **SHIPPED** — `r5.1-concern-spans` |
| **R5.1.1** | Compliance prompt encourages phrase quoting | **SHIPPED** — `r5.1.1-compliance-phrase-quoting` |
| **R5.1.2** | Confidential-detail rule covers unlabelled return multiples — expand `precise_confidential_detail_in_public_version` description to call out unlabelled return figures (e.g. “3.2x net of fees”, “delivered 4.5x”). LLM currently fires once per sentence and picks the most unambiguous metric (EV/EBITDA), missing MOIC-style figures. Promoted from R4.3 watch — pattern confirmed across two test batches. | Planned |
| **R5.2** | Span-based within-signal duplicate concern merge (supersedes product backlog “merge duplicate concerns”; uses R5.1 spans) | Planned |
| **R5.3a** | Convert “Your Draft” textarea to overlay-capable surface (frontend foundation). **Path Y locked**; DraftContextPanel revival ruled out | Planned |
| **R5.3b** | Statement-level traffic-light colour-coding in draft area with toggle, **off by default** | Planned |
| **R5.4** | Wire existing “Highlight in draft” button (dead since R4.1) plus concern bullets, using R5.1 spans, to scroll-and-highlight on the R5.3a surface | Planned |
| **R5.5** | Compliance disclaimer footer (Results panel + PDF/DOCX exports); timestamp consistency audit | **SHIPPED** — frontend `v8.47.0-disclaimer-and-timestamps`, backend `r5.5-export-disclaimer` |

**R5.2 scoping note (deferred):** Span derivation currently picks the **first** quoted phrase from a concern note. When one concern quotes multiple phrases (e.g. `'2/20'`, `'soft hurdle'`, and `'ratcheted carry'`), only the first becomes a span. R5.2 should decide whether to: **(a)** emit multiple spans per concern, **(b)** extend a single span to encompass all quoted phrases, or **(c)** accept first-phrase-only behaviour and rely on R5.4 frontend highlighting broader statement context. Decision deferred to R5.2 scoping.

---

## R4.2 — Dead-code cleanup (parked)

Parked pending dogfooding evidence. Bundle:

- **Cosmetic:** `[EDITORIAL_REVIEW] starting` log prints `visibility: null` before `normalize*` — stale pre-normalisation values (`lib/qc/editorial-compliance-reviewer.mjs`).
- **Cosmetic:** `qcCard.pipelineVersion: "v3"` appears on v4 runs (misleading label in `stage7-assemble-card.mjs`).
- **v3 retirement:** decommission v3 route and dual-path editorial/compliance code once dogfooding evidence accumulates (target: 15–25 production traces, no canary fires; see Architectural debt → R3.1).
- **Legacy timestamp formatting (frontend):** `DraftOutputPanel.jsx`, `WritingBadge.jsx`, and `DraftContextPanel.jsx` still use `toLocaleString` for timestamp display (legacy Writing/Quality surfaces). Intentionally not touched in R5.5 — surfaces may be unreachable post-R4.1 and could be removed with dead code. **R4.2 scoping:** confirm reachability; either migrate to `formatRelativeTime` / `formatAbsoluteTime` (see frontend `docs/FRONTEND_CONVENTIONS.md`) or delete with the unreachable panels.

---

## Product backlog

Tracked here for roadmap visibility; detail rows also live in `docs/BACKLOG.md`.

| # | Item | Status / notes |
|---|------|----------------|
| 1 | Merge duplicate concerns | **Reassigned to R5.2** (span-based within-signal merge). R3.4 partial fix (Evidence-vs-Editorial on `conflicting` only) remains shipped. |
| 2 | Align Direction intensity — Evidence softer than others | Open |
| 3 | Reviewer comments follow house style | Open |
| 4 | Hide Editorial on conflict | Open (R3.4 scoped to two rule codes on conflicting Evidence only) |
| 5 | E2 deterministic reimplementation | Open |
| 6 | Fidelity log traceability | Low priority — bundle into R4.2 or Spring clean |
| 7 | Implement-changes sprint (`suggestedRewrite` → UI) | Open — see Active Backlog → Implement-Changes Sprint |
| 8 | Spring clean / refactor | Open — see Active Backlog → Spring Clean |
| 9 | Public version prompt | Open |

---

## Watch items

No spec until trigger conditions met. Do not schedule ahead of dogfooding signal.

### R2.7.1 — Stage 2 conflict vs partial

Monitor Stage 2 **conflict-vs-partial** classification across the **next 10–20 traces**. **Pattern to watch:** absent-fact statements landing as `conflicting` rather than `partially_confirmed`. **Action if pattern persists:** tighten Stage 2 prompt. **No action** if the pattern does not recur on a diverse trace set.

---

## Active Backlog (Rough Priority Order)

1. *(Consolidated into Watch items → R2.7.1.)* Stage 2 conflict-vs-partial classification — see **Watch items** above.

2. *(Bundled into R4.2 — parked.)* Misleading `[EDITORIAL_REVIEW] starting` log (`visibility: null` before normalisation) in `lib/qc/editorial-compliance-reviewer.mjs`.

3. EventType is not reaching the backend on v4 runs. On the R3.2 test runs, `outputType` resolved correctly (`press_release`) and visibility resolved correctly (`PUBLIC` / `COMPLETE` based on rule firing), but `eventType` resolved to `null`. The Setup screen does not currently include an event-type control, so this may be intentional. Action: decide whether `eventType` is required in the MVP. If not required, remove `eventType` from the Editorial and Compliance prompt user payloads and from the `documentContext` shape rather than leaving `null` placeholders. If required, add the control to the Setup screen and wire it through.

4. Route selection should fail loud. Today, an unset `QC_PIPELINE_V4` env var silently falls back to v3 without any warning. R3.2 testing was nearly invalidated because `vercel dev` did not load `.env.local` into the function process and the selector defaulted to v3 without indicating the env var was undefined. Action: add a one-line log in `api/analyse-statements.js` at the route selection point that prints the resolved env var value alongside the route choice, every request. Example: `console.log(\`[handler] route: ${route} (QC_PIPELINE_V4=${process.env.QC_PIPELINE_V4 ?? "unset"})\`);` — makes the env var state observable in dev logs without needing a Langfuse trace or a temporary log.

5. Document the Vercel dev env setup in the backend README. Today the v4 route selection silently fell back to v3 because `vercel dev` did not load `.env.local` into the function process. The durable fix is registering env vars in Vercel directly: `npx vercel env add QC_PIPELINE_V4 development` then `npx vercel env pull .env.development.local`. Add a "Local development environment" section to the backend README documenting this process — the env vars that must be registered for v4 to work locally (`QC_PIPELINE_V4` at minimum, plus any other vars discovered as the rebuild progresses), the two commands above, and a note that simply having a value in `.env.local` is not sufficient for `vercel dev` to inject it into the function process. This protects future sessions (and any future collaborators) from the same lost-hour debugging cycle.

6. *(Reassigned to R5.2 — Product backlog #1.)* Merge duplicate concerns within a signal using R5.1 spans. R3.4 partial fix remains (suppress `overreach_unsupported_causal` and `internal_plausibility` on Evidence `conflicting`; canary `editorial_concern_suppressed_by_evidence`). Editorial-vs-Compliance overlap on promotional language remains intentional unless reviewer feedback says otherwise.

7. Recalibrate signoffVerdict thresholds. The current logic in `useAssessState.jsx` and `useDraftState.jsx` grades a single Conflicting evidence verdict as "Needs targeted revision". Reviewer feedback (R3.6 testing) suggests this is too soft — a direct numeric contradiction warrants stronger language than a "targeted revision". Action: review the thresholds in the signoffVerdict computation; consider grading any Conflicting evidence as "Needs significant work" regardless of overall concern count, or introduce a separate signoff state for unresolved factual contradictions.

8. Tune the synthesise-review system prompt voice. Reviewer feedback (R3.6 testing) flagged two phrasings as off-key: "given the high concern level for evidence" reads as system language leaking into reviewer-facing prose; "aligning with our publication's standards" sounds canned and corporate. Action: revise the system prompt at `api/synthesize-review.js` to instruct the LLM against system-vocabulary leakage ("concern level", "verdict", "signal") and against generic corporate filler ("aligning with our standards", "ensures adherence to guidelines"). Replace with specific, concrete reviewer language.

9. Investigate Editorial review run-to-run variance. R3.6 testing observed that the same draft (causal claim about GDP growth being "driven by expansion of real incomes") produced an editorial concern on one run and no concern on a later run, despite temperature 0. This is a known property of LLM APIs (provider-side variance even at temp 0). Action: assess the scale of the variance with a small repeatability study (run the same 5–10 drafts through Assess 3 times each, log which concerns fire each time, compare). If variance is material, consider mitigations: lower-variance models, ensemble-of-N voting on borderline cases, prompt strengthening on the specific rules that show variance.

10. Confirm that the Statement 1 currency hallucination bug from v3 does not recur on v4. Origin: Evidence Pipeline Quality Sprint (now retired). The v3 pipeline could produce a hallucinated currency reference on the first statement of certain drafts. v4's redesigned Stage 1 (LLM-based extraction with deterministic fallback) should not exhibit this, but it has not been explicitly tested. Action: construct a test draft known to have triggered the bug in v3 (or any draft whose first statement contains ambiguous currency phrasing), run on v4, confirm Stage 1 output and Stage 5 commentary are clean.

11. Consider whether an editorial plausibility cross-check on evidence verdicts adds reviewer value. Origin: Evidence Pipeline Quality Sprint (now retired). The original idea: after Stage 3 deterministically aggregates the evidence verdict, run a lightweight LLM check that asks "given the statement and the source passages, does this verdict look reasonable?" — flagging cases where the deterministic aggregation might be brittle. v4's stages are individually more accurate than v3 was, so the marginal value of this cross-check has decreased. Not on active backlog. Reactivate if pilot testing surfaces cases where v4's verdict logic produces unintuitive results that a plausibility pass would have caught.

12. Stage 1 should filter sign-off blocks and document-structure text. Today Stage 1 sentence extraction treats sign-offs ("Yours sincerely,"), salutations, signature blocks ("The Investment Team"), dates, and "To:" / "From:" / "Re:" headers as content statements requiring evidence verification. This produces false-negative QC cards (Evidence Not Supported on text that shouldn't be checked) and downstream Editorial false positives (voice/tone concerns on closing blocks). Surfaced during R4.1.6 testing using the Lumin Robotics investment memo. Action: extend Stage 1's prompt or add a post-extraction filter to identify and exclude document-structure text. Document the patterns to filter (salutations, dates, signature blocks, header lines) and test against a fixture that contains them.

13. *(Consolidated into Watch items → R2.7.1.)*

14. Expand R3.4 suppression scope to additional editorial rules. R3.4 currently suppresses `overreach_unsupported_causal` and `internal_plausibility` from `editorialConcerns` when Evidence verdict is `conflicting`. R4.1.6 testing surfaced a case where a `narrative_coherence` concern (or similar `internal_consistency` variant) fired on a conflicting statement with body text directly referencing the factual mismatch ("This inconsistency disrupts narrative coherence"). This is the same duplication pattern R3.4 was intended to prevent, but the rule code isn't in R3.4's suppression list. Action: audit the full editorial+style rulebook to identify all rules that fire on factual misalignment with sources. Extend the `SUPPRESSED_ON_EVIDENCE_CONFLICT` set in `lib/qc/pipeline-v3/stage7-assemble-card.mjs`. Candidates include `narrative_coherence`, `internal_consistency`, `claim_evidence_alignment`, and any others where the concern body references factual disagreement with sources.

15. Upload draft button placement in Your Draft section. R4.1.8 made the Your Draft section flex-grow so the textarea resizes when other sections expand. The Upload draft button remains visible but its visual placement at the bottom of the textarea looks awkward when sections are tight — the button appears to overlap the textarea bottom edge rather than sitting cleanly below it. Two candidate fixes considered and deferred: (a) move the Upload draft button into the section header row alongside History/Save draft/Rewrite, treating it as a draft-loading action consistent with the other draft-management actions, or (b) reduce the textarea's minimum height to give the button more space. Action: pick a fix when next polishing the Setup panel; (a) is the recommended approach as it groups all draft-management actions in one location.

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

**Open in QC rebuild backlog (C); evidence-gated here.** R3.3 instrumentation logs a warning when any source exceeds 60,000 characters. Initial real-world testing with a 71,463-character PDF source confirmed Stage 2 (`gpt-4o`) still produces clean verdicts at this scale. Reactivate implementation when source-length warnings appear regularly in dev or production logs, OR when typical pilot source documents exceed ~100k characters, OR when verdict quality degrades on long sources. Architecture document section 10 defines the chunking strategy; this is sequencing, not design.

### (D) $2/run production cost target

**Open in QC rebuild backlog (D).** No spec yet. Depends on Stage 2 chunking (C), stable v4 call counts after dogfooding, and cost-model baseline from R1.x.

---

## Architectural debt to revisit when v3 retires

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
