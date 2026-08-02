# R7 extractor CHECK 2 — binary attribution

Generated: 2026-08-02T14:32:48.527Z

**Counts:** IMPROVEMENT=9 NEUTRAL=41 REGRESSION=0

Scanned threshold: 50 chars (meaningful, image placeholders stripped).

| File | Statement | Old DV | New DV | Conflict o→n | Label | Reason |
|---|---|---|---|---|---|---|
| tests/extraction-corpus/files/native_clean.pdf | "Vantor Systems generated revenue of $24 million in FY2024, u" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/native_clean.pdf | "The Company employs 142 staff across three regional offices." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/native_clean.pdf | "The base case generates a 2.8x MOIC and a 23% gross IRR." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/native_typography.pdf | "Management described the pipeline as “robust and well-divers" | not_supported | supported_full | false→false | IMPROVEMENT | cleaner/recoverable text → verdict not_supported→supported_full (rank 0→3) |
| tests/extraction-corpus/files/native_typography.pdf | "The projected gross IRR is in the 20–24% range — well above " | not_supported | supported_full | false→false | IMPROVEMENT | cleaner/recoverable text → verdict not_supported→supported_full (rank 0→3) |
| tests/extraction-corpus/files/native_typography.pdf | "Customer acquisition cost runs between $175–225 with payback" | not_supported | supported_full | false→false | IMPROVEMENT | cleaner/recoverable text → verdict not_supported→supported_full (rank 0→3) |
| tests/extraction-corpus/files/multicolumn.pdf | "This paragraph belongs entirely to the left column and shoul" | not_supported | supported_full | false→false | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| tests/extraction-corpus/files/multicolumn.pdf | "This paragraph belongs entirely to the right column and shou" | not_supported | supported_full | false→false | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| tests/extraction-corpus/files/multipage.pdf | "Vantor was founded in 2019 by two former logistics engineers" | not_supported | supported_full | false→false | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| tests/extraction-corpus/files/multipage.pdf | "Annual recurring revenue reached $24 million by the end of F" | not_supported | supported_full | false→false | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| tests/extraction-corpus/files/multipage.pdf | "The board comprises five directors, two of them independent." | not_supported | supported_full | false→false | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| tests/extraction-corpus/files/memo.docx | "Management described the pipeline as “robust and well-divers" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/memo.docx | "The projected gross IRR is in the 20–24% range — well above " | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/memo.docx | "Customer acquisition cost runs between $175–225 with payback" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/deck.pptx | "Average revenue per customer is $450 per month." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/deck.pptx | "Annual recurring revenue reached $24 million in FY2024." | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| tests/extraction-corpus/files/deck.pptx | "Month-12 logo retention is approximately 82%." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/deck.pptx | "We recommend proceeding to full diligence." | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| tests/extraction-corpus/files/model.xlsx | "Revenue FY2024 ($mm) is 24." | conflict | conflict | true→true | NEUTRAL | identical verdict/hasConflict/excerpt |
| tests/extraction-corpus/files/model.xlsx | "The base case MOIC is 2.8." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "We seek approval for BVP to invest up to $7mm in the Series " | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "monthly recurring revenue has grown from $164K to $438K (+15" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "Shopify's 24 employees are located in Ottawa, Canada." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "they are able to acquire a customer for between $175-225 and" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "The round is priced at a $20mm pre-money valuation ($18.7mm " | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf | "roughly two-thirds (66%) of customers using at least one thi" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "We seek approval for BVP to invest up to $7mm in the Series " | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "monthly recurring revenue has grown from $164K to $438K (+15" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "Shopify's 24 employees are located in Ottawa, Canada." | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "they are able to acquire a customer for between $175-225 and" | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "The round is priced at a $20mm pre-money valuation ($18.7mm " | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf | "roughly two-thirds (66%) of customers using at least one thi" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "We seek approval for BVP to invest up to $7mm in the Series " | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "monthly recurring revenue has grown from $164K to $438K (+15" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "Shopify's 24 employees are located in Ottawa, Canada." | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "they are able to acquire a customer for between $175-225 and" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "The round is priced at a $20mm pre-money valuation ($18.7mm " | supported_full | supported_full | false→false | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| scripts/diagnostic/r7-samples/Shopify_text_longform.docx | "roughly two-thirds (66%) of customers using at least one thi" | supported_full | supported_full | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.pdf | "We seek approval for BVP to invest up to $7mm in the Series " | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.pdf | "Shopify raised $7 million in funding." | not_supported | conflict | false→true | IMPROVEMENT | old extractor failed/empty; officeparser recovered text and evidence verdict improved |
| scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.docx | "We seek approval for BVP to invest up to $7mm in the Series " | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.docx | "Shopify raised $7 million in funding." | conflict | conflict | true→true | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.pdf | "Shopify raised $5 million in funding." | conflict | conflict | true→true | NEUTRAL | same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change |
| scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.pdf | "The round was led by Bessemer Venture Partners." | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.docx | "Shopify raised $5 million in funding." | conflict | conflict | true→true | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.docx | "The round was led by Bessemer Venture Partners." | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.pptx | "Customer acquisition cost runs between $175-225 with payback" | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.pptx | "monthly recurring revenue has grown from $164K to $438K (+15" | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.xlsx | "Customer acquisition cost runs between $175-225 with payback" | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |
| scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.xlsx | "monthly recurring revenue has grown from $164K to $438K (+15" | not_supported | not_supported | false→false | NEUTRAL | identical verdict/hasConflict/excerpt |

## Typography spot-check
- **tests/extraction-corpus/files/native_typography.pdf**: oldGlyphs=false newGlyphs=true
  - old: "Vantor Systems - Investment Overview\nVantor Systems generated revenue of $24 million in FY2024, up from $18 million in F"
  - new: "Vantor Systems - Diligence Notes\nManagement described the pipeline as “robust and well-diversified” and noted the compan"
- **tests/extraction-corpus/files/memo.docx**: oldGlyphs=true newGlyphs=true
  - old: "Vantor Systems - Investment Memo\n\nVantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY20"
  - new: "Vantor Systems - Investment Memo\nVantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY202"

## Scanned confirm
```json
{
  "threshold": 50,
  "status": "unsupported_scanned",
  "meaningfulTextLength": 0,
  "textLength": 27,
  "pipelineSkipped": true,
  "note": "unsupported_scanned flagged; pipeline not required for ship gate"
}
```
