# Spend ledger

One row per billed pass. USD is the named source, not a guess. Unpriced calls are an undercount, never silent zero.

| Date | Pass | USD | Calls | Unpriced calls | Unpriced models | Source | Notes |
|------|------|-----|-------|----------------|-----------------|--------|-------|
| 2026-09-19 | Claim-disagreement recordings (R1 to R6) | 1.1147 | 122 | 0 | none | Langfuse generation `calculatedTotalCost` (same as trace `totalCost`) on the eight `analyse-statements` traces in `tests/fixtures/b247/` | All `gpt-4o-2024-08-06`. Possible undercount of one Stage 2 single-pick on r6-near-limit (19 logged, 20 expected). Stage 1b produced no generations. |
