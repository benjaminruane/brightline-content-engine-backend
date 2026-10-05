# Accuracy pass oct-05-b372-b374

First billed evidence pass with the wrong-company check off. Frozen list. Cache off. Editorial and compliance off. Commentary skipped. Labels not moved. Product code not changed.

Cards: `scripts/diagnostic/accuracy/runs/evidence-pass-oct-05-b372-b374/cards.json`
Score: `score.txt`
Movers versus 4 October `oct-04-baseline`: `movers.json`
Date-rule census: `date-census.json`

Scored build: `4cdbb6c` (B374 HEAD). Actor check default off (**B371**).

## Scoreboard

| Repo | SHA scored | verify:ship |
|------|------------|-------------|
| backend | 4cdbb6c | not run. Accuracy diagnostic. No product code. |
| frontend | not touched | |

---

## 1. Catch and leave-alone

Never averaged.

Group A catch: **9 of 11**. Rate 0.8182. Wilson 95% [0.5230, 0.9486].

Group B leave-alone (Ben-Confirmed that the pipeline also confirmed): **64 of 74**. Rate 0.8649. Wilson 95% [0.7688, 0.9249].

Group B overall agreement: 72 of 89. Reported because the scorer prints it. It is not the leave-alone number.

Remaining Group A misses: F05 Halden support (same planted-fault miss as 8 September and 4 October); F13 EBITDA 11.1% (the accidental actor catch reverted).

Escapes: 0. Group B Ben-Confirmed: 74. Neither falsifier fired. Unmatched labels: 0. Freeze 261 / 0 unmatched.

86.5% clears the 85% PASS bar. It does not clear the 89% BUILD-QUALITY bar.

---

## 2. Against two baselines, and the B371 prediction

| Comparison | What it answers | Catch | Leave-alone | Bracket |
|------------|-----------------|-------|-------------|---------|
| vs 8 September lift-1 (9 of 11, 67 of 74) | Did the honesty fortnight plus actor-off change the long bar? | 9 of 11 (unchanged) | 64 of 74 (minus 3) | Catch: not readable (move of one on 11 is not evidence either way; here it did not move). Leave-alone: **inside noise** (3 or fewer). |
| vs 4 October oct-04-baseline (10 of 11, 61 of 74, actor check ON) | First measured number with the check off. | 9 of 11 (minus 1) | 64 of 74 (plus 3) | Catch: not readable on its own. Leave-alone: **inside noise** (3 or fewer). Do not call it an improvement. |
| vs B371 arithmetic (9 of 11, 64 of 74) | Did turning the check off restore the five actor movers as attributed? | 9 of 11 | 64 of 74 | **Holds.** |

The prediction holds on both headline numbers. The five labelled cards that carried `displayVerdictReason: actor_mismatch` on 4 October all lost that stamp and all moved. Catch lost F13 EBITDA. Leave-alone regained Brno, 600 customers, and the advisory board.

Composition of the 64 is not identical to the B371 row notes. F08 competitive position was predicted to revert to `supported_partial` (already partial on 8 September, not in the leave-alone denominator). Stage 2 now classifies it `confirmed`, so the card joined leave-alone. F08 principal risks left leave-alone on the same fixture (Stage 2 `confirmed` to `partially_confirmed`). Those two offset. Net is still 64 of 74. That does not undo the actor attribution: all five `actor_mismatch` cards moved, and none of the five failed to move.

Attribution of those five movers to the actor check was not wrong.

---

## 3. Every labelled verdict that differs from oct-04-baseline

Seven of the 100. Full text in `movers.json`.

| Fixture | Group | Label | 4 October | Today |
|---------|-------|-------|-----------|-------|
| F08 competitive position is exceptional | B | confirmed | conflict (`actor_mismatch`) | supported_full |
| F08 principal risks (semiconductor cyclicality) | B | confirmed | supported_full | supported_partial |
| F09 Brno automation programme | B | confirmed | conflict (`actor_mismatch`) | supported_full |
| F10 supplies more than 600 customers | B | confirmed | conflict (`actor_mismatch`) | supported_full |
| F13 EBITDA margin 11.1% | A | conflicting | conflict (`actor_mismatch`) | supported_full |
| F13 2.6x MOIC and 21% gross IRR | B | partially_confirmed | conflict | supported_partial |
| F16 clinical advisory board of seven | B | confirmed | conflict (`actor_mismatch`) | supported_full |

Leave-alone arithmetic versus 4 October: 61 plus four Ben-Confirmed cards that are now confirmed (competitive, Brno, 600 customers, advisory) minus principal risks = 64.

