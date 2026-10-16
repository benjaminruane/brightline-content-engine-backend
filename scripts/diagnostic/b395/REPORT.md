# B395. Empty-confirmation recovery supplies evidence, not a green verdict

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  de372ac  main  166 files  1819 tests` |
| Cost | USD 0. No model calls. |
| Flag | `QC_RECOVERY_MAY_NOT_GREEN`, default on. Off is the old forced green, for this measurement only. |
| Evidence | `scripts/diagnostic/b395/runs/diff.json`. Predictions in `scripts/diagnostic/b395/PREDICTIONS.md`, written before the run and not revised. |

Re-assembly runs Stage 7 on the stored fingerprints. The Stage 3 verdict is `aggregateVerdict` of those fingerprints, which is what recovery used to override. Flag off, then flag on. The eight payloads are the held-out set. GP Industries clean runs 3, 4 and 5 are added because those are the runs whose only path to green is recovery.

## 1. The four planted errors on green cards

ClearPoint doctored S3 leaves green. Flag off is `supported_full` / `supported`. Flag on is `not reviewed` / `skipped`. The passage stays, 615 characters. It is no longer passed as checked.

3i doctored S12 does not move. Both flags are `conflict` / `supported`, the same comment. It is not a green card on either side. The fingerprint is not an empty-confirmation refusal.

HICL doctored S0 does not move. Both substitutions sit on the one card. Both flags are `supported_full` / `supported`. It is still a green card. This change does not reach it.

## 2. The cost on clean writing

GP Industries clean statement 1, runs 3, 4 and 5. Each goes from `supported_full` / `supported` to `not reviewed` / `skipped`. The passage stays "It also has two other plants in the UK." (39 characters). This is a new mark on correct writing. Run 2 does not move: its stored verdict is `supported_partial` and the fingerprint is not a refusal.

Across the four clean drafts in the eight (3i, HICL, GP Industries run 2, ClearPoint), four statements move from green to marked, all on ClearPoint clean: S0, S1, S7 and S8. Each goes from `supported_full` to `not reviewed`. The passage is unchanged on each. 3i clean, HICL clean, and GP Industries run 2 contribute none.

Counting the three GP recovery runs as well, seven clean cards move. Five distinct statements: ClearPoint S0, S1, S7, S8, and GP Industries S1.

ClearPoint doctored S1 also moves, from `supported_full` to `not reviewed`. It is not one of the 37 planted substitutions. The sentence is the 43 percent revenue claim. Same recovery path, same cost, on the doctored file.

On every card that moves, the stored comment is a "matches the source" sentence written after the old recovery cleared the original comment. A non-green card drops those sentences, and the empty comment is then filled with "A source passage is shown on this card." The absence comment is not in these fixtures. The October S10 test still feeds "No source addresses the claim" and that sentence now survives.

## 3. The full re-assembly diff

91 cards. Nine change. No passage changes. No other payload has a change.

| Card | Flag off | Flag on | Comment off | Comment on |
|---|---|---|---|---|
| ClearPoint doctored S1 | `supported_full` | `not reviewed` | 43% and 175 match the source. | A source passage is shown on this card. |
| ClearPoint doctored S3 | `supported_full` | `not reviewed` | 80% and 3.0 match the source. | A source passage is shown on this card. |
| ClearPoint clean S0 | `supported_full` | `not reviewed` | 2026 matches the source. | A source passage is shown on this card. |
| ClearPoint clean S1 | `supported_full` | `not reviewed` | 43% and 175 match the source. | A source passage is shown on this card. |
| ClearPoint clean S7 | `supported_full` | `not reviewed` | The phrases 'Velocity Alpha', 'High Speed Surgical Drill', 'FDA' and 'MR' match the source. | A source passage is shown on this card. |
| ClearPoint clean S8 | `supported_full` | `not reviewed` | The phrases 'Health Canada', 'Neuro Navigation System' and 'MRI' match the source. | A source passage is shown on this card. |
| GP Industries clean run 3 S1 | `supported_full` | `not reviewed` | The phrase 'UK' matches the source. | A source passage is shown on this card. |
| GP Industries clean run 4 S1 | `supported_full` | `not reviewed` | The phrase 'UK' matches the source. | A source passage is shown on this card. |
| GP Industries clean run 5 S1 | `supported_full` | `not reviewed` | The phrase 'UK' matches the source. | A source passage is shown on this card. |

`supportState` moves from `supported` to `skipped` on each of these nine. `concernLevel` stays `none`, which is the level both of those states map to.

## 4. The tests

Two tests locked the defect.

`tests/b366-party-and-empty-quote.test.mjs`, "October S10 recovers MPM, MAIT, 3.2x and 2.8x when the refusal flag is present", required `supported_full` and required the absence comment to be gone. It now requires the quote, the Stage 3 skip, and the absence comment.

`tests/b369-quote-without-comment.test.mjs`, "October S10 with the empty-confirmation flag is Confirmed with quote and named comment", required `supported_full` and the named match comment that replaced the absence sentence. It now requires the quote, the skip, and that the absence sentence is still there.

`tests/health-build-and-flags.test.mjs` gained the flag on the health register. It did not lock the verdict.

## 5. The labelled corpus

Unmeasured. `scripts/diagnostic/accuracy/runs/evidence-pass-oct-06-b378/cards.json` stores compact cards, including five with `emptyConfirmationRefused` true. It does not store source text, so Stage 7 cannot locate a passage and this re-assembly cannot be run. No live accuracy pass was run.

## 6. Predictions

- ClearPoint doctored S3 leaves `supported_full`. One of the 37 moves off a green card. Holds. Doctored S1 also leaves green, and S1 is not one of the 37.
- 3i doctored S12 and HICL doctored S0 do not move. Holds. S12 stays a conflict. S0 stays green.
- GP Industries clean S1 goes from green to marked on the affected runs. Holds, on runs 3, 4 and 5.
- At least one committed test currently asserts the forced green. Holds. The two tests named above did, and they have been updated.
- Fewer than four clean statements in total move from green to marked. Does not hold. Four ClearPoint clean statements move, and GP Industries S1 moves on three further runs.

## 7. What this pass could not establish

This is the interim. Recovery no longer grants green because a passage exists. It does not grant green only when the passage contains the statement's figures and names. That element-gated rule is the one that supersedes this, and it needs the matcher moved out of `scripts/diagnostic/`.

The stored fixtures still hold the old green cards. A new Review is what a reader would see. This pass did not run one. B386's reason stands: the Stage 2 class on GP Industries moves between live runs, and this re-assembly cannot.

The absence comment on the nine moved cards could not be shown surviving, because the committed commentary is already the later match sentence. The October fixture, which still has the absence sentence, is the evidence that `dropAbsenceCommentary` no longer runs.
