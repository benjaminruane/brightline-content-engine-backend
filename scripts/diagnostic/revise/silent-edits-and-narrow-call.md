# Silent edits, and the narrow call probe

Model `gpt-5.1-2025-11-13`, temperature 0, seed 1.
Cost: six live reviser calls, roughly **4 cents**. Arm A reused the three
full-draft runs already on disk rather than paying for the same control twice,
which saved about 35 cents. Part 0 and Part 1 cost nothing.

---

## Verdict first

**PART 2: PREMISE HOLDS.** Arm B fixed the equity-cheque statement **3 of 3**
and arm C fixed it **3 of 3**, against **0 of 3** for the full-draft control.
Arm C's prompt is **395 tokens**, roughly a quarter of the 1,500-token
break-even from ddf6ee8. The rebuild is justified, and it is *cheaper* than
today, not 3.6x more expensive as ddf6ee8 estimated.

**PART 1: the silent-edit rate is 100% of runs.** Across the 11 Suggest
artefacts that retain the model's raw output, **every single run** made at
least one change it never reported. **17 unreported changes** in total, about
1.5 per run. Eleven of the seventeen are the same deleted figure, `30%`.

The single most important line in this report: arm B changed **nothing** about
the prompt, the concern, the model, the temperature or the seed. It changed
only how much draft surrounded the statement. That took the outcome from 0/3
to 3/3. The wide call is not failing because it is badly instructed. It is
failing because the instruction is competing with a whole document.

---

## Part 0, the attack on Part 1 before building it

Nothing blocking. One near-miss that would have made the feature wrong, and one
that would have made it noisy; both are described below and both are handled.

### (a) Which baseline

`finalizeSuggestRevisionText` (`lib/build-revision-prompt.mjs` L944). Stages
that **mutate draft text**:

| Stage | Line | Mutates text? |
|---|---|---|
| `parseSoftenedMarkers` | 945 | yes, strips marker delimiters |
| `applyNormalizeMarkerNotes` | 956 | no, notes only |
| `ensureMarkerSentenceTerminalPunctuation` | 957 | **yes**, inserts terminal punctuation (L881) |
| `applyHouseStyleCharNormalizeToRevision` | 958 | **yes**, quotes, dashes, currency, plus offset remap |
| `applyCutPunctuationNormalizeToRevision` | 959 | **yes**, deletes doubled spaces, orphan joiners, dangling conjunctions |
| `applyNoteWhatFromDiff` | 961 | no, notes only |
| `applyDeterministicUnsupportedRemoval` | 963 | **yes**, deletes whole sentences |
| `applyMarkerHonestyCheck` | 976 | no, returns `revisedDraft` unchanged (`pr9-marker-honesty.mjs` L574) |

So five stages mutate text after the model's contribution ends.

**The raw output is retained and is available at the right point.** It is the
`rawLlmText` parameter itself, and `parseSoftenedMarkers(rawLlmText).revisedDraft`
is the model's prose with markers stripped and nothing else done to it. Not
blocking. The check is inserted at L947, immediately after the parse and
before every one of the five mutating stages.

This is not a detail. `pr9-marker-span-status.mjs` L19 documents that house
style changes the word sequence, so a post-normalisation baseline would report
code's own quote and currency rewrites as concealed model edits. Two of the
unit tests exist purely to hold that line: a draft whose only difference is
curly quotes, and one whose only difference is the dangling-conjunction rule
deleting the token "and". Both must generate nothing, and both would fail if
the baseline slipped by even one stage.

### (b) Does `markerSpanAlignment` work at draft scale

It is **sound but wasteful**, and it is not used here.

`alignRevisedToOriginal` (`pr9-marker-span-status.mjs` L50) builds an
`(n+1) x (m+1)` DP table, so it is **O(n·m)** in both time and memory. At real
draft sizes that is fine: a 500-word draft is a 250k-cell table, about 500KB as
`Uint16Array`. It does not overflow, because an LCS length cannot exceed
`min(n, m)` and drafts are nowhere near 65,535 words. It degrades quadratically,
so a 10,000-word document would be 200MB and 100M operations, but that is not
the regime we are in.

The real problem is the per-call shape. `markerSpanAlignment` recomputes the
**entire** table for **every marker**, making the natural implementation
O(k·n·m) for k markers. With 8 markers per run that is eight full alignments to
answer eight questions about the same pair of documents.

**Alternative, and what was built:** compute the alignment **once**, then derive
everything from it — all changed regions, and the coverage of every existing
marker. `lib/pr9-unreported-change-markers.mjs` calls `alignRevisedToOriginal`
exactly once per finalise. `markerCoverage` reproduces `markerSpanAlignment`'s
anchor logic against that shared array rather than rebuilding it.

### (c) Noise, and granularity

This was the question that mattered, and my pre-build estimate was wrong.

I estimated about one region per run from the single draft in c1fb2c1. The
replay found **28** on the first pass, across 11 runs. Inspecting them split
cleanly into two classes:

- **17 genuine unreported edits**, overwhelmingly deleted figures: `30%` 11
  times, `24%` 4 times, plus `has` and `is currently marked at`.
- **11 first-person conversions** — `we believe` becoming
  `Halden Group believes`, and similar.

The second class is not concealment. The prompt requires house style over
"the ENTIRE revised draft (not only the flagged statements)", naming
`first_person_plural` explicitly (`build-revision-prompt.mjs` L1057), and craft
rule (f) forbids emitting a marker for it. Marking those would have put a
spurious marker on most runs and would have contradicted the prompt. They are
now suppressed by `isHouseStyleMandated`, which reuses the existing
`isHouseStyleOnlyDifference` primitive and adds the first-person case.

That suppression is deliberately narrow, and it nearly introduced a hole.
Suppressing on "the original contained a first-person pronoun" alone would
silently swallow the deletion of *"We recommend approval of the commitment."* —
the exact defect this feature exists to catch. So only **substitutions**
qualify; a deletion is never house style, however first-person the removed text
was. There is a unit test for each side of that line.

**Granularity: clause, coalesced to the sentence.** Regions are found at word
level, because that is what the alignment gives, but adjacent regions inside one
sentence merge into a single marker whose span covers the changed extent rather
than the whole sentence. Post-suppression the distribution is min 1 word, median
1, mean 1.2, max 4 — a few tight, meaningful spans, not a spray of fragments.

### (d) Anything else

Four things, all handled:

1. **CUT markers anchor beside the text they removed, not over it.** Testing
   coverage by revised-span overlap alone would treat every properly declared
   cut as unreported. Coverage is therefore also tested in **original** token
   space, using the marker's `origRegion`, which is where the removed words sit.
2. **The `generated` flag was silently dropped by four separate marker copy
   sites** — `copyMarker` in `build-revision-prompt.mjs`, the house-style map,
   `pr9-cut-punctuation.mjs`, and `pr9-deterministic-unsupported-removal.mjs` —
   plus five literal returns in `pr9-marker-honesty.mjs`. All now preserve
   additive fields. This was caught by a test, not by reading.
3. **A generated note must not be regenerated downstream.** `applyNoteWhatFromDiff`
   would have re-diffed it against a draft that code had since normalised,
   folding house-style edits into the model's account of itself. Generated
   markers now skip it.
4. **Pure deletions have no revised text**, so the log line would have named the
   surviving anchor word rather than the deleted phrase. It now reports the
   removed original.

---

## Part 1, unreported change markers

`lib/pr9-unreported-change-markers.mjs`, wired at
`build-revision-prompt.mjs` L947.

Generated markers carry `generated: true` and
`generatedReason: "unreported_change"` in the payload, so the frontend and a
future accept-and-reject can distinguish a declared change from a concealed one.
That distinction never appears in the note text.

Log line, verified emitting:

```
[unreported-change] trace=suggest-revision region="and highly regarded" concern=none
```

### Replay

11 artefacts measured, **11 of 11 had at least one unreported change**,
**17 total**, size min 1 / median 1 / mean 1.2 / max 4 words.

| Artefact | Unreported | Regions |
|---|---|---|
| condition-a-condition-b-suggest-rerun | 1 | `30%` |
| condition-a-suggest | 1 | `30%` |
| deterministic-removal-off-run1 | 1 | `30%` |
| deterministic-removal-off-run2 | 2 | `30%`, `has` |
| deterministic-removal-off-run3 | 2 | `24%`, `30%` |
| deterministic-removal-on-run1 | 2 | `24%`, `30%` |
| deterministic-removal-on-run2 | 2 | `24%`, `30%` |
| deterministic-removal-on-run3 | 1 | `30%` |
| reviser-noise-floor-run1 | 1 | `30%` |
| reviser-noise-floor-run2 | 1 | `30%` |
| reviser-noise-floor-run3 | 3 | `is currently marked at`, `24%`, `30%` |

**Not measurable (3):** `condition-b-suggest.json`,
`suggest-after-r10-suggest1.json`, `suggest-after-r10-suggest2.json` — none
retains the model's raw output, only the finalised draft. Without the raw text
there is no way to separate the model's edits from code's, so measuring them
would produce exactly the false result Part 0(a) warns about. Diagnostic runners
should persist `raw` as a matter of course.

`30%` disappearing without a marker in **11 of 11 runs** is the headline. This
is a figure being deleted from an author's document, deterministically, on every
single run, and no safeguard we have could see it, because every safeguard
inspects markers and there was no marker.

### Unit coverage

All ten cases pass, the eight specified plus two for the house-style boundary:

- a deletion the model did not mark → marker generated, note correct
- a change the model **did** mark → no second marker
- a deterministic removal region → no second marker
- house style normalisation only → nothing generated
- cut punctuation normalisation only → nothing generated
- no overlapping concern → the no-recorded-reason note
- two adjacent changes in one sentence → one marker
- no changes at all → nothing generated
- a mandated first-person substitution → nothing generated
- a deletion of first-person text → **still** flagged

Plus two integration cases: the `generated` flag survives the whole finalise
chain, and no region receives two markers.

