# Variant A re-run: verbatim quoting enforced

**Decision: LOSES on both passes.** Locatability 210 of 280 (75.0%) on pass 1 and 215 of 280 (76.8%) on pass 2. Both below 90%. Whole-context grading is rejected. The pipeline stands. No third attempt.

Numbers: `scripts/diagnostic/bakeoff/runs/verbatim-a-score-summary.json`. Control pack under `scripts/diagnostic/accuracy/` was not modified.

## Part 0

This re-run is a defect fix, not a goalpost move. The WIN and LOSE thresholds are unchanged. The first prompt already said "verbatim quote" but did not require an exact substring or forbid reconstruction. Locatability was always `locatePassageInSource`. Tightening the quoting sentence matches that metric and the pipeline's `validatePassageAgainstSource`. I did not move the 95% / 90% bars, the 7 of 11 catch floor, the 68 of 76 leave-alone floor, or the 5 of 13 clause.

Empty passages count against locatability (denominator misses). That is stricter than the first run, which dropped empties. I also report the old non-empty-only rate so the quoting fix can be compared without that change. Even on the old formula this re-run is 78.9% and 80.8%, still below 90%. CONFIRMED: `verbatim-a-score-summary.json` `locatability` and `locNonEmptyOnly`.

The claim that the first prompt "never required verbatim quotation" is slightly overstated. It did. This change makes that contract explicit. That is still a format fix. After this failure, it is no longer an unstated format gap. It is an architectural result.

Prompt edits: one sentence, the `passage` field. Nothing else in `variant-a.md` was touched.

## Scoreboard

| Metric | First A1 / A2 | This A1 | This A2 |
| --- | --- | --- | --- |
| Decision | LOSES / LOSES | **LOSES** | **LOSES** |
| Locatability (empty counts) | n/a | 210/280 (75.0%) | 215/280 (76.8%) |
| Locatability (non-empty only) | 207/264 (78.4%) / 218/265 (82.3%) | 210/266 (78.9%) | 215/266 (80.8%) |
| Validation fail, non-empty | n/a | 56 of 266 (21.1%) | 51 of 266 (19.2%) |
| Group A agreement | 7 / 8 of 11 | 7 of 11 | 6 of 11 |
| Group A detection | 8 / 9 of 11 | 8 of 11 | 7 of 11 |
| Leave-alone | 74 of 76 | 72 of 76 | 72 of 76 |
| Group B agreement | 76 / 75 of 89 | 74 of 89 | 74 of 89 |
| Group B non-C flagged of 13 | 2 / 1 | 2 | 2 |
| Stability | 98 of 100 | 99 of 100 | (same pair) |
| F13 employs 320 | conflicting | conflicting | conflicting |
| F18 ARR from 38 | confirmed / conflicting | conflicting | confirmed |

## 1. Decision-rule verdict

Unchanged rule:

- WINS: catch at least 7 of 11 AND leave-alone at least 68 of 76 AND locatability at or above 95% with non-zero quotes AND at least 5 of the 13 non-Confirmed Group B rows flagged.
- LOSES: catch 4 of 11 or fewer, OR leave-alone below 60 of 76, OR locatability below 90% or zero quotes.

Pass 1: catch 7 of 11 (meets WIN floor), leave-alone 72 of 76 (meets WIN floor), locatability 75.0% with 266 quotes (LOSES: below 90%), flagged 2 of 13 (would still block a WIN). Verdict **LOSES**. CONFIRMED: `verbatim-a-score-summary.json` `a1.decision`.

Pass 2: catch 6 of 11 (neither WIN nor the LOSE catch clause), leave-alone 72 of 76, locatability 76.8% (LOSES: below 90%), flagged 2 of 13. Verdict **LOSES**. CONFIRMED: `a2.decision`.

## 2. Locatability and validation, per pass

Pass 1. Locatability 210 located / 280 slots (75.0%). Empty 14. Non-zero quotes. FAIL. Validation: 210 accepted, 56 rejected of 266 non-empty (failure rate 21.1%). Including empty as validation misses: 25.0%. CONFIRMED: `a1.locatability`, `a1.validation`.

