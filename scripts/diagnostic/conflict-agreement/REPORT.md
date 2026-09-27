# B336. A figure the source repeats verbatim cannot be reported as a conflict

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | 11ee94f | SHIP VERIFIED  11ee94f  main  131 files  1578 tests |
| frontend | not touched | -- |

Ids used: B336.

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change. The visible effect is a withheld Implement Changes proposal, checked through `fillAction` on the A3 strings (T1), not a live Review. The card verdict is unchanged (B3).

---

## Part 0A

A1 TRUE. `kindNameCompatible` returns false when `draft.value === source.value`, so a source token equal in value to the draft token can never be a match through that helper.

Quoted from `lib/revise-actions/conflict-engagement.mjs` as read before the edit (then L547-555):

```
function kindNameCompatible(draft, source) {
  if (kindKey(draft) !== kindKey(source)) return false;
  if (draft.kind === "money" && Boolean(draft.currency) !== Boolean(source.currency)) return false;
  if (draft.value === source.value) return false;
  if (draft.component) return false;
  if (source.component) return false;
  if (!namesMatch(draft.names, source.names)) return false;
  return true;
}
```

A2 TRUE, with precision. `findCandidatePairs` filters asserted source tokens with `compatibleTokens`, not with `kindNameCompatible`. `compatibleTokens` does not call `kindNameCompatible`. It carries the same equal-value exclusion independently:

```
if (draft.value === source.value) return false;
```

Quoted from `compatibleTokens` in the same file (L505, still present after the edit). Equal-valued tokens are excluded by `compatibleTokens` itself. Nothing else in the pairing loop removes them.

A3 TRUE. On the live A3 strings, draft 119 is paired with source 330 because source 119 is removed from the candidate pool by the equal-value rule, and 330 is then the only remaining compatible candidate, so `matches.length !== 1` passes.

Printed pairs from `findCandidatePairs` on exactly those two strings (before the edit):

```
[
  { "from": "119", "fromStart": 38, "to": "330", "toStart": 106 }
]
```

Draft 119 MATCHES [330]. Draft 330 MATCHES [] (equal-value excludes 330 to 330).

Printed token list from that same run:

CITATION RANGES: []

SOURCE TOKENS (asserted = not in citation):

- 119 count start 13 end 16 inCitation false abbrevs [Stores]
- 2023 date start 53 end 57 inCitation false abbrevs [Stores]
- 90 count start 59 end 61 inCitation false abbrevs []
- 330 count start 106 end 109 inCitation false abbrevs [Stores]

DRAFT TOKENS:

- 119 count start 38 abbrevs [Stores]
- 330 count start 123 abbrevs [Stores]
- 2025 date start 149 abbrevs [Stores]

A4 TRUE. The proposal that replaces 119 with 330 is built from that pair by `buildReplaceProposal` / `applyReplacements`, not authored by a model. Before the edit, `applyConflictProposal` returned `status: "replace"`, `proposedChange: "Replace '119' with '330'."`. `fillAction` on contradicted evidence calls `applyConflictProposal` and uses a throwing model in the pinned tests, so the model is not consulted.

A5 FALSE. `citationRanges` does not exclude "(YTD P6 2023: 90)". The printed token list from A3 has `CITATION RANGES: []` and 90 is asserted (`inCitation: false`). Patterns at L243-252 are not/compared with/versus/rather than/instead of/as stated/in our initial/in our recommendation/in the memo. There is no parenthesis pattern.

A6 TRUE. `findQualifierClash` uses `kindNameCompatible` directly (`kindNameCompatible(draft, token)`) and therefore carries the same equal-value exclusion.

---

## Part 0B

B1 AMEND. AGREEMENT pass added in the same module, before pairing. AGREED = at least one asserted source token with the same kind, the same name set, and an equal value, via `kindNameSame` (the existing `kindKey` / currency / component / `namesMatch` checks). `compatibleTokens` is not reused, because it excludes equal values.

