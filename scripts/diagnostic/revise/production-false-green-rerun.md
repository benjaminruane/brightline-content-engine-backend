# False green, rerun against the committed production fixtures

Commit:
`chore(revise): rerun the false green diagnosis against the committed production fixtures`

Diagnostic only. No production code changes. No prompt changes.

Supersedes Part 1 of `2dcc796`, which ran on a reconstructed draft and is void.

Artefacts:

- `scripts/diagnostic/revise/production-false-green-rerun.mjs`
- `scripts/diagnostic/revise/production-false-green-rerun.json`
- Fixtures, committed by Ben and used unmodified:
  `scripts/diagnostic/revise/fixtures/meridian_production_{original,revised,source}.txt`

---

## Fixture assertions, run before any model call

| Assertion | Result | Detail |
| --- | --- | --- |
| original length is 1087 | **PASS** | file is 1091 chars; 4 trailing newline chars trimmed, nothing else touched |
| revised length is 1000 | **PASS** | byte for byte, untouched |
| `revised[994:999] === "funds"` | **PASS** | the production CUT marker anchor |
| `revised[544:757] === ` target sentence without its full stop | **PASS** | 213 chars, ends `…approach to value creation` with no period |

All four pass. The fixtures are the production documents. The 1087 figure is
reached by trimming trailing whitespace only; the directory was also renamed
from `Fixtures/` to `fixtures/` to match the spec path.

---

## PART 1 VERDICT: CANNOT REPRODUCE

Neither arm matches the production result. On the byte-exact production
original, Review returns **`supported_full`, 3 of 3, with `unsupportedSpans`
empty**. Production returned `supported_partial` on that same document with the
span `"Partners Group was attracted to this investment given Meridian
Capital's"`. The revised arm matches production (`supported_full` 3 of 3), but
that is not worth much when the original arm does not.

Per the spec I stopped here rather than measuring further. **Something differs
between the fixture path and the production path, and that is the finding.**

Note what this rules out. It is not the draft text: the fixture is the
production document, verified to the character. It is not instability: six runs
returned the same verdict, the same fingerprint and near-identical reasoning.
Whatever produced the production `supported_partial` is in the request, not in
the document.

### Where the two paths differ

The diagnostic sends the shape the other `scripts/diagnostic/revise/` scripts
use. The app sends something materially different
(`brightline-content-engine-frontend/src/hooks/useDraftState.jsx:909-921`):

