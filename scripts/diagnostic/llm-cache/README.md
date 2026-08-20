# B63 LLM result cache gate

Read-only. Does not commit. Verdict path only (Stages 1, 1b, 2). Stage 5 commentary and the editorial / compliance reviewers are out of scope; caching them is a follow-up (identical prose on a re-run is a separate product question).

```
node scripts/diagnostic/llm-cache/run-gate.mjs
```

Loads `.env.local` via the diagnostic env helper. Needs `OPENAI_API_KEY`. Turns `QC_LLM_CACHE=1` for Tests 1 to 3; Test 4 unsets the flag.

## Persistence

There is no backend document store. Draft version history lives in frontend React state (`versions` in `useDraftState`). Cached rows therefore sit in a process-global in-memory Map, logical collection `qc_llm_cache`, in `lib/qc/llm-cache.mjs`. Same trust boundary as draft content. No new datastore, dependency, or table. Durable only for the life of the Node process (enough for a warm re-review on a warm Vercel instance, and for this gate).

## Known limitation

This makes results repeatable, not correct. The first answer is still whatever the model gave that time, including on a borderline sentence where it might reasonably have said something else. Caching locks in an answer; it does not improve it. The improvement path for borderline compound sentences is B53a, which is already live and shipped.

## What it runs

Diagnostic fixtures 01-23 that load, plus the supersession fixture, plus Nordholt clean/dirty when those files exist under `~/Downloads`.

## Pass conditions

- Test 1 identity: cold then warm, byte-identical verdict, hasConflict, classifications, passages, explanations, claim spans. Diff count must be 0.
- Test 2 invalidation: 2a edited sentence, 2b edited source, 2c added source, 2d one-character change in `stage2_v4.md`, 2e `CACHE_VERSION` bump. Each produces the expected misses and no others.
- Test 3: hit rate and cost for cold, warm, and 2a.
- Test 4: flag unset, no cache reads or writes.
