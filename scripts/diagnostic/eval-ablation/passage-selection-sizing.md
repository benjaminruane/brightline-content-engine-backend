# Passage-selection false-red sizing

Free. No model calls. No fixture, prompt, baseline, or code edits.
Evidence: `f93-restage-and-hunting-rows.json`, `r3a-corpus-blast-rows.json` (live R3a), `r9-basis-conflict-rows.json`, `lib/qc/pipeline-v4/stage2-match-sources.mjs`.

## Six-false-green scoreboard (unchanged)

From `r3a-corpus-blast.md` Part 1 reconfirm (live R3a x3):

```
EA_E2    part/part/part   ok
CS_E3    part/part/part   ok
F01_S10  part/part/part   ok
F04_S20  part/part/part   ok
F12_S0   part/part/part   ok
F19_S7   part/part/part   hold
```

EA_E3 (eval-ablation Meridian, not claim-spans CS_E3, not corpus E3:S0:ic_memo) remains the open mark false green on R3a: conf/conf/conf in `r9-basis-conflict-rows.json`.

## The numbers (questions 2, 3, 4)

Scan: unique R3a pairs in `r3a-corpus-blast-rows.json` (364).
Figures extracted as percent / multiple (Nx|times) / money / count+noun (facilities, employees, ...). Bare date-day numbers excluded.

```
pairs total:                              364
pairs where statement carries a figure:   159
pairs where passage contains NONE of the
  statement's figures (kind-matched):      47

of those 47, by label:
  no_support:            24
  partially_confirmed:   10
  conflicting:            9
  confirmed:              4

of the 9 CONFLICTING figure-misses:
  listed in section 2 below
  with a kind-matched better sentence in the
    FULL source for a missing statement figure:  1 raw hit
  after rejecting false friends (38,000 sqm for
    EUR 38 million):                              0

repeat-metric sources (2+ MOIC multiples or 2+ IRR %):
  pairs: 70   figure-misses: 5   miss rate: 7.1%
non-repeat sources:
  pairs: 89   figure-misses: 42  miss rate: 47.2%
```

CONFIRMED: load-bearing count for the F93_S2 shape (conflicting AND a better same-kind figure available in source AND not selected) is **0 of 364** under this scan. The invented F93_S2 case would count as 1 if it were in the corpus; it is not.

---

## 1. Did the model or the backstop call it?

F93_S2 restage runs (`f93-restage-and-hunting-rows.json`). The hunting harness applied backstops but did not persist `preBackstopClassification`. Replay on disk:

```
run  classification  gapWouldForce  if model said confirmed  if model said conflicting
0    conflicting     false          stays confirmed          stays conflicting
1    conflicting     false          stays confirmed          stays conflicting
2    conflicting     false          stays confirmed          stays conflicting
```

CONFIRMED: `hasEgregiousMagnitudeGap` is false for statement `2.6 times` vs passage `1.9x` / `24%` / `EUR 750 million`.

Why: B48 `collectBackstopFigures` / `hasEgregiousMagnitudeGap` only compare percents, money, and headcounts (`stage2-match-sources.mjs` around `collectBackstopFigures` and the groups loop in `hasEgregiousMagnitudeGap`). MOIC multiples are not a backstop kind. Thresholds that do exist:

```
percent: ratio >= 1.8 OR abs diff >= 15
money:   ratio >= 1.35
count:   ratio >= 1.12 AND abs diff >= 20
```

CONFIRMED: `isEgregiousPair` at `stage2-match-sources.mjs` ~L735-744.

So the conflicting label on F93_S2 is the **model**, not the backstop. The defect is prompt / passage-selection, not a code force. (A code half would exist only if someone later added multiples to the magnitude backstop without corresponding-passage discipline.)

Explanations (model prose naming 2.6 vs 1.9):

```
The statement claims a return of 2.6 times gross MOIC, while the source states
that Fund IV is currently marked at 1.9x gross MOIC. These figures are mutually
exclusive and cannot be reconciled by rounding.
```

CONFIRMED: all three S2 rows in `f93-restage-and-hunting-rows.json`.

---

## 2. How often does the selected passage fail to contain the draft's figure?

```
159 figured statements
47  selected passages with no kind-matched overlap (29.6% of figured)
9   of those labelled conflicting
```

### Every conflicting figure-miss (9)

