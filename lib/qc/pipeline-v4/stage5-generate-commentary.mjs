import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { callLLM, calculateLlmCostUsd, hasProviderApiKey, logCanaryScore } from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STAGE5_PROMPT_PATH = path.join(__dirname, "prompts", "stage5_v2.md");

let stage5SystemPromptCache = null;

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0 };

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function mergeUsage(a, b) {
  return {
    inputTokens: (Number(a?.inputTokens) || 0) + (Number(b?.inputTokens) || 0),
    outputTokens: (Number(a?.outputTokens) || 0) + (Number(b?.outputTokens) || 0),
  };
}

function normalizeVerdict(verdict) {
  const v = safeText(verdict);
  if (v === "confirmed" || v === "partially_confirmed" || v === "conflicting" || v === "not_supported") {
    return v;
  }
  return "not_supported";
}

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
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

function normalizeCommentaryPayload(parsed) {
  const commentary = safeText(parsed?.commentary);
  if (!commentary) return null;
  return { commentary };
}

function buildFallbackCommentary(verdict) {
  if (verdict === "confirmed") {
    return "Verdict: confirmed. Specific commentary is unavailable from the system; please review the source directly before finalizing.";
  }
  if (verdict === "partially_confirmed") {
    return "Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and adjust the statement to match the source language.";
  }
  if (verdict === "conflicting") {
    return "Verdict: conflicting. Specific commentary is unavailable from the system; please reconcile the contradiction or remove the claim.";
  }
  return "Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.";
}

async function getStage5SystemPrompt() {
  if (typeof stage5SystemPromptCache === "string" && stage5SystemPromptCache.trim()) {
    return stage5SystemPromptCache;
  }
  const prompt = await readFile(STAGE5_PROMPT_PATH, "utf8");
  stage5SystemPromptCache = prompt.trim();
  return stage5SystemPromptCache;
}

function normalizeSourceExplanations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const classification = safeText(item?.classification);
      const explanation = safeText(item?.explanation);
      if (!classification && !explanation) return null;
      return { classification: classification || "(unknown)", explanation: explanation || "(none)" };
    })
    .filter(Boolean);
}

function buildUserPrompt({ statement, verdict, hasConflict, primaryExcerpt, conflictExcerpt, sourceExplanations }) {
  const normalizedExplanations = normalizeSourceExplanations(sourceExplanations);
  const blocks = [
    `statement: ${typeof statement === "string" ? statement : ""}`,
    `verdict: ${verdict}`,
    `hasConflict: ${hasConflict ? "true" : "false"}`,
    `primaryExcerpt: ${safeText(primaryExcerpt) || "(none)"}`,
    `conflictExcerpt: ${safeText(conflictExcerpt) || "(none)"}`,
    `sourceExplanations: ${
      normalizedExplanations.length > 0 ? JSON.stringify(normalizedExplanations) : "(none)"
    }`,
    'Return JSON only: { "commentary": "<string>" }',
  ];
  return blocks.join("\n\n");
}

/**
 * @param {{
 *   statement: string,
 *   verdict: string,
 *   hasConflict: boolean,
 *   primaryExcerpt: string | null,
 *   conflictExcerpt: string | null,
 *   sourceExplanations?: Array<{ classification?: string, explanation?: string }>,
 *   traceId?: string,
 *   statementIndex?: number
 * }} params
 * @returns {Promise<{
 *   commentary: string,
 *   schemaValid: boolean,
 *   retried: boolean,
 *   latencyMs: number,
 *   usage: { inputTokens: number, outputTokens: number },
 *   costUsd: number
 * }>}
 */
export async function generateCommentary({
  statement,
  verdict,
  hasConflict,
  primaryExcerpt,
  conflictExcerpt,
  sourceExplanations,
  traceId,
  statementIndex,
}) {
  const normalizedVerdict = normalizeVerdict(verdict);
  const stageModel = STAGE_MODELS["stage5-commentary"];
  if (!stageModel || !hasProviderApiKey(stageModel.provider)) {
    return {
      commentary: buildFallbackCommentary(normalizedVerdict),
      schemaValid: false,
      retried: false,
      latencyMs: 0,
      usage: { ...EMPTY_USAGE },
      costUsd: 0,
    };
  }

  const prompt = await getStage5SystemPrompt();
  const userPrompt = buildUserPrompt({
    statement,
    verdict: normalizedVerdict,
    hasConflict: hasConflict === true,
    primaryExcerpt,
    conflictExcerpt,
    sourceExplanations,
  });

  const baseMetadata = {
    stage: "stage5-generate-commentary",
    statementIndex: Number.isFinite(statementIndex) ? Number(statementIndex) : null,
    verdict: normalizedVerdict,
    hasConflict: hasConflict === true,
  };

  let usage = { ...EMPTY_USAGE };
  let latencyMs = 0;
  let costUsd = 0;
  let retried = false;

  async function callStage5(attempt) {
    return callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userPrompt },
      ],
      traceId,
      traceName: "qc-run",
      spanName: "stage5-generate-commentary",
      metadata: { ...baseMetadata, attempt },
    });
  }

  try {
    let completion = await callStage5(1);
    usage = mergeUsage(usage, completion?.usage || {});
    latencyMs += Number(completion?.latencyMs) || 0;
    costUsd += calculateLlmCostUsd(completion?.provider, completion?.model, completion?.usage);
    let normalized = normalizeCommentaryPayload(safeJsonParse(completion?.text ?? ""));

    if (!normalized) {
      retried = true;
      completion = await callStage5(2);
      usage = mergeUsage(usage, completion?.usage || {});
      latencyMs += Number(completion?.latencyMs) || 0;
      costUsd += calculateLlmCostUsd(completion?.provider, completion?.model, completion?.usage);
      normalized = normalizeCommentaryPayload(safeJsonParse(completion?.text ?? ""));
    }

    if (!normalized) {
      if (traceId) {
        logCanaryScore({
          traceId,
          name: "stage5_schema_validation_failed",
          value: 1,
          comment: `Stage 5 schema validation failed after retry for statement ${
            Number.isFinite(statementIndex) ? statementIndex : "unknown"
          }.`,
        });
      }
      return {
        commentary: buildFallbackCommentary(normalizedVerdict),
        schemaValid: false,
        retried,
        latencyMs,
        usage,
        costUsd,
      };
    }

    return {
      commentary: normalized.commentary,
      schemaValid: true,
      retried,
      latencyMs,
      usage,
      costUsd,
    };
  } catch {
    return {
      commentary: buildFallbackCommentary(normalizedVerdict),
      schemaValid: false,
      retried,
      latencyMs,
      usage,
      costUsd,
    };
  }
}
