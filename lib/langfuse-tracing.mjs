/**
 * Langfuse JS SDK v6 (OpenTelemetry ingestion, v4 data model).
 *
 * The v3 `langfuse` client wrote trace and observation events to
 * POST /api/public/ingestion. That path is removed on Langfuse Cloud on
 * 2026-11-16. Spans now export to POST /api/public/otel/v1/traces with the
 * v4 ingestion header. Scores go to POST /api/public/scores.
 *
 * Delivery is not the same as the v3 flush queue. Each span is exported when
 * it ends (`exportMode: "immediate"`, the serverless setting). Scores stay
 * in the client queue until `flushLangfuse`. A failed export is logged and
 * does not fail the review. `flushLangfuse` waits for in-flight span exports
 * and the score queue. It does not retry a span the exporter already dropped.
 *
 * SDK v6 requires Langfuse Cloud, or self-hosted Langfuse v4.59.0 or later.
 * Node.js 22 or later is required (`package.json` engines).
 */
import { createHash, randomBytes } from "node:crypto";
import { context, trace, TraceFlags } from "@opentelemetry/api";
import { StackContextManager, TracerProvider } from "@opentelemetry/sdk-trace";
import { LangfuseClient } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, setLangfuseTracerProvider, startObservation } from "@langfuse/tracing";

