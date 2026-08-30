# B122 whole-draft re-score

Instrument. Bills the revision call only. Review artefacts reused. Per-statement not run.
Harness `b122-rescore.mjs`. Artefact `b122-rescore.json` (revisedDraft per fixture per seed).

## Scoreboard

```
Part A: PASS  34/34 assertions (28 follow/no-op + regressions + shape checks)
Part C arm: whole-draft only, 4 fixtures x 3 seeds = 12 calls
control (8 always-followed): HELD under new scorer
headline 13-dir (exclude r10-review2 S7, include SI): new 28 of 39   old-scorer-on-same-text 28 of 39
12-dir (exclude S7 and SI) as the spec's 29-of-36 set: new 25 of 36
stored flags on 12-dir were 29 of 36
spend estimated $0.31-$0.43  actual $0.0960
wall-clock 51.4s
```

## PART 0 recap, marked

0a CONFIRMED: Suggest-only re-run is possible from the four Review fixtures. Entry point used here: `gatherConcerns` + `buildRevisionPrompt` + `callLLM` + `finalizeSuggestRevisionText`, the same whole-draft path as `author-confusion-sweep.mjs` L501-516 and production `api/suggest-revision.js` L143-197 (stage 1 gated off). Review was not re-run.

0b CONFIRMED: whole-draft is seedable. This harness passes `seed` 1, 2, 3 at temperature 0 to `callLLM`, matching `author-confusion-sweep.mjs` L506-511.

0c CONFIRMED: per-statement is off in production. `api/suggest-revision.js` L176 `if (body.perStatementRevise === true)`. Frontend grep for `perStatementRevise` is empty (`scripts/diagnostic/backend-census.md`). Dropping the arm loses nothing live. B130 is abandoned.

0d Spec errors:
- C7 says a 12-directive denominator excluding S7 and including SI. 14 minus S7 is 13, which is 39 observations, not 36. This report uses 13 as the headline and also prints 12 (exclude S7 and SI) so it can be compared to the stored 29 of 36.
- Stored 29 of 36 is the old flags with SI and S7 both dropped (they were 0/3). Including SI in the new headline without including it in the 29/36 comparison mixes denominators. Both are shown.

## Pre-flight

```
CONTROL on this run: all 8 followed 3/3 under the new scorer
old scorer on the same control text: all 8 3/3
BASELINE running three times: yes, seeds 1 2 3
vacuous gate: none named. Control is 8 directives that were 3/3 on the 2026-08-29 sweep, re-checked here.
PLANTED cell: r10-review2 S7 excluded from headline, reported in C6b
pass condition on more than one exhibit: 13 directives x 3 seeds
stopping rule: Part A unit gate confirmed (34/34) before this run; control can kill the headline
scorer can register a success: Part A FOLLOW cases all scored followed
unjudged: false
```

## C5. Control first

```
suggest-after-r10-review1 S3 overreach_unsupported_causal  old 3/3  new 3/3
suggest-after-r10-review1 S8 first_person_plural  old 3/3  new 3/3
suggest-after-r10-review2 S1 voice_consistency  old 3/3  new 3/3
condition-b-review S1 marketing_language_excess  old 3/3  new 3/3
condition-b-review S1 voice_consistency  old 3/3  new 3/3
condition-b-review S7 voice_consistency  old 3/3  new 3/3
condition-b-review S8 voice_consistency  old 3/3  new 3/3
coverage-gap-review S3 marketing_language_excess  old 3/3  new 3/3
```

CONFIRMED: all eight always-followed directives stayed 3/3 under the new scorer. The instrument is not the thing that moved.

## C4. Per directive, both scorers

```
suggest-after-r10-review1 S1 marketing_language_excess  [delete row]  old 0/3  new 0/3  disagree 0/3
suggest-after-r10-review1 S1 voice_consistency  [replace row]  old 3/3  new 0/3  disagree 3/3
suggest-after-r10-review1 S3 overreach_unsupported_causal  [replace CONTROL]  old 3/3  new 3/3  disagree 0/3
suggest-after-r10-review1 S7 voice_consistency  [replace row]  old 0/3  new 0/3  disagree 0/3
suggest-after-r10-review1 S8 first_person_plural  [replace CONTROL]  old 3/3  new 3/3  disagree 0/3
suggest-after-r10-review2 S1 voice_consistency  [replace CONTROL]  old 3/3  new 3/3  disagree 0/3
suggest-after-r10-review2 S3 structural_integrity  [rewrite_example SI]  old 0/3  new 3/3  disagree 3/3
suggest-after-r10-review2 S7 voice_consistency  [replace BAD-DIRECTIVE]  old 0/3  new 3/3  disagree 3/3
condition-b-review S1 marketing_language_excess  [delete CONTROL]  old 3/3  new 3/3  disagree 0/3
condition-b-review S1 voice_consistency  [replace_and_delete CONTROL]  old 3/3  new 3/3  disagree 0/3
condition-b-review S7 voice_consistency  [replace CONTROL]  old 3/3  new 3/3  disagree 0/3
condition-b-review S8 voice_consistency  [replace CONTROL]  old 3/3  new 3/3  disagree 0/3
coverage-gap-review S3 marketing_language_excess  [delete CONTROL]  old 3/3  new 3/3  disagree 0/3
coverage-gap-review S5 overreach_unsupported_causal  [replace_unquoted row]  old 1/3  new 1/3  disagree 0/3
```

