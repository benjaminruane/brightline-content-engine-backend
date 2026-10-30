# B449

## Why the LinkedIn exception did not hold

The reviewer note reaches the model. `buildEditorialStyleSystemPrompt` puts `reviewerNoteByOutput.linkedin_post` on `structural_integrity` when the output slug is `linkedin_post`, and the LinkedIn calibration block says the same thing in prose. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` `effectiveReviewerNote` and `buildEditorialOutputTypeCalibration`. The B446 pass still stored the fragment flag on fixture 12 index 6. The note was in the prompt. The model ignored it.

The exception is now deterministic. On `linkedin_post` only, a `structural_integrity` concern whose cited text is a name plus a relative clause, or a short credit line, is dropped. A dangling modifier, a run-on, and an agreement error do not match those shapes.

## Free check, before the writer calls

The twenty notes in `scripts/diagnostic/b448/notes.json` contain 33 em dashes and 0 en dashes. 20 of the 20 notes contain an em dash. Unquoted percent words: 1. Quoted percent words, left untouched: 0.

After substitution, no note still contains a long dash or an unquoted percent word, and the quoted percent count is unchanged.

The dry scan of `scripts/diagnostic/b446/pass-1.json` drops one concern: fixture 12 index 6, `structural_integrity`, output type `linkedin_post`. No concern on any other output type moves.

Concern text: Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.

## The asymmetry

A long dash is replaced inside quotation marks. A percent word is not. I agree with that. A long dash is a character this product does not use in its own copy, and quoting it would still put the character on the screen. A percent word inside quotation marks is the draft's wording, cited so the writer can see what to change. Rewriting that quote would make the note say the draft wrote something it did not write.

The quotation ranges are the ones in `quotationRanges`. That helper sees straight double quotes and curly double quotes. A single-quoted percent word is not inside one of those ranges, so the substitution would change it. The stored notes did not need that case.

## The prompt

`WRITER_FEEDBACK_PROMPT` is Ben's copy. The required note schema is unchanged. The craft-note ban list is unchanged. The code still rewrites the note after the model returns, so the prompt line is not the guarantee.

## The writer step

Same twenty drafts. Writer only. No pipeline. The stored note is the text after substitution. `rawNote` is the tool input before it.

Withheld: 0 of 20.
Raw model output, before substitution: em dashes 4, en dashes 0, unquoted percent words 0, quoted percent words 25.
Shown note, after substitution: em dashes 0, en dashes 0, unquoted percent words 0, quoted percent words 25.
The previous prompt left 33 em dashes across the same twenty drafts. This prompt left 4, all of them inside a quotation. The line is doing some of the work. It is not doing all of it. The substitution removes the 4. The 25 quoted percent words stay, which is the exception.
Calls 20. Discounted USD 0.368955. Input 33301. Output 8098. Cached input 0. Unpriced 0.
Ceiling USD 2. Not crossed.
Opus records no cached input on this path, so discounted USD is the list figure.

## Each draft

- Fixture 01: shown. Raw em 0, en 0, percent words 0.
- Fixture 02: shown. Raw em 0, en 0, percent words 0.
- Fixture 03: shown. Raw em 1, en 0, percent words 0.
- Fixture 04: shown. Raw em 0, en 0, percent words 0.
- Fixture 05: shown. Raw em 0, en 0, percent words 0.
- Fixture 06: shown. Raw em 0, en 0, percent words 0.
- Fixture 07: shown. Raw em 0, en 0, percent words 0.
- Fixture 08: shown. Raw em 0, en 0, percent words 0.
- Fixture 09: shown. Raw em 0, en 0, percent words 0.
- Fixture 10: shown. Raw em 0, en 0, percent words 0.
- Fixture 11: shown. Raw em 1, en 0, percent words 0.
- Fixture 12: shown. Raw em 0, en 0, percent words 0.
- Fixture 13: shown. Raw em 0, en 0, percent words 0.
- Fixture 14: shown. Raw em 0, en 0, percent words 0.
- Fixture 15: shown. Raw em 1, en 0, percent words 0.
- Fixture 16: shown. Raw em 0, en 0, percent words 0.
- Fixture 17: shown. Raw em 1, en 0, percent words 0.
- Fixture 18: shown. Raw em 0, en 0, percent words 0.
- Fixture 19: shown. Raw em 0, en 0, percent words 0.
- Fixture 20: shown. Raw em 0, en 0, percent words 0.

