# Finish the principle in the prompt, and fix two note defects

Measured 2026-08-29, `gpt-5.1-2025-11-13`, temperature 0, deterministic removal off.
Artefacts: `silence-never-edits-prompt.json`, `silence-never-edits-prompt.tables.md`.
Script: `scripts/diagnostic/revise/silence-never-edits-prompt.mjs`.

## Verdict: CONFIRM

Both target lines, three runs of three:

```
"In June 2026,"                                    KEPT  3/3
"equity checks of EUR 80-100 million apiece"       KEPT  3/3
```

Zero controls moved outside the instability band on either arm. Zero notes
described a change outside their own span across all six runs. Re-review of the
equity cheque sentence returns `supported_partial`, not `supported_full`: the
unsupported clause is still there, and Review can still see it.

Cost: **$0.0328** over six Suggest calls plus one Review, 98% prompt cache hit.

## Part 0, answered before the prompt was touched

### 0a, the two rules and their branches

Rule (b), line 1085 before the change:

> b) kind "unsupported": If the source STATES a specific value, put that source
> value in the prose (house-style) and flag it - same figure rule as
> conflict/partial. **Soften WITHOUT a number only when the source is silent or
> vague (true unsupported).** Never invent a figure the source does not state.
> **When the source is silent or vague, apply ONE TEST before editing: after
> removing the unsupported figure, does the remaining phrase tell a reader
> anything they did not already know?**
>
> (1086) — YES, the claim stands without the number: **SOFTEN.** Remove the
> figure, keep the phrase, wrap and flag. Example: "delivered 22% revenue growth
> last year" becomes "delivered revenue growth last year".
>
> (1087) — NO, the figure WAS the claim: **CUT THE CLAUSE.** Remove the clause
> entirely rather than leaving a hollow phrase in its place. Examples: "The fund
> intends to build a portfolio of 10-14 control-oriented investments, with equity
> checks of EUR 80-100 million apiece." becomes "The fund intends to build a
> portfolio of 10-14 control-oriented investments."

Rule (c), line 1094 before the change:

> c) kind "partial": Keep the CONFIRMED portion unchanged. **If the source STATES
> a specific value for the unsupported element, inject that source value into the
> prose (house-style) and wrap THAT element in a marker** (e.g. "around USD 1.9
> billion"). **When the source is silent or vague on the unsupported element,
> apply the same ONE TEST as (b) to that element only: SOFTEN if the remaining
> phrase still tells the reader something; CUT THE CLAUSE if the figure WAS the
> claim; keep-and-flag only if cutting would remove the whole sentence.** Never
> approximate the author's unsupported figure. Do not vague out a supported fact
> because another part of the same statement is unsupported.

| branch | trigger | disposition |
| --- | --- | --- |
| (b) first clause, 1085 | source STATES a value | **survives untouched** |
| (b) ONE TEST + 1086 + 1087 | source SILENT or vague | **removed** |
| (c) first two sentences, 1094 | source STATES a value for the element | **survives untouched** |
| (c) "same ONE TEST as (b)" clause | source SILENT on the element | **removed** |

### 0b, which branch produced the equity cheque substitution, and the defect it names

Line 1087, the CUT branch of rule (b). The prompt carried this exact sentence as
its own worked example of a correct cut, which is why the model performed it
verbatim on the fixture it was drawn from.

**Rule (b) did not distinguish a different VALUE for the same fact from a
different FACT entirely, and that is the defect.** The rule's whole laundering
argument — "Approximating the AUTHOR'S unsupported figure is forbidden … it
carries the appearance of diligence with none of the substance" — was scoped to
figures. Everything it says about a derived number applies with more force to a
substituted clause, and the rule said nothing about clauses. So the model cut
"with equity checks of EUR 80-100 million apiece", found "reserved capital for
bolt-on acquisitions" in the source, and put it in the hole. The output passed
every check the rule imposed, and came back `supported_full` on re-review.

### 0c, everything else in the prompt that instructed an edit on silence

Beyond rules (b) and (c), at pre-change line numbers:

| line | text | disposition |
| --- | --- | --- |
| 1082 | KIND HANDLING preamble: "Removing unsupported PRECISION while the point survives, or cutting the clause when it does not. Triggered by an evidence gap with a silent source. Rule (b). **Do it and flag.**" | rewritten |
| 1088 | `${unsupportedWholeSentenceEdge}`, the EDGE CASE injection | no longer injected |
| 1089 | "A phrase left behind purely to occupy the space where a number used to be is worse than either alternative" — argues for cutting over keeping | removed |
| 1118 | MARKER EXAMPLE "(unsupported, source silent, claim stands)": `delivered revenue growth last year` | rewritten as keep-and-flag |
| 1119 | MARKER EXAMPLE "(unsupported, source silent, figure WAS the claim)": `CUT: Removed the unsupported 14x EV/EBITDA clause` | rewritten as keep-and-flag |
| 599 | concerns block label: "Unsupported element (**the softening rule applies to this span**)" | rewritten |
| 625, 654 | "(No excerpt/reason available - **soften or qualify the claim** without inventing support.)" — fires on total silence | rewritten |
| 1073 | "LESS HEDGING: **soften only the unsupported/overreaching element**" | rewritten |

Lines 599, 625, 654 and 1073 sit outside KIND HANDLING, which the spec scoped
the edit to. They were changed anyway, and this is the one place the spec's
scope was exceeded: line 599 is the label attached to the equity cheque span
itself on every run, and it named the softening rule. Leaving it, and the
no-excerpt fallbacks that instruct softening when there is no excerpt at all,
would have left the prompt telling the model to soften on silence in four places
while rules (b) and (c) told it not to. The register work exists precisely
because that contradiction was what made the last measurement invisible.

### 0d, what became dead

The ONE TEST, both its branches, the EDGE CASE that braked the cut branch, and
the "hollow phrase" argument that justified preferring a cut. All of it existed
only to choose between soften and cut on a silent source, and there is no longer
a choice to make. `UNSUPPORTED_WHOLE_SENTENCE_EDGE_CASE_LIVE` stays exported and
on disk, unreferenced by the prompt, per the repo's delete-nothing convention.

### 0e, what this could break, and what actually did

Stated before the edit:

- **Conflict, rule (a).** Not touched. (a) has its own silence-adjacent branch —
  "Hedge or drop the precise number ONLY when the source states no replacement
  value" — but its trigger is a source that CONTRADICTED the draft, not one that
  said nothing. Distinct condition, left alone. *Risk did not materialise.*
- **Partial where the source DOES state a value.** The first two sentences of
  (c) are the injection path and are byte-identical after the change. *Held.*
- **Dangling cross-reference.** (c) said "apply the same ONE TEST as (b)". If (b)
  had been changed alone, (c) would have pointed at nothing. Both were changed
  in the same edit. *Handled.*
- **Outward cross-reference from (b) to (i).** The cut branch said "following the
  same pattern the compliance strip path already uses". The reference points from
  (b) to (i), not the reverse, so removing (b)'s cut branch cannot orphan the
  compliance strip rule. *Verified: rule (i) unchanged, compliance tests green.*
- **The CUT intent vocabulary.** `INTENT is exactly one of CHANGED, KEPT, CUT`
  stays valid: compliance_strip still cuts. *Held, and CUT was still emitted in
  every Meridian run for the marketing deletion.*
- **Craft and house style.** Rule (f) applies silently and was not touched.
  Oxford comma insertion and other mechanical fixes still happen and still do not
  earn markers. *Held; visible in the diffs, absent from the notes.*
- **Worked examples other rules refer to.** The 22% and 14x examples were
  referenced only within (b) and by the MARKER EXAMPLES block; both were updated
  together so no rule cites a removed example.

Three tests asserted the removed behaviour and were rewritten to assert the new
rule: the softening label on the claim span, the `true unsupported` phrase, and
the ONE TEST block. That was the expected blast radius and the whole of it.

### 0f, anything else

The `deterministicUnsupportedRemoval=false` change from the previous spec is a
precondition here, not a duplicate: if code removal were still on it would
delete the equity cheque before the prompt ever saw it, and this measurement
would report a false pass. The measurement asserts `removals=0` on every run to
prove code removal did not silently do the prompt's job. It was 0 in all six.

## Part 1, the prompt change

| | |
| --- | --- |
| prompt hash before | `dc423e748baaf0f0` |
| prompt hash after | `c8da5694947a3ae1` |
| characters | 34,027 → 33,307 |
| delta | **−720** |

Measured on the Meridian production fixture with `coverage-gap-review.json`
concerns, `reporting_commentary` / `complete`. Value injection is preserved
verbatim in both rules. The silence branches are gone, and the prompt now
contains no occurrence of `SOFTEN`, `CUT THE CLAUSE`, `ONE TEST` or
`softening rule` — asserted in the test suite so it cannot come back unnoticed.

The new prohibition, in rule (b):

> **NEVER SUBSTITUTE A DIFFERENT FACT.** Where the source is silent on what the
> draft asserts, do not replace the draft's claim with some other statement drawn
> from the source, however well supported that other statement is. "with equity
> checks of EUR 80-100 million apiece" must NOT become "with reserved capital for
> bolt-on acquisitions" because the source happens to mention reserved capital.
> That deletes the author's claim, puts a claim they never made in its place, and
> makes the sentence read as fully supported on re-review.

## Part 2, the two note defects

### 2a, span leak

`markerSpanAlignment` runs its original-side window from the nearest aligned
token left of the marker to the nearest aligned token right of it. When the text
after the marker was deleted too, the next anchor is a whole sentence away and
the window swallows that sentence's deleted words. That reach is correct for the
honesty check — a clause cut beside a byte-identical remnant must read as
CHANGED — and wrong for a note, which is why the 986-1057 marker reported
`Removed "We recommend"` about the following sentence.

`confineRegionToOwnSentence` in `lib/pr9-note-what-from-diff.mjs` clips the
region to the original sentence its first token falls in, with two guards:

- a marker whose own span carries an internal sentence terminator legitimately
  accounts for more than one sentence and keeps the full region;
- a token is only ever dropped if it is **absent from the revised span**. This
  guard was added after the first measurement run, where an unguarded clip
  turned a kept opening sentence into a false `Added "…1.2 billion flagship
  fund…"`. A leaked token is by definition an unaligned deletion, so it fails the
  absence test; kept prose never does.

Concern tracing was routed through the confined region too, since a leaked
region can overlap the next statement more than its own and pick up that
statement's concern.

`markerSpanStatus` and the honesty check are untouched, and a test asserts the
cut is still CHANGED to it while the note no longer mentions it.

### 2b, wrong reason class

`gatherConcerns` collapses every house-style rule to kind `craft`, and
`concernKind` skips `craft` and prefers evidence. So a voice-consistency fix on a
statement that also carried an evidence gap was explained with "no supplied
source backs this claim" — true of the statement, false of the change.

`editorialReasonForEdits` reads the diff itself: a change that drops first-person
wording and puts none back is an editorial change whatever else the statement was
flagged for, and takes its reason from the editorial concern, keyed by RULE
(`EDITORIAL_RULE_REASONS`) rather than by the collapsed kind. Evidence keeps
priority everywhere else, asserted by a companion test on a figure correction.

Visible live: the marketing deletion in every Meridian run reads
`Removed "and highly regarded" - overstated against the source.`, the soften
concern's reason, not the evidence concern on the same sentence.

Six tests added across the two defects. Suite: **663 passing, 37 files**.

## Part 3, measurement with controls

Two arms. **MERIDIAN** is the production fixture that produced the 2026-08-29
run and carries both targets; every silence finding on it is LOUD. **R10** is
`suggest-after-r10-review1`, added because MERIDIAN cannot exercise QUIET at all
and the pass conditions require both registers visible. R10 has a three-run
instability band already on disk from 2026-08-27, so its controls are scored
against a real reference arm rather than against itself.

| arm | run | In June 2026, | equity cheque | LOUD | QUIET | unreported | leaking notes | removals |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| MERIDIAN | 1 | kept | kept | 2 | 0 | 1 | 0 | 0 |
| MERIDIAN | 2 | kept | kept | 3 | 0 | 1 | 0 | 0 |
| MERIDIAN | 3 | kept | kept | 3 | 0 | 1 | 0 | 0 |
| R10 | 1 | n/a | n/a | 1 | 1 | 2 | 0 | 0 |
| R10 | 2 | n/a | n/a | 1 | 1 | 1 | 0 | 0 |
| R10 | 3 | n/a | n/a | 2 | 2 | 1 | 0 | 0 |

### Registers, and which statements carried them

LOUD, `"No supplied source states this. Do not publish it without one."`

- MERIDIAN, all three runs: the equity cheque clause, and the opening date and
  commitment (`In June 2026, Partners Group committed to Meridian Capital
  Partners V`). The diligence sentence in runs 2 and 3.
- R10, all three runs: `placing it in the top quartile of European
  lower-mid-market managers`. Run 3 also `Halden Group expects the relationship
  to deepen over the life of the fund`.

QUIET, `"No supplied source speaks to this either way."`

- R10, all three runs: `means key-person risk is limited`. Run 3 also `that
  would not otherwise have been available to us`.
- MERIDIAN, none, and correctly none: every flagged element on that fixture is a
  currency figure, a date, a count or a causal claim.

Both registers visible on at least one statement each. This is the first run in
which either has appeared in output: the previous measurement produced zero
because every flagged statement was edited before a register could fire.

### Diligence sentence and recommendation

The diligence sentence survives in 2 of 3 MERIDIAN runs and is scored INSIDE
BAND below. `"We recommend"` **does not appear in the Meridian fixture at all**
(grep count 0), so that presence check is vacuous on this arm and is reported as
such rather than as three failures. It belongs to the removal-breadth corpus,
where the previous spec measured it as QUIET.

### Controls, every statement scored

MERIDIAN, 6 statements: **4 HELD, 1 INSIDE BAND, 1 VACUOUS, 0 OUTSIDE BAND.**

- S5, `This relationship enabled deep insight during the diligence phase.` —
  INSIDE BAND. Preserved verbatim in runs 2 and 3; rewritten in run 1 to
  "supported Partners Group's work during the diligence phase". It held on the
  reference arm, so it is a live control, and it self-varied across three
  identical runs, which places it in the band. This is a residual silence edit
  and the honest reading is that the prompt change reduced it from 3/3 to 1/3
  rather than eliminating it.
- S3, the `and highly regarded` sentence — VACUOUS. It also moved on the
  2026-08-29 reference run, so under the guard it cannot count against this
  change.

R10, 10 statements: **5 HELD, 0 INSIDE BAND, 5 VACUOUS, 0 OUTSIDE BAND.** All
five vacuous statements (S1, S4, S6, S7, S8) failed to survive verbatim on all
three 2026-08-27 noise-floor runs as well; they carry marketing language,
per-cent spellings and first-person constructions that house style rewrites
every time. None of them can count against this change.

**No control on either arm moved outside the band, so an INTERFERE call is not
available on this evidence.**

### Unreported changes

Not zero. One per MERIDIAN run, one or two per R10 run. Every one of them is a
model edit the model itself did not flag, **found and marked** by the unreported
change detector rather than left silent in the output — on MERIDIAN it is the
same `and highly regarded` marketing deletion all three times, which appears in
the output as `[CUT] well-established — Removed "and highly regarded" -
overstated against the source.`

Zero is not reachable on the whole-draft path: the model applies craft edits
under rule (f) without markers by design, and the detector's job is to catch
the ones that are not house-style-mandated. The number that matters is the one
that is zero — no change reached the output unmarked, on any of the six runs.

### Review re-run

`POST /api/analyse-statements` on MERIDIAN run 1's draft, using the captured
production request payload with only `draftText` swapped:

```
http 200, 6 statements
target       The fund intends to build a portfolio of 10-14 control-oriented
             investments, with equity checks of EUR 80-100 million apiece.
supportState partial
displayVerdict supported_partial
supported_full? no
```

The unsupported clause is still in the draft, so Review still sees it and still
reports it. The false green is gone at its source rather than papered over.

## Cost

$0.0328 for six Suggest calls and one Review, 98% prompt cache hit rate. The
prompt is 720 characters shorter, so the shared prefix is marginally cheaper on
every production call as well.

## What is not fixed

- The diligence sentence still gets rewritten roughly one run in three. Silence
  editing is reduced, not eliminated, and the remaining instance is a rewrite for
  voice rather than a removal for evidence.
- Note quality on house-style reformats is still poor. R10 produced
  `Removed "has returned", Added "24%", Added "IRR."` for what is a currency and
  percentage reformat. That is a rule (f) marker that should not exist at all,
  and it is a separate defect from either of the two fixed here.
