# B319. Extractor bake-off

Read-only diagnostic. No model calls. Same twenty B163 PDFs. Defect census copied from `scripts/diagnostic/delivery-check/b163/inspect-and-extract.mjs`. Ran locally 2026-09-22.

Arms: A = officeparser text convert (production). B = pdfjs item order. C = pdfjs grouped by page, y-band, then x.

## S1. The verdict

Put arm A in front of a reviewer until a pdfjs path stamps scanned status. Speed is settled at 530x on this twenty (755 s officeparser, 1.4 s pdfjs). The six Gate 7 misses on B and C are the old extract's flatten and officeparser spaces, not lost sentences, and they are not the stopper.

## S2. Speed

| id | file | wallMs A | wallMs B | wallMs C | A/B |
|----|------|--------:|--------:|--------:|----:|
| d01 | 3i-press-release-fy2025.pdf | 101921 | 153 | 154 | 666x |
| d02 | 3i-press-release-fy25-highlights.pdf | 22663 | 26 | 26 | 872x |
| d03 | 3i-overview-and-strategy-2025.pdf | 80889 | 119 | 119 | 680x |
| d04 | hpif-report-march-2026.pdf | 35378 | 49 | 50 | 722x |
| d05 | 3i-q1-fy25-performance-update.pdf | 25681 | 36 | 36 | 713x |
| d06 | 3i-hy25-highlights.pdf | 4099 | 19 | 19 | 216x |
| d07 | pg-annual-results-2025-press-release.pdf | 32247 | 38 | 38 | 849x |
| d08 | berkshire-2024-shareholder-letter.pdf | 19198 | 40 | 39 | 480x |
| d09 | berkshire-2023-shareholder-letter.pdf | 22246 | 48 | 49 | 463x |
| d10 | berkshire-2022-shareholder-letter.pdf | 14641 | 35 | 35 | 418x |
| d11 | berkshire-2021-shareholder-letter.pdf | 15668 | 39 | 39 | 402x |
| d12 | berkshire-2020-shareholder-letter.pdf | 19224 | 46 | 46 | 418x |
| d13 | jpm-ceo-letter-2024.pdf | 171304 | 194 | 195 | 883x |
| d14 | oaktree-on-bubble-watch.pdf | 26838 | 74 | 74 | 363x |
| d15 | oaktree-nobody-knows-yet-again.pdf | 24319 | 66 | 66 | 368x |
| d16 | oaktree-gimme-credit.pdf | 27335 | 74 | 74 | 369x |
| d17 | oaktree-the-calculus-of-value.pdf | 30385 | 67 | 67 | 454x |
| d18 | oaktree-mr-market-miscalculates.pdf | 25975 | 92 | 92 | 282x |
| d19 | oaktree-2024-in-review.pdf | 21315 | 123 | 123 | 173x |
| d20 | oaktree-further-thoughts-on-sea-change.pdf | 33890 | 88 | 88 | 385x |
| | **total** | **755216** | **1426** | **1429** | **530x** |

The 21 September 500x figure was officeparser wall (text plus chunks) against a raw-pdfjs probe on a handful of files. B312 text convert on `3i-press-release-fy2025.pdf` was 103,639 ms. This pass, same file, arm A (text convert only, structure flag off) versus arm B:

- d01 3i-press-release-fy2025.pdf: A 101921 ms, B 153 ms, 666.2x. textConvertMs 101879.
- d02 3i-press-release-fy25-highlights.pdf: A 22663 ms, B 26 ms, 871.7x. textConvertMs 22662.
- d03 3i-overview-and-strategy-2025.pdf: A 80889 ms, B 119 ms, 679.7x. textConvertMs 80888.
- d04 hpif-report-march-2026.pdf: A 35378 ms, B 49 ms, 722.0x. textConvertMs 35377.

396 ms was the stated 21 September pdfjs figure for d01. It is not in a committed artefact. This pass measured arm B on d01 as recorded in the table. Combined A/B on these four is the correction to "500x": it is the ratio of officeparser text convert to pdfjs getTextContent, not a second convert.

## S3. Reading order

Gate 7 quotes (whitespace-normalised substring). Probe set: `reviews/dNN-review-extract.json` `verdictWithQuote.quote`. n=19.

- Arm A hits: 19/19
- Arm B hits: 13/19 misses: d04, d10, d11, d12, d13, d17
- Arm C hits: 13/19 misses: d04, d10, d11, d12, d13, d17

A miss means the product could no longer quote that exact Gate 7 string from this extract. d07 has `verdictWithQuote: null` (draft cut at `Art.`), so n=19.

