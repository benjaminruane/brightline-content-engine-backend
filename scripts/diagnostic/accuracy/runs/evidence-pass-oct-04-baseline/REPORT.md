# Accuracy pass oct-04-baseline

One billed evidence pass after the honesty fortnight (B351 through B369). Frozen list. Cache off. Editorial and compliance off. Commentary skipped. Labels not moved.

Cards: `scripts/diagnostic/accuracy/runs/evidence-pass-oct-04-baseline/cards.json`
Score: `score.txt`
Movers versus 8 September `runs/evidence-pass-lift-1`: `movers.json`

Compared to the 8 September bar of catch 9 of 11 and leave-alone 67 of 74. The two groups are never averaged.

---

## 1. Catch and leave-alone

Group A catch: **10 of 11** (was 9 of 11). Rate 0.9091. Wilson 95% [0.6226, 0.9838].

Group B leave-alone (Ben-Confirmed that the pipeline also confirmed): **61 of 74** (was 67 of 74). Rate 0.8243. Wilson 95% [0.7223, 0.8944].

Group B overall agreement: 68 of 89. Reported because the scorer prints it. It is not the leave-alone number.

The 8 September PASS bar was catch at least 6 of 11 and leave-alone at least 85%. Catch still clears 6 of 11. Leave-alone 82.43% does not clear 85%. BUILD-QUALITY (leave-alone at least 89%) is not met.

Remaining Group A miss: F05 Halden support (Ben conflicting, pipeline `supported_partial`). Same planted-fault miss as 8 September.

Escapes: 0. Group B Ben-Confirmed: 74. Neither falsifier fired. Unmatched labels: 0. Freeze 261 / 0 unmatched.

---

## 2. Verdicts that differ from the 8 September run

Twelve of the 100 labelled statements changed `displayVerdict`. Full text in `movers.json`.

| Fixture | Group | Label | 8 September | Today |
|---------|-------|-------|-------------|-------|
| F01 Shopify 24 employees | B | confirmed | supported_full | conflict |
| F04 risk-adjusted return profile | B | confirmed | supported_full | supported_partial |
| F08 competitive position is exceptional | B | confirmed | supported_partial | conflict |
| F08 principal risks (semiconductor cyclicality) | B | confirmed | supported_partial | supported_full |
| F09 period revenue EUR 318 million | B | confirmed | supported_full | conflict |
| F09 Brno automation programme | B | confirmed | supported_full | conflict |
| F10 supplies more than 600 customers | B | confirmed | supported_full | conflict |
| F13 EBITDA margin 11.1% | A | conflicting | supported_full | conflict |
| F13 2.6x MOIC and 21% gross IRR | B | partially_confirmed | supported_full | conflict |
| F15 own-brand 38% to 54% / runway to 70% | B | partially_confirmed | supported_partial | supported_full |
| F16 gross margin 71.4 percent | B | confirmed | supported_full | conflict |
| F16 clinical advisory board of seven | B | confirmed | supported_full | conflict |

Leave-alone arithmetic: seven Ben-Confirmed Group B cards left `supported_full` (F01 employees, F04, F09 revenue, F09 Brno, F10, F16 margin, F16 advisory). One Ben-Confirmed Group B card joined it (F08 principal risks). 67 - 7 + 1 = 61.

---

## 3. Which shipped change moved each

Candidates that move verdicts rather than copy: actor check, role-party check, scale check, quote recovery, empty-confirmation recovery.

| Statement | Mover |
|-----------|-------|
| F08 competitive position | **Actor check.** `displayVerdictReason: actor_mismatch`. Stage 2 class stayed `partially_confirmed`. |
| F09 Brno automation | **Actor check.** `displayVerdictReason: actor_mismatch`. Stage 2 class stayed `confirmed`. |
| F10 600 customers | **Actor check.** `displayVerdictReason: actor_mismatch`. Stage 2 class stayed `confirmed`. |
| F13 EBITDA 11.1% | **Actor check.** `displayVerdictReason: actor_mismatch`. Stage 2 class stayed `confirmed`. Catch now agrees with the X label. The widened matcher still does not return the "approximately 13%" line (**B161**). |
| F16 clinical advisory board | **Actor check.** `displayVerdictReason: actor_mismatch`. Stage 2 class stayed `confirmed`. |
| F01 24 employees | None of the five. Stage 2 single-pick `confirmed` to `conflicting`. |
| F04 risk-adjusted return | None of the five. Stage 2 single-pick `confirmed` to `partially_confirmed`. Already an open question. |
| F08 principal risks | None of the five. Stage 2 single-pick `partially_confirmed` to `confirmed`. A quote now shows (it did not on 8 September). That is copy. The verdict followed the single-pick. |
| F09 period revenue | None of the five. Stage 2 single-pick `confirmed` to `conflicting`. |
| F13 2.6x MOIC / 21% gross IRR | None of the five. Stage 2 single-pick stayed `confirmed`. The locatable span is now `conflicting`. Stage 3 figure demotion (B347: draft GROSS IRR against an unqualified source IRR). Already an open question (Ben P, pipeline X). |
| F15 own-brand | None of the five. Single-pick stayed `confirmed`. A widened span that was `partially_confirmed` is now `confirmed`, so the reducer no longer keeps the card partial. A quote now shows. That is copy. The verdict followed the span class. |
| F16 gross margin | None of the five. Stage 2 single-pick `confirmed` to `conflicting`. |

Role-party check: no labelled mover.
Scale check: no labelled mover.
Quote recovery: no labelled verdict mover.
Empty-confirmation recovery: no labelled mover. No labelled card carried `emptyConfirmationRefused`.

---

## 4. Cost

USD 2.9785 list, metered by `run-evidence.mjs` from Stage 2 `costUsd` / `usage` (`cards.json` `costUsd`). Cache off, so discounted is the same figure. Calls are the Stage 2 pairs on 261 frozen statements, fixtures 01-20. Unpriced calls: 0 (Stage 5 skipped, Stage 6 off). Ceiling remaining at start: 40. Wall 152955 ms.

Lift-1 on 8 September was USD 2.27. The delta is extra Stage 2 work (claim-span pairs and wider recoveries), not a second commentary pass.

---

## Open questions for the expanded corpus

Labels were not moved. Per the README, a label-versus-pipeline disagreement is an open question.

Still open from 8 September:

- F05 Halden support. Group A miss. Ben X, pipeline `supported_partial`.
- F13 2.6x MOIC and 21% gross IRR. Ben P, pipeline X (now from figure demotion rather than a Stage 2 single-pick).
- F04 risk-adjusted return profile. Ben C, pipeline P.
- F13 EBITDA 11.1%. Matcher still misses "approximately 13%". Today's conflict is the actor check, not that passage.

New, from this pass (do not retune against these 100):

- Four Ben-Confirmed Group B sentences the actor check now paints conflict: F08 competitive position, F09 Brno, F10 600 customers, F16 clinical advisory board.
- F15 own-brand. Ben P after Correction 3, pipeline now `supported_full`.
- Stage 2 wobble on F01 employees, F09 period revenue, F16 gross margin (Ben C, pipeline X). Inside the measured noise floor (**B162**).

---

## Harness

`run-evidence.mjs` now sets `evidenceEnabled: true`. After B299 a missing flag is off, so the September runner would have taken the nothing-reviewed path. `score.mjs` accepts `--pass`. Compact cards now keep `displayVerdictReason`, `supportState`, `emptyConfirmationRefused`, and excerpt flags so movers can be attributed. Product code was not changed.
