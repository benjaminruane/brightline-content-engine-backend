# Brightline Content Engine — AI Operating Manual

## Product
Brightline Content Engine is an evidence-first, deterministic, audit-safe reviewer-assist platform for written outputs.

## Core Principles
- Evidence first
- Deterministic behaviour
- Backend is authoritative
- No generative fallback fluff
- Conclusions must be traceable to source evidence
- Minimal diffs preferred
- Do not redesign stable plumbing unless explicitly required

## Working Model
1. Spec is written
2. Cursor implements
3. Ben commits immediately
4. Vercel deploys
5. Ben tests in live environment
6. Evidence is reviewed
7. Next spec is written only after evidence review

## Response Rules
- Be concise
- No drip-feeding
- No teasing future ideas
- Give the full recommendation directly
- Do not repeatedly restate known context
- Use plain language

## Spec Expectations
- Include a plain-language summary outside the spec block
- Include a one-line commit message
- Put only the spec inside the spec block
- Keep diffs minimal
- Be operational and concrete

## Spec, commit, and tag naming convention

Every unit of work has ONE reference (the "ref") that is identical everywhere it appears.

### REF FORMAT

- R-series for all post-rebuild work: R<major>.<minor>[.<patch>][<letter>] (e.g. R6.2, R6.2e, R2.7.2, R2.7.2.1).
- The ref is assigned when the spec is written and never changes.

### WHERE THE REF APPEARS (must match exactly)

1. **SPEC ID** — `SPEC ID: R6.2e`
2. **Commit message** — `R6.2e — <short description>` (ref, space, em-dash, space, lower-case description)
3. **Git tag** — `r6.2e-<short-descriptor>` (lower-case ref, hyphen, hyphenated descriptor, no spaces)
4. **docs/ROADMAP.md** — status line references R6.2e
5. **docs/BACKLOG.md** — closing/logging row references R6.2e

### TAG RULES

- Backend and frontend tag in their own repos.
- Tag the spec ref, not a version number, for backend feature work. (v8.x version tags are legacy from the qc-rebuild sprint, originally `v8.x-qc-rebuild-[descriptor]` per the rebuild architecture doc; not continued for new R-series work.)
- One tag per shipped spec. Split specs (e.g. R6.2e / R6.2f) tag separately to preserve regression isolation.

### NON-R WORK

- Named work-streams without an R-ref (e.g. `commentary-calibration`) tag by their name, lower-case, hyphenated. Use sparingly; prefer assigning an R-ref.

### THE INVARIANT

- The point is traceability: any tag leads back through commit → SPEC ID → ROADMAP/BACKLOG to exactly what changed and why. If you can trace it, the prefix letter does not matter.

## Verification-by-grep discipline

When a previous spec produced incorrect output that was reported as correct by the implementer, the follow-up spec must require explicit verification with verbatim output of the verification results.

Verification mechanisms include:

- **Positive-anchor greps** — text that MUST be present after the operation
- **Negative-contamination greps** — text that MUST NOT be present after the operation

The verification output must be included verbatim in the implementer's summary so Ben can audit. Do not claim success without grep evidence when the spec requires it.

**Canonical example:** **D1.3.2** — v2 drafts loaded into eight fixture JSONs; each fixture had unique v2 anchor strings (must match) and v1 contaminant strings (must not match); Cursor summary included one PASS/FAIL line per check plus verbatim `grep` output.

**Trace the live execution path before iterating on prompt content.** R6.4a's classifier prompt was iterated twice (R6.4a then R6.4a.1) because the LLM was returning "unknown" on a press release with clear public-distribution markers. The actual root cause was that the classifier was never being called — the Assess module's upload handler did not invoke apiSummarizeSource. Spent two iteration cycles chasing prompt calibration for behaviour that wasn't being exercised. The signal that should have caught it earlier: the source object in frontend state was missing the long-stable "description" field alongside the new "publicationState" field, which indicated the summariser wasn't running at all.

