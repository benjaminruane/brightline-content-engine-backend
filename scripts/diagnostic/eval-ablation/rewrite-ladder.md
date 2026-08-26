# Rewrite ladder R1 R2 R3 and 23-set gate

Date: 2026-08-26
Harness: `scripts/diagnostic/eval-ablation/run-rewrite-ladder.mjs`
Rows: `scripts/diagnostic/eval-ablation/rewrite-ladder-rows.json`
Live prompt untouched: `lib/qc/pipeline-v4/prompts/stage2_v4.md`
Meridian: `scripts/diagnostic/eval-ablation/meridian_source.txt` (Halden)
Model: openai/gpt-4o, temp 0, seed 1, cache OFF
Calls: 276. Cost: $3.253178. Contingency: not used.

## Scoreboard (updated)

Proven false greens: EA_E2, CS_E3, F01_S10, F04_S20, F12_S0.
PLANTED flips are NEVER counted as breaks.

```
arm       fixed  broken  net   notes
baseline  0      0       0
arm B     2      0       +2    prior probe
arm C     3      1       +2    prior; broke F19_S7
arm D     3      7       -4    prior; planted+unadj mixed
R1        3      0       +3    CS_E3 F01_S10 F04_S20; F19 held
R2        3      0       +3    same three; 3c added; EA_E2 still green
R3        4      0       +4    +EA_E2; F12_S0 still green (PRIMARY miss)
```

## STOPPING VERDICT: PARTIAL

```
PRIMARY: 4 of 5 false greens off confirmed on R3 >=2/3.
  EA_E2   part/part/part  PASS  (introduced at R3)
  CS_E3   part/part/part  PASS  (present from R1; arm C inheritance)
  F01_S10 part/part/part  PASS  (present from R1; arm C inheritance)
  F04_S20 part/part/part  PASS  (present from R1; arm C inheritance)
  F12_S0  conf/part/conf  FAIL  (never stably off confirmed)

CONTROL F19_S7: part/part/part on R3  PASS
CONTROL independent stable-on-A: 0 breaks  PASS
  (F92_S0, F18_S6, F90_S0 held)

PARTIAL rule: four of five fixed. The miss is F12_S0. The rung that should
have caught it is R1 (duration). R1 did not; it made F12_S0 worse than A.
Fixed that one rung's wording in the harness (not re-billed). Do not add R4.
```

---

## Part 1: PLANTED vs INDEPENDENT

Verified against `stage2_v4.md` worked examples.

```
id       plant        note
EA_E2    INDEPENDENT  eval-ablation meridian E2
CS_E3    INDEPENDENT  claim-spans source_ic_memo E3
F01_S10  PLANTED      near-copy of example 3 In-summary/defensible shape
F04_S20  PLANTED      near-copy of example 3 In-summary/defensible shape
EA_E3    INDEPENDENT  eval-ablation meridian E3 (recorded only)
EA_E1    INDEPENDENT  eval-ablation meridian E1 (recorded only)
F01_S7   PLANTED      verbatim example 2
F04_S13  PLANTED      verbatim example 3b
F12_S0   INDEPENDENT  duration/voice fixture; not an example copy
F04_S1   PLANTED      near-copy example 11c
F08_S0   PLANTED      near-copy example 11b
F92_S0   INDEPENDENT
F14_S4   PLANTED      near-copy example 5
F19_S7   PLANTED      near-copy example 7; also CONTROL_ADJUDICATED
F12_S1   PLANTED      near-copy example 4
F14_S11  PLANTED      verbatim example 8
F18_S6   INDEPENDENT
F15_S2   PLANTED      verbatim example 11
F05_S5   PLANTED      verbatim example 10
F17_S9   PLANTED      near-copy example 12
F08_S2   PLANTED      near-copy example 6 numbers + example 11 verb
F01_S11  PLANTED      verbatim example 13
F90_S0   INDEPENDENT
```

CONFIRMED: a PLANTED flip when its example is deleted is a memorisation check,
not a product regression. PLANTED entries are reported separately below and are
not counted as scoreboard breaks.

F01_S10 / F04_S20 remain PLANTED but are also proven false greens; they still
count in PRIMARY (correct label), not as control breaks.

