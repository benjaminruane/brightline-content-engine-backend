# Fix the causal miss, and find out what the unreported craft changes are

Measured 2026-08-29, `gpt-5.1-2025-11-13`, temperature 0, deterministic removal off.
Artefacts: `register-and-craft.json`, `register-and-craft.tables.md`.
Script: `scripts/diagnostic/revise/register-and-craft.mjs`.

Cost: **$0.0348** over six Suggest calls, 98% prompt cache hit. Part 1's sweep
and all of Part 2 are free — no model calls.

## Part 1, the register before and after

Every flagged element in all four committed Review artefacts, 18 in total. The
"before" column is recomputed here from the pre-change rules rather than read
out of an old run, so both columns are the same corpus and only the causal code
differs.

| | LOUD | QUIET | ORDINARY |
| --- | ---: | ---: | ---: |
| before | 10 | 6 | 2 |
| **after** | **12** | **4** | 2 |

Two elements moved, both QUIET → LOUD, both on the same sentence in two
different artefacts:

| artefact | S | flagged element | before | after | signal that moved it |
| --- | ---: | --- | --- | --- | --- |
| r10-review1 | 3 | The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited. | QUIET | **LOUD** | `element text: causal_connective_lexicon` |
| condition-b-review | 3 | means key-person risk is limited | QUIET | **LOUD** | `element text: causal_connective_lexicon` |

Nothing else moved. The full 18-row table is in `register-and-craft.tables.md`.

### The bar

- **No unsupported causal claim is QUIET.** The two remaining QUIET rows are
  `that is, in our view, genuinely exceptional` and `that would not otherwise
  have been available to us` — an opinion marker and a counterfactual about the
  author's own access, neither asserting a cause. The recommendation is QUIET on
  both artefacts that carry it.
- **No author's own position is LOUD.** `we recommend the commitment` and
  `recommends the commitment` are both QUIET after the change, and the
  `forward_looking` feature remains deliberately non-loud.

### One row I think is still arguable

`r10-review1 S9`, `Halden Group expects the relationship to deepen over the life
of the fund`, is LOUD via `named_third_party`, on the strength of the
capitalised "Halden Group". Halden Group is the *authoring* organisation, so
this is closer to an author's own expectation than to a third-party attribution,
and QUIET is the defensible register for it. It is LOUD before and after, so
this change did not cause it, and the fix is a different one: the named-entity
probe should exclude the authoring organisation, which `first-person-actor.mjs`
already knows how to identify. Recorded, not fixed here.

## Part 0, answered before the change

### 0a, how the register decided a causal claim

`lib/revise-flag-register.mjs` lines 89–92 before the change, one entry in the
`TEXT_SIGNALS` list:

```js
[
  "causal_claim",
  /\b(?:enabled|enables|enabling|caused|causes|causing|drove|drives|driven by|led to|leads to|resulted in|results in|resulting in|because of|thanks to|owing to|due to|meant that|means that|allowed|allowing|underpinned|gave (?:us|them) )\b/i,
],
```

**A word list.** Not a pattern over structure, not anything read from the card.
It is applied by `loudTextSignalsOf` (line 147) to the flagged element text.

`"enabled"` fires because `enabled` is the first alternative in the list.
`"means"` does not fire because the list contains **`means that`**, with the
complementiser, and the key-person sentence reads `means key-person risk is
limited` with no `that`. The regex needs the literal two-word sequence. Two
sentences making the identical kind of claim landed in different registers on
the presence of one function word, which is the definition of matching
vocabulary rather than structure.

### 0b, signals that would generalise

**`overreach_unsupported_causal` exists and is exactly right.**
`lib/rulebook/editorialRules.js` line 43 defines it as "Causal claims … that
assert causation without clear supporting evidence. Correlation stated as
causation." `lib/qc/materiality.mjs` line 37 already lists it as a materiality-
relevant rule.

The diligence sentence carries it. Verified on
`coverage-gap-review.json` statement 5:

```json
{
  "concernCode": "overreach_unsupported_causal",
  "note": "The phrase 'enabled deep insight during the diligence phase' implies a causal relationship without clear supporting evidence.",
  "category": "editorial",
  "span": [{ "startChar": 18, "endChar": 65, "source": "note_quote" }]
}
```

`gatherConcerns` surfaces it as `editorial: [{ kind: "craft", rule:
"overreach_unsupported_causal" }]`. Note the key is `concernCode` on the card and
`rule` on the concern; both are read.

