# Accuracy pass oct-06-b378

One billed evidence pass after B378. Frozen list. Cache off. Editorial and compliance off. Commentary skipped. Labels not moved. Product code not changed. Part 3 of B378 is an editorial style gate. This run is evidence only and does not see it. It is not reported here.

Cards: `scripts/diagnostic/accuracy/runs/evidence-pass-oct-06-b378/cards.json`
Score: `score.txt`

Scored build: `a5106b8` (B378 on main, including the scoreboard stamp).

## Scoreboard

| | |
|---|---|
| SHIPPED | pending `npm run verify:ship` |
| Catch | 9 of 11 |
| Leave-alone | 65 of 74 |
| Prediction | Held. Zero labelled verdicts moved because of B378. |

## The prediction

Stated before the run: zero labelled verdicts move because of B378.

Grounds: across the 22 stored payloads that carry sources, the as-of date changes on exactly 5 source texts, and all 5 are the same GP Industries press release, which is not in the labelled set. The dateline rule stands down unless a statement opens "In <Month> <Year>, <Name> announced", which the labelled drafts do not use.

The prediction held. Three labelled display verdicts differ from `oct-05-b372-b374`. None is the dateline reader and none is the dateline rule. They are matcher variation. That does not contradict the prediction.

## 1. Catch and leave-alone

Never averaged.

Freeze: 261 statements. Unmatched labels: 0. The scorer also prints 161 unmatched predictions. Those are frozen statements that are not in the labelled 100. They are not a join failure.

Group A catch: **9 of 11**. Rate 0.8182. Wilson 95% [0.5230, 0.9486]. The interval is 43 points wide.

Group B leave-alone (Ben-Confirmed that the pipeline also confirmed): **65 of 74**. Rate 0.8784. Wilson 95% [0.7847, 0.9347].

Group B overall agreement: 73 of 89. The scorer prints it. It is not the leave-alone number.

Remaining Group A misses: F05 Halden support; F13 EBITDA 11.1%. Same two misses as `oct-05-b372-b374`.

Escapes: 0. Group B Ben-Confirmed: 74. Neither falsifier fired.

87.8% clears the 85% PASS bar. It does not clear the 89% BUILD-QUALITY bar.

## 2. Against the three runs

The noise floor (B162): leave-alone moved 4 percentage points, 3 counts, between two identical runs (64 of 74 against 67 of 74). Catch of 11 moving by one is not readable. A Wilson interval 43 points wide at 9 of 11 is why.

| Comparison | Catch | Leave-alone | Bracket |
|---|---|---|---|
| vs oct-05-b372-b374 (9 of 11, 64 of 74) | 9 of 11 (unchanged) | 65 of 74 (plus 1 count, 1.4 points) | Catch: no movement. Leave-alone: **inside** the noise floor. |
| vs oct-04-baseline (10 of 11, 61 of 74, actor check ON) | 9 of 11 (minus 1) | 65 of 74 (plus 4 counts, 5.4 points) | Catch: **inside** the rule that a move of one is not readable. Leave-alone: **outside** the 4-point identical-run band by one count. Not a B378 effect. Three of the four counts are the actor-check-off shift already measured on oct-05 (61 to 64, itself inside noise on that comparison). The fourth is F08 principal risks, attributed below as matcher variation. |
| vs lift-1 (9 of 11, 67 of 74) | 9 of 11 (unchanged) | 65 of 74 (minus 2 counts, 2.7 points) | Catch: no movement. Leave-alone: **inside** the noise floor. |

No second pass. The last pair already measured the noise floor. This run does not produce a new stability number.

## 3. Attribution

Every labelled statement whose mapped display verdict differs from `oct-05-b372-b374`. Three of 100.

Checked on the labelled fixtures 01 to 20: sources whose as-of date changes under the B378 reader: **0**. The Date: label cue already parsed on F08 (`14 March 2025`) and F15 (`4 February 2026`) before B378, and it still parses to the same day. `displayVerdictReason` `announcement_dateline` on the 261 cards: **0**. The dateline rule on the 100 labelled statements: **100 stand down**, reason `no_announcing_clause`. It fired on none.

| Statement | Group | Ben | oct-05 | today | Class |
|---|---|---|---|---|---|
| F08 end-market growth. Structural exposure to medical implants and aerospace build rates supports 9% compound revenue growth over the hold. | B | partially_confirmed | supported_partial | supported_full | (c) |
| F08 principal risks. Semiconductor cyclicality, customer concentration, foreign exchange, and the founder transition, each understood and reflected in planning. | B | confirmed | supported_partial | supported_full | (c) |
| F15 own-brand penetration. Own-brand share from 38% in 2020 to 54% in 2025, with continued runway to 70% contributing material gross margin expansion. | B | partially_confirmed | supported_full | supported_partial | (c) |

(a) B378 Part 1A, as-of date changed: none.
(b) B378 Part 1B, dateline rule fired: none. Each of the three returns `stand_down`, `no_announcing_clause`. None opens "In <Month> <Year>, <Name> announced".
(c) Neither. Matcher variation inside the noise floor: all three.

The leave-alone move of one count is the F08 principal risks row, Ben confirmed, partial last time, full this time. The other two are Ben partially confirmed, so they do not enter the leave-alone numerator. F08 end-market is now a disagreement (pipeline full, Ben partial). F15 own-brand now agrees with Ben (pipeline partial). Labels were not moved.

## 4. Cost

USD 2.9345 list, metered by `run-evidence.mjs` from Stage 2 `costUsd` (`cards.json` stores 2.9345325). Cache off, so discounted equals list. Calls are the Stage 2 pairs on 261 frozen statements, fixtures 01 to 20. Unpriced calls: 0 (Stage 5 skipped, Stage 6 off). This pass ceiling USD 5, set with `ACCURACY_COST_REMAINING`. Spent 2.9345. The meter did not pass USD 5. The instrument ceiling of USD 40 still stands. Wall 208172 ms.

oct-05-b372-b374 was USD 2.9947. Same shape of work.

## Technical summary

No product code changed. One evidence pass, `run-evidence.mjs --pass oct-06-b378`, wrote 261 cards. `score.mjs` against the closed labels: catch 9 of 11, leave-alone 65 of 74, unmatched labels 0. Three labelled display verdicts differ from the 5 October cards. On each, the fixture as-of date is unchanged and `assessAnnouncementDateline` returns `stand_down`.

## Plain-language summary

The labelled hundred was reviewed again after the dateline change. The share of planted faults that are caught is the same as last time, 9 of 11. The share of correct sentences left alone moved by one sentence, which this pack cannot tell from ordinary run-to-run wobble. The dateline rule did not fire on any labelled sentence, and no labelled source gained a date it did not already have.
