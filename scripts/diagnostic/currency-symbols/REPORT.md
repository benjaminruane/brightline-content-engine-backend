# B347. The product can read a currency symbol, and a stated total that differs is a contradiction

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | c20b858 | SHIP VERIFIED  c20b858  main  137 files  1618 tests |
| frontend | not touched | -- |

Ids used: B347.

Cost: USD 0. No model calls.

Browser: skipped. No frontend change.

---

## Part 0A

A1 TRUE. Quoted `lib/revise-actions/conflict-engagement.mjs` before this spec:

```
const CURRENCIES = "EUR|USD|GBP|SEK|CHF|NOK|DKK";
```

`TOKEN_RE` first money branch was `(?:${CURRENCIES})\s+\d+...` then `\d+ million|billion`. No symbol branch.

A2 `annotateTokens` BEFORE this change:

```
€2.1 billion     raw "2.1 billion"     kind money value 2.1 currency null scale billion component false total false
EUR 2.1 billion  raw "EUR 2.1 billion" kind money value 2.1 currency EUR  scale billion component false total false
$1.5 billion     raw "1.5 billion"     kind money value 1.5 currency null scale billion component false total false
USD 1.5 billion  raw "USD 1.5 billion" kind money value 1.5 currency USD  scale billion component false total false
£40 million      raw "40 million"      kind money value 40  currency null scale million component false total false
US$1.5 billion   raw "1.5 billion"     kind money value 1.5 currency null scale billion component false total false
2.1 billion      raw "2.1 billion"     kind money value 2.1 currency null scale billion component false total false
```

A3 TRUE. Quoted `confirming-passage-disagrees.mjs` before this spec: `moneyMagnitudeEqual` returned true when kind, scale, and value matched, with no currency test. USD 2.1 vs €2.1 (then currency null) was `sameQuantity` false and `moneyMagnitudeEqual` true, so rule (a) refused. That is why a pure currency error passed clean.

A4 Callers that read `currency` off a token, both repos.

Frontend: none.

Backend, `annotateTokens` / `tokenizeQuantities` tokens:

- `kindKey` (`conflict-engagement.mjs`): money key includes `:EUR` or `:bare`. A symbol resolving to a code stops treating € as bare. `sameQuantity` and `kindNameSame` inherit this. Pairing (`findCandidatePairs`, `compatibleTokens`) and `findFigureAgreements` inherit it. Honest EUR vs € now agree. USD vs EUR still differ.
- `compatibleTokens` / `kindNameSame`: `Boolean(draft.currency) !== Boolean(source.currency)` refuses when only one side has a code. After this spec, € and EUR both have a code, so presence matches. Bare `$` still has no code, so `$` vs USD still refuses `kindNameSame`.
- `source-governance.mjs` `sameKindDifferentValueToken`: same presence check. `$` vs USD still will not pair as a contradiction at equal magnitude.
- `confirming-passage-disagrees.mjs` `sameQuantity` / `kindNameSame` / `moneyMagnitudeEqual`: see B3.

Backend, different extractors, not this tokenizer:

- B71 `extractMoney` / `currenciesDiffer` / `metricsDiffer` / `hasEgregiousMagnitudeGap` in `stage2-match-sources.mjs`. Already maps `$` to USD, `€` to EUR, `£` to GBP. This TOKEN_RE change does not alter that path.
- `canonicalClaims.js` / `api/_lib/canonicalClaims.js` `extractCurrency`: separate, defaults `$` to USD. Untouched.
- `api/generate.js` / `api/rewrite.js` `parseCurrencyMentions`: separate. Untouched.
- Diagnostic `scripts/diagnostic/inner-claim/probe.mjs`: prints tokens only.

A5 REAL production strings BEFORE this change. Source passage:

```
raw "2.1 billion"  kind money value 2.1 currency null total true  component false
raw "1.5 billion"  kind money value 1.5 currency null total false component true
```

Statement:

```
raw "USD 1.5 billion" kind money value 1.5 currency USD total false component false
```

Fund pair: statement USD 50 million total false component false; passage EUR 800 million total false component false. Acquisition pair: statement EUR 120 million total false component false; passage EUR 45 million total false component false (plus date March). `TOTAL_CUE` does not fire on "final close" or "equity cheque".

