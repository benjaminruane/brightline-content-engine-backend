# R3a corpus blast-radius check against baseline

Date: 2026-08-26
Harness: `scripts/diagnostic/eval-ablation/run-r3a-corpus-blast.mjs`
Rows: `scripts/diagnostic/eval-ablation/r3a-corpus-blast-rows.json`
Moved list: `scripts/diagnostic/eval-ablation/r3a-corpus-blast-moved.json`
R3a: `scripts/diagnostic/eval-ablation/frame-rule-winner-r3a.txt`
  len=12812 sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
Live prompt untouched.

## Running cost

```
Part 1 reconfirm     $0.2102
Part 2 corpus A+R3a  $8.3277   (728 calls, 364 pairs)
Part 3 noise x3      $1.9380   (174 calls; under $5 cap)
TOTAL                $10.4759
```

## PART 1: Headline reconfirmation (R3a x3)

No false green returned confirmed on 2 of 3. +5 holds on this reconfirm.

```
EA_E2    part/part/part   ok
CS_E3    part/part/part   ok
F01_S10  part/part/part   ok
F04_S20  part/part/part   ok
F12_S0   part/part/part   ok
F19_S7   part/part/part   hold
```

CONFIRMED: `r3a-corpus-blast-rows.json` part1.summary.

## BLOCKING FINDING

```
Cards moving TO confirmed from no_support or conflicting: 0
```

No blocking finding of that shape. CONFIRMED: matrix below.

---

## PART 2: Direction matrix (A -> R3a)

364 pairs compared (360 baseline + F90x2 + F91 + F92).

```
              to conf   to part   to confl   to nosup
from conf        234       24         0          0
from part          2       29         0          2
from confl         0        2        21          1
from nosup         0        4         1         44
```

```
unchanged: 328
moved:     36  (9.9%)
```

Dominant move: confirmed -> partially_confirmed (24). That is the intended
direction. Full moved list: `r3a-corpus-blast-moved.json`.

Transition summary:

```
conf -> part    24
part -> conf     2
part -> nosup    2
confl -> part    2
confl -> nosup   1
nosup -> part    4
nosup -> confl   1
```

---

## PART 3: Noise confirmation (ran; under cap)

Confirmation set: 29 unique pairs (2 to-conf + 3 off-confl + 24 conf->part;
sample was all 24). Projected $1.99; billed $1.94.

```
survive x3 (A majority=from AND R3a majority=to): 24 of 29
```

Notable:

```
F08:S14 part->conf   does NOT survive (R3a only 1/3 confirmed)
F92:S0  part->conf   SURVIVES on R3a (conf x3); A was part/part/conf
nordholt-dirty:S1 confl->part  SURVIVES
nordholt-dirty:S5 confl->part  SURVIVES
supersession:S0 confl->nosup   does NOT survive (both arms nosup x3; single-pass noise)
```

---

## Adjudication (asymmetric)

### Every card TO confirmed (n=2)

**F08:S14** `08_synth_industrial_buyout_memo`
Statement: committed funding for two to three add-on acquisitions...
Source (CONFIRMED file text): "we expect to complete two to three add-on
acquisitions" -- expectation, not committed funding.
A: partial (correct). R3a single-pass: confirmed (wrong).
Part 3: does not survive. HYPOTHESIS as a stable new false green: weak.
Treat as single-pass noise, not a ship blocker.

**F92:S0** `91_adversarial_shopify_2010_trimmed`
Statement: Shopify is a small startup serving approximately 10,000 customers.
Source: "nearly 10,000 today"; does not call Shopify a "small startup"
(CONFIRMED by source file grep).
A: partial (often). R3a: confirmed x3.
Assessment: NEW FALSE GREEN on the adjective "small startup", stable on R3a.
Same framing-relaxation path as the rewrite. Not blocking-class (not from
nosup/confl), but real. Record as open shape alongside mark/EA_E3.

### Every card OFF conflicting (n=3)

**nordholt-dirty:S1 fact sheet** confl -> part (survives)
Statement: 15 facilities / four markets / over 800 people.
Source: 14 facilities / three markets / 720 employees (CONFIRMED fact sheet).
A: conflicting (correct). R3a: partial (wrong; lost contradiction).
Assessment: LOST CONTRADICTION. Magnitude exclusivity softened to partial.

