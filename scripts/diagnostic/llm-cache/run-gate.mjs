#!/usr/bin/env node
/**
 * B63 LLM result cache gate (read-only, no commit).
 *
 * Usage:
 *   node scripts/diagnostic/llm-cache/run-gate.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const STAGE2_PROMPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../lib/qc/pipeline-v4/prompts/stage2_v4.md"
);

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources, matchClaimSourcePairs, resetStage2PromptCache } = await import(
  "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { residualHasUnclaimedAnchor, rollupClaimVerdicts } = await import("../../../lib/qc/claim-spans.mjs");
const {
  CACHE_VERSION,
  beginCacheRun,
  createMemoryStore,
  endCacheRun,
  isLlmCacheEnabled,
  logCacheRunSummary,
  resetLlmCacheStore,
  setCacheVersionOverride,
  setLlmCacheStore,
  withLlmCache,
} = await import("../../../lib/qc/llm-cache.mjs");

function pct(rate) {
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

function money(n) {
  return `$${Number(n || 0).toFixed(4)}`;
}

function canonical(value) {
  return JSON.stringify(value);
}

async function loadNordholt(kind) {
  const draftName = kind === "dirty" ? "draft_hold_update_DIRTY.txt" : "draft_hold_update_clean.txt";
  try {
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
  } catch {
    return null;
  }
}

async function loadSupersession() {
  try {
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
  } catch {
    return null;
  }
}

async function loadCorpusCases() {
  const out = [];
  for (const kind of ["clean", "dirty"]) {
    const row = await loadNordholt(kind);
    if (row) out.push(row);
  }
  const supersession = await loadSupersession();
  if (supersession) out.push(supersession);
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
    } catch {
      /* skip unloadable */
    }
  }
  return out;
}

function withSupersession(statementText, sourceMatches, asOfBySourceIndex) {
  const matches = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({ ...m }));
  let agg = aggregateVerdict({ statementMatches: matches });
  const resolved = resolveSupersession({
    statement: statementText,
    aggregateVerdict: agg.verdict,
    sourceMatches: matches,
    asOfBySourceIndex,
    today: TODAY,
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

function mergeUsage(a, b) {
  return {
    inputTokens: (Number(a?.inputTokens) || 0) + (Number(b?.inputTokens) || 0),
    outputTokens: (Number(a?.outputTokens) || 0) + (Number(b?.outputTokens) || 0),
  };
}

async function runEvidence(caseRow) {
  const stage1 = await extractStatements({ draftText: caseRow.draft });
  const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const { matches } = await matchAllSources({ statements, sources: caseRow.sources });
  const asOf = buildAsOfBySourceIndex(caseRow.sources);
  const stage1b = await extractClaimSpans({
    statements,
    draftText: caseRow.draft,
    options: { claimSpansEnabled: true },
  });
  const claimJobs = [];
  for (const [statementIndex, claims] of stage1b.byStatementIndex.entries()) {
    const parent = statements.find((s, ord) => (Number.isFinite(s?.index) ? Number(s.index) : ord) === statementIndex);
    const parentSentence = typeof parent?.text === "string" ? parent.text : "";
    for (const claim of claims) {
      claimJobs.push({
        statementIndex,
        claimIndex: claim.index,
        text: claim.text,
        parentSentence,
      });
    }
  }
  const claimMatchResult =
    claimJobs.length > 0 ? await matchClaimSourcePairs({ claims: claimJobs, sources: caseRow.sources }) : { matches: [] };
  const claimPairMatches = Array.isArray(claimMatchResult.matches) ? claimMatchResult.matches : [];

  const rows = statements.map((s, ord) => {
    const statementIndex = Number.isFinite(s?.index) ? Number(s.index) : ord;
    const text = typeof s?.text === "string" ? s.text : "";
    const sourceMatches = (matches || [])
      .filter((m) => Number(m.statementIndex) === statementIndex)
      .slice()
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    const off = withSupersession(text, sourceMatches, asOf);
    const wholeSentenceHasConflict = sourceMatches.some(
      (m) => String(m?.classification || "").trim() === "conflicting"
    );
    const claims = stage1b.byStatementIndex.get(statementIndex) || [];
    let onVerdict = off.agg.verdict;
    let claimUpgrade = false;
    const claimBreakdown = [];
    const claimClassifications = [];
    const claimSpans = claims.map((c) => ({
      index: c.index,
      text: c.text,
      localStart: c.localStart,
      localEnd: c.localEnd,
      draftStart: c.draftStart,
      draftEnd: c.draftEnd,
    }));
    if (claims.length >= 2) {
      for (const claim of claims) {
        const claimMatches = claimPairMatches.filter(
          (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
        );
        const claimResolved = withSupersession(claim.text, claimMatches, asOf);
        claimBreakdown.push({
          index: claim.index,
          text: claim.text,
          verdict: claimResolved.agg.verdict,
          hasConflict: claimResolved.agg.hasConflict === true,
        });
        for (const m of claimMatches) {
          claimClassifications.push({
            claimText: claim.text,
            sourceIndex: m.sourceIndex,
            sourceLabel: m.sourceLabel,
            classification: m.classification,
            passage: m.passage,
            explanation: m.explanation,
          });
        }
      }
      const residual = residualHasUnclaimedAnchor(text, claims);
      const rolled = rollupClaimVerdicts({
        vToday: off.agg.verdict,
        claimVerdicts: claimBreakdown.map((c) => c.verdict),
        residualBlocked: residual.blocked,
        wholeSentenceHasConflict,
      });
      onVerdict = rolled.verdict;
      claimUpgrade = rolled.claimUpgrade === true;
    }
    return {
      statementIndex,
      text,
      verdict: onVerdict,
      hasConflict: off.agg.hasConflict === true,
      claimUpgrade,
      classifications: sourceMatches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
        passage: m.passage,
        explanation: m.explanation,
      })),
      claimSpans,
      claimBreakdown,
      claimClassifications,
    };
  });

  let usage = {
    inputTokens: Number(stage1?.usage?.inputTokens) || 0,
    outputTokens: Number(stage1?.usage?.outputTokens) || 0,
  };
  usage = mergeUsage(usage, stage1b?.stats?.usage);
  let costUsd = Number(stage1?.costUsd) || 0;
  costUsd += Number(stage1b?.stats?.costUsd) || 0;
  for (const m of matches || []) {
    usage = mergeUsage(usage, m.usage);
    costUsd += Number(m.costUsd) || 0;
  }
  for (const m of claimPairMatches) {
    usage = mergeUsage(usage, m.usage);
    costUsd += Number(m.costUsd) || 0;
  }

  return {
    label: caseRow.label,
    statements,
    rows,
    usage,
    costUsd,
    snapshot: rows.map((r) => ({
      text: r.text,
      verdict: r.verdict,
      hasConflict: r.hasConflict,
      classifications: r.classifications,
      claimSpans: r.claimSpans,
      claimBreakdown: r.claimBreakdown,
      claimClassifications: r.claimClassifications,
    })),
  };
}

