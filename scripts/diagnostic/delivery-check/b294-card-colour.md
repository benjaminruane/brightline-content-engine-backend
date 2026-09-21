# B294-B297. Card colour, not-requested vs failed, Retry

Date: 2026-09-21. Part 1 is read-only. Parts 2 to 5 follow after this file is committed.

Kill condition: if Q6 needs a data-contract change, stop and report the shape before making it.

No em or en dashes. ASCII hyphen and period only.

---

## Scoreboard (Part 1)

| Q | Verdict | Status |
|---|---------|--------|
| Q1 Recover four card payloads and reviewOptions | Four photographed cards map to three Meridian `qc-run` traces after credits were restored. HTTP bodies were not stored. Stages that ran, and raw editorial/compliance outputs, are from Langfuse. | CONFIRMED traces; HYPOTHESIS on assembled `qcCard` field values via the code path each run took |
| Q2 Card C editorial ON-and-failed vs OFF | (a). Editorial was ON. The statement-1 editorial call returned no output. | CONFIRMED |
| Q3 Same run, two wordings for one state | FALSE as a same-run fact. A/B are not C's run. The raw `editorialVerdict` slug still collapses later (Q6). | CONFIRMED |
| Q4 Left border colour | Frontend `deriveVerdictToneFromQcCard` / `deriveTintClass`. Not `classifyCard`. Second colour calculation. | CONFIRMED |
| Q5 Clean footer | Frontend list. Does not require the named check to have been requested. Card D named Compliance without a compliance call. | CONFIRMED |
| Q6 Distinct fields for off vs hole | Raw verdicts collapse. `summaryClass` already distinguishes (`null` vs `notChecked`). Display ignores it for colour, rows, and footer. | CONFIRMED. Kill does not fire. Shape of the additive stamp is below. |

Ids used: **B294, B295, B296, B297**. Next free after B293.

---

## Part 1. Diagnostic

### Production window

Credits were exhausted earlier on 20 September (B291). After restore, Langfuse has six Meridian traces, all `draftHash=c6bdb745`, 1128 draft characters, source label `Meridian test source.txt`, pipeline v4.

| Time (UTC) | Trace | Stages that ran | Inferred reviewOptions | Langfuse USD |
|------------|-------|-----------------|------------------------|-------------:|
| 14:54:56 | `d5c2d4d8-14c4-4982-97b9-8c29e02a0432` | Stage 1, 1b, 2, 5. No editorial. No compliance. | evidence ON, editorial OFF, compliance OFF | 0.132 |
| 14:55:46 | `ef329263-548c-4aad-a47a-ee390bf3ee21` | Stage 1 + 7 editorial-style-review. No Stage 2/5. No compliance. | evidence OFF, editorial ON, compliance OFF | 0.188 |
| 14:57:23 | `fc12b734-321e-4886-baa3-b2d8327cca1b` | Stage 1 + 7 qc-compliance-review. No editorial. No evidence match. | evidence OFF, editorial OFF, compliance ON | 0.054 |
| 14:58:01 | `7941635e-a83c-4ec7-9704-7db97741ca09` | Stage 1, 1b, 2, 5. No editorial. No compliance. | evidence ON, editorial OFF, compliance OFF | 0.141 |
| 15:00:24 | `a1f49a63-22a9-493a-8d05-36da89c87815` | Stage 1 only, 330 ms, 0 tokens. | failed start | 0 |
| 15:00:44 | `19048b74-0cb2-4f4d-8e1a-bb826ce2ce4d` | Stage 1, 1b, 2, 5, 7 editorial, 7 compliance | all ON | 0.347 |

Langfuse does not store the `analyse-statements` HTTP body or the assembled `qcCard`. Trace `input` and `output` are null. CONFIRMED by fetching `/api/public/traces/{id}`. Statement texts from Stage 1 on `d5c2d4d8`:

