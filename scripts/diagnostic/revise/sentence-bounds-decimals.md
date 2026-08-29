# Sentence bounds must not break on decimals

Ran 2026-08-29. No model calls. **Cost: zero.**

Reproduce with `node scripts/diagnostic/revise/sentence-bounds-decimals.mjs`.
The honesty comparison needs a baseline captured on the old code first, with
`SBD_BASELINE=1`; the baseline this report uses is committed as
`sentence-bounds-decimals.baseline.json`.

## The two headline numbers

**Part 0b — how much of the corpus truncates.** Across the four committed Review
artefacts and the three draft fixtures, 67 sentences in total:

| | count | share |
| --- | ---: | ---: |
| **sentences the old bounds truncate** | **19** | **28%** |
| sentences containing a decimal in a figure | 20 | 30% |
| sentences containing an initial or single capital | 0 | — |
| sentences containing an abbreviation | 0 | — |
| sentences containing an ellipsis | 0 | — |

Every truncation is a decimal in a figure. `EUR 1.2 billion`, `2.4 times`,
`1.9x`, `24.5%`. The other three classic cases do not occur in this corpus at
all, so they are fixed on principle rather than on evidence. The one sentence
that contains a decimal without truncating ends on the decimal's own sentence
boundary.

**Part 2 — how many honesty verdicts changed.** Replayed all 83 markers across
the 11 runs on disk that retain the model's raw output:

| | before | after |
| --- | ---: | ---: |
| honesty events | 24 | 24 |
| verdicts that appeared | — | **0** |
| verdicts that vanished | — | **0** |

**No honesty verdict changed.** Nothing to adjudicate. The what-clause replay is
also unmoved: 84 markers, 0 clauses claiming a change on a span the alignment
calls unchanged, so `8145ef3`'s five fixed false change-claims stay fixed and
nothing regressed.

## Part 0

### a) Every caller

Six in production code, all reading the same function in
`lib/pr9-marker-honesty.mjs`.

| caller | what it does with the bounds |
| --- | --- |
| `pr9-marker-honesty.mjs:308` (`cutSpanTextPresentInRevised`) | Takes the sentence containing a CUT marker in the revised draft, checks that word sequence still exists in the original, then checks nothing survives outside the span within those bounds. Drives `cut_but_text_present`. |
| `pr9-marker-honesty.mjs:436` (`containingSentenceChanged`) | Aligns the containing sentence against the original and asks whether it changed. Drives `remnant_missed_edit`. |
| `pr9-note-what-from-diff.mjs:357` (`confineRegionToOwnSentence`) | Clips the original region to its own sentence so a note cannot describe a change in the next one. Made robust to this bug at `8145ef3`. |
| `pr9-unreported-change-markers.mjs:203` | Coalesces adjacent unreported changes that fall in the same sentence into one marker. |
| `pr9-deterministic-unsupported-removal.mjs:422` (`matchIsWholeSentence`) | Decides whether a match is a whole sentence or a phrase with leftovers, which gates whole-sentence removal. |
| `pr9-deterministic-unsupported-removal.mjs:546, 560` (`previousSentenceBounds`, `nextSentenceBounds`) | Finds the neighbouring sentences when repairing the seam left by a removal. |

### b) The counts

Above. 19 of 67, all decimals.

The count is measured against sentence segmentation that does **not** use the
function under test — splitting on a terminator followed by whitespace and a
capital — because using the buggy function as its own ground truth returns zero
by construction. That is what the first run of this script did before the
segmentation was replaced.

### c) What a truncated bound causes, per check

**`cut_but_text_present` — missed detections, never false ones.** The check
fires when a CUT marker's containing sentence survives verbatim, and part of
that test is that nothing remains outside the span but inside the bounds. A
truncated bound makes the window *smaller*, so leftovers past the false stop go
unseen. Two ways that plays out: the truncated window may no longer match
anything in the original, so the check does not fire at all; or it matches and
the left/right remnant test passes vacuously because the real remnant sits
outside the bound. Both directions lose a detection. It cannot invent one,
because a smaller window can only contain fewer leftovers.

**`remnant_missed_edit` — missed detections, never false ones.** The check asks
whether the containing sentence changed. A truncated bound asks the question of
a prefix instead. Where the edit is in the prefix the answer is unchanged; where
the edit is past the false stop — which for `EUR 1.2 billion` is most of the
sentence — the prefix looks identical and the detection is lost. A prefix cannot
differ where the whole does not, so no false detection.

**`matchIsWholeSentence` — no effect on correctness, and it fails safe.** A
truncated bound makes the sentence look shorter than the match, so the `right`
leftover is non-empty and the function returns false. Whole-sentence removal
declines to fire. That is the conservative direction, and since `a5be4f0`
deterministic removal is off in production anyway.

