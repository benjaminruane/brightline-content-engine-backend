# B383. Join text pieces that form one word

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  ab559bb  main  166 files  1816 tests` |
| Cost | USD 0. No model calls. |

## Part 1. Gap distribution

Adjacent items on a band, after the column split. Gap is `next.x - (prev.x + prev.width)`, divided by the previous item's font size. Every pair, including a whitespace item.

| File | Pairs | <0.05 | <0.1 | <0.15 | <0.2 | <0.3 |
|---|---:|---:|---:|---:|---:|---:|
| 3i-ar-2025.pdf | 11198 | 6085 | 6085 | 6085 | 6275 | 6568 |
| 3i-audited-fs-2025.pdf | 4610 | 2618 | 2618 | 2618 | 2622 | 2690 |
| 3i-fy25-presentation.pdf | 310 | 226 | 227 | 227 | 228 | 228 |
| 3i-overview-and-strategy-2025.pdf | 372 | 228 | 228 | 228 | 280 | 300 |
| 3i-press-release-fy2025.pdf | 3861 | 3588 | 3588 | 3588 | 3589 | 3654 |
| 3i-press-release-fy25-highlights.pdf | 99 | 99 | 99 | 99 | 99 | 99 |
| hpif-annual-fs-2026.pdf | 1183 | 788 | 788 | 788 | 788 | 791 |
| hpif-factsheet-march-2026.pdf | 345 | 193 | 197 | 199 | 200 | 205 |
| hpif-report-march-2026.pdf | 759 | 434 | 440 | 442 | 443 | 470 |
| pg-annual-results-2024.pdf | 977 | 919 | 929 | 929 | 929 | 930 |
| pg-ir-july-2025.pdf | 1997 | 1831 | 1856 | 1856 | 1856 | 1858 |
| source-clearpoint-q1-2026.pdf | 340 | 169 | 169 | 169 | 169 | 178 |
| TOTAL | 26051 | 17178 | 17224 | 17228 | 17478 | 17971 |

Most of the pairs under 0.05 em are a whitespace item sitting on the previous word. `joinLine` already appends that item and does not add a second space. The threshold has to be chosen from the pairs the new rule can actually see: both items have non-whitespace text.

| File | Content pairs | <0.05 | <0.1 | <0.15 | <0.2 | <0.3 |
|---|---:|---:|---:|---:|---:|---:|
| 3i-ar-2025.pdf | 1608 | 197 | 197 | 197 | 197 | 197 |
| 3i-audited-fs-2025.pdf | 648 | 40 | 40 | 40 | 40 | 40 |
| 3i-fy25-presentation.pdf | 108 | 24 | 25 | 25 | 26 | 26 |
| 3i-overview-and-strategy-2025.pdf | 71 | 41 | 41 | 41 | 41 | 41 |
| 3i-press-release-fy2025.pdf | 281 | 76 | 76 | 76 | 76 | 76 |
| 3i-press-release-fy25-highlights.pdf | 4 | 4 | 4 | 4 | 4 | 4 |
| hpif-annual-fs-2026.pdf | 69 | 5 | 5 | 5 | 5 | 5 |
| hpif-factsheet-march-2026.pdf | 68 | 32 | 32 | 32 | 32 | 32 |
| hpif-report-march-2026.pdf | 86 | 50 | 50 | 50 | 50 | 50 |
| pg-annual-results-2024.pdf | 286 | 241 | 251 | 251 | 251 | 252 |
| pg-ir-july-2025.pdf | 595 | 446 | 471 | 471 | 471 | 473 |
| source-clearpoint-q1-2026.pdf | 23 | 10 | 10 | 10 | 10 | 10 |
| CONTENT | 3847 | 1166 | 1202 | 1202 | 1203 | 1206 |

Content-content bins, all files:

| Em | Pairs |
|---|---:|
| below 0 | 615 |
| 0 to 0.02 | 537 |
| 0.02 to 0.05 | 14 |
| 0.05 to 0.08 | 22 |
| 0.08 to 0.10 | 14 |
| 0.10 to 0.12 | 0 |
| 0.12 to 0.20 | 1 |
| 0.20 to 0.25 | 0 |
| 0.25 to 0.30 | 3 |
| 0.30 and above | 2641 |

ClearPoint's ten content pairs under 0.05 em are the ten `IRRA` + `flow` joins. Their gap is about 0.

## The rule

A fixed fraction, plus a shape test. A per-page estimate of space width does not work here. Whitespace items that carry a width have a 10th percentile of 0.186 em and a median of 0.624 em, because many of them are positioning gaps, not word spaces. A page median would sit in the wrong place.

The content-content gaps already show the two populations. Pieces of one word, and slight kerning, are under 0.10 em. A real separation starts at 0.25 em. The band from 0.10 to 0.25 is empty apart from one footnote at 0.159 em. The cut is 0.12 em, inside that valley, and the same cut fits every file: the per-file counts do not rise between 0.10 and 0.20 except that one footnote.

A gap cut alone is not enough. `2.5x` beside `nTVPI`, and `6.9%` beside `nIRR`, sit at 0.075 to 0.09 em, inside the word-piece pile. `52` beside `56` overlaps by a full em. Those must stay two tokens. So the next item, trimmed, has to match `^[a-z][a-z]*[,.:;)']?$` (a lowercase fragment, optional single punctuation), the previous item has to end in a letter or digit, and the gap in ems has to be above -0.15 and below 0.12. A collision below -0.15 em is not kerning. If either item already has whitespace at the junction, the line keeps today's added space.