**nordholt-dirty:S5 LP update** confl -> part (survives)
Statement: at least five bolt-ons; exit by 2027.
Source: two further; realisation not before 2028 (CONFIRMED LP update).
A: conflicting (correct). R3a: partial (wrong).
Assessment: LOST CONTRADICTION. Mutually exclusive plans softened.

**supersession:S0 source_A** confl -> nosup (does not survive)
Single-pass noise; both arms nosup x3 in Part 3.

Modality watch (F08_S2-style invested vs proposed): none of the surviving
off-conflicting moves are modality. Softening here is magnitude / plan
exclusivity, not completed-vs-proposed. CONFIRMED by the three cards above.

### Sample of 15 confirmed -> partially_confirmed

Deterministic sample (sha256 of pairId, first 15 of 24). Read against
explanations and known sources where the graded set already adjudicated.

```
pair                         read
F18:S9 18a                   CORRECT  defensible / growing category
F14:S8 thesis                CORRECT  favour a sponsor
F04:S7 pinterest             CORRECT  "two respects" underspecified
E3:S0 ic_memo (claim-spans)  CORRECT  judgement clause (CS_E3 shape)
F08:S3 industrial            CORRECT  exceptional vs enviable
F14:S2 thesis                BORDERLINE  matured vs well-understood
F04:S10 pinterest            CORRECT  underserved / monetization path
F08:S10 industrial           CORRECT  causal attribution of 9% growth
F12:S0 linkedin              CORRECT  duration (proven false green)
F02:S5 atnorth               CORRECT  exceptionally well positioned
F14:S3 thesis                BORDERLINE  meaningful clearances
F08:S15 industrial           CORRECT  mitigations in place
F15:S19 very long            BORDERLINE  discretionary positioning gloss
F04:S20 pinterest            CORRECT  proven false green
F13:S8 inconsistency         CORRECT  clear competitive lead
```

```
correct corrections:  12 of 15
borderline/overreach:  3 of 15
clear wrong demotions: 0 of 15
```

HYPOTHESIS: the conf->part mass is mostly the intended fix. Borderline cases are
adjective hair-splitting, not wholesale overreach.

---

## Plain conclusion

How many statements R3a changes, and in which direction?

```
36 of 364 pairs moved (9.9%).
Mainly conf -> part (24).
Small bad tail: 2 part -> conf (one noise, one stable F92 adjective);
2 confl -> part that survive (lost contradictions on nordholt-dirty).
```

How many of the read cards are genuine corrections?

```
Of 15 sampled conf->part: about 12 genuine, 3 borderline.
Headline five false greens: reconfirmed part x3.
```

How many are new false greens?

```
Stable candidate: 1 (F92_S0 "small startup").
Unstable single-pass: 1 (F08:S14 committed funding).
Blocking (nosup/confl -> conf): 0.
```

Are conflicts being softened systematically?

```
Yes, on magnitude/plan exclusivity: 2 of 2 surviving confl->part moves are
wrong softenings (nordholt-dirty). Not modality. Sample is small (2 cards)
but both are clean losses of contradiction. That is the main blast-radius risk.
```

### Recommendation: ship with a named change

Ship R3a after one named hardening, not as-is.

Named change (before or immediately after live edit, own follow-up):

```
Keep mutually exclusive same-metric figures and mutually exclusive named plans
as conflicting. Do not route those through partially_confirmed when an
evaluative or "extra claim" reading is also available.
```

Why not "do not ship": the intended conf->part effect looks real on the sample;
blocking to-conf from silence/conflict is empty; Part 1 +5 reconfirmed; cost of
another rewrite week exceeds the value of perfecting two nordholt-dirty cells
in-harness first. Why not bare ship: those two surviving lost contradictions are
exactly the user-visible failure mode (green-ish partial where the source
contradicts the numbers).

If Ben prefers speed: ship R3a now, open a ticket for the conflict-hardening
sentence, and treat F92_S0 as an open adversarial shape with EA_E3 marks.

What I actually think: I would ship with the named change written into the
prompt in the same live edit if it can stay one sentence under Frame/Numeric
rules; otherwise ship R3a and land the conflict sentence as the next one-rung
commit before calling the rewrite done.