Amendment from A5: `citationRanges` does not exclude parentheticals. AGREEMENT treats tokens whose span sits inside parentheses as not asserted, using `parentheticalRanges` plus the existing `tokenInCitation` overlap helper. `citationRanges` itself is unchanged (P34: `source-governance.mjs` `assertedTokens` and pairing keep their previous citation set).

B2 AGREE. An AGREED draft token is skipped as the `from` side in both `findCandidatePairs` and `findQualifierClash`. Non-agreed draft tokens pair as they did.

B3 AGREE. If removing AGREED tokens leaves no pairs, the excerpt emits no conflict proposal. Verdict is not forced. `fillAction` takes the existing unaddressed path (`ACKNOWLEDGE`, `sort.reasonCode` `conflict_unaddressed`).

B4 AGREE. Slug `conflict_suppressed_figure_agrees` on `explain.code`, values `{ draftRaw, sourceRaw }`. Same shape as `self_disagreement` / `qualifier_clash`. `explanationFromOutcome` keeps `explainCode` when there is no decision-copy template, so the slug reaches the public finding. No new user-facing sentence.

B5 AGREE. If a built replace would drop an AGREED draft raw from the resulting sentence, the whole proposal is withheld via `unaddressed(...)` with the same slug. Mixed sentences where the agreed raw remains still propose the remaining pairs.

B6 AGREE. `decision-copy.mjs` is untouched.

B7 AGREE. No claim decomposition, unsupported-modifier, superlative, or editorial change.

---

## Part 1. Tests

File: `tests/conflict-agreement-guard.test.mjs`. All four tests call `fillAction` with a throwing model (the real contradicted-evidence path). Pair assertions use `findCandidatePairs` on the statement and excerpt strings, not pre-built tokens.

T1. A3 strings. After: no pair with `from=119`, no `Replace '119' with '330'.`, slug present, values draftRaw 119 / sourceRaw 119.

T2. Genuine conflict. Spec excerpt used "LFL sales growth was 9.0%". `namesMatch` does not treat LFL as like-for-like (`ABBREV_WORDS` has no LFL). Pairing logic was not changed. The test uses "Like-for-like sales growth was 9.0%" so the name set already matches. Pair 12% -> 9.0% and the replace proposal fire.

T3. Draft 90 against the A3 excerpt is not AGREED. Source 90 sits inside "(YTD P6 2023: 90)". Slug is not `conflict_suppressed_figure_agrees`.

T4. Mixed sentence: 12% -> 9.0% still proposes. 119 is not a `from` pair and remains in the resulting sentence.

T1 before:

```
pairs: [{ from: "119", fromStart: 38, to: "330", toStart: 106 }]
status: replace
proposedChange: Replace '119' with '330'.
resultingSentence: On the commercial front, Action added 330 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.
```

T1 after:

```
pairs: []
status: unaddressed
proposedChange: null
explain.code: conflict_suppressed_figure_agrees
explain.values: { draftRaw: "119", sourceRaw: "119" }
```

Existing tests that asserted the old behaviour: two. `tests/revise-actions-quantity-match.test.mjs` F15-S11 and F19-S2 asserted `explainCode` undefined on an unaddressed conflict whose source repeats a draft figure (18 stores; 3.56x / 31.4%). They did not assert the 119 -> 330 proposal. Updated to expect `conflict_suppressed_figure_agrees`. Zero existing tests asserted the 119 -> 330 defect.

---

## P34 callers

`compatibleTokens`: unchanged. `source-governance.mjs` `firstCompatibleToken` inherits nothing from this spec.

`citationRanges`: unchanged. Pairing and governance asserted sets are the same as before.

`findCandidatePairs`: `applyConflictProposal` and the conflict-engagement / quantity-match tests. AGREED drafts are skipped. F18 pins still pass.

`kindNameCompatible`: still equal-value exclusive, now via `kindNameSame`. `findQualifierClash` skips AGREED drafts.

---

## What was not built

Unsupported geography, the target date, and the superlative on the same card are untouched. No verdict force. No decision-copy wording. No Stage 1 / Stage 2 change.
