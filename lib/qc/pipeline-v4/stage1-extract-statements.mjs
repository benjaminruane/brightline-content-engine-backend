// Pipeline v4 — Stage 1: sentence extraction (QC rebuild).
// LLM split with strict validation; deterministic fallback matches v3 behaviour.

import { extractStatements as extractStatementsDeterministic } from "../../extract-statements.mjs";
import { callLLM, hasProviderApiKey, logCanaryScore } from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";

const STAGE1_SYSTEM_PROMPT = `
You split a draft into complete sentences.
Return ONLY a JSON object in this exact shape:
{ "statements": [ { "text": "First sentence." }, { "text": "Second sentence." } ] }

Constraints:
• Do not split within a sentence
• Do not merge sentences
• Do not rephrase any sentence
• Do not introduce any content not present in the draft
• Preserve all numbers, percentages, currency figures, and proper nouns exactly as they appear
• Return every sentence in the draft — omit nothing
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

function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function getTrimmedDraftWithOffset(draftText) {
  const raw = typeof draftText === "string" ? draftText : "";
  const trimmed = raw.trim();
  const offset = raw.indexOf(trimmed);
  return { raw, trimmed, offset: offset >= 0 ? offset : 0 };
}

/**
 * Collapse whitespace runs to single spaces; map each normalized index to [origStart, origEnd) in `trimmed`.
 * @param {string} trimmed
 */
function buildWhitespaceNormalizedMapping(trimmed) {
  const normChars = [];
  const startOrig = [];
  const endOrig = [];
  let i = 0;
  while (i < trimmed.length) {
    if (/\s/.test(trimmed[i])) {
      const wsStart = i;
      while (i < trimmed.length && /\s/.test(trimmed[i])) i++;
      if (normChars.length === 0 || normChars[normChars.length - 1] !== " ") {
        normChars.push(" ");
        startOrig.push(wsStart);
        endOrig.push(i);
      }
    } else {
      normChars.push(trimmed[i]);
      startOrig.push(i);
      endOrig.push(i + 1);
      i++;
    }
  }
  return {
    norm: normChars.join(""),
    startOrig,
    endOrig,
  };
}

function normalizeStatementForMatch(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return "";
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Find next span in draft (trimmed + offset) for one statement after cursorNorm in normalized space.
 * @returns {{ charStart: number, charEnd: number, nextCursorNorm: number } | null}
 */
function locateStatementSpan({ trimmed, offset, mapping, normStmt, cursorNorm }) {
  if (!normStmt) return null;
  const { norm: normDraft, startOrig, endOrig } = mapping;
  if (normStmt.length === 0 || normDraft.length === 0) return null;

  const L = normStmt.length;
  const exactIdx = normDraft.indexOf(normStmt, cursorNorm);
  if (exactIdx >= 0) {
    const p = exactIdx;
    const charStart = offset + startOrig[p];
    const charEnd = offset + endOrig[p + L - 1];
    return { charStart, charEnd, nextCursorNorm: p + L };
  }

  const minWin = Math.max(1, L - 2);
  const maxWin = L + 2;
  for (let i = cursorNorm; i < normDraft.length; i++) {
    for (let wlen = minWin; wlen <= maxWin; wlen++) {
      if (i + wlen > normDraft.length) break;
      const slice = normDraft.slice(i, i + wlen);
      if (levenshteinDistance(normStmt, slice) <= 2) {
        const p = i;
        const charStart = offset + startOrig[p];
        const charEnd = offset + endOrig[p + wlen - 1];
        return { charStart, charEnd, nextCursorNorm: p + wlen };
      }
    }
  }
  return null;
}

function validateAndMapLlmStatements(draftText, statementTexts) {
  const { trimmed, offset } = getTrimmedDraftWithOffset(draftText);
  const mapping = buildWhitespaceNormalizedMapping(trimmed);
  const errors = [];
  const statements = [];
  let cursorNorm = 0;

  for (let i = 0; i < statementTexts.length; i++) {
    const rawText = typeof statementTexts[i] === "string" ? statementTexts[i] : "";
    const normStmt = normalizeStatementForMatch(rawText);
    if (!normStmt) {
      errors.push(`statement ${i}: empty text`);
      return { ok: false, errors };
    }
    const span = locateStatementSpan({
      trimmed,
      offset,
      mapping,
      normStmt,
      cursorNorm,
    });
    if (!span) {
      errors.push(
        `statement ${i}: no substring match in draft (whitespace-normalized) within Levenshtein distance ≤ 2`
      );
      return { ok: false, errors };
    }
    const sliceText = draftText.slice(span.charStart, span.charEnd);
    statements.push({
      index: i,
      text: sliceText,
      charStart: span.charStart,
      charEnd: span.charEnd,
      attempt: "llm",
    });
    cursorNorm = span.nextCursorNorm;
  }

  return { ok: true, statements, errors: [] };
}

function mapWithExactSearchOnly(draftText, statementTexts) {
  const { trimmed, offset } = getTrimmedDraftWithOffset(draftText);
  const out = [];
  let cursor = 0;
  for (const statementText of statementTexts) {
    const statement = typeof statementText === "string" ? statementText.trim() : "";
    if (!statement) continue;
    let idx = trimmed.indexOf(statement, cursor);
    if (idx < 0) idx = trimmed.indexOf(statement);
    if (idx < 0) continue;
    out.push({
      text: statement,
      startChar: offset + idx,
      endChar: offset + idx + statement.length,
    });
    cursor = idx + statement.length;
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
      source: "fallback",
      errors,
    };
  } catch (e) {
    const msg = e?.message || String(e);
    return {
      statements: [],
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
  return parsed.statements.map((item) => item.text);
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

  const llmMetadata = { stage: "stage1-extract-statements" };

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
  let parsed = safeJsonParse(completion?.text ?? "");
  if (!isValidLlmPayload(parsed)) {
    completion = await callStage1Llm();
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
    return toFallbackResult(safeDraft, reasons, { llmRejected: true });
  }

  const texts = extractStatementTextsFromPayload(parsed);
  const validation = validateAndMapLlmStatements(safeDraft, texts);
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
    return toFallbackResult(safeDraft, reasons, { llmRejected: true });
  }

  return {
    statements: validation.statements,
    source: "llm",
    errors: [],
  };
}
