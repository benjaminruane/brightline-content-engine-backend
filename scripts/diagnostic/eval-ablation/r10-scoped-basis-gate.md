# R10 scoped basis gate

Harness only. Live `stage2_v4.md` was not edited. R10 = R9 + quantity-scoped basis limb.
Part 1 richness: `mark-richness-probe.md` (RICHNESS_CONFIRMED).

## Pre-flight checklist

```
CONTROL on REFERENCE ARM: F93_S1 must stay confirmed on R3a in this run
  (vacuous-control guard). MF expected labels from pairs.json. Shipped
  fixes must stay off confirmed on R3a majority.
BASELINE three times: Yes. R3a x3 and R10 x3.
VACUOUS gates: F93_S0 and F93_S3 are vacuous against R3a if R3a already
  conflicts (report, not wins). Controls that fail on R3a cannot KILL R10.
PLANTED cells excluded from breaks: Yes. F04_S13 and F17_S9 named.
Pass scored on more than one exhibit: Yes. EA_E3 primary + ten MF pairs +
  F93_S1 + five shipped-fix HOLDs + F19 + independents.
Stopping rule CONFIRMs as well as KILLs: Yes. CONFIRM / KILL / PARTIAL.
```

## Running cost

```
total_usd=2.4337
cache=OFF calls=222
model=openai/gpt-4o seed=1
```

## Prompt arms

```
R3a  len=12812  sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R9   len=13728  sha256=bf42e8fba016aeb511f95f8b8d95c2056df63c582d629c4078a06a52661b956a
R10  len=14259  sha256=44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1
hashes_all_differ=true
```

## R10 change (verbatim; only addition beyond R9)

Placement: immediately after the R9 same-figure basis carve-out sentence
(the paragraph that begins 'That carve-out does not apply...'). Why: that
is the basis limb's quantity claim; gating here scopes basis without
touching the magnitude limb ('a number that differs...').

```
Basis mismatches of returned, realised or distributed versus marked at, valued at, carried at or unrealised may be classified conflicting only when the statement and the cited passage state the same quantity. When those quantities differ, do not fire a basis conflict; select the passage that addresses the same quantity the statement asserts, if one exists, and classify from that passage. Ordinary magnitude conflicts between two returned figures, or two marked figures, or any other same-basis same-metric pair, are unchanged.
```

## Stopping rule (written before the run)

```
CONFIRM  PRIMARY EA_E3 confl>=2/3, all MF polarities, F93_S1, every HOLD.
         Ship candidate only; no live edit in this pass.
KILL     Shipped fix back on confirmed, OR MF polarity flip, OR modality
         beyond noise floor of 2 in 23. STOP. Do not reword R10.
PARTIAL  EA_E3 partially_confirmed with controls intact. STOP and report.
```

## Verdict

```
CONFIRM: PRIMARY EA_E3 conflicting, all MF polarities hold, F93_S1 holds, every HOLD met. Ship candidate; do not ship in this pass.
```

## PRIMARY EA_E3 (eval-ablation/meridian_source.txt)

```
EA_E3  R3a conf/conf/conf  R10 confl/confl/confl ok=true
```

## CONTROL MF pairs (both polarities)

```
MF01 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
MF02 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
MF03 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
MF04 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
MF05 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
MF06 expected=conflicting  R3a confl/confl/confl  R10 confl/confl/confl ok=true
MF07 expected=conflicting  R3a confl/confl/confl  R10 confl/confl/confl ok=true
MF08 expected=conflicting  R3a confl/confl/confl  R10 confl/confl/confl ok=true
MF09 expected=conflicting  R3a confl/confl/confl  R10 confl/confl/confl ok=true
MF10 expected=confirmed  R3a conf/conf/conf  R10 conf/conf/conf ok=true
mfAllHold=true flips=none
```

## CONTROL F93_S1

```
F93_S1  R3a conf/conf/conf  R10 conf/conf/conf ok=true
```

## REPORTED F93_S2 (most informative cell)

```
F93_S2  R3a confl/confl/confl  R10 confl/confl/confl
If the scoped gate works, the false red should disappear under R10.
RESULT: false red did NOT disappear. R10 still cites mark-at-1.9 and
returns conflicting. Report prominently: quantity-scoped basis gate alone
does not clear richness hunting when the selected passage has a different
MOIC figure.
```

## REPORTED vacuous F93_S0 and F93_S3

```
F93_S0  R3a confl/confl/confl  R10 confl/confl/confl vacuous_vs_ref=true
F93_S3  R3a confl/confl/confl  R10 confl/confl/confl vacuous_vs_ref=true
Not wins when R3a already conflicts.
```

## HOLD false greens (EA_E2 above all)

```
EA_E2  R3a part/part/part  R10 part/part/part ok=true
CS_E3  R3a part/part/part  R10 part/part/part ok=true
F01_S10  R3a part/part/part  R10 part/part/part ok=true
F04_S20  R3a part/part/part  R10 part/part/part ok=true
F12_S0  R3a part/conf/part  R10 part/part/part ok=true
```

## HOLD F19_S7

```
F19_S7  R3a part/part/part  R10 conf/part/part ok=true
```

## HOLD independent (includes F92_S0)

```
F18_S6  r3aMaj=part  R3a part/part/part  R10 part/part/part hold=true
F90_S0  r3aMaj=nosup  R3a nosup/nosup/nosup  R10 nosup/nosup/nosup hold=true
F92_S0  r3aMaj=conf  R3a conf/conf/conf  R10 conf/conf/part hold=true
```

## HOLD modality controls (all three runs)

