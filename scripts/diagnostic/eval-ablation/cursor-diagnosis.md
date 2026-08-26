# Noise floor measurement and Cursor diagnosis of false greens

Date: 2026-08-26
Harness: `scripts/diagnostic/eval-ablation/run-noise-floor.mjs`
Rows: `scripts/diagnostic/eval-ablation/noise-floor-rows.json`
Live prompt untouched.

## Scoreboard (updated)

Proven false greens by source read (5):
EA_E2, CS_E3, F01_S10, F04_S20, F12_S0 (new this pass).

```
arm       fixed  broken  net   notes
baseline  0      0       0
arm B     2      0       +2    F01_S10 F04_S20; EA_E2 CS_E3 F12_S0 still green
arm C     3      1       +2    +CS_E3; broke F19_S7 vintage; F12_S0 still green
arm D     3      7       -4    same three fixes; 5 of 7 MOVED unadjudicated
arm E     not run
arm G     not run
```

Noise floor (this pass): 2 of 23 unstable within one A x3 process.
Standing consequence (in force from here): every arm runs baseline x3; no effect
counts unless it exceeds this floor.

---

## Part 1: Noise floor from existing data (FREE)

### 1.1 Three prior arm A runs (cross-process)

Sources:
`seven-site-deletion-rows.json` (A r1),
`arm-d-examples-removed-rows.json` (A r1),
`arm-e-boundary-examples-rows.json` (A r1).

```
agree on all 3 probes: 22 of 23
disagree on any pair:  1 of 23  -> F12_S0
```

```
id      seven     armd      arme
F12_S0  confirmed confirmed partially_confirmed
```

CONFIRMED: only F12_S0 disagrees across the three stored A runs.
File: the three rows JSONs above, statementId F12_S0, variantId A.

All other 22 statements identical across the three A singles.

### 1.2 Disk cache current-promptHash multi-calls

```
path: scripts/diagnostic/.llm-cache.json
promptHash: c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe
stage2 entries: 643
unique inputText|sourceText keys: 643
keys with >1 entry: 0
```

CONFIRMED: the disk cache is content-addressed. Same statement x source x prompt
collapses to one entry. There is no multi-call agreement series to report for
current-promptHash pairs. Disagreement cannot be measured inside the cache; the
cache hides it.

### 1.3 system_fingerprint

Cross-process A (Parts 1.1):

```
all three probes: fp_17e3c4f467 only on the 23 graded-set A rows
F12_S0 disagreement: same fingerprint on confirmed and partial
```

Disk cache current-promptHash (643 rows):

```
fp_17e3c4f467  508
fp_64d0f9e03c   90
fp_684acb85fd   42
fp_2fe17714a7    2
fp_e160a45017    1
```

CONFIRMED: F12_S0 cross-process flip does not track fingerprint (same fp both
labels). HYPOTHESIS: cache fingerprint mix reflects corpus timing, not graded-set
label noise.

---

## Part 2: Within-process variance (BILLED)

```
prompt A  len=12451  sha256=c718c190... (matches live stage2_v4.md trim)
calls: 69 (23 x 3)
cost:  $0.812142
cache: OFF
fingerprint on all 69: fp_17e3c4f467
```

```
identical label on all 3 repeats: 21 of 23
noise floor:                    2 of 23
unstable: F12_S0, F08_S2
```

### Unstable statements (all three labels + explanations)

```
F12_S0
  r1 confirmed
     The source confirms that Meridian Capital has completed the sale of
     NorTech Industries to Brookfield this week, matching the statement.
  r2 confirmed
     The source confirms that Meridian Capital has completed the sale of
     NorTech Industries to Brookfield this week, matching the statement.
  r3 partially_confirmed
     The source confirms the sale completion but mentions an eighteen-month
     partnership, not more than four years as stated. The duration of the
     partnership is an additional checkable claim not covered by the source.
  source: scripts/diagnostic/sources/12_synth_linkedin_post.txt
```

```
F08_S2
  r1 conflicting
     The statement asserts a completed investment, while the source indicates
     the investment is still proposed and pending approval. This is a modality
     conflict.
  r2 partially_confirmed
     The source confirms the 78% controlling stake and the roles of the
     Schiller family and management. However, it does not confirm that the
     investment of EUR 480 million has been completed, as it is still seeking
     approval.
  r3 partially_confirmed
     The source confirms the 78% controlling stake and the roles of the
     Schiller family and management. However, it states the investment is
     proposed, not completed, and does not confirm the exact EUR 480 million
     investment as already made.
  source: scripts/diagnostic/sources/08_synth_industrial_buyout_memo.txt
```

