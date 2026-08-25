# Multi-source coverage union gate

PASS.

Span elicitation ON on both arms. Coverage flag OFF vs ON, applied in memory.
OFF is a cached Stage 2 replay. No new LLM calls when elicit keys are warm.

## Pass condition

- Changed cards: 0
- Illegal transitions: 0 (must be 0)
- To or from conflicting: 0 (must be 0)
- To or from not_supported: 0 (must be 0)
- Away from supported_full: 0 (must be 0)
- Stage 2 cache misses: 0 (must be 0)

## Promoted cards

Count: 0
None.

## Cache

- Stage 2 hits 414, misses 0; store kind disk
- Pure cache replay (misses 0). Incremental spend $0.0000.

## Fixtures not in the cached set

- F90 (90_adversarial_b17_latent.json): not in the cached shadow-gate baseline
- F91 (91_adversarial_temporal_gap.json): not in the cached shadow-gate baseline
- F92 (92_adversarial_present_tense_stale.json): not in the cached shadow-gate baseline
