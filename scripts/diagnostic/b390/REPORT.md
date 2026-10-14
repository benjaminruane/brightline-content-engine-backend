# B390. Cite by line number, and group the source's own figures

| | |
|---|---|
| SHIPPED | `SHIP VERIFIED  0df32ad  main  166 files  1817 tests` |
| Cost | USD 0.8511 discounted across 36 calls. Ceiling USD 8. Not crossed. |
| Model | `gpt-5.1-2025-11-13`, temperature 0, seed 1, cache off. Same pin as B388. No tuning stage. |
| Split | Held-out only: fixtures 11 to 20, the four doctored drafts, the four clean drafts. Two passes. The prompt is B388's with the citation instruction changed and nothing else. |
| Evidence | `scripts/diagnostic/b390/runs/ids-1/cards.json`, `ids-2/cards.json`, `score-summary.json`, `score-stdout.txt`, `figure-groups.json`. |

## 1. Part A evidence containment, against B388's 69 percent

Citing by line id raises containment above B388's locate rate. It does not reach the 85 percent prediction.

B388 pass 1 located 158 of 229 quotations, exact plus normalised, 69 percent. Here the test is different, and it is the one the pass asked for: resolve each citation to the original lines, then ask whether that text contains every figure, date, and capitalised multi-word name in the claim. The extractor is B389's G2 (`missingElements`: `numberTokens`, `numberKeySet`, `capitalisedNames`, `dateKeys`).

| Pass | Contained | Of | Rate |
|---|---|---|---|
| ids-1 | 198 | 245 | 81 percent |
| ids-2 | 189 | 234 | 81 percent |

55 and 53 of those citations have no figure, date, or capitalised name in the claim, so they pass with nothing to find. Among claims that do have an element, containment is 143 of 190 and 136 of 181, 75 percent. Both cuts are above 69 percent. Neither is above 85 percent.

A citation of at most 6 lines contains the claim's elements in 170 of 209 and 162 of 201 cases, 81 percent. The wide ranges are not what keeps the rate under 85 percent.

## 2. Reference validity and the new wrong-lines failure mode

Invalid line references are gone on these two passes.

Of cited ids, out of range, malformed, or reversed: 0 of 1,135 on pass 1 and 0 of 975 on pass 2. No citation reproduced source text in a `passage` field. Three citations on pass 1 and six on pass 2 cited nothing (`lines` null). B388's comparable failure was 71 of 229 quotations not in the named source.

The new failure mode is wrong lines: a citation whose ids all exist, whose resolved text does not contain what the claim asserts. Pass 1: 47. Pass 2: 45. That is 47 of 245 and 45 of 234 citations, about 19 percent.

Some of those 47 and 45 are the extractor, not a bad pointer. G2 folds "one" and "three" into figures, and it treats "The Company", "Brookfield's SEK", "In May", and "CEO Mr. Tom Fairfield" as names the line must contain verbatim. The rate above is the specified extractor, not a cleaned subset. The misses that are real include a range that does not hold the claim's "19 percent", and lines that do not hold a figure the claim itself restated in a different unit.

Range discipline. Lines per citation, pass 1: 62 of length 1, 36 of length 2, 41 of length 3, 41 of length 4, 20 of length 5, 9 of length 6, and 36 longer than 6. The long tail is 7, 8, 9, 10, 11, 13, 37, 40, 45, 70, and 111 lines. Pass 2: 55, 35, 39, 32, 22, 18 at lengths 1 through 6, and 33 longer than 6, including 16, 24, 37, and 70. Exactly 6 lines: 9 and 18. Over the cap: 36 and 33.

How a citation was read, because the model did not use one syntax. An ascending pair `[7, 9]` is an inclusive range. A descending pair `[21, 13]` is two line ids: on fixture 15 the lower id is the other line that holds the figure, and pass 1 cited those lines separately. A nested pair `[0, 61]` is source 0, line 61. A nested triple `[0, 6, 7]` is source 0, lines 6 through 7. `{sourceId, lines: [2, 3]}` is a range in that source. A longer list of numbers is those line ids. A string range written high to low would still count as reversed. None of those occurred.

## 3. Recall on the 37, the clean 38, stability, parse failures

Recall on the 37 is 37 of 37 on both passes, by the B381 standard B388 used: the comment names the fault. B388 named 36. B389's gate left 34 and 32 usable. The B388 miss, GPI "bartered", is named on both passes here ("sold (not bartered)").

ClearPoint "has been commenced" is the same case B388 counted as named. Both comments treat "commenced" as consistent with a completed case, and the sentence is flagged because the same sentence writes Health Canada as the FDA, which is named. Counted as named, as B388 counted it. The comments are in `runs/score-stdout.txt`.

