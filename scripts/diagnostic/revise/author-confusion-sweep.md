# Author-versus-third-party sweep, and the directive claim on a real evidence base

Harness `author-confusion-sweep.mjs`, raw data `author-confusion-sweep.json`.
Model `gpt-5.1-2025-11-13`, temperature 0, three runs per arm.

---

## PART 1 COUNT: 8 sites swept, 3 new confusions found, all 3 fixed

The sweep is not a reading of the regexes. Each site is **probed** with a
statement naming only the authoring organisation and a matched statement naming
a genuine third party, so a site is only called confused when it demonstrably
treats the two the same.

| # | site | verdict |
| --- | --- | --- |
| 1 | `qc/materiality.mjs` `named_person_entity_attribution` | **found here, fixed** |
| 2 | `qc/claim-spans.mjs` `extractVerifiableAnchors` | legitimately name-blind |
| 3 | `revise-stage1.mjs` `checkNoInventedFacts` | fixed at 2528a32 |
| 4 | `revise-stage1.mjs` `checkNoSpanEntitiesKept` | legitimately name-blind |
| 5 | `revise-flag-register.mjs` `namedThirdPartiesIn` | fixed at a5be4f0 |
| 6 | `pr9-deterministic-unsupported-removal.mjs` `findCheckableParticulars` | **found here, fixed** |
| 7 | `qc/evidence-relationship.mjs` `corePropositionConfirmed` | **found here, fixed** |
| 8 | `revise-author-statement.mjs` `authorStatementExemption` | the reference implementation |

Three found by accident, three more found by search. The sweep was worth running.

### The three new ones

**7 is the serious one, and it is in Review, not Revise.**
`corePropositionConfirmed` took the FIRST Title-Case run in a statement as the
entity a source must mention before the proposition could be confirmed. For a
client writing about its own investments, that is the client's own name — and no
external source ever mentions the client. Measured, on identical sources:

| statement | confirmed, before | after |
| --- | :---: | :---: |
| "Meridian Capital Partners V was established in 2026." | true | true |
| "Halden Group invested in Meridian Capital Partners V, which was established in 2026." | **false** | **true** |
| "Halden Group was established in 2026." | false | false |

The same proposition against the same source, confirmed or not purely on whether
the author's name leads the sentence. That is a **false negative on support** —
the product telling a client its supported statement is unsupported. Fixed by
skipping the author when choosing the anchor and taking the next name. Where the
author is the only name there is still no external anchor, so the third row
correctly stays unconfirmed.

**1 was half-fixed already, at the wrong end.** The
`named_person_entity_attribution` materiality feature fired on any Title-Case
pair, the author included, which overstated the materiality of the client's own
statements. a5be4f0 filtered the feature out downstream in the flag register, so
Revise was correct while every other consumer still saw the inflated value.
Fixed at the producer, so all consumers now agree. A statement naming the author
*and* someone else still fires, on the someone else; an explicit attribution verb
("according to Halden Group") still fires on anyone.

**6 already knew the answer and had it half-written.**
`findCheckableParticulars` filtered first-person pronouns out of the particulars
a source must corroborate, but not the configured organisation's name — the same
actor spelled out. "We expect the relationship to deepen" yielded no particulars
while "Halden Group expects the relationship to deepen" yielded one. Now neither
does, and "Halden Group committed to Meridian Capital Partners V" correctly
yields only Meridian.

### The two that legitimately treat the author like any other name

**`extractVerifiableAnchors`** asks what in a sentence is *checkable*, not who is
an outsider. The author's own name is legitimately checkable. Left alone.

**`checkNoSpanEntitiesKept`** rejects an edit that **deletes** a named entity.
Losing who acted is a defect whether the actor is the client or anyone else —
this guard exists because a statement came back having lost who committed and
when. Left alone.

### Should this be one shared helper? Partly, and it already is

One primitive was shared: `isAuthoringOrganisationName(name, houseName?)` in
`qc/first-person-actor.mjs`, next to the resolver, with the semantics
`namedThirdPartiesIn` established at a5be4f0 (house name, a possessive, or a name
the house heads). It is read-only and resolved at call time, and returns false
for everything where no organisation is configured — the default is `null`, so
unconfigured deployments are unaffected.

