# R10 corpus blast vs live R3a

Harness only. Live `stage2_v4.md` not edited. Stage 2 only; Stage 1 from baseline.

## Pre-flight checklist

```
CONTROL on REFERENCE ARM: Part 1 gates scored on R10; Part 2 compares R3a
  (live reference) vs R10. F93_S0 and F93_S3 vacuous if R3a already conflicts.
BASELINE three times where gate: Yes for Part 1 (R10 x3). Part 2 is x1 each
  arm by design; Part 3 confirms moved cards x3 when under cap.
VACUOUS against reference: F93_S0 and F93_S3 reported vacuous when R3a
  already conflicts. PLANTED F90-F93 reported separately from corpus breaks.
PLANTED excluded from breaks: Yes. Named F04_S13/F17_S9 not in this blast
  set; F90-F93 and MF probes tagged PLANTED/PROBE.
Pass scored on more than one exhibit: Yes. Direction matrix over full pair
  set; adjudication over all to-conflicting / to-confirmed / off-conflicting.
Stopping rule CONFIRMs as well as KILLs: Part 1 hard-stops on hold/control
  failure. Part 2 is evidence for Ben (no CONFIRM/KILL declaration).
```

## Running cost

```
total_usd=10.3458
{"part":1,"costUsd":0.33571749999999984}
{"part":2,"costUsd":8.93082,"projectedUsd":10.096600686856073,"exceededEstimate":false}
{"part":3,"costUsd":1.0792549999999996,"skipped":false,"projectedUsd":0.9923133333333334}
R3a len=12812 sha256=bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c
R10 len=14259 sha256=44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1
cache=OFF
```

## PART 1 headline reconfirm (R10 x3)

```
EA_E3 confl/confl/confl ok=true holds_conflicting file=eval-ablation/meridian_source.txt
EA_E2 part/part/part ok=true off_confirmed file=eval-ablation/meridian_source.txt
CS_E3 part/part/part ok=true off_confirmed file=claim-spans/evaluative-accident/source_ic_memo.txt
F01_S10 part/part/part ok=true off_confirmed file=01_bvp_shopify_memo.txt
F04_S20 part/part/part ok=true off_confirmed file=04_synth_vc_pinterest_style_memo.txt
F12_S0 part/part/part ok=true off_confirmed file=12_synth_linkedin_post.txt
F19_S7 part/part/part ok=true holds_partially_confirmed file=19_synth_annual_report.pdf
F93_S1 conf/conf/conf ok=true holds_confirmed file=93_adversarial_basis_mismatch.txt
MF06 confl/confl/confl ok=true holds_conflicting file=passage-selection-probe/sources/mf07_false_returned_mark_figure.txt
MF08 confl/confl/confl ok=true holds_conflicting file=passage-selection-probe/sources/mf09_wrong_return_magnitude.txt
PART1_STOP=false

Note: an earlier Part 1 attempt saw F19_S7 as conf/part/conf and the harness
incorrectly treated that as a hard stop. Spec stop list is false greens,
F93_S1, and magnitude anchors only. Harness corrected; this report is the
second full run. F19 held partial x3 here.
```

## PART 2 direction matrix (R3a -> R10)

```
pairs=378 moved=20 unchanged=358
passage_changed=46 passage_changed_label_same=39
part2_usd=8.9308 estimate=9 exceeded=false
from\\to          conf     part     confl    nosup
confirmed                236       4       0       0
partially_confirmed        6      50       3       3
conflicting                0       1      29       0
no_support                 0       3       0      43
```

## Moved list summary

```
partially_confirmed->confirmed: 6
confirmed->partially_confirmed: 4
partially_confirmed->no_support: 3
partially_confirmed->conflicting: 3
no_support->partially_confirmed: 3
conflicting->partially_confirmed: 1
full moved list: scripts/diagnostic/eval-ablation/r10-corpus-blast-moved.json
```

## BLOCKING: moves to confirmed from no_support or conflicting

```
none
```

## Adjudication: TO conflicting

```
count=3 non_basis_like=3
nordholt-dirty:S1:press release plant=CORPUS from=partially_confirmed basisLike=false qtyMatch=false passChanged=false
  stmt: We now run 15 cold-chain facilities across four Nordic markets and employ over 800 people.
  passage: Following the transaction, Nordholt operates 14 facilities across the Nordic region.
  expl: The statement claims Nordholt runs 15 cold-chain facilities, while the source states it operates 14 facilities. This is a direct conflict in the number of facilities.
F08:S2:08_synth_industrial_buyout_memo plant=CORPUS from=partially_confirmed basisLike=false qtyMatch=true passChanged=true
  stmt: We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance.
  passage: We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company")... Halden Group would acquire a 78% controlling stake from the founding Schiller family, with the remainder retained by management.
  expl: The statement asserts a completed investment, while the source indicates the investment is still proposed and pending approval. This is a modality conflict.
F18:S3:18b_synth_cross_source_pair_update plant=CORPUS from=partially_confirmed basisLike=false qtyMatch=true passChanged=false
  stmt: The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.
  passage: The Company currently serves 412 property management companies, not 380 as stated in our initial memo.
  expl: The source states that the company serves 412 property management companies, which conflicts with the statement that claims the company serves 380 property management companies.
```

