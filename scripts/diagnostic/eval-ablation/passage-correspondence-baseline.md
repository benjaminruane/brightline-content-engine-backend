# Absolute passage correspondence baseline

Free. No model calls.
Evidence: `r10-corpus-blast-rows.json` (corpus blast `ce3d85e`), both arms, 378 pairs each.
Figure extractor: same family as `run-passage-selection-sizing.mjs` (percent, multiple, money, bare number; years 1900-2099 skipped).
Correspondence: ALL = every unique statement figure value appears in the selected passage (kind-compatible); SOME = at least one; NONE = zero.

## Universe

```
pairs per arm:                 378
figure-bearing (R3a):          200
figure-bearing (R10):          200
pairIds missing source reload: 0
```

CONFIRMED: figure-bearing counts from extractFigures on statementText in corpusRows.

## Absolute correspondence by arm

```
R3a  ALL=131 SOME=19 NONE=50 (n=200) NONE_rate=25.0%
R10  ALL=132 SOME=18 NONE=50 (n=200) NONE_rate=25.0%
```

## By final label

```
--- R3a ---
  confirmed              ALL=115 SOME=9 NONE=3 (n=127) NONE_rate=2.4%
  conflicting            ALL=7 SOME=4 NONE=15 (n=26) NONE_rate=57.7%
  no_support             ALL=0 SOME=1 NONE=23 (n=24) NONE_rate=95.8%
  partially_confirmed    ALL=9 SOME=5 NONE=9 (n=23) NONE_rate=39.1%
--- R10 ---
  confirmed              ALL=115 SOME=10 NONE=3 (n=128) NONE_rate=2.3%
  conflicting            ALL=9 SOME=4 NONE=15 (n=28) NONE_rate=53.6%
  no_support             ALL=0 SOME=1 NONE=24 (n=25) NONE_rate=96.0%
  partially_confirmed    ALL=8 SOME=3 NONE=8 (n=19) NONE_rate=42.1%
```

## By fixture / document shape

```
--- R3a ---
  nordholt         ALL=7 SOME=3 NONE=30 (n=40) NONE_rate=75.0%
  supersession     ALL=3 SOME=2 NONE=7 (n=12) NONE_rate=58.3%
  MF_probe         ALL=6 SOME=0 NONE=4 (n=10) NONE_rate=40.0%
  F18              ALL=7 SOME=4 NONE=3 (n=14) NONE_rate=21.4%
  F12              ALL=0 SOME=0 NONE=2 (n=2) NONE_rate=100.0%
  F01              ALL=3 SOME=1 NONE=1 (n=5) NONE_rate=20.0%
  F13              ALL=6 SOME=2 NONE=1 (n=9) NONE_rate=11.1%
  F17              ALL=8 SOME=0 NONE=1 (n=9) NONE_rate=11.1%
  F93              ALL=3 SOME=0 NONE=1 (n=4) NONE_rate=25.0%
  corpus_E1        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  corpus_E2        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  corpus_E3        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  F02              ALL=5 SOME=0 NONE=0 (n=5) NONE_rate=0.0%
  F03              ALL=3 SOME=0 NONE=0 (n=3) NONE_rate=0.0%
  F04              ALL=5 SOME=1 NONE=0 (n=6) NONE_rate=0.0%
  F05              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F06              ALL=4 SOME=1 NONE=0 (n=5) NONE_rate=0.0%
  F08              ALL=8 SOME=1 NONE=0 (n=9) NONE_rate=0.0%
  F09              ALL=6 SOME=0 NONE=0 (n=6) NONE_rate=0.0%
  F10              ALL=3 SOME=0 NONE=0 (n=3) NONE_rate=0.0%
  F11              ALL=8 SOME=1 NONE=0 (n=9) NONE_rate=0.0%
  F15              ALL=16 SOME=1 NONE=0 (n=17) NONE_rate=0.0%
  F16              ALL=8 SOME=0 NONE=0 (n=8) NONE_rate=0.0%
  F19              ALL=6 SOME=2 NONE=0 (n=8) NONE_rate=0.0%
  F20              ALL=6 SOME=0 NONE=0 (n=6) NONE_rate=0.0%
  F22              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F23              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F92              ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
--- R10 ---
  nordholt         ALL=7 SOME=3 NONE=30 (n=40) NONE_rate=75.0%
  supersession     ALL=3 SOME=2 NONE=7 (n=12) NONE_rate=58.3%
  F18              ALL=7 SOME=3 NONE=4 (n=14) NONE_rate=28.6%
  MF_probe         ALL=7 SOME=0 NONE=3 (n=10) NONE_rate=30.0%
  F12              ALL=0 SOME=0 NONE=2 (n=2) NONE_rate=100.0%
  F01              ALL=3 SOME=1 NONE=1 (n=5) NONE_rate=20.0%
  F13              ALL=6 SOME=2 NONE=1 (n=9) NONE_rate=11.1%
  F17              ALL=8 SOME=0 NONE=1 (n=9) NONE_rate=11.1%
  F93              ALL=3 SOME=0 NONE=1 (n=4) NONE_rate=25.0%
  corpus_E1        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  corpus_E2        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  corpus_E3        ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
  F02              ALL=5 SOME=0 NONE=0 (n=5) NONE_rate=0.0%
  F03              ALL=3 SOME=0 NONE=0 (n=3) NONE_rate=0.0%
  F04              ALL=5 SOME=1 NONE=0 (n=6) NONE_rate=0.0%
  F05              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F06              ALL=4 SOME=1 NONE=0 (n=5) NONE_rate=0.0%
  F08              ALL=9 SOME=0 NONE=0 (n=9) NONE_rate=0.0%
  F09              ALL=6 SOME=0 NONE=0 (n=6) NONE_rate=0.0%
  F10              ALL=3 SOME=0 NONE=0 (n=3) NONE_rate=0.0%
  F11              ALL=8 SOME=1 NONE=0 (n=9) NONE_rate=0.0%
  F15              ALL=16 SOME=1 NONE=0 (n=17) NONE_rate=0.0%
  F16              ALL=7 SOME=1 NONE=0 (n=8) NONE_rate=0.0%
  F19              ALL=6 SOME=2 NONE=0 (n=8) NONE_rate=0.0%
  F20              ALL=6 SOME=0 NONE=0 (n=6) NONE_rate=0.0%
  F22              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F23              ALL=2 SOME=0 NONE=0 (n=2) NONE_rate=0.0%
  F92              ALL=1 SOME=0 NONE=0 (n=1) NONE_rate=0.0%
```

