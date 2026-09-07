# Extraction check

No LLM calls. Production extractor only.

## Scoreboard

**What "repair-norm" measured:** not "how much of a PDF is readable." It measured whether six specific sentences from a Shopify IC memo could still be found as substrings inside extracted text after a punctuation-and-whitespace repair. The 41.7% figure is **10 of 24 probes**, from **4 PDFs times 6 sentences**. Two of those four PDFs are tiny stubs that do not contain the sentences. CONFIRMED: `docs/R7_EXTRACTOR_SURVEY.md` lines 55-61; probe list in `scripts/diagnostic/r7-offset-extraction.mjs` lines 57-82; per-file matrix in `docs/R7_OFFSET_EXTRACTION_DIAGNOSTIC.md` section 2.

**Part B headlines:** **7 of 11** would reach the extractor in production (pass B79 and `MAX_PDF_MB`). **1 of 11** produced evidence I would put a numeric verdict on in the live product. CONFIRMED: `outputs/summary.json`.

---

## Part A. What we already know

### 1. What did the survey measure? What is repair-norm?

CONFIRMED from `docs/R7_EXTRACTOR_SURVEY.md`, `docs/R7_OFFSET_EXTRACTION_DIAGNOSTIC.md`, and `scripts/diagnostic/r7-offset-extraction.mjs`.

The survey compared extractors by asking: after extraction, can a known probe sentence be **located** in the extracted string?

Three locate rules, applied by code, not by a human rater:

- **EXACT:** the probe is a literal substring of the extract.
- **WS-NORM:** collapse whitespace runs to one space, then substring. Catches line-wrap.
- **REPAIR-NORM:** also fold curly quotes to ASCII, en/em dashes to hyphen, and map a "display as box" punctuation class (C1 controls, replacement character, ASCII apostrophe and hyphen) to a placeholder on both the extract and the probe, then whitespace-collapse, then substring. Defined in `scripts/diagnostic/r7-offset-extraction.mjs` lines 84-123. It does **not** map the letter `n`. That exclusion is explicit: the messy Shopify PDF turned apostrophes into the letter `n`, and mapping `n` would destroy ordinary English.

"Needing repair" means the exact string was gone but a punctuation/whitespace fold still found it. Who judged: the locate script. Baseline: the then-live extractor in `lib/extract-text-from-source.mjs` (pdf-parse + mammoth + jszip), labelled "current" in the survey (`docs/R7_EXTRACTOR_SURVEY.md` line 90). Candidates: officeparser 7.5.1, unpdf, mammoth, xlsx. Scope: born-digital, OCR off.

It is a **highlight/locate** metric for the Sources drawer, not a table-fidelity metric and not a "would I trust a verdict" metric.

### 2. What were the 24?

Not 24 documents.

**4 PDFs x 6 probes = 24.** CONFIRMED `docs/R7_EXTRACTOR_SURVEY.md` line 55.

The six probes (P1 to P6) are sentences from the 2010 Bessemer Shopify memo (`scripts/diagnostic/r7-offset-extraction.mjs` lines 57-82): $7mm Series A, MRR $164K to $438K, 24 employees in Ottawa, $175-225 CAC, $20mm pre-money, 66% using a third-party app.

The four PDFs, still on disk under `scripts/diagnostic/r7-samples/`:

| File | Size on disk | What it actually is |
|------|----------------|---------------------|
| `B1_shopify_source_1_7m.pdf` | 1,653 bytes | One-line stub. Old extractor: "bad XRef", zero text. |
| `B2_shopify_source_2_5m_conflict.pdf` | 1,763 bytes | Short $5m-conflict stub. Does not contain P1 to P6. |
| `Shopify_text_longform_clean.pdf` | 17,535 bytes | The Shopify memo, relatively clean text layer. |
| `Shopify_text_longform_messy.pdf` | 20,876 bytes | Same memo with a corrupted text layer (apostrophe became `n`). |

Reconciling 10/24 from the offset diagnostic matrix (section 2), which used the old extractor: B1 contributes 0/6 (extract fail). B2 contributes 0/6 (wrong document). Clean memo 6/6. Messy memo 4/6 (P3 and P4 fail because punctuation became `n`). 0+0+6+4 = 10. CONFIRMED.