const HEX_32 = /^[0-9a-f]{32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Remote parent so the new span keeps this trace id and is still an app root. */
const EXTERNAL_PARENT_SPAN_ID = "0000000000000001";
const PROPAGATED_ENCODED_MAX = 200;

const hashedTraceIds = new Set();
const roots = new Map();

let runtime = null;
let testExporter = null;
let testClient = null;
let contextManagerEnabled = false;

export function useLangfuseSpanExporterForTests(exporter) {
  testExporter = exporter;
}

export function useLangfuseClientForTests(client) {
  testClient = client;
}

export function resetLangfuseRootsForTests() {
  roots.clear();
}

function envTrim(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function langfuseBaseUrl() {
  return envTrim("LANGFUSE_BASE_URL") || envTrim("LANGFUSE_HOST");
}

export function newLangfuseTraceId() {
  return randomBytes(16).toString("hex");
}

/**
 * W3C trace ids are 32 lowercase hex characters. A UUID is accepted by
 * stripping hyphens. Any other string is hashed so spans and scores that
 * share the caller's id still share one Langfuse trace.
 * @param {string} raw
 * @returns {string|null}
 */
export function toLangfuseTraceId(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (HEX_32.test(lower)) return lower;
  if (UUID_RE.test(lower)) return lower.replace(/-/g, "");
  const derived = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
  if (!hashedTraceIds.has(trimmed)) {
    hashedTraceIds.add(trimmed);
    console.warn(
      `[langfuse] trace id ${JSON.stringify(trimmed)} is not a 32-hex W3C id. Langfuse trace id is ${derived}.`
    );
  }
  return derived;
}

/**
 * Usage buckets are mutually exclusive. OpenAI's input count includes cached
 * tokens, so those tokens move to `input_cached_tokens` and `input` is the
 * remainder. `total` is the sum of the buckets.
 * @param {object|null|undefined} usage
 */
export function langfuseUsageDetails(usage) {
  if (!usage || typeof usage !== "object") {
    return { input: 0, output: 0, total: 0 };
  }
  const inputTokens =
    Number(usage.inputTokens) ||
    Number(usage.prompt_tokens) ||
    Number(usage.promptTokens) ||
    Number(usage.input_tokens) ||
    0;
  const outputTokens =
    Number(usage.outputTokens) ||
    Number(usage.completion_tokens) ||
    Number(usage.completionTokens) ||
    Number(usage.output_tokens) ||
    0;
  const cachedRaw =
    Number(usage.cachedInputTokens) ||
    Number(usage.cached_tokens) ||
    Number(usage.prompt_tokens_details?.cached_tokens) ||
    0;
  const cachedInputTokens = Math.min(inputTokens, cachedRaw > 0 ? cachedRaw : 0);
  const fresh = inputTokens - cachedInputTokens;
  const details = {
    input: fresh,
    output: outputTokens,
    total: fresh + cachedInputTokens + outputTokens,
  };
  if (cachedInputTokens > 0) details.input_cached_tokens = cachedInputTokens;
  return details;
}

function propagatedMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    let encoded;
    try {
      encoded = JSON.stringify(value);
    } catch (err) {
      console.warn(`[langfuse] metadata.${key} is not JSON. It is not propagated.`, err?.message || String(err));
      continue;
    }
    if (encoded.length > PROPAGATED_ENCODED_MAX) {
      console.warn(
        `[langfuse] metadata.${key} encodes to ${encoded.length} characters. The 200 character propagation limit drops it from child observations. It remains on the root observation.`
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

function ensureLangfuse() {
  if (runtime) return runtime.enabled ? runtime : null;
  const publicKey = envTrim("LANGFUSE_PUBLIC_KEY");
  const secretKey = envTrim("LANGFUSE_SECRET_KEY");
  const baseUrl = langfuseBaseUrl();
  if (!publicKey || !secretKey || !baseUrl) {
    if ((publicKey || secretKey) && !baseUrl) {
      console.warn(
        "[langfuse] LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY is set, and both LANGFUSE_BASE_URL and LANGFUSE_HOST are empty. Tracing is off. This does not fall through to cloud.langfuse.com."
      );
    }
    runtime = { enabled: false };
    return null;
  }

  const release = envTrim("LANGFUSE_RELEASE") || envTrim("VERCEL_GIT_COMMIT_SHA") || undefined;
  const environment = envTrim("LANGFUSE_TRACING_ENVIRONMENT") || undefined;
  if (!environment) {
    console.warn(
      "[langfuse] LANGFUSE_TRACING_ENVIRONMENT is unset. Traces use the SDK default environment. Set it to separate production from local runs."
    );
  }
  let host = baseUrl;
  try {
    host = new URL(baseUrl).host;
  } catch {
    console.warn(`[langfuse] base URL ${JSON.stringify(baseUrl)} is not a URL. Tracing is off.`);
    runtime = { enabled: false };
    return null;
  }

  // Without a context manager, context.with does not make a span active, and a
  // child observation starts a second trace. This manager is synchronous. The
  // generation is opened before the provider call awaits, and the stored
  // context is re-entered when the child starts.
  if (!contextManagerEnabled) {
    const manager = new StackContextManager();
    manager.enable();
    context.setGlobalContextManager(manager);
    contextManagerEnabled = true;
  }

  const processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    exportMode: "immediate",
    mediaUploadEnabled: false,
    ...(release ? { release } : {}),
    ...(environment ? { environment } : {}),
    ...(testExporter ? { exporter: testExporter } : {}),
  });
  const provider = new TracerProvider({ spanProcessors: [processor] });
  setLangfuseTracerProvider(provider);
  const client =
    testClient ||
    new LangfuseClient({
      publicKey,
      secretKey,
      baseUrl,
    });
  runtime = { enabled: true, processor, client };
  const releaseLabel = release ? (envTrim("LANGFUSE_RELEASE") ? "LANGFUSE_RELEASE" : "VERCEL_GIT_COMMIT_SHA") : "unset";
  console.info(
    `[langfuse] sdk=@langfuse/tracing@6.1.1 ingestion=otlp/v4 host=${host} release=${releaseLabel} environment=${environment || "unset"}`
  );
  return runtime;
}

function parentForTrace(traceId) {
  return {
    traceId,
    spanId: EXTERNAL_PARENT_SPAN_ID,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true,
  };
}

function captureContext(traceName, metadata, root) {
  return propagateAttributes(
    {
      traceName,
      metadata: propagatedMetadata(metadata),
    },
    () => trace.setSpan(context.active(), root.otelSpan)
  );
}

function ensureRoot({ traceId, traceName, metadata, kind, input }) {
  const id = toLangfuseTraceId(traceId);
  if (!id) return null;
  const name = typeof traceName === "string" && traceName.trim() ? traceName.trim() : "llm-completion";
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const existing = roots.get(id);
  if (existing) {
    if (kind === "pipeline" && Object.keys(safeMetadata).length > 0) {
      existing.metadata = { ...existing.metadata, ...safeMetadata };
      existing.root.update({ metadata: existing.metadata, input: existing.metadata });
      existing.stored = context.with(trace.setSpan(context.active(), existing.root.otelSpan), () =>
        captureContext(existing.traceName, existing.metadata, existing.root)
      );
    }
    return existing;
  }

  const rootInput = kind === "pipeline" ? safeMetadata : input ?? null;
  let root;
  const stored = propagateAttributes(
    {
      traceName: name,
      metadata: propagatedMetadata(safeMetadata),
    },
    () => {
      root = startObservation(
        name,
        {
          input: rootInput,
          metadata: safeMetadata,
        },
        { parentSpanContext: parentForTrace(id) }
      );
      return trace.setSpan(context.active(), root.otelSpan);
    }
  );
  const entry = {
    id,
    traceName: name,
    kind,
    metadata: { ...safeMetadata },
    root,
    stored,
    ended: false,
  };
  roots.set(id, entry);
  return entry;
}

export function startLangfuseTrace({ traceId, traceName, metadata } = {}) {
  if (!ensureLangfuse()) return;
  try {
    ensureRoot({
      traceId,
      traceName,
      metadata,
      kind: "pipeline",
      input: metadata,
    });
  } catch (err) {
    console.error("[langfuse] instrumentation error", err?.message || String(err));
  }
}

export function updateLangfuseTraceMetadata(traceId, metadataPatch) {
  if (!ensureLangfuse()) return;
  if (!metadataPatch || typeof metadataPatch !== "object") return;
  try {
    const entry = roots.get(toLangfuseTraceId(traceId) || "");
    if (!entry) {
      console.warn("[langfuse] updateTraceMetadata had no root observation for this trace id. The patch was not written.");
      return;
    }
    ensureRoot({
      traceId,
      traceName: entry.traceName,
      metadata: metadataPatch,
      kind: entry.kind,
    });
  } catch (err) {
    console.warn("[langfuse] trace metadata update failed", err?.message || String(err));
  }
}

export function openLangfuseGeneration({ traceId, traceName, spanName, model, input, metadata } = {}) {
  if (!ensureLangfuse()) return null;
  try {
    const entry = ensureRoot({
      traceId,
      traceName,
      metadata,
      kind: "call",
      input,
    });
    if (!entry) return null;
    let generation = null;
    context.with(entry.stored, () => {
      // Pass the parent explicitly. startSpan treats an omitted context as the
      // root context, so a generation opened only inside context.with would
      // start a second trace.
      generation = startObservation(
        spanName,
        {
          model,
          input: input ?? null,
          metadata: metadata && typeof metadata === "object" ? metadata : {},
        },
        { asType: "generation", parentSpanContext: entry.root.otelSpan.spanContext() }
      );
    });
    if (!generation) return null;
    return {
      succeed({ output, usage, metadata: endMetadata } = {}) {
        try {
          generation.update({
            output: output ?? null,
            usageDetails: langfuseUsageDetails(usage),
            metadata: endMetadata && typeof endMetadata === "object" ? endMetadata : undefined,
          });
          generation.end();
          if (entry.kind === "call") {
            entry.root.update({ output: output ?? null });
          }
        } catch (err) {
          console.error("[langfuse] instrumentation error", err?.message || String(err));
        }
      },
      fail({ statusMessage, metadata: endMetadata } = {}) {
        try {
          generation.update({
            level: "ERROR",
            statusMessage: statusMessage || "error",
            metadata: endMetadata && typeof endMetadata === "object" ? endMetadata : undefined,
          });
          generation.end();
        } catch (err) {
          console.error("[langfuse] instrumentation error", err?.message || String(err));
        }
      },
    };
  } catch (err) {
    console.error("[langfuse] instrumentation error", err?.message || String(err));
    return null;
  }
}

export function recordLangfuseScore({ traceId, name, value = 1, comment = null, metadata = null } = {}) {
  const rt = ensureLangfuse();
  if (!rt) return;
  const id = toLangfuseTraceId(traceId);
  if (!id) {
    console.warn("[langfuse] score dropped. traceId is empty.");
    return;
  }
  if (typeof name !== "string" || !name.trim()) {
    console.warn("[langfuse] score dropped. name is empty.");
    return;
  }
  try {
    rt.client.score.create({
      traceId: id,
      name: name.trim(),
      value,
      ...(typeof comment === "string" ? { comment } : {}),
      ...(metadata && typeof metadata === "object" ? { metadata } : {}),
    });
  } catch (err) {
    console.error("[langfuse] instrumentation error", err?.message || String(err));
  }
}

export async function flushLangfuse() {
  const rt = ensureLangfuse();
  if (!rt) return;
  try {
    for (const entry of roots.values()) {
      if (entry.ended) continue;
      if (entry.kind === "pipeline") {
        entry.root.update({ output: entry.metadata });
      }
      entry.root.end();
      entry.ended = true;
    }
    await rt.processor.forceFlush();
    if (typeof rt.client.flush === "function") await rt.client.flush();
  } catch (err) {
    console.error("[langfuse] flush failed", err?.message || String(err));
  }
}
