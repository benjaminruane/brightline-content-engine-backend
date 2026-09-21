# B163. Ingestion reality

Of twenty real in-scope documents, **thirteen produced a Review a reader could trust.** The thirteen are d01, d02, d05, d06, d08, d09, and d14 to d20. The other seven failed that test for named reasons in Part 2 Gate 7 and Part 5. TOTAL COST OF THIS SPEC: **USD 2.0115 list / USD 1.9032 discounted** (`meta.llmSpend.costUsd` on the Gate 7 extracts plus the PDF-label-drop pass). Extract-only POSTs are unpriced. No other model calls.

This is a read-only diagnostic. No product code was changed. No recommendations are in this file.

Committed numbers: `manifest.json`, `gate-table.json`, `gate-table.csv`, `production-gates.json`, `gate7-reviews.json`, `body-probes.json`, `reviews/*-review-extract.json`. PDF binaries stay gitignored.

---

## Part 1. Corpus

### 1.1 The twenty

In-scope types only: press releases, memos, letters, IR narrative. No scanned files, no fact sheets, no tables-first financial statements (Ben ruling 19 September 2026). All twenty have a real text layer (`textLayer: real_text_layer` in `manifest.json`).

| id | file | genre | origin |
|----|------|-------|--------|
| d01 | 3i-press-release-fy2025.pdf | press_release | Original eleven, 7 Sep local copy |
| d02 | 3i-press-release-fy25-highlights.pdf | press_release | Original eleven |
| d03 | 3i-overview-and-strategy-2025.pdf | ir_narrative | Original eleven |
| d04 | hpif-report-march-2026.pdf | ir_narrative | Original eleven (shareholder report, not the fact sheet) |
| d05 | 3i-q1-fy25-performance-update.pdf | press_release | Public 3i, downloaded 2026-09-21 |
| d06 | 3i-hy25-highlights.pdf | press_release | Public 3i, downloaded 2026-09-21 |
| d07 | pg-annual-results-2025-press-release.pdf | press_release | Partners Group EQS ad-hoc, downloaded 2026-09-21 |
| d08 | berkshire-2024-shareholder-letter.pdf | letter | berkshirehathaway.com, downloaded 2026-09-21 |
| d09 | berkshire-2023-shareholder-letter.pdf | letter | same |
| d10 | berkshire-2022-shareholder-letter.pdf | letter | same |
| d11 | berkshire-2021-shareholder-letter.pdf | letter | same |
| d12 | berkshire-2020-shareholder-letter.pdf | letter | same |
| d13 | jpm-ceo-letter-2024.pdf | letter | jpmorganchase.com, downloaded 2026-09-21 |
| d14 | oaktree-on-bubble-watch.pdf | memo | oaktreecapital.com, downloaded 2026-09-21 |
| d15 | oaktree-nobody-knows-yet-again.pdf | memo | same |
| d16 | oaktree-gimme-credit.pdf | memo | same |
| d17 | oaktree-the-calculus-of-value.pdf | memo | same |
| d18 | oaktree-mr-market-miscalculates.pdf | memo | same |
| d19 | oaktree-2024-in-review.pdf | memo | same |
| d20 | oaktree-further-thoughts-on-sea-change.pdf | memo | same |

URLs, SHA-256, bytes, pages, columns, tables, producer, fonts: `manifest.json` and `catalog.json`.

### 1.2 The original eleven from 7 September

**All eleven were found.** They were still on disk at `scripts/diagnostic/extraction-check/inputs/` from the 2026-09-07 pass. They were never committed. `.gitignore` line 40 is `scripts/diagnostic/extraction-check/inputs/*.pdf`. Copied this pass to `scripts/diagnostic/delivery-check/b163/original-eleven/` (also gitignored). That is a finding about how evidence is kept: the binaries that sized three weeks of work existed only as untracked local files. The URLs in `scripts/diagnostic/extraction-check/REPORT.md` still resolve for the 3i files (re-download of d01 matched 388819 bytes).

Seven of the eleven are out of scope for the twenty under the 19 September ruling. Recorded in `catalog.json` `originalElevenAll`:

- `hpif-factsheet-march-2026.pdf`. Fact sheet.
- `hpif-annual-fs-2026.pdf`. Fund financial statements, tables-first.
- `3i-audited-fs-2025.pdf`. Audited financial statements, tables-first.
- `3i-ar-2025.pdf`. Full annual report, tables-first / mixed AR.
- `3i-fy25-presentation.pdf`. Results deck.
- `pg-annual-results-2024.pdf`. Results deck.
- `pg-ir-july-2025.pdf`. IR presentation pack.

