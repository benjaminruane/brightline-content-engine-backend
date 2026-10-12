# B382. Read PDF pages by column

| | |
|---|---|
| SHIPPED | recorded by `npm run verify:ship` on the implementation commit |

Ids used: B382.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, label, or review surface. The change is the PDF extractor.

## Part 1. Size

`node scripts/diagnostic/b382/column-check.mjs` over the eleven PDFs in `scripts/diagnostic/extraction-check/inputs/` and `tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026.pdf`.

| | |
|---|---|
| Pages | 509 |
| Multi-column pages | 296 |
| Bands that hold items from more than one column | 3808 |

A page with no persistent gap is single column. Per-page lines (x-interval, gap, cross-band count) are the script's stdout. Per file:

| File | Pages | Multi-column | Cross bands |
|---|---:|---:|---:|
| 3i-ar-2025.pdf | 220 | 155 | 1717 |
| 3i-audited-fs-2025.pdf | 54 | 20 | 537 |
| 3i-fy25-presentation.pdf | 44 | 24 | 135 |
| 3i-overview-and-strategy-2025.pdf | 17 | 16 | 151 |
| 3i-press-release-fy2025.pdf | 56 | 17 | 508 |
| 3i-press-release-fy25-highlights.pdf | 3 | 1 | 18 |
| hpif-annual-fs-2026.pdf | 33 | 10 | 239 |
| hpif-factsheet-march-2026.pdf | 4 | 1 | 25 |
| hpif-report-march-2026.pdf | 10 | 3 | 49 |
| pg-annual-results-2024.pdf | 21 | 16 | 145 |
| pg-ir-july-2025.pdf | 46 | 32 | 279 |
| source-clearpoint-q1-2026.pdf | 1 | 1 | 5 |
| Total | 509 | 296 | 3808 |

ClearPoint is one page, 1512 by 12790 points. The article and the sidebar rarely share a y, so only 5 bands mix the two columns. The splice B381 saw is the other shape: a sidebar line between two article lines, because the old assembly sorted every band on the page by y.

## Column detection

Text items are the pdfjs items already used by arm C (`str`, `x`, `y`, `width`).

For each page, ignore blank items and project the rest onto x. A bin counts how many rounded-y bands touch that x. A gutter is a run of bins that is:

- at least 12 points wide
- touched by at most 6 bands
- with at least 6 bands of text within 72 points to its left and 72 points to its right

Twelve points is wider than a word space, and a word space does not stay empty down the page. Six bands on each side keeps a page number or a one-line kicker from opening a column. A gap that runs off the edge of the text has no far side, so a right margin is not a column.

Reading order is left to right. Each item goes to the column of its midpoint. An item whose midpoint sits inside a gutter goes to the nearer side. Each column is then assembled with the existing band logic, including raised-character reattachment, and the column texts are joined with a newline. Raised characters still move only among items that were given to that assembly. They do not cross a gutter.

No gutter: the page is handed to that same band function as one list. That is the previous path.

A table whose gaps are covered by prose elsewhere on the page does not open a gutter, because those x positions are not empty down the page. A page that is itself the table, or a two-column page whose gutter stays empty, does. Those pages are the 296.

## Part 2. Before and after

Each PDF was extracted with the previous assembler, then again after the change. Page text was compared. A changed page is a defect unless Part 1 called it multi-column.

No single-column page changed. Every multi-column page did change. `native_clean.pdf` and `raised_characters.pdf` are not in the inputs set; both extracts are byte-identical and the test locks them.

| File | Text | Pages that changed | Why |
|---|---|---|---|
| 3i-ar-2025.pdf | changed | 2, 4-19, 21-26, 28-38, 40, 42-44, 46-51, 54-67, 69-71, 73-74, 77, 79-85, 87-89, 91-111, 113-115, 117-119, 121-127, 129-135, 137-138, 142, 145, 147-149, 151-163, 169-170, 172, 174, 179, 181, 188, 190, 199-200, 202, 204, 212-219 | Each has a persistent gap. Page 2 gutters 176-266 and 423-492, three columns. |
| 3i-audited-fs-2025.pdf | changed | 1-8, 14-15, 17, 19, 24, 26, 33, 35, 44-45, 47, 49 | Page-sized tables. Page 1 gutter 199-304. |
| 3i-fy25-presentation.pdf | changed | 3, 5-9, 11-14, 16-18, 23-24, 26-30, 32, 35-37 | Slide columns. Page 3 gutters 97-224, 257-441, 499-635. |
| 3i-overview-and-strategy-2025.pdf | changed | 2-17 | Two-column body. Page 2 gutter 281-331. |
| 3i-press-release-fy2025.pdf | changed | 2, 13-14, 21, 23, 29-31, 35-41, 48, 52 | Page 2 gutters 110-455 and 490-520. |
| 3i-press-release-fy25-highlights.pdf | changed | 2 | Same shape as the press release page 2. Gutters 110-455 and 491-521. |
| hpif-annual-fs-2026.pdf | changed | 8-9, 11-17, 30 | Statement tables. Page 8 has five gutters, six columns. |
| hpif-factsheet-march-2026.pdf | changed | 2 | Gutters 277-289 and 444-463. |
| hpif-report-march-2026.pdf | changed | 2, 7-8 | Page 2 gutters 275-288 and 437-457. |
| pg-annual-results-2024.pdf | changed | 2-9, 11-12, 14-19 | Page 2 gutter 243-473. |
| pg-ir-july-2025.pdf | changed | 3-6, 8-10, 12-14, 16-18, 20-22, 24-25, 27-33, 37-41, 43-44 | Page 3 gutters 335-433 and 461-548. |
| source-clearpoint-q1-2026.pdf | changed | 1 | Gutter 876-1006. Article first, sidebar after. |

