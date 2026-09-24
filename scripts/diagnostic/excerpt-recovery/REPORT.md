# B325. The excerpt comes from the source, not from the model

Id: **B325**. Written 2026-09-24. No model calls. USD 0.

This file is the committed record of Part 0, the design, the build, and the recorded-card measurement.

Window rule pinned here. Floor `DEFAULT_SIMILARITY_FLOOR = 0.85`. Tie delta `0.005`. Candidate starts align each number and each word of 5+ letters from the pointer onto the same token in the source, then try window lengths `n-2`, `n`, `n+2`, `n+4` on the repair-normalised source. A tie is a miss. Whatever step succeeds, the displayed text is `source.slice(start, end)`.

## Part 0A. Factual claims

C1 BLOCKING. **PARTLY.** `scripts/diagnostic/extractor-swap/outputs/d17-recheck.json` L11 `supportSpan0` is `the 25 anniversary` (no `th`). `outputs/d17-gate7.json` L23 `newVerdict.quote` is the same. `scripts/diagnostic/extractor-bakeoff/outputs/d17-B.txt` L11 is `the 25th anniversary`. Arm C, the live engine, `d17-C.txt` L10 is `the 25 anniversary` with doubled spaces, not `25th`. `B321-CORRECTION.md` recorded officeparser `25 th` vs the model's `25 anniversary`. The locator failed on those two characters. Kill is FALSE-only, so the build proceeds. The unit test uses a source that contains `25th` so the recovery of the missing ordinal is pinned.

C2 BLOCKING. **TRUE.** Displayed excerpts taken from model output before this spec, both repos:

