# Revise: rebuild design

Written 2026-08-28, after the diagnostic evidence made the current design
untenable. Revised the same day for the span contract and the stage 2
narrowing. Read `claude/state-of-play.md` first if you need the wider picture.

**This is a design, not a spec.** Nothing is built.

## Why rebuild

Revise makes ONE model call that does THREE jobs at once: decide which findings
to act on, write the new prose, and report what it did using an inline marker
format. Those jobs are entangled in a single generation and the model is
unreliable at each of them in a different way.

The evidence, all measured this week:

```
The model deletes the author's words with no marker at all. 3 runs of 3, on
  the shipped path, against an explicit prompt rule requiring a marker.
  INVISIBLE to every safeguard we have, because they all inspect markers.
Notes claim edits that never happened. 9 on file, 8 of them live.
Notes bundle one real edit with one invented one. Passes every check.
Two thirds of markers on the production draft describe no edit at all.
The prompt contains the exact sentence and the exact edit it should receive,
  as a worked example, and the model produces a no-change note on it 3 of 3.
```

The last line closes the prompt route. The first line closes the auditing
route: **a call that both edits and self-reports can always omit the report.**

Roughly half the Revise codebase now exists to police that single call.

## The governing rule

**The model never returns the draft.** It returns a bounded replacement for one
span that code identified, or a list of proposed edits with spans. Code performs
every mutation.

An earlier version of this doc said "the model never returns text that becomes
the draft", which is wrong: stage 1 returns a replacement sentence and that
sentence goes into the document. The point is narrower and stronger. Code chose
the span, so code knows exactly what could have changed and what did. Everything
outside that span is unreachable by construction rather than by instruction, so
the model is never holding the rest of the document in a writable position and
cannot quietly delete two words three paragraphs away.

## The new shape

```
STAGE 0   code    gather concerns per statement, as today
STAGE 1   model   one call per FLAGGED STATEMENT, returns a decision
          code    validates against the span contract, substitutes, writes the
                  note from what it actually did
STAGE 2   model   one repair call over the assembled draft, returns proposed
                  micro-edits
          code    validates each edit against a hard fence, applies survivors
```

## Stage 1: per-statement

One call per statement carrying at least one concern. Per statement, not per
concern, because two concerns on one sentence must be resolved together.

```
IN   the statement text
     THE SPANS Review already produced, with offsets:
       confirmed spans        the portions the source backs
       unsupported spans      the portions it does not, with verdict
       conflicting spans      with the source's competing value
     every concern on it: kind, reason, source excerpt, conflicting passage,
       suggestedDirection where one exists
     the surrounding paragraph, READ ONLY, for register and flow
OUT  strict JSON
     { action: "edit" | "no_change",
       revised_statement: string | null,
       target_span: [start, end] | null,
       reason: string }
```

### The span contract

Spans are not context, they are the contract. Code rejects the response when:

```
action is "edit" and revised_statement is identical to the original
a CONFIRMED span does not appear verbatim in the revised statement
the revised statement introduces a figure, date or proper noun that appears
  in neither the original statement nor the supplied source
target_span does not correspond to a span Review actually flagged
```

The confirmed-span rule is the important one. It stops the model degrading
material the source does back while fixing material it does not, which is a
failure the current design has no defence against at all.

Code then performs the substitution itself and writes the note from the real
change plus the concern class.

Statements with no concern are never sent and never touched.

### Why this fixes coverage

Every flagged statement gets exactly one call and must return an edit or an
explicit refusal with a reason. There is no third option. A statement the model
declines to fix becomes a visible, countable outcome rather than an absence, and
because the refusal names a span, it is diagnosable rather than merely observed.

Whole-sentence removal for unsupported statements stays in code and runs as a
stage 1 action rather than a model decision. That part already works.

## Stage 2: whole-draft repair

Its job is narrow and specific: **fix what stage 1 broke.** Removing a sentence
can orphan the pronoun in the next one. Cutting a clause can strand a
connective. Nothing in stage 1 can see this, because each call only ever sees
its own statement.

```
IN   the assembled draft, read only
     the list of changes stage 1 made
OUT  a list of proposed edits: { span, replacement, reason }
```

### Permitted operations, deliberately narrow

```
repair a broken reference or orphaned pronoun
adjust or remove a stranded connective
fix punctuation and capitalisation at a join
```

**It may not assert anything.** Not "improve the flow", which is open ended, and
open ended is where this model drifts.

### The fence, enforced in code

```
an edit may only touch a sentence ADJACENT to a stage 1 change
no NEW number, date or proper noun may appear. A name already present in the
  draft MAY be reused, so an orphaned "This relationship" can become "the
  relationship with Meridian Capital", but nothing new can be introduced.
an edit failing the fence is dropped; the rest still apply
```

Rejections are counted. If the fence fires on most proposals, either the fence
is wrong or the pass is being asked the wrong question, and that should surface
early rather than as a vague sense that stage 2 never does anything.

Skipped entirely when stage 1 changed nothing, or when no change created a seam.

### When repair is not possible

Stage 2 failing is safe by design: the stage 1 draft stands. A seam that cannot
be repaired within the permitted operations is LEFT ROUGH, next to the note
explaining what was removed and why. It is not bridged.

