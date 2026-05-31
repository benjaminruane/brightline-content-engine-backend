import { callLLM, hasProviderApiKey, logCanaryScore } from "../observability.js";
import { STAGE_MODELS } from "./model-config.mjs";

const SYSTEM_PROMPT = `You decide which editorial concerns are duplicates of an evidence-conflict finding.

You receive: a draft statement, an explanation of why the source CONFLICTS with the statement, and a list of editorial concerns about the same statement.

For each editorial concern, decide:
- DUPLICATE: the concern's substance is the same factual disagreement the evidence finding describes, just in editorial language. The reviewer would learn nothing new from the editorial concern that the evidence finding hasn't already told them.
- INDEPENDENT: the concern is about something other than the factual conflict — register, voice, structure, defined terms, style, phrasing choices, narrative arc unrelated to the source contradiction, etc. The reviewer benefits from this concern regardless of the factual conflict.

When in doubt, classify as INDEPENDENT. Only mark DUPLICATE when the duplication is clear.

Return JSON only: { "suppressIndices": number[] } where the array contains the indices of DUPLICATE concerns. Empty array if none.`;

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

function normalizeSuppressIndices(parsed, concernCount) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const raw = parsed.suppressIndices;
  if (!Array.isArray(raw)) return null;
  const indices = [];
  for (const item of raw) {
    if (!Number.isInteger(item) || item < 0 || item >= concernCount) continue;
    if (!indices.includes(item)) indices.push(item);
  }
  return indices;
}

function buildUserPrompt(statementText, evidenceExplanation, editorialConcerns) {
  return `Statement: ${statementText}
Evidence-conflict explanation: ${evidenceExplanation}

Editorial concerns:
${JSON.stringify(editorialConcerns, null, 2)}`;
}

function logJudgeFailed(traceId, statementIndex, retried) {
  if (typeof traceId === "string" && traceId.trim()) {
    logCanaryScore({
      traceId,
      name: "editorial_duplication_judge_failed",
      value: 1,
      metadata: {
        statementIndex: Number.isFinite(statementIndex) ? statementIndex : null,
        retried: retried === true,
      },
    });
  }
}

/**
 * @param {{
 *   statementText: string,
 *   evidenceExplanation: string,
 *   editorialConcerns: Array<{ index: number, ruleId: string, concernText: string }>,
 *   traceId?: string,
 *   statementIndex?: number
 * }} params
 * @returns {Promise<number[]>}
 */
export async function judgeEditorialDuplication({
  statementText,
  evidenceExplanation,
  editorialConcerns,
  traceId,
  statementIndex,
}) {
  const concerns = Array.isArray(editorialConcerns) ? editorialConcerns : [];
  if (concerns.length === 0) return [];

  const modelConfig = STAGE_MODELS["editorial-duplication-judge"];
  if (!modelConfig || !hasProviderApiKey(modelConfig.provider)) {
    return [];
  }

  const userPrompt = buildUserPrompt(
    typeof statementText === "string" ? statementText : "",
    typeof evidenceExplanation === "string" ? evidenceExplanation : "",
    concerns
  );

  const baseMetadata = {
    module: "editorial-duplication-judge",
    statementIndex: Number.isFinite(statementIndex) ? Number(statementIndex) : null,
    concernCount: concerns.length,
  };

  async function callJudge(attempt) {
    return callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      traceId,
      traceName: "qc-run",
      spanName: "editorial-duplication-judge",
      metadata: { ...baseMetadata, attempt },
    });
  }

  try {
    let completion = await callJudge(1);
    let normalized = normalizeSuppressIndices(
      safeJsonParse(completion?.text ?? ""),
      concerns.length
    );

    if (normalized === null) {
      completion = await callJudge(2);
      normalized = normalizeSuppressIndices(
        safeJsonParse(completion?.text ?? ""),
        concerns.length
      );
    }

    if (normalized === null) {
      logJudgeFailed(traceId, statementIndex, true);
      return [];
    }

    return normalized;
  } catch {
    return [];
  }
}