### Standing consequence

From now on every arm runs its baseline x3, not x1, and no arm result counts as
an effect unless it exceeds the measured noise floor (2 of 23 unstable; effects
must be stable on the treatment arm and not attributable to a statement that is
unstable at baseline).

What that means for prior probes:

```
Seven-site "controls moved":
  F01_S10 / F04_S20 moved B/C 3/3. Those statements are STABLE on A x3
  (confirmed x3 here). Exceeds noise floor. Real effects.
  (They are also adjudicated false greens, so the move is a correction.)
  F04_S13 was unstable inside B and C (conf/conf/part). Do not cite as a
  clean control break.
  F08_S2 unstable inside C and at A noise floor. Discount C's third-repeat
  partial.

Arm D "7 controls moved":
  Stable 3/3 on D, and stable on A: F04_S13, F08_S0, F12_S1, F14_S11, F17_S9.
  Those five exceed the floor as D effects (still mostly UNADJUDICATED as to
  correct label).
  F12_S0 is in the noise floor at A; D's move does not exceed the floor.
  F04_S1 was unstable inside D (confl/confl/part); not a clean 3/3 effect.
```

CONFIRMED: method at three repeats is still sound for this set. Floor is 2/23,
not high enough to call the graded set unsound. Raise to 5 repeats only if a
claimed effect sits on F12_S0 or F08_S2.

---

## Part 3: Diagnosis (FREE, no model calls)

### 3.1 The mechanism

Why the prompt greens an evaluative claim next to a matching fact:

Primary cause (CONFIRMED in prompt text): a seven-site "confirm when checkable
facts match / framing does not block" cluster, especially:

```
L23 stage2_v4.md: confirmed includes "extra descriptive or framing words that
    are not additional checkable claims"
L25 stage2_v4.md: "Mere adjectives, voice, or richer wording around a supported
    claim stay confirmed"
L45-49 example 3: teaches 'In summary' and 'defensible' are NOT checkable claims
L154: if checkable facts match, classify confirmed even if explanation mentions
    extra wording
```

Inventory: `stage2-section-inventory.md` section 2 (seven sites).

What would kill this theory: deleting the whole cluster and still seeing the
same false greens. Evidence on disk: arm B deleted the cluster; F01_S10 and
F04_S20 moved to partial (seven-site-deletion-rows.json). Theory SURVIVES for
those two. EA_E2 and CS_E3 stayed confirmed on B, so the cluster alone is not
the full EA_E2/CS_E3 mechanism.

Secondary cause for CS_E3 (CONFIRMED by C vs B): missing evaluative principle.
Arm C = B + Evaluative claims moved CS_E3 to partial x3
(seven-site-deletion.md; rows). Kill test already run: without Evaluative
claims (B), CS_E3 stays green.

Secondary cause for EA_E2 (HYPOTHESIS): the model treats "means key-person risk
is limited" as entailed by "no senior departures", and Evaluative claims' test
("compared to what? / according to whom?") does not catch implication / risk
level as cleanly as ranking or "speaks well of judgement". Evidence: C and D
both carry Evaluative claims; EA_E2 stayed confirmed
(arm-d-examples-removed-rows.json). G moved EA_E2 on a 6-statement set
(short-prompt-rows.json E2/G), never measured on this 23-set. Kill test for
"boundary example is the mechanism": arm E was designed for that and was not
run. Still HYPOTHESIS.

Not the cause (CONFIRMED dead suspects): L154 alone; seven-site deletion alone;
worked-example mass alone (arm D KILL on EA_E2).

Code is not the greening mechanism. Backstops do not invent confirmed on these
exhibits. CONFIRMED: false greens are prompt-side.

### 3.2 Which conclusions survive the noise floor

Survive (stable effects, exceed floor):

```
B/C move F01_S10 and F04_S20 off confirmed (3/3): real; also correct by source
C/D move CS_E3 off confirmed (3/3): real; correct by source
C/D break F19_S7 to confirmed (3/3): real regression
D moves F08_S0, F12_S1, F14_S11, F17_S9, F04_S13 (stable on D): real D effects
EA_E2 confirmed on A/B/C/D: stable; the stubborn green is not noise
```

Probably noise or over-claimed:

```
F12_S0 as a clean "control moved" under D: in A noise floor
F04_S1 as a clean D move: unstable inside D
F04_S13 / F08_S2 as clean B/C breaks: within-arm instability
Any claim that arm A x1 "matched disk cache" proves zero process noise
G "moves EA_E2" as a graded-set result: never measured on the 23; six Meridian
  statements only (short-prompt-rows.json)
```

