# B338. The product corrects what it can derive and never composes prose

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending push | not yet run |
| frontend | not touched | -- |

Ids used: B338.

Cost: USD 0. No model calls.

Browser: skipped. No layout or control change. The visible effect is which Implement Changes rows carry a proposal. That is checked through `fillAction` / `runActionList` (T1-T7), not a live Review. Verdicts are unchanged (B7).

---

## Part 0A

A1 TRUE, with the overwrite named. `sortFinding` sets `policyPermit`. `action()` sets it true. `acknowledge()` sets it false.

Quoted `lib/revise-actions/sort.mjs`:

```
function action(finding, silenceOnCard, reasonCode = "permitted") {
  return sortedRecord(finding, {
    disposition: "ACTION",
    policyPermit: true,
```

```
function acknowledge(finding, silenceOnCard, reasonCode) {
  return sortedRecord(finding, {
    disposition: "ACKNOWLEDGE",
    policyPermit: false,
```

Evidence that is not silent becomes ACTION:

```
if (kind === "evidence") {
  if (silenceOnCard) { ... }
  return action(finding, silenceOnCard);
}
```

S1 (12% vs 9.0%) and S4 (56.7% vs 57.6%) were not silent. They started ACTION with `policyPermit` true. `fillAction` then ran `applyConflictProposal`, got no replace (see A3), and called `asVisibleAcknowledge`, which overwrites `policyPermit` to false.

Quoted `lib/revise-actions/run.mjs`:

```
sort: {
  ...entry.sort,
  policyPermit: false,
  reasonCode: code,
},
```

The user-facing sentence was `NO_PROPOSAL.conflict_unaddressed` / `GENERIC_CONTRADICTION`.

A2 It is a deliberate rule, not a flag. `REVISE_ACTION_LIST` was on in those runs: editorial proposals appeared. The evidence withhold is B168 Design A, shipped 2026-09-10.

Quoted Closed **B168**: "a contradicted evidence finding never calls the rewrite model. Exactly one same-kind quantity pair -> exact-quote token replace in code; otherwise ACKNOWLEDGE `conflict_unaddressed`."

Live path: `isContradictedEvidenceFinding` then `applyConflictProposal`; unaddressed becomes `conflict_unaddressed`. The rewrite model is not consulted.

A3 At confirmation, `findCandidatePairs` produced no pair for either statement against the displayed excerpt used in T2/T3.

S1 printed pairs: `[]`. Cause: `namesMatch` Jaccard. Draft content `{like-for-like, sal, growth, reached, period}` vs source 9.0% content spanning the whole long excerpt. Intersection 3 / union 16 = 0.19, below 0.6. `LFL` was not in `ABBREV_WORDS`.

S4 printed pairs: `[]`. Cause: 57.6% had empty names (left window starts after 54.8%), so `namesMatch` refused; 54.8% Jaccard against 56.7% was also below 0.6.

Those empty prints are why Production offered `conflict_unaddressed` after the figures had already been matched in Review. Pairing was then extended (LFL abbrev, `stake` abbrev, from/to role) so T2/T3 can emit a derived replace. See Part 1 after.

A4 TRUE. Two origins.

Derived: `applyConflictProposal` -> `buildReplaceProposal` / `applyReplacements`.

Authored (until this spec): `fillAction` called `callModel` (`writing-rewrite`) and parsed `proposedChange` / `resultingSentence`. That call is gone. `publicEntry` will not ship a proposal unless `provenance` is `derived`.

A5 PARTLY. B134 is specified as a we/our/us swap for a supplied name (`lib/revise-actions/prompt.mjs` first-person block; `firstPersonSubstitutionMakesAuthorTheSubject` is a direction check, not a builder). The proposal text was still model-authored. It is not built from a matched source token, so under B1 it is authored. This spec drops that proposal and keeps the concern.

A6 PARTLY. A `findCandidatePairs` `to.raw` is sliced from the pairing excerpt, so that token is always a substring of that string. Gaps: (1) `companionDatePairs` / `assembleR3Write` can write `April 2025` when the excerpt only has `April`; `finishedSentenceIsLicensed` allows that date exception. (2) pairing excerpt and card-face excerpt can differ. B4c now requires the written source figure (not an assembled companion date) to appear in the displayed excerpt or a support span.

---

## Part 0B

