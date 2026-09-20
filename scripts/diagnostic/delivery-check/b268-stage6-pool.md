# Close the missing Stage 6 checks (B268)

BUILD SPEC. Backend only. Ids: **B268** (pool, closed), **B273** (prompt honesty, measured and not shipped).

Proof: production `POST /api/analyse-statements` HTTP 200 in **123368 ms**. Editorial **186/186**. Compliance **186/186**. `not_reviewed` **0**. Trace `4b8de172-d062-49ac-9ebd-b2b4fe1aab49`. Pool **4**. Tag `b268-stage6-pool-4`.

---

## Scoreboard

| | Before (`de18131c-507f-4111-85ec-ffc15be7de8c`) | After (pool 4) |
|--|--|--|
| Editorial completed | 122/186 | **186/186** |
| Compliance completed | 152/186 | **186/186** |
| Cards still `not_reviewed` | 64 editorial + 34 compliance | **0** |
| Wall | 81898 ms | **123368 ms** |
| List USD | 8.4497 | **11.1897** |
| Discounted USD | 5.13 | **6.8920** |
| Function cap | 300 s | 300 s (176 s headroom) |

Ids used: **B268** (given). Next free for the honesty row: **B273**.

---

## Part 0B. D1 to D6

| Item | Verdict | What shipped |
|------|---------|--------------|
| D1 Lower the number in flight | **AMEND.** Named try was 8. 8 still lost the last 39 checks (editorial 167/186, compliance 166/186, indexes 148-184). Shipped **4**. Wall 123 s vs 82 s. CONFIRMED `lib/qc/pipeline-v4/index.mjs` L45. | `STAGE6_CONCURRENCY = 4`. Stage 2 and Stage 5 stay 24. |
| D2 Two calls per sentence | **AMEND.** The lever is the pool number, not the pairing. Editorial concurrency equals N either way. Pairing only adds the lighter compliance calls. Unpairing would add wall without cutting editorial TPM. Left `Promise.allSettled` on the two calls. CONFIRMED `editorial-compliance-reviewer.mjs` L2207. | Pool only. |
| D3 A miss still says so | **AGREE.** Thrown `callLLM` still stamps `not_reviewed`, never `clean`. CONFIRMED `tests/b268-stage6-pool.test.mjs` (passed on current code before the pool change, and after). Writers `markEditorialNotReviewed` / `markComplianceNotReviewed` L1570-1586. | No weakening. |
| D4 Size at which this stops | **AGREE.** See below. | Recorded on **B268**. |
| D5 Prompt honesty line | **DO NOT SHIP.** Mean codesDiffer 24/40 vs wobble floor 13/40. Four stable shifts. Line left alone. Filed **B273**. | No prompt change. |
| D6 Scope | **AGREE.** Editorial payload, Stage 1 prompt, Stage 2 prompt untouched. CONFIRMED `git diff` on this spec: `lib/qc/pipeline-v4/index.mjs` L45 and tests only. | Stop not needed. |

Instead of 8: 4, after a production counter-example. Instead of unpairing: do not. Instead of shipping D5: leave the lying scope line; it is load-bearing in the same way B271 was.

---

## Part 0A. C1 to C3

**C1 BLOCKING. TRUE.** CONFIRMED `docs/BACKLOG.md` B268 as filed; Langfuse 64 editorial ERROR + 34 compliance ERROR on `de18131c-507f-4111-85ec-ffc15be7de8c`; `async-review-build.md` L87-88.

**C2 BLOCKING. TRUE as mechanism.** Same prompt, same one-statement array, same `FULL DRAFT`, same temperature 0. Only `mapPool` cap changes. CONFIRMED `lib/qc/pipeline-v4/index.mjs` L575-614. Editorial wobble (B271 old-versus-old 13/40) remains an API property. The pool does not add a new finding path.

**C3 CHECK. TRUE.** Priced Stage 6 input 1,807,204 + 505,449 = 2,312,653. CONFIRMED `review-cost-proposal.md` L45-46. Misses at the same means: 64 * 14,813 + 34 * 3,325 = 1,061,082. Full Stage 6 input 3,373,735. At 2,000,000 TPM: 3,373,735 / 2,000,000 * 60 = **101.2 s**. CONFIRMED cap `ARCHITECTURE.md` L30. Headroom if Stage 6 were the only stage: 300 - 101 = 199 s. It is not. This memo completed in 123 s with pool 4, so **177 s of Function headroom** on a document this size. A larger document spends that headroom on more statements times a longer `FULL DRAFT`.

---

## Size at which this stops working

**About twice this memo.** HYPOTHESIS: ~7400 words / ~370 statements, when both sentence count and draft length double, because `FULL DRAFT` is in every editorial call.

Reason: this memo's Stage 6 floor is 101 s of TPM. Other stages plus wait took the rest of 123 s. Cap 300 s. Doubling statements and draft tokens: editorial ~7.29M + compliance ~1.24M = 8.53M, TPM floor ~256 s, plus other stages ~50 s, about 300 s.

Then: lower Stage 6 further, or split Stage 6 across a minute boundary, or a worker. Do not stamp a miss as clean.

---

## D5 measurement (B273). Not shipped.

Same 40-statement subset as B271. Old-a / old-b reused as the floor. Two new runs with the honest scope line (then reverted).