| Index | Sentence (truncated) | Photo |
|------:|----------------------|-------|
| 1 | The fund intends to build a portfolio of 10-14 control-oriented... | C |
| 2 | Target companies are expected to have enterprise valuations... | B and D |
| 4 | Furthermore, Partners Group has a long-established relationship... | A |

`review_state` was not read. The local `DATABASE_URL` has previously failed authentication (B103). The six traces are the live record of what ran.

### Q1. Which run, which options

**Cards A and B. Trace `d5c2d4d8` (14:54:56Z), evidence-only.** A second evidence-only run 50 seconds later (`7941635e`) has the same options and the same confirmed verdicts on statements 2 and 4. The photos match the first run.

- Statement 4 (A): Stage 5 metadata `verdict=confirmed`.
- Statement 2 (B): Stage 5 metadata `verdict=confirmed`.
- Editorial: not requested. No `editorial-style-review` observations.
- Compliance: not requested. No `qc-compliance-review` observations.
- Screen: Evidence Confirmed, Editorial Not reviewed, Compliance Not reviewed, footer `Clean: Source recency, Framing`, amber left border.

That screen is what `StatementReviewCard.jsx` does when `reviewOptions.editorialEnabled === false` and `complianceEnabled === false`: grey `Not reviewed` rows, and those names stay out of the Clean footer. Source recency and Framing are listed because empty arrays count as clean with no request check.

**Card C. Trace `19048b74` (15:00:44Z), all checks on.**

- Statement 1: Stage 5 `verdict=partially_confirmed`. Matches "Evidence Partially confirmed".
- Editorial: requested. Observation for statement 1 exists (`e69ce538-c420-45a9-9006-fca1ea2e0406`), 228 ms, 0 tokens, `output: null`. The other six editorial calls on that run returned JSON.
- Compliance: requested. Statement 1 returned `{"violations":[]}`.

**Card D. Trace `ef329263` (14:55:46Z), editorial only, evidence off.**

- Statement 2: no Stage 2/5. `buildSkippedEvidenceQcCard` writes `displayVerdict: "Not reviewed"`. Matches Evidence Not reviewed.
- Editorial: requested and completed. Raw output `{"concerns":[],"verdict":"clean","verdictNote":""}`.
- Compliance: not requested. No compliance observations.

The photo's missing Editorial row matches a completed clean editorial check (row hidden, name goes to the footer). The green left border matches `deriveTintClass` seeing `editorialVerdict: "clean"` as green while skipped evidence contributes no severity.

The photo also names Compliance in the Clean footer and shows no Compliance row. On this run compliance was off. The honest screen is a grey Compliance `Not reviewed` row and no Compliance in the footer. Two ways that photo can still happen, both CONFIRMED in code:

1. `complianceClean = complianceEnabledOnRun && complianceCount === 0` (`StatementReviewCard.jsx` L461). `complianceEnabledOnRun` is `ro?.complianceEnabled !== false`. A missing key is treated as on. A skipped-path card with `complianceVerdict` cleared to `null` then looks clean.
2. Empty `sourceRecencyConcerns` / `framingFidelityConcerns` are always appended as Clean. A reader listing four names can include Compliance by the same pattern.

Q1 does not treat 1 as proven for this payload, because Langfuse does not keep `meta.reviewOptions`. The frontend always sends all three booleans (`useDraftState.jsx` L892-894). If that payload landed, D's Compliance line is a grey `Not reviewed` row and the photo over-reports the footer. Either way, Compliance was **not requested** on D and must not be named clean.

### Q2. Card C: (a) or (b)

**(a). Editorial was ON and the check did not complete for that statement.**

CONFIRMED:

- The all-on trace has seven `editorial-style-review` observations. Statement 1 is one of them.
- That observation: `latencyMs: 228`, `usage.total: 0`, `calculatedTotalCost: null`, `output: null`.
- `editorial-compliance-reviewer.mjs` L2234-2235: if the settled value has no string `editorialVerdict`, the card is stamped `not_reviewed`.
- The expanded copy "The editorial check could not be completed for this statement. Please review it manually." is only rendered when `editorialEnabledOnRun && editorialVerdict === "not_reviewed"` (`StatementReviewCard.jsx` L457, L1190-1194).

