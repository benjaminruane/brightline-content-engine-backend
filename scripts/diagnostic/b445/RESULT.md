# B445

No model call. The 261 stored statements are `scripts/diagnostic/b441/pass-1.json`. Labels were not edited. Catch uses the same definition as B441: a planted fault is caught when any of the six layers spoke.

## Reasoning

The occurrence list lives on `span`. That array is already the list of offsets a click walks, and it is already the list stage 7 counts. A new field would have been a second copy of the same offsets. `quote` stays the exact text of the first occurrence, which is the whole quote when the statement has one. The prose fields `text`, `note`, `concernText`, and `suggestedDirection` name every occurrence. One occurrence is the same object the scan produced before this grouping. The editorial count on the card is `editorialConcerns.length`, so one concern per rule makes that count a count of rules.

The detectors, the quotation exemption, and the house-voice lookup are unchanged. A match inside paired double quotes is still skipped. The country abbreviation US is still skipped. Investor letters and LinkedIn posts still raise no first-person concern.

A draft mark is built from every span on the concern. One span still produces one mark. The click highlighter already walked the whole `span` array, so the frontend did not change.

Evidence leave-alone is the B441 quiet test with the scanned house-style concerns taken out of the editorial layer. Those codes are `percentage_notation`, `em_dash`, and `first_person_plural`. `voice_consistency` counts as that same first-person fault only when the concern text says first person or speaking as we. A voice switch that is not that fault still counts as editorial speech. The other five layers are unchanged, so a wrong factual challenge still removes the statement. House-style mentions are counted beside that number, one mention per concern, with the rule named. On the stored file a mention is an occurrence, because that file raised one concern per occurrence. After the scan, a mention is one rule on one statement.

The combined number is still B441 `quietOf`: quiet only when no layer spoke, house style included. The series back to B437 keeps that number. The split is `scripts/diagnostic/lib/leave-alone.mjs`. The B437, B440, and B441 score scripts were not rewritten. The next pass imports this module.

## As stored

Evidence leave-alone: 48 of 74.
House-style mentions:
- em_dash: 2 mentions on 2 statements.
- first_person_plural: 2 mentions on 2 statements.
- percentage_notation: 6 mentions on 6 statements.
- voice_consistency: 6 mentions on 6 statements.
Combined quiet: 38 of 74.
Catch: 11 of 11.

Confirmed `voice_consistency` concerns, and whether this split treats them as the first-person fault:
- fixture 01 index 11: house style. The statement 'We recommend approval' uses first-person plural, which is not appropriate for reporting commentary., so the first-person concern must be raised.
- fixture 04 index 11: house style. The statement switches from third-person to first-person plural with 'our diligence has been deeply positive'. Investor letters should maintain a consistent first-person plural voice.
- fixture 06 index 6: house style. The statement uses first-person plural 'we' in a reporting commentary, which requires third-person voice.
- fixture 09 index 14: house style. (i) The statement uses first-person plural 'We continue to expect', which is inconsistent with the third-person voice required for reporting commentary. (ii) The statement uses first-person plural 'We continue to expect', which is not acceptable in reporting commentary.
- fixture 19 index 6: house style. (i) The statement uses first-person plural 'We have responded', which is inconsistent with the third-person voice required for reporting commentary. (ii) The statement uses first-person plural 'We have responded', which is not acceptable in reporting commentary.
- fixture 20 index 0: house style. (i) The statement uses first-person plural 'We are pleased' in a reporting commentary, which requires third-person voice. (ii) The statement uses first-person plural 'We are pleased' in a reporting commentary, which requires third-person voice.

## After the scan

The model's scanned house-style concerns are removed and the scan is added. A card whose editorial verdict is `not_reviewed` is left as stored, because the live path does not scan that card either.
Confirmed cards left as not reviewed: 0.
Evidence leave-alone: 48 of 74.
House-style mentions:
- em_dash: 7 mentions on 7 statements.
- first_person_plural: 7 mentions on 7 statements.
- percentage_notation: 15 mentions on 15 statements.
Combined quiet: 32 of 74.
Catch: 11 of 11.

As stored, 10 confirmed statements are out of the combined number only because a house-style concern spoke. After the scan, that gap is 16.
20 of the 74 confirmed statements contain a spelled percentage or a long dash outside quotation marks. 6 of those were quiet as stored. 6 confirmed statements were quiet as stored and are not quiet once the scan is applied. A first-person concern did not remove any further quiet statement.
Combined quiet moves from 38 to 32. Evidence leave-alone stays 48.
Fixture 19 statement 11 is not in the confirmed 74. The stored card has no editorial concern. The grouped scan raises one percentage concern with 4 spans. The percentages are written '34 percent', '28 percent', '22 percent', and '40 percent'. Write them with %. The editorial count for that sentence is 1.

Cost: USD 0.
