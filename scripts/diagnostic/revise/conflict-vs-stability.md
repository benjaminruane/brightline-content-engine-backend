# Conflict vs stability

Part 4. HYPOTHESIS: cells flap when the prompt gives competing instructions, and are stable when it does not. Free. No model calls. Harness `conflict-vs-stability.mjs`.

MOVE for the hypothesis is same-scorer follow-rate (b122-rescore new scorer vs b134 both arms). Sweep used the old quote-removal scorer and is printed, not used to call a cell MOVED. Scorer-artefact cells (r10-review2 S3 SI, r10-review2 S7 B132) are excluded from the test.

## Scoreboard

```
hypothesis: PARTLY
COMPETING n=6  follow-moved 4  follow-stable 2
CLEAN     n=6  follow-moved 0  follow-stable 6
```

Competing instructions are associated with movement. They are not sufficient. Clean cells did not move on follow-rate.

## 4a. Classification criteria

Built from the prompt's per-statement block (`### Statement [N]`), not from reading the fixture JSON as the source of truth. `gatherConcerns` plus `buildRevisionPrompt` produce that block. Global kind (b) is taken from the unamended definition for the disk runs ("LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN" / "do not rewrite the sentence"), because those runs predate `c0e1482`. HEAD's carve-out is reported as a second class so S7's reclassification is visible.

```
COMPETING if either:
  (1) two style directions on the same statement cannot both be satisfied
      (a Delete 'span' whose span appears in a sibling Replace destination)
  (2) evidence kind=unsupported, rule (b) forbids rewriting the sentence or
      the claim, and this directive is a rewrite of the sentence or the claim
CLEAN otherwise
```

HEAD carve-out reclassifies first-person-on-unsupported from COMPETING to CLEAN. The disk runs did not have that carve-out. Classification used for the cross-tab is the unamended one.

```
COMPETING  r10-review1 S1 marketing_language_excess     contradictory style (B131)
COMPETING  r10-review1 S1 voice_consistency             contradictory style (B131)
CLEAN      r10-review1 S3 overreach_unsupported_causal  partial, one craft dir
COMPETING  r10-review1 S7 voice_consistency             unsupported vs rewrite
CLEAN      r10-review1 S8 first_person_plural           partial, one style dir
CLEAN      r10-review2 S1 voice_consistency             no evidence gap
CLEAN      r10-review2 S3 structural_integrity          no evidence gap (SCORER)
COMPETING  r10-review2 S7 voice_consistency             unsupported vs rewrite (SCORER / B132)
COMPETING  condition-b S1 marketing_language_excess     contradictory style
COMPETING  condition-b S1 voice_consistency             contradictory style
CLEAN      condition-b S7 voice_consistency             supported, one style dir
CLEAN      condition-b S8 voice_consistency             supported, one style dir
CLEAN      coverage-gap S3 marketing_language_excess    no evidence gap
COMPETING  coverage-gap S5 overreach_unsupported_causal unsupported vs causal rewrite
```

CONFIRMED: r10-review1 S1 block carries both a Delete 'genuinely exceptional' and a Replace destination that contains 'genuinely exceptional'. condition-b S1 is the same shape. r10-review1 S7 block is `Evidence gap (no_support) [kind=unsupported]` plus a voice Replace. Prompt reconstruction at 6280e73 (`reference-arm-contradiction.md`) had rule (b) "do not rewrite the sentence".

## 4b. Cross-tab

