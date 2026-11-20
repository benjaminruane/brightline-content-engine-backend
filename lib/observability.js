import { AsyncLocalStorage } from "node:async_hooks";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import {
  flushLangfuse,
  newLangfuseTraceId,
  openLangfuseGeneration,
  recordLangfuseScore,
  startLangfuseTrace,
  updateLangfuseTraceMetadata,
} from "./langfuse-tracing.mjs";
import {
  RateLimitBoundError,
  computeWaitBoundMs,
  computeWaitMarginMs,
  fitWaitMs,
  getRequestBudget,
  hasLlmSucceeded,
  isRateLimitBoundError,
  parseLimitFromMessage,
  parseRequestedTokens,
  recordLlmSuccess,
  recordRateLimitHeaders,
  recordWaitedMs,
  recordCapacityWait,
  rememberProviderRefusal,
  rememberWaitLog,
  runWithFallbackBudget,
} from "./qc/request-budget.mjs";
import { providerRequestIdFrom } from "./qc/not-reviewed-reason.mjs";

const openAiApiKey = typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : "";
const anthropicApiKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" ? process.env.ANTHROPIC_API_KEY.trim() : "";
async function capturingFetch(url, init) {
  const res = await globalThis.fetch(url, init);
  try {
    recordRateLimitHeaders(res.headers);
  } catch (err) {
    console.warn("[REQUEST_BUDGET] header capture failed", err?.message || String(err));
  }
  return res;
}

const openaiClient = openAiApiKey
  ? new OpenAI({ apiKey: openAiApiKey, maxRetries: 0, fetch: capturingFetch })
  : null;
let anthropicClient = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

/** Tests that need the missing-key path can clear the client. Returns the previous one. */
export function useAnthropicClientForTests(client) {
  const previous = anthropicClient;
  anthropicClient = client;
  return previous;
}

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

// USD per million tokens. cachedInput is the rate for prompt-prefix cache
// reads: OpenAI discounts those 50% on the 4o family and 90% on gpt-5 and
// later. Omitting cachedInput bills cache reads at the full input rate.
const PRICING = {
  openai: {
    "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
    // Same rates under the pinned snapshot names. calculateLlmCostUsd keys on
    // the exact string. An unlisted model is priced at the highest published
    // rates and warned, so the snapshot names stay explicit.
    "gpt-4o-2024-08-06": { input: 2.5, cachedInput: 1.25, output: 10.0 },
    "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
    "gpt-4o-mini-2024-07-18": { input: 0.15, cachedInput: 0.075, output: 0.6 },
    "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
    "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
    // Absent until efaed13, which meant every reviser, generate, adapt and ask
    // call in this project reported a cost of exactly zero.
    "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10.0 },
    "gpt-5.1-2025-11-13": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  },
  anthropic: {
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
    "claude-opus-4-7": { input: 5.0, output: 25.0 },
  },
};

let didWarnCallOpenAIDeprecated = false;

function getTraceIdentifiers(options = {}) {
  const traceId =
    typeof options.traceId === "string" && options.traceId.trim() ? options.traceId.trim() : newLangfuseTraceId();
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
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  }
  const inputTokens =
    Number(usage.inputTokens) || Number(usage.prompt_tokens) || Number(usage.promptTokens) || Number(usage.input_tokens) || 0;
  const outputTokens =
    Number(usage.outputTokens) ||
    Number(usage.completion_tokens) ||
    Number(usage.completionTokens) ||
    Number(usage.output_tokens) ||
    0;
  // Cached tokens are a SUBSET of inputTokens, not an addition to them.
  const cachedInputTokens = Math.min(
    inputTokens,
    Number(usage.cachedInputTokens) ||
      Number(usage.cached_tokens) ||
      Number(usage.prompt_tokens_details?.cached_tokens) ||
      0
  );
  return { inputTokens, outputTokens, cachedInputTokens };
}

