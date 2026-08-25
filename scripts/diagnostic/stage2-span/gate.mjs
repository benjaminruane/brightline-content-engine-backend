#!/usr/bin/env node
/**
 * B88 commit 1 shadow gate: Stage 2 unsupportedSpan behind QC_STAGE2_SPAN.
 *
 * Both arms in one process. Main-corpus OFF is a cached replay of the
 * unchanged prompt. ON is live (promptHash changes). F90 to F92 run live
 * in both arms and are reported separately.
 *
 * Does not gate automatically on deltas or rates.
 *
 * Usage:
 *   node scripts/diagnostic/stage2-span/gate.mjs
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
const ADVERSARIAL_IDS = new Set([90, 91, 92]);

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources, resetStage2UnsupportedSpanRejectionCount, getStage2UnsupportedSpanRejectionCount } =
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

function isFull(verdict) {
  return verdict === "supported_full";
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
    statementCharCount: statementText.length,
    stage3: agg.verdict,
    verdict: mapCardVerdict(agg.verdict),
    hasConflict: agg.hasConflict === true,
    matches: sourceMatches,
  };
}

function spanRecord(match) {
  const raw = match?.unsupportedSpanRaw;
  const validated = typeof match?.unsupportedSpan === "string" ? match.unsupportedSpan : null;
  const returned = typeof raw === "string" && raw.length > 0;
  const rejected = match?.unsupportedSpanRejected === true;
  return {
    sourceIndex: match?.sourceIndex,
    sourceLabel: match?.sourceLabel ?? null,
    classification: match?.classification ?? null,
    unsupportedSpan: validated,
    unsupportedSpanRaw: returned ? raw : raw == null ? null : raw,
    unsupportedSpanRejected: rejected,
    spanReturned: returned,
    spanValidated: typeof validated === "string" && validated.length > 0,
    spanCharCount: typeof validated === "string" ? validated.length : returned ? raw.length : null,
  };
}

function median(nums) {
  const list = Array.isArray(nums) ? nums.filter((n) => Number.isFinite(n)) : [];
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function decilePoints(values) {
  const sorted = [...values].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const out = {};
  for (let d = 0; d <= 10; d += 1) {
    out[`p${d * 10}`] = percentile(sorted, d / 10);
  }
  return out;
}

function decileBuckets(pcts) {
  const buckets = [];
  for (let i = 0; i < 10; i += 1) {
    buckets.push({
      range: i === 9 ? "[90, 100)" : `[${i * 10}, ${i * 10 + 10})`,
      count: 0,
    });
  }
  for (const p of pcts) {
    if (!Number.isFinite(p)) continue;
    let i = Math.floor(p / 10);
    if (i >= 10) i = 9;
    if (i < 0) i = 0;
    buckets[i].count += 1;
  }
  return buckets;
}

function formatPct(part, whole) {
  if (!whole) return "vacuous (denominator 0)";
  return `${((100 * part) / whole).toFixed(1)}% (${part}/${whole})`;
}

function formatCacheStats(stats) {
  const s2 = stats?.byStage?.stage2 || { hits: 0, misses: 0 };
  return {
    hits: stats?.hits ?? 0,
    misses: stats?.misses ?? 0,
    stage2Hits: s2.hits || 0,
    stage2Misses: s2.misses || 0,
    byStage: stats?.byStage || {},
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
    skipped.push({ label, reason: err?.message || String(err) });
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

async function loadAdversarialFixtures() {
  const out = [];
  const skipped = [];
  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!ADVERSARIAL_IDS.has(n)) continue;
    const label = `F${String(n).padStart(2, "0")}`;
    const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") {
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
  return { cases: out, skipped };
}

function baselineStatements(baselineRaw, label, draft, sources) {
  const row = baselineRaw?.cases?.[label];
  if (!row) return null;
  if (row.caseFingerprint !== caseFingerprint(label, draft, sources)) return null;
  if (!Array.isArray(row.statements) || row.statements.length === 0) return null;
  return row.statements;
}

function buildRows(setName, cases, offByLabel, onByLabel) {
  const rows = [];
  for (const caseRow of cases) {
    const offRun = offByLabel.get(caseRow.label);
    const onRun = onByLabel.get(caseRow.label);
    if (!offRun || !onRun) continue;
    const asOf = buildAsOfBySourceIndex(caseRow.sources);
    const statements = onRun.statements;
    for (let ord = 0; ord < statements.length; ord += 1) {
      const stmt = statements[ord];
      const offCard = cardFromMatches(stmt, offRun.matches, asOf);
      const onCard = cardFromMatches(stmt, onRun.matches, asOf);
      const spans = onCard.matches.map(spanRecord);
      const returnedSpans = spans.filter((s) => s.spanReturned);
      const validatedSpans = spans.filter((s) => s.spanValidated);
      const rejectedSpans = spans.filter((s) => s.unsupportedSpanRejected === true);
      rows.push({
        set: setName,
        fixtureId: caseRow.label,
        statementIndex: onCard.statementIndex,
        statementText: onCard.statementText,
        statementCharCount: onCard.statementCharCount,
        verdictOff: offCard.verdict,
        verdictOn: onCard.verdict,
        stage3Off: offCard.stage3,
        stage3On: onCard.stage3,
        spanReturned: returnedSpans.length > 0,
        spanValidated: validatedSpans.length > 0,
        spanRejected: rejectedSpans.length > 0,
        spanCharCounts: validatedSpans.map((s) => s.spanCharCount),
        matchesOn: spans,
      });
    }
  }
  return rows;
}

function classifyDelta(offVerdict, onVerdict) {
  if (offVerdict === onVerdict) return null;
  if (isFull(offVerdict) && !isFull(onVerdict)) return "supported_full -> non-full";
  if (!isFull(offVerdict) && isFull(onVerdict)) return "non-full -> supported_full";
  if (!isFull(offVerdict) && !isFull(onVerdict)) return "non-full -> different non-full";
  return "other";
}

function analyzeRows(rows) {
  const deltas = {
    "supported_full -> non-full": [],
    "non-full -> supported_full": [],
    "non-full -> different non-full": [],
    other: [],
  };
  for (const row of rows) {
    const kind = classifyDelta(row.verdictOff, row.verdictOn);
    if (!kind) continue;
    deltas[kind].push({
      fixtureId: row.fixtureId,
      statementIndex: row.statementIndex,
      verdictOff: row.verdictOff,
      verdictOn: row.verdictOn,
      statementText: row.statementText,
    });
  }

  const nonFullOn = rows.filter((r) => r.verdictOn !== "supported_full" && r.verdictOn !== "unclassified");
  const nonFullReturned = nonFullOn.filter((r) => r.spanReturned === true);

  const returnedMatchSpans = [];
  const validatedMatchSpans = [];
  const rejectedMatchSpans = [];
  for (const row of rows) {
    for (const m of row.matchesOn || []) {
      if (m.spanReturned) returnedMatchSpans.push({ row, match: m });
      if (m.spanValidated) validatedMatchSpans.push({ row, match: m });
      if (m.unsupportedSpanRejected) rejectedMatchSpans.push({ row, match: m });
    }
  }

  const entire = [];
  const shorter = [];
  for (const item of validatedMatchSpans) {
    const span = item.match.unsupportedSpan;
    const statement = item.row.statementText;
    if (span === statement) entire.push(item);
    else if (typeof span === "string" && span.length < statement.length) shorter.push(item);
  }
  const shorterPcts = shorter.map((item) => (100 * item.match.unsupportedSpan.length) / item.row.statementCharCount);
  const fullWithValidatedSpan = rows.filter((r) => r.verdictOn === "supported_full" && r.spanValidated === true);
  let confirmedPairValidated = 0;
  for (const row of rows) {
    for (const m of row.matchesOn || []) {
      if (m.classification === "confirmed" && m.spanValidated) confirmedPairValidated += 1;
    }
  }

  return {
    deltas,
    nonFullOnCount: nonFullOn.length,
    nonFullReturnedCount: nonFullReturned.length,
    returnedSpanCount: returnedMatchSpans.length,
    validatedSpanCount: validatedMatchSpans.length,
    rejectedSpanCount: rejectedMatchSpans.length,
    entireCount: entire.length,
    shorterCount: shorter.length,
    shorterMedianPct: median(shorterPcts),
    shorterDecilePoints: decilePoints(shorterPcts),
    shorterDecileBuckets: decileBuckets(shorterPcts),
    fullWithValidatedSpan,
    confirmedPairValidated,
    entire,
    shorter,
  };
}

function renderDeltaList(title, items) {
  const lines = [`### ${title}`, "", `Count: ${items.length}`];
  if (items.length === 0) {
    lines.push("");
    lines.push("None.");
    lines.push("");
    return lines;
  }
  lines.push("");
  for (const item of items) {
    lines.push(
      `- ${item.fixtureId} statement ${item.statementIndex}: ${item.verdictOff} -> ${item.verdictOn}`
    );
    lines.push(`  ${JSON.stringify(item.statementText)}`);
  }
  lines.push("");
  return lines;
}

function renderAnalysis(heading, rows, analysis, cacheOff, cacheOn, extraLines = []) {
  const lines = [`## ${heading}`, ""];
  lines.push(...extraLines);
  lines.push("### Cache");
  lines.push("");
  lines.push(
    `- OFF: hits ${cacheOff.hits}, misses ${cacheOff.misses} (stage2 hits ${cacheOff.stage2Hits}, misses ${cacheOff.stage2Misses})`
  );
  lines.push(
    `- ON: hits ${cacheOn.hits}, misses ${cacheOn.misses} (stage2 hits ${cacheOn.stage2Hits}, misses ${cacheOn.stage2Misses})`
  );
  if (cacheOff.misses === 0 && cacheOff.hits > 0) {
    lines.push("- OFF arm is a pure cached replay (misses 0).");
  } else if (cacheOff.hits === 0 && cacheOff.misses === 0) {
    lines.push("- OFF arm cache counts are vacuous (no lookups).");
  } else {
    lines.push(
      `- OFF arm was not a pure cached replay: ${cacheOff.misses} miss(es). Counts below are still reported.`
    );
  }
  lines.push("");
  lines.push("### 1. Verdict deltas OFF versus ON");
  lines.push("");
  lines.push(`Cards compared: ${rows.length}`);
  lines.push("");
  lines.push(
    ...renderDeltaList(
      "supported_full -> non-full (candidate false-green corrections)",
      analysis.deltas["supported_full -> non-full"]
    )
  );
  lines.push(
    ...renderDeltaList(
      "non-full -> supported_full (candidate regressions)",
      analysis.deltas["non-full -> supported_full"]
    )
  );
  lines.push(
    ...renderDeltaList("non-full -> different non-full", analysis.deltas["non-full -> different non-full"])
  );
  if (analysis.deltas.other.length > 0) {
    lines.push(...renderDeltaList("other", analysis.deltas.other));
  }

  lines.push("### 2. Span return rate (ON-arm non-full cards)");
  lines.push("");
  lines.push(formatPct(analysis.nonFullReturnedCount, analysis.nonFullOnCount));
  lines.push("");
  if (analysis.nonFullOnCount === 0) {
    lines.push("Vacuous: no ON-arm cards with a non-full outcome.");
    lines.push("");
  }

  lines.push("### 3. Span validation rate (of spans returned)");
  lines.push("");
  lines.push(`Returned: ${analysis.returnedSpanCount}`);
  lines.push(`Validated exact substring: ${analysis.validatedSpanCount}`);
  lines.push(`Rejected: ${analysis.rejectedSpanCount}`);
  lines.push(`Validation rate: ${formatPct(analysis.validatedSpanCount, analysis.returnedSpanCount)}`);
  lines.push("");
  if (analysis.returnedSpanCount === 0) {
    lines.push("Vacuous: no spans returned.");
    lines.push("");
  }

  lines.push("### 4. Degenerate-answer measure (validated spans)");
  lines.push("");
  lines.push(`Entire statement: ${analysis.entireCount}`);
  lines.push(`Strictly shorter: ${analysis.shorterCount}`);
  if (analysis.validatedSpanCount === 0) {
    lines.push("Vacuous: no validated spans.");
  } else if (analysis.shorterCount === 0 && analysis.entireCount === analysis.validatedSpanCount) {
    lines.push(
      "The span return rate is high only because the model returns the whole statement."
    );
  } else if (analysis.entireCount > analysis.shorterCount) {
    lines.push(
      "Most validated spans are the entire statement. Treat a high return rate as partly degenerate."
    );
  }
  if (analysis.shorterCount === 0) {
    lines.push("Shorter-span length as % of statement: vacuous (denominator 0).");
  } else {
    lines.push(
      `Shorter-span length as % of statement, median: ${analysis.shorterMedianPct.toFixed(2)}`
    );
    lines.push("Decile points (p0 to p100):");
    for (const [k, v] of Object.entries(analysis.shorterDecilePoints || {})) {
      lines.push(`- ${k}: ${Number(v).toFixed(2)}`);
    }
    lines.push("Decile buckets:");
    for (const b of analysis.shorterDecileBuckets || []) {
      lines.push(`- ${b.range}: ${b.count}`);
    }
  }
  lines.push("");

  lines.push("### 5. Validated span on a supported_full outcome");
  lines.push("");
  lines.push(`Count: ${analysis.fullWithValidatedSpan.length}`);
  lines.push(
    `Validated spans on a confirmed pair: ${analysis.confirmedPairValidated} (the prompt says to omit the field when classification is confirmed).`
  );
  if (analysis.fullWithValidatedSpan.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      "These cards are supported_full because another source confirmed. The spans sit on non-confirmed pairs for the same statement, which Stage 3 any-confirmed-wins does not drop."
    );
    for (const row of analysis.fullWithValidatedSpan) {
      lines.push(`- ${row.fixtureId} statement ${row.statementIndex}: ${JSON.stringify(row.statementText)}`);
      for (const m of row.matchesOn.filter((s) => s.spanValidated)) {
        lines.push(
          `  source ${m.sourceIndex} (${m.sourceLabel}) classification=${m.classification} span=${JSON.stringify(m.unsupportedSpan)}`
        );
      }
    }
  }
  lines.push("");
  return lines;
}

async function runStage2(cases, stage2SpanEnabled, label) {
  console.log(`Stage 2 ${label}: ${cases.length} cases, spanEnabled=${stage2SpanEnabled}`);
  resetStage2UnsupportedSpanRejectionCount();
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
  const rejections = getStage2UnsupportedSpanRejectionCount();
  return { byLabel, cache, rejections };
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

  console.log("# B88 commit 1: Stage 2 unsupported span shadow gate");
  console.log("");
  console.log("Stage 2 per-pair field is classification, values: confirmed, partially_confirmed, conflicting, no_support.");
  console.log("Card verdicts below use the display mapping: confirmed -> supported_full, and the other three to non-full.");
  console.log("unsupportedSpan is requested only when classification is not confirmed.");
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
  const pairCount = mainPrepared.reduce((n, c) => n + c.statements.length * (c.sources.length || 0), 0);
  console.log(`main corpus statement x source pairs (ON will be live): ${pairCount}`);

  const offMain = await runStage2(mainPrepared, false, "OFF main");
  const onMain = await runStage2(mainPrepared, true, "ON main");

  const mainRows = buildRows("cached-corpus", mainPrepared, offMain.byLabel, onMain.byLabel);
  const mainAnalysis = analyzeRows(mainRows);

  let adversarialNote = "";
  let adversarialRows = [];
  let adversarialAnalysis = null;
  let offAdv = { cache: formatCacheStats(null), rejections: 0 };
  let onAdv = { cache: formatCacheStats(null), rejections: 0 };
  const { cases: advCases, skipped: advSkipped } = await loadAdversarialFixtures();
  if (advSkipped.length > 0) {
    adversarialNote = `Adversarial load skips: ${advSkipped.map((s) => `${s.label} (${s.reason})`).join("; ")}`;
  }
  if (advCases.length === 0) {
    adversarialNote = `${adversarialNote} F90, F91 and F92 were not run.`.trim();
  } else {
    console.log(`adversarial live: ${advCases.map((c) => c.label).join(", ")}`);
    beginCacheRun({ recordEvents: true });
    const advPrepared = [];
    for (const caseRow of advCases) {
      const stage1 = await extractStatements({ draftText: caseRow.draft });
      const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
      advPrepared.push({ ...caseRow, statements });
      console.log(`  Stage 1 ${caseRow.label}: ${statements.length} statements`);
    }
    const stage1Cache = formatCacheStats(endCacheRun());
    offAdv = await runStage2(advPrepared, false, "OFF adversarial");
    onAdv = await runStage2(advPrepared, true, "ON adversarial");
    adversarialRows = buildRows("adversarial", advPrepared, offAdv.byLabel, onAdv.byLabel);
    adversarialAnalysis = analyzeRows(adversarialRows);
    adversarialNote =
      `F90, F91 and F92 ran live in both arms. Stage 1 cache hits ${stage1Cache.hits}, misses ${stage1Cache.misses}. ${adversarialNote}`.trim();
  }

  console.debug = origDebug;

  const allOnRows = [...mainRows, ...adversarialRows];
  const reportLines = [];
  reportLines.push("# B88 commit 1: Stage 2 unsupported span shadow gate");
  reportLines.push("");
  reportLines.push("Does not gate automatically on any of these counts.");
  reportLines.push("");
  reportLines.push("## Vocabulary");
  reportLines.push("");
  reportLines.push(
    "Stage 2 currently returns `classification` per statement x source pair. Permitted values: `confirmed`, `partially_confirmed`, `conflicting`, `no_support`. The spec names `supported_full` / non-full are card-level display mappings applied after Stage 3 (confirmed -> supported_full). This gate uses the real Stage 2 field on matches and the display mapping on cards."
  );
  reportLines.push("");
  reportLines.push("## Cache invalidation");
  reportLines.push("");
  reportLines.push(
    "The OFF system prompt is still exactly `stage2_v4.md`, so existing Stage 2 disk-cache entries remain valid for the OFF arm. The ON arm appends `stage2_v4_unsupported_span.md`, which changes promptHash, so ON cannot hit those entries."
  );
  reportLines.push("");
  reportLines.push("The span is not carried onto the qcCard. That would require Stage 7 changes. It stays on the Stage 2 match object and does not influence verdict, concern level, or rollup.");
  reportLines.push("");
  reportLines.push("## Disk / store");
  reportLines.push("");
  reportLines.push(`- QC_LLM_CACHE_DISK: \`${diskPath || "(unset)"}\``);
  reportLines.push(`- disk file existed before run: ${diskExisted ? "yes" : "no"}`);
  reportLines.push(`- disk file bytes: ${diskBytes ?? "n/a"}`);
  reportLines.push(`- store kind: ${store?.kind || "unknown"}`);
  reportLines.push(`- store entries at start: ${storeEntriesAtStart}`);
  reportLines.push(`- baseline path: \`${BASELINE_PATH}\``);
  reportLines.push(`- baseline case labels: ${baselineLabels.join(", ")}`);
  reportLines.push("");
  reportLines.push("## Corpus");
  reportLines.push("");
  reportLines.push(
    "Main set is the evidence-span-population corpus: Nordholt clean/dirty, supersession, F01 to F23. Statements come from `.baseline.json` (fingerprint ignored because this commit edits `stage2-match-sources.mjs`)."
  );
  reportLines.push("");
  reportLines.push(`Main cases: ${mainPrepared.map((c) => c.label).join(", ")}`);
  if (uncachedExtras.length > 0) {
    reportLines.push("");
    reportLines.push("Fixtures present on disk but not in the main cached set:");
    for (const row of uncachedExtras) {
      reportLines.push(`- ${row.label} (${row.file}): ${row.reason}`);
    }
  }
  if (skipped.length > 0) {
    reportLines.push("");
    reportLines.push("Load skips:");
    for (const row of skipped) {
      reportLines.push(`- ${row.label}: ${row.reason}`);
    }
  }
  reportLines.push("");
  reportLines.push(`Main-corpus rejection counter (ON arm): ${onMain.rejections}`);
  reportLines.push("");
  reportLines.push(
    ...renderAnalysis("Main corpus", mainRows, mainAnalysis, offMain.cache, onMain.cache, [])
  );
  reportLines.push("## Adversarial F90 F91 F92 (separate from the cached set)");
  reportLines.push("");
  reportLines.push(adversarialNote || "No additional note.");
  reportLines.push("");
  if (adversarialAnalysis) {
    reportLines.push(
      ...renderAnalysis(
        "Adversarial live arms",
        adversarialRows,
        adversarialAnalysis,
        offAdv.cache,
        onAdv.cache,
        [`Adversarial-corpus rejection counter (ON arm): ${onAdv.rejections}`, ""]
      )
    );
  } else {
    reportLines.push("Not run.");
    reportLines.push("");
  }
  reportLines.push("## 6. ON-arm rows");
  reportLines.push("");
  reportLines.push(`Wrote ${allOnRows.length} rows to \`scripts/diagnostic/stage2-span/rows.json\`, including every returned span verbatim, validated or rejected.`);
  reportLines.push("");

  const report = `${reportLines.join("\n").trim()}\n`;
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(ROWS_PATH, `${JSON.stringify(allOnRows, null, 2)}\n`, "utf8");
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
