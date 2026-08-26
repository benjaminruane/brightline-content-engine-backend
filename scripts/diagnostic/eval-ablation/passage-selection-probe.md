# Passage selection probe (multi-figure sources)

Live R3a only. Cache OFF. Invented Halden pairs plus Meridian Nordholt case.
Rows: `scripts/diagnostic/eval-ablation/passage-selection-probe-rows.json`
Pairs: `scripts/diagnostic/passage-selection-probe/pairs.json`

## Pre-flight checklist

```
CONTROL on REFERENCE ARM: Yes. Every expected label is justified from source
  text alone in pairs.json justifyExpected before any run. Reference arm is
  live R3a; there is no alternate arm.
BASELINE three times: Yes. R3a x3 per pair.
VACUOUS gates: None by construction. Each pair has two performance figures
  and a draft that can match only one corresponding sentence. If a run returns
  partially_confirmed, that outcome is scored as neither expected label.
PLANTED cells excluded from breaks: N/A. All pairs are new for this probe.
Finding scored on more than one exhibit: Yes. Ten pairs (MF01 to MF10).
Stopping rule CONFIRMs as well as KILLs: Yes. Written before the run:
  CONFIRMED DEFECT (>=2 expected-confirmed conflicting via wrong passage >=2/3)
  EDGE CASE (0 or 1 such pair)
  OVERCORRECTION (any expected-conflicting returns confirmed >=2/3)
```

## Running cost

```
total_usd=0.2361
prompt=stage2_v4.md len=12812 sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
cache=OFF calls=30
```

## Expected labels (pre-run justifications)

```
MF01 expected=confirmed
  dims: order=corresponding_second; distance=adjacent; metric=same_moic; entity=same_fund; wording=identical
  draft: Fund IV has returned 2.6 times gross MOIC.
  corresponding: Fund IV has returned 2.6 times gross MOIC.
  justify: Draft is byte-identical to the source returned-2.6 sentence; mark-at-1.9 is a different basis for the same fund.

MF02 expected=confirmed
  dims: order=corresponding_first; distance=adjacent; metric=same_moic; entity=same_fund; wording=identical
  draft: Fund IV has returned 2.6 times gross MOIC.
  corresponding: Fund IV has returned 2.6 times gross MOIC.
  justify: Draft matches the first performance sentence; the later mark-at-1.9 does not restate returned MOIC.

MF03 expected=confirmed
  dims: order=corresponding_second; distance=paragraph; metric=same_moic; entity=same_fund; wording=identical
  draft: Fund IV has returned 2.6 times gross MOIC.
  corresponding: Fund IV has returned 2.6 times gross MOIC.
  justify: Draft quotes the returned-2.6 line after a filler paragraph; mark-at-1.9 remains a different basis.

MF04 expected=confirmed
  dims: order=corresponding_second; distance=adjacent; metric=different_irr_vs_moic; entity=same_fund; wording=identical
  draft: Fund IV has returned 2.6 times gross MOIC.
  corresponding: Fund IV has returned 2.6 times gross MOIC.
  justify: Draft matches the MOIC returned sentence; the competing mark is IRR, not a MOIC multiple.

MF05 expected=confirmed
  dims: order=corresponding_second; distance=adjacent; metric=same_moic; entity=deal_vs_fund; wording=paraphrase
  draft: Vale Forge returned 2.6 times gross MOIC on exit as a Fund IV platform.
  corresponding: Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
  justify: Paraphrase restates the Vale Forge exit multiple; fund mark-at-1.9 is a different entity.

MF06 expected=conflicting
  dims: order=corresponding_first; distance=adjacent; metric=same_moic; entity=same_fund; wording=identical_figure_wrong_basis
  draft: Fund IV has returned 1.9 times gross MOIC.
  corresponding: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
  justify: Source marks Fund IV at 1.9x and separately says it has returned 2.6; draft wrongly states returned 1.9.

MF07 expected=conflicting
  dims: order=corresponding_first; distance=adjacent; metric=same_moic; entity=same_fund; wording=identical_figure_wrong_basis
  draft: Fund IV is currently marked at 2.6x gross MOIC.
  corresponding: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
  justify: Source marks Fund IV at 1.9x; 2.6 appears only as returned MOIC, so a current mark of 2.6 contradicts the mark line.

MF08 expected=conflicting
  dims: order=corresponding_second; distance=adjacent; metric=same_moic; entity=same_fund; wording=identical_frame_wrong_magnitude
  draft: Fund IV has returned 3.0 times gross MOIC.
  corresponding: Fund IV has returned 2.6 times gross MOIC.
  justify: Source says Fund IV has returned 2.6, not 3.0; mark-at-1.9 is also not 3.0 returned.

MF09 expected=conflicting
  dims: order=corresponding_first; distance=adjacent; metric=same_moic; entity=fund_claims_deal_figure; wording=identical_to_wrong_entity
  draft: Fund IV has returned 2.6 times gross MOIC.
  corresponding: Fund IV is currently marked at 1.9x gross MOIC.
  justify: Source never says Fund IV has returned 2.6; that multiple belongs to Vale Forge, while Fund IV is marked at 1.9x.

MF10 expected=confirmed
  dims: order=corresponding_after_fund_mark; distance=multi_paragraph; metric=same_moic; entity=deal_vs_fund; wording=identical
  draft: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
  corresponding: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
  justify: Draft is byte-identical to the Nordholt realisation sentence; Fund IV mark-at-1.9 is a different fund and basis.

```

