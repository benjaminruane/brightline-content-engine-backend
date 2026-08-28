# Critique: the Revise per-statement rebuild design

Critique of `scripts/diagnostic/revise/rebuild-design.md`. Zero model calls;
cost **$0.00**. Nothing built, no production code or prompt changed.

> **Filing note.** The spec named `rebuild-design-critique.md` as a NEW file,
> but that path already held the design document itself, untracked and
> therefore unrecoverable if overwritten. I renamed it to `rebuild-design.md`,
> which matches its own H1, and wrote the critique here.

---

## Q7, verdict

### BUILD WITH THE STATED CHANGES — but not in the stated order, and not for the stated reasons.

The governing rule is right and the diagnosis behind it is right. Code
performing every mutation is the only structural answer to a model that
silently deleted the author's words 3 of 3 runs. Nothing below argues against
that.

Three things must change before anything is built.

**1. The confirmed-span-verbatim rule cannot be implemented. Invert it.**
A statement-frame confirmed span does not exist on **0 of 56** real Review
cards. Not rarely — never. `supportSpans` are source-document offsets (0 of 74
passages are locatable in their own statement), and the only statement-frame
alternatives are claim decomposition, which ran on 1 of 56 statements and
produced **zero** `confirmed_preserve` spans, and `coverageUnion`, present on 0
of 56. The load-bearing check of the design has no data to stand on.

The fix is cheap and strictly stronger. Invert the rule: code already knows the
**unsupported** span, which is reliable — 33 of 33 verified verbatim at their
stated statement offsets, 0 null, 0 mismatches. Require that everything
**outside** the flagged span is byte-identical, and that only text inside it
changed. That protects confirmed material better than the original rule
(it protects *all* unflagged material, not just spans someone labelled), uses
the one span type that actually exists, and needs no new span infrastructure.

**2. Span authority is the wrong blocker. Unblock it.**
The design makes single span authority a BLOCKING prerequisite on the theory
that inconsistent frames are "a plausible mechanism for B89". **That theory is
refuted by the code.** Each frame is internally consistent and every consumer
reads its own correctly. B89 is a *classification* disagreement, not a
coordinate-frame defect. Build order step 0 as written spends real effort on a
non-problem while the actual blocker — spans that are never produced — sits in
step 1. Details in Q1b.

**3. Run the equity-cheque experiment before building anything.**
The design calls stage 1 "the clean experiment" for why that sentence never
gets fixed. That experiment does not require the rebuild. `buildRevisionPrompt`
already accepts an arbitrary draft and concern list, so one call with that
statement as the whole draft and its single concern tests the
crowded-generation hypothesis today, for well under a cent. If a narrow call
still returns no-change, the rebuild's central promise is unproven and the
design needs rethinking before 1,000 lines are written.

---

## Q5, the dead code total

| | Lines |
|---|---|
| Library code that becomes unreachable | **~1,114** |
| Library code the new design must add (estimate) | **~1,150** |
| **Net library change** | **≈ 0** |
| Test code removed | ~1,015 |
| Test code needed (estimate) | ~700 |

**The rebuild does not simplify the codebase.** The design's claim that
"roughly half the Revise codebase now exists to police that single call" does
not survive the inventory. What actually happens is a *substitution*: the
marker-policing machinery is replaced, near one-for-one, by span-contract
validation, substitution mechanics, fence enforcement and orchestration.
`pr9-deterministic-unsupported-removal.mjs` (887 lines) stays untouched, and
most of `build-revision-prompt.mjs` (1,103 lines) stays or is reworked rather
than deleted.

This is not an argument against building. It is an argument against selling it
as simplification. The gain is **truthfulness by construction**, which is worth
paying for; it is not a smaller codebase.

### Item by item

