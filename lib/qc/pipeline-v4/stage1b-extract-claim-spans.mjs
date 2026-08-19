// Pipeline v4 Stage 1b: batched claim-span extraction (B53a).
// Flag-gated. Stage 1 is unchanged. Failed validation reverts the sentence
// to the undecomposed path (all-or-nothing).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callLLM, hasProviderApiKey } from "../../observability.js";
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
  const stats = { prefilterPassed: 0, decomposed: 0, reverted };

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
  const userPrompt = candidates
    .map((row, i) => `[${i}] ${row.text}`)
    .join("\n\n");

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

  let completion = await callStage1b();
  let parsed = safeJsonParse(completion?.text ?? "");
  if (!parsed || !Array.isArray(parsed.sentences)) {
    completion = await callStage1b();
    parsed = safeJsonParse(completion?.text ?? "");
  }

  const byCandidateIndex = new Map();
  if (parsed && Array.isArray(parsed.sentences)) {
    for (const item of parsed.sentences) {
      const idx = Number(item?.index);
      if (!Number.isFinite(idx)) continue;
      byCandidateIndex.set(idx, Array.isArray(item?.claims) ? item.claims : []);
    }
  } else {
    for (const row of candidates) {
      logFallback(row.statementIndex, "llm_invalid_json");
      reverted.push({ statementIndex: row.statementIndex, reason: "llm_invalid_json", parent: row.text, claims: [] });
    }
    return { byStatementIndex, stats };
  }

  void draftText;

  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i];
    const modelClaims = byCandidateIndex.has(i) ? byCandidateIndex.get(i) : byCandidateIndex.get(row.statementIndex);
    if (!Array.isArray(modelClaims)) {
      logFallback(row.statementIndex, "llm_missing_sentence");
      reverted.push({ statementIndex: row.statementIndex, reason: "llm_missing_sentence", parent: row.text, claims: [] });
      continue;
    }
    if (modelClaims.length > MAX_CLAIMS_PER_SENTENCE) {
      logFallback(row.statementIndex, "over_claim_cap");
      reverted.push({
        statementIndex: row.statementIndex,
        reason: "over_claim_cap",
        parent: row.text,
        claims: modelClaims,
      });
      continue;
    }
    const validated = validateClaimSpans(row.text, modelClaims);
    if (!validated.ok) {
      logFallback(row.statementIndex, validated.reason);
      reverted.push({
        statementIndex: row.statementIndex,
        reason: validated.reason,
        parent: row.text,
        claims: modelClaims,
        failedClaim: validated.failedClaim || "",
      });
      continue;
    }
    const attached = attachDraftOffsets(row.stmt, validated.claims);
    byStatementIndex.set(row.statementIndex, attached);
    stats.decomposed += 1;
  }

  return { byStatementIndex, stats };
}
