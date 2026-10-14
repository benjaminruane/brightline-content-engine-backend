# B389 gate rules

These rules were written before any score was computed. They are the rules `gate.mjs` implements. A later variant would be a new section with its own column. This text is not edited to improve a number.

`locatePassageInSource` does not fit G1 as a whole. It searches for the passage as one needle, so a quotation joined by an ellipsis fails even when every fragment is in the source. The same file then has a sentence-window path and a similarity path (floor 0.85). Those accept text that is not a substring. G1 requires a substring. G1 therefore uses only `repairNormaliseWithMap` from `lib/qc/excerpt-from-source.mjs`, which is the normalisation `locatePassageInSource` uses for its substring step: whitespace runs become one space, curly single and double quotes become straight quotes, and en and em dashes become hyphens. Whitespace is space, tab, newline, carriage return, form feed, vertical tab, and non-breaking space. No other dash and no guillemet is folded. The passage, and each ellipsis fragment, is trimmed at the ends before that normalisation. The source is normalised without an extra trim.

`NUMBER_RE`, `NAME_RE`, `foldNumberWords`, and `scaleKey` are not exported. The gate does not copy them. It calls the exported wrappers that are built from them: `numberTokens`, `numberKeySet`, and `capitalisedNames` in `scripts/diagnostic/b381/fabrication-checks.mjs`.

## G1. Citation

The claim's `passage` must locate in the source the claim names. The source is the job source whose `id` or `label` equals `String(sourceId)`. A null passage, an empty passage, a missing `sourceId`, or no matching source is UNVERIFIED.

Normalise as above. Then:

- If the passage contains neither `...` (three ASCII dots) nor `…` (U+2026), the whole trimmed passage must occur as a substring of the normalised source.
- If it contains either ellipsis, split on `\u2026` or `\.{3}`. Trim each piece. Discard a piece shorter than 12 characters. Every remaining piece must occur as a substring of the normalised source. The pieces do not have to appear in order. If no piece of at least 12 characters remains, the passage is UNVERIFIED.

A passage that fails is UNVERIFIED. The comment on that claim is withheld. A comment on a passage that passes is displayable, including when G2 later demotes the claim.

## G2. Elements

G2 applies only to a claim whose model verdict is `confirmed` and whose passage passed G1. Every figure, every date, and every capitalised multi-word name in the claim text must occur in the passage string (the text the model quoted, not the rest of the source).

A figure is one `numberTokens` key. It occurs when `numberKeySet` of the passage contains that key. The key is the one `scaleKey` produces: `3.3 billion` and `3.3bn` share a scale, and thousands separators are stripped inside `numberTokens`.

A capitalised multi-word name is one `capitalisedNames` result. It occurs when the passage contains that name after curly apostrophes are folded, the case is lowered, and whitespace is collapsed. That is the comparison `nameInCorpus` uses. `nameInCorpus` itself is not exported.

A date is a day, a month name, and a four-digit year. The month names are January through December and the abbreviations Jan, Feb, Mar, Apr, Jun, Jul, Aug, Sep, Sept, Oct, Nov, Dec, plus May. The two surface forms are `13 May 2026` and `May 13, 2026`, with an optional `st`, `nd`, `rd`, or `th` on the day and an optional comma. Both forms share the key `YYYY-MM-DD`. The key occurs when the passage contains either surface form with the same key. A numeric date such as `30/06/2025` is not given a date key. Its numbers remain figures. A month and year with no day is not a date.

A confirmed claim with any figure, date, or name absent from its passage is DEMOTED. A claim that failed G1 is unverified. It is not demoted.

## G3. Verdict

Apply the claims in this order. The three states are exhaustive.

1. VERIFIED GREEN. The statement has at least one claim, and every claim is model-verdict `confirmed`, passed G1, and was not demoted by G2.
2. FLAGGED. Otherwise, at least one claim is not model-verdict `confirmed`, and that claim's passage passed G1. A second claim that failed G1, or a confirmed claim that was demoted, does not cancel the flag. The failed claim's comment stays withheld.
3. COULD NOT VERIFY. Anything else. That includes no claims, a null or failed passage on every not-confirmed claim, and a confirmed claim demoted by G2 when no qualifying flag exists. COULD NOT VERIFY is never green and never a confident flag. It carries the passages that were searched. It does not assert that the statement is wrong.

`confirmed` is the only model verdict that counts as confirmed. `partially_confirmed`, `conflicting`, and `not_supported` are not confirmed.

## G4. Agreement column

The agreement column starts from the G3 state. VERIFIED GREEN remains only when the other stored pass's G3 state for the same statement is also VERIFIED GREEN. A VERIFIED GREEN that the other pass did not also verify becomes COULD NOT VERIFY. FLAGGED is unchanged. COULD NOT VERIFY is unchanged.

This is not greening on agreement. Two passes that say the same thing do not become green. The locate on each pass still decides. Agreement only removes a green that the other pass did not also verify.

A statement present on only one pass is not VERIFIED GREEN in the agreement column.

## How the labelled score reads the states

`scripts/diagnostic/accuracy/score.mjs` only understands the existing display verdicts. For that score, and for that score only:

- VERIFIED GREEN is passed as `supported_full`.
- FLAGGED is passed as the stored `displayVerdict` when that already maps to partially confirmed, conflicting, or no support. Otherwise it is passed as `supported_partial`.
- COULD NOT VERIFY is passed as `not_supported`.

That mapping makes COULD NOT VERIFY neither a leave-alone nor a catch. A catch still requires the stored verdict to be a conflict and the gate to have left the statement FLAGGED. A leave-alone still requires VERIFIED GREEN.

The pipeline comparison is the stored run `scripts/diagnostic/accuracy/runs/evidence-pass-oct-06-b378/cards.json`, fixtures 11 to 20. It is the latest dated full-corpus evidence pass. It is not replaced after the slice is scored.

## Measurement of the citation figures

Not a gate rule. On pass 1, and again on pass 2, take every claim whose `passage` is a non-empty string. A passage "verifies verbatim" when the whole passage, trimmed and normalised as in G1, is a substring of the normalised source. This test does not split ellipses. Among the failures, count how many contain `...` or `…`. Among those, count how many would pass the G1 fragment rule. Genuine non-locating is the verbatim failures that the fragment rule does not rescue. The same counts are also printed for accuracy fixtures 11 to 20 alone, so a different denominator can be explained. The rule above is not changed to force the denominator to 186.
