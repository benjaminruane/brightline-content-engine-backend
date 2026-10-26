# B439 replay

Stored cards from the accuracy run on build dab9268, passed through the display rules. No model call. USD 0.

Detection is unchanged. Support state, concern codes, and concern text are not written by this replay. What can move is the sentence label, the tier that follows it, the header line, the summary word, and the export.

Choice for a conflict labelled Nothing raised: the evidence verdict reaches the statement verdict that the screen stores, and only when that verdict would otherwise be quiet. The label does not read the display verdict instead of the statement verdict. The card edge, the evidence line, the tier, and the header already read the statement verdict. A label-only change would leave those saying nothing was raised. A beyond note, a missing fact, or a conflict note still wins, because those are already louder.

## What moved

### pass-1.json

- Statements: 261. Label or tier moves: 16. Unexplained: 0.
- Problem 1, conflict that was Nothing raised: 14. Each moves to Conflicts with the source, tier demands.
- Problem 1, not-supported that was Nothing raised: 2. Each moves to Not in the source, tier demands.
- Tiers before: demands 51, light 25, quiet 185.
- Tiers after: demands 67, light 25, quiet 169.

- fixture 01 index 11: "We recommend approval."
  - label Nothing raised -> Not in the source; tier quiet -> demands; display not_supported
  - The card already holds a not-supported verdict. The sentence was quiet, so the label now says it is not in the source.
- fixture 06 index 5: "Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the tim..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 08 index 6: "Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 09 index 1: "Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above p..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 12 index 0: "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Br..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 13 index 7: "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 14 index 12: "We will provide further detail when the work is sufficiently advanced."
  - label Nothing raised -> Not in the source; tier quiet -> demands; display not_supported
  - The card already holds a not-supported verdict. The sentence was quiet, so the label now says it is not in the source.
- fixture 15 index 10: "The Atelier 73 growth concept - Atelier 73 is the Company's smaller, design-led store format positioned at a y..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 15 index 11: "The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 15 index 24: "167 of 184 stores are leased with average remaining term of 7.2 years."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 16 index 4: "Gross margin is 71.4 percent and EBITDA margin is 32.8 percent."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 17 index 2: "The Portfolio comprises 337,000 square metres of lettable area distributed across Greater London (89,000 sqm i..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 17 index 9: "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll d..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 18 index 0: "We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 18 index 2: "We have invested EUR 158 million for a 60% controlling stake."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 19 index 1: "As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.

- Problem 3. 25 statements already say Goes beyond the source. The summary used to count those as partial support. It now says goes beyond the source, and it does not add them to the partial count. 169 statements stay Nothing raised. The summary used to count those as confirmed and could say all claims are backed. It now says Nothing raised.
- Problem 4. Export verdict text changes on 106 statements. 90 of those keep the same sentence label. The export prints that label, or the conflict label the card now shows, instead of a different display-verdict word.
- Problem 2. The 14 conflict moves are now sentence state conflicts. The header line names a conflict when that state is present, including when a missing fact would otherwise be the only sentence. Nothing is added unless a statement already holds the conflict.

### pass-2.json

- Statements: 261. Label or tier moves: 16. Unexplained: 0.
- Problem 1, conflict that was Nothing raised: 14. Each moves to Conflicts with the source, tier demands.
- Problem 1, not-supported that was Nothing raised: 2. Each moves to Not in the source, tier demands.
- Tiers before: demands 51, light 25, quiet 185.
- Tiers after: demands 67, light 25, quiet 169.

- fixture 01 index 11: "We recommend approval."
  - label Nothing raised -> Not in the source; tier quiet -> demands; display not_supported
  - The card already holds a not-supported verdict. The sentence was quiet, so the label now says it is not in the source.
- fixture 06 index 5: "Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the tim..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 08 index 6: "Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 09 index 1: "Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above p..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 12 index 0: "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Br..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 13 index 7: "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 14 index 12: "We will provide further detail when the work is sufficiently advanced."
  - label Nothing raised -> Not in the source; tier quiet -> demands; display not_supported
  - The card already holds a not-supported verdict. The sentence was quiet, so the label now says it is not in the source.
- fixture 15 index 10: "The Atelier 73 growth concept - Atelier 73 is the Company's smaller, design-led store format positioned at a y..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 15 index 11: "The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 15 index 24: "167 of 184 stores are leased with average remaining term of 7.2 years."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 16 index 4: "Gross margin is 71.4 percent and EBITDA margin is 32.8 percent."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 17 index 2: "The Portfolio comprises 337,000 square metres of lettable area distributed across Greater London (89,000 sqm i..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 17 index 9: "Our value creation plan rests on capturing the embedded reversion as approximately 40 percent of leases roll d..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 18 index 0: "We are writing to confirm completion of the transaction with Nordic SaaS Holdings (the "Company"), a Stockholm..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 18 index 2: "We have invested EUR 158 million for a 60% controlling stake."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.
- fixture 19 index 1: "As of 31 December 2025, the Fund's net IRR stands at 19.7 percent, with net MOIC of 2.13x and net DPI of 0.94x..."
  - label Nothing raised -> Conflicts with the source; tier quiet -> demands; display conflict
  - The card already holds display verdict conflict. The sentence was quiet, so the label now says the conflict.

- Problem 3. 25 statements already say Goes beyond the source. The summary used to count those as partial support. It now says goes beyond the source, and it does not add them to the partial count. 169 statements stay Nothing raised. The summary used to count those as confirmed and could say all claims are backed. It now says Nothing raised.
- Problem 4. Export verdict text changes on 108 statements. 92 of those keep the same sentence label. The export prints that label, or the conflict label the card now shows, instead of a different display-verdict word.
- Problem 2. The 14 conflict moves are now sentence state conflicts. The header line names a conflict when that state is present, including when a missing fact would otherwise be the only sentence. Nothing is added unless a statement already holds the conflict.

## The 210

The census file lists 316 unique partial statements. 210 are the ones with no finding sentence.

- Would now carry a ground from the stored summary: 0.
- Would record a ground that is only the unavailable-commentary sentence: 4. That sentence is not a reason for the partial.
- Would record that the ground was absent at the match explanation: 206.
- Of those absent, 91 already carry a displayVerdictReason. Those values are short slugs, such as a check name, not a sentence that names what is backed and what is not. They are not the ground a later split would use.

Most of the 210 still have nothing. The recording path can only copy a summary that was stored, or say the explanation was absent. These payloads did not keep the match explanation. That is where a ground would have to come from. B432 cannot split these sentences until that explanation is on the card.

Samples of a stored summary treated as a ground:

- The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and...
- Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and co...: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and...
- We have invested EUR 720 million of equity for an 84% stake.: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and...
- Strong demand in medical implants, particularly from our largest orthopaedic customer, has been the principal ...: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and...

Names. Goes beyond the source stays the name for a beyond sentence. Partially confirmed stays the name for an evidence partial, which is the badge the card already uses. B432 will change what a partial says on the card, and that summary sentence will have to change with it. Nothing raised stays Nothing raised, and is not renamed to confirmed or backed.

## Files

- lib/qc/shown-verdict.mjs
- scripts/diagnostic/b439/replay.mjs
- scripts/diagnostic/b439/REPLAY.md
- tests/b439-shown-verdict.test.mjs

