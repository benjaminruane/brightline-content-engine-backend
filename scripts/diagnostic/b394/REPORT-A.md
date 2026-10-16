# B394 Part A. Abbreviation normalisation

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  bd2b115  main  166 files  1819 tests`. Part A is `f6d65fc`, contained in that HEAD. |
| Cost | USD 0. No model calls. |
| Definition | `scripts/diagnostic/b394/ELEMENTS-v3.md`, committed as `8cdc948` before any count. Not revised after a number. v2 stays as written. |
| Evidence | `scripts/diagnostic/b392/elements.mjs`, `scripts/diagnostic/b392/cross-table.mjs`, `scripts/diagnostic/b392/runs/cross-table.json`. |

## 1. The junk rate

The junk rate stays under 3 percent. The four clean drafts yield 106 elements, beside 101 under v2. None is junk. That is 0.0 percent.

Un-excluding the abbreviations reintroduced no junk. The five new clean surfaces are EBITDA three times, CEO once, and MRI once. Each is a token whose substitution would be a real error. No other new surface appeared.

## 2. CEO and CFO

Both assertions passed. Part A has not failed.

HICL doctored: one element `CFO`, not found. The source says "appointed Mark Garth as Chief Executive Officer" and contains neither CEO nor CFO. CFO does not match Chief Executive Officer.

HICL clean: one element `CEO`, found. It matches that same spelled-out form. The abbreviation itself stays case sensitive.

The planted swap is visible again. hicl-S7-a is check-caught, which is why uncovered returns from 12 to 11.

## 3. Every B393 number beside its new value

B393 is the committed table in `scripts/diagnostic/b393/REPORT.md`.

Junk: 0 of 101 beside 0 of 106.

Clean elements: 101 beside 106. Doctored elements: 100 beside 105.

### ids-1 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B393 | 38 (38.0%) | 20 (20.0%) | 22 (22.0%) | 2 (2.0%) |
| found, now | 40 (38.1%) | 22 (21.0%) | 22 (21.0%) | 2 (1.9%) |
| not found, B393 | 14 (14.0%) | 4 (4.0%) | 0 | 0 |
| not found, now | 15 (14.3%) | 4 (3.8%) | 0 | 0 |

Moved: found contradicted 38 to 40, found partial 20 to 22. Not-found contradicted 14 to 15. Found supported, found silent, and the other not-found columns did not move.

### ids-1 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B393 | 5 (5.0%) | 42 (41.6%) | 52 (51.5%) | 0 |
| found, now | 5 (4.7%) | 45 (42.5%) | 54 (50.9%) | 0 |
| not found, B393 | 0 | 1 (1.0%) | 1 (1.0%) | 0 |
| not found, now | 0 | 1 (0.9%) | 1 (0.9%) | 0 |

Moved: found partial 42 to 45, found supported 52 to 54. The not-found counts stay 0, 1, 1, 0. The percentages move because the denominator grew.

### ids-2 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B393 | 43 (43.0%) | 10 (10.0%) | 25 (25.0%) | 4 (4.0%) |
| found, now | 45 (42.9%) | 12 (11.4%) | 25 (23.8%) | 4 (3.8%) |
| not found, B393 | 15 (15.0%) | 3 (3.0%) | 0 | 0 |
| not found, now | 16 (15.2%) | 3 (2.9%) | 0 | 0 |

Moved: found contradicted 43 to 45, found partial 10 to 12. Not-found contradicted 15 to 16.

### ids-2 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B393 | 5 (5.0%) | 40 (39.6%) | 54 (53.5%) | 0 |
| found, now | 5 (4.7%) | 44 (41.5%) | 55 (51.9%) | 0 |
| not found, B393 | 0 | 1 (1.0%) | 1 (1.0%) | 0 |
| not found, now | 0 | 1 (0.9%) | 1 (0.9%) | 0 |

Moved: found partial 40 to 44, found supported 54 to 55. Not-found counts stay 0, 1, 1, 0.

C1. 14 of 18 (77.8 percent) beside 15 of 19 (78.9 percent). 15 of 18 (83.3 percent) beside 16 of 19 (84.2 percent).

C2. Not-found and silent stays 0 and 0, both passes.

C3. Stays one case, both passes: clean HICL "five". Doctored C3 stays empty.

C4. Model-only stays 7 of 37, the same ids. Check-caught 17 beside 18. Uncovered 12 beside 11. The returning one is hicl-S7-a. Clean found-and-contradicted stays 5, the same five on 3i statement 0.

C5. 52 of 101 (51.5 percent) beside 54 of 106 (50.9 percent). 54 of 101 (53.5 percent) beside 55 of 106 (51.9 percent).

| document | statements | B393 ids-1 | now ids-1 | B393 ids-2 | now ids-2 |
|---|---|---|---|---|---|
| 3i | 15 | 18 | 18 | 13 | 13 |
| HICL | 8 | 7 | 10 | 8 | 11 |
| GPI | 5 | 16 | 16 | 16 | 16 |
| ClearPoint | 10 | 9 | 9 | 12 | 12 |

3i, GPI, and ClearPoint did not move. HICL grew by the EBITDA and CEO elements that are no longer excluded.

## 4. Navigation text

One element matches the ClearPoint chrome block, and it is not a menu word.

The opening bar is `Products Pricing Customer Stories Resources Newsroom`. The footer runs from `Products Company Resources` through `Log In Sign Up`, and that slice includes `© 2005 - 2026 Newswire`. Against that text, the only hit is the date 2026 on clean ClearPoint statement 9. The same year is also in the article, so the element is found without the footer. No name and no figure matches Products, Pricing, Newsroom, Log In, or Sign Up.

That copyright-year match is a follow-up. Part B does not clean the extracted source.

## 5. Predictions

Quoted from ELEMENTS-v3.md.

- "Part A keeps the junk rate under 3 percent and reintroduces no junk." 0 of 106. The new surfaces are EBITDA, CEO, and MRI. Holds.
- "HICL doctored CFO becomes not-found; HICL clean CEO is found." Both asserted by the run. Holds.
- "No element matches against the ClearPoint navigation text." The date 2026 matches the copyright year in the footer block that also holds Log In and Sign Up. Does not hold. The menu words themselves match nothing.
- The two Part B predictions are scored in `scripts/diagnostic/b394/REPORT-B.md`. They were recorded in ELEMENTS-v3.md before either run.

## 6. What this part could not establish

It did not say whether IRR, MOIC, or the other unexpanded abbreviations are spelled out in a source outside these four. It did not remove the copyright year from the extract. Stance is still the claim that contains the element, so the five clean attachments on 3i statement 0 did not move. It spent nothing and called no model.
