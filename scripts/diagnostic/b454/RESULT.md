# B454 result

Replay of `scripts/diagnostic/b446/pass-1.json` (261 cards) through `sealReaderCard`. No model call. USD 0.

## Where the choke point sits

The endorsement list stays in `lib/qc/reading-contract.mjs`. `acceptNote` still refuses a reading note. The craft note still uses its own list. Neither list was edited.

`lib/qc/reader-prose-guard.mjs` is the other door. `releaseReaderProse` is the only call that tests a reader string against `noteEndorsement`. `sealReaderCard` is the card walk. It records a silence and replaces the string the reader would see. It does not rewrite `evidenceSummary`, `matchExplanations`, the reading note, or the craft note.

The walk sits on the card after assembly, after the dateline, and again when the reading contract returns the card, and on a recheck row. Export of an evidence finding uses the same function, because that string can leave without another pass over the card. The check is not copied at each writer. The writers still store what they stored.

A failing string becomes the line the partial path already uses when the reason was not recorded. It is not rewritten into a report. The silence id is `reader_prose_withheld`. The reason is the first phrase `noteEndorsement` hits. The screen does not render silences.

## Counts

- Partial cards whose composed sentence is now withheld: 21 of 30.
- Partial cards whose matcher explanation or stored ground fails the guard: 24 of 30. 3 of those compose a sentence that passes, because a later endorsing sentence is dropped when an earlier sentence already quotes every gap it quotes. Those 3 stay on screen: 04:20, 08:12, 18:9.
- Displayed evidence lines withheld: 5 of 56 present (5 failed the guard).
- Cards identical on displayVerdict, sentenceState, sentenceLabel and tier: 261 of 261.

## Other paths the seal blocks

These counts are silences on the sealed card, one per field per phrase per card. A stored field that fails and is not the string on screen is still a silence when the seal discards it.

- evidenceSummary: 234
- partialSentence: 21
- framingFidelityConcerns: 6
- displayedEvidenceProse: 5
- editorialConcerns: 2

Matcher explanations fail the guard on 211 of 260 cards that have one. The stored explanation is left as written. It reaches the reader only as the partial sentence, and only when that composed sentence passes.

Evidence summaries fail the guard on 234 of 261. The stored summary is left as written. The commentary the reader sees is the unrecorded line when the summary fails.

Reading notes: 155 present, 0 fail. 0 changed by the seal.

Concern rows walked: editorial 131, compliance 15, source recency 13, framing 10. Evidence finding notes on the stored cards: 1 present, 0 fail. Compliance, source recency, and stored finding notes added no silence.

## Phrases

Each count is a silence. The phrase is the first hit in `NOTE_BANNED_PHRASES`, which is the brief for a later matcher prompt change. This spec does not change that prompt.

- confirms the statement: 82
- supported: 73
- confirms that: 66
- confirmed: 29
- source confirms: 16
- correct: 1
- verified: 1

## Catch and quiet

Catch. Before 11 of 11. After 11 of 11.
Evidence leave-alone on the confirmed 74. Before 45 of 74. After 45 of 74.
Combined quiet on the confirmed 74. Before 29 of 74. After 29 of 74.

Leave-alone reads displayVerdict, the note bucket, and whether a concern is present. It does not read the concern's words, except the scanned house-style test for a first-person voice concern. No concern changed that test. No verdict field moved.

## What stayed put

No prompt, rule, detector, or schema change. `NOTE_BANNED_PHRASES` is unchanged. The matcher still writes what it writes. Wording notes stay withheld. Silences are not rendered.