The four that are in the twenty: d01, d02, d03, d04.

### 1.3 Manifest fields (every row)

CONFIRMED `manifest.json`. For each: file name, byte size, page count, hasColumns, hasTables, textLayer (real vs image), producer, creator, PDF version, font list, image paint-op count, SHA-256, encoded size, estimated request bytes, over-Vercel-by, over-client-by.

No file in the twenty is image-only. No file in the twenty exceeds the 4.5 MB Vercel body or the 4.2 MB client guard.

### 1.4 Ben's own work

Workspace GitHub trees only. No Ben-authored real source PDF. `scripts/diagnostic/delivery-check/b196-2026-09-18/Investor_letter_InvestorLetter_V1_20260918.pdf` is a product export of a reviewed synthetic Nordic SaaS draft, not a real source document. Personal Downloads were not searched.

---

## Part 2. Seven gates, twenty rows

The table is `gate-table.json` / `gate-table.csv`. Below: the rule for each gate, then the count, then the failures with verbatim error and elapsed time.

**Gate 1. Browser accepts the file.** All 20 pass. 0 ms. Source `<input type="file">` has no `accept` attribute. CONFIRMED frontend `src/layout/FocusLeftRail.jsx` L185-192 and `src/modules/assess/AssessModule.jsx` L455. PDF is treated as an office binary (`src/utils/officeSourceFormat.js` `OFFICE_EXT` includes `pdf`). Draft upload `accept` includes `.pdf` (`AssessModule.jsx` L566). Browser was not opened. This gate is the file picker and the type handler, not a layout check.

**Gate 2. Request reaches the server (4.5 MB body).** All 20 pass. Every file's estimated request is under 4,500,000. Largest in the twenty: d18 `oaktree-mr-market-miscalculates.pdf` estimated 2,148,544 bytes. Production `POST /api/extract-draft-text` returned HTTP 200 for 19 files. d13 reached the function and then died at the duration cap (Gate 4), which is not a body-limit miss. Verbatim production for d01: `HTTP 200` at 207727 ms, body 518514 bytes.

The original-eleven files that exceed 4.5 MB are not in the twenty. Their production POSTs are Part 4.

**Gate 3. Extractor is invoked.** All 20. Local path: `prepareUploadedSourcesForPipeline` -> `extractTextFromSource` (`lib/extract-text-from-source.mjs` L653-655). Production path: `api/extract-draft-text.js` L28-37 calls the same function. Every production POST that was not 413 invoked it. d13 invoked it and ran 301388 ms before the connection dropped.

**Gate 4. Extraction completes inside the time available.** 19 of 20 on production. Cap is 300000 ms (`vercel.json` `maxDuration: 300`; `EXTRACTION_TIMEOUT_MS = 300_000` in `lib/extract-text-from-source.mjs` L39-40).

The one production failure, verbatim:

- d13 `jpm-ceo-letter-2024.pdf`. Production `extract-draft-text`: `httpStatus=null` `networkError.message="fetch failed"` `elapsedMs=301388`. Local extract of the same file: status `ok`, 220611 chars, **342563 ms**. Local wall is above the 300 s function cap because each officeparser convert has its own 300 s race (`extract-text-from-source.mjs` L306-340: text convert, then chunks convert). Production killed the function. The client saw no JSON body.

The 389 KB press release that timed out at 60 s on 7 September (d01) now finishes on production: HTTP 200, 156041 chars, **207727 ms**.

**Gate 5. Text comes back non-empty.** 19 of 20 on production (d13 empty because Gate 4 died). 20 of 20 locally, including d13.

**Gate 6. Text is usable prose rather than mangled output.** Not a binary pass. Counts and quotes are Part 5. Letters and Oaktree memos come out as English paragraphs with line-wrap. d03 (Workiva two-column AR chapter) interleaves the Chair's statement across the gutter. d04 (HPIF report) letter-spaces headings and interleaves three attribute columns. d07 splits Swiss thousands-separators (`CHF 2 ’ 563`). Berkshire d10-d12 lead with a flattened performance table of dots.

