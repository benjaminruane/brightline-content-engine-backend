# B360. A card can show every passage it needs to judge the sentence

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | baae4c874e174e960501f55037a0e99fecebbad2 | SHIP VERIFIED  baae4c8  main  155 files  1719 tests |
| frontend | f09d315a8831c05faca5d1c2d6aaca3b5ff6a089 | SHIP VERIFIED  f09d315  main  45 files  259 tests |

Ids used: B360 (this spec). B158 closed. B361 filed for Part two. Succeeds B359.

Cost: USD 0. No model calls.

Browser: local `localhost:5173`. Seeded excerpt markup on `/assess` (no Review). Two stacked quotes, `Source excerpt` then `Conflicting excerpt` on a conflict face; identical text shown once.

---

## Part one design

Ceiling is two. Every live fault in this spec is "the second stored passage was not shown", and the card already had two slots (`primaryExcerpt` string, `conflictExcerpt` object).

The second slot is filled from a stored span the primary did not show. Distinction on the card is by role only when it helps a scanner: a conflict face labels the distinct second quote `Conflicting excerpt`. Two supporting passages both sit under `Source excerpt`, stacked. Identical text is stored in both JSON slots on a one-passage conflict card (B158) and de-duped on the face.

Statement 1 shows both passages. The sentence claims 14% and "the vast majority"; the two stored spans hold £3,234 million or 14% and the 13% total return; the ceiling is two.

Doctored statement 9: the GIC September passage fills the second slot. The comment no longer says the source does not mention the earlier 2.2% purchase: assembly drops a "does not mention" sentence when a displayed quote already holds that figure. The card stays Conflicting because AGIC is absent. The quote is present either way.

Rejected: a list of passages (new contract, no live card needs three). Filling the second slot only on conflict cards (S1 is not a conflict). Role-less quotes on a conflict card (R1: the reader must tell them apart). Joining two different passages with B359's ellipsis (that join is two runs of one passage, not two passages). Raising the ceiling.

Frontend: `StatementReviewCard` still one Evidence block. Two italic quotes, same type, 8px gap. Heading `Source excerpt` on the first. Heading `Conflicting excerpt` on a distinct second only when the card is a conflict. Quiet scanning surface, not a report.

---

## New files created

Backend:

- `lib/qc/excerpt-pair.mjs`
- `tests/b360-two-passages.test.mjs`
- `scripts/diagnostic/b360/REPORT.md`
- `scripts/diagnostic/b360/dump-cards.mjs`
- `scripts/diagnostic/b360/card-display.json`

Frontend: none. Changed `src/modules/drafting/cardExcerptDisplay.js`, `src/modules/drafting/StatementReviewCard.jsx`, `src/utils/resultsScreenClaims.js`, `tests/card-excerpt-display.test.mjs`.

---

## Before and after display

Replay versus B359 replay on `tests/fixtures/real-runs-2026-09-29/`. Cards whose face did not move from B359 are omitted. Recorded-vs-replay quote recovery on S6/S7/S8/S10/S12 remains B359. Full dump: `scripts/diagnostic/b360/card-display.json`.

### clean-review.json S0

Before, Conflict. One quote (the £3,291 million / 13% period line). `conflictExcerpt` empty.

After, Conflict. Same quote in both slots. Face shows it once.

### clean-review.json S1

Before, Partial. One quote: the 13% total-return sentence. The 14% private-equity span was stored and not shown.

After, Partial. First quote: `Our Private Equity business delivered a gross investment return of £3,234 million or 14%...`. Second quote: `The total return of 13% represents a very good first half for the Group.` Both under `Source excerpt`. Comment unchanged (scale claim not rewritten; Part two).

### clean-review.json S9

Before, Confirmed. October financing quote only. GIC September span stored and not shown.

After, Confirmed. Same October quote plus the GIC September passage in the second slot. Comment already had the omission dropped by B351.

### clean-review.json S11

Before, Confirmed. One quote: the 3iN outperformed-expected-returns sentence.

After, Confirmed. That sentence plus `Our Infrastructure business generated a gross investment return of £139 million, or 9%...`.

### doc-review.json S0

Before, Conflict. One quote. `conflictExcerpt` empty.

After, Conflict. Same quote in both slots. Face shows it once.

### doc-review.json S1

Before, Confirmed. 14% private-equity quote only.

After, Confirmed. Same 14% quote plus the 13% total-return sentence.

### doc-review.json S5

Before, Conflict. Nine-period sales quote. `conflictExcerpt` empty.

After, Conflict. Same quote in both slots. Face shows it once.

### doc-review.json S8

Before, Conflict (`actor_mismatch`). Action redemption quote. `conflictExcerpt` empty.

After, Conflict. Same quote in both slots. Face shows it once.

### doc-review.json S9

Before, Conflict. October financing quote. Comment: "the source does not mention an earlier 2.2% stake purchase from AGIC". GIC span stored and not shown.

After, Conflict. Same October quote. Second quote, labelled `Conflicting excerpt`:

`In September 2025, 3i acquired 2.2% of Action equity from GIC in exchange for newly issued 3i Group plc shares , with an equivalent consideration value of £739 million. As a result of this transaction, at 30 September 2025, our equity ownership in Action was 60.1%.`

