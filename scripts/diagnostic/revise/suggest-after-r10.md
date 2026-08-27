# Suggest revised draft after R10 reasoning

Measure: does Review's improvement reach the rewriter?

Nothing shipped. No prompt or code changes. Spans stayed ON in Production
(`QC_STAGE2_SPAN` as configured). This pass does **not** separate the
reasoning channel from the span channel. Turning spans off would roughly
double cost, and the question here is whether the product produces a good
rewrite, not which input caused it. Do not later claim the span did or did
not do the work on the mark card.

Identity (name the file every time):
- **eval-ablation EA_E3** = Fund IV mark sentence in
  `scripts/diagnostic/eval-ablation/meridian_source.txt` (Halden draft)
- **claim-spans CS_E3** and **corpus E3:S0:ic_memo** are different statements
  sharing a label. This report is only about eval-ablation EA_E3 / EA_E2.

Raw artefacts:
- `suggest-after-r10-review1.json`
- `suggest-after-r10-suggest1.json`
- `suggest-after-r10-suggest2.json` (adaptive instability repeat)
- `suggest-after-r10-review2.json`
- `suggest-after-r10-run-meta.json`
- runner: `run-suggest-after-r10.mjs`

---

## Part 0: Preflight (free). HARD GATE.

Reconstructed offline from
`scripts/diagnostic/eval-ablation/r10-production-verify.json` via exported
`gatherConcerns` + `buildRevisionPrompt` (same assembly as
`lib/build-revision-prompt.mjs`). No model calls.

### Concerns block (verbatim)

```
CONCERNS TO ADDRESS:
### Statement [0]
Text: In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.
Evidence gap (partially_confirmed) [kind=partial]:
  Reason: The source confirms that Halden Group has a history of investing with Meridian Capital, including co-investments and secondary investments in earlier funds. However, it does not mention a lead commitment to Meridian Capital Partners V in June 2025. The reviewer should verify the specific claim about the lead commitment and the details of the EUR 1.2 billion fund, as these are not addressed in the source.
  Source excerpt: Halden Group has invested with Meridian Capital on three co-investments and two debt financings, and invested in three earlier secondary investments in LP positions in Fund III and IV.

### Statement [1]
Text: We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "that is, in our view, genuinely exceptional"
  Reason: The source confirms Meridian's track record with specific figures: a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, the evaluative term 'genuinely exceptional' is subjective and not directly supported by the source. Consider revising the statement to reflect the specific data provided or provide additional context to justify the evaluative claim.
  Source excerpt: Track record: Across Funds I–IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits).

### Statement [2]
Text: It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "placing it in the top quartile of European lower-mid-market managers."
  Reason: The source confirms the realised gross MOIC of 2.4 times across 17 exits. However, it does not address the claim that this performance places it in the top quartile of European lower-mid-market managers. The reviewer should verify this additional claim or adjust the statement to reflect only the confirmed data.
  Source excerpt: Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits).

### Statement [3]
Text: The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.
Evidence gap (partially_confirmed) [kind=partial]:
  Reason: The source confirms that there have been no senior departures across the last three fund cycles, supporting the statement's claim about the team's stability. However, the source does not address the assertion that this stability limits key-person risk, which is an evaluative claim not covered by the source. The reviewer should consider adding a source that specifically discusses key-person risk or revise the statement to align with the confirmed information.
  Source excerpt: No senior departures across the last three fund cycles.

### Statement [4]
Text: Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.
Evidence gap (conflicting) [kind=conflict]:
  Unsupported phrase (source 0): "has returned"
  Reason: The statement claims that Fund IV has returned 1.9 times gross MOIC and a 24 percent gross IRR. However, the source indicates that Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR, which suggests a valuation rather than an actual return. This presents a contradiction between the statement's implication of realized returns and the source's indication of current valuation. The reviewer should reconcile this discrepancy or remove the claim.
  Source: Meridian Fund V summary (Halden copy)
  Conflicting source passage: Fund IV (2019 vintage, EUR 900 million) is currently marked at 1.9x gross MOIC and 24% gross IRR, with 4 of 12 platform investments fully realised.

### Statement [7]
Text: On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "we recommend the commitment"
  Reason: The source confirms the performance metrics of Fund IV, with a realised gross MOIC of 2.4x and a gross IRR of 21% on fully realised deals. However, it does not explicitly state that Fund V is expected to deliver returns in line with its predecessor, nor does it address the recommendation to commit. The reviewer should consider adding specific projections for Fund V or a direct recommendation to strengthen the statement.
  Source excerpt: Track record: Across Funds I–IV, Meridian has deployed EUR 2.8 billion across 41 platform investments. Realised gross MOIC of 2.4x and gross IRR of 21% on fully realised deals (17 exits)....

### Statement [8]
Text: The GP provided access to co-investments that would not otherwise have been available to us.
Evidence gap (partially_confirmed) [kind=partial]:
  Unsupported phrase (source 0): "that would not otherwise have been available to us."
  Reason: The source confirms that the GP offered co-investments to LPs on six occasions across Funds III and IV, on a no-fee, no-carry basis. However, it does not address whether these co-investment opportunities would not have been available otherwise, which is a key part of the statement. The reviewer should verify this aspect or adjust the statement to reflect only the confirmed details.
  Source excerpt: Co-investment: The GP has offered co-investment to LPs on six occasions across Funds III and IV, on a no-fee, no-carry basis.

### Statement [9]
Text: Halden Group expects the relationship to deepen over the life of the fund.
Evidence gap (no_support) [kind=unsupported]:
  Reason: No source addresses the expectation that the relationship will deepen over the life of the fund. The source only mentions past investments by Halden Group with Meridian Capital. Please add a supporting source or remove the claim.
```

