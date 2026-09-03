# B154 / B149 sizing (read only, free, ships nothing)

EXPLORATORY. No number from this folder is a baseline or a gate.
Zero model calls. Do not regenerate the Brackenhill sample. Do not re-run Review.

## What this measures

Two free counts, pinned before the numbers, and one refused count.

### Count 1. B149 structural permission (run)

Question: on stored Review cards, how often does `supportSpans[].classification === "conflicting"` fire the structural silence tests in `lib/revise-actions/silence.mjs`, including as the sole firing test?

That is the mechanism B149 names. It is not a verdict-error rate. It is not a SHAPE B rate.

Population: the four Stage 0 Review artefacts in `scripts/diagnostic/revise/per-finding-action-list/inventory.mjs`. Report per artefact. Do not sum them. They are four snapshots of two drafts (Meridian family).

Counting rule, pinned:

1. Take each `payload.statements[].qcCard`.
2. Restrict to evidence-gap cards (`isEvidenceGap` from `lib/revise-actions/silence.mjs`).
3. Record every `STRUCTURAL_TESTS` id that fires.
4. `silent` is `statementIsSilent(card)`.
5. `b149SpanConflictFired` is true iff `supportSpan_classification_conflicting` fired.
6. `b149SoleCause` is true iff the only firing test is `supportSpan_classification_conflicting`.

Two readings are reported and not collapsed: (5) any fire, and (6) sole cause. They answer different questions. A remaining ambiguity that does not change the field being read is not a reason to stop.

Does this pattern appear in correct writing? The four artefacts are live Meridian Review payloads (operator drafts plus the coverage-gap / condition-b variants), not planted Stage 2 exhibits. The count measures how often the silence consumer reads a widened-matcher conflict mark on those stored cards. It does not measure whether that mark was wrong.

Can a scorer register SUCCESS on every row? Yes for this count: each row is a stored card, the tests are deterministic, and a recount is the same JSON.

### Count 2. Period-gate shaped backstop on the R10 blast (run)

Question: on stored Stage 2 pair rows (`scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json` `corpusRows`, `variantId === "R10"` only), how often did the backstop rewrite `confirmed` or `conflicting` to `no_support`?

That is the shipped period-overlap product (plus the procedural-closer rewrite, which is filtered out by `isProceduralCloserStatement`). It is not a SHAPE A error rate. The blast is a fixture corpus. Planted and independent statements are mixed. This count measures what the backstop did on that corpus, which is mostly what the fixture authors put in.

The blast rows do not store `periodAssessment`, so this cannot prove the period gate rather than some other confirmed/conflicting to no_support rewrite. Procedural closers are excluded by the predicate. Remaining confirmed/conflicting to no_support rows are labelled `period_gate_shaped`, not `period_gate_proven`.

### Count 3. SHAPE A and SHAPE B rates (refused)

There is no sound mechanical check on stored data.

SHAPE A would need ground truth that a source stated a competing value while Stage 3 said `not_supported`. Forbidden detectors: string-matching Review commentary; reading `primaryExcerpt` as that ground truth. Stored cards do not keep `preBackstopClassification` or `periodAssessment`.

SHAPE B would need ground truth that no source addressed the claim while Stage 3 said `partially_confirmed` on an unrelated figure. Same forbidden detectors.

The Brackenhill action-list sample identifies two statements (S8, S7) but is not a Review payload. It is emitted as identification rows, unlabelled by the machine.

Where the population is small, the right output is the per-row dump, not a scorer.

## Attack on this design (before numbers)

- Count 1 can be zero on these four artefacts and still be live on Brackenhill. Zero here is not safety.
- Count 1 cannot tell SHAPE B from a genuine span conflict on a genuine partial.
- Count 1 does not include the 2026-08-24 Meridian passes that **B89** cites. Those passes are not these four files.
- Count 2 lives on a hash-pinned fixture corpus. Rarity there is not live exposure.
- Count 2 cannot see event-date first-close mismatches unless the blast planted them.
- Emitting Brackenhill S7/S8 as "the two errors" would launder an operator observation into a count. The script does not do that.
- `r10-production-verify.json` is a fifth Meridian snapshot. It is not in Count 1. Do not add it quietly to the four.

## How to run

```
node scripts/diagnostic/review/b154-b149-sizing/run.mjs
```

Writes `rows.json`, `summary.json`, `brackenhill-rows.json`, `blast-backstop-rows.json` next to this file.

## Provenance of the Brackenhill sample

`scripts/diagnostic/revise/per-finding-action-list/brackenhill-2026-09-02.md` says the JSON is the list response transcribed from the 2026-09-02 live run and must not be regenerated. `thing2` on evidence rows is copied from Review `evidenceSummary` (`lib/revise-actions/inventory.mjs`). That is enough to identify which statements the operator was looking at. It is not the lost Review payload: no `supportSpans`, no Stage 2 fingerprints, no `periodAssessment`, no SHA.
