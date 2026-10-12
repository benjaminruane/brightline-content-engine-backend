# B387. Aligned difference, scored

| | |
|---|---|
| SHIPPED | Recorded after verify:ship. |
| Cost | USD 0. No model calls. No live runs. |
| Evidence | The four doctored reviews, the clean reviews named below, their extracted sources, and `scripts/diagnostic/b385/labels.json`. |
| Pin | Token alignment, Needleman-Wunsch, match +2, mismatch -1, gap -1. On a tie the diagonal wins. Dropped passage words are recorded and are not flags. A flag is a substituted or added position. |
| Hypothesis file | `claude/redesign-hypothesis-v1.md` is not in this repo. This pass tests the hypothesis as stated in the B387 brief. |

The eight payloads are 3i doctored and clean, HICL doctored and clean, GPI doctored and clean run 2, ClearPoint doctored (`dirty1`) and clean run 1. The clean headline is those four clean files: 15 + 8 + 5 + 10 = 38 statements. GPI runs 3, 4 and 5, and ClearPoint clean runs 2 and 3, are the comparison set.

## How the two arms are built

CONFIRMED. `tokenizeQuantities` in `lib/revise-actions/conflict-engagement.mjs` is not the alignment alphabet. Its pattern emits figures, dates and currencies only, and the comment above that pattern says number words are not tokenised. A word such as MAIT, bartered or commenced would never become a position. This prototype tokenises words. T2 and T3 then merge number, currency and date phrases. The product tokeniser is not called.

Arm AS-SELECTED. If `primaryExcerptText` is empty, the card is unalignable (absent). If it is page furniture, the card is unalignable (furniture). Otherwise the passage is the primary excerpt plus any `supportSpans[].passage` that is not already contained in it. One global alignment.

Arm BEST-MATCH. Split the source on `.`, `!`, `?` or a newline, when the next non-space character is a capital letter or the text has ended. A decimal point between digits is not a break. Candidates are windows of one, two and three consecutive sentences, skipping any window longer than 80 tokens. The score is how many statement tokens, excluding a fixed stop list used only for this search, have a tier key that occurs in the window. Ties go to the shorter window, then the earlier offset. The statement is aligned to that window only.

Furniture, CONFIRMED as this definition and no other. After collapsing whitespace, the first 240 characters contain "Log In", "Sign Up" and "Newsroom". Or the excerpt is longer than 1000 characters and the first 300 characters contain "month ago".

A planted substitution is covered when a substituted or added position overlaps the written string in the statement. `£` and GBP, `$` and USD, `€` and EUR are treated as the same spelling for that search. One label string is not in the draft: GPI S1 "European market only". The draft says "primarily on the European market". The span used is "European market", and "only" is missing. It is still covered, because "European" is added against the facilities sentence the search selected.

## 1. The deciding number

Clean statements with at least one substituted or added position. T0 is no equivalence. T1 to T4 are cumulative.

| Tier | As-selected flagged | As-selected unalignable | As-selected substituted | As-selected added | Best-match flagged | Best-match substituted | Best-match added |
|---|---|---|---|---|---|---|---|
| T0 | 32 of 38 | 6 | 311 | 86 | 38 of 38 | 318 | 213 |
| T1 | 32 of 38 | 6 | 259 | 104 | 38 of 38 | 270 | 233 |
| T2 | 32 of 38 | 6 | 250 | 103 | 38 of 38 | 272 | 217 |
| T3 | 32 of 38 | 6 | 241 | 107 | 38 of 38 | 249 | 235 |
| T4 | 32 of 38 | 6 | 232 | 107 | 38 of 38 | 237 | 237 |

Best-match total flagged positions: 531, 503, 489, 484, 474. As-selected: 397, 363, 353, 348, 339.

Every alignable clean statement is flagged, in both arms, at every tier. The six unalignable clean statements are 3i S6, S7 and S10 (excerpt empty) and ClearPoint clean S0, S1 and S7 (furniture). They are counted in the 38. They are not skipped.

Distribution of flagged positions per alignable statement, written as `positions:statements`.