Genre: synthetic Shopify IC-memo tests and two stubs. They resemble an investment memo in **prose**, not a listed firm's annual report, not a fact sheet, not a press-release PDF, not a financial-statement table.

The survey also used a separate **controlled corpus** of 8 tiny files in `tests/extraction-corpus/files/` (native_clean, native_typography, multicolumn, multipage, image_only, memo.docx, deck.pptx, model.xlsx). Those are Vantor Systems probes, a few kilobytes each. They are not the 24.

### 3. Are the files still on disk?

Yes.

- Real-file set: `scripts/diagnostic/r7-samples/` (9 files: 4 PDF, 3 DOCX, 1 PPTX, 1 XLSX).
- Controlled corpus: `tests/extraction-corpus/files/`.
- The isolated survey install `scripts/diagnostic/extractor-survey/` is gitignored and not present in this workspace.

### 4. What did it conclude, and what changed?

Officeparser was chosen **because of** the survey, **despite** the 41.7% real-PDF locate score being a three-way tie with "current" and unpdf (`docs/R7_EXTRACTOR_SURVEY.md` lines 55-61, 159-166).

What the survey actually bought, per its own conclusion:

- Unicode fidelity on the controlled typography PDF (old stack MANGLED; officeparser FAITHFUL).
- Recovery of bad-XRef PDFs the old stack failed (B1).
- Multi-column reading order on the **synthetic** `multicolumn.pdf` (left then right).
- Page / slide / sheet names on chunks.

What it did not buy: a better locate rate on the four real PDFs (tie at 10/24). Residual gap called out in the same conclusion: corrupt text layers (`Shopifyns`) are not fixed by any library.

Shipped as tag `extractor-officeparser-swap` (`docs/ROADMAP.md` Extractor swap). Follow-on: Build B repair-normalised offsets (`r7-build-b`), not a table extractor. Structure metadata is still unused by Stage 2 (`lib/extract-text-from-source.mjs` line 264).

### 5. Tables, multi-column, footnotes, headers?

- **Tables:** only as Excel. `model.xlsx` sheet/cell identity. officeparser reports sheet name, not A1. No PDF performance table was in the survey. CONFIRMED `docs/R7_EXTRACTOR_SURVEY.md` lines 94-102, 165.
- **Multi-column:** one synthetic 2,157-byte PDF. officeparser: left then right, probes found under ws-norm. Old stack: garbled. CONFIRMED lines 145-148. No real two-column annual-report page.
- **Footnotes:** not tested.
- **Running headers and footers:** not tested.

### Does Part A make Part B unnecessary?

No. The 41.7% number is easy to misread as "six in ten real reporting PDFs extract badly." It does not say that. It also does not answer table fidelity, footnotes, or headers on the documents Ben actually uploads. Those questions still need a genre-matched set.

---

## Part B. Genre-matched public test set

**Status:** run 2026-09-07. Eleven public PDFs in `scripts/diagnostic/extraction-check/inputs/` (gitignored binaries; URLs below). Production path: `prepareUploadedSourcesForPipeline` -> `extractTextFromSource`, OCR off. Then `computeGuardrailForSource`, which production never calls. Machine rows: `outputs/summary.json`.

Ceilings used (CONFIRMED in code, not guessed):

- **B79 / F20 upload body cap.** Client guard `MAX_REQUEST_BYTES = 4_200_000` with `REQUEST_JSON_OVERHEAD_BYTES = 8_192`. Encoded size is actual `contentBase64.length`. Pass if `encoded + 8192 <= 4_200_000`. Effective raw ceiling `3_143_856` bytes. Source: frontend `src/utils/sourceRequestBudget.js`. Vercel edge is 4.5 MB; the shipped guard is 4.2 MB. Local `vercel dev` does not enforce this (`P14`).
- **`MAX_PDF_MB` default 10.** `MAX_PDF_BYTES = 10_485_760`. Source: `lib/extract-text-from-source.mjs` lines 35-37. Checked inside `prepareUploadedSourcesForPipeline` after the request has already arrived.
- Related, not a third official ceiling: `vercel.json` `maxDuration: 60` for `api/*.js`, and `EXTRACTION_TIMEOUT_MS = 60_000` per officeparser convert. Extraction runs **two** converts (text, then chunks). Wall clock can exceed 60s even when status is `ok`.

