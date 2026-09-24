# B327. Raised characters are not peers of the line they sit on

Product change in `lib/extract-pdf-direct.mjs`. No model calls. USD 0.
After run 2026-09-24T13:38:07.809Z. officeparser extracts reused from B326. direct re-extracted with the fix.

-----------------------------------------------------------------------------
PART 0A. FACTUAL CLAIMS
-----------------------------------------------------------------------------

C1 BLOCKING. TRUE. Line checked, before this spec: `lib/extract-pdf-direct.mjs` `itemRecord` L119-126 stored only `str`, `x`, `y`. `pageTextArmC` L128-144 grouped by `Math.round(y)`, sorted by x, joined with a space. Nothing read font size or height. B326 REPORT.md C3 recorded the same.

C2 BLOCKING. TRUE. Measured on all twenty B163 PDFs, 29,290 non-empty items.
Every item carries `str`, `dir`, `width`, `height`, `transform` (6-number matrix), `fontName`, `hasEOL`.
`transform[4]` (x) and `transform[5]` (y) are finite on 100% of items.
`transform[0]` (horizontal scale, used as font size) is finite and positive on 100%.
`width` > 0 on 99.7%. `height` > 0 on 78.2%, so height is not a reliable size signal across the twenty. The fix uses x, y, width, and abs(transform[0]). It does not use height.

C3 BLOCKING. TRUE. B326 per-document counts live in `scripts/diagnostic/figure-fidelity/REPORT.md` S2. Officeparser extracts were still on disk and were reused. Direct was re-extracted. The before-picture is that table, not a regenerated officeparser pass.

C4 CHECK. B321 behaviours a change here could disturb, and what this spec does:
- Scanned status: still stamped in `extractTextFromSource` from meaningful length vs `SCANNED_NEAR_EMPTY_CHARS`. `extractPdfDirect` still does not stamp it. Test: `image_only.pdf` remains `unsupported_scanned`.
- Extraction object shape: `{ text, extraction: { fileType, method, textLength, numLines, hasCurrencyToken, hasDigits, warnings, status, structure, textConvertMs, chunkConvertMs, scannedNearEmptyChars, meaningfulTextLength } }`. Unchanged. Kill if this spec had to change it.
- Health warnings: `computeExtractionHealth` unchanged (`very_low_text`, `likely_scanned_pdf`, `low_text`, `empty_text`, plus scanned extras).
- Structure flag: `QC_EXTRACT_STRUCTURE` still default off, empty `{pages,slides,sheets}`. When on, direct still fills pages only.
- Office formats: docx/pptx/xlsx still go through officeparser. This file is not imported on that path.

-----------------------------------------------------------------------------
PART 0B. DESIGN
-----------------------------------------------------------------------------

D1 HOW TO RECOGNISE. An item is a raised candidate when all of: trimmed length <= 4; fontSize < 0.85 times the target line's median fontSize; 1.0 < |y - lineAnchorY| <= 0.65 * that median; horizontally adjacent (gap between -1 and 1.5 * body font).
Body lines still cluster by rounded y. Bands whose median y differs by at most 1.25 are merged so a *.5 split does not put `4` and `edition` on different lines. Raised items are then moved onto the nearest qualifying body band.
Unusual body font: the test is relative to the target line, not a page median, so an 8pt page still sees a 5pt superscript, and a 20pt header is not a candidate.
Wrong small: a short caption could be pulled onto a nearby line. Mitigation is the y-offset window (must be off the line, not a full leading away) and x-adjacency. Wrong large: a superscript stays exiled. T3 (ordinals) is the backstop.

D2 WHAT TO DO. Same geometry, opposite join. After reattachment, join the line left to right:
- If the token is `st`/`nd`/`rd`/`th` and the previous token ends in a digit: concatenate. `25` + `th` => `25th`. Ordinals prefer the adjacent band whose neighbour ends in a digit.
- If the token is a 1-3 digit marker or `*†‡§`: SPACE as its own token. `$180.6 billion` + `1` => `$180.6 billion 1`, never `billion1`.
- Trademark/degree (`™®©°`): concatenate.
- Punctuation after an ordinal: concatenate (`3rd.`).

AWAITING BEN'S RULING. Marker treatment is the exported constant `RAISED_MARKER_TREATMENT` in `lib/extract-pdf-direct.mjs`. Current value `space`. Change that one binding to `drop` or `glue`. Preferred space because drop quietly loses content and glue is the B326 danger. This is the ruling the spec reserved for Ben.

D3 SUBSCRIPTS AND ELSE. The y-window is unsigned, so a dropped subscript that is smaller and x-adjacent would also reattach. Exponents look like footnote digits and receive the marker (space) treatment, so `x²` as a raised `2` becomes `x 2`, not `x2`. Not handled as math. Running headers fail x-adjacency or the y-window. Currency symbols that sit high and are x-adjacent to a number would currently space (`$ 180`) if classified as a 1-3 char raised token that is not a marker regex; `$` is not in MARKER_RE. Unsure how often that layout appears. Not seen on these twenty.

D4 WHERE. `lib/extract-pdf-direct.mjs` only. Default on. Off without reverting the engine: `options.raisedCharacters === false` or env `PDF_RAISED_CHARACTERS=0`. `extractTextFromSource` return shape is untouched. Callers: `extractTextFromSource` (product PDF path), diagnostic scripts that call `extractPdfDirect`, tests. Office formats do not import this module.

D5 Not refused. The B326 location was this assembly. The fix is this assembly.

-----------------------------------------------------------------------------
2.1 COUNTS, BEFORE AND AFTER
-----------------------------------------------------------------------------

