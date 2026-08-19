#!/usr/bin/env node
/**
 * PART 2 GATE — extractPercents "per cent" (read-only, blocking).
 * Baseline = old regex (%|percent). Patched = (%|per\s?cent).
 *
 * Usage:
 *   node scripts/diagnostic/r7-percent-extract-gate.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "./lib/env.mjs";
import { DIAG_ROOT, RUNS_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const CORPUS_RUN = "2026-08-16-172115";
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const NORDHOLT_TRACES = {
  clean: "128589df",
  dirty: "a9fca83",
};

const TWO_WORD_PER_CENT = /\bper\s+cent\b/i;

/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").collectBackstopFigures} */
let collectBackstopFigures;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").applyRoundingToleranceBackstop} */
let applyRoundingToleranceBackstop;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage2-match-sources.mjs").hasEgregiousMagnitudeGap} */
let hasEgregiousMagnitudeGap;
/** @type {typeof import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs").aggregateVerdict} */
let aggregateVerdict;
/** @type {typeof import("../../lib/qc/supersession.mjs").resolveSupersession} */
let resolveSupersession;
/** @type {typeof import("../../lib/qc/supersession.mjs").buildAsOfBySourceIndex} */
let buildAsOfBySourceIndex;

async function loadDeps() {
  ({ collectBackstopFigures, applyRoundingToleranceBackstop, hasEgregiousMagnitudeGap } = await import(
    "../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
  ));
  ({ aggregateVerdict } = await import("../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs"));
  ({ resolveSupersession, buildAsOfBySourceIndex } = await import("../../lib/qc/supersession.mjs"));
}

function maskTwoWordPerCent(text) {
  return String(text || "").replace(/\bper\s+cent\b/gi, "per_cent");
}

function percentValues(text) {
  return collectBackstopFigures(text)
    .filter((f) => f.kind === "percent")
    .map((f) => f.value);
}

function figKey(figs) {
  return collectBackstopFigures(typeof figs === "string" ? figs : "")
    .filter((f) => f.kind === "percent")
    .map((f) => `${f.value}:${f.raw}`)
    .sort()
    .join("|");
}

function evidenceKey(agg) {
  return `${agg?.verdict || "not_supported"}|conflict=${agg?.hasConflict === true ? "1" : "0"}`;
}

function trunc(s, n = 96) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function applyNumeric(result, statementText) {
  return applyRoundingToleranceBackstop(result, { statementText });
}

