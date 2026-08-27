# Reviser measurement integrity: CUT honesty, noise floor, removal diagnosis

Commit message target:
`fix(pr9): detect CUT markers whose span survives verbatim; add reviser noise floor harness`

No reviser-prompt change. Do not ship 0559301 into `api/suggest-revision`.
Measured EDGE CASE text untouched in this pass.

Artefacts:
- Part 1: `lib/pr9-marker-honesty.mjs`, `tests/pr9-marker-honesty.test.mjs`
- Part 2: `run-reviser-noise-floor.mjs`, `reviser-noise-floor-run{1,2,3}.json`,
  `reviser-noise-floor-meta.json`
- Condition A context: report `52b469f`, prompt measure `0559301`

Identity: eval-ablation Meridian / `meridian_source.txt`. Not claim-spans CS_E3.
Not corpus E3:S0:ic_memo.

---

## Part 1: Honesty detector fix

### Mechanism (CONFIRMED)

```
File: lib/pr9-marker-honesty.mjs
New helpers: honestyCompareKey, tokenSequenceIncludes, cutSpanTextPresentInRevised
Hook: applyMarkerHonestyCheck, BEFORE markerSpanAlignment / LCS reasoning

Condition (region-independent):
  intent === CUT
  AND marker span is non-empty (empty remnant = absent)
  AND the containing sentence in the revised draft (punctuation bounds via
      sentenceBoundsContaining, no LCS) has the same word-sequence key as a
      contiguous sequence still present in the original draft

Verdict: honestyEvent contradiction = cut_but_text_present
Repair: flip intent to KEPT; rewriteHonestyNote first clause
        "Left this wording as written" (same path as cut_but_region_unchanged)

cut_but_region_unchanged left as-is for partial-span cases the new check
does not cover.
```

### Why this shape

```
A non-empty marker span is always a byte-slice of the revised draft, so
"appears in revised" alone is vacuous. The dishonest Condition A failure was
a whole sentence that survived from original to revised while labelled CUT.
Matching the containing sentence word-sequence into the original catches that
without depending on neighbour LCS windows.

True clause-cut remnant: revised sentence word-sequence is NOT contiguous in
the original (middle tokens gone) -> no event. CONFIRMED by existing unit test.
```

### Unit coverage

```
a) CUT, span verbatim, no neighbour edits     -> cut_but_text_present, KEPT
b) CUT, span verbatim, preceding sentence
   deleted (0559301 shape)                    -> cut_but_text_present, KEPT
c) CUT, genuine clause-cut remnant            -> no event
d) KEPT, span present                         -> no event

vitest tests/pr9-marker-honesty.test.mjs: 21 passed.
Replay of condition-a-suggest.json raw under the new detector:
  deepen CUT -> cut_but_text_present, intent KEPT. CONFIRMED.
```

---

## Part 2: Reviser noise floor

### Method

```
Suggest x3 against ONE unchanged Review.
Review reuse: suggest-after-r10-review1.json (Condition A Review from 52b469f).
Prompt: CURRENT SHIPPED (measuredUnsupportedWholeSentenceRemoval OFF).
  Runner asserts live keep-and-flag EDGE CASE present; measured EMPTY DRAFT
  EXCEPTION absent.
Model: writing-rewrite, temperature 0.
No Review re-run.
```

### Noise band

```
7 of 10 unstable across three runs, prompt unchanged.

identical across all three:     3  (lead, fund_desc, hold_period)
varied in intent:               1  (recommend)
varied only in note wording:    3  (exceptional, mark, coinvest)
varied in revised prose itself: 3  (ranking, risk, deepen)
```

### Raw per-card table

```
card         r1 present / intent / prose excerpt
----         ------------------------------------
lead         Y / KEPT / unchanged lead commitment sentence (all 3)
exceptional  Y / CHANGED / inject 2.4x/21% (notes differ; prose same class)
ranking      Y / CHANGED / r1,r2: "...17 exits."  r3: "...exits, based on
               performance across Funds I-IV."
risk         Y / CHANGED / r1: "...is a key strength for the strategy."
               r2: "...is a notable feature of the manager."
               r3: "...supports continuity across fund cycles."
mark         Y / CHANGED / "currently marked at 1.9...24%" (notes differ)
fund_desc    Y / (none) / unchanged (all 3)
hold_period  Y / (none) / "30%" house-style (identical across 3)
recommend    Y / r1 KEPT; r2 two CHANGEDs (one run softens/removes recommend
               clause packaging); r3 KEPT. Prose stays Halden Group + recommend
               in r1/r3; r2 varies packaging.
coinvest     Y / CHANGED / no-fee/no-carry (notes differ slightly)
deepen       r1 Y / CHANGED keep-and-flag soft frame
             r2 Y / CHANGED keep-and-flag soft frame
             r3 N / (no marker) SENTENCE ABSENT from revised draft
```

