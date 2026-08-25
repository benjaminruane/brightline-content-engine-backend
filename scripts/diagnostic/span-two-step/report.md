# B88 two-step span elicit gate

PASS: zero verdict deltas. Primary cache still hits with the flag ON.

## Pass condition

- Pair-level classification deltas: 0 (must be 0)
- Card-level verdict deltas: 0 (must be 0)
- OFF primary misses: 0 (must be 0; OFF must be a cached replay)
- ON primary misses: 0 (must be 0; existing disk-cache entries must still hit)
- ON primary hits: 357
- Second calls on confirmed: 0 (must be 0)
- Second calls on no_support: 0 (must be 0)

## Cache

The primary Stage 2 system prompt is always stage2_v4.md. promptHash does not include the elicit prompt, so existing disk-cache entries still hit when the flag is ON. Observed ON primary hits 357, misses 0 (OFF was hits 357, misses 0).

- OFF: hits 357, misses 0 (stage2 hits 357, misses 0); primary 357/0 elicit 0/0
- ON: hits 357, misses 57 (stage2 hits 357, misses 57); primary 357/0 elicit 0/57

## Second calls and cost

- Eligible pairs (partially_confirmed or conflicting): 57
- Second calls made: 57
- Of those, live this run: 57; already cached: 0
- Elicit tokens: input 10721, output 1434, total 12155
- Incremental cost of a full corpus pass: $0.0411

## Span return and validation

- Span return rate on eligible pairs: 100.0% (57/57)
- Returned: 57
- Validated: 55
- Rejected: 2
- WHOLE: 22
- Multi-occurrence: 0
- Module counters after ON arm: rejected 2, WHOLE 22, multi 0

## Corpus

Main set is the evidence-span-population corpus: Nordholt clean/dirty, supersession, F01 to F23. Statements come from `.baseline.json` (fingerprint ignored because this commit edits `stage2-match-sources.mjs`).

Main cases: nordholt-clean, nordholt-dirty, supersession, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23

Fixtures present on disk but not in the main cached set:
- F90 (90_adversarial_b17_latent.json): not in the cached shadow-gate baseline
- F91 (91_adversarial_temporal_gap.json): not in the cached shadow-gate baseline
- F92 (92_adversarial_present_tense_stale.json): not in the cached shadow-gate baseline

## Disk / store

- QC_LLM_CACHE_DISK: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/.llm-cache.json`
- disk file existed before run: yes
- disk file bytes: 2205274
- store kind: disk
- store entries at start: 1161
- baseline path: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/claim-spans/.baseline.json`
- baseline case labels: nordholt-clean, nordholt-dirty, supersession, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, E1, E2, E3

Wrote 55 validated spans to `scripts/diagnostic/span-two-step/rows.json`.