## Adjudication: TO confirmed

```
count=6
nordholt-clean:S0:fact sheet partially_confirmed->confirmed plant=CORPUS
  stmt: Nordholt Logistics continues to perform in line with underwriting, and the fund has generated a net IRR to date of 14 per cent.
  R3a: The source confirms the net IRR of 14 percent but does not address whether Nordholt Logistics is performing in line with underwriting.
  R10: The source confirms the net IRR to date of 14 per cent for the fund, matching the statement exactly.
F08:S3:08_synth_industrial_buyout_memo partially_confirmed->confirmed plant=CORPUS
  stmt: The Company's competitive position is exceptional.
  R3a: The source describes the company's competitive position as 'enviable' due to its qualifications and market position, which supports the statement's claim of an 'exceptional' position. However, 'exceptional' is a stronger evaluative claim not directly stated in the source.
  R10: null
F08:S15:08_synth_industrial_buyout_memo partially_confirmed->confirmed plant=CORPUS
  stmt: Principal risks include semiconductor cyclicality, customer concentration in medical implants, foreign exchange exposure, and the upcoming founder transition - each is understood and reflected in our planning, with specific mitigations in place.
  R3a: The source confirms that the risks are understood and manageable but does not detail specific mitigations in place for each risk as the statement claims.
  R10: The source confirms the principal risks mentioned in the statement, including semiconductor cyclicality, customer concentration, foreign exchange exposure, and founder transition, and notes that these risks are understood and manageable.
F14:S2:14_synth_thesis_only_memo partially_confirmed->confirmed plant=CORPUS
  stmt: First, the regulatory pathway under the EU Medical Device Regulation (MDR) has matured.
  R3a: The source states that the regulatory pathway under EU MDR is now well-understood, which partially supports the statement that it has matured. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not explicitly confirm.
  R10: The source confirms that the regulatory pathway under the EU MDR is now well-understood, which aligns with the statement that it has matured.
F15:S17:15_synth_very_long_memo partially_confirmed->confirmed plant=CORPUS
  stmt: The UK and Nordic launches are the largest single contributor to growth.
  R3a: The source confirms that the UK and Nordic launches are the largest single contributor to the base case, but it does not explicitly state that they are the largest single contributor to growth overall, leaving a gap in the claim.
  R10: The source explicitly states that the UK and Nordic launches are the largest single contributor to the base case, confirming the statement.
F19:S7:19_synth_annual_report partially_confirmed->confirmed plant=CORPUS
  stmt: Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment (European parcel volumes down 3 percent year-on-year); the Company has nevertheless gained share, with revenue up 6 percent, but EBITDA margins have compressed from 14 to 12 percent.
  R3a: The source confirms the figures for parcel volume decline, revenue growth, and EBITDA margin compression. However, there is a period mismatch: the statement refers to 2024 as the investment vintage, while the source provides data for 2025.
  R10: The source confirms all elements of the statement: European parcel volumes down 3%, revenue up 6%, and EBITDA margins compressing from 14% to 12% in 2025.
```

## Adjudication: OFF conflicting

```
count=1
nordholt_off=0 nordholt_to_confl=1
F18:S7:18b_synth_cross_source_pair_update conflicting->partially_confirmed plant=CORPUS
  stmt: Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold, supported by continued organic growth, adjacent expansion into commercial property management, and selective M&A.
  R3a: The source states the ARR as EUR 35 million, not EUR 38 million, due to a reporting convention. The statement's growth projection and strategic plans are not addressed in the source.
  R10: The source discusses the updated base case and financial metrics over a five-year hold but does not specifically address ARR growth from EUR 38 million to EUR 95 million or the strategies mentioned in the statement.
```

## Sample: confirmed -> partially_confirmed

