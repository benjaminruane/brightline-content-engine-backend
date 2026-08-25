#!/usr/bin/env node
/**
 * Coverage-union promotion gate.
 *
 * Both arms in one process. Stage 2 with span elicitation ON, from cache.
 * OFF arm: current aggregate verdict (no coverage promotion).
 * ON arm: same matches, QC_MULTISOURCE_COVERAGE promotion applied in memory.
 *
 * PASS: every changed card is only supported_partial -> supported_full.
 * ZERO to/from conflicting. ZERO to/from not_supported. ZERO away from
 * supported_full.
 *
 * Usage:
 *   node scripts/diagnostic/coverage-union/gate.mjs
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
const GATE_ROWS_PATH = path.join(OUT_DIR, "gate-rows.json");
const GATE_REPORT_PATH = path.join(OUT_DIR, "gate-report.md");

const { matchAllSources } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { computeCoverageUnion, shouldPromoteCoverageUnion } = await import(
  "../../../lib/qc/coverage-union.mjs"
);
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

function isAllowedTransition(offVerdict, onVerdict) {
  if (offVerdict === onVerdict) return true;
  return offVerdict === "supported_partial" && onVerdict === "supported_full";
}

async function main() {
  const diskPath = llmCacheDiskPathFromEnv() || DEFAULT_LLM_CACHE_DISK_PATH;
  const diskExisted = Boolean(diskPath && existsSync(diskPath));
  const store = getLlmCacheStore();

  let baselineRaw = null;
  try {
    baselineRaw = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  } catch (err) {
    console.error(`STOP: cannot read ${BASELINE_PATH}: ${err?.message || err}`);
    process.exit(1);
  }

  if (!isLlmCacheEnabled()) {
    console.error("STOP: QC_LLM_CACHE is off. The OFF arm must be a cached replay.");
    process.exit(1);
  }
  if (!diskExisted) {
    console.error("STOP: disk cache file is missing.");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY is required even on a cache hit.");
    process.exit(1);
  }
  if (String(process.env.QC_STAGE2_SPAN || "").trim()) {
    console.error("STOP: QC_STAGE2_SPAN is set in the environment. This gate passes the option.");
    process.exit(1);
  }
  if (String(process.env.QC_MULTISOURCE_COVERAGE || "").trim()) {
    console.error(
      "STOP: QC_MULTISOURCE_COVERAGE is set in the environment. This gate applies promotion in memory."
    );
    process.exit(1);
  }

  const { cases: mainCases, skipped, uncachedExtras } = await loadMainCorpus();
  const missingBaseline = mainCases.filter((c) => !baselineStatements(baselineRaw, c.label, c.draft, c.sources));
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

  const prepared = mainCases.map((c) => ({
    ...c,
    statements: baselineStatements(baselineRaw, c.label, c.draft, c.sources),
  }));

  console.log(`coverage-union gate: ${prepared.length} cases, spanEnabled=true`);
  beginCacheRun({ recordEvents: true });
  const byLabel = new Map();
  for (const caseRow of prepared) {
    const { matches } = await matchAllSources({
      statements: caseRow.statements,
      sources: caseRow.sources,
      stage2SpanEnabled: true,
    });
    byLabel.set(caseRow.label, { statements: caseRow.statements, matches });
    console.log(`  ${caseRow.label}: ${caseRow.statements.length} statements, ${matches.length} pairs`);
  }
  const cache = endCacheRun();

  const rows = [];
  const promoted = [];
  const illegal = [];
  let toFromConflicting = 0;
  let toFromNotSupported = 0;
  let awayFromFull = 0;

  for (const caseRow of prepared) {
    const run = byLabel.get(caseRow.label);
    const asOf = buildAsOfBySourceIndex(caseRow.sources);
    for (const stmt of run.statements) {
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : 0;
      const statementText = typeof stmt?.text === "string" ? stmt.text : "";
      const sourceMatches = matchesForStatement(run.matches, statementIndex);
      const { agg } = applySupersession({
        statementText,
        sourceMatches,
        asOfBySourceIndex: asOf,
        today: TODAY,
      });
      const coverage = computeCoverageUnion({ statementText, matches: sourceMatches });
      const offVerdict = mapCardVerdict(agg.verdict);
      const promote = shouldPromoteCoverageUnion({
        verdict: agg.verdict,
        coverage,
      });
      const onStage3 = promote ? "confirmed" : agg.verdict;
      const onVerdict = mapCardVerdict(onStage3);
      const changed = offVerdict !== onVerdict;
      const allowed = isAllowedTransition(offVerdict, onVerdict);
      const row = {
        fixtureId: caseRow.label,
        statementIndex,
        statementText,
        offVerdict,
        onVerdict,
        stage3Off: agg.verdict,
        promoted: promote === true,
        changed,
        allowed,
        classifications: coverage.classifications,
        unsupportedSpans: coverage.unsupportedSpans,
        union: coverage.union,
        coverageComplete: coverage.coverageComplete,
        hasConflicting: coverage.hasConflicting,
        contributingSourceIndices: coverage.contributingSourceIndices,
      };
      rows.push(row);
      if (changed && promote) promoted.push(row);
      if (!allowed) illegal.push(row);
      if (changed && (offVerdict === "conflicting" || onVerdict === "conflicting")) {
        toFromConflicting += 1;
      }
      if (changed && (offVerdict === "not_supported" || onVerdict === "not_supported")) {
        toFromNotSupported += 1;
      }
      if (changed && offVerdict === "supported_full") awayFromFull += 1;
    }
  }
  console.debug = origDebug;

  const cacheMisses = cache?.byStage?.stage2?.misses || 0;
  const cacheOk = cacheMisses === 0;
  const passed =
    cacheOk && illegal.length === 0 && toFromConflicting === 0 && toFromNotSupported === 0 && awayFromFull === 0;

  const lines = [];
  lines.push("# Multi-source coverage union gate");
  lines.push("");
  lines.push(passed ? "PASS." : "FAIL.");
  lines.push("");
  lines.push("Span elicitation ON on both arms. Coverage flag OFF vs ON, applied in memory.");
  lines.push("OFF is a cached Stage 2 replay. No new LLM calls when elicit keys are warm.");
  lines.push("");
  lines.push("## Pass condition");
  lines.push("");
  lines.push(`- Changed cards: ${rows.filter((r) => r.changed).length}`);
  lines.push(`- Illegal transitions: ${illegal.length} (must be 0)`);
  lines.push(`- To or from conflicting: ${toFromConflicting} (must be 0)`);
  lines.push(`- To or from not_supported: ${toFromNotSupported} (must be 0)`);
  lines.push(`- Away from supported_full: ${awayFromFull} (must be 0)`);
  lines.push(`- Stage 2 cache misses: ${cacheMisses} (must be 0)`);
  lines.push("");
  if (illegal.length > 0) {
    lines.push("## Illegal transitions (failure)");
    lines.push("");
    for (const r of illegal) {
      lines.push(`- ${r.fixtureId} statement ${r.statementIndex}: ${r.offVerdict} -> ${r.onVerdict}`);
      lines.push(`  ${JSON.stringify(r.statementText)}`);
    }
    lines.push("");
  }
  lines.push("## Promoted cards");
  lines.push("");
  lines.push(`Count: ${promoted.length}`);
  if (promoted.length === 0) {
    lines.push("None.");
  }
  for (const r of promoted) {
    lines.push(`- ${r.fixtureId} statement ${r.statementIndex}: ${r.offVerdict} -> ${r.onVerdict}`);
    lines.push(`  statement: ${JSON.stringify(r.statementText)}`);
    lines.push(`  spans: ${JSON.stringify(r.unsupportedSpans)}`);
    lines.push(`  union: ${JSON.stringify(r.union)}`);
    lines.push(`  contributingSourceIndices: ${JSON.stringify(r.contributingSourceIndices)}`);
  }
  lines.push("");
  lines.push("## Cache");
  lines.push("");
  lines.push(
    `- Stage 2 hits ${cache?.byStage?.stage2?.hits ?? 0}, misses ${cacheMisses}; store kind ${store?.kind || "unknown"}`
  );
  if (cacheMisses === 0) {
    lines.push("- Pure cache replay (misses 0). Incremental spend $0.0000.");
  } else {
    lines.push("- This run was not a pure cache replay.");
  }
  lines.push("");
  if (skipped.length > 0) {
    lines.push("## Load skips");
    lines.push("");
    for (const row of skipped) lines.push(`- ${row.label}: ${row.reason}`);
    lines.push("");
  }
  if (uncachedExtras.length > 0) {
    lines.push("## Fixtures not in the cached set");
    lines.push("");
    for (const row of uncachedExtras) lines.push(`- ${row.label} (${row.file}): ${row.reason}`);
    lines.push("");
  }

  const report = `${lines.join("\n").trim()}\n`;
  const payload = {
    pass: passed,
    summary: {
      cards: rows.length,
      changed: rows.filter((r) => r.changed).length,
      promoted: promoted.length,
      illegal: illegal.length,
      toFromConflicting,
      toFromNotSupported,
      awayFromFull,
      cacheHits: cache?.byStage?.stage2?.hits ?? 0,
      cacheMisses,
    },
    promoted,
    illegal,
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(GATE_ROWS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(GATE_REPORT_PATH, report, "utf8");
  console.log("");
  console.log(report);
  console.log(`wrote ${GATE_ROWS_PATH}`);
  console.log(`wrote ${GATE_REPORT_PATH}`);
  if (!passed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
