# Portability audit

Read-only map of where this backend assumes Vercel, Neon, OpenAI, or Langfuse. Written 2026-09-18 so later accounts and client-deployment work can swap those without guessing. No product code was changed in this pass.

Every claim is **CONFIRMED** (file and line) or **HYPOTHESIS**.

---

## 1. Vercel

### Function handler shape

**CONFIRMED.** Every public route is a Vercel Node serverless handler: `export default async function handler(req, res)`. There is no Express, Fastify, or `http.createServer` entrypoint, and no Dockerfile.

Handlers (27 files):

- `api/analyse-statements.js` L140
- `api/adapt.js` L121
- `api/constructive-feedback.js` L118
- `api/debug-node.js` L2
- `api/export.js` L481
- `api/extract-draft-text.js` L11
- `api/fetch-url.js` L19
- `api/generate-minimal.js` L8
- `api/generate.js` L591
- `api/health.js` L30
- `api/import-openai-test.js` L4
- `api/import-web-helper-test.js` L4
- `api/query-sources.js` L34
- `api/query.js` L23
- `api/review-state.js` L60
- `api/reviewer-decisions.js` L62
- `api/revise-actions-apply.js` L25
- `api/revise-actions.js` L32
- `api/rewrite.js` L621
- `api/stacktrace-test.js` L2
- `api/suggest-revision.js` L104
- `api/summarize-rewrite-label.js` L17
- `api/summarize-source-usage.js` L33
- `api/summarize-source.js` L88
- `api/synthesize-review.js` L20
- `api/web-search.js` L20
- `api/web-test.js` L23

`vercel.json` L1 binds `api/*.js` only. Nested `api/_lib/*.js` is not a function glob. Comment at `api/_lib/web.js` L4-5 states only real route handlers should live in `/api`.

**What breaks if replaced.** A container must wrap `(req, res)` or rewrite every route. Body parsing, query strings, and `req.headers` shape are the Node.js IncomingMessage/ServerResponse pair Vercel supplies.

**Smallest seam.** One adapter that maps a framework request onto `{ method, headers, body, query, url }` and calls the existing handlers. The handlers already tolerate `req.body` as object or string (`api/review-state.js` L31-40).

### `vercel.json`

**CONFIRMED.** `vercel.json` L1 (single JSON object):

- `"version": 2`
- `"installCommand": "npm ci"` (matches standing rule P13)
- `"functions": { "api/*.js": { "maxDuration": 60, "includeFiles": "{node_modules/**,lib/**,tests/**}", "excludeFiles": "node_modules/{tesseract.js,tesseract.js-core}/**" } }`
- `"regions": ["fra1"]` (Frankfurt)

`package.json` L7-9 pins `"engines": { "node": "22.x" }`.

**What breaks if replaced.** Install command, 60s cap, Frankfurt pin, and the blanket `includeFiles` of `node_modules/**` plus `tests/**` (B42) are Vercel-only. A container uses `npm ci` itself and has no function-size gate. The 60s cap is also copied into application timeouts (below).

**Smallest seam.** Keep `vercel.json` for the hosted app. For a container, ignore it and set timeouts in the process runner. Dropping `includeFiles` is a Vercel bundle problem, not a runtime one.

### 4.5 MB request-body limit

**CONFIRMED.** This is a Vercel edge limit, not an application constant on the live path. Application code never checks 4.5 MB before handling Review.

The diagnostic that names it: `scripts/diagnostic/extraction-check/run-extraction-check.mjs` L38-43 (`VERCEL_EDGE_BODY_BYTES = 4_500_000`). Backlog B79 records the production failure: Vercel rejects the body before the function runs, so CORS headers are never set.

A separate, application-level 4 MB cap exists on review-state autosave: `lib/db/review-state.mjs` L1 `MAX_STATE_BYTES = 4 * 1024 * 1024`, enforced at L56-57, returned as HTTP 413 from `api/review-state.js` L117. That cap is ours, not Vercel's.

