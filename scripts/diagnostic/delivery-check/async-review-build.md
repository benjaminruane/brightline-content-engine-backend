# A review of a real document can complete

BUILD SPEC. Production proof on HEAD `6c20b67`. Tag `b263-function-duration-300`.

The memo completed. Production `POST /api/analyse-statements` HTTP 200 in **81898 ms**. Stage 5 **186 of 186** real findings, **0** stand-in sentences, **0** `commentaryNotReviewed`. Trace `de18131c-507f-4111-85ec-ffc15be7de8c`.

---

## Scoreboard

| | Before | After |
|--|--|--|
| Completes in production | No (61.17 s vs 60 s cap) | **Yes. 81.90 s vs 300 s cap** |
| Stage 5 | 184/184 `ERROR` 429, canned prose | **186/186 DEFAULT, real prose** |
| Stand-in sentence on a card | 184/184 | **0/186** |
| Readiness | Needs significant work | Needs significant work |
| Evidence mix | 0 / 1 / 26 / 157 of 184 | 0 / 1 / 26 / 159 of 186 |
| Cost | USD 10.3994 (Stage 5 unpriced) | **USD 8.4497** comparable run |
| Function cap | 60 (`vercel.json`) | **300** |

Ids used: **B254** and **B262** (given, canned commentary). **B263** (already filed for the 60 s cap; shipped). Next free: **B265** pool, **B266** 429 retry, **B267** extraction timeout. Leftover filed **B268** (Stage 6 still 429s).

Test files: spec named `b263` / `b264` / `b265`. B263 was already the duration row and B264 is the wrong-excerpt filing, so the files are `tests/b263-function-duration.test.mjs`, `tests/b265-stage-concurrency-pool.test.mjs`, `tests/b266-rate-limit-retry.test.mjs`, `tests/b254-commentary-not-a-finding.test.mjs`, `tests/b267-extraction-timeout.test.mjs`.

---

## Part 0A. Claims

**C1 BLOCKING. TRUE.** CONFIRMED `vercel.json` L1. The glob `"api/*.js"` `maxDuration` was 60, now 300. That number is ours.

**C2 BLOCKING. TRUE.** CONFIRMED the 2026-09-19 Shopify trace `409b791c-56ee-434a-bc2e-fa9f1c9c219b`: 184/184 `stage5-generate-commentary` `ERROR`, 429 TPM Limit 2000000 Used 2000000, try again in about 42 ms. Nothing in `callLLM` acted on that delay before this spec (`lib/observability.js` had no 429 loop).

**C3 BLOCKING. TRUE.** CONFIRMED `lib/qc/pipeline-v4/stage2-match-sources.mjs` L63 `STAGE2_CONCURRENCY = 24`. Before this spec, Stage 6 and Stage 5 were `Promise.all` over every statement (`lib/qc/pipeline-v4/index.mjs` old L572 and L649). Now `mapPool` at 24. CONFIRMED L44-45, L575, L654-656.

**C4 CHECK. TRUE.** Raising `maxDuration` is a config change. GitHub Vercel status on `6c20b67` went **pending** then **success** ("Deployment has completed"). The comparable production POST then ran **81.90 s** and returned 200. 300 is available on this project. Nothing was bought. Nothing was raised to 800.

---

## Part 0B. Design

**D1 RAISE THE CAP. Agree. Set 300.** Every current Fluid plan allows 300. 800 is a Pro step we do not need for this class (81.90 s vs 300 s leaves about 218 s). CONFIRMED `vercel.json` L1 `"maxDuration":300`. Tag `b263-function-duration-300` on `1d9df5e`. Deploy did not reject 300.

**D2 POOL STAGES 5 AND 6. Agree. Value 24.** Same helper Stage 2 already had, now `lib/qc/map-pool.mjs`. Same number as `STAGE2_CONCURRENCY` (CONFIRMED L63), which already filled on this memo. Stage 6 still fires two calls per statement, so peak in-flight is 48. Wall-clock cost of pooling plus actually running Stage 5: **about 21 s extra** (local before 61170 ms with Stage 5 fail-open vs production after 81898 ms with Stage 5 working). That is the honest price. It still fits.

**D3 RETRY ON 429. Agree.** CONFIRMED `lib/observability.js` L15 `maxRetries: 0` so the SDK does not swallow the 429, L462-463 attempts 4 / cap 2000 ms, `parseRetryAfterMs` reads `retry-after-ms` then the `try again in 42ms` text, `rateLimitDelayMs` adds up to 25% jitter. Belt and braces behind D2, not instead of it. Stage 5 no longer needed it on the comparable run (0 Stage 5 errors). Stage 6 still exhausted four attempts on some editorial calls (see B268).

**D4 A MISS IS NOT A FINDING. Agree.**

Forbidden in the finding slot (old canned strings, never to appear):

- `Verdict: confirmed. Specific commentary is unavailable from the system; please review the source directly before finalizing.`
- `Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and adjust the statement to match the source language.`
- `Verdict: conflicting. Specific commentary is unavailable from the system; please reconcile the contradiction or remove the claim.`
- `Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.`

