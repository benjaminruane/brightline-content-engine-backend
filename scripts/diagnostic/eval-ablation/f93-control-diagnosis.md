# F93_S2 control diagnosis and R9 plan critique

Free. No model calls. No fixture, prompt, baseline, or code edits.
Evidence: `r9-basis-conflict-rows.json`, `r9-basis-conflict.md`, fixture 93 source/draft on disk, `r3a-corpus-blast-rows.json` for corpus gross/net (Part 0).

## Scoreboard

```
arm  EA_E3 confl  F93_S3 confl  S1+S2 ctrl  five holds  F19  indep  modality  verdict
R3a  no           yes          no          yes         yes  yes   ok        reference
R9   yes          yes          no          yes         yes  yes   ok        KILL
```

CONFIRMED: `r9-basis-conflict.md` scoreboard; cost $1.9133; commit 03c6e68.
CONFIRMED: EA_E3 is the real exhibit (R3a conf x3, R9 confl x3). Not vacuous.
CONFIRMED: F93_S2 was already part x3 on R3a. The CONTROL "stays confirmed" could not test R9. Spec-writing error, not a rule failure.

---

## 1. Restage F93_S2

### Old pair, side by side

```
DRAFT S2:
Fund IV has returned 2.6 times gross MOIC.

SOURCE sentence used on R3a (all three runs):
Across fully realised exits only, Fund IV has returned 2.6x gross MOIC. That realised subset is not the fund-level mark above.
```

CONFIRMED: `r9-basis-conflict-rows.json` F93_S2 / R3a / runIndex 0..2.

### Every difference (not only the known one)

```
1. SCOPE QUALIFIER
   Source opens with "Across fully realised exits only,"
   Draft has no scope qualifier (reads as fund-level).

2. FOLLOW-ON EXPLICIT NEGATION
   Source second sentence: "That realised subset is not the fund-level mark above."
   Draft has no second sentence and no subset-vs-fund contrast.

3. NUMBER NOTATION (formatting only)
   Draft: "2.6 times"
   Source: "2.6x"
   (Live numeric rules treat this as confirmable formatting.)

4. SENTENCE COUNT
   Draft: one sentence.
   Source passage: two sentences.

5. WHAT DOES NOT DIFFER
   Entity: both Fund IV.
   Verb: both "has returned".
   Basis adjective: both gross.
   Metric: both MOIC.
   Quantity: both 2.6.
   No period / vintage on the draft; source passage carries none on the return clause either (vintage sits on the separate mark sentence).
```

CONFIRMED: R3a explanations name the scope broadening, not basis (`r9-basis-conflict-rows.json` F93_S2 R3a).

### Proposed replacement (proposal only; not applied)

Goal: both-sides-returned control. Draft and source must match on every checkable fact. The plant contrast (S0) differs from this control by the basis verb only when you later compare plant to mark; this control itself has NO basis mismatch.

```
SOURCE sentence (add to Halden LP update as a clean line; do not attach a subset caveat):
Fund IV has returned 2.6 times gross MOIC.

DRAFT S2:
Fund IV has returned 2.6 times gross MOIC.
```

Formatting-identical is intentional. If you want a trivial formatting smoke test:

```
SOURCE: Fund IV has returned 2.6x gross MOIC.
DRAFT:  Fund IV has returned 2.6 times gross MOIC.
```

Either is fine. Prefer identical for the overreach control.

Keep the mark sentence elsewhere in the same source for S0/S1:

```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Different figure (1.9 vs 2.6) so a correct model should not need to treat them as the same claim.

### Confidence it holds on live R3a

```
Confidence: HIGH for identical wording (maybe 85%).
Confidence: HIGH-MODERATE for times vs x only (maybe 80%).
```

Why not higher: the same source document still contains mark language at 1.9x. A passage-hunting model could still grab the mark line (see section 3). That risk is about R9, not about whether R3a confirms the matched pair when it selects the right passage.

### What to check before believing it

```
1. R3a x3 on the new S2 only. Require confirmed >=2/3. If partial/confl, stop and restage again.
2. Inspect passages: every R3a run must cite the returned 2.6 sentence, not the mark 1.9 sentence.
3. Do not treat "majority confirmed on a full graded remeasure" as verification of S2. Verify S2 in isolation first.
4. Optionally run the new S2 under R9 x3 after R3a holds, as a cheap overreach probe, before a full graded remeasure.
```

---

## 2. What else in Claude's intended plan would I expect to fail

Claude intends: restage S2, verify on R3a x3, remeasure R9 on graded + fixture 93, then if CONFIRM run ~$8.50 corpus blast + capped noise pass.

Expected breaks, most likely first:

```
1. F93_S3 PRIMARY STILL VACUOUS (or still compound)
   Likelihood: HIGH
   Why: R3a already confl x3 on current S3 because net plus scope-subset plus fund-level implication. Restaging S2 without isolating S3 leaves a PRIMARY that cannot show R9 doing work. CONFIRMED vacuity today: r9-basis-conflict-rows.json F93_S3 R3a.

