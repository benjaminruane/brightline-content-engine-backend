# B355. Read the objection off the concern, and stop splitting sentences at decimal points

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | f650dfb | SHIP VERIFIED  f650dfb  main  149 files  1683 tests |
| frontend | not touched | -- |

Ids used: B355 (this spec). B354 Part 1's whole-phrase rule is superseded for causal and evaluative families and retained for all other codes.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change. No Review. Deterministic only.

---

## Part 1. The objectionable term comes from the concern, not the quote

### What changed

`lib/qc/objectionable-term.mjs` names the term. Causal: longest-first connectives in the flagged stretch. Evaluative: `parseEvaluativeDeletionDirection(suggestedDirection).removed`. Other: B354 flagged texts unchanged.

Drop: causal or evaluative, any term contained in a matched passage, no two-word floor. Other: whole-phrase, two-word floor. Empty terms: no drop, never a fallback to the whole phrase. Comparison still lowercased and per-card. Slug unchanged. Log line now includes `family=`.

Does not touch: framing fidelity, pairing, Stage 2, Stage 5.

### Four required outcomes

| Case | Family | Term | Result |
|------|--------|------|--------|
| S12 | causal | `driven primarily by` | DROPS. This survived on B354. |
| S3 | evaluative | `record year` | DROPS |
| S8 | evaluative | `significant` | SURVIVES. Not in that card's passages. |
| ROT | causal | (empty) | SURVIVES. No recognised connective. |

Sibling: S8's `significant` DROPS when the matched passage is `a significant valuation uplift in TCR`. The reason is the passage test, not a word-count floor.

### Concerns on both fixtures

Clean `clean-review.json`:

| # | Code | Family | Term | Drops | vs B354 |
|---|------|--------|------|-------|---------|
| S3 | marketing_language_excess | evaluative | record year | yes | same |
| S8 | marketing_language_excess | evaluative | significant | no | same |
| S12 | overreach_unsupported_causal | causal | driven primarily by | yes | **changed**. B354 kept it because the quoted clause was not a substring. |

Other statements: no editorial concerns.

Doctored `doc-review.json`:

| # | Code | Family | Term | Drops | vs B354 |
|---|------|--------|------|-------|---------|
| S2 | overreach_unsupported_causal | causal | driven largely by | no | same. Connective is not in the matched passage (`Action continued to trade strongly...`). |
| S3 | marketing_language_excess | evaluative | record year | yes | same |
| S8 | marketing_language_excess | evaluative | significant | no | same |
| S12 | overreach_unsupported_causal | causal | driven primarily by | yes | **changed**. Same reason as clean S12. |

---

## Part 2. A decimal point is not the end of a sentence

`splitSentences` in `lib/qc/card-honesty.mjs` is shared by `dropOmissionConflictSentences` and `stripContrastiveOnConfirmingSentences`. A run of `.` `!` `?` ends a sentence unless it is a single `.` with a digit immediately before and a digit immediately after.

### Statement 9 comments

Clean, before (recorded):

The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. However, the source indicates that £755 million of proceeds were redeployed for this purpose, confirming the acquisition of the 2.2% stake and the resulting 62.3% total stake. The conflict arises because the source does not mention an earlier 2.2% stake purchase from GIC, which is part of the statement. The reviewer should verify the details of the GIC transaction or adjust the statement to align with the source.

Clean, after omission drop:

The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. However, the source indicates that £755 million of proceeds were redeployed for this purpose, confirming the acquisition of the 2.2% stake and the resulting 62.3% total stake.

B351's old split dropped the half-sentence that carried "does not mention" and left the fragment "2% stake purchase from GIC...". That fragment is gone. The result ends with `62.3% total stake.`

Doctored, before (recorded):

The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. However, the source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC, which is part of the statement. The reviewer should reconcile this discrepancy or remove the claim about the earlier purchase from AGIC.

Doctored, after omission drop: unchanged. AGIC is not in the stored spans, so the omission invariant correctly does not fire (B351 T4). The splitter still does not cut `2.2%` if those functions run.

Does not touch: verdict aggregation, editorial drop, actor check.

---

## Tests whose expectation moved

`tests/editorial-source-awareness.test.mjs` T2: S12 replay now drops. T4 after-sum editorial.concerns is 1 (S8 only), not 2. C1 concern moves are S3 and S12 again. Correct under the new term rule.

`tests/editorial-drop-objectionable-term.test.mjs`: the four B354 cases now use causal/evaluative families. The 14% case is kept as written (evaluative, no parseable Delete, empty terms, survives). The one-word survive case now passes `suggestedDirection` so the term is `significant` and the reason is the passage, not the floor.

`tests/card-honesty-invariant.test.mjs` unchanged and passing.

---

## Not implemented as written, and why

The spec's "contains no fragment beginning 2% stake" was asserted as no *sentence* beginning `2% stake`. A raw `includes("2% stake")` is true of the honest string `2.2% stake`. The sentence-start check is the actual defect.

---

## What correct writing it could now change

A writer who used the source's `driven primarily by` no longer sees a craft flag on that connective. A writer who used `significant` still sees the flag when that word is not on the card. A GIC omission sentence that also carries `2.2%` is removed whole, not left as a `2% stake` fragment.
