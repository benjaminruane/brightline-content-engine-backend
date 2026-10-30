# B453 result

Replay of `scripts/diagnostic/b446/pass-1.json` (261 cards, 20 drafts) through the display code. No model call. USD 0.

The pass does not store `header.numbers` or the fact list. The header count below applies the display rule to each draft's sentences, with a numbers string present, the same way the screen receives one.

## Counts

- Partial cards carrying an evidence finding. Was 0 of 30. Now 12 of 12 cards whose shown state is partial. The other 18 partial-support cards have a louder shown state, so a partial finding is not added under that label.
- Drafts where header.numbers survives alongside the attention line. Was 3 of 20 (numbers were on screen only when the attention line was empty). Now 20 of 20 show the numbers. 17 of 17 drafts with an attention line also show the numbers.
- Cards printing "was not recorded" while holding a reason. Was 4. Now 0.
- Cards labelled "Needs a look". Was 0. Now 2: 06 index 3, 17 index 7.
- Cards identical on displayVerdict, sentenceState, sentenceLabel and tier: 259 of 261.

## The four sentences

- Fixture 08:16. The source does not mention a 'credible M&A roadmap,' which creates a gap in the statement. It does confirm that HPC has a defensible competitive position, operates in structurally growing markets, and has a clear operational improvement plan. The reviewer should consider adding a source that addresses the M&A roadmap or revising the statement to reflect the confirmed elements.
- Fixture 15:9. The source confirms the growth in own-brand share from 38% in 2020 to 54% in 2025 and supports the potential for further growth to 70%, contributing to gross margin expansion. However, the source specifies that each percentage point of own-brand penetration uplift is worth approximately EUR 4 million in gross margin, and it mentions a 250 basis points contribution to gross margin expansion, which is not stated in the original claim. The reviewer should consider clarifying the specific impact on gross margin expansion in the statement.
- Fixture 15:25. The source confirms that the model has been stress-tested for lease renegotiation, specifically stating that 10% of leases are renegotiated upward by 20% at the next break, resulting in a modest impact on returns. However, the statement does not specify these details, creating a gap in precision. To improve accuracy, the statement should include the specific percentage of leases and the renegotiation rate tested.
- Fixture 14 index 2. A note was written for this sentence and was not kept.

The three partial sentences are the stored evidence summary, passed through the same editor as a stage 2 explanation. The editor keeps that summary as one part, so the reader sees the summary's own words, including a sentence that tells the reviewer what to add. That is the recorded reason. It is not a new sentence.

The fourth sentence is the one chosen for a note that was stripped. The product removed every sentence of the note and left the label. A sentence that said what the source supports or does not support would put a claim back that the strip took out. The line only says a note was written and is not on the screen. It does not mention the source.

## Movement

Parts one, two and three do not write displayVerdict, sentenceState, sentenceLabel or tier. Part four writes those three fields, and not displayVerdict, only when the stored state is quiet and the card holds a refused note.

- 06:3. Nothing raised / quiet to Needs a look / demands. displayVerdict stays supported_full.
- 17:7. Nothing raised / quiet to Needs a look / demands. displayVerdict stays supported_full.

Catch. Before 11 of 11. After 11 of 11.
Evidence leave-alone on the confirmed 74. Before 45 of 74. After 45 of 74.
Combined quiet on the confirmed 74. Before 29 of 74. After 29 of 74.

The leave-alone module reads displayVerdict, the note bucket, and concerns. It does not read sentenceLabel. The two refused cards stay at the same display verdict, so the quiet counts do not move. That is the module, not a missed state change.

- Fixture 06:3. Not in the labelled set, so not in the confirmed 74.
- Fixture 17:7. Not in the labelled set, so not in the confirmed 74.

Wording notes stay withheld. 113 cards carry wording_note_withheld. 0 of them changed state or label. The silence is not rendered.

## What stayed put

No prompt, rule, detector, or schema change. The style guide, the mechanics scan, and the craft note are untouched. Silences are not rendered. The replay reads a silence id only to know that a note was refused or stripped.