/**
 * Cache hit rate as a fraction of input tokens, 0 when there is no input.
 * @returns {number}
 */
export function cacheHitRate(usage) {
  const { inputTokens, cachedInputTokens } = resolveUsageForCost(usage);
  return inputTokens > 0 ? cachedInputTokens / inputTokens : 0;
}

const unlistedWarnings = new Set();

export function highestPublishedRates() {
  let input = 0;
  let output = 0;
  let cachedInput = 0;
  for (const models of Object.values(PRICING)) {
    for (const rate of Object.values(models || {})) {
      input = Math.max(input, Number(rate.input) || 0);
      output = Math.max(output, Number(rate.output) || 0);
      if (Number.isFinite(rate.cachedInput)) cachedInput = Math.max(cachedInput, rate.cachedInput);
    }
  }
  return { input, output, cachedInput: cachedInput || input };
}

export function resetUnlistedPriceWarnings() {
  unlistedWarnings.clear();
}

export function calculateLlmCostUsd(provider, model, usage) {
  const providerKey = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const modelKey = typeof model === "string" ? model.trim() : "";
  let rate = PRICING?.[providerKey]?.[modelKey];
  if (!rate) {
    rate = highestPublishedRates();
    const name = modelKey || "(none)";
    if (!unlistedWarnings.has(name)) {
      unlistedWarnings.add(name);
      console.warn(`[llm-price] unlisted model ${name} priced at the highest published rates`);
    }
  }
  const { inputTokens, outputTokens, cachedInputTokens } = resolveUsageForCost(usage);
  // Fall back to the full input rate where no cached rate is published, so an
  // unpriced cache read is over-reported rather than silently free.
  const cachedRate = Number.isFinite(rate.cachedInput) ? rate.cachedInput : rate.input;
  const freshInputTokens = inputTokens - cachedInputTokens;
  return (
    (freshInputTokens / 1_000_000) * rate.input +
    (cachedInputTokens / 1_000_000) * cachedRate +
    (outputTokens / 1_000_000) * rate.output
  );
}

export function getLlmPricingTable() {
  return PRICING;
}

function emptyModelSpend() {
  return {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
  };
}

function emptyLlmSpend() {
  return {
    ...emptyModelSpend(),
    unpricedModels: new Set(),
    byModel: Object.create(null),
  };
}

function llmSpendModelKey(provider, model) {
  const providerKey = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const modelKey = typeof model === "string" ? model.trim() : "";
  return `${providerKey}/${modelKey}`;
}

function hasPublishedPrice(provider, model) {
  const providerKey = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const modelKey = typeof model === "string" ? model.trim() : "";
  return Boolean(PRICING?.[providerKey]?.[modelKey]);
}

function addSpendTotals(bucket, tokens, costUsd, priced) {
  bucket.calls += 1;
  bucket.inputTokens += tokens.inputTokens;
  bucket.cachedInputTokens += tokens.cachedInputTokens;
  bucket.outputTokens += tokens.outputTokens;
  bucket.costUsd += costUsd;
  if (!priced) bucket.unpricedCalls += 1;
}

let llmSpend = emptyLlmSpend();
const spendStorage = new AsyncLocalStorage();
const stubCharged = new WeakSet();

