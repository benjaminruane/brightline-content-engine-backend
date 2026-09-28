# B342. A false detail inside a true sentence, and the passage barred from the card

## Scoreboard

| Repo | SHA | verify:ship |
|------|-----|-------------|
| backend | pending first push | pending |
| frontend | not touched | -- |

Ids used: B342 (this diagnostic), B343 (first-person standing ruling), B344 (flag-parse unification).

Cost: USD 0. No model calls.

Browser: skipped. No layout, control, or copy change. No Review.

---

## Part 0A

A1 PARTLY. `isCompoundCandidate` does require an additive boundary and does return false when any `RELATIONAL_CONNECTIVES` token matches. Not every additive boundary begins with a comma or semicolon: `" as well as "` does not.

Quoted `lib/qc/claim-spans.mjs`:

```
export const ADDITIVE_BOUNDARIES = [
  ", and ",
  ", with ",
  ", while ",
  ", including ",
  "; ",
  " as well as ",
];
```

```
export function isCompoundCandidate(sentenceText) {
  const t = asText(sentenceText);
  if (!t.trim()) return false;
  const anchors = extractVerifiableAnchors(t);
  if (anchors.length < 2) return false;
  const hasBoundary = ADDITIVE_BOUNDARIES.some((b) => t.includes(b));
  if (!hasBoundary) return false;
  if (relationalConnectivesIn(t).length > 0) return false;
  return true;
}
```

Probe (`node scripts/diagnostic/inner-claim/probe.mjs`): all twelve sentences print `isCompoundCandidate: false`. Per-sentence table is Part 1.

A2 TRUE. `rollupClaimVerdicts` can only promote `partially_confirmed` to `confirmed`, and that path is compiled off.

Quoted `lib/qc/claim-spans.mjs`:

```
 * DISABLED 2026-08-25 (`review-upgrade-off`). The upgrade is not applied.
 * Verdict is always V_today. claimUpgrade is always false.
 ...
 * Why it is off: across 296 corpus cards, exactly one reached this function
 * with vToday=partially_confirmed and all claims confirmed, and that one was
 * the synthetic E1 accident fixture, where the upgrade produced a false
 * green. On 254 production fixture cards the upgrade fired zero times; every
 * confirmed card was already confirmed at Stage 3. Zero observed correct
 * firings, one observed incorrect one.
```

```
  const upgrade = false;
  ...
  return {
    verdict: vToday,
    claimUpgrade: false,
```

There is no branch that lowers `vToday`. Architecture still describes the upgrade-only rollup (`docs/ARCHITECTURE.md` Stage 3). Commit `68940c3`.

A3 PARTLY. Widened results go only into `supportSpans` and are never appended to `sourceMatches`. CONFIRMED.

Quoted `lib/qc/pipeline-v4/index.mjs`:

```
   * CRITICAL: widened results go ONLY into supportSpans. They must NEVER be merged into
   * sourceMatches. The intra-source reducer reads locatable span classifications and
   * produces one pair-level class for aggregateVerdictV4. selectExcerptsV4 still
   * reads single-pick sourceMatches only.
```

`selectExcerpts` is called with the unreduced single-pick array:

```
    const excerptResult = selectExcerptsV4({
      statementMatches: sourceMatches,
      verdict: agg.verdict,
      hasConflict: agg.hasConflict,
      supportSpans,
      sources: safeSources,
    });
```

The comment that it "reads single-pick sourceMatches only" is not the whole function. On a `conflicting` verdict, if no single-pick match is classified conflicting, it falls back to the first conflicting `supportSpan`.

Quoted `lib/qc/pipeline-v4/stage4-select-excerpts.mjs`:

```
  if (v === "conflicting" && !firstMatchWithClassification(matches, "conflicting")) {
    const fromSpan = firstConflictingSpanExcerpt(supportSpans, sources, matches);
    if (fromSpan) {
      conflictExcerpt = fromSpan;
      if (!primaryExcerpt) primaryExcerpt = fromSpan;
    }
  }
```

On a `confirmed` card that fallback never runs. A widened passage classified `confirmed` cannot become the displayed excerpt. That is the refinancing shape.

A4 YES, through the intra-source reducer, and only then. A locatable widened span votes. Rank is conflicting, then partially_confirmed, then confirmed. Stage 3 is conflict-wins on the reduced pair.

