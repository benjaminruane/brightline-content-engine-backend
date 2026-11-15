# B515 empty checks

Read only. No model call. Spend USD 0.

## Counts

### b510

Drafts stored: 10. Raised cards stored: 55.
Shown reason stored on 55 raised cards.
Cards whose shown reason says a check came back empty: 0.
Share of all reviewed statements: 0 of 202 reviewed statements (0.0%).
By branch. Match empty, then result empty.
- uncheckedLook: match 0, result 0
- statementVerdict: match 0, result 0
- refusedReading: match 0, result 0
- other: match 0, result 0
Reading note bucket on those cards. A stored bucket is the note that was accepted. A missing bucket means this file does not say whether the note was accepted.
- none
The evidence-not-reviewed slug is not stored on these cards.
Raw responses, finish reasons, and call errors are not kept on the stored cards.

### b512

Drafts stored: 10. Raised cards stored: 24.
The shown reason was not stored on these cards. The empty-reason count cannot be made from this file.
Cards whose shown reason says a check came back empty: 0.
Share of all reviewed statements: not stored. run.json does not keep the reviewed statement total, so the share of all reviewed statements cannot be computed.
By branch. Match empty, then result empty.
- uncheckedLook: match 0, result 0
- statementVerdict: match 0, result 0
- refusedReading: match 0, result 0
- other: match 0, result 0
Reading note bucket on those cards. A stored bucket is the note that was accepted. A missing bucket means this file does not say whether the note was accepted.
- none
The evidence-not-reviewed slug is not stored on these cards.
Raw responses, finish reasons, and call errors are not kept on the stored cards.

### b513

Drafts stored: 8. Raised cards stored: 34.
Shown reason stored on 34 raised cards.
Cards whose shown reason says a check came back empty: 2.
Share of all reviewed statements: not stored. run.json does not keep the reviewed statement total, so the share of all reviewed statements cannot be computed.
By branch. Match empty, then result empty.
- uncheckedLook: match 2, result 0
- statementVerdict: match 0, result 0
- refusedReading: match 0, result 0
- other: match 0, result 0
Reading note bucket on those cards. A stored bucket is the note that was accepted. A missing bucket means this file does not say whether the note was accepted.
- (not stored): match 2, result 0
The evidence-not-reviewed slug is not stored on these cards.
Raw responses, finish reasons, and call errors are not kept on the stored cards.

### b514

Drafts stored: 6. Raised cards stored: 12.
Shown reason stored on 12 raised cards.
Cards whose shown reason says a check came back empty: 6.
Share of all reviewed statements: not stored. run.json does not keep the reviewed statement total, so the share of all reviewed statements cannot be computed.
By branch. Match empty, then result empty.
- uncheckedLook: match 0, result 0
- statementVerdict: match 2, result 4
- refusedReading: match 0, result 0
- other: match 0, result 0
Reading note bucket on those cards. A stored bucket is the note that was accepted. A missing bucket means this file does not say whether the note was accepted.
- none: match 2, result 4
The evidence-not-reviewed slug is not stored on these cards.
Raw responses, finish reasons, and call errors are not kept on the stored cards.

## Code paths

The two sentences live in `NOT_CHECKED_SENTENCES` in `lib/qc/not-reviewed-reason.mjs`.

`empty_confirmation_refused`: "This check did not run, because the match came back empty."
`empty_completion`, `empty_result`, and the blank slug: "This check did not run, because the result came back empty."

