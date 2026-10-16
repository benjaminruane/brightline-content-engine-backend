# B393 element definition, v2

Supersedes `scripts/diagnostic/b392/ELEMENTS.md`. That file stays as written. This file was written before any B393 count.

B392's matcher and name rules produced marks the check should not have produced. Each change below is the general rule, named by the case that exposed it.

## What stayed

An element is still a figure, a date, or a name, in the sense of ELEMENTS.md. Scale folding, the percent barrier, half-away-from-zero rounding, and case-sensitive names all stay. HCIL does not match HICL. A percent never matches a currency or a bare figure. A bare figure does not match a currency, except where a range copies a currency onto both ends, below.

## F1. Minor currency units

`GBP 0.365` did not match `36.5 pence`. Fold a minor unit into its major unit before comparing.

- pence, and the suffix p, fold into GBP by dividing by 100.
- cents, and the suffix c, fold into USD or into EUR by dividing by 100. A cents figure with no currency of its own matches a USD figure or an EUR figure of the same folded amount. It does not match GBP.
- öre, and ore, fold into SEK by dividing by 100.

A minor-unit figure and a major-unit figure of the same currency match when the folded amounts are equal, or equal after the existing rounding rule. Rounding still uses the draft figure's stated decimal places, in the unit the draft wrote. `36.5 pence` against `GBP 0.365` is equal at three decimal places of a pound.

## F2. Date granularity, one direction only

`November 2025` did not match `13 November 2025`, and `May 2026` did not match `May 13, 2026`, because v1 required the normalised keys to be identical.

A draft date matches a source date of finer granularity when every field the draft states agrees. A month and year match a full date in that month. A bare year matches any date, quarter, or half in that year. A quarter matches a full date or a month inside that quarter. A half matches a full date or a month inside that half.

The reverse does not match. A draft full date does not match a source month, quarter, half, or bare year. A draft quarter does not match a bare year. The draft is claiming a precision the source does not provide, and that mark should stand.

A financial year matches only a financial year. A calendar date does not say which financial year it belongs to, and this corpus does not define the months of an FY. Guessing that map would invent agreements.

## F3. Currency and scale across a range

In `USD 52-56 million` the currency sat on 52 and the scale sat on 56, so `56 million` was bare and did not match `$56.0 million`.

Two figures joined by `-` or by `to` share a currency and a scale when neither is a percent and they do not already carry different currencies or different scales. The currency on either end applies to both. The scale on either end applies to both. The same applies to `5 to 10`.

A percent is not one end of a currency range. `80% to $5.9 million` does not copy million onto 80, and does not copy the dollar onto the percent.

## F4. Hyphen damage

`Channel`, from `cross-Channel`, did not match a source that writes `crossChannel`. The strict name match is unchanged: case-sensitive, whole token, after whitespace, quote, and dash normalisation. HCIL still does not match HICL.

Only when that strict match fails, and only for a name, retry once with hyphens and spaces removed from both the name and the source. `cross-Channel` then matches `crossChannel`. The fallback is not used for figures or dates.

## F5. Span boundaries

A sentence stop glued to a name made `St. Pancras.` and `Velocity Alpha MR High Speed Surgical Drill System.` miss the source. Strip a full stop, comma, semicolon, or colon from the end of an extracted name. An internal abbreviating full stop stays, so `St. Pancras.` becomes `St. Pancras` and the `St.` inside it is untouched. A name that is only `St.` keeps its full stop.

## F6. The 80 percent case

`80%` is in the ClearPoint source. v1's range rule treated the word `to` as a range marker and copied a following scale onto the percent, so `increased 80% to $5.9 million` was read as 80 million percent. That does not equal 80 percent. The fix is F3: a percent does not share a scale or a currency with the figure after `to`. The value 80 is not special-cased.

## E1. Generic abbreviations are not names

An all-caps token is not automatically junk. HICL and HCIL are four-character all-caps tokens, and HCIL is one of the 37 planted errors. A blanket all-caps exclusion would hide that error. This definition does not have one.

These generic business, metric, role, and clinical abbreviations are not names. The list is closed:

EBITDA, CEO, CFO, COO, CIO, NAV, IRR, MOIC, TVPI, DPI, ARR, GMV, API, CAGR, LFL, MRI, CT, ESG.

FDA is not on this list. It is a specific body and stays checkable. Company abbreviations are not on this list.

## E2. Sentence-initial words

Two rules, both only for the first word of a statement.

Rule. That word is not a name if the same word, lowercased, occurs anywhere in that draft or in any of its sources.

List. A closed class of English sentence-opening words, not an accumulation: Among, Notably, Meanwhile, Elsewhere, Looking, Across, However, Separately, Additionally, Overall, Finally, Topline, Organic.

v1's list was Elsewhere, Meanwhile, Looking, Across, This, The, On, In, Year, Net, Our, Performance. This, The, On, In, Year, Net, Our, and Performance leave the list. The lowercase rule covers them when they are ordinary words in the draft or the source.

Must-keep test. A statement-initial Action, HICL, HCIL, Fortysouth, Johor, Switzerland, or 3i is still a name. Those seven are never dropped by the sentence-initial rule. They are the names the check exists to catch, and a lowercase spelling of the same word must not erase them. The run asserts this.

## Decision rule

Fixed here, before the B393 count.

The asymmetric rule stands if the surviving C3 cases are 4 or fewer and every survivor is a derived figure, meaning arithmetic the writer performed that the source does not state.

The asymmetric rule needs a named carve-out if the survivors are 4 or fewer but include cases that are neither derived figures nor junk. Name the class.

The asymmetric rule needs relaxing if 5 or more survive and they are not a single nameable class.

The element definition is ready at a junk rate under 3 percent, and not ready at 3 percent or above.

## Predictions

Recorded before the run.

- The junk rate comes in under 3 percent.
- C3 drops from 11 to 3 or 4.
- Every surviving C3 case is a derived figure.
- The three derived figures from B392 all survive: HICL clean "five months", and no other category joins them.