| Item | Fate | Lines |
|---|---|---|
| Model-produced marker protocol (`parseSoftenedMarkers`, L711-742) | **Unreachable** | 32 |
| MARKERS prompt section (L1065-1093) | **Unreachable** | 29 |
| KIND HANDLING (L1040-1064) | **Rehomed**, not deleted — per-kind guidance moves into the per-kind call | 25 |
| `applyMarkerHonestyCheck` (`pr9-marker-honesty.mjs`) | **Mostly unreachable**; `findReviewVocabularyHits` (L109) stays | ~550 of 575 |
| `note-what-from-diff` | **Partially stays.** `renderWhatClause`, `quoteFragment`, `CONCERN_KIND_REASONS` are exactly what "code writes the note" needs. `extractModelReason` and `diffWordSequences` die | ~200 of 350 |
| `pr9-marker-note-claim.mjs` | **Unreachable** — no model claim left to classify | 61 |
| Marker re-anchoring / offset remapping (`pr9-marker-span-status.mjs`) | **Mostly unreachable**; adjacency logic may be reused by the stage 2 fence | ~179 |
| Whole-span suppression, B88 (`extractUnsupportedSpansForRevision`, L282-346) | **Must be changed, not deleted.** It suppresses whole-statement spans because they read to the model as "delete the sentence". Under stage 1 a whole-statement span is precisely the signal code needs. **This code now destroys information the new design depends on** | 65 |
| D2 `underreach_hedging` skip (L371) | **Stays** — concern filtering, upstream of any model | 1 |
| Review-vocabulary retry path (`api/suggest-revision.js` L167-192) | **Partially stays.** The model still emits prose in `revised_statement`, so leakage is still possible; the retry granularity changes from draft to statement | ~26 |
| `ensureMarkerSentenceTerminalPunctuation` (L881-943) | **Unreachable** — code builds the note, so it can build it terminated | 63 |
| `applyHouseStyleCharNormalizeToRevision` + `normalizeWithIndexMap` (L766-816, 743-765) | **Stays** — code-built markers still need offsets remapped through normalisation | 74 |

---

## Q1, does the span data support this

Measured over **56 statements** across the 6 Review artefacts on disk that
carry real `qcCard` objects (`rebuild-design-critique.mjs`). The 296-statement
`claim-spans/.baseline.json` corpus **cannot** answer this: it is a Stage 2
match cache carrying `classification`/`passage`/`explanation` and no span
fields at all. That limitation is worth recording — the largest corpus in the
repo cannot validate a span-based design.

| Field | Statements carrying it | Spans | Null offsets | Frame |
|---|---|---|---|---|
| `supportSpans` | 47 of 56 | 74 | 0 | **source document** |
| `unsupportedSpans` | 30 of 56 | 33 | 0 | **statement** |
| `claims[]` | **1 of 56** | 2 | — | `draftStart/draftEnd` = **whole draft** |
| `coverageUnion` | **0 of 56** | — | — | statement |

**Frame check, empirical:** of 74 `supportSpans` passages, **0** are locatable
in their own statement. They index the source file. Of 33 `unsupportedSpans`,
**33** slice back to exactly their `text` at the stated statement offsets, 0
mismatches. So `unsupportedSpans` are reliable and `supportSpans` are not
statement-addressable, as a matter of measurement rather than inference.

### Availability by verdict — the part that breaks the design

| Verdict | n | `unsupportedSpans` | `supportSpans` | `claims` |
|---|---|---|---|---|
| `partial` | 23 | **23** | 20 | 1 |
| `conflicting` | 3 | **3** | 3 | 0 |
| `supported` | 24 | 4 | 24 | 0 |
| `not_supported` | **6** | **0** | **0** | **0** |

Span elicitation only runs for `partially_confirmed` and `conflicting`
(`SPAN_ELICIT_CLASSIFICATIONS`). **Every `not_supported` statement carries no
spans of any kind** — and those are exactly the statements the design most
wants to act on.

### Is the span contract implementable as written?

**No.** Taking its four rejection rules in turn:

1. *`revised_statement` identical to original* — implementable, trivial.
2. *A CONFIRMED span does not appear verbatim in the revised statement* —
   **not implementable.** No statement-frame confirmed span exists on any
   card measured. Using `supportSpans` for this is a category error: it would
   test whether a passage from the *source file* appears in the *draft
   sentence*, which is false for 74 of 74 spans and would reject every edit.
3. *A new figure, date or proper noun appears in neither the original nor the
   source* — implementable, and the strongest rule in the design. It is also
   the only one that needs no spans at all.
4. *`target_span` does not correspond to a span Review flagged* —
   **implementable but harmful.** 7 of 33 flagged statements have no span of
   any kind, so this rule rejects *every* edit on them. Those statements become
   permanently unfixable — a coverage hole created by the mechanism intended to
   close coverage holes.