Quoted from the recovered observation, not from a stored qcCard:

- `editorialVerdict` on the card: **`not_reviewed`** (code path). The HTTP card was not stored.
- `editorialNotReviewedReason`: **absent**. `markEditorialNotReviewed` only writes a reason when it is a non-empty string (`editorial-compliance-reviewer.mjs` L1578-1580). The null-output path uses the `typeof result?.editorialVerdict === "string"` fallback, not `stampNotReviewedFromFailure`, so `rate_limit_window` is not applied. 0 tokens in 228 ms is not a billed 429 window.

(b) is false. An off check never produces the "Needs manual review" row. Off uses `editorialSkippedOnRun` and the grey `Not reviewed` label (`StatementReviewCard.jsx` L1165-1169).

### Q3. Same state, two wordings, same run?

**No. A and B are not from C's run.**

A/B: `d5c2d4d8`, editorial off. C: `19048b74`, editorial on and incomplete.

They are not the same underlying *choice*. They currently share the same *stored slug* once assembly has run: `editorialVerdict: "not_reviewed"` (B247 for off; B202 for a requested miss). Display then splits on `reviewOptions`:

| Path | File | Condition | Wording |
|------|------|-----------|---------|
| Switched off | `StatementReviewCard.jsx` L1165-1169 | `ro?.editorialEnabled === false` | grey row `Not reviewed` |
| Requested, did not complete, collapsed | `StatementReviewCard.jsx` L479-480, L1181 | enabled and `editorialVerdict === "not_reviewed"` | `Needs manual review` |
| Same hole, results-screen claim helper | `src/utils/resultsScreenClaims.js` L46-49 | same split | `Not reviewed` if off, `Needs manual review` if on and `not_reviewed` |
| QRS / filter | `lib/qc/review-summary.mjs` `classifySignal`; `qcWorkbenchFilters.js` | enabled and `not_reviewed` | `notChecked` / filter label `Not checked` |

Q3's "one-vocabulary breach on the same run" is FALSE. The B194 problem that remains is Q6: one slug for two states, plus three user-facing phrases (`Not reviewed`, `Needs manual review`, `Not checked`) for the hole. Part 3 fixes that.

### Q4. Left border colour

**Frontend. Separate calculation. Not `classifyCard`.**

File: `src/components/draft/deriveTintClass.js`.

Expression, card:

```
deriveVerdictToneFromQcCard(qcCard)
  -> deriveTintClass(qcCard)
  -> worst of severityForEvidence(displayVerdict),
     severityForEditorial(editorialVerdict),
     severityForCompliance(complianceVerdict)
```

Then `StatementReviewCard.jsx` L436-440:

```
verdictBorderToneKey = deriveVerdictToneFromQcCard(qcCard)
cardLeftBorderColor = verdictBorderToneKey != null
  ? getVerdictToneColors(verdictBorderToneKey).border
  : "#e2e8f0"
```

`severityForEditorial`: `clean` is green; `not_reviewed` is yellow (`EDITORIAL_CONCERN_SLUGS` includes `not_reviewed`). It does not read `reviewOptions`. An off check that B247 stamped `not_reviewed` is amber. That is cards A and B: evidence `supported_full` green plus editorial `not_reviewed` yellow. Worst wins amber.

`classifyCard` / `summaryClass` in `lib/qc/review-summary.mjs` is the B194/B245 readiness calculation. Off returns `null` for that signal and does not count it. The border never reads it. Assess draft tints use the same frontend function (`AssessModule.jsx` L150). B245: there may be only one readiness calculation. The border is a second one.

### Q5. Clean footer

**Frontend. Does not check whether the named check was requested, except by the same `!== false` default.**

