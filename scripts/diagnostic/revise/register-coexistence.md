# Stop style edits masking evidence flags, and finish the register

Ran 2026-08-29. `gpt-5.1-2025-11-13`, temperature 0, three runs per arm on the
committed production fixtures. Same Review; no Review re-run.

Reproduce with `node scripts/diagnostic/revise/register-coexistence.mjs`.

**Verdict: CONFIRM.** Every pass condition met. Cost $0.0416 across 6 calls,
80% cache hit.

## Part 4, the measurement

| arm | run | recommendation | key-person | diligence | In June 2026, | equity cheque | unreported | double closer |
| --- | ---: | --- | --- | --- | --- | --- | ---: | ---: |
| MERIDIAN | 1 | vacuous | vacuous | LOUD | kept | kept | 1 | 0 |
| MERIDIAN | 2 | vacuous | vacuous | LOUD | kept | kept | 1 | 0 |
| MERIDIAN | 3 | vacuous | vacuous | LOUD | kept | kept | 1 | 0 |
| R10 | 1 | **EDIT+QUIET** | LOUD | vacuous | n/a | n/a | 0 | 0 |
| R10 | 2 | **EDIT+QUIET** | LOUD | vacuous | n/a | n/a | 0 | 0 |
| R10 | 3 | **EDIT+QUIET** | LOUD | vacuous | n/a | n/a | 0 | 0 |

"vacuous" means the sentence is not in that arm's draft at all, so the cell
carries no evidence either way. The recommendation and the key-person sentence
live only in the R10 fixture; the diligence sentence lives only in the Meridian
fixture. Each target is measured 3/3 in the arm that has it.

Against the pass conditions:

- recommendation carries BOTH its style edit note and a QUIET clause, **3/3**
- key-person sentence stays LOUD, **3/3**
- diligence sentence stays LOUD, **3/3**
- both silence targets from `73bca5d` preserved, **3/3**
- unreported changes: 3 in total, one per Meridian run, **every one substantive**
  — the same `and highly regarded` deletion. R10 produced none.
- no note carries two closers, in any run

The recommendation note, verbatim and identical across all three R10 runs:

> Revised this span - house style names the organisation rather than using
> first person. No supplied source speaks to this either way.

Before this change that note stopped at "first person." The reader was told the
sentence had been restyled and never told that nothing in the pack speaks to
the recommendation.

### Controls

Every other statement scored across the three runs of its arm. Preserved in all
three is HELD; preserved in some is INSIDE BAND; preserved in none, where the
reference arm also preserved it in none, is VACUOUS.

| arm | HELD | INSIDE BAND | OUTSIDE BAND | VACUOUS |
| --- | ---: | ---: | ---: | ---: |
| MERIDIAN | 5 | 0 | 0 | 1 |
| R10 | 6 | 0 | 0 | 4 |

Nothing moved outside the band, and nothing moved inside it either: the two arms
were completely stable across three runs. The vacuous-control guard is applied
— the 5 vacuous rows are statements the reference arm also rewrote every time,
so they are excluded rather than counted as regressions.

## Part 2, the unreported-change replay

Replayed every run on disk that retains the model's raw output, plus the six
live runs above, through `finalizeSuggestRevisionText`.

| | count |
| --- | ---: |
| unreported changes at `61768a2` | 24 |
| now | 5 |
| **skipped as cosmetic** | **19** |
| substantive at `61768a2` | 5 |
| **substantive still marked** | **5** |

All 5 substantive changes survive. The 19 skipped are all percentage notation
and multiples — `24 per cent` to `24%`, `1.9 times` to `1.9x` — which house
style mandates and rule (f) applies silently. What is still marked:

| run | before | after |
| --- | --- | --- |
| deterministic-removal-off-run2 | *(nothing)* | `has` |
| reviser-noise-floor-run3 | `has returned` | `is currently marked at` |
| live-MERIDIAN-run1 | `well-established and highly regarded` | `well-established` |
| live-MERIDIAN-run2 | `well-established and highly regarded` | `well-established` |
| live-MERIDIAN-run3 | `well-established and highly regarded` | `well-established` |

This is why option B was not adopted. All three live rows are the same
craft-attributed deletion of `and highly regarded`, and skipping by concern
would have let a real deletion through unmarked.

## Part 0

### a) Where the register declines to fire

`lib/pr9-note-what-from-diff.mjs:466` at the time of the spec, now line 517
after this change added a helper above it. The gate on the whole register
branch:

```517:524:lib/pr9-note-what-from-diff.mjs
  if (edits.length === 0) {
    const concern = resolveConcernForMarker(original, ownAlign, concerns);
    if (concern) {
      const decision = flagRegister(concern, null, spanText(revised, start, end));
      if (decision.note) {
        return {
          body: decision.note,
          clause,
```

