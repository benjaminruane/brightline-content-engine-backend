# No deletion without a marker, and the size of a stage 1 prompt

Cost: **zero**. No model calls in any part of this. Part 1 uses the breadth
audit rows from 8cad514, Parts 2 and 3 construct and count prompts without
sending them.

---

## Verdict first

**PART 2: MORE EXPENSIVE than today.** A stage 1 call is 5,427 tokens. At the
5.5-statement median that is 29,849 tokens against today's 8,507 — **3.51x**.
At the 8-statement maximum it is 43,416, or **5.10x**. Excluding the MARKERS
section and the other eight kinds saves 2,367 tokens per call and does not
close the gap.

**PART 1: 7 of the 11 removals in the corpus were silent deletions — 64%.**
Not an edge case. The audit in 8cad514 reported `selectedRemoved: 11` and
`skippedOther: 0`, so all eleven were counted as clean removals. Seven of them
deleted a sentence and produced no marker.

**PART 3 changes the Part 2 answer.** With prompt caching on the shared prefix
the median falls from 3.51x to **1.24x** and the maximum from 5.10x to 1.57x.
Caching is not an optimisation on this design. It is the difference between
viable and not, and it is a **prerequisite**.

---

## Part 1, no deletion without a marker

### Every path that can delete text

There is exactly one statement that mutates the draft by deletion, previously at
L804. Seven skip reasons exist, and the question is which of them fire *after*
that line:

| Reason | Fires | Mutated the draft? |
|---|---|---|
| `confirmed_remnant` | before the delete | no |
| `statement_text_no_match` (x2) | before | no |
| `not_whole_sentence` | before | no |
| `empty_draft_kept` | before | no, and it already emits a loud KEPT marker |
| `both_neighbours_marked` | before | no |
| `no_neighbour_remnant` | before | no |
| **`remnant_lost_after_delete`** | **after** | **yes, and returned no marker** |

So `remnant_lost_after_delete` was the only offender, and it is the only skip
reason positioned after the mutation. Its own comment said *"Cannot safely
continue with a broken draft state; this should not happen."* It happens on 64%
of removals.

I also found a **second, latent path** to the same outcome. After the CUT marker
is pushed, a filter drops markers with invalid or empty spans. A degenerate
remnant span would be discarded there, leaving the deletion committed and
unmarked. It has not fired in the corpus, but it is the same defect waiting.

### The fix

The deletion is now **planned, not committed**. The post-deletion draft and the
remapped markers are built into locals, the remnant is verified against those
locals, and `draft` and `markers` are only assigned once a CUT marker has
actually been anchored. Both failure paths now fall back to keep-and-flag using
the existing loud empty-draft register, adapted:

> No supplied source supports this. It has been kept only because its removal
> could not be recorded. Confirm before publishing.

Because nothing is committed until the marker exists, the fallback needs no
restore logic — the draft was never touched.

On top of that, `enforceRemovalInvariant` asserts at the end of the stage that
the number of deleted sentences equals the number of removal markers. Throwing
would lose the entire revision, so on divergence it logs an error and restores
the **pre-stage** draft:

```
[removal-invariant] trace=<id> deleted=1 markers=0 action=restored_pre_stage_draft
```

A revision that removed nothing is recoverable. One that removed something
without saying so is not.

### Corpus frequency

Across 29 cases and 296 statements, 11 removals reached the delete step.
**7 were silent (64%).**

| Statement | Sentence |
|---|---|
| F01:S11 | "We recommend approval." |
| F08:S17 | "We are confident in the team and the opportunity, and we look forward to providing further updates as the hold progresses." |
| F12:S5 | "The numbers tell one story; the team's transformation tells the bigger one." |
| F13:S15 | "The investment fits well with the broader portfolio strategy." |
| F14:S12 | "We will provide further detail when the work is sufficiently advanced." |
| F15:S32 | "We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses." |
| F20:S8 | "Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026." |

These are almost all **closing sentences** — recommendations and sign-offs. The
remnant is sought in a neighbouring sentence, and a draft-final sentence is the
case where that search is most likely to fail.

**This is a user-visible behaviour change, and it should be stated plainly.**
Before the fix, all 11 sentences were deleted, 7 of them silently. After the fix
4 are deleted with a marker and 7 are kept with a loud flag. The deterministic
removal feature therefore removes **4 of 11**, not 11 of 11. It is
substantially less effective than 8cad514 advertised, because most of what it
was "removing" it was removing incorrectly. Keeping and flagging is the right
outcome, but the headline number for that feature should be revised down.