Honest strings:

- Card `evidenceSummary` / `reasoningParagraph` on a miss: empty. Flag `commentaryNotReviewed: true`. CONFIRMED `stage7-assemble-card.mjs` L745-749, L796.
- Export on a miss: `Not checked.` CONFIRMED `export-review-data.mjs` L9, L17.
- Editorial miss (already shipped, not invented here): `The editorial check could not be completed for this statement. Please review it manually.`
- Counts: `classifyEvidence` returns `notChecked` when `commentaryNotReviewed` is true. CONFIRMED `review-summary.mjs` L27. Frontend copy `src/utils/summariseReview.js` L17 so B246 cannot drift.

Stage 3 `displayVerdict` is unchanged. That is not verdict logic.

**D5 EXTRACTION TIMEOUT. Agree, move it with D1 to 300000 ms.** It was a copy of the old Function cap, not a separately measured bound. Leaving it at 60 s while the Function can wait 300 s would still kill extracts the Function could finish. CONFIRMED `lib/extract-text-from-source.mjs` L40. This proof did not exercise extraction (draft and source were already text).

**D6 Claude: this is the whole fix for this class, no job queue. Agree, with a size caveat.** This 3700-word memo completes in 82 s. I would not build a worker now. The answer changes when wall clock approaches 300 s (HYPOTHESIS: about three to four times this memo, or a same-length draft plus a full-length source that fills Stage 2) or when we need a progress UI. Stage 6 429s are already visible as honest `not_reviewed` (**B268**). That is not a reason to async the Review. It is a reason to tighten Stage 6's pool later.

**D7 Scope. Did not edit Stage 1's prompt or the Stage 2 prompt.** CONFIRMED. `stage2-match-sources.mjs` only lost its private `mapPool` and now imports `lib/qc/map-pool.mjs`. Prompt paths `prompts/stage2_v4.md` and Stage 1 prompt files were not touched.

**Waiting state.** No frontend wait change. `apiAnalyseStatements` has no client timeout (CONFIRMED frontend `src/utils/api.js` L206-218). The screen already says `Reviewing…`. An 82 s wait held. The one frontend line is D4: count a missed evidence finding as not checked, so QRS cannot drift.

---

## Before and after, side by side

Comparable production run. Same 22163-character extract. Same 83-character B1 stub, sent as inline text labelled `B1 Shopify source` (a first POST used the filename `B1_shopify_source_1_7m.pdf` and production dropped it as `empty_after_extraction`; that run is in the ledger, not this comparison).

| | Before (local, `409b791c-56ee-434a-bc2e-fa9f1c9c219b`) | After (production, `de18131c-507f-4111-85ec-ffc15be7de8c`) |
|--|--|--|
| HTTP | n/a (local pipeline) | **200** |
| Wall | 61170 ms | **81898 ms** |
| Cards | 184 | 186 (Stage 1 variance) |
| Stage 5 | 184 ERROR, 0 billed | **186 DEFAULT, 0 ERROR, USD 0.662** |
| Stand-in on a card | 184 | **0** |
| Evidence | 0 confirmed / 1 partial / 26 conflict / 157 no support | 0 / 1 / 26 / 159 |
| Editorial `not_reviewed` | 0 | 64 (honest miss, **B268**) |
| Compliance `not_reviewed` | 0 | 34 (honest miss, **B268**) |
| Readiness | Needs significant work | Needs significant work |
| QRS extra bullet | none | `67 claims could not be fully checked...` (editorial/compliance, not Stage 5) |

First evidence findings, same three statements:

Before (from `scripts/diagnostic/delivery-check/shopify-messy-full.md`):

```
"Date: October 12, 2010"
Verdict: Conflicting (high evidence concern)
Evidence finding: Verdict: conflicting. Specific commentary is unavailable from the system; please reconcile the contradiction or remove the claim.

"We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs."
Verdict: Partially confirmed (moderate evidence concern)
Evidence finding: Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and adjust the statement to match the source language.

"Shopify sells a simple SaaS solution that enables a business to
quickly setup and run an online retail store."
Verdict: No support (high evidence concern)
Evidence finding: Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.
```

After (canonical export of `tests/fixtures/b247/shopify-messy-full-after.json`):

```
"Date: October 12, 2010"
Verdict: Conflicting (high evidence concern)
Evidence finding: The statement claims a completed investment of $7 million, but the source indicates that the firm is only evaluating an investment of up to $7 million, not yet finalized. This is a modality conflict. The reviewer should reconcile this discrepancy or remove the claim.

"We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs."
Verdict: Partially confirmed (moderate evidence concern)
Evidence finding: The source confirms the intention to invest up to $7 million in Series A financing, aligning with the statement's claim. However, the source does not mention Shopify or its role as a provider of e-commerce software to SMBs. The reviewer should verify the specific involvement of Shopify in this investment context or adjust the statement to reflect the confirmed details.

"Shopify sells a simple SaaS solution that enables a business to
quickly setup and run an online retail store."
Verdict: No support (high evidence concern)
Evidence finding: No source addresses Shopify's SaaS solution or its capabilities. The available source only discusses an investment evaluation, which is unrelated to the statement about Shopify's product offering. Please add a relevant source or remove the claim.
```

