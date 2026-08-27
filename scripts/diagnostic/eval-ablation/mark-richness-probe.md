# Mark-sentence richness probe

Live R3a only. Cache OFF. Hard stop if anchors drift.
Rows: `scripts/diagnostic/eval-ablation/mark-richness-probe-rows.json`

## Pre-flight checklist

```
CONTROL on REFERENCE ARM: Anchors F93_S2 (expect conflicting) and MF01
  (expect confirmed) are the reference controls for this diagnosis.
BASELINE three times: Yes. R3a x3 on all four pages.
VACUOUS gates: None. RICH01 and THIN93 swap only the mark sentence;
  the draft and returned-2.6 line are shared. Anchors can fail the instrument.
PLANTED cells excluded from breaks: N/A for this diagnosis (no plant scoring).
Finding scored on more than one exhibit: Yes. RICH01 and THIN93, plus two anchors.
Stopping rule CONFIRMs as well as KILLs: Yes. RICHNESS CONFIRMED / REFUTED / MIXED;
  hard stop if anchors drift (instrument broken).
```

## Running cost

```
total_usd=0.0945
prompt=stage2_v4.md len=12812 sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
cache=OFF calls=12
```

## Mark sentences under test

```
RICH (fixture 93 verbatim):
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.

THIN (MF01 verbatim):
Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.

Draft (all four): Fund IV has returned 2.6 times gross MOIC.
```

## Per-run results

```
--- RICH01 role=swap labels=confl/confl/confl ---
run1: confl note=HUNT_rich_mark-1.9
  passage: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
  explanation: The source states that Fund IV is currently marked at 1.9x gross MOIC, which conflicts with the statement that it has returned 2.6 times gross MOIC.
run2: confl note=HUNT_thin_mark-1.9
  passage: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
  explanation: The source states that Fund IV is currently marked at 1.9x gross MOIC, which is mutually exclusive with the statement's claim of a 2.6x gross MOIC return.
run3: confl note=HUNT_thin_mark-1.9
  passage: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
  explanation: The source states that Fund IV is currently marked at 1.9x gross MOIC, which directly conflicts with the statement that it has returned 2.6 times gross MOIC.

--- THIN93 role=swap labels=conf/conf/conf ---
run1: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, which matches the statement exactly.
run2: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, which matches the statement exactly.
run3: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, which directly confirms the statement.

--- F93_S2 role=anchor labels=confl/confl/conf ---
run1: confl note=HUNT_rich_mark-1.9
  passage: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR. Four of twelve platform investments are fully realised; the remainder remain in the portfolio at carrying value.
  explanation: The source states that Fund IV is currently marked at 1.9x gross MOIC, which conflicts with the statement that it has returned 2.6 times gross MOIC. The figures are mutually exclusive on a like-for-like basis.
run2: confl note=HUNT_thin_mark-1.9
  passage: Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
  explanation: The statement claims a return of 2.6 times gross MOIC, while the source states that Fund IV is currently marked at 1.9x gross MOIC. These figures are mutually exclusive and cannot be reconciled by rounding.
run3: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, matching the statement exactly.

--- MF01 role=anchor labels=conf/conf/conf ---
run1: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, which matches the statement exactly.
run2: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, matching the statement exactly.
run3: conf note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
  explanation: The source explicitly states that Fund IV has returned 2.6 times gross MOIC, which matches the statement exactly.

```

## Anchor check

```
F93_S2 labels=confl/confl/conf still_conflicts_2of3=true
MF01 labels=conf/conf/conf still_confirms_2of3=true
anchors_ok=true
Anchors hold. Part 2 may proceed.
```

## Reading

```
reading=RICHNESS_CONFIRMED
RICH01 conflicts_2of3=true confirms_2of3=false
THIN93 confirms_2of3=true conflicts_2of3=false
```

## Analysis

```
reading=RICHNESS_CONFIRMED

CONFIRMED: swapping only the mark sentence flips the label.
  RICH01 (MF01 host + rich mark) = confl/confl/confl, passages cite the
  mark-at-1.9 line (run1 includes the realised-count clause; run2/3 truncate
  after IRR but still the rich mark sentence opening).
  THIN93 (F93 host + thin mark) = conf/conf/conf, passages cite returned-2.6.
  Anchors: F93_S2 = confl/confl/conf (still conflicts on 2 of 3); MF01 =
  conf/conf/conf. Instrument holds. Part 2 proceeds.

What about the rich mark triggers it, quoting both:

  RICH:
  Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross
  MOIC and 24% gross IRR. Four of twelve platform investments are fully
  realised; the remainder remain in the portfolio at carrying value.

  THIN:
  Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.

The thin line states the same mark figure and IRR. The rich line adds vintage,
fund size, and the realised-count / carrying-value clause. That extra content
is the difference that pulls passage selection to the mark and yields the
false red. HYPOTHESIS refined: the attractor is the realised-count clause
("Four of twelve platform investments are fully realised") sitting inside the
mark sentence, which makes the mark look like a performance claim competing
with "returned".
```

## Opinion

```
The richness hypothesis is confirmed by a clean swap. F93_S2 is no longer an
unexplained flake; it is the rich mark sentence on an otherwise ordinary page.
One anchor flap (F93_S2 run3 confirmed) does not break the 2-of-3 prior.
```
