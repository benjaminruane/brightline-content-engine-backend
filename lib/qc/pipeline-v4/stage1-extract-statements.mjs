// Pipeline v4 — Stage 1: sentence extraction (QC rebuild).
// LLM split with strict validation; deterministic fallback matches v3 behaviour.

import { extractStatements as extractStatementsDeterministic } from "../../extract-statements.mjs";
import { locateStatements } from "../locate-statement.mjs";
import { callLLM, calculateLlmCostUsd, hasProviderApiKey, logCanaryScore } from "../../observability.js";
import {
  getCacheVersion,
  hashPromptContent,
  mergeUsage,
  withLlmCache,
} from "../llm-cache.mjs";
import { STAGE_MODELS } from "../model-config.mjs";

const STAGE1_SYSTEM_PROMPT = `
You split a draft into complete sentences.
Return ONLY a JSON object in this exact shape:
{ "statements": [ { "text": "First sentence.", "isClaim": true }, { "text": "Second sentence.", "isClaim": true } ] }

Constraints:
• Do not split within a sentence
• Do not merge sentences
• Do not rephrase any sentence
• Do not introduce any content not present in the draft
• Preserve all numbers, percentages, currency figures, and proper nouns exactly as they appear
• Return every sentence in the draft — omit nothing
• For each sentence, set "isClaim" to true or false.
• "isClaim": false ONLY when the ENTIRE sentence is structural with no verifiable content — a salutation ("Dear investors,"), a sign-off or closing courtesy ("Yours sincerely,", "We look forward to providing further updates."), a bare transition with no facts ("Three people deserve particular credit."), or a standalone header or label.
• "isClaim": true for everything else, including any sentence that contains a number, name, date, factual assertion, forward-looking statement, or recommendation — even if it also contains structural text. When a sentence mixes structural text and a verifiable claim, it is a claim (true).
• When uncertain, set "isClaim": true.
`.trim();

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

function validateAndMapLlmStatements(draftText, statementTexts) {
  const draft = typeof draftText === "string" ? draftText : "";
  const spans = locateStatements(draft, statementTexts);
  const errors = [];
  const statements = [];

  for (let i = 0; i < statementTexts.length; i += 1) {
    const rawText = typeof statementTexts[i] === "string" ? statementTexts[i] : "";
    if (!rawText.trim()) {
      errors.push(`statement ${i}: empty text`);
      return { ok: false, errors };
    }
    const span = spans[i];
    if (!span) {
      errors.push(`statement ${i}: not in the draft`);
      return { ok: false, errors };
    }
    statements.push({
      index: i,
      text: draft.slice(span.start, span.end),
      charStart: span.start,
      charEnd: span.end,
      attempt: "llm",
    });
  }

  return { ok: true, statements, errors: [] };
}

function mapWithExactSearchOnly(draftText, statementTexts) {
  const draft = typeof draftText === "string" ? draftText : "";
  const spans = locateStatements(draft, statementTexts);
  const out = [];
  for (let i = 0; i < statementTexts.length; i += 1) {
    const span = spans[i];
    if (!span) continue;
    out.push({
      text: draft.slice(span.start, span.end),
      startChar: span.start,
      endChar: span.end,
    });
  }
  return out;
}

function fallbackExtract(draftText) {
  const splitResult = extractStatementsDeterministic({
    mode: "draft",
    text: typeof draftText === "string" ? draftText : "",
    opts: { engine: "v2" },
  });
  const candidates = Array.isArray(splitResult?.candidates) ? splitResult.candidates : [];
  if (candidates.length === 0) {
    throw new Error("stage1: fallback splitter returned empty result");
  }
  const mapped = mapWithExactSearchOnly(draftText, candidates);
  if (mapped.length === 0) {
    throw new Error("stage1: fallback splitter returned empty result");
  }
  if (mapped.length !== candidates.length) {
    throw new Error("stage1: fallback splitter returned empty result");
  }
  return mapped;
}