**Consolidating the call sites themselves is not worth it, and the sweep is why.**
The four sites want four different things from the same answer: one suppresses a
feature, one drops a token from a list, one picks a different anchor, one widens
a known-names set. A single `stripAuthor(text)` helper cannot serve them, and a
helper with four modes is four call sites wearing a hat. The cost of forcing it
would be roughly a day, plus a shared-signature change across Review and Revise
for no behavioural gain, and it would make each site's *reason* harder to read at
the point where someone next needs to understand it.

What is worth doing instead, and is not built here: a **lint or unit guard** that
fails when a new Title-Case regex is added under `lib/` without either calling
`isAuthoringOrganisationName` or carrying an explicit "name-blind by design"
comment. Six sites in three months arrived by accident; the seventh will too. That
is a few hours.

---

## PART 3 VERDICT: DOES NOT. The two-case result did not generalise

Across 14 directives, three runs per arm:

**OLD 29/42 (69%). NEW 30/42 (71%).** A one-directive difference is not material,
and it is well inside the run-to-run variation the whole-draft path shows.

The 3-of-3 against 0-of-3 that 2528a32 reported was real and reproduced here
(coverage-gap S5, bottom of the table). It was simply not representative. On the
wider corpus the whole-draft path follows explicit directives about as often as
per-statement calls do, and **the directive claim from 2528a32 does not survive
contact with 12 more cases.**

### Every directive, per arm

| fixture | S | rule | OLD | NEW |
| --- | :---: | --- | :---: | :---: |
| r10-review1 | 1 | `marketing_language_excess` | 1/3 | **0/3** |
| r10-review1 | 1 | `voice_consistency` | 3/3 | **0/3** |
| r10-review1 | 3 | `overreach_unsupported_causal` | 3/3 | 3/3 |
| r10-review1 | 7 | `voice_consistency` | 1/3 | **3/3** |
| r10-review1 | 8 | `first_person_plural` | 3/3 | 3/3 |
| r10-review2 | 1 | `voice_consistency` | 3/3 | 3/3 |
| r10-review2 | 3 | `structural_integrity` | 0/3 | 0/3 |
| r10-review2 | 7 | `voice_consistency` | 0/3 | 0/3 |
| condition-b | 1 | `marketing_language_excess` | 3/3 | 3/3 |
| condition-b | 1 | `voice_consistency` | 3/3 | 3/3 |
| condition-b | 7 | `voice_consistency` | 3/3 | 3/3 |
| condition-b | 8 | `voice_consistency` | 3/3 | 3/3 |
| coverage-gap | 3 | `marketing_language_excess` | 3/3 | 3/3 |
| coverage-gap | 5 | `overreach_unsupported_causal` | **0/3** | **3/3** |

Nine of fourteen are tied. Two go to stage 1, two go to the whole-draft path, and
one (`structural_integrity`) neither arm ever follows.

### Directives the whole-draft path followed and stage 1 did not

The spec called this out as the result that would undermine the recommendation.
There are **two, and they are the same statement with the same single cause**:

> "We were attracted to Meridian on the strength of a track record that is, in our
> view, genuinely exceptional."

It carries two directives, and `voice_consistency` instructs replacing the whole
opening clause with "Halden Group was attracted to…". The model does exactly that.
The validator then rejects it:

```
rejected | changed_text_outside_unsupported_span
detail:  | words before the span changed: "we were attracted to meridian on the strength of a track record"
```

**The span the validator enforces comes from the evidence finding, but the edit
was authorised by an editorial directive naming a different span.** The evidence
`partial` covers only the tail of the sentence; the directive covers the opening.
The inverted span rule, built to stop the model straying while acting on evidence,
has no notion that a directive can license a region of its own.

The fix is to let the permitted region be the union of the evidence unsupported
span and the directive's named span. **It is not made here.** Widening what the
validator will accept has fidelity consequences beyond what this spec states, and
this spec asked for the measurement, not the change. With it, stage 1 would be
32/42 against 29/42 — better, but still not materially so.

### The one durable difference, which is consistency rather than rate

**Stage 1 was identical on all three runs of every fixture.** The whole-draft path
was not: r10-review1 scored 4, 4, 3 within a single round, and 33/42 in an earlier
round against 29/42 in this one — same seeds, same temperature, same fixtures.

So the honest statement is narrower than "follows directives more reliably". It is
**"follows directives at the same rate, but does the same thing every time"**. For
an operator that is worth something, and it is consistent with 8145ef3's finding
that prose from the whole-draft path is not stable. It is not, on its own, worth
an architecture.

---

## A defect found and fixed mid-measurement

