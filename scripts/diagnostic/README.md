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

## Stale Stage 2 references after R3a (2026-08-26)

R3a shipped live (`stage2-rewrite-r3a`, promptHash `bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c`, 12812 chars). Two on-disk caches still hold **old-prompt** Stage 2 rows (promptHash `c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe`). Treat them as **STALE for live-product verdict checks**. Do not regenerate in routine work (~$4).

| Path | Status | Notes |
|------|--------|-------|
| `claim-spans/.baseline.json` | STALE | Produced under old prompt (promptHash `c718c190`). Shadow A/B snapshot only. |
| `.llm-cache.json` | STALE for Stage 2 | 643 Stage 2 rows at promptHash `c718c190`. Stage 1 rows may still be usable. |
| `eval-ablation/r3a-corpus-blast-rows.json` | **CURRENT** | 364 pairs under R3a. Use for Stage 2 blast-radius and graded-set checks. |

Local copies of the stale files may carry a `_staleNote` field at the JSON root when present. Regenerating the claim-spans baseline is backlog **B114** (decision deferred until something needs it).

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

## Passage-selection probe (multi-figure)

Invented Halden LP-update pairs that force at least two performance figures onto one page, plus one Meridian real-source case. Product measurement of live R3a passage selection (false red vs overcorrection). Not a rule arm.

| Path | Purpose |
|------|---------|
| `passage-selection-probe/pairs.json` | Ten pairs (MF01 to MF10): six expected confirmed, four expected conflicting. Dimensions: order, distance, metric, entity, wording. |
| `passage-selection-probe/sources/` | Invented Halden sources mf01 to mf05 and mf07 to mf10 (do not treat as production). Pair MF10 draft uses `eval-ablation/meridian_source.txt` unchanged. |
| `passage-selection-probe/sources/rich01_*.txt` | MF01 host with fixture 93 rich mark pasted in. |
| `passage-selection-probe/sources/thin93_*.txt` | Fixture 93 copy with MF01 thin mark (fixture 93 itself untouched). |
| `eval-ablation/run-passage-selection-probe.mjs` | Live R3a x3, cache OFF. Writes rows + `passage-selection-probe.md`. |
| `eval-ablation/run-mark-richness-probe.mjs` | Richness swap: RICH01, THIN93, F93_S2, MF01. |
| `eval-ablation/passage-selection-probe.md` | Pre-flight, cost, per-run passages, dimension cross, stopping rule. |
| `eval-ablation/basis-conflict-r10.txt` | R9 + quantity-scoped basis limb. Harness only. |
| `eval-ablation/run-r10-scoped-basis-gate.mjs` | R3a vs R10 on graded set + F93 + MF01-10. |
| `eval-ablation/r10-corpus-blast.md` | R10 vs live R3a corpus blast + Part 1 reconfirm. |
| `eval-ablation/run-r10-corpus-blast.mjs` | Harness for that blast. |
| `eval-ablation/richness-exposure-count.md` | Free scan: rich-mark trigger exposure in corpus sources. |

## Real vs invented sources

Three sources are real published documents. Keep them verbatim. Do not edit them to plant a test case. A real document with an invented fault in it is no longer either thing.

| Fixture | Source | What it is |
|---------|--------|------------|
| 01 | `01_bvp_shopify_memo.txt` | Bessemer Venture Partners Shopify Series A memo (published) |
| 02 | `02_pg_atnorth_exit.txt` | Partners Group atNorth exit press release (published) |
| 03 | `03_pg_gestcompost_investment.txt` | Partners Group Gestcompost investment press release (published) |

Planted faults belong only in invented fixtures (`synth_` prefix, the adversarial set 90-93, style-guide stubs, satellite probes).

The fictional house name is **Halden Group**. The real name (Partners Group) appears only in real published documents. Production must supply the authoring organisation via `AUTHORING_ORGANISATION` or the review request; there is no default house name.

### Adversarial fixtures (per-fixture)

| Fixture | Source | Plant / control |
|---------|--------|-----------------|
| 90 | `90_adversarial_b17_latent.txt` | B17 latent period trap (`last year` vs draft 2024). S1 Munich HQ control expected confirmed. |
| 91 | `91_adversarial_shopify_2010_trimmed.txt` | Temporal gap: undated present-perfect vs 2010 completed investment. |
| 92 | `91_adversarial_shopify_2010_trimmed.txt` | Present-tense-stale: 2010 customer count stated as current. |
| 93 | `93_adversarial_basis_mismatch.txt` | Basis mismatch (Halden). Statements: S0 REGRESSION LOCK draft `has returned` on mark-at-1.9 expected `conflicting` (reference already passes; cannot prove a fix). S1 CONTROL draft `is currently marked at` 1.9 expected `confirmed`. S2 CONTROL (restaged) draft and source identical `Fund IV has returned 2.6 times gross MOIC.` expected `confirmed` (mark-at-1.9 remains as hunting bait). S3 ISOLATED READING draft `has returned 2.6 times net MOIC` vs source gross only expected `conflicting` or live false green if `confirmed`. Until 93 is in the corpus baseline, corpus-clean claims on basis mismatches are vacuous. |

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
