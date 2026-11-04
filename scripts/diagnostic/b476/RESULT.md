# B476. The legacy route is retired

Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.

Problems: none.

## The handler

Before, `api/analyse-statements.js` chose a route:

```
const useV4 =
  process.env.QC_PIPELINE_V4 === "1" || (body?.options && body.options.pipelineRoute === "v4");
const pipelineResult = useV4
  ? await runPipelineV4(draftText, v3Sources, pipelineOptions)
  : await runPipelineV3(draftText, v3Sources, pipelineOptions);
```

After, the handler calls one pipeline. There is no flag and no branch:

```
const pipelineResult = await runPipelineV4(draftText, v3Sources, pipelineOptions);
```

Preflight, which used to run only on the v4 branch, now runs on the only path. The response stamps pipelineVersion v4.

## Search

Search of lib and api for pipeline-v3:

nothing.

## Files deleted

Consumer counts are imports found before deletion. A file inside the folder importing another is an inside consumer.

| File | Lines | Consumers outside the folder | Consumers inside the folder |
| --- | --- | --- | --- |
| lib/qc/pipeline-v3/qc-pipeline-v3.mjs | 164 | 1, api/analyse-statements.js | 0 |
| lib/qc/pipeline-v3/stage1-extract-statements.mjs | 169 | 0 | 1, the entry file |
| lib/qc/pipeline-v3/stage2-match-sources.mjs | 359 | 1, tests/b475-matcher-export-parity.test.mjs, deleted with it. scripts/diagnostic/b475/replay.mjs also imports it and is not in the suite. | 1, the entry file |
| lib/qc/pipeline-v3/stage3-aggregate-verdict.mjs | 48 | 0 | 1, the entry file |
| lib/qc/pipeline-v3/stage4-select-excerpts.mjs | 84 | 0 | 1, the entry file |
| lib/qc/pipeline-v3/stage5-generate-commentary.mjs | 175 | 0 | 1, the entry file |

The comment in lib/qc/pipeline-v4/stage2-match-sources.mjs that said to keep the two matchers in sync by hand is removed with the file it named.

tests/b475-matcher-export-parity.test.mjs is deleted with the matcher whose export names it pinned.

## The mini-eval

tests/r1_2_mini_eval/stage2_eval_mirror.mjs keeps its pasted prompt. It now says, in one line, that the prompt is a frozen historical prompt dated 2026-05-03. That is the date of the commit that put this text in the file. It was not pointed at lib/qc/pipeline-v4/prompts/stage2_v4.md. The live prompt is a later contract, with period assessment and a different modality rule. The scored results in this folder were produced against the pasted text. Reading the live file would make a later eval measure a different prompt from the one those results record. The folder is not part of npm test or verify:ship.

## Historical scripts

scripts/diagnostic is not executed by npm test or by verify:ship. vitest includes tests/**/*.test.mjs only. Those scripts were left as they are, including scripts/diagnostic/b475/replay.mjs, which still imports the deleted matcher. Running that replay will fail. It was not updated.

## Cards

Cards read: 261.

B475 recorded sha256 e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e.

This reading: e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e.

Same hash: yes.

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

## Tests

Deleted: tests/b475-matcher-export-parity.test.mjs. It imported the matcher this spec deletes. Its assertion was the export list of that file.

Changed: tests/environment-summary.test.mjs, the test that asserted an unset QC_PIPELINE_V4 selects v3. That assertion described the selector, not a card. The selector is removed, so an unset variable is not a route, and the summary's only route is v4. The summary is still not ok when the editorial switch is off, which is what the rest of that test checks. No card test changed an assertion.

## The deployed service

GET https://brightline-content-engine-backend.vercel.app/api/health returned HTTP 200. environment.pipelineRoute is v4. The response ts is 2026-11-04T10:33:39.332Z. This replay read it at 2026-11-04T10:33:39.423Z. The build commit on the response is 7705235, which is the previous ship. This change is not on that build yet. The service answers and reports one route.

## Size

git diff HEAD --numstat: 1128 lines deleted, 41 lines added.

The browser was not opened. There is no screen change.