Extractor file caps (also ours, not Vercel): `lib/extract-text-from-source.mjs` L32 `DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024`, L35-37 `MAX_PDF_MB` / `MAX_PDF_BYTES` (default 10 MB), L40 `EXTRACTION_TIMEOUT_MS = 60_000`.

**What breaks if replaced.** On a container the 4.5 MB edge rejection goes away. The 25 MB / 10 MB extractor caps and the 4 MB autosave cap remain. Large PDFs still arrive as `contentBase64` in the JSON body unless Pr14 lands.

**Smallest seam.** None in product code today. Pr14 (storage-neutral upload) is the seam; see section 3.

### Function time limit

**CONFIRMED.** `vercel.json` L1 `"maxDuration": 60`. Extraction timeout matches it: `lib/extract-text-from-source.mjs` L40 `EXTRACTION_TIMEOUT_MS = 60_000`. Action-list runner comment: `lib/revise-actions/run.mjs` L4 "Vercel maxDuration is 60s; concurrency is capped at 4."

**What breaks if replaced.** A container can run longer. Extraction still aborts at 60s until that constant changes. A long Review can still exceed 60s of LLM time on Vercel today.

**Smallest seam.** Read max duration from env (already the pattern for `MAX_PDF_MB`). Do not keep 60s as a silent default if the host allows more.

### Region

**CONFIRMED.** `vercel.json` L1 `"regions": ["fra1"]`. No application code reads `VERCEL_REGION`.

**What breaks if replaced.** Data residency and latency vs Neon (Neon region is configured in the Neon console, not in this repo). **HYPOTHESIS:** production Neon is in the same geography as `fra1`; not verifiable from this tree.

**Smallest seam.** Region is host config. A container inherits the node's region.

### Environment variables that are Vercel-specific

**CONFIRMED.**

- `VERCEL_ENV` read at `api/generate.js` L595 and `api/rewrite.js` L624: diagnostic header allowed when `BRIGHTLINE_ALLOW_DIAG_HEADER === "1"` or `VERCEL_ENV !== "production"`.
- Vercel injects `VERCEL_URL`, `VERCEL_REGION`, and per-environment env vars. None of those names are read in `api/` or `lib/` except `VERCEL_ENV`.

Internal self-calls (`api/generate.js` L170-178, `api/rewrite.js` L93) use `BRIGHTLINE_API_BASE_URL` if set, else `x-forwarded-proto` + `Host`. That pattern works behind any reverse proxy. **CONFIRMED.**

**What breaks if replaced.** Off Vercel, `VERCEL_ENV` is unset, so `VERCEL_ENV !== "production"` is true and the diag header is allowed unless you set `VERCEL_ENV=production` or stop using that check.

**Smallest seam.** Replace the `VERCEL_ENV !== "production"` clause with an explicit `NODE_ENV` or `BRIGHTLINE_ALLOW_DIAG_HEADER` only. The rest of env (`DATABASE_URL`, `OPENAI_API_KEY`, `AUTHORING_ORGANISATION`, `QC_PIPELINE_V4`, `REVISE_ACTION_LIST`, `BRIGHTLINE_EDITORIAL_REVIEW`, Langfuse keys) is already ordinary process env. **CONFIRMED** `api/_lib/env-flags.js` L1-22.

### Build steps

**CONFIRMED.** `vercel.json` L1 `installCommand: "npm ci"`. No `buildCommand`. The API is raw Node ESM; Vercel bundles via NFT plus the `includeFiles` override. `package.json` has no `build` script.

**What breaks if replaced.** A container needs `npm ci` and `node` (or a process manager) serving `/api/*`. There is no compile step to port.

**Smallest seam.** `node` plus a thin HTTP wrapper. No webpack/esbuild product build.

### CORS that hardcodes the Vercel frontend

