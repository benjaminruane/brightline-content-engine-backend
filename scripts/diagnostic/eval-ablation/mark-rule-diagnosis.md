# Mark rule diagnosis: why R5 did not move EA_E3

Free pass. No model calls. Live prompt, fixtures, baselines, and code untouched.
Source of truth for Stage 2 labels on the 364-pair set: `r3a-corpus-blast-rows.json` (frozen baseline and disk cache are STALE).

EA_E3 identity: eval-ablation Meridian statement ("Fund IV has returned 1.9 times...") vs `meridian_source.txt`. Not claim-spans CS_E3 / `source_ic_memo.txt`.

## Scoreboard

```
arm   EA_E3 off conf  five holds  F19 hold  indep holds  verdict
R3a   no              yes         yes      yes         reference (shipped)
R5    no              yes         yes      yes         PARTIAL (0c23c51)
```

R5 cost and hashes: see `r5-mark-rule.md`. Live `stage2_v4.md` was not edited by R5.

---

## 1. Prompt lines that can pre-empt a basis distinction

Read first from live `lib/qc/pipeline-v4/prompts/stage2_v4.md` (line numbers as in file).

```
L23  • "confirmed" — on a like-for-like basis (same metric, same frame, same
     entity-role), the source states the same substance as the statement,
     including paraphrase, formatting, correct rounding.

L25  • "partially_confirmed" — ... OR there is a frame/period-role mismatch
     (vintage vs operating year; revenue vs GMV), OR ...

L27  • "conflicting" — ... a status/modality contradiction only when the draft
     asserts a definite completed action using invested, acquired, completed,
     sold, or exited, ... that the source directly shows as proposed,
     recommended, sought, or not yet done.

L31  Wording that adds no new checkable claim, including paraphrase,
     formatting, correct rounding, voice, and descriptive adjectives, does not
     by itself block confirmed.

L33-34  Frame and period priority
     Judge the period, vintage, duration or frame ... before judging its
     figures or its evaluative wording. ... partially_confirmed even when
     every figure matches ...

L45-48  Example 3c (both sides use "returned"):
     Statement: 'The fund returned 2.4x gross MOIC, ...'
     Source: 'The fund returned 2.4x gross MOIC across seventeen exits.'
     Reasoning: The MOIC matches. ...

L130-131  Numeric rules
     Exact figures confirm. Formatting differences confirm ($132mm and
     $132 million).
```

What these lines do together (reading, not yet adjudication):

- L23 + L31 invite treating verb swaps as paraphrase when metric/frame/entity-role look the same.
- L27 lists completed-action verbs for modality conflict. `returned` is not on that list. Mark versus return cannot fire the conflict path as written.
- L25 names frame mismatches as vintage vs operating year and revenue vs GMV. Realised versus mark is not named.
- L45-48 teach `returned` as ordinary performance language that confirms when the figure matches.
- L131 says exact figures confirm, with no basis carve-out.

R5's sentence sat under Frame and period priority (after L34 in the harness file `mark-rule-r5.txt`), which is after L23 and L31.

---

## 2. Adjudication of H1 through H4

### H1 PARAPHRASE CLAUSE

Status: HYPOTHESIS (strong). Not CONFIRMED as the sole cause.

Evidence that keeps it alive:

- CONFIRMED L23 and L31 exist and explicitly protect paraphrase on like-for-like / "no new checkable claim".
- CONFIRMED R5 EA_E3 explanations (all three) still say the statement matches exactly while naming the source verb `marked` (`r5-mark-rule-rows.json`, EA_E3, variantId R5). That is the behaviour you would expect if paraphrase absorption wins.
- CONFIRMED R5 wording never amended L23 or L31; it only appended under Frame.

What stops CONFIRMED: we did not run a controlled arm that only amends the paraphrase clause. Competing pre-emptors (L131 exact figures; example 3c; soft R5 wording) are also live.

### H2 NORMALISATION

Status: HYPOTHESIS.

