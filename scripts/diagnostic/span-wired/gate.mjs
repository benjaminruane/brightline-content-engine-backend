#!/usr/bin/env node
/**
 * B88 span-wired measurement.
 *
 * Selects the 3 fixtures with the most statements carrying a strictly shorter
 * validated span. Reuses one cached Stage 2 review per fixture for both arms.
 * Only the revision call is live (3 repeats x 2 arms x 3 fixtures = 18).
 *
 * No automatic pass/fail. Report the numbers.
 *
 * Usage:
 *   node scripts/diagnostic/span-wired/gate.mjs
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";
import { DEFAULT_LLM_CACHE_DISK_PATH } from "../lib/llm-cache-disk.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROWS_PATH = path.join(OUT_DIR, "rows.json");
const REPORT_PATH = path.join(OUT_DIR, "report.md");
const REPEATS = 3;
const SELECTED = ["nordholt-clean", "F18", "nordholt-dirty"];

const { matchAllSources, buildUnsupportedSpans } = await import(
  "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { selectExcerpts } = await import("../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { assembleCard } = await import("../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs");
const {
  gatherConcerns,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
} = await import("../../../lib/build-revision-prompt.mjs");
const {
  beginCacheRun,
  endCacheRun,
  getLlmCacheStore,
  isLlmCacheEnabled,
  llmCacheDiskPathFromEnv,
} = await import("../../../lib/qc/llm-cache.mjs");
const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

function caseFingerprint(label, draft, sources) {
  const hash = createHash("sha256");
  hash.update(String(label || ""));
  hash.update("\n");
  hash.update(typeof draft === "string" ? draft : "");
  for (const src of Array.isArray(sources) ? sources : []) {
    hash.update("\n---\n");
    hash.update(typeof src?.label === "string" ? src.label : "");
    hash.update("\n");
    hash.update(typeof src?.text === "string" ? src.text : "");
  }
  return hash.digest("hex");
}

function matchesForStatement(allMatches, statementIndex) {
  return (Array.isArray(allMatches) ? allMatches : [])
    .filter((m) => Number(m.statementIndex) === Number(statementIndex))
    .slice()
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function normalizeMatchClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

async function loadNordholt(kind) {
  const draftName = kind === "dirty" ? "draft_hold_update_DIRTY.txt" : "draft_hold_update_clean.txt";
  const draft = await readFile(path.join(NORDHOLT_DIR, draftName), "utf8");
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { draft, sources };
}

async function loadSupersessionFixture() {
  const draft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const files = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of files) {
    const text = await readFile(path.join(SUPERSESSION_DIR, name), "utf8");
    sources.push({ label: name.replace(/\.txt$/, ""), text });
  }
  return { draft, sources };
}

async function loadCorpusCase(label) {
  if (label === "nordholt-clean") return { label, ...(await loadNordholt("clean")) };
  if (label === "nordholt-dirty") return { label, ...(await loadNordholt("dirty")) };
  if (label === "supersession") return { label, ...(await loadSupersessionFixture()) };
  const fixtures = await loadAllFixtures();
  const n = parseInt(String(label).replace(/^F/i, ""), 10);
  const fx = fixtures.find((f) => parseInt(String(f.data.id), 10) === n);
  if (!fx) throw new Error(`fixture not found: ${label}`);
  const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
  const sources = await loadPipelineSources(fx.data.sources || []);
  return { label, draft, sources };
}

function baselineStatements(baselineRaw, label, draft, sources) {
  const row = baselineRaw?.cases?.[label];
  if (!row) return null;
  if (row.caseFingerprint !== caseFingerprint(label, draft, sources)) return null;
  if (!Array.isArray(row.statements) || row.statements.length === 0) return null;
  return row.statements;
}

function stripMarkers(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function isStrictlyShorterSpan(span, statementText) {
  const text = typeof span?.text === "string" ? span.text.trim() : "";
  const stmt = typeof statementText === "string" ? statementText.trim() : "";
  if (!text || !stmt) return false;
  if (text === stmt) return false;
  if (text.length >= stmt.length) return false;
  const start = span?.start;
  const end = span?.end;
  if (
    typeof start === "number" &&
    Number.isFinite(start) &&
    typeof end === "number" &&
    Number.isFinite(end) &&
    start === 0 &&
    end === statementText.length
  ) {
    return false;
  }
  return true;
}

function cardsWithoutSpans(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => {
    const copy = { ...card };
    delete copy.unsupportedSpans;
    copy.unsupportedSpans = [];
    return copy;
  });
}

function reviewFingerprint(cards) {
  const hash = createHash("sha256");
  for (const card of Array.isArray(cards) ? cards : []) {
    hash.update(JSON.stringify({
      index: card.index,
      statement: card.statement,
      supportState: card.supportState,
      displayVerdict: card.displayVerdict,
      hasConflict: card.hasConflict,
      evidenceSummary: card.evidenceSummary,
      primaryExcerpt: card.primaryExcerpt,
      conflictExcerpt: card.conflictExcerpt,
      editorialVerdict: card.editorialVerdict,
      complianceVerdict: card.complianceVerdict,
    }));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function namedSpansForCard(card) {
  const statement = typeof card?.statement === "string" ? card.statement : "";
  const spans = Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : [];
  const out = [];
  const seen = new Set();
  for (const span of spans) {
    if (!isStrictlyShorterSpan(span, statement)) continue;
    const text = typeof span.text === "string" ? span.text.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({
      text,
      sourceRefId: span.sourceRefId ?? null,
      sourceLabel: typeof span.sourceLabel === "string" ? span.sourceLabel : null,
      start: Number.isFinite(span.start) ? span.start : null,
      end: Number.isFinite(span.end) ? span.end : null,
    });
  }
  return out;
}

/**
 * Locate the revised form of a statement inside the revised draft.
 * Returns null when the statement appears deleted (no close remnant).
 */
