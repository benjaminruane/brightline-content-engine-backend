# Removal guard sweep + non-factual false-red size

Commit target:
`chore(revise): sweep the full-source removal guard across all 11 candidates and size non-factual no_support`

Flag `deterministicUnsupportedRemoval` stays OFF. No production / prompt changes.
Part 1 cost: **$0.0031** (gpt-4o-mini, temp 0, seed 1).
Part 2 cost: **$0** (zero model calls).
Ran at: 2026-08-27T10:29:26.326Z

---

## Part 1: four numbers

```
CORRECT deletions cancelled by guard:  5 of 9
WRONG deletion cancelled:              YES (F01:S11)
ARGUABLE deletion cancelled:           NO (F14:S12)
Results rejected by quote verification: 2
```

```
PASS BAR: WRONG cancelled, and at most 1 of 9 CORRECT cancelled. NOT MET.
Guard cancelled 5 CORRECT deletions (too blunt).
```

### Table

| case id | statement id | sentence | adjudication | guard backed | quote verified | would cancel |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | F01:S11 | We recommend approval. | WRONG | yes | yes | yes |
| F08 | F08:S17 | We are confident in the team and the opportunity, and we look forward to providing furthe... | CORRECT | yes | yes | yes |
| F12 | F12:S5 | The numbers tell one story; the team's transformation tells the bigger one. | CORRECT | yes | yes | yes |
| F13 | F13:S15 | The investment fits well with the broader portfolio strategy. | CORRECT | yes | yes | yes |
| F14 | F14:S12 | We will provide further detail when the work is sufficiently advanced. | ARGUABLE | yes | no | no |
| F15 | F15:S32 | We have high conviction in the management team and the value creation plan, and we look f... | CORRECT | yes | yes | yes |
| F20 | F20:S8 | Our investment team has been preparing Fund V's pipeline for many months and we expect fi... | CORRECT | no | no | no |
| F21 | F21:S3 | James Ortiz said, "Project Atlas will double in value within two years." | CORRECT | no | no | no |
| F21 | F21:S4 | The transaction is expected to close in the second quarter of 2026. | CORRECT | no | no | no |
| F22 | F22:S3 | Veneto Freight is one of the fund's existing portfolio companies. | CORRECT | yes | no | no |
| F23 | F23:S4 | Aldous Renewables is the fund's largest limited partner. | CORRECT | yes | yes | yes |

Full rows: `scripts/diagnostic/revise/removal-guard-sweep.json`

### Unverified-quote events

- **F14:S12** source `14_synth_thesis_only_memo`: claimed backs with quote not in source:

```
We would expect to return to the Committee within six months with either a specific transaction memo or a refreshed thesis based on what we have learned.
```

- **F22:S3** source `ALP_IC_memo`: claimed backs with quote not in source:

```
The transaction was advised by Elena Foscari, former operations director at Veneto Freight.
```


### Verified cancel quotes

- **F01:S11** (WRONG) via `01_bvp_shopify_memo`:

```
We recommend this investment.
```

- **F08:S17** (CORRECT) via `08_synth_industrial_buyout_memo`:

```
We see meaningful upside optionality from M&A and end-market acceleration.
```

- **F12:S5** (CORRECT) via `12_synth_linkedin_post`:

```
Four and a half years later it is a genuinely international business with operations across the Nordic region, Germany, France, the UK, and Poland.
```

- **F13:S15** (CORRECT) via `13_synth_internal_inconsistency_memo`:

```
CloudPivot is a high-quality vertical SaaS asset with strong unit economics, a defensible competitive position, and a clear growth runway.
```

- **F15:S32** (CORRECT) via `15_synth_very_long_memo`:

```
The management team is strong.
```

- **F23:S4** (CORRECT) via `CRF_IC_memo`:

```
The opportunity was sourced through the fund's relationship with Aldous Renewables, a long-standing co-investment partner.
```

---

## Part 2: non-factual false red (sizing only, $0)

No Stage 2 fix proposed. Counts only.

### Patterns searched

Exact names / regex sources:

- `non-factual` — /non[- ]factual/i
- `procedural` — /\bprocedural\b/i
- `closer` — /\bcloser\b/i
- `not a factual claim` — /not a factual claim/i
- `does not assert` — /does not assert/i
- `editorial` — /\beditorial\b/i
- `opinion rather than fact` — /opinion rather than fact/i
- `no checkable claim` — /no checkable claim/i

