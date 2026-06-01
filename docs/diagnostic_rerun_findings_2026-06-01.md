# Diagnostic Re-run — Findings and Comparison

**Date:** 1 June 2026
**This run:** `2026-06-01-122541` (20 fixtures, v4 pipeline, full LLM path with keys)
**Baseline:** 26 May 2026 diagnostic — `diagnostic_findings.md`, runs `2026-05-26-205208` + `2026-05-26-212900`
**Pipeline changes since baseline:** R6.3 (principle-based suppression), R6.4 chapter (R6.4a/b/c — public-version compliance), R6.5 (house-style framework + deterministic backstops), R2.7.1 (conflict-vs-partial calibration), R2.7.2 (semantic frame matching), fix-pipelineversion-label, D1.6 (per-fixture log capture).

---

## Purpose

Two questions, deliberately separated:

1. **Relative** — did the QC/Review work shipped since 26 May move the output in the intended direction, and did it introduce regressions?
2. **Absolute** — independent of what changed, is the current output good enough to put in front of a Partners Group reviewer?

Both axes are reported below. The absolute read matters because "improved" and "shippable" are different bars, and the product is heading toward external PG users.

---

## Method and scope

- All 20 fixtures re-run through the v4 pipeline with API keys loaded (confirmed: no fixture fell to v3, no keyless run — verified by route-selection grep across all `pipeline.log` files).
- D1.6 (shipped this session) persisted per-fixture `pipeline.log` for all 20 fixtures — the log-capture gap that defeated the 26-May D1.5 analysis is closed.
- **Verdict-mix comparison:** all 20 fixtures (counts-level).
- **Deep per-statement read (statement vs source reasoning vs conflict excerpt):** F01, F11, F12, F14, F18, F19 (the conflict-relevant fixtures) for evidence; F02, F03 for editorial/compliance.
- **Light/counts-level only:** the clean-and-held fixtures (F05, F07, F10, F16, F20) and the remainder.

---

## Executive summary

The work shipped since 26 May paid off where it mattered, with no evidence-layer regressions.

- **Evidence layer is strong — stronger than the 26-May "broadly sound" framing.** Every conflicting verdict examined in the deep read is a correct catch; there were no false positives in the set. In two fixtures (F19, F12) the pipeline caught genuine factual errors that the hand-written 26-May expected-outcomes baseline had missed — i.e. the pipeline was more accurate than the rubric.
- **The headline 26-May negative finding is resolved.** F18 (cross-source contradiction) returned 0 conflicting verdicts on 26 May despite detecting the conflicts; today it correctly surfaces them, and does so with sophisticated behaviour (distinguishing "supported claim contradicted by another source" from "the claim itself is wrong").
- **The conflict over-firing risk did not materialise.** Conflicting verdicts rose across several fixtures, but the deep read confirms these are real catches, not calibration drift.
- **Editorial noise came down.** R6.5's framework and deterministic backstops resolved the two 26-May editorial complaints (wrong-direction flags; flags on correctly-formatted figures). What remains is defensible house-style enforcement plus one taste question.
- **Compliance improved substantially, with one specific blind spot remaining.** The 26-May "universal-jurisdiction" miscalibration is fixed; tone is softened from assertions to confirm-prompts; several flags that look like over-firing are now defensible. The one real remaining problem: the compliance layer does not recognise that content drawn from an already-public source is publishable by definition, and still flags public-sourced figures as potentially confidential.
- **One new reliability finding:** the editorial reviewer silently falls back to "clean" when its structured output fails schema validation twice (5 statements across 4 fixtures this run). Low rate, but silent — scheduled as the next fix.

---

## Section 1 — Evidence layer

### 1.1 Verdict-mix comparison (all 20)

Format: C = confirmed, P = partial, X = conflicting, NS = not_supported. "26-May" = Actual from baseline findings.

