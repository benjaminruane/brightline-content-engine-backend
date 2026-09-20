# Honesty disclosure (B249, B250, B259, B247, F24, B164, B251, B274)

BUILD SPEC. Backend `75318f9` tag `b249-honesty-disclosure`. Frontend `33c83c6` same tag.

Proof: production `POST /api/analyse-statements` HTTP 200 in **140174 ms**. Trace `9c073219-5b96-4f1c-8ba2-84dd60289f21`. Extract `scripts/diagnostic/delivery-check/honesty-proof/production-extract.json`.

---

## Scoreboard

The reviewer is now told about **33 sentences dropped as not a claim**, **1 uncovered run** (`Why?`), and **185 cards**. **219** in all. Previously the same memo showed **186 cards** and said nothing about the rest.

| | Before (recorded after-run) | After (this proof) |
|--|--|--|
| Cards | 186 | **185** |
| Dropped not-a-claim (shown) | 0 | **33** |
| Uncovered runs (shown) | 0 | **1** (`Why?`) |
| `Date: October 12, 2010` | Conflicting card quoting B1 | **Dropped**, listed with its reason |
| B1 stub quoted on the card face | 26 | **6** (the ones with a locatable span) |
| Cards with `excerptNotLocatable` | 0 | **20** |
| Not checked (QRS) | 67 on the recorded after-run | **118** |
| Progress bar | none | would show; see D10 |

118 notChecked is Stage 6 `not_reviewed` on this run (58 editorial, 44 compliance), not a silent drop of draft sentences. Distinct from B249.

---

## Ids used

Given: **B249, B259, B250, B247, F24, B164, B251** (closed). Next free for the progress indicator: **B274**.

---

## Part 0A. Claims

**C1 BLOCKING. TRUE.** Two silent doors: `isClaim=false` drop, and LLM omit / span union not covering the draft. CONFIRMED `stage1-extract-statements.mjs` (filter still there; drops now carried). Shopify recorded log: 34 dropped, 21 uncovered regions, 1275 chars (5.8%). This proof: 33 dropped shown, 1 uncovered shown.

**C2 BLOCKING. TRUE.** Every recorded Shopify card has `charStart`/`charEnd` and `draft.slice(start,end) === statement`. CONFIRMED `tests/b249-unchecked-sentences.test.mjs`. Coverage does not re-split.

**C3 BLOCKING. TRUE.** Match throw/malformed was `no_support`. CONFIRMED v4 `stage2-match-sources.mjs` before this spec. Now `not_reviewed`.

**C4 CHECK. TRUE.** r6-unsupported card 0 quotes Oakfield with empty `supportSpans`. CONFIRMED fixture. After: `assembleCard` stores `primaryExcerpt` null.

**C5 CHECK. TRUE.** B247 r3 stores `clean` while those checks are off. F24 filter ignored evidence. B164 warnings dropped on the main path. B251 passage rejected, class kept, log only.

**C6 CHECK. TRUE.** `countWords` on the draft before Review. This memo 3698 words, last wall 123 s, this proof 140 s. Estimate `8 + 3698/25 = 155.92` s, so the bar shows.

---

## Part 0B. Design

| Item | Verdict | What shipped |
|------|---------|--------------|
| D1 Disclose, do not override | **AGREE.** | `droppedNonClaims` from Stage 1. Filter unchanged. |
| D2 Coverage without re-split | **AGREE.** Name every non-whitespace uncovered run. A percent bar would hide B248. Shopify 5.8% is the exhibit, not a hurdle. | `lib/qc/draft-coverage.mjs`. This proof: `Why?` named; whitespace gaps unnamed. |
| D3 One place, actual sentences | **AGREE.** Quality Review Summary subsection, not inside the 3-bullet cap. | `draftCoverageDisplay.js` + panel. |
| D4 B250 | **AGREE.** Failed/malformed match is `not_reviewed`. Mixed confirmed + failed stays confirmed. Corpus tests 1283/1283, no STOP. | Stage 2/3/7. |
| D5 B259 | **AGREE.** No quote without a locatable `supportSpan`. Visible hole. | `excerpt-locate.mjs`, `excerptNotLocatable`. Copy: `The matching passage could not be located in the named source.` |
| D6 B247 | **AGREE.** Off stamps `not_reviewed` not `clean`. | `resolveAssembledVerdict`. |
| D7 F24 | **AGREE.** Filter includes evidence not reviewed / Unverifiable. QRS for r4 unchanged. | `qcWorkbenchFilters.js`. |
| D8 B164 | **AGREE.** Wire existing prep warning. Do not improve extraction. | `ingestionMetaFromPrep`. |
| D9 B251 | **AGREE and built: keep classification, show no quote.** Matcher ran. | `passageRejected` / `excerptNotLocatable`. |
| D10 B274 | **AGREE.** Frontend only. Generous `8 + wordCount/25` seconds. Bar iff > 10 s. Ease to 90% at the estimate, crawl toward 97%. At 2x: `Still working. N words.` | `reviewProgressEstimate.js`. |
| D11 Scope | **AGREE.** Split, editorial payload, Stage 6 pool unchanged. CONFIRMED `STAGE6_CONCURRENCY === 4`. | Stop not needed. |

Places that assumed `no_support` meant the sources were consulted (D4):