The first Part 3 round returned **OLD 33/42, NEW 27/42** — stage 1 materially
*worse*. Three directives were never even sent to the model, all on the author's
own sentences (`marketing_language_excess` and `voice_consistency` on r10-review1
S1 and S7).

`runStage1` checked the author exemption **before** the send gate. The exemption
answers an evidence question — no supplied source speaks to the author's own
action, so keep and flag rather than edit. A directive is not an evidence finding:
it says the wording itself is wrong. The exemption had nothing to say about it and
was swallowing it anyway.

Reordered so the send gate runs first: a statement carrying a directive is sent
regardless of the exemption, and the span constraint still confines the edit. The
exemption is unchanged where there is no directive. Two tests lock both sides.

This moved NEW from 27/42 to 30/42 and is the difference between reporting that
stage 1 is worse at directives and reporting that it is level.

---

## PART 2: fixtures regenerated, directives 2 → 14

Three of the four committed Review artefacts ran with
`editorialEnabled: false, complianceEnabled: false`. Each was re-reviewed with
both switched on and **nothing else changed**: the draft and the sources were read
back out of the artefact itself rather than from a generator script, so
`suggest-after-r10-review2` — whose draft was produced by a Suggest call in the
middle of a chain — was reproduced without re-running that chain and without the
draft drifting.

| artefact | editorial | compliance | with a `suggestedDirection` | statements |
| --- | ---: | ---: | ---: | ---: |
| suggest-after-r10-review1 | 0 → **5** | 0 → 0 | 0 → **5** | 10 → 10 |
| suggest-after-r10-review2 | 0 → **3** | 0 → 0 | 0 → **3** | 10 → 10 |
| condition-b-review | 0 → **4** | 0 → 0 | 0 → **4** | 10 → 10 |
| coverage-gap-review | 2 | 0 | 2 (unchanged) | 6 |
| **total directives** | | | **2 → 14** | |

All three returned HTTP 200 with the same statement count. No compliance concerns
were raised on any artefact, which is why the corpus is entirely editorial.

**Evidence verdicts that moved: 0.** Every statement in all four artefacts carries
the same evidence verdict and kind as before. That is the expected result —
switching editorial on should not touch the evidence pipeline — and it is now
checked rather than assumed.

---

## COST

| item | cost |
| --- | ---: |
| Part 2, 3 Reviews with editorial and compliance on | ~$1.50 estimated, ceiling $2.00 |
| Part 3, first round (pre-fix) | $0.1562 |
| Part 3, final round | $0.1492 |
| **total** | **~$1.81** |

Part 1 cost nothing: the sweep is pure probing with no model calls, and runs in
under a second via `--part1`.

---

## Recommendation

The rebuild's case is now thinner than it was at 2528a32, not thicker.

- The equity cheque went with the silence work.
- Conflicts were already handled by the whole-draft path.
- **Directives are level across 14 cases.**

What remains for stage 1 is run-to-run determinism, structural rather than
requested guarantees on silence, and lower cost — real, but a different and
smaller argument than the one the rebuild was started on. I would not switch
production over on this evidence. If the span-union fix is made, the directive
number is worth re-taking once; if it still lands near level, the architecture
question should be closed.

Separately and independently of any of that, **Part 1's site 7 should ship.** A
client being told its supported statement is unsupported, because its own name
opens the sentence, is a live correctness fault in Review, and it has nothing to
do with whether stage 1 is ever enabled.

---

## Changes

- `lib/qc/first-person-actor.mjs`: `isAuthoringOrganisationName`, the shared
  primitive, with the semantics `namedThirdPartiesIn` established.
- `lib/qc/evidence-relationship.mjs`: the corroboration anchor skips the author.
- `lib/qc/materiality.mjs`: `named_person_entity_attribution` no longer fires on
  a statement naming only the author.
- `lib/pr9-deterministic-unsupported-removal.mjs`: the author's own name is not a
  checkable particular, matching the existing first-person filter.
- `lib/revise-stage1.mjs`: the send gate runs before the author exemption, so an
  editorial directive is not swallowed; `OUTCOME_AUTHOR_EXEMPT` re-exported.
- Tests in `first-person-actor`, `materiality`,
  `pr9-deterministic-unsupported-removal`, `revise-stage1`, and a new
  `evidence-relationship-author-anchor` suite.
- Three Review fixtures regenerated with editorial and compliance enabled.

Stage 1 remains behind `perStatementRevise`. Production is unchanged.
Suite: 763 passing.