2. PASSAGE HUNTING ON THE NEW S2 UNDER R9
   Likelihood: HIGH
   Why: Already happened once (F93_S2 R9 r1). A cleaner returned sentence next to a mark sentence in the same doc still invites hunting if the rule rewards finding "marked at" anywhere. May KILL again on overreach even after R3a verifies.

3. JUMPING TO AN $8.50 BLAST AFTER ONE GRADED CONFIRM
   Likelihood: HIGH (as a process failure)
   Why: R9 amends the conflicting definition (modality verb list + gross/net limb). Blast radius is about classification definitions, not about one mark fixture. Graded set has few independent controls. A single CONFIRM on 27 statements is weak evidence for an $8.50 spend. Also: claim-spans baseline is STALE for Stage 2; reusing its statements is fine for not re-billing Stage 1, but treating those Stage 2 labels as live reference is wrong unless R3a is re-run live (which the blast plan does). Cost shape: blast first, adjudicate after, is how money gets spent on noise.

4. F93_S0 AS A REPORTED "WIN"
   Likelihood: HIGH (reporting error)
   Why: R3a already confl x3. Any plan that celebrates F93_S0 conflicting under R9 is vacuous. Same class of mistake as scoring S2 as a control.

5. EA_E2 SINGLE-RUN CONFIRMED REGRESSION
   Likelihood: MEDIUM
   Why: R9 already showed EA_E2 conf/part/part (one confirmed). Next full remeasure may tip to confirmed >=2/3 and KILL on a shipped fix. CONFIRMED one conf on this run: r9-basis-conflict-rows.json EA_E2 R9 r0.

6. STOPPING RULE TREATS ILL-FORMED CONTROLS AS RULE FAILURES
   Likelihood: MEDIUM (meta)
   Why: This KILL was correct under the written rule and wrong as a reading of R9 quality. Next plan needs: "control must hold on reference before it can break an arm" or a VACUOUS flag that blocks KILL-from-control when reference already fails the control.

7. NOISE-CONFIRMATION CAP INTERACTS BADLY WITH CONFLICTING ROUTE
   Likelihood: MEDIUM
   Why: Conflicting destination creates a new false-alarm class. Sampling 30 conf->partial may under-sample the TO-conflicting cards that matter most. Plan should bias confirmation budget toward TO-conflicting and OFF-conflicting, not treat conf->partial as the main sample.

8. COST UNDERESTIMATE ON BLAST
   Likelihood: MEDIUM
   Why: Prior corpus blast economics assumed ~364 pairs x2. Adding F90-92 and all of fixture 93 increases pairs. "About $8.50" may be short if token lengths grow with R9 (~13728 vs 12812).

9. HARDENING NOTHING ABOUT MERIDIAN-LIKE DIFFICULTY BEFORE BLAST
   Likelihood: MEDIUM
   Why: If F93_S0 stays easy, the blast will mostly rediscover that R9 moves Meridian-like cells and leave the fixture looking stronger than production.

Assume Claude got something wrong: the largest unforced error in the intended plan is sequencing ($8.50 blast contingent on graded CONFIRM) without (a) isolated S3 redesign, (b) passage-selection checks on controls, (c) a cheap R9-only overreach probe on S1/S2 after restage.
```

---

## 3. Passage-hunting hypothesis

Hypothesis under test: a returned-vs-marked conflict rule incentivises selecting any mark passage in the source rather than the passage that corresponds to the draft.

### Passages selected (every run)

```
EA_E3 (eval-ablation meridian_source.txt)
  R3a r0..2  PASS: Fund IV ... currently marked at 1.9x gross MOIC and 24% gross IRR...
  R9  r0..2  PASS: same mark sentence
  Note: Meridian has no competing "returned 1.9" sentence for Fund IV. The mark
  passage is the corresponding one. Hunting is not separable from correct selection here.

F93_S0 (93_adversarial_basis_mismatch.txt)
  R3a r0..2  PASS: mark sentence at 1.9x (longer span including realised/carrying value)
  R9  r0..2  PASS: mark sentence at 1.9x (shorter)
  Corresponding: YES. Draft is returned-on-1.9; source's matching figure is the mark.

F93_S1
  R3a r0..2  PASS: mark sentence at 1.9x
  R9  r0..2  PASS: mark sentence at 1.9x
  Corresponding: YES. Honest mark draft.