| Fx | Type / Vis | Expected | 26-May actual | Today | Note |
|----|-----------|----------|---------------|-------|------|
| 01 | rep comm / complete | 10C | 11C 1P | 10C 1P 1NS | New NS = "We recommend approval" (non-claim) |
| 02 | PG real / public | clean | 9C | 9C | Evidence clean; compliance in §3 |
| 03 | PG real / public | clean | 9C | 9C | Evidence clean; compliance in §3 |
| 04 | memo / complete | 16C | 15C 1P | 19C 1P 1NS | Count up; not deep-read |
| 05 | stress: wrong-entity | 5C 1X 2NS | 5C 2X 1NS | 5C 2X 1NS | Held — clean |
| 06 | rep comm / complete | 14C | 11C 1X | 11C 1X | Stable |
| 07 | linkedin / public | 8C | 9C | 7C | Clean class |
| 08 | letter / complete | 16C | 15C 1P 1X 2NS | 16C 1X 1NS | Improved vs May |
| 09 | rep comm / complete | 18C | 15C 1X | 14C 1NS | Stable |
| 10 | press rel / public | 7C | 7C | 7C | Clean, held |
| 11 | letter / complete | 15C | 14C 1NS | 13C 1X | New X — verified correct (§1.3) |
| 12 | linkedin (voice stress) | 10C | 6C 1P 2X 2NS | 5C 1P 2X 2NS | Conflicts verified correct (§1.3) |
| 13 | stress: internal inconsist. | mixed | 11C-ish | 11C 1P 1X 3NS | Catching inconsistency |
| 14 | thesis-only / complete | clean-ish | 10C-ish | 10C 2X 1NS | Conflicts verified correct (§1.3) |
| 15 | stress: chunking 4.8k | ~20C | 34C 2P 2X 2NS | 29C 1P 2X 1NS | Held; no structural breakdown |
| 16 | rep comm / complete | 18C | 13C | 13C | Clean, held |
| 17 | letter / complete | 14C | 10C 1X | 10C 1X | Stable |
| 18 | stress: cross-source | 5C 5X 2NS | 9C 1P **0X** | 7C **3X** | **Resolved — see §1.2** |
| 19 | rep comm / complete | 17C | 12C 1P 2X | 11C 3X | Conflicts verified correct (§1.3) |
| 20 | rep comm / public | 10C | 8C 2NS | 8C 1NS | Stable |

### 1.2 F18 cross-source contradiction — resolved

The 26-May headline negative finding: F18 detected cross-source conflicts (`hasConflict: true` on 6 statements) but the aggregator elevated **none** to a conflicting verdict.

Today the pipeline does sophisticated, correct work on the same fixture (source 18a initial memo vs 18b corrected update):

- Statements 3, 4, 5, 7 — `supported` with `hasConflict: true`, conflict excerpts exactly right (380 vs 412 companies; EUR 38m vs 35m ARR; 142 vs 167 employees). The statement faithfully matches its primary source; a newer source contradicts it; the verdict reflects the primary match and the flag surfaces the discrepancy.
- Statements 0, 2, 8 — full `conflicting` verdicts. 0 and 2 because the draft asserts the deal **completed** ("we are writing to confirm completion", "we have invested") when the source only **recommends** it. Completed-vs-recommended is a correct and material catch.

The pipeline distinguishes *a supported claim with a contradicting data point elsewhere* (kept supported + flagged) from *a claim that is itself wrong* (elevated to conflicting). The detection-but-no-elevation bug from 26 May is gone.

**Open product decision (not a bug):** statements 3/4/5/7 remain `supported` despite real cross-source numeric contradictions. Whether "source A confirms, source B contradicts" should read as supported-with-flag, partial, or conflicting is a deliberate display-semantics choice. Risk: a reviewer skimming green verdicts may miss the conflict flag (an EUR 38m-vs-35m ARR discrepancy is a serious thing to miss). → **R6.8.** Recommend deciding only after reviewing how prominently the conflict flag surfaces in the UI; the detection is correct, only the display is unsettled.

### 1.3 New conflicts on "clean" fixtures — verified as correct catches, not over-firing

The risk going in was that conflict calibration had over-reached. The deep read disproves it. Every new/examined conflict is a real discrepancy:

- **F11.S7** — draft: four bolt-ons "anchored by HeatTech GmbH for SEK 1.1 billion"; source: SEK 1.1bn was the *combined* EV of all four. Misattribution. Correct.
- **F14.S4** — draft generalises payer-reimbursement improvement "across major European markets"; source: improvement is for CDS software specifically. Over-broad generalisation. Correct.
- **F14.S11** — draft: "we expect to bring a specific potential investment"; source: "not yet in dialogue with any specific company." Direct contradiction. Correct.
- **F19.S2** — draft: NorTech exit at SEK 18.4bn; source: SEK 12.8bn. Hard numeric contradiction (independently corroborated by F11.S2 confirming 12.8bn). Correct, and important.
- **F19.S7** — draft attributes parcel-volume figures to 2024; source: 2025. Period misattribution. Correct.
- **F19.S13** — draft: exit processes "likely to launch in first and third quarters"; source: only "progressing toward exit-readiness", no quarters committed. Unsupported specific. Correct.
- **F12.S0** — draft: "more than four years of partnership"; source: work alongside the team lasted eighteen months. Duration drift (sale completion itself confirmed). Correct.
- **F12.S1** — confirmed the descriptive identity (Stockholm HQ, manufacturer) but conflicted on the embedded over-claim that NorTech was "dominant in the Nordics" when the source says strong only in Sweden. Discriminating, not noise. Correct.

**Notable:** on F19 and F12 the pipeline caught genuine factual errors the hand-written expected-outcomes baseline had treated as clean. The pipeline outperformed the rubric. This lowers the evidential weight the "Expected" column should carry in future comparisons.

### 1.4 Residual evidence caveats (both known, neither severe, neither regressed)

1. **Functional-element noise.** Non-claims — recommendations ("We recommend approval", F01.S11), salutations, sentiment lines ("the numbers tell one story", F12.S5) — return `not_supported`, which reads as "this claim failed verification" when in fact there is nothing to verify. Cosmetically misleading; makes output look noisier and less intelligent than it is. Unchanged from 26 May. → **R6.9 (non-claim statement handling).** Confirm R6.9 still points at this.
2. **Supported-with-conflict display semantics.** See §1.2. → **R6.8.**

### 1.5 Absolute evidence verdict

Shippable-quality evidence assessment. Conflicts are accurate, cross-source detection is correct and sophisticated, the chunking ceiling held (F15, ~4,800-word source, no structural breakdown), the stress fixtures (F05 wrong-entity, F13 internal inconsistency) behave correctly. The two caveats are cosmetic/semantic, not accuracy failures. This is the moat and it is sound.

---

## Section 2 — Editorial layer

R6.5 (house-style framework + deterministic backstops) landed. The two 26-May editorial complaints — wrong-direction flags and flags firing on correctly-formatted figures — are not present in the read.

- `em_dash` (F03.S3) — clean deterministic backstop hit; a real em-dash correctly flagged.
- `marketing_language_excess` ("a leading pan-Nordic data center platform" F02.S0; "exceptionally well positioned" F02.S5) — house-style hyperbole rule firing as designed.
- `overreach_unsupported_causal` (F03.S5, investment "will support continued growth") and `narrative_coherence` (F02.S8) — substantive editorial observations, not noise.

**Open taste question (not a defect):** how aggressively to flag boilerplate PR hyperbole ("a leading…") in already-published content. This is a tuning preference, not a miscalibration. Worth a conscious decision; lives near R6.2.

**Absolute editorial verdict:** calibrated and defensible. No wrong-direction flags, no false figure flags. Ready for use with the hyperbole-aggressiveness preference left to tune.

---

## Section 3 — Compliance layer

The most-improved layer, and the one with the single sharpest remaining gap. Assessed deeply on F02 and F03 — the two real PG press releases that were drafted, compliance-reviewed, and published externally (so any flag on them is, by construction, a flag on cleared public content).

### 3.1 What improved

