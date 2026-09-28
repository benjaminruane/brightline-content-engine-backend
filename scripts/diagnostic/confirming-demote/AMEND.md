# B346. A passage with a different figure is not support, and a component is not a total

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending first push | pending |
| frontend | not touched | -- |

Ids used: B346.

Cost: USD 0. No model calls.

Browser: skipped. No frontend change. Excerpt selection is payload-side; the card already renders `primaryExcerpt`.

---

## Part 0A

A1 TRUE. `annotateTokens` on the real passage:

```
raw: "July 2024"
kind: date
value: 2024
currency: null
scale: null
component: false
total: false
rangeRole: null
fragment: "In July 2024"

raw: "2.1 billion"
kind: money
value: 2.1
currency: null
scale: billion
component: false
total: true
rangeRole: null
fragment: " Action successfully completed a refinancing event, raising €2.1 billion in total, including a second US dollar term loan issuance of $1"

raw: "1.5 billion"
kind: money
value: 1.5
currency: null
scale: billion
component: true
total: false
rangeRole: null
fragment: "1 billion in total, including a second US dollar term loan issuance of $1.5 billion"
```

$1.5 billion is tagged `component`. €2.1 billion is tagged `total`. TOKEN_RE does not capture € or $, so both money tokens have `currency: null` and raw "2.1 billion" / "1.5 billion". The decimal point is a clause break, which is why the host fragments split at `$1`.

A2 TRUE. `annotateTokens` on the statement:

```
raw: "USD 1.5 billion"
kind: money
value: 1.5
currency: "USD"
scale: billion
component: false
total: false
rangeRole: null
fragment: "Meanwhile, the company completed a USD 1.5 billion refinancing, reflecting its robust growth and strong cash generation"
```

Its USD 1.5 billion does not carry `component`.

A3 CONFIRMED. As shipped B345, `confirmingPassageDisagrees` returned true. Rule (a) fired: the component token is ineligible, so each side has one eligible money token (USD 1.5 billion vs 2.1 billion bare), and `sameQuantity` is false. Rule (b) did not fire (`kindNameSame` is false: `money:billion:USD` vs `money:billion:bare`). B345 mapped that true to `conflicting`. This amend maps the same rule (a) hit to `partially_confirmed`.

A4 B345, as shipped, does change the verdict on the real 27 September refinancing card: it would have moved it from supported_full to conflicting.

A5 TRUE. Rule (a) is one eligible money token on each side and `sameQuantity` false. No name, metric, or context test. Quoted `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs` after this amend: the (a) arm still has no `kindNameSame` call.

A6 Both pairs fire rule (a). Fund: `confirmingPassageDisagrees` true, `kindNameSame` false (`USD` vs `EUR`). Acquisition: true, `kindNameSame` false (name windows `asset/acquired` vs `acquisition/completed/march/funded/equity/cheque`). After this amend both demote to `partially_confirmed`, not conflicting.

A7 TRUE. Quoted `lib/qc/pipeline-v4/intra-source-reducer.mjs`:

```
const RANK = {
  conflicting: 4,
  partially_confirmed: 3,
  confirmed: 2,
  no_support: 1,
  not_supported: 1,
  not_reviewed: 0,
};
```

Demoting a locatable span to `partially_confirmed` is enough to move the pair. It does not claim a conflict.

A8 TRUE. `partially_confirmed` already produces a card the reviewer must act on. `mapSupportStateToDisplayVerdict`: `partial` -> `supported_partial`. `mapSupportStateToEvidenceConcernLevel`: `partial` -> `moderate`. Existing acknowledge copy, no proposal: `NO_PROPOSAL.partial_no_edit` is `A source supports part of this statement, not all of it. The wording is yours.` Conflict-free partials with no conflict structural signal are silent on the action list and ACKNOWLEDGE with that sentence.

---

## Part 0B