**CONFIRMED.** Three routes pin the production frontend origin and will fail a browser call from any other host (including a client's domain, or localhost for these three):

- `api/health.js` L8-9
- `api/generate.js` L38-39
- `api/export.js` L11-12

`api/review-state.js` L11-21 and `api/reviewer-decisions.js` L10-11 allow that origin plus `http://localhost|127.0.0.1:<port>`. Most other routes reflect `req.headers.origin` (for example `api/analyse-statements.js` L29-31).

**What breaks if replaced.** Health, Generate, and Export from a non-Vercel frontend origin are blocked even if the backend is reachable.

**Smallest seam already partly exists.** `resolveReviewStateCorsOrigin` (`api/review-state.js` L17-21) is the allowlist pattern. Lift it to a shared helper driven by `CORS_ALLOW_ORIGIN` (comma-separated). Do not copy the reflect-Origin behaviour of analyse-statements onto authenticated routes without thinking.

---

## 2. Neon

**CONFIRMED.** The runtime driver is `@neondatabase/serverless` (`package.json` L30).

- `lib/db/client.mjs` L1 `import { neon } from "@neondatabase/serverless"`
- `lib/db/client.mjs` L5-15: `getSql()` reads `DATABASE_URL`, throws `DB_NOT_CONFIGURED` if unset, caches `neon(url)`
- `scripts/db/migrate.mjs` L4 same import; L19-25 requires `DATABASE_URL_UNPOOLED` (Neon pooled-vs-unpooled split)

Query shape is Neon's `sql.query(text, params)` returning an array of rows, not `pg`'s `{ rows }`:

- `lib/db/review-state.mjs` L26-27, L31-35
- `lib/db/reviewer-decisions.mjs` L8-9
- `lib/db/model-fingerprint-log.mjs` L9-10

Schema SQL is ordinary Postgres: `jsonb`, `bigserial`, `timestamptz`, `on conflict` (`db/migrations/001_review_state.sql`, `002_model_fingerprint_log.sql`, `003_reviewer_decisions.sql`). No Neon logical-replication, no `neon_http`, no vector types.

**Could the app run on any standard Postgres?** Yes, with a thin adapter. The SQL is standard. The coupling is the driver API (`neon()` HTTP, `sql.query` returning rows directly) and the unpooled URL name used only by migrate.

**What breaks if replaced.** `getSql()` and migrate throw or return a different row shape. Review autosave and reviewer-decisions 503 on missing DB (`api/reviewer-decisions.js` write path; B186 notes missing database returns 503 and Review continues). B101: present-and-failing `DATABASE_URL` is still an unhandled rejection.

**Smallest seam already exists.** `getSql()` is the only production constructor. Replace `neon(url)` with a `pg.Pool` wrapper that implements `.query(text, params) => rows`. Point `DATABASE_URL` at ordinary Postgres. Migrate can use the same client and drop `DATABASE_URL_UNPOOLED`.

**HYPOTHESIS.** Production `DATABASE_URL` is a Neon pooler URL (`-pooler` host). A standard Postgres URL would still work through the adapter.

---

## 3. File storage

**CONFIRMED. Uploaded source files are not stored.** They arrive as `contentBase64` on the request, are decoded in memory, converted to `.text`, and the bytes are discarded.

- Pipeline ingest: `lib/extract-text-from-source.mjs` L504-514 `prepareUploadedSourcesForPipeline`, L543 `contentBase64`, L614 `Buffer.from(s.contentBase64, "base64")`
- Review: `api/analyse-statements.js` L12, L165
- Draft extract: `api/extract-draft-text.js` L1, L20
- Summarize: `api/summarize-source.js` L1, L101-108
- Adapt: `api/adapt.js` L21, L45-46 (drops `contentBase64` when inline text is present), L59

Autosave deliberately omits blobs. F16 / `v8.73.0-review-state-no-blobs`: after refresh, PDF and Office sources must be re-uploaded because the backend refuses inline text for those types (`PDF_INLINE_TEXT_NOT_ALLOWED` / `OFFICE_INLINE_TEXT_NOT_ALLOWED`, `lib/extract-text-from-source.mjs` L547-568).

No S3, GCS, or Vercel Blob client exists in `api/` or `lib/`. **CONFIRMED** by search.

**What Pr14 needs to be storage-neutral (S3-compatible).**

Today the contract is: browser sends bytes in the Review POST. Pr14's contract (BACKLOG Pr14) is: browser uploads to object storage and sends a reference; the backend fetches server-side, so the 4.5 MB rule does not apply.

**Smallest seam.** Add an optional `storageKey` (or URL) on a source object next to `contentBase64`. In `prepareUploadedSourcesForPipeline`, if `storageKey` is set and bytes are absent, call a 15-line adapter `getObjectBytes(key) => Buffer`. Implement that adapter with the AWS SDK v3 (`S3Client` + `GetObjectCommand`) pointed at any S3-compatible endpoint (`endpoint`, `region`, `credentials`, `bucket` from env). Do not put bucket URLs in the frontend. The extractor already works from a Buffer (L614). Upload can be browser POST to a presigned URL issued by a new `/api/source-upload` route; that route is new work, not a change to QC.

A hosted Brightline deploy and a client-owned MinIO/S3 account then differ only by env.

---

## 4. Model provider

### The `callLLM` wrapper (seam already exists)

**CONFIRMED.** Almost all production LLM traffic goes through `callLLM` in `lib/observability.js` L462-571.

Construction: L6-16 `new OpenAI({ apiKey: openAiApiKey })` with no `baseURL`. Anthropic is a second provider in the same wrapper (L7-8, L16, L367-421). `callProviderOnceRaw` L423-435 always calls `openaiClient.chat.completions.create`. JSON mode uses OpenAI `response_format: { type: "json_object" }` (L432-433). Seed is forwarded when integer (L429-431). Pricing table L43-64 keys OpenAI snapshot names and Anthropic names.

`hasProviderApiKey` L358-363 knows only `"openai"` and `"anthropic"`.

`STAGE_MODELS` in `lib/qc/model-config.mjs` L19-45 pins dated OpenAI snapshots (`gpt-4o-2024-08-06`, `gpt-4o-mini-2024-07-18`, `gpt-5.1-2025-11-13`). Comment L1-17: never a floating alias.

### Production `callLLM` call sites

**CONFIRMED.**

Pipeline v4: `lib/qc/pipeline-v4/stage1-extract-statements.mjs` L306; `stage1b-extract-claim-spans.mjs` L116; `stage2-match-sources.mjs` L1122 and L1389; `stage2-match-multipassage.mjs` L171; `stage5-generate-commentary.mjs` L172.

Pipeline v3 (still shipped): `lib/qc/pipeline-v3/stage1-extract-statements.mjs` L185; `stage2-match-sources.mjs` L235; `stage5-generate-commentary.mjs` L144.

Editorial/compliance: `lib/qc/editorial-compliance-reviewer.mjs` L1575, L1623, L1722, L1914.

Other lib: `lib/qc/editorial-duplication-judge.mjs` L103; `lib/qc/framing-fidelity.mjs` L163; `lib/qc/llm-claim-extraction.mjs` L233; `lib/qc/llm-claim-verifier.mjs` L75; `lib/revise-actions/run.mjs` L304.

API routes: `api/generate.js` L785; `api/rewrite.js` L831; `api/adapt.js` L224; `api/suggest-revision.js` L156 and L181; `api/synthesize-review.js` L54; `api/constructive-feedback.js` L50 and L88; `api/summarize-source.js` L131; `api/summarize-source-usage.js` L49; `api/summarize-rewrite-label.js` L36; `api/query.js` L107; `api/query-sources.js` L148.

### Direct calls around the wrapper

**CONFIRMED.**

- `callOpenAI` (`lib/observability.js` L636-641) is deprecated and still used by `tests/r1_2_mini_eval/run_eval.mjs` L148 and `tests/r1_2_mini_eval/run_r1_2_2.mjs` L235. B179 residual: those bypass the spend accumulator.
- `api/web-test.js` L79-91 `fetch("https://api.openai.com/v1/responses", ...)` with `OPENAI_API_KEY`. Diagnostic route, not Review.
- `api/import-openai-test.js` L1-8 imports the OpenAI SDK only to prove the module loads.

### What an Azure OpenAI deployment inside a client's tenancy would need

**CONFIRMED** from the current constructor, plus **HYPOTHESIS** on Azure's exact wiring (not implemented here).

1. Point the OpenAI SDK at the Azure resource: `new OpenAI({ apiKey, baseURL, defaultQuery: { "api-version": process.env.OPENAI_API_VERSION }, defaultHeaders: { "api-key": process.env.OPENAI_API_KEY } })`. Today L15 only passes `apiKey`, so traffic always goes to `api.openai.com`.
2. Map `STAGE_MODELS` snapshot names to Azure *deployment* names. Azure uses the deployment name in the path, not `gpt-4o-2024-08-06`. A 10-line map `OPENAI_DEPLOYMENT_STAGE1=...` is enough if the client creates one deployment per pinned snapshot.
3. JSON `response_format` and `seed` must be confirmed on that Azure API version. **HYPOTHESIS:** chat completions JSON mode works on current Azure OpenAI; `seed` may be ignored.
4. `system_fingerprint` (Stage 2 drift alarm, B125) is an OpenAI-platform field. Azure may always return null. The alarm already treats empty sets as silent on gpt-5.1.
5. Prompt-prefix automatic caching (comment `lib/observability.js` L438-439) is OpenAI-platform behaviour. Azure pricing and cache semantics differ; `calculateLlmCostUsd` would under- or over-count until the Azure price rows are added.
6. `api/web-test.js` would still hit `api.openai.com` until rewritten or disabled.

**Smallest seam already exists:** `callLLM` + `callProviderOnceRaw`. Do not add a second client. Add `OPENAI_BASE_URL` (and optional API version) at L15, and a deployment-name override when reading `STAGE_MODELS`. Anthropic stays unused on a client that only offers Azure OpenAI.

---

## 5. Langfuse and logging

**CONFIRMED.** Langfuse is optional instrumentation around `callLLM`, not a control-plane.

Enablement: `lib/observability.js` L9-18. All three of `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` must be non-empty. Otherwise `langfuseClient` is null.

When absent, every Langfuse call returns immediately:

- `startTrace` L314-315 `if (!langfuseClient) return;`
- `updateTraceMetadata` L328-329
- `callLLM` generation block L481 `if (langfuseClient)`
- `logCanaryScore` L644-645
- `flushObservability` L657-658

Errors inside a Langfuse call are swallowed (`safeLangfuseCall` L68-74; flush L660-662). Review still runs.

Canaries (`logCanaryScore`) are how schema-failure tracking was meant to land in Langfuse (BACKLOG B12). They no-op without keys.

Diagnostics that *read* Langfuse (cost, reconstructing traces) fail soft: `scripts/diagnostic/noise-floor/REPORT.md` records `costUsd: null` when the trace is unreadable; `scripts/diagnostic/lib/langfuse-url.mjs` builds a URL if env is set.

`api/analyse-statements.js` L255 warns `[langfuse] outputType missing or invalid for qc-run trace` (metadata quality, not a hard dependency).

**What breaks if replaced / absent.** Nothing on the Review path. Cost lines that currently come from Langfuse traces in diagnostics go blank. Operators lose the trace UI.

**Smallest seam already exists.** Leave Langfuse optional. A client deploy simply omits the three env vars. Replacing it with another OTel exporter would wrap the same `startTrace` / generation / `logCanaryScore` functions.

---

## 6. Identity

**CONFIRMED.** There is no sign-in. Identity is an opaque browser string.

Frontend: `src/utils/reviewSession.js` L1 `OWNER_KEY = "blce.ownerKey"`, L62-71 `getOwnerKey()` creates a `crypto.randomUUID()` (or timestamp fallback), stores it in `localStorage`. `getReviewId()` L74-84 is a second UUID per review. Clearing site data creates a new owner.

Frontend sends it as `x-owner-key` (`src/utils/api.js` L348-349, L365-367).

Backend:

- Validate: `lib/db/review-state.mjs` L3-11 `OWNER_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/`
- Header read: `api/review-state.js` L54-57, L72-74; `api/reviewer-decisions.js` L40, L74-76
- `review_state.owner_key` (`db/migrations/001_review_state.sql` L3; load/save compare at `lib/db/review-state.mjs` L40-44, L60-62). One row per `review_id`; a different owner gets `owner_mismatch`.
- `reviewer_decisions.owner_key` (`db/migrations/003_reviewer_decisions.sql` L3; list filtered `lib/db/reviewer-decisions.mjs` L68-77). Append-only. GET is that owner's rows for one review, cap 200.

Review itself (`api/analyse-statements.js`) does not read `x-owner-key`. QC is unaudited by owner.

**What a standard sign-in (OIDC, for example Microsoft Entra ID) would attach to.**

The durable key is `owner_key`, not the review id. Attach the IdP subject (`sub`, or Entra `oid`) to that column:

1. Frontend stops minting UUIDs in `getOwnerKey()`. After OIDC, send `sub` (still matching `OWNER_KEY_RE`, or widen the regex to accept Entra GUIDs).
2. Backend optionally verifies the bearer token and ignores a spoofed header. Today any caller who knows a key can read that owner's rows. **CONFIRMED:** no signature check exists.
3. Do not invent a second user table until accounts need email, house name, or roles. `owner_key = sub` is enough for "saved reviews per person".
4. `review_id` stays a client-generated document id. A user can have many reviews; that is already the table shape (decisions keyed by `owner_key, review_id`).
5. `review_state` remains one active snapshot per `review_id`, not a library (Pr13). Accounts do not by themselves create a review list; that is extra UI on top of GET-by-owner.

**Smallest seam already exists.** `validateOwnerKey` + `x-owner-key` + `owner_key` column. OIDC fills the same string.

---

## 7. House name and per-client settings

Deployment-wide settings that should belong to a client or user:

| Setting | Where | What should own it |
| --- | --- | --- |
| `AUTHORING_ORGANISATION` | `lib/qc/first-person-actor.mjs` L22, L52-59 (env after request); `api/_lib/env-flags.js` L14 (health pill); health `ok` requires it non-null (`env-flags.js` L21) | User or client. Request field `authoringOrganisation` already parsed on analyse-statements (**CONFIRMED** resolver precedence L48-59) but the frontend does not send it (B95). |
| Style-guide client layer | `lib/qc/style-guide.mjs` L208-213 `selectStyleGuideClient` always returns `"CLIENT"` | Per-client rule pack. Hook exists; no second client. |
| Writing event scaffolds | `lib/prompt-library/pg-writing-prompts.mjs` L9-12 `PG_WRITING_EVENT`. File comment L3: house identity comes from the configured organisation, not a hardcoded firm. | Per-client prompt library (WR2). Event keys are global; bindings should not be. |
| House word limits | `api/health.js` L16-27 `buildHouseWordLimits()` from the PG prompt library; frontend pre-fills the writer-set ceiling (B188) | Per-client / per-output-type. Already returned as data, but sourced from one library. |
| `BRIGHTLINE_EDITORIAL_REVIEW` | `api/_lib/env-flags.js` L8-9; must be `"1"` for health `ok` | Could stay deployment-wide (product switch) or become a client flag. |
| `QC_PIPELINE_V4` | `env-flags.js` L13; `api/analyse-statements.js` L246 | Deployment. Not per-user. |
| `REVISE_ACTION_LIST` | `env-flags.js` L3-5 | Deployment feature flag. Frontend has a matching `VITE_REVISE_ACTION_LIST` (B190). |
| OpenAI / Anthropic / Langfuse / `DATABASE_URL` | process env | Deployment (or client tenancy). |

**CONFIRMED.** One process, one house name. B96/B124: every tenant on a deployment shares `AUTHORING_ORGANISATION`. B171: Ben wants the user to supply it.

**Smallest seam already exists.** `resolveAuthoringOrganisationResolution` request field. Wire the frontend (or a future account profile) to send `authoringOrganisation`. Do not remove the env fallback until every caller sends the field (B155: do not remove `AUTHORING_ORGANISATION`).

---

## 8. Frontend: Vercel-hosted backend URL

**CONFIRMED** (frontend repo, read-only).

`src/utils/api.js` `getApiBase` L12-49:

1. `VITE_API_BASE_URL` if set
2. Vite `import.meta.env.DEV`: relative `""` so `/api` is proxied (`vite.config.js` L40 `target: "http://localhost:3000"`)
3. Hostname `brightline-content-engine-frontend.vercel.app` falls back to `https://brightline-content-engine-backend.vercel.app` (L36-49)
4. Any other deployed origin throws if `VITE_API_BASE_URL` is unset (L41-46), with an error that names Vercel Environment Variables

Backend CORS for health/generate/export (section 1) assumes that same frontend host.

Diagnostic scripts default `QC_REGRESSION_BASE_URL` to `https://brightline-content-engine-backend.vercel.app` (several files under `scripts/diagnostic/`). Not the live UI path.

**What breaks if replaced.** A client-hosted frontend on another domain must set `VITE_API_BASE_URL` and the backend CORS allowlist. Local dev already does not assume Vercel.

**Smallest seam already exists.** `VITE_API_BASE_URL`. Remove the hardcoded production fallback once every deploy sets the var. Mirror the allowlist on the three pinned CORS routes.

---

## Five changes (smallest first)

To run this backend as an ordinary container against ordinary Postgres, S3-compatible storage, an Azure OpenAI endpoint, and an OIDC sign-in. Not built here.

1. **S. Azure-ready OpenAI client.** Pass `baseURL` (and Azure `api-version` / `api-key` header) into `new OpenAI(...)` at `lib/observability.js` L15. Map `STAGE_MODELS` names to deployment names via env. `callLLM` already is the seam. Disable or rewrite `api/web-test.js`.
2. **S. Postgres driver adapter.** Replace `neon(url)` in `lib/db/client.mjs` L13 with a `pg` pool whose `.query(text, params)` returns rows. Use one `DATABASE_URL`. Migrate drops `DATABASE_URL_UNPOOLED`. Schema SQL unchanged.
3. **M. HTTP wrapper + CORS from env.** One small Node server that routes `/api/:name` to the existing `handler(req, res)` functions. Set `CORS_ALLOW_ORIGIN`. Stop reading `VERCEL_ENV`. This removes the 4.5 MB edge cap and the 60s platform cap; keep extractor timeouts explicit. No Dockerfile exists today.
4. **M. S3-compatible source bytes.** Adapter `getObjectBytes(key)` behind `prepareUploadedSourcesForPipeline`. Presigned upload route. Request carries `storageKey` instead of `contentBase64`. Storage-neutral for AWS S3, MinIO, or a client's bucket. This is Pr14's smallest useful slice.
5. **L. OIDC (Entra ID) on `owner_key`.** Verify bearer token; set `owner_key` from `sub`/`oid`. Frontend `getOwnerKey()` stops minting localStorage UUIDs. Same two tables. House name moves from env to the user's account (or the request field that already exists) as part of this, not as a sixth rewrite of QC.

Langfuse stays optional and is omitted on a client that does not want it. Anthropic stays unused if Azure OpenAI is the only provider.