```
nordholt-clean:S1:IC memo
  stmt: The business now operates 14 cold-chain facilities ... employs 720 people.
  stmt figs: 720 people (count). (14 facilities may pair with date noise; count extractor used)
  pass figs: 12 facilities, 640 people
  better same-kind for 720: no
  expl: 14/720 vs 12/640 mutually exclusive
  read: planted/outdated dirty-clean contrast, NOT F93_S2 verbatim shape

nordholt-dirty:S0:fact sheet
  stmt: ... net IRR of 18 per cent
  pass: Net IRR to date ... 14 per cent
  better for 18%: no
  read: classic planted magnitude conflict; correct pairing

nordholt-dirty:S0:LP update
  stmt: ... net IRR of 18 per cent
  pass: ... perform in line with our underwriting. (no figure)
  better for 18%: no
  read: modality/support conflict; figure absent from source

nordholt-dirty:S1:IC memo
  stmt: 15 facilities ... over 800 people
  pass: 12 facilities ... 640 people
  better for 800: no
  read: planted dirty numbers

nordholt-dirty:S4:IC memo
  stmt: EBITDA margin ... 25 per cent
  pass: Reported EBITDA margin is 18.6 per cent
  better for 25%: no
  read: planted magnitude

supersession:S1:source_A_annual_report_2019
  stmt: The company employs 720 people.
  pass: ... employed 640 people
  better for 720: no in that source file
  read: supersession / period instrument

supersession:S2:source_C_fund_update_2026
  stmt: Adjusted EBITDA ... EUR 45 million
  pass: ... restated to EUR 40 million
  better for 45: no
  read: intentional restatement conflict

F17:S9:17_synth_real_estate_logistics
  stmt: ... approximately 40 percent ... EUR 38 million ...
  pass: ... approximately 18% ...
  raw better hit: "38,000 sqm" (FALSE FRIEND for EUR 38 million)
  read: planted 40 vs 18 reversion conflict; NOT missing-verbatim

F18:S5:18b_synth_cross_source_pair_update
  stmt: (headcount claim including 142 people)
  pass: (other headcount)
  better for 142: no
  read: cross-source / update conflict
```

CONFIRMED list from refined disk scan. None is a verbatim quotation of a source sentence that the model ignored in favour of a different figure.

---

## 3. How often does the source contain a better passage?

Kind-matched search in the full source for figures missing from the selected passage:

```
of 47 figure-misses:
  better available (raw kind-matched):     2
  after rejecting false friends:           ~0 to 1 depending on money/sqm
  of 9 conflicting figure-misses with a
    true better sentence for the disputed
    figure:                                0
```

CONFIRMED: load-bearing number for production-like F93_S2 (conflicting from wrong passage while the right figure sits elsewhere in the same source) is **0 / 364** in this corpus.

HYPOTHESIS: the shape is real (F93_S2 proved it on an invented multi-claim LP update) but rare among the current 364 pairs, which are mostly single-claim or planted mismatches rather than two live performance figures for the same fund in one document.

---

## 4. Is it worse when the source repeats a metric?

```
repeat-metric miss rate:     5 / 70  = 7.1%
non-repeat miss rate:       42 / 89  = 47.2%
```

CONFIRMED: under this definition, misses do **not** concentrate on repeated MOIC/IRR sources. They concentrate on pairs where the passage is thin or off-topic (many `no_support`). That does **not** predict that multi-figure LP updates are safe; it predicts that the 364-pair set under-represents that document shape. F93_S2 is exactly the under-represented shape.

---

## 5. Does it affect the six proven false greens?

Passages from `r9-basis-conflict-rows.json` R3a arm (blast Part 1 rows lack passages).

```
EA_E2 (meridian_source.txt)
  passage: No senior departures across the last three fund cycles.
  corresponds: YES (support fact). Label partial is about the implication clause.

CS_E3 (claim-spans/.../source_ic_memo.txt)
  passage: Fund IV is marked at 1.9x ... Fund III is marked at 1.7x ...
  corresponds: YES on figures. Partial is the judgement clause.

F01_S10 (01_bvp_shopify_memo.txt)
  passage: enthusiasm / disrupt / App Store growth paragraph
  corresponds: PARTIAL / soft. No figures. Right enough for the evaluative fight.

F04_S20 (04_synth_vc_pinterest_style_memo.txt)
  passage: monetisation strategy / native advertising paragraph
  corresponds: WEAK. Engagement/founders claims live elsewhere. Still not a
  figure-miss false red; label is partial for missing defensibility.

F12_S0 (12_synth_linkedin_post.txt)
  r0: 2021 acquisition ceiling passage (weak for "sale this week")
  r1/r2: sale-completion passage (corresponds on the sale fact)
  corresponds: MIXED across runs. Not the F93_S2 figure-miss shape.

EA_E3 (eval-ablation/meridian_source.txt)
  passage: Fund IV ... currently marked at 1.9x gross MOIC and 24% gross IRR ...
  figure overlap: YES (1.9 and 24 present)
  basis correspondence: NO (returned vs marked)
  read: FALSE GREEN on basis, NOT a passage that lacks the draft's numbers.
  The model found the right figures and the wrong verb. Different defect.
```