**The key-person sentence carries nothing comparable.** It is
`materiality.level: "minor"` with `features: []` and **zero editorial concerns**
on all three artefacts that contain it. The reason is structural, not accidental:
of the four committed Review artefacts, **only `coverage-gap-review.json` ran
with editorial enabled.** The r10 and condition-b artefacts have no editorial
concerns on any statement at all.

So the card signal is the better signal and cannot be the only signal. It is
used first where present, and a lexicon carries the cases where the editorial
pass did not run — which, on this corpus, is three artefacts out of four.

Nothing in `extractStatementFeatures` captures causation, confirmed again.

### 0c, over-matching risks

The risk the spec names first is **already handled and not by this list**: a
causal statement the source itself makes never reaches any text probe, because
`sourceSpoke()` returns ORDINARY first. `"resulted in"` in a neutral report of a
fact a source states is an ORDINARY row, not a QUIET-or-LOUD decision. There is
a test for this.

The genuine false friends, all now guarded by `CAUSAL_FALSE_FRIENDS_RE`:

| phrase | why it is not causal |
| --- | --- |
| `by means of`, `a means of/to`, `the means of/to` | instrument, not cause |
| `means-tested`, `means test` | compound noun |
| `due to be` | scheduled, not caused |
| `is/are/was/were/be/been/being allowed to` | permission granted, not an effect produced |

`due diligence` needs no guard: the pattern requires `due to`, and `due` followed
by `diligence` does not match. The guard neutralises only the matched phrase, so
`"by means of a vehicle, which enabled the co-investment"` still fires on
`enabled`. All of these are tested.

Deliberately **not** added, because they are plain transitive verbs rather than
causal connectives and would fire on most prose: `limits`, `reduces`,
`improves`, `supports`, `helped`.

### 0f, anything else

`allowed` / `allowing` were already in the old list and stay, so guarding only
the passive-permission form is a narrowing of existing behaviour rather than a
new risk. Distinguishing `"the relationship allowed us to see"` (causal) from
`"the mandate allows the fund to invest"` (permission) needs the argument
structure of the clause. That is the honest limit of a lexicon.

## Part 1, what was implemented

`lib/revise-flag-register.mjs`, two signals in order of trust:

1. `causalEditorialRuleOn(concern, card)` — Review's own
   `overreach_unsupported_causal`, read from either `editorial[].rule` or
   `editorialConcerns[].concernCode`. Checked in `flagRegister` **before every
   text probe**, and it holds however narrow the flagged element is, because the
   rule is a judgement about the statement and the element is the part of the
   causal claim the source does not back.
2. `causalLexiconFires(element)` — the broadened connective list, reported under
   the signal name **`causal_connective_lexicon`**, renamed from `causal_claim`.
   The rename is the point: per the spec, if it stays a word list it should say
   so rather than describe itself as a causal test. The module header and the
   constant's own documentation both state plainly that this is a lexicon, that
   separating `X means Y` from `by means of X` needs a parse, and that this
   module makes no model call.

Added to the list: bare `means`/`meant`/`meaning` (the measured miss),
`therefore`/`thus`/`hence`/`consequently`, `as a result`/`as a consequence`,
`which is why`, `ensures`, `translates into`, `contributed to`, `gives rise to`,
`stems from`, `attributable to`, `so that`, `result of`, `driving`, `leading to`.

22 tests added. Suite: **685 passing, 37 files.**

## Part 2, diagnosis only, the unreported changes

Every unreported change the detector generated a marker for, across the eleven
runs on disk that retain the model's raw output plus the six Part 3 runs. Full
row-by-row table with before, after, attributed concern and the note the user
sees is in `register-and-craft.tables.md`.

### d1, how many are mechanical and how many substantive

**24 total: 19 mechanical, 5 substantive.**

The 19 mechanical are all one thing: `"30 per cent"` → `"30%"` and
`"24 per cent"` → `"24%"`. That is the `percentage_notation` house-style rule,
applied silently under rule (f) exactly as intended, and then marked anyway.

The 5 substantive:

| run | before | after | craft-attributed |
| --- | --- | --- | :-: |
| deterministic-removal-off-run2 | *(nothing)* | `has` | |
| reviser-noise-floor-run3 | `has returned` | `is currently marked at` | |
| live-MERIDIAN-run1 | `well-established and highly regarded` | `well-established` | **y** |
| live-MERIDIAN-run2 | `well-established and highly regarded` | `well-established` | **y** |
| live-MERIDIAN-run3 | `well-established and highly regarded` | `well-established` | **y** |

