# B154 exhibit: permanent Brackenhill Review capture

Evidence only. Does not fix anything. Does not change the Stage 2 prompt or its pin. Does not regenerate `brackenhill-2026-09-02.json`.

Draft and source are the recorded files next to the action-list sample:

- `scripts/diagnostic/revise/per-finding-action-list/brackenhill-memo-draft.txt`
- `scripts/diagnostic/revise/per-finding-action-list/brackenhill-fund-iii-source.txt`

## What this settles

Three questions on one live `runPipelineV4` of those files:

1. Does SHAPE B happen again: the comparable-managers sentence coming back `partial` / `supported_partial` on a peer or own-fund figure the source states, when no source addresses comparable-manager returns.
2. Did the first-close sentence reach `no_support` through the period-overlap rule, or did the model classify `no_support` on its own. That needs `preBackstopClassification` versus `classification` on the same Stage 2 pair. Production HTTP strips `preBackstopClassification` before the public card, so this runner captures `matchAllSources` in-process.
3. Did the permission-to-edit structural test fire on the comparatives sentence (`supportSpan_classification_conflicting` in `lib/revise-actions/silence.mjs`).

A miss on (1) is a result. Do not rerun looking for it.

## Design

One run. Seed 1 as shipped (`STAGE2_SEED = 1`). Temperature 0.

- Evidence on. Editorial off. Compliance off. `skipCommentary: true` (Stage 5 is not needed for these three questions and would burn the ceiling on prose).
- Widened pass on. Skipping it would make question 3 unanswerable.
- Stage 1b on, as production default. Claim spans cannot change a `no_support` card and can only upgrade a whole-sentence `partial` when every claim is confirmed. Record whether they ran.
- Local `runPipelineV4`, not production HTTP. HTTP cannot settle question 2.
- Cache: in-process memory only, empty at start. The first Stage 2 call is live (the measurement). The pipeline then hits that memory so card assembly uses the same pair objects, not a second judgement. The shared diagnostic disk file `scripts/diagnostic/.llm-cache.json` is not read. A cached answer would be wrong here because the model's judgement is the thing being measured. Using that stale file would also mix other fixtures into this exhibit.
- Identify the two sentences by needle, not by assumed Stage 1 index. The recorded draft is hard-wrapped.

Ceiling $10. Stop if actual billed cost reaches it.

## Attack (before the run)

- One temperature-0 seed-1 run cannot disprove the operator observation if SHAPE B does not reproduce. The instruction is to treat a miss as the result and stop. The exhibit is still worth keeping: B154 stops depending on a thrown-away run.
- `skipCommentary: true` means the saved cards have empty `evidenceSummary`. The lost run's commentary is not recovered. The three questions do not need it. Stage 5 "no source addresses the claim" wording is a product question, not this exhibit.
- Framing-fidelity in `assembleCard` can still call an LLM on evaluative language. Cheap, and it does not change evidence verdicts.
- If Stage 1 merges the comparable sentence with a neighbour, the exhibit is weaker on SHAPE B. The runner records that instead of inventing a split.
- A second Stage 2 call mixed with pipeline verdicts would make question 2 unanswerable (B61 flap). The memory-cache write-through exists so that does not happen.
- Production-API-only save would be worthless: no `preBackstopClassification`.
- Replaying the stale diagnostic disk cache would be worthless: it does not contain these pairs, and using it would pretend a recomputation was the lost run.

## How to run

```
node scripts/diagnostic/review/b154-exhibit/run.mjs
```

Writes, next to this file:

- `stage1.json`
- `stage2-pairs.json` (includes `preBackstopClassification` and `periodAssessment`)
- `qc-cards.json`
- `findings.json`
- `summary.json`

## Result (captured 2026-09-03)

One live run. Metered Stage 1 plus Stage 2: $0.07. Prompt pin held (R10, trimmed `hashPromptContent` `44847c61...`). Do not rerun looking for SHAPE B.

1. SHAPE B did not reproduce. S7 comparative sentence: Stage 2 `no_support`, card `not_supported` / `displayVerdict` `not_supported`. Explanation: source does not address comparable-manager MOIC. Card `primaryExcerpt` is null. The pair object still carried the Fund III 1.4x mark as `passage`; that did not become a green or partial badge.
2. First-close S8 reached `no_support` through the period-overlap rule. `preBackstopClassification` `conflicting`, `classification` `no_support`, periods Q3 2026 vs Q1 2027, `periodsDoNotOverlap` true.
3. Permission-to-edit did not fire on the comparatives sentence. Card is silent. `supportSpans` empty. Widened pass skips `no_support`.
