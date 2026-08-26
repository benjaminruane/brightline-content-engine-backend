# Frame rule head-to-head: R3a specific vs R3b principled

Date: 2026-08-26
Harness: `scripts/diagnostic/eval-ablation/run-frame-rule-head-to-head.mjs`
Rows: `scripts/diagnostic/eval-ablation/frame-rule-head-to-head-rows.json`
Winner file: `scripts/diagnostic/eval-ablation/frame-rule-winner-r3a.txt`
Base R3: `scripts/diagnostic/eval-ablation/rewrite-ladder-r3-prompt.txt` (SHA 86d7e2d ladder)
Live prompt untouched. Meridian: `scripts/diagnostic/eval-ablation/meridian_source.txt`
Model: openai/gpt-4o, temp 0, seed 1, cache OFF
Calls: 207. Cost: $2.471617. Refinements: none.

## Scoreboard (updated)

```
arm       fixed  broken  net   notes
R3        4      0       +4    prior ladder; F12 regressed vs its A
R3a       5      0       +5    all five false greens; F19 held; indep 0 breaks
R3b       4      0       +4    four fixes; F12 stayed conf x3; no worse than this A
```

## STOPPING VERDICT: CONFIRM

```
Winner: R3a
Reason: R3a alone meets PRIMARY + both CONTROL conditions.
R3b keeps four fixes and does not regress F12 vs this run's A, but fails PRIMARY
on F12_S0 (conf/conf/conf).
Next step: corpus blast-radius check on R3a.
```

---

## Arms

Only the Frame and period priority block differs. Rest of measured R3 is
byte-identical (CONFIRMED by harness swap check).

```
arm  len    sha256
A    12451  c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
R3   12540  071c3ef29af1ca31ef5479cba86281afdb34e15cea4715c2bef7a27ff7adf9ba
R3a  12812  bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R3b  12554  06c4bfd2565c284de838b71f6ee105712801c8026ec91e7aa78c423b9b165a37
```

All four differ.

### R3a block (specific; verbatim from rewrite-ladder PARTIAL fix)

```
Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its
figures or its evaluative wording. A duration, tenure, hold length, or
partnership length that the source states differently, or does not state, is
enough on its own: classify partially_confirmed even when the rest of the
statement matches, including when the duration sits in an otherwise matching
opener. If the statement attaches a period, vintage, duration or frame the
source does not support, the statement is partially_confirmed even when every
figure matches and even when every other clause would otherwise confirm.
```

### R3b block (principled; verbatim from this spec)

```
Frame and period priority
Judge every time claim in the statement before judging its figures or its
wording. A time claim is anything the statement asserts about when something
happened or how long it lasted. If the source does not state that same time
claim, or states a different one, the statement is partially_confirmed however
well the rest of the statement matches.
```

---

## Results

A drift notes: none.

### Grid

```
id        A              R3a            R3b
EA_E2     conf/conf/conf part/part/part part/part/part
CS_E3     conf/conf/conf part/part/part part/part/part
F01_S10   conf/conf/conf part/part/part part/part/part
F04_S20   conf/conf/conf part/part/part part/part/part
EA_E3     conf/conf/conf conf/conf/conf conf/conf/conf
EA_E1     part/part/part part/part/part part/part/part
F01_S7    conf/conf/conf conf/conf/conf conf/conf/conf
F04_S13   conf/conf/conf conf/conf/part conf/conf/part
F12_S0    conf/conf/conf part/part/part conf/conf/conf
F04_S1    conf/conf/conf conf/conf/conf conf/conf/conf
F08_S0    conf/conf/conf conf/conf/conf conf/conf/conf
F92_S0    conf/conf/conf conf/conf/conf conf/conf/conf
F14_S4    part/part/part part/part/part part/part/part
F19_S7    part/part/part part/part/part part/part/part
F12_S1    part/part/part part/part/part part/part/part
F14_S11   part/part/part part/part/part part/part/part
F18_S6    part/part/part part/part/part part/part/part
F15_S2    confl x3       confl x3       confl x3
F05_S5    confl x3       confl x3       confl x3
F17_S9    confl x3       confl x3       confl x3
F08_S2    part/confl/confl part/part/part confl x3
F01_S11   nosup x3       nosup x3       nosup x3
F90_S0    nosup x3       nosup x3       nosup x3
```

PLANTED flips are not scoreboard breaks. F08_S2 is PLANTED + noise-floor;
R3a's part/part/part vs A part/confl/confl is reported, not counted.

### PRIMARY / CONTROL per arm

```
                R3a                         R3b
EA_E2           part x3 PASS                part x3 PASS
CS_E3           part x3 PASS                part x3 PASS
F01_S10         part x3 PASS                part x3 PASS
F04_S20         part x3 PASS                part x3 PASS
F12_S0          part x3 PASS                conf x3 FAIL
F19_S7          part x3 PASS                part x3 PASS
Indep controls  0 breaks PASS               0 breaks PASS
```

### F12_S0 side by side (NO-REGRESSION)

```
A:   conf/conf/conf   correct(partial)=0
R3a: part/part/part   correct=3  no-regression YES (>= A)
R3b: conf/conf/conf   correct=0  no-regression YES (>= A; tied at zero)
```

Note: this run's A is all confirmed on F12_S0, unlike prior noise-floor /
ladder A majority-partial. Under the written NO-REGRESSION rule both arms pass;
only R3a actually fixes the cell.

R3a explanations name the duration gap (eighteen months vs more than four
years, or duration not addressed). R3b explanations match only the sale
completion / "this week" and ignore partnership length.
CONFIRMED: rows JSON, statementId F12_S0, variantId R3a/R3b.

### EA_E3 (recorded)

```
R3a conf/conf/conf
R3b conf/conf/conf
```

Expected to stay confirmed. No mark rule in either arm. Stayed confirmed.
Source: `scripts/diagnostic/eval-ablation/meridian_source.txt` (eval-ablation E3,
not claim-spans E3).

---

## Which wording won, and what that says

R3a won. Full PRIMARY. R3b did not move F12_S0 at all.

Does that tell us something general about specific rules vs principled ones?

Honest answer: mostly for this one rung, not a law of the prompt.

What this sample does show (CONFIRMED by R3a vs R3b explanations on F12_S0):

```
R3b's category ("time claim" = when / how long) still let the model treat a
matching time fragment ("this week") as enough and drop the mismatched
duration. That is the same latching failure the ladder diagnosed on the
enumerated R3 block.
R3a's extra sentence names duration / tenure / partnership length and the
"otherwise matching opener" case. The model used that. Specificity won here
because it named the exact failure mode.
```

What it does not show:

```
That specific always beats principled on Stage 2.
That every enumerated list is bad (R3a's block still enumerates period /
vintage / duration / frame; it adds a targeted clause).
That R3b's principle is useless elsewhere; F19_S7 held under both.
```

So: on this head-to-head, the specific duration clause was load-bearing and the
de-enumerated time-claim test was not enough for F12_S0. Sample size one rung.
Do not rewrite the whole prompt as case law from this alone.

---

## Assessment

The path is clear: take R3a to corpus blast. EA_E3 remains an open shape for a
later mark rung. F12_S0 is fixed under R3a on this run (3/3), so it is not an
ACCEPT open shape.

What I think: A's all-confirmed F12 this run made NO-REGRESSION cheap for R3b.
If A had been conf/part/part again, R3b would have KILL'd or failed ACCEPT on
regression. The interesting result is not that R3b "held the floor"; it is that
R3a closed the fifth false green cleanly while keeping the other four and F19.
