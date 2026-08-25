# B88 diagnostic: evidence-gap span population

Cached replay of Stages 1 to 3 plus Stage 7 assembly. No product code changed.

## Cache state

- QC_LLM_CACHE_DISK: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/.llm-cache.json`
- disk file existed before run: yes
- disk file bytes: 1464572
- store kind: disk
- store entries at start: 793
- baseline path: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/claim-spans/.baseline.json`
- baseline fingerprint valid: yes
- baseline fingerprint: 60f7911c79075c8f
- baseline case labels: nordholt-clean, nordholt-dirty, supersession, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, E1, E2, E3
- LLM cache hits: 126  misses: 0  (stage1 0/0, stage1b 40/0, stage2 86/0)
- misses: 0 (pure cached replay)

## Corpus

Ran the cached shadow-gate corpus: Nordholt clean/dirty, supersession, F01 to F23. No fixture inside that set was dropped.

Fixtures present on disk but not in the cached baseline (not run; running them would bill a live Stage 1/2 pass):
- F90 (90_adversarial_b17_latent.json): not in the cached shadow-gate baseline
- F91 (91_adversarial_temporal_gap.json): not in the cached shadow-gate baseline
- F92 (92_adversarial_present_tense_stale.json): not in the cached shadow-gate baseline

## Revision-prompt import

Imported gatherConcerns and buildRevisionPrompt from lib/build-revision-prompt.mjs with no extra side effects. formatConcernsBlock is not exported; it is reached through buildRevisionPrompt.

## 1. Total cards

293

## 2. Cards by verdict

- supported_full: 252
- supported_partial: 13
- not_supported: 14
- conflicting: 14

## 3. Cards with verdict != supported_full

Non-full total (excludes unclassified): 41
a. hasActionableSpan = true: 3
b. hasActionableSpan = false (B88 population): 38
c. (b) as a percentage of the non-full total: 92.7%

## 4. Within the B88 population: decomposition shape

- claimCount = 0 (undecomposed): 38
- claimCount > 0 but all claims confirmed (unconfirmedClaimCount = 0): 0

## 5. Within the B88 population: statement length

- statementCharCount median: 110.5
- count over 200 characters: 4

## 6. B88 population that does not reach the revision prompt

**reachesRevisionPrompt = false: 0 of 38**

None of the B88 cards are dropped before the assembled concerns block. The gap is missing spans, not missing findings.

## 7. Cross-tab of verdict against hasActionableSpan

| verdict | hasActionableSpan true | hasActionableSpan false |
|---|---:|---:|
| supported_full | 0 | 252 |
| supported_partial | 1 | 12 |
| not_supported | 0 | 14 |
| conflicting | 2 | 12 |

## Unclassified

0
