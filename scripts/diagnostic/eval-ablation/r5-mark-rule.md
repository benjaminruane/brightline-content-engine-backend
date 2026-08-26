# R5 realised versus unrealised mark rule

Harness only. Live `stage2_v4.md` was not edited in this pass.
Scope note `claude/b109-realised-vs-unrealised-scope.md` was not in the repo.

## Scoreboard (updated for R5)

```
arm   EA_E3 off conf  five holds  F19 hold  indep holds  verdict
R3a   no              yes         yes      yes         reference
R5    no              yes         yes      yes         PARTIAL
```

## Stopping rule (written before the run)

CONFIRM PRIMARY met and every HOLD met. R5 is a ship CANDIDATE. It does NOT ship in this pass. Report and stop for Ben's decision.
KILL Any of the five shipped fixes returns to confirmed on >=2/3. Report and STOP. Do not write a second wording.
PARTIAL PRIMARY missed with all HOLDs intact. Report the EA_E3 explanations in full and say what the model thought it was doing.

## Verdict

**PARTIAL** — PRIMARY missed (EA_E3 still confirmed on >=2/3); HOLDs intact.

## Prompt arms

```
R3a (live / reference)  len=12812  sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R5  (harness only)      len=13092  sha256=e70217c9a3ca1790269d04498a628770f9fbc2c621a8900575001648cb8539b7
```

CONFIRMED: hashes differ.
R5 = R3a plus the mark-rule wording under Frame and period priority, immediately after the existing frame paragraph.
Wording: proposed text unchanged (no refine). Spec said one sentence; the proposed block is two sentences forming one rung. Kept as written.

```
A performance figure carries a basis as well as a value. Where the statement presents a figure as completed or realised and the source presents the same figure as a current position, a valuation or an estimate, the statement is partially_confirmed even though the figure matches.
```

Cost: $1.6757. Cache OFF. Model openai/gpt-4o. seed=1.
Unique statements: 23 (23 graded set; EA_E3 is already in the set).
EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian E3; not claim-spans E3).

## PRIMARY (EA_E3 off confirmed >=2/3)

```
EA_E3  R3a conf/conf/conf  R5 conf/conf/conf  R5_ok=false
PRIMARY pass: false
```

## HOLD false greens off confirmed >=2/3

```
EA_E2  R3a part/part/part  R5 part/part/part  R5_ok=true
CS_E3  R3a part/part/part  R5 part/part/part  R5_ok=true
F01_S10  R3a part/part/part  R5 part/part/part  R5_ok=true
F04_S20  R3a part/part/part  R5 part/part/part  R5_ok=true
F12_S0  R3a part/part/part  R5 part/part/part  R5_ok=true
falseGreenHold: true
```

## HOLD F19_S7 partially_confirmed >=2/3

```
F19_S7  R3a part/part/part  R5 part/part/part  R5_ok=true
```

## HOLD independent controls vs R3a majority label

```
No independent control breaks.
```

## PLANTED report (not scoreboard breaks)

```
F01_S7 plant=PLANTED noise=false r3a=conf R5 conf/conf/conf hold=true
F04_S13 plant=PLANTED noise=false r3a=conf R5 part/part/part hold=false
F04_S1 plant=PLANTED noise=false r3a=conf R5 conf/conf/conf hold=true
F08_S0 plant=PLANTED noise=false r3a=conf R5 conf/conf/conf hold=true
F14_S4 plant=PLANTED noise=false r3a=part R5 part/part/part hold=true
F12_S1 plant=PLANTED noise=false r3a=part R5 part/part/part hold=true
F14_S11 plant=PLANTED noise=false r3a=part R5 part/part/part hold=true
F15_S2 plant=PLANTED noise=false r3a=confl R5 confl/confl/confl hold=true
F05_S5 plant=PLANTED noise=false r3a=confl R5 confl/confl/confl hold=true
F17_S9 plant=PLANTED noise=false r3a=confl R5 confl/confl/confl hold=true
F08_S2 plant=PLANTED noise=true r3a=confl R5 confl/part/confl hold=true
F01_S11 plant=PLANTED noise=false r3a=nosup R5 nosup/nosup/nosup hold=true
```

## RECORD F92_S0 and EA_E1

F92_S0 was expected to stay confirmed on both arms. On this run R3a came back part/part/part and R5 conf/conf/conf. RECORD only; not a HOLD. Do not treat the R3a partial as a new finding without a repeat.

```
F92_S0  R3a part/part/part  R5 conf/conf/conf
EA_E1   R3a part/part/part  R5 part/part/part
```

## EA_E3 explanations (R5), basis named unprompted?

No instruction asked Stage 2 to name the basis. Reading whether it did anyway.

### R5 EA_E3 run 1: confirmed

```
The source confirms that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the statement exactly.
```

Basis-related words present unprompted: marked, mark.

### R5 EA_E3 run 2: confirmed

```
The source confirms that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the statement exactly.
```

Basis-related words present unprompted: marked, mark.

### R5 EA_E3 run 3: confirmed

```
The source confirms that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the statement exactly.
```

Basis-related words present unprompted: marked, mark.

## What the model thought it was doing on EA_E3

R5 explanations (all three runs) are identical:

```
The source confirms that Fund IV is marked at 1.9x gross MOIC and 24% gross IRR, matching the statement exactly.
```

Compared with R3a:

```
The source confirms the statement by providing the same figures for Fund IV's gross MOIC and gross IRR.
```

What changed in the prose: R5 names the source verb "marked" unprompted. What did not change: the verdict stays confirmed, and the explanation still says the statement matches exactly. The model sees the mark language and still equates "has returned" with "is currently marked at" once the numbers agree.

So the basis is visible to the model. The rule did not convert that visibility into a partial. HYPOTHESIS: "has returned" is not being read as the rule's "completed or realised" class, or the like-for-like figure match still wins the classification. Either way, a soft naming of basis without a forced test is not enough.

## Framing-on-implication check (THEN READ THE REASONING)

No R5 explanation on EA_E2 or EA_E3 applied the word framing to an implication.
EA_E2 stayed partial with "additional evaluative claim" language on both arms. No GM-style "framing based on the confirmed fact" regression on this run.

## Recommendation

PARTIAL. Do not ship. Do not write a second wording in this pass.

What I actually think: the proposed sentence is clear to a human and poorly binding for gpt-4o here. R5 already quotes "marked" and still confirms. A next rung, if Ben wants one, should be written as a hard test with the verbs named (returned / realised / completed versus marked / valuation / estimate), not as another abstract category. I would not have left "completed or realised" as the only cue for "has returned"; that verb is the live exhibit and should be in the rule if the rule is meant to catch it.