Before is B326 REPORT.md S2 (officeparser vs shipped direct). After is officeparser vs B327 direct. SAME may include `25 th` vs `25th` as the same ordinal (whitespace collapsed). That is the suffix present, which B326 called ORDINAL LOST.

| id | SAME B/A | VALUE_CHANGED B/A | DIGIT_GAINED B/A | ORDINAL_LOST B/A | PRESENT_ABSENT B/A | chars B321/after | delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| d01 | 2356/2381 | 4/3 | 28/12 | 0/0 | 24/8 | 156076/156085 | +0.006% |
| d02 | 106/106 | 0/0 | 0/0 | 0/0 | 0/0 | 6724/6725 | +0.015% |
| d03 | 339/373 | 2/1 | 47/28 | 0/0 | 124/96 | 52883/52864 | -0.036% |
| d04 | 206/211 | 1/1 | 6/6 | 0/0 | 28/18 | 29060/29042 | -0.062% |
| d05 | 204/204 | 0/0 | 0/0 | 0/0 | 0/0 | 12246/12247 | +0.008% |
| d06 | 113/113 | 0/0 | 0/0 | 0/0 | 0/0 | 7436/7441 | +0.067% |
| d07 | 200/206 | 0/0 | 6/0 | 0/0 | 0/0 | 9729/9748 | +0.195% |
| d08 | 283/289 | 0/0 | 2/0 | 2/0 | 2/0 | 40134/40126 | -0.020% |
| d09 | 291/297 | 0/0 | 4/0 | 0/0 | 3/0 | 50136/50131 | -0.010% |
| d10 | 244/244 | 0/0 | 0/0 | 0/0 | 0/0 | 30973/30973 | +0.000% |
| d11 | 316/316 | 0/0 | 0/0 | 0/0 | 0/0 | 40924/40924 | +0.000% |
| d12 | 366/366 | 0/0 | 0/0 | 0/0 | 0/0 | 53370/53370 | +0.000% |
| d13 | 1205/1272 | 32/33 | 365/325 | 0/0 | 452/396 | 220690/220658 | -0.014% |
| d14 | 110/110 | 0/0 | 0/0 | 0/0 | 0/0 | 30398/30398 | +0.000% |
| d15 | 46/46 | 0/0 | 0/0 | 0/0 | 0/0 | 29733/29733 | +0.000% |
| d16 | 104/104 | 0/0 | 0/0 | 0/0 | 0/0 | 25195/25191 | -0.016% |
| d17 | 73/74 | 0/0 | 0/0 | 1/0 | 0/0 | 36769/36767 | -0.005% |
| d18 | 49/49 | 0/0 | 0/0 | 0/0 | 4/4 | 22597/22597 | +0.000% |
| d19 | 76/77 | 0/0 | 0/0 | 1/0 | 2/2 | 31969/31967 | -0.006% |
| d20 | 74/75 | 0/0 | 0/0 | 0/0 | 8/6 | 30545/30545 | +0.000% |
| TOTAL | 6761/6913 | 39/38 | 458/371 | 4/0 | 647/530 | | |

Ordinal inventory: officeparser 18, direct after 18.

-----------------------------------------------------------------------------
2.2 FIGURES WHOSE VALUE CHANGED BECAUSE OF THIS FIX
-----------------------------------------------------------------------------

None.

The harness flagged pairing rematches on d13 (and one on d03) where officeparser vs B321-direct had been SAME and officeparser vs B327-direct paired a different neighbour in a flattened table. Every previously agreed raw string still occurs in the new extract (`stillInNewText` true on all of them). Those are not value rewrites. They are the same table-cell pairing noise B326 already documented.

Flagged rematches: 20. Still present in the new extract: 20. Missing: 0.

-----------------------------------------------------------------------------
2.3 T1 TO T6
-----------------------------------------------------------------------------

T1 MET. d17 extract contains `the 25th anniversary`. Slice: " it’ll do the same for you.\n* * *\nJanuary 2 of this year was the 25th anniversary of my memo bubble.com , the "
T2 MET. No B326-identical figure was rewritten. 0 missing. d13 lead sentence: " earned revenue in 2024 of\n \n$180.6 billion 1 and net income of $58.5 billion, with return on tangib"
T3 MET. SAME 6761 -> 6913 (does not fall). ORDINAL LOST 4 -> 0. Ordinal spans 18 vs 18.
T4 MET. Direct character counts vs B321/B326, max abs delta 0.195% (limit 1%).
T5 MET. `image_only.pdf` still stamps `unsupported_scanned`. Extraction object shape unchanged (tests/extract-pdf-direct.test.mjs). Word, PowerPoint, Excel still use officeparser; this module is not on that path.
T6 MET. The guard is the twenty-document table, not d17 alone. SAME rose on d01, d03, d04, d08, d09, d13, d17, d19, d20 and never fell. ORDINAL LOST is zero on every row. d09 `4th edition` was the last ordinal and is not d17.

-----------------------------------------------------------------------------
2.4 WHAT THE FIX MADE WORSE
-----------------------------------------------------------------------------

Nothing named on the B326 classes. Checked: SAME (up), ORDINAL LOST (to zero), VALUE CHANGED (39 -> 38), DIGIT GAINED (458 -> 371), PRESENT/ABSENT (647 -> 530), character counts (all within 1% of B321), d13 `$180.6` unchanged, native_clean.pdf byte-identical on vs off.
Unsure, not measured as worse: exponents that look like footnote digits will be spaced (`x 2` not `x2`). Tables remain flattened. Marker spacing is Ben's ruling and can move.

USD 0.
