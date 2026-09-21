# B301-B303. Why the Reviewer Assessment was empty

Date: 2026-09-21. Part 1 is read-only. Parts 2 to 4 follow after this file is committed.

No em or en dashes. ASCII hyphen and period only.

Kill condition: if the blank-finding guard never fires on real reviews and the screenshot was purely a replay artefact, say so plainly, do Parts 3 and 4 anyway, and do not change the guard.

---

## Scoreboard (Part 1)

| Q | Verdict | Status |
|---|---------|--------|
| Q1 Every route to an empty assessment | Twelve routes. One sentence on the screen for all of them. | CONFIRMED |
| Q2 Does the blank-finding guard fire on recorded payloads | No. 0 of 19 analyse-shaped fixtures, 0 of 404 classified evidence cards, 0 of the B298 production and replay payloads. | CONFIRMED |
| Q3 Screenshot run | Local replay. Synthesis never called. `meta.replayed` skips the call. A real evidence-only production payload then wrote a 993-character assessment. | CONFIRMED |
| Q4 Why a partial finding would be blank | Stage 5 miss. `evidenceSummary` / `reasoningParagraph` left empty when `commentaryNotReviewed` is true. Latent. Did not fire on recorded payloads. | CONFIRMED in code; not observed in the fixtures |
| Q5 Why QRS can describe the review and the assessment cannot | QRS counts classes on `summaryClass`. Synthesis needs finding prose. Different inputs. | CONFIRMED |

**Kill fires.** The screenshot was a replay artefact. The blank-finding guard does not fire on recorded real reviews. Part 2 does not change the guard. Parts 3 and 4 still run.

Ids used: **B301, B302, B303**. Next free after B300.

---

## Part 1. Diagnostic

The copy `The assessment could not be written this time.` is `ASSESSMENT_UNAVAILABLE_COPY` in `src/modules/drafting/reviewSummaryDisplay.js` L11-12. Specified in B285 (`scripts/diagnostic/delivery-check/b285-shared-wait-regression.md` L71), not B292. B292's user copy is `The review did not run.` The panel prints the B285 sentence whenever `reviewerAssessment` is empty after loading finishes (`StatementAnalysisPanel.jsx` L2490-2495). It does not read a reason.

### Q1. Every route to an empty assessment

The screen does not distinguish these. Empty string and the B285 sentence are the same to the reader.

#### Backend `api/synthesize-review.js`. Five early or empty returns.

All five return HTTP 200. The frontend treats `ok: false` and an empty `narrative` the same.

| # | Route | Code | Screen today |
|---|-------|------|----------------|
| 1 | Missing or unknown `qcSummary.readiness` | L39-40 `if (!READINESS_LABELS.includes(readiness)) { return res.status(200).json({ ok: false, narrative: "" }); }` | B285 sentence via `narrative \|\| ASSESSMENT_UNAVAILABLE_COPY` |
| 2 | Provider key missing | L42 `if (!hasProviderApiKey(modelConfig.provider)) return res.status(200).json({ ok: false, narrative: "" });` | Same |
| 3 | Any blank finding in any list | L48-57 `synthesisPayloadHasBlankFinding(...)` then the same empty JSON | Same. Call never made. |
| 4 | Call succeeded with empty or whitespace text | L113-114 `const narrative = typeof completion?.text === "string" ? completion.text.trim() : ""; return res.status(200).json({ ok: true, narrative });` | Same. `ok: true` does not save it. Frontend still substitutes the B285 sentence. |
| 5 | Thrown `callLLM` | L115-116 `catch { return res.status(200).json({ ok: false, narrative: "" }); }` | Same. This is the case B285 named. |

#### Frontend. The call never being made, a replay, a thrown fetch.