### Corpus (downloaded this pass)

| Save as | Shape | URL |
|---------|-------|-----|
| `pg-annual-results-2024.pdf` | Listed PE results deck | `https://www.partnersgroup.com/~/media/Files/P/Partnersgroup/Universal/shareholders/reports-and-presentations/2025/annual-results-2024-presentation.pdf` |
| `pg-ir-july-2025.pdf` | Longer IR pack | `https://www.partnersgroup.com/~/media/Files/P/Partnersgroup/Universal/shareholders/reports-and-presentations/2025/partners-group-ir-presentation-july-2025.pdf` |
| `3i-fy25-presentation.pdf` | Listed PE results deck | `https://www.3i.com/media/vl1d3svk/3igroupfy25-presentation.pdf` |
| `3i-overview-and-strategy-2025.pdf` | AR chapter, two-column candidate | `https://www.3i.com/media/kvkhybyl/3i-group-2025-overview-and-strategy.pdf` |
| `hpif-factsheet-march-2026.pdf` | Fund fact sheet, returns table | `https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF-Factsheet-March-2026.pdf` |
| `hpif-report-march-2026.pdf` | Shareholder report | `https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF%20Report%20-%20March%202026.pdf` |
| `hpif-annual-fs-2026.pdf` | Fund FS, footnotes | `https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF-Annual-Financial-Statements-March-31-2026.pdf` |
| `3i-audited-fs-2025.pdf` | Listed-firm audited FS | `https://www.3i.com/media/u3ojrc3a/3i-group-2025-audited-financial-statements.pdf` |
| `3i-press-release-fy2025.pdf` | Full results press release | `https://www.3i.com/media/o13kcz40/3i-group-press-release-fy2025.pdf` |
| `3i-press-release-fy25-highlights.pdf` | Short PR, highlights table | `https://www.3i.com/media/trxnuzha/3i-group-press-release-fy25-highlights.pdf` |
| `3i-ar-2025.pdf` | Full annual report, over 10 MB on purpose | `https://www.3i.com/media/cxwbwcdw/3i-group-annual-report-2025-interactive.pdf` |

### Ceilings then extraction (all 11)

All figures CONFIRMED `outputs/summary.json`. Encoded size is actual base64 length. `reach` = pass B79 and pass `MAX_PDF_MB`. Guardrail is `n/a` when extract did not return text.

| File | raw bytes | encoded | est. request | B79 | MAX_PDF_MB | reach | extract | chars | elapsed ms | guardrail | sourceIngestionWarning | totalTextLowWarning |
|------|-----------|---------|--------------|-----|------------|-------|---------|-------|------------|-----------|------------------------|---------------------|
| `3i-ar-2025.pdf` | 13,340,091 | 17,786,788 | 17,794,980 | fail | fail | no | error `pdf_too_large` | 0 | 4 | n/a | none | false |
| `3i-audited-fs-2025.pdf` | 1,233,227 | 1,644,304 | 1,652,496 | pass | pass | yes | timeout | 0 | 60,042 | n/a | none | false |
| `3i-fy25-presentation.pdf` | 3,823,221 | 5,097,628 | 5,105,820 | fail | pass | no | ok (local only) | 25,046 | 103,163 | OK | none | false |
| `3i-overview-and-strategy-2025.pdf` | 1,075,726 | 1,434,304 | 1,442,496 | pass | pass | yes | timeout | 0 | 60,000 | n/a | none | false |
| `3i-press-release-fy2025.pdf` | 388,819 | 518,428 | 526,620 | pass | pass | yes | timeout | 0 | 60,003 | n/a | none | false |
| `3i-press-release-fy25-highlights.pdf` | 137,825 | 183,768 | 191,960 | pass | pass | yes | ok | 6,777 | 45,373 | OK | none | false |
| `hpif-annual-fs-2026.pdf` | 197,274 | 263,032 | 271,224 | pass | pass | yes | ok | 95,327 | 99,095 | OK | none | false |
| `hpif-factsheet-march-2026.pdf` | 389,464 | 519,288 | 527,480 | pass | pass | yes | ok | 13,892 | 32,454 | OK | none | false |
| `hpif-report-march-2026.pdf` | 403,362 | 537,816 | 546,008 | pass | pass | yes | ok | 29,129 | 70,705 | OK | none | false |
| `pg-annual-results-2024.pdf` | 3,271,467 | 4,361,956 | 4,370,148 | fail | pass | no | ok (local only) | 28,230 | 89,083 | OK | none | false |
| `pg-ir-july-2025.pdf` | 5,264,862 | 7,019,816 | 7,028,008 | fail | pass | no | timeout | 0 | 60,001 | n/a | none | false |