## Per-run results

```
--- MF01 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run3: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF02 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run3: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF03 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run3: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF04 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run3: conf corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF05 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=vale-returned-2.6
  passage: Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
run2: conf corresponds=true note=vale-returned-2.6
  passage: Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
run3: conf corresponds=true note=vale-returned-2.6
  passage: Vale Forge, a Fund IV platform, returned 2.6 times gross MOIC on exit.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF06 expected=conflicting labels=confl/confl/confl ---
run1: confl corresponds=false note=returned-2.6_also_conflict
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: confl corresponds=true note=mark-1.9
  passage: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
run3: confl corresponds=true note=mark-1.9
  passage: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR. Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF07 expected=conflicting labels=confl/confl/confl ---
run1: confl corresponds=true note=mark-1.9
  passage: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
run2: confl corresponds=true note=mark-1.9
  passage: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
run3: confl corresponds=true note=mark-1.9
  passage: Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF08 expected=conflicting labels=confl/confl/confl ---
run1: confl corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run2: confl corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
run3: confl corresponds=true note=returned-2.6
  passage: Fund IV has returned 2.6 times gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF09 expected=conflicting labels=confl/confl/confl ---
run1: confl corresponds=true note=fund_mark
  passage: Fund IV is currently marked at 1.9x gross MOIC.
run2: confl corresponds=true note=fund_mark
  passage: Fund IV is currently marked at 1.9x gross MOIC.
run3: confl corresponds=true note=fund_mark
  passage: Fund IV is currently marked at 1.9x gross MOIC.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

--- MF10 expected=confirmed labels=conf/conf/conf ---
run1: conf corresponds=true note=nordholt-3.1
  passage: Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
run2: conf corresponds=true note=nordholt-3.1
  passage: Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
run3: conf corresponds=true note=nordholt-3.1
  passage: Selected realisation: Nordholt Systems (Fund III, 2017 entry, 2023 exit), a German industrial sensor manufacturer, returned 3.1x gross MOIC over a six-year hold following three bolt-on acquisitions.
summary: label_ok_2of3=true passage_ok_2of3=true right_label_wrong_passage_2of3=false false_red=false false_red_via_wrong_passage=false overcorrection=false

```

## Aggregates

```
pairs=10
expected_label_on_at_least_2_of_3=10
corresponding_passage_on_at_least_2_of_3=10
right_label_from_wrong_passage_on_at_least_2_of_3=0
false_red_expected_confirmed_got_conflicting_2of3=0
false_red_via_non_corresponding_passage_2of3=0
overcorrection_expected_conflicting_got_confirmed_2of3=0
```

## Dimension cross (misses)

```
No label or passage misses under the 2-of-3 bars.
```

