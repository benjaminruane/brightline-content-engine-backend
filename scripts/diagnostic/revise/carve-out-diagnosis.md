# Style carve-out diagnosis

Instrument only. Zero model calls. Nothing implemented. Propose, critique, stop.

Decision (Ben, 2026-08-30): silence blocks changes to what a sentence CLAIMS. It should not block changes to its grammar or voice.

## Scoreboard

```
0a  Production path: prompt only. A code guard would NOT reject a style edit on an unsupported statement. Prompt change is not inert. Part B keeps this shape.
0b  Revision prompt is NOT hash-pinned. CONFIRMED. Contrast: tests/stage2-b48-calibration.test.mjs pins stage2_v4.md.
0c  Expected to fail if executed carelessly: an appended exception after rule (b); abstract "style-only" wording; treating overreach or marketing as voice; Stage 1 prefix if B130 is revived.
Part B verdict: a prompt-only change CAN work on the live path. It is not guaranteed to keep "We believe X" from becoming "X". Do not ship without the gate below. I would rather not ship than ship that failure.
```

## PART 0

### 0a. Prompt only, or also code?

CONFIRMED: on the production path, silence-never-edits is expressed in the revision prompt. It is not enforced by code that would reject a style edit on an unsupported statement.

Production Suggest (`api/suggest-revision.js` L176): Stage 1 runs only if `body.perStatementRevise === true`. Frontend never sends that. **B130** abandoned. The live path is `buildRevisionPrompt` then `callLLM` then `finalizeSuggestRevisionText`.

`finalizeSuggestRevisionText` (`lib/build-revision-prompt.mjs` L971-1018) remaps markers, notes, punctuation, house-style characters, cut-punctuation, and honesty. Deterministic unsupported removal is gated off (`api/suggest-revision.js` L64 `deterministicUnsupportedRemoval: false`). None of those steps revert a voice rewrite of an unsupported sentence. `pr9-unreported-change-markers.mjs` would add a marker for an unreported edit, not undo it.

Stage 1 DOES have a code gate (`lib/revise-stage1.mjs` L355-390 `stage1SendDecision`: "SILENCE NEVER EDITS, ENFORCED AT THE GATE RATHER THAN IN THE PROMPT"). That gate is off in production. Even if it were on, it SENDS a statement when an editorial `suggestedDirection` is present (L378-385). Mixed cards like r10-review1 S7 would still be sent. With empty `unsupportedSpans`, `checkOutsideSpanUnchanged` returns ok (L83: no-span fallback, whole statement is the target). A voice rewrite would not be rejected as outside-span. `checkNoInventedFacts` carves out the authoring organisation (L151-152), so inserting "Halden Group" is allowed.

A prompt change is therefore not inert on the path that ships. Part B does not change shape.

### 0b. Hash-pinned?

CONFIRMED: it is not. `tests/build-revision-prompt.test.mjs` L928-939 regex-matches live strings (`LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN`, `Do not soften it, do not drop the figure`). It does not call `hashPromptContent`. The Stage 2 pin is `tests/stage2-b48-calibration.test.mjs` L633-642, hash `44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1`. Amending rule (b) will fail those regex tests until they are updated with the new definition. That is a test edit, not a hash-bust gate.

### 0c. Expected to fail

HYPOTHESIS, from this corpus:

```
an exception appended AFTER "LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN" / "do not rewrite the sentence"
abstract wording such as "style-only changes are permitted"
including overreach_unsupported_causal or marketing_language_excess in the carve-out
leaving the KIND preamble "never edited" (L1086) and the concerns-block fallback (L654) unamended
reviving Stage 1 without amending revise-stage1-prompt.mjs L89
```

The mechanism claim in the spec is CONFIRMED. r10-review1 S7 is `not_supported` with a voice directive, followed 0 of 3 (`b122-rescore.json`). condition-b S7 is the identical sentence, `supported`, followed 3 of 3. Kind "unsupported" wraps the DIRECTION line (`formatConcernsBlock` L628-666).

## B1. Locate it

### The definition (one source string)

`lib/build-revision-prompt.mjs` L1089, kind "unsupported" rule (b):

