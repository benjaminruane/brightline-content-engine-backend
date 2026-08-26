# R9 basis mismatch via the conflicting route

Harness only. Live `stage2_v4.md` was not edited. R7 superseded.
Part 0 scan: `r9-part0-gross-net-scan.md`. Fixture: `93_adversarial_basis_mismatch`.

## Scoreboard

```
arm  EA_E3 confl  F93_S3 confl  S1+S2 ctrl  five holds  F19  indep  modality  verdict
R3a  no          yes         no         yes         yes  yes   ok        reference
R9   yes         yes         no         yes         yes  yes   ok        KILL
```

## Stopping rule (written before the run)

CONFIRM Both PRIMARYs, both overreach CONTROLs, every HOLD. Proceed to Part 3.
KILL Shipped fix back on confirmed, OR overreach control breaks, OR modality destabilises. STOP. No Part 3. No second wording.
PARTIAL Primary lands on partially_confirmed rather than conflicting with controls intact. STOP and report.

## Verdict

**KILL** - Overreach control broke: S1_ok=true (conf/conf/conf); S2_ok=false (part/confl/part)

## Prompt arms

```
R3a  len=12812  sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R9   len=13728  sha256=bf42e8fba016aeb511f95f8b8d95c2056df63c582d629c4078a06a52661b956a
```

CONFIRMED: hashes differ.

### R9 wording (verbatim; ASCII hyphen in report where live uses em dash)

Chosen: realised/mark on the modality limb of conflicting; gross versus net as an explicit mutually-exclusive-figures item beside magnitude. Like-for-like and paraphrase carve-out name both pairs. No partially_confirmed amendment. Keep 3c. Example 3d lands on conflicting.

L23:
```
• "confirmed" - on a like-for-like basis (same metric, same frame, same entity-role, same basis), the source states the same substance as the statement, including paraphrase, formatting, correct rounding. Paraphrase does not cover a basis swap: returned, realised or distributed versus marked at, valued at, carried at or unrealised; or gross versus net.
```

L27:
```
• "conflicting" - the source states something mutually exclusive with the draft on a like-for-like basis. This includes: a different named entity or ownership/context in the same role; a number that differs from the source's same-metric figure by more than rounding; the same figure stated on a different basis (gross versus net); a status/modality contradiction only when the draft asserts a definite completed action using invested, acquired, completed, sold, exited, returned, realised, or distributed, specific enough to be checkable, that the source directly shows as proposed, recommended, sought, not yet done, marked at, valued at, carried at, or unrealised. Do not fire modality-conflict on "committed", "a new investment", "the fund holds", or other cover / deal-terms wording that names amount and vehicle without asserting that the transaction has already closed. Those follow ordinary support (confirmed or partial).
```

L31:
```
Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed. That carve-out does not apply where the statement and the source give the same figure under different bases (returned, realised or distributed versus marked at, valued at, carried at or unrealised; gross versus net).
```

Example 3d:
```
3d) Basis mismatch (returned versus marked) -> conflicting
Statement: 'Fund IV has returned 1.9 times gross MOIC.'
Source: 'Fund IV is currently marked at 1.9 times gross MOIC.'
Correct classification: conflicting
Reasoning: The figure matches. The statement presents it as returned; the source presents it as a current mark. That is a basis mismatch and is mutually exclusive, not paraphrase.
```

Cost: $1.9133. Cache OFF. Model openai/gpt-4o. seed=1.
Statements: 27 (23 graded including eval-ablation EA_E3, plus F93_S0..S3).
EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (not claim-spans CS_E3; not corpus E3:S0:ic_memo).
F93 source: scripts/diagnostic/sources/93_adversarial_basis_mismatch.txt.

## PRIMARY EA_E3 conflicting >=2/3

```
EA_E3  R3a conf/conf/conf  R9 confl/confl/confl ok=true
```

## PRIMARY F93_S3 gross/net conflicting >=2/3

```
F93_S3  R3a confl/confl/confl  R9 confl/confl/confl ok=true
```

## REPORTED F93_S0 (vacuous vs R3a reference)

```
F93_S0  R3a confl/confl/confl  R9 confl/confl/confl confl_ok=true
```
Vacuous against reference if R3a is already conflicting. Not a win.

## CONTROL F93_S1 and F93_S2 confirmed >=2/3

```
F93_S1  R3a conf/conf/conf  R9 conf/conf/conf ok=true
F93_S2  R3a part/part/part  R9 part/confl/part ok=false
```

## HOLD false greens

```
EA_E2  R3a part/part/part  R9 conf/part/part ok=true
CS_E3  R3a part/part/part  R9 part/part/part ok=true
F01_S10  R3a part/part/part  R9 part/part/part ok=true
F04_S20  R3a part/part/part  R9 part/part/part ok=true
F12_S0  R3a part/conf/part  R9 part/part/part ok=true
```

## HOLD F19_S7

```
F19_S7  R3a part/part/part  R9 part/part/part ok=true
```

## HOLD independent (includes F92_S0)

```
F18_S6  r3aMaj=part  R3a part/part/part  R9 part/part/part hold=true
F90_S0  r3aMaj=nosup  R3a nosup/nosup/nosup  R9 nosup/nosup/nosup hold=true
F92_S0  r3aMaj=conf  R3a conf/conf/conf  R9 conf/conf/conf hold=true
```

## HOLD modality controls (all three runs)

