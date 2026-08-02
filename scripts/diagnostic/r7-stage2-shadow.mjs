#!/usr/bin/env node
/**
 * R7 Stage-2 shadow multi-passage diagnostic.
 *
 * Baseline: REAL matchAllSources (wraps private matchOnePair; gpt-4o temp 0).
 * Widened: same callLLM + STAGE_MODELS["stage2-matching"], shadow prompt only.
 * Neutrality: REAL aggregateVerdict + selectExcerpts (imported — not reimplemented).
 *
 * Statements: loaded from tests/r7_answer_keys/ (Stage-1 extraction bypassed — caveat).
 *
 * Phase gate: do not run LLM spend until explicitly instructed ("go").
 * Dry estimate: node scripts/diagnostic/r7-stage2-shadow.mjs --estimate-only
 *
 * Env load must precede any observability import (OPENAI_API_KEY is captured at module init).
 */

import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "./lib/env.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";
import { FIXTURES_DIR, RUNS_DIR, REPO_ROOT } from "./lib/paths.mjs";

// MUST run before dynamic-importing observability / stage2 (see run-batch.mjs).
loadLocalEnvFiles();

/** @type {typeof import("../../lib/observability.js").callLLM} */
let callLLM;
/** @type {typeof import("../../lib/observability.js").hasProviderApiKey} */
let hasProviderApiKey;
/** @type {typeof import("../../lib/qc/model-config.mjs").STAGE_MODELS} */
let STAGE_MODELS;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").matchAllSources} */
let matchAllSources;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs").aggregateVerdict} */
let aggregateVerdictV4;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs").selectExcerpts} */
let selectExcerpts;