Full JSON: `reviser-noise-floor-run1.json` .. `run3.json`, meta in
`reviser-noise-floor-meta.json`.

### Re-score 0559301 INTERFERE against this band

```
0559301 INTERFERE cards (from condition-a-removal.md):
  A risk:   destination moved to "is a key strength for the strategy"
  B ranking: top-quartile cut vs bd96a5d KEPT

Noise floor (shipped prompt, same Review family):
  risk:    in proseVaried (3 different recasts across 3 runs, including
           "key strength" on run 1)
  ranking: in proseVaried (r3 injects extra clause; r1/r2 already cut
           top-quartile on the shipped prompt)

Verdict: BOTH moved controls fall INSIDE the noise band.

The 0559301 INTERFERE call is not trustworthy as evidence that the measured
EDGE CASE caused those control moves. On this draft, 7 of 10 cards are already
unstable with the prompt unchanged. A single A/B pair cannot attribute
control motion to the flag.

Separate finding (not an INTERFERE re-score): deepen itself is prose-unstable
on the shipped prompt, and run 3 removed it entirely without the measured
flag. Removal behaviour is inside the noise band too.
```

---

## Part 3: Deterministic removal diagnosis (no code)

### Q1. Does the backend already know which draft sentences have no covering source?

```
YES, at revision-prompt build time, via the Review card already attached to
each statement.

Structure:
  gatherConcerns(statements, publicationMap)
  File: lib/build-revision-prompt.mjs L436-L496
  For each statement row, resolveEvidenceKind(card) (L53-L59) reads the
  card's supportState / displayVerdict. When evidenceKind === "no_support",
  evidenceKindTag (L263-L267) sets evidence.kind = "unsupported".
  Those rows enter the concerns array with statementText + evidence.

Per-source vs aggregated:
  gatherConcerns does NOT re-aggregate across sources. It consumes the
  already-aggregated card verdict.
  Aggregation lives earlier: lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs
  aggregateVerdict (L20-L58). Per-source Stage 2 classifications
  (confirmed / partially_confirmed / conflicting / no_support) become one
  statement verdict: any confirmed wins; else any conflicting; else any
  partial; else not_supported.
  So "no covering source across the whole supplied source set" is exactly
  aggregate verdict not_supported, which gatherConcerns maps to kind
  "unsupported". CONFIRMED.
```

### Q2. What would it take to EXECUTE whole-sentence removal in code after the model returns?

```
Inputs already available at Suggest time:
  draftText, concerns from gatherConcerns (statementText + evidence.kind).

Sentence boundary:
  Match concern.statementText into the revised draft (exact first; fallback
  whitespace-normalised). Resolve bounds with the same punctuation / blank-line
  rules as sentenceBoundsContaining (lib/pr9-marker-honesty.mjs L237+), or
  delete the exact matched slice including trailing newline for paragraph
  drafts like Meridian.

Marker re-anchor:
  After deletion, pick a surviving remnant in a neighbouring sentence (prefer
  previous, else next). Insert a CUT marker on that remnant with a note that
  names no supplied source. Remap all other marker offsets past the deletion
  point (same pattern as ensureMarkerSentenceTerminalPunctuation offset math
  in lib/build-revision-prompt.mjs L868-L894).

Empty-draft guard:
  After planned deletion, if stripMarkers(revised).trim() === "", skip
  deletion; leave sentence; emit KEPT with the loud empty-draft note register.

Finalise chain order (current, L911-L924):
  parseSoftenedMarkers
  -> applyNormalizeMarkerNotes
  -> ensureMarkerSentenceTerminalPunctuation
  -> applyHouseStyleCharNormalizeToRevision
  -> applyCutPunctuationNormalizeToRevision
  -> applyMarkerHonestyCheck

  Deterministic removal should run AFTER parse (and ideally after house-style
  / cut-punctuation so offsets are stable), and BEFORE or AFTER honesty.
  Before honesty is cleaner: honesty then validates the new CUT remnant.
  If after honesty, re-run honesty on the mutated markers.

What would break:
  - statementText mismatch when the model already rewrote that sentence
    (then code must no-op or search original offsets).
  - Multi-sentence statement cards (rare here; Meridian is one sentence per
    card).
  - kind "unsupported" that is phrase-level (figure WAS the claim) vs true
    whole-sentence no_support: must gate on whole-statement / no surviving
    confirmed remnant, not every unsupported.
  - Interaction with measured EDGE CASE if both model and code delete.
  - Marker collision if the neighbour remnant already carries a marker.
  - B88 deliberately strips whole-statement unsupported spans from the
    prompt (L271-L274) to avoid delete-the-sentence cues; code removal would
    bypass that by design.
```