```
F15_S2  r3aMaj=confl  R3a confl/confl/confl  R10 confl/confl/confl hold=true
F08_S2  r3aMaj=part  R3a part/part/part  R10 confl/confl/confl hold=false (noise floor)
F08_S0  r3aMaj=conf  R3a conf/conf/conf  R10 conf/conf/conf hold=true
F04_S1  r3aMaj=conf  R3a conf/conf/conf  R10 conf/conf/conf hold=true
modalityDestabilised=false
```

## PLANTED (not breaks); F04_S13 and F17_S9 explicit

```
F04_S13  R3a conf/part/conf  R10 conf/conf/conf
F17_S9   R3a confl/confl/confl  R10 confl/confl/confl
F01_S7 r3a=conf R10 conf/conf/conf hold=true
F04_S13 r3a=conf R10 conf/conf/conf hold=true
F14_S4 r3a=part R10 part/part/part hold=true
F12_S1 r3a=part R10 part/part/part hold=true
F14_S11 r3a=part R10 part/part/part hold=true
F05_S5 r3a=confl R10 confl/confl/confl hold=true
F17_S9 r3a=confl R10 confl/confl/confl hold=true
F01_S11 r3a=nosup R10 nosup/nosup/nosup hold=true
```

## Fixture and probe passages (every run)

```
--- F93_S0 ---
R3a r1: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value. Fund IV has returned 2.6 times gross MOIC.
R3a r2: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value. Fund IV has returned 2.6 times gross MOIC.
R3a r3: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value. Fund IV has returned 2.6 times gross MOIC.
R10 r1: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
R10 r2: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
R10 r3: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.

--- F93_S1 ---
R3a r1: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R3a r2: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R3a r3: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r1: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r2: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r3: conf passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.

--- F93_S2 ---
R3a r1: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
R3a r2: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
R3a r3: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
R10 r1: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r2: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r3: confl passage=Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.

--- F93_S3 ---
R3a r1: confl passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: confl passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: confl passage=Fund IV has returned 2.6 times gross MOIC.

--- MF01 ---
R3a r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: conf passage=Fund IV has returned 2.6 times gross MOIC.

--- MF02 ---
R3a r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: conf passage=Fund IV has returned 2.6 times gross MOIC.

--- MF03 ---
R3a r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: conf passage=Fund IV has returned 2.6 times gross MOIC.

--- MF04 ---
R3a r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: conf passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: conf passage=Fund IV has returned 2.6 times gross MOIC.

--- MF05 ---
R3a r1: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
R3a r2: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
R3a r3: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
R10 r1: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
R10 r2: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
R10 r3: conf passage=Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.

--- MF06 ---
R3a r1: confl passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
R3a r3: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
R10 r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
R10 r3: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.

--- MF07 ---
R3a r1: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
R3a r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
R3a r3: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r1: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
R10 r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
R10 r3: confl passage=Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.

--- MF08 ---
R3a r1: confl passage=Fund IV has returned 2.6 times gross MOIC.
R3a r2: confl passage=Fund IV has returned 2.6 times gross MOIC.
R3a r3: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r1: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r2: confl passage=Fund IV has returned 2.6 times gross MOIC.
R10 r3: confl passage=Fund IV has returned 2.6 times gross MOIC.

--- MF09 ---
R3a r1: confl passage=Fund IV is currently marked at 1.9x gross MOIC.
R3a r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC.
R3a r3: confl passage=Fund IV is currently marked at 1.9x gross MOIC.
R10 r1: confl passage=Fund IV is currently marked at 1.9x gross MOIC.
R10 r2: confl passage=Fund IV is currently marked at 1.9x gross MOIC.
R10 r3: confl passage=Fund IV is currently marked at 1.9x gross MOIC.

--- MF10 ---
R3a r1: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
R3a r2: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
R3a r3: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
R10 r1: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
R10 r2: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
R10 r3: conf passage=Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.

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
The source confirms the statement by providing the same figures for Fund IV's gross MOIC and gross IRR.
```

### R10 EA_E3 run 1: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch between returned and marked at, which is mutually exclusive.
```

### R10 EA_E3 run 2: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch between returned and marked at, which is mutually exclusive.
```

### R10 EA_E3 run 3: conflicting

```
The statement claims Fund IV has returned 1.9 times gross MOIC, while the source states it is currently marked at 1.9x gross MOIC. This is a basis mismatch between returned and marked at, which is mutually exclusive.
```

## Opinion

```
CONFIRM is the right call under the written pass conditions. EA_E3 flipped
from confirmed x3 on R3a to conflicting x3 on R10 against
eval-ablation/meridian_source.txt. All ten MF polarities held, including
MF08 (returned 3.0 vs returned 2.6), so the magnitude limb was left alone.
F93_S1 stayed confirmed. Shipped-fix HOLDs held; EA_E2 stayed partial.

The single most informative cell did NOT clear: F93_S2 stayed
conflicting x3 under R10, still citing the rich mark-at-1.9 passage
(truncated after IRR on R10 runs). The quantity-scoped basis gate therefore
does not by itself remove the richness false red. Once the model has
selected the mark passage, 2.6 versus 1.9 still reads as a mutually
exclusive magnitude pair. HYPOTHESIS: clearing F93_S2 needs passage
discipline (or an explicit same-quantity selection rule stronger than the
basis limb gate), not only a basis quantity gate. That does not undo
CONFIRM on EA_E3; it means Ben should not treat R10 as having solved the
rich-mark hunting defect.

Is the gate worded tightly enough for magnitude? On this run, yes for the
designed check (MF08). Is it enough for the richness false red? No.
```

## Identity collision reminder

```
eval-ablation EA_E3 uses meridian_source.txt.
claim-spans CS_E3 uses claim-spans/evaluative-accident/source_ic_memo.txt.
corpus E3:S0:ic_memo is a third different statement.
```