Unchanged pages in those files are the single-column pages from Part 1.

## Part 3. The 32 passages

`scripts/diagnostic/b381/runs/fabrication.json` quote strikes. A strike is in the set when the passage contains no ellipsis (`...` or the unicode ellipsis) and every word token occurs, in order, in the extracted source named on the strike. Word tokens are letters and digits after straightening quotes and folding case.

That rule returns 31 strikes, not 32. The two strikes that use a unicode ellipsis do have their other words somewhere in order, but the spec excludes an ellipsis, and both of those alignments are hundreds of words apart. They are not in the 31.

26 of the 31 name a source whose PDF is not in the repo: fixtures 07, 08, 09, 15, 16, and 18 (text memos) and the HICL interim extract. Excluded. Not guessed.

Five name the ClearPoint source. Re-extracted from the committed PDF. Exact `indexOf` matches: 0 of 5.

The furniture is out of the sentences. Exact match still fails because the strike is one line (or says `IRRAflow` as one word) and the extract keeps the PDF's line breaks and the two items `IRRA` and `flow`. That space was already in the extract before this change. The stored fixture the strikes were written against had spelled it `IRRAflow`.

**real-runs 2026-10-06-clearpoint statement 0.** Line breaks only. Collapsing whitespace matches. Extract:

```
SOLANA BEACH, Calif., May 13, 2026 (Newswire.com) -  ClearPoint Neuro, Inc.
(Nasdaq:CLPT) (the "Company"), a global device, cell, and gene therapy-enabling company
offering precise navigation to the brain and spine, today announced financial results for its
first quarter ended March 31, 2026.
```

`More Press Releases` is no longer between `for its` and `first quarter`.

**statement 1 and statement 2, the revenue sentence.** Extract:

```
Reported first quarter revenue of $12.1 million, including $2.3 million of IRRA flow
revenue, representing 43% overall growth and 16% year-over-year total organic growth
compared with the first quarter of 2025;
The activated installed base across all ClearPoint technology including IRRA flow
systems now includes over 175 global centers;
Achievement of measurable revenue and cost synergies through the continuing
integration of the IRRA flow  product portfolio and team;
```

`Positive BioPharma Partner Regulatory` is no longer between `IRRA flow` and `revenue`. The strike says `IRRAflow` as one word, so exact match fails on that space as well as the line breaks.

**statement 2, the CEO sentence.** Extract:

```
"While
record revenue achievement and 25% organic devices growth made the headline, there is
no shortage of meaningful strategic progress across the entire organization. This includes
```

The strike ends the sentence with a closing quote. The source continues `This includes`.

**statement 8.** Line breaks only. Collapsing whitespace matches. Extract:

```
Received Medical Device License (MDL) from Health Canada for the ClearPoint Neuro
Navigation System, covering both MRI-guidance and iCT guidance workflows with first
cases now scheduled;
```

`ClearPoint Neuro to Announce Second` is no longer between `first` and `cases`.

## Part 4. Stored ClearPoint text

`tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt` is the new extract, 21,386 characters. The README says the review payloads predate the fix.

`scripts/diagnostic/sources/*.txt` was not edited.

## Callers of extractPdfDirect

`extractTextFromSource` is the product PDF path. Single-column pages are unchanged, so those extracts are unchanged. Multi-column pages are read column by column. The return shape is unchanged.

`scripts/diagnostic/extractor-swap/verify-swap.mjs` and `scripts/diagnostic/figure-fidelity/run-figure-fidelity.mjs` call `extractPdfDirect` directly. They will see the new text on a multi-column page. They do not decide a verdict.

`tests/extract-pdf-direct.test.mjs`, `tests/extract-raised-characters.test.mjs`, and `tests/b382-column-assembly.test.mjs` call it. The first two lock scanned status, native text, and raised characters. Those PDFs are single column.

`api/_lib/env-flags.js` and `tests/health-build-and-flags.test.mjs` import only `isRaisedCharactersEnabled`. Unaffected.

Office formats do not import this module.

## Technical summary

`pageTextArmC` in `lib/extract-pdf-direct.mjs` now calls `pageColumnLayout`. A gutter is an x-run at least 12 points wide, covered by at most 6 y-bands, with at least 6 bands of text within 72 points on each side. No gutter: the previous band assembly runs on the original item list. One or more gutters: items are split by midpoint, each column is assembled with that same band function (raised characters included), and the columns are concatenated left to right. `assemblePdfPageItems`, `pageColumnLayout`, and `itemsFromPdfjsTextContent` are exported for the diagnostic and the test. The ClearPoint fixture text was replaced with the new extract. Architecture, backlog, and that fixture's README record the rule. No verdict, matcher, or card code changed.

## Plain-language summary

On a press release or a report with a sidebar or two columns, the sentence you were shown is now one stretch of the article, and the sidebar comes after it. A normal single-column page reads exactly as it did before. The quoted passage still has to match the extract character for character, so a line break inside the sentence can still keep a quote from landing until a later step joins those lines.