| Field | App sends | This diagnostic sent |
| --- | --- | --- |
| output type | `selectedTypes` (array, user's picker) | `outputType: "reporting_commentary"` |
| version | `versionType` | `requiredVersion: "complete"` |
| enable flags | top level `evidenceEnabled` / `editorialEnabled` / `complianceEnabled` | nested under `options` |
| web | `publicSearch`, `web: { enabled, mode }`, `engine` | not sent |
| banned words | `bannedWords` when configured | not sent |
| authoring org | not sent; backend resolves it | `authoringOrganisation: "Partners Group"` |

The backend normalises most of this — `resolveOutputType` reads
`options.outputType`, then root `outputType`, then `selectedTypes[0]`
(`api/analyse-statements.js:47-52`), and `requiredVersion` falls back through
`versionType` (`:204-211`) — so the *shape* is tolerated. The **values** are
not the same. `"reporting_commentary"` is a guess on my part; the production run
used whatever was in the picker, and output type feeds prompt and style
resolution.

The cheapest way to close this is not another sweep. It is one fact from the
production run: the `outputType` (or `selectedTypes[0]`), `versionType`, and
whether web was on. With those three values the same six Reviews will either
reproduce the `supported_partial` or prove the request is not the cause either.

### Per-run results

Target sentence, both arms, all six runs:

| Arm | Run | supportState | displayVerdict | unsupportedSpans | Stage 2 (source 0) | systemFingerprint | traceId |
| --- | --- | --- | --- | --- | --- | --- | --- |
| original | 1 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `9a045f10` |
| original | 2 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `3f2f3c80` |
| original | 3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `c18544ed` |
| revised | 1 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `480573b4` |
| revised | 2 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `54b273d4` |
| revised | 3 | `supported` | `supported_full` | `[]` | `confirmed` | `fp_1a8e2a470b` | `5ac0ed35` |

`reasoningParagraph`, identical in five of six runs (run `revised/r3` differs
only by two instances of the word "its"):

> The source confirms the statement by highlighting Meridian Capital's strong
> track record, stable and experienced investment team, and disciplined approach
> to operational value creation. These factors align with the reasons Partners
> Group was attracted to the investment.

Statement 0, the control, both arms, all six runs `partial` /
`supported_partial` / `concernLevel: moderate`, with the whole sentence as the
span:

```json
[{"sourceRefId":0,"statementId":"0","classification":"partially_confirmed",
  "text":"In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund from Meridian Capital targeting lower-mid-market buyouts in European industrial technology and business services companies.",
  "start":0,"end":226}]
```

Stage 2 `partially_confirmed`, fingerprint `fp_1a8e2a470b`, 6 of 6. Reasoning,
representative:

> The source confirms the fund's target size of EUR 1.2 billion and its strategy
> of targeting lower-mid-market buyouts in European industrial technology and
> business services companies. However, it does not mention Partners Group's
> commitment or specify the month of June 2026. Additionally, the source
> indicates a first close expected in Q3 2026, which does not align with the June
> 2026 date in the statement. Please verify these details or adjust the statement
> accordingly.

So the control behaves exactly as production described it: statement 0 stays
flagged for unsourced Partners Group involvement, on both arms. Only the target
sentence fails to reproduce.

### Stage 2 stability

| Arm | Target Stage 2 | Target verdict | Statement 0 verdict |
| --- | --- | --- | --- |
| original | **3 of 3** (`confirmed`) | 3 of 3 (`supported_full`) | 3 of 3 (`supported_partial`) |
| revised | **3 of 3** (`confirmed`) | 3 of 3 (`supported_full`) | 3 of 3 (`supported_partial`) |

Zero verdict variance on either arm. Reasoning prose wobbles slightly (two
distinct target wordings, four distinct statement-0 wordings across six runs)
but never changes a classification, a span or a fingerprint.

### On the cheaper Stage 2 option

Stage 2 alone would have cost roughly a tenth of this and was not taken:
`supportState`, `displayVerdict` and `unsupportedSpans` are produced downstream
of Stage 2 by aggregation, and those are the fields the verdict turns on. Six
full Reviews were run. As it happens Stage 2 alone would have been actively
misleading here, since Stage 2 returns `confirmed` 6 of 6 while the question is
why the aggregate ever said `partial`.

---

## PART 2: THE NINE FALSE NOTES, DATED

`ade84fc` *fix(revise): repair marker honesty policy so notes and intent tell the
truth* was committed **2026-08-27 14:27:44 +0800** (06:27:44 UTC). Each artefact
is dated by its own `ranAt`, which is when the Suggest actually executed, with
the commit that added it alongside.

| Artefact | Marker | `ranAt` (UTC) | Added by | honestyEvents in that run | Status |
| --- | --- | --- | --- | --- | --- |
| `suggest-after-r10-suggest2.json` | #0 | 06:11:17 | `25ae739` | 0 | **historical** |
| `condition-a-suggest.json` | #0 | 08:37:55 | `52b469f` | 1 | live |
| `reviser-noise-floor-run3.json` | #0 | 09:09:21 | `18ac825` | 2 | live |
| `reviser-noise-floor-run3.json` | #4 | 09:09:21 | `18ac825` | 2 | live |
| `deterministic-removal-off-run1.json` | #0 | 10:43:37 | `fae582f` | 2 | live |
| `deterministic-removal-off-run2.json` | #0 | 10:43:41 | `fae582f` | 0 | live |
| `deterministic-removal-off-run3.json` | #0 | 10:43:47 | `fae582f` | 1 | live |
| `deterministic-removal-on-run1.json` | #0 | 10:43:53 | `fae582f` | 1 | live |
| `deterministic-removal-on-run3.json` | #0 | 10:44:01 | `fae582f` | 1 | live |

**1 historical, 8 live, of 9.**

The eight live ones are not a case of the repair being absent. Six of the eight
runs emitted honesty events of their own (`note_intent_mismatch`, and one
`remnant_missed_edit`), so `applyMarkerHonestyCheck` was in the path, fired on
other markers in the same response, and passed these. That is consistent with
the production run of 2026-08-27, where two notes of this shape *were* caught
and rewritten to "Left this wording as written".

The distinction is which contradiction fires. The repair keys on intent versus
span status (`lib/pr9-marker-honesty.mjs:441-447`): a `CHANGED` marker on a span
that did not move is caught. These eight survive because the marker's aligned
region *did* move — it overlaps neighbouring words that changed — while the
sentence the note names is untouched. The check asks whether the span moved; it
cannot ask whether `'lead commitment'`, which the note says was removed, is
still sitting in the sentence.

So: 8 live defects, and the honesty repair is working as designed on a different
failure than the one they represent.

---

## Cost

| Item | Cost |
| --- | ---: |
| Part 1, six live Reviews | about $0.60 |
| Part 2, git metadata and artefact reads, zero model calls | $0.00 |
| **Total** | **about $0.60** |

---

## Summary

**Technical.** Added `scripts/diagnostic/revise/production-false-green-rerun.mjs`.
It asserts the four fixture properties (1087 / 1000 / `revised[994:999] ===
"funds"` / `revised[544:757]` is the target sentence less its full stop) and
aborts before any model call if one fails; all four pass. Part 1 ran six live
Reviews against `/api/analyse-statements`, three per arm, on the committed
fixtures. Part 1 verdict is **CANNOT REPRODUCE**: the original arm returns
`supported_full` 3 of 3 where production returned `supported_partial` with a
span. Stage 2 is `confirmed` 3 of 3 on each arm; statement 0 is
`supported_partial` 3 of 3 on each arm, matching production. Part 2 dates the
nine FALSE notes from `2dcc796` against `ade84fc` by artefact `ranAt`: 1
historical, 8 live, with evidence that the honesty check ran in six of the eight
live runs and passed them anyway. Directory renamed `Fixtures/` to `fixtures/`.
No production code or prompt files touched. Outputs
`production-false-green-rerun.json`.

**Plain language.** Running Review on the exact document from the live run does
not reproduce what the live run reported: the sentence comes back fully
supported every time, where production had flagged part of it. The document is
verified correct, and Review is completely stable across six runs, so the
difference has to be in how the app asks the question rather than in the text
itself — most likely the document type selected in the picker, which I had to
guess. Separately, of the nine notes that claim to have deleted text still
present in the draft, eight are current defects rather than old ones, and the
honesty check that was supposed to catch that shape ran on most of them and let
them through.
