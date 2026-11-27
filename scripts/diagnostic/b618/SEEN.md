# B618 SEEN (backend)

## Refused-reading amber reason
Unit test `test/b618-refused-reading-reason.test.mjs` stamps the Shopify S2 shape:
- `readingNote.refused: true`, branch `refusedReading`, `supportState: partial`
- support restatement as `shownReason`
- `matchExplanations[0]` partially_confirmed with onboarding / fee gap

After `applyExitGate`, `shownReason` names the gap (`does not address` / onboarding or fees) and the card stays `note_withheld`.

Preview Review of the Shopify LinkedIn draft is recorded after ship (see frontend `scripts/diagnostic/b618/` screenshots).