Canonical export, first 20 lines (after). Readiness and the draft start. The 67 not-fully-checked bullet is Stage 6, not Stage 5.

```
Needs significant work
159 claims have no source behind them. Remove them or find supporting evidence before this draft is final.
26 claims conflict with the cited sources. Reconcile the contradictions before this draft is final.
67 claims could not be fully checked. Read them yourself or run Review again.
Draft output
Shopify — Long-form memo
Shopify
To: BVP Group
From: Alex Ferrara, Trevor Oelschig
Date: October 12, 2010
Re: Shopify
We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify, a provider
of e-commerce software to SMBs. Shopify sells a simple SaaS solution that enables a business to
quickly setup and run an online retail store. A typical customer signs up using their credit
card and is up and running in a few hours with no long-term contract. Shopify targets SMBs and
at-home capitalists (e.g., eBay and Etsy sellers) who pay an average of $45 per month, with the
goal of servicing these customers as they scale to become larger customers with more
sophisticated needs. Shopify has also managed to sign-up a number of large businesses like
Pixar, Amnesty International and Tesla Motors (selling Tesla accessories, not the cars) at
higher price points.
```

No card still shows a stand-in sentence. CONFIRMED 0 of 186 contain `Specific commentary is unavailable from the system`.

---

## Tests, failing then passing

On current HEAD before the implementation (`d9f2364`):

- B263 `60 !== 300`
- B267 `60000 !== 300000`
- B266 `RATE_LIMIT_MAX_ATTEMPTS` undefined; `isRateLimitError` is not a function
- B265 `Cannot find module '../lib/qc/map-pool.mjs'`
- B254 `notReviewed` undefined (canned path still on)
- B245 `Evidence finding: Not checked.` false (export still `Not recorded.` / canned)

After implementation: those files **50/50** in the targeted run, then full backend **1253** tests, frontend B246 **3/3**.

---

## SHIP VERIFIED

Backend (code): `SHIP VERIFIED  6c20b67  main  100 files  1253 tests`

Frontend: `SHIP VERIFIED  9621ff2  main  33 files  197 tests`

Commits:

1. `1d9df5e` `fix(runtime): raise the Function cap to 300 seconds (B263)` tag `b263-function-duration-300`
2. `3fe9348` `fix(pipeline): pool Stage 5 and Stage 6 at 24 (B265)`
3. `0ffce91` `fix(llm): retry 429s with the server delay (B266)`
4. `30d3b9a` `fix(commentary): a failed Stage 5 call is not a finding (B254, B262)`
5. `6c20b67` `fix(extract): match the extraction timeout to the 300 second cap (B267)`
6. Frontend `9621ff2` `fix(summary): count a missed evidence finding as not checked (B254)`

---

## Cost

Budget USD 25. This pass **USD 15.9934**.

Comparable proof (the one in the fixture):

| | |
|--|--|
| USD | **8.4497** |
| Generations | **818** |
| Priced | 720 |
| Unpriced | **98** (64 editorial ERROR + 34 compliance ERROR) |
| Stage 5 | 186/186, USD 0.662, 0 unpriced |
| Per statement | **0.0454** (8.4497 / 186) |
| Per thousand words | **2.28** (8.4497 / 3.698) |
| Source | Langfuse `calculatedTotalCost` sum, same as trace `totalCost` 8.449665099918 on `de18131c-507f-4111-85ec-ffc15be7de8c` |

Itemised (Langfuse by name): Stage 1 0.082; Stage 1b 0.004; Stage 2 match 1.581; widened 0.143; span elicit 0.021; editorial-style 4.684; compliance 1.271; Stage 5 0.662; duplication-judge 0.001.

First production POST the same evening, source dropped because the label ended `.pdf`: USD **7.5437**, 560 generations, 66 unpriced, wall 78679 ms, trace `1b2ae97d-db46-4abe-bcc9-f948df85c734`. Stage 5 was already 186/186 on that run. Not the comparison.

No new model calls for tests. Cache off on both live POSTs.

---

## Disagreement

I agree with Claude that a 60 s worker does not escape the cap, and that chunking across invocations is more moving parts than it looks. I do not agree that async is the first design. One longer Function plus a pool was enough for this memo. I would not skip D2: a duration raise without pooling still 429s Stage 5.

What I would not call done: Stage 6 still 429s at this scale. Sample Langfuse `editorial-style-review` ERROR: 429 TPM, Used about 1.985 million, Requested about 17288, try again in 77 ms. Editorial prompts are an order of magnitude larger than Stage 5. Four retries at 77 ms cannot buy a new minute. The product now says `not_reviewed` instead of inventing a finding. That leftover is **B268**.

---

## Fixtures

- Before: `tests/fixtures/b247/shopify-messy-full.json`
- After: `tests/fixtures/b247/shopify-messy-full-after.json`
