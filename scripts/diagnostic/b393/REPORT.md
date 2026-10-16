# B393. The matcher and the element definition, re-run

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  2ede100  main  166 files  1817 tests` |
| Cost | USD 0. No model calls. The B390 cards are reused. |
| Definition | `scripts/diagnostic/b393/ELEMENTS-v2.md`, committed as `0f5065b` before any count. Not revised after a number. `scripts/diagnostic/b392/ELEMENTS.md` and `scripts/diagnostic/b392/REPORT.md` are unchanged. |
| Evidence | `scripts/diagnostic/b392/elements.mjs`, `scripts/diagnostic/b392/cross-table.mjs`, `scripts/diagnostic/b392/runs/cross-table.json`. |

The decision rule and the four predictions are copied from ELEMENTS-v2.md. They were fixed before this count.

## 1. The junk rate

The element definition is ready. The four clean drafts yield 101 elements. None of them is junk. That is 0.0 percent, under 3 percent.

The nine junk elements from B392 are gone: EBITDA three times, Among, CEO, MRI, Notably, Organic, Topline. No new generic abbreviation had to be added to the list. The surfaces that are easy to mistake for junk, and that were kept, are Channel, European, Asian, and Gold Peak Technology. Each is a real name.

## 2. The surviving C3 cases

One case, both passes. Clean HICL statement 0, the figure five, in "the five months to 28 February 2026". The claim is `confirmed`.

It is a derived figure. The source states the period from 1 October 2025 to 28 February 2026 and does not write "five". The writer counted the months. The model is right that the sentence is supported. The mark is the number the source does not state.

No other not-found element is supported. Doctored C3 is empty on both passes. The other clean not-found element is the name HCIL on HICL statement 1, stance partial, so it is not in this cell. HCIL does not match HICL. That mark is a real name the source does not contain.

## 3. The decision rule applied

The asymmetric rule stands if the surviving C3 cases are 4 or fewer and every survivor is a derived figure, meaning arithmetic the writer performed that the source does not state.

The asymmetric rule needs a named carve-out if the survivors are 4 or fewer but include cases that are neither derived figures nor junk. Name the class.

The asymmetric rule needs relaxing if 5 or more survive and they are not a single nameable class.

The element definition is ready at a junk rate under 3 percent, and not ready at 3 percent or above.

Applied. One survivor, and it is a derived figure. The asymmetric rule stands. The definition is ready, from section 1.

## 4. Every B392 number beside its new value

B392 is the committed table in `scripts/diagnostic/b392/REPORT.md`. A cell is shown when the count moved. Percentages are of all elements in that set.

Junk rate: 9 of 110 (8.2 percent) beside 0 of 101 (0.0 percent).

Clean elements: 110 beside 101. Doctored elements: 109 beside 100.

### ids-1 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B392 | 41 (37.6%) | 21 (19.3%) | 21 (19.3%) | 2 (1.8%) |
| found, now | 38 (38.0%) | 20 (20.0%) | 22 (22.0%) | 2 (2.0%) |
| not found, B392 | 16 (14.7%) | 5 (4.6%) | 1 (0.9%) | 2 (1.8%) |
| not found, now | 14 (14.0%) | 4 (4.0%) | 0 (0.0%) | 0 (0.0%) |

Moved: found contradicted 41 to 38, found partial 21 to 20, found supported 21 to 22. Not-found contradicted 16 to 14, partial 5 to 4, supported 1 to 0, silent 2 to 0.

### ids-1 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B392 | 5 (4.5%) | 43 (39.1%) | 51 (46.4%) | 0 |
| found, now | 5 (5.0%) | 42 (41.6%) | 52 (51.5%) | 0 |
| not found, B392 | 0 | 4 (3.6%) | 6 (5.5%) | 1 (0.9%) |
| not found, now | 0 | 1 (1.0%) | 1 (1.0%) | 0 |

Moved: found partial 43 to 42, found supported 51 to 52. Not-found partial 4 to 1, supported 6 to 1, silent 1 to 0. Found contradicted stays 5.

### ids-2 doctored

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B392 | 46 (42.2%) | 11 (10.1%) | 24 (22.0%) | 4 (3.7%) |
| found, now | 43 (43.0%) | 10 (10.0%) | 25 (25.0%) | 4 (4.0%) |
| not found, B392 | 17 (15.6%) | 4 (3.7%) | 1 (0.9%) | 2 (1.8%) |
| not found, now | 15 (15.0%) | 3 (3.0%) | 0 | 0 |

Moved: found contradicted 46 to 43, found partial 11 to 10, found supported 24 to 25. Not-found contradicted 17 to 15, partial 4 to 3, supported 1 to 0, silent 2 to 0.

### ids-2 clean

| | contradicted | partial | supported | silent |
|---|---|---|---|---|
| found, B392 | 5 (4.5%) | 41 (37.3%) | 53 (48.2%) | 0 |
| found, now | 5 (5.0%) | 40 (39.6%) | 54 (53.5%) | 0 |
| not found, B392 | 0 | 5 (4.5%) | 5 (4.5%) | 1 (0.9%) |
| not found, now | 0 | 1 (1.0%) | 1 (1.0%) | 0 |

Moved: found partial 41 to 40, found supported 53 to 54. Not-found partial 5 to 1, supported 5 to 1, silent 1 to 0. Found contradicted stays 5.

C1, share of doctored not-found elements the model contradicts. 16 of 24 (66.7 percent) beside 14 of 18 (77.8 percent). 17 of 24 (70.8 percent) beside 15 of 18 (83.3 percent).

C2, not-found and silent. Doctored 2 beside 0. Clean 1 beside 0. Both passes.

C3, not-found and supported. Doctored 1 beside 0, both passes. Clean 6 beside 1 on ids-1, and 5 beside 1 on ids-2. The distinct cases were seven and six. One remains.

C4, planted substitutions caught only by a found-and-contradicted element. 7 of 37 beside 7 of 37, both passes. The same seven ids. Check-caught 18 beside 17. Uncovered 11 beside 12. The one that moved is hicl-S7-a, "appointed a new CFO". CFO is now a generic abbreviation, so the substitution has no element. The clean found-and-contradicted count stays 5, the same five on 3i statement 0: four spillover additions and the true catch on 30 June 2025.

C5, clean found and supported. 51 of 110 (46.4 percent) beside 52 of 101 (51.5 percent). 53 of 110 (48.2 percent) beside 54 of 101 (53.5 percent).

Worklist, items on each clean document.

| document | statements | B392 ids-1 | now ids-1 | B392 ids-2 | now ids-2 |
|---|---|---|---|---|---|
| 3i | 15 | 18 | 18 | 13 | 13 |
| HICL | 8 | 12 | 7 | 13 | 8 |
| GPI | 5 | 17 | 16 | 17 | 16 |
| ClearPoint | 10 | 13 | 9 | 15 | 12 |

3i did not move. HICL, GPI, and ClearPoint all shortened. ids-2 HICL gained a second interpretive item, statement 2, because dropping EBITDA left that marked sentence with no element outside C5. Statement 6 stays interpretive on both passes.

## 5. Why 80 percent did not match

The ClearPoint source says revenue "increased 80% to $5.9 million". The v1 range rule treated `to` as joining two ends of one range and copied the following scale onto the first figure. `80%` became 80 million percent. That does not equal 80 percent, so the check said not found.

The value is not special-cased. v2 does not share a currency or a scale when either figure is a percent. `80% to $5.9 million` stays an 80 percent figure beside a dollar figure. The run asserts that `80%` is found in that sentence. A real range, `USD 52-56 million`, still copies both the currency and the scale onto both ends.

## 6. Could a calculation close the derived figure

Yes for this one case, and the source already has the information. It states the period from 1 October 2025 to 28 February 2026. An inclusive count of calendar months from October through February is five. That is a date subtraction on two dates the extractor already finds. No model, no new text.

The cost is the choice of count. An exact anniversary does not give five: five months after 1 October is 1 March, and 2026 is not a leap year, so 28 February is short of that anniversary. The inclusive month count matches the draft and would also clear a draft that rounds a short final month up to a whole month. A percentage calculator is not required for the survivor this pass actually has. It was not built.

## 7. The four predictions

Quoted from ELEMENTS-v2.md, then scored.

- "The junk rate comes in under 3 percent." 0 of 101, 0.0 percent. Holds.
- "C3 drops from 11 to 3 or 4." The new cell is 1 on both passes, not 3 or 4. The committed B392 cell was 7 and 6, not 11. Does not hold.
- "Every surviving C3 case is a derived figure." The one survivor is the figure five. Holds.
- "The three derived figures from B392 all survive: HICL clean five months, and no other category joins them." Five months survives, and no other category joined it. The committed B392 cell contained one derived figure, not three. The other six committed C3 cases were matcher misses or the junk word Among, and they are gone. Does not hold.

## 8. What this pass could not establish

It did not build the month-count, so it does not know whether that count would clear a true error somewhere else in a larger corpus. It still takes stance from the claim that contains the element, so one contradicted claim still marks every element inside it. That is why the five clean attachments on 3i statement 0 did not move. hicl-S7-a, CEO written as CFO, is now invisible, because both words are on the generic-abbreviation list. Eleven other planted substitutions still contain no figure, date, or name. It spent nothing and called no model.
