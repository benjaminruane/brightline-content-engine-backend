# B394 element definition, v3

Supersedes `scripts/diagnostic/b393/ELEMENTS-v2.md`. That file stays as written. This file was written before any B394 count.

v2 excluded generic abbreviations because they are not proper nouns. That was the wrong test. The right test is whether getting the token wrong would be a real error. A wrong role, metric, or clinical modality is a real error. The planted CEO-to-CFO swap was invisible because both words were excluded.

## What stayed

Figures, dates, scale folding, minor currency units, one-way date granularity, range sharing, the hyphen fallback for names, and span boundaries stay as in v2. The sentence-initial rule and its list stay unchanged. That is tokenisation, not factual content. The list is still: Among, Notably, Meanwhile, Elsewhere, Looking, Across, However, Separately, Additionally, Overall, Finally, Topline, Organic. The must-keep names stay: Action, HICL, HCIL, Fortysouth, Johor, Switzerland, 3i.

## A1. Expansion table

An element matches when the draft's abbreviated form and the source's spelled-out form denote the same thing, in either direction. The abbreviation itself is case sensitive: CEO does not match ceo. The spelled-out form is a word sequence and is matched without regard to case, because the sources capitalise it. Different rows do not match each other. CEO does not match Chief Financial Officer.

Roles, in full:

| Abbreviation | Spelled-out forms |
|---|---|
| CEO | Chief Executive Officer; chief executive |
| CFO | Chief Financial Officer; chief financial officer |
| COO | Chief Operating Officer |
| CIO | Chief Information Officer |
| CTO | Chief Technology Officer |

Metric expansions, only where a source in this corpus spells one out:

| Abbreviation | Spelled-out form | Where it is spelled out |
|---|---|---|
| LFL | like-for-like | the 3i source, `like-for-like ("LFL")` |
| NAV | net asset value | the 3i source, `net asset value per ordinary share ("NAV per share")` |

No other removed abbreviation is spelled out in the four sources. EBITDA appears as EBITDA. MRI and CT appear as MRI and iCT. IRR, MOIC, TVPI, DPI, ARR, GMV, CAGR, and ESG are not spelled out here, so they have no expansion. They remain checkable as the abbreviation itself.

## A2. What is no longer excluded

These leave the exclusion list and become checkable elements: EBITDA, CEO, CFO, COO, CIO, NAV, IRR, MOIC, TVPI, DPI, ARR, GMV, CAGR, LFL, MRI, CT, ESG.

API was on the v2 list and is not a currency, a month, a scale, a number word, or a percent word, so it leaves as well. It has no expansion.

What stays excluded, in full, is only what is already checked elsewhere or carries no claim of its own:

- Currency codes: USD, GBP, EUR, SEK.
- Month names, including the three-letter forms and Sept.
- Scale words: thousand, million, billion, bn, mn.
- Number words from zero to twenty.
- The percent word.

There is still no blanket all-caps exclusion. HICL and HCIL stay names.

## Predictions

Recorded before the run.

- Part A keeps the junk rate under 3 percent and reintroduces no junk.
- HICL doctored CFO becomes not-found; HICL clean CEO is found.
- No element matches against the ClearPoint navigation text.
- Part B's cause is a fallback in excerpt selection rather than deliberate selection of a chrome block.
- Part B leaves every displayVerdict unchanged.
