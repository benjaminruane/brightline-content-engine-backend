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
import {
  getCacheVersion,
  getLlmCache,
  hashPromptContent,
  isLlmCacheEnabled,
  putLlmCache,
} from "../llm-cache.mjs";
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

/** Fixed OpenAI seed on every Stage 2 request. */
export const STAGE2_SEED = 1;

/** Max in-flight statement×source (or claim×source) match calls. */
export const STAGE2_CONCURRENCY = 24;

function fingerprintFromCompletion(completion) {
  const raw = completion?.raw;
  if (!raw || typeof raw !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(raw, "system_fingerprint")) return null;
  if (raw.system_fingerprint === undefined || raw.system_fingerprint === null) return null;
  return String(raw.system_fingerprint);
}

async function mapPool(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

async function getStage2SystemPrompt() {
  if (typeof stage2SystemPromptCache === "string" && stage2SystemPromptCache.trim()) {
    return stage2SystemPromptCache;
  }
  const prompt = await readFile(STAGE2_PROMPT_PATH, "utf8");
  stage2SystemPromptCache = prompt.trim();
  return stage2SystemPromptCache;
}

export function resetStage2PromptCache() {
  stage2SystemPromptCache = null;
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

  return {
    statementPeriod,
    sourcePeriod,
    statementPeriodRole: parsePeriodRole(pa.statementPeriodRole),
    sourcePeriodRole: parsePeriodRole(pa.sourcePeriodRole),
  };
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

const VINTAGE_RE = /\b(investment|invested|acquired|acquisition|vintage|closed)\b/i;
const OPERATING_RE =
  /\b(revenue|ebitda|volume|margin|year-on-year|yoy|financial year|fy|operating|parcels?)\b/i;

/**
 * @param {string} text
 * @param {string|null} periodToken
 * @returns {"figure_period"|"entity_vintage"|null}
 */
export function inferPeriodRole(text, periodToken) {
  if (!periodToken) return null;
  const yearMatch = String(periodToken).match(/((?:19|20)\d{2})/);
  if (!yearMatch) return null;
  const year = yearMatch[1];
  const t = typeof text === "string" ? text : "";
  const idx = t.indexOf(year);
  const window = idx >= 0 ? t.slice(Math.max(0, idx - 48), idx + 48) : t;
  if (VINTAGE_RE.test(window) && !OPERATING_RE.test(window)) return "entity_vintage";
  if (VINTAGE_RE.test(window) && OPERATING_RE.test(window)) {
    const vIdx = window.search(VINTAGE_RE);
    const oIdx = window.search(OPERATING_RE);
    const yearAt = window.indexOf(year);
    if (vIdx >= 0 && (oIdx < 0 || Math.abs(yearAt - vIdx) <= Math.abs(yearAt - oIdx))) {
      return "entity_vintage";
    }
  }
  return "figure_period";
}

function parsePeriodRole(value) {
  const v = typeof value === "string" ? value.trim() : "";
  if (v === "figure_period" || v === "entity_vintage") return v;
  return null;
}

const METRIC_CONTEXT_KEYS = [
  "reversion",
  "cagr",
  "irr",
  "moic",
  "margin",
  "ebitda",
  "stake",
  "proceeds",
  "ownership",
  "headcount",
  "lease",
  "leases",
  "growth",
  "composite",
];

const PROCEDURAL_CLOSER_RE =
  /^\s*(we recommend (approval|this investment|the investment|proceeding)|yours (sincerely|faithfully)|kind regards|best regards|sincerely)\s*[.,!]?\s*$/i;

export function isProceduralCloserStatement(statement) {
  const t = typeof statement === "string" ? statement.trim() : "";
  return PROCEDURAL_CLOSER_RE.test(t);
}

function windowAround(text, index, len = 48) {
  const t = typeof text === "string" ? text : "";
  const start = Math.max(0, index - len);
  return t.slice(start, Math.min(t.length, index + len)).toLowerCase();
}

function contextKeysFromWindow(window) {
  return METRIC_CONTEXT_KEYS.filter((k) => window.includes(k));
}

function extractPercents(text) {
  const t = typeof text === "string" ? text : "";
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:%|per\s?cent)\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const win = windowAround(t, m.index);
    out.push({
      value: Number(m[1]),
      raw: m[0],
      kind: "percent",
      keys: contextKeysFromWindow(win),
    });
  }
  return out;
}

