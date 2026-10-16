# B392. The six-cell table

| | |
|---|---|
| SHIPPED | pending verify:ship on the measurement commit |
| Cost | USD 0. No model calls. No live runs. |
| Definition | `scripts/diagnostic/b392/ELEMENTS.md`, committed as `d107622` before any count. Not revised after a number. |
| Input | The four doctored drafts and the four clean drafts in the B390 held-out set. Model stance from `scripts/diagnostic/b390/runs/ids-1/cards.json` and `ids-2/cards.json`. Planted substitutions from `scripts/diagnostic/b385/labels.json`. |
| Evidence | `scripts/diagnostic/b392/elements.mjs`, `scripts/diagnostic/b392/cross-table.mjs`, `scripts/diagnostic/b392/runs/cross-table.json`. |

Stance is not in ELEMENTS.md. It is mechanical. The stance on an element is the verdict of the claim whose text contains that element's surface, after the same whitespace, quote and dash normalisation. Case sensitive. If more than one such claim exists, the most severe wins: `conflicting`, then `partially_confirmed`, then `confirmed`. A `not_supported` claim does not set a stance. If the only claims that contain the element are `not_supported`, or no claim contains it, the stance is silent. Those three verdicts collapse to contradicted, partial and supported. Partial stays its own column.

A planted substitution is tagged when an element's span overlaps the written text. The written text is located verbatim, with `£` and GBP (and the dollar and euro pairs) interchangeable. If that fails, the B387 token subsequence is used, and it counts only when at least 60 percent of the written tokens match. All 37 written strings located. A substitution is check-caught when any overlapping element is not found. It is caught only by the model when it is not check-caught and some overlapping element is found and contradicted.

## 1. The junk rate

The element definition is not ready. On the four clean drafts the extractor returned 110 elements. Nine are not real elements. That is 8.2 percent, above 5 percent.

Read one by one, the nine are:

- EBITDA, three times, on the HICL clean draft. A metric abbreviation, not a proper noun.
- Among, HICL statement 3. A sentence-initial function word, not on the closed exclusion list.
- CEO, HICL statement 7. A role, not a proper noun.
- MRI, ClearPoint statement 8. A modality abbreviation, not a proper noun.
- Notably, ClearPoint statement 7. A sentence-initial adverb.
- Organic, ClearPoint statement 2. A sentence-initial adjective.
- Topline, ClearPoint statement 3. A sentence-initial common word.

The required exclusions did their job. Elsewhere, On, Meanwhile, Performance and Net were not extracted. The junk is the next layer of common words and abbreviations, which the frozen list does not name. The definition was not revised after this count.

