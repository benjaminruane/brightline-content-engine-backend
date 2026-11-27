# B608 verification

## Preview app

Frontend preview (`brightline-content-engine-frontend-git-main-brightline-5c69b471.vercel.app`) redirects to Vercel SSO login. This session could not open the live Assess UI on that host.

Backend preview health after ship: build commit `0f5fa7d`, ref `main`.

## PDF (Harbourline S5 shape)

Built with shipped `buildExportDocument` + shipped `export-blocks` / `render-pdf` (same path the preview export uses once the FE preview is reachable).

Seen on `harbourline-s5.pdf` / `pdf-page-1.png`:

- Source `[1]` line 7: expected-to-complete passage
- Also appears at: `[2]` line 18: 30 September 2026 completion passage

## Status advice

`STATUS_ADVICE_SENTENCE` / `stampStatusAdvice` now read:

`If the transaction has been approved or completed, set its status; otherwise add the closing document.`

Seen on `status-advice.png`. No "commitment" wording.
