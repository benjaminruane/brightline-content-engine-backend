# B122 residual adjudication

Instrument only. Zero model calls. Stored drafts from `b122-rescore.json`. Suggest was not re-run.

Harness for Part 3: `b122-contradiction-count.mjs`.

## Scoreboard

```
contradiction on r10-review1 S1: CONFIRMED. The two directions cannot both be followed literally.
Part 3: 1 of 2 multi-directive statements is a contradiction (1 of 36 statements in the Review corpus).
B122 verdict: CLOSE. Split Review items. The original 70% follow gap was a scorer artefact, a Review contradiction, a bad Review directive, and a silence-versus-craft collision that is explained.
```

## PART 0

0a CONFIRMED. `b122-rescore.json` `scoreRows` holds `revisedStatement` for every failing directive on seeds 1, 2 and 3, and `runs` holds `revisedDraft` for all four fixtures on all three seeds.

```
r10-review1 S1 marketing_language_excess   seeds 1,2,3  revisedStatement present
r10-review1 S1 voice_consistency           seeds 1,2,3  same three statements
r10-review1 S7 voice_consistency           seeds 1,2,3  revisedStatement present
coverage-gap S5 overreach_unsupported_causal seeds 1,2,3  revisedStatement present
```

Nothing missing. Did not stop.

0b CONFIRMED. The two r10-review1 S1 directions are mutually exclusive if taken literally. The voice replacement contains the marketing delete target. A single sentence cannot satisfy both. The rest of this pass keeps that shape.

## PART 1. The contradiction

Directions, verbatim, from `suggest-after-r10-review1.json` statement 1 `editorialConcerns`:

```
marketing_language_excess:
Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.

voice_consistency:
Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.
```

Original:

```
We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
```

Three stored revisions (`b122-rescore.json` scoreRows, all three seeds identical):

```
seed 1: Halden Group was attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
seed 2: Halden Group was attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
seed 3: Halden Group was attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
```

### 1a. Can any single sentence satisfy both literally?

No.

The marketing direction requires `genuinely exceptional` to be absent. The voice direction requires the sentence to become `Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional`, which contains `genuinely exceptional`. CONFIRMED by reading both `suggestedDirection` strings. There is no string that both lacks that phrase and equals that replacement.

A union that an editor might want (`Halden Group was attracted to Meridian on the strength of a track record.`) satisfies marketing and the voice *intent* (third-person subject, drop `in our view`) but fails the voice direction as written. That is still a contradiction in the Review output, not a Suggest failure to invent a third instruction.

### 1b. What did the reviser produce?

All three seeds: first person became Halden Group. `in our view` and `genuinely exceptional` stayed.

As an editor, that is a good revision of the original sentence. The voice problem is the one a reader hits first. The sentence is still grammatical and still says what the author said about the track record. It is not a no-op. It is not a broken rewrite.

It is not a literal follow of either direction. Marketing is not done. Voice is only half-done (`We` became `Halden Group`, but `in our view` remains, so the quoted destination is absent). Given two instructions that cannot both be executed, keeping substance and fixing the subject is the conservative choice.

### 1c. Review defect, not Suggest

These six misses are a Review defect (contradictory directives on one statement), not a Suggest defect.

CONFIRMED by the control on the same original sentence. `condition-b-review.json` S1 carries the same draft text with *compatible* directions (replace `We were attracted` with `Halden Group was attracted` and delete `in our view`; separately delete `genuinely exceptional`). Stored revisions there, all three seeds:

```
Halden Group was attracted to Meridian on the strength of a track record that is exceptional.
```

Suggest did both jobs when Review did not contradict itself. The r10-review1 S1 pair is the one that cannot be satisfied. Do not keep those six cells as a Suggest quality gap.

## PART 2. The other two

### 2a. r10-review1 S7 voice_consistency, 0 of 3

Direction, verbatim, `suggest-after-r10-review1.json` statement 7:

```
Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.
```

Original and all three stored revisions (`b122-rescore.json` scoreRows seeds 1-3):

```
On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.
```

The reviser did not make the voice change in substance. The sentence is unchanged. This is a real miss, not a scorer-versus-intent gap.

It is also explained. The same sentence on `condition-b-review.json` S7 is `supportState: supported` and was followed 3 of 3 (control). On r10-review1 S7 it is `supportState: not_supported`, and kind "unsupported" in the whole-draft prompt tells the model to leave silent wording exactly as written. CONFIRMED: fixture cards, plus `lib/build-revision-prompt.mjs` kind handling (b) for unsupported silence. Craft `suggestedDirection` is on the same concern block and lost.

