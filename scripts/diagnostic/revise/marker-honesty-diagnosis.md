# Marker honesty diagnosis (after Suggest measure 25ae739)

Free. No model calls. Propose and critique only. Nothing built.

Fresh evidence on a known Pr9 problem. Records must not diverge from the
Pr9-correctness arc already shipped in-repo.

Source run: `scripts/diagnostic/revise/suggest-after-r10.md` and JSON under
the same folder (commit `25ae739`). Identity: eval-ablation Meridian draft vs
`scripts/diagnostic/eval-ablation/meridian_source.txt`. eval-ablation EA_E3
(mark), claim-spans CS_E3, and corpus E3:S0:ic_memo remain three different
statements; this note only uses eval-ablation EA_E3 / EA_E2.

---

## 1. Where markers come from

They are a mix. Construction is CONFIRMED.

```
Model (writing-rewrite, temp 0)
  emits draft text with {{span||INTENT: note}} delimiters
  CONFIRMED: lib/build-revision-prompt.mjs MARKERS section L991-L1013
             (prompt instructs the model to wrap spans and declare INTENT)

api/suggest-revision.js L103-L111
  raw = LLM text
  finalized = finalizeSuggestRevisionText(raw, { originalDraft })

finalizeSuggestRevisionText (lib/build-revision-prompt.mjs L894-L907)
  1. parseSoftenedMarkers          (L710-L733)  extract spans + intent + note
  2. applyNormalizeMarkerNotes                 note style only
  3. ensureMarkerSentenceTerminalPunctuation
  4. applyHouseStyleCharNormalizeToRevision    remap offsets
  5. applyCutPunctuationNormalizeToRevision    remap offsets
  6. applyMarkerHonestyCheck                   deterministic post-check
```

What each half owns:

```
MODEL half
  chooses which characters to wrap
  chooses INTENT (CHANGED | KEPT | CUT)
  writes the note body

CODE half (parse)
  turns delimiters into { start, end, note, intent } on the clean draft
  does not invent markers from a diff

CODE half (honesty)
  compares each marker span to an LCS-aligned original region
  (lib/pr9-marker-span-status.mjs markerSpanAlignment L103-L167)
  on contradiction, rewrites the NOTE first clause and logs honestyEvents
  does NOT flip INTENT
  CONFIRMED: lib/pr9-marker-honesty.mjs applyMarkerHonestyCheck L247-L304
             firstClauseForContradiction L192-L203
             test asserts intent stays CHANGED after rewrite:
             tests/pr9-marker-honesty.test.mjs L78-L105
```

They are not computed from a whole-draft diff. Markers that appear in the
response were model-emitted, then optionally note-rewritten by code.

Which half is wrong in each observed Suggest1 case: see section 3.

---

## 2. Prior arc (read first)

### Claude project docs

```
claude/pr9-rewrite-correctness-arc.md
claude/pr9-finding-handling-rulebook.md
claude/pr9-before-after-evidence.md
```

These paths are cited in-repo as Claude project docs **not in this repo**.
CONFIRMED: docs/BACKLOG.md Pr9-correctness closed row (~L298);
docs/ROADMAP.md Pr9 rewrite-correctness (~L24, L143-L154).
`mdfind` / workspace search found no copies under the GitHub trees used here.
This diagnosis therefore uses the in-repo record (BACKLOG, ROADMAP, code,
tests, harness). It does not invent the missing Claude files.

### What was already established (in-repo)

```
Problem the arc fixed
  A revision could attach a note claiming a removal to text it left untouched,
  reproduced 3/3 on a production sentence.
  CONFIRMED: docs/ROADMAP.md L143; docs/BACKLOG.md Pr9-correctness closed.

What was tried / shipped (2026-08-23)
  pr9-claim-spans   (d8ab2df)  claim spans into rewrite prompt
  pr9-soften-or-cut (0cd76a5)  soften / cut clause / keep-and-flag
  pr9-marker-intent (00cce35)  CHANGED|KEPT|CUT + deterministic honesty check
  pr9-cut-punctuation (71500c4) tidy joiners after clause cuts
  CONFIRMED: same BACKLOG / ROADMAP rows.

What was concluded
  Arc SHIPPED. Residuals B80 (CUT vs CHANGED labelling), B81 (stranded
  leftovers not repaired). Process P15: the marker harness measures honesty,
  not rewrite correctness (invented figure / filler / malformed sentence can
  still pass with consistent notes).
  CONFIRMED: docs/BACKLOG.md B80, B81, P15; docs/ROADMAP.md L150.

Standing process lessons already on the books
  P18: when an instruction about absence backfires, stop writing instructions
       and write a check.
  P15: do not treat honesty cross-tabs as proof of good edits.
  CONFIRMED: docs/BACKLOG.md P15, P18.
```