function findRevisedStatement(origStmt, revisedDraft) {
  const clean = stripMarkers(revisedDraft);
  const normOrig = normalizeWhitespace(origStmt);
  if (!normOrig) return { found: false, text: "", deleted: true };
  const normClean = normalizeWhitespace(clean);
  if (normClean.includes(normOrig)) {
    return { found: true, text: origStmt, deleted: false, unchanged: true };
  }
  // Prefer a remnant that shares a long prefix or suffix with the original.
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const s of sentences) {
    const score = remnantScore(normOrig, normalizeWhitespace(s));
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (best && bestScore >= 0.35) {
    return { found: true, text: best, deleted: false, unchanged: false };
  }
  return { found: false, text: "", deleted: true };
}

function remnantScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  let pref = 0;
  while (pref < min && a[pref] === b[pref]) pref += 1;
  let suf = 0;
  while (suf < min && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
  return Math.max(pref, suf) / Math.max(a.length, 1);
}

function classifyStatementEdit(origStmt, revisedDraft, namedSpans) {
  const located = findRevisedStatement(origStmt, revisedDraft);
  if (located.deleted) {
    return {
      edited: true,
      wholeSentenceDeletion: true,
      touchedSpan: namedSpans.length > 0,
      outsideSpan: false,
      revisedText: "",
      namedSpans,
    };
  }
  const revisedNorm = normalizeWhitespace(stripMarkers(located.text));
  const origNorm = normalizeWhitespace(origStmt);
  if (revisedNorm === origNorm || located.unchanged) {
    return {
      edited: false,
      wholeSentenceDeletion: false,
      touchedSpan: false,
      outsideSpan: false,
      revisedText: located.text,
      namedSpans,
    };
  }
  let touchedSpan = false;
  for (const span of namedSpans) {
    const spanNorm = normalizeWhitespace(span.text);
    const origHas = origNorm.includes(spanNorm);
    const revHas = revisedNorm.includes(spanNorm);
    if (origHas && !revHas) {
      touchedSpan = true;
      break;
    }
    // Span text altered in place (substring overlap with a changed window).
    if (origHas && revHas) {
      // Span intact; edit may still be outside.
      continue;
    }
    if (origHas) {
      touchedSpan = true;
      break;
    }
  }
  const hadSpan = namedSpans.length > 0;
  const outsideSpan = hadSpan && !touchedSpan;
  return {
    edited: true,
    wholeSentenceDeletion: false,
    touchedSpan: hadSpan && touchedSpan,
    outsideSpan,
    revisedText: located.text,
    namedSpans,
  };
}