**Gate 7. A review runs and produces at least one verdict backed by a real quoted passage.** 19 of 20. Evidence-only production `analyse-statements`, pipeline v4. Source was the extract as inline text with a name that does not end `.pdf` (see Part 4). Short draft taken from the extract.

d07 did not produce a quoted verdict. Verbatim: HTTP 200 `ok=true` cards=1 evidence `{confirmed:0, partial:0, conflicting:0, notSupported:1}` draft `"Press release Baar-Zug, Switzerland; 10 March 2026 | Ad hoc announcement pursuant to Art."` elapsedMs=2044 trace `622cd954-cba3-4237-8ff3-911e3148a32b`. The draft picker cut at `Art.` The extract itself contains the full line.

The thirteen that a reader could trust, operationally: extract completed on production, Gate 7 returned a quoted `supported_full` (or a quoted conflict on a real sentence, not a spliced column), and the quoted passage is contiguous prose rather than a flattened table or gutter-interleave. That set is d01, d02, d05, d06, d08, d09, d14, d15, d16, d17, d18, d19, d20.

The seven that do not:

- d03. Quote is a glossary footer line. The extract interleaves the Chair's statement (Part 5).
- d04. Gate 7 returned `conflict` on a three-column splice. Quote begins `Seeking cost-effective private Exposure to fast growing, Private markets portfolio`.
- d07. `notSupported`. No quote.
- d10, d11, d12. Gate 7 quoted the flattened Berkshire-vs-S&P table of dots, not a letter sentence.
- d13. Local extract is usable and Gate 7 quoted `$180.6 billion`. Production extract of the PDF did not finish. A user who uploads this file does not get that review.

### Per-file production extract timings (Gate 4)

From `production-gates.json`. Local times in `manifest.json`.

| id | pages | bytes | local ms | production ms | production result |
|----|------:|------:|---------:|--------------:|-------------------|
| d01 | 56 | 388819 | 203723 | 207727 | HTTP 200, 156041 chars |
| d02 | 3 | 137825 | 45377 | 48371 | HTTP 200, 6777 chars |
| d03 | 17 | 1075726 | 161070 | 174747 | HTTP 200, 53610 chars |
| d04 | 10 | 403362 | 70710 | 74596 | HTTP 200, 29129 chars |
| d05 | 4 | 182527 | 51410 | 54720 | HTTP 200, 12298 chars |
| d06 | 2 | 66508 | 8157 | 10598 | HTTP 200, 7486 chars |
| d07 | 4 | 348219 | 64478 | 66804 | HTTP 200, 9743 chars |
| d08 | 15 | 64860 | 38370 | 41405 | HTTP 200, 40118 chars |
| d09 | 16 | 122415 | 44474 | 47882 | HTTP 200, 50117 chars |
| d10 | 10 | 55589 | 29293 | 32041 | HTTP 200, 30964 chars |
| d11 | 11 | 64117 | 31416 | 32234 | HTTP 200, 40913 chars |
| d12 | 14 | 78896 | 38442 | 41045 | HTTP 200, 53357 chars |
| d13 | 58 | 900121 | 342563 | 301388 | `fetch failed`, 0 chars |
| d14 | 10 | 319067 | 53720 | 57956 | HTTP 200, 30698 chars |
| d15 | 9 | 273317 | 48643 | 53111 | HTTP 200, 29977 chars |
| d16 | 8 | 275824 | 54612 | 58924 | HTTP 200, 25380 chars |
| d17 | 11 | 293909 | 60711 | 64555 | HTTP 200, 37068 chars |
| d18 | 9 | 1605262 | 51863 | 57683 | HTTP 200, 22981 chars |
| d19 | 9 | 966662 | 42615 | 46714 | HTTP 200, 31988 chars |
| d20 | 9 | 995419 | 67747 | 72388 | HTTP 200, 30537 chars |

---

## Part 3. What actually predicts failure

Byte size is not the predictor. CONFIRMED by pairing:

- d01: 388819 bytes, 56 pages, production extract 207727 ms, ok.
- d07: 348219 bytes (same order of magnitude), 4 pages, 66804 ms, ok.
- d18: 1605262 bytes (four times d01), 9 pages, 57683 ms, ok.
- d13: 900121 bytes (between d01 and d18), 58 pages, production `fetch failed` at 301388 ms.

