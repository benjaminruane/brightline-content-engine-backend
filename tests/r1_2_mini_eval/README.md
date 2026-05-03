# R1.2 — Stage 2 `gpt-4o-mini` eval (run-once harness)

This folder is **not** wired into `npm test`. It compares **gpt-4o-mini** to locked ground truth using the **same Stage 2 system prompt and validation** as production (`stage2_eval_mirror.mjs` mirrors `lib/qc/pipeline-v3/stage2-match-sources.mjs`).

## Locked ground truth (47 pairs)

1. Export the **All pairs** tab from `Brightline_R1.2_GroundTruth_v1.xlsx` (merged final GT + gpt-4o labels), or save as CSV/TSV with columns including:
   - `pairId`, `draftName`, `statement`, `sourceLabel`, `gt_classification`, `gpt4o_classification`
   - plus either **`sourceText`** or **`sourceFile`** (see below).

2. **Source files** resolved from `tests/qc_corpus/` when using `sourceFile`:
   - `Shopify (text).txt`
   - `PR_shopify_enterprise_payments_launch_press_release.txt`

3. **Build `inputs.json`**

   ```bash
   # Optional: copy the workbook here as Brightline_R1.2_GroundTruth_v1.xlsx
   node tests/r1_2_mini_eval/build_inputs.mjs

   # Or pass an export path (CSV, TSV, or .xlsx)
   node tests/r1_2_mini_eval/build_inputs.mjs /path/to/gt_export.csv
   ```

   Without an XLSX/CSV argument, the builder uses **`gt_pairs.seed.tsv`** (5 smoke pairs) so the scripts stay runnable in CI-less clones.

## Run mini eval

```bash
export OPENAI_API_KEY=…   # required
# Optional Langfuse (same as backend)
# export LANGFUSE_PUBLIC_KEY=… LANGFUSE_SECRET_KEY=… LANGFUSE_HOST=…

npm run r1_2:mini-eval
```

- **Model:** `gpt-4o-mini`, temperature **0**.
- **Traces:** each call uses `callOpenAI` with `metadata.eval = "r1.2-mini"` and `metadata.pairId`.
- **Resume:** if `mini_outputs.json` exists, completed pair IDs are skipped (re-runnable).
- **Outputs:** `mini_outputs.json`, `results.md`.

### Re-score only (no API calls)

After fixing `inputs.json` or reporting logic, regenerate `results.md` from the existing `mini_outputs.json`:

```bash
npm run r1_2:score
# equivalent: node tests/r1_2_mini_eval/run_eval.mjs --score-only
```

## R1.2.2 — prompt v1 vs v2 (eval-only)

Compares **gpt-4o** and **gpt-4o-mini** on the same 47 pairs: **v1** reuses `inputs.json` (`gpt4o_classification`) and `mini_outputs.json` (copied once to `mini_outputs_v1.json` on first run). **v2** calls the API twice per pair (gpt-4o + mini) using `prompts/stage2_v2.md` (~94 calls).

```bash
export OPENAI_API_KEY=…
npm run r1_2:2              # writes gpt4o_outputs_v2.json, mini_outputs_v2.json, results_v2.md
npm run r1_2:2-report       # results_v2.md only (requires v2 JSON outputs already on disk)
```

Optional: `R1_2_PROMPT_VARIANT=v2` or `--prompt-variant=v2` (default). Only **v2** is allowed for API runs; production Stage 2 is unchanged.

## CSV parsing (`build_inputs.mjs`)

The locked CSV (`locked_ground_truth_v1.csv`) has **quoted statements that contain commas**. A naive `line.split(",")` **mis-aligns columns**, so `gt_classification` can appear as random fragments (e.g. `000`, `Canada.`). **`csv-parse`** is used for comma-separated inputs so quoted fields stay intact. Tab-separated `gt_pairs.seed.tsv` uses the same parser with `\t`.

## Artifacts

| File | Purpose |
|------|---------|
| `stage2_eval_mirror.mjs` | Verbatim Stage 2 prompt + `normalizeValidResponse` (keep in sync with production). |
| `build_inputs.mjs` | XLSX / CSV → `inputs.json`. |
| `run_eval.mjs` | Calls mini, aggregates metrics, writes `results.md`. |
| `run_r1_2_2.mjs` | R1.2.2: v2 API runs + `results_v2.md` (see section above). |
| `prompts/stage2_v1.md`, `prompts/stage2_v2.md` | Stage 2 system prompts for prompt-variant comparison. |
| `inputs.json` | Built input (commit or regenerate; large when full sources embedded). |
| `mini_outputs.json` | Raw mini outputs (gitignored — regenerate locally). |
| `results.md` | Summary + recommendation (regenerated each run). |

## Reference rates

On the **full 47-pair** lock, **gpt-4o vs GT = 41/47 (≈87.23%)**. The smoke `gt_pairs.seed.tsv` is only for plumbing checks; replace with the real export before making a **SWITCH / KEEP** decision.
