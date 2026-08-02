# R7 extractor tooling survey

Generated: 2026-08-02T09:00:37.698Z

## 0. Method

- Isolated install: `scripts/diagnostic/extractor-survey/` (NOT app `package.json`).
- Baseline: live `extractTextFromSource` from `lib/extract-text-from-source.mjs` (imported; unmodified).
- Corpus: `tests/extraction-corpus/files/` + probes from `tests/extraction-corpus/corpus/MANIFEST.md`.
- Real files: `scripts/diagnostic/r7-samples/` + P1–P6 from the offset diagnostic.
- Scope: born-digital only; scanned = detection (near-empty), **no OCR**.

## 1. Library versions + installed sizes

| Package | Version | `du -sh node_modules/<pkg>` |
|---------|---------|------------------------------|
| officeparser | 7.5.1 | 12M	node_modules/officeparser |
| unpdf | 1.8.0 | 2.5M	node_modules/unpdf |
| mammoth | 1.12.0 | 2.3M	node_modules/mammoth |
| xlsx (SheetJS) | 0.18.5 | 7.2M	node_modules/xlsx |
| pdfjs-dist (transitive via unpdf/officeparser) | — | 36M	node_modules/pdfjs-dist |
| **survey node_modules total** | — | **151M	node_modules** |

**Serverless-budget note:** Vercel limit is 250MB uncompressed. This scratch tree is **151M	node_modules** (includes both PDF stacks). A production bundle would ship only the chosen stack — e.g. officeparser alone (package 12M	node_modules/officeparser) still pulls PDF deps; unpdf+mammoth+xlsx ≈ 2.5M	node_modules/unpdf + 2.3M	node_modules/mammoth + 7.2M	node_modules/xlsx package dirs plus pdfjs-dist 36M	node_modules/pdfjs-dist. Either way the uncompressed function payload needs packaging measurement, but **both approaches are plausibly under 250MB** if the survey total (151M	node_modules) is the high-water mark for installing everything.

## 2. Typography fidelity

**Headline: FAITHFUL on corpus typography probes: officeparser, unpdf, mammoth. Decide primarily on whether true U+201C/201D/2019/2013/2014 survive — that is what broke the current extractor on real messy files.**

| Probe | File | current | officeparser | unpdf | mammoth |
|-------|------|---|---|---|---|
| PB1 | native_typography.pdf | MANGLED | FAITHFUL | FAITHFUL | — |
| PB2 | native_typography.pdf | MANGLED | FAITHFUL | FAITHFUL | — |
| PB3 | native_typography.pdf | MANGLED | FAITHFUL | FAITHFUL | — |
| PE1 | memo.docx | FAITHFUL | FAITHFUL | — | FAITHFUL |
| PE2 | memo.docx | FAITHFUL | FAITHFUL | — | FAITHFUL |
| PE3 | memo.docx | FAITHFUL | FAITHFUL | — | FAITHFUL |

Labels: **FAITHFUL** = true Unicode glyphs present; **ASCII-FOLDED** = curly/dash folded to ASCII but locate still possible under repair; **MANGLED** = C1 / `n` / U+FFFD / lost.

## 3. Resolution (corpus + real)

**Headline (apples-to-apples): PDF real repair-norm = 41.7% — tie: current, officeparser, unpdf (10/24); DOCX real repair-norm = 33.3% — tie: current, officeparser, mammoth. Real messy/stub files dominate the ceiling: FAITHFUL corpus winners still matter because current MANGLES controlled typography PDFs and fails XRef cases that officeparser/unpdf recover. Prefer FAITHFUL + structure over tiny real-resolve deltas.**

### Corpus resolve %

| Library | EXACT | WS-NORM | REPAIR-NORM |
|---------|-------|---------|-------------|
| current | 60% (12/20) | 60% | 60% |
| mammoth | 100% (3/3) | 100% | 100% |
| officeparser | 85% (17/20) | 100% | 100% |
| unpdf | 72.7% (8/11) | 100% | 100% |
| xlsx | 100% (2/2) | 100% | 100% |

### Real PDF resolve % (4 PDFs × P1–P6)

| Library | EXACT | WS-NORM | REPAIR-NORM |
|---------|-------|---------|-------------|
| current | 16.7% (4/24) | 37.5% | 41.7% |
| officeparser | 16.7% (4/24) | 37.5% | 41.7% |
| unpdf | 16.7% (4/24) | 37.5% | 41.7% |

### Real DOCX resolve % (3 DOCX × P1–P6)

| Library | EXACT | WS-NORM | REPAIR-NORM |
|---------|-------|---------|-------------|
| current | 22.2% (4/18) | 22.2% | 33.3% |
| mammoth | 22.2% (4/18) | 22.2% | 33.3% |
| officeparser | 22.2% (4/18) | 22.2% | 33.3% |

### Real files resolve % (PDF/DOCX combined — format mix differs by library)

| Library | EXACT | WS-NORM | REPAIR-NORM |
|---------|-------|---------|-------------|
| current | 19% (8/42) | 31% | 38.1% |
| mammoth | 22.2% (4/18) | 22.2% | 33.3% |
| officeparser | 19% (8/42) | 31% | 38.1% |
| unpdf | 16.7% (4/24) | 37.5% | 41.7% |

### Real files resolve % (all 9 files × P1–P6 — includes PPTX/XLSX stubs)

| Library | EXACT | WS-NORM | REPAIR-NORM |
|---------|-------|---------|-------------|
| current | 14.8% (8/54) | 24.1% | 29.6% |
| mammoth | 22.2% (4/18) | 22.2% | 33.3% |
| officeparser | 14.8% (8/54) | 24.1% | 29.6% |
| unpdf | 16.7% (4/24) | 37.5% | 41.7% |
| xlsx | 0% (0/6) | 0% | 0% |

