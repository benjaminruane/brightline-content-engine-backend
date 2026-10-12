# B384. A one-character fragment is not part of the previous word

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  9687b68  main  166 files  1817 tests` |
| Cost | USD 0. No model calls. |

Compared `ab559bb^` (before the intra-word join) with this revision. `scripts/diagnostic/b384/token-delta.mjs` loads `lib/extract-pdf-direct.mjs` from each revision and extracts every PDF under the repo outside `node_modules`. 79 paths, 44 after de-duplicating by basename, 35 duplicate basenames skipped.

## Corpus

8 files changed, of 44 PDFs extracted.

22 distinct new tokens. 29 rows once each file is named.

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
| 5 | pg-annual-results-2024.pdf | appro |
| 5 | pg-ir-july-2025.pdf | appro |
| 5 | Shopify_text_longform_messy.pdf | nfrom |
| 5 | pg-ir-july-2025.pdf | perfo |
| 5 | pg-ir-july-2025.pdf | propr |
| 5 | pg-annual-results-2024.pdf | secon |
| 4 | pg-annual-results-2024.pdf | cont |
| 4 | pg-ir-july-2025.pdf | cont |
| 4 | hpif-factsheet-march-2026.pdf | Term |
| 4 | hpif-report-march-2026.pdf | Term |
| 4 | hpif-factsheet-march-2026.pdf | Year |
| 4 | hpif-report-march-2026.pdf | Year |

The single-letter joins in `scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf` are gone. Against `ab559bb` that file had 61 joins and 39 distinct tokens the pre-join extract did not contain. None of those 39 remain. The request's figure of 40 is the same defect; this run counts 39 distinct tokens. IRRAflow, collateralized, Repurchases, officer, financed, $118bn and $174bn remain.

`nfrom` is the one new token still on that file. The stray `n` is no longer glued onto `software`. The following item is `from`, four letters, so the rule still joins it: `software nfrom`.

## The five lines

`ab559bb` against this revision, `Shopify_text_longform_messy.pdf`. These are the lines the apostrophe damage shows up on.

```
Shopifyn s target focus on SMBs and the potential market size of online retail were seen as key
Shopify n s target focus on SMBs and the potential market size of online retail were seen as key

GMV would have put Shopify in the top 50 online retailers. Thatn s how small the online retail
GMV would have put Shopify in the top 50 online retailers. That n s how small the online retail

and management instincts. Shopifyn s 24 employees are located in Ottawa, Canada. Based on
and management instincts. Shopify n s 24 employees are located in Ottawa, Canada. Based on

Shopifyn s reputation in Ottawa as a local internet startup success story, and based upon Tobins
Shopify n s reputation in Ottawa as a local internet startup success story, and based upon Tobi n s

When Tobi came out to Silicon Valley, many VCs told him theyn d invest only if he moved to the
When Tobi came out to Silicon Valley, many VCs told him they n d invest only if he moved to the
```

On each pair the first line is `ab559bb` and the second is this revision.

## The B383 gate

The B383 gate of 35 passages re-tested 34 passages on five PDFs the join rule never fires on, and one ClearPoint passage was its only live case.

## Technical summary

`INTRA_WORD_FRAGMENT_RE` in `lib/extract-pdf-direct.mjs` now requires two lowercase letters before the optional punctuation. A one-character next item keeps the space. Nothing else in `intraWordPieces` or `joinLine` changed. `scripts/diagnostic/b384/token-delta.mjs` extracts every PDF in the repo at two git revisions and lists tokens that exist only in the later extract.

## Plain-language summary

A PDF whose font turns an apostrophe into a stray letter no longer absorbs that letter into the word in front of it. Names and figures on those lines stay separate, so a quote can still find them. A real word split such as IRRAflow is still joined.
