// Pipeline v4 — Stage 2: source matching (QC rebuild).
// Prompt body is v3, adopted by R2.5.2.1 from eval evidence in:
//   tests/r1_2_5_eval/results_v3prompt.md (R2.5.2).
// Keep this file in sync with lib/qc/pipeline-v3/stage2-match-sources.mjs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  callLLM,
  calculateLlmCostUsd,
  hasProviderApiKey,
  logCanaryScore,
} from "../../observability.js";
import { STAGE_MODELS } from "../model-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STAGE2_PROMPT_PATH = path.join(__dirname, "prompts", "stage2_v4.md");

let stage2SystemPromptCache = null;

const ALLOWED_CLASSIFICATIONS = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const DEFAULT_FAILURE_EXPLANATION = "Match call failed — defaulting to no_support.";

const SCHEMA_FAILURE_EXPLANATION =
  "Schema validation failed after retry: response could not be parsed or normalized to a valid classification and passage.";

async function getStage2SystemPrompt() {
  if (typeof stage2SystemPromptCache === "string" && stage2SystemPromptCache.trim()) {
    return stage2SystemPromptCache;
  }
  const prompt = await readFile(STAGE2_PROMPT_PATH, "utf8");
  stage2SystemPromptCache = prompt.trim();
  return stage2SystemPromptCache;
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

function sentencesForPassageTrim(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return [];
  const chunks = t.split(/(?<=[.!?])\s+/).filter((c) => c && String(c).trim());
  return chunks.length > 0 ? chunks : [t];
}

function trimPassageToLimit(passage, maxChars = 400) {
  const text = typeof passage === "string" ? passage : "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;

  const sents = sentencesForPassageTrim(trimmed);
  let out = "";
  for (const sent of sents) {
    const piece = sent.trim();
    if (!piece) continue;
    const next = out ? `${out} ${piece}` : piece;
    if (next.length <= maxChars) {
      out = next;
    } else {
      break;
    }
  }

  if (out) {
    return out.length < trimmed.length ? `${out}…` : out;
  }

  const candidate = trimmed.slice(0, maxChars);
  let cut = -1;
  for (const marker of [".", "!", "?"]) {
    const idx = candidate.lastIndexOf(marker);
    if (idx > cut) cut = idx;
  }
  if (cut >= 0) {
    return `${candidate.slice(0, cut + 1)}…`;
  }
  return `${candidate.trimEnd()}…`;
}

function normalizePassageForComparison(text) {
  return String(text || "")
    // Curly single quotes -> straight
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Curly double quotes -> straight
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Em/en dashes and minus -> hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    // Non-breaking spaces and other unicode whitespace -> space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    // Collapse runs of whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingEllipsis(passage) {
  const p = typeof passage === "string" ? passage : "";
  return p.replace(/…\s*$/u, "").trim();
}

function splitAbridgedSegments(normalizedPassage) {
  const safe = typeof normalizedPassage === "string" ? normalizedPassage : "";
  const SEP = " <<SEP>> ";
  let tagged = safe.replace(/\[\s*\.\.\.\s*\]/g, SEP).replace(/…/g, SEP);
  tagged = tagged.replace(/(^|[\s.!?])\.\.\.(?=$|[\s.!?])/g, `$1${SEP}`);
  const abridged = tagged.includes("<<SEP>>");
  if (!abridged) {
    return { abridged: false, segments: [safe] };
  }
  const segments = tagged
    .split("<<SEP>>")
    .map((s) => s.trim())
    .filter(Boolean);
  return { abridged: true, segments };
}

function validatePassageAgainstSource(passage, sourceText) {
  const p = stripTrailingEllipsis(passage);
  if (!p) return { accepted: false, abridged: false, segmentCount: 0 };
  const nSrc = normalizePassageForComparison(sourceText);
  const nPass = normalizePassageForComparison(p);
  if (!nPass) return { accepted: false, abridged: false, segmentCount: 0 };

  const split = splitAbridgedSegments(nPass);
  if (!split.abridged) {
    return { accepted: nSrc.includes(nPass), abridged: false, segmentCount: 1 };
  }
  if (split.segments.length === 0) {
    return { accepted: false, abridged: true, segmentCount: 0 };
  }

  const accepted = split.segments.every((segment) => nSrc.includes(segment));
  return { accepted, abridged: true, segmentCount: split.segments.length };
}

function parsePeriodAssessment(parsed) {
  const pa = parsed?.periodAssessment;
  if (pa == null) return null;
  if (typeof pa !== "object" || Array.isArray(pa)) return null;

  const statementPeriod =
    pa.statementPeriod === null
      ? null
      : typeof pa.statementPeriod === "string" && pa.statementPeriod.trim()
        ? pa.statementPeriod.trim()
        : null;
  const sourcePeriod =
    pa.sourcePeriod === null
      ? null
      : typeof pa.sourcePeriod === "string" && pa.sourcePeriod.trim()
        ? pa.sourcePeriod.trim()
        : null;

  return { statementPeriod, sourcePeriod };
}

/**
 * Normalise a period string to a recognised gate token: "Q[1-4] YYYY" or bare "YYYY".
 * Returns null when the input cannot be normalised (errs toward NOT downgrading).
 * @param {unknown} period
 * @returns {string|null}
 */
export function normalizePeriodToken(period) {
  if (period == null) return null;
  const raw = String(period).trim();
  if (!raw) return null;

  let m = raw.match(/^Q([1-4])\s*[-/]?\s*((?:19|20)\d{2})$/i);
  if (m) return `Q${m[1]} ${m[2]}`;

  m = raw.match(/^((?:19|20)\d{2})\s*[-/]?\s*Q([1-4])$/i);
  if (m) return `Q${m[2]} ${m[1]}`;

  m = raw.match(/^quarter\s*([1-4])\s*[-/]?\s*((?:19|20)\d{2})$/i);
  if (m) return `Q${m[1]} ${m[2]}`;

  m = raw.match(/^FY\s*((?:19|20)\d{2})$/i);
  if (m) return m[1];

  m = raw.match(/^((?:19|20)\d{2})$/);
  if (m) return m[1];

  return null;
}

function applyPeriodGateBackstop(result, options = {}) {
  const { classification, explanation, passage, periodAssessment } = result;

  if (classification !== "confirmed" || !periodAssessment) {
    return { classification, passage, explanation };
  }

  const stmtToken = normalizePeriodToken(periodAssessment.statementPeriod);
  const srcToken = normalizePeriodToken(periodAssessment.sourcePeriod);

  if (!stmtToken || !srcToken || stmtToken === srcToken) {
    return { classification, passage, explanation };
  }

  const stmtDisplay =
    typeof periodAssessment.statementPeriod === "string" && periodAssessment.statementPeriod.trim()
      ? periodAssessment.statementPeriod.trim()
      : stmtToken;
  const srcDisplay =
    typeof periodAssessment.sourcePeriod === "string" && periodAssessment.sourcePeriod.trim()
      ? periodAssessment.sourcePeriod.trim()
      : srcToken;

  const namesBothPeriods =
    explanation.includes(stmtDisplay) && explanation.includes(srcDisplay);
  const periodExplanation = `The statement places the figure in ${stmtDisplay}; the source attributes it to ${srcDisplay}.`;

  if (typeof options?.traceId === "string" && options.traceId.trim()) {
    logCanaryScore({
      traceId: options.traceId.trim(),
      name: "period_gate_downgrade_fired",
      value: 1,
      comment: `source=${options.sourceLabel || "unknown"}; statement=${stmtToken}; source_period=${srcToken}`,
    });
  }

  return {
    classification: "conflicting",
    passage,
    explanation: namesBothPeriods ? explanation : periodExplanation,
  };
}

function normalizeValidResponse(parsed, sourceText, options = {}) {
  const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) return null;

  const explanationRaw = typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";
  const explanation = explanationRaw || "No explanation provided.";

  const source = typeof sourceText === "string" ? sourceText : "";
  const passageRaw = typeof parsed?.passage === "string" ? parsed.passage : "";
  let passage = trimPassageToLimit(passageRaw, 400);

  const sourceLabel =
    typeof options?.sourceLabel === "string" && options.sourceLabel.trim()
      ? options.sourceLabel.trim()
      : "unknown";
  if (passage) {
    const validation = validatePassageAgainstSource(passage, source);
    if (validation.accepted && validation.abridged) {
      console.debug(`[stage2] passage accepted as abridged (${validation.segmentCount} segments, all verbatim)`);
      if (typeof options?.traceId === "string" && options.traceId.trim()) {
        logCanaryScore({
          traceId: options.traceId.trim(),
          name: "stage2_passage_abridged_accepted",
          value: 1,
          comment: `source=${sourceLabel}; segments=${validation.segmentCount}`,
        });
      }
    }
    if (!validation.accepted) {
      const truncated = passage.length > 120 ? `${passage.slice(0, 120)}...` : passage;
      console.warn(`[stage2] passage rejected for source ${sourceLabel} after normalisation: "${truncated}"`);
      if (typeof options?.traceId === "string" && options.traceId.trim()) {
        logCanaryScore({
          traceId: options.traceId.trim(),
          name: "stage2_passage_rejected",
          value: 1,
          comment: `source=${sourceLabel}; passage="${truncated}"`,
        });
      }
      passage = "";
    }
  }

  const periodAssessment = parsePeriodAssessment(parsed);

  const gated = applyPeriodGateBackstop(
    {
      classification,
      passage,
      explanation,
      periodAssessment,
    },
    {
      traceId: options?.traceId,
      sourceLabel: options?.sourceLabel,
    }
  );

  return {
    classification: gated.classification,
    passage: gated.passage,
    explanation: gated.explanation,
  };
}

