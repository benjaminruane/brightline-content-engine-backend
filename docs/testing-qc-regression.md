# QC regression testing

- **Test corpus:** `tests/qc_corpus/` — fixed source files for deterministic QC runs. Source filenames in requests are resolved only from this directory.
- **Enabling the test endpoint:** Set `ENABLE_QC_TEST_ENDPOINT=true` in the environment. The endpoint is **disabled** otherwise (returns 404). Do not set this in production.

## Running the QC regression suite

```bash
npm run qc:test
```

Optional: `QC_REGRESSION_BASE_URL=http://localhost:3000` (default). Start the backend (e.g. `npm run dev` or `vercel dev`) before running the suite.

Set `QC_PIPELINE_V4=1` to target the QC pipeline v4 rebuild route (R2.1+); by default the suite exercises the existing v3 route.

Outputs are written to **`tests/output/`** (generated artifacts; typically gitignored).

## Suite format — displayed QC contract (V2)

File: `tests/qc_regression_suite.json`. Each run has `name`, `draft`, `sourceFiles`, and `expect`.

### Required (primary statement / first claim)

- **`displayVerdict`** — string or array of allowed values for `qcCard.displayVerdict`  
  API values: `supported_full`, `supported_partial`, `not_supported`, `conflict`  
  (Plain-language “supported” in specs = `supported_full` in JSON.)

- **`concernLevel`** — string or array of allowed values for `qcCard.concernLevel`  
  Typical mapping: `supported_full` → `none`; `supported_partial` → `moderate`; `not_supported` / `conflict` → `high`.

### Authority alignment (default on)

Unless `assertAuthority` is `false`, the harness checks `meta.qcEvidenceAuthorities[0]`:

- `displayVerdict` matches the same expectation as `qcCard.displayVerdict` and equals `qcCard.displayVerdict`.
- Optional **`hasUsableExcerpt`** — must match `meta.qcEvidenceAuthorities[0].hasUsableExcerpt`.

### Pattern-based explanation (no exact full-string match)

- **`reasoningParagraphIncludes`** — array of substrings; all must appear in `qcCard.reasoningParagraph`.
- **`reasoningParagraphIncludesAny`** — at least one substring must appear (when paragraph non-empty).
- **`reasoningParagraphExcludes`** — substrings that must not appear.

### Structural / counts

- **`supportRefIdsUnique`** — if `true`, `qcCard.supportRefIds` has no duplicate ids.
- **`supportRefIdsLength`**, **`citationHoversLength`** — optional exact lengths.
- **`primaryRefTitleIncludes`**, **`supportRefTitlesInclude`**, **`draftSpanPresent`** — unchanged behaviour.

### Downgrade (no usable excerpt)

When **`downgrade`** is `true`:

- `qcCard.supportRefIds.length === 0`
- `qcCard.citationHovers.length === 0`
- If `meta.qcEvidenceAuthorities[0]` exists, `hasUsableExcerpt === false`

### Sentence aggregation (optional)

- **`sentenceVerdict`** — if set, must equal `statements[0].sentence_verdict` (e.g. `"Supported by sources (partial)"` when the sentence mixes supported and unsupported subclaims). Omit when the run has a single sentence/claim.

## Summary table

The runner prints **expected vs actual** `displayVerdict`, `concernLevel`, and whether structural/pattern assertions **OK** or **FAIL**.

## Removed legacy assumptions

The harness **no longer** asserts:

- `qcCard.supportState`, `qcCard.concernState`, or legacy verdict tokens (`confirmed`, `partially_confirmed`, `no_clear_support`) as the primary contract.
- `qcCard.reasoningHeadline` or exact legacy commentary phrases (e.g. “Confirmed using provided sources”).
- `selectedExcerptDirectness` or other internal matcher fields.

## Handoff

After QC engine changes:

1. Run `npm run qc:test` with the test endpoint enabled.
2. Confirm all runs PASS.
3. If a run fails, inspect `tests/output/<name>.json` and adjust expectations only when behaviour is intentionally changed.
