# Real run payloads, 29 September 2026

Captured from production, build `a22e894`, via the browser network log. These are the
actual request and response bodies, not reconstructions.

| File | What it is |
|---|---|
| `clean-review.json` | `/api/analyse-statements` response, clean draft (run A) |
| `clean-actions.json` | `/api/revise-actions` response, clean draft |
| `doc-review.json` | `/api/analyse-statements` response, doctored draft (run B) |
| `doc-actions.json` | `/api/revise-actions` response, doctored draft |
| `source-3i-hy25-extracted.txt` | the source as extracted from the PDF, 1,160 words |

The draft text for each run is inside the corresponding review payload; the fifteen
statements are at `statements[].qcCard.statement`.

Six differences between the two drafts, verified by diffing the submitted text:
S0 billion to million, S5 the period, S8 Action to MAIT, S9 GIC to AGIC, S12 gains on
TCR to gains across essentially all of its investments, S14 management to the UK
government.

Use these rather than paraphrasing. Three separate checks this month were written
against strings that do not occur in the source.
