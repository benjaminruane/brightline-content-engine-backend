# F18_S7 lost contradiction under R10

Free. No model calls. Evidence: `r10-corpus-blast-rows.json` pair
`F18:S7:18b_synth_cross_source_pair_update` (corpus blast `ce3d85e`).

## Statement (verbatim)

```
Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.
```

## Both arms

```
R3a label: conflicting
R3a passage:
Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo. The discrepancy arose from the Company's internal reporting convention, which has historically included committed but not yet activated annual contracts in the headline ARR figure.
R3a explanation:
The source states the ARR as EUR 35 million, not EUR 38 million, due to a reporting convention. The statement's growth projection and strategic plans are not addressed in the source.

R10 label: partially_confirmed
R10 passage:
Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.
R10 explanation:
The source discusses the updated base case and financial metrics over a five-year hold but does not specifically address ARR growth from EUR 38 million to EUR 95 million or the strategies mentioned in the statement.
```

CONFIRMED: rows in `r10-corpus-blast-rows.json` for that pairId.

## Correspondence

```
Draft figures: EUR 38 million, EUR 95 million (ARR growth).

R3a passage: contains 35 million and 38 million on ARR.
  Corresponds to the draft's starting ARR quantity (same metric ARR, same
  quantity family as the 38 million claim). The conflict is magnitude:
  draft 38 vs source 35. CONFIRMED.

R10 passage: contains 2.6x MOIC, 21% IRR, 2.8x, 23%. Contains neither 38 nor
  95. Different metric (MOIC/IRR vs ARR). Does NOT correspond.
  CONFIRMED: passage text above; figure scan on the same rows.
```

## Adjudication

```
PASSAGE DRIFT

R10 selected a different, non-corresponding passage (base-case MOIC/IRR) and
the softer partially_confirmed label follows from that silence on ARR.
R10 did not re-reason the same ARR 35-vs-38 evidence into a weaker label.
It looked elsewhere.

Not GATE WORDING: passages differ (passageChanged=true in
r10-corpus-blast-moved.json). Not NEITHER.

This is B115-class attention / passage selection, not a scoped-basis-gate
defect. The quantity-scoped basis limb never needed to engage; the cited
R10 span has no matching ARR quantity at all.
```

## Passage-change sizing (46 pairs)

Across the 46 pairs whose R10 passage differed from R3a
(CONFIRMED: `r10-corpus-blast-rows.json` part2.passageChanged=46):

```
passage changed:                              46
of those, draft carries a numeric figure:     24
of those 24, R10 passage contains NONE of
  the draft's numeric figures:                12
draft had no numeric figure:                  22
```

So half of the figure-bearing passage shifts (12/24) land on a span that
drops the draft's numbers. F18_S7 is one of them. R10 systematically shifts
attention often enough that B115 is not a one-off; it is not only F18_S7.

## Stop decision

```
PASSAGE DRIFT -> Part 1 (ship R10) may proceed.
```

## Opinion

```
Cursor's earlier "do not ship while F18_S7 stands" treated the loss as a rule
defect. The rows say otherwise: same arm that recovers nordholt-dirty S1 and
F18_S3 also wandered off the ARR correction line here. That is the richness /
passage-selection family (B115), already accepted as pre-existing on live R3a
for F93_S2. Shipping R10 accepts one more B115 instance in exchange for
fixing EA_E3 and recovering two contradictions. I agree with shipping on
that evidence. The objection to shipping on rule grounds does not survive
this read.
```