Baseline detail: `current` = pdf-parse + mammoth + jszip/xlsx as wired today. Note: current pdf-parse **fails** several corpus/real PDFs (`bad XRef`); officeparser/unpdf still extract those. Multicolumn corpus: current returned a short/garbled extract (PC probes unresolved); officeparser/unpdf keep both columns contiguous.

## 4. Structure + offsets

**Headline: officeParser exposes page/slide/sheet metadata on chunks (e.g. PF_S2 → slideNumber 2; PD_P2 → pageNumber 2). unpdf exposes per-page text. SheetJS exposes sheet+cell. Current baseline returns a flat string only. Character offsets via officeParser `addStartIndex`: absent on this version.**

| Library | PDF page | PPTX slide | XLSX sheet/cell | Char offsets |
|---------|----------|------------|-----------------|--------------|
| current | no | no | no (flat tabs) | absent |
| officeparser | yes (chunk metadata.pageNumber) | yes (slideNumber) | sheetName yes; cell addr no | claimed addStartIndex — see rows |
| unpdf | yes (per-page text array) | n/a | n/a | absent |
| mammoth | n/a | n/a | n/a | absent |
| xlsx | n/a | n/a | yes (sheet + cell addr) | absent |

### Structure probe hits (corpus)

| Probe | Lib | Identity reported |
|-------|-----|-------------------|
| PD_P1 | current | no |
| PD_P1 | officeparser | pageNumber 1 |
| PD_P1 | unpdf | pageNumber 1 |
| PD_P2 | current | no |
| PD_P2 | officeparser | pageNumber 2 |
| PD_P2 | unpdf | pageNumber 2 |
| PD_P3 | current | no |
| PD_P3 | officeparser | pageNumber 3 |
| PD_P3 | unpdf | pageNumber 3 |
| PF_S1 | current | no |
| PF_S1 | officeparser | slideNumber 1 |
| PF_S2 | current | no |
| PF_S2 | officeparser | slideNumber 2 |
| PF_S3 | current | no |
| PF_S3 | officeparser | slideNumber 3 |
| PF_S4 | current | no |
| PF_S4 | officeparser | slideNumber 4 |
| PG_S1 | current | no |
| PG_S1 | officeparser | sheetName Assumptions |
| PG_S1 | xlsx | sheet Assumptions cell A5 |
| PG_S2 | current | no |
| PG_S2 | officeparser | sheetName Summary |
| PG_S2 | xlsx | sheet Summary cell A5 |

### officeParser addStartIndex checks

- PA1 (native_clean.pdf): **absent**
- PA2 (native_clean.pdf): **absent**
- PA3 (native_clean.pdf): **absent**
- PB1 (native_typography.pdf): **absent**
- PB2 (native_typography.pdf): **absent**
- PB3 (native_typography.pdf): **absent**
- PC_LEFT (multicolumn.pdf): **absent**
- PC_RIGHT (multicolumn.pdf): **absent**

## 5. Reading order + scanned detection

### Reading order (`multicolumn.pdf`)

- **current**: leftOk=false rightOk=false order=unresolved (probes not found as contiguous)
- **officeparser**: leftOk=true rightOk=true order=left-then-right (resolved under ws-norm)
- **unpdf**: leftOk=true rightOk=true order=left-then-right (resolved under ws-norm)

### Scanned detection (`image_only.pdf`) — no OCR

| Library | Char count | Near-empty / flaggable | Sample |
|---------|------------|------------------------|--------|
| current | 0 | yes | "" |
| officeparser | 27 | yes | "[Image: pdf_image_p1_1.bmp]" |
| unpdf | 0 | yes | "" |

## 6. CONCLUSION (recommend, don't decide)

- **Recommended default (single library):** **officeparser@7.5.1** — FAITHFUL on corpus typography (typoFaithful=true), 100% corpus repair-norm, recovers XRef PDFs that current fails, keeps multicolumn contiguous, and unique among candidates returns **page / slide / sheet** identity for drawer navigation.
- **Per-format split alternative (leaner PDF path):** **unpdf@1.8.0** for PDF (FAITHFUL=true; tied with others on PDF real repair-norm here) + **mammoth** for DOCX (FAITHFUL=true) + **xlsx/SheetJS** when cell addresses matter + officeparser (or improved slide XML) for PPTX slide identity. Prefer this if officeparser install weight is unacceptable.
- **Vs current baseline:** current corpus typography PDF = MANGLED (XRef fail on `native_typography.pdf`); real PDF/DOCX repair-norm = exact 19% (8/42); ws 31%; repair 38.1%. Swap buys Unicode fidelity on born-digital corpus, fewer hard PDF failures, reading-order + structure metadata.
- **Serverless:** survey scratch total 151M	node_modules < 250MB uncompressed. Ship **one** stack; compress to ≤50MB — exclude OCR bits / unused pdfjs assets; measure the production zip in the build spec.
- **Residual gaps:** (1) officeParser `addStartIndex` returned **absent** offsets — Build B still needs post-extract `indexOf`/repair-norm spanning; (2) corrupt real text layers (`Shopifyns` / `Shopify n s`) are not fixed by any library — design repair-norm / viewer fallback; (3) scanned = detect near-empty only; (4) SheetJS still needed if cell addresses are required (officeparser gives sheetName, not A1).
- **Born-digital-only scope (explicit):** recommended swap covers born-digital text layers. Scanned/image-only PDFs = flag near-empty, **not supported** (OCR deferred). No OCR in this recommendation.

