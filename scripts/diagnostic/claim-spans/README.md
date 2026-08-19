# B53a claim-span shadow gate

Read-only. Does not commit. Compares flag-OFF (`V_today`) to flag-ON (upgrade-only rollup) on the same Stage 1 + whole-sentence Stage 2 outputs so LLM variance cannot create false hasConflict flips.

```
node scripts/diagnostic/claim-spans/run-shadow.mjs
node scripts/diagnostic/claim-spans/run-shadow.mjs --refresh-baseline
```

Loads `.env.local` via the diagnostic env helper. Needs `OPENAI_API_KEY`.

Shared Stage 1 and whole-sentence Stage 2 results are cached to gitignored `scripts/diagnostic/claim-spans/.baseline.json`. Subsequent runs reuse them unless `--refresh-baseline` is passed or the Stage 1 / Stage 2 / `stage2_v4.md` / model-config fingerprint changes. Stage 1b and per-claim Stage 2 still run every time.

Stage 2 concurrency is capped at **24** (`STAGE2_CONCURRENCY`). Each Stage 2 request sends a fixed `seed`. Matches store `systemFingerprint`.

## What it runs

1. Nordholt expanded CLEAN (`~/Downloads/draft_hold_update_clean.txt` + four sources)
2. Nordholt expanded DIRTY (`~/Downloads/draft_hold_update_DIRTY.txt`)
3. `scripts/diagnostic/supersession/` fixture (S0-S3)
4. Diagnostic fixtures 01-23 that have loadable `.txt` sources (PDF fixtures are skipped unless `sources-extracted/` is present)

Editorial, commentary, and the widened multi-passage pass are not part of this gate. Verdict and `hasConflict` are computed from Stage 1 + 2 + supersession + claim-span rollup, the same functions the v4 orchestrator uses.

## Pass conditions

- The only allowed verdict transition is `partially_confirmed -> confirmed`
- Zero `hasConflict` changes
- On a run where Nordholt CLEAN S0's baseline is `partially_confirmed`, the upgrade fires
- Supersession S0/S1 stay supported plus note; S2/S3 stay conflict
