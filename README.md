# Brightline Content Engine — Backend

Vercel serverless backend for the Brightline Content Engine. Handles draft generation, rewriting, adaptation, QC analysis, source extraction, and export.

---

## Stack

- **Runtime:** Node.js (Vercel serverless functions)
- **LLM:** OpenAI API (`gpt-4o` for editorial/compliance and generation, `gpt-4o-mini` for commentary)
- **Local dev:** `npx vercel dev` (not `npm run dev`)
- **PDF extraction:** `pdf-parse`
- **Export:** PDFKit (PDF), `docx` library (DOCX)

---

## Getting Started

### Prerequisites

- Node.js 18+
- Vercel CLI: `npm i -g vercel`
- OpenAI API key

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file in the repo root (or set via Vercel dashboard):

```
OPENAI_API_KEY=sk-...
BRIGHTLINE_EDITORIAL_REVIEW=1
```

`BRIGHTLINE_EDITORIAL_REVIEW=1` must be set permanently in all environments to enable the editorial review signal. It is already set in the Vercel dashboard — do not remove it.

### Run Locally

```bash
npx vercel dev --listen 3000
```

Shortcut alias: `blbe && npx vercel dev --listen 3000`

---

## Repo Structure

```
api/                        Vercel serverless function handlers
  generate.js               Draft generation
  rewrite.js                Draft rewriting
  adapt.js                  Output type adaptation
  analyse-statements.js     QC pipeline entry point
  export.js                 PDF and DOCX export
  summarize-source.js       LLM source description on upload
  query.js                  Ask AI

lib/                        Shared backend logic
  analyse-statements-impl.mjs   Core QC pipeline implementation
  extract-text-from-source.mjs  PDF and file text extraction
  output-intent.js              Output type normalisation and prompt guidance
  prompt-library/               Generation and rewrite prompt construction
    index.js
    outputTypeGuidance.js
    outputTypeGuidance.js
  qc/                           QC sub-modules
    editorial-compliance-reviewer.mjs
    evidence-skipped-fast-path.mjs
    qc-v2-pipeline.mjs (and split modules)

helpers/                    Utility helpers (scoring, etc.)
docs/                       Internal documentation
  testing-qc-regression.md

ROADMAP.md                  Product and development roadmap (authoritative)
```

---

## QC Regression Suite

Run before any handoff that touches QC analysis logic:

```bash
npm run qc:test
```

Primary test fixture: `shopify_short_v1` (4-statement Shopify draft). See `docs/testing-qc-regression.md` for full details.

---

## Key Architectural Principles

- **Backend is authoritative.** Verdict, classification, and concern level are deterministic. LLM commentary runs after and cannot influence them.
- **LLM-last architecture.** Evidence pipeline runs first; editorial and compliance run in parallel after; LLM commentary is the final layer.
- **No hallucinated evidence.** Evidence fields must resolve to actual source content.
- **Minimal diffs.** Specs target the smallest safe change surface.

See `ROADMAP.md` for the full list of Review correctness principles.

---

## Git Tags

Format: `backend-vX.Y-descriptor`

Current: see git log.
