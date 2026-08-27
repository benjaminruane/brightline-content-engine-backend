# Removal breadth audit (static gate)

Commit target:
`chore(revise): static gate audit for deterministic unsupported removal across the corpus`

Flag `deterministicUnsupportedRemoval` stays OFF in production. 0559301 stays OFF.
No Suggest / Reviser calls. Cost: **$0**.

---

## Adjudication counts (Part 2)

```
CORRECT   9
WRONG     1
ARGUABLE  1
```

WRONG means a supplied source backs the sentence; enabling the flag would delete
correct text. ARGUABLE means partial / implied backing; reasonable people differ.

---

## Headline (Part 1)

```
11 statements across 10 cases would be selected for removal, out of 296 statements in the corpus
```

UPPER BOUND: at run time the gate also requires statementText to still match the model's revised draft.

This is an UPPER BOUND also because each selected statement was evaluated alone
against the ORIGINAL draft via `applyDeterministicUnsupportedRemoval` from
`lib/pr9-deterministic-unsupported-removal.mjs`. Runtime still requires the
model's revised draft to retain matching `statementText`.

---

## Method

- Corpus: 29 graded cases (29 loaded) from
  `scripts/diagnostic/claim-spans/.baseline.json` (296 statements).
- Review artefact note: STALE after R3a ship (2026-08-26). Stage 2 rows were produced under promptHash c718c190315ec131946cfa73452d12f417a01117fc04e2b63daca8e1455d57fe. Do not use for live-product verdict checks. Current Stage 2 reference: scripts/diagnostic/eval-ablation/r3a-corpus-blast-rows.json (364 pairs, R3a promptHash bce78c194451ff6b4351eadbb6ab2eac984d872a6edb85c50a52ba3f3c4cb68c). Regeneration: BACKLOG B114 (~$4, deferred).
- Live Stage 2 reference (not used for this gate pass): `scripts/diagnostic/eval-ablation/r3a-corpus-blast-rows.json`
- Aggregate per statement with `aggregateVerdict` (stage3).
- Map cards through `gatherConcerns` (real unsupported kind).
- Whole-sentence / empty-draft / confirmed_preserve / removal via the real
  gate module (imported; not reimplemented).
- `remnant_lost_after_delete` still counts as selected: the gate deletes the
  sentence before remnant annotation fails (common on last-sentence closers
  when `previousSentenceBounds` swallows the target). Breadth measures deletion,
  not whether the CUT remnant marker was placed.
- Zero model calls. Cost $0.

### Funnel

```
total statements in corpus:           296
aggregated not_supported:             14
gatherConcerns kind=unsupported:      14
whole-sentence on original draft:     11
blocked confirmed_preserve:           0
empty-draft guard:                    0
selected for removal:                 11
skipped not whole-sentence:           3
skipped no draft match:               0
skipped other (pre-delete):           0
```

---

## Selected statements (Part 1 table)

| case id | statement id | sentence text | sources | Stage 2 classifications | selection reason | adjudication |
| --- | --- | --- | ---: | --- | --- | --- |
| F01 | F01:S11 | We recommend approval. | 1 | 01_bvp_shopify_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | WRONG |
| F08 | F08:S17 | We are confident in the team and the opportunity, and we look forward to providing further updates as the hold progresses. | 1 | 08_synth_industrial_buyout_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F12 | F12:S5 | The numbers tell one story; the team's transformation tells the bigger one. | 1 | 12_synth_linkedin_post:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F13 | F13:S15 | The investment fits well with the broader portfolio strategy. | 1 | 13_synth_internal_inconsistency_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F14 | F14:S12 | We will provide further detail when the work is sufficiently advanced. | 1 | 14_synth_thesis_only_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | ARGUABLE |
| F15 | F15:S32 | We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses. | 1 | 15_synth_very_long_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F20 | F20:S8 | Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026. | 1 | 20_synth_fund_close_announcement:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F21 | F21:S3 | James Ortiz said, "Project Atlas will double in value within two years." | 1 | 21_r6_6_2_residual_legs:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F21 | F21:S4 | The transaction is expected to close in the second quarter of 2026. | 1 | 21_r6_6_2_residual_legs:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F22 | F22:S3 | Veneto Freight is one of the fund's existing portfolio companies. | 2 | ALP_IC_memo:no_support; ALP_update_memo:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |
| F23 | F23:S4 | Aldous Renewables is the fund's largest limited partner. | 2 | CRF_IC_memo:no_support; CRF_diligence_update:no_support | aggregated not_supported -> gatherConcerns kind unsupported; whole-sentence on original draft; not blocked by confirmed_... | CORRECT |

Full rows: `scripts/diagnostic/revise/removal-breadth-rows.json`

---

## WRONG and ARGUABLE (full)

### F01:S11 (WRONG)

Sentence: We recommend approval.

Sources supplied: 1

Stage 2: 01_bvp_shopify_memo:no_support

Deciding source (01_bvp_shopify_memo):

```
We recommend this investment.
```

Source closes with an explicit recommendation. Draft 'We recommend approval.' is the same speech act; Stage 2 no_support is a miss. Deletion would destroy correct text.

### F14:S12 (ARGUABLE)

Sentence: We will provide further detail when the work is sufficiently advanced.

Sources supplied: 1

Stage 2: 14_synth_thesis_only_memo:no_support

Deciding source (14_synth_thesis_only_memo):

```
We would expect to return with clearer perspectives in the next thesis update.
```

