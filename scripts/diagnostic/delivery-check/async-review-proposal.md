# How a review of a real document can actually run

PROPOSAL. Not a build spec. No production-path change. No async worker built.

Every claim is **CONFIRMED** (file and line, or named URL) or **HYPOTHESIS**.

HEAD at start of this pass: `c2591c0`. Trace used for P2: `409b791c-56ee-434a-bc2e-fa9f1c9c219b` (already billed; no new model calls).

---

## Scoreboard

| | |
|--|--|
| Does a longer Vercel duration exist without a new architecture? | **Yes.** The 60-second cap is set by us. |
| Does buying a more expensive Vercel plan, by itself, change the 60s? | **No.** `vercel.json` still says 60 until we raise it. |
| Headroom if we raise the cap to the plan maximum | Hobby Fluid **300s** (4.9x vs 61.17s). Pro/Enterprise **800s** (13x). 1800s is a Pro/Enterprise beta. |
| Does that make async unnecessary for this memo? | **Yes, for this size, if we also bound LLM concurrency.** Duration alone does not fix Stage 5. |
| Why Stage 5 died on 184/184 | **OpenAI 429 TPM.** Limit 2,000,000 tokens/min, used 2,000,000. Not schema, not a token-per-request budget. |
| Smallest Stage 5 fix | Pool Stage 5 and Stage 6 the way Stage 2 already is (24). Retry 429. Stop serving canned commentary as a finished check. |
| Recommended shape | **One longer function, same request.** Not chunked jobs. Not a worker. |
| First version effort | About **2 backend days**, **0.5 frontend day** if the Stage 5 miss needs a card banner, **0 persistence**. |
| What works in production today | Measured: 17-card prefix ~12s. This 184-card memo **61.17s, would 504**. Cliff is this size. |

P1 does **not** make P2 unnecessary. It **does** make most of an async job system unnecessary for documents of this class. Claude's worker-still-has-a-cap point is right about a 60-second worker. It is the wrong first design, because the cap is self-imposed.

No model calls this pass. Spend: **USD 0.** No ledger row.

---

## P1. The cheap answer

### What we are actually running today

**CONFIRMED.** `vercel.json` is one JSON object. `"functions": { "api/*.js": { "maxDuration": 60, ... } }`. Every API route, including `api/analyse-statements.js`, is capped at 60 seconds by that glob.

**CONFIRMED.** Extraction copies the same number: `lib/extract-text-from-source.mjs` L40 `EXTRACTION_TIMEOUT_MS = 60_000`.

**CONFIRMED.** Portability audit already named this: `docs/PORTABILITY.md` L82.

The Shopify memo wall clock was **61170 ms** (`scripts/diagnostic/delivery-check/shopify-messy-full.md`). That is 1.17 seconds over this configured cap. Production would return `FUNCTION_INVOCATION_TIMEOUT` (504).

Raising `maxDuration` is a config change. It is not a new product. It is not a plan upgrade unless the new number exceeds what the current plan allows.

### Platform maxima (Fluid compute, Vercel's current default)

