# Review accuracy labelled set

Permanent instrument for a 100-statement accuracy measurement of Review evidence verdicts. Built 2026-09-05. Do not regenerate `statements.json`, `group-a-design.json`, `sample-manifest.json`, or `labels.json` to move a score. Those four files are on the P29 protect list.

## Protocol

1. Stage 1 extract, fixtures 01-20 only, cache off, Stage 1b skipped. Two passes. Freeze run 1 if mismatched statement slots are at most 5.
2. Group A is every statement whose text contains a planted-fault span from `group-a-design.json`. Spans are quoted from the fixture draft. Membership never reads a pipeline verdict. F15 contributes zero. Hard cap 25. If mapping exceeds 25, stop and wait for Ben to cut the design file in writing before sampling Group B.
3. Group B is `100 - |A|` drawn from the non-A pool. Seed `20260905`. Weighted by per-fixture non-A statement count (Hamilton largest remainder). F15 capped at 6. No per-fixture floor.
4. Ben labels on `worksheet.md`. Blind: no pipeline output. Labels: C / P / X / N / E.
5. Score later with `score.mjs` against `displayVerdict` (map `not_supported` to `no_support`; also map `supported_full` to confirmed, `supported_partial` to partially_confirmed, `conflict` to conflicting). Never average Group A and Group B.

## Ruling 1 (Ben, 2026-09-05)

If ANY uploaded source contradicts the statement, the label is Conflicting, even where another source or passage confirms it. A contradicting source is exactly what a reviewer must see. When a false red trades against a false green, keep the false red.

Current Stage 3 is any-confirmed-wins (`lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` lines 31-35). The scorer counts that behaviour as wrong on those statements, and also reports how many disagreements are attributable to any-confirmed-wins rather than to a matching or grading error.

## Seed

`20260905`

## Prices

- Stage 1 extract (this pass): accepted ceiling $1. Estimate was about $0.15 per pass. Actual: run 1 $0.1357, run 2 $0.1357, total $0.2714. Stability gate passed with 0 mismatched slots.
- Evidence scoring run (not run): estimate $8 to $15, ceiling $20. Editorial and compliance off. Price again before spending. Do not run it until `labels.json` is filled.

## Falsifiers (report loudly once labels land)

- Escape rate above 15 percent: the statement unit is the wrong grain. This is May again.
- Group B Ben-Confirmed below 40 after escapes: the false-alarm number cannot be spoken aloud.

## Join

`fixtureId` + NFC + collapsed whitespace + occurrence index. No fuzzy matching. `charStart` / `charEnd` are diagnostics only.

## Stage 1 non-claim drops

The current splitter drops salutations, closings, and transitions (`lib/qc/pipeline-v4/stage1-extract-statements.mjs` around lines 378-392). Those sentences are not in the labelled set. That is the current pipeline list, not a second grain.

## Commands

```
node scripts/diagnostic/accuracy/extract-stage1.mjs --stability-gate
node scripts/diagnostic/accuracy/sample.mjs
node scripts/diagnostic/accuracy/generate-worksheet.mjs
node scripts/diagnostic/accuracy/score.mjs --labels <file> --cards <file> --manifest scripts/diagnostic/accuracy/sample-manifest.json
npx vitest run tests/accuracy-label-set.test.mjs
```

Do not re-run extract or sample after labels exist.