Discipline: when a feature shows no observable effect after a code change, **first verify the code path is being exercised end-to-end**, then iterate on what happens inside it. An "orient" task for an upcoming spec should ask "trace the live execution path from user action to outcome" rather than "show me the relevant code." The architectural fact that broke this for R6.4a (Assess module replaces Draft module's state hook) was not surfaced by show-me-the-code framings.

## Testing Expectations
- Usually max 3 runs per batch
- Reuse existing source files unless new ones are strictly necessary
- Evidence should include Cursor summary, JSON responses, screenshots, and Vercel logs when relevant

## Product Constraint
- QC output must be practically useful, not only technically correct

## QC Output Language Standard

All QC output shown to users — verdicts, commentary, explanations, hover text, and popups — must be written in plain language as an experienced reviewer or editor would write to a writer. Requirements:

- No system language (e.g. "entity", "relation", "canonical claim", "corpus")
- No generic filler (e.g. "the source discusses related subject matter")
- No technical jargon
- Always specific and concrete — reference the actual claim and the actual source content
- Always actionable — tell the writer what the issue is and what to do about it
- Tone: direct, professional, constructive

This standard applies to all commentary fields: `commentaryPayload`, `whatThisShows`, `whatIsNotShown`, `whyItMattersText`, `evidenceSummary`, and any other user-facing text fields in the QC output.

## Deterministic Backstops for Style Rules

Where a style rule depends on a structurally-checkable property (e.g. comma counts for Oxford comma, regex patterns for thousand separator), the LLM rule wording is the primary instruction but a deterministic filter is the final arbiter. This protects against the LLM firing concerns on correctly-formatted text — a failure mode observed across multiple rules in R6.5 testing.

Backstops live in `STYLE_RULE_DETERMINISTIC_FILTERS` in `lib/qc/editorial-compliance-reviewer.mjs`. Each predicate receives `(citedSpan, statementText, fullDraftText)` and returns TRUE to keep the concern, FALSE to drop. Predicates can be span-local (most rules), statement-scoped (`thousand_separator`, `currency_format`), or draft-aware (`defined_term_capitalisation`).

Add a backstop when:
- The rule has a structurally-checkable property (regex, character count, presence/absence of a pattern)
- The LLM has demonstrated false-positive firing on correct text
- The deterministic check is cheap and safe (errs toward keeping concerns rather than dropping them in ambiguous cases)

Don't add a backstop when:
- The rule requires semantic judgment (e.g. "promotional language")
- The structural property is hard to define deterministically
- The cost of a false-negative suppression is high

When in doubt, write the rule wording first, observe behaviour, and add a backstop only if the LLM proves unreliable on a structurally-checkable case.

## Change Surface Discipline

When proposing development specs:

1. First identify the smallest viable change surface in the existing codebase.
2. Prefer modifying the narrowest module that directly affects the desired behaviour.
3. Avoid proposing changes across multiple pipeline stages unless absolutely necessary.
4. Do not introduce new architectural layers when a local modification would achieve the goal.
5. Do not modify upstream extraction, canonical claims, or evidence binding unless the problem specifically originates there.

Specs should aim for the smallest safe intervention that materially improves the user-visible outcome.

## Diagnostic Discipline

When a recurring issue persists across two or more spec iterations targeting the same symptom without resolution, stop writing specs and diagnose instead — the issue isn't where the specs assume it is. Apply diagnostic discipline before any behavioural change to existing modules: read the current code, confirm assumptions, inspect actual prompts and outputs, before speccing.

Instead of another fix attempt, run a diagnostic:

1. Ask Cursor to inspect the deployed code and confirm it matches
   the spec that was supposedly implemented.
2. Add temporary logging to capture what the runtime is actually
   doing — what prompts are sent, what outputs are returned, what
   state flows between stages.
3. Run one representative test case through the instrumented code
   and capture the evidence.
4. Produce a short diagnostic report identifying the real root
   cause.
5. Only then write the fix spec.

This avoids the common failure mode of repeatedly patching around
a symptom because the real cause sits somewhere the specs haven't
looked. Diagnosis is cheap, specs that keep missing are expensive.

Early diagnosis is preferred over blind speccing. If a spec's
testing reveals unexpected behaviour, prefer a diagnostic pass
before the next spec.

Do not rely on memory or assumptions about the codebase state when the cost of being wrong is a wasted sprint. A read-only diagnostic is always cheaper than a wrong spec.

Diagnostics are also the right tool when assumptions about prior work need confirming — e.g. "is X already wired through?", "did Y ship as I remember?". Cursor's diagnostic report becomes the source of truth, not conversation memory.

The diagnostic itself should be:

- Explicitly read-only
- Scoped to specific questions
- Structured so answers can be checked against the spec
- Free of speculation or recommendations (those happen after the report lands)

## Spec Sequencing

Prefer multiple small sequenced sprints over one large bundled sprint when changes touch different surfaces (backend → frontend, multiple modules, different risk profiles).

Bundling two architectural changes into one sprint means losing the ability to isolate which change caused any regression. Sequencing also produces natural checkpoints for evidence review and reduces test burden per sprint.

When in doubt, split. A small sprint that ships cleanly is more valuable than a large sprint that ships with uncertainty about which component broke what.

Concrete examples of correct sequencing:

- **R5** split into R5.1 (backend spans), R5.2 (merge), R5.3a (frontend surface), R5.3b (colour-coding), R5.4 (click-to-locate). Five sprints, each independently testable.
- **R3.1** merged Style + Editorial only. **R3.2** (Stage 5 into Stage 2) explicitly deferred as a separate sprint because Stage 2 restructure is a different change surface.

## Principle-Based Signal Suppression

Signal-suppression decisions should be principle-based and per-instance, not rule-ID-based and per-class.

When the system needs to suppress a signal in some contexts (e.g. drop Editorial concerns that duplicate an Evidence-conflict finding), the suppression mechanism should:
- Judge per-instance, not per-rule. Two concerns from the same rule code on different statements may differ in whether they warrant suppression.
- Default to keeping the signal when the judgment is uncertain. False positives (keeping a redundant concern) are lower cost than false negatives (suppressing legitimate signal).
- Use deterministic logic for verdict aggregation (Stage 3), but LLM judgment for language-level "is this the same as that?" decisions. Consistent with the LLM-last architecture principle.

Rule-ID suppression sets are brittle: they require maintenance as new rules are added, they suppress at the wrong granularity, and they encode the suppression policy in two places (rulebook + suppression list) that drift apart over time.

**Canonical example:** R6.3 (closed 2026-05-31). Replaced R3.4's two-rule-ID set with a per-statement gpt-4o-mini judgment that reads the Evidence-conflict explanation and decides which Editorial concerns materially restate it. Per-instance accuracy preserved; rulebook maintenance burden eliminated.

## Doc-Sync Working Pattern

When backlog items emerge, evolve, or close during a session, sync `docs/ROADMAP.md` and other governance documents (`docs/ARCHITECTURE.md`, this manual) accordingly. Default behaviour: sync immediately when items are settled and the moment is a natural pause.

**Always draft the doc-update prompt at the moment of decision** — when deferring, queuing, closing, or logging a follow-up item in conversation. Do not wait to be asked. The prompt can be held for a batched sync, but drafting it when the decision is fresh ensures nothing is lost to chat history.

**Defer the batched sync** (applying updates to governance docs) when:
- **Convergence test:** items are still actively evolving in the same session (e.g. specs reshaping each other through ongoing work). Sync after they settle.
- **Cognitive-cost test:** syncing would interrupt a substantive workflow (mid-spec, mid-diagnosis). Sync at the next natural pause.

When deferring the batched sync, surface the choice explicitly so Ben can override if preferred. End-of-session batched syncs are acceptable when both tests above are satisfied.

`docs/ROADMAP.md` and other governance documents (`docs/ARCHITECTURE.md`, this manual) are kept in sync with conversational decisions — not retroactively. The cost of writing the doc-update prompt at the moment of decision is small; the cost of reconstructing decisions from chat history later is large.

Triggers that should generate a doc-update prompt:

- "Add to backlog"
- "Defer"
- "Queue as later spec"
- "Closed"
- "Log as cleanup"
- "Bundle into [other sprint]"
- Any architectural decision (e.g. "Path Y locked")
- Any working-pattern decision (e.g. additions to this manual)
