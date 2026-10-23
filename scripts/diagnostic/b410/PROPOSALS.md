# B410. Proposals, measured, not enabled

`NO_PROPOSAL` is unchanged. Nothing in this pass turns a proposal on.

## P1. The rule, written before the count

Class A. A not_found benchmark fact produces a proposal when the source uses at least one benchmark word. The replacement is the benchmark word whose first line is earliest in the source, and the evidence is that line. No other not_found fact produces a Class A proposal.

Class B. A not_found name produces a proposal only when exactly one name in the source is within Levenshtein distance 2 of the written surface and is not the same string. Two names at that distance, or none, produce no proposal. A fact that is not a name produces no Class B proposal.

Distance is case-sensitive. `HCIL` is not `HICL` until a proposal says so. The distance was not raised after the count.

## P2. Every not_found fact on the eight stored runs

22 not_found facts. 7 would produce a proposal.

| Run | Statement | Fact | Proposal | Verdict |
|-----|-----------|------|----------|---------|
| HICL clean | S1 | name `HCIL` | Class B, `HICL` | Correct. The source's name is HICL. |
| HICL clean | S2 | benchmark `budgets` | Class A, `target`, line L16 | Wrong. The sentence is EBITDA in line with budgets. L36 says "delivering EBITDA in line with expectations." The earliest benchmark word in the source is `target` on L16, which is the dividend cash cover. |
| HICL doctored | S0 | name `HCIL Infrastructure` | none | No name within distance 2. |
| HICL doctored | S0 | date `31 December 2025` | none | Not a name or a benchmark. |
| HICL doctored | S1 | figure `30%` | none | Not a name or a benchmark. |
| HICL doctored | S1 | name `HCIL` | Class B, `HICL` | Correct. |
| HICL doctored | S2 | benchmark `budgets` | Class A, `target`, line L16 | Wrong. Same miss as the clean sentence. The counterpart is expectations. |
| HICL doctored | S3 | name `Paris St. Germain High Speed` | none | No name within distance 2. |
| HICL doctored | S4 | name `St. Germain` | none | `St. Pancras` is further than distance 2. The rule produces no proposal. |
| HICL doctored | S5 | name `TowerCo` | none | No name within distance 2. |
| HICL doctored | S7 | name `CFO` | Class B, `RCF` | Wrong. Planted error hicl-S7-a. The source says Chief Executive Officer. RCF is a different wrong word. |
| HICL doctored | S7 | name `French` | Class B, `France` | Wrong. Planted error hicl-S7-b. The source says the UK government. France is a different wrong word. |
| 3i clean |  |  | none | No not_found fact. |
| 3i doctored | S0 | figure `GBP 3.3 million` | none | Not a name or a benchmark. |
| 3i doctored | S5 | date `30 June 2026` | none | Not a name or a benchmark. |
| 3i doctored | S9 | name `AGIC` | Class B, `GIC` | Correct. The source says the stake was acquired from GIC. |
| GPI clean |  |  | none | No not_found fact. |
| GPI doctored | S0 | date `October 2025` | none | Not a name or a benchmark. |
| GPI doctored | S0 | figure `75%` | none | Not a name or a benchmark. |
| GPI doctored | S1 | figure `15` | none | Not a name or a benchmark. |
| GPI doctored | S3 | name `Silver Hill Technology` | none | No name within distance 2. |
| GPI doctored | S4 | figure `60 billion` | none | Not a name or a benchmark. |
| ClearPoint clean |  |  | none | No not_found fact. |
| ClearPoint doctored | S0 | date `April 2026` | none | Not a name or a benchmark. |
| ClearPoint doctored | S2 | figure `-50%` | none | Not a name or a benchmark. |

The three correct proposals are HCIL to HICL on both HICL arms, and AGIC to GIC on 3i doctored.

The four wrong proposals are both `budgets` to `target`, `CFO` to `RCF`, and `French` to `France`.

## P3. False proposals

Corrected in B411. A false proposal has two shapes.

Shape 1, a proposal that would change a correct word. The count of 2 in the first writing of this file treated `CFO` and `French` as correct words. They are planted errors, hicl-S7-a and hicl-S7-b. That count was wrong. Shape 1 is 0.

Shape 2, a proposal that would replace a wrong word with a different wrong word. The four proposals that fail this shape are both `budgets` to `target`, `CFO` to `RCF`, and `French` to `France`. Shape 2 is 4.

`HCIL` to `HICL` and `AGIC` to `GIC` are the right counterparts. They are in neither count.

## P4. What the apply path needs

`applyDecisions` does not splice a word. It locates the whole statement, from `draftSpan` on the statement row or from one collapsed locate of `entry.statement`, and replaces that span with `entry.resultingSentence`.

A proposal entry has to carry:

- `id`
- `disposition` `ACTION`
- `statementId`
- `statement`, the sentence as written
- `resultingSentence`, that sentence after the one substitution

The word's own offsets are not an input. Two writes on one statement apply neither, which already stands.

## P5. Recommendation

Ship neither.

Class A, as written, proposes `target` for both `budgets` sentences. The counterpart in the source is `expectations`. That is shape 2. Class B's shape 1 count is 0 after the correction above, and its shape 2 count is 4. `St. Germain` against `St. Pancras` is outside distance 2, and the distance stays 2.

No proposal is enabled. The next spec can use these numbers.