function replayStatement(statement, sourceMatches, asOfBySourceIndex, { mask } = { mask: false }) {
  const stmtIn = mask ? maskTwoWordPerCent(statement) : statement;
  const matches = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => {
    const passage = typeof m.passage === "string" ? m.passage : "";
    const passageIn = mask ? maskTwoWordPerCent(passage) : passage;
    const numeric = applyNumeric(
      {
        classification: m.classification,
        passage: passageIn,
        explanation: typeof m.explanation === "string" ? m.explanation : "",
      },
      stmtIn
    );
    return {
      ...m,
      classification: numeric.classification,
      passage,
      statementFigures: collectBackstopFigures(stmtIn),
      sourceFigures: collectBackstopFigures(passageIn),
    };
  });
  let agg = aggregateVerdict({ statementMatches: matches });
  const resolved = resolveSupersession({
    statement: stmtIn,
    aggregateVerdict: agg.verdict,
    sourceMatches: matches,
    asOfBySourceIndex,
    today: TODAY,
  });
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    const patchedMatches = matches.map((m) =>
      demoted.has(Number(m.sourceIndex))
        ? { ...m, classification: "superseded", originalClassification: m.classification }
        : m
    );
    agg = aggregateVerdict({ statementMatches: patchedMatches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { agg, resolved, matches };
}

function keysOf(text) {
  return new Set(
    collectBackstopFigures(text)
      .filter((f) => f.kind === "percent")
      .flatMap((f) => (Array.isArray(f.keys) ? f.keys : []))
  );
}

function genuineSameMetricMagnitude(statement, sourceMatches) {
  for (const m of Array.isArray(sourceMatches) ? sourceMatches : []) {
    const passage = typeof m.passage === "string" ? m.passage : "";
    if (!hasEgregiousMagnitudeGap(statement, passage)) continue;
    if (!hasEgregiousMagnitudeGap(maskTwoWordPerCent(statement), maskTwoWordPerCent(passage))) {
      const stmtKeys = keysOf(statement);
      const srcKeys = keysOf(passage);
      const overlap = [...stmtKeys].some((k) => srcKeys.has(k));
      if (overlap) {
        return `same-metric magnitude src${m.sourceIndex} stmt=[${percentValues(statement)}] src=[${percentValues(passage)}] keys=${[...stmtKeys].join(",")}`;
      }
    }
  }
  return null;
}

function intendedReason(statement, sourceMatches, baseline, patched) {
  const reasons = [];
  const mag = genuineSameMetricMagnitude(statement, sourceMatches);
  if (mag) reasons.push(mag);
  const baseNotes = baseline?.resolved?.supersededNotes?.length || 0;
  const patchNotes = patched?.resolved?.supersededNotes?.length || 0;
  if (patchNotes > baseNotes) {
    reasons.push(`supersession newly visible (${baseNotes} → ${patchNotes} notes)`);
  }
  const conflictDropped =
    baseline?.agg?.hasConflict === true && patched?.agg?.hasConflict === false && patchNotes > 0;
  if (conflictDropped) reasons.push("supersession demoted older conflict");
  return reasons;
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

async function reconstructFromLangfuse(partialId, sources) {
  const asOfBySourceIndex = buildAsOfBySourceIndex(sources);
  const list = await langfuseGet(`/api/public/traces?limit=100`);
  const traces = Array.isArray(list?.data) ? list.data : [];
  const hit = traces.find((t) => String(t?.id || "").startsWith(partialId));
  const traceId = hit?.id || null;
  if (!traceId) {
    const direct = await langfuseGet(`/api/public/traces/${encodeURIComponent(partialId)}`);
    if (!direct?.id) return null;
    return reconstructFromTraceId(direct.id, sources, asOfBySourceIndex);
  }
  return reconstructFromTraceId(traceId, sources, asOfBySourceIndex);
}

async function reconstructFromTraceId(traceId, sources, asOfBySourceIndex) {
  const obs = await langfuseGet(
    `/api/public/observations?traceId=${encodeURIComponent(traceId)}&limit=100`
  );
  const rows = Array.isArray(obs?.data) ? obs.data : [];
  const stage1 = rows.find((o) => o.name === "stage1-extract-statements");
  const stage1Statements = Array.isArray(stage1?.output?.statements) ? stage1.output.statements : [];
  const stage2 = rows.filter((o) => o.name === "stage2-match-sources");
  if (stage2.length === 0) return null;
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
  if (byStmt.size === 0) return null;
  const statements = [...byStmt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, row]) => ({ index, text: row.statement, matches: row.matches }));
  return { method: `langfuse:${traceId}`, statements, asOfBySourceIndex };
}

async function loadNordholtSources() {
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    const text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    sources.push({ label, text });
  }
  return sources;
}

function printExtractionRow(tag, text) {
  const oldV = percentValues(maskTwoWordPerCent(text));
  const newV = percentValues(text);
  const hasTwoWord = TWO_WORD_PER_CENT.test(text);
  const mark =
    hasTwoWord && oldV.length === 0 && newV.length > 0
      ? "EXTRACT-FIX"
      : hasTwoWord && newV.length === 0
        ? "EXTRACT-MISS"
        : hasTwoWord
          ? "EXTRACT-PARTIAL"
          : "no-per-cent";
  console.log(
    `  ${tag} ${mark} old=[${oldV.join(",")}] new=[${newV.join(",")}] | ${trunc(text, 110)}`
  );
  return { hasTwoWord, oldV, newV, mark };
}

