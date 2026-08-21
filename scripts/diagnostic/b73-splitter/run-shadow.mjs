#!/usr/bin/env node
/**
 * B73 gate: splitter candidate text (old HEAD vs working tree) plus
 * Stage 1 LLM / Stage 2 cache replay (statement texts and verdicts).
 *
 * Usage:
 *   node scripts/diagnostic/b73-splitter/run-shadow.mjs
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { readFile } from "node:fs/promises";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-21T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const B67_DIR = path.join(DIAG_ROOT, "b67-probe");
const B72_DIR = path.join(DIAG_ROOT, "b72-probe");

const { splitDraftIntoCandidatesV2: splitNew } = await import("../../../lib/extract-statements.mjs");
const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources, hasEgregiousMagnitudeGap } = await import(
  "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { beginCacheRun, endCacheRun, logCacheRunSummary, getLlmCacheStore } = await import(
  "../../../lib/qc/llm-cache.mjs"
);
const { createTraceId, startTrace, flushObservability } = await import("../../../lib/observability.js");

const tmp = await mkdtemp(path.join(os.tmpdir(), "b73-old-"));
const oldPath = path.join(tmp, "extract-statements.mjs");
const oldSrc = execFileSync("git", ["show", "HEAD:lib/extract-statements.mjs"], {
  cwd: REPO_ROOT,
  encoding: "utf8",
});
await writeFile(oldPath, oldSrc);
const { splitDraftIntoCandidatesV2: splitOld } = await import(pathToFileURL(oldPath).href);

function trunc(s, n = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

function withSupersession(statementText, sourceMatches, asOfBySourceIndex, today) {
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
      m.classification = "superseded";
    }
    agg = aggregateVerdict({ statementMatches: matches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return agg;
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
    sources.push({ text: await readFile(path.join(NORDHOLT_DIR, name), "utf8"), label });
  }
  return { label: kind === "dirty" ? "nordholt-dirty" : "nordholt-clean", draft, sources };
}

async function loadCorpus() {
  const out = [];
  for (const kind of ["clean", "dirty"]) out.push(await loadNordholt(kind));
  const b67Draft = await readFile(path.join(B67_DIR, "draft_dirty.txt"), "utf8");
  const b67Sources = [];
  for (const [name, label] of [
    ["source_ic_memo.txt", "IC memo"],
    ["source_press_release.txt", "press release"],
    ["source_fact_sheet.txt", "fact sheet"],
    ["source_lp_update.txt", "LP update"],
  ]) {
    b67Sources.push({ text: await readFile(path.join(B67_DIR, name), "utf8"), label });
  }
  out.push({ label: "b67-probe", draft: b67Draft, sources: b67Sources });
  const superDraft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  const superSources = [];
  for (const name of [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ]) {
    superSources.push({
      label: name.replace(/\.txt$/, ""),
      text: await readFile(path.join(SUPERSESSION_DIR, name), "utf8"),
    });
  }
  out.push({ label: "supersession", draft: superDraft, sources: superSources });
  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") continue;
    const sources = await loadPipelineSources(fx.data.sources || []);
    if (!sources.length) continue;
    out.push({ label: `F${String(fx.data.id).padStart(2, "0")}`, draft, sources });
  }
  return out;
}

const HEADCOUNT_KEYS = [
  ["nordholt-clean", 1, "IC memo"],
  ["nordholt-dirty", 1, "IC memo"],
  ["b67-probe", 1, "IC memo"],
  ["supersession", 1, "source_A_annual_report_2019"],
  ["F18", 5, "18b_synth_cross_source_pair_update"],
  ["F22", 2, "ALP_update_memo"],
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }
  const store = getLlmCacheStore();
  console.log("# B73 splitter-dash SHADOW");
  console.log(`store.kind=${store?.kind} path=${store?.filePath || ""} entries=${store?.size?.() ?? "?"}`);

  const cases = await loadCorpus();
  console.log("");
  console.log("## A. Splitter candidate text (fallback path, maxLen 240)");
  const splitterChanges = [];
  const countRows = [];
  for (const c of cases) {
    const oldC = splitOld(c.draft).candidates;
    const newC = splitNew(c.draft).candidates;
    countRows.push({ label: c.label, before: oldC.length, after: newC.length });
    const oldSet = new Set(oldC);
    const newSet = new Set(newC);
    const removed = oldC.filter((t) => !newSet.has(t));
    const added = newC.filter((t) => !oldSet.has(t));
    if (removed.length || added.length) {
      splitterChanges.push({ label: c.label, beforeCount: oldC.length, afterCount: newC.length, removed, added });
    }
  }
  if (!splitterChanges.length) console.log("  (none)");
  for (const row of splitterChanges) {
    console.log(`  ${row.label} count ${row.beforeCount} -> ${row.afterCount}`);
    for (const t of row.removed) console.log(`    BEFORE: ${trunc(t, 160)}`);
    for (const t of row.added) console.log(`    AFTER:  ${trunc(t, 160)}`);
  }

  console.log("");
  console.log("## B. Splitter statement count per fixture");
  console.log("label | before | after");
  for (const r of countRows) {
    const mark = r.before === r.after ? "" : "  CHANGED";
    console.log(`${r.label} | ${r.before} | ${r.after}${mark}`);
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage2]") || String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "b73-splitter-shadow",
    metadata: { pipelineRoute: "v4", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuse shadowTrace=${traceId}`);
  beginCacheRun({ recordEvents: false });
  let liveCostUsd = 0;
  const failures = [];
  const stmtMoves = [];
  const pairHits = [];

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    const stage1 = await extractStatements({ draftText: draft, traceId });
    liveCostUsd += Number(stage1?.costUsd) || 0;
    const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    const matched = await matchAllSources({ statements, sources, traceId });
    const matches = Array.isArray(matched?.matches) ? matched.matches : [];
    for (const m of matches) liveCostUsd += Number(m?.costUsd) || 0;
    const asOf = buildAsOfBySourceIndex(sources);
    console.log(`  ${label} llmStatements=${statements.length} pairs=${matches.length} costUsd=${liveCostUsd.toFixed(4)}`);
    for (const stmt of statements) {
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : 0;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      const rowMatches = matches.filter((m) => Number(m.statementIndex) === statementIndex);
      const agg = withSupersession(text, rowMatches, asOf, TODAY);
      for (const m of rowMatches) {
        pairHits.push({
          key: `${label}|S${statementIndex}|${m.sourceLabel || ""}`,
          classification: m.classification,
          text,
        });
      }
      stmtMoves.push({
        key: `${label}|${statementIndex}`,
        text,
        verdict: agg.verdict,
        hasConflict: agg.hasConflict === true,
      });
    }
  }

  const cacheSummary = endCacheRun();
  logCacheRunSummary(cacheSummary, "b73");

  console.log("");
  console.log("## C. LLM Stage 1 statement texts and verdicts");
  console.log("  Stage 1 is LLM-cached. Splitter change does not rewrite those texts.");
  console.log(`  llm statements=${stmtMoves.length}`);

  for (const [label, idx, src] of HEADCOUNT_KEYS) {
    const row = pairHits.find((p) => p.key === `${label}|S${idx}|${src}`);
    if (!row || row.classification !== "conflicting") {
      failures.push(`must-still-fire ${label}|S${idx}|${src} class=${row?.classification}`);
    }
  }
  const f19 = pairHits.find((p) => p.key === "F19|S2|19_synth_annual_report");
  if (!f19 || f19.classification !== "conflicting") failures.push(`F19 S2 class=${f19?.classification}`);
  if (f19 && !/NorTech Industries/.test(f19.text)) failures.push("F19 S2 LLM text is not the whole NorTech sentence");
  const ic = pairHits.find((p) => p.key === "b67-probe|S6|IC memo");
  if (!ic || ic.classification !== "conflicting") failures.push(`b67 S6 IC class=${ic?.classification}`);

  const probeDraft = (await readFile(path.join(B72_DIR, "draft.txt"), "utf8")).trim();
  const probeSrc = await readFile(path.join(B72_DIR, "source_ebitda_margin.txt"), "utf8");
  const probeGap = hasEgregiousMagnitudeGap(probeDraft, probeSrc);
  console.log(`## B72 probe force=${probeGap ? "1" : "0"}`);
  if (probeGap) failures.push("B72 probe still forces");

  const f19Splitter = splitterChanges.find((r) => r.label === "F19");
  if (!f19Splitter) failures.push("F19 splitter candidates did not change");
  else if (!f19Splitter.added.some((t) => /NorTech Industries/.test(t) && /which closed/.test(t))) {
    failures.push("F19 splitter after text is not the whole NorTech sentence");
  }

  console.log("");
  console.log("## Cost and cache");
  console.log(`  liveCostUsd=${liveCostUsd.toFixed(4)} trace=${traceId}`);
  console.log(
    `  cache hits=${cacheSummary.hits} misses=${cacheSummary.misses} hitRate=${((cacheSummary.hitRate || 0) * 100).toFixed(1)}%`
  );

  if (failures.length) {
    console.log("");
    console.log("## GATE FAIL");
    for (const f of failures) console.log(`  ${f}`);
    await flushObservability();
    process.exit(1);
  }
  console.log("");
  console.log("## GATE PASS");
  await flushObservability();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