```
F15_S2  r3aMaj=confl  R3a confl/confl/confl  R9 confl/confl/confl hold=true
F08_S2  r3aMaj=part  R3a part/part/part  R9 confl/confl/confl hold=false (noise floor)
F08_S0  r3aMaj=conf  R3a conf/conf/conf  R9 conf/conf/conf hold=true
F04_S1  r3aMaj=conf  R3a conf/conf/conf  R9 conf/conf/conf hold=true
modalityDestabilised=false
```

## PLANTED (not breaks); F04_S13 and F17_S9 explicit

```
F04_S13  R3a conf/conf/conf  R9 conf/conf/conf
F17_S9   R3a confl/confl/confl  R9 part/confl/confl
F01_S7 r3a=conf R9 part/part/part hold=false
F04_S13 r3a=conf R9 conf/conf/conf hold=true
F14_S4 r3a=part R9 part/part/part hold=true
F12_S1 r3a=part R9 part/part/part hold=true
F14_S11 r3a=part R9 part/part/part hold=true
F05_S5 r3a=confl R9 confl/confl/confl hold=true
F17_S9 r3a=confl R9 part/confl/confl hold=true
F01_S11 r3a=nosup R9 nosup/nosup/nosup hold=true
```

## EA_E3 explanations

### R3a EA_E3 run 1: confirmed

```
The source confirms the statement by stating that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the figures in the statement.
```

### R3a EA_E3 run 2: confirmed

```
The source confirms the statement by providing the same figures for Fund IV's gross MOIC and gross IRR.
```

### R3a EA_E3 run 3: confirmed

```
The source confirms the statement by stating that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the figures in the statement.
```

### R9 EA_E3 run 1: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch, as 'returned' implies realised gains, whereas 'marked at' indicates current valuation.
```

### R9 EA_E3 run 2: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch between returned and marked at, which is mutually exclusive.
```

### R9 EA_E3 run 3: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch, as 'returned' and 'marked at' are mutually exclusive terms.
```

## F93_S3 explanations

### R3a F93_S3 run 1: conflicting

```
The statement claims a 2.6x net MOIC for Fund IV, while the source specifies that the 2.6x figure is gross MOIC for fully realised exits only, not the entire fund. This creates a basis mismatch between net and gross MOIC.
```

### R3a F93_S3 run 2: conflicting

```
The statement claims a 2.6x net MOIC for Fund IV, while the source specifies that the 2.6x figure is gross MOIC for fully realised exits only, not for the entire fund. This creates a basis mismatch between net and gross MOIC.
```

### R3a F93_S3 run 3: conflicting

```
The statement claims a 2.6x net MOIC for Fund IV, while the source specifies that the 2.6x figure is gross MOIC for fully realised exits only, not net MOIC for the entire fund.
```

### R9 F93_S3 run 1: conflicting

```
The statement claims a net MOIC of 2.6x, while the source states a gross MOIC of 2.6x for fully realised exits only. This is a basis mismatch, as the statement presents it as net and fund-level, while the source presents it as gross and only for realised exits.
```

### R9 F93_S3 run 2: conflicting

```
The statement claims a net MOIC of 2.6x for Fund IV, while the source states a gross MOIC of 2.6x for fully realised exits only, and a current mark of 1.9x gross MOIC for the fund. This is a basis mismatch and a conflict.
```

### R9 F93_S3 run 3: conflicting

```
The statement claims a net MOIC of 2.6x, while the source states a gross MOIC of 2.6x for fully realised exits only. This is a basis mismatch, as the statement presents the figure as net and fund-level, while the source presents it as gross and only for realised exits.
```

## Recommendation / next step

KILL. Do not run Part 3. Do not write a second wording.

### What broke (quote)

F93_S2 CONTROL (both sides returned), expected confirmed >=2/3. Got part/confl/part.

R9 run 2 explanation (the conflict):

```
The statement claims Fund IV has returned 2.6 times gross MOIC at the fund level, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch between returned and marked at, making the statement conflicting.
```

That is real overreach: the model paired the returned draft with the mark sentence instead of the returned sentence.

### Fixture honesty (CONFIRMED from this run's R3a arm)

F93_S2 was already part/part/part on R3a, because the source qualifies 2.6x as "across fully realised exits only" and the draft omits that scope. So the written CONTROL "stays confirmed" was misspecified against this source. The gate still KILLs under the stopping rule as written. The clean finding for Ben: restage S2 so the draft matches the source's returned scope (or state a fund-level returned figure without the subset caveat) before any retry. Do not treat this KILL as proof the conflicting destination is wrong on EA_E3.

### What worked anyway (not a ship claim)

```
EA_E3  R3a conf/conf/conf  R9 confl/confl/confl   (real exhibit; not vacuous)
F93_S3 R3a confl/confl/confl R9 confl/confl/confl (vacuous vs reference; already conflicting)
F93_S1 R9 conf/conf/conf     (honest mark control held)
EA_E2  R9 conf/part/part     (still off confirmed >=2/3; watch the single conf)
```

### Opinion

Gross versus net belongs in the same basis-exclusivity rule as realised versus mark, on a different L27 limb. Measurement of F93_S3 was vacuous on this fixture because R3a already conflicted. The load-bearing win is EA_E3 to conflicting. The load-bearing loss is S2 overreach / bad control staging. Fix the control, then remeasure; do not soften conflicting back to partial.

Part 3 and Part 4: NOT RUN (hard stop after Part 2 KILL).


## Technical summary

R9 harness-only: conflicting basis limb + like-for-like + paraphrase carve-out + example 3d. Measured 27 x 2 x 3. Rows in r9-basis-conflict-rows.json.

## Plain-language summary

This pass tests whether Review flags a returned-versus-mark or gross-versus-net swap as a contradiction, while leaving honest mark wording and a true returned sentence alone.