Pass 2. Locatability 215 / 280 (76.8%). Empty 14. FAIL. Validation: 215 accepted, 51 rejected of 266 (19.2%). Including empty: 23.2%. CONFIRMED: `a2.locatability`, `a2.validation`.

Enforcing verbatim did not lift locatability through 90%, on either formula.

## 3. Group A catch and detection (n=11)

Pass 1. Agreement 7 of 11 (Wilson 35.4% to 84.8%). Detection 8 of 11 (43.4% to 90.3%). CONFIRMED: `a1.groupAAgreement`, `a1.groupADetection`.

Pass 2. Agreement 6 of 11 (Wilson 28.0% to 78.7%). Detection 7 of 11 (35.4% to 84.8%). CONFIRMED: `a2.groupAAgreement`, `a2.groupADetection`.

## 4. Leave-alone and Group B agreement

Pass 1. Leave-alone 72 of 76 (Wilson 87.2% to 97.9%). Group B agreement 74 of 89 (74.0% to 89.5%). CONFIRMED: `a1.leaveAlone`, `a1.groupBAgreement`.

Pass 2. Leave-alone 72 of 76. Group B agreement 74 of 89. CONFIRMED: `a2.leaveAlone`, `a2.groupBAgreement`.

Both still clear the WIN leave-alone floor of 68. Both are a step down from the first run's 74 of 76.

## 5. Group B non-Confirmed flagged, of 13

Pass 1: 2 of 13. Pass 2: 2 of 13. Previous run 2 and 1. WIN floor is 5.

**This clause would still block a WIN even if quoting had been fixed.** Catch and leave-alone on pass 1 would have been enough. Locatability failed anyway. The 13-row clause is an independent fail. CONFIRMED: `a1.partialsIgnored.flagged` and `a2.partialsIgnored.flagged`.

## 6. Stability

99 of 100. One move: F18 ARR-from-38, `conflicting` on pass 1 to `confirmed` on pass 2. CONFIRMED: `stability.moved`.

## 7. Empty passages and verdicts

All 261 extracted statements, 280 source slots (some fixtures have two sources): 14 empty on both passes. CONFIRMED: `a1.locatability.empty`.

On the 100 labelled rows, 4 statements returned an empty passage on both passes. All four were all-empty on their source slots. All four mapped to `no_support`. None mapped to `confirmed`. CONFIRMED: `emptyRowsA1`, `emptyRowsA2`.

| Fixture | Statement | Ben | Mapped |
| --- | --- | --- | --- |
| 04 | We have stress-tested for total loss... | confirmed | no_support |
| 05 | Halden Group will support continued growth... | conflicting | no_support |
| 13 | The Company has built strong fundamentals. | confirmed | no_support |
| 14 | We will provide further detail when the work is sufficiently advanced. | no_support | no_support |

Empty did not make the grader confirm less on those four. It mapped them to absence. Two of those four are Ben-Confirmed, so empty-as-no_support is a real leave-alone cost (72 of 76 vs 74 of 76 on the first run). The Halden row is still detected (wrong label, same as before). F14 no_support is agreement.

Verbatim quoting did not produce a mass of empty hedges. It also did not stop 51 to 56 paraphrases.

## 8. Diagnostic rows

### F13. Employs 320

Both passes: `conflicting`. Quoted the 285-person breakdown. `passageValidated: true`. CONFIRMED: `f13A1perSource`, `f13A2perSource`. Decomposition / one-passage remains the cause of the pipeline miss on this row.

### F18. ARR growth from 38

Pass 1: `conflicting`. Source 0 and source 1 both conflicting. Source 1 quoted "The cleaned ARR ... is EUR 35 million." Both passages validated. CONFIRMED: `f18A1perSource`.

Pass 2: `confirmed`. Source 0 confirmed on the old 38 million line (validated). Source 1 confirmed with a paraphrase that **failed** validation. That is any-confirmed-wins with an invented passage on the newer source. CONFIRMED: `f18A2perSource`.

F18 remains reachable and unstable.

## 9. Cost

Estimate two-pass A USD 0.8805. Ceiling USD 5. Actual USD 0.6069 (0.3308 + 0.2761). Wall clock 160870 ms and 168328 ms. CONFIRMED: runner stdout and `totals` in `verbatim-a-score-summary.json`.

## 10. Every disagreement

