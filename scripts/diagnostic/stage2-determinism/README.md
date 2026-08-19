# Stage 2 temperature-0 determinism diagnostic

Stages 1 to 3 only. Measures run-to-run classification, verdict, and hasConflict stability.

```
node scripts/diagnostic/stage2-determinism/run.mjs
```

Runs a representative subset **5 times** with shared Stage 1 + whole-sentence Stage 2 per run, then flag-OFF vs flag-ON rollup: Nordholt expanded clean, Nordholt expanded dirty, F06, F18, and `scripts/diagnostic/supersession/`.

Also prints backlog sizing counts A/B (stricter arithmetic) / C over the loadable diagnostic corpus.

Output: gitignored `scripts/diagnostic/stage2-determinism/out/last-run.json`.