function stubUsd() {
  const raw = process.env.STUB_LLM_USD;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const cost = Number(raw);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

function usageForFixedUsd(provider, model, costUsd) {
  const rate = PRICING?.[provider]?.[model];
  const output = rate?.output || highestPublishedRates().output;
  const outputTokens = output > 0 ? Math.round((costUsd / output) * 1_000_000) : 0;
  return { inputTokens: 0, outputTokens, cachedInputTokens: 0 };
}

function currentSpend() {
  return spendStorage.getStore() || llmSpend;
}

/** One counter for this async call, so concurrent requests cannot mix. */
export function runWithLlmSpend(fn) {
  return spendStorage.run(emptyLlmSpend(), fn);
}

export function enterRequestSpend() {
  spendStorage.enterWith(emptyLlmSpend());
}

export function hasRequestSpend() {
  return Boolean(spendStorage.getStore());
}

/**
 * Record one completed provider call.
 * A call that throws is not counted, because no usage comes back.
 * Never throws on a null or malformed usage: count the call, add zero tokens.
 */
export function recordLlmSpend(provider, model, usage) {
  const key = llmSpendModelKey(provider, model);
  const tokens = resolveUsageForCost(usage);
  const costUsd = calculateLlmCostUsd(provider, model, usage);
  const priced = hasPublishedPrice(provider, model);

  const bucket = currentSpend();
  addSpendTotals(bucket, tokens, costUsd, priced);
  if (!priced) bucket.unpricedModels.add(key);

  if (!bucket.byModel[key]) bucket.byModel[key] = emptyModelSpend();
  addSpendTotals(bucket.byModel[key], tokens, costUsd, priced);
}

export function getLlmSpend() {
  const current = currentSpend();
  const byModel = {};
  for (const [key, bucket] of Object.entries(current.byModel)) {
    byModel[key] = { ...bucket };
  }
  return {
    calls: current.calls,
    inputTokens: current.inputTokens,
    cachedInputTokens: current.cachedInputTokens,
    outputTokens: current.outputTokens,
    costUsd: current.costUsd,
    unpricedCalls: current.unpricedCalls,
    unpricedModels: [...current.unpricedModels].sort(),
    byModel,
  };
}

export function resetLlmSpend() {
  const store = spendStorage.getStore();
  if (store) {
    const fresh = emptyLlmSpend();
    for (const key of Object.keys(store)) delete store[key];
    Object.assign(store, fresh);
    return;
  }
  llmSpend = emptyLlmSpend();
}

export function formatLlmSpend() {
  const current = currentSpend();
  if (current.calls === 0) return "LLM SPEND no model calls recorded";
  let line =
    `LLM SPEND calls=${current.calls} in=${current.inputTokens} cached=${current.cachedInputTokens} ` +
    `out=${current.outputTokens} costUsd=${current.costUsd.toFixed(4)}`;
  if (current.unpricedCalls > 0) {
    const keys = [...current.unpricedModels].sort().join(", ");
    line +=
      ` WARNING ${current.unpricedCalls} of ${current.calls} calls used an unlisted model ` +
      `priced at the highest published rates: ${keys}`;
  }
  return line;
}

export function createTraceId() {
  return newLangfuseTraceId();
}

export function startTrace({ traceId, traceName, metadata } = {}) {
  const { traceId: resolvedTraceId, traceName: resolvedTraceName } = getTraceIdentifiers({ traceId, traceName });
  const safeMetadata = sanitizeTraceMetadata(metadata);
  startLangfuseTrace({
    traceId: resolvedTraceId,
    traceName: resolvedTraceName,
    metadata: safeMetadata,
  });
}

export function updateTraceMetadata(traceId, metadataPatch) {
  if (typeof traceId !== "string" || !traceId.trim()) return;
  if (!metadataPatch || typeof metadataPatch !== "object") return;
  const safePatch = sanitizeTraceMetadata(metadataPatch);
  if (Object.keys(safePatch).length === 0) return;
  updateLangfuseTraceMetadata(traceId.trim(), safePatch);
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

/** The schema every JSON call used before a caller could pass its own. */
export function anthropicJsonInputSchema(jsonSchema) {
  if (jsonSchema == null) {
    return { type: "object", additionalProperties: true };
  }
  if (typeof jsonSchema !== "object" || Array.isArray(jsonSchema)) {
    throw new Error("callLLM: jsonSchema must be an object");
  }
  return jsonSchema;
}

async function callProviderOnceRaw({ provider, model, messages, temperature = 0, responseFormat, seed, jsonSchema }) {
  const cleanProvider = String(provider || "openai").trim().toLowerCase();
  if (cleanProvider === "anthropic") {
    if (!anthropicClient) throw new Error("Server is missing ANTHROPIC_API_KEY");
    const converted = convertOpenAIMessagesToAnthropic(messages);
    const temperatureField = temperature == null ? {} : { temperature };
    if (responseFormat === "json") {
      const toolName = "json_response";
      const raw = await anthropicClient.messages.create({
        model,
        ...temperatureField,
        max_tokens: 4096,
        system: converted.system,
        messages: converted.messages,
        tools: [
          {
            name: toolName,
            description: "Return the JSON result object.",
            input_schema: anthropicJsonInputSchema(jsonSchema),
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
          // No cache_control breakpoints are sent, so Anthropic caching is off.
          cachedInputTokens: 0,
          cacheHitRate: 0,
        },
        raw,
      };
    }
    const raw = await anthropicClient.messages.create({
      model,
      ...temperatureField,
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
        cachedInputTokens: 0,
        cacheHitRate: 0,
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
  if (Number.isInteger(seed)) {
    params.seed = seed;
  }
  if (responseFormat === "json") {
    params.response_format = { type: "json_object" };
  }
  const raw = await openaiClient.chat.completions.create(params);
  const text = raw?.choices?.[0]?.message?.content ?? "";
  const inputTokens = Number(raw?.usage?.prompt_tokens) || 0;
  // OpenAI caches prompt prefixes over 1,024 tokens automatically; there is no
  // opt-in to send. This is the only place the hit is visible.
  const cachedInputTokens = Number(raw?.usage?.prompt_tokens_details?.cached_tokens) || 0;
  const usage = {
    inputTokens,
    outputTokens: Number(raw?.usage?.completion_tokens) || 0,
    cachedInputTokens,
    cacheHitRate: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
  };
  if (process.env.DEBUG_LLM_CACHE === "1") {
    console.debug(
      `[llm-cache] model=${model} input=${inputTokens} cached=${cachedInputTokens} ` +
        `hitRate=${(usage.cacheHitRate * 100).toFixed(1)}%`
    );
  }
  return { text, usage, raw };
}

async function callProviderOnce(args) {
  const out = await callProviderOnceRaw(args);
  recordLlmSpend(args?.provider, args?.model, out?.usage);
  recordLlmSuccess();
  return out;
}

const RATE_LIMIT_DEFAULT_DELAY_MS = 250;
/** Arithmetic backstop. A 1s retry-after fills a 300s review bound around attempt 300; 1000 stays above that. */
export const RATE_LIMIT_MAX_ATTEMPTS = 1000;
/**
 * B292. If the first model call of a review is refused and nothing has
 * succeeded, wait at most this long. Same duration as the B285 no-budget
 * fallback. Long enough for a one-second TPM blip. Short enough that a
 * billing stop cannot occupy the Function. Mid-review TPM waits still use
 * the remaining Function bound (B278).
 */
export const NOTHING_REVIEWED_RETRY_BOUND_MS = 8_000;
export const REVIEW_DID_NOT_RUN = "The review did not run.";
export const REVIEW_DID_NOT_START_CODE = "review_did_not_start";

const RATE_LIMIT_HEADER_NAMES = [
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-tokens",
  "retry-after",
  "retry-after-ms",
];

const TERMINAL_REFUSAL_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "billing_not_active",
  "account_deactivated",
  "invalid_api_key",
  "organization_usage_limit_exceeded",
  "access_terminated",
]);

export { RateLimitBoundError };

export class ReviewDidNotStartError extends Error {
  constructor(message = REVIEW_DID_NOT_RUN, extra = {}) {
    super(message);
    this.name = "ReviewDidNotStartError";
    this.code = REVIEW_DID_NOT_START_CODE;
    this.status = 429;
    this.causeRefusal = extra.causeRefusal ?? null;
    this.waitMs = extra.waitMs;
    this.boundMs = extra.boundMs;
  }
}

export function isReviewDidNotStartError(err) {
  if (!err || typeof err !== "object") return false;
  return err.code === REVIEW_DID_NOT_START_CODE || err.name === "ReviewDidNotStartError";
}

function headerValue(headers, name) {
  if (!headers) return "";
  const wanted = String(name).toLowerCase();
  if (typeof headers.get === "function") {
    const fromGet = headers.get(name) ?? headers.get(wanted);
    if (fromGet != null && String(fromGet).trim()) return String(fromGet).trim();
  }
  if (typeof headers !== "object") return "";
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function describeProviderRefusal(err) {
  const headers = err?.headers;
  const present = {};
  const missing = [];
  for (const name of RATE_LIMIT_HEADER_NAMES) {
    const value = headerValue(headers, name);
    if (value) present[name] = value;
    else missing.push(name);
  }
  const nested = err?.error && typeof err.error === "object" ? err.error : null;
  return {
    status: Number(err?.status ?? err?.statusCode) || null,
    code: err?.code ?? nested?.code ?? null,
    type: err?.type ?? nested?.type ?? null,
    message: typeof err?.message === "string" ? err.message : String(err ?? ""),
    headers: present,
    missingHeaders: missing,
  };
}

function formatProviderRefusalLog(info) {
  const headerPart =
    info.headers && Object.keys(info.headers).length > 0
      ? Object.entries(info.headers)
          .map(([key, value]) => `${key}=${value}`)
          .join(" ")
      : "x-ratelimit-*=absent retry-after=absent";
  return (
    `[PROVIDER_REFUSAL] status=${info.status ?? "none"} code=${info.code ?? "none"} ` +
    `type=${info.type ?? "none"} message=${JSON.stringify(info.message ?? "")} ${headerPart}`
  );
}

function logProviderRefusalOnce(err) {
  const store = getRequestBudget();
  if (store?.providerRefusalLogged) return store.providerRefusal;
  const info = describeProviderRefusal(err);
  console.warn(formatProviderRefusalLog(info));
  rememberProviderRefusal(info);
  return info;
}

export function isTerminalProviderRefusal(err) {
  if (!err || typeof err !== "object") return false;
  if (isRateLimitBoundError(err) || isReviewDidNotStartError(err)) return false;
  const nested = err.error && typeof err.error === "object" ? err.error : null;
  const code = String(err.code ?? nested?.code ?? "").toLowerCase();
  const type = String(err.type ?? nested?.type ?? "").toLowerCase();
  if (TERMINAL_REFUSAL_CODES.has(code) || type === "insufficient_quota") return true;
  const status = Number(err.status ?? err.statusCode);
  return status === 401 || status === 403;
}

export function isRateLimitError(err) {
  if (!err || typeof err !== "object") return false;
  if (isTerminalProviderRefusal(err)) return false;
  const status = Number(err.status ?? err.statusCode);
  if (status === 429) return true;
  const nested = err.error && typeof err.error === "object" ? err.error : null;
  const code = String(err.code ?? nested?.code ?? "").toLowerCase();
  return code === "rate_limit_exceeded" || code === "rate_limit_error";
}

export function parseRetryAfterMs(err) {
  const headers = err?.headers;
  const retryAfterMs = headerValue(headers, "retry-after-ms");
  if (retryAfterMs && Number.isFinite(Number(retryAfterMs))) {
    return Math.max(0, Number(retryAfterMs));
  }
  const retryAfter = headerValue(headers, "retry-after");
  if (retryAfter && Number.isFinite(Number(retryAfter))) {
    return Math.max(0, Number(retryAfter) * 1000);
  }
  const message = typeof err?.message === "string" ? err.message : String(err ?? "");
  const msMatch = message.match(/try again in (\d+(?:\.\d+)?)ms/i);
  if (msMatch) return Math.max(0, Number(msMatch[1]));
  const secMatch = message.match(/try again in (\d+(?:\.\d+)?)s/i);
  if (secMatch) return Math.max(0, Number(secMatch[1]) * 1000);
  return RATE_LIMIT_DEFAULT_DELAY_MS;
}

export function rateLimitDelayMs(err, attempt = 1) {
  const store = getRequestBudget();
  const requested = parseRequestedTokens(err);
  const limitFromMessage = parseLimitFromMessage(err);
  const tpmLimit = limitFromMessage || store?.tpmLimit || 2_000_000;
  const serverDelayMs = parseRetryAfterMs(err);
  const resetTokensMs = store?.lastResetTokensMs || 0;
  const fitMs = fitWaitMs({
    requestedTokens: requested,
    tpmLimit,
    serverDelayMs,
    resetTokensMs,
  });
  const round = Math.max(1, Math.floor(Number(attempt) || 1));
  return fitMs * round;
}

function defaultSleep(ms) {
  const delay = Math.max(0, Number(ms) || 0);
  if (delay === 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function withRateLimitRetry(fn, { sleep = defaultSleep, now = Date.now } = {}) {
  if (!getRequestBudget()) {
    const at = typeof now === "function" ? Number(now()) : Date.now();
    return runWithFallbackBudget(() => withRateLimitRetry(fn, { sleep, now }), at);
  }
  let attempt = 0;
  while (attempt < RATE_LIMIT_MAX_ATTEMPTS) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      if (isRateLimitBoundError(err) || isReviewDidNotStartError(err)) throw err;
      if (isTerminalProviderRefusal(err) || isRateLimitError(err)) {
        logProviderRefusalOnce(err);
      }
      if (isTerminalProviderRefusal(err)) {
        if (!hasLlmSucceeded()) {
          throw new ReviewDidNotStartError(REVIEW_DID_NOT_RUN, { causeRefusal: describeProviderRefusal(err) });
        }
        throw err;
      }
      if (!isRateLimitError(err)) throw err;
      try {
        recordRateLimitHeaders(err.headers);
      } catch {
        /* header capture is best-effort */
      }
      const waitMs = rateLimitDelayMs(err, attempt);
      const at = typeof now === "function" ? Number(now()) : Date.now();
      let boundMs = computeWaitBoundMs(at);
      if (!hasLlmSucceeded()) {
        const waited = Number(getRequestBudget()?.totalWaitedMs) || 0;
        boundMs = Math.min(boundMs, Math.max(0, NOTHING_REVIEWED_RETRY_BOUND_MS - waited));
      }
      const marginMs = computeWaitMarginMs();
      const requested = parseRequestedTokens(err);
      const line =
        `[RATE_LIMIT] waitMs=${waitMs} boundMs=${boundMs} marginMs=${marginMs} ` +
        `requested=${requested} attempt=${attempt}`;
      console.warn(line);
      rememberWaitLog(line);
      if (waitMs > boundMs) {
        if (!hasLlmSucceeded()) {
          throw new ReviewDidNotStartError(REVIEW_DID_NOT_RUN, { waitMs, boundMs });
        }
        throw new RateLimitBoundError(
          `rate limit bound reached after ${attempt} attempt(s); wait ${waitMs}ms exceeds bound ${boundMs}ms`,
          { waitMs, boundMs, marginMs }
        );
      }
      await sleep(waitMs);
      recordWaitedMs(waitMs);
      recordCapacityWait({ waitMs, prelaunch: false });
    }
  }
  if (!hasLlmSucceeded()) {
    throw new ReviewDidNotStartError(REVIEW_DID_NOT_RUN, { waitMs: 0, boundMs: 0 });
  }
  throw new RateLimitBoundError(
    `rate limit bound reached after ${RATE_LIMIT_MAX_ATTEMPTS} attempt(s); attempt ceiling`,
    { waitMs: 0, boundMs: 0, marginMs: 0 }
  );
}

export async function callLLM({
  provider = "openai",
  model,
  messages,
  temperature = 0,
  responseFormat,
  seed,
  jsonSchema,
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

  const generation = openLangfuseGeneration({
    traceId: traceInfo.traceId,
    traceName: traceInfo.traceName,
    spanName: span,
    model: typeof model === "string" ? model : undefined,
    input: messages ?? null,
    metadata: { ...spanMetadata, provider: cleanProvider },
  });

  try {
    const fixed = stubUsd();
    if (fixed != null) {
      const store = spendStorage.getStore();
      const first = !store || !stubCharged.has(store);
      if (store) stubCharged.add(store);
      const usage = first
        ? usageForFixedUsd(cleanProvider, model, fixed)
        : { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      recordLlmSpend(cleanProvider, model, usage);
      const text = responseFormat === "json" ? "{}" : "Stubbed sentence for the allowance check.";
      generation?.succeed?.({ output: text, usage, metadata: { provider: cleanProvider, stub: true } });
      return { text, usage, model, provider: cleanProvider, latencyMs: 0, raw: null };
    }
    const providerArgs = {
      provider: cleanProvider,
      model,
      messages,
      temperature,
      responseFormat,
      seed,
      jsonSchema,
    };
    let attempt = await withRateLimitRetry(() => callProviderOnce(providerArgs));
    let retriedForSchema = false;
    if (responseFormat === "json" && !looksLikeValidJson(attempt.text)) {
      retriedForSchema = true;
      attempt = await withRateLimitRetry(() => callProviderOnce(providerArgs));
    }

    const latencyMs = Date.now() - startedAt;
    const out = {
      text: attempt.text,
      usage: attempt.usage,
      model,
      provider: cleanProvider,
      latencyMs,
      raw: attempt.raw,
      requestId: providerRequestIdFrom(attempt) || providerRequestIdFrom(attempt?.raw),
    };

    generation?.succeed({
      output: out.text ?? null,
      usage: out.usage,
      metadata: {
        ...spanMetadata,
        provider: cleanProvider,
        latencyMs,
        retriedForSchema,
        seed: Number.isInteger(seed) ? seed : undefined,
        systemFingerprint:
          attempt?.raw && typeof attempt.raw === "object" ? attempt.raw.system_fingerprint ?? null : null,
        estimatedCostUsd: calculateLlmCostUsd(cleanProvider, model, out.usage),
        cachedInputTokens: out.usage?.cachedInputTokens ?? 0,
        cacheHitRate: out.usage?.cacheHitRate ?? 0,
      },
    });
    return out;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (err && typeof err === "object") {
      err.latencyMs = latencyMs;
      const rid = providerRequestIdFrom(err);
      if (rid) err.requestId = rid;
    }
    generation?.fail({
      statusMessage: err?.message || String(err),
      metadata: {
        ...spanMetadata,
        provider: cleanProvider,
        latencyMs,
        requestId: err?.requestId ?? null,
      },
    });
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

  const generation = openLangfuseGeneration({
    traceId,
    traceName,
    spanName,
    model: typeof params?.model === "string" ? params.model : undefined,
    input: params?.messages ?? null,
    metadata: { ...metadata, provider: "openai" },
  });

  try {
    const response = await openaiClient.chat.completions.create(params);
    generation?.succeed({
      output: response?.choices?.[0]?.message?.content ?? null,
      usage: response?.usage ?? null,
      metadata: {
        ...metadata,
        provider: "openai",
        latencyMs: Date.now() - startedAt,
      },
    });
    return response;
  } catch (err) {
    generation?.fail({
      statusMessage: err?.message || String(err),
      metadata: {
        ...metadata,
        provider: "openai",
        latencyMs: Date.now() - startedAt,
      },
    });
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
  recordLangfuseScore({ traceId, name, value, comment, metadata });
}

export async function flushObservability() {
  await flushLangfuse();
}
