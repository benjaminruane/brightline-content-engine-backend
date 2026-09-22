# B321. PDF text from the bundled engine

Ran 2026-09-22T12:45:41.177Z.

## 2.1 Timing through extractTextFromSource

PDF_ENGINE=officeparser total wall **755629 ms**.
PDF_ENGINE=direct total wall **1260 ms**.
Ratio officeparser/direct **599.7x**. B319 was 755,216 ms and 1,429 ms.

| id | file | officeparser ms | direct ms | officeparser chars | direct chars |
|----|------|----------------:|----------:|-------------------:|-------------:|
| d01 | 3i-press-release-fy2025.pdf | 101669 | 144 | 156041 | 156076 |
| d02 | 3i-press-release-fy25-highlights.pdf | 22653 | 12 | 6777 | 6724 |
| d03 | 3i-overview-and-strategy-2025.pdf | 80934 | 80 | 53610 | 52883 |
| d04 | hpif-report-march-2026.pdf | 35335 | 33 | 29129 | 29060 |
| d05 | 3i-q1-fy25-performance-update.pdf | 25678 | 15 | 12298 | 12246 |
| d06 | 3i-hy25-highlights.pdf | 4105 | 9 | 7486 | 7436 |
| d07 | pg-annual-results-2025-press-release.pdf | 32286 | 20 | 9743 | 9729 |
| d08 | berkshire-2024-shareholder-letter.pdf | 19176 | 20 | 40118 | 40134 |
| d09 | berkshire-2023-shareholder-letter.pdf | 22228 | 27 | 50117 | 50136 |
| d10 | berkshire-2022-shareholder-letter.pdf | 14638 | 15 | 30964 | 30973 |
| d11 | berkshire-2021-shareholder-letter.pdf | 15686 | 20 | 40913 | 40924 |
| d12 | berkshire-2020-shareholder-letter.pdf | 19208 | 25 | 53357 | 53370 |
| d13 | jpm-ceo-letter-2024.pdf | 171740 | 349 | 220611 | 220690 |
| d14 | oaktree-on-bubble-watch.pdf | 27004 | 66 | 30698 | 30398 |
| d15 | oaktree-nobody-knows-yet-again.pdf | 24294 | 59 | 29977 | 29733 |
| d16 | oaktree-gimme-credit.pdf | 27335 | 57 | 25380 | 25195 |
| d17 | oaktree-the-calculus-of-value.pdf | 30395 | 58 | 37068 | 36769 |
| d18 | oaktree-mr-market-miscalculates.pdf | 25987 | 81 | 22981 | 22597 |
| d19 | oaktree-2024-in-review.pdf | 21327 | 83 | 31988 | 31969 |
| d20 | oaktree-further-thoughts-on-sea-change.pdf | 33951 | 87 | 30537 | 30545 |

## 2.2 Characters versus B319 arm C appendix

No document moved more than 1% from arm C. The port matches the appendix.

| id | arm C chars | port chars | delta | equal |
|----|------------:|-----------:|------:|-------|
| d01 | 160971 | 160971 | +0.00% | true |
| d02 | 6849 | 6849 | +0.00% | true |
| d03 | 53256 | 53256 | +0.00% | true |
| d04 | 29818 | 29818 | +0.00% | true |
| d05 | 12495 | 12495 | +0.00% | true |
| d06 | 7572 | 7572 | +0.00% | true |
| d07 | 9916 | 9916 | +0.00% | true |
| d08 | 40648 | 40648 | +0.00% | true |
| d09 | 51128 | 51128 | +0.00% | true |
| d10 | 31584 | 31584 | +0.00% | true |
| d11 | 41621 | 41621 | +0.00% | true |
| d12 | 54186 | 54186 | +0.00% | true |
| d13 | 221873 | 221873 | +0.00% | true |
| d14 | 30562 | 30562 | +0.00% | true |
| d15 | 29891 | 29891 | +0.00% | true |
| d16 | 25361 | 25361 | +0.00% | true |
| d17 | 36993 | 36993 | +0.00% | true |
| d18 | 22691 | 22691 | +0.00% | true |
| d19 | 32067 | 32067 | +0.00% | true |
| d20 | 30707 | 30707 | +0.00% | true |

## 2.3 Gate 7 verdict comparison

Spend USD 1.9862 list across 108 calls. Kill=false.

