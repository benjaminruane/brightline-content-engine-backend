# B411. The model names the fix. The matcher verifies it.

`QC_PROPOSALS` is off. Nothing in this file turns it on.

## The rule

A proposal is offered only when all three pass, in this order.

1. The fact is `not_found`.
2. The model names a replacement. `none` is an answer, and so is leaving the field out. Both count as no replacement.
3. The replacement is in the source by the same equivalence the matcher uses: the B394 abbreviation table, scale folding, and date normalisation. It is the same kind of element. `CEO` passes against `Chief Executive Officer`.

Offered, in P1 to P4, means those three steps. The action entry also needs the card's passage. A card with no passage does not get an entry. That gate is named below. It is not how offered is counted.

## Bar, written before the run

Both false-proposal counts are 0 among proposals that are offered. At least five of the seven known-good pairs are offered and correct.

The note bar, written before the note run: clean conflicts stay at or below 2. Clean statements marked stay at or below 8. Noise in demands stays 0.

## The note got worse, so the proposal has its own call

The note prompt asked for an optional replacement field. On the four clean drafts, against the stored B403C notes:

N1. Clean conflicts rose from 2 to 3. ClearPoint clean S7 moved from `wording` to `conflicts`. The other clean bucket moves: 3i S7 moved from `beyond` to `wording`. HICL S7 moved from `none` to `wording`. GPI S2 moved from `wording` to `none`.

N2. 3i clean S7 no longer says that "meaningful" adds a judgement the source does not make. The new note says the statement restates the €14 million saving without asserting a different number. The figures it cites are the source's figures. No other clean note states a source fact that is false. ClearPoint S7's new text is right about one procedure against "procedures". Its bucket is the N1 failure.

N3. Clean statements marked stayed at 8, because 3i S7 left the marked set as ClearPoint S7 entered it. Noise in demands is 1. ClearPoint S7 is not one of the three firm errors.

The replacement field was taken off the note prompt. The proposal is a separate call, one per statement that has a `not_found` fact. A statement with no missing fact is not called.

Note-run cost, measured, `claude-opus-4-7`, temperature omitted, cache off. Estimate before the call: USD 7.0151 list, 76 statements, one retry included. Ceiling USD 8. Not crossed.

| Draft | Calls | List USD |
| --- | ---: | ---: |
| 3i clean | 15 | 0.398635 |
| 3i doctored | 15 | 0.405140 |
| HICL clean | 9 | 0.289005 |
| HICL doctored | 11 | 0.362530 |
| GPI clean | 5 | 0.101610 |
| GPI doctored | 5 | 0.110885 |
| ClearPoint clean | 12 | 0.603730 |
| ClearPoint doctored | 12 | 0.612680 |
| Eight drafts | 84 | 2.884215 |

76 statements, 8 retries. Input 505948, output 14179, cached 0. List USD 2.884215. Discounted USD 2.884215. Opus has no cached rate. Per statement, USD 0.037950.

## P1 to P3. The separate call

`not_found` facts across the eight stored runs: 22. That confirms B410's count.

P1. 15 named a replacement. 7 answered `none`.

P2. All 15 named replacements are in the source, and each is the same kind of element. None of the named replacements failed the presence check.

P3. All 15 offered proposals are the source's counterpart for that fact. Shape 1, a proposal that would change a correct word: 0. Shape 2, a proposal that would replace a wrong word with a different wrong word: 0.