Ordinals, trademarks, and footnote markers still run first and are unchanged. A missing font size does not join: the space stays. This corpus had no such pair.

Raised characters off still joins a band with one space and does not use this rule. The product default is raised characters on, which is the path that calls `joinLine`.

## Part 3. The 392 passages

`fabrication.json` records 190 exact on draft-1, 187 on draft-2, and 15 on real-runs. Replayed against the source text those passes used: 392.

357 name a source whose PDF is not in the repo (text memos, and the 3i, HICL, and GPI real-run extracts). Excluded. Not counted as passes.

35 have a PDF: fixtures 05 (13), 06 (2), 11 (2), 17 (12), 19 (5), and one ClearPoint passage. Re-extracted with the new join. All 35 still match exactly. Failures: none.

## Part 4. The five ClearPoint strikes

The five are the ClearPoint quote strikes with no ellipsis whose words occur in order in the source text B381 used. Exact `indexOf` on the new extract: 0 of 5.

`IRRAflow` occurs 10 times. `IRRA flow` occurs 0 times.

The word is joined. Exact match still fails because the PDF wraps the sentence, and one strike ends the quotation where the source continues.

**statement 0.** Passage has one space after the hyphen and no line break. Extract has two spaces and a line break:

```
SOLANA BEACH, Calif., May 13, 2026 (Newswire.com) -  ClearPoint Neuro, Inc.
(Nasdaq:CLPT) (the "Company"), a global device, cell, and gene therapy-enabling company
offering precise navigation to the brain and spine, today announced financial results for its
first quarter ended March 31, 2026.
```

**statement 1 and the revenue sentence on statement 2.** `IRRAflow` is one word. The line breaks remain:

```
Reported first quarter revenue of $12.1 million, including $2.3 million of IRRAflow
revenue, representing 43% overall growth and 16% year-over-year total organic growth
compared with the first quarter of 2025;
```

Statement 1 continues with the installed-base sentence and the synergies sentence, also wrapped.

**statement 2, the CEO sentence.** Extract:

```
"While
record revenue achievement and 25% organic devices growth made the headline, there is
no shortage of meaningful strategic progress across the entire organization. This includes
```

The strike ends on a closing quote. The source continues `This includes`.

**statement 8.** Line break only:

```
Received Medical Device License (MDL) from Health Canada for the ClearPoint Neuro
Navigation System, covering both MRI-guidance and iCT guidance workflows with first
cases now scheduled;
```

## Part 5. New tokens

Whitespace-separated tokens. A token is new when it occurs after the join and did not occur before. There are 29, so the list is the whole set rather than a top 50.

