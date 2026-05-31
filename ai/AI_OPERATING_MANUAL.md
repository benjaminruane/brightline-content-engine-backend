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

## Change Surface Discipline

When proposing development specs:

1. First identify the smallest viable change surface in the existing codebase.
2. Prefer modifying the narrowest module that directly affects the desired behaviour.
3. Avoid proposing changes across multiple pipeline stages unless absolutely necessary.
4. Do not introduce new architectural layers when a local modification would achieve the goal.
5. Do not modify upstream extraction, canonical claims, or evidence binding unless the problem specifically originates there.

Specs should aim for the smallest safe intervention that materially improves the user-visible outcome.

## Diagnostic Discipline

When a recurring issue persists across multiple spec iterations,
stop writing specs and diagnose instead. The signal is simple:
two or more spec rounds targeting the same symptom without
resolution means the issue isn't where the specs assume it is.

Instead of a third attempt, run a diagnostic:

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

## Diagnostic Discipline

When a recurring issue persists across two or more spec iterations targeting the same symptom without resolution, ask Cursor to diagnose first before writing another fix spec. Diagnostic discipline applies before any behavioural change to existing modules — read the current code, confirm assumptions, inspect actual prompts and outputs, before speccing.

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

When deferring, queuing, closing, or logging a follow-up item in conversation, generate a Cursor doc-update prompt at the same time. Do not wait to be asked.

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
