# B403A. Bucket boundaries

The bucket sets the sentence state, and the state is what a reviewer would read as the colour of the sentence. These definitions are the test a note has to pass.

## The four buckets

conflicts. The source states something that cannot both be true with the statement. A different figure, a different date, a different name, or a word that names a different thing. "Budgets" against "expectations" is conflicts. A date of 30 June against 30 September is conflicts. Giving a figure to a different subject than the source does is conflicts.

beyond. The source does not carry what the statement asserts. An added cause, an added judgement, or a quantity the source does not state. The note names that gap.

wording. The source carries the point and says it differently.

none. Nothing worth saying.

## Where the four shapes land

A paraphrase lands in wording. The point is the same and the words are not. ClearPoint clean S2, "lower allowances for excess and obsolete inventory" against "lower excess and obsolete inventory", is wording. It is not conflicts: the source does not state the opposite.

An inference lands in beyond when it adds a claim the source does not state, and in wording when it restates a singular the source already uses. GP Industries clean S1, "one plant" from "its China facility", is wording. The source's singular facility and the draft's one plant are the same point. Inferring a cause the source does not name, such as "driven by", is beyond.

An added adjective lands in beyond when it adds a judgement the source does not state ("significant", "vast"). It lands in wording when it restates a judgement the source already makes.

A changed attribution lands in conflicts. The statement gives a fact to a subject the source does not give it to, and both cannot be true. The 9% return said to have outperformed, when the source gives that outperformance to a different portfolio, is conflicts.

## What is not an element

A cardinal number that states the length of a period is not an element when both of these hold. The same sentence gives an endpoint, and that endpoint is a date the source also states. The source does not write the cardinal.

The first cut dropped every cardinal in front of "months". That removed things that should have stayed:

- 3i "six months", clean and doctored. The source writes "six months".
- 3i "nine months". The source writes "nine".
- HICL doctored "six months to 31 December 2025". That date is not the source's period, and "six" is the planted substitution. It stays an element so the check can still see it.

The rule above is the narrowed one. On the eight drafts the only element it removes is HICL clean S0, the word "five" in "the five months to 28 February 2026". The source states that period as 1 October 2025 to 28 February 2026 and does not write "five".

## The line of a hit

The extractor lives in `lib/qc/b394-elements.mjs`. `scripts/diagnostic/b392/elements.mjs` re-exports it. Callers of that path are `b392/cross-table.mjs`, `b396`, `b397`, `b398`, and `b401`. `elementFound` is unchanged: a fact is `not_found` only when it is absent from the whole source. `locateElement` is new. It returns the line of the matcher's own hit. Figures and dates use the offset the matcher already computed. A hit that crosses a line break uses the line inside that hit which contains the surface. Names use the first line on which the same name test succeeds. The first hit wins when the token occurs more than once. A folded figure's line contains the source's writing, which is not always the draft's surface string.

## The bucket field

This repo's structured output is `responseFormat: "json"` in `callLLM`. For OpenAI that is `response_format: { type: "json_object" }`. For Anthropic it is a tool whose schema is an open object. Neither mode has an enum. `lib/observability.js` is the only place that sets it, and this pass does not change that helper.

The pipe-joined literal `conflicts|beyond|wording|none` is gone from the prompt. That literal is what the model copied. `acceptNote` still accepts only the four words. Anything else is a refusal, the call is retried once with the reason, and a second failure is `note_withheld`, labelled "Needs a look". The refused text is kept on the measurement record and is not put on the card.

A first complete pass accepted `wording` with an empty note, because the prompt had said the note is an empty string and the model copied that onto other buckets. `acceptNote` now refuses an empty note on conflicts, beyond, and wording (`empty_note`). Only `none` may be empty. The reported run is the pass after that check.
