import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { Langfuse } from "langfuse";

const openAiApiKey = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
const anthropicApiKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" ? process.env.ANTHROPIC_API_KEY.trim() : "";
const langfusePublicKey =
  typeof process.env.LANGFUSE_PUBLIC_KEY === "string" ? process.env.LANGFUSE_PUBLIC_KEY.trim() : "";
const langfuseSecretKey =
  typeof process.env.LANGFUSE_SECRET_KEY === "string" ? process.env.LANGFUSE_SECRET_KEY.trim() : "";
const langfuseHost = typeof process.env.LANGFUSE_HOST === "string" ? process.env.LANGFUSE_HOST.trim() : "";

const openaiClient = openAiApiKey ? new OpenAI({ apiKey: openAiApiKey }) : null;
const anthropicClient = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

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
  "pipelineRoute",
]);

const PRICING = {
  openai: {
    "gpt-4o": { input: 2.5, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-5": { input: 1.25, output: 10.0 },
    "gpt-5-mini": { input: 0.25, output: 2.0 },
  },
  anthropic: {
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
    "claude-opus-4-7": { input: 5.0, output: 25.0 },
  },
};

let didWarnCallOpenAIDeprecated = false;

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
    typeof options.traceName === "string" && options.traceName.trim() ? options.traceName.trim() : "llm-completion";
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

function stringifyMessageContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function convertOpenAIMessagesToAnthropic(messages = []) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const systemParts = [];
  const anthropicMessages = [];
  for (const msg of safeMessages) {
    const role = typeof msg?.role === "string" ? msg.role : "";
    const contentText = stringifyMessageContent(msg?.content);
    if (!contentText) continue;
    if (role === "system") {
      systemParts.push(contentText);
      continue;
    }
    const outRole = role === "assistant" ? "assistant" : "user";
    anthropicMessages.push({ role: outRole, content: contentText });
  }
  if (anthropicMessages.length === 0) {
    anthropicMessages.push({ role: "user", content: "" });
  }
  return {
    system: systemParts.join("\n\n").trim() || undefined,
    messages: anthropicMessages,
  };
}

function extractTextFromAnthropicResponse(response) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const text = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return text;
}

function extractToolJsonTextFromAnthropicResponse(response, toolName) {
  const blocks = Array.isArray(response?.content) ? response.content : [];
  const toolBlock = blocks.find((b) => b && b.type === "tool_use" && b.name === toolName);
  if (!toolBlock || typeof toolBlock.input !== "object" || toolBlock.input == null) return "";
  return JSON.stringify(toolBlock.input);
}