A measurement caveat worth stating: 0 of the 24 were classified mechanical until
the classifier was widened. `isHouseStyleOnlyDifference` scores
`"24 per cent"` → `"24%"` as substantive. See d3.

### d2, would skipping craft-attributed changes lose anything

**Yes, and the corpus answers it without ambiguity. Option B is unsafe.**

Three of the 24 unreported changes are craft-attributed. **All three are
substantive**, and all three are the same change: the model deleting
`and highly regarded` from

> its well-established and highly regarded investment team

That sentence carries a `marketing_language_excess` editorial concern and **no
evidence concern**, so it is craft-attributed by any reasonable reading. Under
option B it would be exempted, the words would leave the draft, and no note
would tell the user. That is the exact silent deletion the detector was built
for, in the only craft-attributed cases the corpus contains.

So the answer to the question the spec says decides whether skipping is safe is:
a substantive deletion in a sentence carrying a craft concern is not a
hypothetical. It is 3 of 3 of the craft-attributed population.

### d3, is there a shape-based signal

Partly, and it is worth more than the concern-adjacency test.

`isHouseStyleMandated` already does shape-based classification for two cases: it
delegates to `isHouseStyleOnlyDifference`, and it separately detects a
first-person conversion by checking that first-person tokens left the original
and none came back. Both look only at the change.

**How far `isHouseStyleOnlyDifference` generalises today.** It canonicalises
currency symbols against ISO codes, million/billion scale words, thousand
separators, quote and dash characters, and spelled-out numbers 0–12. It does not
canonicalise **percentage notation** or **multiples**, so `"24 per cent"` →
`"24%"` and `"1.9 times"` → `"1.9x"` fall through its `contentWordKey`
comparison as content-word changes and score substantive. Those are the house
style rules `percentage_notation` and `currency_format`, applied silently by the
same rule (f) as everything else it covers. The gap looks like an omission
rather than a decision.

**How far it would generalise if completed.** Extended with percentage and
multiple notation — which is what this diagnostic does locally, in
`houseStyleExtras`, without touching the shared helper — a purely shape-based
test classifies **19 of 24, 79%, as mechanical**, and every one of those
judgements is correct. Add casing-only and punctuation-only, which are already
in the diagnostic and fire on nothing in this corpus, and the residue is the 5
substantive changes, all of which genuinely deserve a marker.

The shape test also gets the hard case right where concern-adjacency does not:
`and highly regarded` is craft-attributed but is a word deletion, so shape says
substantive and adjacency says exempt. Shape is the better discriminator on the
only case where the two disagree.

Its limit: shape cannot see intent. `"has returned"` → `"is currently marked at"`
is substantive by shape and by fact, but a shape test cannot tell a
source-driven correction from a drive-by rewrite. That distinction still needs
the concern, and shape should gate rather than replace it.

### Options

**A. Third minimal register for mechanical changes, no closer.**
`lib/revise-flag-register.mjs` gains a `MECHANICAL_NOTE` alongside LOUD and
QUIET, and `lib/pr9-unreported-change-markers.mjs` uses it when the shape test
says mechanical. Nothing is hidden and nothing is cluttered with "Confirm before
publishing" on a percent sign. Carve-outs already exist for exactly this shape of
note in `normalizeMarkerNoteText`, `applyNoteWhatFromDiff` and
`rewriteHonestyNote`, so the plumbing is built.

**B. Skip craft-attributed changes in the detector.**
`lib/pr9-unreported-change-markers.mjs` filters regions whose traced concern is
editorial-only. **Ruled out by d2**: this exempts the `and highly regarded`
deletion, 3 of 3 of the craft-attributed cases in the corpus.

**C. Skip on the SHAPE of the change, not the concern.**
Complete `isHouseStyleOnlyDifference` in `lib/pr9-marker-honesty.mjs` with
percentage and multiple notation, then have
`lib/pr9-unreported-change-markers.mjs` generate no marker where
`isHouseStyleMandated` returns true. The 19 mechanical markers disappear, the 5
substantive ones remain, and `and highly regarded` is still caught because
deleting words is not a house-style shape.

### Recommendation: C, with A as the fallback if silence is unacceptable