Best-match T0: `2:1 5:2 6:2 7:2 8:2 9:2 10:2 11:2 12:3 13:1 14:4 15:1 16:1 17:2 18:2 20:3 22:1 23:1 25:1 26:1 27:1 28:1`. The middle of that list is 13 or 14 positions.

Best-match T4: `4:2 5:2 6:5 8:1 9:5 10:1 11:2 12:4 13:4 14:1 16:2 17:1 18:1 19:2 22:1 23:1 25:2 27:1`. The quietest statement still has 4.

The quietest clean sentence is 3i S4: "Year to date like-for-like trading remains healthy despite weakening consumer confidence since the summer." At T0 the best passage produces two flags: `like-for-like` against `LFL`, and `healthy` against `good`. At T4, after the hyphen split, it is four: `like` added, `for` added, `like` against `LFL`, `healthy` against `good`.

A separate check, not the official count: at T3, before T4, every one of the 38 clean statements has at least one content token (stopwords left out) whose key is absent from the best passage. That is 267 tokens, mean 7. Changing the gap penalty would not clear the set. The words are not in the passage.

GPI runs 3, 4 and 5 match run 2 on best-match at T0 and at T4. They differ on as-selected statement 1 only: run 2 has 9 flagged positions at T0 and 6 at T4; runs 3, 4 and 5 have 33 at T0 and 32 at T4. ClearPoint clean 2 and clean 3 match clean 1 on best-match. They differ on as-selected statement 2: clean 1 has 25 positions at T0 and 25 at T4; clean 2 and clean 3 have 24 at T0 and 23 at T4.

The full flagged positions for 3i clean and HICL clean, best-match, T0 and T4, are the appendix.

## 2. Recall on the 37

Prediction, recorded before the run, quoted:

> at least 30 of 37 covered in arm BEST-MATCH. Specifically predicted as newly covered, versus the 27 the current comment layer names: Action written as MAIT; HICL written as HCIL; the wrong reporting period; sold written as bartered; Completion written as has been commenced; guidance as a point where the source gives a range; gains on one holding widened to essentially all investments; during the period written as during the past year. Predicted NOT covered: the vast majority of revenue, which is arithmetic against figures elsewhere and has no aligned counterpart.

Second prediction, quoted:

> with no equivalence rules, more than 19 of the 38 clean statements carry at least one flagged position.

| Arm | T0 | T1 | T2 | T3 | T4 |
|---|---|---|---|---|---|
| Best-match covered | 37 | 37 | 36 | 36 | 36 |
| Best-match not covered | 0 | 0 | 1 | 1 | 1 |
| As-selected covered | 30 | 30 | 30 | 30 | 30 |
| As-selected unalignable | 7 | 7 | 7 | 7 | 7 |
| As-selected not covered | 0 | 0 | 0 | 0 | 0 |

The "at least 30 of 37" prediction holds. Best-match covers 37 at T0 and T1, and 36 after T2. The "more than 19 of 38" prediction holds. Best-match flags 38. As-selected flags 32, and the other 6 have no passage to align.

Each of the eight "newly covered" predictions, best-match:

| Prediction | Id | T0 | T2 and after |
|---|---|---|---|
| Action written as MAIT | 3i-S8-a | covered | covered |
| HICL written as HCIL | hicl-S0-a | covered | covered |
| the wrong reporting period | hicl-S0-b | covered | covered |
| sold written as bartered | gpi-S4-c | covered | covered |
| Completion written as has been commenced | clearpoint-S8-b | covered | covered |
| guidance as a point where the source gives a range | clearpoint-S9-a | covered | not covered |
| gains on one holding widened to essentially all investments | 3i-S12-a | covered | covered |
| during the period written as during the past year | hicl-S5-c | covered | covered |

The first five, the seventh and the eighth hold at every tier. The range prediction holds at T0 and T1 and fails from T2.

Predicted not covered: "the vast majority of revenue" is clearpoint-S3-a. It is covered at every tier, in both arms. The prediction does not hold. The words are not in the aligned passage, so they are added or substituted. The diff does not need a second figure to mark them.