Method soundness: at 3 repeats, floor 2/23, method is sound for stable cells.
Not unsound. Do not need 5+ repeats for the whole set unless chasing F12_S0 /
F08_S2.

### 3.3 G's example 3 vs F04_S20

G example 3 (verbatim from arm-e report / run-short-prompt.mjs):

```
Statement: 'In summary, the Company combines a defensible competitive position
in a specialised vertical with high switching costs.'
Source: 'NSH occupies a strong position in a deeply specialised vertical with
high switching costs.'
Correct classification: confirmed
Reasoning: ... 'defensible' do not add a separate checkable claim.
```

F04_S20 statement:

```
In summary, the Company combines exceptional engagement, a defensible consumer
position, and a founder team in which we have high conviction.
```

F04 source (`04_synth_vc_pinterest_style_memo.txt` line 50):

```
Defensibility is uncertain. The visual discovery mechanic is not patented. ...
Whether these prove durable ... is uncertain.
```

CONFIRMED: same shape (In summary + defensible + supported other facts). On
F04 the source affirmatively undercuts defensibility. Example 3 teaches the
model that "defensible" is framing. That teaching is exactly wrong for F04_S20.

Would G keep F01_S10 / F04_S20 green? HYPOTHESIS leaning yes for F04_S20: G
still ships example 3 and still has L23-style framing language in
CLASSIFICATION_DEFS_G. F01_S10 may still green for the same reason. That wounds
G as the target shape: G can fix EA_E2-class risk on a tiny set while baking in
the F04 false-green lesson. G is a clue, not a ship target.

### 3.4 Arm E rebuilt as D + example 3c only

Agree, with one add.

```
Agree: drop example 1 (rounding; irrelevant to evaluative).
Agree: drop example 3 (teaches the F04 false green).
Agree: keep 3c (ranking boundary for the evaluative principle).
```

Add: also write one explicit vintage-beats-evaluative sentence, or F19_S7 will
regress again the moment Evaluative claims is present (C/D already showed this).
3c alone does not fix vintage.

### 3.5 Percent regex bug (do not fix this pass)

`extractPercents` in `stage2-match-sources.mjs` (~L558):
`/(\d+(?:\.\d+)?)\s*(?:%|per\s?cent)\b/gi`
`\b` after `%` fails, so `"40%"` extracts nothing.

Corpus counts (claim-spans `.baseline.json` + fixture sources):

```
baseline statements (n=296):
  % symbol only:     32 statements (35 hits)
  spelled only:      44 statements (67 hits)
  both forms:         0
  no percent form:  220

baseline Stage 2 passages with text (n=347):
  % symbol only:     79 passages (121 hits)
  spelled only:      26 passages (36 hits)
  both:               0
  neither:          242
  empty passage:     13

fixture source files loaded (n=26):
  % symbol only:     17 files (275 hits)
  spelled only:       2 files (14 hits)
  both:               1 file
  neither:            6 files
```

CONFIRMED: sources and returned passages prefer `%`. The backstop is blind on
the dominant corpus form. Statement side often uses spelled "percent", so
statement figures extract while passage figures do not (arm D F17_S9 pattern).

Would I fix it now as its own commit? Yes, separately, after this diagnosis
lands. Blast radius: any Stage 2 path using `hasEgregiousMagnitudeGap` /
rounding backstop on percent figures; can newly force conflicting where passage
used `%` and the model returned partial/confirmed. Gate: existing B48 magnitude
tests + F17_S9 replay (arm A and arm D passage) + a unit test that `"40%"` and
`"18%"` extract. Do not bundle with a prompt rewrite.

### 3.6 Where Claude (and the arc framing) has been wrong

Known, restated:

```
Pass conditions around one stubborn sentence (EA_E2), so B/C fixing three false
greens read as failures.
Vintage explanation from a source date never read (prior arc; corrected in
arm-d Part 1).
Code backstops described as guarantees (corrected in arm-e Part 1).
Baseline run once where it should be x3 (this pass measures the cost).
```

More, from this read:

```
1. Planted example copies treated as HOLD controls (F01_S7, F04_S13, F04_S1,
   F08_S0, ...). Deleting the example and watching the plant flip is not a
   product regression; it is a memorisation check. Specs called those breaks.
2. G's reputation from six Meridian statements, then used as the rewrite
   target, before any control column. That inverted evidence standards.
3. Stopping E/G billing on F12_S0 drift when F12_S0 was UNADJUDICATED and is
   now shown to be noise-floor unstable. Correct under the written rule;
   the rule was over-strict for an unadjudicated soft baseline.
4. Scoreboard "broken" counted false-green corrections as breakage until
   Part 1 adjudication. Net +2 on B was available earlier if labels had been
   read against source first.
5. Treating "length" and "boundary example" as the live fork while example 3
   inside G teaches a proven false green. The fork was mis-specified.
```