Source defers detail to a later update after sourcing work. Draft says further detail when work is sufficiently advanced. Same deferral intent, different wording; reasonable people differ on whether that backs deletion.


## CORRECT (quote per row)

### F08:S17 (CORRECT)

Sentence: We are confident in the team and the opportunity, and we look forward to providing further updates as the hold progresses.

Sources supplied: 1

Stage 2: 08_synth_industrial_buyout_memo:no_support

Deciding source (08_synth_industrial_buyout_memo):

```
We recommend approval.
```

Source ends on a plain recommend-approval line. It does not state confidence in the team, look-forward language, or hold-progress updates. Boilerplate closing is unsupported.

### F12:S5 (CORRECT)

Sentence: The numbers tell one story; the team's transformation tells the bigger one.

Sources supplied: 1

Stage 2: 12_synth_linkedin_post:no_support

Deciding source (12_synth_linkedin_post):

```
When we acquired NorTech in 2021 it was an excellent company with a clear ceiling — strong in Sweden, under-exposed everywhere else, and held back by a fragmented shareholder structure.
```

LinkedIn post has no 'numbers tell one story / transformation tells the bigger one' rhetoric. Pure draft flourish.

### F13:S15 (CORRECT)

Sentence: The investment fits well with the broader portfolio strategy.

Sources supplied: 1

Stage 2: 13_synth_internal_inconsistency_memo:no_support

Deciding source (13_synth_internal_inconsistency_memo):

```
We are attracted to CloudPivot for the following reasons.
```

Memo has an investment thesis section but never claims portfolio-strategy fit. Sentence is unsupported.

### F15:S32 (CORRECT)

Sentence: We have high conviction in the management team and the value creation plan, and we look forward to providing further updates as the hold progresses.

Sources supplied: 1

Stage 2: 15_synth_very_long_memo:no_support

Deciding source (15_synth_very_long_memo):

```
We recommend approval of an investment of up to EUR 720 million of equity from Halden Group, with the right to syndicate up to EUR 110 million of co-investment, in the acquisition of Casa Verde Group S.p.A.
```

Source recommends approval with ticket size. It does not say high conviction in management / value creation plan, nor look-forward hold updates. Stock LP closing is unsupported.

### F20:S8 (CORRECT)

Sentence: Our investment team has been preparing Fund V's pipeline for many months and we expect first capital calls in the second quarter of 2026.

Sources supplied: 1

Stage 2: 20_synth_fund_close_announcement:no_support

Deciding source (20_synth_fund_close_announcement):

```
We anticipate making 10 to 12 platform investments over the four-year deployment period, with typical equity tickets in the EUR 300 to 700 million range.
```

Announcement covers final close and deployment shape. No pipeline-prep claim and no first capital call in Q2 2026.

### F21:S3 (CORRECT)

Sentence: James Ortiz said, "Project Atlas will double in value within two years."

Sources supplied: 1

Stage 2: 21_r6_6_2_residual_legs:no_support

Deciding source (21_r6_6_2_residual_legs):

```
James Ortiz, former Chief Executive Officer of GridCo Industries, advised Meridian Capital on the transaction structure.
```

Ortiz appears only as an adviser. No Project Atlas quote and no 'double in value within two years.'

### F21:S4 (CORRECT)

Sentence: The transaction is expected to close in the second quarter of 2026.

Sources supplied: 1

Stage 2: 21_r6_6_2_residual_legs:no_support

Deciding source (21_r6_6_2_residual_legs):

```
Frankfurt, Germany — 1 March 2026 — Meridian Capital ("Meridian") today announced the acquisition of NordVolt Storage GmbH ("NordVolt"), a Nordic battery storage platform.
```

Press release announces the deal as of 1 March 2026. No expected close in Q2 2026.

### F22:S3 (CORRECT)

Sentence: Veneto Freight is one of the fund's existing portfolio companies.

Sources supplied: 2

Stage 2: ALP_IC_memo:no_support; ALP_update_memo:no_support

Deciding source (ALP_IC_memo):

```
The transaction was advised by Elena Foscari, former operations director at Veneto Freight, who supported the commercial diligence workstream.
```

Veneto Freight is prior employer of an adviser, not a fund portfolio company. Update memo never mentions Veneto Freight.

### F23:S4 (CORRECT)

Sentence: Aldous Renewables is the fund's largest limited partner.

Sources supplied: 2

Stage 2: CRF_IC_memo:no_support; CRF_diligence_update:no_support

Deciding source (CRF_IC_memo):

```
The opportunity was sourced through the fund's relationship with Aldous Renewables, a long-standing co-investment partner.
```

Aldous is a co-investment partner, not the fund's largest limited partner. Diligence update never names Aldous.


---

## Read on shipping the flag

Of 11 upper-bound deletions, 1 would destroy
source-backed text on this corpus artefact (9.1% of
selected; 0.34% of all corpus statements).
1 more is arguable.

B115 attention-failure band (1.5% to 4.5%) is about wrong no_support rate on
attention probes. Here the static gate would delete 11 of
296 statements (3.7%)
under stale baseline Stage 2. Re-run after B114 baseline regeneration before any
enable decision.

---

## Pass conditions

- Part 1: table, rows JSON, headline count; zero model calls. PASS
- Part 2: every selected row adjudicated against source text with a quote. PASS
- Report leads with CORRECT / WRONG / ARGUABLE counts. PASS
- Cost $0. PASS
