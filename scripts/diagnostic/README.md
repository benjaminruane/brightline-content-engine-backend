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
| `claim-spans/` | B53a shadow gate; `.baseline.json` caches Stage 1 + whole-sentence Stage 2 (gitignored) |
| `supersession/` | Period-supersession gate fixture (draft + three dated sources) |
| `b67-probe/` | Planted Nordholt-dirty ARR probe: IC memo `conflicting` is correct (B67, preserve); press/fact-sheet `conflicting` on EUR 155m revenue is B60 |
| `b60-money/` | B70+B60 shadow: plain `m` scale + money metric ids. Replays Stage 2 backstop against the disk cache. |
| `.llm-cache.json` | B69 disk-backed LLM cache for Stages 1, 1b, and 2 (gitignored). Default ON for diagnostic scripts. |

## LLM cache (local diagnostics)

A cached answer is CORRECT when the model's judgement is an INPUT you want held constant. It is WRONG when the model's judgement is the THING BEING MEASURED.

Scripts under this folder set `QC_LLM_CACHE_DISK` to `scripts/diagnostic/.llm-cache.json` unless it is already set. Opt out with `--no-disk-cache`. Wipe and repopulate with `--refresh-cache`. Production is unchanged: the env var is unset, so the process uses memory only.

These three scripts measure the model itself and force the cache OFF, unconditionally, regardless of env or flags:

- `scripts/diagnostic/llm-cache/run-gate.mjs`
- `scripts/diagnostic/llm-cache/run-stage1-stability.mjs`
- `scripts/diagnostic/stage2-determinism/run.mjs`
- `scripts/diagnostic/first-person-actor-harness.mjs`

When writing a new diagnostic, classify it with that rule. If the model is the thing being measured, call `loadLocalEnvFiles({ liveMeasurement: true })`. Otherwise leave the default disk cache on.

Do not stretch `claim-spans/.baseline.json` into a general cache. It remains a frozen A/B snapshot of Stage 1 plus whole-sentence Stage 2 for the claim-span shadows only.

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

Fixtures with `draft: "PLACEHOLDER"` are **skipped** with `skipped: draft not yet supplied`. Update only the JSON `draft` field when drafts are ready. No harness code change.

## Real vs invented sources

Three sources are real published documents. Keep them verbatim. Do not edit them to plant a test case. A real document with an invented fault in it is no longer either thing.

| Fixture | Source | What it is |
|---------|--------|------------|
| 01 | `01_bvp_shopify_memo.txt` | Bessemer Venture Partners Shopify Series A memo (published) |
| 02 | `02_pg_atnorth_exit.txt` | Partners Group atNorth exit press release (published) |
| 03 | `03_pg_gestcompost_investment.txt` | Partners Group Gestcompost investment press release (published) |

Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-92, style-guide stubs, satellite probes).

The fictional house name is **Halden Group**. The real name (Partners Group) appears only in real published documents. Production must supply the authoring organisation via `AUTHORING_ORGANISATION` or the review request; there is no default house name.

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
