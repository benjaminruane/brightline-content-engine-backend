# R7 Stage-2 shadow multi-passage diagnostic

Generated: 2026-08-02T06:44:03.224Z

## 0. Method notes

- Baseline matcher: exported `matchAllSources` (wraps private `matchOnePair`; gpt-4o temp 0).
- Widened matcher: `callLLM` + `STAGE_MODELS['stage2-matching']` + `stage2_v4_multipassage_shadow.md`.
- Aggregator / excerpts: real `aggregateVerdict` (as aggregateVerdictV4) + `selectExcerpts`.
- **Caveat:** statements loaded from answer-keys — Stage-1 extraction bypassed.
- Estimated LLM calls (pre-run): 40.

## 1. NEUTRALITY (with verdict-change attribution)

**Headline: (a) 0 of 10 statements changed verdict and/or hasConflict; (b) of those — LEGITIMATE-SURFACING=0, SPURIOUS-DRIFT=0, MIXED=0, NON_ADDITIVE=0.**

**Option-2 gate (b):** PASS — zero SPURIOUS-DRIFT and zero MIXED (widening is verdict-safe once emit is classification+precision gated).

Aggregator mechanism: existence reduction (`anyConfirmed` → `anyConflicting` → `anyPartial` → `not_supported`) over the raw match list; **does not count** and **does not dedupe by sourceIndex**. A verdict/hasConflict change under widening is **expected and legitimate** when driven by a real planted passage single-pick dropped, and a **problem** only when driven by a false/noise passage.

| Fixture | Stmt | Baseline V/C (contrib) | Shadow V/C (contrib) | Change label | Primary excerpt changed |
|---|---|---|---|---|---|
| alp_multisource | S1 | confirmed/false (0) | confirmed/false (0) | NEUTRAL | yes |
| alp_multisource | S2 | confirmed/false (0) | confirmed/false (0) | NEUTRAL | no |
| alp_multisource | S3 | confirmed/true (0,1) | confirmed/true (0,1) | NEUTRAL | no |
| alp_multisource | S4 | not_supported/false (0,1) | not_supported/false (0,1) | NEUTRAL | no |
| alp_multisource | S5 | confirmed/false (1) | confirmed/false (1) | NEUTRAL | no |
| crf_multisource | S1 | confirmed/false (0) | confirmed/false (0) | NEUTRAL | no |
| crf_multisource | S2 | confirmed/false (0,1) | confirmed/false (0,1) | NEUTRAL | yes |
| crf_multisource | S3 | confirmed/true (0,1) | confirmed/true (0,1) | NEUTRAL | yes |
| crf_multisource | S4 | confirmed/false (0) | confirmed/false (0,1) | NEUTRAL | no |
| crf_multisource | S5 | not_supported/false (0,1) | not_supported/false (0,1) | NEUTRAL | no |

### Change attribution detail

(no verdict/hasConflict changes)

## 2. PRECISION

**Headline: widened TP=11, FP=6 — noise present; see FP list.**

- **alp_multisource S1** (clean_single_passage): TP=1 FP=1
  - FP [no_support_with_text] src=1 cls=no_support: "The Company employs 240 staff as of March 2025, not 210 as stated in our initial memo, reflecting two distribution-centr…"
- **alp_multisource S2** (multi_passage_single_source): TP=1 FP=0
- **alp_multisource S3** (confirm_plus_conflict): TP=2 FP=0
- **alp_multisource S4** (noise_trap): TP=0 FP=1
  - FP [no_support_with_text] src=0 cls=no_support: "The transaction was advised by Elena Foscari, former operations director at Veneto Freight, who supported the commercial…"
- **alp_multisource S5** (offset_stress_curly_quotes): TP=1 FP=0
- **crf_multisource S1** (clean_single_passage): TP=1 FP=0
- **crf_multisource S2** (multi_passage_single_source): TP=2 FP=2
  - FP [novel_unexpected] src=0 cls=confirmed: "The Platform generates contracted revenue of EUR 44 million per annum, up from EUR 34 million two years ago, underpinned…"
  - FP [novel_unexpected] src=0 cls=confirmed: "The Platform comprises operational wind and solar assets totalling 1.2 GW of installed capacity across three countries."
- **crf_multisource S3** (confirm_plus_conflict): TP=2 FP=0
- **crf_multisource S4** (cross_source_multi_passage): TP=1 FP=1
  - FP [novel_unexpected] src=0 cls=confirmed: "Revenue: The Platform generates contracted revenue of EUR 44 million per annum, up from EUR 34 million two years ago, un…"
- **crf_multisource S5** (noise_trap): TP=0 FP=1
  - FP [no_support_with_text] src=0 cls=no_support: "The opportunity was sourced through the fund's relationship with Aldous Renewables, a long-standing co-investment partne…"

## 3. RECALL (multi-passage planted cases)

**alp_multisource S2 (multi_passage_single_source): YES — all planted passages recovered.**
  - planted[0] src=0 cls=confirmed found=true: "The Company generated revenue of EUR 92 million in FY2024, up from EUR 71 million in FY2023, represe…"
  - planted[1] src=0 cls=confirmed found=true: "Reported EBITDA margin expanded to 24% in FY2024, from 19% two years prior, driven by network densif…"
**crf_multisource S2 (multi_passage_single_source): YES — all planted passages recovered.**
  - planted[0] src=1 cls=confirmed found=true: "Diligence confirmed that the power purchase agreement counterparties are predominantly investment-gr…"
  - planted[1] src=1 cls=confirmed found=true: "The Platform's assets are distributed across four grid jurisdictions, providing meaningful diversifi…"
**crf_multisource S4 (cross_source_multi_passage): NO — at least one planted passage missing.**
  - planted[0] src=0 cls=confirmed found=false: "Our base case generates a 2.6x MOIC and a gross IRR in the 20–24% range."
  - planted[1] src=1 cls=confirmed found=true: "Diligence confirmed that the power purchase agreement counterparties are predominantly investment-gr…"

## 4. OFFSET RESOLUTION

**Headline: exact-resolve 83.8% (31/37); normalised-resolve 94.6% (35/37).**

- **ALP_S5_curly_quotes:** answer-key / matcher passages that already carry U+201C/U+201D resolve with **exact=true and normalised=true** (expected: a correctly typed excerpt is a substring of the source). The fixture-authoring stress (straight U+0022 vs curly) remains: exact substring fails for the straight-quote variant; normalised would recover after quote fold. This run did not re-probe the mangled variant in the matcher loop.
- **CRF_S4_en_dash:** same pattern — correctly typed `20–24%` (U+2013) resolves **exact=true and normalised=true**. Hyphen-vs-en-dash failure mode remains a fixture-authoring fact, not observed on correctly typed returns here.

**OPEN DESIGN PROBLEM:** normalised match proves passage existence, but the raw-source highlight offset is NOT trivially recoverable when whitespace was collapsed (or typography remapped). Do not treat normalised index as a raw char offset for UI highlighting — needs an explicit back-mapping design in the build spec.

## 5. CONCLUSION (recommend, don't decide)

- Verdict neutrality: **no changes** on these fixtures under raw widened feeds. Still provisional — multi-passage can introduce new classifications on other drafts.
- Precision: **gate warranted** — FP passages observed; consider filtering `no_support`/noise before excerpt emit.
- Offset: normalised resolution recovers typography stress cases exact misses; **raw-offset recovery remains an open build-spec problem** (see §4).

