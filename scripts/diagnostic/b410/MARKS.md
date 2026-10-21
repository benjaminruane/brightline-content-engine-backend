# B410. One span list

Offsets are computed once, on the server. A fact's `start` and `end` are measured against the statement, and so are `thing1.startChar` and `thing1.endChar`. Both are shifted by that statement's `draftSpan`. The name extractor's span can include a possessive that its surface has already dropped. The mark then covers the surface, which sits at the front of that span. A mark whose `surface` is not `draft.slice(start, end)` is dropped and counted.

## Precedence

Where two marks overlap, `missing` wins over `concern`. A shorter span wins over a longer one that contains it. The same severity and the same span: the later mark is dropped. A partial overlap that is not containment, at the same severity, keeps both.

## HICL

Surface failures: none. The same check on the other six stored runs (3i, GPI, ClearPoint, clean and doctored) also dropped none.

HICL clean, 4 marks.

| Origin | Severity | Count | Surfaces |
|--------|----------|------:|----------|
| fact | missing | 2 | S1 `HCIL`, S2 `budgets` |
| action | concern | 2 | S1 `EBITDA growth driven by capital expenditure`, S6 `which will lead to a reduction in debt servicing costs` |

HICL doctored, 11 marks.

| Origin | Severity | Count | Surfaces |
|--------|----------|------:|----------|
| fact | missing | 10 | S0 `HCIL Infrastructure`, S0 `31 December 2025`, S1 `30%`, S1 `HCIL`, S2 `budgets`, S3 `Paris St. Germain High Speed`, S4 `St. Germain`, S5 `TowerCo`, S7 `CFO`, S7 `French` |
| action | concern | 1 | S6 `which will lead to an increase in debt servicing costs` |

## What left the screen

The Reading control and the Cards control. The reading view as a separate screen. Tier weights on those rows. Occurrence lists. Fact chips. The `Wording` marker on a row. Whole-statement tints on the draft, including green, and the phrase highlights a card click used to paint there.

The reading modules stay on disk. The existing reading-view test still renders them. They are not mounted.

The header counts and the footnote sit above the draft pane. The counts still include the words "wording notes", because those counts were kept. The draft itself is red for `missing` and amber for `concern`.

The source passage and the source panel still open from the card, on demand. The card was not redesigned.

## Re-check

No live refresh. The amber banner is the signal that a statement's text is no longer in the draft. The comparison is statement text, walked forward through the draft. A change to text outside the statements does not light it.

`Re-check what changed` sends those statements back. Fact matching runs again and costs nothing. The note runs again, one model call per changed statement. Every other statement keeps its facts, its note, its card and its decisions. Header counts are recomputed from the merged sentences. The banner clears when no statement is stale.

Two changed statements next to each other are refused. The error says to run Review. The new boundary between them is not guessed.

A stored reviewer decision whose statement text has changed is cleared, and that action row is removed. It quoted the old sentence. Decisions on statements whose text is unchanged stay, including accept and reject. The changed statement keeps its existing card verdict until a full Review. This pass does not re-run Stage 2 or the writer note.

Measured cost of re-checking one statement, HICL clean S2, `budgets` shortened to `budget`. Estimate before the call: USD 0.2453 list, one call plus one retry, 4049 input tokens at chars/4, output ceiling 4096, `claude-opus-4-7`, temperature omitted. The call was one. No retry. Input 5421, output 155, cached 0. List USD 0.030980. Discounted USD 0.030980. Opus has no cached rate. Artefact `scripts/diagnostic/b410/runs/recheck-one.json`.

## Callers

`buildDraftMarks` is new. These returns gain `draftMarks` beside the existing payload. Card fields are unchanged.

- `runPipelineV3` in `lib/qc/pipeline-v3/qc-pipeline-v3.mjs`. One return.
- `runPipelineV4` in `lib/qc/pipeline-v4/index.mjs`. Both returns, the evidence-skipped path and the main path.
- `api/analyse-statements.js` passes `draftMarks` through.
- `runActionList` in `lib/revise-actions/run.mjs` adds `draftMarks` and `droppedMarks`. `entries` is unchanged. Callers are `api/revise-actions.js`, the revise-action tests, and `scripts/diagnostic/b374/dump-proposals.mjs` and `scripts/diagnostic/revise/per-finding-action-list/first-live-run.mjs`. They read `entries`.
- `recheckStatements` in `lib/qc/reading-review.mjs` is new. Its caller is `api/recheck-statements.js`.

`NO_PROPOSAL` is unchanged. No proposal is enabled.
