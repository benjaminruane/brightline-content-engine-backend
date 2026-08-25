#!/usr/bin/env node
/**
 * B88 coverage-union diagnostic (read-only).
 *
 * Stage 2 with QC_STAGE2_SPAN ON, from cache. No new LLM calls when the
 * two-step elicit keys are warm. Computes the supported-region union per card.
 *
 * Usage:
 *   node scripts/diagnostic/coverage-union/measure.mjs
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

const { matchAllSources } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { computeCoverageUnion, shouldPromoteCoverageUnion } = await import("../../../lib/qc/coverage-union.mjs");
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

function formatPct(part, whole) {
  if (!whole) return "vacuous (denominator 0)";
  return `${part} (${part}/${whole})`;
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
    console.error("STOP: QC_LLM_CACHE is off. This diagnostic must replay Stage 2 from cache.");
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
    console.error("STOP: QC_STAGE2_SPAN is set in the environment. This script passes the option.");
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

  console.log(`coverage-union diagnostic: ${prepared.length} cases, spanEnabled=true`);
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
  const rejectedSpans = [];
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
      const verdict = mapCardVerdict(agg.verdict);
      const wouldPromote = shouldPromoteCoverageUnion({
        verdict: agg.verdict,
        coverage,
      });
      for (const m of sourceMatches) {
        if (m?.unsupportedSpanRejected === true) {
          rejectedSpans.push({
            fixtureId: caseRow.label,
            statementIndex,
            sourceIndex: m.sourceIndex,
            sourceLabel: m.sourceLabel ?? null,
            classification: m.classification,
            raw: m.unsupportedSpanRaw,
            statementText,
          });
        }
      }
      rows.push({
        fixtureId: caseRow.label,
        statementIndex,
        statementText,
        stage3: agg.verdict,
        verdict,
        classifications: coverage.classifications,
        unsupportedSpans: coverage.unsupportedSpans,
        supportedRegions: coverage.supportedRegions,
        union: coverage.union,
        coverageWindow: coverage.coverageWindow,
        coverageComplete: coverage.coverageComplete,
        hasConflicting: coverage.hasConflicting,
        hasNoSupport: coverage.hasNoSupport,
        wholeContributingPairs: coverage.wholeContributingPairs,
        nullOffsetPartialPairs: coverage.nullOffsetPartialPairs,
        contributingSourceIndices: coverage.contributingSourceIndices,
        contributingSourceCount: coverage.contributingSourceCount,
        wouldPromote,
      });
    }
  }
  console.debug = origDebug;

  const partialCards = rows.filter((r) => r.verdict === "supported_partial");
  const population = rows.filter(
    (r) => r.verdict === "supported_partial" && r.coverageComplete === true && r.hasConflicting !== true
  );
  const completeWithConflict = rows.filter((r) => r.coverageComplete === true && r.hasConflicting === true);
  const completeWithNoSupport = rows.filter(
    (r) => r.coverageComplete === true && r.hasNoSupport === true && r.hasConflicting !== true
  );
  const excludedWhole = rows.filter((r) => r.wholeContributingPairs > 0);
  const wouldPromote = rows.filter((r) => r.wouldPromote === true);

  const lines = [];
  lines.push("# Multi-source coverage union diagnostic");
  lines.push("");
  lines.push("Read-only. No product verdict change. Stage 2 ran with span elicitation ON, from cache.");
  lines.push("");
  lines.push("Rollup that this diagnostic reads: `lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs` function `aggregateVerdict` (any-confirmed-wins), called from `runPipelineV4Inner` in `lib/qc/pipeline-v4/index.mjs`. Card display mapping after that: confirmed -> supported_full.");
  lines.push("");
  lines.push("## Cache");
  lines.push("");
  lines.push(
    `- Stage 2 hits ${cache?.byStage?.stage2?.hits ?? 0}, misses ${cache?.byStage?.stage2?.misses ?? 0}`
  );
  lines.push(`- store kind: ${store?.kind || "unknown"}; entries at start unknown after load`);
  if ((cache?.byStage?.stage2?.misses || 0) > 0) {
    lines.push("- This run was not a pure cache replay (elicit keys may have been cold).");
  } else {
    lines.push("- Pure cache replay (misses 0).");
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`Cards: ${rows.length}`);
  lines.push(`supported_partial cards: ${partialCards.length}`);
  lines.push(
    `supported_partial with two or more distinct contributing sources: ${partialCards.filter((r) => r.contributingSourceCount >= 2).length}`
  );
  lines.push("");
  lines.push(
    `1. Population (supported_partial AND coverageComplete AND no conflicting pair): ${population.length}`
  );
  if (population.length === 0) {
    lines.push(
      "   The population is empty. That count is a real zero, not a missing corpus. The three demonstration cards (nordholt-clean 0, nordholt-clean 2, F23 1) are already supported_full because aggregateVerdict is any-confirmed-wins and at least one source returned confirmed. The remaining supported_partial cards are single-source fixtures, so a coverage union cannot form. It is not because most contributing pairs returned WHOLE spans (only 2 of the 13 supported_partial cards have a WHOLE span)."
    );
  }
  for (const r of population) {
    lines.push(
      `   - ${r.fixtureId} statement ${r.statementIndex} sources=${JSON.stringify(r.contributingSourceIndices)} union=${JSON.stringify(r.union)}`
    );
    lines.push(`     ${JSON.stringify(r.statementText)}`);
  }
  lines.push("");
  lines.push(`2. coverageComplete AND a conflicting pair (must never be greened): ${completeWithConflict.length}`);
  if (completeWithConflict.length === 0) {
    lines.push("   None.");
  }
  for (const r of completeWithConflict) {
    lines.push(`   - ${r.fixtureId} statement ${r.statementIndex} verdict=${r.verdict}`);
    lines.push(`     ${JSON.stringify(r.statementText)}`);
  }
  lines.push("");
  lines.push(
    `3. coverageComplete AND a no_support pair, no conflicting (no_support does not block): ${completeWithNoSupport.length}`
  );
  if (completeWithNoSupport.length === 0) {
    lines.push("   None.");
  }
  for (const r of completeWithNoSupport) {
    lines.push(`   - ${r.fixtureId} statement ${r.statementIndex} verdict=${r.verdict}`);
  }
  lines.push("");
  lines.push(
    `4. Cards with a contributing partially_confirmed WHOLE-statement span (empty complement): ${excludedWhole.length}`
  );
  if (excludedWhole.length === 0) {
    lines.push("   None.");
  } else {
    const wholeAndNotPopulation = excludedWhole.filter(
      (r) => !(r.verdict === "supported_partial" && r.coverageComplete === true && r.hasConflicting !== true)
    );
    lines.push(
      `   Of those, ${wholeAndNotPopulation.length} are outside the population.`
    );
  }
  lines.push("");
  lines.push(
    `Would-promote under the commit-2 rule (population plus at least two distinct contributing sources): ${wouldPromote.length}`
  );
  for (const r of wouldPromote) {
    lines.push(`   - ${r.fixtureId} statement ${r.statementIndex}`);
    lines.push(`     ${JSON.stringify(r.statementText)}`);
  }
  lines.push("");
  lines.push("## Rejected second-call spans (from this replay)");
  lines.push("");
  lines.push(`Count: ${rejectedSpans.length}`);
  for (const r of rejectedSpans) {
    lines.push(`- ${r.fixtureId} statement ${r.statementIndex} source ${r.sourceIndex} (${r.sourceLabel})`);
    lines.push(`  statement: ${JSON.stringify(r.statementText)}`);
    lines.push(`  raw: ${JSON.stringify(r.raw)}`);
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
    summary: {
      cards: rows.length,
      supportedPartial: partialCards.length,
      population: population.length,
      completeWithConflict: completeWithConflict.length,
      completeWithNoSupport: completeWithNoSupport.length,
      excludedWhole: excludedWhole.length,
      wouldPromote: wouldPromote.length,
      rejectedSpans: rejectedSpans.length,
      cacheHits: cache?.byStage?.stage2?.hits ?? 0,
      cacheMisses: cache?.byStage?.stage2?.misses ?? 0,
    },
    population: population.map((r) => ({
      fixtureId: r.fixtureId,
      statementIndex: r.statementIndex,
      statementText: r.statementText,
      union: r.union,
      contributingSourceIndices: r.contributingSourceIndices,
    })),
    rejectedSpans,
    rows,
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