async function loadPipelineDeps() {
  ({ callLLM, hasProviderApiKey } = await import("../../lib/observability.js"));
  ({ STAGE_MODELS } = await import("../../lib/qc/model-config.mjs"));
  ({ matchAllSources } = await import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs"));
  ({ aggregateVerdict: aggregateVerdictV4 } = await import(
    "../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs"
  ));
  ({ selectExcerpts } = await import("../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs"));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_WIDENED = path.join(
  REPO_ROOT,
  "lib/qc/pipeline-v4/prompts/stage2_v4_multipassage_shadow.md"
);
const ANSWER_KEYS_DIR = path.join(REPO_ROOT, "tests/r7_answer_keys");

const FIXTURES = [
  { id: "22", label: "alp_multisource", answerKey: "alp_multisource.answerkey.json" },
  { id: "23", label: "crf_multisource", answerKey: "crf_multisource.answerkey.json" },
];

const ALLOWED = new Set([
  "confirmed",
  "partially_confirmed",
  "conflicting",
  "no_support",
]);

const MULTI_PASSAGE_CASES = new Set([
  "multi_passage_single_source",
  "cross_source_multi_passage",
]);

function parseArgs(argv) {
  const opts = { estimateOnly: false, writeFindings: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--estimate-only") opts.estimateOnly = true;
    else if (arg === "--write-findings") opts.writeFindings = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function safeJsonParse(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

/** Spec G normalise (identical on passage + source). */
function normaliseForOffset(text) {
  return String(text || "")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveOffsets(passage, sourceText) {
  const p = typeof passage === "string" ? passage : "";
  const src = typeof sourceText === "string" ? sourceText : "";
  if (!p.trim()) {
    return { exact: false, normalised: false, exactIndex: -1, normalisedIndex: -1 };
  }
  const exactIndex = src.indexOf(p);
  const nSrc = normaliseForOffset(src);
  const nPass = normaliseForOffset(p);
  const normalisedIndex = nPass ? nSrc.indexOf(nPass) : -1;
  return {
    exact: exactIndex >= 0,
    normalised: normalisedIndex >= 0,
    exactIndex,
    normalisedIndex,
  };
}

function truncate(s, n = 120) {
  const t = String(s || "");
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function passageRelated(a, b) {
  const na = normaliseForOffset(a);
  const nb = normaliseForOffset(b);
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

async function loadFixture(id) {
  const names = await readdir(FIXTURES_DIR);
  const hit = names.find((n) => n.startsWith(`${id}_`) && n.endsWith(".json"));
  if (!hit) throw new Error(`Fixture JSON not found for id ${id}`);
  const raw = await readFile(path.join(FIXTURES_DIR, hit), "utf8");
  return JSON.parse(raw);
}

async function loadAnswerKey(filename) {
  const raw = await readFile(path.join(ANSWER_KEYS_DIR, filename), "utf8");
  return JSON.parse(raw);
}

function estimateCalls() {
  // 2 fixtures × 5 answer-key statements × 2 sources × 2 matchers
  const fixtures = FIXTURES.length;
  const stmtsPer = 5;
  const sourcesPer = 2;
  const matchers = 2;
  const pairs = fixtures * stmtsPer * sourcesPer;
  const total = pairs * matchers;
  return {
    fixtures,
    stmtsPer,
    sourcesPer,
    matchers,
    statementSourcePairs: pairs,
    estimatedLlmCalls: total,
    notes: [
      "Baseline via matchAllSources (may retry once per pair on schema failure → up to 2×).",
      "Widened is one callLLM per pair (no production retry loop mirrored).",
      "Stage-1 extraction bypassed (answer-key statements) — zero Stage-1 LLM calls.",
      "aggregateVerdictV4 / selectExcerpts are local deterministic — free.",
    ],
  };
}

let widenedPromptCache = null;
async function getWidenedPrompt() {
  if (widenedPromptCache) return widenedPromptCache;
  widenedPromptCache = (await readFile(PROMPT_WIDENED, "utf8")).trim();
  return widenedPromptCache;
}

/**
 * Shadow widened matcher — same model/temp/callLLM as live Stage 2; shadow prompt only.
 * @returns {Promise<Array<{ statementIndex: number, sourceIndex: number, sourceLabel: string, classification: string, passage: string }>>}
 */
async function matchWidenedPair({
  statementIndex,
  statementText,
  sourceText,
  sourceIndex,
  sourceLabel,
  traceId,
}) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    return [
      {
        statementIndex,
        sourceIndex,
        sourceLabel,
        classification: "no_support",
        passage: "",
        _shadow: true,
        _error: "missing_api_key",
      },
    ];
  }

  const systemPrompt = await getWidenedPrompt();
  const userPrompt = `
Statement:
${statementText}

Source:
${sourceText}
`.trim();

  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    traceId,
    traceName: "qc-r7-stage2-shadow",
    spanName: "stage2-multipassage-shadow",
    metadata: {
      stage: "r7-stage2-shadow-widened",
      statementIndex,
      sourceIndex,
      sourceLabel,
    },
  });

  const parsed = safeJsonParse(completion?.text ?? "");
  const rows = Array.isArray(parsed?.matches)
    ? parsed.matches
    : Array.isArray(parsed)
      ? parsed
      : null;

  if (!rows) {
    return [
      {
        statementIndex,
        sourceIndex,
        sourceLabel,
        classification: "no_support",
        passage: "",
        _shadow: true,
        _error: "parse_failed",
        _raw: truncate(completion?.text ?? "", 200),
      },
    ];
  }

  if (rows.length === 0) {
    return [
      {
        statementIndex,
        sourceIndex,
        sourceLabel,
        classification: "no_support",
        passage: "",
        _shadow: true,
      },
    ];
  }

  return rows.map((row) => {
    const classification = ALLOWED.has(row?.classification)
      ? row.classification
      : "no_support";
    const passage = typeof row?.passage === "string" ? row.passage : "";
    return {
      statementIndex,
      sourceIndex,
      sourceLabel,
      classification,
      passage,
      _shadow: true,
    };
  });
}

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (ALLOWED.has(c)) return c;
  return "no_support";
}

/**
 * Attribute one widened passage against the answer-key for that statement.
 * @returns {"LEGITIMATE"|"SPURIOUS"}
 */
function attributePassageRole(match, answerStmt) {
  const cls = normalizeClassification(match?.classification);
  const pass = typeof match?.passage === "string" ? match.passage : "";
  const srcIdx = Number(match?.sourceIndex);
  const expectedSupport = Array.isArray(answerStmt?.expectedSupport)
    ? answerStmt.expectedSupport
    : [];
  const expectedNoSupport = Array.isArray(answerStmt?.expectedNoSupport)
    ? answerStmt.expectedNoSupport
    : [];

  if (cls === "no_support") {
    return pass.trim() ? "SPURIOUS" : "SPURIOUS"; // empty silence shouldn't be a driver; if tagged, treat as spurious
  }

  for (const exp of expectedSupport) {
    if (Number(exp.sourceIndex) !== srcIdx) continue;
    if (passageRelated(pass, exp.passage)) return "LEGITIMATE";
  }
  for (const trap of expectedNoSupport) {
    if (Number(trap.sourceIndex) !== srcIdx) continue;
    if (passageRelated(pass, trap.temptingPassage)) return "SPURIOUS";
  }
  return "SPURIOUS"; // novel/unexpected
}

/**
 * Step D attribution: when shadow verdict/hasConflict differs from baseline, identify
 * which widened passages introduced the driving new classification(s), and label each
 * LEGITIMATE vs SPURIOUS against the answer-key.
 *
 * @returns {null | {
 *   changeLabel: "LEGITIMATE-SURFACING"|"SPURIOUS-DRIFT"|"MIXED"|"NON_ADDITIVE",
 *   novelClasses: string[],
 *   drivingClasses: string[],
 *   drivers: Array<Record<string, unknown>>,
 *   baselineContributingSourceIndices: number[],
 *   shadowContributingSourceIndices: number[],
 * }}
 */
function attributeVerdictChange(bMatches, wMatches, baselineAgg, shadowAgg, answerStmt) {
  if (!baselineAgg || !shadowAgg) return null;
  const verdictChanged = baselineAgg.verdict !== shadowAgg.verdict;
  const conflictChanged =
    Boolean(baselineAgg.hasConflict) !== Boolean(shadowAgg.hasConflict);
  if (!verdictChanged && !conflictChanged) return null;

  const baselineClasses = new Set(
    (Array.isArray(bMatches) ? bMatches : [])
      .map((m) => normalizeClassification(m?.classification))
      .filter((c) => c !== "no_support")
  );

  const novelClasses = [
    ...new Set(
      (Array.isArray(wMatches) ? wMatches : [])
        .map((m) => normalizeClassification(m?.classification))
        .filter((c) => c !== "no_support" && !baselineClasses.has(c))
    ),
  ];

  /** @type {Set<string>} */
  const drivingClasses = new Set();

  // hasConflict false → true: driven by conflicting passages in the widened set
  if (!baselineAgg.hasConflict && shadowAgg.hasConflict) {
    drivingClasses.add("conflicting");
  }

  // Verdict change: driving class is the shadow verdict bucket when it is newly present
  if (verdictChanged) {
    const shadowVerdict = shadowAgg.verdict;
    if (shadowVerdict === "confirmed" && !baselineClasses.has("confirmed")) {
      drivingClasses.add("confirmed");
    } else if (shadowVerdict === "conflicting" && !baselineClasses.has("conflicting")) {
      drivingClasses.add("conflicting");
    } else if (
      shadowVerdict === "partially_confirmed" &&
      !baselineClasses.has("partially_confirmed")
    ) {
      drivingClasses.add("partially_confirmed");
    }
    // If shadow dropped to a lower verdict because a higher class vanished, there may be
    // no additive driver — handled as NON_ADDITIVE below.
  }

  const driverMatches = (Array.isArray(wMatches) ? wMatches : []).filter((m) => {
    const c = normalizeClassification(m?.classification);
    return drivingClasses.has(c);
  });

  const drivers = driverMatches.map((m) => {
    const role = attributePassageRole(m, answerStmt);
    return {
      sourceIndex: Number(m.sourceIndex),
      sourceLabel: m.sourceLabel ?? null,
      classification: normalizeClassification(m.classification),
      passage: truncate(m.passage, 120),
      role,
    };
  });

  let changeLabel;
  if (drivers.length === 0) {
    changeLabel = "NON_ADDITIVE";
  } else {
    const hasLegit = drivers.some((d) => d.role === "LEGITIMATE");
    const hasSpurious = drivers.some((d) => d.role === "SPURIOUS");
    if (hasLegit && hasSpurious) changeLabel = "MIXED";
    else if (hasSpurious) changeLabel = "SPURIOUS-DRIFT";
    else changeLabel = "LEGITIMATE-SURFACING";
  }

  return {
    changeLabel,
    novelClasses,
    drivingClasses: [...drivingClasses],
    drivers,
    baselineContributingSourceIndices: Array.isArray(baselineAgg.contributingSourceIndices)
      ? baselineAgg.contributingSourceIndices
      : [],
    shadowContributingSourceIndices: Array.isArray(shadowAgg.contributingSourceIndices)
      ? shadowAgg.contributingSourceIndices
      : [],
    verdictChanged,
    conflictChanged,
  };
}

function scorePrecision(widenedMatches, answerStmt) {
  const expectedSupport = Array.isArray(answerStmt.expectedSupport)
    ? answerStmt.expectedSupport
    : [];
  const expectedNoSupport = Array.isArray(answerStmt.expectedNoSupport)
    ? answerStmt.expectedNoSupport
    : [];

  const usedSupport = new Set();
  let tp = 0;
  const fps = [];

  for (const m of widenedMatches) {
    const cls = m.classification;
    const pass = m.passage || "";
    const srcIdx = Number(m.sourceIndex);

    if (cls === "no_support") {
      if (pass.trim()) {
        fps.push({
          category: "no_support_with_text",
          sourceIndex: srcIdx,
          classification: cls,
          passage: truncate(pass),
        });
      }
      // empty no_support is silence — not FP
      continue;
    }

    let hitSupport = -1;
    for (let i = 0; i < expectedSupport.length; i++) {
      if (usedSupport.has(i)) continue;
      const exp = expectedSupport[i];
      if (Number(exp.sourceIndex) !== srcIdx) continue;
      // supporting classifications in key include confirmed/conflicting/partial
      if (passageRelated(pass, exp.passage)) {
        hitSupport = i;
        break;
      }
    }
    if (hitSupport >= 0) {
      usedSupport.add(hitSupport);
      tp += 1;
      continue;
    }

    let hitTrap = null;
    for (const trap of expectedNoSupport) {
      if (Number(trap.sourceIndex) !== srcIdx) continue;
      if (passageRelated(pass, trap.temptingPassage)) {
        hitTrap = trap;
        break;
      }
    }
    if (hitTrap) {
      fps.push({
        category: "temptingPassage",
        reason: hitTrap.reason || "",
        sourceIndex: srcIdx,
        classification: cls,
        passage: truncate(pass),
      });
      continue;
    }

    fps.push({
      category: "novel_unexpected",
      sourceIndex: srcIdx,
      classification: cls,
      passage: truncate(pass),
    });
  }

  return { tp, fp: fps.length, fps, usedSupportIndices: [...usedSupport] };
}

function scoreRecall(widenedMatches, answerStmt) {
  if (!MULTI_PASSAGE_CASES.has(answerStmt.case)) {
    return null;
  }
  const expectedSupport = Array.isArray(answerStmt.expectedSupport)
    ? answerStmt.expectedSupport
    : [];
  return expectedSupport.map((exp, i) => {
    const found = widenedMatches.some(
      (m) =>
        Number(m.sourceIndex) === Number(exp.sourceIndex) &&
        m.classification !== "no_support" &&
        passageRelated(m.passage, exp.passage)
    );
    return {
      index: i,
      sourceIndex: exp.sourceIndex,
      classification: exp.classification,
      found,
      passage: truncate(exp.passage, 100),
    };
  });
}

function primaryPassage(excerpt) {
  return excerpt?.primaryExcerpt?.passage ?? null;
}

async function runFixture(meta, traceId) {
  const fixture = await loadFixture(meta.id);
  const answerKey = await loadAnswerKey(meta.answerKey);
  const sourceFiles = Array.isArray(fixture.sources) ? fixture.sources : [];
  const pipelineSources = await loadPipelineSources(sourceFiles);
  const sourcesForMatch = pipelineSources.map((s, i) => ({
    label: s.label,
    text: s.text,
    index: i,
  }));

  // Caveat: answer-key statements — Stage-1 extraction bypassed.
  const statements = answerKey.statements.map((s, i) => ({
    index: i,
    text: s.text,
    ref: s.ref,
    case: s.case,
    attempt: "answer_key",
  }));

  console.log(`[shadow] fixture ${meta.id} ${meta.label}: ${statements.length} stmts × ${sourcesForMatch.length} sources`);

  // B — BASELINE (real single-pick via matchAllSources)
  console.log(`[shadow] baseline matchAllSources…`);
  const baselineResult = await matchAllSources({
    statements,
    sources: sourcesForMatch,
    traceId,
  });
  const baselineMatches = baselineResult.matches || [];

  // C — WIDENED
  console.log(`[shadow] widened matcher…`);
  const widenedMatches = [];
  for (const stmt of statements) {
    for (const src of sourcesForMatch) {
      const rows = await matchWidenedPair({
        statementIndex: stmt.index,
        statementText: stmt.text,
        sourceText: src.text,
        sourceIndex: src.index,
        sourceLabel: src.label,
        traceId,
      });
      widenedMatches.push(...rows);
    }
  }

  const perStatement = [];
  const offsetSamples = [];

  for (const stmt of statements) {
    const answerStmt = answerKey.statements[stmt.index];
    const bMatches = baselineMatches.filter((m) => Number(m.statementIndex) === stmt.index);
    const wMatches = widenedMatches.filter((m) => Number(m.statementIndex) === stmt.index);

    let baselineAgg;
    let shadowAgg;
    let baselineExcerpts;
    let shadowExcerpts;
    let aggregatorError = null;

    try {
      baselineAgg = aggregateVerdictV4({ statementMatches: bMatches });
      baselineExcerpts = selectExcerpts({
        statementMatches: bMatches,
        verdict: baselineAgg.verdict,
        hasConflict: baselineAgg.hasConflict,
      });
    } catch (err) {
      aggregatorError = `baseline: ${err?.message || err}`;
    }

    try {
      shadowAgg = aggregateVerdictV4({ statementMatches: wMatches });
      shadowExcerpts = selectExcerpts({
        statementMatches: wMatches,
        verdict: shadowAgg.verdict,
        hasConflict: shadowAgg.hasConflict,
      });
    } catch (err) {
      aggregatorError = [aggregatorError, `shadow: ${err?.message || err}`].filter(Boolean).join("; ");
    }

    const neutral =
      !aggregatorError &&
      baselineAgg?.verdict === shadowAgg?.verdict &&
      Boolean(baselineAgg?.hasConflict) === Boolean(shadowAgg?.hasConflict);

    const attribution =
      !neutral && baselineAgg && shadowAgg
        ? attributeVerdictChange(bMatches, wMatches, baselineAgg, shadowAgg, answerStmt)
        : null;

    const bPrimary = primaryPassage(baselineExcerpts);
    const sPrimary = primaryPassage(shadowExcerpts);
    const primaryChanged =
      normaliseForOffset(bPrimary || "") !== normaliseForOffset(sPrimary || "");

    const precision = scorePrecision(wMatches, answerStmt);
    const recall = scoreRecall(wMatches, answerStmt);

    const sourceTextByIndex = Object.fromEntries(sourcesForMatch.map((s) => [s.index, s.text]));

    for (const m of [...bMatches, ...wMatches]) {
      const srcText = sourceTextByIndex[Number(m.sourceIndex)] || "";
      const off = resolveOffsets(m.passage, srcText);
      offsetSamples.push({
        fixture: meta.label,
        ref: stmt.ref,
        matcher: m._shadow ? "widened" : "baseline",
        sourceIndex: m.sourceIndex,
        classification: m.classification,
        passage: truncate(m.passage, 80),
        ...off,
      });
    }

    // Stress-case callouts
    const stress = [];
    if (meta.label === "alp_multisource" && stmt.ref === "S5") {
      const keyPass = answerStmt.expectedSupport?.[0]?.passage || "";
      const srcText = sourceTextByIndex[1] || "";
      const off = resolveOffsets(keyPass, srcText);
      stress.push({
        id: "ALP_S5_curly_quotes",
        keyPassage: truncate(keyPass, 100),
        exact: off.exact,
        normalised: off.normalised,
        expectExactFailNormalisedOk: !off.exact && off.normalised,
      });
    }
    if (meta.label === "crf_multisource" && stmt.ref === "S4") {
      const keyPass =
        answerStmt.expectedSupport?.find((e) => e.stressType === "en_dash")?.passage ||
        answerStmt.expectedSupport?.[0]?.passage ||
        "";
      const srcText = sourceTextByIndex[0] || "";
      const off = resolveOffsets(keyPass, srcText);
      stress.push({
        id: "CRF_S4_en_dash",
        keyPassage: truncate(keyPass, 100),
        exact: off.exact,
        normalised: off.normalised,
        expectExactFailNormalisedOk: !off.exact && off.normalised,
      });
    }

    perStatement.push({
      ref: stmt.ref,
      case: answerStmt.case,
      text: stmt.text,
      baseline: {
        verdict: baselineAgg?.verdict ?? null,
        hasConflict: baselineAgg?.hasConflict ?? null,
        contributingSourceIndices: baselineAgg?.contributingSourceIndices ?? [],
        matchCount: bMatches.length,
        matches: bMatches.map((m) => ({
          sourceIndex: m.sourceIndex,
          classification: m.classification,
          passage: truncate(m.passage, 100),
        })),
        primaryExcerpt: bPrimary ? truncate(bPrimary, 100) : null,
      },
      shadow: {
        verdict: shadowAgg?.verdict ?? null,
        hasConflict: shadowAgg?.hasConflict ?? null,
        contributingSourceIndices: shadowAgg?.contributingSourceIndices ?? [],
        matchCount: wMatches.length,
        matches: wMatches.map((m) => ({
          sourceIndex: m.sourceIndex,
          classification: m.classification,
          passage: truncate(m.passage, 100),
        })),
        primaryExcerpt: sPrimary ? truncate(sPrimary, 100) : null,
      },
      neutral,
      attribution,
      primaryExcerptChanged: primaryChanged,
      aggregatorError,
      precision,
      recall,
      stress,
    });
  }

  const exactOk = offsetSamples.filter((o) => o.passage && o.exact).length;
  const normOk = offsetSamples.filter((o) => o.passage && o.normalised).length;
  const withPassage = offsetSamples.filter((o) => (o.passage || "").trim()).length;

  return {
    fixtureId: meta.id,
    label: meta.label,
    statementSource: "answer_key",
    stage1Bypassed: true,
    sources: sourceFiles,
    perStatement,
    offsetSummary: {
      withPassage,
      exactResolved: exactOk,
      normalisedResolved: normOk,
      exactPct: withPassage ? Math.round((1000 * exactOk) / withPassage) / 10 : 0,
      normalisedPct: withPassage ? Math.round((1000 * normOk) / withPassage) / 10 : 0,
    },
    offsetSamples,
  };
}

function buildFindingsMarkdown(results, estimate) {
  const lines = [];
  lines.push("# R7 Stage-2 shadow multi-passage diagnostic");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## 0. Method notes");
  lines.push("");
  lines.push(
    "- Baseline matcher: exported `matchAllSources` (wraps private `matchOnePair`; gpt-4o temp 0)."
  );
  lines.push(
    "- Widened matcher: `callLLM` + `STAGE_MODELS['stage2-matching']` + `stage2_v4_multipassage_shadow.md`."
  );
  lines.push(
    "- Aggregator / excerpts: real `aggregateVerdict` (as aggregateVerdictV4) + `selectExcerpts`."
  );
  lines.push(
    "- **Caveat:** statements loaded from answer-keys — Stage-1 extraction bypassed."
  );
  lines.push(`- Estimated LLM calls (pre-run): ${estimate.estimatedLlmCalls}.`);
  lines.push("");

  // Headline neutrality + attribution
  const allStmts = results.flatMap((r) =>
    r.perStatement.map((s) => ({ fixture: r.label, ...s }))
  );
  const changed = allStmts.filter((s) => !s.neutral);
  const labelCounts = {
    "LEGITIMATE-SURFACING": 0,
    "SPURIOUS-DRIFT": 0,
    MIXED: 0,
    NON_ADDITIVE: 0,
  };
  for (const s of changed) {
    const lab = s.attribution?.changeLabel || "NON_ADDITIVE";
    if (labelCounts[lab] == null) labelCounts[lab] = 0;
    labelCounts[lab] += 1;
  }
  const spuriousProblem =
    labelCounts["SPURIOUS-DRIFT"] + labelCounts.MIXED;

  lines.push("## 1. NEUTRALITY (with verdict-change attribution)");
  lines.push("");
  lines.push(
    `**Headline: (a) ${changed.length} of ${allStmts.length} statements changed verdict and/or hasConflict; (b) of those — LEGITIMATE-SURFACING=${labelCounts["LEGITIMATE-SURFACING"]}, SPURIOUS-DRIFT=${labelCounts["SPURIOUS-DRIFT"]}, MIXED=${labelCounts.MIXED}, NON_ADDITIVE=${labelCounts.NON_ADDITIVE}.**`
  );
  lines.push("");
  lines.push(
    `**Option-2 gate (b):** ${
      spuriousProblem === 0
        ? "PASS — zero SPURIOUS-DRIFT and zero MIXED (widening is verdict-safe once emit is classification+precision gated)."
        : `FAIL — ${spuriousProblem} change(s) have a spurious driver (SPURIOUS-DRIFT or MIXED); verdict layer needs protection from widened noise.`
    }`
  );
  lines.push("");
  lines.push(
    "Aggregator mechanism: existence reduction (`anyConfirmed` → `anyConflicting` → `anyPartial` → `not_supported`) over the raw match list; **does not count** and **does not dedupe by sourceIndex**. A verdict/hasConflict change under widening is **expected and legitimate** when driven by a real planted passage single-pick dropped, and a **problem** only when driven by a false/noise passage."
  );
  lines.push("");
  lines.push(
    "| Fixture | Stmt | Baseline V/C (contrib) | Shadow V/C (contrib) | Change label | Primary excerpt changed |"
  );
  lines.push("|---|---|---|---|---|---|");
  for (const s of allStmts) {
    const bContrib = (s.baseline.contributingSourceIndices || []).join(",") || "—";
    const sContrib = (s.shadow.contributingSourceIndices || []).join(",") || "—";
    const label = s.neutral ? "NEUTRAL" : s.attribution?.changeLabel || "CHANGED";
    lines.push(
      `| ${s.fixture} | ${s.ref} | ${s.baseline.verdict}/${s.baseline.hasConflict} (${bContrib}) | ${s.shadow.verdict}/${s.shadow.hasConflict} (${sContrib}) | ${label} | ${s.primaryExcerptChanged ? "yes" : "no"} |`
    );
    if (s.aggregatorError) {
      lines.push(`| | | aggregator error | ${s.aggregatorError} | | |`);
    }
  }
  lines.push("");
  lines.push("### Change attribution detail");
  lines.push("");
  if (changed.length === 0) {
    lines.push("(no verdict/hasConflict changes)");
  } else {
    for (const s of changed) {
      const a = s.attribution;
      lines.push(
        `- **${s.fixture} ${s.ref}** → \`${a?.changeLabel || "?"}\` (novel classes: [${(a?.novelClasses || []).join(", ")}]; driving: [${(a?.drivingClasses || []).join(", ")}])`
      );
      for (const d of a?.drivers || []) {
        lines.push(
          `  - driver [${d.role}] src=${d.sourceIndex} cls=${d.classification}: "${d.passage}"`
        );
      }
      if (!a?.drivers?.length) {
        lines.push(
          "  - (no additive driver passages — change likely from a baseline classification absent in the widened set)"
        );
      }
    }
  }
  lines.push("");

  // Precision
  const totalTp = allStmts.reduce((a, s) => a + (s.precision?.tp || 0), 0);
  const totalFp = allStmts.reduce((a, s) => a + (s.precision?.fp || 0), 0);
  lines.push("## 2. PRECISION");
  lines.push("");
  lines.push(
    `**Headline: widened TP=${totalTp}, FP=${totalFp} — ${totalFp === 0 ? "no noise on this pair of fixtures." : "noise present; see FP list."}**`
  );
  lines.push("");
  for (const s of allStmts) {
    lines.push(
      `- **${s.fixture} ${s.ref}** (${s.case}): TP=${s.precision.tp} FP=${s.precision.fp}`
    );
    for (const fp of s.precision.fps || []) {
      lines.push(
        `  - FP [${fp.category}] src=${fp.sourceIndex} cls=${fp.classification}: "${fp.passage}"`
      );
    }
  }
  lines.push("");

  // Recall
  lines.push("## 3. RECALL (multi-passage planted cases)");
  lines.push("");
  const multi = allStmts.filter((s) => s.recall);
  for (const s of multi) {
    const allFound = s.recall.every((r) => r.found);
    lines.push(
      `**${s.fixture} ${s.ref} (${s.case}): ${allFound ? "YES — all planted passages recovered." : "NO — at least one planted passage missing."}**`
    );
    for (const r of s.recall) {
      lines.push(
        `  - planted[${r.index}] src=${r.sourceIndex} cls=${r.classification} found=${r.found}: "${r.passage}"`
      );
    }
  }
  if (multi.length === 0) {
    lines.push("(no multi-passage cases in answer-keys)");
  }
  lines.push("");

  // Offset
  lines.push("## 4. OFFSET RESOLUTION");
  lines.push("");
  const withP = results.reduce((a, r) => a + r.offsetSummary.withPassage, 0);
  const exact = results.reduce((a, r) => a + r.offsetSummary.exactResolved, 0);
  const norm = results.reduce((a, r) => a + r.offsetSummary.normalisedResolved, 0);
  const exactPct = withP ? Math.round((1000 * exact) / withP) / 10 : 0;
  const normPct = withP ? Math.round((1000 * norm) / withP) / 10 : 0;
  lines.push(
    `**Headline: exact-resolve ${exactPct}% (${exact}/${withP}); normalised-resolve ${normPct}% (${norm}/${withP}).**`
  );
  lines.push("");
  const stresses = allStmts.flatMap((s) => s.stress || []);
  for (const st of stresses) {
    lines.push(
      `- **${st.id}:** exact=${st.exact} normalised=${st.normalised} (expect exact FAIL + normalised OK → ${st.expectExactFailNormalisedOk ? "CONFIRMED" : "NOT AS EXPECTED"})`
    );
  }
  lines.push("");
  lines.push(
    "**OPEN DESIGN PROBLEM:** normalised match proves passage existence, but the raw-source highlight offset is NOT trivially recoverable when whitespace was collapsed (or typography remapped). Do not treat normalised index as a raw char offset for UI highlighting — needs an explicit back-mapping design in the build spec."
  );
  lines.push("");

  // Conclusion
  lines.push("## 5. CONCLUSION (recommend, don't decide)");
  lines.push("");
  if (changed.length === 0) {
    lines.push(
      "- Verdict neutrality: **no changes** on these fixtures under raw widened feeds. Still provisional — multi-passage can introduce new classifications on other drafts."
    );
  } else if (spuriousProblem === 0) {
    lines.push(
      `- Verdict changes: **${changed.length} change(s), all LEGITIMATE-SURFACING (or NON_ADDITIVE)** — Option 2 looks verdict-safe on these fixtures once emit is classification+precision gated; spurious drivers not observed.`
    );
  } else {
    lines.push(
      `- Verdict changes: **${spuriousProblem} SPURIOUS-DRIFT/MIXED** of ${changed.length} change(s) — Option 2 is **not** verdict-safe under raw widened feeds; protect the aggregator from spurious widened matches (filter/gate before aggregateVerdict).`
    );
  }
  lines.push(
    totalFp > 0
      ? "- Precision: **gate warranted** — FP passages observed; consider filtering `no_support`/noise before excerpt emit."
      : "- Precision: **acceptable on these fixtures** — re-check on a broader batch before shipping without a gate."
  );
  lines.push(
    "- Offset: normalised resolution recovers typography stress cases exact misses; **raw-offset recovery remains an open build-spec problem** (see §4)."
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const estimate = estimateCalls();

  console.log("[r7-stage2-shadow] call-count estimate:");
  console.log(JSON.stringify(estimate, null, 2));

  if (opts.estimateOnly) {
    console.log("[r7-stage2-shadow] --estimate-only: exiting before any LLM call.");
    return;
  }

  await loadPipelineDeps();

  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    console.error(`[r7-stage2-shadow] missing API key for ${stageModel.provider}`);
    process.exit(1);
  }

  const { createTraceId, flushObservability } = await import("../../lib/observability.js");
  const traceId = createTraceId();
  const results = [];

  try {
    for (const meta of FIXTURES) {
      results.push(await runFixture(meta, traceId));
    }
  } finally {
    await flushObservability();
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "-")
    .slice(0, 15);
  const outDir = path.join(RUNS_DIR, `r7-stage2-shadow-${stamp}`);
  await mkdir(outDir, { recursive: true });
  const resultPath = path.join(outDir, "result.json");
  await writeFile(
    resultPath,
    `${JSON.stringify({ estimate, results, generatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  console.log(`[r7-stage2-shadow] wrote ${resultPath}`);

  const findings = buildFindingsMarkdown(results, estimate);
  const findingsRunPath = path.join(outDir, "FINDINGS.md");
  await writeFile(findingsRunPath, findings, "utf8");
  console.log(`[r7-stage2-shadow] wrote ${findingsRunPath}`);

  if (opts.writeFindings) {
    const docsPath = path.join(REPO_ROOT, "docs/R7_STAGE2_SHADOW_DIAGNOSTIC.md");
    await writeFile(docsPath, findings, "utf8");
    console.log(`[r7-stage2-shadow] wrote ${docsPath}`);
  } else {
    console.log(
      "[r7-stage2-shadow] skipped docs/ write (pass --write-findings to emit docs/R7_STAGE2_SHADOW_DIAGNOSTIC.md)"
    );
  }

  // Console headlines
  console.log("\n=== HEADLINES ===\n");
  console.log(findings.split("\n").filter((l) => l.startsWith("**Headline:") || l.startsWith("**ALP_") || l.startsWith("**CRF_") || (l.startsWith("**") && l.includes("YES") || l.includes("NO —"))).slice(0, 20).join("\n"));
}

main().catch((err) => {
  console.error("[r7-stage2-shadow] fatal:", err?.stack || err?.message || err);
  process.exit(1);
});