B1 AMEND. Two tiers as specified: (b) `kindNameSame` different value -> `conflicting`; (a) one eligible money each, not the same quantity, no (b) match -> `partially_confirmed`. Extra refuse: rule (a) does not fire when the two eligible money tokens share value and scale even if `sameQuantity` is false. TOKEN_RE drops € and $, so honest `EUR 2.1 billion` vs `€2.1 billion` is `sameQuantity` false. That guard lives in this module only. No second Jaccard. `sameQuantity` and `kindNameSame` are unchanged.

B2 AMEND. The tags fire on the real passage (A1). Correct treatment: cannot-confirm, not conflict. The source states $1.5 billion as a component of a €2.1 billion total. The product cannot establish a contradiction with USD 1.5 billion, and it must not let that passage stand as support for USD 1.5 billion as the refinancing. Mechanism: keep `component` ineligible so rule (a) compares the statement to the source total. Do not require `sameQuantity` against the component ($ vs USD fails). Do not reopen B71.

B3 AGREE. It follows from the classification. The passage is no longer `confirmed`, so it cannot be the confirming excerpt, and the reducer ranks it above remaining confirmed spans on that pair.

B4 AGREE. `selectExcerpts` now prefers a stored passage of the card's class that `confirmingPassageDisagrees` with the statement, for both `conflicting` and `partially_confirmed`. A number-free confirming quote is not the only quote. If no stored passage carries the disputed figure, the demoted passage is shown anyway.

B5 AGREE. Rule (b) unchanged in pairing. B71 untouched. Existing `conflicting` and `partially_confirmed` are copied through.

B6 AGREE. No splitter, Stage 1b, prompt, frontend, copy, or extra model calls.

P34. `confirmingPassageDisagrees` callers: `demoteConfirmedClassification` (now two-tier), `stage4-select-excerpts.mjs` (boolean prefer-figure, now also on partial cards), and the B345/B346 tests. `annotateTokens`, `sameQuantity`, `kindNameSame`, `findFigureAgreements` are unchanged. `hasEgregiousMagnitudeGap` is unchanged.

---

## T1 to T4

T1 statement: USD 1.5 billion refinancing. Real passage plus qualitative, both initially confirmed.

| | After |
|---|--------|
| Real €2.1 billion span | partially_confirmed (rule a) |
| Qualitative span | confirmed |
| Card verdict | partially_confirmed / supported_partial |
| Displayed passage | the real passage containing €2.1 billion |

T2 honest EUR 2.1 billion. Same two passages.

| | After |
|---|--------|
| Both spans | confirmed |
| Card verdict | confirmed / supported_full |
| Displayed passage | qualitative |

T3 fund: USD 50 million vs EUR 800 million close. Verdict `partially_confirmed`, not conflicting. Displayed: `The fund held its final close at EUR 800 million.`

T4 acquisition: EUR 120 million vs EUR 45 million equity cheque. Verdict `partially_confirmed`, not conflicting. Displayed: `The acquisition completed in March, funded with a EUR 45 million equity cheque.`

T5 12% vs 9% like-for-like remains `conflicting` via rule (b). T6 six honest sentences: zero demotions, including honest EUR 2.1 against the real €2.1 passage. T7 five existing errors stay conflicting; B336 still withholds 119 to 330.

---

## Correct writing this would still fire on

A confirmed passage whose only eligible money is a genuinely different instrument (a fund close against a commitment) if Stage 2 still classified that passage as confirming the sentence.

## Should rule (a) exist now that its conclusion is weaker

Yes. The fund and acquisition cases have no `component`/`total` tags and no `kindNameSame` hit. Without rule (a) they would stay confirmed, which lets a different figure stand as support.

## B345 tests that used a string that does not appear in the source

Six of seven B345 tests used the truncated `raising EUR 2.1 billion in total, including a second US dollar tranche` string (T1, T2, T3, T4, T5, and T7's honest refinancing passage). T6 did not. Those tests stay as mechanism tests of the EUR-word form. T1 and T3 now expect `partially_confirmed` instead of `conflicting`. The real production string lives only in `tests/confirming-passage-cannot-confirm.test.mjs`.
