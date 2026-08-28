# Model configuration drift: are we pinned, and can we see it move

Cost: **$0.00**. Zero model calls. Part 1 is a code read, Part 3 reads artefacts
already on disk, Part 2 is code and unit tests.

---

## Part 1 — Are we pinned

**No. Nothing in this pipeline is pinned. Every model string is a floating
alias, and every one of them will silently follow a new snapshot.**

All model selection is centralised in one table:
`lib/qc/model-config.mjs:1-27`. Every call site reads `STAGE_MODELS[...]` and
passes `.model` straight to the provider through `callLLM`
(`lib/observability.js:308`), which reaches OpenAI at
`lib/observability.js:296` (`openaiClient.chat.completions.create`). No call
site rewrites the string.

| Stage key | Model string | File:line (definition) | Alias or snapshot | Runtime override |
|---|---|---|---|---|
| `stage1-splitting` | `gpt-4o` | `lib/qc/model-config.mjs:2` | floating alias | none |
| `stage1b-claim-spans` | `gpt-4o` | `lib/qc/model-config.mjs:3` | floating alias | none |
| **`stage2-matching`** | **`gpt-4o`** | **`lib/qc/model-config.mjs:4`** | **floating alias** | **none** |
| `stage5-commentary` | `gpt-4o` | `lib/qc/model-config.mjs:5` | floating alias | none |
| `editorial-review` | `gpt-4o` | `lib/qc/model-config.mjs:6` | floating alias | none |
| `editorial-style-review` | `gpt-4o` | `lib/qc/model-config.mjs:7` | floating alias | none |
| `compliance-review` | `gpt-4o` | `lib/qc/model-config.mjs:8` | floating alias | none |
| `style-review` | `gpt-4o` | `lib/qc/model-config.mjs:9` | floating alias | none |
| `claim-extraction` | `gpt-4o-mini` | `lib/qc/model-config.mjs:11` | floating alias | **`QC_LLM_CLAIM_EXTRACTION_MODEL`**, `lib/qc/llm-claim-extraction.mjs:291` |
| `claim-verifier` | `gpt-4o-mini` | `lib/qc/model-config.mjs:12` | floating alias | none |
| `writing-generate` | `gpt-5.1` | `lib/qc/model-config.mjs:13` | floating alias | none |
| **`writing-rewrite`** (the reviser) | **`gpt-5.1`** | **`lib/qc/model-config.mjs:14`** | **floating alias** | **none** |
| `adapt` | `gpt-5.1` | `lib/qc/model-config.mjs:15` | floating alias | none |
| `ask-query` | `gpt-5.1` | `lib/qc/model-config.mjs:16` | floating alias | none |
| `query-sources` | `gpt-5.1` | `lib/qc/model-config.mjs:17` | floating alias | none |
| `summarize-source` | `gpt-4o-mini` | `lib/qc/model-config.mjs:18` | floating alias | none |
| `summarize-source-usage` | `gpt-4o-mini` | `lib/qc/model-config.mjs:19` | floating alias | none |
| `summarize-rewrite-label` | `gpt-4o-mini` | `lib/qc/model-config.mjs:20` | floating alias | none |
| `synthesize-review` | `gpt-4o` | `lib/qc/model-config.mjs:21` | floating alias | none |
| `constructive-feedback` | `gpt-4o` | `lib/qc/model-config.mjs:22` | floating alias | none |
| `constructive-feedback-craft` | `gpt-4o` | `lib/qc/model-config.mjs:23` | floating alias | none |
| `output-scoring` | `gpt-4o-mini` | `lib/qc/model-config.mjs:24` | floating alias | none |
| `editorial-duplication-judge` | `gpt-4o-mini` | `lib/qc/model-config.mjs:25` | floating alias | none |
| `framing-fidelity-judge` | `gpt-4o-mini` | `lib/qc/model-config.mjs:26` | floating alias | none |

Three distinct strings in total: `gpt-4o`, `gpt-4o-mini`, `gpt-5.1`. None
carries a date suffix. There is no `-2024-08-06`-style snapshot anywhere in
the repo.

**The only runtime override in the codebase** is
`QC_LLM_CLAIM_EXTRACTION_MODEL` (`lib/qc/llm-claim-extraction.mjs:291`), which
lets an operator swap the claim-extraction model. Its production value is
**unset** — it appears in neither `.env.local` nor
`.env.development.local`, so the configured `gpt-4o-mini` applies. There is no
env override for Stage 2 and none for the reviser.