| Draft | Fact | Replacement | Source line |
| --- | --- | --- | --- |
| 3i doctored S0 | `GBP 3.3 million` | `£3,291 million` | Total return of £3,291 million or 13% on opening shareholders' funds. |
| 3i doctored S5 | `30 June 2026` | `28 September 2025` | In the nine reporting periods ending on 28 September 2025, Action generated net sales of €11,229 million. |
| 3i doctored S9 | `AGIC` | `GIC` | 3i acquired 2.2% of Action equity from GIC. |
| HICL doctored S0 | `HCIL Infrastructure` | `HICL Infrastructure PLC` | The document title is HICL Infrastructure PLC. |
| HICL doctored S0 | `31 December 2025` | `28 February 2026` | The update relates to the period from 1 October 2025 to 28 February 2026. |
| HICL doctored S1 | `HCIL` | `HICL` | The same company name. |
| HICL doctored S3 | `Paris St. Germain High Speed` | `London St. Pancras High Speed` | London St. Pancras High Speed performed well in the period. |
| HICL doctored S4 | `St. Germain` | `St. Pancras` | Virgin Trains, cross-Channel operations from St. Pancras. |
| HICL doctored S5 | `TowerCo` | `Fortysouth` | Fortysouth delivered 16 new towers during the period. |
| HICL doctored S7 | `CFO` | `Chief Executive Officer` | Affinity Water appointed Mark Garth as Chief Executive Officer. |
| HICL doctored S7 | `French` | `UK` | The UK Government white paper on water sector reform. |
| GPI doctored S1 | `15` | `three` | The Group currently operates three facilities in Malaysia. |
| GPI doctored S3 | `Silver Hill Technology` | `Gold Peak Technology Group` | GP Industries is owned 86.18% by Gold Peak Technology Group. |
| ClearPoint doctored S0 | `April 2026` | `May 13, 2026` | SOLANA BEACH, Calif., May 13, 2026. ClearPoint Neuro announced results. |
| ClearPoint doctored S2 | `-50%` | `16%` | 16% year-over-year total organic growth. |

The seven `none` answers, not offered: HICL clean `HCIL`, HICL clean `budgets`, HICL doctored `30%`, HICL doctored `budgets`, GPI doctored `October 2025`, GPI doctored `75%`, GPI doctored `60 billion`.

## P4. The known-good seven

Six were offered and correct. One was missed.

| Pair | Result |
| --- | --- |
| `HCIL` to `HICL` | Offered on HICL doctored S1, and as `HICL Infrastructure PLC` on S0. Correct. Missed on HICL clean S1, where the model answered `none`. |
| `budgets` to `expectations` | Missed. Clean S2 and doctored S2 both answered `none`. The source says delivering EBITDA in line with expectations. |
| `St. Germain` to `St. Pancras` | Offered and correct. |
| `TowerCo` to `Fortysouth` | Offered and correct. |
| `CFO` to `CEO` | Offered as `Chief Executive Officer`. The abbreviation table accepts that pair. Correct. |
| `French` to `UK` | Offered and correct. |
| `AGIC` to `GIC` | Offered and correct. |

The bar holds: both false-proposal counts are 0, and six of the seven pairs were offered and correct.

## P5. A different subject

None. Each offered replacement is the source's word for the same fact. The lines are in the table above. `UK` also appears on the rail-regulator sentence. The Affinity sentence's counterpart is the UK Government white paper, and that is the replacement.

## P6. Cost of the proposal call

Estimate before the call: USD 1.0839 list, 18 statements, output ceiling 512, one retry included. Ceiling USD 3. Not crossed. No retry.

List USD 0.456960. Discounted USD 0.456960. 18 calls. Input 85342, output 1210, cached 0. Per statement called, USD 0.025387.

| Draft | Calls | List USD | Per statement |
| --- | ---: | ---: | ---: |
| 3i clean | 0 | 0 | no missing fact |
| 3i doctored | 3 | 0.063935 | 0.021312 |
| HICL clean | 2 | 0.052740 | 0.026370 |
| HICL doctored | 7 | 0.185885 | 0.026555 |
| GPI clean | 0 | 0 | no missing fact |
| GPI doctored | 4 | 0.064310 | 0.016078 |
| ClearPoint clean | 0 | 0 | no missing fact |
| ClearPoint doctored | 2 | 0.090090 | 0.045045 |

## What the flag would emit, and does not

The flag is off, so the action list is unchanged.

If it were on, an offered proposal becomes an `ACTION` entry only when the card has a passage. The entry's `quotedPassage` is that passage, and `resultingSentence` is the statement with the one substitution. Two cards have no passage, so those proposals would not be emitted: HICL doctored S7 (`CFO`, `French`) and ClearPoint doctored S0 (`April 2026`). They remain offered under P1 to P4. They do not get a second line of the model's choosing.

## The header

The wording count comes off the numbers line. The Wording marker does not come back. `counts.wordingNotes` is still stored. It is not on the line.

HICL clean now reads:

`16 of 18 facts matched · 2 to look at · 1 worth a glance`

`2 facts are not in the source.`