### d01 3i-press-release-fy2025.pdf

HTTP 200, 25495 ms, cards 3, moved=true, usd=0.5979895500000001.

Committed quote:

```
3i Group plc announces results for the year to 31 March 2025
```

Committed verdict: supported_full

New quote:

```
3i Group plc announces results for the year to 31 March 2025
```

New verdict: supported

### d02 3i-press-release-fy25-highlights.pdf

HTTP 200, 8033 ms, cards 3, moved=true, usd=0.057621700000000005.

Committed quote:

```
3i Group plc announces results for the year to 31 March 2025
```

Committed verdict: supported_full

New quote:

```
3i Group plc announces results for the year to 31 March 2025
```

New verdict: supported

### d03 3i-overview-and-strategy-2025.pdf

HTTP 200, 6883 ms, cards 1, moved=true, usd=0.0731325.

Committed quote:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

Committed verdict: supported_full

New quote:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

New verdict: supported

### d04 hpif-report-march-2026.pdf

HTTP 200, 9395 ms, cards 1, moved=true, usd=0.05006594999999999.

Committed quote:

```
Seeking cost-effective private Exposure to fast growing, Private markets portfolio investments sourced through hard-to-access companies of seasoned investments across long-term relationships and with, in our view, strong multiple vintages seeded by allocated on a pro-rata basis outperformance potential institutional anchor client $653.0M 57 40+ Fund NAV Companies 2 General Partners 2
```

Committed verdict: conflict

New quote:

```
Exposure to fast growing, hard-to-access companies of seasoned investments across multiple vintages seeded by long-term relationships and with, in our view, strong institutional anchor client outperformance potential allocated on a pro-rata basis
```

New verdict: partial

### d05 3i-q1-fy25-performance-update.pdf

HTTP 200, 7464 ms, cards 1, moved=true, usd=0.034805.

Committed quote:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to 30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

Committed verdict: supported_full

New quote:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to 30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

New verdict: supported

### d06 3i-hy25-highlights.pdf

HTTP 200, 8684 ms, cards 3, moved=true, usd=0.072621.

Committed quote:

```
3i Group plc announces results for the six months to 30 September 2025
```

Committed verdict: supported_full

New quote:

```
3i Group plc announces results for the six months to 30 September 2025
```

New verdict: supported

### d07 pg-annual-results-2025-press-release.pdf

HTTP 200, 7041 ms, cards 1, moved=true, usd=0.029522500000000004.

Committed quote:

```
(none)
```

Committed verdict: (none)

New quote:

```
Press release
Baar-Zug, Switzerland; 10 March 2026 | Ad hoc announcement pursuant to Art. 53 Listing Rules (LR)
```

New verdict: partial

### d08 berkshire-2024-shareholder-letter.pdf

HTTP 200, 7491 ms, cards 1, moved=true, usd=0.0724075.

Committed quote:

```
When discussing problems at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60 years ago: “praise by name, criticize by category.”
```

Committed verdict: supported_full

New quote:

```
When discussing problems at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60 years ago: “praise by name, criticize by category.”
```

New verdict: supported

### d09 berkshire-2023-shareholder-letter.pdf

HTTP 200, 6441 ms, cards 1, moved=true, usd=0.08631.

Committed quote:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

Committed verdict: supported_full

New quote:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

New verdict: supported

### d10 berkshire-2022-shareholder-letter.pdf

HTTP 200, 7965 ms, cards 1, moved=true, usd=0.067815.

Committed quote:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Committed verdict: supported_full

New quote:

```
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

New verdict: supported

### d11 berkshire-2021-shareholder-letter.pdf

HTTP 200, 7102 ms, cards 1, moved=true, usd=0.0633575.

Committed quote:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Committed verdict: supported_full

New quote:

```
Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Berkshire Included Year 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

New verdict: supported

### d12 berkshire-2020-shareholder-letter.pdf

HTTP 200, 6268 ms, cards 1, moved=true, usd=0.076815.

Committed quote:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Committed verdict: supported_full

New quote:

