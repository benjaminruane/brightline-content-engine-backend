# Brightline Content Engine — Master Roadmap

> **Vision:** Enable investment writers to produce, review, and govern institutional-grade content with speed, auditability, and confidence.

Last updated: May 2026

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

## Active Backlog (Rough Priority Order)

1. Watch Stage 2 conflict-vs-partial drift on absent-fact statements. Origin: R2.7.1 (Stage 2 explanation enrichment). After R2.7.1, Run 4 of the R2.7.1 testing plan ("Shopify plans to grow by investing in marketing, international expansion, and acquiring a competitor") came back as `conflicting` rather than the previously-observed `partially_confirmed`. Both are defensible under architecture section 5.2 — the source describes a different growth plan, which can be read as contradiction or absence depending on framing. Action: review Stage 2 classifications across the next 10-20 accumulated traces. If absent-fact statements consistently classify as `conflicting` rather than `partially_confirmed`, open a spec to tighten the Stage 2 prompt's distinction between "source describes something different" (partial) and "source directly contradicts" (conflict). No action required if the pattern does not recur.

2. Fix the misleading `[EDITORIAL_REVIEW] starting` log in `lib/qc/editorial-compliance-reviewer.mjs` (or wherever the log is emitted). The current log prints `documentContext.requiredVersion` / `outputType` / `eventType` **before** the `normalize*` calls run, so visibility and eventType often appear as `null` even when downstream behaviour is correct (visibility reaches the rule filter as `PUBLIC` / `COMPLETE` after normalisation). Change the log to print the post-normalisation resolved values so future debugging matches actual runtime behaviour. Origin: R3.2 diagnosis, where this misleading log cost roughly an hour of debugging on the wrong hypothesis.

3. EventType is not reaching the backend on v4 runs. On the R3.2 test runs, `outputType` resolved correctly (`press_release`) and visibility resolved correctly (`PUBLIC` / `COMPLETE` based on rule firing), but `eventType` resolved to `null`. The Setup screen does not currently include an event-type control, so this may be intentional. Action: decide whether `eventType` is required in the MVP. If not required, remove `eventType` from the Editorial and Compliance prompt user payloads and from the `documentContext` shape rather than leaving `null` placeholders. If required, add the control to the Setup screen and wire it through.

4. Route selection should fail loud. Today, an unset `QC_PIPELINE_V4` env var silently falls back to v3 without any warning. R3.2 testing was nearly invalidated because `vercel dev` did not load `.env.local` into the function process and the selector defaulted to v3 without indicating the env var was undefined. Action: add a one-line log in `api/analyse-statements.js` at the route selection point that prints the resolved env var value alongside the route choice, every request. Example: `console.log(\`[handler] route: ${route} (QC_PIPELINE_V4=${process.env.QC_PIPELINE_V4 ?? "unset"})\`);` — makes the env var state observable in dev logs without needing a Langfuse trace or a temporary log.

5. Document the Vercel dev env setup in the backend README. Today the v4 route selection silently fell back to v3 because `vercel dev` did not load `.env.local` into the function process. The durable fix is registering env vars in Vercel directly: `npx vercel env add QC_PIPELINE_V4 development` then `npx vercel env pull .env.development.local`. Add a "Local development environment" section to the backend README documenting this process — the env vars that must be registered for v4 to work locally (`QC_PIPELINE_V4` at minimum, plus any other vars discovered as the rebuild progresses), the two commands above, and a note that simply having a value in `.env.local` is not sufficient for `vercel dev` to inject it into the function process. This protects future sessions (and any future collaborators) from the same lost-hour debugging cycle.

6. Merge duplicate concerns — partial fix shipped in R3.4. R3.4 addressed the Evidence-vs-Editorial duplication on conflicting statements by suppressing `overreach_unsupported_causal` and `internal_plausibility` from `editorialConcerns` when Evidence verdict is `conflicting`. The Langfuse canary `editorial_concern_suppressed_by_evidence` tracks suppression frequency. **Remaining open:** (a) Evidence-vs-Editorial duplication on `partially_confirmed` verdicts (R3.4 deliberately scoped to conflicting only). Reactivate if the same noise pattern shows up on partials. (b) Editorial-vs-Compliance overlap on promotional language (e.g. `marketing_language_excess` + `regulatory_prohibited_language` firing on the same sentence). Reviewed and judged intentional — both signals serve distinct reviewer decisions (craft vs regulatory). No fix planned; revisit if reviewer feedback indicates the overlap is genuinely noisy rather than complementary.

7. Recalibrate signoffVerdict thresholds. The current logic in `useAssessState.jsx` and `useDraftState.jsx` grades a single Conflicting evidence verdict as "Needs targeted revision". Reviewer feedback (R3.6 testing) suggests this is too soft — a direct numeric contradiction warrants stronger language than a "targeted revision". Action: review the thresholds in the signoffVerdict computation; consider grading any Conflicting evidence as "Needs significant work" regardless of overall concern count, or introduce a separate signoff state for unresolved factual contradictions.

8. Tune the synthesise-review system prompt voice. Reviewer feedback (R3.6 testing) flagged two phrasings as off-key: "given the high concern level for evidence" reads as system language leaking into reviewer-facing prose; "aligning with our publication's standards" sounds canned and corporate. Action: revise the system prompt at `api/synthesize-review.js` to instruct the LLM against system-vocabulary leakage ("concern level", "verdict", "signal") and against generic corporate filler ("aligning with our standards", "ensures adherence to guidelines"). Replace with specific, concrete reviewer language.

9. Investigate Editorial review run-to-run variance. R3.6 testing observed that the same draft (causal claim about GDP growth being "driven by expansion of real incomes") produced an editorial concern on one run and no concern on a later run, despite temperature 0. This is a known property of LLM APIs (provider-side variance even at temp 0). Action: assess the scale of the variance with a small repeatability study (run the same 5–10 drafts through Assess 3 times each, log which concerns fire each time, compare). If variance is material, consider mitigations: lower-variance models, ensemble-of-N voting on borderline cases, prompt strengthening on the specific rules that show variance.

### Evidence Pipeline Quality Sprint
- False `not_supported` verdicts — most pressing accuracy issue
- Excerpt quality and reliability
- Sentence splitting: fragmentation and incomplete statements
- Editorial plausibility pass on evidence verdicts
- Atomised subclaim problem — A7.38 reverted, needs redesign
- Statement 1 currency hallucination — deferred, revisit in this sprint
- Public version flag in writing prompt — deferred, revisit in this sprint

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

### (C) Stage 2 chunking — cost ceiling for long sources

**Parked.** R3.3 instrumentation now logs a warning whenever any source exceeds 60,000 characters. Initial real-world testing with a 71,463-character PDF source confirmed Stage 2 (`gpt-4o`) still produces clean verdicts at this scale. Reactivate this item when source-length warnings start appearing regularly in dev or production logs, OR when typical Partners Group source documents in pilot testing exceed ~100k characters, OR when verdict quality begins to degrade on long sources. Architecture document section 10 already defines the chunking strategy; this is sequencing, not design.

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