T2 is a failed tier. It removes the mark on clearpoint-S9-a. `USD 56 million` matches the `$56.0 million` at the top of "between $52.0 million and $56.0 million", and the rest of the range is dropped. Dropped is not a flag, so the point-versus-range error disappears. T3 and T4 inherit that miss. They remove no further planted mark. T1 and T4 remove none. As-selected never shows this failure because that card has no excerpt, so it is unalignable throughout.

T4, printed in full. Seven entries, from the tier-3 clean substitutions whose two sides are the same word under inflection or spelling. `cash` / `cashflow` appeared in a stem list and was left out. No other clean substitution was within two character edits. Cap 40.

1. continue = continues = continued
2. cover = covers = covering
3. investment = investments
4. maintain = maintaining
5. program = programme
6. return = returns
7. selective = selectively

T4 removes 10 best-match positions (484 to 474) and 9 as-selected positions (348 to 339). It clears no statement.

The flags that remain are not inflections. On the tier-3 best-match pairs, the repeated ones are added function words: the 14, in 9, for 7, to 7, and 6, of 5, was 5, which 5. A stopword list would drop those. It would not clear a statement. The 267-token check already ignores stopwords and still flags 38 of 38.

What remains, and has to be judged, is a different word, a different figure, or an extra clause. Named from the clean set, best-match:

- 3i S4. `healthy` against `good`. `like-for-like` against `LFL`.
- 3i S0. `GBP 3.3 billion` has no equal key for `£3,291 million`. `30 June 2025` is not the September date in the source window. `representing` is not in that window.
- 3i S2. `largely` against `primarily` at T0, and `continues` is absent until T4 folds it.
- HICL S4. `cross-Channel` against the extracted token `crossChannel`.
- HICL S5. `additional` against `incremental`.
- ClearPoint and GPI statements in the same run carry the same shape: extra clauses and substituted wording, 4 to 27 positions after T4.

That residue is the equivalence problem. Its size is 38 of 38 clean statements in the best-match arm, and 32 of 32 alignable clean statements in the as-selected arm, after every tier.

## 3. The passage-selection gap

At T0 the gap is 7 substitutions. Best-match covers 37. As-selected covers 30 and cannot align 7. As-selected's not-covered count is 0. Where the card has a prose excerpt, the diff marks every planted substitution in this set.

The 7 are absent excerpts, not furniture:

- HICL doctored S7, three substitutions (hicl-S7-a, hicl-S7-b, hicl-S7-c).
- ClearPoint doctored S0, clearpoint-S0-a.
- ClearPoint doctored S7, clearpoint-S7-a.
- ClearPoint doctored S9, clearpoint-S9-a and clearpoint-S9-b.

From T2 the gap is 6, because best-match also loses clearpoint-S9-a. That card was already unalignable on the as-selected arm.

Furniture, 4 cards, all `supported_full`, all ClearPoint. None of them hosts one of the 37.

| Card | Excerpt characters | Why |
|---|---|---|
| ClearPoint doctored S1 | 1738 | navigation bar leads the excerpt |
| ClearPoint clean S0 | 13667 | navigation bar leads the excerpt |
| ClearPoint clean S1 | 1738 | navigation bar leads the excerpt |
| ClearPoint clean S7 | 8292 | related-story chrome leads the excerpt |

The opening of the first three, collapsed, is "Log In Sign Up Products Pricing Customer Stories Resources Newsroom" and then the press release. S7 opens "ClearPoint Neuro Reports Second Quarter First Quarter 2026 Highlights 2026 Results 1 month ago".

Green cards with `supportSpans` empty: 6.

| Card | Excerpt characters | Excerpt |
|---|---|---|
| ClearPoint doctored S1 | 1738 | the navigation bar, as above |
| ClearPoint doctored S3 | 615 | prose, the neurosurgery revenue sentence |
| ClearPoint clean S0 | 13667 | the navigation bar, as above |
| ClearPoint clean S1 | 1738 | the navigation bar, as above |
| ClearPoint clean S7 | 8292 | related-story chrome, as above |
| ClearPoint clean S8 | 499 | prose, the Health Canada sentence |