Confirmed: where `edits.length > 0` the function fell straight through to the
edit-note path and the register was never consulted. A statement carrying both
an edit and an unaddressed silence finding emitted **only** the edit note.

The gate was deliberate when it was written — stamping "No supplied source
states this" over a note describing a real edit would be its own lie. The fix is
not to remove the gate but to add the register as a second clause after the edit
clause, which is Part 1.

### b) Sizing the masking, before fixing it

Across the committed artefacts, cross-referenced against every revised draft on
disk (10 for `suggest-after-r10-review1`, 1 for `condition-b-review`, 3 for
`coverage-gap-review`):

**8 of 13 silence-flagged elements are edited in at least one run**, and so had
their flag masked.

| artefact | S | register | edited in | element |
| --- | ---: | --- | --- | --- |
| r10-review1 | 1 | QUIET | 10/10 | We were attracted to Meridian on the strength of a track record… |
| r10-review1 | 2 | LOUD | 7/10 | It has realised a gross MOIC of 2.4 times across 17 exits… |
| r10-review1 | 3 | LOUD | 7/10 | The team's stability, with no senior departures… |
| r10-review1 | 7 | QUIET | 10/10 | On balance, we believe the fund should deliver returns… |
| r10-review1 | 8 | QUIET | 9/10 | The GP provided access to co-investments… |
| condition-b | 2 | LOUD | 1/1 | It has realised a gross MOIC of 2.4 times across 17 exits… |
| condition-b | 3 | LOUD | 1/1 | The team's stability, with no senior departures… |
| coverage-gap | 3 | LOUD | 3/3 | Partners Group was attracted to this investment… |

`suggest-after-r10-review2` has no revised draft on disk and could not be sized.

### c) What `isHouseStyleOnlyDifference` normalised, and what it missed

It normalised, before this change: currency symbol against ISO code (`$` vs
`USD`), scale words (`million`, `bn`, `k`), thousand separators, quote and dash
characters, and spelled-out numbers 0-12 against numerals.

It missed **percentage notation** and **multiples**, which is exactly why
`24 per cent` becoming `24%` scored substantive: `contentWordKey` saw `per`,
`cent` on one side and `24%` on the other and called it a content-word change.

**Confirmed: it compares canonicalised VALUES, not only formats**, and now does
so through two independent comparisons.

1. `contentWordKey` — after canonicalisation both sides read `24%`, which is a
   single content-word token. `22%` is a different token, so the keys differ.
2. `canonicalAmounts` — the numbers themselves are extracted, scaled and
   compared pairwise. 24 is not 22.

Either one alone would catch `22%` becoming `20%`. A change of value has to pass
both to be called cosmetic, and it cannot. Tested in both directions in
`tests/pr9-marker-honesty.test.mjs`: six cosmetic pairs and seven substantive
pairs, each asserted symmetrically.

### d) How `named_third_party` decided, and its access to the author

It was a bare regex over the flagged element's text — any run of two or more
capitalised words. It had no notion of who wrote the document, so the authoring
organisation's own name matched like anyone else's.

The smallest read-only access is `resolveAuthoringOrganisationName()` from
`lib/qc/first-person-actor.mjs`. It resolves at call time through the precedence
Review already uses (argument, then request, then the `AUTHORING_ORGANISATION`
environment variable), returns `null` when nothing is configured, and has no
imports of its own, so there is no cycle. Nothing about Review or any card
changes.

### e) What else would have made this wrong

Three things, all found and handled.

**The feature path had the same bug.** Excluding the author from the text probe
alone moved nothing, because Review's own `named_person_entity_attribution`
materiality feature counts the author too, and it outranks the text probe. The
first sweep came back `moved: 0`. `flagRegister` now drops that feature where
the element names nobody but the author.

**Two later stages rebuild the note and re-append the closer.**
`normalizeMarkerNoteText` was the obvious one, but `rewriteHonestyNote` also
rebuilds a note from its reason clause, which produced a live note ending
`…either way. Confirm before publishing.` — precisely the doubled closer the
spec forbids. It now lifts the register clause off, rewrites what is left, and
puts it back.

**The register question has to be asked of the flagged element, not the marker.**
Asking it of the marker's own region says a whole-sentence marker still carries
its finding even when the edit cut the unsupported clause out of that sentence.
This broke the stage 1 test on the equity cheque. Both the register decision and
the addressed test now use the tightest unsupported span.

## Part 1, an edit must not mask a silence flag

Where a statement is edited and still carries a silence finding the edit did not
address, the note now says both. The edit clause leads, because it describes
what actually happened; the register clause closes.

`findingAddressedByEdit` decides whether the edit dealt with the finding. It
compares the flagged element's content words against the revised span, ignoring
the words a house-style rewrite routinely swaps, and calls the finding addressed
only when most of the claim is gone. **Ties go to unaddressed** — over-flagging
repeats something true, under-flagging is the masking this exists to stop.