The other 101 were read and kept. That includes single-word names the definition asked for (Action, HICL's HCIL, Fortysouth, Johor, Switzerland), number words (three facilities, five months, six months), and the multiples 3.2x and 2.8x.

## 2. C3, the deciding cell

Every not-found element the model called supported is a false flag the model is right to clear. None is a mark the model is wrong about.

ids-1, seven cases. Model right 7. Model wrong 0.

ids-2, six cases. The same list without the last. Model right 6. Model wrong 0.

- Doctored 3i statement 13, figure GBP 0.365. The source says 36.5 pence per share. Same money. The matcher does not fold pence into pounds, so the mark is a false flag. Both passes.
- Clean HICL statement 0, figure five. The source states the period from 1 October 2025 to 28 February 2026 and does not write "five". That interval is five months. The draft is right. Both passes.
- Clean HICL statement 3, name Among. Not a real element. The mark should not exist. Both passes.
- Clean HICL statement 4, name Channel. The source writes `crossChannel` as one word, so the whole-word match misses it. The name is there. Both passes.
- Clean GPI statement 0, date November 2025. The source says 13 November 2025. A month and year does not match a full date, by the frozen rule. The month and year are in the source. Both passes.
- Clean ClearPoint statement 0, date May 2026. The source says May 13, 2026. Same granularity rule. Both passes.
- Clean ClearPoint statement 9, figure 56 million. The draft says USD 52-56 million. The currency sits on 52, so 56 million is bare, and a bare figure does not match `$56.0 million`. The money is the same. ids-1 only. On ids-2 the claim that contains it is not `confirmed`, so it is not in this cell.

## 3. The tables

Counts, and each cell as a percentage of all elements in that set. Both passes. Doctored is 109 elements. Clean is 110.

### ids-1 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found | 41 (37.6%) | 21 (19.3%) | 21 (19.3%) | 2 (1.8%) |
| not found | 16 (14.7%) | 5 (4.6%) | 1 (0.9%) | 2 (1.8%) |

### ids-1 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found | 5 (4.5%) | 43 (39.1%) | 51 (46.4%) | 0 (0.0%) |
| not found | 0 (0.0%) | 4 (3.6%) | 6 (5.5%) | 1 (0.9%) |

### ids-2 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found | 46 (42.2%) | 11 (10.1%) | 24 (22.0%) | 4 (3.7%) |
| not found | 17 (15.6%) | 4 (3.7%) | 1 (0.9%) | 2 (1.8%) |

### ids-2 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found | 5 (4.5%) | 41 (37.3%) | 53 (48.2%) | 0 (0.0%) |
| not found | 0 (0.0%) | 5 (4.5%) | 5 (4.5%) | 1 (0.9%) |

## 4. C1, C2, C4, C5

C1. On doctored drafts, not-found and contradicted is 16 of 24 not-found elements on ids-1, 66.7 percent, and 17 of 24 on ids-2, 70.8 percent. The model explains most not-found elements. It clears 70 percent on one pass only. NOT FOUND is partly informative. It is not reliably so.

C2. Not-found and silent is 2 on the doctored drafts and 1 on the clean drafts, both passes. Doctored: Topline and Notably on the ClearPoint doctored draft. Clean: Notably. All three are junk sentence-openers. The model's claim text drops the word, so no claim contains the element, and the mark stands with no explanation. They are residual ugliness, and they are junk from section 1, not unexplained real errors.

C4. Found and contradicted is the attachment case. On the doctored drafts, 7 of 37 planted substitutions are caught only this way, both passes: 3i-S8-a (MAIT), 3i-S14-a (the UK government), hicl-S5-b (20 new towers), gpi-S1-b (European market only), clearpoint-S8-a (the FDA), clearpoint-S9-a (USD 56 million), clearpoint-S9-b (2027). In each, the overlapping element is found in the source and the claim that contains it is contradicted. A further 18 are check-caught, because some overlapping element is not found. Eleven have no extracted element, so neither the check nor this cell can see them: 3i-S12-a, hicl-S2-a, hicl-S5-c, hicl-S6-a, hicl-S7-c, gpi-S0-c, gpi-S2-a, gpi-S4-a, gpi-S4-c (bartered), clearpoint-S3-a, clearpoint-S8-b (commenced).

On the clean drafts, found and contradicted is 5 elements, both passes, all on 3i clean statement 0, whose claim is `conflicting`. Read one by one: 3i Group, GBP 3.3 billion, six, and 13% are in the source and are right in this sentence. Those four are false additions, because the claim verdict spills onto every element the claim contains. 30 June 2025 is found because the source uses that date for a different fact (earnings in the 12 months to 30 June 2025). Used as the results period, it is wrong. That one is a true catch the element check cannot see.

C5. Found and supported on the clean drafts is 51 of 110 elements on ids-1, 46.4 percent, and 53 of 110 on ids-2, 48.2 percent. Under half of a clean draft's elements produce no item.

## 5. Worklist length per clean document

An item is any element that is not found-and-supported, plus one interpretive item for a statement the model marked (`displayVerdict` other than `supported_full`) when that statement has no such element. The interpretive item is not double-counted with its elements.

| document | statements | ids-1 items | ids-2 items |
|---|---|---|---|
| 3i | 15 | 18 (18 element, 0 interpretive) | 13 (13 element, 0 interpretive) |
| HICL | 8 | 12 (11 element, 1 interpretive) | 13 (12 element, 1 interpretive) |
| GPI | 5 | 17 (17 element, 0 interpretive) | 17 (17 element, 0 interpretive) |
| ClearPoint | 10 | 13 (13 element, 0 interpretive) | 15 (15 element, 0 interpretive) |

The one interpretive statement, both passes, is HICL statement 6, `supported_partial`: "The company also recently completed an oversubscribed refinancing, which will lead to a reduction in debt servicing costs." It has no element outside C5.

The throwaway check suggested roughly seven items on the 15-statement 3i clean draft. This pass finds 18 and 13. Both are above seven. GPI is the dense one: 17 items on 5 statements.

## 6. The four predictions

Quoted, then scored. A prediction holds only when it holds on both passes.

- "Not-found elements are under 5 percent of all elements on clean drafts." 11 of 110, 10.0 percent, both passes. Does not hold.
- "C1: the model explains at least 70 percent of not-found elements on doctored drafts." 16 of 24, 66.7 percent, on ids-1. 17 of 24, 70.8 percent, on ids-2. Does not hold.
- "C3 is under 15 percent of not-found elements." On doctored drafts, 1 of 24, 4.2 percent, both passes. On clean drafts, 6 of 11, 54.5 percent, and 5 of 11, 45.5 percent. Across both sets, 7 of 35, 20.0 percent, and 6 of 35, 17.1 percent. Does not hold.
- "The junk rate from the new element definition is under 3 percent." 9 of 110, 8.2 percent. Does not hold.

## 7. Verdict

The asymmetric rule needs changing. Section 2 is unanimous: every not-found element the model called supported is a false flag the model is right to clear, and the model is wrong about none of them. Refusing the override keeps marks that are pence unread as pounds, a month unread against a full date, a bare number unread against a currency, a name unread inside `crossChannel`, and one junk word. That is the cost the rule was supposed to be measured against, and the cost is the whole of C3.

Enrichment does not make NOT FOUND informative. On the doctored drafts the model contradicts 66.7 percent and 70.8 percent of not-found elements. That is most of them, and it misses the 70 percent bar on the first pass. The marks that stay silent are the junk sentence-openers in C2.

Section 1 still governs the rest. The element definition is not ready, at 8.2 percent junk. The C3 reading stands on the elements this definition actually produced, junk included. One of the seven false flags is the junk word Among. The other six are real elements the matcher missed.

## 8. What this pass could not establish

It did not retune the definition, so it cannot say what the junk rate would be after the next exclusions. It did not ask the model to clear a mark. Stance is the verdict of the claim that contains the element, and one contradicted claim marks every element inside it. That is why four of the five clean attachments in C4 are spillover. It cannot see the 11 planted substitutions that contain no figure, date or name. It spent nothing and called no model.