A bridging sentence would be new prose asserting something no source backs,
which is the exact thing this product exists to prevent. The user can write that
bridge in ten seconds and it will be their claim rather than ours.

**Ben's position, recorded: he finds this outcome unsatisfying from a product
perspective and wants to see it on real drafts before accepting it.** If rough
seams turn out to be frequent or ugly, the answer is more latitude for stage 2
or a less blunt removal, not a fabricated bridge.

Stage 2 edits are their own class, so a user can accept every evidence
correction and still refuse a flow change.

## Span authority, added as a requirement

Ben's requirement: the spans the reviser is given must reconcile with the spans
the QC card highlights and the spans the sources drawer points at. Those three
cannot point at different things.

Evidence this is not merely tidiness, from one production Review card,
statement 1, three span sets in three coordinate systems:

```
supportSpans      start 1582, end 1682   offsets into the SOURCE document
unsupportedSpans  start 47,   end 125    offsets into the STATEMENT
claims            draftStart 309,
                  draftEnd 351           offsets into the WHOLE DRAFT
```

Nothing in the data declares which frame is which, so every consumer knows by
convention. That is a plausible mechanism for B89, the card and drawer
disagreeing, and it puts the stage 1 span contract at risk: if the frame varies
by which path produced the span, code cannot reliably locate a span inside a
statement and the contract is not enforceable as written.

**Treat single span authority as a BLOCKING prerequisite** until the critique
says otherwise.

## What is kept

```
Review, entirely. Not implicated in any of this.
gatherConcerns and the verdict-to-kind mapping.
The spans Review already produces, now load-bearing.
Deterministic whole-sentence removal, unchanged.
The concern-class reason wordings.
House style and punctuation normalisation.
The fixtures, the harness and the corpus.
```

## What is deleted

All of it exists only to police the single generation. The list below is a
first pass written without repo access and is probably conservative; an
inventory of what actually becomes unreachable is an open item.

```
The inline marker protocol as something the MODEL produces
The MARKERS section of the reviser prompt and its wrap rules
Most of KIND HANDLING, since per-kind guidance moves into the call for that
  kind
applyMarkerHonestyCheck, most of it. The model no longer reports on itself.
note-what-from-diff. Superseded: code writes the note because code made the
  change.
pr9-marker-note-claim.mjs
Marker re-anchoring and offset remapping
Whole-span suppression, added for B88
The D2 underreach_hedging skip
The review-vocabulary retry path
ensureMarkerSentenceTerminalPunctuation
```

Markers still exist in the output. They are built by code from what code did.

## What this fixes, and what it does not

```
FIXES  silent edits, structurally. Code performs every change.
       false and bundled notes, structurally. No model claim to be false.
       coverage blindness. Every flagged statement returns a decision.
       degradation of confirmed material, via the span contract.
       most run-to-run instability. Unflagged sentences are never regenerated.
       accept and reject, nearly free. Every change is already a discrete
         object with a before, an after and a reason.

DOES NOT FIX
       whether the model makes GOOD edits. It may still decline to fix the
         equity cheque sentence. The difference is that the refusal is
         visible, per span, and measurable.
```

This buys truthfulness and visibility, not judgement. Judgement is the next
problem and it is a better problem to have.

## The equity cheque question

Nobody knows why the current design fails to fix

> The fund intends to build a portfolio of 10-14 control-oriented investments,
> with equity checks of EUR 80-100 million apiece.

That exact sentence is a worked example in the prompt with the exact edit it
should receive, and the model returned a no-change note on it 3 of 3.

Candidates, none established: the statement is classified `partial` so the model
reads rule (c) while the worked example lives in rule (b); the confirmed first
half makes the model treat the whole sentence as protected; or it is the same
thing that produces the silent edits, one crowded generation doing a fraction of
its work.

**Stage 1 is the clean experiment.** One call, that sentence, that span, that
concern. If it gets fixed, the answer was competition inside a crowded
generation. If not, the problem is deeper and we learn it in a day.

## Risks and open questions

```
SPANS     single span authority may be a prerequisite. Blocking until the
          critique settles it.
COST      one call per flagged statement instead of one per draft. Meridian
          has 4, plus a repair call. Small calls, unmeasured. Measure before
          committing.
LATENCY   parallelisable across statements. Should improve.
SEAMS     Ben is not satisfied with leaving them rough. Assess on real drafts.
PROSE     sentence-at-a-time editing can read stitched. Stage 2 is the
          mitigation and may not be enough.
CRAFT     craft edits apply silently across the whole draft today and do not
          fit the per-statement model cleanly. Decide where they live.
DEAD CODE the deletion list above is unverified. Inventory it.
UNKNOWN   whether a narrow, well-posed call produces better edits than the
          current wide one. Expected, not proven.
```

## Build order

```
0  Settle span authority. Blocking.
1  Stage 1 behind a flag, alongside the existing path. Measure both against
   the same Review on the committed production fixtures.
2  Compare: edits made, refusals by span, note accuracy, cost, and prose read
   by hand.
3  Stage 2 repair pass, only once stage 1 produces changes worth repairing.
4  Switch over, delete the policing machinery.
```

Same pattern that worked for deterministic removal: build alongside, measure on
one Review, three runs per arm because the reviser does not hold still, then
switch.
