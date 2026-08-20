// Pipeline v4 Stage 1b: batched claim-span extraction (B53a).
// Flag-gated. Stage 1 is unchanged. Failed validation reverts the sentence
// to the undecomposed path (all-or-nothing).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callLLM, calculateLlmCostUsd, hasProviderApiKey } from "../../observability.js";
import {
  getCacheVersion,
  getLlmCache,
  hashPromptContent,
  isLlmCacheEnabled,
  mergeUsage,
  putLlmCache,
} from "../llm-cache.mjs";
import { STAGE_MODELS } from "../model-config.mjs";
import {
  MAX_CLAIMS_PER_SENTENCE,
  MAX_DECOMPOSED_SENTENCES,
  attachDraftOffsets,
  isClaimSpansEnabled,
  isCompoundCandidate,
  validateClaimSpans,
} from "../claim-spans.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STAGE1B_PROMPT_PATH = path.join(__dirname, "prompts", "stage1b_v1.md");

let stage1bSystemPromptCache = null;

async function getStage1bSystemPrompt() {
  if (typeof stage1bSystemPromptCache === "string" && stage1bSystemPromptCache.trim()) {
    return stage1bSystemPromptCache;
  }
  const prompt = await readFile(STAGE1B_PROMPT_PATH, "utf8");
  stage1bSystemPromptCache = prompt.trim();
  return stage1bSystemPromptCache;
}

export function resetStage1bPromptCache() {
  stage1bSystemPromptCache = null;
}

function safeJsonParse(text) {
  if (typeof text === "string" && text.trim()) {
    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function statementIndexOf(stmt, ord) {
  return Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
}

function logFallback(statementIndex, reason) {
  console.warn(`[claim-spans] fallback statementIndex=${statementIndex} reason=${reason}`);
}

function usageFromCompletion(completion) {
  return {
    inputTokens: Number(completion?.usage?.inputTokens) || 0,
    outputTokens: Number(completion?.usage?.outputTokens) || 0,
  };
}

function fingerprintFromCompletion(completion) {
  const raw = completion?.raw;
  if (!raw || typeof raw !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(raw, "system_fingerprint")) return null;
  if (raw.system_fingerprint === undefined || raw.system_fingerprint === null) return null;
  return String(raw.system_fingerprint);
}

function applyCachedRow(row, payload, byStatementIndex, stats, reverted) {
  if (payload?.kind === "claims" && Array.isArray(payload.claims)) {
    const attached = attachDraftOffsets(row.stmt, payload.claims);
    byStatementIndex.set(row.statementIndex, attached);
    stats.decomposed += 1;
    return;
  }
  const reason = typeof payload?.reason === "string" ? payload.reason : "llm_missing_sentence";
  logFallback(row.statementIndex, reason);
  reverted.push({
    statementIndex: row.statementIndex,
    reason,
    parent: row.text,
    claims: Array.isArray(payload?.claims) ? payload.claims : [],
    ...(payload?.failedClaim ? { failedClaim: payload.failedClaim } : {}),
  });
}

/**
 * Existing batched Stage 1b call. Unchanged prompt bytes, params, and error handling.
 * Returns per-candidate payloads plus shared usage for cache meta.
 */
async function runStage1bBatch(candidates, { draftText, traceId, stageModel, systemPrompt }) {
  void draftText;
  const userPrompt = candidates.map((row, i) => `[${i}] ${row.text}`).join("\n\n");
  const llmMetadata = { stage: "stage1b-extract-claim-spans" };
  const trace = typeof traceId === "string" && traceId.trim() ? traceId.trim() : undefined;

  async function callStage1b() {
    return callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      traceId: trace,
      traceName: "qc-run",
      spanName: "stage1b-extract-claim-spans",
      metadata: llmMetadata,
    });
  }

  let usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let systemFingerprint = null;

  let completion = await callStage1b();
  usage = mergeUsage(usage, usageFromCompletion(completion));
  costUsd += calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  systemFingerprint = fingerprintFromCompletion(completion);
  let parsed = safeJsonParse(completion?.text ?? "");
  if (!parsed || !Array.isArray(parsed.sentences)) {
    completion = await callStage1b();
    usage = mergeUsage(usage, usageFromCompletion(completion));
    costUsd += calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
    systemFingerprint = fingerprintFromCompletion(completion) || systemFingerprint;
    parsed = safeJsonParse(completion?.text ?? "");
  }

  const payloads = [];
  const byCandidateIndex = new Map();
  if (parsed && Array.isArray(parsed.sentences)) {
    for (const item of parsed.sentences) {
      const idx = Number(item?.index);
      if (!Number.isFinite(idx)) continue;
      byCandidateIndex.set(idx, Array.isArray(item?.claims) ? item.claims : []);
    }
  } else {
    for (const row of candidates) {
      payloads.push({
        row,
        payload: { kind: "revert", reason: "llm_invalid_json", parent: row.text, claims: [] },
      });
    }
    return { payloads, usage, costUsd, systemFingerprint };
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const modelClaims = byCandidateIndex.has(i) ? byCandidateIndex.get(i) : byCandidateIndex.get(row.statementIndex);
    if (!Array.isArray(modelClaims)) {
      payloads.push({
        row,
        payload: { kind: "revert", reason: "llm_missing_sentence", parent: row.text, claims: [] },
      });
      continue;
    }
    if (modelClaims.length > MAX_CLAIMS_PER_SENTENCE) {
      payloads.push({
        row,
        payload: {
          kind: "revert",
          reason: "over_claim_cap",
          parent: row.text,
          claims: modelClaims,
        },
      });
      continue;
    }
    const validated = validateClaimSpans(row.text, modelClaims);
    if (!validated.ok) {
      payloads.push({
        row,
        payload: {
          kind: "revert",
          reason: validated.reason,
          parent: row.text,
          claims: modelClaims,
          failedClaim: validated.failedClaim || "",
        },
      });
      continue;
    }
    payloads.push({
      row,
      payload: { kind: "claims", claims: validated.claims },
    });
  }

  return { payloads, usage, costUsd, systemFingerprint };
}