function diffSnapshots(coldMap, warmMap) {
  const diffs = [];
  const labels = new Set([...coldMap.keys(), ...warmMap.keys()]);
  for (const label of labels) {
    const a = canonical(coldMap.get(label) || null);
    const b = canonical(warmMap.get(label) || null);
    if (a !== b) diffs.push(label);
  }
  return diffs;
}

function editOneLetter(text) {
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch >= "a" && ch <= "z") {
      return `${s.slice(0, i)}${ch === "a" ? "b" : "a"}${s.slice(i + 1)}`;
    }
    if (ch >= "A" && ch <= "Z") {
      return `${s.slice(0, i)}${ch === "A" ? "B" : "A"}${s.slice(i + 1)}`;
    }
  }
  return `${s} x`;
}

function stageEvents(summary, stage) {
  return (summary.events || []).filter((e) => e.stage === stage);
}

function formatStatsRow(name, summary, usage, costUsd) {
  const tokens = (Number(usage?.inputTokens) || 0) + (Number(usage?.outputTokens) || 0);
  return {
    run: name,
    hits: summary.hits,
    misses: summary.misses,
    hitRate: pct(summary.hitRate),
    stage1HitRate: pct(summary.byStage.stage1.hitRate),
    stage1bHitRate: pct(summary.byStage.stage1b.hitRate),
    stage2HitRate: pct(summary.byStage.stage2.hitRate),
    liveTokens: tokens,
    liveCostUsd: Number(costUsd || 0),
    tokensAvoided: summary.tokensAvoided,
    costAvoidedUsd: summary.costAvoidedUsd,
  };
}

function printTable(title, rows) {
  console.log("");
  console.log(`## ${title}`);
  if (!rows.length) {
    console.log("(empty)");
    return;
  }
  const keys = Object.keys(rows[0]);
  console.log(keys.join(" | "));
  console.log(keys.map(() => "---").join(" | "));
  for (const row of rows) {
    console.log(keys.map((k) => String(row[k])).join(" | "));
  }
}