Offsets are *not* inconsistent between paths in the sense the design fears.
Each field is consistently in its own frame. The problem is absence, not
inconsistency.

---

## Q1b, span authority and coordinate systems

### The design's evidence: confirmed

All three claims are correct, and here is where each is set.

| Field | Frame | Set at | Documented? |
|---|---|---|---|
| `supportSpans[].start/end` | **source document** | `lib/qc/pipeline-v4/stage2-match-multipassage.mjs:251`, via `locatePassageInSource` at `:86-88` (`source.indexOf(needle)`) | Yes — `:73-74` "Offsets are relative to `source.text`" |
| `unsupportedSpans[].start/end` | **statement** | `lib/qc/pipeline-v4/stage2-match-sources.mjs:181-189` (`statement.indexOf(raw)`) | Yes — `:139`, `:1528`, and `lib/qc/qc-api-schema.mjs:174` |
| `claims[].draftStart/draftEnd` | **whole draft** | `lib/qc/claim-spans.mjs:455-456` (`draftStart = charStart + localStart`) | No — only the `local*` / `draft*` naming |
| `claims[].localStart/localEnd` | statement | `lib/qc/claim-spans.mjs:430-432` | No |
| `charStart` / `charEnd` | whole draft | `lib/qc/pipeline-v3/stage7-assemble-card.mjs:710-711` | No |
| `draftSpan.startChar/endChar` | whole draft | `lib/qc/pipeline-v3/stage7-assemble-card.mjs:778` | By name only |
| `editorialConcerns[]/complianceConcerns[].span[].startChar/endChar` | **statement** | `lib/qc/editorial-compliance-reviewer.mjs:707-709` (`statementText.indexOf`) | JSDoc at `:698` says "in statement text"; the field name does not |
| `coverageUnion.union` | statement | `lib/qc/coverage-union.mjs:52-53` | Yes — `:2` |
| `evidenceTrace`, `citationHovers` | **no offsets** — hardcoded `[]` | `stage7-assemble-card.mjs:779, 789` | — |
| `primaryExcerptStart/End` | **no offsets** — always `null` | `stage7-assemble-card.mjs:768-769` | — |

The only genuine frame conversions in the codebase are
`lib/qc/claim-spans.mjs:455-456` (statement → draft) and `:477-478`
(draft → statement, **dead**: `_parentCharStart` is never assigned anywhere
in `lib/`).

**The real trap is naming, not arithmetic.** Concern spans and `draftSpan`
both use the field names `startChar`/`endChar` while measuring against
different strings. Any consumer treating them alike highlights the wrong text.

### The three consumers

| Consumer | Reads | Frame assumed | Correct? |
|---|---|---|---|
| QC card highlight — `frontend/src/components/draft/cardHighlightHelpers.js:39-101` | `draftSpan` + `concern.span[]` | Converts explicitly: `startChar = statementOffset + entry.startChar` (`:48`) | **Yes** |
| Sources drawer — `frontend/src/components/drawers/SourceReaderPanel.jsx:18-38, 225-258` | `supportSpans[].start/end` only | Source document, no conversion; comment at `:225` states the contract | **Yes** |
| Reviser prompt — `formatConcernsBlock`, `lib/build-revision-prompt.mjs:568-682` | Uses **no offsets at all**. Emits span *text* only (L633, L590-600) | n/a | **Yes, vacuously** |

The third row is the important one for the rebuild. `formatConcernsBlock`
today passes spans as **quoted strings, never as offsets**. So there is
currently no consumer anywhere that hands the reviser a numeric span. Stage 1
would be the first, which is why nobody has hit this problem before — and why
the design's assumption that the offsets are ready to use is untested.

Also: **nothing in the frontend reads `unsupportedSpans` or
`claims[].draftStart/draftEnd`** — zero occurrences in the repo. The backend's
most reliable span is never displayed.

### Can the card and the drawer point at different text? Yes. Is that B89?

They can, and they do — but **not because of coordinate frames**. Each consumer
handles its own frame correctly. The divergence is that they are fed by two
independent backend selections for the same statement: the card highlight comes
from `concern.span`, string-located from the editorial concern's quoted phrase
(`editorial-compliance-reviewer.mjs:730`), while the drawer comes from the
widened multi-passage matcher, which is documented as deliberately outside the
verdict path — `stage2-match-multipassage.mjs:2`: *"Used ONLY to populate
supportSpans. NEVER feeds aggregateVerdict / selectExcerpts."*