### Unit coverage

Four cases, all passing:

- no anchorable remnant → sentence **kept**, marker emitted, nothing deleted
- a normal removal → unchanged behaviour, one CUT marker
- the invariant fires and restores when deletions and markers diverge
- the invariant passes a matched deletion through untouched

The invariant was extracted into an exported `enforceRemovalInvariant` so it can
be tested directly. My first attempt monkey-patched `Array.prototype.filter` to
force a divergence and failed to trigger anything — because the new per-removal
guard caught it first. That is the guard working, but it made the test dishonest
about what it was testing.

---

## Part 2, sizing the stage 1 prompt

Every block below is sliced out of the **real live prompt** at build time, so
these counts cannot drift from what production sends. Tokens are estimated at
chars/4, the same method as fc25060, which keeps the 8,461 baseline comparable
(it measures 8,507 here; the small difference is fixture drift, not method).

### What the prompt contains

| Block | Tokens |
|---|---|
| Shared, cacheable prefix | 4,767 |
| — house style guide, in full | 3,560 |
| — global guardrails | 902 |
| — named entities, output intent, stage 1 JSON contract | ~305 |
| KIND HANDLING, this kind only | 313 |
| **Fixed prefix total** | **5,080** |
| Statement, concern, source excerpt, conflicting passage, surrounding paragraph | 347 |
| **Typical whole call** | **5,427** |

The house style guide is **70% of the fixed prefix**. That is the entire cost
problem in one line, and arm C in fc25060 already proved it cannot be dropped:
without it the model broke house style and deleted confirmed material.

### What is excluded, and why each is safe

- **The MARKERS section, 989 tokens.** Obsolete. Since fc25060, code owns
  markers end to end: it generates them for unreported changes, builds notes
  from the real diff, attributes reasons from concerns, and enforces intent
  honesty. Stage 1 returns `action` and a plain-words `what`/`why` in JSON, and
  code turns that into a marker. Twenty-three lines of delimiter syntax and
  worked examples buy nothing.
- **The other eight kinds' rules, 1,378 tokens.** A stage 1 call handles one
  statement with one concern kind. Rules for `conflict`, `deletion`, `soften`,
  `craft` and the three compliance kinds cannot apply to it. The preamble that
  distinguishes the three ways of "removing content" is kept, because that
  distinction is what stops the model confusing them.
- **The whole-draft framing.** "Rewrite the ENTIRE draft", the paragraph
  structure rules, and the NO SCAFFOLDING guardrail against document templates
  are all about producing a document. Stage 1 produces one sentence. The
  surrounding paragraph is supplied as read-only context so register and flow
  are still visible.

### The numbers

| | Tokens | vs today |
|---|---|---|
| Today, one whole-draft call | 8,507 | 1.00x |
| Stage 1, 5.5-statement median | 29,849 | **3.51x** |
| Stage 1, 8-statement maximum | 43,416 | **5.10x** |

**VERDICT: MORE EXPENSIVE.**

This confirms the concern in the spec and contradicts the optimistic reading of
fc25060. Arm C's 395 tokens looked like it made the rebuild cheap, but arm C is
rejected: it dropped confirmed material and broke house style. Arm B is the
recommended shape, and arm B carries the full instruction set, which is where
the cost lives. Trimming everything legitimately trimmable — the MARKERS section
and eight kinds, 2,367 tokens — still leaves 3.51x.

---

## Part 3, prompt caching, diagnosis only

### Is it supported today

**No, on both providers.**

- **OpenAI.** The request is assembled at `lib/observability.js` L290-300 and
  sent at **L301** (`openaiClient.chat.completions.create`). `params` carries
  only `model`, `temperature`, `messages`, and optionally `seed` and
  `response_format`. There is no caching opt-in and no prefix discipline.
- **Usage is read at L305-308**, taking `prompt_tokens` and `completion_tokens`
  only. `prompt_tokens_details.cached_tokens` is **discarded**, so a cache hit
  is invisible to us.
- **Cost is computed at L168-175**, and L174 bills every input token at the full
  `rate.input`. Cached input bills at roughly 10%, so even where caching happens
  the reported cost is **overstated**.