**7 reach. 4 blocked by B79. 1 blocked by `MAX_PDF_MB` (also blocked by B79).** Local extract returned text for 6 files; 4 timed out; 1 `pdf_too_large`. Of the 7 that would reach production, 3 timed out before any text, 2 of the remaining 4 took more than 60s wall clock locally (`hpif-annual-fs-2026` 99s, `hpif-report-march-2026` 71s) and would be killed by `maxDuration: 60`. Only **2 files** both reach and finished under 60s locally: `3i-press-release-fy25-highlights.pdf` (45s) and `hpif-factsheet-march-2026.pdf` (32s). CONFIRMED `outputs/summary.json` plus `vercel.json`.

### Per document

#### 1. `3i-ar-2025.pdf`

- Production: never leaves the browser (B79) and would also hit `pdf_too_large` if it did. CONFIRMED `errorCode: pdf_too_large` in 4ms.
- Table / columns / headers / footnotes: not extracted.
- First 400 characters: `(empty)`
- Verdict-willing: no.

#### 2. `3i-audited-fs-2025.pdf`

- Production: reaches the function, then `extraction_timeout` at 60s. 1.2 MB born-digital PDF. CONFIRMED.
- No text. Guardrail never ran.
- First 400 characters: `(empty)`
- Verdict-willing: no. The two-column / footnotes candidate never produced a string.

#### 3. `3i-fy25-presentation.pdf`

- Production: B79 fail (encoded 5,097,628 > 4,200,000). Local extract ok, 25,046 chars, guardrail OK. Wall clock 103s, so even without B79 Vercel would likely kill the request.
- Table fidelity: KPI tile slide is a loose stream. `outputs/3i-fy25-presentation.txt` lines 27-41: labels `Total return NAV Gross investment return` then later `25% 2,542p Cash invested Cash income`. 25% cannot be tied to total return versus GIR versus gearing without guessing. A later two-column year table is better: lines 424-430 `Gross investment return 5,113 4,059` under `2025 2024`. That table is usable **if** the file arrived.
- Reading order: slide 5 (lines 59-71) is a three-bullet column layout that interleaves across the gutter (`26% gross investment return` next to `£1.2bn of proprietary capital`). CONFIRMED.
- Headers/footers: page numbers as lone `3`, `4`, `5`, `26`. Image placeholders dominate the first pages.
- Footnotes: `NIR 1` and `97% 1` put the marker beside the figure, not inside the digits. Line 429 is a lone `1` under the GIR row.
- First 400 characters:
```
[Image: pdf_image_p1_1.bmp]
[Image: pdf_image_p1_2.bmp]
[Image: pdf_image_p1_3.bmp]
[Image: pdf_image_p1_4.bmp]
[Image: pdf_image_p1_5.bmp]
Results for the year to 31 March 2025
15 May 2025
[Image: pdf_image_p1_6.bmp]
[Image: pdf_image_p1_7.bmp]
[Image: pdf_image_p2_1.bmp]
Business review
Simon Borrows
Chief Executive
[Image: pdf_image_p3_1.bmp]
[Image: pdf_image_p3_2.bmp]
[Image: pdf_image_p3_3.b
```
- Verdict-willing in production: no (never uploads). Locally I would use the year-column GIR table, not the tile slide.

