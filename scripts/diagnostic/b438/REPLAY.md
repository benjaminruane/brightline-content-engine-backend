# B438 replay

Stored cards from the accuracy run on build dab9268, passed through the recording code. No model call. USD 0.

Organisation name applied to the stored text: Halden Group. That is the name the accuracy log resolved. The live path uses the same resolver, and it scrubs only when a name resolved.

## Identity

Display verdict, support state, sentence label, tier, and concern codes. A move is a difference on one of those.

- pass-1.json: 261 statements, 0 moved.
- pass-2.json: 261 statements, 0 moved.

Identity held on both passes. No verdict, support state, sentence label, tier, or concern code moved.

## What is newly recorded

### pass-1.json

- Partial statements: 31. Now carry a ground: 31. Ground missing at classification: 0.
- Not reviewed with an empty reason: 5. Now carry a reason: 5. The reason on a stored card is could_not_determine, because the match flag was not kept.
- Conflict with the sentence label Nothing raised: 14. Unchanged. See the part that was left.
- Concern text rewritten because the organisation had resolved: 7.

### pass-2.json

- Partial statements: 30. Now carry a ground: 30. Ground missing at classification: 0.
- Not reviewed with an empty reason: 6. Now carry a reason: 6. The reason on a stored card is could_not_determine, because the match flag was not kept.
- Conflict with the sentence label Nothing raised: 14. Unchanged. See the part that was left.
- Concern text rewritten because the organisation had resolved: 5.

The ground on these stored cards is the evidence summary already on the card. The match explanation was not kept, so the replay cannot recover a ground the summary does not already hold. On a live assembly the card copies the match explanation first, and uses the summary only when that explanation is empty. If both are empty the card records that the ground was absent at the match explanation.

The 210 partials with no stored reason, counted across older payloads, are not in these 261 statements. Every partial in this replay already had a summary.

## Concern text that changed

The concern stayed. The code stayed. The false sentence was removed from the text.

### pass-1.json

- fixture 01 index 11 editorial voice_consistency
  - before: The statement 'We recommend approval.' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisati...
  - after: The statement 'We recommend approval.' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 06 index 7 editorial first_person_plural
  - before: The statement uses first-person plural 'our' and 'we' in a reporting commentary, which requires third-person voice. The authoring organisati...
  - after: The statement uses first-person plural 'our' and 'we' in a reporting commentary, which requires third-person voice.
- fixture 09 index 0 editorial first_person_plural
  - before: The phrase 'our investment in Helvetia Precision Components' uses first-person plural, which is not appropriate for reporting commentary. Th...
  - after: The phrase 'our investment in Helvetia Precision Components' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 09 index 8 editorial first_person_plural
  - before: The phrase 'Our base case returns remain intact' uses first-person plural, which is not appropriate for reporting commentary. The authoring ...
  - after: The phrase 'Our base case returns remain intact' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 13 index 12 editorial first_person_plural
  - before: The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisation is not ident...
  - after: The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 13 index 13 editorial first_person_plural
  - before: The phrase 'Our base case generates 2.6x MOIC and 21% gross IRR' uses first-person plural, which is not appropriate for reporting commentary...
  - after: The phrase 'Our base case generates 2.6x MOIC and 21% gross IRR' uses first-person plural, which is not appropriate for reporting commentary...
- fixture 19 index 7 editorial first_person_plural
  - before: The phrase 'our 2024 third-party logistics investment' uses first-person plural, which is not acceptable in reporting commentary. The author...
  - after: The phrase 'our 2024 third-party logistics investment' uses first-person plural, which is not acceptable in reporting commentary.

### pass-2.json

- fixture 01 index 11 editorial voice_consistency
  - before: The statement 'We recommend approval.' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisati...
  - after: The statement 'We recommend approval.' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 06 index 7 editorial first_person_plural
  - before: The statement uses first-person plural 'our' and 'we' in a reporting commentary, which requires third-person voice. The authoring organisati...
  - after: The statement uses first-person plural 'our' and 'we' in a reporting commentary, which requires third-person voice.
- fixture 09 index 8 editorial first_person_plural
  - before: The phrase 'Our base case returns remain intact' uses first-person plural, which is not acceptable in reporting commentary. The authoring or...
  - after: The phrase 'Our base case returns remain intact' uses first-person plural, which is not acceptable in reporting commentary.
- fixture 13 index 12 editorial first_person_plural
  - before: The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary. The authoring organisation is not ident...
  - after: The phrase 'We project' uses first-person plural, which is not appropriate for reporting commentary.
- fixture 19 index 7 editorial first_person_plural
  - before: The phrase 'our 2024 third-party logistics investment' uses first-person plural, which is not acceptable in reporting commentary. The author...
  - after: The phrase 'our 2024 third-party logistics investment' uses first-person plural, which is not acceptable in reporting commentary.

## Left: a conflict labelled Nothing raised

The sentence label does not follow the display verdict. The verdict never reaches the label.

The label is set from the statement verdict. That function reads whether a fact was not found, and the note bucket when the bucket is a conflict or a beyond. It does not read the display verdict, the support state, or an evidence conflict. F13 employees and F18 completion were display conflict with no such fact and no such note, so the label stayed Nothing raised.

Making the label follow the display verdict would change the sentence label and the tier. Both are identity fields. This part leaves the bundle. The labels above are unchanged.

## Silent nothings

Knowing: each site writes a record when it happens. The stored accuracy cards do not contain those events, so this replay cannot count them. The record is on the next live payload.

Told, because the screen currently looks like nothing happened:

- A refused note on a sentence. The screen shows the line stored on the card. The sentence label stays Nothing raised.
- A withheld note on the draft, on the card summary and in the export. Those two surfaces had no line. The reading view already had its own line and was left as it was.

Recorded, and left off the screen:

- A note whose reassuring sentences were all removed. The bucket label is still there. The record says the text was cleared.
- A narrative-coherence concern removed while that check is off. The concern list is unchanged by this spec. The drop is counted.
- Card assembly failed. The safe card is unchanged apart from a silence that says the reason could not be determined.
- Fidelity, style, no-op, no-change, and evidence-language drops. Each drop is counted. The concern list is the list the filters already returned.
- A source-awareness drop and a forward-looking drop. Counted. The lists stay as the filters left them.
- Duplicate concerns merged. The merge was already logged. It is now also on the card.
- Gap sentences removed while a generic company name lifts support. The lift is unchanged. The removal is recorded.
- A paragraph removed from the writer piece because it did not quote the draft. Recorded on that response. Not a review-screen sentence.
- A passage with no letter or digit, and not marked unlocatable. Recorded. The screen still shows no passage, which is the right absence.
- Commentary not run. Recorded on the card. The commentary field stays empty.
- A card with no summary class. Recorded on the export, and marked on the card element. No new sentence.
- Proposals not loaded because that view is off. Recorded in memory. No new sentence, because this screen does not receive a line from the review.
- Disputes dropped from a note. Recorded on the card. The note text is unchanged.
- Draft marks dropped. The count was already returned. The reasons are now beside it. Not shown.
- A proposal that did not attach to a finding. The count was already computed. It is now on the attach result. Not shown.
- A save that failed for a reason other than size. Recorded in memory. There is no saved payload to put a line on, and the size failure already has its own notice.
- A replayed result that is not autosaved. Recorded on the replay stamp. Not shown.

## Files

- lib/qc/reader-lines.mjs
- lib/qc/worked-record.mjs
- scripts/diagnostic/b438/replay.mjs
- scripts/diagnostic/b438/REPLAY.md
- tests/b438-worked-record.test.mjs

