# B618 SEEN (backend)

## Refused-reading amber reason
Unit test `test/b618-refused-reading-reason.test.mjs` stamps the Shopify S2 shape:
- `readingNote.refused: true`, branch `refusedReading`, `supportState: partial`
- support restatement as `shownReason`
- `matchExplanations[0]` partially_confirmed with onboarding / fee gap

After `applyExitGate`, `shownReason` names the gap (`does not address` / onboarding or fees) and the card stays `note_withheld`.

Preview git-main frontend is behind Vercel SSO in this session, so a live Shopify LinkedIn rerun was not opened there. The unit card shape and `unit-reason.json` are the committed proof of the S2 gap reason.