```
MOVED  COMPETING r10-review1 S1 marketing     sweep 1/3  b122 0/3  b134-ref 2/3  b134-cut 1/3
MOVED  COMPETING r10-review1 S1 voice         sweep 3/3  b122 0/3  b134-ref 0/3  b134-cut 1/3
STABLE CLEAN     r10-review1 S3 overreach     3/3 3/3 3/3 3/3
MOVED  COMPETING r10-review1 S7 voice         sweep 1/3  b122 0/3  b134-ref 3/3  b134-cut 3/3
STABLE CLEAN     r10-review1 S8 first_person  3/3 3/3 3/3 3/3
STABLE CLEAN     r10-review2 S1 voice         3/3 3/3 3/3 3/3
SCORER CLEAN     r10-review2 S3 SI            sweep 0/3 then 3/3 under new scorer
SCORER COMPETING r10-review2 S7 voice         sweep 0/3 then 3/3 (B132 duplicate subject)
STABLE COMPETING condition-b S1 marketing     3/3 3/3 3/3 3/3
STABLE COMPETING condition-b S1 voice         3/3 3/3 3/3 3/3
STABLE CLEAN     condition-b S7 voice         3/3 3/3 3/3 3/3
STABLE CLEAN     condition-b S8 voice         3/3 3/3 3/3 3/3
STABLE CLEAN     coverage-gap S3 marketing    3/3 3/3 3/3 3/3
MOVED  COMPETING coverage-gap S5 overreach    sweep 0/3  b122 1/3  b134 0/3 0/3
```

CONFIRMED from `author-confusion-sweep.json` directiveRuns arm OLD, `b122-rescore.json` scoreRows newFollowed, `b134-carve-out-gate.json` scoreRows.

Prose-only, not a follow-rate move: condition-b S7 carve-out seed 1 kept "On balance," and the other five stored revisions of that cell dropped it. Follow remained 3 of 3. The hypothesis is about flap on the directive, not hedge wording.

## 4c. PARTLY

It does not fully hold. A refutation is a good outcome.

Breaks "competing implies flap":

```
condition-b S1 marketing_language_excess   COMPETING, 3 of 3 on every same-scorer run
condition-b S1 voice_consistency           COMPETING, 3 of 3 on every same-scorer run
```

Same contradictory pair as r10-review1 S1, which did flap. Difference: r10-review1 S1 is `evidenceKind=partial`. condition-b S1 has no evidence gap. Contradictory style alone did not flap. Contradictory style plus an evidence rule did.

Breaks "clean implies flap-free" on follow-rate: none, on this corpus, same scorer.

Supports the hypothesis:

```
r10-review1 S1 both dirs     COMPETING + partial, follow-rate moved
r10-review1 S7 voice         COMPETING silence vs rewrite, 0 of 3 then 3 of 3
coverage-gap S5 overreach    COMPETING silence vs causal rewrite, 1 of 3 then 0 of 3
every CLEAN same-scorer cell follow-stable
```

So: competing is a risk factor, not a law. The dangerous shape is competing instructions plus an evidence keep-and-flag, not two style dirs on a supported sentence.

## 4d. Stability floor, sketched not run

A single-process gate cannot see a flap across time. A floor has to be a calendar, not an A/B.

```
fixtures: the same four Review artefacts
calls: 4 fixtures x 3 seeds = 12 whole-draft Suggest calls per sample
sample: once per day for 7 days, or twice in one day 6 hours apart, then weekly
record: suggestCallRecord (fingerprint even if null, model, temp, seed, prompt sha, inputTokens, raw text)
score: directive-follow-scorer.mjs, split COMPETING vs CLEAN on the unamended or live definition, named
floor: CLEAN follow-rate variance across days. COMPETING cells are expected to move more.
stop: if CLEAN follow-rate on the control eight moves, the floor is the instrument, not the prompt
cost: about $0.10 per 12-call sample at the 2026-08-30 measured rate (~$0.008/call). Seven daily samples about $0.70. Ceiling for a week should be $1.
gpt-5.1 fingerprint is null today, so bucket by clock and prompt sha, not by fp. When fp starts populating, split the floor by fingerprint and do not compare across fingerprints.
```

Do not run it in this pass.

## Part 5, for the durable docs

See the session report. Short form: B134 is a coherence change, not a measured follow-rate lift. The only same-process comparison of the amendment was 3 of 3 vs 3 of 3.
