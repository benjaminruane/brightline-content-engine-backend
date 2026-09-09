# Corrections to the Cravenford drafts

Found by counting the finished file against the shape targets rather than trusting
the plan. **The Cravenford half as sent carries 23 in-reach faults, not 29.** Six
shapes are one instance short and three faults are wrong as written. Everything below
closes the gap. Apply these before any fixture is built.

## THREE FAULTS THAT ARE WRONG AS WRITTEN

**C-D3 statement 5 is mislabelled.** It is tagged S15 unsupported cause. It is
S14 incomplete attribution: the cause it names is real, and two others are dropped.
Change the tag, not the sentence.

**C-D4 statement 9 is double counted.** It is tagged both S10 stripped alternative
and S09 status inflation. Under the compound rule it takes ONE owning shape. Owner:
**S10**. The S09 tag is removed and that instance is replanted below.

**C-D4 statement 12 is not a fault at all.** I wrote it as a wrong period, but the
figure and the class do match the source. Replaced below.

**C-D6 statements 1 and 2 are a compound.** They are a wrong-entity fault and a
draft-internal pair at the same time. Owner: **S01 wrong entity**, one fault, on
statement 1. Statement 2 is tagged secondary and counts in no denominator. The pair
is recorded separately against S17 and is not scored.

**C-D6 statement 4 was left as a placeholder.** Filled below.

## SIX REPLACEMENT STATEMENTS

Replace the numbered statement with the text given. Every replacement keeps the draft
at twenty statements.

```
C-D4 st.12   was a false wrong-period fault
  NEW  "The continuation vehicle valuation has been completed and is included in
        the March figures."
  S09 STATUS INFLATION. The letter says it will now fall into the second
  quarter.                                                              X  clean

C-D4 st.14   was clean
  NEW  "The firm's total assets under management were $161.0 million."
  S04 WRONG UNIT. The factsheet says $161.0 billion.                    X  clean

C-D6 st.4    was the S06 placeholder
  NEW  "Piquesta Tire rose to 3.6% of the portfolio during the quarter."
  S06 CROSS-SOURCE. The factsheet twin confirms the 3.6% level. The letter says
  Piquesta Tire was held flat. One source appears to confirm, the later one
  contradicts the movement.                                             X  clean twin

C-D6 st.8    was clean
  NEW  "The Fund's 88% direct exposure comes from co-investments."
  S14 INCOMPLETE ATTRIBUTION. Footnote 1 says direct deals include BOTH
  co-investments AND single asset continuation deals.                   P  clean twin

C-D6 st.16   was clean
  NEW  "The seeded portfolio was acquired at attractive prices."
  S11 STRIPPED HEDGE. The letter says "we remain of the view that".      P  clean twin

C-D6 st.17   was clean
  NEW  "The unnamed co-investment is the largest position because it was the
        Fund's first investment."
  S15 UNSUPPORTED CAUSE. No source gives any reason for its size.        P  clean twin

C-D6 st.20   was clean
  NEW  "The Fund's net asset value at 31 March 2026 was $653.0 million."
  S05 SUPERSEDED FIGURE. The letter finalises it at $661.4 million and is the
  later source.                                                          X  clean twin
```

That is seven replacements covering six missing instances plus the S06 placeholder.

## SHAPE COUNT AFTER THE CORRECTIONS

```
S01 3   S02 3   S03 3   S04 3   S05 3   S06 3   S07 3   S08 3
S09 3   S10 3   S11 3   S12 3   S13 3   S14 3   S15 3   S16 3

ALL SIXTEEN SHAPES AT THREE INSTANCES. 48 IN-REACH FAULTS. CLOSED.

S17  three pairs   K-D6, C-D5, C-D6
S18  three         C-D1, C-D2, C-D4
TWIN SUBSET  twelve
DECOYS  56
```

## WHAT THIS EPISODE SAYS ABOUT THE INSTRUMENT

**The plan said 29 and the file contained 23, and nothing would have caught that
except counting.** A shape sitting at two instances instead of three does not fail a
test, does not fail a scan, and does not look wrong in a draft. It just quietly makes
that shape's result less reliable than the design promises.

**So the fixture build spec must include a shape-count assertion that fails the
build**, exactly like the arithmetic assertion on the press release. Every shape at
three, S17 at three pairs, S18 at three, decoys at their targets, and the training
and held-out splits balanced. Counted from the design file, not from a plan document.
