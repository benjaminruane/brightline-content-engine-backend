# B369. A card that shows a quote says something

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 76aaf10 | SHIP VERIFIED  76aaf10  main  160 files  1767 tests |
| frontend | not touched | |

Ids used: B369 (this spec). Succeeds B366.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or card-face chrome change. The comment text is checked by replaying `tests/fixtures/real-runs-2026-10-02/` (live must-passes, S10 with the empty-confirmation flag as B366 injects it) and `tests/fixtures/real-runs-2026-09-29/` (older shape). A stored October payload still has skipped S10 without the flag, so production does not show this card until a new Review runs the shipped assembler.

---

## Design decisions

1. **General guard, last writer before the card is stamped.** `fillQuoteWithoutComment` in `lib/qc/commentary-inventory.mjs`. Stage 7 calls it after actor, scale, role-party, `dropMatchTheSourceSentences`, and `markConfirmingInsideConflict`. Any route that would leave a shown passage and an empty `evidenceSummary` goes through it. It is not patched into the B366 absence-drop only.

2. **Name the terms the quote actually carries.** `namedClaimTermsInPassages` uses `claimAnchors`, not `extractVerifiableAnchors`. B356 inventory on S10 is `['3','2']`. That cannot name MPM, MAIT, or the multiples. `claimAnchors` returns `['3.2x','2.8x','MPM','MAIT']`. Wording reuses B356 / B364 `matchSentence`. `isFigureOrDateItem` treats `3.2x` as a figure so the multiples are not wrapped as phrases.

3. **Multiples extract as `claimAnchors`, not as verifiable anchors.** `extractVerifiableAnchors` still splits `3.2x` into `3` and `2`. This spec does not widen that extractor. The recovered S10 comment names `3.2x` and `2.8x` because they are `claimAnchors` present in the recovered quote.

4. **Match-the-source only on a green card.** `allowMatchSentences` is true only when `honestDisplayVerdict === "supported_full"`. A non-green card with a quote and no comment gets the fallback, so a finding is not followed by reassurance (B363 R3).

5. **Fallback wording.** `A source passage is shown on this card.` It states only that a quote is on the face. It does not assert support the quote may not carry, and it does not restate the draft.

6. **A Stage 5 miss with a quote is no longer silent.** `appendSourceStatedClauses` still returns early on empty prose (B354). The new fill writes the comment and clears `commentaryNotReviewed`, so the summary line does not read Not checked on a card that now has a comment. A miss with no quote is unchanged (B254).

7. **Log.** `[stage7] quote-without-comment statementIndex=... route=... named=... fallback=...`. Routes: `empty_confirmation_cleared` (B366 absence drop left nothing), `commentary_not_reviewed` (Stage 5 miss), `never_written` (empty prose, not flagged as a miss), `stripped` (a later strip emptied a written comment).

8. **P34 callers.** `fillQuoteWithoutComment`: `stage7-assemble-card.mjs` only. `namedClaimTermsInPassages`: `fillQuoteWithoutComment` only. `claimAnchors` callers after this spec: `excerpt-sentences.mjs` (locate and distinctive-anchor filter) and `namedClaimTermsInPassages`. `isFigureOrDateItem` Nx branch is local to `matchSentence`, which `appendSourceStatedClauses` and `fillQuoteWithoutComment` both use. Inventory from `extractVerifiableAnchors` still does not emit Nx, so B356 / B364 clause tests are unchanged.

---

## New files created

- `tests/b369-quote-without-comment.test.mjs`
- `scripts/diagnostic/b369/REPORT.md`
- `scripts/diagnostic/b369/dump-cards.mjs`
- `scripts/diagnostic/b369/card-display.json`

---

## Part 0. Claims

C1. B366 recovery on October S10 (flag injected) returns `supported_full` with MPM, MAIT, 3.2x, 2.8x on the quote, and clears the absence comment. CONFIRMED. `tests/b366-party-and-empty-quote.test.mjs`. After this spec the comment is no longer empty.

C2. `extractVerifiableAnchors` on S10 is `['3','2']`. CONFIRMED. `claimAnchors` is `['3.2x','2.8x','MPM','MAIT']`. CONFIRMED. Dump `scripts/diagnostic/b369/card-display.json` `anchors`.

C3. Stored fixtures have no card with a quote and an empty comment. The hole is the B366 recovery path. CONFIRMED by the sweep over both sets without the flag (`emptyQuote: []`) and by the injected S10 case, which is the card this spec fills.

---

## Recovered statement 10

October 2 doc-review, `emptyConfirmationRefused: true` injected as B366 tests do. Dump `scripts/diagnostic/b369/card-display.json` `s10Recovered`.

Statement:

```
Elsewhere, within the private equity portfolio, 3i completed the sale of MPM and signed an exit of MAIT during the period, which generated gross money multiples of 3.2x and 2.8x, respectively.
```

Verdict: `supported_full`. `supportState`: `supported`. `concernLevel`: `none`. `commentaryNotReviewed`: false.

Quote:

```
• Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period . ... The sales
achieved sterling money multiples of 3.2x and 2.8x respectively.
```

Comment:

```
3.2x and 2.8x match the source. The phrases 'MPM' and 'MAIT' match the source.
```

Log: `[stage7] quote-without-comment statementIndex=10 route=empty_confirmation_cleared named=4 fallback=false`.

---

## Sweep. Other routes that leave an empty comment

None on either fixture set.

Replayed `tests/fixtures/real-runs-2026-09-29/clean-review.json`, `tests/fixtures/real-runs-2026-09-29/doc-review.json`, `tests/fixtures/real-runs-2026-10-02/doc-review.json`, and the October set again with S10's refusal flag. Every card that shows a quote has a comment. The only fill the log recorded is October S10 with the flag, route `empty_confirmation_cleared`.

September S10 already has a comment after B359 locate, so the guard does not fire there.

A constructed Stage 5 miss with a quote (inventory assembleCard case, 9% GIR) fills via `commentary_not_reviewed` and names `9%`. That is a test card, not a fixture card.

A card with no quote and no comment stays empty. B254 still holds.

---

## Must-pass hold

B351 honesty (`tests/card-honesty-invariant.test.mjs`, `tests/excerpt-selection.test.mjs`), B356 (`tests/commentary-clause-placement.test.mjs`), B364 (`tests/b364-house-style-source-quote.test.mjs`), B366 (`tests/b366-party-and-empty-quote.test.mjs`), B254, B363: all passed in the same vitest run as B369.

---

## Cards whose comment changes

| Card | Fixture | What moved |
|------|---------|------------|
| DOC S10 | October 2, flag injected | Absence comment was already cleared by B366. This spec writes `3.2x and 2.8x match the source. The phrases 'MPM' and 'MAIT' match the source.` Verdict and quote unchanged from B366. |

No other fixture replay comment moved solely because of this guard.

---

## What was not built

- `extractVerifiableAnchors` was not widened to keep `3.2x` as one token.
- No new model call. Stage 5 is unchanged.
- Frontend not touched.

---

## P34 callers

`fillQuoteWithoutComment`: `lib/qc/pipeline-v3/stage7-assemble-card.mjs`.

`namedClaimTermsInPassages`: `fillQuoteWithoutComment`.

`claimAnchors`: `lib/qc/excerpt-sentences.mjs`, `namedClaimTermsInPassages`.