### Per evidence-gap card (spans / excerpt / conflict)

```
EA_E3 mark (Statement [4], eval-ablation meridian_source.txt)
  Reason: names "has returned" vs "currently marked at" / valuation vs realised.
  Unsupported spans: "has returned" SURVIVES (phrase span).
  Conflict passage: PRESENT.
  Source excerpt: carried as conflicting source passage (conflict path).
  CONFIRMED: r10-production-verify.json card + gatherConcerns output above.

EA_E2 risk (Statement [3], eval-ablation meridian_source.txt)
  Reason: names key-person risk as evaluative / not covered; stability confirmed.
  Unsupported spans: WHOLE-STATEMENT span in raw card; STRIPPED by
    isWholeStatementSpan (lib/build-revision-prompt.mjs L311-L337).
    Reviser sees NO unsupported phrase line. Reasoning-only.
  Conflict passage: absent (partial, not conflict).
  Source excerpt: PRESENT ("No senior departures...").
  CONFIRMED: same.

Statement [0] lead commitment
  Whole-statement span STRIPPED. Reason + excerpt present. Reasoning-only.

Statements [1][2][7][8]
  Short phrase spans SURVIVE. Reason + excerpt present.

Statement [9] deepen
  No span. No excerpt (no_support). Reason only. Expected for true no-support.
```

### Gate answers

```
Is mark Reason specific enough to drive a correct edit?
  YES. It names the basis mismatch (returned vs marked / valuation).
  CONFIRMED: Statement [4] Reason lines above.

Is EA_E2's Reason carrying the whole load, given its span is stripped?
  YES. The block still names the unsupported evaluative claim
  (key-person risk) and the confirmed stability fact.
  CONFIRMED: Statement [3] has Reason + excerpt, no Unsupported phrase line.

Anything thin, missing, or duplicated that would make the run uninformative?
  NO. Mark block is well-formed (Reason + conflict passage + surviving
  phrase span). EA_E2 is the free reasoning-only contrast. Statement [9]
  has no excerpt by design. No malformation.

GATE: PASS. Proceed to Part 1.
```

---

## Part 1: One production pass

Production URL: `https://brightline-content-engine-backend.vercel.app`

Settings: evidence-only Review (`editorialEnabled: false`,
`complianceEnabled: false`), `outputType=reporting_commentary`,
`requiredVersion=complete`. Same Halden Meridian draft and
`eval-ablation/meridian_source.txt` as r10-production-verify.

