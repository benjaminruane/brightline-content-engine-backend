# B328. Where does a real source break the review?

Read-only. No product code. No model calls. USD 0.
Ran 2026-09-24T14:03:54.458Z. Estimator: shipped `estimateReviewWork` and `preflightReview`. TPM default 2000000. Cap 300000 ms.
Wall pin: busy = B277 Run 4 266680 ms; idle = that wall minus the last wait 119762 ms = 146918 ms. Both scaled by estimated tokens / 5459667 (the estimator at 3698 x 3558).

-----------------------------------------------------------------------------
PART 0A. FACTUAL CLAIMS
-----------------------------------------------------------------------------

C1 BLOCKING. TRUE. `estimateReviewWork` (`lib/qc/stage-schedule.mjs` L58-112) takes `draftText`, `sources`, `editorialSystemTokens`, `complianceSystemTokens`, `stage2SystemTokens`, `stage5SystemTokens`, `tpmLimit`. It counts draft words (`countWords`), turns words into statements (`round(words/20)`), tokens via `ceil(chars/4)`, then sums Stage 1, 1b, 2, 6 editorial, 6 compliance, and 5.
`tpmFloorMs` (`lib/qc/token-estimate.mjs` L34-38) takes `tokenCount` and `tpmLimit` and returns `ceil(tokens / tpm * 60000)`.
The pre-flight (`lib/qc/preflight-guard.mjs` L14-40, called from `api/analyse-statements.js` L267-274) refuses when `estimate.tpmFloorMs > 300000`, with prefixes 9088 / 3000 / 4000 / 1600.
B277 matched its **scheduler** predictions to four production runs, not the pre-flight token sum to Langfuse. The four: Run 1 150-word draft / 3408-word source; Run 2 500 / 3058; Run 3 1500 / 2058; Run 4 3698 / 3558. CONFIRMED `scripts/diagnostic/delivery-check/b277-scheduler-and-wait.md` L117-122 and L128-146. Source size never left the 2k-3.5k band. Every larger source in this spec is an extrapolation. The token estimator itself was not fitted to those four totals; this report compares it after the fact.

C2 BLOCKING. TRUE. What scales with SOURCE length, not draft length, for N statements and S sources:
- Stage 2 first pass (`matchSingleSource`, `stage2-match-sources.mjs` L1091-1106): full source in the user message. **N x S** copies. A schema-fail retry sends it again (0 to N x S more).
- Widened multi-passage (`stage2-match-multipassage.mjs` L85-91): full source again. Up to **N x S** more, gated to supporting pairs (skips `no_support`).
- Claim-span Stage 2 (`matchClaimSourcePairs` L1602-1624): full source per claim x source. Up to **12 x 3 x S** more. Stage 1b itself sets `sourceText: null` (no source).
- Span elicitation (`elicitUnsupportedSpanLive` L1373-1381): statement + passage only. **Zero** full-source copies.
- Stages 1, 5, 6: draft and excerpts. **Zero** full-source copies.
The shipped estimator counts **exactly one** source copy per statement x source (L84-87). It does not count widened, claim-span, or retry copies. It undercounts source volume.

C3 BLOCKING. TRUE. Committed gate table `scripts/diagnostic/delivery-check/b163/gate-table.json`, field `extractWordCount` / `over3700WordCeiling`.
Twenty documents. Min 1087 (d02). Tenth of twenty 5105 (d19). Eleventh 5200 (d14). Even-n average 5152.5. Max 36853 (d13). 16 of 20 marked over3700WordCeiling.
The spec's 'median 5,105 / largest 24,473' are d19 and d01. They are in the table. They are not the even-n median or the maximum. B163's own report already listed d13 at 36,853. This report uses the gate table: max is d13 36,853. The B2 grid still uses the four source sizes the spec named.

