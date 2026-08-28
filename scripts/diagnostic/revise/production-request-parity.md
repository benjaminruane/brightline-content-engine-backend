# Production request parity, and where the paths actually diverge

Commit:
`chore(revise): reproduce the production Review using the captured app request payload`

Diagnostic only. No production code changes. No prompt changes.

Artefacts:

- `scripts/diagnostic/revise/production-request-parity.mjs`
- `scripts/diagnostic/revise/production-request-parity.json`
- `scripts/diagnostic/revise/fixtures/meridian_production_request.json`, used verbatim

Payload checks before measuring: the captured `draftText` is 1087 chars and is
**identical** to the committed original fixture with trailing whitespace
trimmed. The revised arm swapped `draftText` only; every other field untouched.

---

## FIELD DIFF: captured app request vs the previous diagnostic

| Field | App request | Previous diagnostic (`2c17fbb`) |
| --- | --- | --- |
| `selectedTypes[0]` | `reporting_commentary` | absent |
| `versionType` | `complete` | absent |
| `outputType` | absent | `reporting_commentary` |
| `requiredVersion` | absent | `complete` |
| `versionId` | `assess-session-v1` | absent |
| `evidenceEnabled` (top level) | `true` | absent |
| `editorialEnabled` (top level) | **`true`** | absent |
| `complianceEnabled` (top level) | **`true`** | absent |
| `options.evidenceEnabled` | absent | `true` |
| `options.editorialEnabled` | absent | **`false`** |
| `options.complianceEnabled` | absent | **`false`** |
| `options.pipelineRoute` | absent | `v4` |
| `authoringOrganisation` | absent | `Partners Group` |
| `sources[0].id` | `assess_src_1787905277301_3b448370caf1f8` | absent |
| `sources[0].kind` | `file` | absent |
| `sources[0].publicationState` | `restricted` | absent |
| `sources[0].name` | `meridian_source_production.txt` | `meridian_production_source.txt` |
| `sources[0].title` | `meridian_source_production.txt` | `Meridian Fund V summary` |
| `sources[0].label` | absent | `Meridian Fund V summary` |
| `sources[0].sourceType` | absent | `uploaded` |

Two differences the previous pass had not identified: the app runs Review with
**editorial and compliance enabled**, where the diagnostic disabled both, and
the app does **not** pin `options.pipelineRoute`, so routing depends on the
`QC_PIPELINE_V4` env var (`api/analyse-statements.js:240-241`).

---

## PART 1 VERDICT: STILL CANNOT REPRODUCE

Six Reviews with the captured payload sent verbatim:

| Arm | Run | supportState | displayVerdict | unsupportedSpans | Stage 2 | systemFingerprint | traceId |
| --- | --- | --- | --- | --- | --- | --- | --- |
| original | 1 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | see JSON |
| original | 2 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | see JSON |
| original | 3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | see JSON |
| revised | 1–3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | see JSON |

Runs on the original arm carrying the production span
`"Partners Group was attracted to this investment given Meridian Capital's"`:
**0 of 3.**

Statement 0 reproduces production on both arms, 6 of 6: `partial` /
`supported_partial` / `concernLevel: moderate`, Stage 2 `partially_confirmed`,
with the whole sentence as the span. The control is exact. Only the target
sentence fails.

The request was not the cause. Nine measured runs across two request shapes now
agree, and the shapes disagree on eleven fields including editorial and
compliance enablement.

**Part 2 was skipped**, as the spec directs: field isolation is only meaningful
once parity is achieved, and flipping fields one at a time against a result that
never moves would measure nothing. The original question — does removing "and
highly regarded" flip the verdict — remains unanswerable, because the
`supported_partial` starting state cannot be produced.

### Trace: app request to the Stage 2 call, and where it diverges

Following the captured payload through the code:

1. `api/analyse-statements.js:204-211` — `requiredVersion` resolves from
   `body.versionType`. The app's `"complete"` is read.
2. `api/analyse-statements.js:211` → `resolveOutputType(body)` at `:47-52`
   reads `selectedTypes[0]`. The app's `"reporting_commentary"` is read. No
   `[langfuse] outputType missing` warning fired, so the hypothesis that the
   previous diagnostic's keys went unread and defaulted **is not what decides
   this verdict** — both shapes resolve to the same output type, which is why
   both produce the same result.
3. `api/analyse-statements.js:240-241` — route selection. Response
   `meta.pipelineVersion` is `v4` and `meta.stagesComplete` is 7, so v4 ran.
4. `lib/qc/pipeline-v4/index.mjs:247` — `stage2SpanEnabled` is on. Proven by
   statement 0 emitting a span in the same response.
5. `lib/qc/pipeline-v4/index.mjs:497` → `buildUnsupportedSpans(rowMatches)` at
   `lib/qc/pipeline-v4/stage2-match-sources.mjs:1533`. Line **1538** is the
   gate: `if (!isSpanElicitEligible(classification)) continue;`, and
   `SPAN_ELICIT_CLASSIFICATIONS` is `{partially_confirmed, conflicting}`
   (`:38`, `:110-114`). A `confirmed` row can never produce a span, and the span
   text itself (`row.unsupportedSpan`, `:1539`) only exists because a separate
   elicitation call is made for those two classifications.

So `unsupportedSpans: []` is not a span-layer failure. It is the correct,
deterministic consequence of Stage 2 returning `confirmed`.

**The other possible producer of a clause-level span is ruled out.** The
production span is a fragment of the sentence, not the whole sentence, which is
the shape claim decomposition produces. It did not run:

- The full card returned `decomposed: false`, `claims: []`,
  `sentenceSubclaimCount: null`.
- `lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs:259` gates decomposition
  on `isCompoundCandidate(text)`.
- Executing that predicate directly on the target sentence
  (`lib/qc/claim-spans.mjs:368-377`) returns **false** for both the original and
  the revised wording: two verifiable anchors, no relational connectives, and no
  additive boundary, so it fails at `:373`.

The current code therefore **cannot** emit the production span for this
sentence by either route, under any request.

### What that leaves

The divergence is a single point: the Stage 2 classification of the target
statement. It is `confirmed` in every run measured — twelve in `2c17fbb` and
this pass combined, plus one full-card capture — and production recorded
`partially_confirmed`.

Things now positively excluded: the draft (byte-verified), the source
(byte-verified, carried inside the captured payload), the request shape and
every field in it (used verbatim), the pipeline route, the span gate, the span
builder, and claim decomposition. Also excluded is code drift: `git log` shows
**no commits touching `lib/qc`, `api/analyse-statements.js` or
`lib/prompt-library` since the production run**. The six commits since are all
on the revise/Suggest path.

The one datum never captured from the production run is its own trace: the
`traceId` and the Stage 2 `systemFingerprint` for that statement. Ours is
`fp_1a8e2a470b` on all thirteen calls. Without production's, the question of
whether the model returned something different that day cannot be settled from
this side, and I am not going to guess a third time. That trace, from the
Langfuse run behind the 2026-08-27 Review, is the next thing to fetch.

---

## PART 3: STOP THIS RECURRING (proposal only, nothing implemented)

The apparatus defect is real even though it was not the cause here: five
diagnostics each hand-build a Review request, and three of the eleven fields
they differ on are ones that change behaviour. `run-suggest-after-r10.mjs:138-160`,
`run-condition-a-removal.mjs:207`, `run-condition-a-removal.mjs:246`,
`production-false-green-rerun.mjs:106-131` and
`production-request-parity.mjs` all construct their own body, and the first four
disagree with the app.

**Smallest change: one shared builder seeded from a captured payload.**

1. Add `scripts/diagnostic/lib/review-request.mjs`, exporting
   `buildReviewRequest({ draftText, sources, overrides })`. It loads a committed
   canonical capture as its base, applies only the caller's explicit overrides,
   and throws on an unknown override key so a typo like `outputType` instead of
   `selectedTypes` fails loudly instead of silently defaulting.
2. Promote `scripts/diagnostic/revise/fixtures/meridian_production_request.json`
   to `scripts/diagnostic/fixtures/canonical-review-request.json`, since it is
   not revise-specific.
3. Migrate the four call sites above to it. Each becomes two or three lines and
   the field diff between any two diagnostics collapses to what they explicitly
   intended to vary.
4. Add one test in `tests/` asserting the canonical capture still contains the
   keys the handler reads (`selectedTypes`, `versionType`, `sources[].text`,
   the three enable flags), so a future frontend rename is caught in CI rather
   than in a measured verdict.

Sequenced after step 1, a cheaper interim exists: have the builder log the
resolved body's key list on every diagnostic run. That alone would have surfaced
`editorialEnabled: false` versus `true` in this investigation without any of the
work above.

---

## Cost

| Item | Cost |
| --- | ---: |
| Part 1, six Reviews with the captured payload | about $0.60 |
| One extra Review to capture the full target card (`decomposed`, `claims`) | about $0.10 |
| Part 2 | $0.00, skipped |
| Part 3, code reading, zero model calls | $0.00 |
| **Total** | **about $0.70** |

---

## Summary

**Technical.** Added `scripts/diagnostic/revise/production-request-parity.mjs`,
which sends the captured app payload verbatim (revised arm swaps `draftText`
only) and emits a flattened field-by-field diff against the previous
diagnostic's body. Twenty-two fields differ, including top-level
`editorialEnabled`/`complianceEnabled` `true` versus `options.*` `false`, and
`options.pipelineRoute` absent versus `v4`. Verdict is **STILL CANNOT
REPRODUCE**: the original arm returns `supported_full` 3 of 3 with zero
unsupported spans, while statement 0 reproduces production 6 of 6. Part 2 was
skipped per spec. The code trace pins the divergence at the Stage 2
classification of the target statement: `buildUnsupportedSpans`
(`stage2-match-sources.mjs:1533-1552`) filters on `isSpanElicitEligible` at
`:1538`, so a `confirmed` row cannot produce a span, and claim decomposition,
the only clause-span producer, is rejected by `isCompoundCandidate`
(`claim-spans.mjs:368-377`) for this sentence, verified by direct execution and
by `decomposed: false` in the returned card. `git log` shows no commits to
`lib/qc`, `api/analyse-statements.js` or `lib/prompt-library` since the
production run. Part 3 proposes a shared `scripts/diagnostic/lib/review-request.mjs`
seeded from a promoted canonical capture, with strict unknown-key rejection. No
production code or prompt files touched.

**Plain language.** Sending Review the exact request the app sent, on the exact
document, still does not reproduce the flag the live run reported — the sentence
comes back fully supported every time, while the neighbouring sentence
reproduces perfectly. So it is not the wording of the request, and it is not the
draft. Reading the code shows the flag can only appear if the matching step
grades that sentence as partly supported, which it never does now, and the
grading code has not changed since the run. The remaining unknown is what the
model actually returned on the day, which needs the trace from the original live
run to settle.
