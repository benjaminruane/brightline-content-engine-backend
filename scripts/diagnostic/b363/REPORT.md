# B363. When the quote names a different party in the same role, say so

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | filled after verify:ship | |
| frontend | not touched | |

Ids used: B363 (this spec). Reopens B362 part two. Succeeds B362.

Cost: USD 0. No model calls.

Browser: skipped. Copy-only. No layout, control, or card-face chrome change. Comments checked by replaying `tests/fixtures/real-runs-2026-09-29/`.

---

## Design decisions

1. **New module, not the actor file.** `lib/qc/role-party.mjs`. The actor check is leading-actor in the first six words against a confirming passage. This check is a closed list of role prepositions against displayed quotes. Sharing a file would mix stand-down conditions. `lib/qc/actor-of-the-action.mjs` is untouched.
2. **Closed prepositions.** `from`, `to`, `by`, `with`. Occurrence count, not unique names: two `from <name>` in the quote stands down even if both names are the same word.
3. **Name at the preposition.** Title-Case run, all-caps of two or more characters, or a digit-initial token (`3i`), matching the actor work. Closed singletons are not names. `AUTHOR-NAME-BLIND` is declared because 3i is a legitimate counterparty after `from`/`to`/`by`/`with`.
4. **Fire only 1:1 unequal, and only one preposition.** Exact comparison after lowercasing and stripping a trailing possessive. If two prepositions would each fire, stand down (R2). Jaccard is not imported.
5. **Displayed quotes are both slots.** Primary plus a distinct second (the GIC passage is `conflictExcerpt` on S9). The October quote has `to 3i` and no `from <name>`, so `to` is 0-vs-1 and stands down. `from AGIC` versus `from GIC` is the fire.
6. **Verdict does not move when the card is already not green.** Doctored S9 is already `conflict` from the AGIC silence finding. Prepend the sentence; keep `displayVerdict` and `displayVerdictReason`. A green card would display as `conflict` / high / `role_party_mismatch`. No fixture card took that path.
7. **R3: not shown on a non-green card.** Confirming prose on a red card competed with the finding (doctored S12 ended on `driven primarily by matches the source.`). Dropping is quieter than moving the clause in front of the finding. Drop runs after scale and role demotions, because inventory append still runs while doctored S12 is green. B356 helper placement is unchanged; live assembly strips the clause when the face is not `supported_full`.
8. **Phrase wording.** `isFigureOrDateItem` keeps `13% matches the source.` for figures and dates. Anything else is `The phrase 'driven primarily by' matches the source.`

---

## New files created

- `lib/qc/role-party.mjs`
- `tests/b363-role-party.test.mjs`
- `scripts/diagnostic/b363/REPORT.md`
- `scripts/diagnostic/b363/dump-cards.mjs`
- `scripts/diagnostic/b363/card-display.json`

---

## Part one. The quote names a different party

### Doctored statement 9, before and after, in full

Statement: `A portion of these proceeds was redeployed to acquire a further 2.2% stake in the business, which together with an earlier 2.2% stake purchase from AGIC, raised 3i’s stake in Action to 62.3%.`

Primary quote (unchanged):

```
In October 2025, Action successfully completed two financing transactions. The first raised €1.6 billion of total
incremental term loan debt. Subsequently, Action completed a capital restructuring with a pro-rata redemption of
shares, returning £944 million of gross proceeds to 3i, £755 million of which were redeployed to acquire a
further 2.2% stake in Action. As a result of this transaction, we increased our ownership position in Action to
62.3%.
```

Second quote (unchanged), the GIC passage:

```
In September 2025, 3i acquired 2.2% of Action equity from GIC in exchange for newly issued 3i Group plc
shares , with an equivalent consideration value of £739 million. As a result of this transaction, at 30 September 2025,
our equity ownership in Action was 60.1%.
```

Verdict before and after: `conflict`. `displayVerdictReason` null both sides (already non-green; not overwritten).

Comment before (B362 replay):

```
The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC, which is part of the statement. The reviewer should reconcile this discrepancy or remove the claim about the earlier purchase from AGIC.
```

Comment after (B363):

```
The statement attributes this to AGIC; the source credits GIC. The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million was redeployed for this acquisition, confirming the increase in stake to 62.3%. The conflict arises because the source does not mention an earlier 2.2% stake purchase from AGIC, which is part of the statement. The reviewer should reconcile this discrepancy or remove the claim about the earlier purchase from AGIC.
```