Match empty. `applyEmptyConfirmationRefusal` in `lib/qc/pipeline-v4/stage2-match-sources.mjs`.
Condition: classification is `confirmed` and the passage is empty. The call itself returned. The writer then sets classification `not_reviewed` and `emptyConfirmationRefused: true`, and logs `[stage2] empty confirmation refused`.
This is not a missing response, a parse failure, an empty array, a timeout, a token limit, or a schema refusal. Those other misses take different paths:
- No provider key: `matchOnePair` returns `not_reviewed` with `matchNotReviewed: true` and does not set `emptyConfirmationRefused`.
- Parse failure: `safeJsonParse` returns null when the text is empty or is not JSON. `normalizeValidResponse` then returns null. After one retry, `matchOnePair` returns `not_reviewed` with explanation "Schema validation failed after retry".
- A thrown call, including a timeout, returns `not_reviewed` with the call error appended to "Match call failed".
- An unknown classification, which includes a response the schema does not accept, also returns null from `normalizeValidResponse` and becomes the schema path above.
`notReviewedReasonFromMatches` in `lib/qc/worked-record.mjs` returns `empty_confirmation_refused` only when a match has `emptyConfirmationRefused === true`. Otherwise a schema explanation becomes `schema_invalid`, and anything else becomes `could_not_determine`.
`assemble-card.mjs` copies that slug onto `evidenceNotReviewedReason` when the display verdict is "not reviewed" or the support state is `skipped`, and no reason was set earlier.

Result empty. Nothing on the evidence match path assigns `empty_result` or `empty_completion` to `evidenceNotReviewedReason`.
`editorial-compliance-reviewer.mjs` assigns `empty_result` when an editorial result has no `editorialVerdict` string, and `empty_completion` when every schema attempt has an empty raw output. Those stamps go on the editorial or compliance reason, not on the evidence reason the card sentence reads.
`readerEvidenceSentence` in `lib/qc/reader-reason.mjs` shows the blank-slug sentence when the shown state is `note_withheld`, the reading note was not refused, and `evidenceNotReviewedReason` is missing or blank. The blank entry in `NOT_CHECKED_SENTENCES` is the result-empty sentence.
A stored card whose branch is `statementVerdict` and whose reason is the result-empty sentence is that fallback. The trace did not take `uncheckedLook`, which requires a non-empty evidence reason and a quiet stored state.

B512 `ce1249a2` and B513 `399e3273` changed `lib/qc/reading-review.mjs` (the leave-out list and the context rule). They did not change the stage 2 match prompt, its input size, or its schema.
B514 `9d673326` changed `lib/qc/pipeline-v4/stage2-match-sources.mjs`. `stage2PromptWithStatus` appends `statusPromptLine(dealStatus)` when the writer confirmed a status, and the cache hash includes that sentence. The empty-confirmation condition was not changed. The schema was not changed. A run with no confirmed status sends the same prompt as before.

Source lines still present:
- stage2 empty confirmation: yes (if (cls === "confirmed" && empty))
- stage2 parse returns null: yes (function safeJsonParse)
- stage2 schema retry returns not_reviewed: yes (match failed validation)
- stage2 thrown call returns not_reviewed: yes (match call failed)
- assemble copies the match reason: yes (notReviewedReasonFromMatches)
- worked record empty confirmation slug: yes (emptyConfirmationRefused === true)
- reader blank slug sentence: yes (NOT_CHECKED_SENTENCES[""])
- editorial empty result: yes (NOT_REVIEWED_REASONS.EMPTY_RESULT)
- editorial empty completion: yes (NOT_REVIEWED_REASONS.EMPTY_COMPLETION)
- sentence table: yes (empty_confirmation_refused)

## Most likely cause

Two different sentences, two different causes.

The match-empty sentence is a real stage 2 result: the model classified the pair as confirmed and returned an empty passage. `applyEmptyConfirmationRefusal` refuses that confirmation. The stored runs do not keep the raw response, the finish reason, or the slug, so a single card cannot be tied to a provider error. The condition that writes the slug is the empty passage, not a timeout or a token limit.

The result-empty sentence on a card whose stored branch is `statementVerdict` is the blank-slug fallback in `readerEvidenceSentence`. The evidence assembler never writes `empty_result` or `empty_completion` onto the evidence reason. A note_withheld card with no stored evidence reason therefore shows "the result came back empty" even when no call returned an empty body. B512 and B513 made more cards note_withheld through the reading note. They did not change the match call. B514 added one status sentence to the match prompt when a status is confirmed. That sentence is not what selects the blank-slug fallback.

Where the stored branch is missing, the file does not say which of the two paths produced the sentence. The rendered reason is the only record.

