# Review accuracy labelled set

Permanent instrument for a 100-statement accuracy measurement of Review evidence verdicts. Built 2026-09-05. Do not regenerate `statements.json`, `group-a-design.json`, `sample-manifest.json`, or `labels.json` to move a score. Those four files are on the P29 protect list.

## Protocol

1. Stage 1 extract, fixtures 01-20 only, cache off, Stage 1b skipped. Two passes. Freeze run 1 if mismatched statement slots are at most 5.
2. Group A is every statement whose text contains a planted-fault span from `group-a-design.json`. Spans are quoted from the fixture draft. Membership never reads a pipeline verdict. F15 contributes zero. Hard cap 25. If mapping exceeds 25, stop and wait for Ben to cut the design file in writing before sampling Group B.
3. Group B is `100 - |A|` drawn from the non-A pool. Seed `20260905`. Weighted by per-fixture non-A statement count (Hamilton largest remainder). F15 capped at 6. No per-fixture floor.
4. Ben labels on `worksheet.md`. Blind: no pipeline output. Labels: C / P / X / N / E.
5. Score later with `score.mjs` against `displayVerdict` (map `not_supported` to `no_support`; also map `supported_full` to confirmed, `supported_partial` to partially_confirmed, `conflict` to conflicting). Never average Group A and Group B.

## Known limit of this instrument

The label unit is one statement against the sources, so it cannot express a contradiction between two statements in the same draft. F13 was built to test internal inconsistency and this set can only measure the part of it that shows up as a single statement disagreeing with its source.

## Ruling 1 (Ben, 2026-09-05)

If ANY uploaded source contradicts the statement, the label is Conflicting, even where another source or passage confirms it. A contradicting source is exactly what a reviewer must see. When a false red trades against a false green, keep the false red.

Current Stage 3 is any-confirmed-wins (`lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` lines 31-35). The scorer counts that behaviour as wrong on those statements, and also reports how many disagreements are attributable to any-confirmed-wins rather than to a matching or grading error.

A superseded figure in an older source is not a live contradiction (Ben, 2026-09-05). If the draft matches the most recent source and only an older source disagrees, the label is Confirmed. Matches the supersession rule shipped under tag `review-supersession`. On 2026-09-05 the two F13 ARR rows were moved from Group A to Group B for this reason. Group A is 11. Group B is 89. The 100 statements were not resampled.

## Adjudication rules

Settled by Ben on 2026-09-05 while labelling the 100-statement set. The same text sits on the worksheet cover.

Mixed statements: judge the whole sentence and let the most serious problem decide. If any part is contradicted by a source, label X even if the rest is fine. Otherwise, if some parts are supported and some are not, label P. If nothing in the statement is addressed at all, label N. If all of it is supported, label C.

Contradicted is not the same as quiet. A source that positions a transaction as still pending contradicts a claim that it is done. A source that simply never says what happened next does not: that is P, not X.

Intensifiers. An intensifier the source does not offer is unsupported, so P. An intensifier the source matches in strength is C.

Attribution. A correct figure credited to only some of the causes the source names is partly unsupported, so P.

Escalation and broadening. Raising the degree of a claim, or widening its scope, without source backing is unsupported rather than contradicted, so P.

Stripped alternatives. Dropping a source's stated either/or and asserting one branch as expected contradicts the source's own hedge, so X.

Severed antecedents. Where the split leaves a sentence unable to identify what it refers to, label P. Reserve E for sentences that are genuinely malformed.

Paraphrase. A fragment or reworded list item that carries the source's meaning is confirmed. Form is not the test.

Implied but not stated. A detail the source strongly implies but never states is not addressed.

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
