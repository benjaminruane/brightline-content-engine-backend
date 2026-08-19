# B53a claim-span shadow gate

Read-only. Does not commit. Compares flag-OFF (`V_today`) to flag-ON (upgrade-only rollup) on the same Stage 1 + whole-sentence Stage 2 outputs so LLM variance cannot create false hasConflict flips.

```
node scripts/diagnostic/claim-spans/run-shadow.mjs
```

Loads `.env.local` via the diagnostic env helper. Needs `OPENAI_API_KEY`.

## What it runs

1. Nordholt expanded CLEAN (`~/Downloads/draft_hold_update_clean.txt` + four sources)
2. Nordholt expanded DIRTY (`~/Downloads/draft_hold_update_DIRTY.txt`)
3. `scripts/diagnostic/supersession/` fixture (S0-S3)
4. Diagnostic fixtures 01-23 that have loadable `.txt` sources (PDF fixtures are skipped unless `sources-extracted/` is present)

Editorial, commentary, and the widened multi-passage pass are not part of this gate. Verdict and `hasConflict` are computed from Stage 1 + 2 + supersession + claim-span rollup, the same functions the v4 orchestrator uses.

## Pass conditions

- The only allowed verdict transition is `partially_confirmed -> confirmed`
- Zero `hasConflict` changes
- The Nordholt CLEAN underwriting + 14 per cent IRR sentence is among the upgrades
- Supersession S0/S1 stay supported plus note; S2/S3 stay conflict