function toFallbackResult(draftText, errors, { llmRejected = false, logReason = null } = {}) {
  const reasonStr = errors.length > 0 ? errors.join("; ") : logReason || "deterministic splitter";
  if (llmRejected) {
    console.warn(`[stage1] LLM response rejected, using fallback. Reasons: ${reasonStr}`);
  } else {
    console.warn(`[stage1] using fallback. Reasons: ${reasonStr}`);
  }
  try {
    const mapped = fallbackExtract(draftText);
    return {
      statements: mapped.map((m, index) => ({
        index,
        text: m.text,
        charStart: m.startChar,
        charEnd: m.endChar,
        attempt: "fallback",
      })),
      droppedNonClaims: [],
      source: "fallback",
      errors,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    return {
      statements: [],
      droppedNonClaims: [],
      source: "fallback",
      errors: errors.length > 0 ? [...errors, msg] : [msg],
    };
  }
}

function isValidLlmPayload(parsed) {
  if (!parsed || typeof parsed !== "object") return false;
  if (!Array.isArray(parsed.statements)) return false;
  if (parsed.statements.length === 0) return false;
  for (const item of parsed.statements) {
    if (!item || typeof item !== "object") return false;
    if (typeof item.text !== "string" || !item.text.trim()) return false;
  }
  return true;
}

function extractStatementTextsFromPayload(parsed) {
  const statementTexts = [];
  const claimFlags = [];
  for (const item of parsed.statements) {
    statementTexts.push(item.text);
    claimFlags.push(item.isClaim === false ? false : true);
  }
  return { statementTexts, claimFlags };
}

function usageFromCompletion(completion) {
  return {
    inputTokens: Number(completion?.usage?.inputTokens) || 0,
    outputTokens: Number(completion?.usage?.outputTokens) || 0,
  };
}

function costFromCompletion(stageModel, completion) {
  return calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
}

function fingerprintFromCompletion(completion) {
  const raw = completion?.raw;
  if (!raw || typeof raw !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(raw, "system_fingerprint")) return null;
  if (raw.system_fingerprint === undefined || raw.system_fingerprint === null) return null;
  return String(raw.system_fingerprint);
}

async function extractStatementsLive({ safeDraft, trace, stageModel }) {
  const llmMetadata = { stage: "stage1-extract-statements" };
  let usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let systemFingerprint = null;

  async function callStage1Llm() {
    return callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      responseFormat: "json",
      messages: [
        { role: "system", content: STAGE1_SYSTEM_PROMPT },
        { role: "user", content: safeDraft },
      ],
      traceId: trace,
      traceName: "qc-run",
      spanName: "stage1-extract-statements",
      metadata: llmMetadata,
    });
  }

  let completion = await callStage1Llm();
  usage = mergeUsage(usage, usageFromCompletion(completion));
  costUsd += costFromCompletion(stageModel, completion);
  systemFingerprint = fingerprintFromCompletion(completion);
  let parsed = safeJsonParse(completion?.text ?? "");
  if (!isValidLlmPayload(parsed)) {
    completion = await callStage1Llm();
    usage = mergeUsage(usage, usageFromCompletion(completion));
    costUsd += costFromCompletion(stageModel, completion);
    systemFingerprint = fingerprintFromCompletion(completion) || systemFingerprint;
    parsed = safeJsonParse(completion?.text ?? "");
  }

  if (!isValidLlmPayload(parsed)) {
    const reasons = ["LLM output invalid JSON or schema after retry (expected { statements: [{ text }] })"];
    if (trace) {
      logCanaryScore({
        traceId: trace,
        name: "stage1_validation_rejected",
        value: 1,
        comment: reasons.join("; "),
      });
    }
    return {
      ...toFallbackResult(safeDraft, reasons, { llmRejected: true }),
      usage,
      costUsd,
      systemFingerprint,
    };
  }

  const { statementTexts, claimFlags } = extractStatementTextsFromPayload(parsed);
  const validation = validateAndMapLlmStatements(safeDraft, statementTexts);
  if (!validation.ok) {
    const reasons = validation.errors;
    if (trace) {
      logCanaryScore({
        traceId: trace,
        name: "stage1_validation_rejected",
        value: 1,
        comment: reasons.join("; "),
      });
    }
    return {
      ...toFallbackResult(safeDraft, reasons, { llmRejected: true }),
      usage,
      costUsd,
      systemFingerprint,
    };
  }

  const classifiedStatements = validation.statements.map((statement, i) => ({
    ...statement,
    isClaim: claimFlags[i] !== false,
  }));

  const keptStatements = classifiedStatements.filter((statement) => statement.isClaim !== false);
  const droppedCount = classifiedStatements.length - keptStatements.length;

  let finalStatements;
  let droppedNonClaims = [];
  if (classifiedStatements.length > 0 && keptStatements.length === 0) {
    console.log("[stage1] all statements classified non-claim; keeping all to avoid empty result");
    finalStatements = classifiedStatements;
  } else {
    if (droppedCount > 0) {
      droppedNonClaims = classifiedStatements
        .filter((statement) => statement.isClaim === false)
        .map((statement) => ({
          text: statement.text,
          charStart: statement.charStart,
          charEnd: statement.charEnd,
          reason: "not_a_claim",
          reasonText: "Not checked as a claim (heading, salutation, or transition).",
        }));
      console.log(
        `[stage1] dropped ${droppedCount} non-claim statement(s) (salutations/closings/transitions)`
      );
    }
    finalStatements = keptStatements;
  }

  return {
    statements: finalStatements.map((statement, index) => ({
      index,
      text: statement.text,
      charStart: statement.charStart,
      charEnd: statement.charEnd,
      attempt: statement.attempt,
    })),
    droppedNonClaims,
    source: "llm",
    errors: [],
    usage,
    costUsd,
    systemFingerprint,
  };
}

/**
 * @param {{ draftText: string, traceId?: string }} params
 * @returns {Promise<{ statements: Array<{ index: number, text: string, charStart: number, charEnd: number, attempt: string }>, source: string, errors: string[] }>}
 */
export async function extractStatements({ draftText, traceId }) {
  const safeDraft = typeof draftText === "string" ? draftText : "";
  const trace = typeof traceId === "string" && traceId.trim() ? traceId.trim() : undefined;

  if (!safeDraft.trim()) {
    return { statements: [], source: "fallback", errors: [] };
  }

  const stageModel = STAGE_MODELS["stage1-splitting"];
  if (!stageModel || !hasProviderApiKey(stageModel.provider)) {
    return toFallbackResult(safeDraft, [], {
      llmRejected: false,
      logReason: "no provider API key for stage1-splitting",
    });
  }

  return withLlmCache({
    parts: {
      stage: "stage1",
      inputText: safeDraft,
      parentSentence: null,
      sourceText: null,
      promptHash: hashPromptContent(STAGE1_SYSTEM_PROMPT),
      modelId: stageModel.model,
      temperature: 0,
      seed: null,
      cacheVersion: getCacheVersion(),
    },
    liveCall: () => extractStatementsLive({ safeDraft, trace, stageModel }),
  });
}