The six B/C misses, checked against the B/C files:

- d04: the probe is column-interleaved junk that only arm A produces. B and C print the HPIF cover as prose. That miss is A being worse.
- d10, d11, d12: the probe is the flattened Berkshire table header as one line (`in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included`). B and C split the header across lines in a different word order. The 1965 row still prints.
- d13: arm A has `$180.6 billion 1` (space before the footnote). Arm B has `$180.6 billion1`. The sentence is there.
- d17: arm A has `25 th`. Arm B has `25th`. The sentence is there.

### d03 3i-overview-and-strategy-2025.pdf

Gate 7 quote: "For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216."

**Arm A** hit=true

```
lined investment and active management of our assets, driving sustainable growth in our investee companies. For more information and regular updates www.3i.com For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216. Disclaimer The Annual report and accounts have been prepared solely to provide information to shareholders. They should not be relied on by any other party or 
```

**Arm B** hit=true

```
lined investment and active management of our assets, driving sustainable growth in our investee companies. For more information and regular updates www.3i.com For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216. Disclaimer The Annual report and accounts have been prepared solely to provide information to shareholders. They should not be relied on by any other party or 
```

**Arm C** hit=true

```
lined investment and active management of our assets, driving sustainable growth in our investee companies. For more information and regular updates www.3i.com For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216. Disclaimer The Annual report and accounts have been prepared solely to provide information to shareholders. They should not be relied on by any other party or 
```

### d04 hpif-report-march-2026.pdf

Gate 7 quote: "Seeking cost-effective private Exposure to fast growing, Private markets portfolio investments sourced through hard-to-access companies of seasoned investments across long-term relationships and with, in our view, strong multiple vintages seeded by allocated on a pro-rata basis outperformance potential institutional anchor client $653.0M 57 40+ Fund NAV Companies 2 General Partners 2"

**Arm A** hit=true

```
 Direct deal flow alongside Focus on small and middle Diversified seed portfolio experienced managers market private companies from a US institutional investor Seeking cost-effective private Exposure to fast growing, Private markets portfolio investments sourced through hard-to-access companies of seasoned investments across long-term relationships and with, in our view, strong multiple vintages seeded by allocated on a pro-rata basis outperformance potential institutional anchor client $653.0M 57 40+ Fund NAV Companies 2 General Partners 2 HPIF portfolio exposures 3 Strategy Industry 4 Geography V intage  Direct 88%  Application Software 15%  North America 70%  2025 26%  Secondary 12%  10% 
```

**Arm B** hit=false

```
Key fund attributes
HarbourVest Private Investments Fund
("HPIF")
March 2026 Report
Unless otherwise stated, data is as of March 31, 2026
About HarbourVest1
HarbourVest has a 40+ year track record of investing in private equity through a variety of private market cycles, seeking to
leverage its deep network of relationships, integrated investment strategy approach, proactive deal sourcing, and rigorous
```

**Arm C** hit=false

```
HarbourVest Private Investments Fund
("HPIF")
March 2026 Report
Unless otherwise stated, data is as of March 31, 2026
1
About HarbourVest
HarbourVest has a 40+ year track record of investing in private equity through a variety of private market cycles, seeking to
leverage its deep network of relationships, integrated investment strategy approach, proactive deal sourcing, and rigorous
```

## S4. The three flattened-table letters (d10, d11, d12)

Opening region from each arm. The 19 September ruling requires the product to detect a tables-first region. None of these arms emit a table structure. The question is whether any arm makes the table distinguishable from prose.

### d10 berkshire-2022-shareholder-letter.pdf

