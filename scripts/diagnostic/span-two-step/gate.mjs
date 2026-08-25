#!/usr/bin/env node
/**
 * B88 two-step span elicit gate.
 *
 * Primary Stage 2 call is byte-identical with the flag ON or OFF.
 * OFF replays from disk cache. ON must hit those same primary keys.
 * Second calls run only for partially_confirmed and conflicting.
 *
 * PASS: zero pair-level classification deltas and zero card-level
 * verdict deltas. Any delta is a failure.
 *
 * Usage:
 *   node scripts/diagnostic/span-two-step/gate.mjs
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
const SPAN_ELICIT_PARENT_PREFIX = "unsupported-span:";

const { matchAllSources, resetStage2UnsupportedSpanStats, getStage2UnsupportedSpanRejectionCount, getStage2UnsupportedSpanWholeCount, getStage2UnsupportedSpanMultiOccurrenceCount, isSpanElicitEligible } =
  await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const {
  beginCacheRun,
  endCacheRun,
  getLlmCacheStore,
  isLlmCacheEnabled,
  llmCacheDiskPathFromEnv,
} = await import("../../../lib/qc/llm-cache.mjs");

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

function mapCardVerdict(stage3) {
  const v = String(stage3 || "").trim();
  if (v === "confirmed") return "supported_full";
  if (v === "partially_confirmed") return "supported_partial";
  if (v === "not_supported") return "not_supported";
  if (v === "conflicting") return "conflicting";
  return "unclassified";
}

function applySupersession({ statementText, sourceMatches, asOfBySourceIndex, today }) {
  const matches = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({ ...m }));
  let agg = aggregateVerdict({ statementMatches: matches });
  const resolved = resolveSupersession({
    statement: statementText,
    aggregateVerdict: agg.verdict,
    sourceMatches: matches,
    asOfBySourceIndex,
    today,
  });
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    for (const m of matches) {
      if (!demoted.has(Number(m.sourceIndex))) continue;
      m.originalClassification = m.classification;
      m.classification = "superseded";
    }
    agg = aggregateVerdict({ statementMatches: matches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { agg, matches, resolved };
}

function cardFromMatches(statement, allMatches, asOfBySourceIndex) {
  const statementIndex = Number.isFinite(statement?.index) ? Number(statement.index) : 0;
  const statementText = typeof statement?.text === "string" ? statement.text : "";
  const sourceMatches = matchesForStatement(allMatches, statementIndex);
  const { agg } = applySupersession({
    statementText,
    sourceMatches,
    asOfBySourceIndex,
    today: TODAY,
  });
  return {
    statementIndex,
    statementText,
    stage3: agg.verdict,
    verdict: mapCardVerdict(agg.verdict),
    hasConflict: agg.hasConflict === true,
    matches: sourceMatches,
  };
}

function formatPct(part, whole) {
  if (!whole) return "vacuous (denominator 0)";
  return `${((100 * part) / whole).toFixed(1)}% (${part}/${whole})`;
}

function money(n) {
  return `$${Number(n || 0).toFixed(4)}`;
}

function splitCacheEvents(stats) {
  const events = Array.isArray(stats?.events) ? stats.events : [];
  const elicit = [];
  const primary = [];
  for (const ev of events) {
    if (String(ev?.parentSentence || "").startsWith(SPAN_ELICIT_PARENT_PREFIX)) elicit.push(ev);
    else primary.push(ev);
  }
  const count = (list, hit) => list.filter((e) => e.hit === hit).length;
  return {
    primaryHits: count(primary, true),
    primaryMisses: count(primary, false),
    elicitHits: count(elicit, true),
    elicitMisses: count(elicit, false),
    eventCount: events.length,
  };
}

function formatCacheStats(stats) {
  const s2 = stats?.byStage?.stage2 || { hits: 0, misses: 0 };
  return {
    hits: stats?.hits ?? 0,
    misses: stats?.misses ?? 0,
    stage2Hits: s2.hits || 0,
    stage2Misses: s2.misses || 0,
    split: splitCacheEvents(stats),
  };
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

async function loadMainCorpus() {
  const out = [];
  const skipped = [];
  for (const kind of ["clean", "dirty"]) {
    const label = kind === "dirty" ? "nordholt-dirty" : "nordholt-clean";
    try {
      out.push({ label, ...(await loadNordholt(kind)) });
    } catch (err) {
      skipped.push({ label, reason: err?.message || String(err) });
    }
  }
  try {
    out.push({ label: "supersession", ...(await loadSupersessionFixture()) });
  } catch (err) {
    skipped.push({ label: "supersession", reason: err?.message || String(err) });
  }

  const fixtures = await loadAllFixtures();
  const uncachedExtras = [];
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    const placeholder = !draft.trim() || draft.trim() === "PLACEHOLDER";
    const label = Number.isFinite(n) ? `F${String(n).padStart(2, "0")}` : String(fx.data.id);
    if (!Number.isFinite(n)) {
      skipped.push({ label, reason: "non-numeric fixture id" });
      continue;
    }
    if (n < 1 || n > 23) {
      uncachedExtras.push({
        label,
        file: path.basename(fx.filePath),
        reason: "not in the cached shadow-gate baseline",
      });
      continue;
    }
    if (placeholder) {
      skipped.push({ label, reason: "PLACEHOLDER draft" });
      continue;
    }
    try {
      const sources = await loadPipelineSources(fx.data.sources || []);
      if (!sources.length) {
        skipped.push({ label, reason: "no sources" });
        continue;
      }
      out.push({ label, draft, sources });
    } catch (err) {
      skipped.push({ label, reason: err?.message || String(err) });
    }
  }
  return { cases: out, skipped, uncachedExtras };
}

function baselineStatements(baselineRaw, label, draft, sources) {
  const row = baselineRaw?.cases?.[label];
  if (!row) return null;
  if (row.caseFingerprint !== caseFingerprint(label, draft, sources)) return null;
  if (!Array.isArray(row.statements) || row.statements.length === 0) return null;
  return row.statements;
}

function pairKey(fixtureId, statementIndex, sourceIndex) {
  return `${fixtureId}|${statementIndex}|${sourceIndex}`;
}

function analyzeArms(cases, offByLabel, onByLabel) {
  const pairDeltas = [];
  const cardDeltas = [];
  const validatedSpans = [];
  let pairCount = 0;
  let eligible = 0;
  let secondCalls = 0;
  let returned = 0;
  let validated = 0;
  let rejected = 0;
  let whole = 0;
  let multi = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let cachedElicits = 0;
  let liveElicits = 0;
  let elicitOnConfirmed = 0;
  let elicitOnNoSupport = 0;

  for (const caseRow of cases) {
    const offRun = offByLabel.get(caseRow.label);
    const onRun = onByLabel.get(caseRow.label);
    if (!offRun || !onRun) continue;
    const asOf = buildAsOfBySourceIndex(caseRow.sources);
    const statements = onRun.statements;
    const offByPair = new Map();
    for (const m of offRun.matches || []) {
      offByPair.set(pairKey(caseRow.label, m.statementIndex, m.sourceIndex), m);
    }
    for (const m of onRun.matches || []) {
      pairCount += 1;
      const off = offByPair.get(pairKey(caseRow.label, m.statementIndex, m.sourceIndex));
      const offClass = off?.classification ?? null;
      const onClass = m?.classification ?? null;
      if (offClass !== onClass) {
        pairDeltas.push({
          fixtureId: caseRow.label,
          statementIndex: m.statementIndex,
          sourceIndex: m.sourceIndex,
          statementText:
            statements.find((s) => Number(s.index) === Number(m.statementIndex))?.text ??
            statements[m.statementIndex]?.text ??
            "",
          classificationOff: offClass,
          classificationOn: onClass,
        });
      }
      if (isSpanElicitEligible(onClass)) eligible += 1;
      if (m.spanElicitAttempted === true) {
        secondCalls += 1;
        if (onClass === "confirmed") elicitOnConfirmed += 1;
        if (onClass === "no_support") elicitOnNoSupport += 1;
        if (m.spanElicitCached === true) cachedElicits += 1;
        else liveElicits += 1;
        inputTokens += Number(m.spanElicitUsage?.inputTokens) || 0;
        outputTokens += Number(m.spanElicitUsage?.outputTokens) || 0;
        costUsd += Number(m.spanElicitCostUsd) || 0;
      }
      const raw = m.unsupportedSpanRaw;
      if (typeof raw === "string" && raw.length > 0) returned += 1;
      if (m.unsupportedSpanRejected === true) rejected += 1;
      if (typeof m.unsupportedSpan === "string" && m.unsupportedSpan.length > 0) {
        validated += 1;
        if (m.unsupportedSpanWhole === true) whole += 1;
        if (m.unsupportedSpanMultiOccurrence === true) multi += 1;
        validatedSpans.push({
          fixtureId: caseRow.label,
          statementIndex: m.statementIndex,
          sourceIndex: m.sourceIndex,
          sourceLabel: m.sourceLabel ?? null,
          classification: onClass,
          text: m.unsupportedSpan,
          start: m.unsupportedSpanStart ?? null,
          end: m.unsupportedSpanEnd ?? null,
          whole: m.unsupportedSpanWhole === true,
          multiOccurrence: m.unsupportedSpanMultiOccurrence === true,
          statementText:
            statements.find((s) => Number(s.index) === Number(m.statementIndex))?.text ??
            statements[m.statementIndex]?.text ??
            "",
        });
      }
    }
    for (let ord = 0; ord < statements.length; ord += 1) {
      const stmt = statements[ord];
      const offCard = cardFromMatches(stmt, offRun.matches, asOf);
      const onCard = cardFromMatches(stmt, onRun.matches, asOf);
      if (offCard.stage3 !== onCard.stage3) {
        cardDeltas.push({
          fixtureId: caseRow.label,
          statementIndex: onCard.statementIndex,
          statementText: onCard.statementText,
          classificationOff: offCard.stage3,
          classificationOn: onCard.stage3,
          verdictOff: offCard.verdict,
          verdictOn: onCard.verdict,
        });
      }
    }
  }

  return {
    pairCount,
    eligible,
    secondCalls,
    returned,
    validated,
    rejected,
    whole,
    multi,
    inputTokens,
    outputTokens,
    costUsd,
    cachedElicits,
    liveElicits,
    elicitOnConfirmed,
    elicitOnNoSupport,
    pairDeltas,
    cardDeltas,
    validatedSpans,
  };
}

async function runStage2(cases, stage2SpanEnabled, label) {
  console.log(`Stage 2 ${label}: ${cases.length} cases, spanEnabled=${stage2SpanEnabled}`);
  resetStage2UnsupportedSpanStats();
  beginCacheRun({ recordEvents: true });
  const byLabel = new Map();
  for (const caseRow of cases) {
    const { matches } = await matchAllSources({
      statements: caseRow.statements,
      sources: caseRow.sources,
      stage2SpanEnabled,
    });
    byLabel.set(caseRow.label, {
      statements: caseRow.statements,
      matches,
    });
    console.log(`  ${caseRow.label}: ${caseRow.statements.length} statements, ${matches.length} pairs`);
  }
  const cache = formatCacheStats(endCacheRun());
  return {
    byLabel,
    cache,
    rejections: getStage2UnsupportedSpanRejectionCount(),
    whole: getStage2UnsupportedSpanWholeCount(),
    multi: getStage2UnsupportedSpanMultiOccurrenceCount(),
  };
}

async function main() {
  const diskPath = llmCacheDiskPathFromEnv() || DEFAULT_LLM_CACHE_DISK_PATH;
  const diskExisted = Boolean(diskPath && existsSync(diskPath));
  const diskBytes = diskExisted ? (await import("node:fs")).statSync(diskPath).size : null;
  const store = getLlmCacheStore();
  const storeEntriesAtStart = store?.size?.() ?? "unknown";

  let baselineRaw = null;
  try {
    baselineRaw = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch (err) {
    console.error(`STOP: cannot read ${BASELINE_PATH}: ${err?.message || err}`);
    process.exit(1);
  }
  const baselineLabels = baselineRaw?.cases && typeof baselineRaw.cases === "object" ? Object.keys(baselineRaw.cases) : [];

  console.log("# B88 two-step span elicit gate");
  console.log("");
  console.log(`QC_LLM_CACHE_DISK=${diskPath || "(unset)"}`);
  console.log(`diskFileExisted=${diskExisted ? "yes" : "no"} bytes=${diskBytes ?? "n/a"}`);
  console.log(`storeKind=${store?.kind || "unknown"} entries=${storeEntriesAtStart}`);
  console.log(`baseline path=${BASELINE_PATH}`);
  console.log(`baseline labels=${baselineLabels.join(", ") || "(none)"}`);
  console.log(
    "Baseline fingerprint is not used: stage2-match-sources.mjs is in the Stage 1/2 fingerprint, so createBaselineStore({ refresh: false }).loaded would be false. Statements are read from .baseline.json directly. Stage 1 is not re-billed."
  );

  if (!isLlmCacheEnabled()) {
    console.error("STOP: QC_LLM_CACHE is off. The OFF arm must be a cached replay.");
    process.exit(1);
  }
  if (!diskExisted) {
    console.error("STOP: disk cache file is missing. Do not run an uncached full corpus pass.");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY is required even on a cache hit (provider check inside Stage 2).");
    process.exit(1);
  }
  if (String(process.env.QC_STAGE2_SPAN || "").trim()) {
    console.error("STOP: QC_STAGE2_SPAN is set in the environment. This gate passes the option per arm instead.");
    process.exit(1);
  }

  const { cases: mainCases, skipped, uncachedExtras } = await loadMainCorpus();
  const missingBaseline = mainCases.filter((c) => !baselineStatements(baselineRaw, c.label, c.draft, c.sources));
  if (skipped.length > 0) {
    console.log(`load skips: ${skipped.map((s) => `${s.label} (${s.reason})`).join("; ")}`);
  }
  if (missingBaseline.length > 0) {
    console.error(`STOP: baseline does not cover: ${missingBaseline.map((c) => c.label).join(", ")}`);
    process.exit(1);
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    const first = String(args[0] || "");
    if (first.startsWith("[stage2]") || first.startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const mainPrepared = mainCases.map((c) => ({
    ...c,
    statements: baselineStatements(baselineRaw, c.label, c.draft, c.sources),
  }));

  console.log(`main corpus: ${mainPrepared.map((c) => c.label).join(", ")}`);
  const expectedPairs = mainPrepared.reduce((n, c) => n + c.statements.length * (c.sources.length || 0), 0);
  console.log(`main corpus statement x source pairs: ${expectedPairs}`);

  const offMain = await runStage2(mainPrepared, false, "OFF");
  const onMain = await runStage2(mainPrepared, true, "ON");
  console.debug = origDebug;

  const analysis = analyzeArms(mainPrepared, offMain.byLabel, onMain.byLabel);
  const offSplit = offMain.cache.split;
  const onSplit = onMain.cache.split;

  const cacheOk =
    offSplit.primaryMisses === 0 &&
    offSplit.elicitHits + offSplit.elicitMisses === 0 &&
    onSplit.primaryMisses === 0 &&
    onSplit.primaryHits > 0;
  const zeroDeltas = analysis.pairDeltas.length === 0 && analysis.cardDeltas.length === 0;
  const noIneligibleCalls = analysis.elicitOnConfirmed === 0 && analysis.elicitOnNoSupport === 0;
  const passed = cacheOk && zeroDeltas && noIneligibleCalls;

  const lines = [];
  lines.push("# B88 two-step span elicit gate");
  lines.push("");
  lines.push(passed ? "PASS: zero verdict deltas. Primary cache still hits with the flag ON." : "FAIL.");
  lines.push("");
  lines.push("## Pass condition");
  lines.push("");
  lines.push(`- Pair-level classification deltas: ${analysis.pairDeltas.length} (must be 0)`);
  lines.push(`- Card-level verdict deltas: ${analysis.cardDeltas.length} (must be 0)`);
  lines.push(
    `- OFF primary misses: ${offSplit.primaryMisses} (must be 0; OFF must be a cached replay)`
  );
  lines.push(
    `- ON primary misses: ${onSplit.primaryMisses} (must be 0; existing disk-cache entries must still hit)`
  );
  lines.push(`- ON primary hits: ${onSplit.primaryHits}`);
  lines.push(`- Second calls on confirmed: ${analysis.elicitOnConfirmed} (must be 0)`);
  lines.push(`- Second calls on no_support: ${analysis.elicitOnNoSupport} (must be 0)`);
  lines.push("");
  if (analysis.pairDeltas.length > 0) {
    lines.push("## Pair deltas (failure)");
    lines.push("");
    for (const d of analysis.pairDeltas) {
      lines.push(
        `- ${d.fixtureId} statement ${d.statementIndex} source ${d.sourceIndex}: ${d.classificationOff} -> ${d.classificationOn}`
      );
      lines.push(`  ${JSON.stringify(d.statementText)}`);
    }
    lines.push("");
  }
  if (analysis.cardDeltas.length > 0) {
    lines.push("## Card deltas (failure)");
    lines.push("");
    for (const d of analysis.cardDeltas) {
      lines.push(
        `- ${d.fixtureId} statement ${d.statementIndex}: ${d.classificationOff} -> ${d.classificationOn} (${d.verdictOff} -> ${d.verdictOn})`
      );
      lines.push(`  ${JSON.stringify(d.statementText)}`);
    }
    lines.push("");
  }

  lines.push("## Cache");
  lines.push("");
  lines.push(
    `The primary Stage 2 system prompt is always stage2_v4.md. promptHash does not include the elicit prompt, so existing disk-cache entries still hit when the flag is ON. Observed ON primary hits ${onSplit.primaryHits}, misses ${onSplit.primaryMisses} (OFF was hits ${offSplit.primaryHits}, misses ${offSplit.primaryMisses}).`
  );
  lines.push("");
  lines.push(
    `- OFF: hits ${offMain.cache.hits}, misses ${offMain.cache.misses} (stage2 hits ${offMain.cache.stage2Hits}, misses ${offMain.cache.stage2Misses}); primary ${offSplit.primaryHits}/${offSplit.primaryMisses} elicit ${offSplit.elicitHits}/${offSplit.elicitMisses}`
  );
  lines.push(
    `- ON: hits ${onMain.cache.hits}, misses ${onMain.cache.misses} (stage2 hits ${onMain.cache.stage2Hits}, misses ${onMain.cache.stage2Misses}); primary ${onSplit.primaryHits}/${onSplit.primaryMisses} elicit ${onSplit.elicitHits}/${onSplit.elicitMisses}`
  );
  if (offSplit.primaryHits === 0 && offSplit.primaryMisses === 0) {
    lines.push("- OFF arm cache counts are vacuous (no lookups).");
  }
  if (analysis.secondCalls === 0) {
    lines.push("- Second-call count is vacuous (no eligible pairs).");
  }
  lines.push("");
  lines.push("## Second calls and cost");
  lines.push("");
  lines.push(`- Eligible pairs (partially_confirmed or conflicting): ${analysis.eligible}`);
  lines.push(`- Second calls made: ${analysis.secondCalls}`);
  lines.push(`- Of those, live this run: ${analysis.liveElicits}; already cached: ${analysis.cachedElicits}`);
  lines.push(`- Elicit tokens: input ${analysis.inputTokens}, output ${analysis.outputTokens}, total ${analysis.inputTokens + analysis.outputTokens}`);
  lines.push(`- Incremental cost of a full corpus pass: ${money(analysis.costUsd)}`);
  if (analysis.cachedElicits > 0 && analysis.liveElicits === 0) {
    lines.push(
      "- That dollar figure is the stored cost of the elicit calls (this run was a cache replay of the second calls). This-run incremental spend is $0.0000."
    );
  }
  if (analysis.eligible === 0) {
    lines.push("- Eligible-pair counts are vacuous (denominator 0).");
  }
  lines.push("");
  lines.push("## Span return and validation");
  lines.push("");
  lines.push(`- Span return rate on eligible pairs: ${formatPct(analysis.returned, analysis.eligible)}`);
  lines.push(`- Returned: ${analysis.returned}`);
  lines.push(`- Validated: ${analysis.validated}`);
  lines.push(`- Rejected: ${analysis.rejected}`);
  lines.push(`- WHOLE: ${analysis.whole}`);
  lines.push(`- Multi-occurrence: ${analysis.multi}`);
  lines.push(
    `- Module counters after ON arm: rejected ${onMain.rejections}, WHOLE ${onMain.whole}, multi ${onMain.multi}`
  );
  if (analysis.returned === 0) {
    lines.push("- Return/validation rates are vacuous: no spans returned.");
  }
  lines.push("");
  lines.push("## Corpus");
  lines.push("");
  lines.push(
    "Main set is the evidence-span-population corpus: Nordholt clean/dirty, supersession, F01 to F23. Statements come from `.baseline.json` (fingerprint ignored because this commit edits `stage2-match-sources.mjs`)."
  );
  lines.push("");
  lines.push(`Main cases: ${mainPrepared.map((c) => c.label).join(", ")}`);
  if (uncachedExtras.length > 0) {
    lines.push("");
    lines.push("Fixtures present on disk but not in the main cached set:");
    for (const row of uncachedExtras) {
      lines.push(`- ${row.label} (${row.file}): ${row.reason}`);
    }
  }
  if (skipped.length > 0) {
    lines.push("");
    lines.push("Load skips:");
    for (const row of skipped) {
      lines.push(`- ${row.label}: ${row.reason}`);
    }
  }
  lines.push("");
  lines.push("## Disk / store");
  lines.push("");
  lines.push(`- QC_LLM_CACHE_DISK: \`${diskPath || "(unset)"}\``);
  lines.push(`- disk file existed before run: ${diskExisted ? "yes" : "no"}`);
  lines.push(`- disk file bytes: ${diskBytes ?? "n/a"}`);
  lines.push(`- store kind: ${store?.kind || "unknown"}`);
  lines.push(`- store entries at start: ${storeEntriesAtStart}`);
  lines.push(`- baseline path: \`${BASELINE_PATH}\``);
  lines.push(`- baseline case labels: ${baselineLabels.join(", ")}`);
  lines.push("");
  lines.push(`Wrote ${analysis.validatedSpans.length} validated spans to \`scripts/diagnostic/span-two-step/rows.json\`.`);
  lines.push("");

  const report = `${lines.join("\n").trim()}\n`;
  const rows = {
    pass: passed,
    pairDeltas: analysis.pairDeltas,
    cardDeltas: analysis.cardDeltas,
    summary: {
      pairCount: analysis.pairCount,
      eligible: analysis.eligible,
      secondCalls: analysis.secondCalls,
      returned: analysis.returned,
      validated: analysis.validated,
      rejected: analysis.rejected,
      whole: analysis.whole,
      multiOccurrence: analysis.multi,
      inputTokens: analysis.inputTokens,
      outputTokens: analysis.outputTokens,
      costUsd: analysis.costUsd,
      incrementalCostUsd: analysis.costUsd,
      liveElicits: analysis.liveElicits,
      cachedElicits: analysis.cachedElicits,
      onPrimaryHits: onSplit.primaryHits,
      onPrimaryMisses: onSplit.primaryMisses,
      offPrimaryHits: offSplit.primaryHits,
      offPrimaryMisses: offSplit.primaryMisses,
    },
    validatedSpans: analysis.validatedSpans,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(ROWS_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await writeFile(REPORT_PATH, report, "utf8");
  console.log("");
  console.log(report);
  console.log(`wrote ${ROWS_PATH}`);
  console.log(`wrote ${REPORT_PATH}`);
  if (!passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
