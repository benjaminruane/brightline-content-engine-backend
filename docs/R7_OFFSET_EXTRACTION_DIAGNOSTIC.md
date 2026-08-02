# R7 offset / extraction diagnostic

Generated: 2026-08-02T07:53:34.457Z

## 0. Method

- Extractor: **imported** `extractTextFromSource` + `detectFileType` from `lib/extract-text-from-source.mjs` (live pipeline).
- Samples: `scripts/diagnostic/r7-samples/` (9 files).
- No LLM calls. No pipeline edits.

### Return shape (pre-check 2)

| Format | Pipeline return | Internal construction |
|--------|-----------------|----------------------|
| PDF | single flat `text` string | pdf-parse page text concatenated, then PDF+generic normalisation |
| DOCX | single flat `text` string | mammoth `extractRawText` |
| PPTX | single flat `text` string | slide XMLs’ `<a:t>` runs joined; slides joined with `\n` — **slide index not returned** |
| XLSX | single flat `text` string | sheet rows = tab-joined cells; rows joined with `\n` — **no cell address returned** |

**Implication:** character offset into a flat string is the only locator model the pipeline exposes today for every format. PPTX/XLSX lose structural (slide/cell) identity at the boundary.

## 1. Extraction quality (all 9)

**Headline: live extractor emits 0 literal ■/U+FFFD on these samples; DOCX longform emits Windows-1252 C1 controls (U+0092/96/97…) that *render* as ■ in many UIs (max display-as-box count=74). Messy PDF instead letter-substitutes punctuation → ASCII `n`. Extract failures: B1_shopify_source_1_7m.pdf.**

| File | Format | Length | Shape | Literal ■/FFFD | C1 box-class | Multi-space runs | Coherent (eyeball) |
|------|--------|--------|-------|----------------|--------------|------------------|--------------------|
| B1_shopify_source_1_7m.pdf | pdf | FAIL | flat | 0 | 0 | 0 | n (extract fail: bad XRef entry) |
| B1_shopify_source_1_7m.docx | docx | 84 | flat | 0 | 0 | 0 | y |
| B2_shopify_source_2_5m_conflict.pdf | pdf | 230 | flat | 0 | 0 | 0 | y |
| B2_shopify_source_2_5m_conflict.docx | docx | 234 | flat | 0 | 0 | 0 | y |
| D2_shopify_unit_economics_discussion.pptx | pptx | 623 | flat_from_slides | 0 | 0 | 0 | y |
| D2_shopify_unit_economics_discussion.xlsx | xlsx | 547 | flat_from_cells | 0 | 0 | 0 | y |
| Shopify_text_longform_clean.pdf | pdf | 22042 | flat | 0 | 0 | 0 | y |
| Shopify_text_longform_messy.pdf | pdf | 22038 | flat | 0 | 0 | 0 | y |
| Shopify_text_longform.docx | docx | 22114 | flat | 0 | 74 | 0 | y |

### Artifact examples (display-as-box / C1)

- **Shopify_text_longform.docx** (literal=0, C1=74):
  - `t with no debt.\n\nShopifys target focus on SMBs a`
  - `0 online retailers. Thats how small the online r`
  - `ement instincts. Shopifys 24 employees are locat`
  - non-ASCII top: U+92("")×35, U+93("")×10, U+94("")×10, U+97("")×10, U+96("")×9, U+A0(" ")×5, U+FC("ü")×2, U+2014("—")×1

### First 500 chars (verbatim samples)

#### B1_shopify_source_1_7m.pdf
```
EXTRACT FAIL: bad XRef entry
```

#### B1_shopify_source_1_7m.docx
```
B1 — Shopify source ($7m)

The firm is evaluating an investment of up to $7,000,000.
```

#### B2_shopify_source_2_5m_conflict.pdf
```
B2 — Shopify source ($5m conflict)
Shopify (Source 2 - conflicting $5m)
The firm is evaluating an investment in Shopify.
The investment amount is up to $5 million.
The proposed round is priced at a $20 million pre-money valuation.
```