## Comparison that matters

```
R3a NONE rate: 25.0% (50/200)
R10 NONE rate: 25.0% (50/200)
absolute difference: 0.0 pp; count delta NONE=0
adjudication: SIMILAR
```

CONFIRMED: NONE rates are not materially different. Absolute non-correspondence is a long-standing product property under both arms. R10 did not introduce it.

Cross-check vs prior relative-drift sizing (figure-bearing pairs whose passage changed):

```
passage changed among figure-bearing: 22
of those, R10 bucket NONE:            11
(Prior f18-s7 note: 46 passage changes overall, 24 figure-bearing, 12 NONE-of-draft-figures on R10. Counts here are figure-bearing-only universe.)
```

## Better passage available? (R10 NONE only)

Live arm = R10. Better = a different source sentence containing the statement's figures (ALL preferred; SOME counted separately). False friends rejected as listed below.

```
R10 NONE cases:                         50
missing source text on reload:          0
has ALL-figure sentence elsewhere:      3
has SOME-only elsewhere (no ALL):       6
no better sentence in source:           41
cases that hit at least one rejection:  0
```

CONFIRMED: hasAllBetter=3 is the strict "looked in the wrong place" set (source has a sentence with every draft figure).
The SOME-only set (6) includes F18_S7:18b (ARR 35/38 correction line has 38 but not 95): model still looked elsewhere; that is the blast loss mechanism.
Together, 9/50 NONE cases have an unused figure-bearing sentence. The other 41 have no such sentence in that source (often multi-source nordholt pairs where the figure lives on a different source label).
Concentration: nordholt alone is 30/50 R10 NONE cases (CONFIRMED: byFixture nordholt NONE=30).

### False friends rejected (examples)

```
(none)
```

Rejection rules used: (1) percent figure matched only as bare number without %/IRR/MOIC cue;
(2) money figure matched only as bare count without currency/scale cue;
(3) multiple matched only as bare number without x/times/MOIC cue.

## Is NONE predictive of a wrong label?

Sample method: stratified: up to 8 per label from NONE under R10 (n=27 of 50).
Defensibility is a heuristic read of whether the label can stand given source figure presence and unused better sentences. Not gold adjudication.

```
defensible: 30
suspect:    12
mixed:      2
unclear:    6
```