CONFIRMED: none of the six headline partials/holds is a conflicting false red from a passage that omits the draft's figures. EA_E3 remains a same-figure wrong-basis false green.

---

## 6. My read

Is this a real production defect or an artefact of a terse invented fixture?

```
Both.
CONFIRMED as a real mechanism: live R3a, identical draft, multi-claim source,
model cites the other figure, returns conflicting (F93_S2 x3).
CONFIRMED as rare in the current 364-pair corpus: 0 clean matches of that shape.
```

Would I pause B109?

```
Pause shipping the CONFLICTING-route R9 wording: yes.
Pause all work on realised-versus-mark: no.
```

The conflicting destination assumes corresponding-passage comparison. That assumption failed on a realistic LP-update shape even if the corpus rarely samples it. Continuing to chase EA_E3 with a conflicting rule without passage discipline is how you mint false reds in production documents that state both a mark and a realised multiple.

What next, cost, stopping rule:

```
PASS: cheap targeted probe, not a blast.
  Build 5-10 invented Halden LP-update pairs that place two same-fund
  performance figures in one source (mark + returned at different values;
  also identical-quotation controls).
  Run live R3a x3 only. Cache OFF. ~$0.40-$1.00.
STOPPING:
  CONFIRM defect: >=2 pairs show identical-quotation -> conflicting via the
    other figure's passage on >=2/3. Then write a corresponding-figure
    discipline before any R9 conflicting remeasure.
  NOTE AND MOVE ON: 0/10 show it. Then treat F93_S2 as a fragile edge case,
    document it, and resume B109 with partial destination or with explicit
    same-quantity gating in the conflict limb.
Do NOT strip the mark line from fixture 93 to force a control green.
Do NOT run an $8.50 corpus blast for this.
```

If the corpus scan alone is enough to note and move on: it is a legitimate answer for **prevalence in the current graded/corpus set**. It is not a legitimate answer for **safety of the conflicting route in real LP updates**. I would not move on to shipping R9 conflicting on corpus rarity alone.

Pausing B109 entirely because of one fixture is a mild overreaction. Pausing the conflicting destination until passage correspondence is specified is not.

---

## 7. Where Claude has been wrong

Known: attributed hunting to R9; built a control the source made unbuildable; predicted identical pairs confirm on R3a.

Additional:

```
1. Treated "passage hunting" as an R9-specific incentive. Live R3a does it
   without R9 (F93_S2).

2. Designed hunting bait into the same document as the confirmed control, then
   called the reference failure a fixture bug. The fixture succeeded in
   surfacing a product bug.

3. Planned an $8.50 blast before knowing whether the false-red shape appears
   outside one invented page.

4. Equated "corpus has 0 gross/net disagreements" style rarity arguments with
   "safe to ship exclusivity rules." Same mistake pattern here.

5. Under-weighted that Meridian already contains mark-1.9 and returned-3.1 in
   one page; EA_E3's false green is same-figure, but the document class is the
   dangerous one.
```

---

## 8. Anything we have not asked

```
- Magnitude backstop does not see MOIC multiples. If a future code route forces
  2.6 vs 1.9 after a wrong passage is selected, the false red becomes sticky
  even when the model would have hedged. Do not add multiples to B48 without
  corresponding-passage checks.

- Four confirmed figure-misses exist in the scan. Those are a different
  worry (right label?). Not expanded here; worth a follow-up only if labels
  are trusted for gates.

- F04_S20's monetisation passage is a soft correspondence miss on an
  evaluative hold. Separate from this defect, but it shows passage quality
  already wobbles on headline cells.

- claim-spans CS_E3 and corpus E3:S0:ic_memo are still not eval-ablation EA_E3.
```

---

## Opinion (plain)

The false red is real on a short LP update with two performance figures. It is not common in the 364-pair set we have. That means: do not panic about prevalence, do not ship a conflicting basis rule that assumes good passage selection, and do not "fix" fixture 93 by deleting the mark line. Size said 0/364 for the clean shape; F93_S2 said the shape exists. Believe both.

## Technical summary

Disk-only scan of 364 R3a pairs plus backstop replay on F93_S2. Report only; live prompt and fixtures unchanged. Helper scan artefacts under `scripts/diagnostic/eval-ablation/`.

## Plain-language summary

Sometimes Review can quote the wrong sentence from a document that also contains the right one, and call a copied sentence a contradiction. That happened on a small test page. Across the larger 364-pair set it almost never shows up in that exact form. The risk is real for multi-figure fund updates; it is not a reason to ignore the mark false green, and it is a reason not to ship a harsher contradiction rule until passage selection is constrained.