C resolves the conflict at its source. "Nothing changes without a note" and "do
not clutter the draft with punctuation notes" only contradict each other if a
percent sign counts as a change. It should not: rule (f) already declares
house-style reformatting silent and says the diff is where it shows, and the
detector marking it is the detector disagreeing with the prompt rather than the
two principles being irreconcilable. C makes the detector agree, on evidence
that the shape test is correct on 19 of 19 in this corpus. It also fixes the
`isHouseStyleOnlyDifference` percentage gap, which is a real defect affecting the
honesty check too, not only this feature.

A is the right fallback if you would rather nothing at all went unmarked. It
costs a third note class and some visual noise, and it does not fix the shared
helper.

Nothing implemented. Ben decides.

## Part 3, measurement

Three runs per arm. MERIDIAN is the production fixture from 73bca5d and carries
both silence targets and the diligence sentence; R10 is
`suggest-after-r10-review1`, which carries the key-person sentence and the
recommendation and has a 2026-08-27 three-run reference arm on disk.

| arm | run | key-person | diligence | recommendation | In June 2026, | equity cheque | unreported |
| --- | ---: | --- | --- | --- | --- | --- | ---: |
| MERIDIAN | 1 | n/a | **LOUD** | n/a | kept | kept | 1 |
| MERIDIAN | 2 | n/a | **LOUD** | n/a | kept | kept | 1 |
| MERIDIAN | 3 | n/a | **LOUD** | n/a | kept | kept | 1 |
| R10 | 1 | **LOUD** | n/a | see below | n/a | n/a | 1 |
| R10 | 2 | **LOUD** | n/a | see below | n/a | n/a | 1 |
| R10 | 3 | **LOUD** | n/a | see below | n/a | n/a | 2 |

- **Key-person sentence LOUD, 3 of 3.** Note emitted verbatim: `No supplied
  source states this. Do not publish it without one.` It was QUIET before this
  change.
- **Diligence sentence LOUD, 3 of 3**, up from 2 of 3 at 73bca5d. It now carries
  the card signal, which does not depend on the model leaving the wording alone.
- **Both silence targets preserved 3 of 3**, unchanged from 73bca5d.
- **Recommendation: classified QUIET, but no QUIET note emitted.** See below.

### Controls

MERIDIAN, 6 statements: **5 HELD, 0 INSIDE BAND, 0 OUTSIDE BAND, 1 VACUOUS.**
The vacuous one is the `and highly regarded` sentence, which also moved on all
three 73bca5d reference runs and so cannot count against this change. This is
one better than 73bca5d, where the diligence sentence was INSIDE BAND; it now
holds in all three.

R10, 10 statements: **5 HELD, 0 INSIDE BAND, 0 OUTSIDE BAND, 5 VACUOUS.** All
five vacuous statements failed to survive verbatim on the 2026-08-27 noise-floor
runs as well.

**No control on either arm moved outside the band. An INTERFERE call is not
available on this evidence.**

## Verdict: PARTIAL

Everything the causal fix was aimed at holds, three runs of three, with no
control outside the band on either arm. It is PARTIAL rather than CONFIRM on one
stated pass condition: the recommendation does not emit a QUIET note.

The classification is right. `we recommend the commitment` is QUIET in the Part 1
sweep, before and after. What happens live is that the model rewrites the whole
sentence for house style in all three runs:

> On balance, ~~we believe~~ **Halden Group believes** the fund should deliver
> returns broadly in line with its predecessor and ~~we recommend~~
> **recommends** the commitment.

A register note only fires when the marked span comes back unchanged — by
design, and deliberately so, because stamping "No supplied source speaks to
this either way" over a span that was in fact rewritten would be a false
account. So the marker carries a change note instead:

> Revised this span - house style names the organisation rather than using
> first person. Confirm before publishing.

That is the correct note, and it is the Part 2b reason-class fix from 73bca5d
working: the sentence also carries an evidence gap, and before that fix this
would have read "no supplied source backs this claim". The register is right,
the suppression is right, and the note is right. The pass condition as written
is not met because the sentence gets edited for an unrelated reason, which is a
`first_person_plural` coverage question and not a register question.

## Recorded, not in this spec

- The editorial directive on the diligence sentence is followed in roughly 1 run
  in 3. Coverage, not silence; belongs in the stage 1 re-measurement.
- `named_third_party` fires on the authoring organisation, making
  `Halden Group expects the relationship to deepen` LOUD when QUIET is more
  defensible. `first-person-actor.mjs` already identifies the authoring
  organisation and could exclude it.
- `isHouseStyleOnlyDifference` misses percentage and multiple notation. Affects
  the honesty check as well as the unreported-change detector. Option C above.