`StatementReviewCard.jsx` L460-469:

```
editorialClean = editorialEnabledOnRun && !editorialNotReviewed && editorialCount === 0
complianceClean = complianceEnabledOnRun && complianceCount === 0
sourceRecencyClean = sourceRecencyCount === 0
framingFidelityClean = framingFidelityCount === 0
```

`complianceClean` does not look at `complianceVerdict === "not_reviewed"`. A requested compliance miss with an empty concerns array is named Clean. Card C's compliance call did complete with `violations: []`, so naming Compliance clean on C is honest for that statement.

`sourceRecencyClean` and `framingFidelityClean` are true whenever the arrays are empty. Those checks run in Stage 7 assembly, which the evidence-skipped path does not enter. Card D still names them clean.

**Card D named Editorial and Compliance as clean. Were they requested?**

- Editorial: **yes**, and it came back clean. Naming Editorial clean is honest. Hiding the row is the existing clean-row behaviour.
- Compliance: **no**. There is no `qc-compliance-review` on `ef329263`. Naming Compliance clean is false.

### Q6. Does the data model distinguish not-requested from requested-and-incomplete?

**Raw verdicts: no. `summaryClass`: yes. Display: no.**

| State | `editorialVerdict` after assemble (evidence on, B247) | Skipped-evidence path (`clearEditorialQcCard`) | `summaryClass.editorial` | Screen today |
|-------|------------------------------------------------------|-----------------------------------------------|--------------------------|--------------|
| Not requested | `not_reviewed` | `null` | `null` | `Not reviewed` grey row |
| Requested, did not complete | `not_reviewed` | `not_reviewed` | `notChecked` | `Needs manual review` |
| Requested, clean | `clean` | `clean` | `clean` | hidden row, footer Clean |

The two incomplete states collapse to `not_reviewed` on the assembled evidence path. That is the root of A/B amber (colour reads `not_reviewed` as a finding) and of D's false Clean names (display re-derives from `reviewOptions !== false` and empty arrays).

`summaryClass` is already stamped in `api/analyse-statements.js` L367: `classifyCard(card, effectiveReviewOptions)`. `classifySignal` returns `null` when the check is off and `notChecked` when it is on and `not_reviewed`. QRS already uses that. The card rows, footer, and border do not.

**Kill condition.** The distinction can be made without replacing `editorialVerdict`. An additive stamp on the existing `summaryClass` object is enough:

```
summaryClass.cardTone: "green" | "amber" | "red" | "neutral"
```

`cardTone` is derived only from `classifyCard`'s evidence/editorial/compliance classes. Off (`null`) does not vote. `notChecked` cannot make a card green. Confirmed/clean-only requested checks are green. That is not a second readiness calculation.

Changing `null` to a new slug `"not_requested"` would be a data-contract change for every `summaryClass` consumer. Not required. Kill does not fire. Parts 2-5 proceed with the additive `cardTone` key and with the card UI reading `summaryClass` instead of re-deriving from `reviewOptions`.

---

## Part 2. Not requested is its own state. B294. SHIPPED

`classifyCard` is still the one calculation. Additive key `summaryClass.cardTone`. Off remains `null` on that signal. QRS already dropped off checks from counts. CONFIRMED `summariseReview` with editorial and compliance off: `editorial: null`, `notChecked: 0`, `readiness: Ready` (`tests/b294-not-requested.test.mjs`).

A requested miss is still `notChecked`, never clean. CONFIRMED B202 tests still pass. B294 requested-miss case: editorial `notChecked`, `cardTone` amber, readiness `Not fully checked`.

Assemble still stamps `not_reviewed` when the check is off (B247). Display no longer treats that slug as a finding.

Footer: Clean names only `summaryClass === "clean"`. Source recency and Framing only if evidence was requested and completed. Card D can no longer name Compliance, Source recency, or Framing.

## Part 3. One vocabulary. B295. SHIPPED

Phrasings as proposed in Part 1. Shipped:

| State | Phrase | Surfaces |
|-------|--------|----------|
| Requested and clean | Clean | Footer. Not a row. |
| Requested and did not complete | Not checked | Card row, results-screen claim, QRS, filter. Expanded body unchanged in substance. |
| Not requested | omit | No row. Not in the footer. Not in Not checked. |

Greyed-row vs omit: **omit**, as argued above. F24's extra `displayVerdict === "not reviewed"` match is gone so switched-off evidence is not in Not checked. Annotation on the F24 BACKLOG row.

## Part 4. Colour. B296. SHIPPED

`classifyCard` writes `cardTone`. `StatementReviewCard` reads `cardBorderTone(qcCard)` from that stamp. `deriveTintClass` maps `summaryClass.cardTone` only.

Photo mapping after the fix:

| Card | Classes | cardTone |
|------|---------|----------|
| A/B evidence-only confirmed | evidence confirmed, editorial null, compliance null | green |
| C partial + editorial miss + compliance clean | partial, notChecked, clean | amber |
| D editorial-only clean | evidence null, editorial clean, compliance null | green (AMEND 4.4; editorial ran) |

Rule 4.2 holds on the grid: a requested miss is never green. Rule 4.3 holds: `clean | off | off` is green.

### 4.5 Colour grid (150 cells, 0 FAIL)

States: evidence `off/miss/clean/concern/hard/conflict`. Editorial and compliance `off/miss/clean/concern/hard`. Expected is the 4.2/4.3 rule in the test file, not a copy of `cardToneFromClass`.

