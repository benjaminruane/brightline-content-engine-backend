# B298-B300. A turned-off check says so, an absent setting is not a run, a hole records why

Date: 2026-09-21. Ben's ruling amending B295 Part 3.3: hiding a switched-off check looks like something was missed. A switched-off check must be visible and must say it was switched off.

No em or en dashes. ASCII hyphen and period only.

Kill condition: none. No verdict logic change. No second readiness calculation.

---

## Card grammar (kept, then extended)

The card already had a grammar. B298 writes it down and adds one line. Evidence rule: it is not "rows are things to look at".

ROWS
  Evidence, ALWAYS, whenever it was requested, whatever the verdict. The row carries the excerpt and the commentary and the reader wants those on a confirmed claim as much as on a failed one. Evidence therefore NEVER appears in the clean line.
  Editorial or compliance when there is a concern, or when the check was REQUESTED and did not complete.

CLEAN LINE
  Editorial or compliance that RAN and found nothing, plus source recency and framing. Green tick. Unchanged.

NEW LINE
  Any check that was NOT REQUESTED, including evidence when evidence is off.

---

## Part 1. A turned-off check says so. B298. Frontend.

### 1.1 Placement

The new line sits in the footer band of `StatementReviewCard.jsx`, below the Clean line, never inside it. The Clean tick still means "we checked and it is fine". A not-requested check never joins that list.

### 1.2 Icon

Chosen mark: `⊘` (U+2298, circled division slash), rendered `text-slate-400`.

Why: it is not a tick (a tick would claim the check ran and passed) and it is not a coloured status dot (a dot would look like a verdict). Slate-400 keeps it in the footer band without competing with the green Clean tick.

Constant: `TURNED_OFF_ICON` in `src/modules/drafting/checkStateDisplay.js`.

### 1.3 Wording

Ben's anchor, kept:

`Turned off for this run: Editorial review, Compliance review.`

One line for every check that was not requested, names joined with ", ", trailing period. Display names are the same three as QRS: Evidence review, Editorial review, Compliance review. Prefix `Turned off for this run`. Backend stamps the same string on `summaryClass.turnedOffLine`; the card prefers that stamp.

### 1.4 When it appears

Only when at least one of `summaryClass.evidence`, `.editorial`, `.compliance` is `null`. A run with everything on has no line and looks as it did yesterday.

### 1.5 Colour

Unchanged. Off is `null` and does not vote. B294 stands. `cardTone` is still the backend stamp.

### 1.6 A requested miss stays a row

`notChecked` is a row label "Not checked". It is never folded into the footer line. Confirmed by `tests/b298-turned-off-line.test.mjs`.

### 1.7 Skipped-evidence path

When evidence is off, `classifyCard` returns `evidence: null`. There is no evidence row (`evidenceRowLabel` returns null). Evidence is named on the new line: `Turned off for this run: Evidence review.` Confirmed in the same test file. `buildSkippedEvidenceQcCard` still writes `displayVerdict: "Not reviewed"` on the payload; classification ignores that when the check was not requested.

---

## Part 2. The same wording everywhere. B298.

The string is produced once, in `lib/qc/review-summary.mjs` `turnedOffLineFromClass`, and stamped on `summaryClass.turnedOffLine`. Every surface reads that stamp.

| Surface | Reader |
|---------|--------|
| Card footer | `turnedOffLineOf(qcCard)` in `StatementReviewCard.jsx` |
| Results-screen claim helper | `card.turnedOffLine` from `collectResultsScreenClaims` |
| Export text and DOCX | `row.turnedOffLine` from `buildReviewData` / `renderCanonicalExportText` / `api/export.js` |

Before this spec the export dropped a turned-off check entirely (no note, no distinction from a clean check that produced no note). That is the same defect as the hidden row. The export now writes the identical line under the statement.

Frontend tests: `tests/b298-turned-off-line.test.mjs`. Backend coverage in `tests/b299-absent-setting.test.mjs` and `tests/b245-export-and-payloads.test.mjs`.

---

## Part 3. A missing setting never means the check ran. B299. Backend.

### 3.1 The defect

`asOptions` used `src.evidenceEnabled !== false` (and the same for editorial and compliance). An absent key read as REQUESTED. That is the pattern that made Card D name Compliance clean on a run with no compliance call (B294 Part 1 Q5). `classifyCard` is now the authoritative calculation for colour; the same default would still lie.