| Pair | codesDiffer | verdictDiffer |
|------|------------:|--------------:|
| old-a vs old-b (floor) | 13 | 5 |
| honesty-a vs honesty-b | 13 | 4 |
| old-a vs honesty-a | 24 | 9 |
| old-a vs honesty-b | 25 | 9 |
| old-b vs honesty-a | 24 | 10 |
| old-b vs honesty-b | 23 | 8 |
| **Mean old vs new** | **24** | |

Kill: 24 > 13. Four stable shifts: index 12 `currency_format` added; 18 `materiality` added; 22 `defined_term_capitalisation` to `sentence_structure_clarity`; 73 `materiality` dropped.

Spend: honesty-a list USD 1.545243 / discounted 1.131962; honesty-b 1.543073 / 0.902913. 40/40 succeeded both runs. Wall 11227 ms and 11700 ms at pool 8.

The line still says only `narrative_coherence` may use surrounding context. CONFIRMED `editorial-compliance-reviewer.mjs` L76. Measurement still shows the model uses the draft for other rules. Do not correct it until a wording exists that does not move codes past this floor.

---

## Tests, failing then passing

On HEAD `fde4756` before the pool change:

```
FAIL  Stage 6 is 8; Stage 2 and Stage 5 stay 24
  24 !== 8
FAIL  the v4 pipeline still pools Stage 6 with mapPool
  export const STAGE6_CONCURRENCY = 8  (false)
PASS  a thrown Stage 6 call is not_reviewed, never clean
PASS  the not_reviewed stamp is still the writer on a rejected call
```

After `STAGE6_CONCURRENCY = 8`: those four passed. Production at 8 still missed 39, so the cap moved to 4 and the same assertions now pin 4.

B265 and B270 pinned 24. Those pins were the old contract. They now assert Stage 5 still matches Stage 2 at 24, and Stage 6 is 4. Not a D3 weaken.

Targeted: `tests/b268-stage6-pool.test.mjs` 4/4, `tests/b265-stage-concurrency-pool.test.mjs` 3/3, `tests/b270-stage-replay-harness.test.mjs` 6/6.

---

## SHIP VERIFIED

```
SHIP VERIFIED  60d7aaf  main  102 files  1263 tests
SHIP VERIFIED  badb55e  main  102 files  1263 tests
```

Commits:

1. `60d7aaf` `fix(pipeline): send fewer Stage 6 checks at a time so a long memo can finish (B268)` tag `b268-stage6-pool-8`
2. `badb55e` `fix(pipeline): cut Stage 6 to 4 after 8 still lost the last checks (B268)` tag `b268-stage6-pool-4`

Docs commit follows this report.

---

## Proof

Same memo (`_auditDraft` 22163 chars), same B1 stub inline labelled `B1 Shopify source`, all three checks on. Production `https://brightline-content-engine-backend.vercel.app`.

| | Pool 24 (filed) | Pool 8 (first try) | Pool 4 (shipped) |
|--|--|--|--|
| Trace | `de18131c-507f-4111-85ec-ffc15be7de8c` | `c2a68e35-5d90-4c42-8eb8-1cd955caae70` | `4b8de172-d062-49ac-9ebd-b2b4fe1aab49` |
| HTTP | 200 | 200 | **200** |
| Wall | 81898 ms | 98817 ms | **123368 ms** |
| Cards | 186 | 186 | **186** |
| Editorial | 122/186 | 167/186 | **186/186** |
| Compliance | 152/186 | 166/186 | **186/186** |
| `not_reviewed` | 98 | 39 (last indexes) | **0** |
| Stage 5 miss | 0 | 0 | **0** |
| List USD | 8.4497 | 10.2889 | **11.1897** |
| Discounted USD | 5.13 | 6.9615 | **6.8920** |
| Generations | 818 | 822 | **828** |

Why zero cards still say not reviewed: every Stage 6 call completed. The 429s were the last waves filling TPM. Four at a time stays under the minute.

Evidence mix on the proof run: 1 confirmed / 0 partial / 26 conflict / 159 no support. The filed after-run was 0 / 1 / 26 / 159. Stage 1/2 wobble, not this spec.

---

## Cost report

Budget USD 15. This pass **list USD 24.5669** (over). Discounted USD 15.8884.

| Pass | List USD | Discounted USD | Calls | Source |
|------|---------:|---------------:|------:|--------|
| D5 honesty-a | 1.545243 | 1.131962 | 40 | local `getLlmSpend` `honesty-new-a.json` |
| D5 honesty-b | 1.543073 | 0.902913 | 40 | local `getLlmSpend` `honesty-new-b.json` |
| Production pool 8 | 10.288893 | 6.961533 | 822 | Langfuse `calculatedTotalCost` `c2a68e35-5d90-4c42-8eb8-1cd955caae70` |
| Production pool 4 (the proof) | 11.189713 | 6.891953 | 828 | Langfuse `calculatedTotalCost` `4b8de172-d062-49ac-9ebd-b2b4fe1aab49` |

The second production POST was not in the plan. Pool 8 did not close B268. Pool 4 did. Cached tokens 3,438,208 on the proof (81% of 4,254,591 input).

Per statement on the proof: list USD 0.0602. Per thousand words: USD 3.03 (11.189713 / 3.698).

---

## Disagreement

The named try of 8 was too high for this memo. I would not have known that without the first production POST. The pairing is not the TPM lever; I did not unpair.

D5 looked like copy-only honesty. It moved findings about as far as dropping the draft (B271 mean 26.25). Claude's "just tell the model the truth" is another trap of that class.

B265's test that Stage 6 matches Stage 2 is the old contract. Updating that pin is required once B268 ships a different number. I did not weaken the `not_reviewed` assertions.
