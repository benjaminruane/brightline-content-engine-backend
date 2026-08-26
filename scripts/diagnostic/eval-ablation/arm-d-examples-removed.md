# Arm D examples-removed probe and moved-control adjudication

Live prompt `lib/qc/pipeline-v4/prompts/stage2_v4.md` untouched. Fixtures untouched.

Harness: `scripts/diagnostic/eval-ablation/run-arm-d-examples-removed.mjs`
Rows: `scripts/diagnostic/eval-ablation/arm-d-examples-removed-rows.json`
Prior probe: `seven-site-deletion-rows.json` (SHA c2b202f)

Ran 2026-08-26. Model openai/gpt-4o. Cache OFF. Seed 1. Temp 0.
Cost: $0.87 for 92 calls (A 23 + D 69).

Backstops after each parse (same order as production): rounding then period gate.

Note on prior probe labelling: seven-site console first printed KILL; corrected verdict was PARTIAL. Spec context here says KILL for C on EA_E2; that is right for the gated exhibit. The cluster is eliminated as the cause of EA_E2 staying confirmed.

---

## PART 1: Adjudication of F01_S10, F04_S20, F19_S7

No model calls. Sources and explanations from seven-site-deletion-rows.json and source files.

### F01_S10

```
Statement:
In summary, Shopify combines exceptional unit economics, a defensible competitive
position, and clear growth runway.

Source file:
scripts/diagnostic/sources/01_bvp_shopify_memo.txt

Matched passage (arm A):
We are enthusiastic about the potential for Shopify to disrupt existing solutions
with a consumer-like product that has resonated with customers and enabled the
company to demonstrate strong organic growth. Further, uptake of the App Store
by both third-party developers and customers provides differentiation and a path
to break away from the pack.

Surrounding (Conclusion section): same paragraph; ends "We recommend this
investment." Elsewhere the memo says the business is profitable and largely
bootstrapped. It never uses "unit economics", "defensible", or "moat".

Arm A explanation:
The source supports the statement by highlighting Shopify's strong growth,
competitive differentiation through its App Store, and its potential to disrupt
existing solutions, aligning with the statement's claims of exceptional unit
economics, a defensible position, and growth runway.

Arm B (r1): partially_confirmed
  Source supports product appeal / growth; does not explicitly mention a
  defensible competitive position.
Arm B (r2/r3): partially_confirmed
  Does not explicitly mention exceptional unit economics.
Arm C: partially_confirmed (same shape; unit economics called an additional
  checkable claim).
```

Assessment (mine): baseline CONFIRMED is wrong. Arm B/C PARTIAL is correct.
"Exceptional unit economics" is a checkable claim. The source never states it.
"Defensible competitive position" is also stronger than "differentiation" /
"break away from the pack". The baseline treated summary adjectives as framing
because the old cluster told it to. That was a false green.

### F04_S20

```
Statement:
In summary, the Company combines exceptional engagement, a defensible consumer
position, and a founder team in which we have high conviction.

Source file:
scripts/diagnostic/sources/04_synth_vc_pinterest_style_memo.txt

Matched passage (arm A):
What gives us conviction is the depth of user engagement we have observed.
... The founders are exceptional. ... We have high conviction in Ben and Evan
as builders.

Surrounding (same memo, Defensibility section):
"Defensibility is uncertain. The visual discovery mechanic is not patented.
We see two potential sources of competitive moat..."
Also: "the engagement metrics are exceptional".

Arm A explanation:
Source confirms exceptional engagement and high conviction in the founder team.

Arm B: partially_confirmed
  High conviction / engagement supported; defensible consumer position not
  explicitly mentioned.
Arm C: partially_confirmed
  Same; C r1/r3 note the source discusses defensibility as uncertain.
```

Assessment (mine): baseline CONFIRMED is wrong. Arm B/C PARTIAL is correct.
Engagement and founder conviction are supported. "Defensible consumer position"
is not: the source says defensibility is uncertain. Confirming that clause is a
false green. The move to partial is a correction, not a regression.