Anthropic is a dependency and has a pricing table
(`lib/observability.js:47-50`), but no stage is configured to it. Every call in
the table above goes to OpenAI.

### Stated plainly, per model

- **`gpt-4o` (Stage 2 and seven other stages):** if OpenAI promotes a new
  snapshot behind that name tomorrow, **yes, this pipeline silently starts
  using it** on the next request. No deploy, no code change, no signal.
- **`gpt-4o-mini` (claim extraction, verifier, judges, scoring):** **yes,
  silently.**
- **`gpt-5.1` (the writing reviser, generate, adapt, ask):** **yes,
  silently.**

That is exactly what the 2026-08-27 incident looks like from the inside.
Production served Stage 2 on `fp_17e3c4f467`; today the identical request is
served on `fp_1a8e2a470b`. Both are `gpt-4o`. Nothing in the repo changed.

**No model string was changed by this spec.** Pinning is Ben's call.

---

## Part 2 — Record it

### 2a. Persist it

Review output leaves the backend as the `/api/analyse-statements` response;
there is no server-side store of review results (`api/review-state.js` persists
*frontend* state, keyed by review id and owner, not pipeline output). So the
run record is attached to that response.

New field, additive, at `api/analyse-statements.js` under `meta`:

```json
"meta": {
  "pipelineVersion": "v4",
  "modelConfig": {
    "ranAt": "2026-08-28T08:00:00.000Z",
    "stage2Fingerprints": ["fp_1a8e2a470b"],
    "stageModels": {
      "stage2-matching": { "provider": "openai", "model": "gpt-4o" },
      "stage1-splitting": { "provider": "openai", "model": "gpt-4o" }
    }
  }
}
```

Files:

- `lib/qc/model-fingerprints.mjs` **(new)** — pure collection and formatting.
  `collectStage2Fingerprints` reads the distinct set from
  `card.stage2SourceFingerprints`, already assembled at
  `lib/qc/pipeline-v3/stage7-assemble-card.mjs:721` and used by both v3 and v4.
- `api/analyse-statements.js` — builds the record from `qcCards` and adds
  `meta.modelConfig`. `ranAt` reuses the existing `runStartedAt`.

**No existing consumer breaks.** The change is a new key on an object the
frontend already spreads; nothing is renamed, removed or reshaped, and no
statement, source or verdict field is touched. It is not surfaced in the main
UI.

### 2b. Alarm on change

- `lib/qc/model-drift-reporter.mjs` **(new)** — loads the most recently
  recorded set, compares, logs, and records only when the set changes.
- `lib/db/model-fingerprint-log.mjs` **(new)** and
  `db/migrations/002_model_fingerprint_log.sql` **(new)** — append-only log,
  one row per configuration change, following the `001_review_state.sql`
  precedent.

Behaviour, covered by unit tests in `tests/model-fingerprints.test.mjs`:

- **Match:** nothing emitted. Silence is the normal case.
- **Change:** one `warn`, in the existing bracketed-prefix style —
  `[model-drift] stage=stage2 previous=fp_17e3c4f467 current=fp_1a8e2a470b model=gpt-4o firstSeen=2026-08-28T00:00:00.000Z`
- **No previous record:** one `info` baseline line instead of a warning —
  `[model-drift] stage=stage2 baseline=fp_1a8e2a470b model=gpt-4o firstSeen=...`
- **No fingerprint returned by the provider:** silent. Nothing is recorded and
  nothing is claimed.

Two safety properties: the reporter never throws (a failed drift check logs
`check_failed` and the Review proceeds), and when `DATABASE_URL` is unset it
degrades to an in-process memory of the last set, which still catches drift
inside a warm instance rather than failing the request.

### 2c. The reviser call in Suggest

**The provider path does return a fingerprint here**, so the reviser gets the
same treatment. Every call, including `gpt-5.1`, goes through
`chat.completions.create` (`lib/observability.js:296`), and `callLLM` returns
the provider response as `raw`, so `raw.system_fingerprint` is reachable —
`callLLM` previously only forwarded it to Langfuse metadata
(`lib/observability.js:391`) and dropped it on the floor for callers.

In `api/suggest-revision.js` the reviser response now carries
`modelConfig.reviserFingerprints`, and drift is reported under
`stage=reviser`.