function shadowPair(tag, statement, sourceMatches, asOfBySourceIndex, failures, unexpected, { quietStay = false } = {}) {
  const baseline = replayStatement(statement, sourceMatches, asOfBySourceIndex, { mask: true });
  const patched = replayStatement(statement, sourceMatches, asOfBySourceIndex, { mask: false });
  const from = evidenceKey(baseline.agg);
  const to = evidenceKey(patched.agg);
  const reasons = intendedReason(statement, sourceMatches, baseline, patched);
  const moved = from !== to;
  if (moved) {
    const intended = reasons.length > 0;
    console.log(
      `  ${tag} MOVE ${from} → ${to} intended=${intended ? "yes" : "NO"} | ${trunc(statement, 88)}`
    );
    for (const r of reasons) console.log(`    reason: ${r}`);
    if (!intended) {
      unexpected.push({ tag, statement, from, to });
      failures.push(`${tag} unexpected verdict flip ${from} → ${to}: ${trunc(statement, 80)}`);
      const n = Math.max(baseline.matches.length, patched.matches.length);
      for (let i = 0; i < n; i++) {
        const b = baseline.matches[i];
        const p = patched.matches[i];
        if (!b && !p) continue;
        const bCls = b?.classification;
        const pCls = p?.classification;
        if (bCls !== pCls) {
          console.log(
            `    pair src${p?.sourceIndex ?? b?.sourceIndex} ${bCls} → ${pCls} gap=${hasEgregiousMagnitudeGap(statement, p?.passage || b?.passage || "")} stmt=[${percentValues(statement)}] src=[${percentValues(p?.passage || b?.passage || "")}] keys_stmt=[${[...keysOf(statement)].join(",")}] keys_src=[${[...keysOf(p?.passage || "")].join(",")}] | ${trunc(p?.passage || b?.passage || "", 80)}`
          );
        }
      }
    }
  } else if (!quietStay) {
    console.log(`  ${tag} stay ${from} | ${trunc(statement, 88)}`);
  }
  return { moved, from, to, reasons };
}