---

## Part 2: Ladder construction

```
arm  len    sha256
A    12451  c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
C    11488  4ca79b210193e9f5a58d7bf78a1be70903402ef221e4d27f06a6b59a97c0c6b4
R1   11847  e34cf6db2d7f62dbdeb50b321e449c7a7f415c6c3a0bbec2500a02868a88feaf
R2   12253  8720e8b3e2b3bd11284eb8c15cdd50fc2744584a69ebaa35da54e64db0a40f22
R3   12540  071c3ef29af1ca31ef5479cba86281afdb34e15cea4715c2bef7a27ff7adf9ba
```

All five hashes differ. CONFIRMED: A and C match prior expected hashes.

R1 = C + Frame and period priority block immediately before Evaluative claims.

R1 wording used in this run (refinements vs spec: added "or its evaluative
wording"; added "even when every other clause would otherwise confirm"):

```
Frame and period priority
Judge the period, vintage, duration or frame of a statement before judging its
figures or its evaluative wording. If the statement attaches a period, vintage,
duration or frame the source does not support, the statement is
partially_confirmed even when every figure matches and even when every other
clause would otherwise confirm.
```

R2 = R1 + example 3c only (verbatim from G). No example 1. No example 3.

R3 = R2 + implication/risk sentence appended to Evaluative claims (refinement:
added "means or implies"):

```
A conclusion drawn from a supported fact is a separate claim. If the statement
says a fact means or implies that a risk is limited, a position is strong, a
result is good, or an outcome is likely, the source must state that conclusion
itself. The supporting fact matching is not enough.
```

---

## Part 3: Results

Fingerprint mostly `fp_17e3c4f467` (occasional `fp_64d0f9e03c`).

### A x3 drift

No hard stop. F19_S7 held partial x3.
F12_S0 noise-floor note: conf/part/part (majority already partial on A).

### Full grid (narrow codes)

```
id        plant  A              R1             R2             R3
EA_E2     IND    conf/conf/conf conf/conf/conf conf/conf/conf part/part/part
CS_E3     IND    conf/conf/conf part/part/part part/part/part part/part/part
F01_S10   PLT    conf/conf/conf part/part/part part/part/part part/part/part
F04_S20   PLT    conf/conf/conf part/part/part part/part/part part/part/part
EA_E3     IND    conf/conf/conf conf/conf/conf conf/conf/conf conf/conf/conf
EA_E1     IND    part/part/part part/part/part part/part/part part/part/part
F01_S7    PLT    conf/conf/conf conf/conf/conf conf/conf/conf conf/conf/conf
F04_S13   PLT    conf/conf/conf part/part/conf conf/conf/part conf/conf/conf
F12_S0    IND    conf/part/part conf/conf/conf conf/conf/conf conf/part/conf
F04_S1    PLT    conf/conf/conf conf/conf/conf conf/conf/conf conf/conf/conf
F08_S0    PLT    conf/conf/conf conf/conf/conf conf/conf/conf conf/conf/conf
F92_S0    IND    conf/conf/conf conf/conf/conf conf/conf/conf conf/conf/conf
F14_S4    PLT    part/part/part part/part/part part/part/part part/part/part
F19_S7    PLT    part/part/part part/part/part part/part/part part/part/part
F12_S1    PLT    part/part/part part/part/part part/part/part part/part/part
F14_S11   PLT    part/part/part part/part/part part/part/part part/part/part
F18_S6    IND    part/part/part part/part/part part/part/part part/part/part
F15_S2    PLT    confl x3       confl x3       confl x3       confl x3
F05_S5    PLT    confl x3       confl x3       confl x3       confl x3
F17_S9    PLT    confl x3       confl x3       confl x3       confl x3
F08_S2    PLT    confl/part/confl confl x3     confl x3       confl x3
F01_S11   PLT    nosup x3       nosup x3       nosup x3       nosup x3
F90_S0    IND    nosup x3       nosup x3       nosup x3       nosup x3
```

### Ladder contribution

```
CS_E3 / F01_S10 / F04_S20: off confirmed from R1 (inherited from arm C shape;
  R1 also held F19, which C had broken)
EA_E2: off confirmed first at R3 (implication/risk sentence)
F12_S0: never stably off confirmed on R1/R2/R3
```

### F12_S0 claim strength (noise floor)

```
A:  conf/part/part   (2/3 already correct partial)
R1: conf/conf/conf   (regressed to all confirmed)
R2: conf/conf/conf
R3: conf/part/conf   (1/3 partial; fails >=2/3)

Explanations on R3:
  r1 confirmed: sale completion matches; duration ignored
  r2 partial: eighteen months vs more than four years named
  r3 confirmed: sale completion matches; duration ignored
```

How strong is the PRIMARY miss? Soft on noise, hard on the rung. F12_S0 sits
in the noise floor (diagnosis: 2 of 23). A alone was already majority partial.
R1's duration sentence failed to fire and erased A's partial majority. Claiming
"R3 fixed duration" would be false. Claiming "PRIMARY almost passed" is fair
only if the next R1 fix is measured; the first-run PRIMARY fails.

### EA_E2 on R3 (CONFIRMED mechanism)

```
r1: ... does not address the additional checkable claim that this stability
    limits key-person risk.
r2/r3: ... limits key-person risk is an additional evaluative claim not
    addressed by the source.
source: scripts/diagnostic/eval-ablation/meridian_source.txt
```

CONFIRMED: the implication/risk sentence is what moved EA_E2. R1 and R2 left it
confirmed x3. The EA_E2 HYPOTHESIS from the diagnosis is now a finding for this
ladder.

### PLANTED memorisation report (not scoreboard breaks)

All PLANTED controls held baseline on R3 >=2/3 except none failed the hold
rule. F04_S13 was unstable inside R1/R2 but held on R3. F08_S2 held conflicting
on R3 (A was unstable confl/part/confl).

---

## PARTIAL: one-rung fix (R1), not re-billed

First-run R1 wording failed F12_S0 and regressed it. Fixed wording now in
harness as `FRAME_PERIOD_PRIORITY` (build path for next measurement). Measured
arms still used `FRAME_PERIOD_PRIORITY_FIRST_RUN` so hashes match the rows.

Fixed R1 block (next measurement only):

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

Do not add a fourth rule. Next step: rebuild R1'/R2'/R3' from the fixed R1,
run A x3 + R3' x3 (or full ladder), same gate. Predicted cost ~$1.60 if only
A+R3', or ~$3 if full ladder again.

---

## Closest arm text (first-run R3)

Not a CONFIRM winner. Full first-run R3 text is in
`rewrite-ladder-rows.json` under `arms.R3` and in
`scripts/diagnostic/eval-ablation/rewrite-ladder-r3-prompt.txt`
(len 12540, sha256 071c3ef29af1ca31ef5479cba86281afdb34e15cea4715c2bef7a27ff7adf9ba).

Live prompt edit is not authorised until PRIMARY passes.

---

## Assessment

What this pass settled:

1. Implication/risk prose moves EA_E2. CONFIRMED by R2 vs R3. That was the
   right bet from the diagnosis.
2. Frame-priority sentence holds F19_S7 while keeping C's three false-green
   fixes. Contingency (evaluative-as-test) was not needed.
3. Example 3c alone did not move EA_E2 (R2 still green). Ranking example is
   not the EA_E2 mechanism.
4. F12_S0 is not solved by soft "duration" mention inside a vintage-framed
   priority sentence. Needs an explicit duration/opener rule (the PARTIAL fix).

What I think is wrong in this spec:

1. Counting F01_S10 / F04_S20 in PRIMARY while labelling them PLANTED is right
   for product, but R1 "fixed 3" mostly restates arm C. The ladder should have
   measured C x3 as rung 0 so attribution is clean.
2. Stopping PRIMARY on F12_S0 when it is in the noise floor and A was already
   majority partial over-weights a soft cell. The PARTIAL outcome is still
   correct under the written rule.
3. Independent controls on this set are only three (F92_S0, F18_S6, F90_S0).
   That is a thin ship gate; corpus blast remains mandatory after CONFIRM.

Next: measure the fixed R1 rung once. If F12_S0 then passes and EA_E2 still
holds, CONFIRM and proceed to corpus blast, then live `stage2_v4.md` edit.
