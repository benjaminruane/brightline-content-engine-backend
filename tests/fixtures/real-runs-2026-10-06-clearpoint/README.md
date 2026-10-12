# Real run 2026-10-06, ClearPoint Neuro Q1 2026, clean x3 and doctored x1

Medical device genre. 10 statements. One source: the Newswire version of the
13 May 2026 press release, saved to PDF (21,376 characters extracted after B383).
The sidebar is still in the extract. It now follows the article instead of
running through the middle of sentences. IRRAflow is one word.

The review payloads in this folder (clean1/2/3 and dirty1) predate B382 and B383.
They were produced from the earlier extraction.

Files: clean1/2/3 and dirty1, each with -review.json and -actions.json, plus
both drafts and the source.

## Verdicts

| run | S0 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|-----|----|----|----|----|----|----|----|----|----|----|
| clean 1 | full | full | PART | full | full | PART | full | full | full | CONFLICT |
| clean 2 | full | full | PART | full | full | PART | full | full | full | CONFLICT |
| clean 3 | full | full | PART | full | full | PART | full | full | full | CONFLICT |
| dirty 1 | CONFLICT | full | CONFLICT | full | full | PART | full | CONFLICT | PART | none |

Three clean runs, byte-identical verdicts. No flicker, unlike the GP run.

## Clean-run false positives, stable across all three

- **S9 CONFLICT on correct text.** Draft "revenue guidance of USD 52-56 million
  for 2026" against source "estimates revenue in 2026 to be between $52.0
  million and $56.0 million". The card's own comment reads: "the classification
  as 'conflicting' suggests there may be an error in the source explanations".
  The product tells the user its verdict is probably wrong.
- **S2 PART.** The comment says the source does not confirm 25% organic growth
  for devices; the source headline states exactly that. It also says the source
  does not specify the gross margin cause, while the excerpt shown on the card
  states that cause verbatim. The comment argues against its own quote.
- S5 PART is arguable (prior year against prior-year quarter), not counted.

## Doctored run, against the eight planted

Caught: the April date (conflict, naming 13 May); organic growth -50%; FDA
submission against clearance received; guidance 56 for 2027 (not supported).

Caught in prose only: Health Canada issued as the FDA. Named in the comment,
but the verdict stayed partial rather than conflict and the unsupported span
points at a different clause.

Missed: "contributed the vast majority of the company's overall revenue" for a
segment at $5.9m of $12.1m total. Card is green. Comment reads "80% and 3.0
match the source."

Missed and affirmed: "has been commenced" against the source's "Completion of
the first commercial drug delivery case". The unsupported span points at that
clause, and the comment on the same card says the source confirms "the
commencement". The span layer and the comment layer disagree on one card.

## Proposals

Zero across all four runs, including on the doctored -50% against 16%, which is
digit against digit. The stated reason there is that the source carries 25%
elsewhere so the figures cannot be reconciled. Digits were necessary but not
sufficient: the blocker on this genre is the ambiguity veto, not the tokenizer.

Running total across two genres: ten conflict cards, zero proposals offered.
