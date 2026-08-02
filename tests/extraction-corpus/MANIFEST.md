# Extraction test corpus — MANIFEST

Synthetic source documents with **known ground truth**, built to stress the source-ingestion
text extractor across formats and failure modes. All content concerns a fictional company
(**Vantor Systems**) and is entirely synthetic — safe to commit.

Purpose: give the extractor corpus-and-tooling survey precise, controlled inputs so extraction
quality can be *measured* (not eyeballed). Each file isolates a specific stress. Probe passages
below are the exact strings the survey should search for in extracted text.

**Companion set:** the 9 real ingestion-test files in `scripts/diagnostic/r7-samples/` provide
real-world messiness; this corpus provides controlled ground truth. Run the survey against both.

**Typography note:** several probe passages deliberately contain the exact Unicode characters
that mangled in real extraction — curly double quotes (U+201C `“` / U+201D `”`), curly
apostrophe (U+2019 `’`), en dash (U+2013 `–`), em dash (U+2014 `—`). These are stored correctly
in the source files (verified by round-trip). Whether they survive *extraction* is the thing to
measure. Do not "fix" or normalise them in this manifest — they are intentional.

---

## Files

### 1. `files/native_clean.pdf`
- **Format:** born-digital PDF (single column, Helvetica, ASCII only).
- **Tests:** baseline — clean native PDF, the common case. Everything should extract faithfully.
- **Ground truth:** 4 short paragraphs, plain ASCII, no typography stress.
- **Probe passages:**
  - `PA1`: `Vantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY2023.`
  - `PA2`: `The Company employs 142 staff across three regional offices.`
  - `PA3`: `The base case generates a 2.8x MOIC and a 23% gross IRR.`
- **Expected:** exact-match resolution should succeed on all three. If it doesn't, the extractor
  is failing the easy case.

### 2. `files/native_typography.pdf`
- **Format:** born-digital PDF containing curly quotes, en dash, em dash, curly apostrophe.
- **Tests:** Unicode fidelity — the failure that turned `'` into `n` / C1 bytes in real files.
- **Probe passages (exact typography — U+201C/U+201D/U+2019/U+2013/U+2014):**
  - `PB1`: `Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum.`
  - `PB2`: `The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate.`
  - `PB3`: `Customer acquisition cost runs between $175–225 with payback in 7–9 months.`
- **Expected:** the core measurement. Report exact vs whitespace-norm vs repair-norm resolution
  for each, and whether the extracted characters are the true glyphs or mangled substitutes.
  This file is the controlled analogue of the messy real PDF.

### 3. `files/multicolumn.pdf`
- **Format:** born-digital PDF, two-column layout.
- **Tests:** reading order — does extraction keep each column as a continuous block, or interleave
  them line-by-line across the gutter?
- **Ground truth:** left column is entirely about market size; right column entirely about
  competition. The literal token `COLUMN_BREAK_MARKER` sits between them in source order.
- **Probe passages:**
  - `PC_LEFT`: `This paragraph belongs entirely to the left column and should read as one continuous block.`
  - `PC_RIGHT`: `This paragraph belongs entirely to the right column and should read as one continuous block distinct from the left.`
- **Expected:** if both resolve as contiguous strings, reading order is preserved. If either is
  broken by interleaved right-column text, extraction mis-orders columns — a known PDF hazard.

### 4. `files/multipage.pdf`
- **Format:** born-digital PDF, 3 pages, one anchor per page.
- **Tests:** page-identity + resolution at multi-page scale.
- **Probe passages (each on a known page):**
  - `PD_P1` (page 1): `Vantor was founded in 2019 by two former logistics engineers.`
  - `PD_P2` (page 2): `Annual recurring revenue reached $24 million by the end of FY2024.`
  - `PD_P3` (page 3): `The board comprises five directors, two of them independent.`
- **Expected:** all resolve; additionally report whether the extractor exposes *which page* each
  passage falls on (page-identity is needed for page-level navigation in the drawer).

### 5. `files/image_only.pdf`
- **Format:** PDF whose single page is a rasterised **image** of text — **no text layer**.
- **Tests:** scanned-detection / OCR routing. Verified: normal extraction returns **0 characters**.
- **Ground truth (only recoverable via OCR):** contains `SCANNED ANCHOR: This page exists only as
  an image of text.` and `The gross merchandise value processed was $132 million.`
- **Expected:** normal extraction yields ~nothing → the extractor must **detect** this (near-empty
  result) and route to the OCR fallback. This file tests the *detection*, not OCR accuracy.

### 6. `files/memo.docx`
- **Format:** Word document (US Letter), same typography stress as file 2.
- **Tests:** DOCX extraction fidelity + the C1-byte typography case.
- **Probe passages (exact typography):**
  - `PE1`: `Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum.`
  - `PE2`: `The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate.`
  - `PE3`: `Customer acquisition cost runs between $175–225 with payback in 7–9 months.`
- **Expected:** report resolution under the three strategies, and (per the earlier finding) whether
  DOCX yields C1 bytes that render as boxes vs faithful glyphs. LOCATE vs RECONSTRUCT applies here.

