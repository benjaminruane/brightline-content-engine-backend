# B421. HICL dirty run

Stored cards: `tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json`.
Stored reading: `scripts/diagnostic/b403c/runs/reading.json`, HICL doctored.
No model call. USD 0.

Risk order is the combined state, then draft order. Rank 0 is first.

| Statement | statementVerdict | combinedVerdict | Edge | Marks | Rank |
| --- | --- | --- | --- | --- | --- |
| 0 | not_in_source | not_in_source | red | none on the card | 0 |
| 1 | not_in_source | not_in_source | red | none on the card | 0 |
| 2 | not_in_source | not_in_source | red | "significant investment in expansion programs driving EBITDA growth that continues to significantly outperform budgets" beyond (causal) | 0 |
| 3 | not_in_source | not_in_source | red | none on the card | 0 |
| 4 | not_in_source | not_in_source | red | none on the card | 0 |
| 5 | not_in_source | not_in_source | red | none on the card | 0 |
| 7 | not_in_source | not_in_source | red | none on the card | 0 |
| 6 | conflicts | conflicts | red | none on the card | 1 |

Sort by risk puts statement 0 first. Statement 2 is not_in_source, because "budgets" is not in the source, and it shares rank 0 with the other not_in_source statements. Draft order places it third in that group, after statements 0 and 1.

Statement 6 is not a slate wording card on this stored run. The sentence is "The company also recently completed an oversubscribed refinancing, which will lead to an increase in debt servicing costs." The reading bucket is conflicts, so the combined state is conflicts and the edge is red. The text does not contain "copleted", and it says "increase", not "a reduction". There is no compliance concern on any of the eight cards, so there is no compliance-only statement to place below the reds and beyond.

The unit test for the draft-side proposal offers "completed" for a span whose text is "copleted" and whose direction is Replace 'copleted' with 'completed'. That case is not in the stored dirty cards.

## Ledger

The clean ledger still counts `statementVerdict`, not `combinedVerdict`.

demands 3, light 5, quiet 30, noise in demands 0.

A hard compliance concern on an otherwise quiet statement leaves the statement verdict at quiet and sets the combined verdict to compliance_risk. `summaryClass.cardTone` still follows the statement verdict. The card edge reads the combined tone.

## Drops, proposals, re-check

Passive-voice drops on this run: 0. No stored concern is `active_voice_preference`.

Forward-looking suppressions on this run: 0. The dirty source says the refinancing "enabled a step-down ... earlier than forecast". The draft says "will lead to". The span is not in the excerpt, so the filter does not fire.

Proposals offered: 0.
Refused (a) no span: 0.
Refused (b) empty slice: 0.
Refused (c) direction does not name a replacement: 1. That is the causal concern on statement 2.
Refused (d) the named text is not the span: 0.
Refused (e) the replacement is the same text: 0.

No proposal was offered for text that is not in the draft.

Re-check call count: two reviewer calls per changed statement, plus the note call that was already there. This report did not make those calls, so there is no measured reviewer cost. The unit test stubs both reviewers, corrects "copleted", and the structural_integrity concern, its mark, and its proposal are gone. `reviewerCalls` on that stub is 0.

## Design notes

The evidence line still reads the statement verdict. The card header is a separate line and reads `combinedVerdict.label`. `sentenceLabel` is unchanged.

The slate edge is `#64748b`, the same colour as the wording underline.

A concern span may be a list. The passive filter, the forward-looking drop, and the draft-side proposal use the first span that has `startChar` and `endChar`.

The forward-looking drop runs when the primary and conflict excerpts exist, in card assembly, and again on re-check when the statement still carries those excerpts. The compliance reviewer itself runs before those excerpts are chosen.

`factualBadge: false` now has a numeric rank. The old risk bucket returned the string "outline", and a numeric sort cannot use a string.

A compliance-risk statement uses the red sentence wash, so the draft matches the red edge. A wording mark underlines its phrase and does not tint the sentence.