`docs/BACKLOG.md:94` defines B89 as `supportSpans[].classification` disagreeing
with the card verdict. **That framing is the accurate one.**

> **B89 is not a span-authority defect. The design's stated mechanism for it is
> wrong.** It is a classification disagreement produced by two selection paths
> that were deliberately decoupled. Single span authority would not fix it, and
> fixing B89 would not deliver the spans stage 1 needs.

One latent risk worth recording: `cardHighlightHelpers.js:48` adds
`draftSpan.startChar` to `concern.span` offsets **unconditionally**. If any
producer ever emits a concern span already in draft coordinates, the highlight
lands at roughly double the offset. No such producer exists today.

### Can a single span authority be established?

Yes, and it is worth doing — but as cleanup, not as a blocker.

Shape: one `statementSpans` structure per card, every span in the **statement
frame** with a declared `frame` field, plus explicit converters at the two
edges that need other frames (the drawer needs source, the draft highlight
needs draft). Statement frame is the right default because it is the only one
all three span types can share, and because `draftSpan.startChar` makes
conversion to draft a single addition.

**Cost:** the producers are few — `stage2-match-sources.mjs:181-189`,
`stage2-match-multipassage.mjs:251`, `claim-spans.mjs:455-456`,
`editorial-compliance-reviewer.mjs:707-709` — but every one is inside the
Review pipeline, which the design explicitly wants to leave alone
("Review, entirely. Not implicated in any of this"). Touching it means
re-baselining the corpus, which is a money decision the repo has already
deferred twice.

**What it breaks:** the card schema (`qc-api-schema.mjs`), the two frontend
consumers, and any artefact comparison against the existing baseline.

**Does the stage 1 contract depend on it? No.** With the inverted rule from Q7,
stage 1 needs exactly one span type — `unsupportedSpans` — which is already in
the statement frame, already documented, and already 33-for-33 reliable. The
contract can be built without touching Review at all.

---

## Q2, attacking the span contract

Measured over the 33 flagged statements.

| Case | Count |
|---|---|
| Flagged with **no statement-side confirmed span at all** | **7 of 33** |
| Flagged where a confirmed span exists as an explicit object | **0 of 33** |
| Whole statement is one confirmed span (all claims `confirmed_preserve`) | 0 |
| Confirmed claim overlapping an unsupported span | 0 |
| `conflict` statements with no `unsupportedSpan` | 0 |

The counts for overlap and whole-statement-confirmed are **0 because the
inputs are absent, not because the cases are safe**. With one statement in 56
carrying claim decomposition and zero `confirmed_preserve` claims anywhere,
these questions cannot be answered empirically. That absence is itself the
finding, and it is worse for the design than a nonzero count would have been:
a measurable failure rate could be traded off, whereas missing data means the
rule cannot even be evaluated.

The three cases the spec asks about, argued from the code rather than counted:

**A legitimate edit must alter a confirmed span.** Rule (a) at
`build-revision-prompt.mjs:1045` *requires* it: on a conflict the revised prose
must carry the source's competing value, replacing the draft's. If "confirmed"
were derived as the complement of the unsupported span, the surrounding clause
is confirmed and a grammatical repair to it — number agreement, article, tense
after substituting a value — breaks verbatim equality. All 3 `conflicting`
statements carry an `unsupportedSpan` marking only the contradicted phrase
(e.g. `"has returned"`), so the replacement value must land in text the
complement would call confirmed.

**Confirmed overlapping unsupported.** Cannot occur today because
`confirmed_preserve` claims are never emitted. If claim decomposition were
switched on more widely it becomes live immediately, since claims and
unsupported spans are produced by *different* stages against the same statement
with no cross-validation.

**A statement entirely one confirmed span.** The design's rule makes any edit
to such a statement impossible. In practice these statements are not flagged,
so the case is currently vacuous — but it is exactly what a `soften` or
`compliance_strip` concern on a fully-supported statement looks like, and the
production draft has one: statement 3, `soften`, `supportSpans` present,
`unsupportedSpans` empty, no claims. Under the design as written **the
production draft's only editorial finding could never be acted on**.

---

## Q3, what the per-statement model cannot express