C4 BLOCKING. PARTLY. The refuse rule is still `tpmFloorMs > 300000` (`preflight-guard.mjs` L34). The 3698-word memo with a 3558-word source is still accepted (`tests/b277-preflight-guard.test.mjs` L35-45). An 80,000-word pair still refuses (L47-62).
The phrase 'trips around 5,900 words' is **not** in the committed B277 report. This run's computed trip, source held at 3,558, is draft ~6050 words (totalTokens 10007515). Same neighbourhood, same direction: the guard is late relative to the 3,700-word measured ceiling. That mismatch is still true.

-----------------------------------------------------------------------------
PART 0B. DESIGN
-----------------------------------------------------------------------------

B0. How I would answer this without spending money: run the **shipped** estimator, the same function the guard uses, over the draft x source grid, with texts at 6 characters per word (B277 Run 4 was 22163/3698). Pin the 3698 x 3558 cell's busy wall to Run 4's 266680 ms so that cell is not a guess. Also show idle wall (subtract the 119762 ms last wait) because Run 4 was not an empty TPM window. Mark every other cell EXTRAPOLATED. Treat Stage 2 as one source copy per pair because that is what the guard sees; separately name the missing copies so the answer is not quieter than production. For 'how many of the twenty', score each document on its gate-table `extractCharCount`, not on 6 chars/word padding, because d08-d12 sit at 3.8-4.5 chars/word and padding would overstate them.
What I would not trust: a single wall number once the source leaves ~3,500 words. The four B277 runs never had a 5k, 12k, or 24k source. The estimator uses `round(words/20)` (185 vs Run 4's 187) and counts one Stage 2 pass. Rankings and the guard's own refuse map can carry the spec. A confident 'this cell 504s at 187 seconds' cannot.
The estimator can carry a ranking and a guard-disagreement map. It cannot carry a billed prediction at the real max. That is stated on every extrapolated cell.

B1 AGREE. Arithmetic, not runs.
B2 AGREE. Grid below. Guard vs 300 s wall marked. Two wall pins (busy / idle) because Run 4 included a 120 s wait.
B3 AGREE. MEASURED / PARTLY / EXTRAPOLATED on every cell.
B4 AGREE, with this amendment: `claude/token-volume-and-caching-research.md` and `claude/send-once-challenge.md` are not in this repo (B313 already said so). The earlier ranking lives here as `scripts/diagnostic/delivery-check/review-cost-proposal.md` and `editorial-review-blank-sheet.md`, which treat Stage 6's draft paste as the prize. The corrected ranking is produced from the estimator at the real median and at d01, plus the extra source copies the estimator misses.
B5 AGREE. Named, not run.

-----------------------------------------------------------------------------
S1. THE ANSWER
-----------------------------------------------------------------------------

A 3,698-word review against the median real source (d19, 5,105 words) is still predicted to finish: TPM floor 176.7 s, busy wall 287.7 s, idle wall 158.5 s, list USD 15.42, guard accept. It stops being possible, on the hard TPM floor, at about 18503 source words (10 million estimated tokens). d01 (24,473) and d13 (36,853) are already past that. The function budget is predicted to fail earlier on a busy window: the 11,860-word grid cell (d12) is busy wall 383.4 s with TPM 235.5 s, so the guard still accepts.
What stops it first is the **function budget on a busy window**, then the **per-minute allowance** (the guard) at ~18,500 source words. Cost does not refuse anything.
Of the twenty, scored on gate-table character counts against a 3,698-word draft: 8 past busy-window 300 s (d01, d03, d08, d09, d11, d12, d13, d17). 2 past idle-window 300 s (d01, d13). 2 the guard would refuse (d01, d13). 16 of 20 already exceed the stated 3,700-word ceiling.

-----------------------------------------------------------------------------
S2. THE GRID
-----------------------------------------------------------------------------

Draft words x source words, S=1. Tokens and refuse from `estimateReviewWork` / `preflightReview`. Source text padded at 6 characters per word. Busy wall pins 3698 x 3558 to 266.7 s. Idle wall pins that cell to 146.9 s. List USD = estimated input at 2.50/M plus output at Run 4's output/input ratio at 10.00/M. Discounted applies Run 4's 43% cache hit at 1.25/M.

| draft | source | stmts | tokens | Stage 2 % | TPM s | busy wall s | idle wall s | list USD | disc USD | guard | 300s | trust |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 150 | 3558 fixture | 8 | 198765 | 38% | 6.0 | 9.7 | 5.3 | 0.52 | 0.41 | accept | ok | PARTLY (B277 drafted this size against a ~3k source, not this exact source length) |
| 150 | 5105 median doc d19 | 8 | 217333 | 43% | 6.5 | 10.6 | 5.8 | 0.57 | 0.45 | accept | ok | EXTRAPOLATED |
| 150 | 11860 d12 | 8 | 302109 | 59% | 9.1 | 14.8 | 8.1 | 0.79 | 0.63 | accept | ok | EXTRAPOLATED |
| 150 | 24473 d01 | 8 | 478693 | 74% | 14.4 | 23.4 | 12.9 | 1.25 | 0.99 | accept | ok | EXTRAPOLATED |
| 500 | 3558 fixture | 25 | 622625 | 38% | 18.7 | 30.4 | 16.8 | 1.63 | 1.29 | accept | ok | PARTLY (B277 drafted this size against a ~3k source, not this exact source length) |
| 500 | 5105 median doc d19 | 25 | 680650 | 43% | 20.4 | 33.2 | 18.3 | 1.78 | 1.41 | accept | ok | EXTRAPOLATED |
| 500 | 11860 d12 | 25 | 945575 | 59% | 28.4 | 46.2 | 25.4 | 2.48 | 1.96 | accept | ok | EXTRAPOLATED |
| 500 | 24473 d01 | 25 | 1497400 | 74% | 44.9 | 73.1 | 40.3 | 3.92 | 3.11 | accept | ok | EXTRAPOLATED |
| 1500 | 3558 fixture | 75 | 1969375 | 36% | 59.1 | 96.2 | 53.0 | 5.16 | 4.09 | accept | ok | PARTLY (B277 drafted this size against a ~3k source, not this exact source length) |
| 1500 | 5105 median doc d19 | 75 | 2143450 | 41% | 64.3 | 104.7 | 57.7 | 5.61 | 4.45 | accept | ok | EXTRAPOLATED |
| 1500 | 11860 d12 | 75 | 2938225 | 57% | 88.1 | 143.5 | 79.1 | 7.69 | 6.10 | accept | ok | EXTRAPOLATED |
| 1500 | 24473 d01 | 75 | 4593700 | 72% | 137.8 | 224.4 | 123.6 | 12.03 | 9.53 | accept | ok | EXTRAPOLATED |
| 3698 | 3558 fixture | 185 | 5459667 | 32% | 163.8 | 266.7 | 146.9 | 14.30 | 11.33 | accept | ok | MEASURED (B277 Run 4, this cell) |
| 3698 | 5105 median doc d19 | 185 | 5889052 | 37% | 176.7 | 287.7 | 158.5 | 15.42 | 12.22 | accept | ok | EXTRAPOLATED |
| 3698 | 11860 d12 | 185 | 7849497 | 53% | 235.5 | 383.4 | 211.2 | 20.55 | 16.29 | accept | busyWALL>300s, GUARD ACCEPTS | EXTRAPOLATED |
| 3698 | 24473 d01 | 185 | 11933002 | 69% | 358.0 | 582.9 | 321.1 | 31.24 | 24.76 | REFUSE | busyWALL>300s, idleWALL>300s, TPM>300s, GUARD REFUSES | EXTRAPOLATED |

Off-grid, gate-table max d13 at 36,853 words: tokens 15941027, TPM 478.2 s, busy wall 778.6 s, idle wall 429.0 s, list USD 41.74, GUARD REFUSES. EXTRAPOLATED.

B277 estimator vs measured input tokens (same word and char counts as the B277 table):

| Run | draft w / source w | actual input | estimator | estimator / actual | est statements / actual |
| --- | --- | ---: | ---: | ---: | --- |
| 1 | 150 / 3408 | 158175 | 198289 | 1.25 | 8 / 6 |
| 2 | 500 / 3058 | 649414 | 608013 | 0.94 | 25 / 25 |
| 3 | 1500 / 2058 | 1804152 | 1813109 | 1.00 | 75 / 74 |
| 4 | 3698 / 3558 | 6280063 | 5489816 | 0.87 | 185 / 187 |

The estimator is close on Run 4 tokens (one Stage 2 pass vs production's extra passes) and high on small reviews relative to their tiny Stage 2. Scaling wall from Run 4 is pessimistic for 150 / 500 / 1500 (Run 4 included a 120 s wait those runs did not). It is the right pin for the 3698 row, and still an extrapolation once the source leaves 3,558 words.

Refuse frontier, source held at 3,558: draft ~6050 words (totalTokens 10007515, tpmFloorMs 300226).
Refuse frontier, source held at 5,105: draft ~5730 words.
Refuse frontier, source held at 24,473: draft ~3150 words.
Refuse frontier, draft held at 3,698: source ~18503 words.
Refuse frontier, draft held at 150: no refuse at 500000 source words.

The twenty, 3,698-word draft, source tokens from gate-table `extractCharCount` (not 6 chars/word). All EXTRAPOLATED except the fixture-sized ones.

| id | words | chars | tokens | TPM s | busy wall s | idle wall s | list USD | guard |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| d02 | 1087 | 6777 | 4785897 | 143.6 | 233.8 | 128.8 | 12.53 | accept |
| d06 | 1180 | 7486 | 4818642 | 144.6 | 235.4 | 129.7 | 12.62 | accept |
| d07 | 1537 | 9743 | 4922982 | 147.7 | 240.5 | 132.5 | 12.89 | accept |
| d05 | 2026 | 12298 | 5041197 | 151.2 | 246.2 | 135.7 | 13.20 | accept |
| d18 | 3815 | 22981 | 5535332 | 166.1 | 270.4 | 149.0 | 14.49 | accept |
| d16 | 4245 | 25380 | 5646147 | 169.4 | 275.8 | 151.9 | 14.78 | accept |
| d04 | 4306 | 29129 | 5819677 | 174.6 | 284.3 | 156.6 | 15.24 | accept |
| d15 | 5031 | 29977 | 5858897 | 175.8 | 286.2 | 157.7 | 15.34 | accept |
| d20 | 5077 | 30537 | 5884797 | 176.5 | 287.4 | 158.4 | 15.41 | accept |
| d19 | 5105 | 31988 | 5951767 | 178.6 | 290.7 | 160.2 | 15.58 | accept |
| d14 | 5200 | 30698 | 5892197 | 176.8 | 287.8 | 158.6 | 15.43 | accept |
| d17 | 6196 | 37068 | 6186717 | 185.6 | 302.2 | 166.5 | 16.20 | accept |
| d03 | 8044 | 53610 | 6951877 | 208.6 | 339.6 | 187.1 | 18.20 | accept |
| d10 | 8089 | 30964 | 5904407 | 177.1 | 288.4 | 158.9 | 15.46 | accept |
| d08 | 8933 | 40118 | 6327872 | 189.8 | 309.1 | 170.3 | 16.57 | accept |
| d11 | 9855 | 40913 | 6364687 | 190.9 | 310.9 | 171.3 | 16.66 | accept |
| d09 | 11423 | 50117 | 6790372 | 203.7 | 331.7 | 182.7 | 17.78 | accept |
| d12 | 11860 | 53357 | 6940222 | 208.2 | 339.0 | 186.8 | 18.17 | accept |
| d01 | 24473 | 156041 | 11689357 | 350.7 | 571.0 | 314.6 | 30.61 | REFUSE |
| d13 | 36853 | 220611 | 14675627 | 440.3 | 716.8 | 394.9 | 38.43 | REFUSE |

-----------------------------------------------------------------------------
S3. WHERE THE GUARD IS WRONG
-----------------------------------------------------------------------------

The guard refuses only when TPM floor > 300 s. Busy wall can exceed 300 s while TPM floor is still under 300 s, because wall includes model latency, Stage 2 pool 24, Stage 6 waves, and any TPM wait. B277 Run 4: actual 6.28M tokens have a TPM floor of 188 s; wall was 267 s, of which 120 s was wait.

Accepts that would fail (busy wall > 300 s, guard accept) on the 4x4 grid:
- draft 3698 x source 11860: busy wall 383.4 s, idle wall 211.2 s, TPM 235.5 s, guard accept.

Accepts that would fail on idle wall:
- None on the 4x4. Idle wall only crosses 300 s on cells the guard already refuses.

Of the twenty (character-accurate): guard accepts and busy wall > 300 s:
- d03 (8044 words): busy wall 339.6 s, TPM 208.6 s.
- d08 (8933 words): busy wall 309.1 s, TPM 189.8 s.
- d09 (11423 words): busy wall 331.7 s, TPM 203.7 s.
- d11 (9855 words): busy wall 310.9 s, TPM 190.9 s.
- d12 (11860 words): busy wall 339.0 s, TPM 208.2 s.
- d17 (6196 words): busy wall 302.2 s, TPM 185.6 s.

If Stage 2 is sent twice (first pass + a widened copy on every pair), add another Stage 2 onto the 3698 row:
- 3698 x 3558: tokens 7194412, busy wall 351.4 s, idle wall 193.6 s, TPM 215.8 s, guard accept, busyWALL>300 true.
- 3698 x 5105: tokens 8053182, busy wall 393.4 s, idle wall 216.7 s, TPM 241.6 s, guard accept, busyWALL>300 true.
- 3698 x 11860: tokens 11974072, busy wall 584.9 s, idle wall 322.2 s, TPM 359.2 s, guard REFUSE, busyWALL>300 true.
- 3698 x 24473: tokens 20141082, busy wall 983.8 s, idle wall 542.0 s, TPM 604.2 s, guard REFUSE, busyWALL>300 true.

Refuses that would succeed (guard REFUSE, both walls under 300 s):
- None on this grid. The guard is late, not early. Same direction B277 recorded against the 3,700-word measured ceiling.

-----------------------------------------------------------------------------
S4. THE CORRECTED RANKING
-----------------------------------------------------------------------------

The earlier ranking put the DRAFT above the SOURCE. It lives in this repo as `review-cost-proposal.md` (the prize is the 9,088-token editorial system prompt plus the full draft pasted after a unique sentence) and `editorial-review-blank-sheet.md` (Stage 6 grows with N times the draft). Both were built on the Shopify fixture, source ~3,558 words, or on the 83-character stub. That ranking was wrong for real sources once Stage 2's extra copies are counted, and it is wrong on one-copy arithmetic at d01.

3698 x 3558 (fixture, one copy): Stage 2 32% of estimated tokens, Stage 6 62%. Draft still wins. This is the ranking those docs measured.
3698 x 5105 (median doc, one copy): Stage 2 37%, Stage 6 57%. Draft still slightly ahead on the guard's formula.
3698 x 11860 (d12, one copy): Stage 2 53%, Stage 6 43%. Source takes the lead.
3698 x 24473 (d01, one copy): Stage 2 69%, Stage 6 28%. Source dominates.
Count a second full source pass (widened): at the median, Stage 2 overtakes Stage 6. The fixture ranking does not survive contact with the real distribution.

Corrected order, real sources, 3,698-word draft:
1. Cut how many times the SOURCE is sent (batch Stage 2, or cap extra passes). This is the volume.
2. Put the SOURCE first so later Stage 2 calls prefix-cache it. This is the bill, and maybe the queue (B313 remaining-tokens did not drop on a cached second call; that is one probe, not a TPM proof).
3. Put the DRAFT first in Stage 6. Still worth doing. It is the largest term only on the fixture and on the guard's one-copy median.

Options sized at d19 (5,105) and d01 (24,473), draft 3,698, S=1. Tokens are estimator tokens. Busy wall scaled from Run 4. EXTRAPOLATED.

| option | source | Stage 2 tokens | total tokens | TPM s | busy wall s | list USD | fixes bill | fixes queue |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| today (N copies of source) | 5105 | 2164130 | 5889052 | 176.7 | 287.7 | 15.42 | no | no |
| batch: one Stage 2 call, one source copy | 5105 | 19058 | 3743980 | 112.3 | 182.9 | 9.80 | yes | yes |
| prefix-cache source (50% on copies 2..N) | 5105 | ~1087914 billed | ~4812836 | 112.1 if cache skips TPM / 176.7 if not | n/a | 12.73 | yes | maybe (B313) |
| move Stage 2 to Anthropic list (no cache measured) | 5105 | 2164130 | 5889052 | same TPM unknown | n/a | Stage 2 list 6.49 vs OpenAI 5.41 | no (dearer list) | unmeasured |
| today (N copies of source) | 24473 | 8208080 | 11933002 | 358.0 | 582.9 | 31.24 | no | no |
| batch: one Stage 2 call, one source copy | 24473 | 51728 | 3776650 | 113.3 | 184.5 | 9.89 | yes | yes |
| prefix-cache source (50% on copies 2..N) | 24473 | ~4126224 billed | ~7851146 | 113.1 if cache skips TPM / 358.0 if not | n/a | 21.04 | yes | maybe (B313) |
| move Stage 2 to Anthropic list (no cache measured) | 24473 | 8208080 | 11933002 | same TPM unknown | n/a | Stage 2 list 24.62 vs OpenAI 20.52 | no (dearer list) | unmeasured |

Batching is the only option on this page that fixes **both** bill and queue on the arithmetic, because it removes N-1 source copies from the token sum the TPM floor sees. Prefix-cache fixes the bill at 50% on OpenAI; whether it fixes the queue depends on a fact B313 could not settle (if cached tokens still count, TPM floor stays today's). Moving the evidence stage to Anthropic at the repo's list prices (USD 3.00 / 15.00 per million, no cachedInput row) does not fix the bill. A cache-read discount there is not measured in this repo.

-----------------------------------------------------------------------------
S5. THE ONE LIVE RUN
-----------------------------------------------------------------------------

Run a production v4 Review of the **B277 3,698-word Shopify memo** against **d12** (berkshire-2020-shareholder-letter.pdf, 11860 words / 53357 chars), all checks on, header pill v4, on a **busy** TPM window (immediately after another full Review). Idle would be expected to succeed (186.8 s) and would not test the claim.
Paper expectation on a busy window: TPM floor 208.2 s, busy wall 339.0 s, list USD 18.17. Guard: accept.
What it falsifies: if the request finishes inside 300 s with checks complete, busy-window scaling from Run 4 does not transfer to a real 12k-word source and the real stop is the TPM refuse at d01/d13. If it 504s, bound-hits, or drops a slab of Stage 6, the guard-accepts-a-failure claim is confirmed. Do not run d01 or d13 until this one has spoken. Do not run a sweep.

-----------------------------------------------------------------------------
S6. WHAT THIS DOES NOT SETTLE
-----------------------------------------------------------------------------

Documents used as drafts rather than as sources. This grid holds the draft at B277 sizes and grows the source.
S > 1. Every extra source multiplies Stage 2.
Widened, claim-span, and retry copies. The guard does not count them. Doubling Stage 2 is a sensitivity, not a measurement.
Live remaining-tokens. Run 4's 267 s included a half-spent window and a 120 s wait. Idle vs busy is the spread on every wall number.
Whether OpenAI cached tokens consume TPM. B313 remaining did not drop; the docs have said they count. Unsettled.
Anthropic cache accounting.
Stage 1 wall on a 24k-word **draft**.
The two Claude project docs named in B4, which are not in this repo.
d13 at 36,853 words is in the gate table and is larger than the spec's 'real max'. It is modelled off-grid. It is not a live run.

USD 0.