async function runCases(cases) {
  const results = [];
  let usage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  const snapshots = new Map();
  for (const caseRow of cases) {
    console.log(`  running ${caseRow.label}`);
    const ev = await runEvidence(caseRow);
    results.push(ev);
    usage = mergeUsage(usage, ev.usage);
    costUsd += ev.costUsd;
    snapshots.set(caseRow.label, ev.snapshot);
  }
  return { results, usage, costUsd, snapshots };
}

function pickEditTarget(cases, results) {
  let best = null;
  for (let i = 0; i < results.length; i += 1) {
    const stmts = results[i].statements || [];
    if (stmts.length < 2) continue;
    if (!best || stmts.length > best.statements.length) {
      best = { caseRow: cases[i], evidence: results[i], statements: stmts };
    }
  }
  if (best) return best;
  for (let i = 0; i < results.length; i += 1) {
    const stmts = results[i].statements || [];
    if (stmts.length >= 1) return { caseRow: cases[i], evidence: results[i], statements: stmts };
  }
  return null;
}

function pickMultiSource(cases) {
  let best = null;
  for (const caseRow of cases) {
    const n = Array.isArray(caseRow.sources) ? caseRow.sources.length : 0;
    if (n >= 2 && (!best || n > best.sources.length)) best = caseRow;
  }
  return best || cases[0] || null;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const store = createMemoryStore();
  setLlmCacheStore(store);

  const cases = await loadCorpusCases();
  if (cases.length === 0) {
    console.error("No corpus cases loaded");
    process.exit(1);
  }
  console.log(`corpus cases: ${cases.map((c) => c.label).join(", ")}`);

  const report = {
    persistence: {
      store: "process-global in-memory Map",
      collection: "qc_llm_cache",
      why: "Draft version history is in-memory frontend React state; the backend has no document store. Cached rows hold client draft and source text, so they stay in that same trust boundary.",
    },
    tests: {},
  };

  // ---- TEST 1 identity ----
  process.env.QC_LLM_CACHE = "1";
  await store.clear();
  console.log("\nTEST 1 cold (cache ON, empty)");
  beginCacheRun({ recordEvents: false });
  const cold = await runCases(cases);
  const coldStats = endCacheRun();
  logCacheRunSummary(coldStats, "test1-cold");

  console.log("TEST 1 warm (cache ON, populated)");
  beginCacheRun({ recordEvents: false });
  const warm = await runCases(cases);
  const warmStats = endCacheRun();
  logCacheRunSummary(warmStats, "test1-warm");

  const identityDiffs = diffSnapshots(cold.snapshots, warm.snapshots);
  const test1Pass = identityDiffs.length === 0;
  report.tests.test1 = {
    pass: test1Pass,
    diffCount: identityDiffs.length,
    diffs: identityDiffs,
    cold: formatStatsRow("cold", coldStats, cold.usage, cold.costUsd),
    warm: formatStatsRow("warm", warmStats, warm.usage, warm.costUsd),
  };
  printTable("TEST 1 identity", [
    {
      check: "byte-identical cards",
      diffCount: identityDiffs.length,
      result: test1Pass ? "PASS" : "FAIL",
    },
  ]);

  // ---- TEST 2 invalidation ----
  const invalidationRows = [];
  let test2aStats = null;
  let test2aUsage = { inputTokens: 0, outputTokens: 0 };
  let test2aCost = 0;

  const editTarget = pickEditTarget(cases, cold.results);
  if (!editTarget) throw new Error("no edit target for TEST 2a");
  const originalStmt = editTarget.statements[0].text;
  const editedStmt = editOneLetter(originalStmt);
  const editedDraft = editTarget.caseRow.draft.includes(originalStmt)
    ? editTarget.caseRow.draft.replace(originalStmt, editedStmt)
    : `${editedStmt}\n${editTarget.caseRow.draft}`;
  console.log(`\nTEST 2a edit one sentence in ${editTarget.caseRow.label}`);
  beginCacheRun({ recordEvents: true });
  const editedCase = { ...editTarget.caseRow, draft: editedDraft };
  const ev2a = await runEvidence(editedCase);
  test2aStats = endCacheRun();
  test2aUsage = ev2a.usage;
  test2aCost = ev2a.costUsd;
  logCacheRunSummary(test2aStats, "test2a-edited-draft");

  const s2events = stageEvents(test2aStats, "stage2").filter((e) => e.parentSentence === null);
  const unchangedTexts = new Set(editTarget.statements.map((s) => s.text).filter((t) => t !== originalStmt));
  const editedStmtMisses = s2events.filter((e) => !unchangedTexts.has(e.inputText));
  const otherStmtEvents = s2events.filter((e) => unchangedTexts.has(e.inputText));
  const otherHits = otherStmtEvents.filter((e) => e.hit);
  const otherMisses = otherStmtEvents.filter((e) => !e.hit);
  const editedAllMiss = editedStmtMisses.length > 0 && editedStmtMisses.every((e) => !e.hit);
  const othersAllHit = otherStmtEvents.length > 0 && otherMisses.length === 0;
  const test2aPass = editedAllMiss && othersAllHit;
  invalidationRows.push({
    case: "2a edit one sentence",
    expected: "edited statement misses on every source; others hit",
    stage2EditedMisses: editedStmtMisses.filter((e) => !e.hit).length,
    stage2EditedHits: editedStmtMisses.filter((e) => e.hit).length,
    stage2OtherHits: otherHits.length,
    stage2OtherMisses: otherMisses.length,
    hitRate: pct(test2aStats.hitRate),
    result: test2aPass ? "PASS" : "FAIL",
  });

  const multi = pickMultiSource(cases);
  console.log(`TEST 2b edit one source in ${multi.label}`);
  const editedSources = multi.sources.map((s, i) =>
    i === 0 ? { ...s, text: editOneLetter(s.text) } : s
  );
  beginCacheRun({ recordEvents: true });
  await runEvidence({ ...multi, sources: editedSources });
  const stats2b = endCacheRun();
  logCacheRunSummary(stats2b, "test2b-edited-source");
  const s2b = stageEvents(stats2b, "stage2");
  const editedSourceText = editedSources[0].text;
  const originalSourceText = multi.sources[0].text;
  const editedSourceEvents = s2b.filter((e) => e.sourceText === editedSourceText);
  const otherSourceEvents = s2b.filter((e) => e.sourceText !== editedSourceText && e.sourceText !== originalSourceText);
  const test2bPass =
    editedSourceEvents.length > 0 &&
    editedSourceEvents.every((e) => !e.hit) &&
    otherSourceEvents.every((e) => e.hit);
  invalidationRows.push({
    case: "2b edit one source",
    expected: "that source misses; other sources hit",
    editedMisses: editedSourceEvents.filter((e) => !e.hit).length,
    editedHits: editedSourceEvents.filter((e) => e.hit).length,
    otherHits: otherSourceEvents.filter((e) => e.hit).length,
    otherMisses: otherSourceEvents.filter((e) => !e.hit).length,
    hitRate: pct(stats2b.hitRate),
    result: test2bPass ? "PASS" : "FAIL",
  });

  console.log(`TEST 2c add a new source to ${multi.label}`);
  const addedSources = [...multi.sources, { label: "gate-new-source", text: "Gate added source. Revenue was EUR 1." }];
  beginCacheRun({ recordEvents: true });
  await runEvidence({ ...multi, sources: addedSources });
  const stats2c = endCacheRun();
  logCacheRunSummary(stats2c, "test2c-added-source");
  const s2c = stageEvents(stats2c, "stage2");
  const newSourceText = addedSources[addedSources.length - 1].text;
  const newEvents = s2c.filter((e) => e.sourceText === newSourceText);
  const existingEvents = s2c.filter((e) => e.sourceText !== newSourceText);
  const test2cPass = newEvents.length > 0 && newEvents.every((e) => !e.hit) && existingEvents.every((e) => e.hit);
  invalidationRows.push({
    case: "2c add a new source",
    expected: "only the new source is called; existing pairs hit",
    newMisses: newEvents.filter((e) => !e.hit).length,
    newHits: newEvents.filter((e) => e.hit).length,
    existingHits: existingEvents.filter((e) => e.hit).length,
    existingMisses: existingEvents.filter((e) => !e.hit).length,
    hitRate: pct(stats2c.hitRate),
    result: test2cPass ? "PASS" : "FAIL",
  });

  const promptOriginal = await readFile(STAGE2_PROMPT_PATH, "utf8");
  let test2dPass = false;
  let test2ePass = false;
  try {
    console.log(`TEST 2d change one character in stage2_v4.md (${multi.label})`);
    const needle = "You classify";
    if (!promptOriginal.includes(needle)) throw new Error("stage2_v4.md missing expected opener");
    await writeFile(STAGE2_PROMPT_PATH, promptOriginal.replace(needle, "You klassify"), "utf8");
    resetStage2PromptCache();
    beginCacheRun({ recordEvents: true });
    await runEvidence(multi);
    const stats2d = endCacheRun();
    logCacheRunSummary(stats2d, "test2d-prompt-hash");
    const s1d = stageEvents(stats2d, "stage1");
    const s1bd = stageEvents(stats2d, "stage1b");
    const s2d = stageEvents(stats2d, "stage2");
    test2dPass =
      s2d.length > 0 &&
      s2d.every((e) => !e.hit) &&
      s1d.every((e) => e.hit) &&
      s1bd.every((e) => e.hit);
    invalidationRows.push({
      case: "2d stage2_v4.md one character",
      expected: "Stage 2 total miss; Stage 1 and 1b still hit",
      stage2Hits: s2d.filter((e) => e.hit).length,
      stage2Misses: s2d.filter((e) => !e.hit).length,
      stage1Hits: s1d.filter((e) => e.hit).length,
      stage1bHits: s1bd.filter((e) => e.hit).length,
      result: test2dPass ? "PASS" : "FAIL",
    });
  } finally {
    await writeFile(STAGE2_PROMPT_PATH, promptOriginal, "utf8");
    resetStage2PromptCache();
  }

  console.log(`TEST 2e bump CACHE_VERSION (${multi.label})`);
  setCacheVersionOverride(CACHE_VERSION + 1);
  beginCacheRun({ recordEvents: true });
  await runEvidence(multi);
  const stats2e = endCacheRun();
  logCacheRunSummary(stats2e, "test2e-cache-version");
  setCacheVersionOverride(null);
  const all2e = stats2e.events || [];
  test2ePass = all2e.length > 0 && all2e.every((e) => !e.hit);
  invalidationRows.push({
    case: "2e bump CACHE_VERSION",
    expected: "total miss everywhere",
    hits: all2e.filter((e) => e.hit).length,
    misses: all2e.filter((e) => !e.hit).length,
    result: test2ePass ? "PASS" : "FAIL",
  });

  printTable("TEST 2 invalidation", invalidationRows);
  report.tests.test2 = {
    pass: test2aPass && test2bPass && test2cPass && test2dPass && test2ePass,
    rows: invalidationRows,
  };

  // ---- TEST 3 hit rate and cost ----
  const costRows = [
    formatStatsRow("cold", coldStats, cold.usage, cold.costUsd),
    formatStatsRow("warm identical", warmStats, warm.usage, warm.costUsd),
    formatStatsRow("2a edited draft", test2aStats, test2aUsage, test2aCost),
  ];
  printTable("TEST 3 hit rate and cost (baseline ~1.8M tokens / $5 per full corpus pass)", costRows);
  report.tests.test3 = { rows: costRows };

  // ---- TEST 4 flag OFF ----
  delete process.env.QC_LLM_CACHE;
  let reads = 0;
  let writes = 0;
  const spyStore = {
    async get(key) {
      reads += 1;
      return store.get(key);
    },
    async put(key, entry) {
      writes += 1;
      return store.put(key, entry);
    },
  };
  setLlmCacheStore(spyStore);
  console.log("\nTEST 4 flag OFF");
  const dummyLive = await withLlmCache({
    parts: {
      stage: "stage2",
      inputText: "flag-off",
      parentSentence: null,
      sourceText: null,
      promptHash: "x",
      modelId: "gpt-4o",
      temperature: 0,
      seed: 1,
    },
    liveCall: async () => ({ ok: true }),
  });
  const small = cases[0];
  beginCacheRun({ recordEvents: true });
  await runEvidence(small);
  const stats4 = endCacheRun();
  const test4Pass =
    isLlmCacheEnabled() === false &&
    dummyLive.ok === true &&
    reads === 0 &&
    writes === 0 &&
    stats4.readCount === 0 &&
    stats4.writeCount === 0;
  const test4Rows = [
    {
      check: "QC_LLM_CACHE unset",
      enabled: String(isLlmCacheEnabled()),
      reads,
      writes,
      runReadCount: stats4.readCount,
      runWriteCount: stats4.writeCount,
      result: test4Pass ? "PASS" : "FAIL",
    },
  ];
  printTable("TEST 4 flag OFF", test4Rows);
  report.tests.test4 = { pass: test4Pass, rows: test4Rows };

  resetLlmCacheStore();
  setCacheVersionOverride(null);

  const allPass =
    test1Pass && test2aPass && test2bPass && test2cPass && test2dPass && test2ePass && test4Pass;
  report.pass = allPass;
  await writeFile(path.join(OUT_DIR, "last-run.json"), JSON.stringify(report, null, 2), "utf8");
  console.log("");
  console.log(allPass ? "GATE PASS" : "GATE FAIL");
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