```
nordholt-clean:S4:IC memo
  label=confirmed betterALL=false def=suspect
  note=confirmed with NONE passage and source has no statement figures
  stmtFigs=percent:19
  selected: Reported EBITDA margin is 18.6 per cent. Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.

F01:S1:01_bvp_shopify_memo
  label=confirmed betterALL=false def=unclear
  note=source has some figures; need case read
  stmtFigs=number:5, number:500, number:10
  better: We plan to invest $5mm and thereby own 20% on a fully-diluted basis.
  selected: Shopify has grown at an impressive rate. With limited marketing, customers have increased from 5,500 a year ago to nearly 10,000 today (+81% Y/Y).

F18:S6:18a_synth_cross_source_pair_initial
  label=confirmed betterALL=true def=suspect
  note=confirmed while citing NONE of figures, yet source has ALL-figure sentence
  stmtFigs=percent:40
  better: Approximately 40% of Nordic property management companies still use legacy systems or spreadsheets.
  selected: First, the product is genuinely market-leading. Independent customer research conducted as part of diligence rated NSH significantly higher than the principal N

nordholt-clean:S1:IC memo
  label=conflicting betterALL=false def=unclear
  note=source has some figures; need case read
  stmtFigs=number:14, number:720
  better: INVESTMENT COMMITTEE MEMORANDUM - NORDHOLT LOGISTICS Date: 14 March 2023 Prepared for the Investment Committee of Ashford Capital Partners Fund IV 1.
  selected: At the date of this memo the business runs 12 facilities and employs 640 people, principally in Sweden.

nordholt-dirty:S0:fact sheet
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=percent:18
  selected: Net IRR to date (Ashford Fund IV): 14 per cent

nordholt-dirty:S0:LP update
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=percent:18
  selected: Nordholt Logistics continues to perform in line with our underwriting.

nordholt-dirty:S1:IC memo
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=number:15, number:800
  selected: At the date of this memo the business runs 12 facilities and employs 640 people, principally in Sweden.

nordholt-dirty:S1:press release
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=number:15, number:800
  selected: Following the transaction, Nordholt operates 14 facilities across the Nordic region.

nordholt-dirty:S1:fact sheet
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=number:15, number:800
  selected: Employees: 720
Facilities: 14 (Sweden, Denmark, Finland)

nordholt-dirty:S4:IC memo
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=percent:25
  selected: Reported EBITDA margin is 18.6 per cent. Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.

supersession:S1:source_A_annual_report_2019
  label=conflicting betterALL=false def=suspect
  note=conflicting with NONE and source lacks figures
  stmtFigs=number:720
  selected: At 31 December 2019 the fund held 12 portfolio companies across three sectors, and the underlying businesses employed 640 people in aggregate.

nordholt-clean:S0:IC memo
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:14
  selected: The Committee notes that projected returns are attractive but are not guaranteed.

nordholt-clean:S0:press release
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:14
  selected: Nordholt Logistics today announced the completion of its acquisition of Baltic ColdCo, extending the group's cold-chain network into Finland.

nordholt-clean:S2:IC memo
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:70, money:155
  selected: Revenue is underpinned by multi-year customer contracts, with an average contract length of approximately four years.

nordholt-clean:S3:IC memo
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:88
  selected: The source does not address facility utilisation.

nordholt-clean:S3:press release
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:88
  selected: Nordholt Logistics today announced the completion of its acquisition of Baltic ColdCo, extending the group's cold-chain network into Finland. Following the tran

nordholt-clean:S3:LP update
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:88
  selected: Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.

nordholt-clean:S4:press release
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:19
  selected: Nordholt Logistics today announced the completion of its acquisition of Baltic ColdCo, extending the group's cold-chain network into Finland.

nordholt-clean:S4:fact sheet
  label=no_support betterALL=false def=defensible
  note=source lacks statement figures; NONE+no_support coherent
  stmtFigs=percent:19
  selected: NORDHOLT LOGISTICS - KEY OPERATING METRICS
As at 30 June 2026

Employees: 720
Facilities: 14 (Sweden, Denmark, Finland)
Facility utilisation: 88 per cent
Contra

nordholt-clean:S0:LP update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=percent:14
  selected: Nordholt Logistics continues to perform in line with our underwriting.

nordholt-clean:S1:LP update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=number:14, number:720
  selected: Following the completion of the Baltic ColdCo acquisition in June, the Company now operates across three Nordic markets, and integration is progressing to plan.

nordholt-clean:S4:LP update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=percent:19
  selected: Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.

nordholt-dirty:S1:LP update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=number:15, number:800
  selected: Following the completion of the Baltic ColdCo acquisition in June, the Company now operates across three Nordic markets, and integration is progressing to plan.

nordholt-dirty:S2:LP update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=money:155
  selected: Contracted revenue represents approximately 70 per cent of total revenue, providing a solid base of recurring income.

F12:S3:12_synth_linkedin_post
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=percent:40
  selected: Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.

F18:S6:18b_synth_cross_source_pair_update
  label=partially_confirmed betterALL=false def=defensible
  note=source does not carry statement figures
  stmtFigs=percent:40
  selected: Bain & Company's customer reference work confirmed the strength of the product and the relationship picture.

F18:S7:18b_synth_cross_source_pair_update
  label=partially_confirmed betterALL=false def=unclear
  note=source has some figures; need case read
  stmtFigs=money:38, money:95
  better: UPDATED FINANCIAL POSITION Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.
  selected: Our updated base case generates a 2.6x MOIC and 21% IRR over the five-year hold, compared with the 2.8x / 23% in our initial recommendation.

```

Reading: NONE is associated with suspect labels when a better ALL-figure sentence exists (model looked elsewhere). When the source lacks the figures, NONE+no_support is often coherent. So NONE is predictive of attention failure, not automatically of a wrong severity class.

## Opinion on the R10 ship

The absolute numbers do not change my view that R10 should have shipped. Non-correspondence is already large under R3a; R10 did not create B115-class attention failure, it exposed another instance (F18_S7) while fixing EA_E3. The fix remains passage discipline, not rolling back the scoped basis gate.

Identity collision reminder: eval-ablation EA_E3 uses `meridian_source.txt`; claim-spans CS_E3 uses `claim-spans/evaluative-accident/source_ic_memo.txt`; corpus E3:S0:ic_memo is a third statement. Named by file.
