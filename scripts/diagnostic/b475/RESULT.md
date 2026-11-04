# B475. The shared card assembly leaves the version folder

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0. The assembly was not run again, because that call can ask a model to judge a duplicate. The comparison is the card reading taken before the move against the same reading after it, plus the assembly function source.

Problems: none.

## The move

`lib/qc/pipeline-v3/stage7-assemble-card.mjs` is now `lib/qc/assemble-card.mjs`. Export names are unchanged: assembleCard, factualBadgeForStatement, statementIsFactualResidue, isRecoveryMayNotGreenEnabled, isUnbadgedResidueEnabled, RECOVERY_MAY_NOT_GREEN_FLAG, UNBADGED_RESIDUE_FLAG.

The relative imports inside the file were retargeted because the file moved up one directory. `../../observability.js` is now `../observability.js`. The other imports, which pointed at `lib/qc/`, now point at the same directory. No other line changed.

Assembly logic body, imports removed, sha256 before and after: e2542c930202f3d96ef97da592b9b994962206e66c247c9fad123e3338fd8151. Match: yes.

assembleCard function source sha256 before and after: dc48e4734e12b96f0af1a0aa6924d6d2ec212bab2aecf344ba1c26a75e7b3e0a. Match: yes.

## Cards

Cards read: 261.

The reading of displayVerdict, sentenceState, sentenceLabel, tier, the shown state, the shown label, the shown tier, and the reason, sorted by card, sha256 before the move: e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e.

The same reading after the move: e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e.

Byte-identical: yes.

Stored displayVerdict, sentenceState, sentenceLabel, and tier still equal the pass on 261 of 261.

Catch: 13 of 13. Group A: 11 of 11.

Evidence leave-alone 48 of 74. Combined quiet 30 of 74.

With the sentence label: evidence leave-alone 48 of 74. Combined quiet 30 of 74.

The six labels raised by B469, B470, and B473:

- 05:0: Conflicts with the source. Required: Conflicts with the source.
- 19:2: Conflicts with the source. Required: Conflicts with the source.
- 18:8: Conflicts with the source. Required: Conflicts with the source.
- 11:9: Needs a look. Required: Needs a look.
- 15:12: Needs a look. Required: Needs a look.
- 04:1: Conflicts with the source. Required: Conflicts with the source.

Outside this report, a search for the old filename finds: nothing. This report names the old path because that is the path that was moved.

## The two matcher files

Neither file was edited. Neither imports the other. The comment in `lib/qc/pipeline-v4/stage2-match-sources.mjs` still says to keep the file in sync with `lib/qc/pipeline-v3/stage2-match-sources.mjs` by hand.

| File | Exports |
| --- | --- |
| lib/qc/pipeline-v4/stage2-match-sources.mjs | SPAN_ELICIT_CLASSIFICATIONS, STAGE2_CONCURRENCY, STAGE2_SEED, applyEmptyConfirmationRefusal, applyPeriodGateBackstop, applyRoundingToleranceBackstop, applyUnsupportedSpanValidation, buildUnsupportedSpans, classifyNumericRelationship, collectBackstopFigures, fingerprintFromCompletion, getStage2SpanElicitPromptForTest, getStage2SystemPromptForTest, getStage2UnsupportedSpanMultiOccurrenceCount, getStage2UnsupportedSpanRejectionCount, getStage2UnsupportedSpanWholeCount, hasEgregiousMagnitudeGap, inferPeriodRole, isProceduralCloserStatement, isSpanElicitEligible, isStage2SpanEnabled, matchAllSources, matchClaimSourcePairs, normalizePassageForComparison, normalizePeriodToken, normalizeValidResponse, periodsDoNotOverlap, resetStage2PromptCache, resetStage2UnsupportedSpanRejectionCount, resetStage2UnsupportedSpanStats, resolvePassageAgainstSource, validatePassageAgainstSource, validateUnsupportedSpan |
| lib/qc/pipeline-v3/stage2-match-sources.mjs | matchAllSources |

Shared names: matchAllSources.

The shared export has already drifted. v3 `matchAllSources(statement, sources, options)` takes one statement string and returns an array of per-source results. v4 `matchAllSources({ statements, sources, traceId, stage2SpanEnabled })` takes many statements and returns `{ matches }`. The function source is not the same text: v3 is 4079 characters and v4 is 1278 characters. v4 reads `prompts/stage2_v4.md`. v3 keeps its prompt in the file. The gap was left open.

`tests/b475-matcher-export-parity.test.mjs` fails if either file's export names change, or if the shared set changes.

## The deployed route

GET https://brightline-content-engine-backend.vercel.app/api/health returned HTTP 200. environment.pipelineRoute is v4. The response ts is 2026-11-04T10:17:08.465Z. This replay read it at 2026-11-04T10:17:08.549Z.

The browser was not opened. There is no screen change.