### Clean statement 9, before and after, in full

Statement: `...an earlier 2.2% stake purchase from GIC...`. Quotes identical to doctored S9. Verdict `supported_full` both sides. Comment unchanged:

```
The statement claims that a portion of the proceeds was used to acquire a further 2.2% stake in Action, raising 3i's stake to 62.3%. The source indicates that £755 million of proceeds were redeployed for this purpose, confirming the acquisition of the 2.2% stake and the resulting 62.3% total stake.
```

Nothing fires: one `from GIC` each side, the same word.

### Other must-pass

| Case | Outcome |
|------|---------|
| Same name after the same preposition (`from 3i` / `from 3i`) | Stand down |
| Two `from <name>` in the quote | Stand down |
| Two prepositions that would each fire | Stand down (R2) |
| Actor check | File untouched. Clean S8 both Action; Elsewhere no actor; first person; two opening names; conflict card; name not in vocabulary. All still stand down. |
| B362 doctored S9 AGIC silence | Still present after the role sentence |
| B362 doctored S12 scale | Still `conflict` / `scale_set_one_holding`. Finding still names TCR |

---

## Part two. Two lines of copy

R3 decision: on a card that is not green, the match-the-source clause is not shown. Justification: a clause that says a claim checks out competed with the finding when it closed a red card.

Phrase wording: `The phrase 'driven primarily by' matches the source.` Figure and date form unchanged. B356 placement tests still pass against the helper; live assembly then drops the clause on non-green cards.

---

## Cards whose comment or verdict changes versus B362

No verdict moved.

| Card | What moved |
|------|------------|
| CLEAN S0 | Dropped `13% matches the source.` (conflict face). Reviewer instruction remains. |
| CLEAN S12 | `driven primarily by matches the source.` became `The phrase 'driven primarily by' matches the source.` Verdict still `supported_full`. |
| DOC S0 | Dropped `13% matches the source.` (conflict face). |
| DOC S5 | Dropped `6.3% matches the source.` (conflict face). |
| DOC S9 | Prepended `The statement attributes this to AGIC; the source credits GIC.` Verdict still conflict. |
| DOC S12 | Dropped `driven primarily by matches the source.` Scale finding remains: `The source names a valuation uplift in TCR, not gains across essentially all of its investments.` |

### CLEAN S0 comment, after

```
The statement claims that 3i Group delivered a total return of GBP 3.3 billion for the six months to 30 June 2025, while the source indicates that this figure pertains to the six months ending 30 September 2025. This discrepancy in the reporting period creates a conflict. The reviewer should reconcile the timeframes or remove the claim.
```

### CLEAN S12 comment, after

```
The source confirms the statement by reporting that the performance was primarily driven by a 14% increase in 3i Infrastructure plc's share price. It also mentions a significant valuation uplift in TCR, supporting the claim of meaningful gains on its investment in TCR. The phrase 'driven primarily by' matches the source.
```

### DOC S0 comment, after

```
The statement claims a total return of GBP 3.3 million for the six months to 30 June 2025, while the source reports a total return of GBP 3,291 million for the first half of FY2026. The periods and figures do not match, leading to a conflict. The reviewer should reconcile these discrepancies or remove the claim.
```

### DOC S5 comment, after

```
The statement claims net sales of EUR 11.2 billion for the first half of 2026, while the source reports EUR 11.229 billion for the nine reporting periods ending on 28 September 2025. The periods do not match, leading to a conflict in the reported figures. The reviewer should reconcile these discrepancies or remove the claim.
```

### DOC S12 comment, after

```
The source names a valuation uplift in TCR, not gains across essentially all of its investments.
```

---

## Tests whose expectation moved, and why

- `tests/actor-of-the-action.test.mjs` "both fire": a conflict card no longer carries `2.2% matches the source.` (R3). Actor sentence still leads. Reviewer instruction still last.

New: `tests/b363-role-party.test.mjs`.

B356 `tests/commentary-clause-placement.test.mjs` unchanged. Helper still inserts the figure form before a trailing reviewer instruction.

---

## Not done

No green-card role-party fire in the fixture payloads. `role_party_mismatch` as a display reason is unit-tested on `applyRolePartyCheck`, not replayed on a live payload card.

Cause checking for S2 (`driven largely by Action` versus `trades strongly`) is still Stage 5. Not this spec.

Frontend: none. Comment strings only.

The Jaccard name matcher is unused here on purpose.
