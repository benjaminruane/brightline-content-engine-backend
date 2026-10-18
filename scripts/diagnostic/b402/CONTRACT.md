# B402. The reading contract

| | |
|---|---|
| SHIPPED | recorded after verify:ship |
| Cost | Estimate before the run: 84 calls, USD 0.9229 list. Measured: 85 calls, USD 0.377113 discounted, USD 0.600953 list. Model `gpt-4o-2024-08-06`. |
| Evidence | `scripts/diagnostic/b402/runs/reading.json`, `tests/b402-reading-contract.test.mjs`. |

The contract is `lib/qc/reading-contract.mjs`. Card assembly does not call it. A live review does not carry the new fields. `applyReadingContract` adds them beside `displayVerdict` and `factualBadge` when a caller applies it, and it does not delete those fields.

## Where the extractor lives

It stays in `scripts/diagnostic/b392/elements.mjs`. The contract calls `extractElements` and `elementFound` from there.

Moving it into `lib/` would not change the B394 definition, and it would put that file on the server import path the moment assembly imported the contract. Four diagnostic scripts already import it (`b396`, `b397`, `b398`, `b401`). Those callers are unchanged. This pass does not import the contract from a request handler.

`not_found` is `elementFound` false on the whole source. No window, no overlap test, no binding rule.

## The line gap

A matched element does not get a line id from the current matcher.

`elementFound` returns a boolean. It does not return a line. Stage 2 (`lib/qc/pipeline-v4/stage2-match-sources.mjs`) returns a passage for the statement, and `buildSupportSpans` returns a character span for that passage. Neither one names the line an element matched on.

`buildFacts` attaches `lineId`, `extract`, `lineBeforeId`, and `lineAfterId` only when the caller passes `matcherLines` as `{ surface, lineId }` from a matcher that already knows the line. The extract is that line's text. The neighbours are the previous and next line ids in the source, split on newlines as `L1`, `L2`, and so on. If the named line does not contain the surface, `buildFacts` throws. It does not search the source for the word.

This measurement passed no matcher rows. Every matched element is `lineGap: true` and carries none of the line fields. A `not_found` element carries none of them either.

Closing the gap means the matcher returns, for each element it accepts, the source line id it matched. Until that exists, the contract will not invent the line.

## The note

One note per statement. The bucket is `conflicts`, `beyond`, `wording`, or `none`.

`acceptNote` refuses a note whose text matches the fixed list in `NOTE_BANNED_PHRASES`: confirmed, verified, correct, supported, "confirms the statement", "confirms that", "source confirms", "aligns with", "aligning with". A refused note is not stored. It does not become `none`.

`disputedElements` must be surfaces from that statement's element array. Any other surface is rejected and recorded. A `wording` note and a `none` note never dispute an element. Those surfaces are rejected with `wording_never_disputes` or `none_never_disputes`.

A `beyond` note is prompted to name the gap: what the statement asserts that the source does not carry. The prompt is `READING_NOTE_PROMPT`. The check is the refusal, not the prompt.

## Sentence state

Computed in `sentenceState`. Strongest wins:

1. `not_in_source` if any element is `not_found`. Label: "Not in the source".
2. `conflicts` if the bucket is `conflicts`. Label: "Conflicts with the source".
3. `beyond` if the bucket is `beyond`. Label: "Goes beyond the source".
4. `worth_a_look` if the bucket is `wording`. Label: "Worth a look".
5. `nothing_to_raise` otherwise. Label: "Nothing to raise".

A refused note does not reach step 5. The state is null unless a `not_found` element already won at step 1. The header counts that statement under `refused`, inside "statements to look at".

`settleFacts` has one allowed change: `matched` becomes `matched_disputed` when the bucket is `conflicts` or `beyond` and the surface was kept in `disputedElements`. `not_found` stays `not_found`. `matched_disputed` stays `matched_disputed`. A wording note does not change a status.

## Draft header

The stamp is always "Source-checked". The numbers always lead with the count that matched, and matched here includes `matched_disputed`. Then one line:

- Any `not_found`: "N facts are not in the source." No praise. This line wins over a conflict on another statement.
- All matched, and any statement in `conflicts`: "Figures all check out, but N statements conflict with the source." A `beyond` statement in the same draft does not change this line. The numbers still count it as something to look at.
- All matched, and `beyond` is the only raised state: "Figures all check out. N statements go further than the source does."
- All matched, and nothing raised: "Well sourced. Every figure, date and name in this draft appears in the source, and nothing reads as going beyond it."
- All matched, and the only raised states are refusals: "N statements had a note the contract refused."
- All matched, with `wording` and no conflict, or `wording` mixed with `beyond`: no second sentence. The numbers are the header. No praise.

One statement uses the singular. The footnote, once per draft, is: "Your facts are matched against the source and your interpretation is read and commented on. Your judgement still decides."

`draftHeader` throws if the stamp, the numbers, the line, or the footnote contains verified, confirmed, clean, checked-off, or ready-to-send. No percentage is written.

The draft-level writer note is one short strengths-and-weaknesses paragraph from `WRITER_FEEDBACK_PROMPT`, in the shape of the B381 writer note and without that prompt's verdict words. It is not per sentence. The same banned-phrase check applies. A note that fails it is not stored.

## Fields

`applyReadingContract(card, reading)` returns a new object. It copies the card and sets `readingFacts`, `readingNote`, `sentenceState`, and `sentenceLabel`. It does not write back onto the card it was given.