```
review1  http=200  ms=16482  trace=23cba6e1-6c84-4e4a-9a1a-d7059ce0321c
  EA_E3 mark: conflict / high
  EA_E2 risk: supported_partial / moderate
suggest1 http=200  (production /api/suggest-revision)
suggest2 http=200  (adaptive; same Review statements)
review2  http=200  trace=2f0432d0-bd9d-49ed-b1ee-84caa2bd994a
```

Live Review1 Reason on the mark card (slightly shorter wording than the
verify JSON, same substance): returned vs marked. CONFIRMED:
`suggest-after-r10-review1.json` statement index 4 `evidenceSummary`.

### Suggest 1 revised draft (verbatim)

```
In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

We were attracted to Meridian on the strength of a track record of 2.4x realised gross MOIC and 21% gross IRR across 17 fully realised exits.

It has realised a gross MOIC of 2.4 times across 17 exits.

The team's stability, with no senior departures across the last three fund cycles.

Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.

Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

The fund will hold investments for four to six years and will not deploy more than 30% of commitments outside the EU.

On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.

The GP provided access to co-investments on a no-fee, no-carry basis across Funds III and IV.

Halden Group expects the relationship to deepen over the life of the fund.
```

### Mark rule (Ben, non-negotiable)

```
Suggest1 mark sentence:
  Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.

  carries marked language: YES
  retains 1.9: YES
  retains 24: YES (as 24%)
  keeps "has returned" / "returned": NO
  hedges figure without basis: NO
  deletes either figure: NO

  VERDICT: PASS
  CONFIRMED: suggest-after-r10-suggest1.json / run-meta markScore
```

### Adaptive Suggest 2 (instability probe; on the record)

First Suggest PASSed the mark rule, so Suggest ran once more on the **same**
Review1 statements. Not result-shopping: looking for a failure after a pass.

```
Suggest2 mark sentence:
  Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.

  VERDICT: PASS (same mark sentence)

Drafts are NOT identical. Instability is real on other cards.
CONFIRMED: suggest1.revisedDraft !== suggest2.revisedDraft
```

Suggest2 mark sentence (verbatim):

```
Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR.
```

Suggest2 EA_E2 risk sentence (different from Suggest1):

```
The team's stability, with no senior departures across the last three fund cycles, is a key consideration in assessing key-person risk.
```

So: mark edit stable across two Suggests; non-mark edits drift. Adequacy of
one pass for success remains weak; two passes both PASSed the mark rule, so
this is not a failure-after-pass on the mark. It is inconsistency on the rest
of the draft.

### Free contrast (the point of this draft)

```
EA_E3 (eval-ablation meridian_source.txt): clean phrase span "has returned"
  Suggest1 edit: GOOD (PASS mark rule). Genuinely good, not merely different.

EA_E2 (eval-ablation meridian_source.txt): whole-statement span stripped;
  reasoning-only.
  Suggest1 edit: GOOD. Cut "means key-person risk is limited", left the
  confirmed stability clause. Grammatical. No B88 neighbour-duplicate.

Both good on Suggest1 → on this draft, reasoning suffices without relying on
a surviving span for the risk card. Mark card still had a span ON, so this
does not prove the mark edit was reasoning-driven. Limitation stated above.
```

Suggest2 EA_E2 is weaker (keeps key-person language in a softened form). That
is instability, not a clean reasoning-only win on every sample.

---

## Scoring

### Mark card (eval-ablation EA_E3)

```
Suggest1 mark rule: PASS
Suggest2 mark rule: PASS
Softened only the unsupported basis verb; kept 1.9 and 24.
Confirmed facts intact: YES (figures retained; basis corrected to source).
Grammatical: YES. No B88 neighbour-duplicate.
Invented source support: NO (source states marked at 1.9x / 24%).
Marker honesty (Suggest1): FAIL on the mark wrapper.
  Marker wraps "IRR" with note "Left this wording as written" and intent
  CHANGED, while the sentence DID change "has returned" → "is currently
  marked at". CONFIRMED: run-meta markers suggest1 start=553 end=556.
Marker honesty (Suggest2): better on the mark
  ("Changed 'has returned' to 'is currently marked at'...").
```

