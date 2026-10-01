# B358. Show the part of the quote that bears on the claim

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending push | pending |
| frontend | pending push | pending |

Ids used: B358 (this spec). Filed **B359** (empty S7/S10 quote; diagnosis only).

Cost: USD 0. No model calls.

Browser: skipped. Quote window, verdict stamp, and concern-text strip are deterministic. No layout or control change that needs a Review. No Review.

---

## Part one design

Keep the 300-character budget. It is still the right lever: the defect was which 300, not that 300 exists. Relevance is judged at trim time from the statement: verifiable anchors, backstop figures, and content tokens of length 6 or more (hyphenated 4 or more). Each sentence of the held passage is scored by needle overlap. Candidate windows are contiguous sentence runs that fit the budget, plus the last 300 characters of the positive-cover range so two distant figures (2.2% and 62.3%) can share a window when no two-sentence run holds both. Rank by positive-sentence count, then later end, then score sum, then length. A non-leading cut is marked with a leading or trailing ellipsis. No relevant overlap, or no needles, falls back to today's leading window. Never cut inside a figure. Stage 4 scores the full held passage. Assembly prefers `widestHeldPassage` (the longest stored span that contains the gated pointer) and then trims statement-aware, so a 400-character leading pointer cannot hide a later relevant sentence the product is already holding.