---

## 4. Which shipped change moved each

Candidates named in the brief: B372 causal stem, B372 generic-company suppression, B372 date-subject spans. B374 is the proposal layer and must not move a verdict.

Causal stem did not run. This instrument has editorial off. No `[stage7] generic-company-suppress` line fired on any of the 261 cards. No labelled card carries `dateSubjectAdded`. No labelled card carries `actor_mismatch` today (5 did on 4 October). No mover is a B374 effect.

| Statement | Mover |
|-----------|-------|
| F08 competitive position | **Actor check off (B371), plus Stage 2.** Old reason `actor_mismatch`. Stage 2 was `partially_confirmed`, now `confirmed`. Destination is full, not the predicted partial. Not B372. Not B374. |
| F09 Brno | **Actor check off (B371).** Stage 2 stayed `confirmed`. Span unchanged. |
| F10 600 customers | **Actor check off (B371).** Stage 2 stayed `confirmed`. Span unchanged. |
| F13 EBITDA 11.1% | **Actor check off (B371).** Stage 2 stayed `confirmed`. Span unchanged. Catch reverts. The "approximately 13%" line is still not found (**B161**). |
| F16 clinical advisory board | **Actor check off (B371).** Stage 2 stayed `confirmed`. Span unchanged. |
| F08 principal risks | **None of B372/B374.** Stage 2 single-pick `confirmed` to `partially_confirmed`. Spans stayed confirmed. Matcher variation, same class as F01 / F09 revenue / F16 margin. |
| F13 2.6x MOIC / 21% gross IRR | **None of B372/B374.** Single-pick stayed `confirmed`. The locatable span was `conflicting` on 4 October (B347 gross vs unqualified IRR) and is `partially_confirmed` today. Pipeline now agrees with the P label. Not a date-subject span. |

B374 moved no verdict. If a later reader attributes any of these seven to B374, that is a bug in the attribution, not in the product.

---

## 5. Date rule, independent of the score

On the 100 labelled statements:

- Carry a date the rule recognises as a subject: **0**
- Found a same-subject date in the source: **0**
- Agreed: **0**. Disagreed: **0**
- `dateSubjectAdded` on the compact card: **0**

The rule's subject families are reporting-period cues (`months to`, `period from`, `reporting periods ending`) and year-end cues (`year ending`, `year to`, `financial year`). The labelled hundred has dates (`in 2024`, `Q3 2026`, `trailing twelve months`, `founded in 2007`) that are not those families.

On the full freeze of 261, one statement carries a recognised subject: F06 `Revenue for the year ended 31 December 2025` (`year_end`). That row is not labelled. The rule can fire on this corpus. It does not fire on the labelled hundred. A later pack that plants a wrong reporting period would be the first labelled test of part three.

Source: `date-census.json`.

---

## 6. Cost

USD 2.9947 list, metered by `run-evidence.mjs` from Stage 2 `costUsd` / `usage` (`cards.json` `costUsd`). Cache off, so discounted equals list. Calls are the Stage 2 pairs on 261 frozen statements, fixtures 01-20. Unpriced calls: 0 (Stage 5 skipped, Stage 6 off). Ceiling remaining at start: 40. Wall 150616 ms.

oct-04-baseline was USD 2.9785. Same shape of work.

---

## Open questions for the expanded corpus

Labels were not moved. Per the README, a label-versus-pipeline disagreement is an open question.

Still open:

- F05 Halden support. Group A miss. Ben X, pipeline `supported_partial`.
- F13 EBITDA 11.1%. Group A miss again. Matcher still misses "approximately 13%" (**B161**). The 4 October catch was the actor check, not that passage.
- F04 risk-adjusted return profile. Ben C, pipeline P.
- F01 employees, F09 period revenue, F16 gross margin. Ben C, pipeline X. Matcher variation. Inside the noise floor (**B162**).
- F15 own-brand. Ben P after Correction 3, pipeline `supported_full`.
- F08 principal risks. Ben C, pipeline P this pass (was confirmed on 4 October). Do not retune.

Closed as disagreements on this pass, not by moving a label:

- F08 competitive / F09 Brno / F10 600 customers / F16 advisory. Ben C, pipeline now confirmed. The 4 October conflicts were the actor check.
- F13 2.6x MOIC and 21% gross IRR. Ben P, pipeline now P.

---

## Harness

`run-evidence.mjs --pass oct-05-b372-b374` then `score.mjs --pass oct-05-b372-b374`. Product code was not changed. Labels were not moved.