async function main() {
  await loadDeps();
  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const failures = [];
  const unexpected = [];
  let extractFixes = 0;
  let extractMisses = 0;

  console.log(`# extractPercents "per cent" GATE`);
  console.log(`Today=${TODAY.toISOString().slice(0, 10)}`);
  console.log(`Corpus baseline=${CORPUS_RUN} (reconstruct; no corpus LLM)`);
  console.log("");

  // --- Extraction unit on Nordholt files ---
  console.log(`## EXTRACT — Nordholt drafts + sources (must go [] → values on 'per cent')`);
  const nordholtFiles = [
    ["clean draft", "draft_hold_update_clean.txt"],
    ["dirty draft", "draft_hold_update_DIRTY.txt"],
    ["IC memo", "source_1_ic_memo.txt"],
    ["press release", "source_2_press_release.txt"],
    ["fact sheet", "source_3_fact_sheet.txt"],
    ["LP update", "source_4_lp_update.txt"],
  ];
  for (const [label, name] of nordholtFiles) {
    let text = "";
    try {
      text = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
    } catch (err) {
      failures.push(`missing Nordholt file ${name}: ${err.message}`);
      continue;
    }
    const row = printExtractionRow(label, text);
    if (row.mark === "EXTRACT-FIX") extractFixes += 1;
    if (row.mark === "EXTRACT-MISS") {
      extractMisses += 1;
      failures.push(`${label}: still extracts [] despite 'per cent' in text`);
    }
  }
  if (extractFixes === 0) {
    failures.push("Nordholt extraction: no file went [] → values");
  } else {
    console.log(`  EXTRACT-FIX files=${extractFixes} misses=${extractMisses}`);
  }

  // --- Corpus ---
  console.log("");
  console.log(`## CORPUS — ${CORPUS_RUN} (verdict/hasConflict must not move unless per-cent figures)`);
  const runData = await loadRun(CORPUS_RUN);
  let corpusStmts = 0;
  let corpusMoves = 0;
  let corpusPerCentHits = 0;
  for (const [fid, data] of [...runData.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    const sources = [];
    // as-of from saved matches only; dates live on source text which we may not have here
    const asOf = {};
    for (const entry of stage2) {
      corpusStmts += 1;
      const statement = typeof entry.statementText === "string" ? entry.statementText : "";
      const matches = Array.isArray(entry.sourceMatches) ? entry.sourceMatches : [];
      if (TWO_WORD_PER_CENT.test(statement) || matches.some((m) => TWO_WORD_PER_CENT.test(m.passage || ""))) {
        corpusPerCentHits += 1;
      }
      const out = shadowPair(
        `${fid}:S${entry.statementIndex ?? "?"}`,
        statement,
        matches,
        asOf,
        failures,
        unexpected,
        { quietStay: true }
      );
      if (out.moved) corpusMoves += 1;
    }
  }
  console.log(
    `  corpus statements=${corpusStmts} per-cent hits=${corpusPerCentHits} moves=${corpusMoves}`
  );

  // --- Supersession fixture texts ---
  console.log("");
  console.log(`## SUPERSESSION fixture texts (expect zero per-cent; zero figure change)`);
  const ssDraft = await readFile(path.join(SUPERSESSION_DIR, "draft_supersession.txt"), "utf8");
  printExtractionRow("ss draft", ssDraft);
  for (const name of [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ]) {
    const text = await readFile(path.join(SUPERSESSION_DIR, name), "utf8");
    printExtractionRow(name, text);
  }
  const ssSources = [];
  for (const name of [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ]) {
    ssSources.push({
      label: name,
      text: await readFile(path.join(SUPERSESSION_DIR, name), "utf8"),
    });
  }
  const ssAsOf = buildAsOfBySourceIndex(ssSources);
  // Reconstruct 4 statements from the draft file (period-separated).
  const ssStatements = ssDraft
    .split(/(?<=\.)\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  console.log(`  statements=${ssStatements.length}`);
  for (let i = 0; i < ssStatements.length; i++) {
    const statement = ssStatements[i];
    const matches = ssSources.map((src, sourceIndex) => ({
      sourceIndex,
      sourceLabel: src.label,
      classification: "confirmed",
      passage: src.text.slice(0, 400),
      explanation: "fixture reconstruct",
    }));
    shadowPair(`ss:S${i}`, statement, matches, ssAsOf, failures, unexpected);
  }

  // --- Nordholt verdict from Langfuse if present ---
  console.log("");
  console.log(`## NORDHOLT expanded (Langfuse reconstruct if traces visible)`);
  let nordholtSources = [];
  try {
    nordholtSources = await loadNordholtSources();
  } catch (err) {
    failures.push(`Nordholt sources: ${err.message}`);
  }
  if (nordholtSources.length) {
    for (const [label, partial] of [
      ["clean", NORDHOLT_TRACES.clean],
      ["dirty", NORDHOLT_TRACES.dirty],
    ]) {
      const recon = await reconstructFromLangfuse(partial, nordholtSources);
      if (!recon) {
        console.log(`  ${label} trace ${partial}: not in Langfuse (extraction already checked on local files)`);
        continue;
      }
      console.log(`  ${label} via ${recon.method} statements=${recon.statements.length}`);
      for (const row of recon.statements) {
        shadowPair(`nordholt-${label}:S${row.index}`, row.text, row.matches, recon.asOfBySourceIndex, failures, unexpected);
      }
    }

    // Deterministic magnitude overlay on local sentence-ish splits vs each source text.
    // Not a verdict (passages are not Stage-2 excerpts); flags egregious per-cent gaps the backstop would now see.
    console.log("");
    console.log(`## NORDHOLT magnitude reachability (statement vs full source text; not Stage-2 passages)`);
    for (const [label, name] of [
      ["clean", "draft_hold_update_clean.txt"],
      ["dirty", "draft_hold_update_DIRTY.txt"],
    ]) {
      const draft = await readFile(path.join(NORDHOLT_DIR, name), "utf8");
      const sentences = draft.split(/(?<=\.)\s+/).map((t) => t.trim()).filter(Boolean);
      for (let i = 0; i < sentences.length; i++) {
        const stmt = sentences[i];
        if (!TWO_WORD_PER_CENT.test(stmt)) continue;
        for (let s = 0; s < nordholtSources.length; s++) {
          const src = nordholtSources[s];
          const oldHit = applyNumeric(
            { classification: "partially_confirmed", passage: maskTwoWordPerCent(src.text), explanation: "" },
            maskTwoWordPerCent(stmt)
          );
          const newHit = applyNumeric(
            { classification: "partially_confirmed", passage: src.text, explanation: "" },
            stmt
          );
          if (oldHit.classification !== newHit.classification) {
            console.log(
              `  ${label} S${i} vs ${src.label}: numeric ${oldHit.classification} → ${newHit.classification} stmt=[${percentValues(stmt)}] src=[${percentValues(src.text)}]`
            );
          }
        }
      }
    }
  }

  console.log("");
  if (unexpected.length) {
    console.log(`## FAIL — unexpected flips`);
    for (const u of unexpected) {
      console.log(`  ${u.tag} ${u.from} → ${u.to} | ${trunc(u.statement, 120)}`);
    }
  }
  if (failures.length) {
    console.log(`GATE FAIL (${failures.length})`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`GATE PASS`);
  console.log(`  extractFixes=${extractFixes} corpusMoves=${corpusMoves} unexpected=0`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