Page count tracks extract wall time in this set. The two 50-plus-page files are the two slowest (d01 56 pages 208 s; d13 58 pages 343 s local / killed at 301 s). Nine-page Oaktree memos cluster 42-72 s regardless of whether they are 273 KB or 1.6 MB.

Generator software in this set:

- d01 and d03: Workiva / Wdesk. 56 and 17 pages. 208 s and 175 s.
- d13: Adobe InDesign 19.5 / Adobe PDF Library 17.0. 58 pages. Killed.
- Oaktree memos: Acrobat PDFMaker for Word. 8-11 pages. 46-72 s.
- Berkshire letters: Acrobat Distiller 8.1.0. 10-16 pages. 32-48 s.
- d02, d05, d07: Microsoft Word. 2-4 pages. 11-67 s.

Column-page count from pdfjs x-clustering: d01 26 column pages, d13 29, d03 7. Those three are the slow extracts. d15-d20 report `hasColumns: false` and finish under 73 s.

Image paint-ops do not separate success from failure. d01 has 2 image ops and takes 208 s. d18 has 14 and takes 58 s. d13 has 1 and is killed. Text layer is real on all twenty, so "image layer present" is not the split.

What this set does not capture: per-page operator complexity, embedded font subset size, optional-content groups, or officeparser's own per-page timing. Those were not in the 7 September manifest either. A later pass that logged officeparser per-page milliseconds against page object count would be able to say whether Workiva's 56 pages are slow because they are 56 pages or because each page is expensive.

The original 389 KB timeout was d01: 56 Workiva pages, not 389 KB. The 7 September 60 s `maxDuration` cut it off. The 300 s cap lets it finish. d13 is the same shape with two more pages and it still does not finish.

---

## Part 4. The four that never arrived

The 7 September scoreboard: 7 of 11 reach the extractor, so 4 never arrive. Those four, from `scripts/diagnostic/extraction-check/REPORT.md` L122-132, are the B79 / F20 upload-cap fails:

| file | raw bytes | estimated request | over 4.5 MB by | over 4.2 MB client by |
|------|----------:|------------------:|---------------:|----------------------:|
| pg-annual-results-2024.pdf | 3271467 | 4370148 | 0 | 170148 |
| 3i-fy25-presentation.pdf | 3823221 | 5105820 | 605820 | 905820 |
| pg-ir-july-2025.pdf | 5264862 | 7028008 | 2528008 | 2828008 |
| 3i-ar-2025.pdf | 13340091 | 17794980 | 13294980 | 13594980 |

Production POSTs of those four to `/api/extract-draft-text` this pass (`body-probes.json`):

1. `pg-annual-results-2024.pdf`. Estimated request 4,370,148. Under Vercel 4,500,000. `httpStatus=null` `networkError.message="This operation was aborted"` at 30011 ms (probe timeout). Not a 413. The body was accepted and the function was running.
2. `3i-fy25-presentation.pdf`. HTTP **413**. Body preview, verbatim: `Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nsin1::6qlmc-1789962670944-2ef77fc32d04\n`. 547 ms.
3. `pg-ir-july-2025.pdf`. HTTP **413**. Verbatim: `Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nsin1::gr9b2-1789962671505-55c6d4e923dc\n`. 611 ms.
4. `3i-ar-2025.pdf`. HTTP **413**. Verbatim: `Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\nsin1::pbkh6-1789962672109-ac995f9c2a74\n`. 822 ms.

Named cause for three of the four: Vercel edge body limit, `FUNCTION_PAYLOAD_TOO_LARGE`. Named cause for `pg-annual-results-2024.pdf`: it never reached the extractor in the 7 September count because the **client** guard is 4,200,000 (`MAX_REQUEST_BYTES` in frontend `src/utils/sourceRequestBudget.js` L14). The platform 4.5 MB line would have let it in.

### Exact lines, and whether the user is told

**Add-source, Assess.** `checkAddingSource` refuses before the file is appended. CONFIRMED `src/hooks/useAssessState.jsx` L1003-1006: `if (!check.ok) { if (!refusedMessage) refusedMessage = check.message; continue; }` then `setSourceUploadError(refusedMessage)` at L1044. The copy is rendered under Upload in rose (`AssessModule.jsx` L452-454). Message shape: `{name} is {n.n MB}. Sources must total under about 3 MB. Try a smaller export of the document, or split it into parts.` CONFIRMED `sourceRequestBudget.js` L173-176, L42. The user is told. The file is not added. The extractor is not called.

