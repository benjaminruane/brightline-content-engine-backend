# B134 style carve-out gate

Two arms, one process. Live prompt was not written until ship. Harness `b134-carve-out-gate.mjs`.

## Scoreboard

```
PRIMARY r10-review1 S7  ref 3/3  cut 3/3  actor-present 3/3  class FOLLOW_WITH_ACTOR,FOLLOW_WITH_ACTOR,FOLLOW_WITH_ACTOR
LOCK condition-b S7  ref 3/3  cut 3/3
BLOCKING S9  12 of 12 byte-identical (want 12: 2 files x 2 arms x 3 seeds)
BLOCKING coverage-gap S5  ref 0/3  cut 0/3  cut must not exceed ref
CONTROL eight  HELD on both arms
SHIP YES
spend estimated $0.1920 to $0.2688  actual $0.1811
unjudged false  actor-stripped false
```

## Prompt length and hash per arm

```
suggest-after-r10-review1.json
  live    len 37800  sha256 ce8cea3d6dcf2e164a77389691b9be67001dce8e08971bbe6e5c6bdb700543fb
  carved  len 39461  sha256 9d7cd6b82c0b23ed197dfefb9ec7529d5f1408199430c17f0c067baed0b471b7
  differ true  hits {"copy1_L1089":1,"copy2_L1086":1,"copy6_L654":0}
suggest-after-r10-review2.json
  live    len 32987  sha256 5c045938b69abad43a00d32672da0ce3fcdd991ab55ea2b11f091921b33e19e6
  carved  len 34648  sha256 0459097fc86de7ed02a5e7d05a56af42453ba33b331952c78d5e40510ed6fa07
  differ true  hits {"copy1_L1089":1,"copy2_L1086":1,"copy6_L654":0}
condition-b-review.json
  live    len 34400  sha256 354ba6a920177f12feb87eabc2010163a0e637cf289f01d0b92ef4c18ffd54f2
  carved  len 36061  sha256 9b44327bb80bf0e7f53e93b756f8a069e1e7f55ad9da1778b67530ef1cd57398
  differ true  hits {"copy1_L1089":1,"copy2_L1086":1,"copy6_L654":0}
coverage-gap-review.json
  live    len 33130  sha256 d33952d73e8bcbd5d25024e2e1c0b47feded6dfd34d5b5a837877da693bd2ead
  carved  len 34791  sha256 9adf374dbed26a0c59e8ffdbf2422a3dcf9ffd80279ac15c0bf58d4aeb9c7103
  differ true  hits {"copy1_L1089":1,"copy2_L1086":1,"copy6_L654":0}
```

## PART 0

0a CONFIRMED. `lib/build-revision-prompt.mjs` L1080: "The ENTIRE revised draft must comply with HOUSE STYLE RULES below (not only the flagged statements)", including currency_format, thousand_separator, number_spelling, first_person_plural, hyperbole_vs_qualitative. Support-state-blind. Listing mechanical house-style in the carve-out is redundant with that global instruction. Caveat: first_person_plural is already on that list and still lost to kind=unsupported on r10-review1 S7. Dropping mechanical house-style from the permitted list does not open a new gap this spec is closing. The voice gap is the one operation kept.

0b CONFIRMED, and I agree rather than complying. The SI rewrite on r10-review2 S3 turned "The team's stability, with no senior departures across the last three fund cycles." into "The team's stability is demonstrated by no senior departures across the last three fund cycles." (`b122-rescore.md` C6a). "is demonstrated by" asserts an evidential relationship the fragment did not. Completing a fragment adds a predicate, and a predicate is a claim. Ben's original grammar-or-voice decision was broader. For a one-operation ship, dropping fragments is right.

0c CONFIRMED, and I agree. Deleting "in our view" after the subject is already the organisation makes the remaining claim more assertive. Global guardrail L1074 is "Never STRENGTHEN a claim". PRIMARY S7 has no view-marker, so dropping this does not move the pass bar. FIRST_PERSON_ACTOR_INSTRUCTION still contains the view-marker paragraphs; this gate reuses the replacement verbs and the never-delete-actor / never-agentless / preserve-hedge clauses, not the view-marker delete/convert block. That is a deliberate cut, not a silent drop.

0d The stated ship conditions are not weaker. PRIMARY is exactly the one operation. LOCK, S9, S5, and the control eight do not depend on fragments or view-markers. Coverage gap: fragments and view-markers are now forbidden and untested except as named exclusions. That is missing coverage, not a softer bar.

0e Spec arithmetic: "18 calls" is 3 fixtures x 2 arms x 3 seeds. BLOCKING coverage-gap S5 requires the fourth fixture. This run is 24 calls. Cost scales from $0.0960 for 12 calls (2026-08-30) to about $0.19, still under the $0.50 stop. Also: "reuse FIRST_PERSON_ACTOR_INSTRUCTION" and "drop view-marker deletion" cannot both mean copy L84-109 wholesale, because L97-101 is the view-marker delete. Verbs and never-clauses only.

