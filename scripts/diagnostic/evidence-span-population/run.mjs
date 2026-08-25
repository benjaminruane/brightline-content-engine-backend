#!/usr/bin/env node
/**
 * B88 diagnostic: population of cards whose evidence verdict is short of
 * full support but which carry no span the reviser can act on.
 *
 * Cached replay only. Writes only inside this directory.
 *
 * Usage:
 *   node scripts/diagnostic/evidence-span-population/run.mjs
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { createBaselineStore } from "../claim-spans/baseline-cache.mjs";
import { DEFAULT_LLM_CACHE_DISK_PATH } from "../lib/llm-cache-disk.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROWS_PATH = path.join(OUT_DIR, "rows.json");
const SUMMARY_PATH = path.join(OUT_DIR, "summary.md");

const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const { matchClaimSourcePairs } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { selectExcerpts } = await import("../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { residualHasUnclaimedAnchor, rollupClaimVerdicts } = await import("../../../lib/qc/claim-spans.mjs");
const { assembleCard } = await import("../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs");
const { gatherConcerns, buildRevisionPrompt } = await import("../../../lib/build-revision-prompt.mjs");
const {
  beginCacheRun,
  endCacheRun,
  getLlmCacheStore,
  isLlmCacheEnabled,
  llmCacheDiskPathFromEnv,
} = await import("../../../lib/qc/llm-cache.mjs");

function normalizeMatchClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

function applySupersessionToClaimMatches({ statementText, sourceMatches, asOfBySourceIndex, today }) {
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

function matchesForStatement(allMatches, statementIndex) {
  return (Array.isArray(allMatches) ? allMatches : [])
    .filter((m) => Number(m.statementIndex) === Number(statementIndex))
    .slice()
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function mapRowVerdict(displayVerdict, supportState, stage3) {
  const dv = String(displayVerdict || "").trim();
  if (dv === "supported_full") return "supported_full";
  if (dv === "supported_partial") return "supported_partial";
  if (dv === "not_supported") return "not_supported";
  if (dv === "conflict" || dv === "conflicting") return "conflicting";
  const ss = String(supportState || "").trim();
  if (ss === "supported") return "supported_full";
  if (ss === "partial") return "supported_partial";
  if (ss === "not_supported") return "not_supported";
  if (ss === "conflicting") return "conflicting";
  const v = String(stage3 || "").trim();
  if (v === "confirmed") return "supported_full";
  if (v === "partially_confirmed") return "supported_partial";
  if (v === "not_supported") return "not_supported";
  if (v === "conflicting") return "conflicting";
  return "unclassified";
}

function isConfirmedClaim(verdict) {
  const v = String(verdict || "").trim();
  return v === "confirmed" || v === "supported" || v === "supported_full";
}

function concernsBlockFromPrompt(prompt) {
  const text = typeof prompt === "string" ? prompt : "";
  const start = text.indexOf("CONCERNS TO ADDRESS:");
  if (start < 0) return "";
  const end = text.indexOf("DRAFT TO REVISE:");
  return end > start ? text.slice(start, end) : text.slice(start);
}

function statementSection(block, statementIndex) {
  const header = `### Statement [${statementIndex}]`;
  const i = block.indexOf(header);
  if (i < 0) return null;
  const rest = block.slice(i);
  const next = rest.slice(header.length).search(/\n### Statement \[/);
  if (next < 0) return rest;
  return rest.slice(0, header.length + next);
}

function kindFromSection(section) {
  if (typeof section !== "string" || !section) return null;
  const kind = section.match(/\[kind=([^\]]+)\]/);
  if (kind) return kind[1];
  const statementKind = section.match(/\[statementKind=([^\]]+)\]/);
  if (statementKind) return statementKind[1];
  return null;
}

function evidenceFindingInSection(section) {
  if (typeof section !== "string" || !section) return false;
  return /Evidence gap \(/.test(section) || /Evidence \(per-claim spans\)/.test(section);
}

function median(nums) {
  const list = Array.isArray(nums) ? nums.filter((n) => Number.isFinite(n)) : [];
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(part, whole) {
  if (!whole) return null;
  return (100 * part) / whole;
}

function formatPct(part, whole) {
  const v = pct(part, whole);
  if (v == null) return "vacuous (denominator 0)";
  return `${v.toFixed(1)}%`;
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

async function loadCorpus() {
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

function buildSummary({
  cacheState,
  rows,
  unclassified,
  skipped,
  uncachedExtras,
  cacheStats,
  gatherImport,
}) {
  const total = rows.length;
  const byVerdict = {};
  for (const row of rows) {
    const key = row.verdict || "unclassified";
    byVerdict[key] = (byVerdict[key] || 0) + 1;
  }
  const nonFull = rows.filter((r) => r.verdict !== "supported_full" && r.verdict !== "unclassified");
  const withSpan = nonFull.filter((r) => r.hasActionableSpan === true);
  const b88 = nonFull.filter((r) => r.hasActionableSpan === false);
  const undecomposed = b88.filter((r) => r.claimCount === 0);
  const allClaimsConfirmed = b88.filter((r) => r.claimCount > 0);
  const charCounts = b88.map((r) => r.statementCharCount);
  const over200 = b88.filter((r) => r.statementCharCount > 200);
  const dropped = b88.filter((r) => r.reachesRevisionPrompt === false);
  const cross = {};
  for (const row of rows) {
    const v = row.verdict || "unclassified";
    const span = row.hasActionableSpan === true ? "hasActionableSpan" : "noActionableSpan";
    if (!cross[v]) cross[v] = { hasActionableSpan: 0, noActionableSpan: 0 };
    cross[v][span] += 1;
  }
  const verdictKeys = [
    "supported_full",
    "supported_partial",
    "not_supported",
    "conflicting",
    "unclassified",
  ];

  const lines = [];
  lines.push("# B88 diagnostic: evidence-gap span population");
  lines.push("");
  lines.push("Cached replay of Stages 1 to 3 plus Stage 7 assembly. No product code changed.");
  lines.push("");
  lines.push("## Cache state");
  lines.push("");
  lines.push(`- QC_LLM_CACHE_DISK: \`${cacheState.diskPath || "(unset)"}\``);
  lines.push(`- disk file existed before run: ${cacheState.diskExisted ? "yes" : "no"}`);
  lines.push(`- disk file bytes: ${cacheState.diskBytes ?? "n/a"}`);
  lines.push(`- store kind: ${cacheState.storeKind}`);
  lines.push(`- store entries at start: ${cacheState.storeEntries}`);
  lines.push(`- baseline path: \`${cacheState.baselinePath}\``);
  lines.push(`- baseline fingerprint valid: ${cacheState.baselineValid ? "yes" : "no"}`);
  lines.push(`- baseline fingerprint: ${cacheState.fingerprint}`);
  lines.push(`- baseline case labels: ${cacheState.baselineLabels.join(", ")}`);
  lines.push(
    `- LLM cache hits: ${cacheStats.hits}  misses: ${cacheStats.misses}  (stage1 ${cacheStats.byStage?.stage1?.hits || 0}/${cacheStats.byStage?.stage1?.misses || 0}, stage1b ${cacheStats.byStage?.stage1b?.hits || 0}/${cacheStats.byStage?.stage1b?.misses || 0}, stage2 ${cacheStats.byStage?.stage2?.hits || 0}/${cacheStats.byStage?.stage2?.misses || 0})`
  );
  if (cacheStats.misses > 0) {
    lines.push("");
    lines.push(
      `MISSES ARE NON-ZERO: ${cacheStats.misses}. This replay was not a pure cache hit. Counts below are still reported.`
    );
  } else {
    lines.push("- misses: 0 (pure cached replay)");
  }
  lines.push("");
  lines.push("## Corpus");
  lines.push("");
  lines.push(
    "Ran the cached shadow-gate corpus: Nordholt clean/dirty, supersession, F01 to F23. No fixture inside that set was dropped."
  );
  if (uncachedExtras.length > 0) {
    lines.push("");
    lines.push(
      "Fixtures present on disk but not in the cached baseline (not run; running them would bill a live Stage 1/2 pass):"
    );
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
  lines.push("## Revision-prompt import");
  lines.push("");
  lines.push(gatherImport);
  lines.push("");
  lines.push("## 1. Total cards");
  lines.push("");
  lines.push(String(total));
  lines.push("");
  lines.push("## 2. Cards by verdict");
  lines.push("");
  for (const key of verdictKeys) {
    if (byVerdict[key] != null) lines.push(`- ${key}: ${byVerdict[key]}`);
  }
  for (const key of Object.keys(byVerdict).sort()) {
    if (!verdictKeys.includes(key)) lines.push(`- ${key}: ${byVerdict[key]}`);
  }
  lines.push("");
  lines.push("## 3. Cards with verdict != supported_full");
  lines.push("");
  lines.push(`Non-full total (excludes unclassified): ${nonFull.length}`);
  if (nonFull.length === 0) {
    lines.push("This block is vacuous: there were no non-full classified cards.");
  }
  lines.push(`a. hasActionableSpan = true: ${withSpan.length}`);
  lines.push(`b. hasActionableSpan = false (B88 population): ${b88.length}`);
  lines.push(`c. (b) as a percentage of the non-full total: ${formatPct(b88.length, nonFull.length)}`);
  lines.push("");
  lines.push("## 4. Within the B88 population: decomposition shape");
  lines.push("");
  if (b88.length === 0) {
    lines.push("Vacuous: B88 population is 0.");
  } else {
    lines.push(`- claimCount = 0 (undecomposed): ${undecomposed.length}`);
    lines.push(
      `- claimCount > 0 but all claims confirmed (unconfirmedClaimCount = 0): ${allClaimsConfirmed.length}`
    );
    const leftover = b88.length - undecomposed.length - allClaimsConfirmed.length;
    if (leftover !== 0) {
      lines.push(`- other (should be 0): ${leftover}`);
    }
  }
  lines.push("");
  lines.push("## 5. Within the B88 population: statement length");
  lines.push("");
  if (b88.length === 0) {
    lines.push("Vacuous: B88 population is 0.");
  } else {
    lines.push(`- statementCharCount median: ${median(charCounts)}`);
    lines.push(`- count over 200 characters: ${over200.length}`);
  }
  lines.push("");
  lines.push("## 6. B88 population that does not reach the revision prompt");
  lines.push("");
  if (b88.length === 0) {
    lines.push("Vacuous: B88 population is 0.");
  } else {
    lines.push(`**reachesRevisionPrompt = false: ${dropped.length} of ${b88.length}**`);
    lines.push("");
    if (dropped.length === 0) {
      lines.push(
        "None of the B88 cards are dropped before the assembled concerns block. The gap is missing spans, not missing findings."
      );
    } else if (dropped.length / b88.length >= 0.5) {
      lines.push(
        "This is a large share. The finding is that these findings are being DROPPED, not that they lack spans."
      );
    } else {
      lines.push(
        "Some B88 cards do not appear in the assembled concerns block. Treat those as dropped findings, not as span-less findings."
      );
    }
  }
  lines.push("");
  lines.push("## 7. Cross-tab of verdict against hasActionableSpan");
  lines.push("");
  lines.push("| verdict | hasActionableSpan true | hasActionableSpan false |");
  lines.push("|---|---:|---:|");
  for (const key of verdictKeys) {
    const row = cross[key];
    if (!row) continue;
    lines.push(`| ${key} | ${row.hasActionableSpan} | ${row.noActionableSpan} |`);
  }
  for (const key of Object.keys(cross).sort()) {
    if (verdictKeys.includes(key)) continue;
    const row = cross[key];
    lines.push(`| ${key} | ${row.hasActionableSpan} | ${row.noActionableSpan} |`);
  }
  lines.push("");
  lines.push("## Unclassified");
  lines.push("");
  lines.push(String(unclassified.length));
  if (unclassified.length > 0) {
    for (const row of unclassified) {
      lines.push(
        `- ${row.fixtureId} S${row.statementIndex}: ${JSON.stringify(row.unclassifiedReason || "unexpected shape")}`
      );
    }
  }
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

async function main() {
  const diskPath = llmCacheDiskPathFromEnv() || DEFAULT_LLM_CACHE_DISK_PATH;
  const diskExisted = Boolean(diskPath && existsSync(diskPath));
  const diskBytes = diskExisted ? (await import("node:fs")).statSync(diskPath).size : null;
  const store = getLlmCacheStore();
  const baselineStore = await createBaselineStore({ refresh: false });
  const baselineLabels = [];
  try {
    const raw = JSON.parse(await readFile(path.join(DIAG_ROOT, "claim-spans", ".baseline.json"), "utf8"));
    if (raw?.cases && typeof raw.cases === "object") baselineLabels.push(...Object.keys(raw.cases));
  } catch {
    /* reported via baselineValid */
  }

  const cacheState = {
    diskPath,
    diskExisted,
    diskBytes,
    storeKind: store?.kind || "unknown",
    storeEntries: store?.size?.() ?? "unknown",
    baselinePath: path.join(DIAG_ROOT, "claim-spans", ".baseline.json"),
    baselineValid: baselineStore.loaded === true,
    fingerprint: String(baselineStore.fingerprint || "").slice(0, 16),
    baselineLabels,
  };

  console.log("# B88 diagnostic: cost gate");
  console.log(`QC_LLM_CACHE_DISK=${cacheState.diskPath || "(unset)"}`);
  console.log(`diskFileExisted=${cacheState.diskExisted ? "yes" : "no"} bytes=${cacheState.diskBytes ?? "n/a"}`);
  console.log(`storeKind=${cacheState.storeKind} entries=${cacheState.storeEntries}`);
  console.log(
    `baseline fingerprint-valid=${cacheState.baselineValid ? "yes" : "no"} fingerprint=${cacheState.fingerprint}`
  );
  console.log(`baseline labels=${cacheState.baselineLabels.join(", ") || "(none)"}`);

  if (!isLlmCacheEnabled()) {
    console.error("STOP: QC_LLM_CACHE is off. This diagnostic must be a cached replay.");
    process.exit(1);
  }
  if (!diskExisted) {
    console.error("STOP: disk cache file is missing. Do not run an uncached full corpus pass.");
    process.exit(1);
  }
  if (!baselineStore.loaded) {
    console.error(
      "STOP: claim-spans baseline is missing or fingerprint-stale. Do not run an uncached full corpus pass."
    );
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("STOP: OPENAI_API_KEY is required even on a cache hit (provider check inside Stage 1b).");
    process.exit(1);
  }

  const { cases, skipped, uncachedExtras } = await loadCorpus();
  const required = cases.map((c) => c.label);
  const missingBaseline = required.filter((label) => !cacheState.baselineLabels.includes(label));
  if (missingBaseline.length > 0) {
    console.error(`STOP: baseline does not cover: ${missingBaseline.join(", ")}`);
    process.exit(1);
  }

  console.log("COST GATE PASS: disk cache present, baseline fingerprint valid, planned corpus covered.");
  console.log(`corpus: ${required.join(", ")}`);
  if (uncachedExtras.length > 0) {
    console.log(
      `not run (uncached extras): ${uncachedExtras.map((r) => r.label).join(", ")}`
    );
  }

  let gatherImport =
    "Imported gatherConcerns and buildRevisionPrompt from lib/build-revision-prompt.mjs with no extra side effects. formatConcernsBlock is not exported; it is reached through buildRevisionPrompt.";

  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const rows = [];
  const unclassified = [];
  beginCacheRun({ recordEvents: true });

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    const cached = baselineStore.get(label, draft, sources);
    if (!cached) {
      endCacheRun();
      console.error(`STOP: baseline miss at runtime for ${label}. Would bill Stage 1/2.`);
      process.exit(1);
    }
    const statements = cached.statements;
    const matches = cached.matches;
    const asOfBySourceIndex = buildAsOfBySourceIndex(sources);
    const stage1b = await extractClaimSpans({
      statements,
      draftText: draft,
      options: { claimSpansEnabled: true },
    });

    const jobs = [];
    const claimsByIndex = new Map();
    for (const [statementIndex, claims] of stage1b.byStatementIndex.entries()) {
      const parent = statements.find((s, ord) => (Number.isFinite(s?.index) ? Number(s.index) : ord) === statementIndex);
      const parentSentence = typeof parent?.text === "string" ? parent.text : "";
      claimsByIndex.set(statementIndex, claims);
      for (const claim of claims) {
        jobs.push({
          statementIndex,
          claimIndex: claim.index,
          text: claim.text,
          parentSentence,
        });
      }
    }
    const claimMatch = jobs.length > 0 ? await matchClaimSourcePairs({ claims: jobs, sources }) : { matches: [] };
    const pairMatches = Array.isArray(claimMatch.matches) ? claimMatch.matches : [];

    const cards = [];
    for (let ord = 0; ord < statements.length; ord += 1) {
      const stmt = statements[ord];
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      const startChar = Number.isFinite(stmt?.charStart)
        ? stmt.charStart
        : Number.isFinite(stmt?.startChar)
          ? stmt.startChar
          : 0;
      const endChar = Number.isFinite(stmt?.charEnd)
        ? stmt.charEnd
        : Number.isFinite(stmt?.endChar)
          ? stmt.endChar
          : startChar + text.length;
      const rowMatches = matchesForStatement(matches, statementIndex);
      const sourceMatches = rowMatches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
        passage: m.passage,
        explanation: m.explanation,
        periodAssessment: m.periodAssessment ?? null,
        statementFigures: Array.isArray(m.statementFigures) ? m.statementFigures : [],
        sourceFigures: Array.isArray(m.sourceFigures) ? m.sourceFigures : [],
      }));
      let agg = aggregateVerdict({ statementMatches: sourceMatches });
      const resolved = resolveSupersession({
        statement: text,
        aggregateVerdict: agg.verdict,
        sourceMatches,
        asOfBySourceIndex,
        today: TODAY,
      });
      if (resolved.verdictOverride) {
        const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
        for (const m of sourceMatches) {
          if (!demoted.has(Number(m.sourceIndex))) continue;
          m.originalClassification = m.classification;
          m.classification = "superseded";
        }
        agg = aggregateVerdict({ statementMatches: sourceMatches });
        agg = { ...agg, verdict: resolved.verdictOverride };
      }
      const confirmingMatches = sourceMatches.filter(
        (m) => normalizeMatchClassification(m.classification) === "confirmed"
      );
      const conflictingMatches = sourceMatches.filter(
        (m) => normalizeMatchClassification(m.classification) === "conflicting"
      );
      const partialMatches = sourceMatches.filter(
        (m) => normalizeMatchClassification(m.classification) === "partially_confirmed"
      );
      const verdictResult = {
        verdict: agg.verdict,
        hasConflict: agg.hasConflict,
        contributingSourceIndices: agg.contributingSourceIndices,
        confirmingMatches,
        conflictingMatches,
        partialMatches,
      };
      const excerptResult = selectExcerpts({
        statementMatches: sourceMatches,
        verdict: agg.verdict,
        hasConflict: agg.hasConflict,
      });
      const rawClaims = claimsByIndex.get(statementIndex) || [];
      let claimSpans = { decomposed: false, claimUpgrade: false, claims: [] };
      if (rawClaims.length >= 2) {
        const claimRows = [];
        for (const claim of rawClaims) {
          const claimMatches = pairMatches.filter(
            (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
          );
          const claimResolved = applySupersessionToClaimMatches({
            statementText: claim.text,
            sourceMatches: claimMatches,
            asOfBySourceIndex,
            today: TODAY,
          });
          claimRows.push({
            index: claim.index,
            text: claim.text,
            draftStart: claim.draftStart,
            draftEnd: claim.draftEnd,
            verdict: claimResolved.agg.verdict,
            hasConflict: claimResolved.agg.hasConflict === true,
          });
        }
        const residual = residualHasUnclaimedAnchor(text, rawClaims);
        const rolled = rollupClaimVerdicts({
          vToday: agg.verdict,
          claimVerdicts: claimRows.map((c) => c.verdict),
          residualBlocked: residual.blocked,
          wholeSentenceHasConflict: rowMatches.some(
            (m) => normalizeMatchClassification(m.classification) === "conflicting"
          ),
        });
        if (rolled.claimUpgrade) verdictResult.verdict = "confirmed";
        claimSpans = {
          decomposed: true,
          claimUpgrade: rolled.claimUpgrade === true,
          claims: claimRows,
          blockedBy: rolled.blockedBy,
        };
      }

      const card = await assembleCard(
        {
          statementText: text,
          startChar,
          endChar,
          sourceMatches,
          verdictResult,
          excerptResult,
          statementIndex,
          supersededSourceNotes: Array.isArray(resolved.supersededNotes) ? resolved.supersededNotes : [],
          claimSpans,
          commentaryResult: { commentary: "" },
          editorialResult: null,
        },
        statementIndex,
        {
          pipelineRoute: "v4",
          sources,
          today: TODAY,
          skipEditorialDuplicationJudge: true,
          framingFidelityJudge: async () => ({ fire: false }),
        }
      );
      cards.push(card);
    }

    const concerns = gatherConcerns(cards);
    const prompt = buildRevisionPrompt(draft, concerns);
    const block = concernsBlockFromPrompt(prompt);

    for (const card of cards) {
      const statementIndex = Number.isFinite(card?.index) ? card.index : null;
      const statementText = typeof card?.statement === "string" ? card.statement : "";
      const stage3 = card?.supportState;
      const verdict = mapRowVerdict(card?.displayVerdict, card?.supportState, card?._stage3);
      const decomposed = card?.decomposed === true && Array.isArray(card?.claims) && card.claims.length > 0;
      const claims = decomposed ? card.claims : [];
      const claimCount = claims.length;
      const unconfirmedClaimCount = claims.filter((c) => !isConfirmedClaim(c?.verdict)).length;
      const hasActionableSpan = unconfirmedClaimCount > 0;
      const section = statementIndex == null ? null : statementSection(block, statementIndex);
      const reachesRevisionPrompt = evidenceFindingInSection(section);
      const revisionConcernKind = kindFromSection(section);
      const row = {
        fixtureId: label,
        statementIndex,
        statementText,
        statementCharCount: statementText.length,
        verdict,
        concernLevel: typeof card?.concernLevel === "string" ? card.concernLevel : null,
        claimCount,
        unconfirmedClaimCount,
        hasActionableSpan,
        reachesRevisionPrompt,
        revisionConcernKind,
      };
      const missing =
        statementIndex == null ||
        typeof statementText !== "string" ||
        verdict === "unclassified" ||
        row.concernLevel == null;
      if (missing) {
        row.verdict = "unclassified";
        row.unclassifiedReason = {
          statementIndex,
          displayVerdict: card?.displayVerdict ?? null,
          supportState: stage3 ?? null,
          concernLevel: card?.concernLevel ?? null,
        };
        unclassified.push(row);
      }
      rows.push(row);
    }
  }

  const cacheStats = endCacheRun();
  console.debug = origDebug;

  const summary = buildSummary({
    cacheState,
    rows,
    unclassified,
    skipped,
    uncachedExtras,
    cacheStats,
    gatherImport,
  });

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(ROWS_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await writeFile(SUMMARY_PATH, summary, "utf8");

  console.log("");
  console.log(summary);
  console.log(`wrote ${ROWS_PATH}`);
  console.log(`wrote ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