### Same defect, regression, or new variant?

```
SAME FAMILY as the original Pr9 honesty problem
  Model claims an edit on text that did not change (statement 0 Suggest1).
  That is exactly the class pr9-marker-intent was built to catch.
  CONFIRMED: honestyEvents[0] contradiction=changed_but_identical in
  suggest-after-r10-suggest1.json; matches applyMarkerHonestyCheck design.

NEW / VARIANT relative to what shipped
  1. Honesty repair rewrites a CORRECT note into "Left this wording as written"
     because the model wrapped the wrong remnant (IRR) while the real edit sat
     elsewhere in the same sentence. User-visible note becomes false; intent
     stays CHANGED. That is a repair-induced honesty failure, not the original
     "note claims removal on untouched text" alone.
     CONFIRMED: honestyEvents[1] noteBefore describes has returned -> marked;
     noteAfter is "Left this wording as written"; intent remains CHANGED.
     tests/pr9-marker-honesty.test.mjs L104 keeps intent CHANGED on purpose.

  2. NOTE vs INTENT contradiction is a designed outcome of the current repair
     (note says left alone, intent still CHANGED). The original arc fixed
     "note claims change on unchanged span" by rewriting the note; it did not
     make note and intent agree.

  3. Not a regression of rewrite quality on eval-ablation EA_E3: the prose edit
     is good. Marker layer is the defect.
```

Do not restate the original arc as a new discovery. The Meridian Suggest run
is fresh evidence that the shipped honesty check fires, and that its repair
can make the user-facing note worse when the model wraps the wrong remnant.

---

## 3. The three cases (Suggest1), each separately

Evidence: `suggest-after-r10-suggest1.json` `payload.honestyEvents` and
`payload.markers`; draft comparison in `suggest-after-r10-run-meta.json`.

### Case A: mark card (eval-ablation EA_E3)

```
What actually changed in prose
  "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR."
  -> "Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR."
  CONFIRMED: run-meta / suggest1 revisedDraft.

What the model emitted (before honesty), CONFIRMED honestyEvents[1]
  span wrapped: "IRR" only (start=553 end=556 on final draft)
  intent: CHANGED
  noteBefore: "Changed 'has returned' to 'is currently marked at' to align
              with the source description. Confirm before publishing."

What honesty did
  spanStatus UNCHANGED (aligned region is just IRR / IRR.)
  contradiction: changed_but_identical
  noteAfter: "Left this wording as written. Confirm before publishing."
  intent: still CHANGED

What the user sees
  Marker on "IRR", intent CHANGED, note says left as written.
  The sentence DID change; the wrapped remnant did not.

Failure types
  (1) Marker attached to text that was never edited (the remnant IRR).
      Model placement error (wrong wrap for a CUT/CHANGED sentence edit).
  (2) NOTE contradicts INTENT after repair (code). Honesty destroyed an
      accurate sentence-level note because it only looks at the remnant.
  Mix: model half wrong on wrap; code half wrong on repair policy.
```

### Case B: statement 0 (lead commitment)

```
What actually changed
  Nothing. Paragraph identical to original.
  CONFIRMED: suggest-after-r10.md para diffs; run-meta.

What the model emitted, CONFIRMED honestyEvents[0]
  span: full lead sentence (minus terminal punct in the marker)
  intent: CHANGED
  noteBefore: "Removed the specific 'lead commitment' detail and timing..."

What honesty did
  changed_but_identical
  noteAfter: "Left this wording as written. Confirm before publishing."
  intent: still CHANGED

What the user sees
  Underline / CHANGED chip on untouched text; note says left alone.

Failure types
  (1) Marker on text never edited: model claimed an edit it did not make.
  (2) NOTE vs INTENT after repair: code left CHANGED while rewriting the note
      to a keep claim.
  Mix: model half wrong on the claim; code half incomplete on the repair
      (should have become KEPT, or dropped the marker).
```

### Case C: statement 9 (deepen), softer