Evidence:

- CONFIRMED R3a EA_E3 explanations talk about "the same figures" and never mention `marked` or `returned`.
- CONFIRMED R5 EA_E3 explanations rewrite into source language (`marked at`) and then confirm.
- That is consistent with comparing a normalised claim to the source rather than comparing verbs. It does not prove the model never saw both verbs; it proves the explanation path collapsed them.

### H3 SATURATION

Status: REFUTED as total inertness. HYPOTHESIS only as mild capacity pressure.

Evidence that kills total inertness:

- CONFIRMED `r5-mark-rule-rows.json`: across 69 statement x run cells, labels same/diff = 61/8; explanations same/diff = 24/45; passages same/diff = 61/8.
- CONFIRMED label moves: F04_S13 conf->part (x3); F92_S0 part->conf (x3); F08_S2 noise flap on two runs.
- CONFIRMED EA_E3 labels held confirmed while explanations shifted (R3a "same figures" -> R5 "marked at ... matching the statement exactly").

An explanation shift with held labels is the opposite of a dead prompt. R5 was heard; it was not obeyed on the primary.

The "R3a is 12812 chars; saturated prompt was 12451" size argument remains a weak HYPOTHESIS only. Size did not prevent label or prose movement on this run.

### H4 PLACEMENT

Status: HYPOTHESIS (weak). Not the best first fix.

Evidence:

- CONFIRMED R5 landed under Frame and period priority, after L31 paraphrase protection (`mark-rule-r5.txt` lines 33-35).
- CONFIRMED the classification definitions (L23, L31) sit earlier than Frame. If the model resolves "paraphrase / same substance" at definition time, a later Frame sentence is late.
- CONFIRMED prior Variant H on the old prompt moved Evaluative claims earlier and did not move E2 (`stage2-section-inventory.md` finding 3). That was a different rule on a different prompt. Treat as weak analogy only.

Structure says "earlier than L23/L31" would matter more than "earlier inside Frame". Moving the same soft sentence up without amending L23/L31 is unlikely to beat R5.

### Additional hypotheses

H5 SOFT WORDING / UNNAMED VERBS. Status: CONFIRMED as a failure mode of this rung (not as the only cause).

- CONFIRMED R5 text says "completed or realised" and "current position, a valuation or an estimate" (`mark-rule-r5.txt` L35). It does not say `returned` or `marked at`.
- CONFIRMED the live exhibit uses exactly those verbs (`EA_E3` statement / `meridian_source.txt` passage in `r5-mark-rule-rows.json`).
- CONFIRMED the model already surfaces `marked` in the R5 explanation and still confirms. Soft category language is not binding here.

H6 FIGURE-MATCH TRAINING. Status: HYPOTHESIS (strong, jointly with H1).

- CONFIRMED L131 "Exact figures confirm."
- CONFIRMED example 3c trains `returned` + matching MOIC as the path to a figure match (partial only for the ranking clause).

H7 MODALITY LIST OMISSION. Status: CONFIRMED as a gap, not as proof of cause.

- CONFIRMED L27 completed-action list is invested / acquired / completed / sold / exited. `returned` is absent. Basis mismatch cannot ride the modality-conflict path as written.

---

## 3. Verify the zero

Claim under test: "NOT ONE CELL MOVED, in either direction, anywhere on the 23-statement graded set plus EA_E3."

Cell-by-cell compare inside `r5-mark-rule-rows.json` (R5 vs R3a, same statementId and runIndex):

```
cells compared: 69
labels       same 61  diff 8
explanations same 24  diff 45
passages     same 61  diff 8
```

Label diffs (CONFIRMED):

```
F04_S13|0..2  confirmed -> partially_confirmed
F92_S0 |0..2  partially_confirmed -> confirmed
F08_S2 |1     conflicting -> partially_confirmed
F08_S2 |2     partially_confirmed -> conflicting
```