F93_S2
  R3a r0..2  PASS: Across fully realised exits only, Fund IV has returned 2.6x...
  R9  r0     PASS: returned 2.6x subset sentence
  R9  r1     PASS: Fund IV ... currently marked at 1.9x ... (MARK, wrong figure)
  R9  r2     PASS: returned 2.6x subset sentence
  Corresponding: R3a yes; R9 2/3 yes; R9 r1 NO.

F93_S3
  R3a r0..2  PASS: returned 2.6x gross subset sentence
  R9  r0..2  PASS: mark 1.9x sentence PLUS returned 2.6x sentence (stitched / long span)
  Corresponding: mixed. R3a picks the gross returned line (right figure, right for gross/net).
  R9 expands to include mark language as well; explanations still argue gross vs net,
  and r1 also names the 1.9 mark.
```

CONFIRMED from `r9-basis-conflict-rows.json`.

### Adjudication

```
CONFIRM that passage hunting occurred at least once under R9:
  F93_S2 R9 r1 selected the mark-at-1.9 passage for a returned-2.6 draft.
  Explanation explicitly frames returned vs marked at. Wrong figure, wrong sentence.

HYPOTHESIS that the R9 wording creates a systematic incentive to hunt:
  Supported by that one cell. Not proved as the dominant behaviour:
  F93_S2 R9 still selected the returned sentence on 2/3 runs.
  EA_E3 cannot test hunting (no alternate returned passage for 1.9).

REFUTED as "R9 always hunts": false on these rows.
```

What would settle it:

```
1. Restaged S2 with a clean returned-2.6 sentence beside a mark-1.9 sentence.
2. R9 x3: if >=1/3 selects mark-1.9 for a returned-2.6 draft again, hunting is real.
3. If 0/3 hunt and all confirm, hunting was contingent on the ill-formed scope clash.
```

Implications if it holds:

```
- Corpus check: long multi-claim sources (annual reports, LP updates) will over-fire
  conflicting when any mark language exists anywhere near a returned draft.
- Rule wording: need like-for-like / same-figure discipline in the conflict limb
  ("the source's corresponding figure", "same metric and same quantity"), not only
  verb lists. Do not reword R9 in this pass; flag it for the next wording if hunting
  replicates on a clean control.
```

My read: hunting is a real failure mode, demonstrated once, not yet shown to be the main driver of the EA_E3 win. EA_E3's conflict is the correct pairing.

---

## 4. Is the fixture too easy?

```
R3a on eval-ablation EA_E3: confirmed x3 (false green). Hard.
R3a on F93_S0:           conflicting x3 (already right). Easy.
```

CONFIRMED: rows above.

Yes, F93_S0 should be hardened if it is meant to prove a fix. A fixture the reference already passes cannot show a fix. It can still be a regression lock after shipping, but it is not a primary exhibit.

How to harden (proposal only):

```
1. Match Meridian density: embed "currently marked at 1.9x gross MOIC and 24% gross IRR"
   inside a longer track-record paragraph that also contains other return language
   at different figures (e.g. a deal that "returned 3.1x"), so paraphrase-to-confirm
   is tempting and hunting has bait.

2. Avoid teaching contrast in the next sentence ("that is not the fund-level mark").
   The current Halden source is pedagogically clear; Meridian is not.

3. Keep S1 honest-mark control on the same hardened source.

4. After restage, require R3a x3 on F93_S0 to return confirmed >=2/3 before calling
   it a primary. If R3a still conflicts, it is still too easy.
```

Do not delete F93_S0; demote it from "proof of fix" to "lock" until it fails on R3a.

---

## 5. Gross versus net

```
F93_S3 vs R3a: already conflicting x3 (vacuous PRIMARY).
Corpus 364 pairs: 0 gross/net disagreements (Part 0 scan).
```

Do I still believe gross/net belongs in the same rule as realised-versus-mark?

```
Yes, as exclusivity-of-basis under conflicting.
No, as something that has been measured by R9.
```

They share Ben's exclusivity logic. They do not share a working exhibit yet. Gross/net is stricter logically; realised-versus-mark is the live false green.

Non-vacuous test:

```
1. Isolate a pair that differs ONLY in gross vs net:
   SOURCE: Fund IV has returned 2.6 times gross MOIC.
   DRAFT:  Fund IV has returned 2.6 times net MOIC.
2. Verify on R3a x3 FIRST.
   - If R3a confirms >=2/3: real false green; use as PRIMARY.
   - If R3a conflicts >=2/3: live prompt already catches gross/net; R9 limb is
     documentation/defence in depth, not a graded win. Do not spend blast money
     to "prove" it.
