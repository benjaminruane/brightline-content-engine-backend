# B374. Offer the name the source states, or offer nothing

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | PENDING | PENDING |
| frontend | not touched | |

Ids used: B374 (this spec). B373 remains open (valuation leftover, not this work).

Cost: USD 0. No model calls. No billed run.

Browser: skipped. No layout, control, or card-face chrome change. Deterministic pairing on stored Review payloads. Checked by replaying `tests/fixtures/real-runs-2026-10-04-hicl/` through `runActionList` and the 3i October money card.

---

## Design

The pair is two unmatched maximal name spans: one from the statement, one from the card surfaces the reviewer can see (displayed excerpt plus `supportSpans`). A span is unmatched when that exact name does not appear in the other text. Contained shorter spans are dropped. Same role is a shared left neighbour word or a shared right neighbour word in each span's own passage. Unique 1:1 after that, or decline. The replacement must sit on a card surface so `sourceFigureVisibleOnCard` can prove it (R1). No Stage 5 comment parse (P20). No Jaccard. No whole-document search.

When that name pair exists, quantities that `findCandidatePairs` could not bind (because `namesBind` uses Jaccard) are recovered by unique same-kind unmatched values. R2: if a leftover draft quantity still disagrees, the product offers nothing, not the name alone.

S5 produces one proposal that fixes both the name and the figure. Unique unmatched name `TowerCo` / `Fortysouth` sharing neighbour `delivered`, and unique unmatched count `20` / `16`. `past year` is not a quantity the product can pair; the source states `the period`, which is not a calendar date. Out of scope (R1), not a silent half-fix of a figure the product can fix.

---

## Rejected

- Parsing the Stage 5 comment for "the source specifies X". Model prose would become the spec (P20).
- The Jaccard `namesMatch` already in `conflict-engagement.mjs`. Forbidden (R5) and the reason S5's count did not pair.
- Searching the whole source document for a name. R1: the source must state the replacement on the card.
- Role-party (`from`/`to`/`by`/`with`) as the only producer. It did not fire on these cards: `St.` is not a Title-Case run, so both sides read as `St`.
- Unbounded unmatched 2:2 without a neighbour. Two names that merely both appear are not the same role.

---

## Where the design declines

A decline leaves the card exactly as today: ACKNOWLEDGE, no `proposedChange`.

| Card | Why |
|------|-----|
| Doctored S6 | Not a substitution. Draft `increase in debt servicing costs` against source `step-down on debt margins` needs an inference. No 1:1 unmatched name in the same role (`the company` is skipped; `Fortysouth` is on the source side only). |
| Doctored S7 | Not-supported. No source text to build from. |
| Doctored S1, S2 | Partials. Unchanged. Acknowledge, no edit. |
| Doctored S2 editorial | Editorial never carries a rewrite. |
| Clean S1 editorial | Editorial never carries a rewrite. |
| Clean S6 | Partial. Unchanged. |
| Constructed `Zyxylon Partners` | The source never states a replacement name. |
| Constructed name plus two source counts | R2. The name is unique but the figure is not. Offering the name would leave the sentence wrong. |

---

## Proposals produced

Source: `scripts/diagnostic/b374/proposals.json`, `runActionList` on the stored HICL payloads with a throwing model.

### Clean

No proposals. Two acknowledge entries, as today.

1. `S1:editorial:overreach_unsupported_causal:0` ACKNOWLEDGE. No rewrite.
2. `S6:evidence:partial:0` ACKNOWLEDGE. No rewrite.

### Doctored

1. `S1:evidence:partial:0` ACKNOWLEDGE. No proposal.
2. `S2:evidence:partial:0` ACKNOWLEDGE. No proposal.
3. `S2:editorial:overreach_unsupported_causal:0` ACKNOWLEDGE. No rewrite.
4. `S3:evidence:conflicting:0` ACTION.

   Proposed change: `Replace 'Paris St. Germain High Speed' with 'London St. Pancras High Speed'.`

   Resulting sentence: `Among the significant holdings, London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast.`

   Verification: checked. The displayed quote is ellipsis-trimmed (`... Pancras High Speed`); the full name is on `supportSpans`, which is a card surface.

5. `S4:evidence:conflicting:0` ACTION.

   Proposed change: `Replace 'St. Germain' with 'St. Pancras'.`

   Resulting sentence: `On the commercial front, progress has been made on adding a second international operator on the route, while Virgin Trains recently announced its intentions for cross-Channel operations from St. Pancras.`

   Verification: checked.

6. `S5:evidence:conflicting:0` ACTION. One proposal, name and figure together.

   Proposed change: `Replace 'TowerCo' with 'Fortysouth' and '20' with '16'.`

   Resulting sentence: `Elsewhere, Fortysouth delivered 16 new towers during the past year and is actively progressing additional co-location opportunities, both of which are expected to support continued growth in EBITDA and valuation gains.`

   Verification: checked. `past year` is unchanged (not a stated date substitution).

7. `S6:evidence:conflicting:0` ACKNOWLEDGE. No proposal.
8. `S7:evidence:not_supported:0` ACKNOWLEDGE. No proposal.

3i October S0 is unchanged: `Replace 'GBP 3.3 million' with 'GBP 3,291 million'.`

---

## P34

`findCandidatePairs` is unchanged. Money, percentage, date, and scale pairing is the same function with the same callers.

`applyConflictProposal` is the merger. Callers: `fillAction` (`lib/revise-actions/run.mjs`), and the conflict-engagement / quantity-match / house-style / governance tests. Name pairs are skipped past R1/R5/disagreement loops that read quantity tokens. A 1:1 name pair with a leftover unpaired quantity declines the whole statement (R2), including any money pair on that sentence.

`findNamePairs` callers: `applyConflictProposal`, `tests/b374-name-substitution.test.mjs`.

---

## New files

- `lib/revise-actions/name-pair.mjs`
- `tests/b374-name-substitution.test.mjs`
- `scripts/diagnostic/b374/REPORT.md`
- `scripts/diagnostic/b374/dump-proposals.mjs`
- `scripts/diagnostic/b374/proposals.json`

## Design decisions

1. Pair from unmatched maximal name spans on the statement versus card surfaces, not from commentary.
2. Same role is a shared neighbour word, not a preposition list and not Jaccard.
3. Truncated primary quotes may still license a name that sits on `supportSpans`.
4. S5 offers both the name and the figure. Unique 1:1 on both. R2 would have silenced the card if the count were not unique.
5. `St.` is a name token, so `St. Germain` / `St. Pancras` / `London St. Pancras High Speed` collect as runs. Role-party still does not.

---

## Cost report

Zero. No billed run.