Comment after the silence strip: the 2.2% / 62.3% confirmation remains. The "does not mention" sentence and the reviewer-should sentence are gone. Verdict stays conflict (AGIC).

### doc-review.json S11

Before, Confirmed. Outperformed-expected-returns sentence only.

After, Confirmed. That sentence plus the 9% infrastructure return passage.

---

## Part two design. Claims of scale and cause. Not built.

This is not a rule against vague quantifiers. Investment writing uses "a majority" and kin when a percentage is unwanted or not allowed. The question is whether the source supports the scale or the causal relation claimed.

The 2026-08-19 rejected "relational linkage check" was an editorial connective blocklist. This is evidence support for a scale or cause claim. Different job.

### a. Recognition

Deterministic. Extend the claim inventory (B354) with a closed lexicon, not a model call.

Scale: `majority`, `vast majority`, `virtually all`, `essentially all`, `largely`, `primarily`, `mainly`, `most`, `across ... all`, `accounted for`. Cause: `driven by`, `driven largely by`, `driven primarily by`, `as a result of`, `because`.

Exclude a number plus `reporting period(s)` / `period(s)` / `months` / `years` (statement 5's "nine reporting periods" is a period, not a scale claim). Exclude a date.

The inventory can name the claim without checking it. Checking is b.

### b. Checking

Two families.

Arithmetic over figures already extracted. Statement 1 is this family: £3,234 million of a £3,291 million total return. Both figures are now on the card (Part one). A phrase-to-ratio table (product-owned: `vast majority` at two thirds, `majority` at one half, `essentially all` at 90%) can pass or fail without a model. Fail is Conflicting or Partial, not a rewrite of the vague word into a percentage.

Judgement. Statement 12 is this family: "meaningful gains across essentially all of its investments" versus "a significant valuation uplift in TCR", one holding. No second figure. Arithmetic cannot help. A universal-set quantifier (`all`, `essentially all`, `across ... investments`) whose only stored supporting span names a single proper-noun holding, and no other holding-gain sentence is stored, is a miss.

Statement 2 is cause plus scale ("driven largely by Action") whose source answers only "trades strongly". The parent quantity is in the previous sentence. Deterministic connectives already exist in the claim-span prefilter. Checking the attribution needs the source to assign that parent quantity to the named actor. That is judgement unless the source sentence itself contains `driven` plus the actor plus the parent figure.

### c. Model call

Not required for the arithmetic family or for the universal-set plus one-holding rule.

A per-statement gpt-4o-2024-08-06 call at Stage 5 size is a bill. CONFIRMED: one 186-card run's Stage 5 was 186/186, list USD 0.662 (`docs/SPEND_LEDGER.md`, Shopify messy full after). That is USD 0.0036 list per statement, about USD 0.05 list for fifteen statements, every Review. A batched one-call-per-run over the flagged claims only would be cheaper (one Stage-5-sized payload, not fifteen). Do not add a call per statement unless the deterministic slice has been measured and still misses statement 12.

### d. Smallest version that catches statement 12

1. Inventory the lexicon in a. No model.
2. Arithmetic pass on any scale claim that has two comparable money or percentage figures in the displayed passages. Statement 1 passes (3234/3291). Leave its verdict as it is.
3. Universal-set plus one-holding: if the claim uses `essentially all` / `all of its` / `across ... investments` and the confirming passage names exactly one holding as the gain, conflict (or partial). Statement 12 doctored matches. Statement 12 clean says "including meaningful gains on its investment in TCR", which is an example, not a universal set; the lexicon must not treat `including` as `all`. Statement 5's "nine reporting periods" is excluded by the period token rule.

No new Stage 5 call in this slice.

### e. Measure before building

- Census the fifteen plus fifteen fixture cards, and one more live 3i-class run, for lexicon hits.
- Of those hits, how many already have two figures on the card (statement 1 class) versus a universal set with one named holding (statement 12 class) versus a cause with no figure (statement 2 class).
- Run the universal-set plus one-holding rule on both S12 wordings. It must flag doctored S12 and leave clean S12 and S5 untouched.
- Count false positives on "including" examples and on "primarily driven by" where the source uses the same connective (clean S12's share-price sentence).
- If the deterministic slice still misses doctored S12, price one batched judgement call on the remaining hits only, not a call per statement.

---

## Tests whose expectation moved

- `tests/second-conflict-quote.test.mjs` T5: a one-passage conflict card now copies that passage into `conflictExcerpt` (was null). T6: same-text fill is required on that card; a different stored span still fills a distinct second.
- `tests/conflict-excerpt-from-span.test.mjs` first test: when the span is the only competing passage it is also `conflictExcerpt` (was null).

New: `tests/b360-two-passages.test.mjs`. Frontend: `resolveCardExcerpts`, `CONFLICTING_EXCERPT_HEADING`.

---

## Not done

Part two is design only. Filed **B361**. No lexicon, no arithmetic pass, no universal-set rule, no model call.

`conflictExcerpt` is still an object, `primaryExcerpt` still a string. Shape unification from the B158 annotation is not this spec.

CLEAN S1 stays Partial. The 14% and 13% quotes are on the card; the comment still says the source does not "explicitly" attribute the vast majority. That rewrite is Part two.
