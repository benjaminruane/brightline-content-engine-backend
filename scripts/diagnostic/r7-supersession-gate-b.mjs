#!/usr/bin/env node
/**
 * SUPERSESSION GATE B — read-only shadow.
 * Live Stage 1+2 only for the supersession fixture. Corpus reconstructed from saved
 * result.json using collectBackstopFigures (same export as Stage 2). Nordholt from
 * Langfuse if available, else one Stage 2 pass on the dirty Downloads draft.
 *
 * Usage:
 *   node scripts/diagnostic/r7-supersession-gate-b.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "./lib/env.mjs";
import { loadAllFixtures } from "./lib/fixtures.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";
import { DIAG_ROOT, RUNS_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const CORPUS_RUN = "2026-08-14-175700";
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const NORDHOLT_DIRTY_TRACES = ["6d236e06", "41dd2231", "e503ffd1"];

const INVERSE_KEYS = [
  ["18", 3],
  ["18", 4],
  ["18", 5],
  ["18", 7],
  ["18", 8],
  ["22", 2],
  ["23", 2],
];

const NORDHOLT_GENUINE = [
  { re: /12 facilities|runs 12/i, label: "facilities 12 vs 14" },
  { re: /five years|5 years|contract now runs/i, label: "contracts 5 vs 4" },
  { re: /exit by 2027|full exit by 2027/i, label: "exit-2027 vs 2028" },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {typeof import("../../lib/qc/pipeline-v4/stage1-extract-statements.mjs").extractStatements} */
let extractStatements;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").matchAllSources} */
let matchAllSources;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").collectBackstopFigures} */
let collectBackstopFigures;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs").aggregateVerdict} */
let aggregateVerdict;
/** @type {typeof import("../../lib/qc/supersession.mjs").resolveSupersession} */
let resolveSupersession;
/** @type {typeof import("../../lib/qc/supersession.mjs").buildAsOfBySourceIndex} */
let buildAsOfBySourceIndex;

async function loadDeps() {
  ({ extractStatements } = await import("../../lib/qc/pipeline-v4/stage1-extract-statements.mjs"));
  ({ matchAllSources, collectBackstopFigures } = await import(
    "../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
  ));
  ({ aggregateVerdict } = await import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs"));
  ({ resolveSupersession, buildAsOfBySourceIndex } = await import("../../lib/qc/supersession.mjs"));
}

function keyOf(fid, index) {
  return `${String(fid).padStart(2, "0")}:${index}`;
}

function trunc(s, n = 96) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function enrichMatches(statement, sourceMatches) {
  const stmt = typeof statement === "string" ? statement : "";
  return (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({
    ...m,
    periodAssessment: m.periodAssessment ?? null,
    statementFigures:
      Array.isArray(m.statementFigures) && m.statementFigures.length
        ? m.statementFigures
        : collectBackstopFigures(stmt),
    sourceFigures:
      Array.isArray(m.sourceFigures) && m.sourceFigures.length
        ? m.sourceFigures
        : collectBackstopFigures(typeof m.passage === "string" ? m.passage : ""),
  }));
}

function shadow(statement, sourceMatches, asOfBySourceIndex) {
  const baselineMatches = Array.isArray(sourceMatches) ? sourceMatches : [];
  const baseline = aggregateVerdict({ statementMatches: baselineMatches });
  const enriched = enrichMatches(statement, baselineMatches);
  const resolved = resolveSupersession({
    statement,
    aggregateVerdict: baseline.verdict,
    sourceMatches: enriched,
    asOfBySourceIndex,
    today: TODAY,
  });
  let patched = baseline;
  let patchedMatches = enriched;
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    patchedMatches = enriched.map((m) =>
      demoted.has(Number(m.sourceIndex))
        ? { ...m, classification: "superseded", originalClassification: m.classification }
        : m
    );
    patched = aggregateVerdict({ statementMatches: patchedMatches });
    patched = { ...patched, verdict: resolved.verdictOverride };
  }
  return { baseline, patched, resolved, patchedMatches };
}

function evidenceKey(agg) {
  return `${agg?.verdict || "not_supported"}|conflict=${agg?.hasConflict === true ? "1" : "0"}`;
}

function moved(before, after) {
  return evidenceKey(before) !== evidenceKey(after);
}