Doctored S3 and clean S0 are the two named in the brief. The other four are in the same eight payloads. Clean S8 is green with no support span and a prose excerpt, so the as-selected arm still aligns it. Empty support spans and an unalignable passage are not the same count.

On the clean false flags, passage selection does not create the flags. Best-match, which ignores the stored excerpt, flags 38 of 38. As-selected flags every card it can align.

## 4. Q1 and Q2

Q1. Across the 76 cards in the eight payloads, `supportSpans` length is `0:8 1:47 2:16 3:5`. Twenty-one cards already store two or more passages. Eight store none.

On the 38 clean statements, the best three-sentence window contains at least two more content-token hits than the best single sentence on 25 statements. One passage does not hold the statement. The cases are 3i S0, S3, S4, S5, S7, S8, S9, S11, S12, S13, S14; HICL S2, S3; GPI S0, S1, S2, S3, S4; ClearPoint S0, S1, S2, S3, S4, S7, S8.

Several passages are common. Alignment as specified is statement-to-one-passage. On this set that unit does not cover the statement.

Q2. Eight doctored statements carry two or more planted substitutions: HICL S0, S5, S7; GPI S0, S1, S4; ClearPoint S8, S9. For each of those substitutions, the single best source sentence already produced a covering mark, and so did the one-to-three sentence window. HICL S5 and ClearPoint S9 were won by a one-sentence window. The other six were won by a two- or three-sentence window, but the one-sentence alignment had already covered every planted string.

So a single alignment can mark every planted error in these sentences and still leave other content in the same sentence outside that passage. That is what Q1 measures on the clean drafts: 25 of 38. The planted-error marks do not show that one alignment is enough for the sentence.

## 5. Does the hypothesis survive

The hypothesis fails.

Correct writing, on the clean set this pass was given, diffs against its best source passage on every statement. Format, currency, dates and a seven-entry inflection list do not clear one of them. The residue is a judgement that two different words, or a rounded figure and the figure it came from, are the same claim. That judgement is not a deterministic rule. Recall does not change this. Best-match marks 37 of the 37 at baseline, and the hypothesis still fails on the metric that decides it.

T2 makes the failure sharper. The same number-format rule that the tier exists to apply hides a planted range error, because 56 million matches the top of a 52-to-56 range and the rest of the range is a legal drop.

## 6. What this pass could not establish

It did not ask a reviewer whether each clean sentence is faithful. 3i clean S0 says 30 June 2025 and GBP 3.3 billion; the best source window says a September period and £3,291 million. Those flags are real string differences. This pass still counts them, because the brief defined the clean drafts as the false-flag set. It did not split that set into paraphrase and leftover disagreement.

It did not count extractor debris as its own class. The HICL lists contain `crossChannel` and bullet characters aligned to words. A source-cleanup rule might remove some of those. The statement count would still be 38, because the presence check is about words, not bullets.

It did not try a local alignment. The 267-token check is the reason that was left alone: the missing words are missing either way.

It did not test any passage ranker other than the window search stated above. That search is the ceiling only under that rule.

`claude/redesign-hypothesis-v1.md` is not in this repo, so this file cannot quote it. The hypothesis under test is the one in the B387 brief.

No product code was changed. Nothing under `lib/`, `api/` or `components/` was edited.

## Appendix. Flagged positions on two clean documents

Best-match. Each line is `class | statement text | passage text`. An added line has an empty passage side. T0 is no equivalence. T4 is after the seven-entry list.

### 3i clean and HICL clean, T0

-- 3i-clean S0 T0 best-match (20)
   added | a | 
   added | total | 
   substituted | return | strong
   substituted | of | performance
   substituted | GBP | in
   substituted | 3.3 | the
   substituted | billion | first
   substituted | for | half
   substituted | the | of
   substituted | six | FY2026
   substituted | months | •
   substituted | to | Total
   substituted | 30 | return
   substituted | June | of
   substituted | 2025, | £3,291
   substituted | representing | million
   substituted | a | or
   added | return | 
   substituted | shareholders | million,
   substituted | funds. | 10%).
