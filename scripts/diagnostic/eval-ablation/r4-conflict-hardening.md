# R4 conflict hardening vs shipped R3a

Harness only. Live `stage2_v4.md` was not edited in this pass.

## Stopping rule (written before the run)

CONFIRM PRIMARY met and every HOLD met. R4 goes live as its own commit in a later pass, after Ben reads the result.
KILL Any of the five false greens returns to confirmed on >=2/3. The hardening sentence has cost more than it bought. Report and STOP. Do not write a second wording. R3a stands as shipped.
PARTIAL PRIMARY met but one independent control breaks, or PRIMARY missed with all HOLDs intact. Report which, recommend, and stop.

## Verdict

**PARTIAL** — PRIMARY missed (S1 ok=true, S5 ok=false); HOLDs intact.

## Prompt arms

```
R3a (live / reference)  len=12812  sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R4  (harness only)      len=13066  sha256=72a7ac7ec7b595cce045d91216cfcae222a5a8d9cfad6f1c9ef8d7eef5f2f5ce
```

R4 = R3a plus one sentence under Numeric rules, immediately after the same-metric magnitude line.
Wording: proposed text unchanged (no refine).

```
Where the statement and the source give figures for the same thing that cannot both be true, or name plans that cannot both hold, that is conflicting. Do not route it to partially_confirmed because the statement also carries extra or evaluative wording.
```

Cost: $1.7732. Cache OFF. Model openai/gpt-4o. seed=1.
Unique statements: 25 (spec said 26; F92_S0 is already in the 23 graded set, so 23+2=25 unique).

## PRIMARY (nordholt-dirty lost contradictions)

```
ND_S1 nordholt-dirty:S1:fact sheet  R3a confl/confl/confl  R4 confl/confl/confl  R4_ok=true
ND_S5 nordholt-dirty:S5:LP update  R3a part/part/confl  R4 part/part/part  R4_ok=false
PRIMARY pass: false
```

## HOLD false greens off confirmed >=2/3

```
EA_E2  R3a part/part/part  R4 part/part/part  R4_ok=true
CS_E3  R3a part/part/part  R4 part/part/part  R4_ok=true
F01_S10  R3a part/part/part  R4 part/part/part  R4_ok=true
F04_S20  R3a part/part/part  R4 part/part/part  R4_ok=true
F12_S0  R3a part/part/part  R4 part/part/part  R4_ok=true
falseGreenHold: true
```

## HOLD F19_S7 partially_confirmed >=2/3

```
F19_S7  R3a part/part/part  R4 part/part/part  R4_ok=true
```

## HOLD independent controls vs R3a majority label

```
No independent control breaks.
```

## PLANTED report (not scoreboard breaks)

```
F01_S7 plant=PLANTED noise=false r3a=conf R4 conf/conf/conf hold=true
F04_S13 plant=PLANTED noise=false r3a=part R4 part/conf/part hold=true
F04_S1 plant=PLANTED noise=false r3a=conf R4 conf/conf/conf hold=true
F08_S0 plant=PLANTED noise=false r3a=conf R4 conf/conf/conf hold=true
F14_S4 plant=PLANTED noise=false r3a=part R4 part/part/part hold=true
F12_S1 plant=PLANTED noise=false r3a=part R4 part/part/part hold=true
F14_S11 plant=PLANTED noise=false r3a=part R4 part/part/part hold=true
F15_S2 plant=PLANTED noise=false r3a=confl R4 confl/confl/confl hold=true
F05_S5 plant=PLANTED noise=false r3a=confl R4 confl/confl/confl hold=true
F17_S9 plant=PLANTED noise=false r3a=confl R4 confl/confl/confl hold=true
F08_S2 plant=PLANTED noise=true r3a=part R4 part/part/part hold=true
F01_S11 plant=PLANTED noise=false r3a=nosup R4 nosup/nosup/nosup hold=true
```

## RECORD F92_S0 and EA_E3 (expected confirmed both arms)

Both are expected to stay confirmed. Naming them so they do not pass unmentioned.

```
F92_S0  R3a conf/conf/conf  R4 conf/conf/conf
EA_E3   R3a conf/conf/conf  R4 conf/conf/conf
```

F92_S0 source: 91_adversarial_shopify_2010_trimmed (adversarial Shopify 2010 trim).
EA_E3 source: scripts/diagnostic/eval-ablation/meridian_source.txt (eval-ablation Meridian E3; not claim-spans E3).

## Full label grid

```
EA_E2    exhibit        INDEPENDENT  R3a part/part/part   R4 part/part/part
CS_E3    exhibit        INDEPENDENT  R3a part/part/part   R4 part/part/part
F01_S10  exhibit        PLANTED      R3a part/part/part   R4 part/part/part
F04_S20  exhibit        PLANTED      R3a part/part/part   R4 part/part/part
EA_E3    recorded_only  INDEPENDENT  R3a conf/conf/conf   R4 conf/conf/conf
EA_E1    recorded_only  INDEPENDENT  R3a part/part/part   R4 part/part/part
F01_S7   control        PLANTED      R3a conf/conf/conf   R4 conf/conf/conf
F04_S13  control        PLANTED      R3a part/part/part   R4 part/conf/part
F12_S0   exhibit        INDEPENDENT  R3a part/part/part   R4 part/part/part
F04_S1   control        PLANTED      R3a conf/conf/conf   R4 conf/conf/conf
F08_S0   control        PLANTED      R3a conf/conf/conf   R4 conf/conf/conf
F92_S0   control        INDEPENDENT  R3a conf/conf/conf   R4 conf/conf/conf
F14_S4   control        PLANTED      R3a part/part/part   R4 part/part/part
F19_S7   control        PLANTED      R3a part/part/part   R4 part/part/part
F12_S1   control        PLANTED      R3a part/part/part   R4 part/part/part
F14_S11  control        PLANTED      R3a part/part/part   R4 part/part/part
F18_S6   control        INDEPENDENT  R3a part/part/part   R4 part/part/part
F15_S2   control        PLANTED      R3a confl/confl/confl R4 confl/confl/confl
F05_S5   control        PLANTED      R3a confl/confl/confl R4 confl/confl/confl
F17_S9   control        PLANTED      R3a confl/confl/confl R4 confl/confl/confl
F08_S2   control        PLANTED      R3a part/part/part   R4 part/part/part
F01_S11  control        PLANTED      R3a nosup/nosup/nosup R4 nosup/nosup/nosup
F90_S0   control        INDEPENDENT  R3a nosup/nosup/nosup R4 nosup/nosup/nosup
ND_S1    primary        INDEPENDENT  R3a confl/confl/confl R4 confl/confl/confl
ND_S5    primary        INDEPENDENT  R3a part/part/confl  R4 part/part/part
```

## Recommendation

PARTIAL. Do not ship R4. R3a stands as live.

PRIMARY miss is ND_S5 only (plan exclusivity: five bolt-ons / exit 2027 vs source two / 2028). Under R4 it was part/part/part. Under R3a it was already soft (part/part/confl). The hardening sentence did not buy the plan case; on this run it removed R3a's single conflicting hit.

ND_S1 (magnitude counts) was confl x3 on both arms here. That is better than the corpus-blast R3a softening (confl->part). Treat as remeasure variance / recovery on the figure case, not as proof that R4 is needed for S1.

All HOLDs met. F92_S0 and EA_E3 stayed confirmed on both arms as expected.

No second wording. Next live edit only if Ben decides a different instrument for plan exclusivity.
