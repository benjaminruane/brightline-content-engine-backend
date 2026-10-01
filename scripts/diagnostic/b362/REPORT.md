# B362. A silenced sentence must be the one objected to, and a red card must say why

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | ed6d076b466fe802f31a03cc9ecdf2ead8931ae9 | SHIP VERIFIED  ed6d076  main  156 files  1726 tests |
| frontend | not touched | |

Ids used: B362 (this spec). B158 reopened. B361 closed for the deterministic slice. Succeeds B360.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or card-face change. One-passage conflict cards already showed a single quote. Review output checked by replaying `tests/fixtures/real-runs-2026-09-29/`.

---

## Design decisions

1. **Subject of a silence claim.** `omissionTokensFromClause` is the subject: percentages, all-caps names, Title-Case names. The displayed strip fires only when every token of every omission clause is in a displayed quote. A figure that sits beside a missing name is not enough. B355 concern-code work is the precedent (read what is objected to).
2. **Last-finding backstop.** `guardLastFindingSentence` wraps every sentence-removing rule on the comment path. Today that is `stripOmissionOverclaimWhenDisplayed`. B351 `applyOmissionConflictInvariant` flips the card to green first, so the backstop does not apply there. Log line: `[stage7] comment-finding-backstop rule=omission-overclaim statementIndex=N`.
3. **Part two: build nothing.** See below.
4. **Empty conflict slot.** `fillSecondExcerpt` never copies primary. `finalizeConflictSlot` stamps `conflictExcerptEmptyReason: no_distinct_passage` on a conflict face with no distinct second passage. Confirmed or partial cards with one passage leave the reason null.
5. **Scale/cause lexicon.** Closed list from the B361 design plus `CAUSAL_CONNECTIVES`. Longer phrases win on overlap. Hits that overlap a number-plus-period-word span or a date span are excluded.
6. **Arithmetic.** Two money figures are comparable only when they come from two different displayed passages and each of those passages holds exactly one money figure. A prior-year pair in one quote is not a part/whole. Percents are not compared (14% versus 13% are different quantities).
7. **Universal-set plus one holding.** Hits: `essentially all`, `all of its`, `across ... investments`. `including` suppresses only a bare `across ... investments` example, not `essentially all`. Holdings are read from confirming spans (`uplift|gain|gains in NAME`), because the displayed trim can drop the TCR sentence. Display-only demotion, slug `scale_set_one_holding`, `supportState` unchanged.

---

## New files created

- `lib/qc/scale-cause.mjs`
- `tests/b362-silence-and-scale.test.mjs`
- `scripts/diagnostic/b362/REPORT.md`
- `scripts/diagnostic/b362/dump-cards.mjs`
- `scripts/diagnostic/b362/card-display.json`

---

## Part one. The silence strip removed the finding

### Doctored statement 9 comment, before and after, in full

Before (B360 replay; the AGIC sentence gone because the GIC quote holds `2.2%`):

```
The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%.
```

After (B362). Verdict still Conflicting. GIC passage still the second quote. The comment names AGIC:

```
The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC, which is part of the statement. The reviewer should reconcile this discrepancy or remove the claim about the earlier purchase from AGIC.
```

Clean statement 9: GIC silence still stripped (B351, GIC is in stored spans). Card still Confirmed.

A conflict card whose only explaining sentence would be removed keeps it. Unit test: displayed quote names GIC, comment is only "The source does not mention GIC.", `nonGreen: true`. Strip does not fire. Log contains `comment-finding-backstop`.

---

## Part two. Say what the card is already showing. Built nothing.

On doctored statement 9 the GIC quote and the AGIC finding sit side by side. Nothing joins them.

A safe deterministic join would need the seller role: the statement names AGIC as the earlier seller, the quote names GIC. There is no role parser. Exact-token inequality (names in the statement that are missing from the quote, versus names in the quote) still false-positives: the same quote names 3i and GIC, and 3i is also in the statement. The Jaccard name matcher is banned; an unmeasured similarity threshold has blocked three corrections, and a near-miss name rule is exactly where it would fail again (AGIC / GIC).

Part one already restores the finding. Sharpening it into "the quote says GIC where the draft says AGIC" is not safe. Built nothing.

---

## Part three. The empty conflict slot stays empty