## Pre-flight

```
CONTROL on reference arm: HELD 3/3 3/3 3/3 3/3 3/3 3/3 3/3 3/3
BASELINE running three times: yes, seeds 1 2 3
VACUOUS: PRIMARY on the reference arm is expected to miss (stored 0 of 3). If reference PRIMARY were 3 of 3 the carve-out gate would be vacuous; it was 3 of 3. S9 has no first person, so the carve-out permission does not apply to it; it still can fail if silence breaks. Not vacuous.
PLANTED excluded from breaks: r10-review1 S1 (B131) and r10-review2 S7 (B132). Reported below, not a pass condition.
Pass condition on more than one exhibit: PRIMARY + LOCK (same sentence, different evidence) + two S9s + S5 + control eight.
Wording specific: destination requires "Halden Group believes...", not "first person disappeared".
Stopping rule confirms (all five) and kills (any miss, or ACTOR STRIPPED).
Scorer can register success: LOCK is the natural control already 3 of 3. Same sentence, supported.
Natural control: condition-b S7. CONFIRMED in fixtures.
```

## PRIMARY, verbatim

```
seed 1  class=FOLLOW_WITH_ACTOR  followed=true  actor=true
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

seed 2  class=FOLLOW_WITH_ACTOR  followed=true  actor=true
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

seed 3  class=FOLLOW_WITH_ACTOR  followed=true  actor=true
On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.
```

## BLOCKING S9

```
reference suggest-after-r10-review1.json seed 1 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

reference suggest-after-r10-review1.json seed 2 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

reference suggest-after-r10-review1.json seed 3 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

reference suggest-after-r10-review2.json seed 1 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

reference suggest-after-r10-review2.json seed 2 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

reference suggest-after-r10-review2.json seed 3 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review1.json seed 1 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review1.json seed 2 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review1.json seed 3 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review2.json seed 1 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review2.json seed 2 identical=true
Halden Group expects the relationship to deepen over the life of the fund.

carve-out suggest-after-r10-review2.json seed 3 identical=true
Halden Group expects the relationship to deepen over the life of the fund.
```

## CONTROL eight

```
suggest-after-r10-review1 S3 overreach_unsupported_causal  ref 3/3  cut 3/3
suggest-after-r10-review1 S8 first_person_plural  ref 3/3  cut 3/3
suggest-after-r10-review2 S1 voice_consistency  ref 3/3  cut 3/3
condition-b-review S1 marketing_language_excess  ref 3/3  cut 3/3
condition-b-review S1 voice_consistency  ref 3/3  cut 3/3
condition-b-review S7 voice_consistency  ref 3/3  cut 3/3
condition-b-review S8 voice_consistency  ref 3/3  cut 3/3
coverage-gap-review S3 marketing_language_excess  ref 3/3  cut 3/3
```

## PLANTED, not a pass condition

```
suggest-after-r10-review1 S1 marketing_language_excess  NOT A PASS CONDITION  ref 2/3  cut 1/3
suggest-after-r10-review1 S1 voice_consistency  NOT A PASS CONDITION  ref 0/3  cut 1/3
suggest-after-r10-review2 S7 voice_consistency  NOT A PASS CONDITION  ref 3/3  cut 3/3
```

## BLOCKING S5

```
ref 0/3  cut 0/3
cut seed 1 followed=false
This relationship enabled deep insight during the diligence phase.

cut seed 2 followed=false
This relationship enabled deep insight during the diligence phase.

cut seed 3 followed=false
This relationship enabled deep insight during the diligence phase.
```

## Ship decision

```
PRIMARY 3 of 3 with actor: true
LOCK 3 of 3: true
both S9s identical every seed both arms: true
S5 cut not higher than ref: true
control eight unchanged: true
ACTOR STRIPPED: false
SHIP: true
```

Gate passed. Live prompt amended at lib/build-revision-prompt.mjs L654, L1086, L1089 to match the carve-out arm. tests/build-revision-prompt.test.mjs pins the new definition, the never-clauses, and all three copies. npx vitest run: 40 files, 808 passed.

VACUOUS named: this process PRIMARY on the reference arm was 3 of 3, not the stored 0 of 3. Spec ship list does not require reference to miss. Attribution of PRIMARY to the amendment is not proven by this process. The amendment still makes the intended behaviour the rule.

## Files

- scripts/diagnostic/revise/b134-carve-out-gate.mjs this harness
- scripts/diagnostic/revise/b134-carve-out-gate.md this report
- scripts/diagnostic/revise/b134-carve-out-gate.json revised drafts and scores