async function loadRun(ts) {
  const root = path.isAbsolute(ts) ? ts : path.join(RUNS_DIR, ts);
  const names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
  const byId = new Map();
  for (const dir of names) {
    try {
      const data = JSON.parse(await readFile(path.join(root, dir.name, "result.json"), "utf8"));
      byId.set(String(data.fixtureId).padStart(2, "0"), data);
    } catch {
      /* skip */
    }
  }
  return byId;
}

async function langfuseGet(pathname) {
  const host = String(process.env.LANGFUSE_HOST || "").replace(/\/$/, "");
  const pub = String(process.env.LANGFUSE_PUBLIC_KEY || "").trim();
  const sec = String(process.env.LANGFUSE_SECRET_KEY || "").trim();
  if (!host || !pub || !sec) return null;
  const auth = Buffer.from(`${pub}:${sec}`).toString("base64");
  const res = await fetch(`${host}${pathname}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function reconstructNordholtFromLangfuse(sources) {
  const asOfBySourceIndex = buildAsOfBySourceIndex(sources);
  for (const partial of NORDHOLT_DIRTY_TRACES) {
    const list = await langfuseGet(`/api/public/traces?limit=50`);
    const traces = Array.isArray(list?.data) ? list.data : [];
    const hit = traces.find((t) => String(t?.id || "").startsWith(partial));
    const traceId = hit?.id || (partial.length > 20 ? partial : null);
    if (!traceId) continue;
    const obs = await langfuseGet(`/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=100`);
    const rows = Array.isArray(obs?.data) ? obs.data : [];
    const stage1 = rows.find((o) => o.name === "stage1-extract-statements");
    const stage1Statements = Array.isArray(stage1?.output?.statements) ? stage1.output.statements : [];
    const stage2 = rows.filter((o) => o.name === "stage2-match-sources");
    if (stage2.length === 0) continue;
    const latestByPair = new Map();
    for (const o of stage2) {
      const meta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
      const statementIndex = Number(meta.statementIndex);
      const sourceIndex = Number(meta.sourceIndex);
      if (!Number.isFinite(statementIndex) || !Number.isFinite(sourceIndex)) continue;
      const key = `${statementIndex}:${sourceIndex}`;
      const prev = latestByPair.get(key);
      const attempt = Number(meta.matchCallAttempt) || 0;
      const prevAttempt = Number(prev?.metadata?.matchCallAttempt) || 0;
      if (!prev || attempt >= prevAttempt) latestByPair.set(key, o);
    }
    const byStmt = new Map();
    for (const [key, o] of latestByPair) {
      const [si, src] = key.split(":").map(Number);
      let parsed = o.output;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = null;
        }
      }
      const classification = parsed?.classification;
      if (!classification) continue;
      if (!byStmt.has(si)) {
        const text = typeof stage1Statements[si]?.text === "string" ? stage1Statements[si].text : "";
        byStmt.set(si, { statement: text, matches: [] });
      }
      const meta = o.metadata && typeof o.metadata === "object" ? o.metadata : {};
      byStmt.get(si).matches.push({
        sourceIndex: src,
        sourceLabel: meta.sourceLabel || sources[src]?.label || `source ${src}`,
        classification,
        passage: typeof parsed?.passage === "string" ? parsed.passage : "",
        explanation: typeof parsed?.explanation === "string" ? parsed.explanation : "",
        periodAssessment: parsed?.periodAssessment ?? null,
      });
    }
    if (byStmt.size === 0) continue;
    const statements = [...byStmt.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, row]) => ({ index, text: row.statement, matches: row.matches }));
    return { method: `langfuse:${traceId}`, statements, asOfBySourceIndex };
  }
  return null;
}

async function liveMatch(draft, sources, traceName) {
  const stage1 = await extractStatements({ draftText: draft, traceId: undefined });
  const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const { matches } = await matchAllSources({ statements, sources, traceId: undefined });
  const byStmt = new Map();
  for (const m of matches) {
    const idx = Number(m.statementIndex);
    if (!byStmt.has(idx)) byStmt.set(idx, []);
    byStmt.get(idx).push(m);
  }
  return statements.map((s, ord) => {
    const index = Number.isFinite(s.index) ? Number(s.index) : ord;
    return {
      index,
      text: s.text || "",
      matches: (byStmt.get(index) || []).slice().sort((a, b) => a.sourceIndex - b.sourceIndex),
    };
  });
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

async function loadNordholtDirty() {
  const draft = await readFile(path.join(NORDHOLT_DIR, "draft_reporting_commentary.txt"), "utf8");
  const files = [
    ["source_4_lp_update.txt", "LP update"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_2_press_release.txt", "press release"],
    ["source_1_ic_memo.txt", "IC memo"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ label, text });
  }
  return { draft, sources };
}

function printShadowRow(tag, statement, shadowOut) {
  const { baseline, patched, resolved } = shadowOut;
  const note = resolved.supersededNotes[0] ? ` | note=${trunc(resolved.supersededNotes[0], 140)}` : "";
  console.log(
    `- ${tag} "${trunc(statement, 88)}"  baseline=${evidenceKey(baseline)}  patched=${evidenceKey(patched)}${note}`
  );
}

async function main() {
  await loadDeps();
  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };
  const failures = [];

  console.log(`# Supersession GATE B`);
  console.log(`Today=${TODAY.toISOString().slice(0, 10)}`);
  console.log(`Corpus baseline=${CORPUS_RUN} (reconstruct; collectBackstopFigures; no corpus LLM)`);
  console.log("");

  // --- Live supersession fixture ---
  console.log(`## DO-FIX / DON'T-BREAK — supersession fixture (live Stage 1+2)`);
  const fx = await loadSupersessionFixture();
  const asOfFx = buildAsOfBySourceIndex(fx.sources);
  for (let i = 0; i < fx.sources.length; i++) {
    const hit = asOfFx[i];
    console.log(`  source[${i}] ${fx.sources[i].label} as-of=${hit ? hit.raw : "null"}`);
  }
  const liveRows = await liveMatch(fx.draft, fx.sources, "supersession-gate-b");
  console.log(`  statements=${liveRows.length} (expect 4)`);

  function fixtureRole(text) {
    const t = String(text || "");
    if (/EUR 200 million/i.test(t) && /2025|twelve months/i.test(t)) return "S0";
    if (/employs 720/i.test(t)) return "S1";
    if (/EBITDA/i.test(t) && /FY2024|45/i.test(t)) return "S2";
    if (/12 portfolio companies/i.test(t)) return "S3";
    return `S${liveRows.findIndex((r) => r.text === text)}`;
  }

  for (const row of liveRows) {
    const out = shadow(row.text, row.matches, asOfFx);
    const role = fixtureRole(row.text);
    printShadowRow(role, row.text, out);
    const { baseline, patched, resolved } = out;
    if (role === "S0" || role === "S1") {
      const ok =
        patched.verdict === "confirmed" &&
        patched.hasConflict === false &&
        resolved.supersededNotes.length > 0;
      if (!ok) {
        failures.push(
          `${role} expected confirmed+hasConflict=false+note; got ${evidenceKey(patched)} notes=${resolved.supersededNotes.length} (baseline ${evidenceKey(baseline)})`
        );
      }
    }
    if (role === "S2" || role === "S3") {
      const stayConflict = patched.hasConflict === true || patched.verdict === "conflicting";
      if (!stayConflict || resolved.verdictOverride) {
        failures.push(
          `${role} expected to stay conflicting; got ${evidenceKey(patched)} override=${resolved.verdictOverride}`
        );
      }
    }
  }

  // --- Nordholt dirty ---
  console.log("");
  console.log(`## DON'T-BREAK — Nordholt dirty genuine conflicts`);
  const nordholt = await loadNordholtDirty();
  const nordholtAsOf = buildAsOfBySourceIndex(nordholt.sources);
  let nordholtRows = null;
  let nordholtMethod = "";
  const fromLf = await reconstructNordholtFromLangfuse(nordholt.sources);
  if (fromLf?.statements?.length) {
    nordholtRows = fromLf.statements;
    nordholtMethod = fromLf.method;
  } else {
    console.log(`  Langfuse reconstruct unavailable; running Stage 1+2 on Downloads dirty draft.`);
    nordholtRows = await liveMatch(nordholt.draft, nordholt.sources, "nordholt-gate-b");
    nordholtMethod = "live-stage2-downloads";
  }
  console.log(`  method=${nordholtMethod} statements=${nordholtRows.length}`);
  const nordholtHits = [];
  for (const row of nordholtRows) {
    const out = shadow(row.text, row.matches, nordholtAsOf);
    const genuine = NORDHOLT_GENUINE.find((g) => g.re.test(row.text));
    if (genuine) {
      nordholtHits.push({ ...genuine, row, out });
      printShadowRow(`S${row.index} ${genuine.label}`, row.text, out);
      if (out.resolved.verdictOverride || moved(out.baseline, out.patched)) {
        failures.push(`Nordholt ${genuine.label} moved: ${evidenceKey(out.baseline)} → ${evidenceKey(out.patched)}`);
      }
    }
  }
  if (nordholtHits.length < 3) {
    failures.push(`Nordholt genuine-conflict statements found=${nordholtHits.length}/3`);
  }

  // --- Inverse 7 ---
  console.log("");
  console.log(`## DON'T-BREAK — 7 inverse (draft is behind)`);
  const corpusRun = await loadRun(CORPUS_RUN);
  const fixtures = await loadAllFixtures();
  const inverseSet = new Set(INVERSE_KEYS.map(([fid, idx]) => keyOf(fid, idx)));
  const inverseSeen = new Set();
  for (const [fid, idx] of INVERSE_KEYS) {
    const data = corpusRun.get(fid);
    const fxRow = fixtures.find((f) => String(f.data.id).padStart(2, "0") === fid);
    if (!data || !fxRow) {
      failures.push(`inverse ${keyOf(fid, idx)} missing from corpus run`);
      continue;
    }
    const sources = await loadPipelineSources(fxRow.data.sources || []);
    const asOf = buildAsOfBySourceIndex(sources);
    const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    const entry = stage2.find((e) => Number(e.statementIndex) === idx) || stage2[idx];
    if (!entry) {
      failures.push(`inverse ${keyOf(fid, idx)} missing stage2 entry`);
      continue;
    }
    const out = shadow(entry.statementText || "", entry.sourceMatches || [], asOf);
    inverseSeen.add(keyOf(fid, idx));
    const stayConflict = out.patched.hasConflict === true || out.patched.verdict === "conflicting";
    printShadowRow(`F${fid} S${idx}`, entry.statementText || "", out);
    if (!stayConflict || out.resolved.verdictOverride || moved(out.baseline, out.patched)) {
      failures.push(
        `inverse ${keyOf(fid, idx)} moved or lost conflict: ${evidenceKey(out.baseline)} → ${evidenceKey(out.patched)}`
      );
    }
  }

  // --- Corpus: no other verdict transitions ---
  console.log("");
  console.log(`## PROOF: no other evidence-verdict transitions in corpus ${CORPUS_RUN}`);
  const numbered = fixtures.filter((f) => /^\d+$/.test(String(f.data.id)));
  const corpusFx = numbered.filter((f) => {
    const n = parseInt(String(f.data.id), 10);
    return n >= 1 && n <= 23;
  });
  let compared = 0;
  const unexpected = [];
  for (const fxRow of corpusFx) {
    const fid = String(fxRow.data.id).padStart(2, "0");
    const data = corpusRun.get(fid);
    if (!data) {
      console.log(`MISSING corpus run for F${fid}`);
      failures.push(`missing F${fid}`);
      continue;
    }
    const sources = await loadPipelineSources(fxRow.data.sources || []);
    const asOf = buildAsOfBySourceIndex(sources);
    const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    for (const entry of stage2) {
      const idx = Number.isFinite(entry?.statementIndex) ? Number(entry.statementIndex) : compared;
      const out = shadow(entry.statementText || "", entry.sourceMatches || [], asOf);
      compared += 1;
      if (moved(out.baseline, out.patched) || out.resolved.verdictOverride) {
        unexpected.push({
          fid,
          idx,
          statement: entry.statementText || "",
          from: evidenceKey(out.baseline),
          to: evidenceKey(out.patched),
          notes: out.resolved.supersededNotes,
        });
      }
    }
  }
  console.log(`Statements compared=${compared}`);
  console.log(`Unexpected transitions=${unexpected.length}`);
  if (unexpected.length) {
    for (const u of unexpected.slice(0, 30)) {
      console.log(`- DRIFT F${u.fid} S${u.idx} ${u.from} → ${u.to} | ${trunc(u.statement, 100)}`);
      if (u.notes[0]) console.log(`  note=${trunc(u.notes[0], 140)}`);
    }
    failures.push(`${unexpected.length} unexpected corpus transitions`);
  }

  const pass = failures.length === 0;
  console.log("");
  console.log(`GATE B ${pass ? "PASS" : "FAIL"}`);
  if (!pass) {
    for (const f of failures) console.log(`- ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