### Q3. Does the MARKERS section require every change to be wrapped?

```
Quoted (lib/build-revision-prompt.mjs L1023-L1031, L1061):

  MARKERS (reviewer-confirm spans):
  - Wrap each reviewer-confirm span as: {{span||INTENT: short reviewer note}}
  - INTENT is exactly one of CHANGED, KEPT, CUT ...
  - CUT: content adjacent to this marker was removed, and the marker sits on
    a surviving remnant because the removed text no longer exists to wrap.
  - Markers are allowed ONLY for: conflict, unsupported, partial, deletion,
    soften, compliance_add, compliance_claim, compliance_strip ...
    Kind "craft" MUST NOT emit a marker - apply the edit in unmarked prose.
  ...
  Return only the full revised draft (with {{...||...}} markers only where
  kinds above require a flag).

So: not every change needs a marker (craft is silent). Evidence / compliance
/ deletion / soften flags do.

Is model-emitted omission expressible?
  YES. CUT is defined as: removed text is gone; marker wraps a surviving
  remnant. Whole-sentence omission with a neighbour CUT marker is exactly
  the format. The format does NOT forbid Condition A; it forbids wrapping the
  deleted sentence itself (because "the removed text no longer exists to
  wrap"). Condition A's failure was the model violating that CUT definition
  while still emitting CUT intent.
```

### Q4. Smaller and safer: code removal vs instructing the model?

```
Recommendation: execute whole-sentence removal in code from the backend's
aggregated no_support determination (with empty-draft guard), rather than
continuing to instruct the model to omit.

Reason (not preference):
  1. The backend already knows the predicate (Q1). Asking the model to
     rediscover it is redundant and unstable (Part 2: deepen removed on 1 of
     3 shipped-prompt runs and kept on 2).
  2. The marker format already describes correct omission (Q3). The model
     failed at the omission step while emitting the right intent label
     (Condition A). Honesty can only relabel; it cannot delete.
  3. A post-finalise (or pre-honesty) deterministic delete is a small,
     testable function over statementText + revisedDraft + concerns. Prompt
     hardening fights a keep-and-flag EDGE CASE and a 7/10 noise band.
  4. Scope it narrowly: only evidence.kind === "unsupported" with no
     phrase-level remnant path (true whole-statement no_support), never
     kind deletion / partial / compliance.

Instructing the model remains useful for surgical phrase cuts and conflict
rewrites where judgment is required. Whole-sentence no_support is not that
case.
```

---

## Cost

```
Part 1: free (unit tests)
Part 2: Suggest x3 ~USD 0.15 (wall ~5-6 s each; Reviews reused)
Part 3: free
Total this pass: ~USD 0.15
```

---

## Opinion

```
cut_but_text_present closes the Condition A false pass. Ship that.

The noise floor on this Meridian Suggest path is severe (7 of 10). INTERFERE
and even primary removal calls on a single run mean little until controls are
scored against that band or Suggest is made more deterministic.

I would not spend the next dollar on measured EDGE CASE prompt wording. I
would prototype deterministic unsupported whole-sentence removal behind a
diag flag, using gatherConcerns kind unsupported, and measure A/B again with
x3.
```

---

## Technical summary

- Added region-independent `cut_but_text_present` in `lib/pr9-marker-honesty.mjs`
  with repair to KEPT; four new unit cases; full honesty suite green.
- Ran Suggest x3 on shipped prompt vs reused Condition A Review; noise band
  **7 of 10 unstable**; 0559301 INTERFERE controls sit inside that band.
- Diagnosis: aggregated no_support is already known at Suggest time; marker
  format allows omission via remnant CUT; code-side removal is the smaller
  safe path for whole-sentence unsupported.

## Plain-language summary

Suggest will no longer keep a "removed" chip on a sentence that is still on
the page. Separately, on this draft Suggest already wobbles on most cards
even with no prompt change, so earlier "interference" calls were too strong.
The reliable way to delete a sentence nothing supports is for the backend to
delete it, not to ask the model again.