- Card face: `qcCard.primaryExcerpt` / `primaryExcerptText`, set in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` from `gateExcerpt`, which returned the model's `passage` string on an exact hit. Frontend `cardExcerptDisplay.js` `resolveCardExcerpt` reads those fields.
- Drawer span: `qcCard.supportSpans[].passage` was the model's typing; highlight used source offsets from `locatePassageInSource` but the stored passage was still the pointer. Frontend `StatementReviewCard.jsx` disagreement rows and `sourceRelationPrefix.js` render `span.passage`.
- Export: `lib/qc/export-review-data.mjs` `buildReviewData` copies `qcCard.primaryExcerptText`.
- Reviewer assessment: `lib/qc/constructive-feedback.mjs` `pickSourceSays` reads `card.primaryExcerpt`.

All four now receive the source slice from assembly. `conflictExcerpt.passage` is recovered the same way.

C3 BLOCKING. **TRUE.**

- `hasRealExcerpt`: true when the gated primary passage is a non-empty string. That is the flag the card and export use for "there is an excerpt to show".
- `excerptNotLocatable`: true when a match was `passageRejected`, or when a non-empty pointer failed the gate. B259 copy on the card.
- `gateExcerpt`: used to require a support-span overlap plus `source.includes(model text)`, and then **returned the model text**. After B325 it calls `recoverExcerptFromSource` and returns `source.slice(start, end)` or null.

The reviewer sees `primaryExcerpt` (gated slice or null) and `displayVerdict`. B322 remapped a Confirmed miss to Not checked. This spec remaps it to Unverifiable.

C4 CHECK. **Cannot reuse quote-locate as the slicer.** `lib/qc/quote-locate.mjs` `normalizeForLocate` collapses whitespace and folds curly quotes. It has no dash fold and no original-index map, so it cannot return source characters. Evidence already had `repairNormaliseWithMap` in the widened matcher (R7.B40). B325 moved that map into `lib/qc/excerpt-from-source.mjs` and reuses it for step 2. `stage2-match-multipassage.mjs` re-exports the same functions.

C5 CHECK. **TRUE.** `UNKNOWN_EVIDENCE_VERDICT_LABEL = "Unverifiable"` in `lib/qc/evidence-display-verdict.mjs` L15. The same string is now also the allowlisted label for slug `unverifiable`. Frontend `displayVerdictLabels.js` used it as the unknown fallback (B232). Until this spec, nothing user-facing showed it except an unrecognised `displayVerdict` slug. The miss state now uses the allowlisted slug `unverifiable`, so the label is Unverifiable on purpose.

## Part 0B. Design

B0. Built this design, not a silent accept of B2's n-gram window.

The model's passage is a pointer. `recoverExcerptFromSource` tries, in order, all deterministic:

1. Exact `source.indexOf(pointer)`.
2. Repair-normalised substring with the R7.B40 map (whitespace collapse, curly quotes, en/em dashes), then translate back to source indices.
3. Best-matching window. Candidate starts are token-aligned (numbers and words of 5+ letters), not every character n-gram. A typo next to a number (`25` vs `25th`) makes n-grams miss the true start; aligning on `25` and `anniversary` does not. Window lengths `n-2`, `n`, `n+2`, `n+4`. Floor 0.85. Tie delta 0.005. Two windows within the delta is a miss.

Then the figures guard: every number, currency code, month name, and multi-word proper noun in the pointer must appear in the recovered slice. EUR 95 vs EUR 59 is a miss.

A miss on a card that would otherwise read Confirmed becomes `displayVerdict: unverifiable` with `evidenceNotReviewedReason: excerpt_not_locatable`. The row is Unverifiable, not Confirmed, not Not checked. `supportState` is unchanged. Not checked stays for a check that was off or did not run.

No source text is a miss. The model's typing is never a fallback.

B1 **AGREE.** Card, drawer spans, export, assessment all take the source slice from assembly.

B2 **AMEND.** Reuse `repairNormaliseWithMap`, not quote-locate. Step 3 is token-anchored, not every n-gram. Floor, tie, and lengths pinned above.

B3 **AGREE.** Figures guard is pure code.

B4 **AGREE.** Label Unverifiable. State slug `unverifiable`. Reason slug `excerpt_not_locatable`. If Ben rules a different word, change the label string only.

B5 **AGREE.** Not checked is off or did-not-run.

B6 **AGREE.** No verdict matcher, rulebook, or supported-count change. QRS still treats unverifiable as incomplete (`Not fully checked`) so a miss cannot look Ready. The Not checked filter does not include unverifiable cards.

## Part 1. Build

- `lib/qc/excerpt-from-source.mjs` recovers the slice.
- `lib/qc/excerpt-locate.mjs` `gateExcerpt` routes through it. `rewriteSpanFromSource` rewrites every support span to a source slice.
- `stage7-assemble-card.mjs` honesty remap is `unverifiable`. Conflict excerpt recovered the same way.
- `evidence-display-verdict.mjs` allowlists `unverifiable` -> Unverifiable. Count class `unverifiable`.
- Frontend: same label, amber evidence dot, `summariseReview.js` class.
- Tests `tests/excerpt-from-source.test.mjs`.

## Part 2. Measure

Corpus: 20 extractor-swap `dNN-gate7.json` quotes against bakeoff `dNN-C.txt`, plus every non-empty `primaryExcerpt` / `conflictExcerpt.passage` / `supportSpans[].passage` on top-level `scripts/diagnostic/delivery-check/b163/reviews/dNN-review.json` cards against that review's `sources[].text`. 56 pointers with source text. No model calls. Machine dump: `measure-recovery.json`.

### 2.1 How often the model mis-quotes

37 of 56 recorded pointers are **not** an exact substring of their source (`source.includes(pointer)` is false). 19 of 56 are an exact hit. Almost all of the 37 are whitespace: newlines in the PDF extract vs a single space in the model's typing.

### 2.2 How many recover, by step

Floor 0.85:

- exact: 19
- normalised: 33
- window: 3
- miss: 1

55 of 56 recover. The miss is `extractor-swap/d04-gate7.json`, reason `ambiguous_tie`.

### 2.4 Figures guard

0 recoveries rejected. No printed rejections.

### 2.5 The floor

Looser 0.75 and stricter 0.90 produce the same 2.2 counts as 0.85. The three window scores are 0.980, 0.995, and 0.990, all above 0.90. 0.85 is not the binding constraint on this corpus. It is kept because the d17 ordinal case in the unit test scores about 0.90, and a floor of 0.90 would still pass that case, while a much looser floor is not needed. No recovery was killed, so the floor was not tuned around a bad window.

### Kill check on 2.3

Every recovered slice is the same passage with PDF whitespace or page markers restored. None plainly fails to support the claim. The d13 window inserts the PDF's `1` and `2` footnote markers that sit inside the sentence; the figures `$180.6`, `$58.5`, and `20%` are still in the slice. d17 against arm C recovers arm C's `25 anniversary` (arm C dropped `th`; arm B has `25th`). That is the source's characters. d04's ambiguous tie is a miss, not a guessed window.

The 2.3 print follows. Full JSON is `measure-recovery.json`.


## 2.3 Every recovery (pointer vs source slice)

### 1. extractor-swap/d01-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the year to 31 March 2025
```