- **Anthropic.** Messages are converted at L104-127 and sent at L240-283. There
  are no `cache_control` breakpoints anywhere. Anthropic caching requires an
  explicit opt-in, so it is definitively off.
- The only `cache` in the file is `traceMetadataCache` (L27), a Langfuse trace
  metadata map, unrelated to prompts.

Worth noting: OpenAI applies prompt caching **automatically** to prefixes over
1,024 tokens. Our shared prefix is 4,767. So some caching may already be
happening on today's repeated calls and we would neither see it nor bill it
correctly.

### What it would take

1. **Prefix discipline, the real work.** Caching matches on an identical leading
   prefix, and the kind rule differs per statement. Everything kind-independent
   must come first, with the kind rule and the statement after it. The sizing
   script is already ordered this way, which is why it reports 4,767 cacheable
   and 313 not. Get the order wrong and nothing caches at all.
2. **Capture the hit rate.** Read `prompt_tokens_details.cached_tokens` at
   L305-308 and carry it through the usage object. Without this there is no way
   to know whether any of it works.
3. **Bill it correctly.** Split L174 so cached input tokens use a discounted
   rate. This needs a `cachedInput` column in `PRICING`.
4. **Anthropic, only if needed.** Add a `cache_control: { type: "ephemeral" }`
   breakpoint on the final shared-prefix block in the conversion at L104.

Steps 2 and 3 are worth doing **regardless of the rebuild**, because our current
cost figures are wrong wherever automatic caching is already active.

### What the cost becomes

Shared prefix written once at full price, then read at ~10%; the kind rule and
statement paid in full each time.

| | Tokens | vs today |
|---|---|---|
| Today | 8,507 | 1.00x |
| Stage 1, median, uncached | 29,849 | 3.51x |
| **Stage 1, median, cached** | **10,542** | **1.24x** |
| Stage 1, maximum, uncached | 43,416 | 5.10x |
| **Stage 1, maximum, cached** | **13,384** | **1.57x** |

Caching removes about two thirds of the penalty. 1.24x at the median is a
defensible price for a defect the wide call cannot fix at any prompt-engineering
effort — fc25060 showed 0/3 becoming 3/3 on nothing but narrower content.

**B3 should be reclassified from optimisation to prerequisite.** At 3.51x the
rebuild is hard to justify on cost. At 1.24x it is straightforward. The
recommended order is: land caching and its measurement first, confirm the hit
rate on real traffic, then build stage 1 against a known number rather than an
assumed one.

---

## Technical summary

- **`lib/pr9-deterministic-unsupported-removal.mjs`.** The deletion is planned
  into locals and committed only after a CUT marker is anchored in the
  post-deletion draft. `remnant_lost_after_delete` and a newly identified
  `marker_dropped_after_delete` now keep and flag the sentence instead of
  deleting it, emitting event action `unrecordable_removal_kept` and a loud KEPT
  marker. Added `enforceRemovalInvariant` (exported), which compares deleted
  sentences against removal markers, logs `[removal-invariant]` and restores the
  pre-stage draft on divergence. Extracted `keepAndFlagSentence`, now shared with
  the empty-draft guard. New exports:
  `DETERMINISTIC_UNSUPPORTED_UNRECORDABLE_NOTE`, `REMOVAL_NOTE_PREFIX`. `opts`
  gains `traceId` and `log`.
- **`tests/pr9-deterministic-unsupported-removal.test.mjs`.** Four new cases in a
  `no deletion without a marker` block.
- **`tests/pr9-unreported-change-markers.test.mjs`.** One assertion inverted: the
  draft that exposed the defect now correctly keeps its sentence.
- **New** `scripts/diagnostic/revise/stage1-prompt-sizing.mjs` and
  `stage1-prompt-sizing.json`. Zero model calls; slices real prompt blocks.
- Suite green, 564 tests, 33 files. No changes to the live reviser prompt.

## Plain-language summary

The reviser was quietly deleting sentences from people's drafts with no note to
say it had — on 64% of the sentences it tried to remove, mostly closing lines
like "We recommend approval." It now refuses to remove anything it cannot leave
a note about, so those sentences stay in the draft with a visible flag instead of
vanishing. Separately, we costed the planned per-sentence rebuild without
spending anything: it would be about 3.5x today's bill as designed, but roughly
break-even if we turn on prompt caching first, so caching needs to come before
the rebuild rather than after it.