Quoted `lib/qc/pipeline-v4/intra-source-reducer.mjs`:

```
const RANK = {
  conflicting: 4,
  partially_confirmed: 3,
  confirmed: 2,
  ...
};
```

```
    const votes = [m?.classification];
    for (const span of pairSpans) {
      if (!spanVotes(span, text)) continue;
      votes.push(spanVoteClassification(span, statement));
    }
    return {
      ...m,
      classification: mostSerious(votes),
    };
```

`spanVoteClassification` does not apply the magnitude FORCE arm to confirmed or partial spans. A conflicting span whose figures agree within rounding is lifted to confirmed.

It did not fire on refinancing because both stored spans were classified `confirmed`, not `conflicting`. Confirmed + confirmed stays confirmed. The passage with EUR 2.1 billion was found, stored, and labelled agreement. The reducer had nothing more serious to take.

A5 There is no check that would have stopped that passage being classified confirming.

What exists, and why it did not:

- Stage 2 prompt (`lib/qc/pipeline-v4/prompts/stage2_v4.md`): "A same-metric number that differs by more than rounding is conflicting." Prompt only. The live run classified the EUR 2.1 billion span `confirmed`.
- `applyRoundingToleranceBackstop` can FORCE `conflicting` via `hasEgregiousMagnitudeGap`. The probe logged `[magnitude-backstop] suppressed currency force` on the exact refinancing strings (USD 1.5 billion vs EUR 2.1 billion). Different recognised currencies suppress (B71). The reducer also does not run that force arm on confirmed spans.
- B336 `kindNameSame` lives in `lib/revise-actions/conflict-engagement.mjs` and is private. It is used after the verdict, for Implement Changes. It is not a Stage 2 classifier. The probe printed `disagreements: []` on the refinancing pair: `kindKey` is `money:billion:USD` vs `money:billion:EUR`, and the name-window Jaccard is below 0.6.

A6 `unsupportedSpans` is validated (`lib/qc/qc-api-schema.mjs`), copied onto the card (`lib/qc/pipeline-v3/stage7-assemble-card.mjs`), and read by Implement Changes (`lib/revise-actions/thing1.mjs` `evidenceCandidates`, `lib/revise-actions/silence.mjs`, `lib/revise-author-statement.mjs`, `lib/revise-stage1.mjs`). The frontend has no read of `unsupportedSpans` (repo grep of `src/`: none). Delivery-check already recorded this: "`unsupportedSpans[]` COMPUTED BUT NEVER SHOWN. No frontend read."

Denmark produces no card line because the span is stored and never painted. `isSpanElicitEligible` is only `partially_confirmed` and `conflicting` (`SPAN_ELICIT_CLASSIFICATIONS`). The span existing means Stage 2 already treated that pair as partial or conflicting. The card face still has no field that prints `unsupportedSpans[].text`.

---

## Part 1. Probe

Command: `node scripts/diagnostic/inner-claim/probe.mjs`. USD 0.

`ADDITIVE_BOUNDARIES` that do not start with comma or semicolon: `" as well as "`.

### Doctored draft

| S | Anchors | Boundary | Connectives | Compound |
|---|---------|----------|-------------|----------|
| 1 For the six months ending 30 June 2024, Action generated record net sales and operating EBITDA. | number:30, date:June, date:2024 | none | none | false (no boundary) |
| 2 Like-for-like sales growth reached 12% ... luxury goods... | percent:12% | none | driven by | false (one anchor, connective, no boundary) |
| 3 Performance for the period was achieved despite ... due to adverse weather... | none | none | due to | false (no anchors, connective, ` and ` is not `, and `) |
| 4 Meanwhile, the company completed a USD 1.5 billion refinancing, reflecting... | money:USD 1.5 billion | none | none | false (one anchor; `, reflecting` is not an additive boundary; `reflecting` is not in RELATIONAL_CONNECTIVES) |
| 5 Following the refinancing, 3i recycled ... April 2024 ... 56.7%. | date:April, date:2024, percent:56.7% | none | following | false (connective; `, increasing` is not an additive boundary) |
| 6 Action added 119 new stores in Denmark ... 330 new stores for by end-2025. | number:119, number:330, date:2025 | none | none | false (` and ` without a comma. Denmark is not an anchor: `NAMED_ENTITY_RE` requires two to four Title-Case words) |

