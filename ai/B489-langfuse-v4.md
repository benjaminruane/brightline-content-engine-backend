BUILD SPEC. Ids: B489.

WHY
Langfuse Cloud removes the v3 ingestion API and the v1 trace and observation reads on 2026-11-16. This repo still wrote traces with the `langfuse` v3 client and still read `GET /api/public/traces` and `GET /api/public/observations` from four diagnostic scripts. After that date those calls stop. The Review path must keep the same function names. A missing host must stay off, not fall through to cloud.langfuse.com.

======================================================================
PART 0A. CLAIMS. STOP IF A BLOCKING ONE IS FALSE.
======================================================================
C1 BLOCKING. The only production Langfuse client is `lib/observability.js`. CONFIRMED before the change: `import { Langfuse } from "langfuse"`.
C2 BLOCKING. No Langfuse SDK in the frontend repo. CONFIRMED by search. The frontend is not edited.
C3 CHECK. `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`, and `LANGFUSE_BASE_URL` are unset in the process environment. Code-only mode. Do not install the Langfuse CLI. Do not ask for credentials.
C4 CHECK. Node engines are 22.x. SDK v6 requires Node 22 or later and Langfuse Cloud or self-hosted 4.59.0 or later.

======================================================================
PART 0B. DESIGN. Agree, amend, or reject each. Then build.
======================================================================
D1 AGREE. Install `@langfuse/tracing`, `@langfuse/otel`, and `@langfuse/client` at 6.1.1. Remove the `langfuse` v3 package. Declare `@opentelemetry/api` 1.9.0 and `@opentelemetry/sdk-trace` 2.12.1, because the tracer imports them and sdk-trace 2.12.1 does not accept `@opentelemetry/api` 1.10.
D2 AGREE. Keep `startTrace`, `updateTraceMetadata`, `createTraceId`, `callLLM`, `callOpenAI`, `logCanaryScore`, and `flushObservability`. Put the SDK in `lib/langfuse-tracing.mjs`.
D3 AGREE. One root observation per trace, named with the trace name. Force a 32-hex trace id. A UUID drops hyphens. Any other string is sha256, first 32 hex, and the mapping is logged once. `createTraceId` returns 32 hex.
D4 AGREE. `propagateAttributes` carries the trace name. Metadata over 200 encoded characters stays on the root and is not propagated. No session id and no user id are invented.
D5 AGREE. Usage buckets are exclusive. Cached input is `input_cached_tokens`. `input` is the remainder. Do not send `costDetails`. Keep `metadata.cachedInputTokens`, `metadata.cacheHitRate`, and `metadata.estimatedCostUsd`.
D6 AGREE. Scores stay trace-level via `LangfuseClient.score.create`. Canary scores are candidate targets, not a project-verified evaluator contract. Do not create or delete evaluator rules.
D7 AGREE. Diagnostic reads use `GET /api/public/v2/observations` with a required time window from 2026-01-01 to now, cursor pages, and parsed input and output. A missing window is refused. Cost is the sum of observation `totalCost`.
D8 AGREE. If keys are set and both URL variables are empty, log and stay off. Accept `LANGFUSE_HOST` when `LANGFUSE_BASE_URL` is empty. Do not map `VERCEL_ENV` onto the tracing environment. Release is `LANGFUSE_RELEASE` or else `VERCEL_GIT_COMMIT_SHA`.
D9 AGREE. Tests use an in-memory span exporter and a fake score client. They do not call Langfuse.

======================================================================
PART 1. SDK
======================================================================
Replace the v3 client. Immediate export. Media upload off. Instrumentation errors are logged and do not fail the review. Enable a synchronous OpenTelemetry context manager before the first span, or a child observation starts a second trace.

======================================================================
PART 2. READS
======================================================================
Move `scripts/diagnostic/b60-money/run-shadow.mjs`, `scripts/diagnostic/noise-floor/run-category-noise-floor.mjs`, `scripts/diagnostic/r7-percent-extract-gate.mjs`, and `scripts/diagnostic/r7-supersession-gate-b.mjs` onto the v2 helper.

======================================================================
PART 3. DOCS
======================================================================
Update `docs/PORTABILITY.md` section 5, `README.md`, `docs/SPEND_LEDGER.md` (definition only, historical rows unchanged), `scripts/diagnostic/switch-census/ENV-CHECKLIST.md`, and `tests/r1_2_mini_eval/README.md`. Add the B489 backlog row.

======================================================================
SHIP
======================================================================
Backend only. No model calls. USD 0. Browser skipped: no visible surface. Project access, evaluators, exports, and a live ingestion check stay blocked until credentials exist outside this chat. Do not describe the work as shipped while the tree is dirty or unpushed.
