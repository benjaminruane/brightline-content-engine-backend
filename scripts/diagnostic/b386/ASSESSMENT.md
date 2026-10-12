# B386. The product against the five promises

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  7192fff  main  166 files  1817 tests` |
| Cost | USD 0. No model calls. The checks below re-ran current functions on stored text. |
| Evidence | `scripts/diagnostic/b385/REPORT.md`, `scripts/diagnostic/b385/labels.json`, `scripts/diagnostic/b381/REPORT.md` lines 93-262, the four doctored payloads, GP Industries `CLEAN-RUNS.md`, ClearPoint clean run 1. |
| Bar | 33 of 37 planted errors. Not tradeable against a green card that is wrong. |
| Measured, stored cards | Comment names the error: 27 of 37. Highlighted span lands on the error: 23 strict, 26 if a flagged sentence with a passage beside it counts. Whole-draft arm: 36 of 37. |

The stored cards are not one build. 3i is `a22e894` (28 September). HICL is `2b68499` (4 October, B371). GP Industries is `98c54be` (5 October). ClearPoint is `55e8cd8` (6 October). Where a check shipped after the capture, this file says so, and says what that function does on the stored text today. A green on an old card is still a broken promise for the reviewer who received it. It is not automatically a hole in the assembler that is on main now.

## P1. Green means verified

A sentence the product passes must not need checking. The mechanical reason is: these words were located in this passage, and the locate can be re-run. An error on a green card breaks the promise.

On the stored cards, four of the 37 substitutions sit on `supported_full`. They are not one bug.

### G1. 3i doctored S12

The sentence widens gains on TCR to gains across essentially all investments. The card is `supported_full`, `hasConflict` false, `unsupportedSpans` empty. Stage 2's stored class is `confirmed`. The support span does contain the holding: "a significant valuation uplift in TCR."

`applyScaleCauseCheck` in `lib/qc/scale-cause.mjs` is the check that was written for this shape. It runs only when the display verdict is already `supported_full`, the statement matches the universal-set regex, and the confirming passages name exactly one holding as the gain:

```246:261:lib/qc/scale-cause.mjs
  if (displayVerdict === "supported_full") {
    const setHits = universalSetHits(statement);
    const holdings = holdingsNamedAsGain(confirming.length ? confirming : passages);
    if (setHits.length > 0 && holdings.length === 1) {
      const holding = holdings[0];
      const finding = `The source names a valuation uplift in ${holding}, not gains across essentially all of its investments.`;
      // ...
      return {
        applied: true,
        reason: "scale_set_one_holding",
        displayVerdict: "conflict",
```

The holding regex is `gain(s)` or `uplift` followed by `in` and a name (`GAIN_HOLDING_RE`). Re-running the function on the stored statement and the stored support span returns `applied: true`, holding `TCR`. The trimmed excerpt on the card does not contain that clause, and the function returns no holding if it is given only the excerpt. Stage 7 passes the support spans, not only the trimmed quote (`confirmingForScale` in `assembleCard`).

The capture is 28 September. B362, which added this check, is 1 October. The stored green is the route before the check. Current assembly, given this span, would not call the sentence green. The check still misses a universal-set claim whose passage says "increase in" or "driven by" and never "uplift in" or "gains in". That is the live remainder of G1, and it is the same hole as G4.

### G2. HICL doctored S0

Two substitutions, one sentence: HCIL for HICL, and six months to 31 December 2025 for the period 1 October 2025 to 28 February 2026. The card is `supported_full`. Stage 2's stored class is `confirmed`. Both support spans are "in line with expectations." Neither contains the company typo or the period. The comment repeats both doctored phrases as what the source says.

The date half is a later check. `appendDateSubjectSpans` in `lib/qc/date-subject.mjs` adds one source sentence that carries a date of the same family when no stored span already has one. On the stored statement and the stored HICL source it adds: "The Board of HICL is issuing this Interim Update Statement, which relates to the period from 1 October 2025 to 28 February 2026." `confirmingPassageVerdict` in `lib/qc/pipeline-v4/confirming-passage-disagrees.mjs` then returns `{ rule: "b", demoteTo: "conflicting" }` on that pair. Stage 3's reducer takes the most serious class (`applyIntraSourceReducer`). Current assembly would not leave this sentence green. The capture is B371, the same day B372 shipped the date append, and the HICL README records that the doctored run retrieved no date passage. The stored card is that miss.

The name half is not that check. `isActorOfTheActionEnabled` defaults off (B371). Nothing else compares HCIL with HICL on a confirming card. A sentence that carried only the name error, against the same "in line with expectations" passage, would still be `supported_full`. The date demotion flags this particular sentence for a different reason. It does not mark the name.

### G3. ClearPoint doctored S3

The segment is $5.9 million of $12.1 million. The draft says it contributed the vast majority of overall revenue. The card is `supported_full`. The comment is "80% and 3.0 match the source." `unsupportedSpans` is empty. The fingerprint is `not_reviewed` with `emptyConfirmationRefused: true`. `supportSpans` is empty. The excerpt is the neurosurgery sentence that contains 80%, $5.9 million, and the prior-year $3.3 million. It does not contain $12.1 million. The source does.

This is not the G1 path and not the G2 path. Stage 2 returned `confirmed` with an empty passage. The Stage 2 writer refuses that as `not_reviewed`. Stage 7 then searches the source for a sentence that carries some of the statement's anchors (`locateClaimSentencesInSources`) and, if it finds one, forces green:

```984:989:lib/qc/pipeline-v3/stage7-assemble-card.mjs
    if (recoveredEmptyConfirmation && hasRealExcerpt) {
      supportState = "supported";
      displayVerdict = "supported_full";
      concernLevel = mapSupportStateToEvidenceConcernLevel(supportState);
      const beforeAbsenceDrop = evidenceSummary;
      evidenceSummary = dropAbsenceCommentary(evidenceSummary);
```

`applyScaleCauseCheck` does not fire. "vast majority" is in `SCALE_RATIO` at two thirds, but `arithmeticScaleCheck` returns null unless two displayed passages each hold exactly one money figure. This excerpt is one passage with two money figures (current year and prior year), and the $12.1 million denominator is not on the card. Re-running the function on the stored statement and excerpt returns `applied: false`. The universal-set regex does not include "vast majority". Current assembly would still call this sentence green.

The comment is the B369 fill, after `dropAbsenceCommentary` emptied whatever Stage 5 wrote. That is G12. Same path.

### G4. Green with nothing located

A reviewer-facing green with a null excerpt is refused. `applyExcerptHonestyToDisplay` turns `supported_full` into `unverifiable` when there is no real excerpt. If `supportState` is `supported` and no passage was located, `assembleCard` rewrites the card to `skipped` / `not reviewed` with `evidenceNotReviewedReason: excerpt_not_locatable`.

A green whose passage does not contain the claim is allowed. Two routes produce it.

1. Stage 2 class `confirmed`, a passage locates, and no later rule demotes. `aggregateVerdict` in `lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` returns `confirmed` from the class alone. The passage has to be findable in the source. It does not have to contain the disputed words. G1 before B362, and G2's name, are this route.
2. Empty-confirmation recovery, above. A refused confirmation becomes `supported_full` because some anchor sentence was found. G3 is this route. GP Industries clean S1 on runs 3, 4, and 5 is the same route on a true sentence: the excerpt is "It also has two other plants in the UK." and the display verdict is `supported_full`.

`supportState: "supported"` is not emitted with a null excerpt. `displayVerdict: "supported_full"` is emitted when the located string does not establish the sentence.

## P2. Every flag is resolvable on the card

The reviewer settles a flag from the screen. A flag with no passage, or with the wrong words marked, sends them back to the source.

### G5. not_supported, no passage, no mark

HICL doctored S7 (three substitutions) and ClearPoint doctored S9 (two). `primaryExcerptText` is null. `unsupportedSpans` is empty. The fingerprint class is `no_support`.

Span elicitation runs only for `partially_confirmed` and `conflicting`:

```40:40:lib/qc/pipeline-v4/stage2-match-sources.mjs
export const SPAN_ELICIT_CLASSIFICATIONS = new Set(["partially_confirmed", "conflicting"]);
```

`buildUnsupportedSpans` skips every other class. `selectExcerpts` sets `primaryExcerpt` to null for any verdict that is not confirmed, conflicting, or partially confirmed (`stage4-select-excerpts.mjs`, the final else). `locateClaimSentencesInSources` is called from assembly only for a supported or partial card with no pointer, and for empty-confirmation recovery. It is not called for `not_supported`.

The HICL comment still names the CEO, the UK government, and water. Stage 5 is told that a `not_supported` card may have an empty excerpt and must not invent source content (`prompts/stage5_v2.md`). The same prompt still receives `sourceExplanations`, which are the matcher's prose. The comment can state source facts the card never shows. That is P3 on the same cards.

Re-running the shipped locator on these two statements: HICL S7 returns null. The draft's own tokens (CFO, French government, electricity) are not in the source, and that is what the locator looks for. ClearPoint S9 returns a passage about cost synergies and 2027, not the revenue-guidance sentence. Attaching that string as if it were the evidence would show the reviewer the wrong place.

### G6. One mark per sentence

ClearPoint doctored S8. The authority error (FDA for Health Canada) and the verb error (commenced for completed) are different clauses. The stored span is only the commencement clause, characters 160 to 278. The Health Canada support span is classified `conflicting` and is truncated mid-word ("ClearPoint Neuro t"). `locatePassageInSource` does not find it, so `spanVotes` in `intra-source-reducer.mjs` does not let it vote. The pair stays `partially_confirmed`. The elicit, which ran because the single-pick was partial, returned one string, and that string is the verb.

GP Industries doctored S4. Three substitutions. The span is characters 0 to 114 and stops before "bartered through".

The elicit prompt asks for one JSON string, `unsupportedSpan`, not a list (`prompts/stage2_v4_span_elicit.md`). `buildUnsupportedSpans` pushes one object per source match. A second error in the same sentence has nowhere to go unless it is inside that one string.

The review card does not paint `unsupportedSpans`. A search of the frontend finds no read of that field. B342 already recorded that it is stored and never painted. The draft highlight uses `draftSpan`, which assembly sets to the whole sentence (`stage7-assemble-card.mjs`, `draftSpan: { startChar: charStart, endChar: charEnd }`). `StatementAnalysisPanel.jsx` copies that into `claimSpan`. The reviewer who looks at the draft sees the sentence, not the clause the span named.

### G7. Conflict, no words marked, conflictValues null

HICL doctored S3. Fingerprint class `confirmed`. Support span class `conflicting` ("London St. Pancras..."), and that span locates. The verdict is conflict because `applyIntraSourceReducer` takes the most serious of the single-pick and every locatable widened span. The elicit never ran: the single-pick was `confirmed`, which is not in `SPAN_ELICIT_CLASSIFICATIONS`. `unsupportedSpans` is built from the original matches, not from the reduced class (`pipeline-v4/index.mjs`, `buildUnsupportedSpans(rowMatches)`).

GP Industries doctored S1. Fingerprint class `conflicting`, so the elicit was eligible if that was the class before demotion. `tokenizeQuantities` does not see "three" as a count (number words are not quantity tokens, B378). `confirmingPassageVerdict` on both stored passages returns no demotion. The conflicting class was not created by the figure demotion. The card stores no rejected-span field. `buildUnsupportedSpans` drops a match whose validated span text is empty. Whether the second call returned nothing, or returned a string that was not an exact substring, cannot be told from the payload.

`conflictValues` is not a failed lookup. Assembly writes it as null on every card:

```1356:1356:lib/qc/pipeline-v3/stage7-assemble-card.mjs
      conflictValues: null,
```

B147 already records that stub. Both of these cards have a passage. The flag is resolvable from the quote. It is not resolvable from a marked word. HICL S3's quote is the Pancras sentence. GPI S1's quote is the three-facilities sentence, and a second quote has the China clause. The missing mark is still a P2 miss when the quote is long and the wrong word is not indicated.

## P3. The product never asserts what it cannot show

One confident wrong sentence makes the reviewer check everything, which means reading the source.

Stage 5 writes `evidenceSummary` from the statement, the verdict, the excerpts, and `sourceExplanations` (`stage5-generate-commentary.mjs`, `buildUserPrompt`). For a confirmed verdict the prompt requires: "State plainly that the source confirms the statement." Assembly then strips a narrow set of sentences. `stripOmissionOverclaimWhenDisplayed` in `lib/qc/card-honesty.mjs` drops a "does not mention" sentence only when the displayed quotes hold that clause's names and figures. The pattern is `does not mention`, not "does not specify" and not "does not confirm". It does not read support spans that were not displayed. It does not compare a confirming verb in the comment to the passage.

### G8. The comment affirms the error

Five stored comments.

- 3i S12 and HICL S0 are greens. The confirmed prompt tells the model to say the source confirms the statement. The passage does not contain the widened claim, or the name, or the period. The comment restates the draft.
- GP Industries S4 is a conflict. The comment names the rank and the billions, then says "The claim of distribution through one million outlets is confirmed." The outlets figure is in the source. The verb in that clause is "bartered", and the source says "sold". The prompt tells a conflict comment to note what is confirmed after the contradiction. Nothing checks that the confirmed clause's verb is the source's verb.
- ClearPoint S8 names the Health Canada error and then says the source confirms "the commencement". The located passage says "Completion".
- ClearPoint S3 is the B369 sentence "80% and 3.0 match the source." It does not mention "vast majority". On a green card that sentence reads as confirmation of the statement. `fillQuoteWithoutComment` is allowed to say "match the source" only when the display verdict is `supported_full` (`allowMatchSentences`).

### G9. The comment describes the passage, not the sentence

3i doctored S8. Action was written as MAIT. The span is the entire sentence (start 0, end 97). `validateUnsupportedSpan` keeps a span that equals the statement and flags it whole. It does not reject it. The comment never says MAIT or Action. It objects to "significant", which the passage does not say. Stage 5 never receives the span. It receives the statement and the Action passage, and the confirmed-partial instructions tell it to name the gap in the source's language. "Significant" is a gap. MAIT is a different word sitting in a span that covers everything, so the span does not point at it either. The same shape has been logged four times across two documents. It is structural: the comment is not derived from the marked words.

### G10. The instruction deletes a true fact

3i doctored S9. The source does say 3i acquired 2.2% from GIC. Only the name is wrong. The comment says the source does not mention an earlier purchase from AGIC, and tells the reviewer to remove that claim. The GIC sentence is a support span. The displayed excerpt is the October financing passage, which does not contain GIC, and `conflictExcerpt` is null. The omission strip tests displayed quotes, so it does not see GIC. `applyRolePartyCheck` also reads displayed passages. "from AGIC" is not compared with "from GIC" because the GIC sentence is not on the card face. A writer who follows the comment deletes a purchase the source states.

### G11. The comment contradicts the card

ClearPoint clean S2, stable on all three clean runs. The comment says the source does not confirm 25% organic growth for devices, and does not specify the gross-margin cause. The source headline states the 25%. The excerpt on the card states the margin cause. "does not specify" and "does not confirm" do not match `OMISSION_CLAIM`. The span marks the margin clause, which is the supported claim (claim 1 is `confirmed`). The comment argues about a different clause, and against a quote the card is showing.

ClearPoint clean S9. The comment says the classification as conflicting suggests there may be an error in the source explanations. Stage 5 is given the verdict string. Nothing in assembly removes a sentence that doubts the verdict. The range parse that kept the conflict is G14.

### G12. The fallback comment is empty of the error

ClearPoint doctored S3. Same recovery as G3. `dropAbsenceCommentary` clears the comment. `fillQuoteWithoutComment` then names anchors the quote actually carries, at most the ones `claimAnchors` finds, and on a green card it says they match. "vast majority" is not in the passage, so it is not named. The function does what B369 specified. The result is a green card whose only sentence affirms the true numbers and is silent on the false scale.

## P4. Same document, same answer

### G13. GP Industries clean, five runs

`CLEAN-RUNS.md`. Same draft, same source. Statement 0 is partial on runs 2, 3, and 4, and full on run 5 (run 1 was reported all green and was not captured). Statement 1 is partial on run 2 and full on runs 3, 4, and 5. Both flags are false.

The stored fingerprints, same prompt id `fp_61a9eaf3ca` on every one of these cards:

- Run 4 statement 0: class `partially_confirmed`, span on the announcement clause.
- Run 5 statement 0: class `confirmed`, no span. The passages are the same two sentences.
- Runs 3, 4, and 5 statement 1: class `not_reviewed`, `emptyConfirmationRefused` true, then the card displays `supported_full` with the excerpt "It also has two other plants in the UK."

The class moves at Stage 2. Temperature 0 and `seed=1` do not pin it. Architecture records that as B61: the cache covers Stages 1, 1b, and 2 in process memory only, and it does not close residual drift. `aggregateVerdict` is deterministic given the classes it receives. The variance is model output upstream of that function. Stage 7 then maps one of those outputs, the empty confirmation, onto green. A partial and a recovered green are different reviewer-facing answers produced from the same input. The deterministic route is not repeatable on this document, because its input is not repeatable, and because recovery turns one of the unstable outputs into a pass.

## P5. It leaves a record

The qcCard is the record: statement, `displayVerdict`, `supportState`, excerpts, `unsupportedSpans`, `supportSpans`, `stage2SourceFingerprints`, `evidenceSummary`. That is enough to answer "what did the screen say" after the fact.

It is not enough to answer "which claim, against which passage, with which mechanical verdict" when:

- the green was a class plus a neighbouring sentence (G4), so the record does not contain a locate of the claim's words
- the fingerprint string is the prompt id, and it is identical across the GP Industries runs that disagreed (G13)
- `not_supported` stores no passage (G5)
- the comment asserts a fact the excerpts do not show (G8, G10, G11)

`conflictValues: null` means the record also does not store the paired figures the conflict was about. The passage text is the only figure record, when a passage exists.

## False flags on correct writing

### G14. A range read as a conflict

ClearPoint clean S9, all three runs. Draft "USD 52-56 million for 2026". Source "between $52.0 million and $56.0 million". Fingerprint class `conflicting`. The span marks "provided updated revenue guidance", not the numbers.

`collectBackstopFigures` parses the draft as money `USD 52` with value 52, and money `56 million` with value 56,000,000. The source parses as 52,000,000 and 56,000,000. `pairRelationship` marks a pair mutually exclusive when the relative gap is over 0.08, and it returns `mutually_exclusive` if any statement figure is exclusive, before it considers an identical partner:

```733:736:lib/qc/pipeline-v4/stage2-match-sources.mjs
    if (rel > 0.08) anyExclusive = true;
    else anyBeyond = true;
  }
  if (anyExclusive) return "mutually_exclusive";
```

`classifyNumericRelationship` on the stored strings returns `mutually_exclusive`. `applyRoundingToleranceBackstop` lifts a conflict to confirmed only when that relationship is `within_rounding`. It does not lift this card. `confirmingPassageVerdict` returns no demotion, so a confirmed class would not have been forced into conflict by the same function. The false flag is the model's conflict, kept because the hyphen binds "million" to the second number only, and the lift then agrees the figures disagree.

### G15. The dateline rule did not fire

GP Industries clean statement 0. The comment says the source does not specify that the announcement was made in November 2025. The source is dated 13 November 2025. The capture build is `98c54be`, 5 October, 13:23. B378's dateline commit `55e8cd8` is 6 October, 19:39. The rule was not in the build that produced the card.

`assessAnnouncementDateline` on the stored clean sentence and the stored source returns `status: "agree"`, subject "GP Industries", dateline "13 November 2025, Singapore". The clause regex is `^In (Month) (Year), (Subject) (announced|...)`. This sentence matches. Run 4's span is the announcement clause only, and its support spans are `confirmed`, which is the shape `canLift` accepts. Current `applySourceDatelineToCard` would strip the "does not specify" sentence and lift that partial to `supported_full`. The stored flag is the pre-rule card. It is not evidence that the shipped rule misses this sentence.

## What the card says when it has nothing to offer

### G16. The proposal engine

The ClearPoint README records ten conflict cards across GP Industries and ClearPoint, and zero proposals. The stored action files contain nine conflict rows, all `ACKNOWLEDGE`, and no replace. The tenth row is not in those files. The public reason is not a different explanation each time. Eight rows use `conflict_unaddressed`, which is `GENERIC_CONTRADICTION`: "A source contradicts this statement. Decide whether the sentence should match the source." ClearPoint doctored S2 stores `explainCode: "self_disagreement"`: "The same source states 25% elsewhere, so the figures cannot be reconciled from it."

`resolveConflictEngagement` offers a replacement only when `findCandidatePairs` or `findNamePairs` produces a writable pair and the finished sentence is licensed by the excerpt (`applyConflictProposal` in `conflict-engagement.mjs`). Re-running it on the stored cards: GP Industries S1, S3, S4 and ClearPoint S0, S7, and clean S9 return `unaddressed` with no explain code and zero pairs. ClearPoint S2 returns `self_disagreement`. Current name pairing would offer a replace on some older HICL and 3i conflicts. It still offers nothing on the two-genre set the README counted.

Rewriting is not the target. A layer whose successful output is a new sentence, and whose unsuccessful output tells the reviewer to decide the wording, does not serve P2. The directions that would serve P2 are the marked words and the passage. Those are G5, G6, and G7.

### G17. The no-proposal copy

`NO_PROPOSAL` in `lib/revise-actions/sort.mjs`. Four lines end on the wording the product owner rejected:

```14:18:lib/revise-actions/sort.mjs
  silence_no_edit: "No supplied source speaks to this claim, either way. The wording is yours.",
  partial_no_edit: "A source supports part of this statement, not all of it. The wording is yours.",
  partial_policy: "This concern stands. The wording is yours.",
  visible_signal:
    "The review found a concern in this sentence. No wording change is proposed, so you can judge it yourself.",
```

`policy_forbids` is a fifth near-match ("yours to decide"). `conflict_unaddressed` uses `GENERIC_CONTRADICTION`, which tells the reviewer to decide whether the sentence should match the source. That is the same hand-back, on the conflict cards.

## Cause table

Seventeen symptoms, eight causes. "Capture" means the stored card predates a check that now fires on that text. "Live" means current code still produces it from the stored inputs.

| Gap | Root cause | Promise | Shared with |
|---|---|---|---|
| G1 | Cause A. Class `confirmed` plus a passage. The TCR sentence is now caught by `applyScaleCauseCheck` (capture). A passage that does not match `GAIN_HOLDING_RE` is still green (live). | P1 | G2, G4, G8 |
| G2 date | Cause A, then B372. `appendDateSubjectSpans` plus rule (b) now demotes (capture). | P1 | G1, G4 |
| G2 name | Cause A. Actor check off. No other name compare on a confirming card (live). | P1 | G4 |
| G3 | Cause B. Empty-confirmation recovery forces `supported_full`. Scale arithmetic cannot see 5.9 of 12.1 (live). | P1 | G4, G8, G12 |
| G4 | Cause A and cause B. Green requires a located string, not a locate of the claim (live). | P1 | G1, G2, G3 |
| G5 | Cause C. `no_support` gets no elicit and no excerpt. The shipped locator does not find the right sentence (live). | P2, P3 | G6, G7 |
| G6 | Cause C. One elicit string per pair. A truncated widened span does not vote and does not mark (live). | P2 | G5, G7, G9 |
| G7 | Cause C. Conflict from the reducer, or an elicit that left no validated text. `conflictValues` hardcoded null (live). | P2 | G5, G6 |
| G8 | Cause D, and cause B on S3. Stage 5 is told to confirm the statement. Assembly does not check the comment against the marked words (live). | P3 | G1, G3, G9, G12 |
| G9 | Cause D plus a whole-sentence span. The comment never sees the span (live). | P3 | G6, G8 |
| G10 | Cause D. Omission strip reads displayed quotes only. The GIC span is stored and not shown (live). | P3 | G8, G11 |
| G11 | Cause D. "does not specify" is outside the strip. Nothing removes a comment that doubts the verdict (live). | P3 | G10, G14 |
| G12 | Cause B. B369 names the anchors that matched, after the real comment was cleared (live). | P3 | G3, G8 |
| G13 | Cause E. Stage 2 class moves. Recovery maps one of those classes onto green (live). | P4 | G4, B |
| G14 | Cause F. "52-56 million" parses as 52 and 56,000,000. The lift keeps the conflict (live). | P1 from the other side | G11 |
| G15 | Cause G. Dateline rule not in build `98c54be`. Current function agrees (capture). | P1 from the other side | none |
| G16 | Cause H. No writable pair, so no proposal (live on these two genres). | P2, and not the target | G17 |
| G17 | Cause H. The acknowledge copy hands the wording back (live). | P2 | G16 |

## Gaps the brief did not name

1. Empty-confirmation recovery greens a fragment on a true sentence. GP Industries clean S1, runs 3 to 5. Same function as G3. P1, because the mechanical reason is not the sentence.
2. The draft highlighter paints the whole sentence, and the review card does not paint `unsupportedSpans` (B342). A second mark in the payload would not show until the client reads the array.
3. The confirmed branch of the Stage 5 prompt requires the comment to say the source confirms the statement. G8 on a green card is that instruction followed.
4. With the actor check off, a wrong company name on a confirming card is not a conflict. That is the live half of G2 after the date check has run.
5. Calling `locateClaimSentencesInSources` on a `not_supported` card and showing the result as the passage would attach, on ClearPoint S9, a 2027 sentence that is not the guidance. That would be a new P3 failure. The function is the wrong nearest-miss.

No one-line change met the bar of obviously safe. The recovery assignment at `stage7-assemble-card.mjs` lines 984-987 is the live false green, and changing it changes a verdict. Left unapplied. `conflictValues: null` at line 1356 is the B147 stub. Populating it is a contract change. Left unapplied.