```
What actually changed
  Nothing on that sentence. Still:
  "Halden Group expects the relationship to deepen over the life of the fund."
  CONFIRMED: para diffs.

What the marker claims (final markers, no honestyEvent for this one)
  intent: CHANGED
  note: "Kept the expectation as a forward-looking view despite no direct
         source support, as removing it would cut the author's point.
         Confirm before publishing."
  CONFIRMED: suggest1 markers last entry.

Alignment quirk
  markerSpanAlignment on this span reports spanStatus CHANGED because the
  original region bleeds into the adjacent co-invest deletion
  ("that would not otherwise have been available to us. Halden Group expects...").
  CONFIRMED: offline alignment dump in this diagnosis session.
  So honesty did NOT fire; the comparator treated keep-and-flag prose as CHANGED.

Failure types
  (1) Soft NOTE vs INTENT: note says Kept; intent says CHANGED. Model-authored.
  (2) Not "marker on never-edited text" in the honesty-check sense: the check
      thought the region changed (adjacent-edit bleed). Code comparator gap.
  (3) Prose honestly kept (keep-and-flag is a valid kind outcome); the marker
      packaging is what is soft-wrong.
```

### Suggest2 contrast (same Review statements)

```
Mark card: model wrapped "1.9 times gross MOIC and a 24% gross IRR" with
  CHANGED and an accurate note. No honestyEvents key (no contradictions).
  CONFIRMED: suggest-after-r10-suggest2.json markers.
  Same defect class is inconsistent across samples, not always wrong.

Lead / deepen on Suggest2: notes still narrate edits the prose did not make
  (lead still says "lead commitment"; deepen still says "expects...deepen"
  while the note claims a soften to "intends to continue"). Separate from
  the Suggest1 honesty-repair path; model note lying again.
```

---

## 4. Is this detectable mechanically?

Yes. A check already exists. The gap is what it does after detection, and
what it fails to see.

```
Already shipped (free, no model)
  applyMarkerHonestyCheck
  Detects: CHANGED+identical, KEPT+differs, CUT+unchanged region.
  CONFIRMED: lib/pr9-marker-honesty.mjs L266-L273.

Already exists as a diagnostic classifier (free)
  scripts/diagnostic/lib/pr9-marker-consistency.mjs
  Buckets note claim vs span status (including
  defect_unchanged_claims_change).
  CONFIRMED: outcomeBucket L84-L94.
```

What a stronger mechanical check should add (sketch, not built):

```
A. Intent repair (code)
   On changed_but_identical / cut_but_region_unchanged:
     set intent = KEPT (or drop marker), not only rewrite the note.
   Cost to run: $0. Unit tests only.
   Where: lib/pr9-marker-honesty.mjs (+ extend tests/pr9-marker-honesty.test.mjs).

B. Remnant-too-narrow / edit-elsewhere (code)
   If intent is CHANGED|CUT, spanStatus UNCHANGED, but the containing
   sentence (or paragraph) word-sequence differs from the aligned original
   sentence: flag remnant_missed_edit. Do not rewrite an accurate note into
   "Left this wording as written". Options: leave noteBefore, expand marker
   to the sentence, or surface honestyEvents to the UI.
   Cost: $0. Detectable from original + revised + marker offsets alone.
   Where: same honesty module or a sibling post-check called from
   finalizeSuggestRevisionText.

C. Note vs intent agreement (code)
   If note classifies as keep-language (Kept/Left as written) and intent is
   CHANGED|CUT, or note claims a change verb and intent is KEPT: flag.
   Cost: $0. Reuse classifyNoteClaim from pr9-marker-consistency.

D. Coverage gap (optional, separate)
   Concern present, no marker overlapping the statement, and statement text
   unchanged: flag unaddressed_concern. That is rewrite coverage, not marker
   honesty. Do not mix into the honesty gate.
```

A deterministic honesty check is worth more than another prompt line. P18 and
two days of prompt interference already argue against more marker instructions.

Verification without a paid run: replay finalizeSuggestRevisionText on stored
raw LLM text if available; for Suggest1, honestyEvents already prove the
before/after. New unit fixtures can be built from those noteBefore strings
and the Meridian original/revised pair at $0.

---

## 5. Recommended next pass (one)

```
WHAT
  Code change only: fix applyMarkerHonestyCheck repair policy.
  Minimum:
    1. On changed_but_identical, flip intent to KEPT (match the note).
    2. On remnant UNCHANGED but parent sentence CHANGED, do NOT clobber
       noteBefore with "Left this wording as written"; emit remnant_missed_edit
       in honestyEvents (and preferably expand or keep the accurate note).
  Add unit tests from Suggest1 honestyEvents (IRR remnant; lead untouched).
  No reviser prompt edit. No live Stage 2 prompt edit. No fixtures rewrite
  of Review baselines.

COST
  $0 (unit tests). Optional later: one free offline replay if raw LLM text
  is ever logged; not required to ship the intent-flip.

STOPPING RULE
  PASS if the two Suggest1 honestyEvents cases, reconstructed as fixtures,
  exit with note and intent agreeing, and the IRR case no longer tells the
  user the wording was left alone when the sentence changed.
  FAIL if tests need a model call or a prompt tweak to "pass".

DO NOT
  Do not add more marker instructions to the reviser prompt.
  Do not spend another ~$1 Meridian Suggest to "see if honesty improved"
     before the unit fix lands; the defect is already reproduced in
     honestyEvents.
  Do not fold rewrite coverage (statement 0 untouched) or judgement-to-fact
     into this pass.
  Do not paper over B80 by teaching honesty to relabel CUT vs CHANGED.
```