Source: [Vercel Functions limits](https://vercel.com/docs/functions/limitations) and [Configuring maximum duration](https://vercel.com/docs/functions/configuring-functions/duration), fetched 2026-09-19.

| Plan | Monthly cost | Default duration | Maximum | Extended maximum |
|------|--------------|------------------|---------|------------------|
| Hobby | **Free** | 300s | 300s | none |
| Pro | **USD 20 per user per month**, plus usage; **USD 20 usage credit** included ([pricing](https://vercel.com/pricing)) | 300s | **800s** (GA) | **1800s** (30 min, beta, per-function config, Node 20/22/24) |
| Enterprise | **Not listed.** "Contact sales." Same duration table as Pro in the public docs. | 300s | 800s | 1800s beta |

If Fluid is **off** and the project is a pre-2025-04-23 leftover, the older table still applies: Hobby max **60s**, Pro max **300s**, Enterprise max **900s** ([Limits](https://vercel.com/docs/limits)). **HYPOTHESIS:** this project is on Fluid. Evidence for, not proof: Node `22.x` (`package.json` engines), `VERCEL_SUPPORT_LARGE_FUNCTIONS` is a live concern (**B42**), Fluid is the documented default. I did not read the Vercel dashboard. Confirm Fluid in Project Settings before treating 300/800 as available.

**HYPOTHESIS:** the hosted app is on **Pro**, not Hobby. Evidence: it is a commercial production deployment, not a personal toy. Hobby's own pricing page says Hobby is for personal, non-commercial use. Not confirmed from this repo.

### Request-body limit (B79 family)

**CONFIRMED.** 4.5 MB request **or** response body, all Function plans. Over that: HTTP 413 `FUNCTION_PAYLOAD_TOO_LARGE`. Same URL as duration, section "Request body size". The docs do not give a larger body on Pro or Enterprise.

**CONFIRMED.** Client guard sits under that: frontend `src/utils/sourceRequestBudget.js` L14 `MAX_REQUEST_BYTES = 4_200_000`. Practical source total about 3 MB after base64 (**B79**).

**CONFIRMED.** A different 4 MB cap is ours, on autosave: `lib/db/review-state.mjs` L1 `MAX_STATE_BYTES`.

Buying Pro or Enterprise **does not raise the 4.5 MB body**. Duration and body are different axes. **Pr14** stays the body fix.

### Headroom against 61.17 seconds

Assume Fluid is on, and we actually change `maxDuration` (today we have not).

| New cap | Spare vs 61.17s | What it covers, reasoned |
|---------|-----------------|--------------------------|
| 300s (Hobby max, Pro default) | **239 s** (4.9x) | This memo, with Stage 5 actually running and calls pooled, about **70s**. A ~10k-word draft with one short source, pooled, about **220s** (HYPOTHESIS, linear Stage 1 plus pooled later stages). Tight. Two long sources start to crowd 300s. |
| 800s (Pro/Enterprise GA) | **739 s** (13x) | The 10k-word / two-source case with room. Comfortable production default for "a real IC memo". |
| 1800s (Pro/Enterprise beta) | **1739 s** (29x) | OCR-heavy extracts and multi-source packs that still fit in 4.5 MB. Beta; not required for this memo. |

The 61.17s run had Stage 5 fail-open in about 4 seconds. A **working** Stage 5, pooled at 24, is about 184/24 × ~1.5 s ≈ 12 s. Total for this memo ≈ **69 s**. That still dies at 60. It lives at 300.

**Does P1 make most of the rest unnecessary?** For documents of this size: **yes**, together with P2's pooling. For a fortnight of job infrastructure: **do not spend it yet.** For B79 (3 MB sources): **no.** For a client container: the 60s cap is gone anyway (`docs/PORTABILITY.md` L84), but pooling is still required (P2).

A 120-second "Proxied Request Timeout" exists on Hobby/Pro/Enterprise ([Limits](https://vercel.com/docs/limits)). That is for `rewrites` / external `routes`, not for the Function that is the origin. **HYPOTHESIS:** browser POST to `api/analyse-statements` is not that proxy path. Frontend `src/utils/api.js` L206-210 has no client timeout; the browser waits until the Function dies or returns.

---

## P2. Why Stage 5 failed on all 184 cards

### Cause

**CONFIRMED. OpenAI HTTP 429, tokens per minute, not schema, not a missing key, not a per-call token cap.**

Langfuse observations named `stage5-generate-commentary` on trace `409b791c-56ee-434a-bc2e-fa9f1c9c219b`:

- count **184**
- `level` **ERROR** on **184 / 184**
- `calculatedTotalCost` null, usage in/out 0 (matches the 184 unpriced generations)
- latency about **0.73 s to 1.30 s** (p50 0.82 s)
- `statusMessage` on every sampled row, same class:

> 429 Rate limit reached for gpt-4o-2024-08-06 (for limit gpt-4o) in organization org-KFCd9S039LXddh2qObiVcoPh on tokens per min (TPM): Limit 2000000, Used 2000000, Requested ~1428-1494. Please try again in 42ms.

All 184 messages are that TPM 429. None are schema. None are empty JSON. Retry-After is **42 to 44 milliseconds**. They still all died because they were fired together.

No new model calls. Reading Langfuse was enough.

### Why the burst exists

**CONFIRMED.** Stage 2 is pooled: `lib/qc/pipeline-v4/stage2-match-sources.mjs` L62 `STAGE2_CONCURRENCY = 24`, used at L1500, L1587, L1632.

**CONFIRMED.** Stage 6 is not. `lib/qc/pipeline-v4/index.mjs` L572 `Promise.all` over every statement. Each item runs editorial+style and compliance in parallel (`lib/qc/editorial-compliance-reviewer.mjs` L2207 `Promise.allSettled`). On this run that is 184 × 2 in-flight gpt-4o calls.

**CONFIRMED.** Stage 5 is not pooled either. Same file L649 `Promise.all` over `generateCommentary` for every statement.

**CONFIRMED.** Stage 6 finished, then Stage 5 started. Editorial logs end ~10:38:23Z; Stage 5 errors start **10:38:24.94Z**. The 2,000,000 TPM bucket was already full from Stage 6. Stage 5 asked for ~1.4k more tokens per call and was refused.

**CONFIRMED.** `callLLM` throws on provider error (`lib/observability.js` L555-569 `generation.end` with `level: "ERROR"` then `throw err`). OpenAI client is `new OpenAI({ apiKey })` only (L15). No `maxRetries` override.

**CONFIRMED.** `generateCommentary` catches that throw and returns canned prose (`lib/qc/pipeline-v4/stage5-generate-commentary.mjs` L233-241). Empty `catch`. No `console.warn`. The card looks reviewed. Integrity row **B254**; document-scale exhibit **B262**.

This is volume. It follows the work to a longer Function, to a worker, to a client's container, to Azure OpenAI. Unbounded `Promise.all` against a TPM cap will fail the last stage wherever it runs.

### Smallest honest fix (do not build it here)

1. **Reuse `mapPool` at 24** (or another small N) for Stage 6 and Stage 5. Stage 2 already has the helper. That is the product fix. It will make this memo's Stage 5 succeed, at the cost of wall clock (about 12 s instead of 4 s of failures). Combined with a 300s cap, that is acceptable.
2. **Retry 429 in `callLLM`** with the server's wait (here 42 ms) plus jitter, capped. Safety net for a nearly-full TPM window. Not sufficient alone: 184 concurrent retries of 42 ms still collide.
3. **Stop serving canned commentary as a completed evidence note.** Mirror editorial `not_reviewed`: the badge and QRS must count it as not checked (**B235** already treats unknown / not-reviewed evidence as `notChecked`). The stand-in sentence is a lie.

Do not "fix" this by raising the OpenAI org TPM as the product design. Do not skip Stage 5. Do not merge Stage 5 into Stage 2.

---

## P3. The design

### The fork

Claude: chunking across several invocations is more moving parts than it looks; a single longer-running worker is simpler if the platform allows one.

**I agree with the second sentence. I disagree that the first move is a worker at all.**

A worker that still has `maxDuration: 60` does not help. Claude is right about that. The cheap move is to **raise this Function's `maxDuration` to 300 (Hobby) or 800 (Pro)** and **bound concurrency**. Same `POST /api/analyse-statements`. Same payload. Same frontend wait. No job table.

I would not chunk Stages 1 to 7 across invocations in v1. Stage 1 must finish before Stage 2. Checkpointing a half-run means persisting statements, matches, and cards, then writing a resume protocol, then teaching the UI two result shapes. That is the fortnight.

### Where the work runs (v1)

On the existing analyse-statements Function. Escape the 60s cap by raising it, not by leaving the request.

v2 (only if a real document still dies at 800s, or a client forbids long HTTP): one job Function with the same raised cap, kicked by the request Function which returns 202. Still one pipeline invocation, not seven.

### Where a job and its state live

v1: nowhere new. The result still returns on the POST. Autosave already writes `review_state` (`lib/db/review-state.mjs`, table `review_state`). Decisions already append to `reviewer_decisions`. Neither is a job queue. Do not overload `review_state` as a progress log in v1; it is a 4 MB overwrite buffer.

v2: a `review_jobs` row (id, owner_key, status, trace_id, error, result jsonb or pointer). Same Neon. Same `owner_key`. Not blob storage.

### How the user learns it is finished

v1: the POST returns, as today. Frontend `apiAnalyseStatements` waits (`src/utils/api.js` L206-218). No client timeout.

v2: 202 + poll `GET` a job route, or poll `review_state` once the worker writes the cards. There is no websocket in this backend. Do not add one in v1.

### When a run dies half way

Today: 504. No cards. The user retries. **CONFIRMED** by the absence of checkpoint code in `runPipelineV4`.

v1 (longer Function): still all-or-nothing. If it dies at 799s, same empty result. Honest. Cheap.

v2: status `failed`, last stage name, retry from Stage 1 (do not resume mid-Stage-2; TPM and cache make resume attractive and wrong). User sees "Review did not finish. Run it again." not a half-painted board.

### Draft and sources: one request or upload-move?

v1 duration raise: **still one request.** Body limit unchanged. **B79 / Pr14 do not collapse into this.** A 61-second memo of 22 kB extract is nowhere near 4.5 MB. The listed-PE decks that fail B79 are a different problem (`scripts/diagnostic/extraction-check/REPORT.md`).

Build Pr14 when a real source over ~3 MB must be reviewed, or when a client hosts their own bucket. Do not wait for async Review to "also" do it. Do not wait for duration work to "also" do it.

### Portability audit, five changes

`docs/PORTABILITY.md` L333-341.

1. **Azure-ready OpenAI client.** Pooling still required. Azure has its own TPM. `callLLM` stays the seam.
2. **Postgres driver.** Not needed for v1 duration/pool. Needed for v2 jobs if the worker writes rows; the `pg` adapter would already make that ordinary.
3. **HTTP wrapper + CORS from env.** A container has no 60s and no 4.5 MB. Duration config becomes "the process timeout". Pooling remains. This is the client-hosted shape. Do not invent Vercel queues that a client then has to reimplement.
4. **S3-compatible source bytes (Pr14 slice).** Independent. Same family as B79, not as B263.
5. **OIDC on `owner_key`.** Independent. A job table would use the same `owner_key`. Do not couple.

The portable design is: one request, bounded concurrency, timeout from the host. Vercel: `maxDuration` 800. Container: process limit. Same `runPipelineV4`.

---

## P4. Size it

### Recommended first version

| Slice | Days | What |
|-------|------|------|
| Backend | **1.5 to 2** | `maxDuration` 300 or 800 on `api/analyse-statements` (not necessarily every `api/*.js`). `mapPool` on Stage 6 and Stage 5. 429 retry in `callLLM`. Stage 5 failure is `not_reviewed`-class, not canned "the system is unavailable" prose that QRS treats as a real note. Tests: pool does not drop statements; 429 fixture does not emit the stand-in sentence. |
| Frontend | **0 or 0.5** | 0 if the backend already stamps a badge the screen knows. 0.5 if a card banner must say the evidence note was not generated. |
| Persistence | **0** | No job table. |

Confirm Fluid and the current Vercel plan in the dashboard before picking 300 vs 800. That is an hour, not a spec.

### What I would not do in v1

Queues. A second worker Function. Chunking Stage 1 from Stage 2. Checkpoint/resume. Websockets. Polling UI. Blob upload. Changing `EXTRACTION_TIMEOUT_MS` without a separate extract measurement. Raising OpenAI TPM as the fix. Skipping Stage 5. Merging editorial into commentary.

### What breaks if we do nothing

**Measured**

- 17-card recovered Shopify prefix: ~12 s, **survives** 60s (`scripts/diagnostic/delivery-check/fidelity-and-identity.md`).
- 184-card full memo: **61.17 s, does not survive**, and Stage 5 is canned even if the clock were raised (`shopify-messy-full.md`).
- Extraction of real reporting PDFs: 7 of 11 reach the extractor on size; **2 of 11 finish extract inside 60s** (`scripts/diagnostic/extraction-check/REPORT.md`; **B163**). That is a second 60s cliff, on extract, not on Review.

**Reasoned, not guessed**

Stage 1 on the full memo was **35.2 s** for 22163 characters. Later stages on that run were ~26 s, of which Stage 5 was a 4 s 429 burst. Production today therefore fits roughly:

- short drafts the product already ships (Meridian-scale, on the order of **8 statements**, export fixture `scripts/diagnostic/delivery-check/b196-2026-09-18/export-v1.txt`)
- not a 3700-word memo
- not a Review whose extract already spent the minute

Linear Stage 1: 60s / 35.2s × 22163 ≈ **38k characters** before Stage 1 alone hits the cap. Combined with Stages 2 to 7, the measured miss is already at **22k characters / 184 cards / 3698 words** with one short source. That is the production size that works: **smaller than this memo.** Do nothing and the first real client document of this length 504s, or returns 184 fake evidence notes if it somehow squeezed under 60s with Stage 5 still 429ing.

---

## Where I disagree with Claude, by name

1. **The first design is not async.** Claude framed the pass as "moving the review off the user's request does not escape the cap, because the worker runs in a function too." True of a 60-second worker. Incomplete: we chose the 60. Raise it. Then the user's request can finish.
2. **Chunking across invocations is the wrong v1.** I agree it is more moving parts than it looks. I would not do it at all until an 800-second pooled run still dies.
3. **Duration raise is not sufficient.** Claude's P1 "this may make most of what follows unnecessary" is true for the job system, false for P2. Unbounded Stage 6/5 will 429 on this memo on a 30-minute Function too.
4. **B79 does not ride along.** A longer Function still rejects a 4.5 MB body. Pr14 stays deferred until a document over ~3 MB must be reviewed.

---

## Cost report

| | |
|--|--|
| New model calls | 0 |
| USD billed this pass | **0** |
| Evidence | Langfuse read of an already-billed trace; Vercel public docs |
| Ledger | no row |

Browser skipped: no UI change.