B1 AGREE. Every public action-list entry carries `provenance` `derived` or `authored`.

B2 AGREE. `enforceDerivedProposal` in `publicEntry`: a proposal is kept only when provenance is `derived`. Authored entries are ACKNOWLEDGE and keep `thing2`.

B3 AGREE. Authored copy is `NO_PROPOSAL.visible_signal`, the same sentence framing and recency already use. No new sentence. `decision-copy.mjs` untouched.

B4 AGREE, with two operational notes.
a. Existing uniqueness in `findCandidatePairs`.
b. B336 AGREED skip unchanged and first.
c. `sourceFigureVisibleOnCard`: non-companion `to.raw` must appear in `displayedExcerpt` (card `primaryExcerpt` when present) or a support span. Companion / R3 dates are not this gate. That is why F18-S4 still writes `April 2025`.
d. Existing `detectSourceDisagreement` / rulings. No new governance.

B5 AGREE. `apply.mjs` unchanged.

B6 AGREE. T5.

B7 AGREE. Sort still marks editorial ACTION. Fill withholds the proposal. Concerns, verdicts, colour unchanged.

B8 AGREE.

---

## Part 1. Tests

File: `tests/correct-not-compose.test.mjs`. Throwing model on every path that used to call one.

T2/T3/T4 before (Part 0A prints):

| Case | pairs | proposal |
|------|-------|----------|
| S1 12% vs 9.0% | [] | none, conflict_unaddressed |
| S4 56.7% vs 57.6% | [] | none, conflict_unaddressed |
| T4 330 / end-2025 | [] | none, conflict_suppressed_figure_agrees |

T2/T3/T4 after:

| Case | pairs | proposal |
|------|-------|----------|
| S1 | 12% -> 9.0% | derived Replace '12%' with '9.0%'. Result carries 9.0%. |
| S4 | 56.7% -> 57.6% | derived Replace '56.7%' with '57.6%'. April 2024 stays. |
| T4 | [] | ACKNOWLEDGE, no proposal. B336 on 330. |

T3 date: April / July does not produce a proposal. Gate: `companionDatePairs`. The excerpt fragment of 57.6% has no date token (no April, no July). Not forced.

---

## 27 September statements, what each would now produce

| Statement | Now |
|-----------|-----|
| S1 Like-for-like sales growth reached 12% for the period | derived replace 12% -> 9.0% |
| S4 increasing its stake to 56.7% | derived replace 56.7% -> 57.6%. April 2024 untouched |
| Action added 119 new stores ... | ACKNOWLEDGE, `conflict_suppressed_figure_agrees`, no proposal |
| ...target of 330 new stores for by end-2025 | ACKNOWLEDGE, no proposal (B336 on 330; source names no year) |
| overreach_unsupported_causal | ACKNOWLEDGE, authored, concern kept in thing2, visible_signal copy |
| narrative_coherence / materiality | same as overreach |

---

Classification I would reverse: first-person (B134). The spec asked to confirm it is derived. It is a specified pronoun swap, but it is not built from a matched source token and was model-authored. This spec treats it as authored and does not propose it.

Existing tests that asserted an authored proposal: six in `tests/revise-actions-license.test.mjs`. Identity (`called === 1`), unnamed-pronoun editorial (`called === 1`), placeholder `PLACEHOLDER_LEAK`, two "still proposes" first-person house-name cases, and Brackenhill `currency_format` kept ACTION. Updated to ACKNOWLEDGE, model not called, no proposal. Not deleted. F18-S2 quantity-match pin now expects `conflict_suppressed_figure_agrees` because `stake` is a shared name and the source repeats 60%.

---

## P34

`compatibleTokens`: extra `rangeRole` check only when both tokens have from/to. `source-governance.mjs` `firstCompatibleToken` inherits it. `LFL` / `stake` abbrevs flow through `nameSets` / `annotateTokens` for every pairing caller. F18 pins re-run and pass, except F18-S2 which now records agreement (source repeats the stake figure).

`citationRanges`: unchanged.

`fillAction` no longer calls `buildFindingPrompt` / `writing-rewrite`. `prompt.mjs` remains for any leftover reader. Apply / Accept / Reject / Modify unchanged.

---

## What was not built

No claim decomposition. No Stage 1 or Stage 2 change. No editorial prompt change. No new user-facing sentence. No auto-apply. No date force on S4.
