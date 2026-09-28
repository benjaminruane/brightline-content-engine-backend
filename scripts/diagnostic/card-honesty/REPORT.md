# B348. The card stops contradicting itself, and shows the words that disagree

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | a22e894 | SHIP VERIFIED  a22e894  main  139 files  1630 tests |
| frontend | not touched | -- |

Ids used: B348.

Cost: USD 0. No model calls.

Browser: skipped. No frontend change. No user-facing copy. Layout and controls unchanged.

---

## A4

Walked 870 JSON files under `tests/fixtures` and `scripts/diagnostic`. Unique qcCards with `displayVerdict === "supported_full"`: **3099**. Cards that also carry at least one `framingFidelityConcerns` entry: **0** (0.00%).

List of statements: none.

Small minority: well under 10% of currently confirmed cards. Zero is the floor. A rule that repainted most confirmed cards would be tens of percent, and that decision is Ben's. B4 ships.

---

## Part 0A

### A1 TRUE

Rule id `narrative_coherence` in `lib/rulebook/editorialRules.js`:

```
id: "narrative_coherence",
...
"Adjacent sentences connect logically. Topic jumps without transitions, sentences that repeat the same point without advancing the argument, or sentences that contradict the flow established by neighbouring sentences are flagged. Evaluate against the previous and next statement where available."
```

Prompt section: the evaluation-scope exception (E8), formerly `EDITORIAL_EVALUATION_SCOPE`, now `EDITORIAL_EVALUATION_SCOPE_WITH_COHERENCE`:

```
The single exception is narrative_coherence (E8), which evaluates how the CURRENT STATEMENT flows with the surrounding context.
```

Plus `formatRulesForPrompt` scope `CURRENT + CONTEXT` when that id is listed.

It can be disabled without touching any other editorial rule: drop that id from the listed rules. `filterRulesForRun` is by `appliesTo` / `appliesToVersion`. The B348 gate is `gateNarrativeCoherenceRules`, which filters only `r.id !== "narrative_coherence"`.

### A2 TRUE

`buildEditorialUserPayload` still voids source text:

```
// B178 removed sourceExcerpt / evidenceBlock from the prompt deliberately.
void evidenceBlock;
void sourceExcerpt;
```

The user payload is CONTEXT BEFORE, CURRENT STATEMENT, CONTEXT AFTER, and FULL DRAFT. Coherence is judged against the draft extract and neighbours, not against sources.

### A3 TRUE of the pre-B348 writer

A production card did carry `framingFidelityConcerns` while `displayVerdict` was `supported_full` and `concernLevel` was `none` (S0, four runs). Those three were decided independently:

1. `displayVerdict` — `mapVerdictToSupportState` then `mapSupportStateToDisplayVerdict`, then `applyExcerptHonestyToDisplay` (can move `supported_full` to `unverifiable` only).
2. `concernLevel` — `mapSupportStateToEvidenceConcernLevel` from Stage 3 `supportState` (`supported` → `none`).
3. `framingFidelityConcerns` — `buildFramingFidelityConcerns`, which runs on `confirmed` / `partially_confirmed` and does not write `displayVerdict` or `concernLevel`.

B348 then couples (1) and (2) to (3) in the same assembler when `honestDisplayVerdict === "supported_full"` and framing fired.

### A4

0 of 3099 confirmed cards (0.00%). List empty. See above. Gate passed.

### A5 TRUE

On a conflict card, `conflictExcerpt` was filled as follows (`lib/qc/pipeline-v4/stage4-select-excerpts.mjs` before the B348 fill):

```
if (preferred) {
  primaryExcerpt = preferred.excerpt;
  conflictExcerpt = preferred.from === "span" ? preferred.excerpt : null;
} else if (!firstMatchWithClassification(matches, "conflicting")) {
  const fromSpan = firstConflictingSpanExcerpt(...);
  if (fromSpan) {
    conflictExcerpt = fromSpan;
    if (!primaryExcerpt) primaryExcerpt = fromSpan;
  }
}
...
if (figured !== primaryExcerpt) {
  primaryExcerpt = figured;
  conflictExcerpt = figured;
}
```