### F19_S7

```
Statement:
Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel
volume environment (European parcel volumes down 3 percent year-on-year); the
Company has nevertheless gained share, with revenue up 6 percent, but EBITDA
margins have compressed from 14 to 12 percent.

Source file:
scripts/diagnostic/sources-extracted/19_synth_annual_report.txt
(from 19_synth_annual_report.pdf)

Matched passage (all arms):
Drift Logistics had a mixed 2025. The European parcel volume environment has been
softer than expected, with overall European parcel volumes down approximately 3%
year-on-year. The Company has nevertheless gained share, with revenue growing 6%
against the negative market backdrop. EBITDA margins have been pressured by
overcapacity in the market and have compressed from 14% to 12% year-on-year.

Surrounding:
Investment date: April 2024 ... Status: Active, year 2 of hold
... expect 2026 to remain difficult.

Period markers in the STATEMENT:
  2024 (investment vintage: "our 2024 ... investment")
  year-on-year (on parcel volumes; no calendar year named for the metric itself)

Period markers in the SOURCE PASSAGE / surround:
  April 2024 (investment date)
  2025 ("mixed 2025" heading the operating narrative)
  year-on-year (parcel volumes, revenue backdrop, EBITDA)
  2026 (outlook)

Does the source give a period for the parcel-volume figure?
YES. The 3% decline sits under "mixed 2025" as the operating year of that
metric. 2024 in the statement is investment vintage, not the metric year.

Arm A / B: partially_confirmed (vintage vs operating mismatch named).
Arm C: confirmed (figures match; vintage mismatch ignored).
```

Assessment (mine): baseline / arm B PARTIAL is correct. Arm C CONFIRMED is wrong.
This is a real regression under Evaluative claims, not a false-green correction.
R2.7.2 vintage vs operating routing is load-bearing here.

### Part 1 summary

```
F01_S10  baseline false green; B/C partial is the right label
F04_S20  baseline false green; B/C partial is the right label
F19_S7   baseline partial is right; C confirmed is a regression
```

The control column in Part 2 treats these three as DISPUTED, not as HOLD/MOVED failures.

---

## PART 2: Arm D

### Arm hashes and lengths

```
A  len=12451  sha256=c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
B  len=10908  sha256=3bc32399628f3cb22b9eeec9fafe1daf6d763aeb55e10a0c65f148cc4cfeefc2
C  len=11488  sha256=4ca79b210193e9f5a58d7bf78a1be70903402ef221e4d27f06a6b59a97c0c6b4
D  len=6052   sha256=bd1b4b2fea1716b75992b3bd80eb9a0b03db06d92289856ebd663065f3321367
```

A/B/C hashes match the seven-site probe exactly. D is distinct.
Short prompt G (for reference): len=4195. D is ~1857 chars longer than G.

### Pointer replacements (verbatim)

```
FROM: classify confirmed (example 1).
TO:   classify confirmed.
NOTE: Numeric rules: drop pointer to rounding example; surrounding sentence already states the rule

FROM: is conflicting (example 10), including
TO:   is conflicting, including
NOTE: Numeric rules: drop pointer to magnitude example; surrounding sentence already states the rule

FROM: is conflicting (example 9), not voice.
TO:   is conflicting, not voice.
NOTE: Voice: drop pointer to completed-action modality example; surrounding sentence already states the rule

FROM: not a modality conflict (example 9b).
TO:   not a modality conflict.
NOTE: Voice: drop pointer to cover/opener example; surrounding sentence already states the rule

FROM: is conflicting (examples 7 and 8).
TO:   is conflicting.
NOTE: Entity roles: drop pointer to entity-swap and ownership-swap examples; surrounding sentence already states the rule
```

No new rules added. No dangling example pointers remain.

### Drift check (arm A x1)

PASS. All 23 matched the 2026-08-26 seven-site arm A labels.

