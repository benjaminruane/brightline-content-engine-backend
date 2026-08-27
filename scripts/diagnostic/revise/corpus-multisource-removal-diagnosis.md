# Corpus representativeness, multi-source verdicts, and the removal rule

Free. No model calls. Propose only. Nothing built. Nothing shipped.

Stated practice (Ben, 2026-08-27): for a new investment referencing an IC
document, the investor's own paper normally contains a statement
substantiating their expectations (for example "we expect the relationship to
deepen"). Such sentences are routinely supportable, just not by the GP's
materials. Missing document, not missing category.

Stated rule (Ben): where a statement has NO supporting source, the reviser
should REMOVE it with a suitable explanation. The same statement should SURVIVE
if the review is re-run with the source that does support it.

---

## Part 1: What the corpus actually contains

Primary measurement universe: `scripts/diagnostic/claim-spans/.baseline.json`
(29 cases). Current Stage 2 reference for verdicts:
`scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json` (README).
Numbered fixtures: `scripts/diagnostic/fixtures/*.json`. Inventory method
matches [Corpus multi-source inventory](ce4c7c35-4c64-4867-8fe3-e85aee1b2871)
plus a local recount of `.baseline.json`.

### One source vs more than one

```
Baseline cases (29)
  ONE source:          23   CONFIRMED (.baseline.json case keys F01-F17,
                            F19-F21, E1-E3)
  MORE THAN ONE:        6   CONFIRMED
    nordholt-clean (4 sources)
    nordholt-dirty (4)
    supersession (3)
    F18 (2)
    F22 (2)
    F23 (2)

Numbered fixture JSONs (27 main 01-23 + 90-93)
  ONE source:          24
  MORE THAN ONE:        3   (18, 22, 23)
  CONFIRMED: scripts/diagnostic/fixtures/
```

### Statements matched against more than one source

```
Harness stores a full statement x source cross-product, not selective attach.
  Multi-source statements: 36
  Matches on those:        100
  Every multi-source statement is matched against every available source.
  CONFIRMED: .baseline.json match counts
    F18 10x2=20, F22 5x2=10, F23 5x2=10,
    nordholt-clean 6x4=24, nordholt-dirty 6x4=24, supersession 4x3=12

Informative multi-source (>1 non-no_support on same statement): 25 of 36
  CONFIRMED: offline recount of baseline matches

confirm + conflicting on same statement: 12 statement-rows in baseline
confirm + no_support (silent other):      15 statement-rows
  CONFIRMED: offline recount
```

### First-person / authoring-organisation subjects

```
Unique baseline statements: 296
  contain we / our / ours / ourselves:     63   CONFIRMED
  named org as actor without we/our:       14   CONFIRMED (near-miss count)
  combined:                                77   CONFIRMED

R10 stmt-level agg on the 63 we/our statements
  (conflict dominates if any pair conflicts):
  confirmed 41 | partially_confirmed 13 | conflicting 6 | no_support 3
  CONFIRMED: r10-corpus-blast-rows.json via inventory agent recount
```

### Real-shaped review? (user IC / internal paper + external GP materials)

```
CONFIRMED: NONE.

Closest near-misses (still wrong shape):
  F18 / F22 / F23: two sources, both same-house internal IC / diligence updates.
  nordholt-*: IC memo + press + fact sheet + LP update, all Ashford/Nordholt
    fund materials. Draft is a hold update, not "LP's own IC paper checked
    against an external GP pack".

So every Stage 2 corpus measurement, and every Meridian Suggest measure, has
been taken on a scenario that is not "investor paper + GP materials". That is
the finding for Part 1.
```

Identity reminder: eval-ablation EA_E3 (Meridian mark in
`eval-ablation/meridian_source.txt`), claim-spans CS_E3, and corpus
E3:S0:ic_memo remain three different statements.

---

## Part 2: What the product does with several sources

### How classifications combine

Quoted from `lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` L28-L35:

```
const anyConfirmed = withNorm.some((m) => m._c === "confirmed");
const anyConflicting = withNorm.some((m) => m._c === "conflicting");
const anyPartial = withNorm.some((m) => m._c === "partially_confirmed");

let verdict;
if (anyConfirmed) verdict = "confirmed";
else if (anyConflicting) verdict = "conflicting";
else if (anyPartial) verdict = "partially_confirmed";
else verdict = "not_supported";
```

```
Priority: confirmed > conflicting > partially_confirmed > not_supported.
hasConflict = anyConflicting (independent flag). CONFIRMED: L37-L38.
Already logged as open question B107 (BACKLOG): confirming source may outrank
a conflicting one; card can show supported_full with hasConflict true.
```

### One confirms, another conflicts

```
Verdict: confirmed (anyConfirmed wins).
hasConflict: true.
contributingSourceIndices: indices with classification === winning bucket
  ("confirmed"), PLUS all conflicting indices when hasConflict.
  CONFIRMED: L40-L48.
```

### One confirms, others silent (no_support): the real IC shape

```
Verdict: confirmed.
hasConflict: false.
Silent sources do not block confirmation.
CONFIRMED: same priority ladder; no_support never wins when anyConfirmed.
This is exactly the shape Ben described: investor IC confirms the expectation;
GP pack is silent; card should clear.
```

### concernLevel

```
Mapped from the aggregated supportState, not per-source:
  supported -> none
  partial   -> moderate
  conflicting / else -> high
CONFIRMED: lib/qc/pipeline-v3/stage7-assemble-card.mjs
  mapSupportStateToConcernLevel L420-L424; applied L575.
So concernLevel follows the winning aggregate, not a losing silent source.
```

### Drawer / Sources UI

```
Card citation badges: qcCard.supportRefIds / supportRefTitles from
  confirmingMatches only. CONFIRMED: stage7-assemble-card.mjs L579-L587;
  frontend StatementReviewCard.jsx ~L488 ("must come from supportRefIds").
supportSpans: widened multipassage pass; goes ONLY into supportSpans; must
  NEVER feed aggregateVerdict. CONFIRMED: pipeline-v4/index.mjs L302-L303,
  L363-L364; stage2-match-multipassage.mjs header.
Drawer location uses supportSpans when locatable. CONFIRMED: frontend
  resolveLocatableSupportSpan.
So: winning confirmers drive badges; spans can still show richer passages;
silent sources do not appear as confirming badges.
```

### Exercised by the corpus today?

```
Technically yes: 6 multi-source cases, 12 confirm+conflict rows, 15
confirm+silent rows in baseline. CONFIRMED: Part 1 recount.

Practically for the real shape (investor IC + GP silent): NO fixture has that
pairing. Coverage-union (B105 / closed unexercised row) already recorded
population zero for a related multi-source promotion. The confirm+silent path
exists in code and appears in same-house multi-source fixtures; it has never
been measured as "Halden IC confirms what Meridian GP omits."
```

---

## Part 3: Does the verdict determine the reviser's destination?

### Kind from verdict (determined)

```
gatherConcerns maps evidence gaps to kind:
  conflicting          -> kind "conflict"
  no_support           -> kind "unsupported"
  partially_confirmed  -> kind "partial"
CONFIRMED: lib/build-revision-prompt.mjs gatherConcerns / evidenceKindTag
  (reviser-input-diagnosis.md; live path).
```

### Soften / cut / keep-and-flag (mostly left to the model)

Quoted KIND HANDLING, `lib/build-revision-prompt.mjs` L966-L981:

```
Three things are easy to blur into "removing content"...
- Removing the author's POINT. ... Rule (d). Keep and flag.
- Removing unsupported PRECISION ... Rule (b). Do it and flag.
...
b) kind "unsupported": ... When the source is silent or vague, apply ONE TEST:
  - YES, the claim stands without the number: SOFTEN.
  - NO, the figure WAS the claim: CUT THE CLAUSE.
  - EDGE CASE, cutting would remove the whole sentence: do NOT cut.
    That is removing the author's point rather than removing unsupported
    precision, so it falls to keep-and-flag. Keep the sentence as written
    and flag it.
c) kind "partial": Keep the CONFIRMED portion unchanged. ... apply the same
   ONE TEST as (b) to that element only ...
d) kind "deletion": Do NOT delete. Keep ... and wrap ...
```

```
Verdict selects the KIND.
Within unsupported / partial, SOFTEN vs CUT vs keep-and-flag is a MODEL test
(the ONE TEST / EDGE CASE), not a deterministic code branch.
CONFIRMED: no code path forces CUT on kind unsupported; the prompt narrates it.
```

### Meridian Suggest1 reading (confirm / refute)

```
Partials (ranking, risk, exceptional, co-invest, recommend): softened or
  surgically cut unsupported spans; confirmed facts kept.
  CONFIRMED: suggest-after-r10.md / suggest1 revisedDraft.
  Under the CURRENT prompt, that is the intended partial behaviour.
  Not "backwards" relative to the prompt. Backwards relative to Ben's rule
  only if Ben wants remove-on-no_support and the partials were mis-kinded
  (they were not: they are partial).

no_support deepen (stmt 9): KEPT with note
  "Kept the expectation as a forward-looking view despite no direct source
  support, as removing it would cut the author's point."
  CONFIRMED: suggest-after-r10-suggest1.json markers (last entry).
  Relative to Ben's rule: backwards (should REMOVE).
  Relative to the prompt EDGE CASE (L975): the model applied a sanctioned
  keep-and-flag path for whole-sentence unsupported claims.
```

### Did the prompt sanction "removing it would cut the author's point"?

```
YES, as EDGE CASE language. The prompt's words are
  "That is removing the author's point rather than removing unsupported
  precision" (L975).
The model's note paraphrases that sanction. It is not a free invention of a
new doctrine; it is the model choosing the EDGE CASE branch the prompt offers
for whole-sentence unsupported claims.
Different problem from a hallucinated rationale: the FIX is to change the
EDGE CASE (or carve out true no_support whole-sentence removal), not only to
scold the model.
Also L960: "Preserve the author's voice, meaning, and structure except where
a kind below requires a change." That general line also leans keep.
```

### Suitable explanation for a removal (proposal)

```
Minimum bar:
  1. Prose: the sentence (or clause) is gone from the revised draft.
  2. Marker: intent CUT on a surviving remnant (or document-level remnant
     policy if the whole draft fragment would vanish; edge case for later).
  3. Note: names that no uploaded source supports the claim; does not invent
     a substitute reason (authorial intent, materiality, style).
  4. Honesty: CUT + adjacent deletion window passes applyMarkerHonestyCheck
     (remnant may be unchanged words; region must show the cut).

Can the current prompt produce that?
  PARTIAL. CUT THE CLAUSE examples exist (L974) for figure-was-the-claim.
  Whole-sentence unsupported is explicitly routed to keep-and-flag (L975).
  So today the prompt can produce Ben's removal for a clause inside a longer
  sentence; it actively steers away from removal when the unsupported claim
  IS the whole sentence. Ben's rule needs a prompt (or code) change for that
  case. Not shippable by honesty repair alone.
```

---

## Part 4: First-person handling and severity

### What AUTHORING_ORGANISATION / first-person-actor is for

```
lib/qc/first-person-actor.mjs: shared first-person removal contract for
  first_person_plural (style) and voice_consistency (editorial).
  Substitute the named actor; never delete them.
  CONFIRMED: file header L1-L3; buildFirstPersonActorInstruction L84-L109.

resolveAuthoringOrganisationName: request, then env AUTHORING_ORGANISATION,
  then null. CONFIRMED: L40-L56.

Used by editorial/compliance reviewer and style-guide resolution.
  CONFIRMED: editorial-compliance-reviewer.mjs imports; style-guide.mjs imports.
```

### Does Stage 2 consult it?

```
NO. Stage 2 match prompts are Statement: / Source: only
  (stage2-match-sources.mjs matchSingleSource). No authoringOrganisation in
  pipeline-v4 Stage 2 matcher greps.
CONFIRMED: absence in lib/qc/pipeline-v4 Stage 2 path.
Fact, not necessarily a defect: evidence matching does not need the house
name to judge whether a GP pack supports "Halden Group expects...".
```

### Stmt 7 vs stmt 9 severity (Meridian / eval-ablation)

```
Stmt 7:
  "On balance, we believe the fund should deliver returns broadly in line
   with its predecessor and we recommend the commitment."
  Review1: supported_partial / moderate
  Reason (summary): source confirms Fund I-IV track record metrics; does not
  state Fund V will deliver in line with predecessor, nor the recommendation.
  CONFIRMED: suggest-after-r10-review1.json

Stmt 9:
  "Halden Group expects the relationship to deepen over the life of the fund."
  Review1: not_supported / high
  Reason: no source addresses the expectation; source only mentions past
  Halden investments with Meridian.
  CONFIRMED: same JSON; meridian_source.txt L43 (past investments only)

Source text (meridian_source.txt):
  Has realised track record numbers (supports part of stmt 7's predecessor-
  comparison scaffolding).
  Has Halden past investments (L43); has NO forward expectation of deepening.

Difference: DEFENSIBLE from the source text, not arbitrary.
  Stmt 7 has a confirmed factual spine (track record / predecessor performance
  exists in source) plus unsupported recommendation / forward belief -> partial.
  Stmt 9 is a pure forward expectation with no backing sentence -> no_support.
Both are the author writing about the author; Stage 2 still distinguishes
"partly about something in the GP pack" from "nothing in the pack".
Under Ben's IC practice, stmt 9 would often clear if Halden's own IC were
uploaded. That does not make today's severity wrong given only the GP pack.
```

---

## Part 5: Two-condition experiment (propose only)

### Invented second source: Halden IC paper

```
Working title: Halden Group / Meridian Capital Partners V IC note (invented)
Path (when built): scripts/diagnostic/eval-ablation/meridian_halden_ic.txt
Alongside: scripts/diagnostic/eval-ablation/meridian_source.txt (existing GP pack)
Draft: same Halden Meridian draft as r10-production-verify / Suggest measure.
No real person names beyond the already-invented Meridian cast.

Contents (sketch, not built):
  - Halden recommending a lead commitment to Fund V (timing may or may not
    match "June 2025"; leave timing weak so lead-commitment can stay partial)
  - Explicit: "Halden Group expects the relationship with Meridian to deepen
    over the life of Fund V."
  - Optional: Halden's view that returns should be broadly in line with
    Fund IV / predecessors (so stmt 7 can move without greening the recommend
    clause unless you also write the recommendation)
  - Do NOT invent top-quartile ranking, key-person-risk-is-limited, or
    "has returned" for Fund IV. Leave those to the GP pack (or leave them
    unsupported / conflicting as today).
```

### Designed pair

```
Condition A: GP source only (meridian_source.txt)
  Stmt 9 deepen: Review = not_supported / high
  Suggest: REMOVE with CUT + suitable explanation (after prompt/policy change)
  PASS only if removed.

Condition B: GP + Halden IC
  Stmt 9 deepen: Review = confirmed (or supported_full) / none
  Suggest: leave the sentence alone (no marker, or craft-only)
  PASS only if BOTH Review clears AND Suggest does not edit it.
  If Review clears and Suggest still edits: score as SEPARATE Suggest defect.
```

### Which Meridian flags become checkable against the IC; what SHOULD return

```
Should CLEAR (or move toward clear) with IC present, if IC states them:
  Stmt 9 deepen expectation          -> confirmed
  Stmt 7 "returns broadly in line..." (if IC states it) -> at least that clause
         confirmed; "we recommend the commitment" only if IC recommends

Should STILL BE FLAGGED with both documents (anti-rig group):
  EA_E3 mark "has returned" vs GP "marked at"     -> conflict (eval-ablation
    meridian_source.txt). IC must not rewrite GP mark language into returned.
  EA_E1 top-quartile ranking                      -> partial / unsupported span
  EA_E2 "key-person risk is limited"              -> partial (evaluative)
  Lead commitment June 2025 / EUR 1.2bn details   -> partial unless IC states
    them carefully; prefer leaving timing unsupported so A vs B is not "all green"
  "would not otherwise have been available"       -> still unsupported unless
    IC claims exclusivity (do not add that)
  Co-invest terms can stay GP-backed as today

A second source must not simply make everything green. The anti-rig group above
is what stops a rigged test.
```

### What this measures for the first time; cost

```
First-time measures:
  1. Confirm+silent aggregation on a real-shaped IC + GP pack
  2. Ben's remove-on-no_support vs survive-when-IC-present for the same sentence
  3. Suggest obedience after Review clear (separate score)

Cost estimate (production-like, evidence-only Review + Suggest):
  Condition A: Review ~$0.50 + Suggest ~$0.05
  Condition B: Review ~$0.70 (two sources) + Suggest ~$0.05
  Optional second Suggest instability probe: +$0.05
  Total about $1.30 to $1.50. No corpus blast required for the first pass.

Prerequisite (not free): reviser EDGE CASE change so Condition A can PASS.
  Without that, Condition A measures today's keep-and-flag, not Ben's rule.
```

---

## What next (falsifiable)

```
NEXT PASS (recommended):
  1. Spec a reviser prompt (or code) change: kind unsupported + whole-sentence
     (or no remnant after cut) -> CUT / remove with suitable explanation;
     reserve EDGE CASE keep-and-flag for materiality / deletion kinds, not for
     true no_support.
  2. Unit / offline honesty fixtures for the CUT note shape ($0).
  3. Build the invented Halden IC fixture (still free).
  4. Run the two-condition experiment (~$1.30-$1.50).

STOPPING RULE:
  PASS if:
    A: stmt 9 removed; note names no-source-support; honesty accepts CUT
    B: stmt 9 Review clears; Suggest leaves it untouched
    Anti-rig group still flagged under B (mark conflict, top-quartile, etc.)
  FAIL if:
    A keeps stmt 9, or B clears the anti-rig group, or B's Suggest edits a
    cleared deepen sentence (score that last as its own defect, do not call
    the Review half a fail).

DO NOT next:
  Corpus-wide rewrite sweep
  Another single-source Meridian Suggest to "see if deepen removes" before the
    EDGE CASE change
  Treating Stage 2 R10 ship as invalidated by this gap (see below)
```

### Does the single-source corpus invalidate any SHIPPED conclusion?

```
MOST IMPORTANT SENTENCE:
  It does not invalidate the Stage 2 R10 basis-conflict ship
  (stage2-basis-conflict-r10 / eval-ablation EA_E3 mark detection), which is a
  statement-vs-source classification result and was verified on Meridian GP pack
  alone; it DOES invalidate treating Meridian Suggest keep-and-flag on
  no_support authorial expectations as "product-correct behaviour", and it
  means multi-source aggregation / confirm+silent / remove-vs-survive have
  never been measured on the review shape users actually run.

Also not invalidated by this gap alone: R3a false-green fixes, percent extract,
Pr9-correctness ship (different defect class). Weakened / unmeasured: B88
"spans help reviser" on authorial no_support, coverage-union (already
unexercised), any claim that Suggest implements Ben's removal rule.
```

### What in this spec is misdirected

```
1. Treating first-person authorial statements as a Stage 2 category problem.
   Ben corrected that. Stage 2 already distinguishes stmt 7 vs 9 from source
   text. The gap is missing Halden IC, plus reviser EDGE CASE, not a Stage 2
   "we" blindness.

2. Expecting the current reviser prompt to implement Ben's removal rule
   without a change. It currently forbids whole-sentence cut on unsupported.

3. Folding confirm+silent aggregation doubt into "the corpus is useless".
   The ladder is real and already partially exercised; the missing piece is
   the LP-IC + GP pairing, not the absence of any multi-source code path.

4. Scoring Suggest keep on deepen as a pure model failure. It is prompt-
   sanctioned EDGE CASE behaviour.
```

---

## Opinion

```
Ben's IC practice point changes how I judge Meridian stmt 9: as a product demo
with only the GP pack, not_supported/high is correct; as a claim about what
users experience when they upload their IC, the card is a missing-document
artifact. I would not soften Stage 2 on that sentence without the IC.

Ben's removal rule is right for true no_support that is not a keep-and-flag
compliance/materiality case. Foreseeable exception he did not spell out:
  - Named-entity evidence keep-and-flag (source says "the firm", draft says
    "BVP") should still KEEP the name, not delete the sentence.
  - Public-version compliance strip downgrades already have KEEP-AND-FLAG.
  - If cutting the only sentence in a one-line draft, the UI still needs a
    remnant or an empty-draft policy; do not silently produce a blank document
    without a reviewer-visible CUT explanation.
Those are carve-outs, not reasons to keep unsupported forward expectations.

Shipping parts of honesty repair without reviser EDGE CASE change will not
make deepen disappear. Next dollar should buy the removal-rule change plus the
two-condition Halden IC experiment, not another single-source Suggest.
```
