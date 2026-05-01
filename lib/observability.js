import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { Langfuse } from "langfuse";

const openAiApiKey = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
const langfusePublicKey =
  typeof process.env.LANGFUSE_PUBLIC_KEY === "string" ? process.env.LANGFUSE_PUBLIC_KEY.trim() : "";
const langfuseSecretKey =
  typeof process.env.LANGFUSE_SECRET_KEY === "string" ? process.env.LANGFUSE_SECRET_KEY.trim() : "";
const langfuseHost = typeof process.env.LANGFUSE_HOST === "string" ? process.env.LANGFUSE_HOST.trim() : "";

const openaiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;

const langfuseEnabled = Boolean(langfusePublicKey && langfuseSecretKey && langfuseHost);
const langfuseClient = langfuseEnabled
  ? new Langfuse({
      publicKey: langfusePublicKey,
      secretKey: langfuseSecretKey,
      baseUrl: langfuseHost,
    })
  : null;
const traceMetadataCache = new Map();
const TRACE_METADATA_KEYS = new Set([
  "draftHash",
  "draftCharCount",
  "statementCount",
  "sourceCount",
  "sourceLabels",
  "outputType",
  "requiredVersion",
  "runStartedAt",
]);

function safeLangfuseCall(fn) {
  try {
    return fn();
  } catch (err) {
    console.error("[langfuse] instrumentation error", err?.message || String(err));
    return null;
  }
}

function getTraceIdentifiers(options = {}) {
  const traceId =
    typeof options.traceId === "string" && options.traceId.trim() ? options.traceId.trim() : randomUUID();
  const traceName =
    typeof options.traceName === "string" && options.traceName.trim()
      ? options.traceName.trim()
      : "openai-completion";
  return { traceId, traceName };
}

function sanitizeTraceMetadata(input) {
  if (!input || typeof input !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!TRACE_METADATA_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function createTraceId() {
  return randomUUID();
}

export function startTrace({ traceId, traceName, metadata } = {}) {
  if (!langfuseClient) return;
  const { traceId: resolvedTraceId, traceName: resolvedTraceName } = getTraceIdentifiers({ traceId, traceName });
  const safeMetadata = sanitizeTraceMetadata(metadata);
  traceMetadataCache.set(resolvedTraceId, { ...safeMetadata });
  safeLangfuseCall(() =>
    langfuseClient.trace({
      id: resolvedTraceId,
      name: resolvedTraceName,
      metadata: Object.keys(safeMetadata).length ? safeMetadata : undefined,
    })
  );
}

export function updateTraceMetadata(traceId, metadataPatch) {
  if (!langfuseClient) return;
  if (typeof traceId !== "string" || !traceId.trim()) return;
  if (!metadataPatch || typeof metadataPatch !== "object") return;
  const cleanTraceId = traceId.trim();
  const safePatch = sanitizeTraceMetadata(metadataPatch);
  if (Object.keys(safePatch).length === 0) return;
  const current = traceMetadataCache.get(cleanTraceId) || {};
  const next = { ...current, ...safePatch };
  traceMetadataCache.set(cleanTraceId, next);
  try {
    const trace = langfuseClient.trace({ id: cleanTraceId });
    if (trace && typeof trace.update === "function") {
      trace.update({ metadata: next });
      return;
    }
    langfuseClient.trace({ id: cleanTraceId, metadata: next });
  } catch (err) {
    console.warn("[langfuse] trace.update failed", err?.message || String(err));
  }
}

export function hasOpenAIClient() {
  return Boolean(openaiClient);
}

export async function callOpenAI(params, options = {}) {
  if (!openaiClient) {
    throw new Error("Server is missing OPENAI_API_KEY");
  }

  const startedAt = Date.now();
  const { traceId, traceName } = getTraceIdentifiers(options);
  const spanName =
    typeof options.spanName === "string" && options.spanName.trim() ? options.spanName.trim() : "openai-call";
  const metadata = options.metadata && typeof options.metadata === "object" ? options.metadata : {};

  let generation = null;
  if (langfuseClient) {
    const trace = safeLangfuseCall(() =>
      langfuseClient.trace({
        id: traceId,
        name: traceName,
      })
    );
    generation = safeLangfuseCall(() =>
      trace?.generation({
        name: spanName,
        model: typeof params?.model === "string" ? params.model : undefined,
        input: params?.messages ?? null,
        metadata,
      })
    );
  }

  try {
    const response = await openaiClient.chat.completions.create(params);
    if (generation) {
      safeLangfuseCall(() =>
        generation.end({
          output: response?.choices?.[0]?.message?.content ?? null,
          usage: response?.usage ?? null,
          metadata: {
            ...metadata,
            latencyMs: Date.now() - startedAt,
          },
        })
      );
    }
    return response;
  } catch (err) {
    if (generation) {
      safeLangfuseCall(() =>
        generation.end({
          level: "ERROR",
          statusMessage: err?.message || String(err),
          metadata: {
            ...metadata,
            latencyMs: Date.now() - startedAt,
          },
        })
      );
    }
    throw err;
  }
}

export function logCanaryScore({ traceId, name, value = 1, comment = null, metadata = null }) {
  if (!langfuseClient || typeof traceId !== "string" || !traceId.trim()) return;
  safeLangfuseCall(() =>
    langfuseClient.score({
      traceId,
      name,
      value,
      comment: typeof comment === "string" ? comment : undefined,
      metadata: metadata && typeof metadata === "object" ? metadata : undefined,
    })
  );
}

export async function flushObservability() {
  if (!langfuseClient) return;
  try {
    await langfuseClient.flushAsync();
  } catch (err) {
    console.error("[langfuse] flush failed", err?.message || String(err));
  }
}
