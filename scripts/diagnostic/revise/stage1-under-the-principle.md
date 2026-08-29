# Does per-statement revision still earn its place under the principle?

Model `gpt-5.1-2025-11-13`, temperature 0, three runs per arm per fixture.
Both fixture families, same committed Reviews, no Review re-run.
Harness `stage1-under-the-principle.mjs`, raw data `stage1-under-the-principle.json`.

---

## VERDICT: MIXED, and the half that holds is the directive half

Taking the spec's own bar literally, `BUILD ON` requires stage 1 to act on
**conflicts and directives** more reliably. It does not clear that bar, because
the whole-draft path already handles conflicts perfectly and there is nothing
left to improve there.

**The half that holds.** On editorial directives stage 1 is decisively better:
the causal-overreach instruction on the diligence sentence was followed **3 of 3
on stage 1 against 0 of 3 on the whole-draft path** in this measurement, and 1
of 3 at 61768a2. That is correct behaviour applied consistently instead of by
chance, and it is the proof point the spec nominated.

**The half that does not.** On conflicts the two arms are indistinguishable:
both took the source's value **3 of 3**. The whole-draft path never had a
conflict problem, so the rebuild cannot claim ground there.

**Two findings the spec did not ask for, both favouring stage 1.**

- **Stage 1 is cheaper on both fixtures**, materially so on R10: $0.0063 against
  $0.0206, a 69% saving, because the restriction cut the R10 send count from 8
  statements to 1. Cost was the standing objection to per-statement calls and
  under the principle it is now an argument *for* them.
- **The whole-draft path still substitutes on silence.** On one R10 run it
  rewrote the silent statement "a track record that is, in our view, genuinely
  exceptional" into "a track record of 2.4x realised gross MOIC and 21% gross
  IRR on fully realised deals", pulling figures from a *different* statement's
  source. The prompt change at a5be4f0 reduced this but has not eliminated it.
  Stage 1 cannot do it, because the statement is never sent.

**Recommendation: build on, with the scope stated honestly.** The case is no
longer "stage 1 fixes what the whole-draft path cannot". It is "stage 1 makes
editorial directives deterministic, makes silence structurally untouchable
rather than merely discouraged, and costs less". That is a narrower claim than
cd9a666 made, and it rests on a thin evidence base — **one distinct conflict and
two distinct directives across the whole committed corpus**. Before switching
production over, the corpus needs more directive cases.

---

## CONFLICTS

Meridian carries no conflict finding. R10 carries one.

| fixture | arm | conflict | acted on with the source's value |
| --- | --- | --- | ---: |
| R10 | OLD | S4 "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR." | **3/3** |
| R10 | NEW | S4 (same) | **3/3** |

The conflict is not numeric. The source says Fund IV *"is currently marked at* 1.9x
gross MOIC and 24% gross IRR"; the draft claimed it *"has returned"* them, asserting
realisation where the source records an unrealised mark. Both arms adopted the
source's framing and kept both figures intact on every run:

- OLD: "Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR."
- NEW: "Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR."

No hedge on either arm. The percent notation differs, which is a house-style
normalisation and not a behaviour difference.

**Nothing to build on here.** This is the clearest evidence in the measurement
that the rebuild's original justification has gone.

---

## DIRECTIVES

Both directives sit on the Meridian fixture. R10 carries none.

| fixture | arm | directive | span named | followed |
| --- | --- | --- | --- | ---: |
| MERIDIAN | OLD | `marketing_language_excess` | "highly regarded" | 3/3 |
| MERIDIAN | NEW | `marketing_language_excess` | "highly regarded" | 3/3 |
| MERIDIAN | OLD | `overreach_unsupported_causal` | "enabled deep insight during the diligence phase" | **0/3** |
| MERIDIAN | NEW | `overreach_unsupported_causal` | "enabled deep insight during the diligence phase" | **3/3** |

The deletion directive is followed reliably by both arms. The rewrite directive
is where they part.