Recovered source text:

```
3i Group plc announces results for the year
to 31 March 2025
```

### 2. extractor-swap/d02-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the year to 31 March 2025
```

Recovered source text:

```
3i Group plc announces results for the year
to 31 March 2025
```

### 3. extractor-swap/d03-gate7.json (gate7.quote) step=exact sim=1.0000

Pointer:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

Recovered source text:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

### 4. extractor-swap/d05-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to 30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

Recovered source text:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to
30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

### 5. extractor-swap/d06-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the six months to 30 September 2025
```

Recovered source text:

```
3i Group plc announces results for the six months
to 30 September 2025
```

### 6. extractor-swap/d07-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Press release
Baar-Zug, Switzerland; 10 March 2026 | Ad hoc announcement pursuant to Art. 53 Listing Rules (LR)
```

Recovered source text:

```
Press release
Baar-Zug, Switzerland; 10 March 2026 |   Ad hoc announcement pursuant to Art. 53 Listing Rules (LR)
```

### 7. extractor-swap/d08-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
When discussing problems at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60 years ago: “praise by name, criticize by category.”
```

Recovered source text:

```
When discussing problems
at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60
years ago: “praise by name, criticize by category.”
```

### 8. extractor-swap/d09-gate7.json (gate7.quote) step=exact sim=1.0000

Pointer:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

Recovered source text:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

### 9. extractor-swap/d10-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
```

### 10. extractor-swap/d11-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Berkshire Included Year 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
```

### 11. extractor-swap/d12-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Berkshire Included Year 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Berkshire Included
Year
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .   49.5   10.0
```

### 12. extractor-swap/d13-gate7.json (gate7.quote) step=window sim=0.9799

Pointer:

```
We earned revenue in 2024 of $180.6 billion and net income of $58.5 billion, with return on tangible common equity (ROTCE) of 20% , reflecting strong underlying performance across our businesses.
```

Recovered source text:

```
We earned revenue in 2024 of
1  
$180.6 billion and net income of $58.5 billion, with return on tangible common
2
equity (ROTCE) of 20% , reflecting strong underlying performance across our
businesses.
```

### 13. extractor-swap/d14-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
As a result of those experiences, many people these days are on heightened alert for bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the handful of stocks that have been leading it.
```

Recovered source text:

```
As a result of those experiences, many people these days are on heightened alert for
bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the
handful of stocks that have been leading it.
```

### 14. extractor-swap/d15-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
But I saw no logical choice other than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities Fund VIIb.
```

Recovered source text:

```
But I saw no logical choice other
than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities
Fund VIIb.
```

### 15. extractor-swap/d16-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond Index.
```

Recovered source text:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond
Index.
```

### 16. extractor-swap/d17-gate7.json (gate7.quote) step=window sim=0.9947

Pointer:

```
January 2 of this year was the 25 anniversary of my memo bubble.com , the one that put my writing on the map, and I marked the occasion by publishing another memo, called On Bubble Watch.
```

Recovered source text:

```
January 2 of this year was the 25 anniversary of my memo   bubble.com , the one that put my writing on
the map, and I marked the occasion by publishing another memo, called   On Bubble Watch 
```

### 17. extractor-swap/d18-gate7.json (gate7.quote) step=exact sim=1.0000

Pointer:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

Recovered source text:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

### 18. extractor-swap/d19-gate7.json (gate7.quote) step=normalised sim=1.0000

Pointer:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago has seemed unusual.
```

Recovered source text:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago
has seemed unusual.
```

### 19. extractor-swap/d20-gate7.json (gate7.quote) step=exact sim=1.0000

Pointer:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```

Recovered source text:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```

### 20. b163/d01-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the year to 31 March 2025
```

Recovered source text:

```
3i Group plc announces results for the year
to 31 March 2025
```

### 21. b163/d01-review.json#1 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
A year of consistently strong growth
```

Recovered source text:

```
A year of consistently strong growth
```

### 22. b163/d01-review.json#1 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
A year of consistently strong growth
```

Recovered source text:

```
A year of consistently strong growth
```

### 23. b163/d01-review.json#2 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per share of 2,542 pence (31 March 2024: 2,085 pence).
```

Recovered source text:

```
Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per
share of 2,542 pence (31 March 2024: 2,085 pence).
```

### 24. b163/d02-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the year to 31 March 2025
```