```
Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Berkshire Included Year 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

New verdict: supported

### d13 jpm-ceo-letter-2024.pdf

HTTP 200, 15971 ms, cards 1, moved=true, usd=0.2817175.

Committed quote:

```
We earned revenue in 2024 of $180.6 billion 1 and net income of $58.5 billion, with return on tangible common equity (ROTCE) of 20% 2 , reflecting strong underlying performance across our businesses.
```

Committed verdict: conflict

New quote:

```
We earned revenue in 2024 of $180.6 billion and net income of $58.5 billion, with return on tangible common equity (ROTCE) of 20% , reflecting strong underlying performance across our businesses.
```

New verdict: partial

### d14 oaktree-on-bubble-watch.pdf

HTTP 200, 8882 ms, cards 1, moved=true, usd=0.0515875.

Committed quote:

```
As a result of those experiences, many people these days are on heightened alert for bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the handful of stocks that have been leading it.
```

Committed verdict: supported_full

New quote:

```
As a result of those experiences, many people these days are on heightened alert for bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the handful of stocks that have been leading it.
```

New verdict: supported

### d15 oaktree-nobody-knows-yet-again.pdf

HTTP 200, 7169 ms, cards 1, moved=true, usd=0.053207500000000005.

Committed quote:

```
But I saw no logical choice other than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities Fund VIIb.
```

Committed verdict: supported_full

New quote:

```
But I saw no logical choice other than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities Fund VIIb.
```

New verdict: supported

### d16 oaktree-gimme-credit.pdf

HTTP 200, 7509 ms, cards 1, moved=true, usd=0.0453225.

Committed quote:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond Index.
```

Committed verdict: supported_full

New quote:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond Index.
```

New verdict: supported

### d17 oaktree-the-calculus-of-value.pdf

HTTP 200, 7030 ms, cards 1, moved=true, usd=0.0562425.

Committed quote:

```
January 2 of this year was the 25 th anniversary of my memo bubble.com , the one that put my writing on the map, and I marked the occasion by publishing another memo, called On Bubble Watch .
```

Committed verdict: conflict

New quote:

```
January 2 of this year was the 25 anniversary of my memo bubble.com , the one that put my writing on the map, and I marked the occasion by publishing another memo, called On Bubble Watch.
```

New verdict: supported

### d18 oaktree-mr-market-miscalculates.pdf

HTTP 200, 6938 ms, cards 2, moved=true, usd=0.082595.

Committed quote:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

Committed verdict: supported_full

New quote:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

New verdict: supported

### d19 oaktree-2024-in-review.pdf

HTTP 200, 5581 ms, cards 1, moved=true, usd=0.0500225.

Committed quote:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago has seemed unusual.
```

Committed verdict: supported_full

New quote:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago has seemed unusual.
```

New verdict: supported

### d20 oaktree-further-thoughts-on-sea-change.pdf

HTTP 200, 5898 ms, cards 1, moved=true, usd=0.0498975.

Committed quote:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```

Committed verdict: supported_full

New quote:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```

New verdict: supported

## 3. Deployed extract-draft-text

After deploy landed. Default PDF_ENGINE is direct. (a) and (c) repeated with body pdfEngine=officeparser on the same function.

d13 local direct chars 220690. Deployed direct 220690 (0.00%). Scanned status is unsupported_scanned, not an empty ok.

| case | engine | HTTP | ms | chars | status |
|------|--------|-----:|---:|------:|--------|
| a-text-layer | direct (default) | 200 | 2735 | 335 | ok |
| b-scanned | direct (default) | 200 | 2120 | 0 | unsupported_scanned |
| c-largest-d13 | direct (default) | 200 | 4359 | 220690 | ok |
| a-text-layer | officeparser | 200 | 1427 | 335 | ok |
| c-largest-d13 | officeparser | 200 | 174828 | 220611 | ok |

- a-text-layer: ok=true error=none preview="Vantor Systems - Investment Overview\nVantor Systems generated revenue of $24 million in FY2024, up from $18 million in F"
- b-scanned: ok=true error=none preview=""
- c-largest-d13: ok=true error=none preview="Dear Fellow Shareholders,\nJamie Dimon,\nChairman and\nChief Executive Officer\nAcross the globe, 2024 was yet another year "
- a-text-layer: ok=true error=none preview="Vantor Systems - Investment Overview\nVantor Systems generated revenue of $24 million in FY2024, up from $18 million in F"
- c-largest-d13: ok=true error=none preview="Dear Fellow Shareholders,\nJamie Dimon,\nChairman and\nChief Executive Officer\n[Image: pdf_image_p1_1.bmp]\nAcross the globe"
