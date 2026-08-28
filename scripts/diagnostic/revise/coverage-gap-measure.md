# Coverage gap: what Suggest actually does with what Review finds

> **Of 4 findings Review raised, Suggest acted on 1, produced a no-change note
> on 2, and ignored entirely 1.**
>
> And the one it acted on was not the model. It was the deterministic removal
> path. **Across all three runs the model authored zero real edits.**

Cost: **~$0.50** — one Review (run once, cached) plus three reviser calls.
Exact spend cannot be computed: `gpt-5.1` has no entry in the `PRICING` table
in `lib/observability.js`, so cost telemetry reports $0 for the reviser. That
gap was flagged in `7399333` and is still open.

Artefacts: `coverage-gap-measure.json`, `coverage-gap-review.json` (cached Review)
Script: `node scripts/diagnostic/revise/coverage-gap-measure.mjs`

---

## Part 2, the coverage gap, live

Three Suggest runs on the committed production Meridian fixtures, production
prompt, production model, `temperature 0`, `seed 1`.

| Measure | Result |
|---|---|
| Total markers across 3 runs | **9** |
| Markers saying "No change was made" | **6 (66.7%)** |
| Findings with a no-change marker in **all 3** runs | **2** |
| …in **some** runs | **0** |
| …in **no** runs | **2** |
| Findings that produced **no marker at all** | **1** |

Two thirds of every marker a user would see on this draft describes an edit
that did not happen. This is not run-to-run noise: the two findings that
produce a no-change marker do so in **all three runs**, identically. It is the
stable behaviour of the system on this draft.

### Finding by finding

| Finding | Kind | Outcome | Runs with a marker | Runs saying no change |
|---|---|---|---|---|
| C0 — "In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion fund…" | `partial` | **no-change note** | 3 | 3 |
| C1 — "The fund intends to build a portfolio of 10-14 control-oriented investments, with equity checks…" | `partial` | **no-change note** | 3 | 3 |
| C2 — "Partners Group was attracted to this investment given Meridian Capital's strong track record…" | `soften` | **ignored, no marker** | 0 | 0 |
| C3 — "This relationship enabled deep insight during the diligence phase." | `unsupported` | **acted on** | 2 | 0 |

### The finding that produced no marker

**C2 is the sentence from the false-green investigation.** Review raised it as
a `soften` finding; Suggest produced no marker for it in any of the three runs.
It is not flagged, not edited, and not mentioned. A user sees nothing.

That is worse than a no-change note, and it is the thing the note work of
`7399333` cannot reach: what-from-diff can only tell the truth about markers
that exist. A finding with no marker is invisible whatever the notes say.

### The finding that was acted on was not acted on by the model

C3 was removed in all three runs — `removalEvents` count 1 per run — by
`applyDeterministicUnsupportedRemoval`, which is code, not the model. Filtering
the 9 markers to those that are neither a no-change note nor a deterministic
removal leaves **zero**.

So on this draft, in three runs, the model changed nothing that a marker
records. Every real edit came from the deterministic path shipped earlier in
this arc.

One attribution caveat, stated rather than smoothed over: the deterministic
removal marker anchors on a remnant word in the *neighbouring* sentence, so it
traces back to its own concern in only 2 of the 3 runs. The removal itself
happened 3 of 3, confirmed by `removalEvents`. The marker-to-concern mapping is
what is imperfect, not the removal.

### Method note

The spec asked for an existing Review with no re-run. No stored Review of the
committed production fixtures existed — `production-request-parity.json` keeps
only summary rows, not statements. So one Review was run and **cached to
`coverage-gap-review.json`**; all three Suggest runs read that one Review, and
re-running the script reuses it. Review is not re-run per Suggest.

---

## Part 1, reason fallback

### Order of preference

1. the model's own separable reason, extracted as before — unchanged
2. failing that, a class-level reason from the concern the marker traces to
3. failing both, the what clause alone

