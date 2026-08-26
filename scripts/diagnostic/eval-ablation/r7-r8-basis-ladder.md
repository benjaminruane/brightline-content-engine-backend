# R7 / R8 basis ladder

Harness only. Live `stage2_v4.md` was not edited in this pass.
Part 1 fixture: `93_adversarial_realised_vs_mark` (Halden Group).

## Scoreboard

```
arm  both PRIMARYs  F93_S1 ctrl  five holds  F19 hold  indep holds  verdict
R3a  no               yes         yes         yes      yes         reference
R7   yes              yes         yes         yes      yes         CONFIRM
R8   yes              yes         yes         yes      yes         CONFIRM
```

## Stopping rule (written before the run)

CONFIRM An arm meets both PRIMARYs, the fixture CONTROL, and every HOLD. If both qualify, recommend one. Neither ships in this pass.
KILL Any of the five shipped fixes returns to confirmed on >=2/3, or the fixture control breaks (overreach). Report, STOP, quote the reasoning. Do not write a third wording.
PARTIAL A primary missed with all HOLDs intact. Quote the EA_E3 explanations in full. If it again names the basis and confirms anyway, the next move is the code backstop, not more prose.

## Verdict

R7: **CONFIRM** - Both PRIMARYs, fixture CONTROL, and every HOLD met. Ship CANDIDATE. Does not ship in this pass.
R8: **CONFIRM** - Both PRIMARYs, fixture CONTROL, and every HOLD met. Ship CANDIDATE. Does not ship in this pass.

## Prompt arms

```
R3a (live / reference)  len=12812  sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R7  (harness only)      len=13670  sha256=eec68571fffa1f7aeab1995ac57a8262c4f0b382882f852644e052dd69878de7
R8  (harness only)      len=13302  sha256=490e132f6b82789f292e2f70ab699dd04dd105e4fbf0c212998ab180d03fb2bf
```

CONFIRMED: all three hashes differ.

### R7 wording (verbatim four-site amendment)

Chosen verbs: returned, realised, distributed against marked at, valued at, carried at, unrealised.
Why: R5 lost by staying abstract; R3a beat R3b by naming duration/tenure; live exhibit is returned vs marked at.
Distributed is included because it is a realised-cash cousin in PE copy; valued at / carried at cover mark synonyms.
L27 modality list untouched.
No fifth abstract Frame sentence.

L23 (verbatim):
```
• "confirmed" - on a like-for-like basis (same metric, same frame, same entity-role, same basis), the source states the same substance as the statement, including paraphrase, formatting, correct rounding. Paraphrase does not cover a basis swap: returned, realised or distributed versus marked at, valued at, carried at or unrealised is not like-for-like.
```

L25 (verbatim):
```
• "partially_confirmed" - the source supports part of the statement AND the draft asserts an additional checkable claim the source does not cover, OR the draft is genuinely broader in scope, OR there is a frame/period-role mismatch (vintage vs operating year; revenue vs GMV; returned, realised or distributed versus marked at, valued at, carried at or unrealised), OR the source confirms some facts and is silent on others.
```

L31 (verbatim):
```
Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed. That carve-out does not apply where the statement uses a realised performance verb (returned, realised, distributed) and the source uses mark, valuation or estimate language (marked at, valued at, carried at, unrealised) for the same figure.
```

Example 3d (verbatim):
```
3d) Realised versus mark -> partially_confirmed
Statement: 'Fund IV has returned 1.9 times gross MOIC.'
Source: 'Fund IV is currently marked at 1.9 times gross MOIC.'
Correct classification: partially_confirmed
Reasoning: The figure matches. The statement presents it as returned; the source presents it as a current mark. That is a basis mismatch, not paraphrase.
```

Note: report quotes replace the live prompt's em dash after classification labels with ASCII "-" (report constraint). Prompt arms on disk retain live punctuation.

Cost: $2.7073. Cache OFF. Model openai/gpt-4o. seed=1.
Unique statements: 25 (23 graded set including eval-ablation EA_E3, plus F93_S0 and F93_S1).
EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian; not claim-spans CS_E3; not corpus E3:S0:ic_memo).
F93 source: scripts/diagnostic/sources/93_adversarial_realised_vs_mark.txt (Halden Group invented).

## PRIMARY EA_E3 off confirmed >=2/3

```
EA_E3  R3a conf/conf/conf  R7 part/part/part ok=true  R8 part/part/part ok=true
```