## Selection rule (post-run)

```
On this ten-pair set, selection is NOT predicted by order, distance, metric
match, or entity. Every expected-confirmed pair selected the corresponding
passage on 3 of 3. Every expected-conflicting pair returned conflicting on
3 of 3.

Order: MF01 (corresponding second) and MF02 (corresponding first) both
  confirmed with the returned-2.6 line. No first-figure bias on these pages.
Distance: MF03 (paragraph gap) and MF10 (multi-paragraph Meridian) both
  selected the corresponding returned line.
Metric: MF04 (IRR bait then MOIC) selected MOIC returned, not IRR.
Entity: MF05 (deal draft) selected Vale Forge; MF09 (fund draft of deal
  figure) selected the fund mark and conflicted. No overcorrection.
Wording: MF05 paraphrase confirmed cleanly.

CONFIRMED: no stable wrong-passage rule appears across MF01 to MF10
  (passage-selection-probe-rows.json; all pairSummaries).

HYPOTHESIS: the F93_S2 false red depends on mark-sentence richness that this
  probe did not copy. Fixture 93 mark line is longer and adds realised-count
  context ("Four of twelve platform investments are fully realised"). MF01
  uses a thin mark line. Same draft string, same returned-2.6 line, opposite
  outcome on F93_S2 (confl x3, mark passage) versus MF01 (conf x3, returned
  passage). See sources/93_adversarial_basis_mismatch.txt L12 versus
  passage-selection-probe/sources/mf01_mark_then_returned.txt L7.
```

## Stopping rule outcome

```
EDGE_CASE: 0 expected-confirmed pair(s) with conflicting via non-corresponding
  on >=2/3. Threshold for CONFIRMED DEFECT is 2.
OVERCORRECTION: none. Zero expected-conflicting pairs returned confirmed.
```

Per the written stopping rule: document the edge case; unpause the conflicting
destination; resume B109 with a same-quantity gate in the conflict limb. Do
not treat F93_S2 alone as proof the multi-figure false red is representative.
Do not strip the mark line from fixture 93. Do not add multiples to B48 without
a corresponding-passage check (landmine unchanged).

## Opinion

```
The probe set is well built for polarity and dimensions. Expected labels look
right from source text. I would not retune any of them after seeing the run.

What I actually think: EDGE_CASE is the honest call under the rule we wrote.
The false red on F93_S2 (347a328 / f93-restage-and-hunting-rows.json) remains
CONFIRMED as a mechanism on that page. This probe shows the same shape on
thinner invented pages does not reproduce it (MF01). That is useful. It means
passage hunting is fragile to page composition, not a blanket failure on every
two-figure LP update. Meridian MF10 is clean: Nordholt 3.1x, not Fund IV mark.

Risk of overcorrecting passage discipline is real enough that OVERCORRECTION
was the right second gate; it did not fire here. Real contradictions on these
multi-figure pages were still caught (MF06 to MF09, confl x3 each).

Vacuous: none. No pair lacked a distinguishing outcome. MF06 run1 cited the
returned-2.6 line rather than the mark line, still conflicting for the wrong
magnitude; that is not vacuous and not a false green.
```

## Next step (EDGE_CASE)

```
1. Unpause R9 / conflicting destination work for mark-versus-returned.
2. Resume B109 with an explicit same-quantity gate in the conflict limb
   (conflict only when the cited passage is about the same quantity the draft
   asserts; otherwise do not force conflicting from a non-corresponding mark).
3. Keep fixture 93 mark bait. Treat F93_S2 as a documented fragile exhibit,
   not as the sizing for a product-wide passage rewrite by itself.
4. Optional later: one follow-on pair that copies the F93-rich mark sentence
   verbatim into an invented page, to test the richness hypothesis. Not run
   here; first result stands.
```

## Identity collision reminder

```
eval-ablation EA_E3, claim-spans CS_E3, and corpus E3:S0:ic_memo are three
different statements. This probe does not use those ids. Meridian appears
only as MF10 (Nordholt 3.1x draft vs eval-ablation/meridian_source.txt).
```