-- 3i-clean S1 T0 best-match (18)
   substituted | private | Our
   substituted | equity | Infrastructure
   substituted | returns | return
   added | 14% | 
   added | for | 
   added | the | 
   added | period | 
   added | and | 
   added | accounted | 
   added | for | 
   added | the | 
   substituted | vast | £139
   substituted | majority | million,
   substituted | of | or
   substituted | the | 9%
   substituted | overall | (September
   substituted | total | 2024:
   substituted | return. | £43
-- 3i-clean S2 T0 best-match (5)
   substituted | largely | primarily
   substituted | Action, | underlying
   substituted | which | portfolio
   substituted | trade | uplift
   substituted | strongly. | in
-- 3i-clean S3 T0 best-match (8)
   added | The | 
   substituted | company’s | Action’s
   substituted | program | programme
   substituted | set | track
   added | Romania | 
   added | being | 
   added | well | 
   substituted | received. | Romania.
-- 3i-clean S4 T0 best-match (2)
   substituted | like-for-like | LFL
   substituted | healthy | good
-- 3i-clean S5 T0 best-match (11)
   added | Net | 
   substituted | sales | •
   substituted | for | In
   substituted | months | ending
   substituted | to | on
   substituted | amounted | ended
   substituted | to | P9
   substituted | EUR | 2024:
   substituted | 11.2 | €1,344
   substituted | billion, | million)
   substituted | with | and
-- 3i-clean S6 T0 best-match (8)
   substituted | Meanwhile, | 2025,
   added | several | 
   added | balance | 
   added | sheet | 
   added | transactions | 
   substituted | in | two
   substituted | October | financing
   substituted | 2025. | transactions.
-- 3i-clean S7 T0 best-match (17)
   substituted | company | transaction
   added | EUR | 
   substituted | 3.1 | €3.1
   substituted | maturities | debt
   substituted | meaningful | an
   added | savings, | 
   added | while | 
   added | also | 
   added | raising | 
   added | an | 
   added | incremental | 
   added | EUR | 
   added | 1.6 | 
   substituted | billion | saving
   added | new | 
   substituted | term | €14
   substituted | loan. | million.
-- 3i-clean S8 T0 best-match (6)
   added | also | 
   substituted | generated | were
   substituted | significant | redeployed
   substituted | proceeds | to
   substituted | for | acquire
   substituted | 3i. | a
-- 3i-clean S9 T0 best-match (23)
   substituted | A | £944
   substituted | portion | million
   substituted | these | gross
   substituted | was | were
   added | 2.2% | 
   added | stake | 
   added | in | 
   added | the | 
   added | business, | 
   added | which | 
   added | together | 
   added | with | 
   added | an | 
   added | earlier | 
   added | stake | 
   added | purchase | 
   added | from | 
   added | GIC, | 
   added | raised | 
   added | 3i’s | 
   added | Action | 
   added | to | 
   substituted | 62.3%. | Action.