| # | Route | Code | Screen today |
|---|-------|------|----------------|
| 6 | Replayed analyse payload | `apiAnalyseStatements` DEV intercept stamps `meta.replayed` (`analysisReplayGuard.js` L19-23). `useAssessState.jsx` L1154-1156: `if (analysisBlocksPersistence(...)) { setIsReviewerAssessmentLoading(false); }` and does **not** call synthesize-review. Assessment stays `""`. | B285 sentence. The panel fallback at L2493-2495, not an explicit set of the constant. |
| 7 | Frontend builder refuses the payload | `buildReviewerSynthesisPayload` returns `null` when a classified concern or evidence finding has blank text (`reviewerSynthesisPayload.js` L84-88), or when `readReviewSummary` is null (L70). `useAssessState.jsx` L1166-1168 sets `ASSESSMENT_UNAVAILABLE_COPY`. Same in `useDraftState.jsx` L952-956. | B285 sentence. Synthesis never called. |
| 8 | `apiSynthesizeReview` throws | `useAssessState.jsx` L1173-1174 `catch { setReviewerAssessment(ASSESSMENT_UNAVAILABLE_COPY); }` | B285 sentence |
| 9 | Backend returned empty narrative | L1172 `setReviewerAssessment(narrative \|\| ASSESSMENT_UNAVAILABLE_COPY)` | B285 sentence. Covers routes 1-5. |
| 10 | Writing-mode panel | `useDraftState.jsx` L941-968 is the same builder / call / catch / empty-narrative chain. | B285 sentence |
| 11 | Size-block abort before Review | `useAssessState.jsx` L1100 `setReviewerAssessment("")` | Results panel usually not shown. If it were, B285 sentence. |
| 12 | Initial empty state | `ASSESS_STATE_CACHE.reviewerAssessment` is `""` (`useAssessState.jsx` L84). | Same fallback if the panel renders with no narrative. |

The call-never-made routes are 6 and 7 (and 11). Replay is 6. Thrown call is 5 (backend) and 8 (frontend fetch).

### Q2. `synthesisPayloadHasBlankFinding`

CONFIRMED `lib/qc/blank-finding-guard.mjs` L18-28. It walks five lists: `editorialConcerns` / `complianceConcerns` (`concern`), `notSupportedStatements` / `conflictingStatements` / `partialStatements` (`evidenceFinding`). If **any** object in **any** list has a blank string on that field, it returns true. The whole synthesis is then refused (route 3). It does not drop the blank item. It does not count how many were blank.

The frontend builder is the same rule applied one step earlier (route 7).

Counted on 2026-09-21 against every JSON under `tests/fixtures/` (backend and frontend) and `scripts/diagnostic/delivery-check/b298-runs/`. 26 JSON files. 19 analyse-shaped payloads with a `statements` array. 404 classified evidence cards (329 notSupported, 55 conflicting, 20 partial).

**Trips: 0.**

| Source | Would trip | Notes |
|--------|------------|-------|
| `tests/fixtures/b226/1-meridian-reporting.json` | no | |
| `tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json` | no | |
| `tests/fixtures/b226/2-linkedin-post.json` | no | |
| `tests/fixtures/b226/3-press-release.json` | no | |
| `tests/fixtures/b226/4-internal-inconsistency.json` | no | |
| `tests/fixtures/b247/r1-ready.json` | no | |
| `tests/fixtures/b247/r2-conflict-first.json` | no | |
| `tests/fixtures/b247/r2-conflict-second.json` | no | |
| `tests/fixtures/b247/r3-evidence-only.json` | no | |
| `tests/fixtures/b247/r4-editorial-only.json` | no | |
| `tests/fixtures/b247/r5-excluded-source.json` | no | |
| `tests/fixtures/b247/r6-unsupported.json` | no | |
| `tests/fixtures/b247/r6-near-limit.json` | no | |
| `tests/fixtures/b247/shopify-messy-full.json` | no | 184 cards |
| `tests/fixtures/b247/shopify-messy-full-after.json` | no | 186 cards. Editorial `not_reviewed` holes are not concern-class, so they are not in the finding lists. |
| `tests/fixtures/b247/recovered-shopify-messy-prefix.json` | no | |
| `tests/fixtures/planted-document-finding.json` | no | |
| `scripts/diagnostic/delivery-check/b298-runs/production-review.json` | no | 3 partial, 2 notSupported, all have prose |
| `scripts/diagnostic/delivery-check/b298-runs/replay-evidence-only.json` | no | same |
| Invented tests `tests/b227-assessment-blank-finding.test.mjs` | yes | The only trips. Planted empty `concern` / empty `evidenceFinding`. |

How often on a real review: **not in any recorded payload we have.** The guard is a latent tripwire, not a live one. Ben does not see it constantly. He saw the B285 sentence on the screenshot for a different reason (Q3).

### Q3. The screenshot run, then a real one