- **Universal-jurisdiction miscalibration: fixed.** On 26 May, "exceptionally well positioned" (F02.S5) fired as "unqualified superlative *restricted under fund marketing regulations*" — treating jurisdiction-specific marketing rules as universal. Today the same phrase fires as `comparative_claim_without_basis` ("a comparative claim without a named benchmark or source") — a substance claim, not a regulatory-overreach claim, and defensible. R6.4c did its job.
- **Tone softened from assertion to confirm-prompt.** The EV flag (F02.S0) no longer declares the figure confidential; it says it "has the hallmarks of confidential detail… Confirm this disclosure is permitted before publishing." The named-individual flag (F03.S6) is a "confirm consent" prompt. Register is materially better.
- **Several flags are now defensibly correct, not noise.** F02.S3 split the vague 26-May "performance claims without disclosure" into two specific points: `return_figure_gross_net_qualifier_missing` (returns don't state gross vs net) and `expected_disclosure_language_absent_on_public` (public performance claims lack disclosure language). The second is arguably catching a genuine gap rather than over-firing.

### 3.2 The one real remaining gap: public-source awareness

F02.S0 still flags "an enterprise value of USD 4 billion" as `precise_confidential_detail_in_public_version` — on a press release PG published externally. The compliance reviewer does not reason: *this source is itself a public document, therefore these values are publishable by definition.* This is miscalibration (a) from the 26-May findings ("visibility-context awareness"). R6.4 shipped the visibility *wiring* (Complete vs Public) but not the source-is-already-public *inference*.

This is the highest-value remaining compliance item: it fires on the exact documents the first PG users will recognise as their own cleared output, which is where reviewer trust erodes fastest.

### 3.3 Absolute compliance verdict

Substantially improved and much closer to shippable. The jurisdiction problem is gone, tone is appropriate, and most flags are defensible. The remaining blocker for confident external use is public-source awareness — a single, well-defined fix.

---

## Section 4 — Reliability finding (new): silent editorial schema-fallback

The editorial reviewer requests structured JSON from gpt-4o. When validation fails after one retry, it applies a "clean fallback" — emitting the statement's editorial review as zero concerns. This run: 5 events across 4 fixtures (F01 ×1, F06 ×1, F14 ×2, F20 ×1) out of 200+ statements — a low rate.

The behaviour is safe-by-design (never trust unvalidated LLM output) but **silent**: a fallback "clean" result is indistinguishable in the output from a genuine clean pass, giving the reviewer a false signal. For an audit-safe product this is the wrong property regardless of rate. F14 (thesis-only, low-fact-density) hit it twice, suggesting failures may cluster by statement type.

**Note:** the 5 affected statements were excluded from the editorial assessment above — they are data holes, not clean passes.

→ Scheduled as the next fix (before R7), per Ben. Two separable problems: (a) observability — mark a fallback distinctly from a real clean pass; (b) reliability — diagnose why validation fails twice (read the malformed model output in `pipeline.log` first). Diagnose-first.

---

## Section 5 — Resulting actions

**Confirmed resolved by work since 26 May:**
- F18 cross-source aggregation (was the headline negative finding).
- Editorial noise — wrong-direction flags and false figure flags (R6.5).
- Compliance universal-jurisdiction framing (R6.4c).

**Next fix (before R7), scheduled:**
- Editorial schema-fallback: silent-failure observability + reliability diagnosis (§4).

**Open items confirmed / sharpened by this run:**
- **Compliance public-source awareness** (§3.2) — sharpened from the broad 26-May "compliance over-fires on public content" to a single specific fix. Highest-value remaining compliance item; candidate for near-term scheduling given PG-user proximity.
- **R6.8 cross-source verdict display semantics** (§1.2) — reframed: detection works; the open question is display (supported-with-flag vs partial vs conflicting). Decide after reviewing UI flag prominence. Ben's lean: escalate.
- **R6.9 non-claim statement handling** (§1.4) — functional-element not_supported noise; unchanged. Confirm R6.9 still scoped to this.

**Taste/tuning (no defect):**
- Editorial hyperbole-aggressiveness on boilerplate PR language (§2) — near R6.2.

**Methodology note:**
- D1.6 worked across the full batch; persistent per-fixture logs are now available, closing the gap that defeated D1.5.
- The expected-outcomes baseline was outperformed by the pipeline on F19 and F12 — future comparisons should weight per-statement source reads above the hand-written "Expected" column.