### EA_E2 risk (reasoning-only)

```
Suggest1: removed only the unsupported evaluative clause; left confirmed
  stability. Grammatical. GOOD.
Suggest2: recast into "is a key consideration in assessing key-person risk"
  (softens but retains key-person framing). Still grammatical. Weaker.
```

### Other cards (Suggest1)

```
Stmt0 lead: UNTOUCHED despite partial gap. Marker claims CHANGED /
  "Left this wording as written" on untouched text. Marker honesty FAIL.
Stmt1 exceptional: replaced evaluative phrase with sourced 2.4x / 21% /
  17 exits. Figures are IN the source (not invented). Leaves confirmed
  attraction point. GOOD, slightly expansive (injects numbers into a
  sentence that did not carry them).
Stmt2 ranking: cut top-quartile clause; kept realised MOIC / 17 exits. GOOD.
Stmt7 recommend: first-person → Halden Group; kept recommendation.
  Confirmed track-record claim intact. Acceptable.
Stmt8 co-invest: cut "not otherwise available"; substituted sourced
  no-fee/no-carry / Funds III and IV. GOOD (source-backed replacement).
Stmt9 deepen: UNTOUCHED (keep-and-flag path). Marker says Kept / CHANGED
  intent mismatch. Marker honesty soft FAIL.
House-style: "24 per cent" → "24%", "30 per cent" → "30%" (silent craft).
```

### Second Review (scored separately)

Draft reviewed: Suggest1 revised text with markers stripped.

```
Mark card now CLEAR?
  YES. supported_full / none.
  CONFIRMED: suggest-after-r10-review2.json
  "Fund IV is currently marked at 1.9 times gross MOIC and a 24% gross IRR."

Risk card: supported_full / none (cleared after Suggest1 cut).

New flags that were not there before?
  NO. Remaining gaps:
    lead commitment: still supported_partial / moderate (untouched)
    recommend: still supported_partial / moderate
    deepen: still not_supported / high
  Cleared vs Review1: exceptional, ranking, risk, mark, co-invest.

If the rewrite had been good but Review still flagged the mark, that would
be a separate Review defect. Here Review agrees with the good rewrite.
```

---

## Cost

```
review1_analyse_statements   ~$0.50  (estimate; prior Meridian evidence-only)
suggest1                     ~$0.05
suggest2_instability         ~$0.05
review2_analyse_statements   ~$0.50
----------------------------------------
total estimate               ~$1.10

Production did not return billed USD in these payloads. Estimates only.
Part 1 landed near the "possibly $1.00" band because of the adaptive second
Suggest plus second Review.
```

---

## Verdict and opinion

```
Does Review's improvement reach the rewriter on this draft?
  YES for the mark card. Suggest produces "currently marked at 1.9 ... 24%",
  second Review CLEARS, adaptive repeat also PASSes the mark rule.

Are the edits genuinely good or merely different?
  Mark: genuinely good.
  EA_E2 Suggest1: genuinely good.
  Rest of Suggest1: mostly good surgical softens; lead left untouched;
  marker honesty is still weak.
  Suggest2: mark still good; other cards drift (instability CONFIRMED).

B88?
  Leave OPEN but rewrite the status: the stale "spans are the lever" story
  is no longer the right framing after R3a/R10. This Meridian measure shows
  the product rewrite path can fix the mark card under current Production
  (reasoning + spans ON). It does not isolate the span channel. Do not
  close B88 as "spans work" and do not spend on span rebuilds on the basis
  of this one draft. Close the "NEEDS RE-ASSESSMENT" by recording this
  measure; keep residuals (marker honesty, revision instability) as their
  own items if tracked separately.

Do not generalise from Meridian to claim-span-heavy drafts.
  This draft has few short phrase spans and one whole-statement strip.
  claim-spans CS_E3 and corpus E3:S0:ic_memo were not run.
```

### What a user would notice

Clicking Suggest revised draft on a sentence claiming a fund returned 1.9
times now produced a sentence that says it is marked at 1.9 times, keeping
both figures. Second Review cleared that card. That is the user-visible win
this feature has rarely delivered.
