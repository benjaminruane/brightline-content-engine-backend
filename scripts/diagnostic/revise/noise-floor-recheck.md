# Re-measure the reviser noise floor, and fix a wrong what-clause

Ran 2026-08-29. `gpt-5.1-2025-11-13`, temperature 0, seed 1, three runs against
one unchanged Review, current shipped prompt.

Reproduce with `node scripts/diagnostic/revise/noise-floor-recheck.mjs`.

## The three numbers, side by side

| measurement | unstable |
| --- | --- |
| `45db80d`, no seed | 7 of 10 |
| `18ac825`, seed 1 | 8 of 10 |
| **now, after the prompt change** | **8 of 10** |

**Verdict: UNCHANGED.** The `a5be4f0` controls were coarse and the variance is
still there. Losing the ONE TEST, the SOFTEN and CUT branches and the
softening-rule span label did not move the noise floor.

`identical=2 intent=1 note-only=5 prose=2`

It is not merely the same count. It is the **same eight cards**, and the same
two stable ones:

| | stable | unstable |
| --- | --- | --- |
| `18ac825` | fund_desc, hold_period | lead, deepen, ranking, mark, recommend, coinvest, exceptional, risk |
| now | fund_desc, hold_period | lead, deepen, ranking, mark, recommend, coinvest, exceptional, risk |

`fund_desc` and `hold_period` are the two sentences the Review raises no concern
about. Every sentence that carries a concern is unstable across three runs at
temperature 0 with a fixed seed. The bucket composition barely moved either
(`2/2/4/2` then, `2/1/5/2` now), and the dominant bucket is still **note-only**:
the model reaches the same decision about the same span and writes the reason
differently each time.

That is the useful read. The variance was never in the judgement call the
prompt used to ask for — it is in the free-text reason. `a5be4f0`'s controls
scored PRESERVED only, which is exactly the dimension that is stable, so they
came back clean while five of the ten cards were still varying underneath.

### Recommendation

**Keep the three-run rule.** Single-run A/B is not meaningful on any dimension
that touches note text, and note text is what most of this project's recent
work changes.

Two things worth doing, neither of which is a convention change and both of
which are Ben's call:

- Score prose and marker structure separately from note text. Prose is stable
  enough that a single run would settle a question about removals or
  preservation. Note text is not, and never has been.
- If note wording ever needs to be stable, it has to stop being model-authored.
  The register clauses added in `a5be4f0` are code-authored and are byte-identical
  across runs; the reason clauses beside them are not.

Cost: about 11 cents for the three scored runs (the harness is not instrumented
for usage, so this is computed from the 34,998-character prompt at the shipped
rate), and about 43 cents including the runs discarded while repairing the
harness guard and the replay baseline.

## Part 1, the what-clause replay

Replayed every run on disk that retains the model's raw output, plus the live
Meridian runs, and compared each marker's clause under the old clip against the
same marker's clause under the new one.

| | count |
| --- | ---: |
| markers replayed | 97 |
| clauses that moved | 23 |
| **false change-claims now gone** | **5** |
| **previously right, now wrong** | **0** |

The 5 fixed are all the same defect on two different fixtures:

| run | span ends | was | now |
| --- | --- | --- | --- |
| deterministic-removal-on-run2 | `…business services` | `Added "services."` | `No change was made` |
| reviser-noise-floor-run2 | `…business services` | `Added "services."` | `No change was made` |
| reviser-noise-floor-run3 | `…business services` | `Added "services."` | `No change was made` |
| live-MERIDIAN-run2 | `…services companies` | `Added "companies."` | `No change was made` |
| live-MERIDIAN-run3 | `…services companies` | `Added "companies."` | `No change was made` |

The other 18 moved clauses are cases where the clip previously dropped a token
that the alignment says is genuinely part of the marker's own span. Their
clauses got longer or more precise, and none of them crossed from right to
wrong. **Nothing regressed.**

Correctness here is decided by the alignment, not by the note: a clause that
claims a change on a span whose `spanStatus` is `UNCHANGED` is wrong, and that
is decidable without a human.

## Part 0

### a) The mechanism

Yes — same class as Part 2a of `73bca5d`, and the overrun is past the sentence
**end**, not its start. Two faults compound, both inside
`confineRegionToOwnSentence`, at `lib/pr9-note-what-from-diff.mjs:315` before
this fix and line 318 after it. Line numbers below are the pre-fix ones.

**Fault one: a decimal point reads as a sentence terminator.** Line 329 asks
`sentenceBoundsContaining` for the bounds of the region's first token. On the
Meridian date sentence it returns:

```
"In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1."
```

The `1.` of `EUR 1.2 billion` ends the sentence as far as that function is
concerned. Every original token after it falls outside the bounds and is a
candidate for dropping.

**Fault two: the rescue set could not match the tokens it was guarding.** The
guard at lines 328-332, as it stood before this fix, keeps any token the revised
span still carries:

```js
  const spanWords = new Set(String(span).split(/\s+/).filter(Boolean));
  const bounds = sentenceBoundsContaining(original, region[0].start, region[0].end);
  const clipped = region.filter(
    (t) => (t.start >= bounds.start && t.end <= bounds.end) || spanWords.has(t.text)
  );
```

`spanWords` splits the raw **slice**; `t.text` comes from tokenizing the whole
**draft**. A marker wraps a sentence without its final full stop, so the slice
yields `companies` while the region token is `companies.`. The membership test
fails on exactly the one token that sits at the sentence end, which is exactly
the token fault one exposed.

Measured on the committed artefact: region 31 tokens, revised span 31 tokens,
byte-identical, and the clip dropped one — `companies.` The diff then compared
30 original tokens against 31 revised ones and reported the extra as **Added**.

The `reviser-noise-floor` fixture shows the same thing with a real leak
alongside it: the region legitimately overran into `We were`, and the clip
correctly dropped those two while incorrectly dropping `services.` with them.

### b) Does it clip both ends?

**It clips only one side, and that is the defect.** It clips the *original
region* and never the *revised span* — which is right, since `revSpan` is by
construction the marker's own span and cannot leak. The real asymmetry is that
it clips the original region against bounds derived from **one end only**: the
sentence containing `region[0]`, the first token. Nothing checks the far end
independently, so when those bounds are wrong the whole tail is dropped in one
go with no second opinion.

### c) Is the comparison like for like?

**Confirmed, it was not, and Part 2 above corrects it.** `45db80d` scored each
card on five dimensions, combined into `signature` at
`run-reviser-noise-floor.mjs:192`: sentence present, prose normalised, marker
count, marker intents, note text, marked span text. `a5be4f0`'s controls scored
`preserved` only — a boolean on whether the statement survives verbatim, which
is roughly `45db80d`'s prose dimension alone.

That difference is the whole explanation for the apparent disagreement. Prose is
stable; note text is not. Part 2 re-ran the original harness with the original
`cardSnapshot` and `classifyStability` untouched, so the three numbers are
directly comparable.

### d) What else would have made this wrong

**The harness's own self-check had gone stale.** It asserted
`prompt.includes("falls to keep-and-flag")`, which is the whole-sentence EDGE
CASE string that `73bca5d` retired from injection. The harness could not run at
all. The check exists to confirm the shipped rather than the measured prompt is
in use, so it now asserts `keep-and-flag` directly. **No scoring dimension was
touched** — `cardSnapshot` and `classifyStability` are byte-identical to
`45db80d`, which is what keeps the comparison valid. Recorded here because it is
a modification to a harness the spec asked to run unchanged.

**The harness overwrites the artefacts it is compared against.** It writes
`reviser-noise-floor-run{1,2,3}.json` and `-meta.json` in place, so running it
destroys the `18ac825` measurement. Those are now snapshotted to
`*.18ac825.json` before the re-run, which is what made the card-level comparison
in Part 2 possible.

**A first attempt at the fix caused a real regression.** Widening the rescue to
punctuation-insensitive matching resurrected a leaked clause onto the next
sentence: `Removed "that would not otherwise have been available to us…"` landed
on the `Halden Group expects the relationship to deepen` marker, because common
words like `to` and `us` bare-match something in almost any span. The replay
caught it, and the fix is exact-text matching against the aligned tokens rather
than bare matching against anything.

**The first replay baseline was wrong.** Comparing the new clause against the
committed note counts every `rewriteHonestyNote` rewrite as a regression, since
that stage legitimately replaces a what-clause with `Revised this span`. The
replay now reconstructs the pre-fix clip and compares clause against clause.

## Part 1, the fix

Two changes in `confineRegionToOwnSentence`, both narrow, keeping the guards
`73bca5d` established.

**The rescue set is built from the aligned span tokens, not the raw slice.**
`ownRegion` now passes `align.revSpan` through. `companies.` matches
`companies.`, so a sentence's own final token is never mistaken for absent.
Still exact-text, so a leaked `to` or `us` is not rescued.

**A region the span reproduces token for token is never clipped.** If the two
token sequences are identical there is nothing outside the span to have leaked
in, so clipping can only invent a difference. This is the direct expression of
"a preserved sentence must never carry a what-clause describing a change", and
it holds regardless of what the sentence bounds get wrong.

Both existing guards are unchanged: a span carrying an internal sentence
terminator keeps its full region, and a token is only dropped if it is absent
from the revised span.

Tested in `tests/pr9-note-what-from-diff.test.mjs` with the exact Meridian date
sentence and its marker, including that the span ends `companies` while the
region token is `companies.`, and that a genuine leak past the sentence end is
still clipped.

Suite green: 723 tests, 37 files.

## Not fixed

`sentenceBoundsContaining` still treats the decimal point in `EUR 1.2 billion`
as a sentence terminator. That is the root cause, it lives in
`lib/pr9-marker-honesty.mjs`, and it is used by the honesty checker as well as
this clip. Fixing it there would be the better repair and a wider blast radius
than this spec allows. Both changes above make the clip robust to it, so no
what-clause depends on those bounds being right, but anything else reading them
still does.