| Behaviour | Where | Fits one call per statement? | Rehome to |
|---|---|---|---|
| **Craft edits** | Rule (f), L1058: "APPLY SILENTLY. NEVER emit a marker" | **No.** Silent, markerless, and code-performs-every-mutation leaves them nowhere. The design admits this is undecided | Either drop craft from Revise entirely, or a separate deterministic house-style pass. Do **not** fold into stage 1: it would put unmarked edits back into a model call, which is the defect being fixed |
| **`compliance_strip` across statements** | Rule (i), L1061 | **No.** A named individual appears in several statements; concerns are per-statement, so stripping in one leaves the name in the others | Code-side, draft-wide, deterministic — the same shape as the existing removal path |
| **Review-vocabulary leakage check** | `api/suggest-revision.js:167` | Draft-wide, but composes fine over per-statement outputs | Keep, run after assembly |
| **House-style char normalisation** | `applyHouseStyleCharNormalizeToRevision`, L766-816 | Draft-wide, deterministic, code-side | Keep, unchanged |
| **Deterministic whole-sentence removal** | `pr9-deterministic-unsupported-removal.mjs` | Already code-side | Keep, unchanged — as the design says |
| **Cross-sentence flow and register** | Nowhere explicit today; emerges from whole-draft generation | **No** | Stage 2, which is what it is for — but stage 2 may not assert, so genuine flow problems have no home |
| **The "surrounding paragraph, read only"** | Proposed | Ill-defined: statements can span paragraph boundaries, and `draftSpan` gives a statement's draft offsets but nothing computes paragraph bounds for a card | Needs specifying; `paragraphContaining` exists in the diagnostic helpers and would need promoting |

---

## Q4, cost and latency

Flagged statements per draft, from the 6 real Review artefacts:

| Artefact | Flagged / statements |
|---|---|
| `r10-production-verify.json` | 8 / 10 |
| `r3a-production-verify.json` | 7 / 10 |
| `suggest-after-r10-review1.json` | 8 / 10 |
| `suggest-after-r10-review2.json` | 3 / 10 |
| `condition-b-review.json` | 3 / 10 |
| `coverage-gap-review.json` | 4 / 6 |

**Median 5.5, mean 5.5, maximum 8.** The design's "Meridian has 4" is the
smallest draft in the set; typical is closer to 6-8, and the *rate* is high —
30% to 80% of statements are flagged.

### Token cost, measured

On the production Meridian fixture, using `buildRevisionPrompt` for both arms:

```
current, one call over the whole draft   34,027 chars   ~8,507 tokens
stage 1, one call per flagged statement 122,667 chars  ~30,667 tokens   3.60x
```

The cause is that ~**7,695 tokens** of the current prompt are *fixed
scaffolding* — style guide, KIND HANDLING, MARKERS, output contract — which
would be paid once per statement instead of once per draft.

**Assumptions, stated:** 4 chars per token; the same prompt builder for both
arms; input tokens only, output ignored; no caching.

That last assumption is the load-bearing one and it cuts both ways. Stage 1
will not reuse `buildRevisionPrompt` — it needs a much smaller prompt. **The
break-even point is a fixed stage-1 prompt of about 1,500 tokens**, one fifth
of today's. Above that, the rebuild costs more per draft than the design it
replaces, and at 8 flagged statements the multiplier is worse still. Prompt
caching on the fixed prefix would change this materially and should be checked
before the estimate is trusted.

**Latency** should improve, as the design says: the calls are independent and
parallelisable, so wall-clock is one call plus the repair pass rather than one
long generation.

**To compute cost exactly** I would need: a `PRICING` entry for `gpt-5.1` in
`lib/observability.js` (still absent, flagged in `7399333` and `bf9d9e8` and
the reason reviser spend reports as $0), the actual stage-1 prompt, real output
token counts, and confirmation of whether prompt caching applies to the fixed
prefix.

---

## Q6, what the design gets wrong

**1. The load-bearing check rests on data that does not exist.** Covered in Q7
and Q1. This is the single most important objection: the rule the design calls
"the important one" cannot be implemented on any card the pipeline currently
produces.

**2. B89 is misdiagnosed, so the blocker is in the wrong place.** Covered in
Q1b. Build order step 0 is "Settle span authority. Blocking." That step, as
scoped, solves a problem that does not exist and does not produce the spans
stage 1 needs.