### 3.7 The off-ramp

Straight recommendation: do not ship arm C as-is. Do not keep open-ended
nested ablation (E/G/E2/...) for another day.

```
Why not ship C:
  EA_E2 still green (the user-visible risk false green).
  F19_S7 vintage regression is real and stable.
  F12_S0 still green (fifth false green).
  Solo operator, ~$3.81 + $0.81 already, two days.

Why not endless diagnosis:
  Dead suspects are dead. Mechanism for F01/F04/CS is known well enough to write.
  EA_E2 still needs a sharper implication/risk rule; that is a rewrite sentence,
  not another 23x3 arm tree.

What to do instead: write the rewrite from C's shape (cluster gone + Evaluative
claims), with three edits before any corpus gate:
  (1) vintage/frame outranks evaluative
  (2) example 3c only (no example 3)
  (3) one implication/risk sentence aimed at EA_E2 ("means X risk is limited"
      is a checkable claim unless the source states that risk level)
Then one full-corpus gate. Cost beats another ablation week.
```

### 3.8 What I would do next

Not another nested arm. Next step: author the rewrite prompt in-harness (not
editing `stage2_v4.md` until gate passes), run A x3 + Rewrite x3 on the 23
(~$1.60, ~25 min), then if primary pass, corpus gate.

Falsifiable stopping rule:

```
CONFIRM: all five false greens off confirmed on >=2/3
         AND F19_S7 holds partially_confirmed on >=2/3
         AND every A-stable control holds baseline on >=2/3
KILL:    EA_E2 still confirmed on >=2/3 after the implication/risk sentence
         -> stop inventing arms; change the product rule (e.g. structured
            claim-type pre-tag) rather than more prose.
```

Predicted cost ~$1.60 for the 23-set; corpus gate extra if CONFIRM.

### 3.9 Anything we have not asked

```
1. F08_S2 noise means modality "invested" vs "proposed" is soft under this
   prompt even at temperature 0. Shipping modality changes without a
   deterministic backstop for completed-action verbs will flap in production.
2. The graded set still under-weights mark/unrealised (EA_E3 recorded only).
   A rewrite that fixes judgement and risk can still green marks.
3. Example 3 in the LIVE prompt (not only G) is an active false-green teacher
   for every production call. Deleting or rewriting L45-49 is higher leverage
   than another Meridian-only probe.
4. Disk cache cannot measure noise. Live x3 is mandatory for claims; cache
   replay is fine for backstop math only.
```

---

## Part 4: Adjudicate F12_S0

Statement:

```
After more than four years of partnership, Meridian Capital has completed the
sale of NorTech Industries to Brookfield this week.
```

Source (`scripts/diagnostic/sources/12_synth_linkedin_post.txt`), full relevant
lines:

```
After eighteen months of work alongside the team, I'm delighted that Meridian
Capital has completed the sale of NorTech Industries to Brookfield this week.
...
When we acquired NorTech in 2021 it was an excellent company ...
Four and a half years later it is a genuinely international business ...
```

Verdict:

```
correct label: partially_confirmed
baseline confirmed: FALSE GREEN (fifth proven)
adjudication: EXHIBIT_ADJUDICATED_FALSE_GREEN
```

Reasons:
Sale completion matches. The statement's lead-in duration parallels the source
lead-in ("After …") but swaps eighteen months for more than four years. That is
a checkable duration claim the parallel sentence does not support. The later
"four and a half years later" since 2021 acquisition is a different sentence
about company transformation, not a licence to rewrite the opening duration.
Confirming the whole statement is wrong.

CONFIRMED by source text above; noise-floor r3 explanation names the same gap.
r1/r2 confirmed shows the false green is intermittent, which is why this cell
is also in the noise floor.

Recorded in harness `run-noise-floor.mjs` graded set with the same marking as
F01_S10 / F04_S20.

---

## Assessment

The measuring instrument works: 21/23 stable at A x3. Prior B/C exhibit moves
and the F19_S7 regression survive. D's control carnage is mostly real but two
of seven were soft. The false-green mechanism for F01/F04 is the confirm-framing
cluster plus example 3's "defensible" lesson; for CS_E3 it is that cluster plus
missing evaluative principle (fixed by C). EA_E2 still needs an implication/risk
rule that Evaluative claims does not currently deliver. G is compromised as a
target shape because it teaches example 3. Next move is a rewrite, not arm E.
