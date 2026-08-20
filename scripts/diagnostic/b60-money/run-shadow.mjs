#!/usr/bin/env node
/**
 * B60.1 shadow against current main (B60 character window). Shared Stage 1 +
 * whole-sentence Stage 2 from the disk cache. ON arm replays sentence-scoped
 * metric resolution against the model's pre-backstop classification (Langfuse
 * diagnose trace).
 *
 * Usage:
 *   node scripts/diagnostic/b60-money/run-shadow.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const B67_DIR = path.join(DIAG_ROOT, "b67-probe");
const DIAGNOSE_TRACE_ID = "b4659844-9b2e-444a-ad50-73dc73b12074";
const MAX_LIVE_COST_USD = 0.5;

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const {
  matchAllSources,
  collectBackstopFigures,
  hasEgregiousMagnitudeGap,
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { beginCacheRun, endCacheRun, logCacheRunSummary, getLlmCacheStore } = await import(
  "../../../lib/qc/llm-cache.mjs"
);
const { createTraceId, startTrace, flushObservability } = await import("../../../lib/observability.js");

function trunc(s, n = 110) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

function evidenceKey(row) {
  return `${row?.verdict || "not_supported"}|conflict=${row?.hasConflict === true ? "1" : "0"}`;
}

function pairKey(label, statementIndex, sourceLabel) {
  return `${label}|S${statementIndex}|${sourceLabel}`;
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
      m.originalClassification = m.classification;
      m.classification = "superseded";
    }
    agg = aggregateVerdict({ statementMatches: matches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { agg, matches, resolved };
}

function extractMoneyOld(text) {
  const t = typeof text === "string" ? text : "";
  const out = [];
  const re =
    /(?:USD|EUR|GBP|AUD|CAD|\$|€|£)\s*([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn|k)?|([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn)\b/gi;
  let m;
  while ((m = re.exec(t))) {
    const n = Number(String(m[1] || m[3] || "").replace(/[,']/g, "").replace(/\u2019/g, ""));
    if (!Number.isFinite(n)) continue;
    const unit = String(m[2] || m[4] || "").toLowerCase();
    let scale = 1;
    if (unit === "billion" || unit === "bn") scale = 1e9;
    else if (unit === "million" || unit === "mm") scale = 1e6;
    else if (unit === "thousand" || unit === "k") scale = 1e3;
    out.push({ value: n * scale, raw: m[0], kind: "money" });
  }
  return out;
}

function moneyValues(figs) {
  return (Array.isArray(figs) ? figs : [])
    .filter((f) => f.kind === "money")
    .map((f) => `${f.raw}=${f.value}`)
    .join(",");
}

function replayOn(statementText, match, llmClassification) {
  const passage = typeof match.passage === "string" ? match.passage : "";
  const explanation = typeof match.explanation === "string" ? match.explanation : "";
  const rounded = applyRoundingToleranceBackstop(
    { classification: llmClassification, passage, explanation },
    { statementText }
  );
  return applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment: match.periodAssessment ?? null,
    },
    { statementText, sourceLabel: match.sourceLabel }
  );
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
  return { label: kind === "dirty" ? "nordholt-dirty" : "nordholt-clean", draft, sources };
}

async function loadB67Probe() {
  const draft = await readFile(path.join(B67_DIR, "draft_dirty.txt"), "utf8");
  const files = [
    ["source_ic_memo.txt", "IC memo"],
    ["source_press_release.txt", "press release"],
    ["source_fact_sheet.txt", "fact sheet"],
    ["source_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(B67_DIR, name), "utf8");
    sources.push({ text, label });
  }
  return { label: "b67-probe", draft, sources };
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
  return { label: "supersession", draft, sources };
}

async function loadCorpus() {
  const out = [];
  for (const kind of ["clean", "dirty"]) {
    try {
      out.push(await loadNordholt(kind));
    } catch (err) {
      console.log(`skip nordholt-${kind}: ${err.message}`);
    }
  }
  try {
    out.push(await loadB67Probe());
  } catch (err) {
    console.log(`skip b67-probe: ${err.message}`);
  }
  try {
    out.push(await loadSupersessionFixture());
  } catch (err) {
    console.log(`skip supersession: ${err.message}`);
  }
  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") continue;
    try {
      const sources = await loadPipelineSources(fx.data.sources || []);
      if (!sources.length) continue;
      out.push({ label: `F${String(fx.data.id).padStart(2, "0")}`, draft, sources });
    } catch (err) {
      console.log(`skip F${String(fx.data.id).padStart(2, "0")}: ${err.message}`);
    }
  }
  return out;
}

async function langfuseGet(pathname) {
  const host = String(process.env.LANGFUSE_HOST || "").replace(/\/$/, "");
  const pub = String(process.env.LANGFUSE_PUBLIC_KEY || "").trim();
  const sec = String(process.env.LANGFUSE_SECRET_KEY || "").trim();
  if (!host || !pub || !sec) return { ok: false, error: "missing langfuse env" };
  const auth = Buffer.from(`${pub}:${sec}`).toString("base64");
  const res = await fetch(`${host}${pathname}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

function statementFromInput(input) {
  const msgs = Array.isArray(input) ? input : [];
  const user = msgs.find((m) => m?.role === "user");
  const content = typeof user?.content === "string" ? user.content : "";
  const m = content.match(/Statement:\n([\s\S]*?)\n\nSource:\n/);
  return m ? m[1] : "";
}

async function loadLlmClassMap(traceId) {
  const map = new Map();
  let page = 1;
  let totalPages = 1;
  let fetched = 0;
  while (page <= totalPages && page <= 20) {
    const res = await langfuseGet(
      `/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=100&page=${page}`
    );
    if (!res.ok) {
      console.log(`langfuse observations page ${page} status=${res.status}`);
      break;
    }
    const rows = Array.isArray(res.body?.data) ? res.body.data : [];
    totalPages = Number(res.body?.meta?.totalPages) || page;
    fetched += rows.length;
    for (const o of rows) {
      if (o?.name !== "stage2-match-sources") continue;
      const meta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
      if (String(meta.attempt || "") === "claim-span") continue;
      const statement = statementFromInput(o.input);
      const sourceLabel = String(meta.sourceLabel || "");
      let parsed = o.output;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = null;
        }
      }
      const classification = typeof parsed?.classification === "string" ? parsed.classification.trim() : "";
      if (!statement || !sourceLabel || !classification) continue;
      map.set(`${statement}\n||\n${sourceLabel}`, classification);
    }
    page += 1;
  }
  return { map, fetched };
}

const PREDICTED = new Set([
  "b67-probe|S6|press release",
  "F18|S7|18b_synth_cross_source_pair_update",
]);

/** Current main (B60 character window) ON-arm class where it already differs from diagnose. */
const CURRENT_MAIN_PAIRS = {
  "nordholt-dirty|S2|press release": "partially_confirmed",
  "nordholt-dirty|S2|fact sheet": "partially_confirmed",
  "b67-probe|S2|press release": "partially_confirmed",
  "b67-probe|S2|fact sheet": "partially_confirmed",
  "b67-probe|S6|fact sheet": "no_support",
  "b67-probe|S6|press release": "conflicting",
  "F18|S7|18b_synth_cross_source_pair_update": "no_support",
};