On the whole-draft path the diligence sentence came back untouched on all three
runs of this measurement, and on two of three at 61768a2. The instruction is
present in the prompt and is simply not reached — it competes with every other
statement in a single call.

On stage 1 the sentence is its own call, and the instruction is the only thing
in the kind-handling block. It was followed every run, landing on the same edit
each time:

> This relationship **provided additional context** during the diligence phase.

This is the reference case the spec named, and it is the measurement's one
unambiguous result.

---

## SILENCE

| fixture | arm | preserved on every run | substitutions on silence |
| --- | --- | ---: | ---: |
| MERIDIAN | OLD | 3/3 | 0 |
| MERIDIAN | NEW | 2/3 + 1 mixed (see below) | 0 |
| R10 | OLD | 5/7 | **1** |
| R10 | NEW | **7/7** | 0 |

**The Meridian 2/3 is the mixed statement, and it is correct.** S5, the diligence
sentence, is the one statement in the corpus that carries a silence finding *and*
a directive. Stage 1 sends it on the directive and leaves the silence alone: the
edit lands inside "enabled deep insight during the diligence phase", the span the
editor named, and nothing else in the sentence moves. No figure was introduced.
The other two Meridian silence findings, S0 and S1, are untouched 3/3 on both arms.

**The R10 5/7 is a real leak on the whole-draft path.** Two silent statements
moved, and one of them gained figures the author never wrote, taken from another
statement's source. Stage 1 held all seven, because three were withheld as
`silence_flagged_not_sent` and four were withheld as author exemptions — seven
statements, zero model calls, zero opportunity to drift.

Registers on the withheld statements were LOUD, LOUD, QUIET as expected.

---

## FIDELITY AND NOTES

**Fidelity: zero on both arms.** No named entity, date or figure appears in a
revised draft that is absent from both the original and the reviewer's sources.
The R10 substitution above is not an invention in this sense — "21%" does exist
in the review card — which is exactly why it is reported under SILENCE instead.
It is a correctly-sourced figure attached to a statement no source spoke to.

**Notes: zero on both arms.** No note describes a change outside its own span,
and no note claims a change the span alignment calls unchanged. The span-leak fix
at 8145ef3 is holding.

Prose and marker structure were scored separately from note text. Prose was
byte-stable across all three runs on both NEW arms and on Meridian OLD; R10 OLD
was not stable, varying at the two silence statements above.

---

## COST

| fixture | arm | calls (3 runs) | cost | cache hit |
| --- | --- | ---: | ---: | ---: |
| MERIDIAN | OLD | 3 | $0.0135 | 97% |
| MERIDIAN | NEW | 6 | **$0.0117** | 96% |
| R10 | OLD | 3 | $0.0206 | 98% |
| R10 | NEW | 3 | **$0.0063** | 96% |

Total $0.0521.

Stage 1 is cheaper on both fixtures despite making twice as many calls on
Meridian. Two reasons: the restriction removes most statements from the call set
entirely, and the shared prefix caches at 96%, so the marginal statement costs
little more than its own tokens. A whole-draft call re-reads and re-emits the
entire draft every time regardless of how few statements are flagged, which is
why R10 — one sendable statement out of eight concerns — is where the gap is
widest.

---

## PART 0

### a) The gate as it stood

`runStage1` filtered on one thing only: `authorStatementExemption`. Everything
that survived it was sent, silence included. Confirmed against the corpus — 16
of 16 non-exempt concerns were sent, of which 12 rested purely on silence.

### b) Distinguishing a source-stated finding from a silent one

`findingRestsOnSilence` from a3ed7d6 is reusable unchanged, and it does classify
the PARTIAL case correctly. The `sourcePassage` / `sourceLabel` test at line 139
runs *before* the `kind === "partial"` branch, so a partial where the source
states a competing value returns `silence: false` and is sent.