### Honest draft

Same shape, same twelve-false result. S2 connective `driven by`. S3 `due to`. S4 one money anchor. S5 `following`. S6 ` and ` without comma. Anchors swap 12% to 9%, USD 1.5 billion to EUR 2.1 billion, April to July, 56.7% to 57.6%, 2025 to 2024. Denmark is absent, so it is not an anchor there either.

### D1 probe on the named refinancing strings

| Pair | kindNameSame disagreement | magnitude FORCE |
|------|---------------------------|-----------------|
| Doctored USD 1.5bn vs EUR 2.1bn passage | none | suppressed (currency, B71) |
| Doctored vs qualitative confirming passage | none (passage has no quantity token) | no |
| Honest EUR 2.1bn vs EUR 2.1bn passage | none (values equal) | no |
| Honest vs qualitative confirming passage | none | no |

Draft money names window includes `meanwhile`, `company`, `completed`, `refinancing,` (comma stuck on the word), `reflecting`, `robust`, `growth`. Passage names window includes `action`, `successfully`, `completed`, `refinancing`, `event`, `raising`. Jaccard is below 0.6 even if currency is ignored.

---

## Part 2. Design

### D1. The cheapest thing first

A confirming passage must not stay confirming when it carries a quantity of the same kind and name as one in the statement with a different value. Reuse B336 `kindNameSame`. Do not invent a second Jaccard.

That rule, as written, would not have caught the refinancing case. Probe: `kindNameSame` is empty on USD 1.5 billion vs EUR 2.1 billion. Two independent reasons: `kindKey` includes currency, and the name windows fail `namesMatch`.

It needs no sentence splitting. It costs no extra model call. It runs on passages Stage 2 already returned.

What it would catch: a confirming passage that repeats the same named percent, count, or same-currency money at a different value. The 12% / 9.0% sentence is already conflicting at Stage 2, so D1 is redundant there. The 56.7% / 57.6% sentence is already conflicting.

What it would wrongly catch: a confirming passage that names a second, same-kind figure for a different component. `kindNameSame` already returns false when `draft.component` or `source.component` is set. Ranges and totals that B336 already refuses stay refused.

Failing passage: demoted to `conflicting`, not dropped. Dropping would hide the evidence. Demotion lets the existing reducer take most-serious.

Because `kindNameSame` misses the worst case, the first ship amends the application, not the sameness function: when the statement and a confirming passage each have exactly one money token, and `sameQuantity` (already exported, `kindKey` plus value) is false, demote. Honest EUR 2.1 billion vs source EUR 2.1 billion is `sameQuantity` true and stays confirmed. USD 1.5 billion vs EUR 2.1 billion is not `sameQuantity`. No second name Jaccard. Tokenizer is still B336's.

### D2. Two passages, one verdict

Once the EUR 2.1 billion span is `conflicting`, the intra-source reducer already produces pair class `conflicting` (confirmed single-pick plus conflicting span). Stage 3 already conflict-wins. Card verdict: **conflicting**.

The qualitative confirming span does not save the sentence. A design that leaves that sentence Confirmed has not addressed this spec. This one does not. No new aggregator.

### D3. Show the passage

Today a confirmed card displays the first confirmed single-pick excerpt. On refinancing that is the qualitative sentence, which has no number.

Change: `selectExcerpts` must prefer a span that bears on the disputed quantity when the reduced verdict is `conflicting`. The fallback that already reads `supportSpans` on a conflicting verdict with no conflicting single-pick is the right hook. Pass the reduced matches, or select the demoted span explicitly.

How many passages: two at most. The contradicting span is required and is the primary quote. A second confirming span may sit under it, labelled as what the source also says. If none of the spans contains the disputed figure, do not show a number-free confirming quote as the only quote. Show the contradicting span or show a hole. Ben's test: a red card whose only quote has no number in it has failed.

### D4. The direction that was never built

Recommendation: **do not build a downward inner-claim rollup yet.**

The upgrade path was measured: one false green, zero correct firings. A downward path needs a splitter that admits these sentences, a per-claim Stage 2, and a rollup that can go down. The probe says the splitter admits none of the twelve. Denmark is not even a verifiable anchor under `extractVerifiableAnchors`. Luxury goods sits behind `driven by`, which the splitter treats as meaning that lives in the connective. Building the three-piece stack first would spend extra Stage 2 on other prose and still miss these three without a separate display path.