### The exact final string for each combination

Original `We recommend approval of the commitment.` rewritten to `Partners Group
recommends approval of the commitment.` for `first_person_plural`.

| combination | final note |
| --- | --- |
| edit + QUIET, unaddressed | `Replaced "We recommend" with "Partners Group recommends" - house style names the organisation rather than using first person. No supplied source speaks to this either way.` |
| edit + LOUD, unaddressed | `Replaced "We recommend" with "Partners Group recommends" - house style names the organisation rather than using first person. No supplied source states this. Do not publish it without one.` |
| edit + ORDINARY (a source spoke) | `Replaced "We recommend" with "Partners Group recommends" - house style names the organisation rather than using first person. Confirm before publishing.` |
| edit + conflict | `Replaced "We recommend" with "Partners Group recommends" - house style names the organisation rather than using first person. Confirm before publishing.` |
| edit that ADDRESSED the finding | `Removed "We recommend approval of the commitment." - house style names the organisation rather than using first person. Confirm before publishing.` |
| no edit, QUIET | `No supplied source speaks to this either way.` |
| no edit, LOUD | `No supplied source states this. Do not publish it without one.` |

The closer is never doubled. A note ending on a register clause takes no
`Confirm before publishing.`: LOUD already closes on its own instruction, and
QUIET asks nothing of the reader. `endsWithFlagRegisterNote` is what both
`normalizeMarkerNoteText` and `rewriteHonestyNote` check.

One deliberate narrowing of the rule. Where the note's reason is the evidence
concern's own class wording (`no supplied source backs this claim`), a QUIET
clause after it would say the same thing twice, so it is suppressed. LOUD is not
suppressed there: it carries an instruction the class reason does not, and
dropping it was measured losing "do not publish it without one" from a softened
causal claim in an earlier run of this same script.

## Part 3, the author is not a third party

Sweep across all four committed artefacts, 18 flagged elements. "Before" is the
same code with no organisation configured, which is exactly the old behaviour.

| | LOUD | QUIET | ORDINARY |
| --- | ---: | ---: | ---: |
| before | 12 | 4 | 2 |
| after | **10** | **6** | 2 |

**Two moved, both the same sentence in two artefacts:**

| artefact | S | element | before | after |
| --- | ---: | --- | --- | --- |
| r10-review1 | 9 | Halden Group expects the relationship to deepen over the life of the fund. | LOUD (`element text: named_third_party`) | **QUIET** (`no checkable content in the flagged element`) |
| r10-review2 | 9 | Halden Group expects the relationship to deepen over the life of the fund. | LOUD (`element text: named_third_party`) | **QUIET** (`no checkable content in the flagged element`) |

Nothing else moved, and in particular the genuine third parties are untouched.
`coverage-gap-review` S3, "Partners Group was attracted to this investment given
Meridian Capital's strong track record", still fires `named_third_party` on
Meridian Capital and stays LOUD, which is right: Meridian is a third party even
though Partners Group is not. Only the organisation's own name is excluded, and
names it leads (`Halden Group Partners`), not names that merely contain the same
word (`Halden Advisory Group`).

Where no organisation is configured, behaviour is unchanged and every match
stands.

## What changed in code

| file | change |
| --- | --- |
| `lib/revise-flag-register.mjs` | `namedThirdPartiesIn` excludes the authoring organisation; the same exclusion applied to the `named_person_entity_attribution` feature; `endsWithFlagRegisterNote` and `findingAddressedByEdit` added; `flagRegister` takes an `authoringOrganisation` option |
| `lib/pr9-note-what-from-diff.mjs` | `unaddressedRegisterClause` appends the register to an edit note where the finding is unaddressed |
| `lib/pr9-marker-honesty.mjs` | `isHouseStyleOnlyDifference` canonicalises percentage notation and multiples; `rewriteHonestyNote` preserves a trailing register clause |
| `lib/build-revision-prompt.mjs` | the closer carve-out recognises the combined note form |

`lib/pr9-unreported-change-markers.mjs` was listed in the spec as a modified
file but needed no change: it already routes through `isHouseStyleOnlyDifference`
via `isHouseStyleMandated`, so completing the canonicaliser was enough. Part 2's
19 skips come from that one function.

Suite green: 718 tests, 37 files.

## Recorded, not fixed

**The fixture gap.** Only 1 of the 4 committed Review artefacts ran with
editorial enabled, so three carry no editorial concerns at all. That is why the
card signal `overreach_unsupported_causal` could not be relied on and the
lexicon fallback was needed. Worth regenerating with editorial on.

**A what-clause defect on the Meridian date sentence.** The marker over
`In June 2026, Partners Group committed to…` carries the clause
`Added "companies."`, which is not what happened to that span. The register
clause on it is correct and the sentence is preserved; the what-clause is wrong.
Pre-existing, unrelated to this spec, not addressed here.