Decline-to-verify cluster (the F01 hole): hits `non-factual`, `no checkable claim`, `not a factual claim`, `opinion rather than fact`, or both `procedural` and `closer`.
Other pattern hits (mainly `does not assert` modality notes on confirmed investment notices) are listed separately.

Artefacts:
- `claim-spans/.baseline.json`
- `eval-ablation/r3a-corpus-blast-rows.json`
- `eval-ablation/r10-corpus-blast-rows.json`

### Counts

```
unique statements matching any pattern:     4
  decline-to-verify cluster:                1
  other (mostly does-not-assert modality):  3
pair-level hits across artefacts:           12
verdict dist (all unique):                  {"no_support":1,"confirmed":3}
verdict dist (decline cluster):             {"no_support":1}
verdict dist (other):                       {"confirmed":3}
no_support in decline cluster:              1
```

### Full list

#### F01:S11 (no_support, decline-cluster)

Sentence: We recommend approval.

Patterns: non-factual, procedural, closer, no checkable claim

Artefact: `claim-spans/.baseline.json`

Reason:

```
The statement 'We recommend approval.' is a non-factual procedural closer with no checkable claim. The source discusses the investment case but does not address a recommendation for approval.
```

#### F08:S0 (confirmed)

Sentence: We are writing to inform you of a new investment in Helvetia Precision Components (the "Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.

Patterns: does not assert

Artefact: `claim-spans/.baseline.json`

Reason:

```
The source confirms the investment in Helvetia Precision Components, including its location and market focus. The statement does not assert that the transaction has closed, so there is no modality conflict.
```

#### F15:S0 (confirmed)

Sentence: We are writing to inform you of a new investment in Casa Verde Group (the "Company"), a Milan-headquartered premium European homeware and kitchenware specialist.

Patterns: does not assert

Artefact: `claim-spans/.baseline.json`

Reason:

```
The source confirms the statement by discussing the proposed investment in Casa Verde Group, a Milan-headquartered premium European homeware and kitchenware specialist. The statement does not assert that the transaction has closed, so there is no modality conflict.
```

#### F17:S0 (confirmed)

Sentence: We are writing to inform you of a new investment in the Urbis Logistics Portfolio, a portfolio of 11 last-mile logistics properties located in major European urban areas.

Patterns: does not assert

Artefact: `claim-spans/.baseline.json`

Reason:

```
The source confirms the statement by describing the proposed investment in the Urbis Logistics Portfolio, which consists of 11 last-mile logistics properties in major European urban areas. The statement does not assert that the transaction has closed, so there is no modality conflict.
```

### Hand adjudication (source read, up to 15, $0)

Adjudicated 4: source-backed 4, not backed 0.

- **F01:S11** class=`no_support` decline=true sourceBacked=true
  Source closes with an explicit recommendation. Decline-to-verify no_support is a false red.

```
We recommend this investment.
```

- **F08:S0** class=`confirmed` decline=false sourceBacked=true
  Pattern hit is modality ('does not assert that the transaction has closed') on a confirmed investment notice, not a decline-to-verify. Source backs the sentence.

```
We seek approval for Halden Group to invest up to EUR 480 million of equity in the acquisition of Helvetia Precision Components AG ("HPC" or "the Company"), a Zurich-headquartered manufacturer of high-precision machined components for the medical devices, aerospace, and semiconductor end markets.
```

- **F15:S0** class=`confirmed` decline=false sourceBacked=true
  Same modality 'does not assert' shape on confirmed. Source backs.

```
We seek IC approval for an investment of up to EUR 720 million of equity in the acquisition of Casa Verde Group S.p.A. ("Casa Verde" or "the Company"), a Milan-headquartered premium European homeware and kitchenware retailer and brand owner.
```

- **F17:S0** class=`confirmed` decline=false sourceBacked=true
  Modality 'does not assert' on confirmed Urbis notice. Source backs the new-investment claim.

```
We seek IC approval for an investment of up to EUR 340 million of equity in the acquisition of the Urbis Logistics Portfolio ("Urbis" or "the Portfolio"), a portfolio of 11 last-mile logistics properties located in major European urban areas.
```

---

## Pass conditions

- Part 1: 11 swept, quote verification, four numbers: **PASS**
- Part 1 bar (WRONG yes, CORRECT cancelled ≤1): **FAIL**
- Part 2: patterns, counts, list, zero model calls: **PASS**
- No production / prompt / flag changes: **PASS**