What should happen instead:

- Refinancing: D1 demote plus D3 show the EUR 2.1 billion span. Card conflicting. Quote has the number.
- Denmark: paint `unsupportedSpans` on the card. The span is already stored. The frontend does not read it. That is the whole miss.
- Luxury goods: the 12% / 9.0% conflict already fires. Also show the widened span that contains "outperformance in everyday necessities" as the quote that bears on the driver. Do not wait for a splitter to isolate "luxury goods".

Revisit a downward rollup only if those three display-and-guard pieces still leave a false-detail sentence green.

### D5. The splitter

If D4 later needs it:

The comma requirement is no longer right for investment prose. S6 coordinates with plain ` and `. Every additive boundary except `" as well as "` currently demands a comma or semicolon. That looks deliberate and is now the reason the Denmark sentence never reaches Stage 1b.

The relational-connective disqualification is still right **for splitting**. `driven by`, `due to`, `following` carry the claim in the relation. Splitting S2 into "12%" and "luxury goods" would drop the causal claim the way the original comment warned. Those sentences need D1 and D3, not a looser pre-filter.

`reflecting` is not on the connective list. S4 fails because it has one anchor and no listed boundary, not because of `reflecting`. Do not add `reflecting` to the disqualifier as a way of ignoring that sentence.

Do not ship a splitter change in the first piece.

### D6. The control, and the real risk

Honest draft under this design:

- S4 EUR 2.1 billion vs source EUR 2.1 billion: `sameQuantity` true. Confirmed. Required.
- Qualitative confirming passage has no money token. Guard does not fire.
- S1, S3: no quantity guard.
- S2 9% agrees. Driver "everyday necessities" agrees. No extra finding.
- S5 57.6% and July agree with the source as written.
- S6 119 and 330 agree. B336 still withholds a 119-to-330 replace. No new conflict.

More than one finding on the honest draft: **none expected** from piece one. If a later display of `unsupportedSpans` painted a span on an honest confirmed card, that would be a bug in elicit, not a reason to skip Denmark on the doctored run.

### D7. Nothing may regress

The five planted errors this draft already raises must still raise:

1. 12% vs 9.0%
2. price increases vs price reductions
3. April 2024 vs July 2024
4. 56.7% vs 57.6%
5. 330 / end-2025 (evidence conflict; B336 then withholds a replace that would smash the 119 the source also states)

D1 only demotes a confirming class. It does not clear an existing conflict. D3 only chooses which quote to show.

### D8. Cost

Today, a 190-word six-statement single-source review is six Stage 2 single-picks, plus widened calls on supporting pairs when `QC_STAGE2_SPAN` is on, plus span elicit on partial and conflicting pairs, plus Stage 5 once and Stage 6 twice per statement.

Piece one (guard plus excerpt): **zero extra calls**. Multiplier 1.00. Size ceiling unchanged.

A splitter plus per-claim Stage 2 is capped at `MAX_DECOMPOSED_SENTENCES` 12. On a 3,698-word draft against a 5,105-word source (B277 Run 4: 187 editorial statements, 267 s wall, USD 16.44 list), that is at most about 24 extra Stage 2 calls if every admitted sentence splits into two claims, about 1.13 times Stage 2 volume. That can nibble the 300 s cap. Do not ship it first. This draft's twelve sentences would still add zero extra Stage 1b calls until the pre-filter changes.

### D9. Sequence

| Piece | What | Deterministic? | Needs splitter? | Ship |
|-------|------|----------------|-----------------|------|
| 1 | Demote a confirming passage whose only money (or whose `kindNameSame` quantity) disagrees. Prefer that passage as the excerpt. | yes | no | **first** |
| 2 | Paint `unsupportedSpans` on the card. | yes | no | second |
| 3 | On a conflict card, prefer a widened span that contains the disputed non-figure (everyday necessities). | yes | no | third |
| 4 | Splitter: allow plain ` and `. Do not drop the relational-connective bar. | yes, then Stage 1b model | yes | only if 1-3 leave a green false-detail |

Piece 1 stands alone and is the one I would ship first.

---

## Spend

USD 0. No model calls.

---

## One line

If only one change: demote a confirming passage that carries a disagreeing money figure, including across currency when each side has one money token, and put that passage on the card.
