# Document-level editorial slice (B275)

BUILD SPEC. Backend only. Ids: **B275**. Measured and not shipped.

D7 stopped the ship: the document-level call did not recover the materiality findings B271 lost, and old-versus-new moved past the wobble floor. Production path unchanged. No production Review.

---

## Scoreboard

Both production runs: **not run**. D7 stop.

| | Floor (old vs old) | New vs old | Materiality recovered |
|--|--:|--:|--|
| Shopify 40-subset | **12/40** | **28.5/40** mean | **0 of 7** |
| 17-card prefix control | **4/17** | **9.5/17** mean | 0 of 1 (index 2) |

Layer B on the memo returned only `voice_consistency` (first person). No `materiality`. No `audience_calibration_jargon`.

Ids used: **B275**. Next free after B274. No second id: the pool derivation (5) did not ship.

---

## Part 0A. Claims

**C1 BLOCKING. TRUE.** Pool 4 completed 186/186 in 123368 ms on 2026-09-19 (B268, trace `4b8de172-d062-49ac-9ebd-b2b4fe1aab49`). The next day the honesty-disclosure production proof at the same setting lost 102 Stage 6 checks in 140174 ms (trace `9c073219-5b96-4f1c-8ba2-84dd60289f21`, 58 editorial + 44 compliance `not_reviewed`). CONFIRMED `docs/BACKLOG.md` B268 and `docs/SPEND_LEDGER.md` 2026-09-20 honesty row. The setting is not a fix.

**C2 BLOCKING. TRUE.** B271: drop `FULL DRAFT`, keep neighbours, mean codesDiffer 26.25/40 vs floor 13/40, eight of twelve stable shifts `materiality` going clean. CONFIRMED `docs/BACKLOG.md` B271.

**C3 CHECK.** Settled: **`materiality`, `audience_calibration_jargon` (first use), `voice_consistency` (throughout).** Not `narrative_coherence`. Rule text for coherence is neighbours (`editorialRules.js` L120). B271 movement of that id is extra siblings in `FULL DRAFT` (B99 leak), not a reason to send the whole draft. Putting it on a document call would enlarge B99. CONFIRMED the rule text and B271 stables.

---

## Part 0B. Design

| Item | Verdict | What happened |
|------|---------|----------------|
| D1 Document-level call | **AGREE.** Built. One request, numbered sentences, those three rules, exact-quote findings. | `lib/qc/document-level-review.mjs`. Not on the production path. |
| D2 Unlocated finding | **AGREE: unplaced, logged, never a guessed index, never a silent clean.** Call failure is `not_reviewed`. | `quote-locate.mjs`. Locate miss reason `quote_not_found`. |
| D3 Per-sentence loses the draft and the moved rules | **AGREE.** Measured. **Not shipped.** | Production still pastes `FULL DRAFT` and still lists all 14 editorial rules. |
| D4 Misattribution guard | **AGREE.** Failed before locate existed (`Cannot find module quote-locate.mjs`). Passed after. Planted first-person lands on sentence 1, not claimed index 2. Restatement lands on sentence 3, not the thesis. Missing quote is unplaced. | `tests/quote-locate-misattribution.test.mjs` 5/5. |
| D5 Pool from new token volume | **AGREE on the derivation, REJECT the ship.** Quiet-success in-flight 4 * (14813+3325) = 72552. New Layer C 10039+3325 = 13364. `Math.floor(72552/13364) = 5`. If the account is busier than that measurement (C1), 429s still exhaust to `not_reviewed`. Do not raise the cap from one green run. | Production stays **4**. |
| D6 Comparison | **KILL.** See below. | |
| D7 Ship only if D4 and D6 hold | **STOP.** D4 holds. D6 does not. | No production POST. |
| D8 Scope | **AGREE.** Split, Stage 2 prompt, compliance scope unchanged. CONFIRMED `git diff` on `lib/qc/pipeline-v4/index.mjs`, `stage2_v4.md`, `complianceRules.js`: empty vs HEAD for the production path. | |

---

## D4 fail then pass

Before `lib/qc/quote-locate.mjs` existed:

```
FAIL  tests/quote-locate-misattribution.test.mjs
Error: Cannot find module '../lib/qc/quote-locate.mjs'
```

After locate existed: 5/5 passed. Claimed index is ignored.

---

## D6. Materiality recovery, by name

This spec's floor, not B271's 13: old-a vs old-b on current code **12/40**.

Both olds agreed `materiality` on indexes **44, 65, 86, 99, 107, 113, 180**.

Both news: **none of those seven kept `materiality`.** Layer B attached only `voice_consistency`, and only one of those (index 40) sat inside the 40-subset.

Stable `materiality` going clean: 65, 86, 99, 107, 113, 180 (44 also lost, not in the stable-shift list because olds disagreed on other codes). Index 180 became `narrative_coherence`, the B271 shape.

Mean old-versus-new **28.5/40** (pairs 28, 28, 29, 29). Kill: 28.5 > 12.

Small control: floor 4/17, mean 9.5/17. The control moved. Second kill.

New 40 input tokens 359685 vs old 592509 (41 calls vs 40). The token save is real. The findings are not.

---

## Proof. Two production runs

**Not run.** D7: if findings moved past the floor, do not ship, do not run a third until one looks good, and do not run production to make a failed slice look shipped.

The question "do checks complete RELIABLY" is unchanged from C1. Pool 4 still sometimes finishes and sometimes 429s. This slice did not get to change that.

---

## What was not built (leftover allowed)

Layer A. Batching. Split change. Stage 2 prompt. Compliance scope. Production wiring of Layer B. Pool 5. Two production Reviews.

Kept in tree, unused by the pipeline: quote-locate, document-level-review module, planted fixture, harness `--document-level` and `compare-floor`. So the next attempt does not rebuild the bind.

---

## Corpus

Did not move. Stage 1 split, Stage 2 prompt, compliance scope, and the production editorial payload are unchanged vs HEAD. Vitest count rose only by the new locate and document-level tests. Evidence regression suite was not re-baselined.

---

## Cost report

Budget USD 40. This pass **list USD 6.7533**. Discounted USD 4.0114. 232 calls. USD 0 production. Under budget.

| Pass | List USD | Discounted USD | Calls | Wall ms |
|------|---------:|---------------:|------:|--------:|
| old-40-a | 1.530872 | 1.104953 | 40 | 32668 |
| old-40-b | 1.535142 | 0.822982 | 40 | 13372 |
| new-40-a | 0.963642 | 0.579802 | 41 | 19000 |
| new-40-b | 0.964282 | 0.529403 | 41 | 17892 |
| old-prefix-a | 0.471155 | 0.267155 | 17 | 7146 |
| old-prefix-b | 0.471975 | 0.253255 | 17 | 6011 |
| new-prefix-a | 0.408525 | 0.231085 | 18 | 9658 |
| new-prefix-b | 0.407745 | 0.222785 | 18 | 8391 |

Source: local `getLlmSpend` on `scripts/diagnostic/runs/stage-replay/b275-*.json`. All `gpt-4o-2024-08-06`.

---

## Disagreement

Layer B seeing the real draft once is not enough if the model, asked only for document-level rules, does not fire `materiality` on the sentences the per-sentence call with the draft does fire. This is the missing half of B271, measured. Shipping Layer C without that half is shipping B271. Do not.

The planted bind is the part that worked. The document-level *judgement* is the part that did not.
