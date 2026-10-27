# B441

The full pass did not finish. Anthropic refused the reader's note on fixture 12: credit balance too low. Fixtures 01 to 11 are stored, 132 cards. Fixture 13, which holds the EBITDA sentence, was not reached. Catch on the labelled 11 is not reported from this pass, because the miss was not in the stored fixtures.

Estimate before the calls: USD 26.559012 list for one full pass. Ceiling USD 40. Not crossed. Stored spend through fixture 11: list USD 11.602275, discounted USD 9.531235, 860 calls, 0 unpriced. Fixture 12's pipeline calls were made and were not written. The refused note is not in the stored spend.

## The rule

A confirmed match is not a confirmation when the same source states a different value for the same quantity. The quantity is the measure phrase that belongs to the figure, the nearest phrase with no other figure between them. A phrase after a different number does not name this one. A figure with no measure name does not pair. A broad label (any margin, any growth, a stake) does not pair.

A second number is a different quantity, and is not reported, when any of these is true:

- One side is a forecast, a full year, a period, entry, exit, a prior year, or a named year, and the other side is not the same.
- One side is gross and the other is net, or the scenario words differ (base, upside, downside).
- The subject words differ, or one side names a narrower scope (infrastructure, semiconductor, a region, a channel) and the other does not.
- Either number is only a bound of a range (from, to, or a hyphenated span).
- The difference is rounding of the displayed number.

No prompt was changed.

On the memo the rule returns one sentence: the source also says the Company generates an EBITDA margin of approximately 13%. It does not return the 28% forecast. It also returns the 285-person team against the statement that the company employs 320. That second one is already a conflict when the matcher returns the span, and the rule does not add another when a conflicting span is already stored.

A dry scan of all 261 statements, with no model call, found only those two.

The stored fixtures 01 to 11 changed display verdict on five statements. None of them carries a second-value line. They are the ordinary run-to-run movement. The rule did not speak on those fixtures.

## The four partials that said the split was not recorded

Each one stored a matcher explanation whose class is confirmed. That sentence says the source confirms the statement. B432 does not show a confirmed-class sentence as the ground for a partial. The partial ground on each card is the stage 5 summary, which is not the matcher's split and is not used as one. Nothing was edited away. This is the honest absence, not a defect. It was not changed.

- Fixture 08 index 16. Confirmed. The source confirms the competitive position, the markets, the plan, and the roadmap.
- Fixture 15 index 9. Confirmed. The source confirms the own-brand share and the runway.
- Fixture 15 index 25. Confirmed. The source confirms the stress test.
- Fixture 16 index 10. Confirmed. The source confirms the growth rate, the position, and the expansion.

## The tidy

Two further edits, and only these, on the matcher's sentence before it is shown:

4. A comma immediately inside a closing quote at the end of the sentence is removed. `team,'.` becomes `team'.`
5. A later sentence is dropped when an earlier sentence already quotes every gap the later one quotes. A later sentence with no quote is dropped when an earlier sentence has one.

The card that named the competitive position twice now reads: The source supports the claim of a strong competitive position but does not mention a 'growing category' or a 'credible operational team'.
