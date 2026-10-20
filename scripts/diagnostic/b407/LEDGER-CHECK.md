# B407 ledger check

Re-run on the text this change stores. That text is the fixture file, unstripped. Furniture lines are flagged and kept. No model call. Stored B403C note buckets are replayed. USD 0.

## Bar

| | demands | light | quiet | noise in demands |
|---|---:|---:|---:|---:|
| Bar | 3 | 5 | 30 | 0 |
| This text | 3 | 5 | 30 | 0 |

38 clean statements. No statement moves. HICL clean S0 is `nothing_to_raise`, quiet. Nothing on that sentence is missing. The name is on the two title lines again.

## HICL clean header

16 of 18 facts matched · 2 to look at · 1 worth a glance · 4 wording notes

2 facts are not in the source.

Tiers on that draft: demands 2, light 1, quiet 5.

## Health

`computeExtractionHealth` on the stored text, and on the shorter text B405 would have stored. File type `txt` and `pdf`.

| File | Stored chars | Stored lines | B405 chars | B405 lines | Warnings, stored | Warnings, B405 |
|---|---:|---:|---:|---:|---|---|
| 3i | 9735 | 120 | 9735 | 120 | none | none |
| HICL | 12311 | 58 | 12263 | 56 | none | none |
| GPI | 5129 | 75 | 5093 | 73 | none | none |
| ClearPoint | 21376 | 446 | 21319 | 445 | none | none |

No health warning changes. `hasDigits` and `hasCurrencyToken` stay true on all four. `textLength` and `numLines` are the full counts. HICL flags are line indexes 0 and 5, the two title lines.

## Clip

20,000 characters of non-furniture line text. A furniture line before the cut stays. Joining newlines are not part of the budget.

| File | Clipped length |
|---|---:|
| 3i | 9735 |
| HICL | 12311 |
| GPI | 5129 |
| ClearPoint | 20465 |

3i, HICL and GPI are under the budget, so the saved string is the file. ClearPoint is clipped. One furniture line at the head is kept inside the span.

## Walkthrough line ids

Every line id cited in `scripts/diagnostic/b404/WALKTHROUGH.md` was checked against `source-hicl-interim-extracted.txt`. The ids are stable.

L1 and L6 are `HICL Infrastructure PLC`. L12 contains 28 February 2026. L16 contains target. L22 contains the expectations bullet. L23 contains UK. L25 contains forecast. L30 and L37 contain Affinity. L35 and L36 contain expectations. L38 contains Pancras. L39 contains Fortysouth. L40 contains guidance. L58 is `-Ends-`.

## 3i fixture and the stored review

They still disagree. The fixture is 9735 characters and 120 lines. The source embedded in `clean-review.json` is 7441 characters and 98 lines. Left as it is.