One caveat worth recording: that test asks whether a source spoke about the
*statement*, not specifically about the *unsupported element*. A partial whose
source passage addresses only the supported half would be sent unnecessarily.
No such case exists in the committed corpus — in fact **zero** partial-with-
stated-value cases exist at all, so this branch of the restriction is currently
carried by construction rather than by evidence.

### c) Mixed statements

**Exactly one** across all four committed artefacts: Meridian S5, the diligence
sentence. Its evidence finding is `unsupported` and rests on silence; it also
carries the `overreach_unsupported_causal` directive.

The span constraint confines the edit through the directive's own quoted span
rather than through `unsupportedSpans`, which is empty here. The measured edit
touched only "enabled deep insight during the diligence phase" on all three runs.
`tests/revise-stage1.test.mjs` asserts the harder synthetic case directly: a
statement sent on a directive whose model reply also strips the silent equity
cheque is rejected with `changed_text_outside_unsupported_span`, and the silent
element survives.

### d) Send counts, before and after

| artefact | concerns | sent before | sent after |
| --- | ---: | ---: | ---: |
| suggest-after-r10-review1 | 8 | 6 | **1** |
| suggest-after-r10-review2 | 3 | 3 | **0** |
| condition-b-review | 3 | 3 | **1** |
| coverage-gap-review | 4 | 4 | **2** |
| **total** | 18 | **16** | **4** |

A 75% reduction in model calls. This is the cost answer, and it is what makes
stage 1 cheaper than the whole-draft path rather than merely comparable.

### e) What else would make this wrong

1. **The evidence base is thin.** One distinct conflict, two distinct directives.
   The 3/3-against-0/3 directive result rests on a single sentence. It is
   consistent with 61768a2's independent 1-of-3, which raises confidence, but it
   is not a corpus.
2. **The whole-draft path handles conflicts perfectly**, so the restriction
   removes the rebuild's advantage rather than sharpening it.
3. **A defect was found and fixed mid-measurement.** See below; the first run of
   the harness reported directives 0/3 on NEW because of it, which would have
   produced the wrong verdict.

---

## Defect found and fixed during the measurement

The first pass showed stage 1 following the causal directive **0 of 3**, with a
validator rejection on every run. The reason:

```
rejected | introduced_fact_absent_from_statement_and_source
detail:  | not in statement or source: Partners Group
```

The model had correctly rewritten the sentence as "This relationship supported
**Partners Group's** work during the diligence phase" — naming the actor where
the original said only "this relationship", which is what house style asks for.
`checkNoInventedFacts` compares against the statement plus the sources only. It
never sees the rest of the draft, so it called the client's own name an
invention and threw away a correct edit.

This is the same class of bug as the third-party fix in `revise-flag-register.mjs`:
**the author is not an outside party**. `checkNoInventedFacts` now takes the
configured `authoringOrganisation` as known, threaded from `runStage1`. Two tests
lock it: the author's own name is accepted, an invented third party
("Blackstone") is still rejected.

Had this not been caught the measurement would have returned STOP HERE on a bug
rather than on the architecture.

---

## Changes

- `lib/revise-stage1.mjs`
  - `stage1SendDecision` and `directivesOn`: the restriction. A statement is sent
    only where a source stated a competing value, or an editor gave an explicit
    instruction.
  - `OUTCOME_SILENCE_NOT_SENT` (`silence_flagged_not_sent`): a distinct outcome,
    countable apart from a refusal and from an author exemption. The statement
    gets its LOUD or QUIET register note and its prose is left byte-identical.
  - `checkNoInventedFacts` accepts the authoring organisation as known.
- `tests/revise-stage1.test.mjs`: gate tests, the mixed-statement span assertion,
  and the two author-name fidelity tests. Assembly fixtures now use sendable
  concerns, since the bare equity-cheque fixture is a silence case and is
  deliberately never sent.

Stage 1 remains behind `perStatementRevise`. Production is unchanged.
Suite: 746 passing.
