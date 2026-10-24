# B416. One way to locate a statement

No model call. USD 0.

`lib/qc/locate-statement.mjs` is the only search for a statement in a draft. It walks the statements in order, takes the next unused occurrence, and returns null when the statement is not there. Exact text is tried first. Whitespace is then collapsed with the same `collapse` the apply matcher uses. A returned span always satisfies `collapse(draft.slice(start, end)) === collapse(statement)`.

## The separator

Two strings were in use.

The position stored on the card was computed in the draft the reader submitted. On the HICL reviews the gaps between one statement's end and the next statement's start are 1, 2, 1, 1, 2, 1, and 3 characters. Placing each statement at its stored span, and filling the gaps with newlines, reproduces that draft. Every stored span's slice is the statement. 8 of 8.

The other string joins the statement texts with one newline. `attachReadingView` builds it for the reading note, and `scripts/diagnostic/b403c/measure.mjs` builds it the same way. The B415 count used it. The stored spans are positions in the other draft. Against this join, 2 of 8 slices are the statement. S0 and S1. S2 to S6 are shifted. S7 runs past the end. The same 2 of 8 holds for the clean review.

The draft the reader edits is the authority. A position is an offset in that string. A span from one string is not applied to the other.

`attachReadingView` still joins with one newline. That string is the document handed to element extraction and the writer note. It is not used to set `draftSpan` or to shift a mark. This spec does not change it, because that would change which elements are read, and this spec adds no findings.

## L1. How many locate

HICL doctored: 8 of 8. HICL clean: 8 of 8. The previous count was 2 of 8, which was the stored span read against the single-newline join.

The locator finds all 8 in the reader's draft and all 8 in the join. In the reader's draft the span is the stored span. In the join it is a different span, and the slice is the statement.

## L2. What still does not locate

None of the sixteen HICL statements. None of the statements in the other six stored runs, located in the draft rebuilt from their stored spans.

## L3. Word marks

On the reader's draft, no word mark moves. The located span is the stored span on all eight stored runs, so the shift is the same number. B410's surface check still drops none on all eight runs.

A mark list built against the single-newline join would sit at that string's offsets. That join is not the draft the reader edits.

## L4. Stored draftSpan and stored decisions

Locating the eight stored reviews again, in the draft rebuilt from their spans, returns the same start and end on every statement. The files are not rewritten.

A stored decision does not hold a draft offset. `thing1.startChar` and `thing1.endChar` are offsets inside the statement. A substitution is the same. Apply no longer reads `draftSpan`. It locates the statement text. Those decisions still name the same sentence.

## Callers

`locateStatementAt` and `locateStatements` are the same search. One is a single statement. The other walks the list and consumes as it goes.

- `lib/revise-actions/apply.mjs`. Writes are placed by the walk. A stored offset is not preferred. A repeated sentence goes to the next unused occurrence. A sentence that occurs in the draft is not reported as missing when the unused occurrence is already taken.
- `lib/qc/draft-marks.mjs`. Marks are shifted by a locate in the draft they are checked against. The stored `draftSpan` is not the coordinate system.
- `lib/qc/pipeline-v4/stage1-extract-statements.mjs`. The distance-2 window is gone. A statement that is not in the draft after whitespace collapse fails validation, and the existing fallback runs. The statement text stored is the draft slice.
- `lib/qc/pipeline-v3/stage1-extract-statements.mjs`. The distance-5 window is gone. Same fallback. Whitespace collapse still matches.
- `lib/qc/reading-review.mjs`. An unchanged statement uses the locator's end. A changed statement's new text is located in the draft, skipping spans already taken. A whitespace-only difference is the same statement.
- `lib/qc/pipeline-v4/index.mjs`, frozen statements only. A frozen statement that is not in the draft throws. The offset on the frozen row is not used.

Not a statement search, and not switched:

- `lib/qc/claim-spans.mjs` locates a claim inside a statement, then adds the statement start.
- `assembleCard`, draft coverage, and quote location copy a span. They do not search.
- `draftFromStatementSpans` reads a stored span to rebuild a draft. It does not search.

## Ledger

Recounted from `scripts/diagnostic/b403c/runs/reading.json`. The stored statement text did not change. No statement moved.

Clean: demands 3, light 5, quiet 30, noise in demands 0.

3i clean 1, 1, 13. HICL clean 2, 1, 5. GPI clean 0, 1, 4. ClearPoint clean 0, 2, 8.
