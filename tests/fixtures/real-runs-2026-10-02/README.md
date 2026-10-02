# Real run payloads, 2 October 2026

Captured from the live product, build `438169f` (B363), by the product owner.
Doctored draft: the 330-word 3i HY25 draft with six planted errors.

```
doc-review.json    /api/analyse-statements response, fifteen cards
doc-actions.json   /api/revise-actions response
doc-synth.json     /api/synthesize-review response
source-3i-hy25-extracted.txt   the source text as the pipeline received it
```

Why this set exists. The 29 September fixtures predate the empty-confirmation
refusal at the Stage 2 writer, so replaying them reproduces a pipeline state the
product no longer produces. That caused a fix to be reported as working when it
does not fire live. These payloads are from the shipped pipeline and should be
used alongside the September set, not instead of it: the September set still
pins behaviour on the older shape.

All six planted errors are caught in this run. Statement 10 is the open case:
`supportState` skipped, classification `not_reviewed`, empty confirmation
refused.