### Grid (narrow codes: conf / part / confl / nosup)

```
stmt      A       D1    D2    D3
EA_E2     conf    conf  conf  conf
CS_E3     conf    part  part  part
EA_E3     conf    conf  conf  conf
EA_E1     part    part  part  part
F01_S7    conf    conf  conf  conf
F01_S10   conf    part  part  part     DISPUTED
F04_S20   conf    part  part  part     DISPUTED
F04_S13   conf    part  part  part     MOVED
F12_S0    conf    confl part  part     MOVED
F04_S1    conf    confl confl part     MOVED
F08_S0    conf    confl confl confl    MOVED
F92_S0    conf    conf  conf  conf     HOLD
F14_S4    part    part  part  part     HOLD
F19_S7    part    conf  conf  conf     DISPUTED
F12_S1    part    conf  conf  conf     MOVED
F14_S11   part    confl confl confl    MOVED
F18_S6    part    part  part  part     HOLD
F15_S2    confl   confl confl confl    HOLD
F05_S5    confl   confl confl confl    HOLD
F17_S9    confl   part  part  part     MOVED (backstop did NOT hold)
F08_S2    confl   confl confl confl    HOLD
F01_S11   nosup   nosup nosup nosup    HOLD
F90_S0    nosup   nosup nosup nosup    HOLD [period gate; pre=conflicting]
```

### Control column (the finding)

```
HOLD (rule blocks alone enough):
  F01_S7   headroom framing near-copy stays confirmed
  F92_S0   approx customers stays confirmed
  F14_S4   narrower product stays partial
  F18_S6   extra pillars stay partial
  F15_S2   invested vs seek stays conflicting
  F05_S5   ownership swap stays conflicting
  F08_S2   invested modality stays conflicting
  F01_S11  procedural closer stays no_support
  F90_S0   period mismatch final no_support (gate-held)

MOVED (jobs that need a written principle, or lost example case law):
  F04_S13  8 employees near-copy of deleted 3b -> partial
  F12_S0   voice control; D also flags "four years" vs source "eighteen months"
  F04_S1   committed deal terms -> modality conflict (def says do not; example 11c was teaching)
  F08_S0   cover / new investment -> conflict (def says do not; example 11b was teaching)
  F12_S1   Nordics scope partial -> confirmed (scope job lost)
  F14_S11  future intent / not in dialogue -> conflict (related-partial job lost)
  F17_S9   magnitude 40 vs 18 -> partial (model reframed as lease-roll vs reversion;
           magnitude backstop did not force; example 12 was teaching)

DISPUTED (Part 1):
  F01_S10  partial is likely correct (false green at baseline)
  F04_S20  partial is likely correct (false green at baseline)
  F19_S7   confirmed is wrong (vintage regression under evaluative pressure)
```

### Gated exhibit explanations

```
EA_E2 (eval-ablation E2; meridian_source.txt):
  A/D all confirmed.
  Explanation stable: no senior departures supports team stability and limited
  key-person risk. Evaluative claims did not reclassify "key-person risk is limited".

CS_E3 (claim-spans E3; source_ic_memo.txt):
  A confirmed (figures match).
  D partially_confirmed x3: MOIC figures confirmed; manager's judgement is an
  additional evaluative claim the source does not address.
```

### Stopping-rule verdict

KILL

```
PRIMARY requires EA_E2 off confirmed >=2/3 AND CS_E3 off confirmed >=2/3.
  EA_E2: confirmed x3. Failed.
  CS_E3: partially_confirmed x3. Held off confirmed.
  PRIMARY false -> KILL.
```

Reading per the written rule: the worked examples are not the cause of EA_E2
staying confirmed. Removing them (D at 6052 chars) still leaves EA_E2 green.
CS_E3 continues to move once Evaluative claims is present without the
confirm-framing pile, matching arm C.

What still differs between D (6052) and G (4195), about 1857 characters:

```
Present in D, absent from G:
  Full periodAssessment JSON field docs + role paragraph
  Passage rule
  Numeric rules block
  Frame and period block
  Voice block (amended)
  Entity roles block
  Mixed statements block (amended)
  Parent sentence line
  Passage length cap
  Replacement sentence (arm B)
  Amended classification defs (framing clauses removed)

Present in G, absent from D:
  Original classification defs (still include framing / mere-adjectives language)
  Three worked examples only: rounding (1), framing In-summary (3), ranking (3c)
  JSON key order with explanation before classification
  No Numeric / Frame / Voice / Entity / Mixed / Parent / length blocks
```

The EA_E2 gap is therefore not "examples vs no examples". Both C (with examples)
and D (without) fail EA_E2 while G succeeds. The remaining delta is the mass of
rule blocks D still carries, plus G's ranking example and short overall shape.

---

## Assessment

Part 1 first: F01_S10 and F04_S20 were bad controls. Their baseline greens were
false. Treating B/C partial as breakage overstated how load-bearing the cluster
was for those two. F19_S7 is the opposite: C/D confirmed is a real vintage
regression under Evaluative claims.

Part 2: KILL on EA_E2 is the headline. Deleting the example pile does not free
enough capacity for Evaluative claims to reclassify key-person risk. Judgement
(CS_E3) keeps moving; risk-implication (EA_E2) does not. That split matters for
the rewrite: evaluative language that works for "speaks well of judgement" is
not automatically enough for "means key-person risk is limited".

The control column is the real specification dump:

```
Jobs the rule blocks alone HOLD:
  modality on invested (F15_S2, F08_S2)
  ownership swap (F05_S5)
  narrower product (F14_S4)
  procedural closer (F01_S11)
  simple headroom framing (F01_S7)
  approx qualifier (F92_S0)

Jobs that BREAK without examples (rewrite must write a principle, not a story):
  cover / "new investment" is not modality conflict (F08_S0)
  "committed" is not closed-transaction modality (F04_S1)
  magnitude same-metric beyond rounding (F17_S9)  [backstop failed to save it here]
  scope-broadening Nordics (F12_S1)
  related future-intent vs silence-in-dialogue (F14_S11)
  voice / person (F12_S0)  [also a real duration mismatch the baseline missed]
  checkable-count paraphrase (F04_S13)
  vintage vs operating must beat evaluative pressure (F19_S7)
```

What I think is wrong in this spec:

1. Calling the seven-site result KILL in the CONTEXT line. Corrected it was
   PARTIAL. Harmless for this probe's logic (EA_E2 on C failed either way).
2. PASS assumed examples were dead weight. The control column shows the opposite
   for cover, committed, magnitude, scope, and dialogue. Examples were carrying
   those jobs. Deletion-only rewrite is not supported.
3. F12_S0 as a pure "voice" HOLD target is under-specified: the draft's "more
   than four years" vs source "eighteen months" is a real factual gap. D's move
   is not only voice-regression.

Next step this evidence supports: a full principled rewrite, not example
deletion. Keep short. Write explicit principles for the MOVED jobs above.
Keep Evaluative claims for CS_E3-class extras. Add a sharper form for
risk/implication claims like EA_E2. Keep vintage above evaluative. Then full
corpus gate.

Mechanism locations:

```
Prompt file (untouched): lib/qc/pipeline-v4/prompts/stage2_v4.md
Harness:                 scripts/diagnostic/eval-ablation/run-arm-d-examples-removed.mjs
Backstops:               lib/qc/pipeline-v4/stage2-match-sources.mjs
Halden Meridian:         scripts/diagnostic/eval-ablation/meridian_source.txt
claim-spans E3 source:   scripts/diagnostic/claim-spans/evaluative-accident/source_ic_memo.txt
Short G reference:       scripts/diagnostic/eval-ablation/run-short-prompt.mjs / short-prompt-rows.json
```