### An unrelated defect found on the way

While building the deterministic-removal test I hit a removal event with
`action: "skipped", reason: "remnant_lost_after_delete"` where **the sentence
was deleted from the draft anyway and no marker was produced**. That is a
code-side silent deletion, the same defect class as the model-side one, and this
feature cannot catch it because the comparison baseline is the model's output,
which is upstream of removal. Worth its own fix.

---

## Part 2, the narrow call probe

Target, a worked example in rule (b) of the live prompt, with the exact edit it
should receive:

> The fund intends to build a portfolio of 10-14 control-oriented investments,
> with equity checks of EUR 80-100 million apiece.

| Arm | Prompt | Figure removed |
|---|---|---|
| A, full draft (control, reused) | ~8,461 tokens | **0 of 3** |
| B, statement alone, same prompt | ~7,660 tokens | **3 of 3** |
| C, statement alone, minimal prompt | **395 tokens** | **3 of 3** |

**Arm A**, all three runs returned the statement verbatim with a no-change
marker: *"No change was made - the source only confirms the number of platform
investments."* Run 3: *"No change was made - the source backs only part of
this."*

**Arm B**, all three runs:

> The fund intends to build a portfolio of 10-14 control-oriented investments.

with a correct marker: *"Replaced "investments, with equity checks of EUR 80-100
million apiece." with "investments." - sources do not state a ticket range."*

**Arm C**, all three runs removed the figure, but:

> The fund intends to build a portfolio of 10-14 investments.

Note what is missing. Arm C dropped **"control-oriented"**, which was
*confirmed* material, and two of three runs emitted an en-dash `10–14` in
violation of house style. The minimal prompt fixes the target defect and
introduces two new ones.

### Does a narrow call fix what the wide call ignores, and at what narrowness

Yes, and the narrowness required is far less than expected. Arm B is the
informative arm: **the same prompt, the same concern, the same model, the same
temperature and seed** — the only variable is that the draft is one sentence
instead of a document. That alone moves 0/3 to 3/3.

So the failure is not one of instruction. The prompt already contains this exact
sentence as a worked example with its exact expected edit, and the wide call
still returns "no change was made". The instruction is being outcompeted by the
volume of surrounding material and the seven other findings in the same call.

Arm C shows the floor is very low — 395 tokens — but also that you should not go
that far. Stripping the style guide and the other kinds costs you house style
compliance and the protection of confirmed material. **Arm B is the right
target: full instructions, narrow content.**

### Against the 1,500-token break-even

ddf6ee8 argued the per-statement rebuild would cost about 3.6x today's call and
put break-even at 1,500 tokens per statement. Arm C lands at **395 tokens**,
about a quarter of that. Even arm B's full instruction set is ~7,660 tokens
because it carries the entire style guide, and that is the part worth attacking:
the per-call fixed cost is nearly all boilerplate, not content.

That overturns the cost objection I raised in ddf6ee8. A per-statement rebuild
with a trimmed but complete instruction block plausibly costs **less** than the
single wide call it replaces, while fixing a defect the wide call cannot fix at
any prompt-engineering effort.

---

## Technical summary

- **New** `lib/pr9-unreported-change-markers.mjs`. Diffs the model's raw output
  against the original draft using one shared LCS alignment, finds changed
  regions the model did not declare, coalesces them per sentence, and emits
  markers built by the existing what-from-diff builder with concern-traced
  reasons. Suppresses mandated house-style substitutions, including
  `first_person_plural`, but never suppresses a deletion. Warns one line per
  generated marker.
- **Modified** `lib/build-revision-prompt.mjs`. Inserted the check at L947,
  immediately after `parseSoftenedMarkers` and before any text-mutating stage;
  `applyNoteWhatFromDiff` now skips generated markers; `copyMarker` and the
  house-style map preserve additive marker fields; `unreportedEvents` returned
  on both paths.
- **Modified** `lib/pr9-cut-punctuation.mjs`,
  `lib/pr9-deterministic-unsupported-removal.mjs`,
  `lib/pr9-marker-honesty.mjs`. Marker copying preserves additive fields so the
  `generated` flag survives the chain. No behaviour change otherwise.
- **New** `tests/pr9-unreported-change-markers.test.mjs`, 12 cases.
- **New** `scripts/diagnostic/revise/narrow-call-probe.mjs` and
  `narrow-call-probe.json`. Part 1 replay is free; `--replay-only` re-measures
  without repaying for Part 2.
- Suite green, 560 tests, 33 files. No prompt changes.

## Plain-language summary

The reviser has been quietly changing people's drafts without telling them — on
every single run we can measure, most often by deleting a percentage figure. It
now leaves a note on every change it makes, whether or not it chooses to mention
it, so nothing gets altered behind the author's back. Separately, a four-cent
experiment showed that when the reviser is asked about one sentence at a time it
correctly fixes a problem it ignores three times out of three when asked about
the whole document at once — which tells us the planned rebuild is worth doing,
and will probably cost less than what we run today.