Rejected: raising the budget (the net-sales cut was one word; a bigger cap still fails a 654-character span). Always showing the whole span (breaks the card). An LLM window (cost, non-deterministic, not needed). Assembly-only trim (Stage 4 would still score and store a leading stub). Selection-only (assembly would still trim the pointer's opening).

---

## New files created

- `tests/excerpt-window.test.mjs`
- `scripts/diagnostic/b358/REPORT.md`
- `scripts/diagnostic/b358/dump-cards.mjs`
- `scripts/diagnostic/b358/diagnose-empty.mjs`
- `scripts/diagnostic/b358/card-display.json`
- frontend `tests/review-card-concern-display.test.mjs`

---

## Before and after display

Recorded fixture versus deterministic replay of Stage 4 plus assembly on `tests/fixtures/real-runs-2026-09-29/`. Cards whose quote, verdict, colour, or copy did not change from this spec are omitted (S0 inventory-clause replay is B356; S3/S12 editorial drop replay is B352/B355). Full dump: `scripts/diagnostic/b358/card-display.json`.

### clean-review.json S1 (quote)

Before, Partially confirmed / moderate:

The total return of 13% represents a very good first half for the Group.

After, Partially confirmed / moderate:

Our Private Equity business delivered a gross investment return of £3,234 million or 14% (September 2024:
£2,071 million, 11%).

Comment unchanged.

### clean-review.json S5 (quote)

Before, Confirmed / none. Quote ended `sales growth of 6.`

After, Confirmed / none. Quote ends `sales growth of 6.3%.` and is marked with a leading ellipsis. Comment unchanged (already names 6.3%).

### clean-review.json S6 (quote and verdict)

Before, Unverifiable / none. Quote empty.

After, Confirmed / none:

...ansactions. The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action.

Comment unchanged.

### clean-review.json S7 (quote and verdict)

Before, Unverifiable / none. Quote empty.

After, Confirmed / none:

...n Action. As a result of this transaction, we increased our ownership position in Action to
62.3%. The second financing transaction repriced €3.1 billion of Action’s existing term loan debt, extending the
maturity of a portion of the debt and generating an annual interest cost saving of €14 million.

Comment unchanged.

### clean-review.json S8 (quote)

Before, Confirmed / none. Quote was the term-loan opening ending `Su`.

After, Confirmed / none: the capital-restructuring window (same text as S6 after). Comment unchanged. Editorial note unchanged on the payload.

### clean-review.json S9 (quote, verdict, colour, copy)

Before, Conflict / high. Quote was the term-loan opening ending `Su`.

Comment before:

The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. However, the source indicates that £755 million of proceeds were redeployed for this purpose, confirming the acquisition of the 2.2% stake and the resulting 62.3% total stake. The conflict arises because the source does not mention an earlier 2.2% stake purchase from GIC, which is part of the statement. The reviewer should verify the details of the GIC transaction or adjust the statement to align with the source.

After, Confirmed / none:

...ly, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action. As a result of this transaction, we increased our ownership position in Action to
62.3%.

Comment after:

The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million of proceeds were redeployed for this purpose, confirming the acquisition of the 2.2% stake and the resulting 62.3% total stake.

(B351 omission-conflict drop plus contrastive strip. The new quote contains the 2.2% and 62.3% the comment confirms. R5 holds.)

### clean-review.json S11 (quote)

Before, Confirmed / none. Leading 9% GIR paragraph.

After, Confirmed / none:

the infrastructure asset portfolio within 3iN outperformed its expected returns for the six-month
period.

Comment unchanged. This is the B351 T7 passage; the window now shows that sentence instead of the opening of a longer span.

### clean-review.json S12 (quote)

Before, Confirmed / none. Quote ended mid-word `3i`.

After, Confirmed / none. Window includes `3iN’s underlying portfolio continues to perform well, with a significant valuation uplift in TCR.` Comment unchanged.

### doc-review.json S5, S6, S7, S9, S11, S12

Same quote windows as the clean cards of the same index. DOC S5 stays Conflict / high (doctored net sales). DOC S9 stays Conflict / high (AGIC). DOC S9 quote is now the 2.2% / 62.3% window, not the term-loan opening. Comment still names the AGIC conflict; the quote now contains the 2.2% and 62.3% the comment says are confirmed. R5 holds.

### doc-review.json S8 (verdict, colour, copy). Part 2.

Before, Partially confirmed / moderate.

Quote (unchanged):

Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action.

Comment before:

The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i. However, it does not specify that these proceeds were 'significant' for 3i, which is an evaluative claim not covered by the source. The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization.

After, Conflict / high, `displayVerdictReason` `actor_mismatch`.

Comment after:

The statement attributes this to MAIT; the source credits Action. The source confirms that a pro-rata redemption of shares was completed, returning £944 million of gross proceeds to 3i. However, it does not specify that these proceeds were 'significant' for 3i, which is an evaluative claim not covered by the source. The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization.

Editorial payload unchanged. Card display of that note (Part 3) is:

The phrase 'generated significant proceeds' uses hyperbolic language without substantiation in the immediate context.

### Frontend display only (both payloads, every editorial concern)

Trailing command sentences (`Delete` / `Remove` / `Replace` / `Rephrase` / `Rewrite` / `Keep` / `Cut` / `The phrase becomes`) are stripped from the bullet. `suggestedDirection` stays on the payload. `acknowledgeReasonFor` / `This concern stands. The wording is yours.` is not rendered on the review card. `actionListDisplay.acknowledgeReasonFor` is unchanged for the proposal engine.

---

## Part four answers

a. Both Stage 2 calls ran. Both stored `classification: confirmed` and a `systemFingerprint`. Neither is "never called". S7 returned a passage the widened matcher stored as a 654-character span at `[1624, 2278]`; recover clips the pointer at 400 characters (`MAX_POINTER_CHARS` in `lib/qc/excerpt-from-source.mjs`), so the recovered slice is `[1624, 2024]` and ends before `€3.1 billion` (source offset 2119). The recorded card then stored `primaryExcerpt: null` and stamped Unverifiable / `excerpt_not_locatable` (a later assembly check discarded the empty pointer while the span sat unused on that payload). S10 returned confirmed with an empty span (`start`/`end` null, `passage` empty): locate discarded the passage after the call.

b. Today: `[stage2] passage rejected for source <label> after normalisation: "..."` on a locate miss; `[stage2] empty confirmation refused source=<label>` when confirmed meets an empty passage; `[CHECK_NOT_REVIEWED] { kind: 'evidence', statementIndex, reason: 'excerpt_not_locatable' }` at assembly; Stage 4 logs `primaryExcerpt=null`. That set does not tell an operator which of the three it was: never-called has no Stage 2 line and no fingerprint, but the assembly line is the same `excerpt_not_locatable` as a later discard. One line that would: `[stage2] empty-quote statementIndex=<n> called=true classification=confirmed passageRejected=<bool> spanEmpty=<bool> pointerChars=<n> spanChars=<n> reason=<locate_reject|pointer_clip|never_called>`.

c. Both name two separate source facts in one sentence, and both recorded `primaryExcerpt: null` with `supportState: supported` and a confirming comment. The other thirteen have a locatable primary quote. S7 is a compound candidate (`", while "`, two money anchors) whose second fact sits past the 400-character pointer. S10 is not a compound candidate (no `", and "`), and `extractVerifiableAnchors` yields `3` and `2` rather than `3.2x` and `2.8x` (`GENERIC_NUMBER_RE` cannot take a word-character `x`). The two S10 facts live in two source bullets that are not one substring.

d. "No source addresses the claim" is Stage 5 prompt language for `not_supported` (`lib/qc/pipeline-v3/stage5-generate-commentary.mjs`). These two recorded comments say "The source confirms". The badge the user saw is Unverifiable, not No support. The pipeline does distinguish: `not_supported` (the source does not support this), `unverifiable` / `excerpt_not_locatable` (we looked and could not show a quote), `not reviewed` with empty-confirmation refuse (we did not manage to keep a confirmation). The UI does not currently say "we did not manage to look" in those words.

e. S10: the matcher quoted two non-contiguous bullets as one passage; locate requires one substring (or accepted abridged segments) and rejected, so the span is empty. S7: the relevant `€3.1 billion` sentence sits outside the 400-character leading pointer, so the recorded primary quote is empty even though a 654-character span is stored. Cheapest test, no model: `gateExcerpt` each S10 bullet alone versus their concatenation against `source-3i-hy25-extracted.txt`; on S7, log `pointerChars`, `span.start/end`, and `source.indexOf("€3.1 billion")`. If concatenation locate fails and each bullet locates, the S10 hypothesis holds. If S7's span contains offset 2119 and the 400-clip does not, the S7 hypothesis holds.

---

## Tests whose expectation moved

`tests/actor-of-the-action.test.mjs` FIRES: `displayVerdict` `supported_partial` / moderate became `conflict` / high. Reason `actor_mismatch` and stand-downs unchanged.

`tests/card-honesty-invariant.test.mjs` T1: no longer requires the October opening sentence; requires `capital restructuring` on S6 and `€3.1 billion` on S7 (the relevant part of the same span). T9 timeout 5000ms to 20000ms because fifteen statement-aware trims exceeded 5s.

Frontend `tests/f9-concern-display-dedup.test.mjs`: a trailing `Replace` command is no longer shown; a note that is itself a command is kept (entire-note fallback). `tests/b214-no-proposal-card-copy.test.mjs`: `StatementReviewCard` does not render `acknowledgeReasonFor`. Helper still returns the shipped string.

---

## Design decisions

- 300-character budget kept. Relevance at trim, full-passage score at selection, `widestHeldPassage` at assembly.
- Needles: anchors plus figures plus tokens >=6 (hyphenated >=4).
- Rank: positive count, then later end (so the capital-restructuring / 62.3% end beats a term-loan opening with equal positives), then score sum, then length.
- Suffix candidate of the positive cover so 2.2% and 62.3% can share a window when no two-sentence run fits both.
- Ellipsis on a non-leading cut.
- Actor always `conflict` / high when it fires. `hasConflict === true` still stands down. `supportState` unchanged.
- Command strip is display-only in `buildConcernText`: trailing sentences whose first word is a command verb, or that start `The phrase becomes`. Mid-sentence those words stay. If every sentence is a command, the original note is kept.
- Implement Changes explanation: stop calling `acknowledgeReasonFor` from `StatementReviewCard`. Payload and `actionListDisplay` unchanged.

---

## Anything in this brief not done

Part 4 is diagnosis only. No locate fix, no 400-pointer change, no `3.2x` anchor, no compound-prefilter change. Filed **B359**. S10 still has no quote after replay (empty confirmation refused, `not reviewed`). S7's after-quote names the reprice and not the incremental €1.6 billion first transaction; that second fact still sits outside one 300-character window. Not in the must-pass list.