## PRIMARY F93_S0 mark-swap off confirmed >=2/3

```
F93_S0  R3a confl/confl/confl  R7 part/part/part ok=true  R8 part/part/part ok=true
```

Note on F93_S0 under R3a: already off confirmed (conflicting x3), with explanations that already name mark versus returned. So the F93 PRIMARY "off confirmed" gate is partly vacuous against the reference arm; the real false-green exhibit remains eval-ablation EA_E3 (conf x3 on R3a). CONFIRMED: R7/R8 move F93_S0 from conflicting to partially_confirmed, which matches the fixture expected label and the worked example.

## CONTROL F93_S1 honest mark stays confirmed >=2/3

```
F93_S1  R3a conf/conf/conf  R7 conf/conf/conf ok=true  R8 conf/conf/conf ok=true
```

## HOLD false greens off confirmed >=2/3

```
EA_E2  R3a part/part/part  R7 part/part/part ok=true  R8 part/part/part ok=true
CS_E3  R3a part/part/part  R7 part/part/part ok=true  R8 part/part/part ok=true
F01_S10  R3a part/part/part  R7 part/part/part ok=true  R8 part/part/part ok=true
F04_S20  R3a part/part/part  R7 part/part/part ok=true  R8 part/part/part ok=true
F12_S0  R3a part/part/part  R7 part/part/conf ok=true  R8 part/part/part ok=true
falseGreenHold R7=true R8=true
```

## HOLD F19_S7 partially_confirmed >=2/3

```
F19_S7  R3a part/part/part  R7 part/part/part ok=true  R8 part/part/part ok=true
```

## HOLD independent controls vs R3a majority (includes F92_S0)

```
F18_S6  r3aMaj=part  R3a part/part/part  R7 part/part/part hold=true  R8 part/part/part hold=true
F90_S0  r3aMaj=nosup  R3a nosup/nosup/nosup  R7 nosup/nosup/nosup hold=true  R8 nosup/nosup/nosup hold=true
F92_S0  r3aMaj=conf  R3a conf/conf/conf  R7 conf/conf/conf hold=true  R8 conf/conf/conf hold=true
R7 independent breaks: none
R8 independent breaks: none
```

## PLANTED report (not scoreboard breaks); F04_S13 explicit

```
F04_S13  R3a part/conf/conf  R7 conf/part/conf  R8 conf/conf/conf
F01_S7 plant=PLANTED noise=false r3a=conf R7 part/conf/conf hold=true R8 conf/conf/conf hold=true
F04_S13 plant=PLANTED noise=false r3a=conf R7 conf/part/conf hold=true R8 conf/conf/conf hold=true
F04_S1 plant=PLANTED noise=false r3a=conf R7 conf/conf/conf hold=true R8 conf/conf/conf hold=true
F08_S0 plant=PLANTED noise=false r3a=conf R7 conf/conf/conf hold=true R8 conf/conf/conf hold=true
F14_S4 plant=PLANTED noise=false r3a=part R7 part/part/part hold=true R8 part/part/part hold=true
F12_S1 plant=PLANTED noise=false r3a=part R7 part/part/part hold=true R8 part/part/part hold=true
F14_S11 plant=PLANTED noise=false r3a=part R7 part/part/part hold=true R8 part/part/part hold=true
F15_S2 plant=PLANTED noise=false r3a=confl R7 confl/confl/confl hold=true R8 confl/confl/confl hold=true
F05_S5 plant=PLANTED noise=false r3a=confl R7 confl/confl/confl hold=true R8 confl/confl/confl hold=true
F17_S9 plant=PLANTED noise=false r3a=confl R7 part/confl/confl hold=true R8 confl/confl/confl hold=true
F08_S2 plant=PLANTED noise=true r3a=part R7 confl/confl/confl hold=false R8 confl/confl/confl hold=false
F01_S11 plant=PLANTED noise=false r3a=nosup R7 nosup/nosup/nosup hold=true R8 nosup/nosup/nosup hold=true
```

## R8 only: ranking shape (EA_E1) after removing example 3c

```
EA_E1  R3a part/part/part  R7 part/part/part  R8 part/part/part
```
R8 vs R3a majority on EA_E1: partially_confirmed -> partially_confirmed (no move).

## EA_E3 explanations

### R3a EA_E3 run 1: confirmed

```
The source confirms the statement by stating that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the figures in the statement.
```

Basis-related words: marked, mark.