### 3.2 What absent means

The HTTP writer always emits all three booleans. The caller (the Review modal) always sends them. An absent or non-boolean key at the writer is a bug in the caller.

Decision, made explicit:

- Writer `resolveReviewOptionsFromBody` (`lib/qc/review-options.mjs`): log `[REVIEW_OPTIONS] <key> is absent` or `non-boolean (<type>)`, stamp `false`. P31. Loud at the writer, not defaulted on.
- Reader `asReviewOptions`: `=== true` only. Absent, null, `"true"`, `1`, missing object: not requested.
- `classifyCard` uses that reader. An absent key cannot be clean.

The entire `reviewOptions` object missing on `assembleCard` is a separate case. `reviewEnabled` returns `null` when the object is absent, and `safeEditorialDefaults` still writes `clean` for that null. That path is v3 (`qc-pipeline-v3.mjs` calls `assembleCard(entry, index)` with no options) and older tests that never pass options. Production v4 always passes the three booleans from the writer. Not changed. Reported here so it is not silent.

### 3.3 Sweep of `!== false` in both repos

Every hit. Check-ran readers were changed to `=== true`. The rest were left because they are not "did this check run".

#### Backend. Changed (check-ran readers)

| File | What it was | What it is now |
|------|-------------|----------------|
| `lib/qc/review-summary.mjs` `asOptions` | `!== false` | `asReviewOptions` (`=== true`) |
| `lib/qc/pipeline-v4/index.mjs` `resolveReviewToggles` | `!== false` | `=== true` |
| `lib/qc/pipeline-v3/stage7-assemble-card.mjs` `reviewEnabled` | `!== false` when object present | `opts[key] === true` |
| `lib/qc/editorial-compliance-reviewer.mjs` | `documentContext.editorialEnabled !== false` (and compliance) | `=== true` |
| `lib/qc/constructive-feedback.mjs` | `!== false` on the three flags | `asReviewOptions` |
| `api/synthesize-review.js` | `!== false` | `asReviewOptions` |
| `api/constructive-feedback.js` | same | `asReviewOptions` |
| `lib/qc/export-review-data.mjs` | `!== false` | `asReviewOptions` |
| `lib/qc/evidence-skipped-fast-path.mjs` | `!== false` | `asReviewOptions` |
| `scripts/diagnostic/noise-floor/score-category-noise-floor.mjs` | `!== false` | `asReviewOptions` |
| `api/analyse-statements.js` | inline `!== false` | writer `resolveReviewOptionsFromBody` |

#### Backend. Left (not check-ran)

| File | Pattern | Why left |
|------|---------|----------|
| `lib/qc/claim-validation.mjs` | `claim.isCheckable !== false` | Claim flag, not a review toggle |
| `lib/qc/pipeline-v4/stage1-extract-statements.mjs` | `isClaim !== false` | Extractor classification |
| `lib/qc/constructive-feedback.mjs` | `forbidInventedCraft !== false` | Prompt constraint, not a check toggle |
| `scripts/run_qc_regression.mjs` | `hasUsableExcerpt !== false` | Fixture assertion |
| `scripts/diagnostic/backstop-needed/run.mjs` | `schemaValid !== false` | Diagnostic match filter |
| `scripts/diagnostic/r7-extractor-check2.mjs` | `old?.ok !== false` | Diagnostic comparison |

#### Frontend. Changed (check-ran readers)

| File | What it was | What it is now |
|------|-------------|----------------|
| `src/utils/summariseReview.js` `asOptions` | `!== false` | `=== true` |
| `src/modules/drafting/StatementAnalysisPanel.jsx` | `result.meta.reviewOptions` used `!== false` | `=== true` when meta is present |
| `src/modules/drafting/actionListDisplay.js` | `!== false` | `=== true` |
| `src/utils/reviewerSynthesisPayload.js` | `!== false` | `=== true` |

The card does not re-derive. It reads `summaryClass`.

#### Frontend. Left (session UI defaults, not check-ran)

These decide how the Review modal and session persistence look *before* a run, not whether a finished card treats a check as having run. Initial `qcSessionMeta` is all `true`. An absent key in an old session still shows the switch as on, which is "nothing chosen yet, default on", not "this check ran".