#### 4. `3i-overview-and-strategy-2025.pdf`

- Production: reaches, then timeout. The intended two-column annual-report page was never seen.
- First 400 characters: `(empty)`
- Verdict-willing: no.

#### 5. `3i-press-release-fy2025.pdf`

- Production: reaches (388 KB, encoded 518,428), then timeout at 60s. Same order of magnitude as the factsheet that finished in 32s. HYPOTHESIS: more pages or heavier image layer. CONFIRMED: timeout, no text.
- First 400 characters: `(empty)`
- Verdict-willing: no.

#### 6. `3i-press-release-fy25-highlights.pdf`

- Production: reaches and finished in 45s. 6,777 chars. Guardrail OK. `sourceIngestionWarning` none. `totalTextLowWarning` false.
- Table fidelity: **usable**. `outputs/3i-press-release-fy25-highlights.txt` lines 47-66:

```
Financial highlights
Year to/as at Year to/as at
31 March 31 March
2025 2024
Group
Total return £5,049m £3,839m
...
Diluted net asset value per ordinary share 2,542p 2,085p
```

`£5,049m` still sits on the Total return row with a 2025 column. This is the one table in the set I would put a verdict on.
- Reading order: single-column press release. No interleave observed. CONFIRMED.
- Headers/footers: standalone page numbers `1`, `2`, `3`. Not spliced into sentences.
- Footnotes: `Gearing 1 3 % 4 %` then `1 Gearing is net debt...`. Marker is on the row label, not inside `3`.
- First 400 characters:
```
[Image: pdf_image_p1_1.bmp]
15 May 2025
3i Group plc announces results for the year
to 31 March 2025
[Image: pdf_image_p1_2.bmp]
A year of consistently strong growth
• Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per
share of 2,542 pence (31 March 2024: 2,085 pence). This includes a 27 pence per share loss on foreign exchange
translation.
```
- Verdict-willing: **yes**, this file only, in production.

#### 7. `hpif-annual-fs-2026.pdf`

- Production: reaches on size. Local extract ok, 95,327 chars, guardrail OK, but 99s wall clock. Vercel `maxDuration: 60` would kill `analyse-statements` before the response. HYPOTHESIS on exact split of text vs chunks; CONFIRMED that local prepare took 99s.
- Table fidelity: financial highlights are labelled (`Total return2,3,4 7.11%`, `Net Asset Value per share, end of year 2 $ 10.52`). Schedule of investments keeps name, sector, date, cost, value on one line for many rows (`Carlyle Excelsior Coinvestment, L.P.* Information Technology - 4/1/2025 7,152,675 7,160,100`). When a Units column is a number instead of a dash, Cost/Value shift right (`Dodge Construction Network Holdings, L.P.8 Information Technology 4,548,024 4/1/2025 2,766,999 1,147,744`). Traceable if you know the schema; easy to mis-assign. CONFIRMED `outputs/hpif-annual-fs-2026.txt` lines 201-210, 491-492.
- Reading order: notes read as prose. No two-column interleave spotted in the sampled pages.
- Headers/footers: running title `HarbourVest Private Investments Fund` and page numbers (`8`, `3`) as their own lines between sections, not mid-sentence. CONFIRMED lines 221-225.
- Footnotes: `invested1`, `allocated2`, `Total return2,3,4`, partnership names with `*,4,5,6,7`. Markers sit on labels, not inside `675,431,734`.
- First 400 characters:
```
HarbourVest Private Investments Fund
Consolidated Financial Statements
For the Year Ended March 31, 2026
Annual Report
HarbourVest Private Investments Fund
Table of Contents
For the Year Ended March 31, 2026
Manager’s Discussion and Analysis of Fund Performance (Unaudited) . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .3 – 6
Report of Independent Registere
```
- Verdict-willing in production: no (time). Locally I would use the labelled highlights row, not a Units-shifted schedule line.

#### 8. `hpif-factsheet-march-2026.pdf`

- Production: reaches and finished in 32s. 13,892 chars. Guardrail OK. This is the file that answers the fact-sheet question.
- Table fidelity: **not safe for a period return.** `outputs/hpif-factsheet-march-2026.txt` lines 52-58:

```
Net performance & investment details 1
Share Class Share class NAV Annualized
inception per Share 1M 3M YTD 2 1YR Since
Inception
A Apr 2025 10.15 -1.09% -2.45% -2.45% 3.35% 3.35%
D Apr 2025 10.17 -1.03% -2.27% -2.27% 3.54% 3.54%
I Apr 2025 10.17 -1.03% -2.27% -2.27% 3.54% 3.54%
```

Class A 1YR and since-inception are both `3.35%`. Headers are wrapped (`YTD 2` is footnote 2 inside the column row). The monthly grid detaches the class letter onto its own line between years (lines 62-64: `2025 ... 5.95%` then `A` then `2026 ...`). KPI tiles on page 1 are a digit stream: `$161.0B 233 1,309 675+` then labels on the next lines.
- Reading order: page 1 attribute grid is three columns interleaved by line (`Direct deal flow alongside Focus on small and middle Diversified seed portfolio`). CONFIRMED lines 16-22. Decorative letter-spacing: `I n ve s t m e n t o b je c t ive` (line 14).
- Headers/footers: page number `1` as its own line (line 48). Running fund name repeats at page starts. Not mid-sentence in the sampled body.
- Footnotes: `About HarbourVest 1`, `Companies 2`, `YTD 2`, `Industry 4`. Beside labels, not inside `10.15`.
- First 400 characters:
```
[Image: pdf_image_p1_1.bmp]
[Image: pdf_image_p1_2.bmp]
HarbourVest Private Investments Fund
("HPIF")
March 2026 Factsheet
Unless otherwise stated, data is as of March 31, 2026
About HarbourVest 1
HarbourVest has a 40+ year track record of investing in private equity through a variety of private market cycles, seeking to
leverage its deep network of relationships, integrated investment strategy ap
```
- Verdict-willing: **no** for a returns-table figure. Maybe for "Class A NAV 10.15" if the draft used those words. That is not the test.

#### 9. `hpif-report-march-2026.pdf`

- Production: reaches on size. Local ok, 29,129 chars, 71s. Likely killed by `maxDuration: 60`.
- Table fidelity: same returns table as the factsheet (lines 55-61). Same judgement: not safe for 1YR versus since-inception.
- Prose is better: `HPIF Share Class I (USD) returned -2.27% (net) in Q1 2026` (line 110). That sentence is verdict-grade **if** the extract arrived.
- Reading order / footnotes / headers: same shapes as the factsheet on the table pages.
- First 400 characters:
```
[Image: pdf_image_p1_1.bmp]
[Image: pdf_image_p1_2.bmp]
HarbourVest Private Investments Fund
("HPIF")
March 2026 Report
Unless otherwise stated, data is as of March 31, 2026
About HarbourVest 1
HarbourVest has a 40+ year track record of investing in private equity through a variety of private market cycles, seeking to
leverage its deep network of relationships, integrated investment strategy appro
```
- Verdict-willing in production: no (time). Locally yes for that Q1 prose sentence, not for the table.

#### 10. `pg-annual-results-2024.pdf`

- Production: B79 fail (raw 3,271,467 > 3,143,856; encoded 4,361,956; est. request 4,370,148). Local ok, 28,230 chars, 89s, guardrail OK.
- Table fidelity: KPI tiles keep a label near a number (`Management fees` then `CHF 1'625m`). The three-column investments/exits/fundraising block is `$22 $18 $22` / `billion billion billion` under `41% 30% 22%` (lines 35-40). A number is near a story but column identity is weak.
- Reading order: exit case studies interleave name, value, and bullets around `[Image]` tags (lines 55-79). `EUR 6.7bn` sits next to `Undisclosed` and `MOIC 1`.
- Headers/footers: page numbers `2`, `3`, `4`. A footnote wraps across a page break into `future results` after an image (lines 47-52). That is spliced continuation, not a header dropped into a sentence.
- Footnotes: `LT 1`, `MOIC 1`, `investments 1`. Beside labels.
- First 400 characters:
```
Annual Results 2024
[Image: pdf_image_p1_1.bmp]
[Image: pdf_image_p1_2.bmp]
2
Our platform delivered strong operational and financial results in 2024
Management fees
▪ Grew 3% YoY, in line with AuM ; adversely impacted by FX
CHF 1'625m
▪ Recurring in nature with margins stability; LT 1 avg. 1.26%
1.25 % mgmt. fee margin
[Image: pdf_image_p2_1.bmp]
Performance fees
▪ Driven by Q4 exit activity and
```
- Verdict-willing in production: no (B79). Locally only for a labelled tile like management fees, not for the $22/$18/$22 row.