function stage1bCacheParts(parentSentence, promptHash, modelId) {
  return {
    stage: "stage1b",
    inputText: parentSentence,
    parentSentence: null,
    sourceText: null,
    promptHash,
    modelId,
    temperature: 0,
    seed: null,
    cacheVersion: getCacheVersion(),
  };
}

/**
 * @param {{
 *   statements: Array<{ index?: number, text?: string, charStart?: number, charEnd?: number, startChar?: number }>,
 *   draftText?: string,
 *   traceId?: string,
 *   options?: Record<string, unknown>,
 * }} params
 * @returns {Promise<{
 *   byStatementIndex: Map<number, Array<object>>,
 *   stats: { prefilterPassed: number, decomposed: number, reverted: Array<{ statementIndex: number, reason: string }> }
 * }>}
 */
export async function extractClaimSpans({ statements, draftText, traceId, options = {} } = {}) {
  const byStatementIndex = new Map();
  const reverted = [];
  const stats = {
    prefilterPassed: 0,
    decomposed: 0,
    reverted,
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
  };

  if (!isClaimSpansEnabled(options)) {
    return { byStatementIndex, stats };
  }

  const safeStatements = Array.isArray(statements) ? statements : [];
  const candidates = [];
  for (let ord = 0; ord < safeStatements.length; ord += 1) {
    const stmt = safeStatements[ord];
    const statementIndex = statementIndexOf(stmt, ord);
    const text = typeof stmt?.text === "string" ? stmt.text : "";
    if (!isCompoundCandidate(text)) continue;
    stats.prefilterPassed += 1;
    if (candidates.length >= MAX_DECOMPOSED_SENTENCES) {
      logFallback(statementIndex, "over_sentence_cap");
      reverted.push({ statementIndex, reason: "over_sentence_cap", parent: text, claims: [] });
      continue;
    }
    candidates.push({ stmt, statementIndex, ord, text });
  }

  if (candidates.length === 0) {
    return { byStatementIndex, stats };
  }

  const stageModel = STAGE_MODELS["stage1b-claim-spans"] || STAGE_MODELS["stage1-splitting"];
  if (!stageModel || !hasProviderApiKey(stageModel.provider)) {
    for (const row of candidates) {
      logFallback(row.statementIndex, "no_provider_key");
      reverted.push({ statementIndex: row.statementIndex, reason: "no_provider_key", parent: row.text, claims: [] });
    }
    return { byStatementIndex, stats };
  }

  const systemPrompt = await getStage1bSystemPrompt();
  const promptHash = hashPromptContent(systemPrompt);
  const modelId = stageModel.model;
  void draftText;

  async function applyLiveBatch(rows) {
    if (rows.length === 0) return;
    const n = rows.length;
    const batch = await runStage1bBatch(rows, { draftText, traceId, stageModel, systemPrompt });
    stats.usage = mergeUsage(stats.usage, batch.usage);
    stats.costUsd = (Number(stats.costUsd) || 0) + (Number(batch.costUsd) || 0);
    const share = {
      usage: {
        inputTokens: Math.round((Number(batch.usage?.inputTokens) || 0) / n),
        outputTokens: Math.round((Number(batch.usage?.outputTokens) || 0) / n),
      },
      costUsd: (Number(batch.costUsd) || 0) / n,
      systemFingerprint: batch.systemFingerprint,
    };
    for (const item of batch.payloads) {
      applyCachedRow(item.row, item.payload, byStatementIndex, stats, reverted);
      if (isLlmCacheEnabled()) {
        await putLlmCache(stage1bCacheParts(item.row.text, promptHash, modelId), item.payload, () => share);
      }
    }
  }

  if (!isLlmCacheEnabled()) {
    await applyLiveBatch(candidates);
    return { byStatementIndex, stats };
  }

  const misses = [];
  for (const row of candidates) {
    const looked = await getLlmCache(stage1bCacheParts(row.text, promptHash, modelId));
    if (looked.hit) {
      applyCachedRow(row, looked.payload, byStatementIndex, stats, reverted);
    } else {
      misses.push(row);
    }
  }

  if (misses.length > 0) {
    await applyLiveBatch(misses);
  }

  return { byStatementIndex, stats };
}
