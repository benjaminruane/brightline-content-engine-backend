# B359. A length limit may shorten a quote, never decide whether one was found

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 41f1d697d5cde1f79c5d4a9fbb67075c8c61254b | SHIP VERIFIED  41f1d69  main  154 files  1712 tests |
| frontend | untouched | not run |

Ids used: B359 (this spec). Succeeds B358 Part 4.

Cost: USD 0. No model calls.

Browser: skipped. Quote recovery, sentence trim, and two-run join are deterministic. No layout or control change. No Review.

---

## Part one design

The 400-character clip sat in front of exact search, which does not need it. Exact and normalised recovery now search the full pointer. The Levenshtein window path stays bounded at 400 characters because its cost is O(needle x window) per candidate start, and a 654-character needle on a real source is a bill, not a bound on truth. Hitting that bound logs `[excerpt-from-source] window_bound statementIndex=N length=L` and returns a miss. It never returns a truncated slice. Stage 2 v4 no longer trims the matcher pointer to 400 before resolve, and no longer trims a recovered slice afterwards.

Rejected: raising 400 (the S7 figure still sits past any fixed leading clip). Clipping after exact (a near-miss pointer would still be silently shortened). Unbounded window (the expensive path). Leaving v3 Stage 2 clipped (production is v4; v3 kept as-is).

---

## Part two design

The product still holds one `primaryExcerpt` string. When two locatable source runs belong to one statement, they are joined with ` ... ` in that string. Offsets on a multi-run result are null so a later slice cannot pull the skipped middle back in. No new qcCard field. No frontend change: the card already renders one string.

When a supported or partial card has no pointer and no locatable span, and Stage 2 did not already reject the passage, assembly searches uploaded sources for sentences that carry the statement's distinctive figures and ALL-CAPS names (MPM, MAIT, 3.2x, 2.8x), not the document party. Name-only hits more than two sentences from a figure hit are dropped. A `passageRejected` or `emptyConfirmationRefused` match does not get this search (D9 stays a miss).

Rejected: a second quote field (needs a frontend contract). Showing the middle proceeds sentence as one continuous span (it is not the claim). Searching on every card (would invent quotes on genuine misses).

### S10 hypothesis

CONFIRMED. Each bullet locates in `source-3i-hy25-extracted.txt`. Their concatenation is not a substring: the proceeds sentence (`£542 million`) sits between them, so `locatePassageInSource` on the concat returns null/null. Cheap test, no model: `tests/excerpt-two-bullets.test.mjs`.

---

## Part three design

A displayed quote is whole sentences. Ceiling is six sentences, or the must-keep cover if that cover is larger. Must-keep sentences are those that carry the statement's figures, dates, or names. Optional sentences fill from the adjacent ends, highest score first. A drop is marked `... ` at the lead or ` ...` at the tail, never glued to a letter or a figure. One long sentence with no internal terminator is shown in full: cutting it would violate R2, and the sentence is the unit.

Six is the ceiling because the complaint was the limit choosing the content. Six whole sentences covers the 654-character S7 span's claim-bearing sentences without the 300-character window that began mid-word. Err towards showing more.

Rejected: keeping 300 and snapping to a sentence (length still decides which facts appear). Unlimited quotes (the card becomes the source). Dropping must-keep sentences to fit six (violates R3).

---

## New files created

- `lib/qc/excerpt-sentences.mjs`
- `tests/excerpt-recovery-bound.test.mjs`
- `tests/excerpt-two-bullets.test.mjs`
- `tests/excerpt-sentences.test.mjs`
- `scripts/diagnostic/b359/REPORT.md`
- `scripts/diagnostic/b359/dump-cards.mjs`
- `scripts/diagnostic/b359/card-display.json`

---

## Before and after display

B358 replay versus B359 replay on `tests/fixtures/real-runs-2026-09-29/`. Cards whose quote did not change from B358 are omitted (S1/S11 quote moves are B351; DOC S8 quote is unchanged from B358, still `actor_mismatch`). Full dump: `scripts/diagnostic/b359/card-display.json`.

### clean-review.json S5 (quote)

Before, Confirmed / none:

...e nine reporting periods ending on 28 September 2025 (“P9”), Action generated net sales of €11,229 million
(nine reporting periods ended P9 2024: €9,567 million), operating EBITDA of €1,563 million (nine reporting periods
ended P9 2024: €1,344 million) and like-for-like (“LFL”) sales growth of 6.3%.

After, Confirmed / none:

In the nine reporting periods ending on 28 September 2025 (“P9”), Action generated net sales of €11,229 million
(nine reporting periods ended P9 2024: €9,567 million), operating EBITDA of €1,563 million (nine reporting periods
ended P9 2024: €1,344 million) and like-for-like (“LFL”) sales growth of 6.3%.

### clean-review.json S6 (quote)

Before, Confirmed / none:

...ansactions. The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action.

After, Confirmed / none:

In October 2025, Action successfully completed two financing transactions. The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action.

### clean-review.json S7 (quote)

Before, Confirmed / none:

...n Action. As a result of this transaction, we increased our ownership position in Action to
62.3%. The second financing transaction repriced €3.1 billion of Action’s existing term loan debt, extending the
maturity of a portion of the debt and generating an annual interest cost saving of €14 million.

After, Confirmed / none:

... The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action. As a result of this transaction, we increased our ownership position in Action to
62.3%. The second financing transaction repriced €3.1 billion of Action’s existing term loan debt, extending the
maturity of a portion of the debt and generating an annual interest cost saving of €14 million.

### clean-review.json S8 (quote)

Before, Confirmed / none. Same mid-word opening as S6 before.

After, Confirmed / none. Same text as S6 after.

### clean-review.json S9 (quote)

Before, Confirmed / none:

...ly, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action. As a result of this transaction, we increased our ownership position in Action to
62.3%.

After, Confirmed / none:

In October 2025, Action successfully completed two financing transactions. The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action. As a result of this transaction, we increased our ownership position in Action to
62.3%.

### clean-review.json S10 (quote and verdict)

Before, not reviewed / none. Quote empty.

After, Confirmed / none:

• Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period . ... The sales
achieved sterling money multiples of 3.2x and 2.8x respectively.

(The space before the period is in the stored source text, not a mid-sentence cut.)

### clean-review.json S12 (quote)

Before, Confirmed / none:

...return of £139 million, or 9% (September 2024: £43
million, 3%). This was driven primarily by a 14% increase in 3i Infrastructure plc’s (“3iN”) share price in the six-month
period to 30 September 2025. 3iN’s underlying portfolio continues to perform well, with a significant valuation uplift in
TCR.

After, Confirmed / none:

Our Infrastructure business generated a gross investment return of £139 million, or 9% (September 2024: £43
million, 3%). This was driven primarily by a 14% increase in 3i Infrastructure plc’s (“3iN”) share price in the six-month
period to 30 September 2025. 3iN’s underlying portfolio continues to perform well, with a significant valuation uplift in
TCR.

### doc-review.json S5, S6, S7, S9, S10, S12 (quotes)

Same quote moves as the clean cards of the same index. DOC S5 stays Conflict (doctored sales figure). DOC S9 stays Conflict (AGIC). DOC S10 becomes Confirmed with the same two-run quote as clean S10.

---

## Tests whose expectation moved

- `tests/card-honesty-invariant.test.mjs` T2: empty confirmation is still refused at the matcher on an empty passage. Replay of S10 is now `supported_full` with the two-run quote, not `not reviewed`.
- `tests/editorial-source-awareness.test.mjs` C1 `expected[10]`: `not reviewed` to `supported_full`. C2 S10 the same, plus the quote must contain 3.2x and 2.8x.

The matcher refuse on an empty passage is unchanged. Assembly now finds the source sentences the product was holding as a confirmation, so the card is no longer silent.

---

## Anything not done

- A second quote field for the doctored S9 GIC span. The card is still Conflict because the draft says AGIC. The GIC passage remains on `supportSpans[0]` and is still not the displayed quote. Two cards, one limitation. A second displayed passage would need a frontend contract; not guessed here.
- v3 Stage 2 still clips at 400. Production is v4.
- Compound prefilter still misses S10 (`isCompoundCandidate` is false). Not required once assembly can hold two runs.
- Frontend: no change.

---

## Design decisions (record)

- Ceiling: 6 sentences, or full must-keep cover. One long sentence in full.
- Multi-run display: one string, ` ... ` gap, null offsets when `runCount > 1`.
- Window bound: 400 characters, log and miss, never clip exact/normalised.
- Source search only when supported/partial, no pointer, no span, and the match was not already rejected.
- Distinctive anchors for source search: figures, Nx multiples, ALL-CAPS names. Not "3i", not Title-Case "Action".
- Name-only hits kept only within two sentences of a figure hit, so later "MPM and MAIT" commentary is not pulled in.
- `trimExcerptTo300` kept as the export name and now wraps `trimExcerptToSentences`.
