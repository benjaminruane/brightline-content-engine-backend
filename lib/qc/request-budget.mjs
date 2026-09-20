/**
 * B277 / B278. Per-request TPM budget, remaining-window headers, and the
 * wait bound. No randomness.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { tpmDefaultForModel, tpmFloorMs } from "./token-estimate.mjs";

export const FUNCTION_MAX_DURATION_MS = 300_000;
export const RATE_LIMIT_BOUND_CODE = "rate_limit_bound";
/** Pre-B278 waited at most 3 gaps of 2s. Total wait without a real deadline cannot exceed that. */
export const NO_BUDGET_FALLBACK_BOUND_MS = 6_000;

const storage = new AsyncLocalStorage();

function emptyHits() {
  return { editorial: 0, compliance: 0, commentary: 0, other: 0 };
}

function createStore(options = {}) {
  const startedAt = Number.isFinite(Number(options.startedAt)) ? Number(options.startedAt) : Date.now();
  const maxDurationMs = Number.isFinite(Number(options.maxDurationMs))
    ? Number(options.maxDurationMs)
    : FUNCTION_MAX_DURATION_MS;
  const model = typeof options.model === "string" ? options.model : "gpt-4o-2024-08-06";
  const tpmLimit = Number.isFinite(Number(options.tpmLimit))
    ? Number(options.tpmLimit)
    : tpmDefaultForModel(model);
  return {
    startedAt,
    maxDurationMs,
    model,
    tpmLimit,
    remainingTokens: tpmLimit,
    remainingSource: "assumed_full",
    remainingWorkTokens: 0,
    lastResetTokensMs: 0,
    boundHits: emptyHits(),
    lastWaitLog: null,
    schedules: [],
    totalWaitedMs: 0,
    waitDeadlineAt: null,
    waitBoundMs: null,
    noBudgetFallback: options.noBudgetFallback === true,
    fallbackLogged: false,
    capacityWaitPrelaunchCount: 0,
    capacityWaitMs: 0,
    llmSucceeded: false,
    providerRefusalLogged: false,
    providerRefusal: null,
  };
}

export function beginRequestBudget(options, fn) {
  const store = createStore(options);
  if (typeof fn === "function") return storage.run(store, fn);
  storage.enterWith(store);
  return store;
}

export function getRequestBudget() {
  return storage.getStore() || null;
}

function logNoBudgetFallbackOnce(store) {
  if (!store || store.fallbackLogged) return;
  store.fallbackLogged = true;
  console.warn(
    `[REQUEST_BUDGET] no budget context; falling back to ${NO_BUDGET_FALLBACK_BOUND_MS}ms total wait`
  );
}

function requireStore(now = Date.now()) {
  const store = storage.getStore();
  if (store) return store;
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const created = createStore({
    startedAt: at,
    maxDurationMs: NO_BUDGET_FALLBACK_BOUND_MS,
    noBudgetFallback: true,
  });
  logNoBudgetFallbackOnce(created);
  return created;
}

export function runWithFallbackBudget(fn, now = Date.now()) {
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const store = createStore({
    startedAt: at,
    maxDurationMs: NO_BUDGET_FALLBACK_BOUND_MS,
    noBudgetFallback: true,
  });
  logNoBudgetFallbackOnce(store);
  return storage.run(store, fn);
}

export function recordWaitedMs(ms) {
  const store = storage.getStore();
  if (!store) return;
  const n = Math.max(0, Number(ms) || 0);
  store.totalWaitedMs = (Number(store.totalWaitedMs) || 0) + n;
}

export function recordCapacityWait({ waitMs, prelaunch = false } = {}) {
  const store = storage.getStore();
  if (!store) return;
  const n = Math.max(0, Number(waitMs) || 0);
  store.capacityWaitMs = (Number(store.capacityWaitMs) || 0) + n;
  if (prelaunch && n > 0) {
    store.capacityWaitPrelaunchCount = (Number(store.capacityWaitPrelaunchCount) || 0) + 1;
  }
}

export function capacityWaitSnapshot() {
  const store = storage.getStore();
  return {
    prelaunchCount: store ? Number(store.capacityWaitPrelaunchCount) || 0 : 0,
    waitMs: store ? Number(store.capacityWaitMs) || 0 : 0,
  };
}

export function recordLlmSuccess() {
  const store = storage.getStore();
  if (store) store.llmSucceeded = true;
}

export function hasLlmSucceeded() {
  return storage.getStore()?.llmSucceeded === true;
}

