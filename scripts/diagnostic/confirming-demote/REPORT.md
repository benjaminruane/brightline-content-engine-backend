# B345. A passage that gives a different figure is not support, and it is the one the reader sees

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending first push | pending |
| frontend | not touched | -- |

Ids used: B345.

Cost: USD 0. No model calls.

Browser: skipped. No frontend change. Excerpt selection is payload-side; the card already renders `primaryExcerpt`.

---

## Part 0A

A1 TRUE. Quoted `lib/qc/pipeline-v4/stage2-match-sources.mjs`:

```
        if (currenciesDiffer(s, best)) {
          logForceSuppressed("currency", statement, passage, s, best);
          continue;
        }
```

Comment above: "Different recognised currencies also suppress (B71)."

A2 PARTLY. There is no single place today that rewrites both single-pick and widened classifications after Stage 2 returns.

- Single-pick: `applyRoundingToleranceBackstop` and `applyPeriodGateBackstop` run inside Stage 2 before the match is returned (`stage2-match-sources.mjs`).
- After return, `applyIntraSourceReducer` copies a pair class from the most serious of the single-pick and locatable span votes. It does not rewrite `supportSpans[].classification` in the payload. `spanVoteClassification` only lifts a conflicting span vote to confirmed on rounding.

This spec adds that single place: `demoteConfirmedClassifications` in `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs`, applied to both matches and spans, then the reducer.

A3 TRUE. Quoted `lib/revise-actions/conflict-engagement.mjs`:

```
export function sameQuantity(a, b) {
  return kindKey(a) === kindKey(b) && a.value === b.value;
}
```

```
function kindKey(token) {
  const base = token.scale ? `${token.kind}:${token.scale}` : token.kind;
  if (token.kind === "money") {
    return token.currency ? `${base}:${token.currency}` : `${base}:bare`;
  }
  return base;
}
```

A4 TRUE. Rank in `intra-source-reducer.mjs`: conflicting 4, partially_confirmed 3, confirmed 2. Stage 3: `if (anyConflicting) verdict = "conflicting"`. Demoting one locatable span to conflicting moves the card.

A5 TRUE. Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs` as read before this spec:

```
  if (v === "conflicting" && !firstMatchWithClassification(matches, "conflicting")) {
    const fromSpan = firstConflictingSpanExcerpt(supportSpans, sources, matches);
    if (fromSpan) {
      conflictExcerpt = fromSpan;
      if (!primaryExcerpt) primaryExcerpt = fromSpan;
    }
  }
```

---

## Part 0B

B1 AMEND. Rules (a) and (b) as specified, plus: rule (b) skips a draft token that B336 `findFigureAgreements` already marks AGREED. Without that, honest "119 new stores ... 330 new stores" against a passage that repeats both figures would demote via `kindNameSame` on 119 vs 330. That is the B336 case. Tokenizer, `sameQuantity`, `kindNameSame`, and `findFigureAgreements` are reused. No second Jaccard.

B2 AGREE. Classification changes. Passage stays.

B3 AGREE. Only `confirmed` is rewritten. Conflicting and partial are copied through.

B4 AGREE. `hasEgregiousMagnitudeGap`, `currenciesDiffer`, and `metricsDiffer` are untouched. T1 still logs the B71 currency suppress from the reducer lift path; the card is conflicting because of the new demotion.

B5 AGREE. Eligible tokens exclude `component` and any `rangeRole`. Two or more eligible money tokens skip rule (a). T4: two money and no `kindNameSame` hit does not demote. Rule (b) still fires when a named percent disagrees (12% vs 9% beside a second money figure).

B6 AGREE. On a conflicting verdict, `selectExcerpts` prefers a conflicting passage that `confirmingPassageDisagrees` with the statement. A number-free confirming quote is not the only quote. If no stored passage carries the disputed figure, the conflicting passage is shown anyway.

B7 AGREE. No splitter, Stage 1b, prompt, frontend, or copy change. Zero extra model calls.

---

## T1 / T2 before and after

Shared setup: one single-pick classified confirmed on the qualitative passage, two supportSpans both confirmed.

T1 statement: USD 1.5 billion refinancing.

| | Before | After |
|---|--------|-------|
| EUR 2.1 billion span | confirmed | conflicting |
| Qualitative span | confirmed | confirmed |
| Card verdict | confirmed / supported_full | conflicting / conflict |
| Displayed passage | qualitative (no figure) | EUR 2.1 billion span |

T2 statement: EUR 2.1 billion refinancing. Same two passages.

| | Before | After |
|---|--------|-------|
| Both spans | confirmed | confirmed |
| Card verdict | confirmed / supported_full | confirmed / supported_full |
| Displayed passage | qualitative | qualitative |

---

## Existing tests

Zero existing tests were edited. `tests/conflict-excerpt-from-span.test.mjs` (3) and `tests/stage2-intra-source-reducer.test.mjs` (5) still pass. `kindNameSame` was exported from `conflict-engagement.mjs` with the same body; pairing callers are unchanged.

---

## Correct writing this would still fire on

A confirmed passage whose only money token is a different currency or value, and that money is a genuinely different instrument, if Stage 2 still classified the passage as confirming the sentence. The demotion trusts that the matcher offered the passage as support for that statement. Parenthetical FX conversions in a confirming passage with exactly one money token on each side would also demote.
