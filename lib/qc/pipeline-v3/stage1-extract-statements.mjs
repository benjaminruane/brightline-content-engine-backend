import { extractStatements as extractStatementsV2 } from "../../extract-statements.mjs";
import { locateStatements } from "../locate-statement.mjs";
import { callLLM, hasProviderApiKey, logCanaryScore } from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";
const STAGE1_SYSTEM_PROMPT = `
You split a draft into complete sentences.
Return ONLY a JSON object in the form:
{ "statements": ["sentence one", "sentence two", "..."] }

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

function mapWithLocator(draftText, statementTexts, { requireAll = false } = {}) {
  const draft = typeof draftText === "string" ? draftText : "";
  const spans = locateStatements(draft, statementTexts);
  const out = [];
  for (let i = 0; i < statementTexts.length; i += 1) {
    const statement = typeof statementTexts[i] === "string" ? statementTexts[i].trim() : "";
    if (!statement) {
      if (requireAll) return { statements: [], invalid: true };
      continue;
    }
    const span = spans[i];
    if (!span) {
      if (requireAll) return { statements: out, invalid: true };
      continue;
    }
    out.push({
      text: draft.slice(span.start, span.end),
      startChar: span.start,
      endChar: span.end,
    });
  }
  return { statements: out, invalid: false };
}

function mapWithExactAndTolerantSearch(draftText, statementTexts) {
  return mapWithLocator(draftText, statementTexts, { requireAll: true });
}

function mapWithExactSearchOnly(draftText, statementTexts) {
  return mapWithLocator(draftText, statementTexts).statements;
}

function fallbackExtract(draftText) {
  const splitResult = extractStatementsV2({
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

  return { statements: mapped, source: "fallback" };
}

export async function extractStatements(draftText, options = {}) {
  try {
    const safeDraft = typeof draftText === "string" ? draftText : "";
    if (!safeDraft.trim()) {
      return fallbackExtract(safeDraft);
    }

    const stageModel = STAGE_MODELS["stage1-splitting"];
    if (!hasProviderApiKey(stageModel.provider)) {
      return fallbackExtract(safeDraft);
    }

    const completion = await callLLM({
      provider: stageModel.provider,
      model: stageModel.model,
      temperature: 0,
      messages: [
        { role: "system", content: STAGE1_SYSTEM_PROMPT },
        { role: "user", content: safeDraft },
      ],
      traceId: options.traceId,
      traceName: "qc-run",
      spanName: "qc-stage1-statement-splitting",
      metadata: { stage: "stage1" },
    });
    const raw = completion?.text ?? "";
    const parsed = safeJsonParse(raw);
    const statements = Array.isArray(parsed?.statements)
      ? parsed.statements.filter((s) => typeof s === "string" && s.trim())
      : [];

    if (statements.length === 0) {
      logCanaryScore({
        traceId: options.traceId,
        name: "schema_validation_failed",
        value: 1,
        comment: "Stage 1 statement splitting returned invalid schema payload.",
      });
      logCanaryScore({
        traceId: options.traceId,
        name: "llm_retry_or_fallback",
        value: 1,
        comment: "Stage 1 defaulted to deterministic fallback splitter.",
      });
      return fallbackExtract(safeDraft);
    }

    const mapped = mapWithExactAndTolerantSearch(safeDraft, statements);
    if (mapped.invalid) {
      logCanaryScore({
        traceId: options.traceId,
        name: "split_validation_rejected",
        value: 1,
        comment: "Stage 1 split failed deterministic reconstruction validation.",
      });
      logCanaryScore({
        traceId: options.traceId,
        name: "llm_retry_or_fallback",
        value: 1,
        comment: "Stage 1 validation rejection triggered fallback splitter.",
      });
      console.warn("stage1: LLM split failed validation — falling back to deterministic splitter");
      return fallbackExtract(safeDraft);
    }

    return { statements: mapped.statements, source: "llm" };
  } catch (err) {
    try {
      const fallback = fallbackExtract(draftText);
      return {
        ...fallback,
        error: err?.message || String(err),
      };
    } catch (fallbackErr) {
      return {
        statements: [],
        source: "fallback",
        error: fallbackErr?.message || err?.message || String(err),
      };
    }
  }
}