**`previousSentenceBounds` / `nextSentenceBounds` — no effect.** They locate a
neighbouring sentence for seam repair; a truncated neighbour is still the right
neighbour, and only its extent is short.

**Unreported-change coalescing — no effect on correctness.** Two changes either
side of a false stop are given different bounds and are not merged, so the user
sees two markers where one would do. Cosmetic.

**`confineRegionToOwnSentence` — already handled.** `8145ef3` made it robust
independently, which is why the what-clause replay above is unmoved.

### d) Has it ever produced a wrong honesty verdict?

**No.** Replayed all 83 markers across the 11 runs on disk under the old bounds
and the new ones: 24 honesty events before, 24 after, none appearing and none
vanishing.

Stated plainly, because it matters for how this is described: **this is a latent
bug that has never fired in the artefacts on record.** It is worth fixing — 28%
of sentences carry the trigger and both affected checks lose detections rather
than gain false ones, so the failure mode is silence — but it has caused no
observed harm and should not be written up as though it had.

The likely reason it never fired is that both checks need a specific
coincidence: a CUT or CHANGED marker on an unchanged span whose sentence carries
a decimal *and* whose real edit sits past that decimal. The corpus has plenty of
decimals and plenty of contradictions; it happens to have no marker where both
land together.

### e) What else would have made this wrong

**The abbreviation rule can swallow a real boundary, which is worse than the
bug.** `Meridian Capital Management Ltd. It was founded in 2008.` is two
sentences, and an unconditional abbreviation exclusion merges them. The rule is
therefore conditional: an abbreviation's stop is ignored only where what follows
does not look like a new sentence. `approx. 20 investments` and `Ltd. of London`
join; `Ltd. It was founded` still splits. Tested both ways.

**The single-initial rule collides with multiples.** The first implementation
read the `x` of `1.9x.` as an initial, so a sentence genuinely ending on a
multiple never closed — a new bug in the opposite direction, caught by the
suite. The rule now requires the letter not to follow a digit.

**The spec's own two rules conflict, and the conflict is resolved as written.**
`Fund V. The` must join (single capital), while `Ltd. It` must split
(abbreviation). Both are a stop followed by whitespace and a capital. The
single-letter rule is therefore given precedence over the
follows-like-a-sentence test, which is what the spec asks for in naming
`"Fund V. The"` explicitly.

## Part 1, the fix

`isSentenceTerminatorAt` added beside `sentenceBoundsContaining`, which now asks
it instead of testing the character directly. The scanning structure is
untouched; only the predicate is new. Deterministic, no model call.

A full stop is not a sentence end when it is:

- between two digits — `EUR 1.2 billion`, `2.4x`
- part of an ellipsis — `...` or an adjacent stop
- after a single letter not itself preceded by an alphanumeric — `J. Smith`, `Fund V. The`
- wedged between letters with no space — `e.g.`, `i.e.`, `U.S.A.`
- the stop of a known abbreviation *not* followed by something that looks like a
  new sentence — `No`, `Inc`, `Ltd`, `LLP`, `LP`, `Corp`, `Co`, `approx`, `est`,
  `etc`, `vs`, `Mr`, `Mrs`, `Ms`, `Dr`, `St`

`!` and `?` are always terminators, and the blank-line rule is unchanged.

### The three worked examples

| case | before | after |
| --- | --- | --- |
| decimal in a figure | `In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.` | `In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund from Meridian Capital targeting lower-mid-market buyouts.` |
| multiple and percentage | `Fund IV is currently marked at 1.` | `Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.` |
| abbreviation | `The GP is Meridian Capital Management Ltd.` | `The GP is Meridian Capital Management Ltd.` |

The third is unchanged, which is the point: it already split correctly and must
continue to. Bounding from the second sentence returns `It was founded in 2008.`
both before and after.

## Part 2, nothing regressed

- honesty verdicts: 24 before, 24 after, **0 appeared, 0 vanished**, nothing to
  adjudicate
- what-clause replay: 84 markers, **0** claiming a change on an unchanged span,
  so `8145ef3`'s result holds
- suite green: **738 tests, 37 files**, up 15 on the new bounds cases

The bounds tests cover the whole of ten sentences that previously truncated or
that exercise a new exclusion, and separately assert that ordinary sentences,
`!`, `?`, blank lines, a sentence ending on a multiple, and an abbreviation
followed by a new sentence all still split.

## Recorded, not fixed

`isSentenceTerminatorAt` is a heuristic and will be wrong somewhere. The two
directions are not symmetric: failing to split merges two sentences and widens
every window, while splitting wrongly truncates one. The rules above are written
to fail towards merging only in the narrow cases listed, and the abbreviation
set is deliberately short for that reason. Anything added to it should come with
a corpus count, not an intuition.