function looksLikeValidJson(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function resolveUsageForCost(usage) {
  if (!usage || typeof usage !== "object") return { inputTokens: 0, outputTokens: 0 };
  const inputTokens =
    Number(usage.inputTokens) || Number(usage.prompt_tokens) || Number(usage.promptTokens) || Number(usage.input_tokens) || 0;
  const outputTokens =
    Number(usage.outputTokens) ||
    Number(usage.completion_tokens) ||
    Number(usage.completionTokens) ||
    Number(usage.output_tokens) ||
    0;
  return { inputTokens, outputTokens };
}

export function calculateLlmCostUsd(provider, model, usage) {
  const providerKey = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const modelKey = typeof model === "string" ? model.trim() : "";
  const rate = PRICING?.[providerKey]?.[modelKey];
  if (!rate) return 0;
  const { inputTokens, outputTokens } = resolveUsageForCost(usage);
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

export function getLlmPricingTable() {
  return PRICING;
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

export function hasAnthropicClient() {
  return Boolean(anthropicClient);
}

export function hasProviderApiKey(provider) {
  const p = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (p === "anthropic") return Boolean(anthropicClient);
  if (p === "openai") return Boolean(openaiClient);
  return false;
}

async function callProviderOnce({ provider, model, messages, temperature = 0, responseFormat }) {
  const cleanProvider = String(provider || "openai").trim().toLowerCase();
  if (cleanProvider === "anthropic") {
    if (!anthropicClient) throw new Error("Server is missing ANTHROPIC_API_KEY");
    const converted = convertOpenAIMessagesToAnthropic(messages);
    if (responseFormat === "json") {
      const toolName = "json_response";
      const raw = await anthropicClient.messages.create({
        model,
        temperature,
        max_tokens: 4096,
        system: converted.system,
        messages: converted.messages,
        tools: [
          {
            name: toolName,
            description: "Return the JSON result object.",
            input_schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      });
      const text = extractToolJsonTextFromAnthropicResponse(raw, toolName);
      return {
        text,
        usage: {
          inputTokens: Number(raw?.usage?.input_tokens) || 0,
          outputTokens: Number(raw?.usage?.output_tokens) || 0,
        },
        raw,
      };
    }
    const raw = await anthropicClient.messages.create({
      model,
      temperature,
      max_tokens: 4096,
      system: converted.system,
      messages: converted.messages,
    });
    const text = extractTextFromAnthropicResponse(raw);
    return {
      text,
      usage: {
        inputTokens: Number(raw?.usage?.input_tokens) || 0,
        outputTokens: Number(raw?.usage?.output_tokens) || 0,
      },
      raw,
    };
  }

  if (!openaiClient) throw new Error("Server is missing OPENAI_API_KEY");
  const params = {
    model,
    temperature,
    messages: Array.isArray(messages) ? messages : [],
  };
  if (responseFormat === "json") {
    params.response_format = { type: "json_object" };
  }
  const raw = await openaiClient.chat.completions.create(params);
  const text = raw?.choices?.[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      inputTokens: Number(raw?.usage?.prompt_tokens) || 0,
      outputTokens: Number(raw?.usage?.completion_tokens) || 0,
    },
    raw,
  };
}

export async function callLLM({
  provider = "openai",
  model,
  messages,
  temperature = 0,
  responseFormat,
  traceId,
  traceName,
  spanName,
  metadata,
} = {}) {
  const cleanProvider = String(provider || "openai").trim().toLowerCase();
  const startedAt = Date.now();
  const traceInfo = getTraceIdentifiers({ traceId, traceName });
  const span = typeof spanName === "string" && spanName.trim() ? spanName.trim() : "llm-call";
  const spanMetadata = metadata && typeof metadata === "object" ? metadata : {};

  let generation = null;
  if (langfuseClient) {
    const trace = safeLangfuseCall(() =>
      langfuseClient.trace({
        id: traceInfo.traceId,
        name: traceInfo.traceName,
      })
    );
    generation = safeLangfuseCall(() =>
      trace?.generation({
        name: span,
        model: typeof model === "string" ? model : undefined,
        input: messages ?? null,
        metadata: { ...spanMetadata, provider: cleanProvider },
      })
    );
  }

  try {
    let attempt = await callProviderOnce({
      provider: cleanProvider,
      model,
      messages,
      temperature,
      responseFormat,
    });
    let retriedForSchema = false;
    if (responseFormat === "json" && !looksLikeValidJson(attempt.text)) {
      retriedForSchema = true;
      attempt = await callProviderOnce({
        provider: cleanProvider,
        model,
        messages,
        temperature,
        responseFormat,
      });
    }

    const latencyMs = Date.now() - startedAt;
    const out = {
      text: attempt.text,
      usage: attempt.usage,
      model,
      provider: cleanProvider,
      latencyMs,
      raw: attempt.raw,
    };

    if (generation) {
      safeLangfuseCall(() =>
        generation.end({
          output: out.text ?? null,
          usage: {
            input: out.usage?.inputTokens ?? 0,
            output: out.usage?.outputTokens ?? 0,
            unit: "TOKENS",
          },
          metadata: {
            ...spanMetadata,
            provider: cleanProvider,
            latencyMs,
            retriedForSchema,
            estimatedCostUsd: calculateLlmCostUsd(cleanProvider, model, out.usage),
          },
        })
      );
    }
    return out;
  } catch (err) {
    if (generation) {
      safeLangfuseCall(() =>
        generation.end({
          level: "ERROR",
          statusMessage: err?.message || String(err),
          metadata: {
            ...spanMetadata,
            provider: cleanProvider,
            latencyMs: Date.now() - startedAt,
          },
        })
      );
    }
    throw err;
  }
}

async function callOpenAILegacy(params, options = {}) {
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
        metadata: { ...metadata, provider: "openai" },
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
            provider: "openai",
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
            provider: "openai",
            latencyMs: Date.now() - startedAt,
          },
        })
      );
    }
    throw err;
  }
}

export async function callOpenAI(params, options = {}) {
  if (!didWarnCallOpenAIDeprecated) {
    didWarnCallOpenAIDeprecated = true;
    console.warn("[observability] callOpenAI is deprecated; migrate callers to callLLM.");
  }
  return callOpenAILegacy(params, options);
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