AFTER this change, the real passage money tokens are `€2.1 billion` currency EUR total true, and `$1.5 billion` currency null component true.

---

## Part 0B

B1 AGREE. `€` to EUR, `£` to GBP, `¥` to JPY. Binds to the following number with or without a space, scale word optional as with ISO codes. `JPY` added to the ISO list so the code form tokenises too.

B2 Leave bare `$` unresolved (`currency: null`). `US$` / `US $` resolve to USD. Evidence required for USD: the letters US immediately before the dollar, or the ISO code `USD`. If the document also uses another dollar (CAD, AUD), a bare `$` still stays unknown and does not disagree with USD at the same value and scale (`moneyMagnitudeEqual` when one side is unknown). Resolving bare `$` to USD would manufacture a disagreement against CAD/AUD at the same number. That is refused.

B3 AGREE. `moneyMagnitudeEqual` now returns true only when value and scale match and at least one currency is unknown. Both known and different: rule (a) fires.

B4 AGREE. Rule (a) is `conflicting` when the source figure carries `total` and the statement figure carries neither `total` nor `component`. Otherwise `partially_confirmed`. Rule (b) unchanged.

B5 AGREE that B4 is the right width. The tags fire on the real passage. Fund and acquisition have no total cue, so they stay cannot-confirm. Promoting every rule (a) hit would reassert contradictions the product cannot establish.

B6 AMEND the premise. B71 is a separate extractor. `extractMoney` already resolved `$` `€` `£` before this spec. `currenciesDiffer` does not start seeing new currencies because of this TOKEN_RE change. Magnitude force still suppresses USD vs EUR on the real refinancing card (B71). Unwanted change on B71: none. `¥` is still invisible to B71; not reopened.

B7 AGREE.

---

## T2 to T8

T2 honest EUR 2.1 billion vs real passage: no demotion, `confirmed` / `supported_full`, displayed qualitative passage.

T3 USD 2.1 billion vs real passage: rule (a) `conflicting` (B4: source total, statement unqualified). Displayed: the real passage containing €2.1 billion. This case passed clean yesterday.

T4 `$1.5 billion` vs `USD 1.5 billion` either way: no demotion.

T5 real USD 1.5 billion statement vs real passage plus qualitative: `conflicting` / `conflict`. Displayed: the real passage containing €2.1 billion.

T6 fund: `partially_confirmed` / `supported_partial`. Displayed: `The fund held its final close at EUR 800 million.`

T7 acquisition: `partially_confirmed`, not conflicting.

T8 no total cue (USD 1.5 billion vs EUR 2.1 billion refinancing, no "in total"): `partially_confirmed`. Displayed: `The company completed a refinancing of EUR 2.1 billion.`

T9 six honest sentences: zero demotions. T10 five existing errors stay conflicting; B336 still withholds 119 to 330.

---

## T11 existing suite

Three tests changed, all because of B4 (source `total` vs unqualified statement), not because a symbol resolved in those fixtures. Full suite after the updates: 137 files, 1618 tests, all pass.

1. `tests/confirming-passage-disagrees.test.mjs` T1. Truncated `EUR 2.1 billion in total` against USD 1.5 billion. Was `partially_confirmed`. Now `conflicting`. Correct: the source figure is tagged total.
2. Same file T3. EUR 1.5 billion vs that same `in total` passage. Was `partially_confirmed`. Now `conflicting`. Correct for the same reason.
3. `tests/confirming-passage-cannot-confirm.test.mjs` T1. Real refinancing passage. Was `partially_confirmed`. Now `conflicting`. Correct: this is the case B347 exists to catch.

No other existing test failed. Pairing, B336, B71 calibration, and quantity-match tables were unchanged.

---

## Correct writing this could now turn red

A draft that names the right number in the wrong known currency against a source total (USD 2.1 billion vs €2.1 billion in total) now reads as a conflict. Yesterday it passed clean.

## Would you ship this, given A4

Yes. Every `annotateTokens` currency reader benefits from seeing EUR for €. Bare `$` stays unknown, so the ambiguous symbol cannot manufacture a disagreement. B71 is a different extractor and was not disturbed.
