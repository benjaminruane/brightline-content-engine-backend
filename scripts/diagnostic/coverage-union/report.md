# Multi-source coverage union diagnostic

Read-only. No product verdict change. Stage 2 ran with span elicitation ON, from cache.

Rollup that this diagnostic reads: `lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` function `aggregateVerdict` (any-confirmed-wins), called from `runPipelineV4Inner` in `lib/qc/pipeline-v4/index.mjs`. Card display mapping after that: confirmed -> supported_full.

## Cache

- Stage 2 hits 414, misses 0
- store kind: disk; entries at start unknown after load
- Pure cache replay (misses 0).

## Counts

Cards: 293
supported_partial cards: 13
supported_partial with two or more distinct contributing sources: 0

1. Population (supported_partial AND coverageComplete AND no conflicting pair): 0
   The population is empty. That count is a real zero, not a missing corpus. The three demonstration cards (nordholt-clean 0, nordholt-clean 2, F23 1) are already supported_full because aggregateVerdict is any-confirmed-wins and at least one source returned confirmed. The remaining supported_partial cards are single-source fixtures, so a coverage union cannot form. It is not because most contributing pairs returned WHOLE spans (only 2 of the 13 supported_partial cards have a WHOLE span).

2. coverageComplete AND a conflicting pair (must never be greened): 0
   None.

3. coverageComplete AND a no_support pair, no conflicting (no_support does not block): 0
   None.

4. Cards with a contributing partially_confirmed WHOLE-statement span (empty complement): 4
   Of those, 4 are outside the population.

Would-promote under the commit-2 rule (population plus at least two distinct contributing sources): 0

## Rejected second-call spans (from this replay)

Count: 2
- nordholt-clean statement 2 source 1 (press release)
  statement: "Following the acquisition of Baltic ColdCo in June 2026, combined annual revenue stands at approximately EUR 155 million, of which around 70 per cent is contracted, providing a solid base of recurring income."
  raw: "Following the acquisition of Baltic ColdCo in June 2026, ... of which around 70 per cent is contracted, providing a solid base of recurring income."
- F18 statement 6 source 1 (18b_synth_cross_source_pair_update)
  statement: "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen."
  raw: "independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness, a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen."

## Fixtures not in the cached set

- F90 (90_adversarial_b17_latent.json): not in the cached shadow-gate baseline
- F91 (91_adversarial_temporal_gap.json): not in the cached shadow-gate baseline
- F92 (92_adversarial_present_tense_stale.json): not in the cached shadow-gate baseline
