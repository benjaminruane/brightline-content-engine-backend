# Stage 2 seven-site deletion probe

Live prompt `lib/qc/pipeline-v4/prompts/stage2_v4.md` was not modified. Variants built in the harness only.

Harness: `scripts/diagnostic/eval-ablation/run-seven-site-deletion.mjs`
Rows: `scripts/diagnostic/eval-ablation/seven-site-deletion-rows.json`

Ran at 2026-08-26. Model openai/gpt-4o. Cache OFF. Seed 1. Temp 0.
Cost: $1.82 for 161 calls (A 23 + B 69 + C 69).

Backstops applied after each parse, same order as production `matchOnePair`:
`applyRoundingToleranceBackstop` then `applyPeriodGateBackstop`.
F90_S0 is held at `no_support` by the period gate (model preBackstop was `conflicting` on every arm). F01_S11 procedural closer is also backstop-eligible. F17_S9 magnitude can be forced by the magnitude backstop; here the model already returned `conflicting`.

---

## Arm hashes and lengths

```
A  len=12451  sha256=c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
B  len=10908  sha256=3bc32399628f3cb22b9eeec9fafe1daf6d763aeb55e10a0c65f148cc4cfeefc2
C  len=11488  sha256=4ca79b210193e9f5a58d7bf78a1be70903402ef221e4d27f06a6b59a97c0c6b4
```

Three distinct hashes. Variation applied.

Arm B: seven-site cluster neutralised; one replacement sentence inserted once after the four definitions; examples renumbered; cross-refs repaired.

Arm C: arm B plus Evaluative claims (verbatim from D/G) immediately before Worked examples.

Replacement sentence:

```
Wording that adds no new checkable claim, including paraphrase, formatting, correct rounding, voice, and descriptive adjectives, does not by itself block confirmed.
```

---

## Cross-reference repairs (B and C)

```
example title: "13) Procedural closer" -> "11) Procedural closer"
example title: "12) Magnitude beyond rounding" -> "10) Magnitude beyond rounding"
example title: "11c) Deal terms..." -> "9c) Deal terms..."
example title: "11b) Cover / opener..." -> "9b) Cover / opener..."
example title: "11) Status / modality" -> "9) Status / modality"
example title: "10) Ownership / context swap" -> "8) Ownership / context swap"
example title: "9) Entity swap..." -> "7) Entity swap..."
example title: "8) Future intent..." -> "6) Future intent..."
example title: "7) Vintage year..." -> "5) Vintage year..."
example title: "6) Added named party..." -> "4) Added named party..."
example title: "5) Related but narrower..." -> "3) Related but narrower..."
example title: "4) Scope-broadening" -> "2) Scope-broadening"
Numeric rules: (example 12) -> (example 10)
Voice: (example 11) -> (example 9)
Voice: (example 11b) -> (example 9b)
Entity roles: (examples 9 and 10) -> (examples 7 and 8)
```

No dangling old pointers remained after repair.

---

## Pre-condition (arm A x1)

PASS. All 23 statements matched expected disk-cache labels at current promptHash.

```
EA_E2     confirmed             OK   source=eval-ablation/meridian_source.txt
CS_E3     confirmed             OK   source=claim-spans/evaluative-accident/source_ic_memo.txt
EA_E3     confirmed             OK   meridian_source.txt (recorded only)
EA_E1     partially_confirmed   OK   meridian_source.txt (recorded only)
F01_S7    confirmed             OK
F01_S10   confirmed             OK
F04_S20   confirmed             OK
F04_S13   confirmed             OK
F12_S0    confirmed             OK
F04_S1    confirmed             OK
F08_S0    confirmed             OK
F92_S0    confirmed             OK
F14_S4    partially_confirmed   OK
F19_S7    partially_confirmed   OK
F12_S1    partially_confirmed   OK
F14_S11   partially_confirmed   OK
F18_S6    partially_confirmed   OK   source=18b (not 18a)
F15_S2    conflicting           OK
F05_S5    conflicting           OK
F17_S9    conflicting           OK
F08_S2    conflicting           OK
F01_S11   no_support            OK
F90_S0    no_support            OK   preBackstop=conflicting; period gate held final
```

system_fingerprint mostly `fp_17e3c4f467` (occasional `fp_64d0f9e03c`).

---

## Grid (23 x A / B r1-r3 / C r1-r3)

```
stmt       expect                 A                   B                         C
EA_E2      confirmed              confirmed           confirmed x3              confirmed x3
CS_E3      confirmed              confirmed           confirmed x3              partially_confirmed x3
EA_E3      confirmed              confirmed           confirmed x3              confirmed x3
EA_E1      partially_confirmed    partially_confirmed partially_confirmed x3    partially_confirmed x3
F01_S7     confirmed              confirmed           confirmed x3              confirmed x3
F01_S10    confirmed              confirmed           partially_confirmed x3    partially_confirmed x3
F04_S20    confirmed              confirmed           partially_confirmed x3    partially_confirmed x3
F04_S13    confirmed              confirmed           confirmed/confirmed/partial confirmed/confirmed/partial
F12_S0     confirmed              confirmed           confirmed x3              confirmed x3
F04_S1     confirmed              confirmed           confirmed x3              confirmed x3
F08_S0     confirmed              confirmed           confirmed x3              confirmed x3
F92_S0     confirmed              confirmed           confirmed x3              confirmed x3
F14_S4     partially_confirmed    partially_confirmed partially_confirmed x3    partially_confirmed x3
F19_S7     partially_confirmed    partially_confirmed partially_confirmed x3    confirmed x3
F12_S1     partially_confirmed    partially_confirmed partially_confirmed x3    partially_confirmed x3
F14_S11    partially_confirmed    partially_confirmed partially_confirmed x3    partially_confirmed x3
F18_S6     partially_confirmed    partially_confirmed partially_confirmed x3    partially_confirmed x3
F15_S2     conflicting            conflicting         conflicting x3            conflicting x3
F05_S5     conflicting            conflicting         conflicting x3            conflicting x3
F17_S9     conflicting            conflicting         conflicting x3            conflicting x3
F08_S2     conflicting            conflicting         conflicting x3            conflicting/conflicting/partial
F01_S11    no_support             no_support          no_support x3             no_support x3
F90_S0     no_support             no_support          no_support x3             no_support x3
```

