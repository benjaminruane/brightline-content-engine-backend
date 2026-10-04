# Real run payloads, 4 October 2026. HICL interim update.

Captured from the live product, build `2b68499` (B371, wrong-company check off),
by the product owner. A clean draft and the same draft with eleven planted
errors, against a new source in a new genre.

```
clean-review.json   /api/analyse-statements, 8 cards, the honest draft
clean-actions.json  /api/revise-actions for that run
doc-review.json     /api/analyse-statements, 8 cards, eleven planted errors
doc-actions.json    /api/revise-actions for that run
source-hicl-interim-extracted.txt   the source as the pipeline received it
```

Why this set exists. Every earlier fixture is a listed company's half-year
results release. This is a capital allocation update from an infrastructure
fund, written by the same author in a different register. It is the first
evidence that the deterministic work generalises beyond one document shape.

## The eleven planted errors

```
HICL                                  -> HCIL                        MISSED
five months to 28 February 2026       -> six months to 31 Dec 2025   MISSED
with EBITDA growth                    -> with average 30% EBITDA growth   caught
in line with budgets                  -> significantly outperform budgets caught
London St. Pancras High Speed         -> Paris St. Germain High Speed     caught
operations from St. Pancras           -> operations from St. Germain      caught
Fortysouth delivered 16 new towers    -> TowerCo delivered 20 new towers  caught (name and figure)
  during the period                   ->   during the past year           MISSED
lead to a reduction in debt costs     -> lead to an increase              caught
appointed a new CEO                   -> appointed a new CFO              caught
the UK government's                   -> the French government's          caught
water sector reform                   -> electricity sector reform        caught
```

Nine of eleven bullets, ten of thirteen individual changes. No false findings
on the doctored run. Readiness discriminated for the first time: the clean run
reads "Minor points to address", the doctored run "Needs significant work".

## Known open on these cards

- Clean S0 and doctored S0: the date. On the clean run the card shows the
  period passage as a second quote and confirms the date. On the doctored run
  no date-bearing passage is retrieved at all, so the wrong date reads
  Confirmed.
- Clean S1: `overreach_unsupported_causal` on "EBITDA growth driven by capital
  expenditure" while the source says "capex programmes driving EBITDA growth".
  A false positive the B355 drop rule misses on word ending alone.
- Clean S6: partly confirmed because "the company" is read as HICL rather than
  Fortysouth, which the previous sentence names.
- Both runs S5: "valuation gains" against the source's "in line with HICL's
  valuation assumption" reads Confirmed. NOT a planted error. An unintended
  discrepancy in the author's own clean writing, and the product endorses it.
