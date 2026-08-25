# B88 commit 1: Stage 2 unsupported span shadow gate

Does not gate automatically on any of these counts.

## Vocabulary

Stage 2 currently returns `classification` per statement x source pair. Permitted values: `confirmed`, `partially_confirmed`, `conflicting`, `no_support`. The spec names `supported_full` / non-full are card-level display mappings applied after Stage 3 (confirmed -> supported_full). This gate uses the real Stage 2 field on matches and the display mapping on cards.

## Cache invalidation

The OFF system prompt is still exactly `stage2_v4.md`, so existing Stage 2 disk-cache entries remain valid for the OFF arm. The ON arm appends `stage2_v4_unsupported_span.md`, which changes promptHash, so ON cannot hit those entries.

The span is not carried onto the qcCard. That would require Stage 7 changes. It stays on the Stage 2 match object and does not influence verdict, concern level, or rollup.

## Disk / store

- QC_LLM_CACHE_DISK: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/.llm-cache.json`
- disk file existed before run: yes
- disk file bytes: 1464572
- store kind: disk
- store entries at start: 793
- baseline path: `/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-backend/scripts/diagnostic/claim-spans/.baseline.json`
- baseline case labels: nordholt-clean, nordholt-dirty, supersession, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, E1, E2, E3

## Corpus

Main set is the evidence-span-population corpus: Nordholt clean/dirty, supersession, F01 to F23. Statements come from `.baseline.json` (fingerprint ignored because this commit edits `stage2-match-sources.mjs`).

Main cases: nordholt-clean, nordholt-dirty, supersession, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23

Fixtures present on disk but not in the main cached set:
- F90 (90_adversarial_b17_latent.json): not in the cached shadow-gate baseline
- F91 (91_adversarial_temporal_gap.json): not in the cached shadow-gate baseline
- F92 (92_adversarial_present_tense_stale.json): not in the cached shadow-gate baseline

Main-corpus rejection counter (ON arm): 0

## Main corpus

### Cache

- OFF: hits 357, misses 0 (stage2 hits 357, misses 0)
- ON: hits 0, misses 357 (stage2 hits 0, misses 357)
- OFF arm is a pure cached replay (misses 0).

### 1. Verdict deltas OFF versus ON

Cards compared: 293

### supported_full -> non-full (candidate false-green corrections)

Count: 25

- nordholt-clean statement 0: supported_full -> supported_partial
  "Nordholt Logistics continues to perform in line with underwriting, and the fund has generated a net IRR to date of 14 per cent."
- nordholt-clean statement 2: supported_full -> supported_partial
  "Following the acquisition of Baltic ColdCo in June 2026, combined annual revenue stands at approximately EUR 155 million, of which around 70 per cent is contracted, providing a solid base of recurring income."
- supersession statement 1: supported_full -> supported_partial
  "The company employs 720 people."
- F04 statement 7: supported_full -> supported_partial
  "The Company's user base is unusual in two respects."
- F04 statement 10: supported_full -> supported_partial
  "This combination — engaged users, female-skewed, older demographic — represents a strong and underserved advertising audience and supports a credible long-term monetization path through native advertising in categories such as home decor, fashion, and weddings."
- F04 statement 12: supported_full -> supported_partial
  "Mr. Silbermann in particular has built a reputation at Google for being unusually focused on users and product."
- F04 statement 19: supported_full -> supported_partial
  "We have stress-tested for total loss and consider the risk-adjusted return profile acceptable given the conviction we have in the engagement signal and the founder team."
- F04 statement 20: supported_full -> supported_partial
  "In summary, the Company combines exceptional engagement, a defensible consumer position, and a founder team in which we have high conviction."
- F06 statement 5: supported_full -> supported_partial
  "Revenue for the year ended 31 December 2025 was EUR 218 million, modestly above the EUR 196 million at the time of our investment, and EBITDA margins have been broadly stable at around 14 percent over the holding period."
- F09 statement 4: supported_full -> supported_partial
  "Petra Köhler assumed the CEO role in June and has made decisive progress on the procurement, footprint, and commercial priorities identified at IC."
- F12 statement 0: supported_full -> supported_partial
  "After more than four years of partnership, Meridian Capital has completed the sale of NorTech Industries to Brookfield this week."
- F12 statement 2: supported_full -> supported_partial
  "The transformation since has been substantial."
- F13 statement 8: supported_full -> supported_partial
  "It has built a clear competitive lead in the European mid-market against entrenched legacy software competitors."
- F14 statement 3: supported_full -> supported_partial
  "Incumbents with serious clinical software have built up meaningful regulatory clearances, creating real barriers to entry."
- F14 statement 7: supported_full -> supported_partial
  "At the same time, generative AI is exposing incumbents that lack credible AI strategies to renewed competitive risk from challengers — and from each other."
- F14 statement 8: supported_full -> supported_partial
  "The European market is structurally distinct from the US in ways that favour a thoughtful financial sponsor."
- F15 statement 9: supported_full -> supported_partial
  "Continued own-brand penetration uplift — own-brand share has grown from 38% in 2020 to 54% in 2025, with continued runway to 70% contributing material gross margin expansion."
- F15 statement 11: supported_full -> supported_partial
  "The format currently operates 18 stores and represents a fifth value driver alongside the four pillars above."
- F15 statement 25: supported_full -> supported_partial
  "The model has been stress-tested for modest lease renegotiation."
- F15 statement 27: supported_full -> supported_partial
  "Underlying relationships are stable but the dependency is noted."
- F16 statement 2: supported_full -> supported_partial
  "The unit economics are exceptional for a brand at this stage."
- F16 statement 10: supported_full -> supported_partial
  "Our investment thesis rests on the structural attractiveness of premium women's health (a EUR-denominated category growing at approximately 14 percent annually), Bloom's defensible product credibility and brand position, and a clear international runway in France, Italy, Spain, and selectively in the US over a five-year hold."
- F19 statement 4: supported_full -> supported_partial
  "Helvetia Precision Components, acquired in June 2025, is six months into the hold and tracking modestly ahead of underwriting; the recently-acquired Lumen Specialty Chemicals is on track with its 100-day plan; Brightway Industrial Coatings has had a strong 2025 with revenue and EBITDA growing 14 percent and 21 percent respectively; Eltex Power Systems has performed exceptionally, with revenue growing 23 percent and EBITDA growing 31 percent year-on-year supported by an order backlog that has grown from EUR 285 million at acquisition to EUR 480 million today."
- F23 statement 0: supported_full -> conflicting
  "The fund holds a majority stake in a renewable-energy generation platform."
- F23 statement 1: supported_full -> supported_partial
  "The platform benefits from long-term contracted cash flows and meaningful geographic diversification."

### non-full -> supported_full (candidate regressions)

Count: 1

- F15 statement 32: not_supported -> supported_full
  "We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses."

### non-full -> different non-full

Count: 2

- nordholt-dirty statement 2: conflicting -> supported_partial
  "Following our acquisition of Baltic ColdCo, combined revenue has surged to $155m, of which virtually all is locked in under long-term contracts."
- F08 statement 2: conflicting -> supported_partial
  "We have invested EUR 480 million of equity for a 78% controlling stake, with the founding Schiller family and management retaining the balance."

### 2. Span return rate (ON-arm non-full cards)

89.2% (58/65)

### 3. Span validation rate (of spans returned)

Returned: 93
Validated exact substring: 93
Rejected: 0
Validation rate: 100.0% (93/93)

### 4. Degenerate-answer measure (validated spans)

Entire statement: 33
Strictly shorter: 60
Shorter-span length as % of statement, median: 42.36
Decile points (p0 to p100):
- p0: 8.91
- p10: 19.62
- p20: 23.56
- p30: 29.40
- p40: 35.05
- p50: 42.36
- p60: 46.53
- p70: 55.03
- p80: 60.65
- p90: 69.60
- p100: 86.67
Decile buckets:
- [0, 10): 1
- [10, 20): 6
- [20, 30): 12
- [30, 40): 7
- [40, 50): 13
- [50, 60): 8
- [60, 70): 7
- [70, 80): 2
- [80, 90): 4
- [90, 100): 0

### 5. Validated span on a supported_full outcome

Count: 14
Validated spans on a confirmed pair: 0 (the prompt says to omit the field when classification is confirmed).
These cards are supported_full because another source confirmed. The spans sit on non-confirmed pairs for the same statement, which Stage 3 any-confirmed-wins does not drop.
- nordholt-clean statement 1: "The business now operates 14 cold-chain facilities across three Nordic markets and employs 720 people."
  source 0 (IC memo) classification=conflicting span="The business now operates 14 cold-chain facilities across three Nordic markets and employs 720 people."
  source 1 (press release) classification=partially_confirmed span="and employs 720 people"
  source 3 (LP update) classification=partially_confirmed span="The business now operates 14 cold-chain facilities across three Nordic markets and employs 720 people."
- nordholt-clean statement 3: "Facility utilisation is 88 per cent."
  source 0 (IC memo) classification=no_support span="Facility utilisation is 88 per cent."
- nordholt-clean statement 4: "Customer relationships are underpinned by multi-year contracts averaging four years, and the EBITDA margin is approximately 19 per cent."
  source 2 (fact sheet) classification=no_support span="Customer relationships are underpinned by multi-year contracts averaging four years, and the EBITDA margin is approximately 19 per cent."
  source 3 (LP update) classification=no_support span="Customer relationships are underpinned by multi-year contracts averaging four years, and the EBITDA margin is approximately 19 per cent."
- nordholt-clean statement 5: "The company expects to complete two further bolt-on acquisitions over the coming twelve months and does not anticipate a realisation before 2028."
  source 0 (IC memo) classification=partially_confirmed span="over the coming twelve months and does not anticipate a realisation before 2028"
  source 2 (fact sheet) classification=no_support span="The company expects to complete two further bolt-on acquisitions over the coming twelve months and does not anticipate a realisation before 2028."
- nordholt-dirty statement 3: "Utilisation has reached a record 88 per cent."
  source 0 (IC memo) classification=no_support span="Utilisation has reached a record 88 per cent."
- supersession statement 0: "Revenue for the twelve months to 31 December 2025 was EUR 200 million."
  source 0 (source_A_annual_report_2019) classification=no_support span="Revenue for the twelve months to 31 December 2025 was EUR 200 million."
  source 1 (source_B_fy2024_results) classification=no_support span="Revenue for the twelve months to 31 December 2025 was EUR 200 million."
- supersession statement 2: "Adjusted EBITDA for FY2024 was EUR 45 million."
  source 2 (source_C_fund_update_2026) classification=conflicting span="Adjusted EBITDA for FY2024 was EUR 45 million."
- F18 statement 3: "The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units."
  source 1 (18b_synth_cross_source_pair_update) classification=partially_confirmed span="380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units"
- F18 statement 4: "It generates annual recurring revenue (ARR) of EUR 38 million as of March 2025, representing strong growth from EUR 28 million the prior year."
  source 1 (18b_synth_cross_source_pair_update) classification=conflicting span="EUR 38 million as of March 2025"
- F18 statement 5: "The Company employs 142 people across Stockholm, Oslo, and Helsinki."
  source 1 (18b_synth_cross_source_pair_update) classification=conflicting span="The Company employs 142 people across Stockholm, Oslo, and Helsinki."
- F18 statement 6: "The investment thesis is anchored on three pillars: a genuinely market-leading product (independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen."
  source 1 (18b_synth_cross_source_pair_update) classification=partially_confirmed span="independent customer research rates the Company significantly higher than the principal Nordic competitor Yardi Nordic on usability and feature completeness), a structurally underpenetrated market (approximately 40% of Nordic property management companies still use legacy systems or spreadsheets), and an exceptional founder team led by CEO Mr. Erik Lindqvist and CTO Mr. Pekka Virtanen."
- F18 statement 8: "The base case generates 2.8x MOIC and 23% gross IRR."
  source 1 (18b_synth_cross_source_pair_update) classification=conflicting span="The base case generates 2.8x MOIC and 23% gross IRR."
- F23 statement 2: "The platform operates 1.2 GW of installed capacity."
  source 1 (CRF_diligence_update) classification=conflicting span="1.2 GW"
- F23 statement 3: "The fund targets attractive risk-adjusted returns underpinned by contracted revenue."
  source 1 (CRF_diligence_update) classification=partially_confirmed span="The fund targets attractive risk-adjusted returns"

## Adversarial F90 F91 F92 (separate from the cached set)

F90, F91 and F92 ran live in both arms. Stage 1 cache hits 0, misses 3.

## Adversarial live arms

Adversarial-corpus rejection counter (ON arm): 0

### Cache

- OFF: hits 0, misses 4 (stage2 hits 0, misses 4)
- ON: hits 0, misses 4 (stage2 hits 0, misses 4)
- OFF arm was not a pure cached replay: 4 miss(es). Counts below are still reported.

### 1. Verdict deltas OFF versus ON

Cards compared: 4

### supported_full -> non-full (candidate false-green corrections)

Count: 0

None.

### non-full -> supported_full (candidate regressions)

Count: 0

None.

### non-full -> different non-full

Count: 0

None.

### 2. Span return rate (ON-arm non-full cards)

100.0% (1/1)

### 3. Span validation rate (of spans returned)

Returned: 1
Validated exact substring: 1
Rejected: 0
Validation rate: 100.0% (1/1)

### 4. Degenerate-answer measure (validated spans)

Entire statement: 1
Strictly shorter: 0
The span return rate is high only because the model returns the whole statement.
Shorter-span length as % of statement: vacuous (denominator 0).

### 5. Validated span on a supported_full outcome

Count: 0
Validated spans on a confirmed pair: 0 (the prompt says to omit the field when classification is confirmed).
None.

## 6. ON-arm rows

Wrote 297 rows to `scripts/diagnostic/stage2-span/rows.json`, including every returned span verbatim, validated or rejected.