**Add-source, drafting rail.** Same check, `showToast(sizeCheck.message)` at `useDraftState.jsx` L412-415. The user is told.

**If the client guard is bypassed** (direct POST, as this diagnostic did): three files return HTTP 413 with `FUNCTION_PAYLOAD_TOO_LARGE`. In a browser fetch from the frontend origin, B79 still holds: the edge 413 does not set CORS, so the app sees `TypeError` `"Load failed"` / `"Failed to fetch"`. CONFIRMED comment at `sourceRequestBudget.js` L3-7. `resolveSizeAwareError` remaps that TypeError to the size copy only when estimated bytes > 3,000,000 (`NETWORK_SIZE_HINT_BYTES`, L25-28 and L273-280). All four of these files are above that hint, so a CORS-masked 413 would still be named as a size failure. The user is told, with the size copy, not with `FUNCTION_PAYLOAD_TOO_LARGE`.

**The original diagnostic never POSTed.** It computed `wouldReachExtractor` from encoded size vs 4,200,000 (`run-extraction-check.mjs` L41-44, L66-84). That is why the four "never arrived" without a verbatim network error in the 7 September report.

### A second vanish, not in the original four, recorded because it is the worst form of B164

`api/analyse-statements.js` calls `prepareUploadedSourcesForPipeline` at L172 and does not read `prep.error`. Grep of that file for `prep.error`: no matches. On `extraction_timeout` or `PDF_INLINE_TEXT_NOT_ALLOWED` the handler maps missing rows to empty text (L173-184), then `splitSourcesForResponse` drops them as `empty_after_extraction` (`lib/response-sources.mjs` L33-41). Review continues. The user sees F13 copy "No readable text could be extracted" (`frontend/src/utils/excludedSourceReason.js` L6) after the run, not the timeout code and not `PDF_INLINE_TEXT_NOT_ALLOWED`.

`api/extract-draft-text.js` L38-39 returns `{ ok: true, text: extractedText || "" }` and does not read `prepared.error`. A timeout or reject becomes empty text with HTTP 200. Draft upload then toasts "Could not extract text from draft file." (`useAssessState.jsx` L1070-1072) if the function returns. If the function is killed at 300 s, fetch throws. For a file under 3 MB (d13 is 900 KB) `resolveSizeAwareError` does not remap. The toast is `err.message` or "Could not process draft upload." Verbatim this pass: `fetch failed`.

`api/summarize-source.js` L123-124: `catch { return res.status(200).json(EMPTY_RESPONSE); }`. Extract failure at upload-summarise time is HTTP 200 with empty description. The file stays in the list. No error.

This pass also reproduced the 19 September empty-source drop: a Review whose source `name` ends `.pdf` while the payload is inline extract text is rejected as a PDF presented without `contentBase64` (`isPdfSource` L390-395, `PDF_INLINE_TEXT_NOT_ALLOWED` L571-578). `analyse-statements` ignores that error. Sixteen such POSTs this pass dropped every source as `empty_after_extraction`. Artefacts: `reviews/pdf-label-drop/*-review-extract.json`. The user is told "No readable text could be extracted" after Review. The file appeared in the request. The extractor never ran on those bytes. B164 surfaces `sourceIngestionWarning` only when extract text is very low (`extract-text-from-source.mjs` L699-701). Timeouts, 413s, and `PDF_INLINE_TEXT_NOT_ALLOWED` never set it. B164 is shipped and does not speak in these cases.

d13 on the live extract path is this vanish at the 300 s kill: no JSON, `fetch failed`, nothing at the user that says the extractor ran out of time.

---

## Part 5. What extraction does to the text

Counts are on the pipeline output after `normalisePdfExtractedText` (`lib/extract-text-from-source.mjs` L68-80), which already maps `ﬁ`/`ﬂ` and joins `word-\nword`. Per-doc machine counts: `inspect-extract-full.json` `defects`. Totals below are summed across the twenty extracts. Three quoted examples per class that fired. Classes that fired zero times are reported as zero.

### Curly apostrophes or quotes turned into other characters

**Apostrophe-to-` n ` / C1 / U+FFFD mangle: 0 of 20 extracts.** The B258 `Shopify n s` pattern is absent from this corpus. Remaining curly quotes survived. d01 still has 235 curly quote codepoints. d08 Berkshire 2024 still has `“praise by name, criticize by category.”`

