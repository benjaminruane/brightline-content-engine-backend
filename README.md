# Brightline Content Engine — Backend

Vercel serverless backend for the Brightline Content Engine. Handles draft generation, rewriting, adaptation, QC analysis, source extraction, and export.

---

## Stack

- **Runtime:** Node.js (Vercel serverless functions)
- **LLM:** OpenAI + Anthropic (provider/model selection via `lib/qc/model-config.mjs`)
- **Local dev:** `npx vercel dev` (not `npm run dev`)
- **PDF extraction:** `pdf-parse`
- **Export:** PDFKit (PDF), `docx` library (DOCX)

---

## Getting Started

### Prerequisites

- Node.js 18+
- Vercel CLI: `npm i -g vercel`
- OpenAI API key
- Anthropic API key (for multi-provider routing)

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file in the repo root (or set via Vercel dashboard):

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_SECRET_KEY=...
LANGFUSE_HOST=...
BRIGHTLINE_EDITORIAL_REVIEW=1
```

`BRIGHTLINE_EDITORIAL_REVIEW=1` must be set permanently in all environments to enable the editorial review signal. It is already set in the Vercel dashboard — do not remove it.

### Database

Neon Postgres 18 (Frankfurt). Two connection strings, both set in the Vercel backend project. Never log either value.

- `DATABASE_URL`: pooled (`-pooler` hostname). Used by `api/review-state.js`.
- `DATABASE_URL_UNPOOLED`: direct connection. Used only by `npm run db:migrate`.

```bash
npx vercel env pull .env.local
npm run db:migrate
```

`npm run db:migrate` is `node --env-file-if-exists=.env.local scripts/db/migrate.mjs`, so `DATABASE_URL_UNPOOLED` can come from `.env.local` or the ambient shell. `.env.local` is gitignored. The script reads every `db/migrations/*.sql` file in filename order and executes each against `DATABASE_URL_UNPOOLED`. Migrations are idempotent (`IF NOT EXISTS`); re-running is safe. No dotenv package: local Node must be 20.18+ or 22+.

**Rehearsal rule:** migration `001` ran against the empty production database. From migration `002` onward, create a Neon branch first, run the migration there, then run it on production. Neon's free plan retains only 6 hours of restore history; a branch is the safety net, not that window.

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
  review-state.js           Durable review autosave buffer (GET/POST/DELETE)

lib/                        Shared backend logic
  db/                       Neon client and review_state access helpers
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