Critique of that recommendation: intent-flip alone fixes Case B's chip/note
mismatch but not Case A's lost accurate note. The remnant_missed_edit branch
is the part that protects the mark card. Shipping only (1) without (2) would
leave users seeing KEPT on "IRR" while the sentence changed silently in the
diff: better than today's lie, still incomplete. Prefer (1)+(2) in one pass.

If the answer were "already known, follow the pr9 plan": the arc is closed;
residuals are B80/B81, not this repair-policy gap. This is a follow-on defect
in the honesty repair itself, not a return to open Pr9-correctness work.
Record it against the closed arc as a new residual (or reopen a thin honesty
row), rather than pretending B80 covers it.

---

## 6. What Claude's next spec is likely to get wrong

```
1. Origin
   Claiming markers are "computed from the diff" or "purely model". They are
   model-emitted then code-rewritten. The Suggest1 mark failure is mostly the
   code rewrite of a good model note after a bad wrap.

2. Honest marker definition
   Treating "note says left alone" as honesty success. After the current
   repair, that string is often the smell of a contradiction, especially when
   intent is still CHANGED. Honest means intent, note, and span status agree,
   and the wrap covers the edit (or a true CUT remnant with adjacent deletion
   in the alignment window).

3. Verification without a paid run
   Demanding another Production Suggest to validate. honestyEvents + unit
   fixtures are enough for the code fix. A paid run is only needed later to
   check model wrap rates, not the repair policy.

4. Prompt-first reflex
   Adding "always wrap the full changed clause" to the reviser prompt. That
   fights P18 and will collide with CUT remnant rules already in the prompt
   (L997-L999).

5. Collapsing Case A and Case B
   Same honestyEvent type (changed_but_identical), different root causes
   (wrong remnant vs false edit claim). One repair policy must branch.

6. Blaming B80
   B80 is CUT vs CHANGED labelling when honesty already passes. Case A is
   honesty destroying a correct note. Different residual.
```

---

## 7. Anything we have not asked

### Rewrite coverage incomplete (statement 0)

```
CONFIRMED: Suggest1 left the lead-commitment sentence untouched despite a
partial evidence gap in the concerns block (Part 0 Statement [0]; Suggest1
para 0 unchanged).
That is a coverage / routing / kind-handling question, not marker honesty.
The model even narrated a removal it did not perform (honestyEvents[0]
noteBefore). Fixing honesty will make the marker say "left as written"
with KEPT (after the recommended repair); it will not make the rewriter
address the gap. Scope separately.
```

### Judgement turned into fact recital (statement 1)

```
CONFIRMED: Suggest1 replaced
  "that is, in our view, genuinely exceptional"
with sourced "2.4x realised gross MOIC and 21% gross IRR across 17 fully
realised exits" (suggest1 revisedDraft; figures appear in
eval-ablation/meridian_source.txt track record lines).
Not fabrication. House-voice / authorial judgement question: softens
evaluation by substituting a fact recital. Out of scope for honesty.
Do not treat as a marker defect.
```

### Instability vs honesty (opinion)

```
Marker honesty is worth fixing now. The rewrite path just started producing
edits worth accepting (eval-ablation EA_E3 mark PASS + second Review CLEAR).
Markers are how a user checks those edits. A system that changes "returned"
to "marked" and then tells the user it left the wording alone is worse than
unstable softens on secondary cards.

Revision instability (Suggest1 vs Suggest2 drift on EA_E2 and others) still
matters, but it is a different bet: measurement and possible temperature /
sampling policy, not a deterministic lie in the accept UI. Do honesty first
at $0; do not wait on instability work to make markers trustworthy.
```

---

## Bottom line

```
Markers: model-produced delimiters + code parse + honesty note rewrite.
The three Suggest1 failures are the SAME FAMILY as Pr9-correctness, with a
NEW VARIANT: honesty repair can erase a correct note when the wrap is a
wrong remnant, and it leaves INTENT disagreeing with the repaired note by
design (tests/pr9-marker-honesty.test.mjs L104).

Next pass: code check repair policy + unit fixtures from honestyEvents.
Not a prompt change. Not another paid Meridian Suggest first.
```