function mergeUsage(a, b) {
  return {
    inputTokens: (Number(a?.inputTokens) || 0) + (Number(b?.inputTokens) || 0),
    outputTokens: (Number(a?.outputTokens) || 0) + (Number(b?.outputTokens) || 0),
  };
}

function normalizeSourcesInput(sources) {
  const arr = Array.isArray(sources) ? sources : [];
  return arr.map((source, i) => {
    const label =
      (typeof source?.label === "string" && source.label.trim()) ||
      (typeof source?.name === "string" && source.name.trim()) ||
      `Source ${i + 1}`;
    const text = typeof source?.text === "string" ? source.text : "";
    const index = Number.isFinite(source?.index) ? Number(source.index) : i;
    return { label, text, index: i };
  });
}

async function matchSingleSource(statement, sourceText, options = {}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const stage2SystemPrompt = await getStage2SystemPrompt();
  const userPrompt = `
Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    responseFormat: "json",
    messages: [
      { role: "system", content: stage2SystemPrompt },
      { role: "user", content: userPrompt },
    ],
    traceId: options.traceId,
    traceName: "qc-run",
    spanName: "stage2-match-sources",
    metadata: options.metadata,
  });
  const raw = completion?.text ?? "";
  return { raw, parsed: safeJsonParse(raw), completion };
}

/**
 * @param {{
 *   statementIndex: number,
 *   statementText: string,
 *   statementAttempt: string,
 *   sourceText: string,
 *   sourceIndex: number,
 *   sourceLabel: string,
 *   traceId?: string
 * }} params
 */
async function matchOnePair({
  statementIndex,
  statementText,
  statementAttempt,
  sourceText,
  sourceIndex,
  sourceLabel,
  traceId,
}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const baseMetadata = {
    stage: "stage2-match-sources",
    statementIndex,
    sourceIndex,
    sourceLabel,
    attempt: statementAttempt,
  };

  const emptyUsage = { inputTokens: 0, outputTokens: 0 };

  if (!hasProviderApiKey(stageModel.provider)) {
    return {
      statementIndex,
      sourceIndex,
      sourceLabel,
      classification: "no_support",
      passage: "",
      explanation: DEFAULT_FAILURE_EXPLANATION,
      schemaValid: true,
      retried: false,
      latencyMs: 0,
      usage: { ...emptyUsage },
      costUsd: 0,
    };
  }

  try {
    let usage = { ...emptyUsage };
    let latencyMs = 0;
    let costUsd = 0;
    let retried = false;

    const first = await matchSingleSource(statementText, sourceText, {
      traceId,
      metadata: { ...baseMetadata, matchCallAttempt: 1 },
    });
    if (first.completion) {
      usage = mergeUsage(usage, first.completion.usage || {});
      latencyMs += Number(first.completion.latencyMs) || 0;
      costUsd += calculateLlmCostUsd(
        first.completion.provider,
        first.completion.model,
        first.completion.usage
      );
    }

    let normalized = normalizeValidResponse(first.parsed, sourceText, {
      sourceLabel,
      traceId,
    });

    if (!normalized) {
      retried = true;
      const second = await matchSingleSource(statementText, sourceText, {
        traceId,
        metadata: { ...baseMetadata, matchCallAttempt: 2 },
      });
      if (second.completion) {
        usage = mergeUsage(usage, second.completion.usage || {});
        latencyMs += Number(second.completion.latencyMs) || 0;
        costUsd += calculateLlmCostUsd(
          second.completion.provider,
          second.completion.model,
          second.completion.usage
        );
      }
      normalized = normalizeValidResponse(second.parsed, sourceText, {
        sourceLabel,
        traceId,
      });
    }

    if (!normalized) {
      if (traceId) {
        logCanaryScore({
          traceId,
          name: "stage2_schema_validation_failed",
          value: 1,
          comment: `Stage 2 schema/validation failed for statement ${statementIndex}, source ${sourceLabel} after retry.`,
        });
      }
      console.warn(
        `stage2-v4: match failed validation for statement ${statementIndex}, source ${sourceIndex}, defaulting to no_support`
      );
      return {
        statementIndex,
        sourceIndex,
        sourceLabel,
        classification: "no_support",
        passage: "",
        explanation: SCHEMA_FAILURE_EXPLANATION,
        schemaValid: false,
        retried,
        latencyMs,
        usage,
        costUsd,
      };
    }

    return {
      statementIndex,
      sourceIndex,
      sourceLabel,
      classification: normalized.classification,
      passage: normalized.passage,
      explanation: normalized.explanation,
      schemaValid: true,
      retried,
      latencyMs,
      usage,
      costUsd,
    };
  } catch (err) {
    const msg = err?.message || String(err);
    console.warn(`stage2-v4: match call failed for statement ${statementIndex}, source ${sourceIndex}`);
    return {
      statementIndex,
      sourceIndex,
      sourceLabel,
      classification: "no_support",
      passage: "",
      explanation: `${DEFAULT_FAILURE_EXPLANATION} ${msg}`,
      schemaValid: false,
      retried: false,
      latencyMs: 0,
      usage: { ...emptyUsage },
      costUsd: 0,
    };
  }
}

/**
 * @param {{
 *   statements: Array<{ index?: number, text?: string, charStart?: number, charEnd?: number, attempt?: string }>,
 *   sources: Array<{ label?: string, text?: string, index?: number, name?: string }>,
 *   traceId?: string
 * }} params
 * @returns {Promise<{ matches: Array<Record<string, unknown>> }>}
 */
export async function matchAllSources({ statements, sources, traceId }) {
  const safeStatements = Array.isArray(statements) ? statements : [];
  const normalizedSources = normalizeSourcesInput(sources);

  const tasks = [];
  for (let ord = 0; ord < safeStatements.length; ord++) {
    const stmt = safeStatements[ord];
    const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
    const statementText = typeof stmt?.text === "string" ? stmt.text : "";
    const statementAttempt = typeof stmt?.attempt === "string" ? stmt.attempt : "fallback";

    for (const src of normalizedSources) {
      tasks.push(
        matchOnePair({
          statementIndex,
          statementText,
          statementAttempt,
          sourceText: src.text,
          sourceIndex: src.index,
          sourceLabel: src.label,
          traceId,
        })
      );
    }
  }

  const matches = await Promise.all(tasks);
  matches.sort((a, b) => {
    if (a.statementIndex !== b.statementIndex) return a.statementIndex - b.statementIndex;
    return a.sourceIndex - b.sourceIndex;
  });

  return { matches };
}