-- 3i-clean S10 T0 best-match (26)
   added | Elsewhere, | 
   added | within | 
   added | the | 
   added | private | 
   added | equity | 
   added | portfolio, | 
   substituted | 3i | achieved
   substituted | completed | sterling
   substituted | the | money
   substituted | sale | multiples
   substituted | MPM | 3.2x
   added | signed | 
   added | an | 
   added | exit | 
   substituted | of | 2.8x
   substituted | MAIT | respectively.
   substituted | during | •
   substituted | the | Our
   substituted | period, | Infrastructure
   substituted | which | business
   substituted | money | investment
   substituted | multiples | return
   substituted | 3.2x | 9%
   substituted | and | (September
   substituted | 2.8x, | 2024:
   substituted | respectively. | £43
-- 3i-clean S11 T0 best-match (14)
   substituted | On | while
   substituted | side, | portfolio
   substituted | gross | within
   substituted | investment | 3iN
   substituted | returns | outperformed
   substituted | stood | its
   substituted | at | expected
   substituted | 9% | returns
   substituted | period, | and
   substituted | outperforming | MAIT
   substituted | expectations | further
   substituted | for | demonstrate
   substituted | six-month | disciplined
   substituted | period. | investment
-- 3i-clean S12 T0 best-match (20)
   substituted | Performance | This
   substituted | share | a
   substituted | price | 14%
   substituted | gains | increase
   substituted | at | in
   substituted | plc, | the
   substituted | which | six-month
   substituted | continues | period
   substituted | report | 3iN’s
   substituted | positive | underlying
   substituted | performance | portfolio
   substituted | across | continues
   substituted | its | to
   substituted | portfolio, | perform
   substituted | including | well,
   substituted | meaningful | with
   substituted | gains | a
   substituted | on | significant
   substituted | its | valuation
   substituted | investment | uplift
-- 3i-clean S13 T0 best-match (17)
   substituted | In | per
   substituted | light | share
   substituted | of | for
   substituted | the | FY2026,
   substituted | overall | set
   substituted | good | at
   substituted | performance | 50%
   added | portfolio, | 
   added | 3i | 
   added | declared | 
   substituted | a | total
   added | of | 
   added | GBP | 
   added | 0.365 | 
   added | per | 
   substituted | share, | for
   substituted | which | FY2025,
-- 3i-clean S14 T0 best-match (16)
   added | Looking | 
   added | ahead, | 
   added | management | 
   substituted | maintains | We
   substituted | its | remain
   substituted | stance | deployment
   substituted | on | of
   added | deployment | 
   substituted | investments, | investment,
   substituted | remains | will
   substituted | open | continue
   substituted | selective | selectively,
   substituted | allocations | including
   substituted | existing | know
   substituted | portfolio | and
   substituted | companies. | trust.
-- hicl-clean S0 T0 best-match (13)
   substituted | Infrastructure’s | which
   substituted | performance | relates
   substituted | for | to
   substituted | five | 1
   substituted | months | October 2025
   substituted | 2026 | the
   substituted | was | portfolio,
   substituted | positive | supporting
   substituted | and | our
   substituted | largely | confidence
   substituted | line | for
   substituted | with | the
   substituted | expectations. | year.
-- hicl-clean S1 T0 best-match (15)
   substituted | Across | has
   substituted | the | delivered
   substituted | portfolio, | robust
   substituted | was | the
   substituted | robust, | period,
   added | EBITDA | 
   substituted | growth | capex
   substituted | driven | programmes
   substituted | by | driving
   substituted | capital | EBITDA
   substituted | expenditure, | growth,
   substituted | and | alongside
   substituted | cashflow | cash
   substituted | HCIL’s | target
   substituted | program. | buybacks.
-- hicl-clean S2 T0 best-match (14)
   substituted | Across | ·
   substituted | the | |
   substituted | portfolio, | HICL's
   substituted | with | progressing
   added | investment | 
   added | in | 
   substituted | programs | and
   substituted | driving | delivering
   added | growth | 
   added | that | 
   added | continues | 
   added | to | 
   added | perform | 
   substituted | budgets. | expectations.
-- hicl-clean S3 T0 best-match (6)
   added | Among | 
   substituted | the | |
   substituted | significant | ·
   substituted | holdings, | |
   substituted | London | o  London
   substituted | during | in
-- hicl-clean S4 T0 best-match (14)
   substituted | On | The
   substituted | the | period
   substituted | commercial | saw
   substituted | front, | further
   added | has | 
   added | been | 
   substituted | made | in
   substituted | on | relation
   substituted | adding | to
   substituted | while | by
   added | recently | 
   substituted | announced | regarding
   substituted | cross-Channel | crossChannel
   added | Pancras. | 
-- hicl-clean S5 T0 best-match (5)
   substituted | Elsewhere, | |
   substituted | Fortysouth | o  Fortysouth
   substituted | additional | incremental
   substituted | and | HICL's
   substituted | gains. | assumption.
-- hicl-clean S6 T0 best-match (10)
   added | also | 
   substituted | oversubscribed | accretive
   substituted | refinancing, | refinancing
   substituted | will | and
   substituted | lead | which
   substituted | to | enabled
   substituted | reduction | step-down
   substituted | in | on
   substituted | servicing | revenues.
   substituted | costs. | |
-- hicl-clean S7 T0 best-match (18)
   substituted | Meanwhile, | from
   added | appointed | 
   added | a | 
   substituted | new | ahead
   substituted | CEO | of
   substituted | with | 31
   substituted | significant | March
   substituted | sector | 2026.
   substituted | experience | The
   substituted | and | Company
   substituted | stands | notes
   substituted | to | the
   substituted | benefit | publication
   substituted | from | of
   added | government’s | 
   added | recently | 
   substituted | published | Government
   substituted | reform. | |

### 3i clean and HICL clean, T4

-- 3i-clean S0 T4 best-match (11)
   substituted | a | FY2026
   added | GBP 3.3 billion | 
   added | for | 
   added | the | 
   added | six | 
   added | months | 
   added | to | 
   added | 30 June 2025 | 
   substituted | representing | £3,291 million
   substituted | a | or
   added | return | 
-- 3i-clean S1 T4 best-match (16)
   substituted | The | Our
   substituted | generated | a
   added | for | 
   added | the | 
   added | period | 
   added | and | 
   added | accounted | 
   added | for | 
   added | the | 
   added | vast | 
   added | majority | 
   added | of | 
   added | the | 
   added | overall | 
   added | total | 
   substituted | return | September 2024
-- 3i-clean S2 T4 best-match (6)
   added | This | 
   added | was | 
   added | driven | 
   added | largely | 
   added | by | 
   added | which | 
-- 3i-clean S3 T4 best-match (6)
   added | The | 
   substituted | company’s | Action’s
   substituted | set | track
   added | being | 
   added | well | 
   added | received | 
-- 3i-clean S4 T4 best-match (4)
   added | like | 
   added | for | 
   substituted | like | LFL
   substituted | healthy | good
-- 3i-clean S5 T4 best-match (9)
   substituted | for | of
   substituted | the | €1,563 million
   substituted | months | reporting
   substituted | to | periods
   substituted | 28 September 2025 | ended
   substituted | amounted | P9
   substituted | to | 2024
   substituted | EUR 11.2 billion | €1,344 million
   substituted | with | and
-- 3i-clean S6 T4 best-match (6)
   substituted | Meanwhile | October 2025
   added | several | 
   substituted | balance | two
   substituted | sheet | financing
   added | in | 
   added | October 2025 | 
-- 3i-clean S7 T4 best-match (13)
   substituted | company | transaction
   substituted | maturities | debt
   substituted | meaningful | an
   added | savings | 
   added | while | 
   added | also | 
   added | raising | 
   added | an | 
   added | incremental | 
   substituted | EUR 1.6 billion | saving
   added | new | 
   added | term | 
   substituted | loan | €14 million
-- 3i-clean S8 T4 best-match (5)
   added | also | 
   substituted | which | £944 million
   substituted | generated | of
   substituted | significant | gross
   substituted | for | to
-- 3i-clean S9 T4 best-match (23)
   substituted | A | returning
   substituted | portion | £944 million
   substituted | these | gross
   substituted | was | were
   added | 2.2% | 
   added | stake | 
   added | in | 
   added | the | 
   added | business | 
   added | which | 
   added | together | 
   added | with | 
   added | an | 
   added | earlier | 
   added | stake | 
   added | purchase | 
   added | from | 
   added | GIC | 
   added | raised | 
   added | 3i | 
   added | s | 
   added | to | 
   added | 62.3% | 
-- 3i-clean S10 T4 best-match (17)
   added | Elsewhere | 
   added | within | 
   substituted | the | Our
   added | portfolio | 
   substituted | 3i | team
   substituted | sale | realisation
   substituted | an | the
   substituted | exit | realisation
   substituted | during | in
   substituted | which | proceeds
   added | gross | 
   substituted | money | were
   substituted | multiples | £542 million
   substituted | 3.2x | received
   substituted | and | in
   substituted | 2.8x | the
   substituted | respectively | period
-- 3i-clean S11 T4 best-match (12)
   added | On | 
   substituted | the | Our
   substituted | side | a
   substituted | stood | £139 million
   substituted | at | or
   substituted | for | Infrastructure
   substituted | the | plc’s
   substituted | period | 3iN
   substituted | outperforming | share
   substituted | expectations | price
   substituted | for | in
   added | period | 
-- 3i-clean S12 T4 best-match (19)
   substituted | Performance | This
   substituted | share | a
   substituted | price | 14%
   substituted | gains | increase
   substituted | at | in
   substituted | plc | six
   substituted | which | month
   substituted | continues | period
   added | report | 
   substituted | positive | 30 September 2025
   substituted | performance | 3iN
   substituted | across | s
   substituted | its | underlying
   substituted | including | well
   substituted | meaningful | with
   substituted | gains | a
   substituted | on | significant
   substituted | its | valuation
   substituted | investment | uplift
-- 3i-clean S13 T4 best-match (16)
   substituted | In | per
   substituted | light | share
   substituted | of | for
   substituted | the | FY2026
   substituted | overall | set
   substituted | good | at
   substituted | performance | 50%
   added | portfolio | 
   added | 3i | 
   added | declared | 
   substituted | a | total
   added | of | 
   added | GBP 0.365 | 
   added | per | 
   substituted | share | for
   substituted | which | FY2025
-- 3i-clean S14 T4 best-match (13)
   substituted | Looking | active
   substituted | ahead | asset
   substituted | maintains | We
   substituted | its | remain
   substituted | stance | deployment
   substituted | on | of
   added | deployment | 
   substituted | remains | will
   substituted | open | continue
   substituted | allocations | including
   substituted | existing | know
   substituted | portfolio | and
   substituted | companies | trust
-- hicl-clean S0 T4 best-match (12)
   added | HICL | 
   substituted | Infrastructure’s | Portfolio
   added | for | 
   added | the | 
   added | five | 
   added | months | 
   added | to | 
   added | 28 February 2026 | 
   added | was | 
   added | positive | 
   added | and | 
   added | largely | 
-- hicl-clean S1 T4 best-match (13)
   substituted | Across | has
   substituted | the | delivered
   substituted | portfolio | robust
   substituted | was | the
   substituted | robust | period
   added | driven | 
   added | by | 
   added | capital | 
   added | expenditure | 
   substituted | and | alongside
   substituted | cashflow | cash
   substituted | HCIL’s | target
   substituted | program | buybacks
-- hicl-clean S2 T4 best-match (11)
   substituted | with | progressing
   added | investment | 
   added | in | 
   substituted | programs | and
   substituted | driving | delivering
   added | growth | 
   added | that | 
   added | continues | 
   added | to | 
   added | perform | 
   substituted | budgets | expectations
-- hicl-clean S3 T4 best-match (5)
   added | Among | 
   added | the | 
   added | significant | 
   substituted | holdings | o
   substituted | during | in
-- hicl-clean S4 T4 best-match (14)
   substituted | On | forecast
   substituted | commercial | saw
   substituted | front | further
   added | has | 
   added | been | 
   substituted | made | in
   substituted | on | relation
   substituted | adding | to
   substituted | while | by
   added | recently | 
   substituted | announced | regarding
   added | cross | 
   substituted | Channel | crossChannel
   added | Pancras | 
-- hicl-clean S5 T4 best-match (4)
   substituted | Elsewhere | o
   substituted | additional | incremental
   substituted | and | HICL's
   substituted | gains | assumption
-- hicl-clean S6 T4 best-match (9)
   added | also | 
   substituted | oversubscribed | accretive
   substituted | will | and
   substituted | lead | which
   substituted | to | enabled
   substituted | reduction | down
   substituted | in | on
   substituted | servicing | Fortysouth's
   substituted | costs | revenues
-- hicl-clean S7 T4 best-match (19)
   added | Meanwhile | 
   added | Affinity | 
   added | Water | 
   added | appointed | 
   added | a | 
   added | new | 
   added | CEO | 
   added | with | 
   added | significant | 
   added | sector | 
   substituted | experience | The
   substituted | and | Company
   substituted | stands | notes
   substituted | to | the
   substituted | benefit | publication
   substituted | from | of
   added | government’s | 
   added | recently | 
   substituted | published | Government