Recovered source text:

```
3i Group plc announces results for the year
to 31 March 2025
```

### 25. b163/d02-review.json#1 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
A year of consistently strong growth
```

Recovered source text:

```
A year of consistently strong growth
```

### 26. b163/d02-review.json#1 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
A year of consistently strong growth
```

Recovered source text:

```
A year of consistently strong growth
```

### 27. b163/d02-review.json#2 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per share of 2,542 pence (31 March 2024: 2,085 pence).
```

Recovered source text:

```
Total return of £5,049 million or 25% on opening shareholders’ funds (2024: £3,839 million, 23%) and NAV per
share of 2,542 pence (31 March 2024: 2,085 pence).
```

### 28. b163/d03-review.json#0 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

Recovered source text:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

### 29. b163/d03-review.json#0 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

Recovered source text:

```
For definitions of our financial terms used throughout this report, please see our Glossary on pages 214 to 216.
```

### 30. b163/d04-review.json#0 (conflictExcerpt) step=window sim=0.9901

Pointer:

```
Seeking cost-effective private Exposure to fast growing, Private markets portfolio investments sourced through hard-to-access companies of seasoned investments across long-term relationships and with, in our view, strong multiple vintages seeded by allocated on a pro-rata basis outperformance potent...
```

Recovered source text:

```
Seeking cost-effective private Exposure to fast growing, Private markets portfolio
investments sourced through hard-to-access companies of seasoned investments across
long-term relationships and with, in our view, strong multiple vintages seeded by
allocated on a pro-rata basis outperformance potential
```

### 31. b163/d04-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Seeking cost-effective private Exposure to fast growing, Private markets portfolio investments sourced through hard-to-access companies of seasoned investments across long-term relationships and with, in our view, strong multiple vintages seeded by allocated on a pro-rata basis outperformance potential institutional anchor client $653.0M 57 40+ Fund NAV Companies 2 General Partners 2
```

Recovered source text:

```
Seeking cost-effective private Exposure to fast growing, Private markets portfolio
investments sourced through hard-to-access companies of seasoned investments across
long-term relationships and with, in our view, strong multiple vintages seeded by
allocated on a pro-rata basis outperformance potential institutional anchor client
$653.0M 57 40+
Fund NAV Companies 2 General Partners 2
```

### 32. b163/d05-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to 30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

Recovered source text:

```
Increase in NAV per share to 2,167 pence (31 March 2024: 2,085 pence) and total return of 4% for the three months to
30 June 2024, after a negative foreign exchange translation impact of £113 million or 12 pence.
```

### 33. b163/d06-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
3i Group plc announces results for the six months to 30 September 2025
```

Recovered source text:

```
3i Group plc announces results for the six months
to 30 September 2025
```

### 34. b163/d06-review.json#1 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
3i Group delivered strong performance in the first half of FY2026
```

Recovered source text:

```
3i Group delivered strong performance in the first half of FY2026
```

### 35. b163/d06-review.json#1 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
3i Group delivered strong performance in the first half of FY2026
```

Recovered source text:

```
3i Group delivered strong performance in the first half of FY2026
```

### 36. b163/d06-review.json#2 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
Total return of £3,291 million or 13% on opening shareholders’ funds (September 2024: £2,046 million, 10%).
```

Recovered source text:

```
Total return of £3,291 million or 13% on opening shareholders’ funds (September 2024: £2,046 million, 10%).
```

### 37. b163/d06-review.json#2 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
Total return of £3,291 million or 13% on opening shareholders’ funds (September 2024: £2,046 million, 10%).
```

Recovered source text:

```
Total return of £3,291 million or 13% on opening shareholders’ funds (September 2024: £2,046 million, 10%).
```

### 38. b163/d08-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
When discussing problems at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60 years ago: “praise by name, criticize by category.”
```

Recovered source text:

```
When discussing problems
at specific subsidiaries, we do, however, try to follow the advice Tom Murphy gave to me 60
years ago: “praise by name, criticize by category.”
```

### 39. b163/d09-review.json#0 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

Recovered source text:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

### 40. b163/d09-review.json#0 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

Recovered source text:

```
Charlie Munger died on November 28, just 33 days before his 100th birthday.
```

### 41. b163/d10-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

### 42. b163/d11-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