1. v4 `stage2-match-sources.mjs` missing key, schema fail, throw (fixed to `not_reviewed`).
2. v3 `stage2-match-sources.mjs` still fail-opens to `no_support` (not production).
3. `stage3-aggregate-verdict.mjs` unknown class still `no_support`; `not_reviewed` is now a non-voter.
4. `pipeline-v4/index.mjs` `normalizeMatchClassification` (now keeps `not_reviewed`).
5. `intra-source-reducer.mjs` rank (now includes `not_reviewed` at 0).
6. `stage4-select-excerpts.mjs` still maps unknown to `no_support` for excerpt pick only; empty passages are skipped.
7. `recencySourceIndices` treated anything other than `no_support` as consulted (now excludes `not_reviewed`).
8. `WIDENED_SCOPE` already skipped non-supporting classes, so `not_reviewed` is not widened.

Readers of `clean` changed (D6): `resolveAssembledVerdict` when the toggle is off; `safeEditorialDefaults` when `reviewOptions` is present; `tests/b202-not-checked-at-source.test.mjs` OFF case. `classifyCard` still returns null for an OFF review.

F24 recorded-state Not checked counts (before filter / after filter / delta):

- r1, r2, r3, r5, r6, r6-near-limit, shopify-messy-full: 0 / 0 / 0
- r4-editorial-only: **0 / 2 / +2**
- shopify-messy-full-after: 67 / 67 / 0

---

## Tests, failing then passing

Recorded memo (`shopify-messy-full.json`): `meta.draftCoverage` undefined (before picture). Coverage from cards names `Why?` and `To: BVP Group` without re-splitting (after helper). Both pass on current code.

Recorded r6: card still quotes Oakfield (before picture). `gateExcerpt` refuses it. `assembleCard` stores `primaryExcerpt` null and `excerptNotLocatable` true (after). All four `tests/b259-unlocatable-excerpt.test.mjs` pass.

Targeted backend 29/29. Full backend **107 files, 1283 tests**. Frontend **35 files, 204 tests**.

---

## SHIP VERIFIED

```
SHIP VERIFIED  75318f9  main  107 files  1283 tests
SHIP VERIFIED  33c83c6  main  35 files  204 tests
```

Tags: `b249-honesty-disclosure` on both repos.

---

## Proof

Same memo (`_auditDraft` 22163 chars, 3698 words), B1 stub inline labelled `B1 Shopify source`, all three checks on. Production `https://brightline-content-engine-backend.vercel.app`.

### Sentences that were not checked (verbatim from `meta.draftCoverage`)

Not checked as claims (33), each with reason `Not checked as a claim (heading, salutation, or transition).`:

Shopify — Long-form memo; Shopify; To: BVP Group; From: Alex Ferrara, Trevor Oelschig; Date: October 12, 2010; Re: Shopify; Market Opportunity; Shopify plays into two themes:; Customers & Pricing; Product; * Customize storefront n s look & feel.; * Organize and manage products.; * Perform basic inventory management.; * Accept credit card payments through payment gateways.; * Track and respond to orders.; Some examples:; Customer Acquisition & Retention; Market Opportunity; Competition; Team; Summary Financials; Summary P&L; Deal; Outcomes Analysis; Conclusion; Appendix; Consumerization of Enterprise Software Roadmap; Because barriers-to-entry are low and customer churn can be high, we believe that breakout companies will have the following characteristics:; * Product categories with well-known and well-defined pain points and a natural stickiness; * Companies achieving strong growth with limited marketing spend; * Companies with good customer acquisition economics, even if still early; * Companies beginning to build a brand and scale relative to competitors; * Teams with a strong product design sense and consumer Internet DNA.

Not covered by the review (1): ` Why?`

A reviewer can find those sentences from the Quality Review Summary subsection alone. They cannot find them from the three bullets, which cap at evidence counts.

### Quality Review Summary (3-bullet cap)

Badge: **Needs significant work**

- 96 claims have no source behind them. Remove them or find supporting evidence before this draft is final.
- 17 claims conflict with the cited sources. Reconcile the contradictions before this draft is final.
- 118 claims could not be fully checked. Read them yourself or run Review again.

Not checked count: **118**.

### The card that previously quoted an unrelated document

`Date: October 12, 2010` is no longer a card. It is in the dropped list above. The previous B1 quote on that date line is gone with the card.

A remaining conflict card (Shopify targets SMBs…) now has `primaryExcerpt` **null**, `excerptNotLocatable` **true**, displayVerdict **conflict**, named source `B1 Shopify source`. The screen line: `The matching passage could not be located in the named source.` Six cards still quote the B1 stub because they have a locatable span. **B264** stays open for those.

### Progress indicator

This proof was the API POST, so the bar was not on screen. Frontend only. For 3698 words the estimate is **155.92 seconds**, which is over ten, so the bar would show **Reviewing about 3698 words.** Wall was 140 s, under the estimate, so it would ease to about 81% of the 90% mark and then complete. It would not reach twice the estimate. At twice the estimate the caption would be **Still working. 3698 words.** and the bar would crawl toward 97%, never 100% until done.

Browser: skipped for the live Review (one production POST, API). Layout of the bar is covered by unit tests, not a seeded localhost reviewing state.

---

## Cost report

Budget USD 20. This pass **list USD 6.6747**. Discounted USD 4.2371.

| Pass | List USD | Discounted USD | Calls | Source |
|------|---------:|---------------:|------:|--------|
| Production proof | 6.6747 | 4.2371 | 596 | Langfuse trace `totalCost` `9c073219-5b96-4f1c-8ba2-84dd60289f21`; cached 1,950,080 |

Unpriced 174: `editorial-style-review`, `qc-compliance-review`, `stage5-generate-commentary` with no `calculatedTotalCost`. Those cards stamp `not_reviewed` where the check did not finish.

---

## What was not built

Editorial three-layer redesign. Stage 1 split change. Stage 6 pool change. `computeGuardrailForSource` on production. Closing **B248**, **B264**, **B235**.