`pipelineMapped` here is the variant's mapped label (scorer field name). Ben is `benLabel`.

### Pass 1 Group A (4)

1. F05. "During Westhaven's ownership, Norwell has invested significantly in advanced composite manufacturing capability." Ben conflicting. Variant confirmed.
2. F05. "Halden Group will support continued growth in commercial aerospace and an accelerated expansion of Norwell's space applications business, where the Company has identified meaningful capacity to grow share." Ben conflicting. Variant no_support. Empty passage. Detected, wrong vocabulary.
3. F13. "EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million." Ben conflicting. Variant confirmed.
4. F18. "We are writing to confirm completion of the transaction with Nordic SaaS Holdings..." Ben conflicting. Variant confirmed.

CONFIRMED: `groupADisagreementsA1`.

### Pass 1 Group B (15)

1. F01. Shopify Canadian e-commerce platform... Ben partially_confirmed. Variant confirmed.
2. F02. As AI workloads continue to drive demand... Ben partially_confirmed. Variant confirmed.
3. F04. We are writing to inform you of a new investment in Pinterest... Ben partially_confirmed. Variant confirmed.
4. F04. The Company currently has 8 employees, including the founders, and 1.5 million monthly active users. Ben confirmed. Variant conflicting.
5. F04. We have stress-tested for total loss... Ben confirmed. Variant no_support. Empty passage.
6. F08. We are writing to inform you of a new investment in Helvetia Precision Components... Ben partially_confirmed. Variant confirmed.
7. F08. International margin expansion - footprint consolidation in Switzerland... Ben partially_confirmed. Variant confirmed.
8. F08. End-market growth - structural exposure to medical implants... Ben partially_confirmed. Variant confirmed.
9. F09. Strong demand in medical implants... Ben partially_confirmed. Variant confirmed.
10. F09. Our base case returns remain intact but the segment will be a moderating factor through 2026. Ben partially_confirmed. Variant confirmed.
11. F12. NorTech is a Stockholm-headquartered manufacturer... Ben partially_confirmed. Variant confirmed.
12. F13. The Company has built strong fundamentals. Ben confirmed. Variant no_support. Empty passage.
13. F13. We project ARR growth from EUR 81 million today to approximately EUR 195 million... Ben confirmed. Variant conflicting.
14. F14. At the same time, generative AI is exposing incumbents... Ben partially_confirmed. Variant confirmed.
15. F17. We are writing to inform you of a new investment in the Urbis Logistics Portfolio... Ben partially_confirmed. Variant confirmed.

CONFIRMED: `groupBDisagreementsA1`.

### Pass 2 Group A (5)

Same four as pass 1, plus:

5. F18. ARR growth from EUR 38 million... Ben conflicting. Variant confirmed.

CONFIRMED: `groupADisagreementsA2`.

### Pass 2 Group B (15)

Same 15 rows as pass 1. CONFIRMED: `groupBDisagreementsA2`.

## What I actually think

The re-run was legitimate. It failed. Telling gpt-4o to copy a substring does not make whole-context grading emit locatable evidence at 261 statements times N sources. About one in five non-empty passages still fail `validatePassageAgainstSource`. Locatability stays in the high 70s. That is not a prompt typo. It is the architecture.

The 13-row clause would have blocked a WIN on its own. Catch on pass 2 also slipped to 6 of 11. Leave-alone dropped from 74 to 72 because two Ben-Confirmed rows went to empty `no_support`.

F13 still caught. That finding from the first bake-off is not withdrawn. It does not license replacing Stage 2 with this grader. Per the terms written before this run: locatability failed again, so whole-context grading is rejected and the pipeline stands.

I will not propose a third attempt.

## Files

Prompt: only the `passage` bullet in `scripts/diagnostic/bakeoff/prompts/variant-a.md`.

Also, not prompt text: `run-variant-a.mjs` now validates with `validatePassageAgainstSource` after env load, writes `variant-a-verbatim-pass-*.json`, estimates two A passes, ceiling USD 5. `validatePassageAgainstSource` is exported from `lib/qc/pipeline-v4/stage2-match-sources.mjs` so the diagnostic uses the pipeline function. `score-bakeoff.mjs` counts empty slots as locatability misses and reports validation failure rate. Variant B prompt and runner were not edited.