Disagreements (old vs new on the same revised statement):

```
suggest-after-r10-review1 S1 voice_consistency seed 1  old=true new=false  reason=replace destination absent
suggest-after-r10-review1 S1 voice_consistency seed 2  old=true new=false  reason=replace destination absent
suggest-after-r10-review1 S1 voice_consistency seed 3  old=true new=false  reason=replace destination absent
suggest-after-r10-review2 S3 structural_integrity seed 1  old=false new=true  reason=rewrite example present
suggest-after-r10-review2 S7 voice_consistency seed 1  old=false new=true  reason=replace destination present and source gone outside it
suggest-after-r10-review2 S3 structural_integrity seed 2  old=false new=true  reason=rewrite example present
suggest-after-r10-review2 S7 voice_consistency seed 2  old=false new=true  reason=replace destination present and source gone outside it
suggest-after-r10-review2 S3 structural_integrity seed 3  old=false new=true  reason=rewrite example present
suggest-after-r10-review2 S7 voice_consistency seed 3  old=false new=true  reason=replace destination present and source gone outside it
```

## C6a. structural_integrity revised statements, verbatim

```
seed 1  newFollowed=true  oldFollowed=false
The team's stability is demonstrated by no senior departures across the last three fund cycles.

seed 2  newFollowed=true  oldFollowed=false
The team's stability is demonstrated by no senior departures across the last three fund cycles.

seed 3  newFollowed=true  oldFollowed=false
The team's stability is demonstrated by no senior departures across the last three fund cycles.
```

## C6b. r10-review2 S7, the bad directive

Original: On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

Classes: ignore = unchanged; duplicate_subject = inserted a second Halden Group on recommends; other = changed some other way.

```
seed 1  class=duplicate_subject
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and Halden Group recommends the commitment.

seed 2  class=duplicate_subject
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and Halden Group recommends the commitment.

seed 3  class=duplicate_subject
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and Halden Group recommends the commitment.
```

This row is excluded from the headline. It is a Review defect: the note calls `recommends` first-person plural, which it is not.

## C7. Headline number

Spec asked for 12 directives. Arithmetic: 14 minus S7 is 13, including SI. Using 13.

```
new scorer, 13-dir x 3 seeds: 28 of 39
old scorer, same 13-dir text: 28 of 39
new scorer, 12-dir (no S7, no SI): 25 of 36
stored flags 2026-08-29 on 12-dir: 29 of 36
stored flags 2026-08-29 on 13-dir (SI counted as 0/3): 29 of 39
```

Judged. Compare the 13-dir new rate to 29 of 39 stored, not to 29 of 36, if SI is in the denominator.

## Reading, not in the spec

CONFIRMED: `structural_integrity` was followed on all three seeds, with the example rewrite used verbatim. The stored 0 of 3 was the old scorer truncating to `The team`. The reviser was not ignoring this instruction.

CONFIRMED: r10-review2 S7 was followed as written and produced a duplicate subject on all three seeds. That is worse than a miss. The scorer is allowed to call it a follow; the headline is not.

CONFIRMED: r10-review1 S1 `voice_consistency` is the other disagreement. The model wrote `Halden Group was attracted... that is, in our view, genuinely exceptional`. The required destination drops `in our view`. Old scorer called it a follow because the original `We were attracted...` span is gone. New scorer requires the destination. The new reading is the honest one: a partial voice fix, not a follow.

The 12-dir new rate 25 of 36 is below the stored 29 of 36. Control held, so that is run-to-run movement on the known weak rows (r10-review1 S1 marketing 0/3 here vs 1/3 stored; S7 voice 0/3 here vs 1/3 stored; coverage-gap S5 1/3 here vs 0/3 stored), plus the S1 voice reclassification. It is not the scorer inventing misses on the control.

I disagree with treating 28 of 39 as a quality win over 29 of 42. SI was never the gap. The remaining misses are real: a delete that was not done, a voice rewrite that was not done, a causal replace that landed 1 of 3, and a bad Review directive that Suggest executed faithfully.

## Spend

```
estimated $0.31 to $0.43
actual $0.0960
delta vs mid estimate $-0.2136
calls 12
elapsed 51.4s
```

## Files

- `scripts/diagnostic/revise/b122-rescore.mjs` this harness
- `scripts/diagnostic/revise/b122-rescore.md` this report
- `scripts/diagnostic/revise/b122-rescore.json` revisedDraft per fixture per seed, plus score rows. Spec did not name the json; it is here because C3 required a reusable artefact and markdown is not one.

Did not modify `author-confusion-sweep.mjs` or its JSON.
Ran at 2026-08-30T05:48:22.015Z. Model gpt-5.1-2025-11-13.
