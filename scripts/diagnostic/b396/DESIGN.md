# B396. What the nine cards should conclude

| | |
|---|---|
| SHIPPED | pending verify:ship. |
| Cost | USD 0. No product code. No model calls. |
| Measurement | `scripts/diagnostic/b396/MEASUREMENT.md`. |

## Recommendation

Conclude the card from the whole source, not from the fragment recovery happened to show. Keep the quote. Change which sentences it is made of, and give the card a badge that names a mechanical result.

Read aloud, a clean sentence whose figures, dates and names are all in the source says: "Each of these is in the source." The quote is the source sentences that contain them, not a nearby fragment and not a 12,000 character join. The reviewer accepts the sentence or opens those sentences. They are not told the check did not review it.

A sentence that uses a ratio phrase, here "vast majority", is not green unless a part and a whole have been paired and the ratio meets the bar. If they have not been paired, the card says the scale word is unchecked and shows the quote it does have. If they fail the bar, the card names the phrase and the figures. It does not say the other tokens match.

That resolves M1 and M2 for these nine. M3 does not arise here. A sentence with no figure, date, name, or ratio phrase still cannot be greened without a model, and this proposal leaves that sentence as not reviewed. The owner has rejected that state. It is the residue, and none of these nine is in it.

The build is Stage 7. Move the element matcher out of `scripts/diagnostic/` into `lib/`, which B395 already named as the larger step. Search the source for each element and quote those sentences. Do not green a ratio phrase the arithmetic cannot pair. No new model call. The nine cards are the re-assembly test. ClearPoint doctored S3 must not come back green.

## Options

O1. Green when every element is in the displayed passage. Mark any element that is missing from that passage. This is the B386 section 5 candidate, narrowed to the element check.

It is mechanical and re-runnable, and it gives four of the nine a green and five a word-level mark. The green includes doctored S3, where the false words are "vast majority" and the elements in the passage are the true ones. The marks include clean S1 and GP Industries S1, where the missing words are in the source and absent only from the fragment. A reviewer would be sent to check correct sentences, and would be shown the planted error as confirmed. The long ClearPoint passages make "found in the passage" mean "found somewhere in a page dump".

O2. Stop recovering. An empty confirmation is a matcher failure. The card shows no passage and stays not reviewed, with the absence comment if one was written.

The card is coherent, because it no longer shows a quote under a badge that says the check did not review it. It is also the state the owner rejected, on all five clean statements, and it throws away source sentences the element check can already see. The reviewer opens the document with no pointer.

O3. Show the passage and no badge. The only conclusion is a mark on specific words.

Word marks are readable and they avoid the "not reviewed" label. A card with no badge is the rejected "not assessed" label in another form. On doctored S3 every element mark would be "found", so the card would look settled while the scale words stay unchecked. Marks without a badge do not tell the reviewer whether to accept the sentence.

O4. The recommendation above. The passage is evidence of where the tokens were found. The badge is the source locate plus the ratio rule. A fragment that happens to contain some of the tokens is not the thing being judged.

## Rejected

O1 is rejected. Part 2 rules it out. It would put ClearPoint doctored S3 back on a green card, and it would mark correct sentences for tokens the source contains. B386 already recorded that an element gate does not see "vast majority". The existing scale arithmetic would not catch it either if the card were greened first: that function runs only on a green card, and only when two displayed passages each hold one money figure. S3's quote is one passage, and it holds 5.9 and 3.3, not 12.1.

O2 is rejected. It satisfies the incoherent-quote constraint by deleting the quote, and it leaves 5 of 38 clean sentences in the state the owner rejected.

O3 is rejected as the whole answer. No badge is "not assessed". Combined with O1's passage test it would also hide S3, because every element mark would pass.

Restoring the B369 sentence "80% and 3.0 match the source" is rejected. Those sentences were filler written after the real comment had been wiped. A finding followed by reassurance is the defect. C5 stands.

Leaving the nine on "not reviewed" while they display a passage is rejected. It is what B395 shipped, it is incoherent read aloud, and it is the label the owner rejected, on 13 percent of the clean sentences.

## Predicted movement

Written before any implementation. Not a measured result.

The prediction uses Part 2 as it stands: every element of every card is in the whole source, and only doctored S3 carries a ratio phrase ("vast majority"). B386 recorded the source pair as 5.9 of 12.1. This pass did not re-run that arithmetic.

| Card | Now | Predicted |
|---|---|---|
| ClearPoint doctored S1 | not reviewed | green, quote widened to the sentences that hold 175 and IRRAflow |
| ClearPoint doctored S3 | not reviewed | not green. The mark names "vast majority". The 80% quote can stay. No match-the-source sentence |
| ClearPoint clean S0 | not reviewed | green, quote cut down from the 12,174 character join to the sentences that hold the date and the name |
| ClearPoint clean S1 | not reviewed | green, same widened quote as doctored S1 |
| ClearPoint clean S7 | not reviewed | green, quote cut down from the 7,059 character join |
| ClearPoint clean S8 | not reviewed | green, quote kept to the sentences that hold the names |
| GP Industries clean S1, runs 3, 4 and 5 | not reviewed | green, quote widened past the 39 character UK sentence to the sentences that hold the other counts and countries |

Five distinct clean statements leave "not reviewed". One doctored card, S3, stays off green for a reason that names the false words. Doctored S1 goes green because that sentence is not a planted substitution.

## What this pass could not establish

The movement above is a prediction. Nothing in `lib/` was changed, and the nine stored cards still say not reviewed.

M3 is empty on these nine only. The other clean sentences were not checked, so the size of the residue that would stay not reviewed is unknown.

`iCT` in clean S8 was not an element. Asia and Pacific were extracted as two names. Both of those names were found, so the class of S8 does not depend on the split. A token the matcher skips cannot be a mark and cannot block a green.

The current scale function was not run. The prediction that S3 stays off green follows from the phrase being present and from B386's recorded pair, not from a new call to `arithmeticScaleCheck`.