**3. B88 is not dead code, it is an obstacle.** The design lists whole-span
suppression among things deleted. In fact `extractUnsupportedSpansForRevision`
(L282-346) *suppresses whole-statement spans on purpose*, because they read to
the model as "delete the sentence". Under stage 1 that is the exact signal code
wants. It is not dead; it actively destroys information the new design depends
on, and must be changed rather than removed.

**4. "Fixes most run-to-run instability" is overclaimed.** The design credits
the rebuild with removing instability because unflagged sentences are never
regenerated. But the reviser is unstable *within* a fixed configuration — that
is what the three-run band exists to measure — and 6 independent per-statement
calls are 6 independent samples. Instability is *bounded* to flagged statements,
which is a real gain, not *removed*.

**5. The equity-cheque experiment does not need the rebuild.** Argued in Q7.
This is the cheapest high-information action available and it gates whether the
rebuild's premise holds at all.

**6. The stage 2 fence's number rule is unsafe as stated.** "No NEW number may
appear; one already in the draft MAY be reused" — but a figure that is correct
in one sentence is not therefore correct in another, and the fence as described
would permit relocating a number into a claim no source backs. For proper nouns
reuse is defensible; for numbers it should be prohibited outright. Nothing in
the permitted operations needs to introduce a number.

**7. Something simpler would capture most of the value.** The design's own
evidence list has one item that is structural and four that are reporting
failures. The structural one — silent, markerless edits — is *already*
detectable with the machinery that exists: run `markerSpanAlignment` over the
whole draft after finalisation and assert that every changed region is covered
by a marker. That is perhaps 60 lines against ~1,150, catches the defect
`c1fb2c1` found, and needs no span authority, no per-statement calls and no
cost multiple. It does not deliver truthfulness by construction, and I am not
proposing it *instead* of the rebuild — but it should ship first, because it
closes the worst live defect in days rather than weeks, and it gives an
independent measurement of how often the defect fires, which is currently
known only from three runs of one draft.

**8. A smaller point on scope.** "Review, entirely. Not implicated in any of
this" is contradicted by Q1: Review is the sole producer of the spans the whole
contract depends on, it does not produce one of the three types at all, and it
produces nothing for `not_supported` statements. Review is implicated. Not as a
defect, but as a dependency the design treats as satisfied when it is not.

### Did anything survive scrutiny?

Yes, and it should be said plainly. The governing rule survives completely.
Restricting the model to a bounded span so that the rest of the document is
unreachable *by construction rather than by instruction* is the correct
response to the evidence, and the distinction the design draws in its own
revision note — that the point is not "the model never returns text" but "code
chose the span" — is exactly right. The no-bridging-sentence position is right
and well argued. Making refusals explicit and countable is right. The
new-figure/date/proper-noun rule is the strongest check in the design and needs
no spans at all.

---

## Recommendation: what stage 1 should be measured on

1. **The equity-cheque sentence, before building.** One call, that statement,
   that concern, three runs. It is under a cent and it tests the premise.
2. **Refusal rate by concern kind**, against the `c1fb2c1` baseline of 86.8%
   action on evidence kinds and 100% on the one directive kind. Stage 1 must
   beat those or it is a more expensive way to do the same thing.
3. **Silent-edit rate: it must be exactly zero, by construction.** This is the
   defect that motivated the rebuild, and the one number that would justify it
   even at neutral line count and higher cost.
4. **Confirmed-material degradation**, using the inverted rule: how often does
   the model try to change text outside the flagged span? That is the number
   that tells you whether the span contract is earning its place.
5. **Cost per draft against the 5.5-flagged median**, not against Meridian's 4.
6. Three runs per arm on the committed production fixtures, same Review, as
   `18ac825` and `fae582f` did. The reviser does not hold still.

---

## Files

| File | Change |
|---|---|
| `scripts/diagnostic/revise/rebuild-design.md` | **renamed** from `rebuild-design-critique.md` to preserve it |
| `scripts/diagnostic/revise/rebuild-design-critique.md` | this critique |
| `scripts/diagnostic/revise/rebuild-design-critique.mjs` | new — Q1/Q2/Q4 measurements, zero model calls |
| `scripts/diagnostic/revise/rebuild-design-critique.json` | new — raw counts |

No production code, prompt, or test changed.