| Length | File | Token |
|---:|---|---|
| 14 | pg-ir-july-2025.pdf | collateralized |
| 11 | 3i-ar-2025.pdf | Nextchapter |
| 11 | 3i-overview-and-strategy-2025.pdf | Nextchapter |
| 11 | hpif-factsheet-march-2026.pdf | Repurchases |
| 11 | hpif-report-march-2026.pdf | Repurchases |
| 8 | pg-ir-july-2025.pdf | financed |
| 8 | source-clearpoint-q1-2026.pdf | IRRAflow |
| 8 | pg-annual-results-2024.pdf | Portfoli |
| 8 | pg-ir-july-2025.pdf | represen |
| 7 | pg-annual-results-2024.pdf | officer |
| 7 | pg-ir-july-2025.pdf | officer |
| 7 | pg-ir-july-2025.pdf | outstan |
| 7 | pg-ir-july-2025.pdf | period. |
| 7 | hpif-factsheet-march-2026.pdf | Vintage |
| 6 | pg-ir-july-2025.pdf | $118bn |
| 6 | pg-ir-july-2025.pdf | $174bn |
| 6 | pg-annual-results-2024.pdf | billio |
| 5 | pg-ir-july-2025.pdf | 243bn |
| 5 | pg-annual-results-2024.pdf | appro |
| 5 | pg-ir-july-2025.pdf | appro |
| 5 | pg-ir-july-2025.pdf | perfo |
| 5 | pg-ir-july-2025.pdf | propr |
| 5 | pg-annual-results-2024.pdf | secon |
| 4 | pg-annual-results-2024.pdf | cont |
| 4 | pg-ir-july-2025.pdf | cont |
| 4 | hpif-factsheet-march-2026.pdf | Term |
| 4 | hpif-report-march-2026.pdf | Term |
| 4 | hpif-factsheet-march-2026.pdf | Year |
| 4 | hpif-report-march-2026.pdf | Year |

`IRRAflow`, `collateralized`, `officer`, `Repurchases`, `Vintage`, `Year`, `Term`, `financed` read as words. `Nextchapter` is the PDF's own button label: the other half of that control already arrived as the single item `Previouschapter`. `$174bn`, `$118bn`, and `243bn` are a number and a unit with a gap under 0.01 em. `Portfoli`, `represen`, `outstan`, `billio`, `appro`, `perfo`, `propr`, `secon`, and `cont` are a word split into more than two items. The adjacent pair joined. The rest of the word is still its own item, so the token is a fragment, not two words smashed together.

| File | Tokens before | Tokens after | Drop |
|---|---:|---:|---:|
| 3i-ar-2025.pdf | 116781 | 116773 | 8 |
| 3i-audited-fs-2025.pdf | 29202 | 29202 | 0 |
| 3i-fy25-presentation.pdf | 3303 | 3303 | 0 |
| 3i-overview-and-strategy-2025.pdf | 7994 | 7986 | 8 |
| 3i-press-release-fy2025.pdf | 24479 | 24479 | 0 |
| 3i-press-release-fy25-highlights.pdf | 1083 | 1083 | 0 |
| hpif-annual-fs-2026.pdf | 16275 | 16275 | 0 |
| hpif-factsheet-march-2026.pdf | 2199 | 2194 | 5 |
| hpif-report-march-2026.pdf | 4302 | 4293 | 9 |
| pg-annual-results-2024.pdf | 4122 | 4113 | 9 |
| pg-ir-july-2025.pdf | 8314 | 8282 | 32 |
| source-clearpoint-q1-2026.pdf | 3184 | 3174 | 10 |

The largest drop is 32 tokens on pg-ir-july-2025, out of 8314. ClearPoint drops by 10, one per `IRRAflow`. Five files are unchanged.

## Part 6. Stored ClearPoint text

`tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt` is the new extract, 21,376 characters. The fixture README records that the stored review payloads predate B382 and B383.

`scripts/diagnostic/sources/*.txt` was not edited.

`tests/b382-column-assembly.test.mjs` locked the broken spelling `IRRA flow`. That one assertion now expects `IRRAflow`.

## Callers

`joinLine` is private. `assembleBands` calls it only when raised characters are on. Raised characters off still joins each band with a single space. `extractPdfDirect` is called by `extractTextFromSource` (the product PDF path), the extractor-swap and figure-fidelity diagnostics, and the extract tests. `api/_lib/env-flags.js` and `tests/health-build-and-flags.test.mjs` import only `isRaisedCharactersEnabled`. Office formats do not import this module. The return shape is unchanged. No verdict, matcher, or card rule reads the gap.

## Technical summary

`joinLine` in `lib/extract-pdf-direct.mjs` now keeps the item geometry. After the ordinal, trademark, and marker rules, two items are concatenated with no added space when the gap is above -0.15 em and below 0.12 em, the next trimmed item is a lowercase fragment, and neither item already has whitespace at the junction. Otherwise the line is joined as before. `pageJoinRows` exports the rows that joiner sees, for the gap diagnostic. The ClearPoint fixture text was replaced. Architecture and the backlog record the rule.

## Plain-language summary

On the ClearPoint press release, the product name is now IRRAflow, one word, everywhere it was split in two. A normal space between two words is unchanged. A quote still has to match the extract character for character, so a line break inside the sentence can still keep that quote from landing.
