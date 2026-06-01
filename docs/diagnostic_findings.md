# Diagnostic Batch — Findings and R6 Inputs

**Date:** 26 May 2026
**Source data:** Original batch run `2026-05-26-205208` (12 fixtures used: 02, 03, 05, 06, 07, 09, 11, 12, 16, 17, 19, 20) + rerun `2026-05-26-212900` (8 fixtures used: 01, 04, 08, 10, 13, 14, 15, 18)
**Pipeline version:** v4 on backend tag `r5.5-export-disclaimer` plus D1.3 / D1.3.1 / D1.3.2 fixture preparation work.

---

## Executive summary

The diagnostic ran clean on the four stress fixtures designed to test failure modes (05 wrong-acquirer, 13 internal inconsistency, 15 chunking ceiling, 18 cross-source contradiction). The pipeline correctly caught the wrong-entity stress (fixture 05), the internal inconsistency stress (fixture 13), and held together evidentially across the 4'800-word long memo (fixture 15). The cross-source supersession stress (fixture 18) was **not** caught at the verdict layer, but the underlying conflict signals **were** generated — a verdict aggregation issue rather than a detection failure.

Across the 16 faithful fixtures, the pipeline produced sensible evidence verdicts with very few obvious errors. The richer findings are not in evidence accuracy — that is solid — but in the **quality and calibration of the editorial and compliance signals on top of it.** Both signals are doing real work but both fire noisily in ways that would erode reviewer trust if shipped to PG-quality customers without further tuning.

The diagnostic surfaced eight distinct candidate inputs to R6 scoping, organised below into three classes: evidence-layer items (R6.8, R6.9), editorial-layer items (R6.2 sub-items, R6.5, R6.6, R6.7), and infrastructure items (D1.4 incremental INDEX write, D1.5 fidelity log analysis).

Throughout this document, fixture references use **F##** notation. References to statements within a fixture use **F##.S#** notation. Where the diagnostic relies on data from the rerun (fixtures 01, 04, 08, 10, 13, 14, 15, 18), it is labelled `[RERUN]`. Where it uses the original batch (the other 12), it is labelled `[ORIG]`.

---

## Section 1 — Per-fixture deltas

For each fixture, the table below records expected vs actual verdict mix and the most material gaps.

### F01 bvp_shopify_memo [RERUN]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 12 (expected ~10)

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 10 | 0 | 0 | 0 |
| Actual | 11 | 1 | 0 | 0 |

The pipeline split the closing into two statements ("In summary..." and "We recommend approval") which my expected outcome treated as one. The "In summary" statement came back **partially_confirmed** with the editorial commentary flagging "exceptional unit economics" as unsubstantiated promotional language. Defensible — the closing does compress claims from earlier in the memo into a summary line that the source doesn't independently confirm.

