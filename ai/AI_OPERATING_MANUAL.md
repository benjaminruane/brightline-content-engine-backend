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
