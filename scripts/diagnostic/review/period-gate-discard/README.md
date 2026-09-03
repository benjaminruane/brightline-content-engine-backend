# Discarded conflict judgement on non-overlapping periods

FREE. Read only. Zero model calls. Does not change the Stage 2 prompt or pin. Does not file a backlog row.

This is not B154. B154 is SHAPE B (false green on a comparative). This folder sizes the period-overlap rewrite that throws away a `conflicting` (or `confirmed`) classification when parseable periods do not overlap.

## How to run

```
node scripts/diagnostic/review/period-gate-discard/run.mjs
```

Writes `summary.json` next to this file.

## Result (2026-09-03, free)

Two populations, not summed.

R10 corpus blast, 378 pairs, variant R10: **1** rewrite, planted F90_S0, `conflicting` to `no_support`. Statement: "The firm invested in Helios Grid Controls in 2024." Blast rows have no `periodAssessment`. Zero CORPUS. Zero INDEPENDENT.

B154 exhibit, 10 pairs: **1** proven rewrite, S8 first close, `conflicting` to `no_support`, Q3 2026 vs Q1 2027.

If those rewrites stopped, both cards would show **Conflicting** / **Conflicts with sources**, and Implement Changes could grant ACTION. The stored rewrite set contains no ordinary recurring-revenue pair. That absence is not a separator in the product: the rule does not know uniqueness.
