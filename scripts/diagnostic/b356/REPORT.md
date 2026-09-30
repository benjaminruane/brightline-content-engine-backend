# B356. The clause that says a claim checks out belongs in the comment, not after it

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending | pending |
| frontend | not touched | -- |

Ids used: B356 (this spec). Copy and placement only. The confirming-passages-only rule is unchanged.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change on a screen. Deterministic comment rewrite only. No Review.

---

## What changed

`appendSourceStatedClauses` in `lib/qc/commentary-inventory.mjs` still adds a clause only when an unaddressed inventory item is present word for word in a confirming passage, still caps at two items, still never reads `conflictExcerpt`. The sentence is now:

- one item: `13% matches the source.`
- two items: `13% and 6.3% match the source.`

`The source also states` is gone.

Placement uses `splitSentences` from `lib/qc/card-honesty.mjs`. If the last sentence matches `/\breviewer should\b/i`, the new sentence is inserted immediately before it. Otherwise it is appended at the end. Rejoin keeps the splitter's leading whitespace on the following sentence.

Does not touch: confirming-passages-only, verbatim test, two-item cap, `commentaryUnaddressed`, the Stage 7 log line, the standing rule that the module never asserts confirmation the evidence layer did not establish, `card-honesty-invariant`, `sentence-split-decimals`.

---

## Cards where a clause is added

Applied to the recorded `evidenceSummary` of every card in `tests/fixtures/real-runs-2026-09-29/`, with inventory from the statement and confirming passages from the stored primary excerpt plus support spans. Three cards fire. On all three the last sentence is a reviewer instruction, so the insertion point is that sentence. No card in either payload inserts anywhere else.

### Clean S0

Before:

The statement claims that 3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025, while the source indicates that this figure pertains to the six months ending 30 September 2025. This discrepancy in the reporting period creates a conflict. The reviewer should reconcile the timeframes or remove the claim.

After:

The statement claims that 3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025, while the source indicates that this figure pertains to the six months ending 30 September 2025. This discrepancy in the reporting period creates a conflict. 13% matches the source. The reviewer should reconcile the timeframes or remove the claim.

### Doctored S0

Before:

The statement claims a total return of GBP 3.3 million for the six months to 30 June 2025, while the source reports a total return of GBP 3,291 million for the first half of FY2026. The periods and figures do not match, leading to a conflict. The reviewer should reconcile these discrepancies or remove the claim.

After:

The statement claims a total return of GBP 3.3 million for the six months to 30 June 2025, while the source reports a total return of GBP 3,291 million for the first half of FY2026. The periods and figures do not match, leading to a conflict. 13% matches the source. The reviewer should reconcile these discrepancies or remove the claim.

### Doctored S5

Before:

The statement claims net sales of EUR 11.2 billion for the first half of 2026, while the source reports EUR 11.229 billion for the nine reporting periods ending on 28 September 2025. The periods do not match, leading to a conflict in the reported figures. The reviewer should reconcile these discrepancies or remove the claim.

After:

The statement claims net sales of EUR 11.2 billion for the first half of 2026, while the source reports EUR 11.229 billion for the nine reporting periods ending on 28 September 2025. The periods do not match, leading to a conflict in the reported figures. 6.3% matches the source. The reviewer should reconcile these discrepancies or remove the claim.

`30` and `June` remain unaddressed. They are not in the confirming passages.

---

## Insertion point that was not the reviewer sentence

None. Every card that gained a clause already ended with a reviewer instruction, and the new sentence sits immediately before it.

---

## Tests whose expectation moved

`tests/commentary-inventory.test.mjs`: expected wording only. WHEN a clause is added is unchanged (aggregation still appends nothing; already-mentioned items still append nothing; conflictExcerpt still produces no clause; empty commentary still untouched; at most two items).

`tests/card-honesty-invariant.test.mjs` and `tests/sentence-split-decimals.test.mjs` unchanged and passing.