export function rememberProviderRefusal(info) {
  const store = storage.getStore();
  if (!store) return info;
  if (store.providerRefusalLogged) return store.providerRefusal;
  store.providerRefusalLogged = true;
  store.providerRefusal = info && typeof info === "object" ? info : null;
  return store.providerRefusal;
}

export function providerRefusalSnapshot() {
  const store = storage.getStore();
  return store?.providerRefusal ?? null;
}

export function runWithoutRequestBudget(fn) {
  return storage.run(undefined, fn);
}

function headerMap(headers) {
  const out = {};
  if (!headers) return out;
  const put = (key, value) => {
    if (key == null || value == null) return;
    out[String(key).toLowerCase()] = String(value).trim();
  };
  if (typeof headers.get === "function") {
    for (const name of [
      "x-ratelimit-limit-tokens",
      "x-ratelimit-remaining-tokens",
      "x-ratelimit-reset-tokens",
      "retry-after",
      "retry-after-ms",
    ]) {
      const v = headers.get(name) ?? headers.get(name.toLowerCase());
      if (v != null) put(name, v);
    }
    return out;
  }
  if (typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) put(key, value);
  }
  return out;
}

export function parseResetTokensMs(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0;
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let match;
  while ((match = re.exec(s))) {
    const n = Number(match[1]);
    const unit = match[2];
    if (unit === "ms") total += n;
    else if (unit === "s") total += n * 1000;
    else if (unit === "m") total += n * 60_000;
    else if (unit === "h") total += n * 3_600_000;
  }
  return Math.max(0, Math.round(total));
}

export function recordRateLimitHeaders(headers) {
  const store = storage.getStore();
  if (!store) return null;
  const map = headerMap(headers);
  const limit = Number(map["x-ratelimit-limit-tokens"]);
  const remaining = Number(map["x-ratelimit-remaining-tokens"]);
  if (Number.isFinite(limit) && limit > 0) store.tpmLimit = limit;
  if (Number.isFinite(remaining) && remaining >= 0) {
    store.remainingTokens = remaining;
    store.remainingSource = "header";
  }
  const resetMs = parseResetTokensMs(map["x-ratelimit-reset-tokens"]);
  if (resetMs > 0) store.lastResetTokensMs = resetMs;
  return {
    tpmLimit: store.tpmLimit,
    remainingTokens: store.remainingTokens,
    remainingSource: store.remainingSource,
    resetTokensMs: store.lastResetTokensMs,
  };
}

export function setRemainingWorkTokens(tokens) {
  const store = storage.getStore();
  if (!store) return;
  store.remainingWorkTokens = Math.max(0, Number(tokens) || 0);
}

export function addRemainingWorkTokens(delta) {
  const store = storage.getStore();
  if (!store) return;
  store.remainingWorkTokens = Math.max(0, (Number(store.remainingWorkTokens) || 0) + (Number(delta) || 0));
}

export function computeWaitMarginMs(store = storage.getStore()) {
  if (!store) return 0;
  return tpmFloorMs(store.remainingWorkTokens, store.tpmLimit);
}

export function computeWaitBoundMs(now = Date.now(), store = storage.getStore()) {
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const s = store || requireStore(at);
  if (s.noBudgetFallback) logNoBudgetFallbackOnce(s);
  const marginMs = computeWaitMarginMs(s);
  if (!Number.isFinite(s.waitDeadlineAt)) {
    s.waitDeadlineAt = s.startedAt + s.maxDurationMs - marginMs;
    s.waitBoundMs = Math.max(0, s.waitDeadlineAt - at);
  }
  const remainingByClock = Math.max(0, s.waitDeadlineAt - at);
  const remainingByWaited = Math.max(0, (Number(s.waitBoundMs) || 0) - (Number(s.totalWaitedMs) || 0));
  return Math.min(remainingByClock, remainingByWaited);
}

export function parseRequestedTokens(err) {
  const message = typeof err?.message === "string" ? err.message : String(err ?? "");
  const match = message.match(/Requested\s+(\d+)/i);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

export function parseLimitFromMessage(err) {
  const message = typeof err?.message === "string" ? err.message : String(err ?? "");
  const match = message.match(/Limit\s+(\d+)/i);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

export const RATE_LIMIT_MIN_WAIT_MS = 1_000;

export function fitWaitMs({ requestedTokens, tpmLimit, serverDelayMs, resetTokensMs }) {
  const tpm = Math.max(1, Number(tpmLimit) || 1);
  const requested = Math.max(0, Number(requestedTokens) || 0);
  const fromTokens = requested > 0 ? tpmFloorMs(requested, tpm) : 0;
  const server = Math.max(0, Number(serverDelayMs) || 0);
  const reset = Math.max(0, Number(resetTokensMs) || 0);
  return Math.max(server, fromTokens, reset, RATE_LIMIT_MIN_WAIT_MS);
}

export class RateLimitBoundError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = "RateLimitBoundError";
    this.code = RATE_LIMIT_BOUND_CODE;
    this.status = 429;
    this.waitMs = extra.waitMs;
    this.boundMs = extra.boundMs;
    this.marginMs = extra.marginMs;
  }
}

