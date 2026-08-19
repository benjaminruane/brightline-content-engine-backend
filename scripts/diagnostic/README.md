# QC diagnostic harness (D1.1)

In-process batch runner for R6 Review Quality evidence gathering. **Not production code** — not wired to `api/`.

## Layout

| Path | Purpose |
|------|---------|
| `prep-extract.mjs` | Extract all PDFs in `sources/` → `sources-extracted/*.txt` (production `extractTextFromSource`) |
| `run-batch.mjs` | Run fixtures through `runPipelineV4` sequentially |
| `fixtures/*.json` | Fixture definitions (`draft` = `PLACEHOLDER` until paired) |
| `sources/` | Source documents (.txt / .pdf) — **Ben supplies files** |
| `sources-extracted/` | Generated text from PDFs (gitignored) |
| `runs/` | Timestamped run output (gitignored) |

## Prerequisites

- Node 20.x, `npm install`
- API keys in repo-root `.env.local` (loaded automatically): `OPENAI_API_KEY`, optional Langfuse vars
- `QC_PIPELINE_V4=1` is set by the harness

## Shadow gates

Verdict-adjacent shadows share **Stage 1 + whole-sentence Stage 2** across flag-OFF and flag-ON arms, then apply the patched logic only on the ON arm. Do not run two independent full pipelines: temperature-0 Stage 2 is not byte-stable (see BACKLOG **B61**). Precedent: `scripts/diagnostic/claim-spans/run-shadow.mjs`.

## Commands

```bash
# One-time (or after PDF sources change)
npm run qc:diag:prep

# Full run — 4 batches of 5, confirmation between batches
npm run qc:diag:run

# Single fixture
npm run qc:diag:run -- --only 08

# Range (still batched in groups of 5)
npm run qc:diag:run -- --range 06-10

# Non-interactive (CI / no TTY)
npm run qc:diag:run -- --no-confirm
```

## Fixture pairing

Fixtures with `draft: "PLACEHOLDER"` are **skipped** with `skipped: draft not yet supplied`. Update only the JSON `draft` field when drafts are ready — no harness code change.

## PDF sources (5)

Fixtures referencing PDFs (run `qc:diag:prep` before batch):

- `07_investor_letter_complete_visibility.pdf`
- `09_lumin_robotics_investment_memo.pdf`
- `11_compliance_confidential_public.pdf`
- `14_long_pdf_source_chunking.pdf`
- `16_duplicate_concern_merge_candidate.pdf`

## Config fields

`config` mirrors the Assess / analyse-statements request shape:

- `outputType` — e.g. `investor_letter`, `reporting_commentary`, `press_release`, `linkedin_post`
- `requiredVersion` — `complete` or `public`
- `eventType` — legacy slug (e.g. `new_investment`) or canonical `NEW_DIRECT_INVESTMENT`

Regenerate fixture JSON from inventory: `node scripts/diagnostic/write-fixture-json.mjs`
