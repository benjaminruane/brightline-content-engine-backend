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

## Part 2. Not requested is its own state. B294. (not yet built)

Will stamp `cardTone` next to the existing `summaryClass` classes at the same `classifyCard` call. Footer and counts will ignore `null` (not requested). `notChecked` stays not clean. Confirm B202 still holds.

## Part 3. One vocabulary. B295. (not yet built)

Proposed three phrasings, checked against B194. Blank sheet. Not copied from the spec prompt.

| State | Phrase | Why |
|-------|--------|-----|
| Requested and clean | **Clean** | Already on the footer and on completed rows. B194 did not rename it. |
| Requested and did not complete | **Not checked** | B194 and B202 already use this for a schema miss. QRS and the filter already say Not checked. "Needs manual review" and "Not reviewed" for the same hole go. Expanded body can still say the check could not be completed. |
| Not requested | **(no row, not in the footer)** | A grey "Not reviewed" row looks like a hole. A Clean tick looks like work. Omitting is the only wording that is neither alarm nor credit. |

**3.3 Greyed row vs omit.**

Greyed row: the reader sees that Editorial exists as a check. Cost: A and B look unfinished after the reviewer switched those checks off. That is the photo.

Omit: switched-off checks disappear. Cost: a reader who forgot they turned a check off will not be reminded on the card. The review-options control already holds that choice. QRS already drops off-check counts (`editorial: null` when off).

Pick: **omit**. The reader must never think a switched-off check ran, and must never be alarmed by one they turned off.

## Part 4. Colour. B296. (not yet built)

Border reads `summaryClass.cardTone`. `deriveTintClass` becomes a display map of that stamp, not a severity walk of raw verdicts.

A/B: evidence `confirmed`, editorial `null`, compliance `null` -> green.

D, recovered: evidence `null`, editorial `clean`, compliance `null` -> green. Spec 4.4 said D must not be green on the premise that the only performed check did not run. The payload says editorial *did* run and was clean. 4.2 and 4.3 win: a card is as green as the requested checks that completed, and never green when a requested check is `notChecked`. **AMEND 4.4.** D's real bugs are the Compliance/Source recency/Framing Clean names, not the green from a clean editorial check. After the footer fix D names only Editorial (and nothing unrun).

C: evidence `partial`, editorial `notChecked`, compliance `clean` -> amber.

## Part 5. Retry. B297. (not yet built)

"The review did not run." gains Retry. Same draft and sources. No clear. No loop.

## Cost so far

Part 1: no Review. Langfuse read only. USD 0.0000.