A different split appeared in d07 only: Swiss thousands-separators with spaces around the quote.

1. `• Revenues increased by 20% to CHF 2 ’ 563 million` (`pg-annual-results-2025-press-release.txt` L6). The PDF figure is CHF 2'563 million.
2. `Management fees 3 1 ’ 744 1’625 7%` (same file L16).
3. `with around 2 ’ 000` (same file L131).

Straight ASCII quotes in the twenty: present in small numbers (d01 has 6). Not a substitution of curly into `n`.

### Ligatures

**0** remaining U+FB00-U+FB06 in the twenty extracts. The pipeline replaces `ﬁ` and `ﬂ` before the text is stored. No examples.

### Hard line breaks inside a sentence

Sum of regex hits `([a-z,;:])\n([a-z])` across twenty extracts: **5195**. Every document has them. They are PDF visual wraps. Three examples:

1. d01 L3-4: `3i Group plc announces results for the year` / `to 31 March 2025`
2. d01 L7-8: `NAV per` / `share of 2,542 pence`
3. d08 L3-4: `This letter comes to you as part of Berkshire’s annual report . As a public company, we` / `are required to periodically tell you many specific facts and figures.`

### Words hyphenated across a line ending

**0** remaining `word-\nword` in the twenty extracts. `normalisePdfExtractedText` L73 already joins `([a-zA-Z])-\s*\n\s*([a-zA-Z])`. No examples in the text the pipeline sees. Raw officeparser output before that join was not saved.

### Repeated headers and footers in the flow

Machine count of lines that repeat at least three times, summed: **349** line-occurrences. Three examples:

1. d03: `"Overview and strategy Contents Previouschapter N extchapter" x8` and the spaced variant `"Previous chapter Next chapter" x8`. Also `3i Group plc | Annual report and accounts 2025 {n}` on each page (extract L25, L82, L132, ...).
2. d01: `"2025 2024" x20`, `"for the year to 31 March" x8`.
3. d14 L39 and later pages: `© 2025 Oaktree Capital Management, L.P. All Rights Reserved` / `Follow us:`.

### Page numbers in the flow

Lone 1-3 digit lines, summed: **185**. Three examples:

1. d01: `1` after the CEO quote, before `Financial highlights`; `2` after `ENDS`; `3` before `Chair’s statement`.
2. d04 L50: a lone `1` between the GICS footnote and the next image.
3. d13 L21: `2 2 INTRODUCTION` in the flow of the letter.

### Reading order wrong on a multi-column page

Not a regex. Observed in extracts of files with `hasColumns: true`. Three examples:

1. d03 L31-38, Chair's statement interleaved with the adjacent column: `"I am pleased to report that 3i FY2025 marks another strong year for 3i` / `delivered another strong set of and is our fifth consecutive year of annual` / `results in the financial year to 31` / `returns exceeding 20%.`
2. d04 L16-22, three attribute columns on one page become: `Direct deal flow alongside Focus on small and middle Diversified seed portfolio` then `experienced managers market private companies from a US institutional`.
3. d04 L14, tracking-out heading: `In ve s tm e n t o b je c tive : S e e k to g e n e ra te c a p ita l g ro wth o ve r th e lo n g -te rm .`

Oaktree memos and Berkshire letter bodies in this set read left-to-right as single columns.

### A table flattened into prose

Machine count of lines with five or more number tokens: **386**. Three examples:

1. d04 L59-61, HPIF returns grid: `A Apr 2025 10.15 -1.09% -2.45% -2.45% 3.35% 3.35%` with headers wrapped as `Share Class Share class NAV Annualized` / `inception per Share 1M 3M YTD 2 1YR Since` / `Inception`. Class A 1YR and since-inception are the same `3.35%`. The monthly grid then detaches the class letter (L62-67: `2025 ... 5.95%` then `A` then `2026 ...`).
2. d10 / d11 / d12 opening table, quoted by Gate 7: `Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . 49.5 10.0`
3. d07 L13-24: `Revenues 2 2’563 2’136 20%` then `Management fees 3 1 ’ 744 1’625 7%` as stacked labelled rows. Usable if the label stays on the row. The spaced `1 ’ 744` is not.

