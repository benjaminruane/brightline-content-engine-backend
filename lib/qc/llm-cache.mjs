/**
 * B63: LLM result cache for the verdict path (Stages 1, 1b, 2).
 *
 * Persistence: process-global in-memory Map. Draft version history in this
 * product is also in-memory (frontend React state; the backend has no document
 * store). Cached rows hold client draft text and source passages, so they stay
 * in that same trust boundary. No new datastore, dependency, or table.
 *
 * Flag QC_LLM_CACHE default ON. Set 0/false/off to disable without a deploy.
 */

import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { calculateLlmCostUsd } from "../observability.js";
import { STAGE_MODELS } from "./model-config.mjs";

/** Deliberate global bust is a one-line change. */
export const CACHE_VERSION = 1;

const STAGES = new Set(["stage1", "stage1b", "stage2"]);

const COMPONENT_ORDER = [
  "stage",
  "inputText",
  "parentSentence",
  "sourceText",
  "promptHash",
  "modelId",
  "temperature",
  "seed",
  "cacheVersion",
];

let cacheVersionOverride = null;

const cacheRunAls = new AsyncLocalStorage();

/** Logical collection name for reports. In-memory rows, not a SQL table. */
export const LLM_CACHE_COLLECTION = "qc_llm_cache";

/**
 * Hard caps for the process-local store. Eviction is a miss, never a wrong
 * answer. Conservative vs a 1024 MB Vercel function: the B63 gate corpus was
 * 491 entries; 1024 holds two such warm sets or ~100 typical interactive
 * reviews (about 10 entries each). 16 MiB is roughly 1.5% of that memory
 * budget. Approximate size is UTF-8 JSON byte length of the stored entry.
 */
export const LLM_CACHE_MAX_ENTRIES = 1024;
export const LLM_CACHE_MAX_BYTES = 16 * 1024 * 1024;

function approximateBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export function createMemoryStore({
  maxEntries = LLM_CACHE_MAX_ENTRIES,
  maxBytes = LLM_CACHE_MAX_BYTES,
} = {}) {
  const rows = new Map();
  let totalBytes = 0;
  let evictions = 0;

  function evictWhileOver(keepKey) {
    while (rows.size > 0 && (rows.size > maxEntries || totalBytes > maxBytes)) {
      let victim = null;
      for (const key of rows.keys()) {
        if (key === keepKey && rows.size > 1) continue;
        victim = key;
        break;
      }
      if (victim == null) break;
      const old = rows.get(victim);
      rows.delete(victim);
      totalBytes -= Number(old?.bytes) || 0;
      if (totalBytes < 0) totalBytes = 0;
      evictions += 1;
    }
  }

  return {
    kind: "memory",
    collection: LLM_CACHE_COLLECTION,
    maxEntries,
    maxBytes,
    async get(key) {
      if (!rows.has(key)) return null;
      const row = rows.get(key);
      rows.delete(key);
      rows.set(key, row);
      return cloneValue(row.entry);
    },
    async put(key, entry) {
      const stored = cloneValue(entry);
      const bytes = approximateBytes(stored);
      if (bytes > maxBytes) {
        return;
      }
      if (rows.has(key)) {
        totalBytes -= Number(rows.get(key).bytes) || 0;
        rows.delete(key);
      }
      rows.set(key, { entry: stored, bytes });
      totalBytes += bytes;
      evictWhileOver(key);
    },
    async clear() {
      rows.clear();
      totalBytes = 0;
      evictions = 0;
    },
    size() {
      return rows.size;
    },
    byteSize() {
      return totalBytes;
    },
    evictionCount() {
      return evictions;
    },
  };
}

const defaultStore = createMemoryStore();
let activeStore = defaultStore;

export function getLlmCacheStore() {
  return activeStore;
}

export function setLlmCacheStore(store) {
  activeStore = store || defaultStore;
  return activeStore;
}

export function resetLlmCacheStore() {
  activeStore = defaultStore;
  return activeStore;
}