Clean drafts. Anything other than `supported_full` is a flag. Pass 1 flagged 17 of 38. Pass 2 flagged 16 of 38. B388 flagged 17 and 17. The brief's "17 and 11" does not match the committed B388 count. B389's gated pass 2 flagged 11. This comparison uses B388's 17 and 17.

The 9 wrong flags and the 8 real discrepancies, using the membership judged in B388.

Pass 1. All 9 wrong flags are still flags. 6 of the 8 real discrepancies are still flags. Two real ones are now `supported_full`: 3i clean statement 5 (nine months against nine reporting periods) and HICL clean statement 2 (budgets against expectations). The 17 also include 3i clean statement 13 (dividend "in light of"), which B388 flagged on pass 2 and judged wrong, and ClearPoint clean statement 4 ("low base"), which was not in B388's 17.

Pass 2. 7 of the 9 wrong flags remain. 3i clean statements 2 ("driven largely by Action") and 8 ("significant") are `supported_full`. Of the 8 real discrepancies, 3i statements 5 and 6 are `supported_full`, and the other 6 are still flags, including HICL statement 2, which pass 1 had greened. ClearPoint clean statement 9 ("updated" guidance) is a new flag. B388 judged that one wrong.

Stability. Same `displayVerdict` on 203 of 219 statements. B388 was 172 of 219, of which 33 movers were fixture 15 returning no JSON. Here 16 statements moved and none were missing.

Parse failures. None. Fixture 15 parsed on both passes. B388 lost it on pass 2 to a trailing comma. The raw text of a failed parse would have been kept. There was nothing to keep.

The labelled catch on fixtures 11 to 20, which this pass did not set out to move: 0 of 8 and 1 of 8. B388 was 5 of 8 on both passes. Leave-alone on the confirmed group: 37 of 40 on both passes. B388's full pass was also 37 of 40.

## 4. The prompt diff, showing one instruction changed

`prompt-final-ids.md` against `scripts/diagnostic/b388/prompt-final.md`. Two hunks, one change: the citation sentence and the JSON field that replaces `passage`. No verdict sentence moved.

```
-passage is copied verbatim from the named source, character for character, or null when no source passage decides the claim. A passage that is not in the source will be discarded along with the comment attached to it. sourceId is the id of that source, or null when passage is null.
+Cite evidence as a line id or an inclusive range of ids from the numbered source, at most 6 lines, the minimal range that contains the evidence. Never reproduce source text. The lines field replaces the passage field. Several non-contiguous ranges per claim are allowed, as a list. lines is null when no numbered lines decide the claim. sourceId is the id of that source, or null when lines is null.

-claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), passage (exact source text, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
+claims: an array of objects. Each object has statementIndex (the bracketed number), claim (the claim), verdict (one of the four names), lines (a line id, an inclusive range, or a list of those, or null), sourceId (the source id, or null), and comment (the comment explaining the review result).
```

## 5. Part B: fixture 13, found or not found

The margin pair is found in the raw candidate pairs and then removed by the time exclusion. The staff pair is not found. A pass that misses fixture 13 has failed. This one misses it.

`13_synth_internal_inconsistency_memo` is the corpus's designed internal-inconsistency memo. The README records no other fixture that way. The two F13 ARR rows that moved from Group A to Group B are a superseded figure, not a second within-source contradiction the label notes treat as this class.

Margin. Raw pair: line 10 `13%` against line 24 `11.1%`, shared words `million, ebitda, margin, investment, product, go-to-market`. The time exclusion drops it because the 13% window contains "trailing" and the 11.1% window does not. "Trailing twelve months" sits further from 11.1% than eight content words: the window is filled by margin, EBITDA, representing, million, stands, revenue. The exclusion removes the pair the memo was built to expose.

Staff. `320` (line 18, "CloudPivot employs 320 people") and `285` (line 66, "The total team of 285 people") never become a candidate pair. Their content windows share one word, `people`. The 320 window is offices and cities. The 285 window is the department split. The rule requires three shared content words. EUR 285 million is a different unit from 285 people, so the investment figure does not pair with the headcount either.

## 6. Part B candidate pairs, raw and after the time exclusion

Part B fails. The surviving pairs are mostly artefacts of an eight-word window, not contradictions, and the one designed contradiction that the raw pass finds is excluded.

The window is 8 content words each side, pinned before the run and not changed. Stopwords are removed for the shared-word test. The time exclusion reads the raw tokens in that same span, so `by`, `from`, and `to` are visible. Two figures are a candidate pair when the windows share at least 3 distinct content words, the numeric values differ, and the scale and unit agree. Unit is percent, or currency plus scale, or bare plus scale. A percentage is not paired with a currency. Figure keys come from `numberTokens`. The line is mapped back through a local fold of the same zero-to-twenty list, because `foldNumberWords` is not exported. The script never reads a draft.