#### B2_shopify_source_2_5m_conflict.docx
```
B2 — Shopify source ($5m conflict)

Shopify (Source 2 - conflicting $5m)

The firm is evaluating an investment in Shopify.

The investment amount is up to $5 million.

The proposed round is priced at a $20 million pre-money valuation.
```

#### D2_shopify_unit_economics_discussion.pptx
```
D2 — Shopify unit economics discussion Auto-generated from .txt for ingestion testing
Text block 1 Shopify's unit economics benefit from high gross margins on subscription software revenue. Over time, payment processing and merchant services have become a larger share of total revenue, which may moderate overall margin expansion.
Text block 2 Customer retention remains strong among established merchants, although churn among smaller merchants remains elevated relative to enterprise cohorts. Cont
```

#### D2_shopify_unit_economics_discussion.xlsx
```
Extracted text blocks (one per row)
Shopify's unit economics benefit from high gross margins on subscription software revenue. Over time, payment processing and merchant services have become a larger share of total revenue, which may moderate overall margin expansion.
Customer retention remains strong among established merchants, although churn among smaller merchants remains elevated relative to enterprise cohorts. Continued investment in platform capabilities is expected to support long-term m
```

#### Shopify_text_longform_clean.pdf
```
Shopify - Long-form memo Shopify To: BVP Group From: Alex Ferrara, Trevor Oelschig Date:
October 12, 2010 Re: Shopify We seek approval for BVP to invest up to $7mm in the Series A
financing of Shopify, a provider of e-commerce software to SMBs. Shopify sells a simple SaaS
solution that enables a business to quickly setup and run an online retail store. A typical customer
signs up using their credit card and is up and running in a few hours with no long-term contract.
Shopify targets SMBs and at-
```

#### Shopify_text_longform_messy.pdf
```
Shopify — Long-form memo
Shopify
To: BVP Group
From: Alex Ferrara, Trevor Oelschig
Date: October 12, 2010
Re: Shopify
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs. Shopify sells a simple SaaS solution that enables a business to
quickly setup and run an online retail store. A typical customer signs up using their credit
card and is up and running in a few hours with no long-term contract. Shopify targets SMBs and
at-
```

#### Shopify_text_longform.docx
```
Shopify — Long-form memo

Shopify

To: BVP Group

From: Alex Ferrara, Trevor Oelschig

Date: October 12, 2010

Re: Shopify

We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider of e-commerce software to SMBs. Shopify sells a simple SaaS solution that enables a business to quickly setup and run an online retail store. A typical customer signs up using their credit card and is up and running in a few hours with no long-term contract. Shopify targets SMBs a
```

## 2. Passage resolution matrix

**Headline: REPAIR-NORM 38.1% (16/42) vs EXACT 19% vs WS-NORM 31%. P3/P4 on messy PDF+longform DOCX: exact-fail=4, repair-ok=2, repair-rescues-of-exact-fail=2. Core: DOCX C1/apostrophe-dash stress IS rescued by placeholder REPAIR-NORM; messy-PDF `n`-substitution is NOT (cannot safely map `n`).**

REPAIR-NORM rule: ws-collapse + curly→ASCII + en/em→hyphen + map `{■, U+FFFD, U+25A0, C1 U+0091–94/96/97, ASCII ' and -}` → U+E000 placeholder. Does **not** map ASCII `n`.

### P1: We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✗ | ✓ @118 | ✓ @118 |
| Shopify_text_longform_messy.pdf | ✓ @118 | ✓ @118 | ✓ @118 |
| Shopify_text_longform.docx | ✓ @124 | ✓ @118 | ✓ @118 |

### P2: monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✗ | ✓ @1371 | ✓ @1371 |
| Shopify_text_longform_messy.pdf | ✗ | ✓ @1371 | ✓ @1371 |
| Shopify_text_longform.docx | ✓ @1379 | ✓ @1371 | ✓ @1371 |

### P3: Shopify's 24 employees are located in Ottawa, Canada.

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✓ @2306 | ✓ @2306 | ✓ @2306 |
| Shopify_text_longform_messy.pdf | ✗ | ✗ | ✗ |
| Shopify_text_longform.docx | ✗ | ✗ | ✓ @2306 |