**Screenshot.** CONFIRMED local replay. `scripts/diagnostic/delivery-check/b298-runs/furthermore-turned-off.png`. Header pill v4. QRS Needs work, two no-source bullets and three partial. Assessment: `The assessment could not be written this time.`

That run used the B244 replay flag (`ce.replayAnalyse`) and a stamped analyse payload. `apiAnalyseStatements` in DEV stamps `meta.replayed: true`. `analysisBlocksPersistence` is true. Route 6: synthesis is never called. Assessment stays `""`. The panel prints the B285 sentence.

The replay JSON itself would not have tripped the blank-finding guard. All five evidence findings have prose. CONFIRMED `replay-evidence-only.json` cards 0,1,3 partial (511 / 339 / 542 chars) and cards 5,6 notSupported (172 / 319 chars).

**Real evidence-only production run.** Same Meridian fixture, already posted as B298 (`production-review.json`, trace `1d62d0cb-b2ae-4bd3-a2ff-80a31c2e9ee8`). Guard did not trip. 3 partial, 2 notSupported, 0 blank. POST `https://brightline-content-engine-backend.vercel.app/api/synthesize-review` 2026-09-21T02:30Z. HTTP 200, `ok: true`, wall 4880 ms, narrative 993 characters, starts `Needs work. The draft has several unsupported claims...`. Recorded `scripts/diagnostic/delivery-check/b298-runs/b301-q3-synthesize.json`.

Ben would not see the B285 sentence on a real evidence-only Meridian Review. He sees it on a replayed payload because replay skips the call and the empty string is labelled as a failure.

### Q4. A blank partial-evidence finding

The field is `qcCard.evidenceSummary`, mirrored onto `qcCard.reasoningParagraph`. The frontend builder concatenates those into `evidenceFinding` (`reviewerSynthesisPayload.js` L11-16). Blank means both were empty.

They are filled in `lib/qc/pipeline-v3/stage7-assemble-card.mjs` L757-845:

```
const rawCommentary = typeof entry?.commentaryResult?.commentary === "string" ? ... : "";
const commentaryNotReviewed = entry?.commentaryResult?.notReviewed === true || schema miss || canned unavailability string;
const evidenceSummary = commentaryNotReviewed ? "" : rawCommentary;
...
reasoningParagraph: evidenceSummary || null,
```

A Stage 5 miss (B254) honestly leaves empty prose. That empty string then becomes a classified partial or unsupported card with a blank `evidenceFinding`. The builder returns null (route 7). The backend guard would also refuse (route 3) if the payload were sent anyway.

That is a defect in the join, not in Stage 5. Stage 5 is allowed to miss. The assessment then treats the miss as "we failed to write the assessment" instead of "this card has no commentary to quote". It did not fire on the recorded payloads. QRS still counts the card because it uses `summaryClass.evidence`, not the prose.

### Q5. QRS vs the assessment

They do not use the same payload.

QRS is `reviewSummary` from `classifyCard` / `summariseReview`. Bullets in `summary-bullets.mjs` / `reviewSummaryDisplay.js` `summaryBullets`. They read counts: `evidence.notSupported`, `evidence.partial`, `editorial.concerns`. Those counts come from verdict classes on the card. They do not read `evidenceSummary` or concern `note`.

The assessment is a separate POST to `synthesize-review` whose user payload is the finding lists. If that POST is skipped (replay) or refused (blank prose, bad readiness, thrown call), the narrative is empty. QRS already landed with the analyse-statements response. One surface can describe the review because it was computed from classes. The other cannot, because it never ran or was refused.

The screenshot is that split exactly: QRS from the replayed analyse payload, assessment never requested.

---

## Kill

The blank-finding guard never fires on recorded real reviews. The screenshot was a replay artefact (route 6). **Part 2 does not change the guard.** A blank finding still never reaches the model. B227 stands.

Parts 3 and 4 still run. The B285 sentence must stop standing in for "we did not ask" and "there was nothing to say".

---

## Cost of Part 1

One production `synthesize-review` call. Response has no `llmSpend`. Unpriced: 1. Never silent zero. HYPOTHESIS on the order of USD 0.01 from wall 4.8 s and a 993-character completion. No analyse-statements call in Part 1.

---

## Next

Part 3: three states, backend reason, frontend copy. Part 4: absent `reviewOptions` object cannot write `clean`. Part 2 skipped except the existing "blank never reaches the model" test.