The fallback states the **class** of concern, never a bespoke factual
justification. The backend knows why a sentence was flagged; it does not know
what is wrong with it, and does not pretend to.

A marker traces to a concern by locating each concern's `statementText` in the
original draft and taking the concern whose range overlaps the marker's
original region. A marker with no original region — a pure insertion — cannot
be traced and gets the what clause alone rather than being attached to a
neighbour.

### Exact final strings, after `normalizeMarkerNoteText`

| Concern kind | Final note |
|---|---|
| `unsupported` | `Removed "the ranking" - no supplied source backs this claim. Confirm before publishing.` |
| `conflict` | `Removed "the ranking" - a source states otherwise. Confirm before publishing.` |
| `partial` | `Removed "the ranking" - the source backs only part of this. Confirm before publishing.` |
| `soften` | `Removed "the ranking" - overstated against the source. Confirm before publishing.` |
| `deletion` | `Removed "the ranking" - review flagged this as immaterial. Confirm before publishing.` |
| `compliance_strip` | `Removed "the ranking" - a named person in a public version. Confirm before publishing.` |
| `compliance_claim` | `Removed "the ranking" - this wording is not permitted in this version. Confirm before publishing.` |
| `compliance_add` | `Removed "the ranking" - a required qualifier was missing. Confirm before publishing.` |
| no-change case | `No change was made - no supplied source backs this claim. Confirm before publishing.` |

Wording follows the reviser prompt's own examples where it has them
(`compliance_strip` from "named person in a public version",  `deletion` from
"review flagged it as immaterial"). `craft` has no entry: it is forbidden from
emitting a marker, so it never has to explain one.

### The 84-row replay, re-run

| Measure | Before fallback | After fallback |
|---|---|---|
| Notes carrying a reason | 33 of 84 | **82 of 84** |
| …from the model | 33 | 33 |
| …from the concern class | — | **49** |
| Notes carrying no reason | **51** | **2** |

**49 notes were rescued by the fallback.** Reason loss across all 84 falls from
51 to 2; on the 62 previously-ACCURATE notes, the subset `7399333` reported on,
it falls from **41 to 2**.

The model-supplied count is unchanged at 33, as it should be: preference order 1
is untouched, and the fallback only fills gaps rather than displacing anything
the model gave.

The 2 remaining are both from `suggest-after-r10-suggest2.json`, where the
marker is a pure replacement whose original region did not overlap any
concern statement, so no class could be resolved. They correctly emit the what
clause alone rather than guessing.

---

## Files

| File | Change |
|---|---|
| `lib/pr9-note-what-from-diff.mjs` | concern tracing, `CONCERN_KIND_REASONS`, reason preference order, `reasonSource` |
| `lib/build-revision-prompt.mjs` | passes `opts.concerns` into the note stage |
| `tests/pr9-note-what-from-diff.test.mjs` | +7 cases for the fallback |
| `scripts/diagnostic/revise/coverage-gap-measure.mjs` | new — the live measure |
| `scripts/diagnostic/revise/coverage-gap-measure.json` | new — per-finding and per-run detail |
| `scripts/diagnostic/revise/coverage-gap-review.json` | new — the cached Review |
| `scripts/diagnostic/revise/replay-note-what-from-diff.mjs` | reports reason provenance |

Suite: **32 files, 548 tests, all passing.** No prompt changes.

---

## What a user notices

A note now tells you why a sentence was flagged even when the model buried its
reason in its own description of the edit — 49 of 84 notes on file gain a
reason they had lost.

The measurement is an instrument and changes nothing a user sees. What it
reveals should not be filed away: on this draft, two thirds of markers describe
no edit, one Review finding produces no marker at all, and the model made no
recorded edit of its own in three runs.

## What this does not do

It measures one draft. Four findings is a small denominator and these numbers
should not be generalised to the corpus without a wider run. What it does
establish is that the no-change rate is not rare noise on this draft — it is
stable across three identical runs — and that "produced no marker at all" is a
real failure mode with a real instance, not a hypothetical.