This is not an unexplained ignore. It is silence-never-edits beating a craft directive on a mixed card. Stored August 29 flags were 1 of 3 whole-draft on this row; this run is 0 of 3. That is noise around a rule that usually wins, not a new mystery.

### 2b. coverage-gap S5 overreach_unsupported_causal, 1 of 3

Direction, verbatim, `coverage-gap-review.json` statement 5:

```
Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.
```

Stored revisions (`b122-rescore.json`):

```
seed 1: This relationship supported the diligence process.
seed 2: This relationship enabled deep insight during the diligence phase.
seed 3: This relationship enabled deep insight during the diligence phase.
```

The pass versus the misses is substantive, not cosmetic. Seed 1 dropped the causal "enabled deep insight" claim. Seeds 2 and 3 are no-ops, identical to the original.

Why it flaps: the destination is unquoted ("a more neutral statement"), so there is no single required string, and the parent card is `not_supported` with empty `unsupportedSpans`. The same silence rule as 2a applies. Seed 1 overrode it; 2 and 3 did not. Temperature 0 still flaps here because the instruction is underspecified and the evidence rule says do nothing. HYPOTHESIS: not a second independent bug. Same mixed-card collision as 2a, with a vaguer editorial line.

## PART 3. Size of the contradiction

`b122-contradiction-count.mjs` over every `*review*.json` in `scripts/diagnostic/revise/` (the only Review artefacts on disk).

```
Review files: 4
statements: 36
statements with 2+ directed editorial concerns: 2
contradictions: 1 of 2
```

The hit is r10-review1 S1: replacement contains delete target `genuinely exceptional`; delete span [86,107] overlaps voice replace-src [0,107].

The other multi-directive statement is condition-b S1, compatible. Same original sentence, different Review wording, no contradiction, and Suggest followed it.

r10-review1 S1 is a one-off in this corpus, not a pattern of many colliding pairs. It is still enough to manufacture six Suggest "misses" from one bad Review card.

## PART 4. Verdict on B122

### 4a

There is no real, unexplained Suggest defect left in the B122 row as it was opened ("an editorial instruction that names an exact span is followed about 70% of the time, cause unknown").

What remains is explained:

```
structural_integrity          followed 3/3; old 0/3 was the scorer
r10-review2 S7 voice          followed as written; duplicate Halden Group; Review defect
r10-review1 S1 both           contradiction; Review defect; reviser made the sensible voice-only edit
r10-review1 S7 voice          real miss; silence-never-edits vs craft on an unsupported card
coverage-gap S5               1/3; same silence collision plus an unquoted destination; run-to-run
```

The control eight stayed 3 of 3. Directives that can be followed, and that do not collide with silence-never-edits, are followed.

### 4b

If a Suggest item remains at all, it is not B122. It is: on a mixed unsupported-plus-craft card, the silence rule can suppress a named editorial span. Cheapest next probe is already on disk: r10-review1 S7 versus condition-b S7, identical sentence, different evidence verdict, opposite follow. No billed run required.

I would not probe that until someone decides that voice edits on unsupported author sentences are supposed to happen. That is a policy question. Silence-never-edits was shipped as a governing rule. Treating its victory over craft as an unexplained miss would reopen a closed decision.

### 4c

Close B122.

Split, do not keep the row alive out of caution:

```
Review: contradictory suggestedDirection pair on one statement (r10-review1 S1).
Review: voice_consistency on a sentence that is already third-person Halden Group (r10-review2 S7).
Review (optional, already sized): note_quote apostrophe truncation, 1 of 17, cosmetic for Suggest.
Suggest: do not open a new follow-rate item. Optional later item only if product wants craft to outrank silence on mixed cards.
```

Disagree with keeping B122 open because four residual cells still miss. Those cells are accounted for. A follow-rate target that includes contradictory Review output and a scorer that could not register a success was never a Suggest quality number.

## Files

- `scripts/diagnostic/revise/b122-residual-adjudication.md` this report
- `scripts/diagnostic/revise/b122-contradiction-count.mjs` Part 3 harness
- Reads, does not modify: `b122-rescore.json`, the four Review fixtures, `directive-follow-scorer.mjs`

Model calls: 0.
