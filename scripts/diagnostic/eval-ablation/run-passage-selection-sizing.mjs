#!/usr/bin/env node
/**
 * Free scan: passage-selection false-red sizing. No model calls.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { BASELINE_PATH } from "../claim-spans/baseline-cache.mjs";
import {
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
  hasEgregiousMagnitudeGap,
  collectBackstopFigures,
} from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const B67 = path.join(DIAG_ROOT, "b67-probe");

function nearlyEqual(a, b) {
  if (a === b) return true;
  const hi = Math.max(Math.abs(a), Math.abs(b));
  const lo = Math.min(Math.abs(a), Math.abs(b));
  if (lo === 0) return hi === 0;
  // percent rounding 18.6 -> 19; also 1.9 vs 1.90
  if (Math.abs(a - b) <= 0.051 && hi < 1000) return true;
  if (Math.abs(a - b) / hi <= 0.02 && hi >= 10) return true;
  return false;
}

/**
 * Extract checkable figures. Skip 4-digit years 1900-2099 unless marked as %/x/money.
 */
function extractFigures(text) {
  const t = String(text || "");
  const out = [];
  const seen = new Set();
  function add(value, raw, kind) {
    if (!Number.isFinite(value)) return;
    const key = `${kind}:${value}:${raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, raw, kind });
  }

  let m;
  const percentRe = /(\d+(?:\.\d+)?)\s*(?:%|(?:per\s?cent)\b|percent\b)/gi;
  while ((m = percentRe.exec(t))) add(Number(m[1]), m[0], "percent");

  const multipleRe = /(\d+(?:\.\d+)?)\s*(?:x\b|times\b)/gi;
  while ((m = multipleRe.exec(t))) add(Number(m[1]), m[0], "multiple");

  const moneyRe =
    /(USD|EUR|GBP|AUD|CAD|\$|€|£)\s*([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn|k|m)?\b|([\d,.'\u2019]+)\s*(million|billion|thousand|mm|bn)\b/gi;
  while ((m = moneyRe.exec(t))) {
    const n = Number(String(m[2] || m[4] || "").replace(/[,']/g, "").replace(/\u2019/g, ""));
    if (!Number.isFinite(n)) continue;
    add(n, m[0], "money");
  }

  const genericRe = /\b(\d{1,3}(?:,\d{3})+|\d+\.\d+|\d+)\b/g;
  while ((m = genericRe.exec(t))) {
    const raw = m[1];
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n >= 1900 && n <= 2099 && Number.isInteger(n)) continue;
    // skip tiny ordinals already captured; keep 2.6, 14, 10000, 8
    if (n === 0) continue;
    add(n, raw, "number");
  }
  return out;
}

function anyFigureOverlap(stmtFigs, passFigs) {
  for (const s of stmtFigs) {
    for (const p of passFigs) {
      if (nearlyEqual(s.value, p.value)) return true;
    }
  }
  return false;
}

function splitSentences(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+(?=[A-Z("])/).filter(Boolean);
}

function sourceHasStatementFigure(sourceText, stmtFigs) {
  if (!stmtFigs.length) return { has: false, sentence: null };
  const sentences = splitSentences(sourceText);
  for (const sent of sentences) {
    const figs = extractFigures(sent);
    if (anyFigureOverlap(stmtFigs, figs)) return { has: true, sentence: sent.slice(0, 180) };
  }
  // also search raw source without sentence split
  const all = extractFigures(sourceText);
  if (anyFigureOverlap(stmtFigs, all)) {
    return { has: true, sentence: "(figure present in source; sentence split missed)" };
  }
  return { has: false, sentence: null };
}

function metricFamilyHits(text) {
  const t = String(text || "");
  const families = {
    multiple: [],
    irr: [],
    revenue: [],
  };
  const figs = extractFigures(t);
  for (const f of figs) {
    if (f.kind === "multiple" || /\bmoic\b/i.test(t)) {
      if (f.kind === "multiple") families.multiple.push(f.value);
    }
  }
  // IRR percents near IRR
  const irrRe = /(\d+(?:\.\d+)?)\s*(?:%|(?:per\s?cent)|percent)[^.]{0,40}\bIRR\b|\bIRR\b[^.]{0,40}(\d+(?:\.\d+)?)\s*(?:%|(?:per\s?cent)|percent)/gi;
  let m;
  while ((m = irrRe.exec(t))) {
    families.irr.push(Number(m[1] || m[2]));
  }
  const moicRe = /(\d+(?:\.\d+)?)\s*(?:x|times)\s*(?:gross\s+)?MOIC|\bMOIC\b[^.]{0,30}(\d+(?:\.\d+)?)\s*x/gi;
  while ((m = moicRe.exec(t))) {
    families.multiple.push(Number(m[1] || m[2]));
  }
  const revRe = /\brevenue\b[^.]{0,50}?(\d+(?:\.\d+)?)\s*(million|billion|m\b)|(\d+(?:\.\d+)?)\s*(million|billion)\s+[^.]{0,20}revenue/gi;
  while ((m = revRe.exec(t))) {
    families.revenue.push(Number(m[1] || m[3]));
  }
  const unique = (arr) => [...new Set(arr.filter((n) => Number.isFinite(n)))];
  return {
    multiple: unique(families.multiple),
    irr: unique(families.irr),
    revenue: unique(families.revenue),
  };
}

function repeatsMetric(sourceText) {
  const f = metricFamilyHits(sourceText);
  return f.multiple.length >= 2 || f.irr.length >= 2 || f.revenue.length >= 2;
}

async function tryRead(p) {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function loadNordholtSources() {
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  let from = "downloads";
  for (const [name, label] of files) {
    let text = await tryRead(path.join(NORDHOLT_DIR, name));
    if (!text) {
      from = "b67-fallback";
      const map = {
        "source_1_ic_memo.txt": "source_ic_memo.txt",
        "source_2_press_release.txt": "source_press_release.txt",
        "source_3_fact_sheet.txt": "source_fact_sheet.txt",
        "source_4_lp_update.txt": "source_lp_update.txt",
      };
      text = await tryRead(path.join(B67, map[name]));
    }
    if (text) sources.push({ text, label });
  }
  return { sources, from };
}

async function buildSourceMap() {
  const map = new Map(); // pairId prefix caseLabel -> label -> text
  const nordholt = await loadNordholtSources();
  for (const kind of ["nordholt-clean", "nordholt-dirty"]) {
    map.set(kind, new Map(nordholt.sources.map((s) => [s.label, s.text])));
  }
  const superFiles = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const superMap = new Map();
  for (const name of superFiles) {
    const text = await tryRead(path.join(SUPERSESSION_DIR, name));
    if (text) superMap.set(name.replace(/\.txt$/, ""), text);
  }
  map.set("supersession", superMap);

  const ic = await tryRead(path.join(ACCIDENT_DIR, "source_ic_memo.txt"));
  for (const id of ["E1", "E2", "E3"]) {
    map.set(id, new Map([["ic_memo", ic || ""]]));
  }

  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    const label = `F${String(n).padStart(2, "0")}`;
    const sources = await loadPipelineSources(fx.data.sources || []);
    map.set(label, new Map(sources.map((s) => [s.label, s.text])));
  }

  for (const [caseLabel, files] of [
    ["F90", ["90_adversarial_b17_latent.txt"]],
    ["F91", ["91_adversarial_shopify_2010_trimmed.txt"]],
    ["F92", ["91_adversarial_shopify_2010_trimmed.txt"]],
  ]) {
    const sources = await loadPipelineSources(files);
    map.set(caseLabel, new Map(sources.map((s) => [s.label, s.text])));
  }

  return { map, nordholtFrom: nordholt.from };
}

function lookupSource(sourceMap, pairId, caseLabel, sourceLabel) {
  const m = sourceMap.get(caseLabel);
  if (m?.has(sourceLabel)) return m.get(sourceLabel);
  if (m) {
    for (const [k, v] of m) {
      if (k.includes(sourceLabel) || sourceLabel.includes(k)) return v;
    }
    if (m.size === 1) return [...m.values()][0];
  }
  return null;
}

function replayBackstop(classification, passage, statementText, periodAssessment) {
  const rounded = applyRoundingToleranceBackstop(
    { classification, passage, explanation: "", periodAssessment },
    { statementText, periodAssessment }
  );
  const gated = applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment,
    },
    { statementText }
  );
  return {
    after: gated.classification,
    gap: hasEgregiousMagnitudeGap(statementText, passage),
    backstopFiguresStmt: collectBackstopFigures(statementText),
    backstopFiguresPass: collectBackstopFigures(passage),
  };
}

async function main() {
  const hunting = JSON.parse(
    await readFile(path.join(DIAG_ROOT, "eval-ablation/f93-restage-and-hunting-rows.json"), "utf8")
  );
  const blast = JSON.parse(
    await readFile(path.join(DIAG_ROOT, "eval-ablation/r3a-corpus-blast-rows.json"), "utf8")
  );
  const r9 = JSON.parse(
    await readFile(path.join(DIAG_ROOT, "eval-ablation/r9-basis-conflict-rows.json"), "utf8")
  );

  const s2 = hunting.rows.filter((r) => r.statementId === "F93_S2");
  const s2Replay = s2.map((r) => {
    const replay = replayBackstop(
      "confirmed",
      r.passage,
      r.statementText,
      r.periodAssessment
    );
    const replayFromConflicting = replayBackstop(
      "conflicting",
      r.passage,
      r.statementText,
      r.periodAssessment
    );
    return {
      runIndex: r.runIndex,
      classification: r.classification,
      preBackstopClassification: null,
      backstopChanged: null,
      note: "hunting harness did not persist preBackstop; replay below",
      replayIfModelConfirmed: replay.after,
      replayIfModelConflicting: replayFromConflicting.after,
      gapWouldForce: replay.gap,
      backstopStmt: replay.backstopFiguresStmt,
      backstopPass: replay.backstopFiguresPass,
      explanation: r.explanation,
      passage: r.passage,
    };
  });

  const { map: sourceMap, nordholtFrom } = await buildSourceMap();

  const pairs = new Map();
  for (const r of blast.corpusRows.filter((x) => x.variantId === "R3a")) {
    if (!pairs.has(r.pairId)) pairs.set(r.pairId, r);
  }

  const misses = [];
  const withFigs = [];
  let nStmtHasFig = 0;
  let nRepeat = 0;
  let nRepeatMiss = 0;
  let nNonRepeat = 0;
  let nNonRepeatMiss = 0;
  let nSourceUnresolved = 0;
  let nBetterAvailable = 0;
  let nBetterUnavailable = 0;

  for (const r of pairs.values()) {
    const stmtFigs = extractFigures(r.statementText);
    const passFigs = extractFigures(r.passage);
    const hasStmtFig = stmtFigs.length > 0;
    if (!hasStmtFig) continue;
    nStmtHasFig += 1;
    const sourceText = lookupSource(sourceMap, r.pairId, r.caseLabel, r.sourceLabel);
    const repeat = sourceText ? repeatsMetric(sourceText) : false;
    if (sourceText) {
      if (repeat) nRepeat += 1;
      else nNonRepeat += 1;
    } else nSourceUnresolved += 1;

    const miss = !anyFigureOverlap(stmtFigs, passFigs);
    const rec = {
      pairId: r.pairId,
      caseLabel: r.caseLabel,
      statementId: r.statementId,
      classification: r.classification,
      statementText: r.statementText,
      passage: r.passage,
      explanation: r.explanation,
      stmtFigs,
      passFigs,
      miss,
      repeat,
      sourceResolved: Boolean(sourceText),
    };
    if (miss) {
      misses.push(rec);
      if (sourceText) {
        if (repeat) nRepeatMiss += 1;
        else nNonRepeatMiss += 1;
        const better = sourceHasStatementFigure(sourceText, stmtFigs);
        rec.betterAvailable = better.has;
        rec.betterSentence = better.sentence;
        if (better.has) nBetterAvailable += 1;
        else nBetterUnavailable += 1;
      } else {
        rec.betterAvailable = null;
      }
    }
    withFigs.push(rec);
  }

  const missByLabel = {};
  for (const m of misses) {
    missByLabel[m.classification] = (missByLabel[m.classification] || 0) + 1;
  }
  const conflictingMisses = misses.filter((m) => m.classification === "conflicting");
  const conflictingWithBetter = conflictingMisses.filter((m) => m.betterAvailable);

  // Q5 six false greens from part1 + EA_E3 from r9 R3a
  const part1 = blast.part1?.rows || [];
  function part1Passages(id) {
    return part1.filter((r) => r.id === id || r.statementId === id);
  }

  const six = [];
  const fgIds = [
    ["EA_E2", "eval-ablation/meridian_source.txt"],
    ["CS_E3", "claim-spans/evaluative-accident/source_ic_memo.txt"],
    ["F01_S10", "01_bvp_shopify_memo.txt"],
    ["F04_S20", "04_synth_vc_pinterest_style_memo.txt"],
    ["F12_S0", "12_synth_linkedin_post.txt"],
    ["EA_E3", "eval-ablation/meridian_source.txt"],
  ];

  for (const [id, file] of fgIds) {
    let rows;
    if (id === "EA_E3") {
      rows = r9.rows.filter((r) => r.variantId === "R3a" && r.statementId === "EA_E3");
    } else {
      rows = part1.filter((r) => String(r.id || r.statementId) === id);
      if (!rows.length) {
        // part1.summary only? look at part1.rows shape
        rows = part1.filter((r) => String(r.statementId || r.id || "").includes(id));
      }
    }
    six.push({
      id,
      file,
      n: rows.length,
      sample: rows.slice(0, 3).map((r) => ({
        classification: r.classification,
        statement: (r.statementText || r.statement || "").slice(0, 160),
        passage: (r.passage || "").slice(0, 220),
        explanation: (r.explanation || "").slice(0, 220),
        stmtFigs: extractFigures(r.statementText || r.statement),
        passFigs: extractFigures(r.passage),
        overlap: anyFigureOverlap(
          extractFigures(r.statementText || r.statement),
          extractFigures(r.passage)
        ),
      })),
    });
  }

  const out = {
    nordholtFrom,
    s2Replay,
    nPairs: pairs.size,
    nStmtHasFig,
    nMiss: misses.length,
    missByLabel,
    nConflictingMiss: conflictingMisses.length,
    nBetterAvailable,
    nBetterUnavailable,
    nSourceUnresolved,
    nRepeat,
    nRepeatMiss,
    nNonRepeat,
    nNonRepeatMiss,
    missRateRepeat: nRepeat ? nRepeatMiss / nRepeat : null,
    missRateNonRepeat: nNonRepeat ? nNonRepeatMiss / nNonRepeat : null,
    conflictingMisses,
    conflictingWithBetter,
    six,
    part1Keys: part1[0] ? Object.keys(part1[0]) : [],
    part1SampleIds: [...new Set(part1.map((r) => r.id || r.statementId))].slice(0, 20),
  };

  await writeFile(
    path.join(DIAG_ROOT, "eval-ablation/passage-selection-sizing-scan.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify({
    nordholtFrom,
    nPairs: out.nPairs,
    nStmtHasFig: out.nStmtHasFig,
    nMiss: out.nMiss,
    missByLabel: out.missByLabel,
    nConflictingMiss: out.nConflictingMiss,
    nBetterAvailable: out.nBetterAvailable,
    nBetterUnavailable: out.nBetterUnavailable,
    nSourceUnresolved: out.nSourceUnresolved,
    nRepeat: out.nRepeat,
    nRepeatMiss: out.nRepeatMiss,
    nNonRepeat: out.nNonRepeat,
    nNonRepeatMiss: out.nNonRepeatMiss,
    missRateRepeat: out.missRateRepeat,
    missRateNonRepeat: out.missRateNonRepeat,
    nConflictingWithBetter: out.conflictingWithBetter.length,
    s2gap: out.s2Replay[0]?.gapWouldForce,
    s2replayConf: out.s2Replay[0]?.replayIfModelConfirmed,
    six: out.six.map((s) => ({ id: s.id, n: s.n, overlap: s.sample.map((x) => x.overlap) })),
    part1Keys: out.part1Keys,
    part1SampleIds: out.part1SampleIds,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