3. Only then measure under R9.
```

Until that isolation exists, any F93_S3 PRIMARY is theatre.

---

## 6. Recommended next pass

One pass. Not a full R9 remeasure. Not a corpus blast.

```
PASS: Fixture restage + reference-arm verification only.
COST: ~$0.20 to ~$0.40 (R3a x3 on a handful of fixture statements: new S2,
      isolated S3, optionally hardened S0, S1 sanity). Cache OFF.
MEASURES:
  - New S2 both-sides-returned holds confirmed on R3a >=2/3, passages cite
    the returned sentence.
  - Isolated S3 gross/net: does R3a confirm or already conflict?
  - Optional hardened S0: does R3a confirm (usable primary) or still conflict?
STOPPING:
  CONFIRM: S2 holds confirmed on R3a; passages correct; S3 isolation result
           recorded as either "usable primary" or "already handled by R3a".
  KILL:    S2 still not confirmed on R3a, or passages cite mark-1.9 for a
           returned-2.6 draft under R3a (source still ill-formed).
  No R9 remeasure in this pass. No blast.
```

What I would NOT do:

```
- Remeasure full R9 graded set yet.
- Run an $8.50 corpus blast.
- Declare R9 ship-ready off EA_E3 alone.
- Reword R9 before the clean S2 overreach probe.
- Treat F93_S0/S3 as primaries while they remain vacuous against R3a.
```

If you insist on one measured R9 step after verification: a narrow overreach probe (R9 x3 on S1+S2+S3 only, ~$0.20) before any graded remeasure. Still no blast.

---

## 7. Where Claude has been wrong

Known (your list): control not verified on reference; abstract rule when exhibit used specific verbs; inertness without opening rows; pass conditions on one exhibit; planted as breaks; baseline once not x3.

Additional, including in the current plan:

```
1. Wrote F93_S2 as a confirmed control without checking that the draft omitted
   a scope qualifier the source carried. The failure mode was predictable from
   reading the two strings.

2. Wrote F93_S3 as a PRIMARY without checking R3a already conflicts (compound
   net + scope). Same class of error as S2.

3. Stopping rule KILLed R9 on a control that the reference arm also failed.
   That conflates "fixture broken" with "rule broken". The rule needed a
   vacuous-control guard.

4. Intended next plan still sequences an $8.50 blast after graded CONFIRM.
   That is the old "measure big before the control is real" habit, renamed.

5. Passage hunting was observed and then under-weighted relative to blast
   ambition. The cheap experiment (clean S2 under R9) is the one that settles
   whether conflicting-route wording is safe in multi-claim sources.

6. Treating fixture 93 as "the" realised-versus-mark proof while R3a already
   passes S0. Easy fixtures inflate confidence.

7. Bundling gross/net into the same ship decision without an isolated exhibit.
   Conceptual kinship is not measurement.

8. Earlier stretch errors that still shape this work: R5 abstract wording;
   "not one cell moved" without opening rows; saturations claimed after
   explanation shifts.
```

---

## 8. Anything we have not asked

```
- F93_S3 R9 passages often include BOTH mark and returned text. Even when the
  label is "right" (conflicting), the rationale is contaminated. Adjudication
  should score passage correspondence, not only labels.

- Meridian contains a deal-level "returned 3.1x" (Nordholt) beside Fund IV
  "marked at 1.9x". That is production-like hunting bait for other drafts.
  A corpus blast without a passage-correspondence check will misread some
  conflicts as basis wins.

- EA_E2 one-of-three confirmed under R9 is a shipped-fix warning light. A
  narrow watch on EA_E2 costs almost nothing and beats discovering it inside
  an $8.50 blast.

- claim-spans CS_E3 and corpus E3:S0:ic_memo remain different statements from
  eval-ablation EA_E3. Do not let a blast matrix row labelled E3 get cited as
  the Meridian false green.

- Working-practice change (critique before fix spec) is correct here: the
  highest-value output of this pass is "do not blast yet", not a new wording.
```

---

## Opinion (plain)

R9's EA_E3 result is real and encouraging. The KILL does not refute it. The next spend should buy a real control and an isolated gross/net read on R3a, not a corpus blast. Claude's intended plan still spends like the control problem is solved once S2 is restaged; passage hunting says it may not be.

## Technical summary

Read-only diagnosis from R9 rows and fixture 93 text. Proposed an identical both-sides-returned S2 pair; did not edit fixtures or prompts. No model calls.

## Plain-language summary

The control that killed R9 was broken before R9 ran. Fix that control and prove it on the current prompt first. Do not spend the corpus budget until a returned sentence and a mark sentence can sit in the same document without the model grabbing the wrong one.
