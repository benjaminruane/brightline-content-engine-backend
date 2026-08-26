# R9 Part 0: gross versus net scan and conflicting placement

Free. No model calls. Live prompt untouched.

## 0a Gross versus net on disk

Source: unique R3a pairs in `r3a-corpus-blast-rows.json` (364).

Statements with gross or net near a performance figure: 25.
Disagreements where statement and passage disagree on gross versus net: **0**.

```
shape is unmeasured, not absent
no existing fixture stages a gross/net swap (before fixture 93 S3)
fixture 93 S3 is the only staged catch for this shape
```

Sample of statement hits (not disagreements): nordholt net IRR pairs; F08/F11/F15/F17/F19 gross or net MOIC/IRR where passage agrees; F13 S5 net revenue retention (not PE performance basis).

### metric-scope.mjs

File: `lib/qc/pipeline-v4/metric-scope.mjs`.

What it does: sentence-scoped nearest-metric resolution for money and percent figures (longest-first phrase hits). Used by Stage 2 magnitude backstops via `stage2-match-sources.mjs`.

What it does NOT do: compare gross versus net as a basis for the Stage 2 verdict. Phrase list maps `net irr` and `irr` to the same id `irr`, and `moic` without a gross/net split (`stage2-match-sources.mjs` around the irr/moic phrase rows). So gross MOIC versus net MOIC would still look like the same metric id to the magnitude gate.

CONFIRMED: metric-scope feeds span / metric-id pairing for force/suppress, not a basis verdict.

### Multipassage shadow note (not live)

`stage2_v4_multipassage_shadow.md` already names Basis (gross vs net; realised vs unrealised) and routes same-number frame mismatch to conflicting. Live `stage2_v4.md` does not. That is precedent for destination=conflicting, not a live rule.

## 0b Conflicting definition (live stage2_v4.md)

Verbatim L27:

```
L27  • "conflicting" - the source states something mutually exclusive with the
     draft on a like-for-like basis. This includes: a different named entity or
     ownership/context in the same role; a number that differs from the
     source's same-metric figure by more than rounding; a status/modality
     contradiction only when the draft asserts a definite completed action
     using invested, acquired, completed, sold, or exited, specific enough to
     be checkable, that the source directly shows as proposed, recommended,
     sought, or not yet done. Do not fire modality-conflict on "committed",
     "a new investment", "the fund holds", or other cover / deal-terms wording
     that names amount and vehicle without asserting that the transaction has
     already closed. Those follow ordinary support (confirmed or partial).
```

(Report uses ASCII hyphen where the file has an em dash after the label.)

### Where each limb belongs (decision)

Realised versus mark: completed-action / modality limb.
Why: the draft asserts a definite completed performance verb (returned, realised, distributed); the source shows the same figure as not completed return (marked at, valued at, carried at, unrealised). That is the same structure as invested versus sought.

Gross versus net: mutually-exclusive-figures limb, new explicit item beside "a number that differs".
Why: the digits can match exactly, so it is not a magnitude conflict. It is not a completed-action verb. It is exclusivity of basis for the same figure: given gross, net is necessarily lower (or at least not that same reported gross). Place it in the "This includes" list as a basis mismatch on the figure, not under modality.

Fund-level versus deal-level: named in the like-for-like / paraphrase sites as a basis pair to watch, but not load-bearing in L27 wording for this rung unless an exhibit exists. Not staged in fixture 93.

Opinion: gross versus net and realised versus mark belong in the SAME conflicting rule (basis exclusivity) but on DIFFERENT limbs of L27, because one is modality-shaped and one is figure-characterization-shaped. One worked example for returned versus marked is enough for this rung; gross/net is carried by the definition plus F93_S3.

## 0c Fixture 93

Renamed label and files from `adversarial_realised_vs_mark` to `adversarial_basis_mismatch` (covers mark and gross/net).

```
S0  mark swap          expected CONFLICTING
S1  honest mark        expected CONFIRMED (unchanged role)
S2  both sides returned expected CONFIRMED (new overreach control)
S3  gross vs net swap  expected CONFLICTING (new)
```

Source still states fund-level mark at 1.9x gross and realised-subset returned 2.6x gross.