```
total=4 sample=4
Read sample in moved JSON; classify genuine vs overreach in Opinion after review.
F23:S3:CRF_IC_memo
  stmt: The fund targets attractive risk-adjusted returns underpinned by contracted revenue.
  R3a: The source confirms that the platform's revenue is contracted and underpinned by long-term power purchase agreements, supporting the statement about attractive risk-adjusted returns underpinned by contracted revenue.
  R10: The source confirms that the platform's revenue is underpinned by contracted agreements, supporting the statement's claim about contracted revenue. However, it does not address the fund's target of attractive risk-adjusted returns, making the support partial.
F08:S14:08_synth_industrial_buyout_memo
  stmt: We have committed funding for two to three add-on acquisitions over the hold and have already identified the priority pipeline.
  R3a: The source confirms the expectation to complete two to three add-on acquisitions over the holding period, matching the statement's claim about committed funding for these acquisitions.
  R10: The source confirms the expectation to complete two to three add-on acquisitions over the holding period but does not mention the commitment of funding or the identification of the priority pipeline, which are additional claims in the statement.
F15:S11:15_synth_very_long_memo
  stmt: The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above.
  R3a: The source confirms that the Atelier 73 format operates 18 stores, aligning with the statement. The mention of it as a value driver is supported by its potential as a growth pillar in the investment thesis.
  R10: The source confirms that the Atelier 73 format operates 18 stores. However, it does not mention the format as a 'fifth value driver,' which is an additional checkable claim not covered by the source.
F12:S2:12_synth_linkedin_post
  stmt: The transformation since has been substantial.
  R3a: The source describes NorTech's transformation from being strong only in Sweden to becoming a genuinely international business with operations in multiple countries, supporting the statement that the transformation has been substantial.
  R10: The source supports the claim of substantial transformation by describing NorTech's expansion into multiple countries. However, 'substantial transformation' is an evaluative claim that the source does not explicitly state.
```

## PART 3 noise confirmation

```
ran confirmSet=14
survivors_2of3_both_arms=10/14
```

## Opinion / recommendation

```
Plain numbers (CONFIRMED: r10-corpus-blast-rows.json / moved.json):
  pairs compared: 378
  label changed: 20 (5.3%)
  passage changed: 46 (12.2%), of which 39 kept the same label
  Part 1: all hard-stop gates held. F19_S7 held partial x3 on this run
    (an earlier aborted Part 1 saw conf/part/conf; noise, not a stop).
  Part 2 cost: $8.93 (under $9 estimate). Total pass ~$10.35.
  Part 3: projection $0.99, ran; 10 of 14 confirmation pairs survived 2-of-3.

TO conflicting (3), all non-basis under the mark/return test:
  nordholt-dirty:S1  part->confl  facilities 15 vs 14. Survives.
    GENUINE magnitude recovery (R3a soft-partial). Corresponding passage.
  F18:S3             part->confl  380 vs 412 companies. Survives.
    GENUINE magnitude recovery. Corresponding passage.
  F08:S2             part->confl  invested vs seek/approval modality. Survives.
    INTENDED by R9/R10 modality expansion, not a mark/return basis case.
    Passage shifted toward the seek-approval span. Not a false alarm for the
    product intent of R10, but it is the widened-definition watch firing.

OFF conflicting (1):
  F18:S7  confl->part  ARR 38 vs 35. Survives Part 3.
    LOST CONTRADICTION. Passage changed away from the EUR 35m correction
    line. This is the clearest blast-radius cost of R10.

TO confirmed (6):
  Blocking (from nosup or confl): NONE.
  Surviving after Part 3: F08:S3, F08:S15, F14:S2 (evaluative / framing
    upgrades). F19:S7 and nordholt-clean:S0 and F15:S17 did NOT survive
    (single-pass drift).
  Candidate new false greens that survive: F14:S2 (MDR "matured" vs
    "well-understood") and F08:S3 ("exceptional" competitive position).
    Soft. Not as sharp as EA_E3 was, but real.

Nordholt dirty S1 recovered (R3a historically lost it). S5 not in the moved
set this pass. Net nordholt conflict ledger: better on S1, no new loss.

conf->part sample (4, all of them): F12:S2 and F15:S11 look like genuine
evaluative corrections; F23:S3 soft; F08:S14 did not survive Part 3.

F93_S2 still confl on both arms (rich-mark false red, pre-existing, B115).
MF01-10 polarities held on the single-pass blast rows checked.

Recommendation: do NOT ship R10 yet.
  Reason: one surviving lost contradiction (F18:S7) plus two surviving
  soft false-green upgrades, against a primary that works. The blast radius
  is small, but verdict-adjacent and not all noise. Next: either (a) named
  follow-up to protect magnitude conflicts when the cited passage changes,
  then re-blast the moved set, or (b) accept F18:S7 and the evaluative
  confirms as known costs and ship with those named. I would pick (a).

Would I ship given 11% longer prompt / ~14% more tokens per call?
  Not at this evidence. EA_E3 is fixed on the graded set and still holds in
  Part 1, but the corpus tax is a real lost conflict, not just chatter.
```

## Identity collision reminder

```
eval-ablation EA_E3: meridian_source.txt
claim-spans CS_E3: claim-spans/evaluative-accident/source_ic_memo.txt
corpus E3:S0:ic_memo: third different statement in baseline
```
