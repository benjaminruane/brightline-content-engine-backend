# B398. Binding measurement

| | |
|---|---|
| SHIPPED | Pending the verify:ship line. This commit is the measurement. |
| Cost | USD 0. No model calls. |
| Rules | `scripts/diagnostic/b398/BINDING.md`. B1 was written before the count and was not edited after it. B2 was added below B1 after B1 missed D3, and was not edited after its own count. |
| Evidence | `scripts/diagnostic/b398/runs/bind.json`. Before-column is `scripts/diagnostic/b397/runs/classify.json`. |
| Contract | `scripts/diagnostic/b398/CONTRACT.md`. Not implemented. |

Benchmark and set are dropped. B397 reached 0 of 1 on each. Benchmark also flagged HICL clean S3, which the source agrees with. Dropping them does not change the before-reach of 24, because both catches were already 0.

## M1. Reach on the 37

| Type | Of the 37 | B397 | B1 | B2 |
|---|---|---|---|---|
| quantity | 8 | 7 | 8 | 8 |
| date | 5 | 4 | 5 | 5 |
| name | 11 | 8 | 11 | 10 |
| ratio | 2 | 1 | 1 | 1 |
| rank | 1 | 1 | 1 | 1 |
| polarity | 3 | 3 | 2 | 3 |
| benchmark | 1 | 0 | dropped | dropped |
| set | 1 | 0 | dropped | dropped |
| open wording | 5 | 0 | 0 | 0 |
| Reach | 37 | 24 | 28 | 28 |

Rows that changed.

B1 gained five and lost one:

- 3i-S8-a, name, missed to caught. The redemption fragment scores 2 on "shares" and "proceeds", and MAIT is not in it.
- 3i-S14-a, name, missed to caught. The stance sentences score 3 on "cautious", "capital", and "deployment", and UK is not in them.
- hicl-S5-b, quantity, missed to caught. The tower sentences score 12, and 20 is not in them.
- clearpoint-S8-a, name, missed to caught. The winning sentence scores 6 and does not contain FDA.
- clearpoint-S9-b, date, missed to caught. The guidance sentence scores 2 on "revenue" and "million", and 2027 is not in it.
- clearpoint-S7-a, polarity, caught to missed. The winning sentence shares "velocity", "alpha", "speed", "surgical", "drill", and "system", and it does not contain "clearance".

B2 gained four and lost none. The four are 3i-S8-a, 3i-S14-a, hicl-S5-b, and clearpoint-S9-b. clearpoint-S7-a stays caught. clearpoint-S8-a stays missed, because a sentence that scores 2 or more does contain FDA.

## M2. Clean flags

B397 flagged 4 statements. One was right (HICL S1, HCIL against HICL). Three were wrong: the derived "five", the polarity flag on "company", and the benchmark flag on St. Pancras.

B1 flags 23 statements. The polarity flag and the benchmark flag are gone. The derived "five" remains, and 22 further statements are flagged because the single winning sentence does not hold a token that is in the source. Those flags are wrong, apart from HICL S1 and the June date on 3i S0 noted below.

B2 flags 18 statements. Each flag:

| Statement | Flag | Right or wrong |
|---|---|---|
| 3i S0 | name "3i Group" | Wrong. The document is 3i's. The name sits on the other side of a line break from "return" and "shareholders". |
| 3i S0 | quantity "six" | Wrong. The source says six months, to 30 September 2025. |
| 3i S0 | date "30 June 2025" | Right. The total-return period in the source ends 30 September 2025. 30 June 2025 is an earnings date in another line. |
| 3i S7 | quantity "EUR 1.6 billion" | Wrong. The source states the incremental loan. It is the other financing sentence. |
| 3i S8 | name "Action" | Wrong. Action completed the redemption. A line break puts "Action" on the line above "shares" and "proceeds". |
| 3i S9 | name "GIC", quantity "62.3%" | Wrong. Both are in the source, on the stake sentences. |
| 3i S12 | name "TCR" | Wrong. The source says the uplift is in TCR. |
| 3i S13 | name "3i" | Wrong. The dividend sentence does not repeat the name. |
| HICL S0 | name "HICL Infrastructure" | Wrong. HICL is the subject of the update. |
| HICL S0 | quantity "five" | Wrong. The span from 1 October 2025 to 28 February 2026 is five months. The source does not write the word. This is the B397 flag. |
| HICL S0 | date "28 February 2026" | Wrong. That date is the period end in the source. The sentence that holds it scores under 2. |
| HICL S1 | name "HCIL" | Right. The source writes HICL. |
| HICL S3 | name "London St. Pancras High Speed" | Wrong. The source uses that name for the train-path sentence. |
| HICL S4 | name "St. Pancras" | Wrong. The source says operations from St. Pancras. |
| GPI S0 | date "November 2025" | Wrong. The announcement is 13 November 2025. |
| GPI S1 | names Thailand, UK, Asian | Wrong. The facilities sentence states them. |
| GPI S3 | names Gold Peak Technology, GP Industries, Malaysia | Wrong. The Johor sentence states them. |
| ClearPoint S2 | quantity "16%" | Wrong. The organic-growth sentence in the source states 16%. |
| ClearPoint S3 | quantity "80%", "USD 5.9 million" | Wrong. The neurosurgery sentence states both. |
| ClearPoint S4 | quantity "177%" | Wrong. The capital-equipment sentence states 177%. |
| ClearPoint S7 | name of the Velocity drill | Wrong. The clearance sentence names that system. |
| ClearPoint S8 | name "Pacific" | Wrong. The source says Asia-Pacific on the completed-case sentence. The line break separates it from the license anchors. |

## M3. Catches B397 had, that binding loses

B1 loses one: clearpoint-S7-a, "submission" against "clearance". B397 caught it. The winning sentence is about the drill and does not contain the word "clearance". This is the number that kills B1.

B2 loses none.

## M4. The five presence misses

- 3i-S8-a. Bound, under B1 and under B2. MAIT is not in the fragment that shares "shares" and "proceeds".
- 3i-S14-a. Bound, under both. UK is not in the sentences that share "cautious", "capital", and "deployment".
- hicl-S5-b. Bound, under both. 20 is not in the tower sentences. Those sentences have 16.
- clearpoint-S8-a. Bound under B1, and caught. Still missed under B2. A sentence that scores 2 or more does contain FDA, so the wider set treats the name as found.
- clearpoint-S9-b. Bound, under both. 2027 is not in the sentence that shares "revenue" and "million". The risk-factor year scores under 2.

## N1. Non-breaking spaces

The extracted HICL source contains 26 non-breaking spaces, U+00A0. One of them is inside "1 October 2025".

The date matcher and the figure matcher both treat that character as whitespace. In `scripts/diagnostic/b392/elements.mjs` the date patterns and the figure patterns use `\s`, and in JavaScript `\s` includes U+00A0. A probe in `bind.mjs` extracts "1 October" plus a non-breaking space plus "2025" as the date key `2025-10-01`, and it matches a haystack that uses the same character. "GBP" plus a non-breaking space plus "3.3 million" matches the same figure written the same way. No harness change. Nothing in M1 or M2 moves because of this. The same `\s` behaviour is what a product matcher would need. This probe does not show a product defect.

## Decision

- D1, reach 28 or better. Met by B1 (28) and by B2 (28). The before number is 24.
- D2, wrong flags on the 38 at 1 or fewer. Not met. B397 had 3 wrong flags. B1 flags 23 statements. B2 flags 18, and 17 of those statements carry a wrong flag. The right flags are HICL S1 on both rules, and the June date on 3i S0.
- D3, no planted catch may be lost. Not met by B1 (clearpoint-S7-a). Met by B2 (zero).
- D4, ClearPoint doctored S3 must not come back as agreeing with the source. Met. Both rules leave it unreached. The ratio rule was not changed.

B1 is not a rule to build. It loses a catch and it flags correct sentences. B2 keeps every B397 catch, catches four of the five presence misses, and still flags 17 correct statements. A smaller honest reach was available by keeping B397. Widening the window to every sentence that scores 2 did not make the clean set safe. The line break in the extract cuts the token away from its anchors, and two shared words is enough to select a neighboring line.

## What to build

The binding rules are not worth building into `lib/` on these numbers.

Build the contract first. The owner has already rejected a sentence that reads as Not reviewed. That rejection does not depend on a binding rule, and the binding rule is not safe. The contract change is specified in `CONTRACT.md` and is not implemented here.
