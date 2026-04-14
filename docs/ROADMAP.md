# Brightline Content Engine — Master Roadmap

> **Vision:** Enable investment writers to produce, review, and govern institutional-grade content with speed, auditability, and confidence.

Last updated: April 2026

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

### Backend Architecture
- LLM-last architecture: verdict, classification, and concern level deterministic; LLM commentary runs after
- `StatementReviewCard`, `statementAnalysisHelpers.js`, `qcWorkbenchFilters.js` extracted
- `qc-v2-pipeline.mjs` split into focused modules

---

## Active Backlog (Rough Priority Order)

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

Backend repo only (`brightline-content-engine-backend`). Single source of truth. Do not duplicate into the frontend repo.

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