Corpus: 21 sources from the 20 accuracy fixtures (fixture 18 has two) plus the four real-run sources. 1,942 figures.

| | Pairs |
|---|---|
| Raw, no exclusion | 10,481 |
| After the time exclusion | 3,167 |
| Of which on the same line | 614 |

The exclusion drops a pair when one window contains a year, a date, or a period word (`quarter`, `half`, `FY`, `trailing`, `forecast`, `expected`, `by`, `from`, `to`) that the other does not. It does not drop a pair when both windows contain the same period words. "From EUR 81 million today to approximately EUR 195 million" stays, because both windows contain `from` and `to`.

I read all 60 fixture-13 pairs that survive the exclusion.

| Judgement | Count | What they are |
|---|---|---|
| Real inconsistency | 0 | The 11.1% against 13% pair was excluded. The 320 against 285 pair was never a candidate. |
| Legitimate time series | 3 | EUR 84 million against EUR 52 million. EUR 81 million against EUR 195 million. EUR 76 million against EUR 185 million. |
| Legitimate scenario or case split | 6 | The 2.6x, 3.4x, and 1.5x MOIC cases, and the 21%, 28%, and 9% IRR cases. |
| Artefact | 51 | A stake against a margin, revenue against EBITDA, a customer count against a market count, "5 to 10 users" against "200+ users", a section number against a year. |

I did not read all 3,167 surviving pairs one by one. I read samples from the three largest sources (ClearPoint 1,558 kept, fixture 15 419, the 3i extract 377). They are the same artefact: "2026" paired with "4" and "30" because both windows say "first quarter results"; a customer count paired with a churn month because both say "customers". The time-series pairs are real and they are not the majority of what survives. The exclusion removes 7,314 pairs and leaves a set that is still mostly not a contradiction.

## 7. Spend against the ceiling

USD 0.8511 discounted. Pass ids-1 USD 0.4487, 18 calls. Pass ids-2 USD 0.4024, 18 calls. Ceiling USD 8. Part B made no model call. The meter was checked before each call and after each call. It was not crossed. No call was unpriced. No call timed out.

## 8. The four predictions, scored individually

Quoted as recorded before the run.

1. "Invalid line references under 5 per cent." Holds. 0 of 1,135 and 0 of 975.

2. "Evidence containment above 85 per cent, against B388's 69 per cent." Does not hold. 198 of 245 and 189 of 234, 81 percent. Above 69 percent. Below 85 percent.

3. "Recall on the 37 holds between 34 and 36." Does not hold. 37 of 37 on both passes, above the band. The GPI "bartered" miss from B388 was named.

4. "Without the date-qualifier exclusion, more than half the candidate conflicting pairs are legitimate time series." Does not hold. The raw set is 10,481 pairs. I did not label every one. The 183 raw fixture-13 pairs, and the samples from the largest sources, are mostly different measures that sit near each other. A year glued to a clock time is not a time series of one measure. The time-series share is not more than half.

## 9. Verdict on each part

Part A. Citing by line id removes the failure B388 measured, which was a quotation that does not occur in the source. Invalid ids are 0. No citation came back as copied text. Containment of what the claim asserts is 81 percent, against 69 percent. The replacement failure is wrong lines: 47 and 45 valid citations whose text does not contain the claim's figures, dates, or names. 36 and 33 citations run past the 6-line cap, one of them 111 lines. The citation failure is smaller, and it has changed kind. It is not gone. Recall on the planted 37 went to 37 of 37. The clean-draft flags did not: 17 and 16, with the 9 wrong flags still flags on pass 1, and two of the 8 real discrepancies greened.

Part B. Source self-inconsistency is not mechanisable this way. The staff pair the memo was written to contain is invisible at a window of 8 content words. The margin pair is visible and is then deleted because one side says "trailing" inside the window and the other says it just outside. What remains is thousands of pairs of numbers that share a neighbourhood and are not the same fact.

## 10. What this pass could not establish

Whether a single citation syntax, or a hard refusal of ranges over 6 lines, would move the 81 percent. The model used several shapes, and the long ranges were accepted and scored.

How many of the 47 and 45 wrong-lines are the G2 extractor folding a number-word or demanding a title-case phrase verbatim. The rate in section 1 is the specified extractor. A cleaned rate was not computed after the fact.

A line-by-line judgement of all 3,167 surviving pairs. Section 6 says what was read.

Whether any other window, or any other shared-word threshold, would surface 320 against 285. The window stayed at 8.

Catch on the labelled 8. It fell from B388's 5 of 8 to 0 and 1. That was not the claim under test. It is recorded in section 3 so it is not mistaken for an improvement.

One model, two passes, held-out only. No second model. No product code.
