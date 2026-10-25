# B423. One axis

Stored clean HICL review and reading. No model call. USD 0.

## Summary

Before, from displayVerdict: confirmed 7, partial 1, conflicting 0, not supported 0. Readiness Minor points to address. The stored stamp is the same label.
After, from statementVerdict: confirmed 5, partial 1, conflicting 0, not supported 2. Readiness Needs work.
Bullets: 2 claims have no source behind them. Remove them or find supporting evidence before this draft is final. | 1 claim has only partial support from the cited sources. Strengthen the evidence where you can.
All-claims-backed bullet: no

## Statements

S0 nothing_raised edge green
  prose: (stage 5 kept)
  concern stamp: (empty)
  finding: (none)
S1 not_in_source edge red
  prose: The source says "HICL has delivered robust operational performance during the period, with capex programmes driving EBITDA growth, alongside resilient cash generation across the portfolio, supporting our confidence in achieving our target dividend cash cover." The statement rephrases this with a typo ("HCIL") but conveys the same assertion.
  concern stamp: EBITDA growth driven by capital expenditure
  mark HCIL kind fact tone conflict answered yes
  mark EBITDA growth driven by capital expenditure kind evidence tone beyond answered yes
  finding overreach_unsupported_causal: EBITDA growth driven by capital expenditure
    on this sentence: yes
S2 not_in_source edge red
  prose: The source says EBITDA is delivered in line with expectations, not in line with budgets. "Budgets" is a different benchmark than the "expectations" stated in the source.
  concern stamp: (empty)
  mark budgets kind fact tone conflict answered yes
  finding: (none)
S3 nothing_raised edge green
  prose: (stage 5 kept)
  concern stamp: (empty)
  finding: (none)
S4 nothing_raised edge green
  prose: (stage 5 kept)
  concern stamp: (empty)
  finding: (none)
S5 beyond edge amber
  prose: The source says the new towers and co-location opportunities are expected to support continued EBITDA growth in line with HICL's valuation assumption. The statement adds "and valuation gains," which the source does not assert.
  concern stamp: (empty)
  mark and valuation gains kind fact tone beyond answered yes
  finding: (none)
S6 nothing_raised edge green
  prose: (stage 5 kept)
  concern stamp: (empty)
  mark which will lead to a reduction in debt servicing costs kind evidence tone beyond answered yes
  finding partial: which will lead to a reduction in debt servicing costs
    on this sentence: yes
S7 nothing_raised edge green
  prose: (stage 5 kept)
  concern stamp: (empty)
  finding: (none)

Findings on a card they do not belong to: 0
Unanswered marks: 0
Old screen rule, findings on a card they do not belong to: 14
Old screen rule, unanswered marks: 0
The B423 zero counted a mark answered when the finding was in the list attached to that card. It did not count a finding whose quote is absent from the card's sentence. The screen passed the whole inventory into every card, so each card held every finding and the unanswered count stayed zero. Replaying that rule on this payload is the old-screen pair above: unanswered stays zero while the refinancing note is on every card. The two counts above are separate. A finding whose quote is not in the sentence does not answer a mark, so adding it to every card cannot clear the unanswered count.
Contradiction guard trips: 0
Concern stamp empty on 7 of 8 cards.
The stamp is the concern list on the card, written before the revise-actions inventory exists. On this payload the causal concern is already on S1, so that stamp is not empty. The refinancing finding is not a concern. It is an inventory row, so it is absent from every stamp. The screen was not reading the stamp. It appended the whole inventory to every card.

## Where the list is built

The list is built in findingsByStatement, called from runActionList once the inventory exists, and returned as evidenceFindingsByStatement. The review-card field is left as the concern-only stamp. It is not the list the screen shows after the inventory arrives. Removing it would drop the causal finding for the moment before that response, and recheck would lose the finding for a sentence whose inventory row was discarded. A saved review with no map keeps an entry only when its statement id is that card.

## Other run-wide lists

Stage 6 still pastes the whole draft into the editorial prompt. That is model context, not a list copied onto each card. Not changed here. buildDraftMarks, attachActionListToStatement and attachDocumentFindings each keep an entry only for the statement it belongs to.

## Clean ledger

demands 3, light 5, quiet 30, noise in demands 0.
Bar unchanged: demands 3, light 5, quiet 30, noise in demands 0.