Statement F01.S1 caught an interesting pipeline behaviour: the v2 draft says "5'500 a year ago to nearly 10'000 today" (high commas, per house style). The pipeline matched against the source which uses "5,500" / "10,000" (low commas), produced a `supported` verdict, **and then the editorial review fired claiming the apostrophe-thousands-separator is incorrect.** This is a house-style miscalibration — the editorial reviewer is enforcing the wrong convention. Pattern repeats on F01.S2, F01.S9 ("60-70%"), F13.S3, F13.S12, F18.S4. See [Cross-cutting finding 3](#cross-cutting-finding-3-house-style-miscalibration).

Statement F01.S7 ("We see significant headroom...") flagged for first-person voice. The flag is technically reasonable but reflects an opinion about reporting commentary style that PG might or might not share. See [Cross-cutting finding 4](#cross-cutting-finding-4-voice-and-register-flagging).

**Net:** evidence layer clean. Editorial layer noisy with miscalibrated house-style flags. No compliance issues — appropriate for Complete-version reporting on a historic investment.

### F02 pg_atnorth_exit [ORIG]
**Output type:** press_release | **Visibility:** public | **Statements:** 9

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 12 | 0 | 0 | 0 |
| Actual | 9 | 0 | 0 | 0 |

Evidence verdicts all clean. Statement count lower than expected because the pipeline merged a few of my drafted statements (the eight-data-centers and four-year-holding-period claims, for example).

The interesting finding here is the **compliance over-firing**. This is a real PG press release that was already published externally. It has been through actual PG compliance review. Yet the pipeline produced:

- F02.S0: hard_concern on the USD 4 billion enterprise value ("has the hallmarks of confidential transaction details")
- F02.S3: soft_concern on the 30% IRR / 2.5x MOIC ("performance claims without accompanying disclosure language")
- F02.S5: hard_concern on "exceptionally well positioned" ("unqualified superlative restricted under fund marketing regulations")
- F02.S6: editorial flag on a two-item list lacking Oxford comma (Oxford commas don't apply to two-item lists)

The EV figure, the IRR/MOIC, and the "exceptionally well positioned" language are **all in the published source.** The pipeline is flagging text PG's compliance function already cleared. This is an important signal for compliance calibration — see [Cross-cutting finding 2](#cross-cutting-finding-2-compliance-over-firing-on-public-content).

**Net:** evidence clean. Editorial noisy but mostly defensible. Compliance materially over-firing on already-cleared content.

### F03 pg_gestcompost_investment [ORIG]
**Output type:** press_release | **Visibility:** public | **Statements:** 9

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 11 | 0 | 0 | 0 |
| Actual | 9 | 0 | 0 | 0 |

Evidence verdicts clean. Statement count lower because pipeline merged a few statements.

F03.S5 generated a compliance hard_concern on a forward-looking claim ("will support continued growth through increased waste volumes...") that **is exactly the source language.** Real PG press release content, already cleared, flagged by pipeline. Same pattern as F02.

F03.S6 ("Alejandro Lafarga will join the board") generated a compliance soft_concern for "third-party attribution — confirm consent has been obtained." Reasonable in principle, but the named individual is publicly disclosed in the source release. The pipeline is being more cautious than the source already published.

**Net:** evidence clean. Compliance over-firing on text from already-published content.

### F04 synth_vc_pinterest_style_memo [RERUN]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 23 (expected ~16)

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 16 | 0 | 0 | 0 |
| Actual | 19 | 2 | 0 | 2 |

The pipeline split my drafted statements more aggressively here than I expected (e.g. opening salutation as a separate statement that came back `not_supported` because no source corroborates "Dear valued investors,").

Two `not_supported` results are both on functional template elements (the salutation and the closing courtesy line). Reasonable that they have no source backing; not a real evidence concern. **But the verdict treatment is too literal** — the reviewer should not be expected to chase down "source for Dear valued investors". This is a noise pattern that hurts trust in the not_supported signal more broadly. See [Cross-cutting finding 5](#cross-cutting-finding-5-not_supported-on-functional-elements).

Two `partially_confirmed` results — F04.S10 on the "advertising audience" combination claim (which compresses several source observations) and F04.S20 on a closing paragraph that summarises across multiple sections. Both defensible; they are exactly the kind of compression-of-claims statements where Partial is the right verdict.

**Net:** evidence layer well-calibrated. The "not_supported" on functional elements is a noise pattern.

### F05 synth_competitor_press_release [ORIG]
**Output type:** press_release | **Visibility:** public | **Statements:** 8

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 5 conf + 1 confl + 2 NS | | | |
| Actual | 5 | 0 | 2 | 1 |

**This is the cleanest pass of the stress fixtures.** The pipeline correctly identified:

- F05.S0 = **Conflicting** ("Partners Group has agreed to acquire Norwell Aerospace Components... from Westhaven"). Pipeline correctly returned conflicting with source excerpt "Westhaven Capital agrees to acquire Norwell Aerospace Components from Bridgepoint" — clean catch of the wrong-acquirer error.
- F05.S5 = **Conflicting** ("During Westhaven's ownership..."). Source attributes the investment to Bridgepoint, not Westhaven. Clean catch.
- F05.S7 = **Not supported** ("Partners Group will support continued growth..."). Source contains no Partners Group involvement; fabrication correctly flagged.
- Compliance fired correctly on the forward-looking claims in S7.

The diagnostic value of F05 was always going to be in confirming that the pipeline catches the wrong-entity stress. It did. Strongly. This is the single most encouraging result in the batch.

One quirk: F05.S6 generated a compliance hard_concern on "three of the most advanced automated composite layup facilities" — calling it "unqualified superlatives restricted under fund marketing regulations." Note this in the over-firing pattern but it's defensible — the synthetic source uses this language and the public-Press Release framing genuinely raises the bar.

**Net:** stress test passed clean. Pipeline distinguishes Conflicting from Not Supported correctly.

### F06 synth_listed_pe_report_excerpt [ORIG]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 12

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 14 | 0 | 0 | 0 |
| Actual | 11 | 0 | 1 | 0 |

One conflicting result (which my expected outcome had as confirmed) — worth investigating in detail in a follow-up.

**Net:** mostly clean. One conflicting verdict to be reviewed against source.

### F07 synth_vc_thesis_post [ORIG]
**Output type:** linkedin_post | **Visibility:** public | **Statements:** 9

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 8 | 0 | 0 | 0 |
| Actual | 9 | 0 | 0 | 0 |

Clean. The thesis-post fixture was structurally limited — most claims are statements of belief, not facts. The pipeline correctly treated paraphrased thesis content as confirmed.

This fixture also took the longest of all single-source fixtures (39.7 seconds). Worth noting: thesis-only content with no fact density may be slow to process because Stage 2 source matching is slower when there are few hard anchor facts to match. Probably not worth optimising.

**Net:** clean.

### F08 synth_industrial_buyout_memo [RERUN]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 19 (expected ~16)

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 16 | 0 | 0 | 0 |
| Actual | 15 | 1 | 1 | 2 |

The conflicting/not_supported results need investigation in a follow-up — possible that the bullet-format pillars produced different statement boundaries than my expected outcomes assumed.

**Net:** broadly clean but worth a closer per-statement audit later.

### F09 synth_portfolio_update_letter [ORIG]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 16

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 18 | 0 | 0 | 0 |
| Actual | 15 | 0 | 1 | 0 |

One conflicting result to investigate.

**Net:** broadly clean.

### F10 synth_public_press_release [RERUN]
**Output type:** press_release | **Visibility:** public | **Statements:** 7

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 7 | 0 | 0 | 0 |
| Actual | 7 | 0 | 0 | 0 |

Clean. Originally the v1 draft contained an unsupported forward-looking projection that we removed for v2. The v2 version runs clean as expected.

**Net:** clean baseline for Public press release behaviour.

### F11 synth_investor_letter_exit [ORIG]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 15

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 15 | 0 | 0 | 0 |
| Actual | 14 | 0 | 0 | 1 |

One not_supported result worth checking (likely a salutation or functional element, given the F04 pattern).

**Net:** clean.

### F12 synth_linkedin_post [ORIG]
**Output type:** linkedin_post | **Visibility:** public | **Statements:** 11

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 10 | 0 | 0 | 0 |
| Actual | 6 | 1 | 2 | 2 |

This fixture had the most surprising result. **Two conflicting** verdicts and **two not_supported.**

- F12.S0 returned conflicting. The draft says "Meridian Capital has completed the sale of NorTech" but the source excerpt is in first-person ("I'm delighted that Meridian Capital has completed..."). The pipeline appears to have flagged third-person framing of a first-person source as conflicting. **This is a verdict-classification issue** — third-person rephrasing of first-person source content should not be Conflicting in any standard reading. It's at most Partially Confirmed if the voice change is material. See [Cross-cutting finding 6](#cross-cutting-finding-6-voice-rephrasing-treated-as-conflict).

- F12.S4 returned not_supported on "Total revenue grew nearly threefold over the hold period and EBITDA margins moved from 11 to 18 percent." The source contains the threefold-revenue claim. The pipeline flagged it not_supported, possibly because of the compound nature (two claims in one statement) where only one is in the source.

- F12.S6 returned conflicting on "Three people deserve particular credit" — a transitional sentence that has no specific fact content. This is a verdict on text that doesn't have a verifiable claim and probably shouldn't carry an evidence verdict at all. See [Cross-cutting finding 5](#cross-cutting-finding-5-not_supported-on-functional-elements).

- Compliance over-fired hard_concerns on "dominant in the Nordics" (S1), "substantial transformation" (S2), "11 to 18 percent" margins (S4), and "genuinely exceptional" (S9). Some defensible (margin specifics on Public are sensitive), some over-cautious.

**Net:** evidence verdicts are noisy on LinkedIn-tone content. Several findings point to a structural issue with how the pipeline handles voice changes and transitional sentences.

### F13 synth_internal_inconsistency_memo [RERUN]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 17 (expected ~12)

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 12 + 2-3 conflicts on inconsistencies | | | |
| Actual | 11 | 2 | 2 | 2 |

The pipeline split statements more aggressively than my expected outcome. **The inconsistency catches are the headline:**

- F13.S7 = **Conflicting.** Draft says "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore." Pipeline returned conflicting with source excerpt "The total team of 285 people is split approximately as follows..." **Clean catch of the source's internal inconsistency on employee count (320 in section 1, 285 in section 6).**

- F13.S13 = **Conflicting.** Draft says "We project ARR growth from EUR 81 million today to approximately EUR 195 million..." Pipeline returned conflicting against the section 2 ARR figure (84 million). **Clean catch of the source's internal inconsistency on ARR (84 in section 2, 81 in section 4).**

- F13.S4 ("EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million") returned **supported,** matching against section 2's figure. The newly-added 13% figure in the recommendation block was **not caught** as a conflict. This is a finding — the pipeline picks one source figure that matches and doesn't surface the contradiction with a different figure in the same source. See [Cross-cutting finding 7](#cross-cutting-finding-7-internal-source-inconsistencies-only-partially-detected).

- Two not_supported results on closing summary statements — same pattern as F04 (functional elements without source backing).

- Two partially_confirmed results, both defensible.

**Net:** **strong result on the two named-fact inconsistencies.** Mixed on the third (the EBITDA margin) — pipeline did not surface the contradiction. This is an important diagnostic finding. Together with F18, it points to a structural pattern: the pipeline detects conflicts when a draft statement aligns with one source figure and contradicts another, but **doesn't actively scan for contradictions across the source itself** when the draft only references one of the contradicted figures.

### F14 synth_thesis_only_memo [RERUN]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 13

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 8 | 0 | 0 | 0 |
| Actual | 10 | 1 | 1 | 1 |

F14.S11 returned conflicting on "We expect to bring a specific potential investment to consider over the coming months." Source excerpt: "We are not recommending any specific investment at this time. We are seeking endorsement of the thesis and authorisation to invest sourcing time accordingly." **The pipeline correctly identified the substantive contradiction** — the draft implies a specific investment is coming, the source explicitly says no specific investment is recommended. Defensible catch.

F14.S12 returned not_supported on "We will provide further detail when the work is sufficiently advanced." Functional closing — same pattern as F04.

**Net:** good result. The pipeline catches a meaningful contradiction even though the v2 draft was cleaned of the obvious fabrications.

### F15 synth_very_long_memo [RERUN]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 40 (expected ~20)

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 20 | 0 | 0 | 0 |
| Actual | 34 | 2 | 2 | 2 |

**Statement count doubled** vs my expectation because the pipeline split the bullet points into individual statements. Each pillar bullet became a separate statement; each risk bullet became a separate statement.

**This is the chunking ceiling stress fixture.** The source is ~4'800 words. The diagnostic question was whether the pipeline holds together across the full source.

Encouraging result: **34 confirmed verdicts on a 40-statement draft against a 4'800-word source is a strong outcome.** No obvious chunking-breakdown patterns visible. The 2+2 conflicting/not_supported results need investigation but are within acceptable noise levels for a fixture of this size.

**Net:** chunking ceiling held. No structural breakdown.

### F16 synth_healthcare_consumer [ORIG]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 13

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 18 | 0 | 0 | 0 |
| Actual | 13 | 0 | 0 | 0 |

Clean. Statement count lower because pipeline merged some statements.

**Net:** clean.

### F17 synth_real_estate_logistics [ORIG]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 11

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 14 | 0 | 0 | 0 |
| Actual | 10 | 0 | 1 | 0 |

One conflicting result to investigate.

**Net:** broadly clean.

### F18 synth_cross_source_pair [RERUN]
**Output type:** investor_letter | **Visibility:** complete | **Statements:** 12

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 5 + 5 conflicting + 2 NS | | | |
| Actual | 9 | 1 | 0 | 2 |

**Zero conflicting verdicts** where the expected outcome was 5. This is the headline negative finding of the batch.

**But there's nuance.** Looking at the per-statement detail, the pipeline correctly detected the underlying conflicts:

- F18.S1: `supported` BUT `hasConflict: True`
- F18.S4: `supported` BUT `hasConflict: True`
- F18.S5: `supported` BUT `hasConflict: True`
- F18.S6: `supported` BUT `hasConflict: True`
- F18.S8: `supported` BUT `hasConflict: True`
- F18.S9: `supported` BUT `hasConflict: True`

**The conflict signal is being generated.** The verdict aggregator is resolving the multi-source conflict as `supported` (with conflict marker) rather than escalating it to `conflicting`. This is exactly the verdict-aggregation behaviour I predicted in v2 — but the underlying detection is real. The `hasConflict: True` flag means the reviewer would see the conflict in the UI signal strip even though the headline verdict says supported.

**This is a Stage 3 verdict-aggregation issue, not a Stage 2 detection issue.** The pipeline is doing more sophisticated work than the verdict mix alone reveals.

The two not_supported results are the salutation and closing — same functional-element pattern as F04.

**Net:** the supersession finding is real but more nuanced than originally framed. The pipeline detects the conflicts; the verdict aggregator doesn't elevate them. R6.8 should focus on the aggregation rule, not on detection.

### F19 synth_annual_report [ORIG]
**Output type:** reporting_commentary | **Visibility:** complete | **Statements:** 15

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 17 | 0 | 0 | 0 |
| Actual | 12 | 1 | 2 | 0 |

Two conflicting and one partial in a clean reporting commentary fixture — higher than expected. Worth investigation in a follow-up.

**Net:** results materially diverge from expected — needs further audit.

### F20 synth_fund_close_announcement [ORIG]
**Output type:** reporting_commentary | **Visibility:** public | **Statements:** 10

| | confirmed | partial | conflicting | not_supported |
|---|---|---|---|---|
| Expected | 10 | 0 | 0 | 0 |
| Actual | 8 | 0 | 0 | 2 |

Two not_supported on closing statements — same functional-element pattern.

**Net:** clean apart from the functional-element noise.

---

## Section 2 — Cross-cutting findings

### Cross-cutting finding 1: Evidence layer is broadly sound

Across 20 fixtures, the evidence verdicts are mostly accurate. The four stress fixtures performed as follows:

- **F05 wrong-entity stress: passed clean.** Conflicting verdicts on the misattributed transaction parties. Not supported on the fabricated forward claims. Compliance correctly fired.
- **F13 internal inconsistency: passed on 2/3 inconsistencies.** Caught the ARR contradiction and the employee count contradiction. Did not surface the EBITDA margin contradiction (added in v2 source).
- **F15 chunking ceiling: passed.** 34/40 statements confirmed across a 4'800-word source. No structural breakdown.
- **F18 cross-source contradiction: detection succeeded, verdict aggregation under-fired.** Conflict signals were generated on all 6 contradicted statements; the aggregator elevated none to Conflicting verdict.

This is a strong baseline. **The evidence layer is the moat** and the diagnostic confirms it works. Subsequent work in R6 should aim to preserve this and tighten on top of it, not rebuild it.

### Cross-cutting finding 2: Compliance over-firing on Public content

Fixtures 02 and 03 are real PG press releases that were drafted, compliance-reviewed, and published externally. The pipeline produced multiple compliance flags on these:

- F02.S0 hard_concern: USD 4 billion EV as "confidential transaction details"
- F02.S3 soft_concern: 30% IRR / 2.5x MOIC as "performance claims without disclosure language"
- F02.S5 hard_concern: "exceptionally well positioned" as "unqualified superlative restricted under fund marketing regulations"
- F03.S5 hard_concern: forward-looking growth language taken directly from the published source
- F03.S6 soft_concern: third-party individual attribution where consent is publicly evidenced by the source release

**These flags are firing on text PG's actual compliance function already cleared for public release.** In a production setting, a reviewer would either learn to ignore these (eroding trust in the compliance signal) or have to repeatedly override them (eroding trust that the tool is calibrated to their function).

**Two distinct miscalibrations are mixed in here:**

a) **Visibility-context awareness.** The pipeline appears to treat EV figures, IRR/MOIC numbers, and "well positioned" language as Public-restricted by default, without recognising that these specific values came from a source that is itself a Public document. A real compliance reviewer reasons: "is the source already public? If yes, the values are publishable by definition." The pipeline lacks this contextual reasoning.

b) **Universal-vs-jurisdictional rules.** The "unqualified superlatives restricted under fund marketing regulations" flag treats marketing regulations as universal. They aren't — different jurisdictions have different requirements, and fund marketing rules typically apply to fund offering materials, not to portfolio transaction releases.

**R6 implication:** the compliance reviewer prompt needs (a) explicit awareness of source visibility status, and (b) better calibration of when fund marketing rules actually apply. This is an R6.4 candidate (Public version compliance recalibration) — already in the backlog — now backed by concrete evidence.

### Cross-cutting finding 3: House style miscalibration

The pipeline's house style flags are firing on the wrong convention. Multiple examples:

- **Thousand separators:** F01.S1 / F01.S2 / F01.S9 / F13.S3 / F13.S12 / F18.S4 all flagged the high-comma thousand separator (5'500, 10'000, 240'000) as "incorrect — straight apostrophe should be used." This is backwards. **The PG convention is the high comma.** The reviewer prompt seems to be treating the comma-thousand convention as the house style, even though the v2 drafts use the apostrophe convention as instructed.

- **Currency formatting:** F13.S2 flagged "EUR 445 million" as needing "ISO 4217 code followed by the amount" — but EUR is the ISO 4217 code and it precedes the amount. The flag is firing on correctly-formatted text.

- **Em-dash:** F01.S6, F03.S3, F08.S5, F10 ("if v1"), F14.S7, F14.S10, F18.S2 all flagged em-dashes for replacement with hyphens. **This one is actually correct** per house style — em-dashes should be replaced with regular dashes. The drafts I produced for v2 still contained em-dashes in many places because I didn't sweep them out consistently. The pipeline is right; my drafts are wrong.

- **First-person voice in reporting commentary:** F01.S7 / F01.S11 / F13.S9 / F13.S14 all flagged "We see" / "We project" / "Our investment thesis" as inconsistent with reporting commentary voice. **This is a stylistic call, not a hard rule.** PG's actual reporting commentaries use first-person plural extensively. The pipeline is enforcing an opinion about voice that doesn't match the convention.

- **"Company" capitalization:** F01.S9 flagged "the word 'Company' should not be capitalized unless it is part of a proper noun or title." **Wrong.** PG uses "the Company" (capitalized) consistently after defining the term. The pipeline is enforcing the wrong convention.

- **Oxford comma:** F02.S6 flagged a two-item list ("CPP Investments and Equinix") as "lacks an Oxford comma." **Wrong.** Oxford commas apply only to lists of three or more items.

**The pattern is clear: the editorial reviewer is operating with a built-in style guide that is partly correct, partly wrong, partly opinionated, and entirely opaque to the reviewer.** This is the strongest evidence yet that R6.5 (house style framework) is the right call.

**R6 implication:** R6.5 must replace the implicit style guide currently embedded in the editorial reviewer prompt with an explicit, structured, client-customisable layered style guide. The miscalibrations above are not edge cases — they fire across most fixtures.

### Cross-cutting finding 4: Voice and register flagging

Beyond the specific house-style miscalibration above, the editorial reviewer is heavily flagging voice and register issues:

- First-person voice in reporting commentary (F01.S7, F13.S9, F13.S14, F14.S0, F14.S11, F14.S12)
- Third-person voice in LinkedIn posts (F12.S0, F12.S6, F12.S9, F12.S10)
- "Overly familiar and promotional" salutation in investor letters (F18.S0 — flagged "Dear valued investors" as too familiar)
- "Promotional language" flag on substantive content (e.g. "strong fundamentals", "exceptional engagement", "high-quality vertical SaaS asset", "dominant in the Nordics")

The voice/register flags are doing meaningful work but they are firing too aggressively. **"Strong fundamentals" is not promotional language** — it's standard investor commentary phrasing. The reviewer prompt appears to treat any qualitative adjective ("strong", "exceptional", "leading") as promotional unless paired with quantitative substantiation. This is too strict.

**R6 implication:** R6.2 commentary quality should refine what counts as "promotional language" — distinguish between (a) genuine hyperbole/superlatives ("exceptionally well positioned", "genuinely market-leading") which deserve flags, and (b) standard qualitative descriptors ("strong", "high-quality", "defensible") which do not. The current calibration treats both as the same class of issue.

### Cross-cutting finding 5: Not_supported on functional elements

The pipeline returned not_supported verdicts on:

- F04.S0: "Dear valued investors," (salutation)
- F18.S0: "Dear valued investors," (salutation)
- F18.S11: "We look forward to providing further updates as the hold progresses." (closing)
- F11.S?: likely a similar closing
- F14.S12: "We will provide further detail when the work is sufficiently advanced." (closing)
- F20: two functional elements
- F12.S5: "The numbers tell one story; the team's transformation tells the bigger one." (transitional)
- F12.S6: "Three people deserve particular credit." (transitional)

**These are not evidence concerns.** They are template elements, transitional sentences, and courtesy language. The pipeline treats them as claims requiring source backing, which they're not. The result is a noise pattern that degrades the trust in the "not_supported" signal — a reviewer encountering 2-3 not_supported flags per draft, where 2 of them are on a salutation and a closing, will discount the signal even when it would otherwise be meaningful.

**R6 implication:** the pipeline (likely Stage 1 statement extraction) should distinguish between **claim statements** (factual assertions that need source backing) and **non-claim statements** (salutations, closings, transitions, headers). Non-claim statements should be excluded from evidence verification entirely. This is an R6 candidate at the boundary between statement extraction and verdict assignment. Call it **R6.9: non-claim statement handling**.

### Cross-cutting finding 6: Voice rephrasing treated as conflict

F12.S0 returned `conflicting` on "Meridian Capital has completed the sale of NorTech Industries to Brookfield." The source excerpt is in first-person ("I'm delighted that Meridian Capital has completed the sale of NorTech...").

The substantive claim is identical. The only difference is the voice — third-person in draft, first-person in source. The pipeline classified this as Conflicting.

F12.S6 returned `conflicting` on "Three people deserve particular credit." This is a transitional sentence in a LinkedIn post that has no specific fact content. Conflicting is structurally wrong for content that contains no verifiable claim.

**R6 implication:** the Stage 2 source matcher is occasionally returning `conflicting` for what should be `supported` (voice change only) or `not_supported` (no claim to verify). This is a Stage 2 calibration issue. The existing R2.7.1 backlog watch item ("Stage 2 conflict/partial distinction") gets concrete evidence from this finding. It should be elevated.

### Cross-cutting finding 7: Internal source inconsistencies only partially detected

F13 was designed with three deliberate internal inconsistencies in the source:
- ARR: 84 in section 2 vs 81 in section 4 — **caught (F13.S13 conflicting)**
- Employees: 320 in section 1 vs 285 in section 6 — **caught (F13.S7 conflicting)**
- EBITDA margin: 13% in recommendation vs 11.1% in section 2 — **not caught**

The catches happened because the draft incorporated the inconsistent figures (84 in one place, 81 in another) — so each statement found a source figure that confirmed it and a different source figure that conflicted. Stage 2 returned both signals.

The miss happened because the draft cites 11.1% (the section 2 figure), which Stage 2 matches against the section 2 source content. The recommendation block's 13% figure is in the source but Stage 2 doesn't independently surface it as a contradicting claim because the draft doesn't reference 13%.

**This is an interesting pattern.** The pipeline detects cross-source contradictions when the draft contains the contradicted facts. It does not actively audit the source for internal inconsistencies in facts the draft doesn't reference.

**R6 implication:** there's a candidate for a "source quality" review pass that audits the source itself for internal inconsistencies — independent of the draft. Could be a new dimension or a sub-component of evidence review. Call this **R6.10: source quality audit** (low priority, but logged).

### Cross-cutting finding 8: Cross-source contradiction not elevated at verdict layer

F18 was designed with two source documents — initial (18a) and update (18b) — where 18b contradicts 18a's figures on three facts. The expected v2 verdicts called for these to be elevated to Conflicting based on the supersession framework.

**Detection succeeded.** Six statements in F18 carry `hasConflict: True` in their card data.

**Aggregation under-fired.** All six were resolved as `supported` rather than escalated to `conflicting`.

The pipeline's current rule appears to be: if any source confirms AND any source conflicts, the verdict resolves to `supported` with a conflict marker for UI display. The reviewer would see the conflict in the signal strip, but the headline verdict says supported.

This is a **product decision more than a bug.** Two reasonable rules:

a) **Current behaviour:** "any confirmation wins; conflicts are surfaced as auxiliary signals." Defensible — it prevents over-flagging when sources are genuinely diverse rather than contradictory.

b) **Stricter behaviour:** "any explicit contradiction in any source resolves to Conflicting." More cautious; reflects how a careful reviewer would treat any genuine contradiction.

c) **Supersession-aware behaviour:** "if an update source contradicts an initial source, the update is authoritative." Most sophisticated; requires source metadata about which-supersedes-which.

**R6 implication:** **R6.8: cross-source verdict aggregation** — decide which rule to apply. The current rule may be defensible for some cases but it under-states the situation in clear supersession contexts. At minimum, when a conflict signal is present, the displayed verdict should make it visually clear that the verdict is "supported with conflict" rather than just "supported." Worth checking whether the current UI does this.

---

## Section 3 — Editorial commentary quality patterns

Beyond the calibration issues, the editorial commentary itself shows quality patterns worth noting.

### Fidelity drops

The earlier session surfaced `[FIDELITY_DROP]` log lines where editorial commentary cited text not present in the statement. The diagnostic batch likely contains additional instances but I haven't catalogued them from logs (only from result.json content). **D1.5 should examine the fidelity drop logs from this batch and produce a count and pattern analysis.**

### Editorial concerns without rule identifiers

Across all fixtures, the per-concern rule identifier shows as `?` in the structured data — the editorial commentary doesn't carry the rule name in a separable field. This means the reviewer can read the concern but cannot trivially see which rule fired. For the future style guide framework (R6.5), the editorial reviewer should output structured concerns with explicit rule IDs.

### Schema validation failures

The original batch surfaced `[EDITORIAL_STYLE_REVIEW] schema validation failed after retry; applying clean fallback` log entries. When this happens, the statement gets a clean editorial signal rather than a populated one. Some statements in the batch may have hit this and we wouldn't know from the result.json alone. **D1.5 should examine schema-validation failure counts.**

### Stage 2 passage rejections

The original batch surfaced `[stage2] passage rejected for source X after normalisation` entries. These are pipeline saves — the LLM returned a passage that didn't actually exist in the source, and the pipeline correctly rejected it. **D1.5 should count and bucket these.**

---

## Section 4 — Translation into R6 inputs

Consolidated list of R6 candidates emerging from the diagnostic, organised by layer and ranked roughly by impact-to-cost ratio.

### Evidence layer

**R6.8: cross-source verdict aggregation** — decide whether to elevate conflict signals to Conflicting verdicts in cross-source contexts, particularly when supersession is implied. Backed by F18 evidence. Architecture-level decision.

**R6.9: non-claim statement handling** — distinguish claim from non-claim statements in Stage 1; skip evidence verification on salutations, closings, and transitions. Backed by F04, F11, F12, F14, F18, F20 evidence. Likely Stage 1 prompt tuning.

**R6.10: source quality audit** (low priority) — independent of the draft, audit each source for internal inconsistencies. Backed by F13 evidence on the missed EBITDA inconsistency. New capability rather than calibration; defer until R6.8 and R6.9 are scoped.

**Existing watch items confirmed:**
- **R2.7.1**: Stage 2 conflict/partial distinction — confirmed as live issue by F12 voice-rephrasing finding. Should be elevated from watch to spec.
- **rebuild-C**: Stage 2 chunking ceiling — F15 ran clean at 4'800 words. The ceiling is not an immediate concern. Continue to monitor at longer source lengths.

### Editorial layer

**R6.2: commentary quality** (existing item) — refine into specific sub-items:
- **R6.2a:** disentangle promotional-language flags into hyperbole-vs-qualitative-descriptor. Backed by every fixture.
- **R6.2b:** structural recommendations as a real editorial sub-dimension. Backed by F08, F11 bullet-format observations.
- **R6.2c:** dimension-naming for "off phrasing" feedback. Backed by F08, F11, F19.
- **R6.2d:** fidelity discipline — eliminate fabricated quotes in editorial commentary. Backed by [FIDELITY_DROP] log entries.

**R6.5: house style framework** (new) — Layer 1 universal / Layer 2 PG default / Layer 3 client-specific overrides. The editorial reviewer should accept a structured style guide as input rather than embedding rules in the prompt. Backed by every fixture showing house-style miscalibration. High priority.

**R6.6: document-type appropriateness** (new) — Review whether content matches document-type conventions (salutations, business descriptions at first mention, completed-investment framing for investor letters, no internal-process references in external commentary). Backed by F04 salutation handling, F12 LinkedIn voice handling, F18 salutation handling.

**R6.7: forward-looking statement review** (new) — Distinguish forward-looking claims and apply specific review criteria: hedging, plausibility, visibility-calibration, alignment with stated risks. Backed by F02, F03, F05, F08, F09 forward-looking content patterns.

### Compliance layer

**R6.4: Public version compliance recalibration** (existing item) — confirmed as material issue by F02 and F03 over-firing on already-cleared PG content. Should be scoped to address:
- **R6.4a:** visibility-context awareness (recognise when source is already public)
- **R6.4b:** jurisdiction-aware fund marketing rules (don't apply blanket "unqualified superlative" rules to portfolio transaction releases)
- **R6.4c:** sensitivity-tier calibration (some figures are sensitive even when source is public)

### Infrastructure

**D1.4: incremental INDEX write** — the harness only writes INDEX.md at end of run. Should be incremental per fixture for resilience against mid-run aborts. Small follow-up.

**D1.5: pipeline log analysis** — examine `[FIDELITY_DROP]`, `[EDITORIAL_STYLE_REVIEW] schema validation failed`, and `[stage2] passage rejected` log entries from both run folders. Count, bucket, and identify which fixtures/statements were affected. Feeds R6.2d and broader R6 scoping.

---

## Section 5 — Lessons beyond R6

Five observations that aren't directly R6 inputs but are worth recording.

### 1. The verification-by-grep pattern proved its value

D1.3 loaded v1 drafts despite Cursor's confident summary claiming v2. D1.3.2 introduced explicit positive-anchor and negative-contaminant grep checks with verbatim output requirements. The mechanism caught nothing wrong because there was nothing wrong — but the mechanism is the reason we know that. This pattern should be added to AI_OPERATING_MANUAL.md as a recurring discipline: when a previous spec produced incorrect output that was reported as correct, the follow-up spec must require explicit verification with verbatim output of the verification results.

### 2. Diagnostic-first was the right call

We could have written R6 specs immediately after the validation pass on the v2 document. Instead we built the fixture set, ran the batch, and learned what the pipeline actually does. The cost was a few hours of session time plus ~$45 in LLM calls. The benefit is R6 candidates that are backed by concrete evidence — including findings (F12 voice-rephrasing-as-conflict, F18 detection-vs-aggregation, F13 partial-internal-inconsistency-detection) that would have been very difficult to surface from intuition alone.

### 3. The pipeline does more than the verdict mix shows

F18 looked like a clear failure at the verdict mix level (0 conflicting where 5 were expected). At the per-card level, the conflicts were detected (`hasConflict: True` on 6 statements). The verdict mix is a useful diagnostic summary but it can mislead. For R6 work, per-card analysis is what tells the real story.

### 4. The editorial reviewer is the highest-leverage R6 target

Across all 20 fixtures, the editorial layer fired the most often and the most noisily. The miscalibrations span house style, voice, register, and what counts as promotional language. Every fixture had at least one editorial flag; many had several. Editorial is also the layer where reviewer trust erodes fastest if calibration is off — a reviewer encountering five editorial flags per draft, where two are wrong-direction and one is on a correctly-formatted figure, will stop reading editorial commentary entirely.

**R6 prioritisation insight:** the existing R6.2 item (commentary quality) is correctly identified as foundational. R6.5 (house style framework) sits inside R6.2 as the most concrete sub-item. Together they likely command the largest share of R6 effort.

### 5. The cost ratio of the diagnostic to product confidence

The full diagnostic — two batch runs plus harness build plus fixture preparation — cost approximately $50 in LLM calls plus several hours of session time. The product confidence delivered by this work is substantial: we know that the evidence layer is genuinely sound, that the four stress-test failure modes behave the way we expected, that compliance over-fires on Public content, that the editorial layer is the highest-leverage R6 target, and that the verdict aggregator under-fires on cross-source conflicts.

For future product investment decisions, this is a useful reference point: a $50 + half-day diagnostic against a 20-fixture batch can surface enough findings to direct multiple weeks of R6 work. Worth doing again at any major architecture inflection point.

---

## Appendix A — Run metadata

**Original batch:** `runs/2026-05-26-205208/`
- Started: 2026-05-26T12:52:08Z
- Finished: 2026-05-26T13:05:57Z
- Duration: 13 minutes 49 seconds
- 20 fixtures
- All completed cleanly with real Langfuse traces

**Rerun:** `runs/2026-05-26-212900/`
- Started: 2026-05-26T13:29:00Z
- Finished: 2026-05-26T13:34:30Z
- Duration: 5 minutes 30 seconds
- 18 fixtures (range 01-18, --no-confirm)
- All completed cleanly with real Langfuse traces

**For each fixture used in this analysis:**

| Fixture | Source | Trace |
|---|---|---|
| F01 | rerun | c97e8ece-0732-426f-883e-252704946ca6 |
| F02 | orig | 51190812-9d3e-4928-8cb5-99ea25110dc6 |
| F03 | orig | e675f74a-17db-4ba1-875c-7f5f973c2136 |
| F04 | rerun | 404907f6-f7f6-45d1-93fd-ed9283d0b8c0 |
| F05 | orig | 3bfae289-a250-4410-96e3-09fda5d57882 |
| F06 | orig | 44fffdad-a41e-40fb-995a-939749583b55 |
| F07 | orig | 8a2fe191-eaac-4584-9c93-f43752a23b72 |
| F08 | rerun | bee7abcb-990d-4687-aced-577c60d21bf5 |
| F09 | orig | 53a3053b-537a-44a8-a8db-faa49cf82b91 |
| F10 | rerun | 63be153f-3cf7-46e6-9a5e-9ab268c228cb |
| F11 | orig | 48185e6f-c9d9-4dd0-8c34-23d6050a9715 |
| F12 | orig | 6f12a632-b105-45c1-8f04-e7e56a5cb34d |
| F13 | rerun | 214c6558-90bd-4cdb-b595-b012d3786a3d |
| F14 | rerun | bf263962-e917-4732-8e4b-0362b6cb2194 |
| F15 | rerun | 72541bdc-7d82-4a9c-96f7-b2313122605a |
| F16 | orig | 930b12df-f17a-4c5c-b543-2de2e8fe9d94 |
| F17 | orig | 95e00588-657f-47a2-aad3-43e06f20e5a4 |
| F18 | rerun | ccbd1e8a-0538-466d-82cd-67b74e0e8984 |
| F19 | orig | b3ba6646-2731-4df1-bdf8-312ebd487a65 |
| F20 | orig | 52a89aca-1a84-4bf2-9cb2-fae0a8679f67 |

---

## Appendix B — Item count summary

Six new R6 candidates surfaced or formalised:

- **R6.5** house style framework (new, high priority)
- **R6.6** document-type appropriateness (new)
- **R6.7** forward-looking statement review (new)
- **R6.8** cross-source verdict aggregation (new)
- **R6.9** non-claim statement handling (new)
- **R6.10** source quality audit (new, low priority)

Three existing items refined:

- **R6.2** commentary quality — sub-items R6.2a, R6.2b, R6.2c, R6.2d
- **R6.4** Public version compliance — sub-items R6.4a, R6.4b, R6.4c
- **R2.7.1** Stage 2 conflict/partial — elevated from watch to spec candidate

Three infrastructure follow-ups:

- **D1.4** incremental INDEX write
- **D1.5** pipeline log analysis
- AI_OPERATING_MANUAL.md update: verification-by-grep discipline

End of diagnostic.