Scoreboard PRIMARY and HOLDs (EA_E3, five shipped fixes, F19_S7, independent controls) did hold their majority labels. That is what the R5 report meant by PARTIAL with HOLDs intact. It is not total inertness.

EA_E3 specifically:

```
labels:        R3a conf/conf/conf  R5 conf/conf/conf  (held)
explanations:  R3a identical x3 "same figures..."
               R5 identical x3 "marked at ... matching the statement exactly."
```

Finding: explanation shift with no label change on the primary. That points away from saturation and toward a rule the model can recite around without obeying.

---

## 4. Where R5 landed, and where it would need to sit

CONFIRMED position in harness prompt `mark-rule-r5.txt`:

```
after L31 paraphrase / "does not block confirmed"
under heading "Frame and period priority"
immediately after the existing frame paragraph
before "Evaluative claims"
```

A position that would be read before the likely pre-emptors:

```
1. Inside the confirmed definition (L23): carve basis out of "including paraphrase"
2. Inside L31: same carve-out
3. Inside partially_confirmed (L25): name realised-vs-mark beside vintage/GMV
4. Optional worked example before Numeric rules, using returned vs marked at
```

Moving the current soft sentence earlier inside Frame, or above Evaluative claims, is a weak candidate. Variant H already showed additive relocation on the old prompt was inert for a different exhibit. Amend the definitions that absorb the verb difference; do not only relocate the loser sentence.

---

## 5. Size the code route (disk only)

Deterministic rule under test:

```
statement contains a realised form
  (returned | realised | realized | delivered | generated | distributed | achieved)
  near a performance figure cue (moic | irr | dpi | tvpi | multiple | times | Nx)
AND model passage contains a mark form
  (marked at | valued at | carried at | held at | unrealised | unrealized | estimated)
```

Scan: unique R3a pairs in `r3a-corpus-blast-rows.json` (364).

```
fires: 0
```

Loose `returned` in statement AND `marked` in passage: also 0.
Refined lists (`has returned`, `currently marked`, `estimated at`): still 0.

Side counts (not fires):

```
statements with a realised verb: 7
  nordholt-clean:S0 x4 (generated; labels mix no_support / confirmed / partial)
  F15:S7 (generated; confirmed; EBITDA "generated by")
  F17:S2 (distributed; confirmed; area "distributed across")
  F19:S2 (generated; conflicting; exit "generated a 3.56x")

passages with a mark form: 4
  F17:S6 / F17:S9 (estimated; confirmed / conflicting)
  F19:S1 (Estimated header near IRR/MOIC; confirmed)
  E3:S0:ic_memo (marked at; partially_confirmed)
    NOTE: this is claim-spans style E3 overlay on mark language,
    not eval-ablation EA_E3.
```

EA_E3-like "has returned 1.9" pairs in the 364: **0**.

On the graded-set row itself (`r5-mark-rule-rows.json` EA_E3), the same word lists fire cleanly: statement `returned`, passage `marked at`.

Word-list refinements worth keeping if a gate is built later:

```
keep: returned, realised/realized, marked at, valued at, carried at, held at,
      unrealised/unrealized, currently marked
drop or gate hard: generated, distributed, estimated
  (false-friend risk: "EBITDA generated by", "area distributed across",
   "reversion is estimated at" without a realised claim in the statement)
require performance figure near the realised verb (MOIC/IRR/Nx/%), not merely
somewhere in the statement
```

Plain finding: **EA_E3 is the only known fire in the measured world.** The 364-pair corpus does not contain this accident. Any code gate that is only regression-tested on that corpus will look green forever until EA_E3 (or a twin) is staged as a fixture.

False positives on current corpus under the full AND rule: none (vacuous). False-friend risk appears only if the AND is weakened.

---

## 6. Recommendation

Do not ship R5. Do not spend another soft Frame sentence.

Preferred next spend: **prompt route that beats R5 by amending the pre-emptors**, not by stacking after them.

Exact change I would measure (one arm, named verbs, no sixth abstract rule):