| evidence | editorial | compliance | expected | actual | result |
|----------|-----------|------------|----------|--------|--------|
| off | off | off | neutral | neutral | PASS |
| off | off | miss | amber | amber | PASS |
| off | off | clean | green | green | PASS |
| off | off | concern | amber | amber | PASS |
| off | off | hard | red | red | PASS |
| off | miss | off | amber | amber | PASS |
| off | miss | miss | amber | amber | PASS |
| off | miss | clean | amber | amber | PASS |
| off | miss | concern | amber | amber | PASS |
| off | miss | hard | red | red | PASS |
| off | clean | off | green | green | PASS |
| off | clean | miss | amber | amber | PASS |
| off | clean | clean | green | green | PASS |
| off | clean | concern | amber | amber | PASS |
| off | clean | hard | red | red | PASS |
| off | concern | off | amber | amber | PASS |
| off | concern | miss | amber | amber | PASS |
| off | concern | clean | amber | amber | PASS |
| off | concern | concern | amber | amber | PASS |
| off | concern | hard | red | red | PASS |
| off | hard | off | red | red | PASS |
| off | hard | miss | red | red | PASS |
| off | hard | clean | red | red | PASS |
| off | hard | concern | red | red | PASS |
| off | hard | hard | red | red | PASS |
| miss | off | off | amber | amber | PASS |
| miss | off | miss | amber | amber | PASS |
| miss | off | clean | amber | amber | PASS |
| miss | off | concern | amber | amber | PASS |
| miss | off | hard | red | red | PASS |
| miss | miss | off | amber | amber | PASS |
| miss | miss | miss | amber | amber | PASS |
| miss | miss | clean | amber | amber | PASS |
| miss | miss | concern | amber | amber | PASS |
| miss | miss | hard | red | red | PASS |
| miss | clean | off | amber | amber | PASS |
| miss | clean | miss | amber | amber | PASS |
| miss | clean | clean | amber | amber | PASS |
| miss | clean | concern | amber | amber | PASS |
| miss | clean | hard | red | red | PASS |
| miss | concern | off | amber | amber | PASS |
| miss | concern | miss | amber | amber | PASS |
| miss | concern | clean | amber | amber | PASS |
| miss | concern | concern | amber | amber | PASS |
| miss | concern | hard | red | red | PASS |
| miss | hard | off | red | red | PASS |
| miss | hard | miss | red | red | PASS |
| miss | hard | clean | red | red | PASS |
| miss | hard | concern | red | red | PASS |
| miss | hard | hard | red | red | PASS |
| clean | off | off | green | green | PASS |
| clean | off | miss | amber | amber | PASS |
| clean | off | clean | green | green | PASS |
| clean | off | concern | amber | amber | PASS |
| clean | off | hard | red | red | PASS |
| clean | miss | off | amber | amber | PASS |
| clean | miss | miss | amber | amber | PASS |
| clean | miss | clean | amber | amber | PASS |
| clean | miss | concern | amber | amber | PASS |
| clean | miss | hard | red | red | PASS |
| clean | clean | off | green | green | PASS |
| clean | clean | miss | amber | amber | PASS |
| clean | clean | clean | green | green | PASS |
| clean | clean | concern | amber | amber | PASS |
| clean | clean | hard | red | red | PASS |
| clean | concern | off | amber | amber | PASS |
| clean | concern | miss | amber | amber | PASS |
| clean | concern | clean | amber | amber | PASS |
| clean | concern | concern | amber | amber | PASS |
| clean | concern | hard | red | red | PASS |
| clean | hard | off | red | red | PASS |
| clean | hard | miss | red | red | PASS |
| clean | hard | clean | red | red | PASS |
| clean | hard | concern | red | red | PASS |
| clean | hard | hard | red | red | PASS |
| concern | off | off | amber | amber | PASS |
| concern | off | miss | amber | amber | PASS |
| concern | off | clean | amber | amber | PASS |
| concern | off | concern | amber | amber | PASS |
| concern | off | hard | red | red | PASS |
| concern | miss | off | amber | amber | PASS |
| concern | miss | miss | amber | amber | PASS |
| concern | miss | clean | amber | amber | PASS |
| concern | miss | concern | amber | amber | PASS |
| concern | miss | hard | red | red | PASS |
| concern | clean | off | amber | amber | PASS |
| concern | clean | miss | amber | amber | PASS |
| concern | clean | clean | amber | amber | PASS |
| concern | clean | concern | amber | amber | PASS |
| concern | clean | hard | red | red | PASS |
| concern | concern | off | amber | amber | PASS |
| concern | concern | miss | amber | amber | PASS |
| concern | concern | clean | amber | amber | PASS |
| concern | concern | concern | amber | amber | PASS |
| concern | concern | hard | red | red | PASS |
| concern | hard | off | red | red | PASS |
| concern | hard | miss | red | red | PASS |
| concern | hard | clean | red | red | PASS |
| concern | hard | concern | red | red | PASS |
| concern | hard | hard | red | red | PASS |
| hard | off | off | red | red | PASS |
| hard | off | miss | red | red | PASS |
| hard | off | clean | red | red | PASS |
| hard | off | concern | red | red | PASS |
| hard | off | hard | red | red | PASS |
| hard | miss | off | red | red | PASS |
| hard | miss | miss | red | red | PASS |
| hard | miss | clean | red | red | PASS |
| hard | miss | concern | red | red | PASS |
| hard | miss | hard | red | red | PASS |
| hard | clean | off | red | red | PASS |
| hard | clean | miss | red | red | PASS |
| hard | clean | clean | red | red | PASS |
| hard | clean | concern | red | red | PASS |
| hard | clean | hard | red | red | PASS |
| hard | concern | off | red | red | PASS |
| hard | concern | miss | red | red | PASS |
| hard | concern | clean | red | red | PASS |
| hard | concern | concern | red | red | PASS |
| hard | concern | hard | red | red | PASS |
| hard | hard | off | red | red | PASS |
| hard | hard | miss | red | red | PASS |
| hard | hard | clean | red | red | PASS |
| hard | hard | concern | red | red | PASS |
| hard | hard | hard | red | red | PASS |
| conflict | off | off | red | red | PASS |
| conflict | off | miss | red | red | PASS |
| conflict | off | clean | red | red | PASS |
| conflict | off | concern | red | red | PASS |
| conflict | off | hard | red | red | PASS |
| conflict | miss | off | red | red | PASS |
| conflict | miss | miss | red | red | PASS |
| conflict | miss | clean | red | red | PASS |
| conflict | miss | concern | red | red | PASS |
| conflict | miss | hard | red | red | PASS |
| conflict | clean | off | red | red | PASS |
| conflict | clean | miss | red | red | PASS |
| conflict | clean | clean | red | red | PASS |
| conflict | clean | concern | red | red | PASS |
| conflict | clean | hard | red | red | PASS |
| conflict | concern | off | red | red | PASS |
| conflict | concern | miss | red | red | PASS |
| conflict | concern | clean | red | red | PASS |
| conflict | concern | concern | red | red | PASS |
| conflict | concern | hard | red | red | PASS |
| conflict | hard | off | red | red | PASS |
| conflict | hard | miss | red | red | PASS |
| conflict | hard | clean | red | red | PASS |
| conflict | hard | concern | red | red | PASS |
| conflict | hard | hard | red | red | PASS |

