# Stage replay (B270)

Replay **one** QC stage from a recorded `analyse-statements` payload. It does not call Stage 1, Stage 2, or Stage 5 unless that stage is the one named.

Built because every earlier A/B paid for splitting, matching, and commentary to test a Stage 6 prompt change. There is no existing generic stage-level harness. `marketing-language-harness.mjs` and `first-person-actor-harness.mjs` call `runEditorialStyleReview` on hand-written sentences, not on a recorded review.

`compare-floor` compares two old runs and two new runs: wobble floor, mean old-versus-new, stable shifts, materiality recovery by index.

`--document-level` runs Layer B (quote-locate) in addition to today's per-sentence call. It is the B275 experiment. That split did not ship. Default replay is today's payload.

## What a recorded payload must contain

| Need | Where |
|------|--------|
| Statement texts and stored cards | `statements[].text`, `statements[].qcCard` |
| Full draft | `_auditDraft` (audit field on the Shopify fixtures). If absent, statements are joined. |
| Neighbours | Previous and next **in the full memo**, never in the subset |
| Sources | `sources[]` (compliance only) |
| Output type, version, house | Not stored on the response. Pass `--outputType`, `--requiredVersion`, `--house`. Defaults match the Shopify messy runs: `reporting_commentary`, `complete`, `Halden Group`. |

## Commands

```
node scripts/diagnostic/stage-replay/run.mjs \
  --stage editorial \
  --fixture tests/fixtures/b247/shopify-messy-full-after.json \
  --subset 40 \
  --succeeded-only \
  --out scripts/diagnostic/runs/stage-replay/old-a.json

node scripts/diagnostic/stage-replay/run.mjs compare A.json B.json

node scripts/diagnostic/stage-replay/run.mjs honesty \
  --fixture tests/fixtures/b247/shopify-messy-full-after.json \
  --replay scripts/diagnostic/runs/stage-replay/old-a.json
```

`--stage` is `editorial` or `compliance`. Editorial-only sets `complianceEnabled: false`, so compliance is not billed.

Live runs force `QC_LLM_CACHE=0`. Stage 6 was never in that cache anyway (`lib/qc/llm-cache.mjs` STAGES).

Outputs land under gitignored `scripts/diagnostic/runs/`. Each file has per-statement codes and verdict, plus list USD and discounted USD.

## Honesty

Replay unchanged code against the stored cards whose check succeeded. Exact code match can still fail because editorial concerns wobble at temperature 0 (`docs/ARCHITECTURE.md` L58, `docs/ROADMAP.md` item 9). Report match count, then use old-versus-old as the wobble floor.

## B271 (not shipped)

Dropping `FULL DRAFT` from the v4 editorial user payload was measured on this harness and not shipped. On the 40-statement Shopify subset, old-versus-new moved more than old-versus-old (`materiality` going clean). The 17-statement prefix control did not. Neighbours are not a substitute for document-level rules. Do not retry that deletion without a new instrument.