const EXPECTED_ON_VS_MAIN = {
  "b67-probe|S6|press release": "no_support",
  "F18|S7|18b_synth_cross_source_pair_update": "conflicting",
};

const CURRENT_MAIN_STMTS = {
  "nordholt-dirty|2": { verdict: "partially_confirmed", hasConflict: false },
  "b67-probe|2": { verdict: "partially_confirmed", hasConflict: false },
  "F18|7": { verdict: "confirmed", hasConflict: false },
};

const EXPECTED_STMT_VS_MAIN = {
  "F18|7": { verdict: "confirmed", hasConflict: true },
};

const MUST_STILL_FIRE = [
  ["nordholt-clean", 1, "IC memo"],
  ["nordholt-dirty", 1, "IC memo"],
  ["b67-probe", 1, "IC memo"],
  ["supersession", 1, "source_A_annual_report_2019"],
  ["F18", 5, "18b_synth_cross_source_pair_update"],
  ["F22", 2, "ALP_update_memo"],
  ["F19", 2, "19_synth_annual_report"],
  ["supersession", 0, "source_A_annual_report_2019"],
];

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage2]") || String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const store = getLlmCacheStore();
  console.log("# B60.1 sentence-scoped money metric SHADOW");
  console.log(`store.kind=${store?.kind} path=${store?.filePath || ""} entries=${store?.size?.() ?? "?"}`);
  console.log(`diagnoseTrace=${DIAGNOSE_TRACE_ID}`);

  console.log("loading Langfuse pre-backstop classifications...");
  const llmLoaded = await loadLlmClassMap(DIAGNOSE_TRACE_ID);
  console.log(`langfuse stage2 classes=${llmLoaded.map.size} observationsFetched=${llmLoaded.fetched}`);

  const cases = await loadCorpus();
  console.log(`corpus cases (${cases.length}): ${cases.map((c) => c.label).join(", ")}`);

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "b60.1-shadow",
    metadata: { pipelineRoute: "v4", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuse shadowTrace=${traceId}`);

  beginCacheRun({ recordEvents: false });
  let liveCostUsd = 0;
  const pairRows = [];
  const stmtRows = [];
  const blast = [];
  const failures = [];
  const suppressions = [];

  const origLog = console.log;
  console.log = (...args) => {
    const line = String(args[0] || "");
    if (line.startsWith("[magnitude-backstop] suppressed money force")) {
      suppressions.push(line);
    }
    origLog.apply(console, args);
  };

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    const stage1 = await extractStatements({ draftText: draft, traceId });
    liveCostUsd += Number(stage1?.costUsd) || 0;
    const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    const matched = await matchAllSources({ statements, sources, traceId });
    const matches = Array.isArray(matched?.matches) ? matched.matches : [];
    for (const m of matches) liveCostUsd += Number(m?.costUsd) || 0;

    if (liveCostUsd > MAX_LIVE_COST_USD) {
      console.log = origLog;
      console.error(
        `STOP: live costUsd=${liveCostUsd.toFixed(4)} exceeded ${MAX_LIVE_COST_USD}. Cache did not hold. Aborting.`
      );
      process.exit(1);
    }

    const asOfBySourceIndex = buildAsOfBySourceIndex(sources);

    for (const stmt of statements) {
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : 0;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      const rowMatches = matches
        .filter((m) => Number(m.statementIndex) === statementIndex)
        .slice()
        .sort((a, b) => a.sourceIndex - b.sourceIndex);

      const offMatches = rowMatches.map((m) => ({ ...m }));
      const onMatches = rowMatches.map((m) => {
        const sourceLabel = m.sourceLabel || "";
        const llmClass = llmLoaded.map.get(`${text}\n||\n${sourceLabel}`) || m.classification;
        const gated = replayOn(text, m, llmClass);
        const key = pairKey(label, statementIndex, sourceLabel);
        const oldMoney = extractMoneyOld(text);
        const oldPass = extractMoneyOld(m.passage || "");
        const newMoney = collectBackstopFigures(text).filter((f) => f.kind === "money");
        const newPass = collectBackstopFigures(m.passage || "").filter((f) => f.kind === "money");
        const scaleChanged = moneyValues(oldMoney) !== moneyValues(newMoney) || moneyValues(oldPass) !== moneyValues(newPass);
        if (scaleChanged) {
          blast.push({
            key,
            stmtOld: moneyValues(oldMoney),
            stmtNew: moneyValues(newMoney),
            srcOld: moneyValues(oldPass),
            srcNew: moneyValues(newPass),
            statement: trunc(text, 140),
            passage: trunc(m.passage, 140),
          });
        }
        pairRows.push({
          key,
          label,
          statementIndex,
          sourceLabel,
          llmClass,
          llmFromLangfuse: llmLoaded.map.has(`${text}\n||\n${sourceLabel}`),
          offClass: m.classification,
          onClass: gated.classification,
          gapOn: hasEgregiousMagnitudeGap(text, m.passage || ""),
          statement: text,
          passage: m.passage || "",
        });
        return { ...m, classification: gated.classification, passage: gated.passage, explanation: gated.explanation };
      });

      const off = withSupersession(text, offMatches, asOfBySourceIndex, TODAY);
      const on = withSupersession(text, onMatches, asOfBySourceIndex, TODAY);
      stmtRows.push({
        label,
        statementIndex,
        text,
        offVerdict: off.agg.verdict,
        offHasConflict: off.agg.hasConflict === true,
        onVerdict: on.agg.verdict,
        onHasConflict: on.agg.hasConflict === true,
      });
    }

    origLog(`  ${label} statements=${statements.length} pairs=${matches.length} liveCost=${liveCostUsd.toFixed(4)}`);
  }

  console.log = origLog;
  const cacheSummary = endCacheRun();
  logCacheRunSummary(cacheSummary, "b60.1-shadow");
  await flushObservability();

  function mainPairClass(row) {
    return CURRENT_MAIN_PAIRS[row.key] ?? row.offClass;
  }

  function stmtKey(row) {
    return `${row.label}|${row.statementIndex}`;
  }

  function mainStmt(row) {
    return CURRENT_MAIN_STMTS[stmtKey(row)] || {
      verdict: row.offVerdict,
      hasConflict: row.offHasConflict,
    };
  }

  const pairChangesVsDiagnose = pairRows.filter((r) => r.offClass !== r.onClass);
  const pairChangesVsMain = pairRows.filter((r) => mainPairClass(r) !== r.onClass);
  const stmtChangesVsDiagnose = stmtRows.filter(
    (r) => r.offVerdict !== r.onVerdict || r.offHasConflict !== r.onHasConflict
  );
  const stmtChangesVsMain = stmtRows.filter((r) => {
    const main = mainStmt(r);
    return main.verdict !== r.onVerdict || main.hasConflict !== r.onHasConflict;
  });

  console.log("");
  console.log("## Pair classification vs current main (B60 window)");
  if (pairChangesVsMain.length === 0) console.log("  (none)");
  for (const r of pairChangesVsMain) {
    const predicted = PREDICTED.has(r.key) ? "predicted" : "UNEXPECTED";
    console.log(
      `  ${r.key} ${mainPairClass(r)} -> ${r.onClass} llm=${r.llmClass} langfuse=${r.llmFromLangfuse ? "1" : "0"} gapOn=${r.gapOn ? "1" : "0"} [${predicted}] | ${trunc(r.statement, 80)}`
    );
  }

  console.log("");
  console.log("## Statement verdict / hasConflict vs current main");
  if (stmtChangesVsMain.length === 0) console.log("  (none)");
  for (const r of stmtChangesVsMain) {
    const main = mainStmt(r);
    console.log(
      `  ${r.label} S${r.statementIndex} ${evidenceKey({ verdict: main.verdict, hasConflict: main.hasConflict })} -> ${evidenceKey({ verdict: r.onVerdict, hasConflict: r.onHasConflict })} | ${trunc(r.text, 80)}`
    );
  }

  console.log("");
  console.log("## Pair classification vs diagnose cache (context)");
  if (pairChangesVsDiagnose.length === 0) console.log("  (none)");
  for (const r of pairChangesVsDiagnose) {
    console.log(
      `  ${r.key} ${r.offClass} -> ${r.onClass} llm=${r.llmClass} gapOn=${r.gapOn ? "1" : "0"} | ${trunc(r.statement, 80)}`
    );
  }

  console.log("");
  console.log("## Statement vs diagnose cache (context)");
  if (stmtChangesVsDiagnose.length === 0) console.log("  (none)");
  for (const r of stmtChangesVsDiagnose) {
    console.log(
      `  ${r.label} S${r.statementIndex} ${evidenceKey({ verdict: r.offVerdict, hasConflict: r.offHasConflict })} -> ${evidenceKey({ verdict: r.onVerdict, hasConflict: r.onHasConflict })} | ${trunc(r.text, 80)}`
    );
  }

  console.log("");
  console.log("## Part 1 wrong-scale blast radius");
  console.log(`pairs with a money figure scale change (old vs new parser): ${blast.length}`);
  for (const b of blast) {
    console.log(`  ${b.key} stmt[${b.stmtOld}]->[${b.stmtNew}] src[${b.srcOld}]->[${b.srcNew}]`);
    console.log(`    ${b.statement}`);
    console.log(`    ${b.passage}`);
  }

  console.log("");
  console.log("## Suppressions logged");
  console.log(`count=${suppressions.length}`);
  for (const line of suppressions) console.log(`  ${line}`);
  for (const line of suppressions) {
    if (!/metric=\S+/.test(line) || !/stmt="/.test(line) || !/src="/.test(line)) {
      failures.push(`suppression missing phrases or ids: ${line}`);
    }
  }

  const changedKeys = new Set(pairChangesVsMain.map((r) => r.key));
  for (const key of PREDICTED) {
    const row = pairRows.find((r) => r.key === key);
    if (!row) {
      failures.push(`predicted pair missing: ${key}`);
      continue;
    }
    const expected = EXPECTED_ON_VS_MAIN[key];
    if (row.onClass !== expected) {
      failures.push(`predicted pair ${key} onClass=${row.onClass} expected ${expected}`);
    }
    if (mainPairClass(row) === row.onClass) {
      failures.push(`predicted pair did not change vs current main: ${key}`);
    }
  }
  for (const key of changedKeys) {
    if (!PREDICTED.has(key)) failures.push(`unexpected pair change vs current main: ${key}`);
  }

  for (const key of [
    "nordholt-dirty|S2|press release",
    "nordholt-dirty|S2|fact sheet",
    "b67-probe|S2|press release",
    "b67-probe|S2|fact sheet",
  ]) {
    const row = pairRows.find((r) => r.key === key);
    if (!row) failures.push(`scale pair missing: ${key}`);
    else if (row.onClass !== "partially_confirmed") {
      failures.push(`scale pair ${key} onClass=${row.onClass} expected partially_confirmed`);
    }
  }

  const factS6 = pairRows.find((r) => r.key === "b67-probe|S6|fact sheet");
  if (!factS6) failures.push("b67-probe S6 x fact sheet missing");
  else if (factS6.onClass !== "no_support") {
    failures.push(`b67-probe S6 x fact sheet onClass=${factS6.onClass} expected no_support`);
  }

  for (const [label, idx, sourceLabel] of MUST_STILL_FIRE) {
    const key = pairKey(label, idx, sourceLabel);
    const row = pairRows.find((r) => r.key === key);
    if (!row) {
      failures.push(`must-still-fire missing: ${key}`);
      continue;
    }
    if (row.gapOn !== true && row.onClass !== "conflicting") {
      failures.push(`must-still-fire lost: ${key} gapOn=${row.gapOn} onClass=${row.onClass}`);
    } else {
      console.log(`must-still-fire ok ${key} gapOn=${row.gapOn ? "1" : "0"} onClass=${row.onClass}`);
    }
  }

  const ic = pairRows.find((r) => r.key === "b67-probe|S6|IC memo");
  if (!ic) failures.push("b67-probe S6 x IC memo missing");
  else if (ic.onClass !== "conflicting") {
    failures.push(`b67-probe S6 x IC memo lost conflicting (onClass=${ic.onClass} llm=${ic.llmClass})`);
  } else {
    console.log(`preserve B67 ok b67-probe|S6|IC memo onClass=${ic.onClass} llm=${ic.llmClass} gapOn=${ic.gapOn ? "1" : "0"}`);
  }

  const f18 = pairRows.find((r) => r.key === "F18|S7|18b_synth_cross_source_pair_update");
  if (!f18) failures.push("F18 S7 missing");
  else {
    console.log(
      `F18 S7 main=${mainPairClass(f18)} on=${f18.onClass} llm=${f18.llmClass} gapOn=${f18.gapOn ? "1" : "0"}`
    );
  }

  const stmtChangedKeys = new Set(stmtChangesVsMain.map((r) => stmtKey(r)));
  for (const [key, expected] of Object.entries(EXPECTED_STMT_VS_MAIN)) {
    const row = stmtRows.find((r) => stmtKey(r) === key);
    if (!row) {
      failures.push(`expected statement change missing: ${key}`);
      continue;
    }
    if (row.onVerdict !== expected.verdict || row.onHasConflict !== expected.hasConflict) {
      failures.push(
        `statement ${key} ${evidenceKey({ verdict: row.onVerdict, hasConflict: row.onHasConflict })} expected ${evidenceKey(expected)}`
      );
    }
  }
  for (const key of stmtChangedKeys) {
    if (!EXPECTED_STMT_VS_MAIN[key]) failures.push(`unexpected statement change vs current main: ${key}`);
  }

  let langfuseCost = null;
  for (const waitMs of [4000, 8000]) {
    await new Promise((r) => setTimeout(r, waitMs === 4000 ? 4000 : 4000));
    const trace = await langfuseGet(`/api/public/traces/${encodeURIComponent(traceId)}`);
    langfuseCost = {
      waitMs,
      totalCost: trace.body?.totalCost ?? trace.body?.calculatedTotalCost ?? null,
      status: trace.status,
    };
    console.log(`langfuse shadow cost poll ${JSON.stringify(langfuseCost)}`);
    if ((Number(langfuseCost.totalCost) || 0) > 0 || waitMs === 8000) break;
  }

  console.log("");
  console.log(`liveCostUsd=${liveCostUsd.toFixed(4)} langfuseShadowCost=${langfuseCost?.totalCost}`);
  console.log(
    `cache hitRate=${((cacheSummary.hitRate || 0) * 100).toFixed(1)}% hits=${cacheSummary.hits} misses=${cacheSummary.misses}`
  );

  if (failures.length) {
    console.log("");
    console.log("GATE FAIL");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("");
  console.log("GATE PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