```
1. Amend L23: like-for-like includes metric AND basis (realised vs mark /
   valuation / estimate). Paraphrase does not cover a basis swap.
2. Amend L31: wording/paraphrase carve-out does not apply when the statement
   uses a realised performance verb and the source uses mark / valuation /
   estimate language for the same figure.
3. Amend L25: add realised-vs-mark beside vintage and revenue-vs-GMV.
4. Add one short worked example: statement "has returned 1.9x..." / source
   "currently marked at 1.9x..." -> partially_confirmed.
```

Why this should beat R5: R5 lost to lines we already wrote (L23/L31/L131/example 3c). The model already sees `marked`. The failure is definitional absorption, not attention. Naming the live verbs closes H5. Amending paraphrase closes H1. The example blocks H6's figure-match training.

Code route: sized and cheap (0 corpus fires), but **premature as the only fix** until EA_E3 is staged in a fixture. Without that fixture the gate cannot catch a regression. Reasonable sequence: stage the fixture (free), measure the hard prompt arm, then add a narrow deterministic backstop if the prompt still flaps.

I would not run another placement-only arm. I would not run another abstract "basis" sentence under Frame.

---

## 7. Where Claude has been wrong in this stretch

Known (your list):

- Writing an experiment spec before diagnosing.
- Bundling sources-drawer work into a paste when only "eventually" was asked.

Additional:

- Treating "NOT ONE CELL MOVED" as total inertness. CONFIRMED false on `r5-mark-rule-rows.json` (8 label diffs, 45 explanation diffs). The scoreboard HOLDs held; the matrix did not freeze.
- Leading with saturation (H3) after R5 explanations already rewrote around `marked`. Explanation movement killed total inertness before theory.
- Authoring R5 with soft "completed or realised" while the live exhibit is `returned` vs `marked at`, then being surprised the model confirmed.
- Inserting under Frame without first quoting L23/L31 as the likely winners (the read-the-instruction step this pass was forced to do first).
- Using Variant H placement inertness as general evidence without noting it moved Evaluative claims on the old prompt, not a mark rule on R3a.
- Risk of label collision: eval-ablation EA_E3 versus claim-spans CS_E3 / corpus `E3:S0:ic_memo` (already partial for an evaluative overlay on mark language). Different statements; must keep file names attached every time.

---

## 8. Anything we have not asked

- R5 was not inert collateral-wise: F04_S13 flipped to partial x3 and F92_S0 flipped to confirmed x3. Abstract "completed or realised" language already moves nearby cells. A harder verb-named arm needs those on the HOLD list.
- Example 3c puts `returned` on both statement and source. That is active training against a realised-vs-mark distinction.
- L27 cannot carry this case: `returned` is outside the modality verb list, and the source is not "proposed"; it is marked. Conflict path is the wrong instrument; partial via basis/frame is the right one.
- Corpus `E3:S0:ic_memo` is already `partially_confirmed` because of judgement language on top of matching marks. It is not a substitute fixture for eval-ablation EA_E3.
- A free next step with no model spend: add an eval-ablation EA_E3 fixture (statement + `meridian_source.txt` + expected partial) so any later gate or prompt arm has a regression target. Until that exists, every "corpus looks clean" claim about mark/basis is vacuous.

---

## Technical summary

Read-only diagnosis written to this file. Compared R5 vs R3a cells in `r5-mark-rule-rows.json`; quoted pre-empting lines in live `stage2_v4.md`; sized a deterministic realised-vs-mark check on 364 R3a corpus pairs (0 fires; EA_E3 absent from that set). No prompt, fixture, baseline, or code edits. No model calls.

## Plain-language summary

R5 did not fail because the model ignored the new sentence. It heard enough to say "marked" and still confirmed, which means older paraphrase and figure-match instructions are winning. The next useful spend is amending those instructions (and staging EA_E3 as a fixture), not another soft line under Frame, and not a code gate with nothing in the corpus to catch.