#### 11. `pg-ir-july-2025.pdf`

- Production: B79 fail and local timeout. 5.3 MB. Encoded 7,019,816.
- First 400 characters: `(empty)`
- Verdict-willing: no.

### Summary counts

- **Would reach the extractor in production (B79 and `MAX_PDF_MB`): 7 of 11.** CONFIRMED `summary.json` `wouldReachExtractor: 7`.
- **Would finish extraction inside the 60s function budget, among those 7: 2 of 11** (highlights 45s, factsheet 32s). Three of the seven timed out at 60s. Two more took 71s and 99s locally. CONFIRMED elapsedMs.
- **Evidence I would put a verdict on in the live product: 1 of 11** (`3i-press-release-fy25-highlights.pdf` financial highlights table). Not the HPIF returns table.
- **Unwired guardrail flagged: 0 of 6 extracts.** All six successes were `OK` with empty reasons. Timeouts and `pdf_too_large` never called it. `sourceIngestionWarning` never set. `totalTextLowWarning` never true. CONFIRMED `summary.json` `guardrailError: 0`, `guardrailWarn: 0`, `guardrailOk: 6`. Wiring the guardrail would not have told the user about any failure in this set.
- **Clean enough that current pipeline numbers would mean something: 1 of 11 in production** (the 3i highlights table). Locally, ignoring caps and time, maybe 3 (highlights table; HPIF FS `Total return 7.11%`; 3i presentation year-column GIR). KPI decks and the fact-sheet returns grid are not in that set.

### Failure shapes, ranked by frequency in this set of 11

1. **B79 upload cap (4 files).** The listed-PE decks a user would actually attach. CONFIRMED.
2. **Extractor timeout at 60s (4 files locally; 3 of those had passed both size caps).** Includes a 389 KB press release and a 1.2 MB audited FS. CONFIRMED.
3. **Vercel 60s wall clock on extracts that eventually returned (2 of the size-passing oks).** CONFIRMED elapsedMs vs `maxDuration`.
4. **Table/layout collapse on files that did extract (KPI tiles, three-column interleave, wrapped returns headers).** Seen on factsheet, report, 3i presentation, PG annual. CONFIRMED extracts.
5. **`MAX_PDF_MB` / `pdf_too_large` (1 file).** The full annual report. Also fails B79 first. CONFIRMED.
6. **Footnote markers on labels** (common, milder). `YTD 2`, `invested1`, `Gearing 1`. Not inside the digits in this set.
7. **Guardrail silence.** Zero WARN/ERROR on the six extracts. The failures that matter happen before it runs, or are structural and look "printable".

### Can Review check a figure against a fund fact sheet's returns table today?

**No.**

The HPIF March 2026 factsheet is the one file that is both the right genre and small enough to upload and extract in time. The returns row is not a soup of digits, but 1YR and since-inception are the same number, headers wrap, and the monthly grid loses the share-class letter. I would not let Stage 2 green a period-specific return from that table.

### What I actually think

Extraction of born-digital prose is **better than the 41.7% locate headline**. When officeparser finishes, you get English, labelled rows, and printable ratios around 0.99. The product problem on this set is not "PDFs come out as garbage." It is that the documents a user reaches for never arrive, or time out, and the one fact sheet that does arrive is almost a table and therefore more dangerous than a failed extract. The unwired guardrail would not have helped: it scored OK on every file that returned text, including the unsafe returns grid.

One-line later, not a build: blob upload for B79 (`Pr14`); a layout-aware PDF table extractor for fact sheets; SheetJS when the upload is actually xlsx.