### R3a EA_E3 run 2: confirmed

```
The source confirms the statement by stating that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the figures in the statement.
```

Basis-related words: marked, mark.

### R3a EA_E3 run 3: confirmed

```
The source confirms the statement by stating that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the figures in the statement.
```

Basis-related words: marked, mark.

### R7 EA_E3 run 1: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as returned figures. This is a basis mismatch, not a paraphrase.
```

Basis-related words: mark, current, returned, basis.

### R7 EA_E3 run 2: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as returned figures. This is a basis mismatch, as the statement presents them as returned.
```

Basis-related words: mark, current, returned, basis.

### R7 EA_E3 run 3: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as returned figures. This is a basis mismatch, not a paraphrase.
```

Basis-related words: mark, current, returned, basis.

### R8 EA_E3 run 1: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as realised returns. This is a basis mismatch, leading to partial confirmation.
```

Basis-related words: mark, current, realised, basis.

### R8 EA_E3 run 2: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as realised returns. This is a basis mismatch, leading to partial confirmation.
```

Basis-related words: mark, current, realised, basis.

### R8 EA_E3 run 3: partially_confirmed

```
The source confirms the 1.9x gross MOIC and 24% gross IRR figures but states them as current marks, not as realised returns. This is a basis mismatch, leading to partial confirmation.
```

Basis-related words: mark, current, realised, basis.

## F93_S0 explanations

### R3a F93_S0 run 1: conflicting

```
The statement claims Fund IV has returned 1.9x gross MOIC and a 24% gross IRR, implying realised returns. The source states these figures are current marks, not realised returns, creating a conflict.
```

### R3a F93_S0 run 2: conflicting

```
The statement claims Fund IV has returned 1.9x gross MOIC and a 24% gross IRR, implying actual capital returned. The source indicates these figures are current marks, not realised returns, creating a conflict.
```

### R3a F93_S0 run 3: conflicting

```
The statement claims Fund IV has returned 1.9x gross MOIC and a 24% gross IRR, implying realised returns. The source states these figures are current marks, not realised returns, creating a conflict.
```

### R7 F93_S0 run 1: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, while the statement claims these figures as returned. This is a basis mismatch between marked and returned.
```

### R7 F93_S0 run 2: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, whereas the statement claims these figures as returned. This is a basis mismatch between marked and returned.
```

### R7 F93_S0 run 3: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, whereas the statement claims these figures as returned. This is a basis mismatch between marked and returned.
```

### R8 F93_S0 run 1: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, whereas the statement claims these figures as returned. This is a basis mismatch between marked and returned, leading to partial confirmation.
```

### R8 F93_S0 run 2: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, while the statement claims these figures as returned. This is a basis mismatch between marked and returned.
```

### R8 F93_S0 run 3: partially_confirmed

```
The source states that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, whereas the statement claims these figures as returned. This is a basis mismatch between realised and marked figures.
```

## What the model thought it was doing

Both PRIMARYs met on both measured arms (see scoreboard).

## Recommendation

Both R7 and R8 CONFIRM. Prefer **R7**. EA_E1 stayed partial on all three arms after removing 3c, so R8 bought nothing for the ranking shape on this run. R7 keeps the ranking example and lands the basis rule. Neither ships in this pass; stop for Ben's decision.

## Opinion

The four-site amendment is worded well enough: the model now says "basis mismatch, not a paraphrase" on EA_E3 (R7) instead of confirming while naming marked. That is the failure mode R5 hit, fixed. Naming the live verbs mattered.

Removing 3c was worth measuring once. On this run it was unnecessary for the primary and did not move EA_E1. Prefer keeping 3c.

Until fixture 93 appears in the corpus baseline (364-pair R3a blast), any claim that the corpus is clean on basis mismatches remains vacuous for corpus-wide blast checks. The fixture exists; it is not yet in that baseline.

Fixture id assigned: **93** (`adversarial_realised_vs_mark`), next after adversarial 90-92. Precedent: fixture 90 (planted fault + honest control in one invented Halden/synthetic adversarial fixture).

## Technical summary

Harness arms R7/R8 built from R3a without editing live stage2_v4.md. Measured 25 statements x 3 arms x 3 runs. Rows in r7-r8-basis-ladder-rows.json.

## Plain-language summary

This pass tests whether naming realised-versus-mark in the definitions stops Review putting a green tick on a draft that turns a paper valuation into money returned, while still confirming an honest current-mark sentence.