B258 sizing: the curly-to-`n` mangle did not appear on these twenty files. What did appear, in count order: hard line wraps (5195), flattened number-rows (386), repeated headers (349), page numbers (185), column interleave on the Workiva AR chapter and the HPIF report, Swiss-quote spacing on one press release. Ligatures 0 after the existing normaliser. Hyphen-join 0 after the existing normaliser.

---

## Part 6. Time and money

### 6.1 Extract time vs the 300 s function cap

Production `extract-draft-text` wall times are in the Part 2 table. 19 of 20 finished inside 300 s. The slowest success is d01 at 207727 ms (69% of the cap). d03 is 174747 ms. Everything else in the twenty is under 75 s. d13 is 301388 ms with `fetch failed` and 342563 ms locally. Two officeparser converts can each run to 300 s, so local wall can exceed the function cap even when neither convert times out (`extract-text-from-source.mjs` L325-340).

### 6.2 What a review of each would cost (B277 figures)

B277 measured, discounted: 150 words USD 0.39, 500 words USD 1.33, 1500 words USD 3.78, 3698 words USD 13.03. List: 0.42 / 1.73 / 4.80 / 16.44. Interpolation is piecewise linear on those four points, in `gate-table.json` `b277FullReviewCost`. This is the cost of reviewing the **document as the draft**, not the short Gate 7 drafts actually run.

| id | extract words | band | discounted USD | list USD |
|----|--------------:|------|---------------:|---------:|
| d06 | 1180 | 500-1500 | 3.00 | 3.82 |
| d02 | 1087 | 500-1500 | 2.77 | 3.53 |
| d07 | 1537 | 1500-3700 | 3.94 | 5.00 |
| d05 | 2026 | 1500-3700 | 6.00 | 7.59 |
| d18 | 3815 | above 3700 | (ceiling) | (ceiling) |
| d16 | 4245 | above 3700 | | |
| d04 | 4306 | above 3700 | | |
| d15 | 5031 | above 3700 | | |
| d20 | 5077 | above 3700 | | |
| d19 | 5105 | above 3700 | | |
| d14 | 5200 | above 3700 | | |
| d17 | 6196 | above 3700 | | |
| d03 | 8044 | above 3700 | | |
| d10 | 8089 | above 3700 | | |
| d08 | 8933 | above 3700 | | |
| d11 | 9855 | above 3700 | | |
| d09 | 11423 | above 3700 | | |
| d12 | 11860 | above 3700 | | |
| d01 | 24473 | above 3700 | | |
| d13 | 36853 | above 3700 | | |

Above-ceiling cells are not a number. B277 run 4 at 3698 words was USD 13.0325 discounted / 16.4437 list and still lost 1 compliance check.

Gate 7 this pass used short drafts against the extract as source, evidence-only. Actual billed: USD 1.9172 list / 1.8140 discounted, 88 calls, 20 reviews. Plus the PDF-label-drop pass USD 0.0943 list / 0.0892 discounted, 37 calls, 16 reviews. Combined USD 2.0115 list / 1.9032 discounted, 125 calls.

### 6.3 Longer than about 3,700 words

**16 of 20.** Only d02 (1087), d05 (2026), d06 (1180), d07 (1537) sit under the measured honest ceiling. d18 is 3815, just over. d01 is 24473. d13 is 36853.

---

## Browser

Skipped. No product UI was changed. Gate 1 is the file input and the MIME handler, confirmed in code. Gates 2-7 were production HTTP against `https://brightline-content-engine-backend.vercel.app`. Header-pill v4 was confirmed on every Gate 7 payload (`pipelineVersion: "v4"` on all 20 `*-review-extract.json` files).

---

## Cost report

| pass | calls | list USD | discounted USD | source |
|------|------:|---------:|---------------:|--------|
| Gate 7 evidence-only, 20 reviews, extract as inline text | 88 | 1.9172 | 1.8140 | `meta.llmSpend` on `reviews/d01`..`d20-review-extract.json`. Discount = list minus cachedInputTokens 82560 * 1.25/1e6 |
| PDF-label-drop, 16 reviews, source name ended `.pdf` | 37 | 0.0943 | 0.0892 | `reviews/pdf-label-drop/*-review-extract.json`. cachedInputTokens 4096 |
| Production extract-draft-text, 20 files plus 4 body probes | 0 | 0 | 0 | no LLM |
| **Total** | **125** | **2.0115** | **1.9032** | |

Unpriced: none of the billed reviews. Extract-only POSTs have no `llmSpend` and are not LLM.