B360 copied primary into `conflictExcerpt` on one-passage conflict cards. No new information reached the reader. The field implied a competing passage that did not exist.

Reverted. Face unchanged (one quote either way). B158 reopened: the second passage is shown when one exists; these cards do not have one.

Versus B360 replay, conflict quotes that were copies are now null with `conflictExcerptEmptyReason: no_distinct_passage`:

- CLEAN S0
- DOC S0
- DOC S5
- DOC S8
- DOC S12 (became a conflict face in part four, still one passage)

Two-distinct-passage cards (CLEAN/DOC S1, S9, S11) are unaffected.

---

## Part four. Claims of scale and cause

### Lexicon hit count

9 hits across the thirty fixture cards.

| Card | Hits |
|------|------|
| CLEAN S1 | accounted for, vast majority |
| CLEAN S2 | driven largely by |
| CLEAN S12 | driven primarily by |
| DOC S1 | accounted for, vast majority |
| DOC S2 | driven largely by |
| DOC S12 | driven primarily by, across its portfolio, including meaningful gains across essentially all of its investments |

S5 "nine reporting periods" is not a hit. A period is not a scale claim.

### Must-pass outcomes

| Case | Outcome |
|------|---------|
| Doctored S12 "meaningful gains across essentially all of its investments" against a source naming only TCR | Stops Confirmed. `displayVerdict` conflict, `displayVerdictReason` `scale_set_one_holding`. Finding: "The source names a valuation uplift in TCR, not gains across essentially all of its investments." |
| Clean S12 "including meaningful gains on its investment in TCR" | Verdict untouched (`supported_full`). `including` is an example. Comment gains the inventory clause "driven primarily by matches the source." because that connective is verbatim in the confirming passage. |
| S1 "accounted for the vast majority" | Untouched. Displayed quotes hold £3,234 million and a prior-year £2,071 million in one passage, and 13% in the other. Arithmetic does not treat the YoY pair as part/whole. £3,291 million is not on the card. |
| S5 "nine reporting periods" | Untouched. |
| S2 "This was driven largely by Action" | "driven largely by" is in the inventory. Whether the comment then addresses it is Stage 5's business. |

---

## Cards whose verdict, comment or quotes change versus B360

| Card | What moved |
|------|------------|
| CLEAN S0 | conflict slot empty, reason `no_distinct_passage` |
| CLEAN S12 | comment appends "driven primarily by matches the source." Verdict unchanged. |
| DOC S0 | conflict slot empty, reason `no_distinct_passage` |
| DOC S5 | conflict slot empty, reason `no_distinct_passage` |
| DOC S8 | conflict slot empty, reason `no_distinct_passage` |
| DOC S9 | comment restores the AGIC finding. Quotes unchanged (GIC still second). Verdict still conflict. |
| DOC S12 | verdict `supported_full` to `conflict`, reason `scale_set_one_holding`, comment rewritten to the TCR finding plus the inventory connective, empty conflict reason `no_distinct_passage` |

---

## Tests whose expectation moved, and why

- `tests/b360-two-passages.test.mjs` doctored S9: comment must still name AGIC (B360 expected silence gone because of `2.2%`).
- Same file, one-passage conflict: slot empty with reason, never a copy of primary.
- Same file, omission strip unit test: AGIC stays when only `2.2%` is displayed; GIC silence still drops when GIC is displayed and the card is green.
- `tests/second-conflict-quote.test.mjs` T5/T6: one-passage conflict leaves `conflictExcerpt` null (was a copy). Distinct second span still fills.
- `tests/conflict-excerpt-from-span.test.mjs` first test: span is primary, conflict slot null (was the same text).
- `tests/commentary-inventory.test.mjs` aggregation: inventory is no longer `[]`; it names `essentially all`. Still appends nothing against a TCR-only passage.

New: `tests/b362-silence-and-scale.test.mjs`.

---

## Not done

Part two: no AGIC/GIC join. Not safe without a role parser. Jaccard banned.

Cause checking for S2 ("driven largely by Action" versus "trades strongly") is not a deterministic rule. Left on Stage 5. No extra model call. Recorded on the closed B361 row.

Frontend: none. The card face already showed one quote on one-passage conflict cards.

`conflictExcerpt` is still an object, `primaryExcerpt` still a string.