function money(n) {
  return `$${Number(n || 0).toFixed(4)}`;
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

function enrichUnsupportedSpans(spans, matches) {
  const bySource = new Map();
  for (const m of Array.isArray(matches) ? matches : []) {
    bySource.set(Number(m.sourceIndex), m);
  }
  return (Array.isArray(spans) ? spans : []).map((span) => {
    const m = bySource.get(Number(span.sourceRefId));
    const label = typeof m?.sourceLabel === "string" ? m.sourceLabel : null;
    return label ? { ...span, sourceLabel: label } : { ...span };
  });
}

async function assembleReviewCards({ statements, matches, sources }) {
  const asOf = buildAsOfBySourceIndex(sources);
  const cards = [];
  for (let ord = 0; ord < statements.length; ord += 1) {
    const stmt = statements[ord];
    const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
    const text = typeof stmt?.text === "string" ? stmt.text : "";
    const startChar = Number.isFinite(stmt?.charStart)
      ? stmt.charStart
      : Number.isFinite(stmt?.startChar)
        ? stmt.startChar
        : 0;
    const endChar = Number.isFinite(stmt?.charEnd)
      ? stmt.charEnd
      : Number.isFinite(stmt?.endChar)
        ? stmt.endChar
        : startChar + text.length;
    const rowMatches = matchesForStatement(matches, statementIndex);
    const sourceMatches = rowMatches.map((m) => ({
      sourceIndex: m.sourceIndex,
      sourceLabel: m.sourceLabel,
      classification: m.classification,
      passage: m.passage,
      explanation: m.explanation,
      periodAssessment: m.periodAssessment ?? null,
      statementFigures: Array.isArray(m.statementFigures) ? m.statementFigures : [],
      sourceFigures: Array.isArray(m.sourceFigures) ? m.sourceFigures : [],
    }));
    let agg = aggregateVerdict({ statementMatches: sourceMatches });
    const resolved = resolveSupersession({
      statement: text,
      aggregateVerdict: agg.verdict,
      sourceMatches,
      asOfBySourceIndex: asOf,
      today: TODAY,
    });
    if (resolved.verdictOverride) {
      const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
      for (const m of sourceMatches) {
        if (!demoted.has(Number(m.sourceIndex))) continue;
        m.originalClassification = m.classification;
        m.classification = "superseded";
      }
      agg = aggregateVerdict({ statementMatches: sourceMatches });
      agg = { ...agg, verdict: resolved.verdictOverride };
    }
    const confirmingMatches = sourceMatches.filter(
      (m) => normalizeMatchClassification(m.classification) === "confirmed"
    );
    const conflictingMatches = sourceMatches.filter(
      (m) => normalizeMatchClassification(m.classification) === "conflicting"
    );
    const partialMatches = sourceMatches.filter(
      (m) => normalizeMatchClassification(m.classification) === "partially_confirmed"
    );
    const verdictResult = {
      verdict: agg.verdict,
      hasConflict: agg.hasConflict,
      contributingSourceIndices: agg.contributingSourceIndices,
      confirmingMatches,
      conflictingMatches,
      partialMatches,
    };
    const excerptResult = selectExcerpts({
      statementMatches: sourceMatches,
      verdict: agg.verdict,
      hasConflict: agg.hasConflict,
    });
    const unsupportedSpans = enrichUnsupportedSpans(
      buildUnsupportedSpans(rowMatches, { statementIndex }),
      rowMatches
    );
    const card = await assembleCard(
      {
        statementText: text,
        startChar,
        endChar,
        sourceMatches,
        verdictResult,
        excerptResult,
        statementIndex,
        supersededSourceNotes: Array.isArray(resolved.supersededNotes) ? resolved.supersededNotes : [],
        unsupportedSpans,
        commentaryResult: { commentary: "" },
        editorialResult: {
          editorialVerdict: "clean",
          editorialConcerns: [],
          editorialNote: "No editorial or style concerns identified under the listed rules.",
          complianceVerdict: "clean",
          complianceConcerns: [],
        },
      },
      statementIndex,
      {
        pipelineRoute: "v4",
        sources,
        today: TODAY,
        skipEditorialDuplicationJudge: true,
        framingFidelityJudge: async () => ({ fire: false }),
      }
    );
    cards.push(card);
  }
  return cards;
}

async function main() {
  const diskPath = llmCacheDiskPathFromEnv() || DEFAULT_LLM_CACHE_DISK_PATH;
  const diskExisted = Boolean(diskPath && existsSync(diskPath));
  const store = getLlmCacheStore();
  const modelConfig = STAGE_MODELS["writing-rewrite"];

  let baselineRaw = null;
  try {
    baselineRaw = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch (err) {
    console.error(`STOP: cannot read ${BASELINE_PATH}: ${err?.message || err}`);
    process.exit(1);
  }

  if (!isLlmCacheEnabled()) {
    console.error("STOP: QC_LLM_CACHE is off. Review must replay Stage 2 from cache.");
    process.exit(1);
  }
  if (!diskExisted) {
    console.error("STOP: disk cache file is missing.");
    process.exit(1);
  }
  if (!hasProviderApiKey(modelConfig.provider)) {
    console.error(`STOP: missing API key for ${modelConfig.provider}`);
    process.exit(1);
  }
  if (String(process.env.QC_STAGE2_SPAN || "").trim()) {
    console.error("STOP: QC_STAGE2_SPAN is set in the environment. This gate passes the option.");
    process.exit(1);
  }

  console.log("# B88 span-wired measurement");
  console.log("");
  console.log(
    "Fixture selection: nordholt-clean (4 statements with a strictly shorter validated span), F18 (4), nordholt-dirty (3). Chosen because they are the three corpus fixtures with the most such statements (from review-span-two-step validatedSpans)."
  );
  console.log("");
  console.log(
    `Expected cost: 18 live revision calls on ${modelConfig.model}. Drafts are short (nordholt ~0.7k chars, F18 ~1.9k). Estimated under $2.00.`
  );
  console.log("");

  const cases = [];
  for (const label of SELECTED) {
    const loaded = await loadCorpusCase(label);
    const statements = baselineStatements(baselineRaw, loaded.label, loaded.draft, loaded.sources);
    if (!statements) {
      console.error(`STOP: baseline miss for ${label}`);
      process.exit(1);
    }
    cases.push({ ...loaded, statements });
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    const first = String(args[0] || "");
    if (first.startsWith("[stage2]") || first.startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  beginCacheRun({ recordEvents: true });
  const reviews = [];
  for (const caseRow of cases) {
    const { matches } = await matchAllSources({
      statements: caseRow.statements,
      sources: caseRow.sources,
      stage2SpanEnabled: true,
    });
    const cards = await assembleReviewCards({
      statements: caseRow.statements,
      matches,
      sources: caseRow.sources,
    });
    const withSpans = cards;
    const without = cardsWithoutSpans(cards);
    const fpOn = reviewFingerprint(withSpans);
    const fpOff = reviewFingerprint(without);
    const shorterCount = withSpans.filter((c) => namedSpansForCard(c).length > 0).length;
    reviews.push({
      label: caseRow.label,
      draft: caseRow.draft,
      cardsOn: withSpans,
      cardsOff: without,
      reviewFingerprintOn: fpOn,
      reviewFingerprintOff: fpOff,
      reviewInputsIdentical: fpOn === fpOff,
      statementsWithShorterSpan: shorterCount,
    });
    console.log(
      `  review ${caseRow.label}: ${withSpans.length} cards, ${shorterCount} with strictly shorter span, reviewFingerprint match=${fpOn === fpOff}`
    );
  }
  const cache = endCacheRun();
  console.debug = origDebug;

  const cacheHits = cache?.byStage?.stage2?.hits ?? 0;
  const cacheMisses = cache?.byStage?.stage2?.misses ?? 0;
  if (cacheMisses > 0) {
    console.error(`STOP: Stage 2 cache misses ${cacheMisses}. Review was not a pure replay.`);
    process.exit(1);
  }
  if (!reviews.every((r) => r.reviewInputsIdentical)) {
    console.error("STOP: review fingerprints differ between arms (aside from spans).");
    process.exit(1);
  }

  const allEdits = [];
  const armTotals = {
    OFF: { edits: 0, touch: 0, outside: 0, deletions: 0, perRepeat: [] },
    ON: { edits: 0, touch: 0, outside: 0, deletions: 0, perRepeat: [] },
  };
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;

  for (const review of reviews) {
    const promptOff = buildRevisionPrompt(review.draft, gatherConcerns(review.cardsOff), {});
    const promptOn = buildRevisionPrompt(review.draft, gatherConcerns(review.cardsOn), {});
    const arms = [
      { name: "OFF", prompt: promptOff, cards: review.cardsOff },
      { name: "ON", prompt: promptOn, cards: review.cardsOn },
    ];

    for (const arm of arms) {
      for (let rep = 1; rep <= REPEATS; rep += 1) {
        console.log(`revision ${review.label} ${arm.name} repeat ${rep}/${REPEATS}`);
        const completion = await callLLM({
          provider: modelConfig.provider,
          model: modelConfig.model,
          temperature: 0,
          messages: [{ role: "user", content: arm.prompt }],
          traceName: "span-wired-revision",
          spanName: "span-wired-revision",
          metadata: {
            route: "span-wired",
            fixture: review.label,
            arm: arm.name,
            repeat: rep,
          },
        });
        const usage = completion?.usage || {};
        const inTok = Number(usage.inputTokens) || 0;
        const outTok = Number(usage.outputTokens) || 0;
        inputTokens += inTok;
        outputTokens += outTok;
        const priced = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, usage);
        if (priced > 0) {
          costUsd += priced;
        } else {
          // gpt-5.1 may be absent from the pricing table; use gpt-5 rates.
          costUsd += (inTok / 1e6) * 1.25 + (outTok / 1e6) * 10.0;
        }

        const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
        const finalized = finalizeSuggestRevisionText(raw, {
          originalDraft: review.draft,
          traceId: `span-wired-${review.label}-${arm.name}-${rep}`,
        });
        const revised = finalized.revisedDraft || "";

        let editsThis = 0;
        let touchThis = 0;
        let outsideThis = 0;
        let delThis = 0;

        for (const card of review.cardsOn) {
          const statement = typeof card.statement === "string" ? card.statement : "";
          const named = namedSpansForCard(card);
          // OFF arm still scores against the same named spans (what ON would have named).
          const result = classifyStatementEdit(statement, revised, named);
          if (!result.edited) continue;
          editsThis += 1;
          if (result.touchedSpan) touchThis += 1;
          if (result.outsideSpan) outsideThis += 1;
          if (result.wholeSentenceDeletion) delThis += 1;
          allEdits.push({
            fixtureId: review.label,
            arm: arm.name,
            repeat: rep,
            statementIndex: card.index,
            statement,
            namedSpans: named,
            revisedText: result.revisedText,
            wholeSentenceDeletion: result.wholeSentenceDeletion,
            touchedSpan: result.touchedSpan,
            outsideSpan: result.outsideSpan,
            markers: Array.isArray(finalized.markers) ? finalized.markers : [],
          });
        }

        armTotals[arm.name].edits += editsThis;
        armTotals[arm.name].touch += touchThis;
        armTotals[arm.name].outside += outsideThis;
        armTotals[arm.name].deletions += delThis;
        armTotals[arm.name].perRepeat.push({
          fixtureId: review.label,
          repeat: rep,
          edits: editsThis,
          touch: touchThis,
          outside: outsideThis,
          deletions: delThis,
        });
      }
    }
  }

  await flushObservability();

  function varianceSummary(armName) {
    const rows = armTotals[armName].perRepeat;
    const byFixture = new Map();
    for (const r of rows) {
      if (!byFixture.has(r.fixtureId)) byFixture.set(r.fixtureId, []);
      byFixture.get(r.fixtureId).push(r);
    }
    const lines = [];
    for (const [fixtureId, list] of byFixture) {
      const touches = list.map((r) => r.touch);
      const edits = list.map((r) => r.edits);
      const dels = list.map((r) => r.deletions);
      const touchRange = Math.max(...touches) - Math.min(...touches);
      const editRange = Math.max(...edits) - Math.min(...edits);
      lines.push({
        fixtureId,
        touchPerRepeat: touches,
        editsPerRepeat: edits,
        deletionsPerRepeat: dels,
        touchRange,
        editRange,
      });
    }
    return lines;
  }

  const offVar = varianceSummary("OFF");
  const onVar = varianceSummary("ON");
  const betweenTouch = Math.abs(armTotals.ON.touch - armTotals.OFF.touch);
  const maxWithinTouch = Math.max(
    0,
    ...offVar.map((v) => v.touchRange),
    ...onVar.map((v) => v.touchRange)
  );
  const varianceNote =
    maxWithinTouch >= betweenTouch && betweenTouch > 0
      ? "Within-arm touch variance is as large as the between-arm difference. This sample cannot answer whether the wire worked; a bigger sample is needed."
      : maxWithinTouch >= betweenTouch && betweenTouch === 0
        ? "Between-arm touch counts are equal and within-arm variance is present. The sample does not show a clear wire effect."
        : "Between-arm touch difference exceeds the largest within-arm touch range on this sample.";

  const lines = [];
  lines.push("# B88 span-wired measurement");
  lines.push("");
  lines.push("No automatic pass/fail. Numbers only.");
  lines.push("");
  lines.push("## Fixture selection");
  lines.push("");
  lines.push(
    "Picked nordholt-clean, F18, and nordholt-dirty because they have the most statements with a strictly shorter validated span in the review-span-two-step corpus (4, 4, and 3 respectively)."
  );
  for (const r of reviews) {
    lines.push(
      `- ${r.label}: ${r.statementsWithShorterSpan} statements with a strictly shorter span; review fingerprint OFF/ON identical=${r.reviewInputsIdentical}`
    );
  }
  lines.push("");
  lines.push("## Cache / review reuse");
  lines.push("");
  lines.push(`- Stage 2 hits ${cacheHits}, misses ${cacheMisses} (must be 0 misses)`);
  lines.push(`- store kind: ${store?.kind || "unknown"}`);
  lines.push(
    "- Review inputs identical between arms: yes (same card fingerprint excluding unsupportedSpans). OFF strips unsupportedSpans before gatherConcerns; ON keeps them. Editorial/compliance set clean so only evidence findings drive the reviser."
  );
  lines.push("- Only the revision call is live.");
  lines.push("");
  lines.push("## Cost");
  lines.push("");
  lines.push(`- Revision calls: ${SELECTED.length * 2 * REPEATS}`);
  lines.push(`- Model: ${modelConfig.provider}/${modelConfig.model}`);
  lines.push(`- Tokens: input ${inputTokens}, output ${outputTokens}`);
  lines.push(`- Total cost: ${money(costUsd)}`);
  lines.push("");
  lines.push("## Totals per arm (across all fixtures and repeats)");
  lines.push("");
  for (const arm of ["OFF", "ON"]) {
    const t = armTotals[arm];
    lines.push(`### ${arm}`);
    lines.push(`1. Total edits made: ${t.edits}`);
    lines.push(`2. Edits that touch a named span: ${t.touch}`);
    lines.push(`3. Edits to statements that had a span but landed outside it: ${t.outside}`);
    lines.push(`4. Whole-sentence deletions: ${t.deletions}`);
    lines.push("");
  }
  if (armTotals.ON.deletions > armTotals.OFF.deletions) {
    lines.push(
      "NOTE: ON deleted more whole sentences than OFF. That outranks any gain in span-touch count."
    );
    lines.push("");
  }
  lines.push("## Run-to-run variance");
  lines.push("");
  lines.push(`Between-arm touch difference (ON - OFF): ${armTotals.ON.touch - armTotals.OFF.touch}`);
  lines.push(`Largest within-arm touch range (any fixture): ${maxWithinTouch}`);
  lines.push(varianceNote);
  lines.push("");
  lines.push("### OFF per-repeat");
  for (const v of offVar) {
    lines.push(
      `- ${v.fixtureId}: touch=${JSON.stringify(v.touchPerRepeat)} edits=${JSON.stringify(v.editsPerRepeat)} deletions=${JSON.stringify(v.deletionsPerRepeat)}`
    );
  }
  lines.push("");
  lines.push("### ON per-repeat");
  for (const v of onVar) {
    lines.push(
      `- ${v.fixtureId}: touch=${JSON.stringify(v.touchPerRepeat)} edits=${JSON.stringify(v.editsPerRepeat)} deletions=${JSON.stringify(v.deletionsPerRepeat)}`
    );
  }
  lines.push("");
  lines.push(`Full edit rows: ${allEdits.length} (see rows.json).`);
  lines.push("");

  const report = `${lines.join("\n").trim()}\n`;
  const payload = {
    selection: {
      fixtures: SELECTED,
      why: "Most statements with a strictly shorter validated span in the review-span-two-step corpus (4, 4, 3).",
      perFixture: reviews.map((r) => ({
        fixtureId: r.label,
        statementsWithShorterSpan: r.statementsWithShorterSpan,
        reviewInputsIdentical: r.reviewInputsIdentical,
        reviewFingerprint: r.reviewFingerprintOn,
      })),
    },
    cache: {
      stage2Hits: cacheHits,
      stage2Misses: cacheMisses,
      storeKind: store?.kind || null,
    },
    cost: {
      revisionCalls: SELECTED.length * 2 * REPEATS,
      model: `${modelConfig.provider}/${modelConfig.model}`,
      inputTokens,
      outputTokens,
      costUsd,
    },
    totals: armTotals,
    variance: {
      off: offVar,
      on: onVar,
      betweenTouchDiff: armTotals.ON.touch - armTotals.OFF.touch,
      maxWithinTouchRange: maxWithinTouch,
      note: varianceNote,
    },
    edits: allEdits,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(ROWS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(REPORT_PATH, report, "utf8");
  console.log("");
  console.log(report);
  console.log(`wrote ${ROWS_PATH}`);
  console.log(`wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