export function isRateLimitBoundError(err) {
  if (!err || typeof err !== "object") return false;
  return err.code === RATE_LIMIT_BOUND_CODE || err.name === "RateLimitBoundError";
}

export async function waitUntilTokensFit(tokensNeeded, { sleep, now = Date.now } = {}) {
  const store = storage.getStore();
  if (!store) return { waitedMs: 0, skipped: true };
  const needed = Math.max(1, Math.floor(Number(tokensNeeded) || 1));
  if (store.remainingTokens >= needed) return { waitedMs: 0, skipped: false };
  const deficit = needed - store.remainingTokens;
  const waitMs = Math.max(
    tpmFloorMs(deficit, store.tpmLimit),
    store.lastResetTokensMs || 0,
    RATE_LIMIT_MIN_WAIT_MS
  );
  const at = typeof now === "function" ? Number(now()) : Date.now();
  const boundMs = computeWaitBoundMs(at, store);
  const marginMs = computeWaitMarginMs(store);
  const line =
    `[RATE_LIMIT] waitMs=${waitMs} boundMs=${boundMs} marginMs=${marginMs} ` +
    `requested=${needed} attempt=prelaunch remaining=${store.remainingTokens}`;
  console.warn(line);
  rememberWaitLog(line);
  if (waitMs > boundMs) {
    throw new RateLimitBoundError(
      `rate limit bound reached before launch; wait ${waitMs}ms exceeds bound ${boundMs}ms`,
      { waitMs, boundMs, marginMs }
    );
  }
  const sleeper = typeof sleep === "function" ? sleep : (ms) => new Promise((r) => setTimeout(r, ms));
  await sleeper(waitMs);
  recordWaitedMs(waitMs);
  recordCapacityWait({ waitMs, prelaunch: true });
  store.remainingTokens = Math.min(store.tpmLimit, store.remainingTokens + deficit);
  store.remainingSource = "refilled_wait";
  return { waitedMs: waitMs, skipped: false };
}

export function incrementBoundHit(kind) {
  const store = storage.getStore();
  if (!store) return;
  const key = kind === "editorial" || kind === "compliance" || kind === "commentary" ? kind : "other";
  store.boundHits[key] += 1;
}

export function boundHitSnapshot() {
  const store = storage.getStore();
  const hits = store ? { ...store.boundHits } : emptyHits();
  const statements = hits.editorial + hits.compliance + hits.commentary + hits.other;
  return { ...hits, statements };
}

export function rememberSchedule(plan) {
  const store = storage.getStore();
  if (!store) return;
  if (!Array.isArray(store.schedules)) store.schedules = [];
  store.schedules.push(plan);
}

export function scheduleSnapshot() {
  const store = storage.getStore();
  return Array.isArray(store?.schedules) ? store.schedules.slice() : [];
}

export function lastWaitLog() {
  const store = storage.getStore();
  return store?.lastWaitLog ?? null;
}

export function rememberWaitLog(line) {
  const store = storage.getStore();
  if (store) store.lastWaitLog = line;
  return line;
}

export function budgetSnapshot() {
  const store = storage.getStore();
  if (!store) {
    return {
      tpmLimit: tpmDefaultForModel("gpt-4o-2024-08-06"),
      remainingTokens: tpmDefaultForModel("gpt-4o-2024-08-06"),
      remainingSource: "assumed_full",
      remainingWorkTokens: 0,
      marginMs: 0,
      boundMs: FUNCTION_MAX_DURATION_MS,
      startedAt: null,
      maxDurationMs: FUNCTION_MAX_DURATION_MS,
    };
  }
  return {
    tpmLimit: store.tpmLimit,
    remainingTokens: store.remainingTokens,
    remainingSource: store.remainingSource,
    remainingWorkTokens: store.remainingWorkTokens,
    marginMs: computeWaitMarginMs(store),
    boundMs: computeWaitBoundMs(Date.now(), store),
    startedAt: store.startedAt,
    maxDurationMs: store.maxDurationMs,
  };
}
