# F93 restage verification and R9 passage-hunting probe

Live prompt and R9 wording untouched. Fixture 93 restaged in Part 0 (e24d73b).

## Pre-flight checklist

```
CONTROL holds on REFERENCE ARM?
  Part 1's job: verify S1 and S2 on R3a x3 before any R9 probe.
BASELINE running three times?
  Yes. R3a x3 in Part 1.
Any gate VACUOUS against reference?
  F93_S0 demoted to REGRESSION LOCK (not run here).
  F93_S3 is a READING in Part 1, not a gate.
PLANTED cells excluded from breaks?
  Yes. No planted cells in this pass.
Pass condition on more than one exhibit?
  Yes. Part 2 gates S2 and EA_E3 (plus S1 control).
Stopping rule CONFIRM and KILL (and HUNTING)?
  Yes. See Part 1 and Part 2 stopping rules below.
```

## Fixture statements (verbatim)

```
S0 LOCK   draft: Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.
          expect: conflicting  (not run this pass; reference already conflicts)
S1 CONTROL draft: Fund IV is currently marked at 1.9 times gross MOIC and a 24 per cent gross IRR.
          expect: confirmed
S2 CONTROL draft: Fund IV has returned 2.6 times gross MOIC.
          source: Fund IV has returned 2.6 times gross MOIC.  (identical)
          expect: confirmed
S3 READING draft: Fund IV has returned 2.6 times net MOIC.
          source: same returned-2.6 gross line (shared with S2)
          expect: conflicting if live catches gross/net; confirmed = usable primary later
```

S2 and S3 share the source returned-2.6 line. Not a harness problem: each call
matches one statement against the full source. Kept shared so S3 varies only gross vs net.

Restaging S2/S3 while measuring is permitted here because neither held as designed
on the reference arm (broken instrument). Distinction not abused: S0 lock untouched;
no wording tuned after seeing Part 1/2 outcomes.

## Running cost

```
Part 1 so far: $0.0749
```

## Part 1: reference arm R3a x3

```
R3a len=12812 sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
```

### F93_S1

R3a run 1: confirmed  corresponds=true (mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The source confirms the statement by stating the same gross MOIC and gross IRR figures for Fund IV.
```

R3a run 2: confirmed  corresponds=true (mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The source confirms the statement by stating the same gross MOIC and gross IRR for Fund IV.
```

R3a run 3: confirmed  corresponds=true (mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The source confirms the statement by stating the same gross MOIC and gross IRR for Fund IV.
```

### F93_S2

R3a run 1: conflicting  corresponds=false (HUNT_mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The statement claims a return of 2.6 times gross MOIC, while the source states that Fund IV is currently marked at 1.9x gross MOIC. These figures are mutually exclusive and cannot be reconciled by rounding.
```

R3a run 2: conflicting  corresponds=false (HUNT_mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The statement claims a return of 2.6 times gross MOIC, while the source states that Fund IV is currently marked at 1.9x gross MOIC. These figures are mutually exclusive and cannot be reconciled by rounding.
```

R3a run 3: conflicting  corresponds=false (HUNT_mark-1.9)

Passage:
```
Fund IV (2020 vintage, EUR 750 million) is currently marked at 1.9x gross MOIC and 24% gross IRR.
```

Explanation:
```
The statement claims a return of 2.6 times gross MOIC, while the source states that Fund IV is currently marked at 1.9x gross MOIC. These figures are mutually exclusive.
```

### F93_S3

R3a run 1: conflicting  corresponds=true (returned-2.6)

Passage:
```
Fund IV has returned 2.6 times gross MOIC.
```

Explanation:
```
The statement claims a net MOIC, while the source specifies a gross MOIC. This is a basis mismatch, making the figures mutually exclusive on a like-for-like basis.
```

R3a run 2: conflicting  corresponds=true (returned-2.6)

Passage:
```
Fund IV has returned 2.6 times gross MOIC.
```

Explanation:
```
The statement claims a net MOIC, while the source specifies a gross MOIC. This is a basis mismatch, making the figures mutually exclusive on a like-for-like basis.
```

R3a run 3: conflicting  corresponds=true (returned-2.6)

Passage:
```
Fund IV has returned 2.6 times gross MOIC.
```

Explanation:
```
The statement claims a net MOIC, while the source specifies a gross MOIC. This is a basis mismatch, making the figures mutually exclusive on a like-for-like basis.
```

### Part 1 gates

```
S1 confirmed >=2/3: true  labels=conf/conf/conf
S2 confirmed >=2/3: false  labels=confl/confl/confl
S2 corresponding passage >=2/3: false
S3 reading: LIVE_ALREADY_CATCHES (R9 gross/net limb is defence in depth)  labels=confl/confl/confl
```

**Part 1 verdict: STOP** - S2 did not confirm on >=2/3. Source still ill-formed. Part 2 not run.

## Part 2: NOT RUN

S2 did not confirm on >=2/3. Source still ill-formed. Part 2 not run.

## Running cost (final)

```
Total: $0.0749
Part 1 verdict: STOP
Part 2 verdict: NOT_RUN
```

## Opinion

Including the R9 probe in the same pass was the right call if Part 1 passed: the only question worth ~$0.30 more is whether hunting survives a clean control. Reference-arm verification alone would have been enough if S2 failed; it would not have answered the hunting hypothesis.

## Technical summary

Restaged fixture 93 (identical S2; isolated S3; S0 demoted). R3a verified S1/S2/S3; R9 probe conditional. Rows in f93-restage-and-hunting-rows.json.

## Plain-language summary

This pass checks whether an honest returned sentence still confirms when a mark sentence sits nearby, under the current prompt and under R9.
