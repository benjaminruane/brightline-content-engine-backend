# B617 verification seen

Date: 2026-11-27. Build tip at verify: `589243f3` (blbe), `ea07531` (blfe). Tag `b617`.

## Machine rerun (committed)

`scripts/diagnostic/b617/R-249D-rerun.json` — same draft and Shopify memo as R-249D, run through `runPipelineV4` + exit gate with toggles on.

| Item | Seen |
|------|------|
| Spans | S0 `0–157`, S1 `159–347`, S2 `348–497`, S3 `499–850`. `draftCoverage.uncoveredCount` 0. |
| Editorial / Caution | All four `editorialVerdict` and `complianceVerdict` are `clean` (ran). |
| Evidence | Each card keeps a passage that shares content with its sentence (no memo header stand-in). |
| Status buttons | S0 `statusDependent: true`, reason starts with the status-confirm sentence and then names the memo date vs November 2026. |
| Source date | `recencySummary` has one row: Shopify (text).txt, October 12, 2010, 16 years. |

## Browser

Local FE open at `localhost:5173/assess` at 1440×900. A live Review in the UI was not completed: the local `vercel dev` backend was stopped during the session and could not be restarted without Vercel credentials. Preview backend health still reported commit `fafae0d` (first B617 push) while the tip moved to `589243f3`. The committed rerun above is the verification of the three behaviours on this tip.