| File | Pattern | Why left |
|------|---------|----------|
| `src/components/modals/ReviewOptionsPopup.jsx` | `qcSessionMeta?.evidenceEnabled !== false` (and editorial, compliance) | Switch default before the user has a run |
| `src/hooks/useAssessState.jsx` | same, session write | Persist last choice; absent means the default on |
| `src/hooks/useDraftState.jsx` | same | Same |
| `src/modules/drafting/StatementAnalysisPanel.jsx` | session fallback when `result.meta.reviewOptions` is missing | Pre-run UI only. Once meta exists, `=== true` |

#### Frontend. Left (not check-ran at all)

| File | Pattern | Why left |
|------|---------|----------|
| `src/components/revision/SuggestRevisionModal.jsx` | `ok !== false` | Suggest response |
| `src/layout/FocusWritingLayout.jsx` | `leftRail !== false` | Layout flag |

### 3.4 Absent-key tests

`tests/b299-absent-setting.test.mjs`:

- empty object and `undefined` are all off
- `classifyCard` on a clean-looking card with `{}` is `null` / `null` / `null`, tone `neutral`, turned-off line names all three
- `{ evidenceEnabled: true }` does not default editorial or compliance on
- writer logs `[REVIEW_OPTIONS] <key> is absent` and stamps false
- explicit `false` is quiet
- non-boolean (`"true"`, `1`, `null`) is loud and not requested

Existing tests that passed `{}` meaning "all checks on" (`tests/constructive-feedback.test.mjs`, frontend `tests/action-list-display.test.mjs`) now send the three booleans. Empty object is off, not on.

---

## Part 4. A failed check records why. B300. Backend.

### 4.1 Every hole has a reason

`markEditorialNotReviewed` and `markComplianceNotReviewed` take a reason on every path. `requireNotReviewedReason` logs and stamps `unspecified` if a caller forgets. No unexplained holes.

### 4.2 Reason vocabulary

Defined in `lib/qc/not-reviewed-reason.mjs` as `NOT_REVIEWED_REASONS`:

| Slug | When |
|------|------|
| `rate_limit_window` | `RateLimitBoundError` (already B291 for the bound) |
| `schema_invalid` | Response failed schema validation on both attempts, and at least one attempt had non-empty text |
| `empty_completion` | Both schema attempts returned empty or whitespace text |
| `thrown_call` | `callLLM` threw, and it is not a bound and not a zero-token failure |
| `zero_token_failure` | Thrown call, wall under 1000 ms, and usage is missing or both token counts are 0 |
| `empty_result` | Settled value has no string verdict after a successful-looking call |
| `missing_provider_key` | `hasProviderApiKey` is false when the check was requested |
| `unspecified` | Guard only. Writer forgot a reason. Logged. Must not be the planned path |

### 4.3 Carried on the card and the payload

`editorialNotReviewedReason` / `complianceNotReviewedReason` are written on the in-progress `qcCard` and copied by `assembleCard` onto the assembled card. They therefore sit in the analyse-statements payload.

### 4.4 Not shown to the reviewer

The card still says the check could not be completed and to review it manually. The slug is not rendered. Frontend grep finds the field only in QRS bound-hit counting (`isRateLimitWindowReason`), not on the card body.

### 4.5 Log once per statement

`[CHECK_NOT_REVIEWED] { kind, statementIndex, reason, requestId }`. `requestId` is taken from `x-request-id` / `request-id` headers, or `requestId` / `id` on the error or raw provider body. `callLLM` now stamps `latencyMs` and `requestId` on thrown errors so the hole path can see them.

### 4.6 The 20 September 228 ms, 0-token, null-output editorial call

B294 Part 1 Q2: statement 1 on trace `19048b74`, observation `e69ce538-c420-45a9-9006-fca1ea2e0406`, 228 ms, 0 tokens, `output: null`. The card said the check could not be completed. Nothing recorded why.

That is not a schema rejection. Schema validation runs on a returned `text`. A schema miss still has a completion (and almost always prompt tokens). It is not `empty_completion` either: that path is `callLLM` returning `{ text: "" }`, which still billed the prompt.

It is a thrown `callLLM` that never produced usage: wall 228 ms (< 1 s), zero tokens. Named `zero_token_failure`. After this spec that hole stamps `editorialNotReviewedReason: "zero_token_failure"` and logs `[CHECK_NOT_REVIEWED]` with the provider request id when one exists.

Tests: `tests/b300-not-reviewed-reasons.test.mjs`.