### 7. `files/deck.pptx`
- **Format:** PowerPoint, 4 slides, one anchor per slide, some typography.
- **Tests:** slide-identity preservation + coherence of slide text.
- **Probe passages (each on a known slide):**
  - `PF_S1` (slide 1): `Average revenue per customer is $450 per month.`
  - `PF_S2` (slide 2): `Annual recurring revenue reached $24 million in FY2024.`
  - `PF_S3` (slide 3): `Month-12 logo retention is approximately 82%.`
  - `PF_S4` (slide 4): `We recommend proceeding to full diligence.`
- **Expected:** report whether the pipeline extractor preserves slide identity (which slide a
  passage came from) or flattens to one undifferentiated string. `markitdown` preserves slide
  markers as a reference; the question is what the *pipeline's* extractor does.

### 8. `files/model.xlsx`
- **Format:** Excel, 2 sheets (`Assumptions`, `Summary`), labelled cells + 2 live formulas.
- **Tests:** sheet/cell-identity preservation + whether extracted text is coherent or a jumble.
- **Ground truth cells:** `Assumptions` A3=`SHEET1 ANCHOR`; `Summary` A3=`SHEET2 ANCHOR`,
  B4=`6` (revenue growth, formula), B7=`42` (total, formula).
- **Probe passages / cell content:**
  - `PG_S1`: label `Revenue FY2024 ($mm)` with value `24` on the `Assumptions` sheet.
  - `PG_S2`: label `MOIC (base case)` with value `2.8` on the `Summary` sheet.
- **Expected:** report the extraction shape — does it preserve sheet names and cell/row structure,
  or emit a flat tab/newline blob with no coordinates? This decides whether XLSX needs a
  structural locator (sheet + cell) rather than a character offset for the drawer.

---

## Consolidated probe table (for the survey script)

| ID | File | Typography stress | Structure stress | Exact passage / cell |
|----|------|-------------------|------------------|----------------------|
| PA1 | native_clean.pdf | none | none | Vantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY2023. |
| PA2 | native_clean.pdf | none | none | The Company employs 142 staff across three regional offices. |
| PA3 | native_clean.pdf | none | none | The base case generates a 2.8x MOIC and a 23% gross IRR. |
| PB1 | native_typography.pdf | curly quotes + apostrophe | none | Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum. |
| PB2 | native_typography.pdf | en dash + em dash + apostrophe | none | The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate. |
| PB3 | native_typography.pdf | en dash (ranges) | none | Customer acquisition cost runs between $175–225 with payback in 7–9 months. |
| PC_LEFT | multicolumn.pdf | none | column reading order | This paragraph belongs entirely to the left column and should read as one continuous block. |
| PC_RIGHT | multicolumn.pdf | none | column reading order | This paragraph belongs entirely to the right column and should read as one continuous block distinct from the left. |
| PD_P1 | multipage.pdf | none | page identity (p1) | Vantor was founded in 2019 by two former logistics engineers. |
| PD_P2 | multipage.pdf | none | page identity (p2) | Annual recurring revenue reached $24 million by the end of FY2024. |
| PD_P3 | multipage.pdf | none | page identity (p3) | The board comprises five directors, two of them independent. |
| SCAN | image_only.pdf | none | no text layer | (OCR-only) The gross merchandise value processed was $132 million. |
| PE1 | memo.docx | curly quotes + apostrophe | none | Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum. |
| PE2 | memo.docx | en dash + em dash + apostrophe | none | The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate. |
| PE3 | memo.docx | en dash (ranges) | none | Customer acquisition cost runs between $175–225 with payback in 7–9 months. |
| PF_S1 | deck.pptx | none | slide identity (s1) | Average revenue per customer is $450 per month. |
| PF_S2 | deck.pptx | none | slide identity (s2) | Annual recurring revenue reached $24 million in FY2024. |
| PF_S3 | deck.pptx | none | slide identity (s3) | Month-12 logo retention is approximately 82%. |
| PF_S4 | deck.pptx | none | slide identity (s4) | We recommend proceeding to full diligence. |
| PG_S1 | model.xlsx | none | sheet/cell identity | Revenue FY2024 ($mm) = 24 (Assumptions sheet) |
| PG_S2 | model.xlsx | none | sheet/cell identity | MOIC (base case) = 2.8 (Summary sheet) |

## Coverage summary

| Stress | Covered by |
|--------|-----------|
| Clean native PDF (baseline) | native_clean.pdf |
| Unicode/typography fidelity | native_typography.pdf, memo.docx |
| Column reading order | multicolumn.pdf |
| Page identity (multi-page) | multipage.pdf |
| Scanned / no-text-layer detection | image_only.pdf |
| DOCX fidelity + C1 bytes | memo.docx |
| Slide identity | deck.pptx |
| Sheet/cell identity + coherence | model.xlsx |

**Not covered (deliberate):** realistic *scanned* documents with real-world scan artifacts
(skew, noise, print degradation). `image_only.pdf` tests scanned *detection/routing* but not OCR
*accuracy* on authentic scans. Realistic-scan OCR validation needs public-domain scanned samples,
handled as a separate later step.