```
b) kind "unsupported": If the source STATES a specific value for what the draft asserts, put that source value in the prose (house-style) and flag it - same figure rule as conflict/partial. Never invent a figure the source does not state. When the source is SILENT or vague on what the draft asserts, LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN and flag it. Do not soften it, do not drop the figure, do not cut the clause, do not rewrite the sentence. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about it.
```

That is a definition of what kind "unsupported" IS when the source is silent. I agree with the spec: it is not a later rule that an exception can override. "do not rewrite the sentence" is why r10-review1 S7 is a no-op. Voice is a rewrite of the sentence. A carve-out that leaves that clause standing will lose.

### Copies. Count before calling anything inert.

Production prompt, same file, same `buildRevisionPrompt` return:

```
1  L1089   THE DEFINITION. Rule (b). Count 1 source.
2  L1086   KIND preamble: "Removing unsupported PRECISION. NO LONGER DONE. An evidence gap with a SILENT source is flagged and never edited. Rule (b). Leave it and flag."
3  L1095   kind "partial" (c): "leave that element exactly as written and wrap it in a marker: no soften, no cut"
4  L1078   guardrail: "the edit belongs to that phrase and the rest of the sentence should be left alone"
5  L1119   marker example: unsupported, source silent, wording kept
6  L654    concerns-block fallback: "the source is silent, so keep the claim as written and flag it"
7  L599    per-claim span: "the keep-and-flag rule applies to this span"
8  L625    same fallback in the claim-spans branch
```

Copies 2 and 6 restate the old definition in other words. Amending L1089 alone is arithmetic, not a change, if those two still say "never edited" / "keep the claim as written" without naming the carve-out. Copy 3 is a different kind (partial). Copy 4 is about a named unsupported PHRASE, not about voice. Copies 5, 7, 8 are examples of keep-and-flag, still correct for claims.

Stage 1 (off in production, sliced from live for rule (b)):

```
9   livePromptBlocks() slices rule (b) from the live prompt. Not a third source. Amending L1089 flows here automatically.
10  lib/revise-stage1-prompt.mjs L89  SEPARATE: "Everything else in the statement stays exactly as the author wrote it."
11  L117  SEPARATE, named spans only: "Every other word of the statement must come back byte-identical."
```

Code (does not reject a mixed-card voice edit on the live path):

```
12  lib/revise-stage1.mjs L355-390  stage1SendDecision. Off. Sends mixed directive cards anyway.
13  api/suggest-revision.js L60-64  deterministicUnsupportedRemoval: false. Disables the old CUT. Does not revert style.
14  tests/build-revision-prompt.test.mjs L928-939  regex pin of the L1089 strings. Not runtime.
```

Review-side, not Suggest: `lib/qc/first-person-actor.mjs` L216 tells Review to leave first-person wording unchanged when the actor cannot be named. Different product surface.

**Live production copies that would fight a one-site amendment: 1, 2, and 6.** Amend those three together. 9 follows 1. 10-12 are landmines only if **B130** is revived.

## B2. Proposed amendment

I agree it is a definition. The load-bearing clause to change is "LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN" plus "do not rewrite the sentence". Voice is a rewrite. If those stay, the carve-out is theatre.

Do not append. Replace the silent-source half of rule (b), and retarget the preamble (copy 2) and the concerns fallback (copy 6) at the CLAIM, not at every word.

Proposed rule (b) silent-source half (not implemented):

```
When the source is SILENT or vague on what the draft asserts, leave the CLAIM exactly as written and flag it. Do not soften the claim, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the CLAIM.

A craft or style_guide suggestedDirection on the same statement is not a rewrite of the claim. Follow it only when it is one of these operations:
  - Replace a first-person subject or object (we / our / us) with the named authoring organisation. "We believe X" becomes "Halden Group believes X". "we recommend the commitment" becomes "Halden Group recommends the commitment". "available to us" becomes "available to Halden Group". Never "X". Never "is believed". Never "is recommended". The actor stays.
  - Preserve every hedge and modal exactly. should, may, could, expects, broadly, in line with. Only the grammatical subject or object pronoun changes.
  - Delete a parenthetical view-marker (in our view, in our opinion) only when the sentence subject is already the authoring organisation after that substitution.
  - Complete a sentence fragment or repair a dangling modifier, run-on, or agreement error named by structural_integrity. Do not add facts.
  - Mechanical house-style on the same sentence: currency code, thousands separator, numerals, US spelling, straight quotes, hyphen for dash, percent sign, date format, Oxford comma. These do not change what is asserted.

Do not follow a suggestedDirection that deletes evaluative language, neutralises a causal verb, removes a hedge, or substitutes a different fact. Those change the claim. Kind "soften" and overreach_unsupported_causal stay under the silence rule: flag, do not edit.
```