## Part 5. Retry. B297. SHIPPED

`The review did not run.` has a Retry control beside it. Click calls `confirmReviewOptionsModal`, which runs `runStatementAnalysis` on the current version and draft. Sources stay on the request payload. The catch path keeps `ok: false` and the same copy, so Retry remains. No timer. Tests `tests/b296-card-colour-retry.test.mjs`.

Local browser: Retry is a failed-review surface. I did not run a live Review to force `ok: false`. Verified from the panel source and the test. Production Review below is the normal path.

## Production Review

Two POSTs to production `analyse-statements`, Meridian 7-statement draft, all checks on, source `meridian_production_source.txt`.

1. Trace `c42fa1b6-6f59-44cc-905c-05bef62ae7b4`, wall 18179 ms, HTTP 200. Landed before the `74e75c9` deploy. `summaryClass.cardTone` absent. Extract `scripts/diagnostic/delivery-check/b294-runs/production-extract.json`.
2. Trace `b9543423-8b3d-4466-8b2f-5e2238701784`, wall 14331 ms, HTTP 200. After deploy. `cardTone` stamped on every card. Extract `scripts/diagnostic/delivery-check/b294-runs/production-extract-2.json`.

After deploy, the photographed sentences:

| Index | Sentence | Classes | cardTone |
|------:|----------|---------|----------|
| 1 | fund intends 10-14 (photo C) | partial, clean, clean | amber |
| 2 | Target companies (photo B/D) | confirmed, clean, clean | green |
| 4 | Furthermore (photo A) | confirmed, clean, clean | green |

This run had all checks on, so it is not the evidence-only photo of A/B. The A and B sentences are green when the requested checks completed clean. Evidence-only green is the grid cell `clean | off | off`. Photo C's editorial miss did not recur; editorial completed clean. 0 `notChecked`.

Local `localhost:5173` was not running (connection refused). Retry was not clicked in a browser. Card colour on the live UI was not walked with this payload. Proof is the stamped `cardTone` plus the 150-cell grid.

## Cost

| Pass | List USD | Discounted USD | Calls | Unpriced |
|------|--------:|---------------:|------:|---------:|
| Part 1 Langfuse read | 0.0000 | 0.0000 | 0 | 0 |
| Implementation | 0.0000 | 0.0000 | 0 | 0 |
| Production POST 1 (pre-deploy) | 0.2976 | 0.1923 | 43 | 0 |
| Production POST 2 (cardTone live) | 0.2288 | 0.0552 | 42 | 0 |
| **Total this spec** | **0.5265** | **0.2476** | **85** | **0** |

List from `meta.llmSpend.costUsd`. Discounted = list minus gpt-4o `cachedInputTokens * 1.25 / 1e6` (run 1 cached 84,224; run 2 cached 138,880). Mini cache 0. Unpriced 0.
