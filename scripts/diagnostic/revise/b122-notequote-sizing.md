# B122 note_quote apostrophe truncation

Instrument only. Zero model calls. No production changes.
Harness `b122-notequote-sizing.mjs`.

## Scoreboard

```
note_quote spans scanned: 17
truncated (apostrophe closer or strict prefix of a quoted span in the same note): 1 of 17
files that carried note_quote: condition-b-review.json, coverage-gap-review.json, suggest-after-r10-review1.json, suggest-after-r10-review2.json
```

## B1. Where note_quote is derived

CONFIRMED: `lib/qc/editorial-compliance-reviewer.mjs` `deriveConcernSpan` (exported, L730-750).
It calls `extractQuotedSnippets` (L621-635) on the concern `note` with source `note_quote`, and on `suggestedDirection` with source `direction_quote`.
`attachConcernSpans` (L767-778) writes those spans onto editorial and compliance concerns.

The naive quote regex is L623:

```
/(["'])([^"']+)\1/g
```

`[^"']+` stops at the first apostrophe. Possessive `team's` closes the span at `The team`.

## B2. Does the same path produce evidence spans?

CONFIRMED: no. Separate path.

Evidence `unsupportedSpans` are built in `lib/qc/pipeline-v4/stage2-match-sources.mjs` `buildUnsupportedSpans` (L1533-1551) from Stage 2 match fields `unsupportedSpan`, `unsupportedSpanStart`, `unsupportedSpanEnd`. `lib/qc/coverage-union.mjs` (L123-145) walks the same Stage 2 offsets. `lib/qc/pipeline-v4/index.mjs` L497-499 attaches them on the card.

`extractQuotedSnippets` / `deriveConcernSpan` are not imported by the v4 pipeline or by `build-revision-prompt.mjs`. The reviser reads evidence spans via `extractUnsupportedSpansForRevision` (`lib/build-revision-prompt.mjs` L285-348), which never sees `note_quote`. Editorial spans are not copied into the prompt (`collectEditorialConcerns` L379-380 copies kind, rule, note, suggestedDirection only).

So this truncation does not bound what the reviser may edit, and it cannot flip supported to unsupported.

## B3. Exposure on stored rows

Denominator: every `source: "note_quote"` span on a qcCard in `scripts/diagnostic/revise/*.json` that has a statement array. That is the on-disk Review corpus this diagnostic folder holds. 17 spans.

Hits:

```
suggest-after-r10-review2.json S3 structural_integrity  span="The team"  [0,8]  beforeApostrophe=true  prefixOf="The team's stability, with no senior departures across the last three fund cycles."
```

Count: 1 of 17.

## B4. Cosmetic or serious

On the evidence, this is **cosmetic for Suggest and for evidence verdicts**, and **serious as a Review highlight defect on the cards it hits**.

It cannot turn unsupported into supported. It does not reach the reviser. Under the standing rule it is a backlog item, not a Suggest fix.

It is not nothing. On the structural_integrity card the UI is told to highlight `The team` (8 characters) for a finding whose note is about the whole fragment. A reviewer who trusts the highlight is looking at the wrong span. In this folder that happens on 1 of 17 note_quote spans. Do not inflate it into a pipeline bug, and do not shrink it into a non-issue for the Review workbench.

DO NOT FIX in this pass.