Preamble L1086, retargeted: "Removing unsupported PRECISION. NO LONGER DONE. An evidence gap with a SILENT source is flagged and the CLAIM is never edited. Rule (b). Grammar and voice named there may still follow a craft direction."

Concerns fallback L654, retargeted: "the source is silent, so keep the claim as written and flag it. A named voice or grammar direction on this statement is still followed."

### Live verbs, from the rule set and the fixtures, not from a guess

The four Review fixtures actually fire these editorial rules:

```
voice_consistency              r10-review1 S1,S7; r10-review2 S1,S7; condition-b S1,S7,S8
first_person_plural            r10-review1 S8
marketing_language_excess      r10-review1 S1; condition-b S1; coverage-gap S3
overreach_unsupported_causal   r10-review1 S3; coverage-gap S5
structural_integrity           r10-review2 S3
```

`lib/rulebook/editorialRules.js` plus `lib/qc/first-person-actor.mjs` L84-109 is the voice contract already shipped: replace the pronoun with the named organisation as grammatical subject; never delete the actor; never recast agentless or passive; preserve every hedge and modal. Copy those verbs. Do not invent "style-only".

`underreach_hedging` is skipped by `collectEditorialConcerns` L374. It never reaches the reviser. Do not put hedge-deletion in the carve-out.

`marketing_language_excess` is kind "soften", not craft. Deleting "genuinely exceptional" changes what is claimed. Out.

`overreach_unsupported_causal` changes a causal claim into a weaker one. Out. coverage-gap S5 is not a primary for this carve-out.

Rules in the book that the fixtures do not show (sentence_length, passive_voice_overuse, register_mismatch, cliche_and_filler, jargon): do not permit them on silent cards in the first build. Splitting a sentence or recasting passive can change what is asserted. Gate them later or not at all.

## B3. The dangerous edge

```
"We believe X"  ->  "Halden Group believes X"    VOICE. Permitted.
"We believe X"  ->  "X"                          CLAIM. Forbidden.
```

The proposed wording keeps the second out by naming it: "Never X. Never is believed. Never is recommended. The actor stays." That is the same contract `FIRST_PERSON_ACTOR_INSTRUCTION` already uses (`lib/qc/first-person-actor.mjs` L87-107). Prompt-only cannot guarantee it. A model that reads "leave the claim" as "drop the hedge frame" will still strip. I cannot handle this with certainty in the prompt. Say so plainly.

What CAN handle it is the gate. The existing scorer (`directive-follow-scorer.mjs`) on a replace direction requires the destination present. r10-review1 S7 destination is `'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'`. Stripping to the bare proposition fails PRIMARY even if first person is gone. That is the keep-out. Use it. Do not score "first person disappeared".

Hedges that carry meaning (`may`, `could`, `we expect` / `expects`, `should`, `broadly`): the line is the first-person-actor line already shipped. Only the pronoun changes. Deleting `expects` on r10-review1 S9 (`Halden Group expects the relationship to deepen...`) is a claim edit, forbidden, and S9 is the blocking control. `underreach_hedging` does not reach the reviser.

If the gate cannot distinguish "Halden Group believes X" from "X", do not ship. That failure is worse than leaving the closer in the first person.

## B4. Gate

Do not invent probe material. Fixtures already carry it.

```
PRIMARY   r10-review1 S7 voice_consistency. Stored 0 of 3, all three seeds byte-identical to original
          (`b122-rescore.json`). Must move to 3 of 3 under directive-follow-scorer.mjs.
LOCK      condition-b S7 voice_consistency. Identical sentence, supportState supported, 3 of 3.
          Must stay 3 of 3.
BLOCKING  r10-review1 S9 and r10-review2 S9.
          Text: "Halden Group expects the relationship to deepen over the life of the fund."
          supportState not_supported. No editorial concern. CONFIRMED held verbatim on all six
          stored seeds in b122-rescore.json (S9orig true). These prove silence still holds on
          a factual claim with no craft direction. A fixture gap does not exist for this shape.
```

