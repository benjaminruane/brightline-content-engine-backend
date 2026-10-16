# B391. The pipeline's sentence verdict, with the comment ignored

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  ed56abe  main  166 files  1817 tests` |
| Cost | USD 0. No model calls. The four doctored reviews and the clean reviews were already committed. |
| Input | `scripts/diagnostic/b385/labels.json` (26 entries, 37 substitutions) and the stored `qcCard.displayVerdict` on each sentence. Comments, excerpts, spans and proposals are not read. |
| Evidence | `scripts/diagnostic/b391/score-verdict-only.mjs`. |

## 1. The decision rule, quoted, before any number

Written here before the counts, and not adjusted after them.

VERSION B, keep the sentence label, requires ALL THREE:

- M1 coverage at least 33 of 37
- M2 false marks no more than 12 of 38
- M3 `conflict` appearing on at least half of marked planted sentences AND on no more than a quarter of marked clean sentences

VERSION A, delete the sentence label, if EITHER:

- M1 coverage 25 of 37 or below
- M2 false marks 19 of 38 or above

Anything else is INCONCLUSIVE. Report it as inconclusive with the detail, and do not pick a version.

A sentence is marked when `displayVerdict` is anything other than `supported_full`. `conflict`, `supported_partial`, `not_supported` and `unverifiable` all count as marked.

## 2. M3. Does conflict concentrate, or do both sides come back partial?

`conflict` is the majority colour on marked planted sentences. It is not the majority colour on marked clean sentences.

25 sentences carry at least one planted substitution. 22 of them are marked. Their verdicts:

| `displayVerdict` | Marked planted sentences |
|---|---|
| `conflict` | 13 |
| `supported_partial` | 7 |
| `not_supported` | 2 |
| `unverifiable` | 0 |

12 of 38 clean sentences are marked. Their verdicts:

| `displayVerdict` | Marked clean sentences |
|---|---|
| `conflict` | 3 |
| `supported_partial` | 6 |
| `not_supported` | 0 |
| `unverifiable` | 3 |

13 of 22 is more than half. 3 of 12 is a quarter. The planted marks are mostly `conflict`. The clean marks are split, with `supported_partial` the largest single bucket at 6 of 12. The two distributions are not the same.

The planted sentences, so the table can be checked:

- 3i 0 `conflict`, 5 `conflict`, 8 `supported_partial`, 9 `conflict`, 12 `supported_full`, 14 `supported_partial`
- HICL 0 `supported_full`, 1 `supported_partial`, 2 `supported_partial`, 3 `conflict`, 4 `conflict`, 5 `conflict`, 6 `conflict`, 7 `not_supported`
- GPI 0 `supported_partial`, 1 `conflict`, 2 `supported_partial`, 3 `conflict`, 4 `conflict`
- ClearPoint 0 `conflict`, 2 `conflict`, 3 `supported_full`, 7 `conflict`, 8 `supported_partial`, 9 `not_supported`

## 3. M1. Coverage

33 of 37 planted substitutions sit on a marked sentence.

| Document | On a marked sentence |
|---|---|
| 3i | 5 of 6 |
| HICL | 11 of 13 |
| GPI | 10 of 10 |
| ClearPoint | 7 of 8 |
| Total | 33 of 37 |

Four substitutions sit on an unmarked sentence, all `supported_full`:

- `3i-S12-a`, statement 12. Written: "gains across essentially all of its investments".
- `hicl-S0-a`, statement 0. Written: "HCIL".
- `hicl-S0-b`, statement 0. Written: "six months to 31 December 2025".
- `clearpoint-S3-a`, statement 3. Written: "the vast majority of the company's overall revenue".

HICL statement 0 carries two of the four. That is three unmarked sentences.

## 4. M2. False marks, and the pair

12 of 38 clean statements are marked. The headline uses GPI clean run 2 and ClearPoint clean 1, with the 3i and HICL clean reviews.

| Document | Marked |
|---|---|
| 3i clean | 6 of 15 |
| HICL clean | 1 of 8 |
| GPI clean run 2 | 2 of 5 |
| ClearPoint clean 1 | 3 of 10 |
| Total | 12 of 38 |

The 12:

- 3i 0 `conflict`, 1 `supported_partial`, 6 `unverifiable`, 7 `unverifiable`, 9 `conflict`, 10 `unverifiable`
- HICL 6 `supported_partial`
- GPI run 2 statements 0 and 1, both `supported_partial`
- ClearPoint 1 statements 2 and 5 `supported_partial`, statement 9 `conflict`

That is 3 `conflict`, 6 `supported_partial`, 3 `unverifiable`. The three unverifiable sentences are 3i 6, 7 and 10. The count is 12 of 38, and the split is 9 partial or conflict plus those 3 unverifiable. B388's report is where that 12 of 38 is written. B389's report does not restate it. The recount matches the written 12.

The other clean runs, not in the 38:

- GPI run 3: 1 of 5, statement 0 `supported_partial`
- GPI run 4: 1 of 5, statement 0 `supported_partial`
- GPI run 5: 0 of 5
- ClearPoint clean 2: 3 of 10, statements 2 and 5 `supported_partial`, statement 9 `conflict`
- ClearPoint clean 3: the same three sentences, the same verdicts

Discrimination. 33 of 37 planted substitutions are on a marked sentence. 12 of 38 clean statements are marked. A marker that painted every sentence would score 37 of 37 and 38 of 38. This one does not.

## 5. M4. Label stability

13 of 15 statements carry the same `displayVerdict` in every captured run. GPI is runs 2 to 5. ClearPoint is clean 1 to 3. GPI run 1 was not captured.

Two GPI statements move. None of the 10 ClearPoint statements move.

- GPI statement 0: `supported_partial` on runs 2, 3 and 4, `supported_full` on run 5.
- GPI statement 1: `supported_partial` on run 2, `supported_full` on runs 3, 4 and 5.

That confirms the note in `tests/fixtures/real-runs-2026-10-06-gpi/CLEAN-RUNS.md`. Statements 0 and 1 are the ones that move. Runs 3, 4 and 5 do not move statement 1. Run 5 is the only captured run that does not mark statement 0.

## 6. The verdict, by the rule as written

VERSION B. Keep the sentence label.

- M1 is 33 of 37. The bar is at least 33.
- M2 is 12 of 38. The bar is no more than 12.
- M3 is 13 of 22 marked planted sentences on `conflict`, which is more than half, and 3 of 12 marked clean sentences on `conflict`, which is a quarter and so no more than a quarter.

VERSION A does not fire. Coverage is above 25 of 37, and false marks are below 19 of 38.

The clean `conflict` count meets the rule on the boundary: 3 of 12, not 2 of 12.

## 7. Claude's four predictions

1. "M1 coverage is 33 of 37. B385 found four planted substitutions on supported_full cards: 3i S12 (one), HICL S0 (two), ClearPoint S3 (one)." Holds. The four unmarked substitutions are those four. This one was derived from B385's card colours, not guessed.

2. "M2 false marks replicate at 12 of 38." Holds. The recount is 12 of 38, with the same three unverifiable sentences.

3. "M3 fails: `conflict` appears on fewer than half of marked planted sentences, so the label does not discriminate." Does not hold. `conflict` is on 13 of 22 marked planted sentences.

4. "M4 at least two GPI clean statements move across the five runs." Holds on the four captured runs. Statements 0 and 1 move. Run 1 is the fifth run in `CLEAN-RUNS.md` and was not stored; the note says it came back all green, which would differ from both of those statements as well.

## 8. What this pass could not establish

It measures one doctored run per document. A second doctored run of the same draft is not in the fixtures.

The labelled hundred is not in this pass. B385 already recorded that the pipeline's comment-level advantage on that corpus shrinks on documents it has not seen. This pass does not rescore it.

The comment is ignored. A marked sentence is not the same fact as a comment that names the fault. B385's 27 of 37 was that other question.

GPI clean run 1 is not in the files. Stability for GPI is runs 2 to 5.

`unverifiable` counts as a mark, by the definition fixed above. Three of the 12 clean marks are that colour. The pass does not ask whether a reviewer treats that colour as a fault.