### P4: they are able to acquire a customer for between $175-225 and can pay back that spend in 7-9 months

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✗ | ✗ | ✓ @11098 |
| Shopify_text_longform_messy.pdf | ✗ | ✗ | ✗ |
| Shopify_text_longform.docx | ✗ | ✗ | ✓ @11097 |

### P5: The round is priced at a $20mm pre-money valuation ($18.7mm EV).

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✗ | ✓ @4461 | ✓ @4461 |
| Shopify_text_longform_messy.pdf | ✓ @4462 | ✓ @4461 | ✓ @4461 |
| Shopify_text_longform.docx | ✓ @4476 | ✓ @4461 | ✓ @4461 |

### P6: roughly two-thirds (66%) of customers using at least one third-party app

| File | EXACT | WS-NORM | REPAIR-NORM |
|------|-------|---------|-------------|
| B1_shopify_source_1_7m.pdf | ✗ (extract fail) | ✗ | ✗ |
| B1_shopify_source_1_7m.docx | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.pdf | ✗ | ✗ | ✗ |
| B2_shopify_source_2_5m_conflict.docx | ✗ | ✗ | ✗ |
| Shopify_text_longform_clean.pdf | ✓ @9665 | ✓ @9664 | ✓ @9664 |
| Shopify_text_longform_messy.pdf | ✗ | ✓ @9662 | ✓ @9662 |
| Shopify_text_longform.docx | ✓ @9699 | ✓ @9663 | ✓ @9663 |

### P3/P4 stress on messy files (core question)

| File | Passage | EXACT | WS-NORM | REPAIR-NORM | naive box→' | naive box→- |
|------|---------|-------|---------|-------------|-------------|-------------|
| Shopify_text_longform_messy.pdf | P3 | ✗ | ✗ | ✗ | ✗ | ✗ |
| Shopify_text_longform.docx | P3 | ✗ | ✗ | ✓ | ✓ | ✗ |
| Shopify_text_longform_messy.pdf | P4 | ✗ | ✗ | ✗ | ✗ | ✗ |
| Shopify_text_longform.docx | P4 | ✗ | ✗ | ✓ | ✗ | ✓ |

Naive single-map on DOCX C1: **box→' rescues P3 but fails P4; box→- rescues P4 but fails P3.** Placeholder-class REPAIR-NORM rescues both on DOCX. Messy PDF: punctuation became literal `n` — neither naive nor placeholder REPAIR-NORM recovers P3/P4 without a letter-destroying rule.

## 3. ■ / ambiguous-glyph finding — LOCATE vs RECONSTRUCT

**Headline: YES — DOCX C1 U+0092 (apostrophe) and U+0096/U+0097 (en/em dash) are distinct code points that both *display* as ■/boxes. messy vs clean extract: observed "'" → "n" (note: clean PDF already folded dash-ranges to ASCII apostrophe, so clean↔messy only shows "'"→"n"; relative to authored en-dash + apostrophe, BOTH collapse to `n` in messy). LOCATE works for DOCX with shared placeholder repair; RECONSTRUCT of the true original glyph is not deterministic. Messy-PDF `n` LOCATEs poorly under any safe repair that leaves ordinary letters intact.**

- Clean PDF length 22042; messy PDF length 22038.
- Clean→messy PDF top substitutions (context-aligned):
  - "'" → "n" ×521 e.g. clean `hopify's target fo` / messy `hopifyns target fo`
  - "E" → "e" ×4 e.g. clean `on of Enterprise S` / messy `on of enterprise s`
  - "w" → "h" ×1 e.g. clean `mpany was ~$50m. I` / messy `mpany has been abl`
  - ")" → "," ×1 e.g. clean `artner) so that if` / messy `artner, so I was i`
