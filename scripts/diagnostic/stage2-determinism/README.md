# Stage 2 temperature-0 determinism diagnostic

Read-only. Stages 1 to 3 only. No pipeline change.

```
node scripts/diagnostic/stage2-determinism/run.mjs
```

Runs a representative subset **5 times**: Nordholt expanded clean, Nordholt expanded dirty, F06, F18, and `scripts/diagnostic/supersession/`.

Also prints backlog sizing counts A/B/C over the loadable diagnostic corpus (Stage 1 + Stage 1b only for those counts).

Output: gitignored `scripts/diagnostic/stage2-determinism/out/last-run.json`.