function moneyScale(unit) {
  const u = String(unit || "").toLowerCase();
  if (u === "billion" || u === "bn") return 1e9;
  if (u === "million" || u === "mm" || u === "m") return 1e6;
  if (u === "thousand" || u === "k") return 1e3;
  return 1;
}

function extractMoney(text) {
  const t = typeof text === "string" ? text : "";
  const out = [];
  // Plain "m" is million only after a currency marker, and only as a whole
  // unit (word boundary). "155 m" / "155m" with no currency must not match.
  const re =
    /(?:USD|EUR|GBP|AUD|CAD|\$|€|£)\s*([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn|k|m)?\b|([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn)\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const n = Number(String(m[1] || m[3] || "").replace(/[,']/g, "").replace(/\u2019/g, ""));
    if (!Number.isFinite(n)) continue;
    const unit = String(m[2] || m[4] || "").toLowerCase();
    out.push({ value: n * moneyScale(unit), raw: m[0], kind: "money" });
  }
  return out;
}

function extractHeadcounts(text) {
  const t = typeof text === "string" ? text : "";
  const out = [];
  const re = /\b(?:employs|headcount|team of|staff of|people)\s+(\d{2,6})\b|\b(\d{2,6})\s+people\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const n = Number(m[1] || m[2]);
    if (Number.isFinite(n)) out.push({ value: n, raw: m[0], kind: "count" });
  }
  return out;
}

function decimalPlaces(n) {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

function isCorrectRounding(sourceVal, stmtVal) {
  const places = decimalPlaces(stmtVal);
  const rounded = Number(Number(sourceVal).toFixed(places));
  return Math.abs(rounded - stmtVal) < 1e-9;
}

function pairRelationship(stmtFigs, srcFigs) {
  if (stmtFigs.length === 0 || srcFigs.length === 0) return null;
  let anyExclusive = false;
  let anyBeyond = false;
  let anyWithin = false;
  let anyIdentical = false;
  for (const s of stmtFigs) {
    let best = null;
    let bestDiff = Infinity;
    for (const p of srcFigs) {
      const d = Math.abs(s.value - p.value);
      if (d < bestDiff) {
        bestDiff = d;
        best = p;
      }
    }
    if (!best) continue;
    if (isCorrectRounding(best.value, s.value) || best.value === s.value) {
      if (best.value === s.value) anyIdentical = true;
      else anyWithin = true;
      continue;
    }
    const denom = Math.max(Math.abs(best.value), Math.abs(s.value), 1);
    const rel = bestDiff / denom;
    if (s.kind === "percent") {
      if (bestDiff <= 1.0 && isCorrectRounding(best.value, Math.round(best.value))) {
        anyWithin = true;
        continue;
      }
      if (bestDiff > 2 || rel > 0.15) anyExclusive = true;
      else anyBeyond = true;
      continue;
    }
    if (rel > 0.08) anyExclusive = true;
    else anyBeyond = true;
  }
  if (anyExclusive) return "mutually_exclusive";
  if (anyBeyond) return "beyond_rounding";
  if (anyWithin) return "within_rounding";
  if (anyIdentical) return "identical";
  return null;
}

/**
 * @returns {"within_rounding"|"beyond_rounding"|"mutually_exclusive"|null}
 */
export function classifyNumericRelationship(statement, passage) {
  const stmt = typeof statement === "string" ? statement : "";
  const pass = typeof passage === "string" ? passage : "";
  const rels = [
    pairRelationship(extractPercents(stmt), extractPercents(pass)),
    pairRelationship(extractMoney(stmt), extractMoney(pass)),
    pairRelationship(extractHeadcounts(stmt), extractHeadcounts(pass)),
  ].filter(Boolean);
  if (rels.includes("mutually_exclusive")) return "mutually_exclusive";
  if (rels.includes("beyond_rounding")) return "beyond_rounding";
  if (rels.includes("within_rounding")) return "within_rounding";
  if (rels.includes("identical")) return "identical";
  return null;
}

function isEgregiousPair(a, b, kind) {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (!(lo > 0)) return hi > 0;
  const ratio = hi / lo;
  const diff = Math.abs(a - b);
  if (kind === "percent") return ratio >= 1.8 || diff >= 15;
  if (kind === "money") return ratio >= 1.35;
  if (kind === "count") return ratio >= 1.12 && diff >= 20;
  return false;
}

function figureKeySet(fig) {
  return new Set(Array.isArray(fig?.keys) ? fig.keys : []);
}

/** Non-empty metric-key intersection. Empty on either side → no overlap. */
function keysOverlap(stmtFig, srcFig) {
  const stmtKeys = figureKeySet(stmtFig);
  const srcKeys = figureKeySet(srcFig);
  if (stmtKeys.size === 0 || srcKeys.size === 0) return false;
  for (const k of stmtKeys) {
    if (srcKeys.has(k)) return true;
  }
  return false;
}

function candidateSources(stmtFig, stmtFigs, srcFigs, kind) {
  if (kind !== "percent") return srcFigs;
  const sKeys = Array.isArray(stmtFig.keys) ? stmtFig.keys : [];
  for (const key of METRIC_CONTEXT_KEYS) {
    if (!sKeys.includes(key)) continue;
    const keyed = srcFigs.filter((p) => (p.keys || []).includes(key));
    if (keyed.length > 0) return keyed;
  }
  if (stmtFigs.length === 1 && srcFigs.length === 1) return srcFigs;
  return [];
}

/**
 * Figures the B48 magnitude backstop actually compares. Pass-through only —
 * do not use this to add new backstop kinds.
 * @returns {Array<{ value: number, raw: string, kind: "percent"|"money"|"count", keys?: string[] }>}
 */
export function collectBackstopFigures(text) {
  return [...extractPercents(text), ...extractMoney(text), ...extractHeadcounts(text)];
}

export function hasEgregiousMagnitudeGap(statement, passage) {
  const groups = [
    [extractPercents(statement), extractPercents(passage), "percent"],
    [extractMoney(statement), extractMoney(passage), "money"],
    [extractHeadcounts(statement), extractHeadcounts(passage), "count"],
  ];
  for (const [stmtFigs, srcFigs, kind] of groups) {
    if (!stmtFigs.length || !srcFigs.length) continue;
    for (const s of stmtFigs) {
      const pool = candidateSources(s, stmtFigs, srcFigs, kind);
      if (pool.length === 0) continue;
      let best = pool[0];
      let bestDiff = Math.abs(s.value - best.value);
      for (const p of pool) {
        const d = Math.abs(s.value - p.value);
        if (d < bestDiff) {
          best = p;
          bestDiff = d;
        }
      }
      if (best.value === s.value || isCorrectRounding(best.value, s.value)) continue;
      if (!isEgregiousPair(s.value, best.value, kind)) continue;
      // Percent: require a non-empty metric-key intersection before forcing
      // conflicting. 1:1 pairing by kind alone (margin 19% vs contracted 70%)
      // is not a same-metric conflict — leave it to the LLM.
      // Money/count figures currently carry no keys; a general guard would
      // drop genuine magnitude conflicts (e.g. 18.4bn vs 12.8bn proceeds).
      if (kind === "percent" && !keysOverlap(s, best)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Rounding lifts conflicting→confirmed. Egregious same-metric gaps force conflicting.
 * Identical numbers are left to the model (status/modality may still conflict).
 */
export function applyRoundingToleranceBackstop(result, options = {}) {
  const { classification, explanation, passage } = result;
  const statementText = typeof options.statementText === "string" ? options.statementText : "";
  if (isProceduralCloserStatement(statementText)) {
    return { classification: "no_support", passage, explanation };
  }
  if (hasEgregiousMagnitudeGap(statementText, passage)) {
    return { classification: "conflicting", passage, explanation };
  }
  if (classification !== "conflicting") {
    return { classification, passage, explanation };
  }
  const rel = classifyNumericRelationship(statementText, passage);
  if (rel === "within_rounding") {
    return { classification: "confirmed", passage, explanation };
  }
  return { classification, passage, explanation };
}

export function applyPeriodGateBackstop(result, options = {}) {
  const { classification, explanation, passage, periodAssessment } = result;

  if (!periodAssessment) {
    return { classification, passage, explanation };
  }

  const stmtToken = normalizePeriodToken(periodAssessment.statementPeriod);
  const srcToken = normalizePeriodToken(periodAssessment.sourcePeriod);

  if (!stmtToken || !srcToken || stmtToken === srcToken) {
    return { classification, passage, explanation };
  }

  const statementText = typeof options.statementText === "string" ? options.statementText : "";
  const stmtRole =
    parsePeriodRole(periodAssessment.statementPeriodRole) || inferPeriodRole(statementText, stmtToken);
  const srcRole = parsePeriodRole(periodAssessment.sourcePeriodRole) || inferPeriodRole(passage, srcToken);
  const sameFrame = !stmtRole || !srcRole || stmtRole === srcRole;

  const stmtDisplay =
    typeof periodAssessment.statementPeriod === "string" && periodAssessment.statementPeriod.trim()
      ? periodAssessment.statementPeriod.trim()
      : stmtToken;
  const srcDisplay =
    typeof periodAssessment.sourcePeriod === "string" && periodAssessment.sourcePeriod.trim()
      ? periodAssessment.sourcePeriod.trim()
      : srcToken;

  const namesBothPeriods =
    typeof explanation === "string" && explanation.includes(stmtDisplay) && explanation.includes(srcDisplay);
  const periodExplanation = `The statement places the figure in ${stmtDisplay}; the source attributes it to ${srcDisplay}.`;

  if (classification === "confirmed" && sameFrame) {
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

  if (classification === "conflicting" && !sameFrame) {
    if (typeof options?.traceId === "string" && options.traceId.trim()) {
      logCanaryScore({
        traceId: options.traceId.trim(),
        name: "period_gate_frame_mismatch_partial",
        value: 1,
        comment: `source=${options.sourceLabel || "unknown"}; stmtRole=${stmtRole}; srcRole=${srcRole}`,
      });
    }
    return {
      classification: "partially_confirmed",
      passage,
      explanation,
    };
  }

  return { classification, passage, explanation };
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
  const gateOpts = {
    traceId: options?.traceId,
    sourceLabel: options?.sourceLabel,
    statementText: options?.statementText,
  };

  const rounded = applyRoundingToleranceBackstop(
    {
      classification,
      passage,
      explanation,
    },
    gateOpts
  );

  const gated = applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment,
    },
    gateOpts
  );

  const statementText = typeof options?.statementText === "string" ? options.statementText : "";
  return {
    classification: gated.classification,
    passage: gated.passage,
    explanation: gated.explanation,
    periodAssessment,
    statementFigures: collectBackstopFigures(statementText),
    sourceFigures: collectBackstopFigures(gated.passage),
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

async function stage2CacheParts(statementText, sourceText, parentSentence) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const prompt = await getStage2SystemPrompt();
  return {
    stage: "stage2",
    inputText: typeof statementText === "string" ? statementText : "",
    parentSentence: typeof parentSentence === "string" ? parentSentence : null,
    sourceText: typeof sourceText === "string" ? sourceText : null,
    promptHash: hashPromptContent(prompt),
    modelId: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    cacheVersion: getCacheVersion(),
  };
}

function overlayCachedPair(payload, spec) {
  const out = {
    ...payload,
    statementIndex: spec.statementIndex,
    sourceIndex: spec.sourceIndex,
    sourceLabel: spec.sourceLabel,
    latencyMs: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
  };
  if (Number.isFinite(spec.claimIndex)) out.claimIndex = spec.claimIndex;
  return out;
}

async function matchSingleSource(statement, sourceText, options = {}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const stage2SystemPrompt = await getStage2SystemPrompt();
  const parentSentence =
    typeof options.parentSentence === "string" ? options.parentSentence.trim() : "";
  const parentLine =
    parentSentence && parentSentence !== String(statement || "").trim()
      ? `PARENT SENTENCE (context only, do not verify): ${parentSentence}\n\n`
      : "";
  const userPrompt = `
${parentLine}Statement:
${statement}

Source:
${sourceText}
`.trim();

  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
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
  parentSentence,
  claimIndex,
}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const baseMetadata = {
    stage: "stage2-match-sources",
    statementIndex,
    sourceIndex,
    sourceLabel,
    attempt: statementAttempt,
  };
  if (Number.isFinite(claimIndex)) baseMetadata.claimIndex = claimIndex;

  const emptyUsage = { inputTokens: 0, outputTokens: 0 };

  if (!hasProviderApiKey(stageModel.provider)) {
    return {
      statementIndex,
      sourceIndex,
      sourceLabel,
      classification: "no_support",
      passage: "",
      explanation: DEFAULT_FAILURE_EXPLANATION,
      periodAssessment: null,
      statementFigures: collectBackstopFigures(statementText),
      sourceFigures: [],
      schemaValid: true,
      retried: false,
      latencyMs: 0,
      usage: { ...emptyUsage },
      costUsd: 0,
      systemFingerprint: null,
    };
  }

  const spec = {
    statementIndex,
    sourceIndex,
    sourceLabel,
    claimIndex,
  };

  async function matchOnePairLive() {
    try {
      let usage = { ...emptyUsage };
      let latencyMs = 0;
      let costUsd = 0;
      let retried = false;
      let systemFingerprint = null;

      const first = await matchSingleSource(statementText, sourceText, {
        traceId,
        metadata: { ...baseMetadata, matchCallAttempt: 1 },
        parentSentence,
      });
      if (first.completion) {
        usage = mergeUsage(usage, first.completion.usage || {});
        latencyMs += Number(first.completion.latencyMs) || 0;
        costUsd += calculateLlmCostUsd(
          first.completion.provider,
          first.completion.model,
          first.completion.usage
        );
        systemFingerprint = fingerprintFromCompletion(first.completion);
      }

      let normalized = normalizeValidResponse(first.parsed, sourceText, {
        sourceLabel,
        traceId,
        statementText,
      });

      if (!normalized) {
        retried = true;
        const second = await matchSingleSource(statementText, sourceText, {
          traceId,
          metadata: { ...baseMetadata, matchCallAttempt: 2 },
          parentSentence,
        });
        if (second.completion) {
          usage = mergeUsage(usage, second.completion.usage || {});
          latencyMs += Number(second.completion.latencyMs) || 0;
          costUsd += calculateLlmCostUsd(
            second.completion.provider,
            second.completion.model,
            second.completion.usage
          );
          systemFingerprint = fingerprintFromCompletion(second.completion) || systemFingerprint;
        }
        normalized = normalizeValidResponse(second.parsed, sourceText, {
          sourceLabel,
          traceId,
          statementText,
        });
      }

      console.debug(
        `[stage2] fingerprint=${systemFingerprint || "null"} statementIndex=${statementIndex} sourceIndex=${sourceIndex} sourceLabel=${sourceLabel}`
      );

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
          periodAssessment: null,
          statementFigures: collectBackstopFigures(statementText),
          sourceFigures: [],
          schemaValid: false,
          retried,
          latencyMs,
          usage,
          costUsd,
          systemFingerprint,
        };
      }

      return {
        statementIndex,
        sourceIndex,
        sourceLabel,
        classification: normalized.classification,
        passage: normalized.passage,
        explanation: normalized.explanation,
        periodAssessment: normalized.periodAssessment ?? null,
        statementFigures: Array.isArray(normalized.statementFigures) ? normalized.statementFigures : [],
        sourceFigures: Array.isArray(normalized.sourceFigures) ? normalized.sourceFigures : [],
        schemaValid: true,
        retried,
        latencyMs,
        usage,
        costUsd,
        systemFingerprint,
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
        periodAssessment: null,
        statementFigures: collectBackstopFigures(statementText),
        sourceFigures: [],
        schemaValid: false,
        retried: false,
        latencyMs: 0,
        usage: { ...emptyUsage },
        costUsd: 0,
        systemFingerprint: null,
      };
    }
  }

  if (!isLlmCacheEnabled()) {
    return matchOnePairLive();
  }

  const parts = await stage2CacheParts(statementText, sourceText, parentSentence);
  const looked = await getLlmCache(parts);
  if (looked.hit) {
    return overlayCachedPair(looked.payload, spec);
  }
  const live = await matchOnePairLive();
  await putLlmCache(parts, live);
  return live;
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

  const specs = [];
  for (let ord = 0; ord < safeStatements.length; ord++) {
    const stmt = safeStatements[ord];
    const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
    const statementText = typeof stmt?.text === "string" ? stmt.text : "";
    const statementAttempt = typeof stmt?.attempt === "string" ? stmt.attempt : "fallback";

    for (const src of normalizedSources) {
      specs.push({
        statementIndex,
        statementText,
        statementAttempt,
        sourceText: src.text,
        sourceIndex: src.index,
        sourceLabel: src.label,
        traceId,
      });
    }
  }

  const matches = await mapPool(specs, STAGE2_CONCURRENCY, (spec) => matchOnePair(spec));
  matches.sort((a, b) => {
    if (a.statementIndex !== b.statementIndex) return a.statementIndex - b.statementIndex;
    return a.sourceIndex - b.sourceIndex;
  });

  return { matches };
}

/**
 * Per-claim Stage 2. Same matcher and schema as matchAllSources. The only
 * addition is the optional parent-sentence context line.
 * @param {{
 *   claims: Array<{ statementIndex: number, claimIndex: number, text: string, parentSentence: string }>,
 *   sources: Array<{ label?: string, text?: string, index?: number, name?: string }>,
 *   traceId?: string
 * }} params
 */
export async function matchClaimSourcePairs({ claims, sources, traceId }) {
  const safeClaims = Array.isArray(claims) ? claims : [];
  const normalizedSources = normalizeSourcesInput(sources);
  const specs = [];
  for (const claim of safeClaims) {
    const statementIndex = Number(claim?.statementIndex);
    const claimIndex = Number(claim?.claimIndex);
    const statementText = typeof claim?.text === "string" ? claim.text : "";
    const parentSentence = typeof claim?.parentSentence === "string" ? claim.parentSentence : "";
    for (const src of normalizedSources) {
      specs.push({
        statementIndex,
        statementText,
        statementAttempt: "claim-span",
        sourceText: src.text,
        sourceIndex: src.index,
        sourceLabel: src.label,
        traceId,
        parentSentence,
        claimIndex,
      });
    }
  }
  const matches = await mapPool(specs, STAGE2_CONCURRENCY, async (spec) => {
    const m = await matchOnePair(spec);
    return { ...m, claimIndex: spec.claimIndex };
  });
  matches.sort((a, b) => {
    if (a.statementIndex !== b.statementIndex) return a.statementIndex - b.statementIndex;
    if (a.claimIndex !== b.claimIndex) return a.claimIndex - b.claimIndex;
    return a.sourceIndex - b.sourceIndex;
  });
  return { matches };
}