Left null when the preferred conflicting pick `from === "match"`, even if another conflicting span existed. That is the S1 case: primary is the 9.0% sentence; the second span is unused; `conflictExcerpt` was null in two of three runs. When filled from a span or a figured excerpt, it was often identical to `primaryExcerpt`.

After B348: if `conflictExcerpt` is null or the same text as `primaryExcerpt`, fill from a different stored conflicting passage; if still identical, store null.

---

## Part 0B

| Id | Answer | Notes |
|----|--------|-------|
| B1 | AGREE | Removed `narrative_coherence` from the listed rules / prompt unless `QC_NARRATIVE_COHERENCE` is on (default off). Also drop leaked concerns after the model and at `assembleCard` (deterministic drop precedent, same family as `STYLE_RULE_DETERMINISTIC_FILTERS`). Chose prompt removal first; drop is the backstop so no concern reaches a card. |
| B2 | AGREE | No turned-off line. `editorialNotReviewedReason` unchanged. Editorial still ran. |
| B3 | AGREE | `structural_integrity` and `framing_fidelity` untouched as rules. |
| B4 | AGREE | Gate passed (A4 = 0%). `supported_full` + framing → `supported_partial`, moderate, slug `framing_fidelity`. Framing note unchanged. `supportState` stays `supported`. |
| B5 | AGREE | 0/3099 is a small minority. Ship B4. |
| B6 | AGREE | Payload-side `conflictExcerpt` only. No frontend. No card-contract change. |
| B7 | AGREE | No splitter, no Stage 1b, no claim decomposition, no verdict change other than B4, no new copy. |

---

## T1 before and after

Statement: `For the six months ending 30 June 2024, Action generated record net sales and operating EBITDA.`

Matched passage (both before and after): `For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year.`

| | displayVerdict | concernLevel | reason slug | framing note | primaryExcerpt | conflictExcerpt |
|--|----------------|--------------|-------------|--------------|----------------|-----------------|
| Before | `supported_full` | `none` | none | `The statement uses "record" but the matched source does not.` | the matched passage above | n/a |
| After | `supported_partial` | `moderate` | `framing_fidelity` | unchanged | unchanged | n/a |

---

## T4 before and after

Statement: `Like-for-like sales growth reached 12% for the period, driven by overall high transaction volume and robust performance in luxury goods, which offset a decline in average selling prices.`

| | displayVerdict | primaryExcerpt | conflictExcerpt |
|--|----------------|----------------|-----------------|
| Before | `conflict` | `Like-for-like sales growth reached 9.0 percent.` | `null` |
| After | `conflict` | `Like-for-like sales growth reached 9.0 percent.` (unchanged) | `Like-for-like sales growth of 9.0% was driven by high transaction volume and outperformance in everyday necessities, which more than offset a decline in average selling prices.` |

The production offset [2800-2974] was not stored in this repo. The distinctive quoted phrase `outperformance in everyday necessities` is in `conflictExcerpt`. Primary is unchanged.

---

## T8 / T9

T8: six errors still raise. S0 framing still fires (`supportState` stays `supported`; display is now partial, which is B4). S1 12% vs 9.0%, S2 price increases vs reductions, S3 USD 1.5bn vs EUR 2.1bn total, S4 April / 56.7%, S5 330 / end-2025 all stay `conflicting`. Derived corrections still appear: `Replace '12%' with '9.0%'.` and `Replace '56.7%' with '57.6%'.`

T9: six honest sentences, zero demotions, zero framing, all `supported_full`. No new finding.

---

## What correct writing B4 could now turn amber

A sentence whose facts the source confirms, but whose matched passage does not contain the superlative the draft used (`record`, `highest`, `lowest`, `best`, `strongest`, `unprecedented`, `first ever`, `all-time`, `never before`).

## Would I ship B4 given A4

Yes. A4 is 0 of 3099. This does not repaint confirmed cards in the corpus. It only changes display when framing already fired.

---

## B1 choice

Removed the rule from the prompt (`gateNarrativeCoherenceRules` on the listed editorial rules, so tokens are not spent on it). Deterministic drop after the model and at the card writer so a leaked `narrative_coherence` concern cannot reach the card. Flag `QC_NARRATIVE_COHERENCE`, default off.