---

## Eyes on the screen

Local assess, `http://localhost:5173/assess`, header pill **v4** grey, Backend: Up, build `c846d84`.

Cheapest state that shows the line: Meridian draft plus `Meridian test source.txt`, Review with Evidence on, Editorial off, Compliance off. Local replay of a stamped evidence-only payload (no billed Review for the screenshot). One real Review is the production POST below.

**SAW**, Furthermore card (confirmed evidence):

- Evidence row: Confirmed. Excerpt and commentary remain on the row. Not moved into Clean.
- Clean line: `Clean: Source recency, Framing`. Green tick. Editorial and Compliance are not in that list.
- New line below Clean: `⊘ Turned off for this run: Editorial review, Compliance review.`
- Left border green. Off did not vote.
- QRS: Needs work (two claims with no source, three partial). Reviewer assessment: "The assessment could not be written this time." (evidence-only, no editorial notes for synthesis.)

Screenshot: `scripts/diagnostic/delivery-check/b298-runs/furthermore-turned-off.png`

A run with everything on was not re-photographed. The line is omitted when every class is non-null; tests cover that.

---

## Production Review

Two evidence-only Meridian POSTs to `https://brightline-content-engine-backend.vercel.app/api/analyse-statements`. Same draft as B294. Evidence on, editorial off, compliance off.

**First POST**, before `6bc97cf` reached production. Trace `1c47c5df-fff4-4d2a-8b59-0c443321bdab`. HTTP 200, wall 15160 ms, v4, 7 cards. `cardTone` already green. `turnedOffLine` absent. Extract `scripts/diagnostic/delivery-check/b298-runs/production-extract-before.json`.

**Second POST**, after deploy. Trace `1d62d0cb-b2ae-4bd3-a2ff-80a31c2e9ee8`. HTTP 200, wall 13551 ms, v4, 7 cards. Furthermore (`supported_full`): `summaryClass.cardTone` green, `editorial` null, `compliance` null, `turnedOffLine` `Turned off for this run: Editorial review, Compliance review.` `editorialNotReviewedReason` and `complianceNotReviewedReason` are null (off is not a hole). QRS Needs work. Extract `scripts/diagnostic/delivery-check/b298-runs/production-extract.json`. Full payload `production-review.json`.

The screenshot of the card is the local assess pass above. Production confirms the stamp on the payload. Frontend production was not re-photographed; the local screen is the eyes-on-screen proof this spec required.

---

## Cost

| Pass | List USD | Notes |
|------|---------:|-------|
| Local screenshot (stamped replay) | 0.0000 | No LLM. |
| Targeted tests | 0.0000 | |
| Production evidence-only Meridian, before deploy | 0.1226 | Trace `1c47c5df`. No `turnedOffLine`. |
| Production evidence-only Meridian, after deploy | 0.1058 | Trace `1d62d0cb`. Line present on every card. |

TOTAL COST OF THIS SPEC IN USD: **0.23** list (0.13 discounted). Two 7-card evidence-only POSTs, 58 calls, 0 unpriced. Discounted uses gpt-4o cachedInputTokens 31,360 + 44,672 at 1.25/1e6.

---

## Files

Backend: `lib/qc/review-options.mjs`, `lib/qc/not-reviewed-reason.mjs`, `lib/qc/review-summary.mjs`, `lib/qc/editorial-compliance-reviewer.mjs`, `lib/qc/pipeline-v3/stage7-assemble-card.mjs`, `lib/qc/pipeline-v4/index.mjs`, `lib/qc/export-review-data.mjs`, `lib/qc/evidence-skipped-fast-path.mjs`, `lib/qc/constructive-feedback.mjs`, `lib/observability.js`, `api/analyse-statements.js`, `api/export.js`, `api/synthesize-review.js`, `api/constructive-feedback.js`, `tests/b299-absent-setting.test.mjs`, `tests/b300-not-reviewed-reasons.test.mjs`.

Frontend: `src/modules/drafting/checkStateDisplay.js`, `src/modules/drafting/StatementReviewCard.jsx`, `src/utils/resultsScreenClaims.js`, `src/utils/summariseReview.js`, `src/utils/reviewerSynthesisPayload.js`, `src/modules/drafting/actionListDisplay.js`, `src/modules/drafting/StatementAnalysisPanel.jsx`, `tests/b298-turned-off-line.test.mjs`.