F04_S13 holds on B and C (2 of 3 confirmed). F08_S2 holds on C (2 of 3 conflicting).

---

## Gated exhibit explanations

EA_E2 (eval-ablation E2; meridian_source.txt):

```
A/B/C all confirmed.
Explanation (stable): source confirms no senior departures across the last three fund cycles, supporting team stability and limited key-person risk.
```

CS_E3 (claim-spans E3; source_ic_memo.txt):

```
A confirmed: MOIC figures match; "speaks well of the manager's judgement" is framing, not a separate checkable claim.
B confirmed x3: figures match (B explanations stop calling the judgement clause framing; they just confirm the numbers).
C partially_confirmed x3: MOIC figures confirmed; evaluative claim about the manager's judgement not in the source.
```

---

## Stopping-rule verdict

PARTIAL

```
PASS requires: B moves EA_E2 AND CS_E3 off confirmed on >=2/3, AND all 19 controls hold on B >=2/3.
  B moved neither gated exhibit. Not PASS.

KILL requires: neither B nor C moves the gated exhibits (and, on a fair reading, deletion is inert).
  B moved neither gated exhibit, but broke F01_S10 and F04_S20 (In summary / defensible near-copies).
  C moved CS_E3 on 3/3, failed to move EA_E2, broke F01_S10, F04_S20, and F19_S7.
  Deletion is not inert. Not KILL.

PARTIAL: the cluster is load-bearing for framing controls; adding Evaluative claims after deletion moves the judgement exhibit (CS_E3) but not key-person risk (EA_E2), and regresses vintage F19_S7.
```

Broken controls name the missing replacement principles:

```
F01_S10 / F04_S20 (B and C): "In summary" + "defensible" / "exceptional" near-copies of deleted examples 2/3.
  The single replacement sentence did not carry that purpose. Rewrite must keep a principle that adjectives and summary framing around a supported claim stay confirmed, without the seven-site pile.

F19_S7 (C only): vintage vs operating went confirmed under Evaluative claims.
  Evaluative claims alone is not safe to bolt on. Period/vintage routing must stay dominant over the new evaluative rule.
```

---

## Assessment

What this actually shows:

1. Deleting the seven-site cluster does not green-fix key-person risk (EA_E2) or judgement-as-framing (CS_E3) by itself. Arm B left both confirmed. So a seven-line deletion is not the fix for those false greens.

2. Deletion is not inert either. The near-copy framing controls (F01_S10, F04_S20) flipped to partial on every B and C repeat. The cluster was doing real work for those shapes. The one replacement sentence is too weak for "defensible" / "exceptional" / "In summary" when the source is only nearby.

3. Evaluative claims after deletion moves CS_E3 cleanly (3/3 partial, explanations name the judgement clause). That matches short-prompt G's direction on judgement-like extras. It does not move EA_E2: the model still reads "key-person risk is limited" as supported by "no senior departures", not as an extra risk claim. Ranking (EA_E1) was already partial. Mark (EA_E3) stayed confirmed; no arm carried a mark rule, so that cell is vacuous for mark-rule evidence.

4. C also flipped F19_S7 vintage partial to confirmed. That is a real regression. Any rewrite that adds evaluative language must keep vintage/frame routing from being crowded out.

5. Saturation of additive rules on the full prompt (prior H) still stands. This probe adds: deleting the confirm-framing pile changes some classifications (framing controls), and evaluative language only lands once that pile is gone (CS_E3 on C). The governing problem is not "the model never listens"; it is "competing confirm-framing instructions and missing evaluative principles".

What I think is wrong in this spec:

- PASS gated on arm B alone assuming deletion-plus-one-sentence would free capacity and move exhibits. It did not. The interesting arm was C.
- Treating F01_S7 / F01_S10 / F04_S20 / F04_S13 as controls that "must stay confirmed" while deleting the examples they copy stacks the deck: those cells measure whether the replacement sentence is enough, which is useful, but a PARTIAL from those breaks was the expected risk, not a surprise.
- KILL as "deletion genuinely inert" would have been the wrong reading if the harness had required both exhibits for any move. Console first printed KILL; that was a harness bug. Correct rule application is PARTIAL. Live labels were not rerun.

Next step this evidence supports: a full principled rewrite (not a seven-line deletion patch). Keep modality, voice-not-conflict, period/vintage, entity roles, magnitude, procedural closer. Replace the seven-site pile with one framing principle strong enough for F01_S10 / F04_S20, plus an evaluative principle strong enough for CS_E3 and EA_E2, without letting evaluative language override vintage. Then full corpus gate.

Mechanism locations:

```
Prompt file (untouched): lib/qc/pipeline-v4/prompts/stage2_v4.md
Harness variants:        scripts/diagnostic/eval-ablation/run-seven-site-deletion.mjs
Backstops:               lib/qc/pipeline-v4/stage2-match-sources.mjs
Halden Meridian:         scripts/diagnostic/eval-ablation/meridian_source.txt
claim-spans E3 source:   scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt
```