### 43. b163/d12-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Berkshire’s Performance vs. the S&P 500 Annual Percentage Change in Per-Share in S&P 500 Market Value of with Dividends Year Berkshire Included 1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

Recovered source text:

```
Berkshire’s Performance vs. the S&P 500
Annual Percentage Change
in Per-Share in S&P 500
Market Value of with Dividends
Year Berkshire Included
1965 . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 49.5 10.0
```

### 44. b163/d13-review.json#0 (conflictExcerpt) step=normalised sim=1.0000

Pointer:

```
We earned revenue in 2024 of $180.6 billion 1 and net income of $58.5 billion, with return on tangible common equity (ROTCE) of 20% 2 , reflecting strong underlying performance across our businesses.
```

Recovered source text:

```
We earned revenue in 2024 of
$180.6 billion 1 and net income of $58.5 billion, with return on tangible common
equity (ROTCE) of 20% 2 , reflecting strong underlying performance across our
businesses.
```

### 45. b163/d13-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
We earned revenue in 2024 of $180.6 billion 1 and net income of $58.5 billion, with return on tangible common equity (ROTCE) of 20% 2 , reflecting strong underlying performance across our businesses.
```

Recovered source text:

```
We earned revenue in 2024 of
$180.6 billion 1 and net income of $58.5 billion, with return on tangible common
equity (ROTCE) of 20% 2 , reflecting strong underlying performance across our
businesses.
```

### 46. b163/d14-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
As a result of those experiences, many people these days are on heightened alert for bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the handful of stocks that have been leading it.
```

Recovered source text:

```
As a result of those experiences, many people these days are on heightened alert for
bubbles, and I’m often asked whether there’s a bubble surrounding the Standard & Poor’s 500 and the
handful of stocks that have been leading it.
```

### 47. b163/d15-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
But I saw no logical choice other than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities Fund VIIb.
```

Recovered source text:

```
But I saw no logical choice other
than to start putting money to work, including the $10 billion that was sitting uninvested in Opportunities
Fund VIIb.
```

### 48. b163/d16-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond Index.
```

Recovered source text:

```
Last year was a great one for credit, illustrated by the 8.2% return on the ICE BofA US High Yield Bond
Index.
```

### 49. b163/d17-review.json#0 (conflictExcerpt) step=normalised sim=1.0000

Pointer:

```
January 2 of this year was the 25 th anniversary of my memo bubble.com , the one that put my writing on the map, and I marked the occasion by publishing another memo, called On Bubble Watch .
```

Recovered source text:

```
January 2 of this year was the 25 th anniversary of my memo bubble.com , the one that put my writing on
the map, and I marked the occasion by publishing another memo, called On Bubble Watch .
```

### 50. b163/d17-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
January 2 of this year was the 25 th anniversary of my memo bubble.com , the one that put my writing on the map, and I marked the occasion by publishing another memo, called On Bubble Watch .
```

Recovered source text:

```
January 2 of this year was the 25 th anniversary of my memo bubble.com , the one that put my writing on
the map, and I marked the occasion by publishing another memo, called On Bubble Watch .
```

### 51. b163/d18-review.json#0 (primaryExcerpt) step=exact sim=1.0000

Pointer:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

Recovered source text:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

### 52. b163/d18-review.json#0 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

Recovered source text:

```
Imagine that in some private business you own a small share that cost you $1,000.
```

### 53. b163/d18-review.json#1 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
One of your partners, named Mr. Market, is very obliging indeed.
```

Recovered source text:

```
One
of your partners, named Mr. Market, is very obliging indeed.
```

### 54. b163/d19-review.json#0 (supportSpan[0]) step=normalised sim=1.0000

Pointer:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago has seemed unusual.
```

Recovered source text:

```
Last year was an unusual one. But then again, every year since the onset of the pandemic five years ago
has seemed unusual.
```

### 55. b163/d20-review.json#0 (supportSpan[0]) step=exact sim=1.0000

Pointer:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```

Recovered source text:

```
On October 11, 1987, I first came across the saying “this time it’s different.”
```


## 2.4 Figures guard rejections

None.

## Misses after recovery

### 1. extractor-swap/d04-gate7.json (gate7.quote) step=miss reason=ambiguous_tie

Pointer:

```
Exposure to fast growing, hard-to-access companies of seasoned investments across multiple vintages seeded by long-term relationships and with, in our view, strong institutional anchor client outperformance potential allocated on a pro-rata basis
```

