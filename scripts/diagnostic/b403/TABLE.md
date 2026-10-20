# B403. Fact table gates

Written before either extraction call. The gate sentences below are not revised after a count comes back.

Model: `gpt-4o-2024-08-06`. Temperature 0. Seed 1. Two calls, same prompt, no retry. This pass asks for rows, not a judgement, so the extractor is the pinned QC model rather than the note model.

Source: `tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt`. One document. Line ids are the file's own lines, L1 through L58, blank lines included.

## Prompt

System:

```
You extract facts. You do not give a verdict, a judgement, or a comment.
Return a JSON object with one key, rows.
Each row has exactly these fields and no others: subject, element, value, period, lineId.
subject is the thing the fact is about, in the source's own words.
element is the attribute, in the source's own words.
value is copied from the cited line, not a paraphrase.
period is the period that governs the value, copied from the source, or an empty string when the cited line states no period.
lineId is L followed by the line number printed beside that line, for example L16.
One row per fact. No prose, no score, and no extra key.
```

User: the system instruction's source block is the 58 lines, each prefixed with its line id. The script sends that block unchanged.

## Gates

Applied in this order, on each extraction until G3, which compares the two: G1, then G5, then G2, then G3. G4 is not a drop. It is the lookup rule for a later claim.

G1. Line proof. A row passes when its line id is L followed by a line number that exists, and its value appears on that line verbatim, case-sensitive, with whitespace collapsed and a digit-bounded match so that 16 does not prove 160, or, when that fails, the value's figures and dates match figures and dates on that line under the B394 matcher, which includes scale folding, minor-unit folding, cardinals, range sharing and one-way date granularity, and every remaining word of the value appears verbatim on the line. Names and benchmark words are not folded. A row that fails is dropped.

G1 checks the value and the line. It does not check the subject or the period. A number copied from the right line can still be filed under the wrong subject. That is why G5 is added, and why a surviving row is still read against the whole source.

G5. Subject on the line. A row is dropped when its subject is empty, or when no subject word appears on the cited line. A word counts when it contains a letter and is not one of: a, an, the, of, and, or, for, to, in, on, by, its, with. Comparison is case-insensitive and ignores punctuation. The gate exists because line proof checks the value only, so a borrowed number would otherwise survive.

G5 does not catch a subject that is merely too broad. A line that names HICL will pass a subject of HICL even when the fact is about a portfolio company. A period-on-the-line gate is not added. The period is often stated once for a section, and the figure sits on a later line, so requiring the period string on the value's line would drop true rows.

G2. Arithmetic. A total row, whose element is the single word total, is dropped when at least two other rows share its subject and its period, each of those rows carries one figure that is not a percentage, and the sum of those figures does not equal the total under B394 figure equality. A percentage row is dropped when the same subject and period contain exactly two other rows whose values are single figures and not percentages, and the percentage is not either figure divided by the other, times 100, within one percentage point. Two rows that share a subject and an element, and state the same non-empty period, and state different values, are both dropped. A row that meets none of these three failure conditions is kept. Parts are not inferred from any element name other than the word total.

Requiring one period per subject would be the wrong gate. The source states two dividend years, and both are true. Different periods are therefore consistent. The same period with two values for the same element is not.

G3. Agreement. A row is kept only when the other extraction contains a row with the same subject, the same element, the same value and the same period, compared after lowercasing and collapsing whitespace. The line id is not part of agreement. A row that matches on those four fields is kept even when the line ids differ. That pair is reported as a different line and is not dropped. A row with no such partner is classed, in this order, as a different value when subject, element and period agree and the value does not, as a different subject when element, value and period agree and the subject does not, and as absent otherwise. The agreement rate is the number of row occurrences kept by G3 divided by the number of row occurrences that reached G3, counting both extractions. When several rows share a key, each occurrence is paired once.

G4. Typed comparison. A lookup returns a match only when subject, element and period each agree exactly with the row, after lowercasing and collapsing whitespace, and the value agrees exactly under that same normalisation or under the B394 scale folding and date normalisation used in G1, with date agreement applied in either direction. A partial match is any lookup that agrees on at least one field and is not a match. A partial match returns no match and is never a green. A finding, with no model judgement, is returned only when subject, element and period agree exactly and the value does not: the finding is the row's value against the looked-up value. A disagreement of subject, element or period returns no match and no finding, even when the value also disagrees.

The queries below are fixed from the statement's own words. They are not taken from whatever vocabulary the extraction happens to use.

| Id | Arm | Subject | Element | Value | Period |
|----|-----|---------|---------|-------|--------|
| clean-S0 | clean | HICL Infrastructure | performance | in line with expectations | five months to 28 February 2026 |
| clean-S1 | clean | portfolio | EBITDA growth | driven by capital expenditure | |
| clean-S2 | clean | growth investments | EBITDA growth | in line with budgets | |
| clean-S3 | clean | London St. Pancras High Speed | international train path bookings | slightly ahead of forecast | during the period |
| clean-S4 | clean | Virgin Trains | operations | cross-Channel operations from St. Pancras | |
| clean-S5 | clean | Fortysouth | new towers | 16 | during the period |
| clean-S6 | clean | company | refinancing | reduction in debt servicing costs | |
| clean-S7a | clean | Affinity Water | appointment | CEO | |
| clean-S7b | clean | Affinity Water | white paper | water sector reform | |
| doc-S0 | doctored | HCIL Infrastructure | performance | in line with expectations | six months to 31 December 2025 |
| doc-S1 | doctored | portfolio | EBITDA growth | average 30% | |
| doc-S2 | doctored | growth investments | EBITDA growth | significantly outperform budgets | |
| doc-S3 | doctored | Paris St. Germain High Speed | international train path bookings | slightly ahead of forecast | during the period |
| doc-S4 | doctored | Virgin Trains | operations | cross-Channel operations from St. Germain | |
| doc-S5 | doctored | TowerCo | new towers | 20 | during the past year |
| doc-S6 | doctored | company | refinancing | increase in debt servicing costs | |
| doc-S7a | doctored | Affinity Water | appointment | CFO | |
| doc-S7b | doctored | Affinity Water | white paper | electricity sector reform | |

doc-S2 is hicl-S2-a. doc-S5 is hicl-S5-b and hicl-S5-c, which share one sentence, so they share one query. doc-S7b is hicl-S7-c. clean-S2 is the real error "in line with budgets". A match on a doctored query, or on clean-S2, is a false green.

## Counts

The sentences above were not revised after these counts.

Call 1 returned 25 rows. Call 2 returned 23. G1 dropped 0 and 0. G5 dropped 12 and 12. G2 dropped 0 and 0. G3 kept 4 rows, 8 of the 24 occurrences that reached it. The agreement rate is 8/24.

The four kept rows are in `runs/facts-gated.json`. The classed disagreements are in `runs/gate-result.json`. The hand check, the lookups, and the verdict are in `PROBE.md`.
