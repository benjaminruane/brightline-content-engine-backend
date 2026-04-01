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