- DOCX C1 inventory (Windows-1252 mis-decode; renders as ■ in many UIs):
  - U+92 ×35 — RIGHT SINGLE QUOTE / apostrophe
  - U+93 ×10 — LEFT DOUBLE QUOTE
  - U+94 ×10 — RIGHT DOUBLE QUOTE
  - U+97 ×10 — EM DASH
  - U+96 ×9 — EN DASH

Note: clean PDF already encodes some dash ranges as ASCII apostrophe (`$175'225`, `7'9 months`), so even the “clean” extract is not typographically faithful before any repair.

| Goal | Possible? |
|------|-----------|
| **LOCATE** passage for highlight range | **Often yes** for DOCX (C1 + `'`/`-` → placeholder on both sides). **No (safe)** for messy-PDF `n`-punctuation without destroying real letters. |
| **RECONSTRUCT** true original glyph for display | **No** when one mangled form folds apostrophe + dash (DOCX display-■ / messy `n`) — drawer can highlight inside mangled text but must not claim faithful typography |

## 4. PPTX / XLSX coherence

**Headline: this D2 fixture’s PPTX/XLSX extracts are prose-coherent (sentence-shaped blocks), so a passage CAN have a meaningful char range in the flat string — but the pipeline still drops slide/cell identity, so production decks/sheets will often need a structure-aware locator when text is fragmented.**

### D2_shopify_unit_economics_discussion.pptx (first 3000 chars)
```
D2 — Shopify unit economics discussion Auto-generated from .txt for ingestion testing
Text block 1 Shopify's unit economics benefit from high gross margins on subscription software revenue. Over time, payment processing and merchant services have become a larger share of total revenue, which may moderate overall margin expansion.
Text block 2 Customer retention remains strong among established merchants, although churn among smaller merchants remains elevated relative to enterprise cohorts. Continued investment in platform capabilities is expected to support long-term merchant retention and lifetime value expansion.
```

Eyeball: coherent narrative paragraphs survive into the flat string (fixture was generated from .txt blocks). Highlight-as-text **can** work here. Still recommend retaining **slide index** in the extractor return for real decks where runs are fragmented.

### D2_shopify_unit_economics_discussion.xlsx (first 3000 chars)
```
Extracted text blocks (one per row)
Shopify's unit economics benefit from high gross margins on subscription software revenue. Over time, payment processing and merchant services have become a larger share of total revenue, which may moderate overall margin expansion.
Customer retention remains strong among established merchants, although churn among smaller merchants remains elevated relative to enterprise cohorts. Continued investment in platform capabilities is expected to support long-term merchant retention and lifetime value expansion.
```

Eyeball: this sheet stores prose in cells; rows come out as readable paragraphs. Highlight-as-text **can** work for this fixture. Prefer **sheet + cell reference** when cells are short metrics / non-sentence values.

## 5. CONCLUSION (recommend, don't decide)

- **PDF/DOCX (when extract succeeds):** placeholder-class REPAIR-NORM is **sufficient to LOCATE** many matcher passages for an extracted-text highlight view when mangling is curly/C1/apostrophe-dash class — including DOCX P3/P4 where EXACT fails. It does **not** recover messy-PDF letter-substitution (`n`). Build spec B can proceed for DOCX + well-formed PDF with eyes open on RECONSTRUCT and on extract failures.
- **Extract failures / stubs:** `B1_shopify_source_1_7m.pdf` fails pdf-parse (`bad XRef entry`) — no text, no offsets (drawer needs a non-extract path). `B2_*.pdf` / B1–B2 DOCX extract but are short stubs without the longform ground-truth passages, so resolution fails for content reasons, not encoding.
- **RECONSTRUCT limitation:** highlight can work inside mangled extracted text, but **displayed glyphs may be repaired/placeholder/C1 boxes — not the author's original typography**. Prefer treating the uploaded file viewer as glyph source of truth when fidelity matters.
- **PPTX/XLSX:** flat-string offsets can work when cells/slides hold prose (as in this D2 fixture); still plan slide/cell locators for fragmented real-world files, and note the live extractor does not currently return those IDs.
- **Extractor fix** (out of scope here) would reduce C1 / messy encoding issues at the source; this diagnostic only measures current live behaviour.