One caveat, stated rather than assumed: `system_fingerprint` is populated at
OpenAI's discretion and newer models do not always return it. If `gpt-5.1`
returns none, the set is empty, the drift check stays silent and
`reviserFingerprints` is `[]`. That is a truthful "not observable on this
path" rather than a false all-clear. The first production Suggest after this
ships will settle it.

---

## Part 3 — Tie the baseline to a fingerprint

The graded corpus baseline **can** be dated. Every Stage 2 match row in the
cache carries `systemFingerprint`, so the configuration was recorded all along;
nothing read it.

- `scripts/diagnostic/build-fingerprint-manifest.mjs` **(new)** — extracts the
  manifest. Zero model calls, corpus not re-run.
- `scripts/diagnostic/fingerprint-manifest.json` **(new, committed)** — the
  manifest itself.

Result: **all 29 corpus cases dated. Nothing was undatable.**

Distinct Stage 2 configurations in the baseline:

| Fingerprint | Where |
|---|---|
| `fp_17e3c4f467` | the dominant one; the whole of `r3a-production-verify.json`, `r10-production-verify.json` and `revise/condition-b-review.json` |
| `fp_64d0f9e03c` | some `r3a-corpus-blast-rows.json` cases |
| `fp_684acb85fd` | some `r3a-corpus-blast-rows.json` cases |

Two things worth saying out loud:

1. **The R10 ship and the R3a production verify were measured entirely on
   `fp_17e3c4f467`** — the same configuration that produced the 2026-08-27
   production Review, and a different one from what serves today.
2. **The corpus baseline already straddles three configurations.** The
   9-of-11 removal risk number and the corpus verdict mix were never measured
   on one configuration to begin with.

Caveat on reproducibility: the manifest is generated from
`scripts/diagnostic/claim-spans/.baseline.json`, which is gitignored
(`.gitignore:23`). The generated manifest is committed, so the dating survives
even where the cache does not.

### Harness banner

`scripts/diagnostic/lib/fingerprint-manifest.mjs` **(new)** exposes
`fingerprintBanner`, wired into the batch harness at
`scripts/diagnostic/run-batch.mjs` (`writeIndex`). When a run is served by a
fingerprint the baseline was not measured on, `INDEX.md` opens with:

```
> ## ⚠️ THIS COMPARISON CROSSES TWO MODEL CONFIGURATIONS
>
> Baseline measured on: `fp_17e3c4f467`
> This run served by:   `fp_1a8e2a470b`
>
> Stage 2 verdicts can differ between serving configurations with no code
> change. Any delta below may be model drift rather than the thing under test.
```

When the fingerprints match, or the run recorded none, the banner is empty and
the report is unchanged. `INDEX.md` also now states the run's Stage 2
fingerprints on a line of their own, whether or not the banner fires.

---

## Files changed

| File | Change |
|---|---|
| `lib/qc/model-fingerprints.mjs` | new — collection, comparison, log-line formatting |
| `lib/qc/model-drift-reporter.mjs` | new — non-throwing compare-and-record |
| `lib/db/model-fingerprint-log.mjs` | new — append-only log accessors |
| `db/migrations/002_model_fingerprint_log.sql` | new — the log table |
| `api/analyse-statements.js` | `meta.modelConfig`, Stage 2 drift check |
| `api/suggest-revision.js` | `modelConfig` on the payload, reviser drift check |
| `scripts/diagnostic/lib/fingerprint-manifest.mjs` | new — manifest load, banner |
| `scripts/diagnostic/build-fingerprint-manifest.mjs` | new — manifest builder |
| `scripts/diagnostic/fingerprint-manifest.json` | new — the baseline manifest |
| `scripts/diagnostic/run-batch.mjs` | banner and fingerprint line in `INDEX.md` |
| `tests/model-fingerprints.test.mjs` | new — 18 cases |

Suite: **31 files, 509 tests, all passing.**

---

## What this does not do

It records and alarms. It does not stop drift. Stage 2 remains on a floating
`gpt-4o` alias, so the next promotion will still move verdicts — the
difference is that from now on there will be a line in the log saying so, and a
banner on any report that compares across the boundary.

The open decision, left to Ben: pin `gpt-4o` for Stage 2 to a dated snapshot,
and accept the eventual deprecation work, or stay floating and rely on the
alarm.