export function isLlmCacheEnabled(options = {}) {
  if (options.llmCacheEnabled === true) return true;
  if (options.llmCacheEnabled === false) return false;
  const v = String(process.env.QC_LLM_CACHE || "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

export function setCacheVersionOverride(value) {
  cacheVersionOverride = value == null ? null : Number(value);
}

export function getCacheVersion() {
  if (cacheVersionOverride != null && Number.isFinite(cacheVersionOverride)) {
    return cacheVersionOverride;
  }
  return CACHE_VERSION;
}

export function hashPromptContent(content) {
  return sha256Utf8(typeof content === "string" ? content : "");
}

export function resolvedModelId(stageKey) {
  const row = STAGE_MODELS[stageKey];
  return typeof row?.model === "string" ? row.model : "";
}

function sha256Utf8(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function cloneValue(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Encode one key component. Null is a distinct sentinel from empty string.
 * Strings are hashed as-is: no trim, lowercase, or whitespace collapse.
 */
function encodeComponent(name, value) {
  if (value === null || value === undefined) return `${name}:null`;
  if (typeof value === "number" && Number.isFinite(value)) return `${name}:n:${String(value)}`;
  if (typeof value === "boolean") return `${name}:b:${value ? "1" : "0"}`;
  return `${name}:s:${typeof value === "string" ? value : String(value)}`;
}

function normalizedParts(parts = {}) {
  const stage = STAGES.has(parts.stage) ? parts.stage : String(parts.stage || "");
  return {
    stage,
    inputText: typeof parts.inputText === "string" ? parts.inputText : "",
    parentSentence: parts.parentSentence === null || parts.parentSentence === undefined ? null : String(parts.parentSentence),
    sourceText: parts.sourceText === null || parts.sourceText === undefined ? null : String(parts.sourceText),
    promptHash: typeof parts.promptHash === "string" ? parts.promptHash : "",
    modelId: typeof parts.modelId === "string" ? parts.modelId : "",
    temperature: Number.isFinite(parts.temperature) ? parts.temperature : 0,
    seed: parts.seed === null || parts.seed === undefined ? null : parts.seed,
    cacheVersion: Number.isFinite(parts.cacheVersion) ? parts.cacheVersion : getCacheVersion(),
  };
}

export function buildComponentHashes(parts) {
  const n = normalizedParts(parts);
  const out = {};
  for (const name of COMPONENT_ORDER) {
    out[name] = sha256Utf8(encodeComponent(name, n[name]));
  }
  return out;
}

export function buildCacheKey(parts) {
  const hashes = buildComponentHashes(parts);
  return buildCacheKeyFromHashes(hashes);
}

export function buildCacheKeyFromHashes(componentHashes) {
  const joined = COMPONENT_ORDER.map((name) => String(componentHashes?.[name] || "")).join("|");
  return sha256Utf8(joined);
}

function emptyStageCounts() {
  return { hits: 0, misses: 0, tokensAvoided: 0, costAvoidedUsd: 0 };
}

function emptyStats(recordEvents = false) {
  return {
    stage1: emptyStageCounts(),
    stage1b: emptyStageCounts(),
    stage2: emptyStageCounts(),
    events: recordEvents ? [] : null,
    readCount: 0,
    writeCount: 0,
  };
}

export function beginCacheRun({ recordEvents = false } = {}) {
  const stats = emptyStats(recordEvents);
  cacheRunAls.enterWith(stats);
  return stats;
}

export function getCacheRunStats() {
  return cacheRunAls.getStore() || null;
}

export function endCacheRun() {
  const stats = cacheRunAls.getStore();
  cacheRunAls.enterWith(null);
  return summarizeCacheStats(stats);
}

export function summarizeCacheStats(stats) {
  const src = stats || emptyStats();
  const stages = ["stage1", "stage1b", "stage2"];
  const byStage = {};
  let hits = 0;
  let misses = 0;
  let tokensAvoided = 0;
  let costAvoidedUsd = 0;
  for (const stage of stages) {
    const row = src[stage] || emptyStageCounts();
    const total = row.hits + row.misses;
    const hitRate = total === 0 ? 0 : row.hits / total;
    byStage[stage] = {
      hits: row.hits,
      misses: row.misses,
      total,
      hitRate,
      tokensAvoided: row.tokensAvoided,
      costAvoidedUsd: row.costAvoidedUsd,
    };
    hits += row.hits;
    misses += row.misses;
    tokensAvoided += row.tokensAvoided;
    costAvoidedUsd += row.costAvoidedUsd;
  }
  const total = hits + misses;
  return {
    hits,
    misses,
    total,
    hitRate: total === 0 ? 0 : hits / total,
    tokensAvoided,
    costAvoidedUsd,
    byStage,
    readCount: src.readCount || 0,
    writeCount: src.writeCount || 0,
    events: Array.isArray(src.events) ? src.events : null,
  };
}

export function logCacheRunSummary(summary, label = "run") {
  if (!summary) return;
  const pct = (rate) => `${(rate * 100).toFixed(1)}%`;
  const money = (n) => `$${Number(n || 0).toFixed(4)}`;
  const s1 = summary.byStage.stage1;
  const s1b = summary.byStage.stage1b;
  const s2 = summary.byStage.stage2;
  console.log(
    `[QC_LLM_CACHE] ${label} hits=${summary.hits} misses=${summary.misses} hitRate=${pct(summary.hitRate)} tokensAvoided=${summary.tokensAvoided} costAvoided=${money(summary.costAvoidedUsd)} | stage1 ${s1.hits}/${s1.total} (${pct(s1.hitRate)}) stage1b ${s1b.hits}/${s1b.total} (${pct(s1b.hitRate)}) stage2 ${s2.hits}/${s2.total} (${pct(s2.hitRate)})`
  );
}

function activeStats() {
  return cacheRunAls.getStore();
}

function recordHit(stage, entry, eventInfo) {
  const stats = activeStats();
  if (!stats || !stats[stage]) return;
  stats[stage].hits += 1;
  const usage = entry?.usage || {};
  const tokens = (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0);
  stats[stage].tokensAvoided += tokens;
  stats[stage].costAvoidedUsd += Number(entry?.costUsd) || 0;
  if (Array.isArray(stats.events)) {
    stats.events.push({ stage, hit: true, ...eventInfo });
  }
}

function recordMiss(stage, eventInfo) {
  const stats = activeStats();
  if (!stats || !stats[stage]) return;
  stats[stage].misses += 1;
  if (Array.isArray(stats.events)) {
    stats.events.push({ stage, hit: false, ...eventInfo });
  }
}

function mismatchedComponent(storedHashes, computedHashes) {
  for (const name of COMPONENT_ORDER) {
    if (String(storedHashes?.[name] || "") !== String(computedHashes?.[name] || "")) {
      return name;
    }
  }
  return null;
}

function eventInfoFromParts(parts) {
  return {
    inputText: typeof parts.inputText === "string" ? parts.inputText : "",
    parentSentence: parts.parentSentence === null || parts.parentSentence === undefined ? null : String(parts.parentSentence),
    sourceText: parts.sourceText === null || parts.sourceText === undefined ? null : String(parts.sourceText),
  };
}

function metaFromResult(result, resultMeta) {
  if (typeof resultMeta === "function") {
    const meta = resultMeta(result) || {};
    return {
      usage: {
        inputTokens: Number(meta.usage?.inputTokens) || 0,
        outputTokens: Number(meta.usage?.outputTokens) || 0,
      },
      costUsd: Number(meta.costUsd) || 0,
      systemFingerprint:
        meta.systemFingerprint === undefined || meta.systemFingerprint === null
          ? null
          : String(meta.systemFingerprint),
    };
  }
  return {
    usage: {
      inputTokens: Number(result?.usage?.inputTokens) || 0,
      outputTokens: Number(result?.usage?.outputTokens) || 0,
    },
    costUsd: Number(result?.costUsd) || 0,
    systemFingerprint:
      result?.systemFingerprint === undefined || result?.systemFingerprint === null
        ? null
        : String(result.systemFingerprint),
  };
}

async function readEntry(key) {
  const stats = activeStats();
  if (stats) stats.readCount += 1;
  return activeStore.get(key);
}

async function writeEntry(key, entry) {
  const stats = activeStats();
  if (stats) stats.writeCount += 1;
  return activeStore.put(key, entry);
}

function buildEntry(n, componentHashes, payload, result, resultMeta) {
  const meta = metaFromResult(result, resultMeta);
  const costUsd = meta.costUsd || calculateLlmCostUsd("openai", n.modelId, meta.usage);
  return {
    payload: cloneValue(payload),
    componentHashes,
    modelId: n.modelId,
    promptHash: n.promptHash,
    systemFingerprint: meta.systemFingerprint,
    createdAt: new Date().toISOString(),
    usage: meta.usage,
    costUsd,
  };
}

/**
 * Read-only lookup. Hits record telemetry. Misses and store failures do not
 * record a miss (the caller records that when it actually runs the live call).
 */
export async function getLlmCache(parts) {
  if (!isLlmCacheEnabled()) return { hit: false, payload: undefined };
  const n = normalizedParts(parts);
  const componentHashes = buildComponentHashes(n);
  const key = buildCacheKeyFromHashes(componentHashes);
  const info = eventInfoFromParts(n);
  try {
    const stored = await readEntry(key);
    if (stored && typeof stored === "object") {
      const mismatch = mismatchedComponent(stored.componentHashes, componentHashes);
      if (mismatch) {
        console.warn(
          `[QC_LLM_CACHE] MISMATCH on component "${mismatch}"; treating as miss and overwriting. key=${key.slice(0, 16)}`
        );
        return { hit: false, payload: undefined, mismatch, key, componentHashes, n, info };
      }
      if (stored.payload !== undefined) {
        recordHit(n.stage, stored, info);
        return { hit: true, payload: cloneValue(stored.payload), key, componentHashes, n, info };
      }
    }
    return { hit: false, payload: undefined, key, componentHashes, n, info };
  } catch (err) {
    console.warn(`[QC_LLM_CACHE] read failed; falling through to live call. ${err?.message || String(err)}`);
    return { hit: false, payload: undefined, key, componentHashes, n, info, readFailed: true };
  }
}

export async function putLlmCache(parts, payload, resultMeta) {
  if (!isLlmCacheEnabled()) return;
  const n = normalizedParts(parts);
  const componentHashes = buildComponentHashes(n);
  const key = buildCacheKeyFromHashes(componentHashes);
  const info = eventInfoFromParts(n);
  recordMiss(n.stage, info);
  try {
    await writeEntry(key, buildEntry(n, componentHashes, payload, payload, resultMeta));
  } catch (err) {
    console.warn(`[QC_LLM_CACHE] write failed; live result still returned. ${err?.message || String(err)}`);
  }
}

/**
 * Lookup-or-call. On flag OFF this is `return liveCall()` with no store IO.
 * Store failures log and fall through to the live call.
 */
export async function withLlmCache({ parts, liveCall, resultMeta } = {}) {
  if (typeof liveCall !== "function") {
    throw new Error("withLlmCache requires liveCall");
  }
  if (!isLlmCacheEnabled()) {
    return liveCall();
  }

  const looked = await getLlmCache(parts);
  if (looked.hit) return looked.payload;

  const result = await liveCall();
  await putLlmCache(parts, result, resultMeta);
  return result;
}

export function mergeUsage(a, b) {
  return {
    inputTokens: (Number(a?.inputTokens) || 0) + (Number(b?.inputTokens) || 0),
    outputTokens: (Number(a?.outputTokens) || 0) + (Number(b?.outputTokens) || 0),
  };
}