coverage-gap S5 is mixed unsupported plus causal-overreach. It is not a blocking control for this carve-out. If it moves, that is a leak of claim-editing, not a voice win. Watch it; do not make it PRIMARY.

Control eight from `b122-rescore.md` C5 must still hold (including condition-b S7). Score with `directive-follow-scorer.mjs`, not the old sweep scorer.

Design:

```
two arms, one process: reference (live prompt) and carve-out (amended definition)
fixtures: r10-review1, r10-review2, condition-b. Three seeds each. 18 calls.
print each prompt variant's length and hash so the arms are proved different
PRIMARY / LOCK / BLOCKING scored on stored original vs new revisedStatement
```

Cost: the 2026-08-30 Suggest-only run of 12 calls was $0.0960 (`b122-rescore.md`). Eighteen calls of the same shape is about $0.14. Twelve calls (drop r10-review2, keep one S9 on r10-review1) is the same $0.096. I would pay the extra six for a second blocking S9. If a number comes in far above $0.20, the harness is billing Review or Stage 1 and should stop.

## B5. Critique

### 5a. Check before this runs

```
S9 is still byte-identical on the reference arm before the carve-out arm is judged. Already true on disk; reconfirm in-process.
The scorer destination for S7 requires "Halden Group believes", not merely the absence of "we believe".
condition-b S7 remains supported in the fixture. If a later Review flip makes it not_supported, the lock dies (see B118).
Do not include r10-review1 S1 as a pass condition. Those two directions still contradict (B131).
Do not include r10-review2 S7 as a pass condition. Following it duplicates the subject (B132). A follow-rate hit there is a Review miss.
tests/build-revision-prompt.test.mjs L928-939 will fail when rule (b) is amended. Update the regex to the new definition in the same build, or the unit gate is a false fail.
Print prompt length and hash per arm.
```

### 5b. What I would expect to fail

The PRIMARY can fail by no-op (definitional absorption if copies 2 and 6 are left standing) or by stripping the actor (dangerous edge). LOCK should hold; it already does without a carve-out. BLOCKING S9 should hold; the risk is house-style "ENTIRE revised draft must comply" plus a loose carve-out deleting `expects`. coverage-gap S5 may flap 1 of 3 as it does today; do not read that as the carve-out working.

### 5c. Cheaper alternative

Solving it only in Review, by not raising a craft concern on a card that silence will not act on, does not produce the stated user outcome. The user outcome is: a first-person closer gets rewritten into the firm's voice. Suppressing the Review flag leaves the closer in the first person and only stops a dishonest flag. That is worth doing as hygiene (**B132** is a version of it), and it is cheaper, and it does not carve a eight-day-old governing rule. It is a different product. For the outcome Ben named, the reviser has to be allowed to change the subject. Review-side suppression is complementary, not a substitute.

I would still ship **B132** first or in parallel: stop tagging a sentence that is already third-person. That is a Review fix with no silence-rule risk.

### 5d. Should this ship at all?

Ben has decided the direction. The distinction (claims vs grammar/voice) is right. Silence-never-edits was shipped to stop inventing facts from a quiet source, not to freeze first-person pronouns. Carving eight days later is not a reversal of that principle if the wording is tight.

The execution is the risk. An appended exception will lose to the definition. Abstract wording will do nothing. A carve-out that lets `We believe X` become `X` is worse than the defect. I would not ship on prompt faith. I would ship only if PRIMARY is 3 of 3 with the actor kept, LOCK holds, and both S9s stay verbatim.

If those three cannot be shown in one process, do not ship. Leaving the closer flagged and first-person is honest. An unattributed recommendation in a compliance document is not.

Disagree with treating the carve-out as small. It amends the governing definition of kind "unsupported". That is the right layer, and it is not a one-line footnote.

## Files read, not modified (Part B)

```
lib/build-revision-prompt.mjs
lib/revise-stage1.mjs
lib/revise-stage1-prompt.mjs
api/suggest-revision.js
lib/qc/first-person-actor.mjs
lib/rulebook/editorialRules.js
lib/rulebook/styleGuide.js
tests/build-revision-prompt.test.mjs
tests/stage2-b48-calibration.test.mjs
scripts/diagnostic/revise/b122-rescore.json
the four Review fixtures
```

Model calls: 0.
Implementation: none.