**Arm A** census five-plus-number lines: 4

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8.1 18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (2.5) (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (48.7) (26.4)
1975 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2.5 37.2
```

**Arm B** census five-plus-number lines: 4

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
Year
in Per-Share
Market Value of
Berkshire
in S&P 500
with Dividends
Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
```

**Arm C** census five-plus-number lines: 4

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (3.4)   (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   13.3   30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   77.8   11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   19.4   (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (4.6)   3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   80.5   14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   8.1   18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (2.5)   (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (48.7)   (26.4)
```

### d11 berkshire-2021-shareholder-letter.pdf

**Arm A** census five-plus-number lines: 17

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8.1 18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (2.5) (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (48.7) (26.4)
1975 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2.5 37.2
```

**Arm B** census five-plus-number lines: 17

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
Year
in Per-Share
Market Value of
Berkshire
in S&P 500
with Dividends
Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
```

**Arm C** census five-plus-number lines: 16

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (3.4)   (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   13.3   30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   77.8   11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   19.4   (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (4.6)   3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   80.5   14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   8.1   18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (2.5)   (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (48.7)   (26.4)
```

### d12 berkshire-2020-shareholder-letter.pdf

**Arm A** census five-plus-number lines: 18

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8.1 18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (2.5) (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (48.7) (26.4)
1975 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2.5 37.2
```

**Arm B** census five-plus-number lines: 18

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
Year
in Per-Share
Market Value of
Berkshire
in S&P 500
with Dividends
Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (3.4) (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 13.3 30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 77.8 11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 19.4 (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . (4.6) 3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 80.5 14.6
```

**Arm C** census five-plus-number lines: 18

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
1966 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (3.4)   (11.7)
1967 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   13.3   30.9
1968 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   77.8   11.0
1969 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   19.4   (8.4)
1970 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (4.6)   3.9
1971 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   80.5   14.6
1972 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   8.1   18.9
1973 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (2.5)   (14.8)
1974 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   (48.7)   (26.4)
```

No arm makes the opening table distinguishable from prose. Numbers sit in the same stream as sentences. The census still fires `linesWithFivePlusNumberTokens` on the flatten. Detection is not present.

## S5. What position data would fix

Most B-vs-A character losses are under 1%. The census labels them `content` because whitespace-normalised length also moved by a few characters (footnote glue, ordinals, leader dots). Position data would not restore those. Position data would close column-interleave (d03, d04) and would let a later pass tag a y-band with several digit-heavy items as a table (d10-d12). It would not invent table structure the PDF does not store.

**d01 3i-press-release-fy2025.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps.

**d02 3i-press-release-fy25-highlights.pdf.** B loses content characters versus A.

**d03 3i-overview-and-strategy-2025.pdf.** B loses content characters versus A; C loses content characters versus A; B has more mid-sentence hard wraps; C has more mid-sentence hard wraps.

**d04 hpif-report-march-2026.pdf.** B loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps; C has more mid-sentence hard wraps.

**d05 3i-q1-fy25-performance-update.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps.

**d06 3i-hy25-highlights.pdf.** B loses content characters versus A.

**d07 pg-annual-results-2025-press-release.pdf.** B loses content characters versus A.

**d08 berkshire-2024-shareholder-letter.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps.

**d09 berkshire-2023-shareholder-letter.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps.

**d10 berkshire-2022-shareholder-letter.pdf.** B loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps.

**d11 berkshire-2021-shareholder-letter.pdf.** B loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps.

**d12 berkshire-2020-shareholder-letter.pdf.** B loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps.

**d13 jpm-ceo-letter-2024.pdf.** B loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps; C has more mid-sentence hard wraps.

**d14 oaktree-on-bubble-watch.pdf.** B loses content characters versus A; C loses content characters versus A; B has more mid-sentence hard wraps.

**d15 oaktree-nobody-knows-yet-again.pdf.** B loses content characters versus A; C loses content characters versus A; B has more mid-sentence hard wraps.

**d16 oaktree-gimme-credit.pdf.** B loses content characters versus A; C loses content characters versus A; B has more mid-sentence hard wraps.

**d17 oaktree-the-calculus-of-value.pdf.** B loses content characters versus A; C loses content characters versus A; B misses the Gate 7 quote that A keeps; C misses the Gate 7 quote that A keeps; B has more mid-sentence hard wraps.

**d18 oaktree-mr-market-miscalculates.pdf.** B loses content characters versus A; C loses content characters versus A; B has more mid-sentence hard wraps.

**d19 oaktree-2024-in-review.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps; C has more mid-sentence hard wraps.

**d20 oaktree-further-thoughts-on-sea-change.pdf.** B loses content characters versus A; B has more mid-sentence hard wraps.

Worked example. pdfjs `getTextContent` items already carry `transform` (index 4 is x, 5 is y), `width`, `fontName`, and `hasEOL`. Arm C uses only y-band then x. A later pass could use the same fields to mark a row as tabular when several items share a y-band and three or more have digit-heavy `str`, without a new engine.

Values from d03 page 1, first items:

| str | x | y | width | fontName | hasEOL |
|-----|--:|--:|------:|----------|--------|
| "Our purpose" | 147.2 | 710.4 | 153.15999999999997 | g_d5_f3 | true |
| "We generate attractive returns for" | 147.2 | 661.7 | 329.69200000000006 | g_d5_f3 | true |
| "our shareholders and co-investors" | 147.2 | 635.3 | 329.7800000000001 | g_d5_f3 | true |
| "by investing in private equity and" | 147.2 | 608.9 | 322.32200000000023 | g_d5_f3 | true |
| "infrastructure assets." | 147.2 | 582.5 | 199.25400000000008 | g_d5_f3 | true |
| "As proprietary capital investors," | 147.2 | 550.1 | 306.83400000000006 | g_d5_f3 | true |
| "we have a long-term, responsible" | 147.2 | 523.7 | 324.06000000000006 | g_d5_f3 | true |
| "approach." | 147.2 | 497.3 | 98.648 | g_d5_f3 | true |

Those x/y pairs are what would close a column-interleave: items with similar y and far-apart x belong to one visual row, not to the naive stream. Arm C already groups that way. It does not then tag the row as a table.

## S6. Honesty surfaces

From C6. What a direct-engine path would have to produce to keep each surface truthful.

- **scanned status (`ok` / `unsupported_scanned`).** Production reads extracted text after stripping officeparser `[Image:...]` placeholders (`meaningfulExtractedCharCount`), then compares to `SCANNED_NEAR_EMPTY_CHARS` 50 (`lib/extract-text-from-source.mjs`). A pdfjs path would have to run the same length test on its own text. It would not see `[Image:]` tokens. Empty text must still stamp `unsupported_scanned`, not `ok`.
- **computeGuardrailForSource.** Reads the extract string plus `extractedTextLength`, `rawBytesLength`, `fileType`, token probes. Not engine-specific. A direct path keeps this if it still passes the same text and the decoded PDF byte length.
- **sourceIngestionWarning.** Fires when a PDF extract has `very_low_text` or `empty_text` from `computeExtractionHealth` on that text. Same requirement: do not skip the health object.
- **extraction.structure.** Built from officeparser chunks metadata (`pageNumber` / `slideNumber` / `sheetName`). Default off since B317. Empty `{pages:[],slides:[],sheets:[]}` is not a failure. A pdfjs path can fill `pages` from `doc.numPages` plus per-page item text. Slides and sheets have no pdfjs equivalent; those stay officeparser for pptx/xlsx.

Scanned fixture `tests/extraction-corpus/files/image_only.pdf`: arm A chars=27 status=unsupported_scanned warnings=["very_low_text","likely_scanned_pdf","unsupported_scanned"]; arm B chars=0; arm C chars=0.

**A scanned PDF returns empty or near-empty text on arms B and C, with no warning field at all.** The diagnostic arms do not stamp `unsupported_scanned`. A product swap that returned this string without the status would look like a successful empty source.

## S7. What this does not settle

- Whether a production Review's matcher scores change. Quotes were probed as substrings, not re-matched.
- Docx, pptx, xlsx. pdfjs cannot read them. officeparser stays for those types.
- OCR. Both stacks have OCR off in production.
- Function payload size if `@napi-rs/canvas` is added or dropped on Linux.
- A table detector. Position data exists. No arm implements the 19 September detect-and-refuse rule.
- Upload-time extraction. This pass does not move the convert off the Review request.

## Recommendation

Do not swap production in this spec. The next PDF-only spec can take arm B or arm C if it stamps `unsupported_scanned` on empty text and leaves officeparser on docx, pptx, and xlsx. Do not wait for byte-identical quotes against arm A. Tables stay flattened on every arm until a later detect-and-refuse pass that reads the x/y already on the items.

## Appendix. Characters versus arm A

| id | chars A | chars B | B vs A | B missing | chars C | C vs A | C missing |
|----|--------:|--------:|-------:|-----------|--------:|-------:|-----------|
| d01 | 156041 | 155929 | -0.1% | content | 160971 | +3.2% | - |
| d02 | 6777 | 6717 | -0.9% | content | 6849 | +1.1% | - |
| d03 | 53610 | 52798 | -1.5% | content | 53256 | -0.7% | content |
| d04 | 29129 | 28974 | -0.5% | content | 29818 | +2.4% | - |
| d05 | 12298 | 12234 | -0.5% | content | 12495 | +1.6% | - |
| d06 | 7486 | 7422 | -0.9% | content | 7572 | +1.1% | - |
| d07 | 9743 | 9665 | -0.8% | content | 9916 | +1.8% | - |
| d08 | 40118 | 40101 | -0.0% | content | 40648 | +1.3% | - |
| d09 | 50117 | 50108 | -0.0% | content | 51128 | +2.0% | - |
| d10 | 30964 | 30949 | -0.0% | content | 31584 | +2.0% | - |
| d11 | 40913 | 40905 | -0.0% | content | 41621 | +1.7% | - |
| d12 | 53357 | 53342 | -0.0% | content | 54186 | +1.6% | - |
| d13 | 220611 | 219584 | -0.5% | content | 221873 | +0.6% | - |
| d14 | 30698 | 30383 | -1.0% | content | 30562 | -0.4% | content |
| d15 | 29977 | 29720 | -0.9% | content | 29891 | -0.3% | content |
| d16 | 25380 | 25180 | -0.8% | content | 25361 | -0.1% | content |
| d17 | 37068 | 36754 | -0.8% | content | 36993 | -0.2% | content |
| d18 | 22981 | 22571 | -1.8% | content | 22691 | -1.3% | content |
| d19 | 31988 | 31959 | -0.1% | content | 32067 | +0.2% | - |
| d20 | 30537 | 30522 | -0.0% | content | 30707 | +0.6% | - |

## Appendix. Defect census (B163 code)

| id | arm | hard wraps | 5+ number lines | repeating lines | lone 1-3 digit |
|----|-----|----------:|----------------:|----------------:|---------------:|
| d01 | A | 674 | 154 | 149 | 56 |
| d01 | B | 775 | 149 | 172 | 56 |
| d01 | C | 668 | 150 | 156 | 84 |
| d02 | A | 26 | 7 | 0 | 3 |
| d02 | B | 26 | 7 | 0 | 3 |
| d02 | C | 26 | 7 | 0 | 4 |
| d03 | A | 366 | 23 | 32 | 4 |
| d03 | B | 578 | 17 | 58 | 2 |
| d03 | C | 456 | 20 | 73 | 18 |
| d04 | A | 133 | 13 | 21 | 8 |
| d04 | B | 144 | 11 | 21 | 7 |
| d04 | C | 137 | 11 | 27 | 31 |
| d05 | A | 46 | 14 | 0 | 4 |
| d05 | B | 47 | 14 | 0 | 4 |
| d05 | C | 46 | 14 | 0 | 5 |
| d06 | A | 31 | 4 | 0 | 2 |
| d06 | B | 31 | 4 | 0 | 1 |
| d06 | C | 31 | 4 | 0 | 6 |
| d07 | A | 47 | 14 | 0 | 6 |
| d07 | B | 47 | 14 | 0 | 0 |
| d07 | C | 46 | 13 | 0 | 20 |
| d08 | A | 249 | 2 | 16 | 15 |
| d08 | B | 251 | 2 | 16 | 15 |
| d08 | C | 249 | 2 | 16 | 15 |
| d09 | A | 297 | 3 | 10 | 16 |
| d09 | B | 298 | 3 | 10 | 16 |
| d09 | C | 294 | 3 | 10 | 19 |
| d10 | A | 146 | 4 | 7 | 10 |
| d10 | B | 148 | 4 | 7 | 10 |
| d10 | C | 145 | 4 | 7 | 11 |
| d11 | A | 185 | 17 | 0 | 11 |
| d11 | B | 186 | 17 | 0 | 11 |
| d11 | C | 185 | 16 | 0 | 11 |
| d12 | A | 252 | 18 | 8 | 14 |
| d12 | B | 253 | 18 | 8 | 14 |
| d12 | C | 252 | 18 | 8 | 14 |
| d13 | A | 1433 | 112 | 16 | 12 |
| d13 | B | 2649 | 45 | 46 | 44 |
| d13 | C | 2063 | 67 | 27 | 79 |
| d14 | A | 186 | 2 | 20 | 9 |
| d14 | B | 187 | 2 | 20 | 9 |
| d14 | C | 186 | 2 | 20 | 9 |
| d15 | A | 205 | 0 | 18 | 8 |
| d15 | B | 208 | 0 | 18 | 8 |
| d15 | C | 205 | 0 | 18 | 8 |
| d16 | A | 175 | 0 | 14 | 7 |
| d16 | B | 177 | 0 | 14 | 7 |
| d16 | C | 174 | 0 | 14 | 7 |
| d17 | A | 265 | 0 | 22 | 10 |
| d17 | B | 267 | 0 | 22 | 10 |
| d17 | C | 265 | 0 | 25 | 10 |
| d18 | A | 149 | 0 | 31 | 8 |
| d18 | B | 158 | 0 | 36 | 8 |
| d18 | C | 148 | 0 | 36 | 8 |
| d19 | A | 209 | 0 | 11 | 8 |
| d19 | B | 216 | 0 | 9 | 8 |
| d19 | C | 210 | 0 | 18 | 8 |
| d20 | A | 208 | 0 | 26 | 8 |
| d20 | B | 217 | 0 | 27 | 8 |
| d20 | C | 205 | 0 | 36 | 8 |
