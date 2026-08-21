#!/usr/bin/env node
/**
 * Combined shadow for period overlap, B71, B65, and B53c.
 * Stage 1 and whole-sentence Stage 2 from the disk cache. Stage 1b misses
 * (prompt hash bust). Claim Stage 2 misses only for newly decomposed spans.
 *
 * Usage:
 *   node scripts/diagnostic/review-four/run-shadow.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-21T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const B67_DIR = path.join(DIAG_ROOT, "b67-probe");
const B72_DIR = path.join(DIAG_ROOT, "b72-probe");
const CORPUS_JSON = path.join(DIAG_ROOT, "backstop-needed", "corpus.json");
const MAX_LIVE_COST_USD = 1;

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const {
  matchAllSources,
  matchClaimSourcePairs,
  applyRoundingToleranceBackstop,
  applyPeriodGateBackstop,
  hasEgregiousMagnitudeGap,
  periodsDoNotOverlap,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { residualHasUnclaimedAnchor, rollupClaimVerdicts } = await import("../../../lib/qc/claim-spans.mjs");
const { findUnevidencedSuperlative } = await import("../../../lib/qc/framing-fidelity.mjs");
const { beginCacheRun, endCacheRun, logCacheRunSummary, getLlmCacheStore } = await import(
  "../../../lib/qc/llm-cache.mjs"
);
const { createTraceId, startTrace, flushObservability } = await import("../../../lib/observability.js");

function trunc(s, n = 110) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

function pairKey(label, statementIndex, sourceLabel) {
  return `${label}|S${statementIndex}|${sourceLabel}`;
}

function evidenceKey(row) {
  return `${row?.verdict || "not_supported"}|conflict=${row?.hasConflict === true ? "1" : "0"}`;
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

function replayOn(statementText, match) {
  const pre =
    typeof match.preBackstopClassification === "string" && match.preBackstopClassification.trim()
      ? match.preBackstopClassification.trim()
      : match.classification;
  const passage = typeof match.passage === "string" ? match.passage : "";
  const explanation = typeof match.explanation === "string" ? match.explanation : "";
  const periodAssessment = match.periodAssessment ?? null;
  const rounded = applyRoundingToleranceBackstop(
    { classification: pre, passage, explanation, periodAssessment },
    { statementText, sourceLabel: match.sourceLabel }
  );
  return applyPeriodGateBackstop(
    {
      classification: rounded.classification,
      passage: rounded.passage,
      explanation: rounded.explanation,
      periodAssessment,
    },
    { statementText, sourceLabel: match.sourceLabel }
  );
}

async function loadDiagnosePairs() {
  try {
    const raw = JSON.parse(await readFile(CORPUS_JSON, "utf8"));
    const rows = Array.isArray(raw?.pairRows) ? raw.pairRows : Array.isArray(raw?.pairs) ? raw.pairs : [];
    const map = new Map();
    for (const row of rows) {
      if (row?.key) map.set(row.key, row);
    }
    return map;
  } catch {
    return new Map();
  }
}

function isRangeClaim(text) {
  return /every year since|each year since|all years since|since (?:FY\s*)?(?:19|20)\d{2}|from (?:FY\s*)?(?:19|20)\d{2} to (?:FY\s*)?(?:19|20)\d{2}/i.test(
    String(text || "")
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
  for (const kind of ["clean", "dirty"]) out.push(await loadNordholt(kind));
  out.push(await loadB67Probe());
  out.push(await loadSupersessionFixture());
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
  "nordholt-clean|S1|IC memo",
  "nordholt-dirty|S1|IC memo",
  "b67-probe|S1|IC memo",
  "supersession|S1|source_A_annual_report_2019",
  "F18|S5|18b_synth_cross_source_pair_update",
  "F22|S2|ALP_update_memo",
];

const PART3_TARGETS = [
  { label: "F03", includes: "taking two seats", name: "F03 S1" },
  { label: "F03", includes: "tripled its EBITDA", name: "F03 S4" },
  { label: "F10", includes: "acquisition of Lumen", name: "F10 S0" },
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
  console.log("# review-four SHADOW");
  console.log(`store.kind=${store?.kind} path=${store?.filePath || ""} entries=${store?.size?.() ?? "?"}`);

  const cases = await loadCorpus();
  const diagnosePairs = await loadDiagnosePairs();
  console.log(`corpus cases (${cases.length}): ${cases.map((c) => c.label).join(", ")}`);
  console.log(`diagnose pair map=${diagnosePairs.size}`);

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "review-four-shadow",
    metadata: { pipelineRoute: "v4", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuse shadowTrace=${traceId}`);

  beginCacheRun({ recordEvents: false });
  let liveCostUsd = 0;
  const pairRows = [];
  const stmtRows = [];
  const reverts = [];
  const decomposed = [];
  const superlatives = [];
  const rangeClaims = [];
  const failures = [];

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    const stage1 = await extractStatements({ draftText: draft, traceId });
    liveCostUsd += Number(stage1?.costUsd) || 0;
    const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    const matched = await matchAllSources({ statements, sources, traceId });
    const matches = Array.isArray(matched?.matches) ? matched.matches : [];
    for (const m of matches) liveCostUsd += Number(m?.costUsd) || 0;

    const stage1b = await extractClaimSpans({ statements, draftText: draft, traceId });
    liveCostUsd += Number(stage1b?.stats?.costUsd) || 0;
    for (const row of Array.isArray(stage1b?.stats?.reverted) ? stage1b.stats.reverted : []) {
      reverts.push({ label, statementIndex: row.statementIndex, reason: row.reason, parent: row.parent || "" });
    }

    const claimJobs = [];
    for (const [statementIndex, claims] of stage1b.byStatementIndex.entries()) {
      const parent = statements.find((s, ord) => (Number.isFinite(s?.index) ? Number(s.index) : ord) === statementIndex);
      const parentSentence = typeof parent?.text === "string" ? parent.text : "";
      decomposed.push({
        label,
        statementIndex,
        claimCount: claims.length,
        text: parentSentence,
      });
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
      claimJobs.length > 0 ? await matchClaimSourcePairs({ claims: claimJobs, sources, traceId }) : { matches: [] };
    const claimPairMatches = Array.isArray(claimMatchResult.matches) ? claimMatchResult.matches : [];
    for (const m of claimPairMatches) liveCostUsd += Number(m?.costUsd) || 0;

    if (liveCostUsd > MAX_LIVE_COST_USD) {
      console.error(`STOP: live costUsd=${liveCostUsd.toFixed(4)} exceeded ${MAX_LIVE_COST_USD}. Aborting.`);
      process.exit(1);
    }

    const asOfBySourceIndex = buildAsOfBySourceIndex(sources);
    console.log(
      `  ${label} statements=${statements.length} pairs=${matches.length} decomposed=${stage1b.byStatementIndex.size} costUsd=${liveCostUsd.toFixed(4)}`
    );

    for (const stmt of statements) {
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : 0;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      if (isRangeClaim(text)) rangeClaims.push({ label, statementIndex, text });
      const rowMatches = matches
        .filter((m) => Number(m.statementIndex) === statementIndex)
        .slice()
        .sort((a, b) => a.sourceIndex - b.sourceIndex);

      const offMatches = rowMatches.map((m) => ({ ...m }));
      const onMatches = rowMatches.map((m) => {
        const key = pairKey(label, statementIndex, m.sourceLabel || "");
        const diagnosed = diagnosePairs.get(key);
        const merged = {
          ...m,
          periodAssessment: m.periodAssessment || diagnosed?.periodAssessment || null,
        };
        const gated = replayOn(text, merged);
        const offClass = m.classification;
        const onClass = gated.classification;
        const pa = merged.periodAssessment ?? null;
        pairRows.push({
          key,
          label,
          statementIndex,
          sourceLabel: m.sourceLabel || "",
          offClass,
          onClass,
          pre: merged.preBackstopClassification || null,
          gapOn: hasEgregiousMagnitudeGap(text, m.passage || "", { periodAssessment: pa }),
          periodsDoNotOverlap: periodsDoNotOverlap(pa),
          statementPeriod: pa?.statementPeriod || null,
          sourcePeriod: pa?.sourcePeriod || null,
          explanation: gated.explanation,
          passage: m.passage || "",
          statement: text,
        });
        return { ...m, classification: onClass, explanation: gated.explanation };
      });

      const off = withSupersession(text, offMatches, asOfBySourceIndex, TODAY);
      const onNo1b = withSupersession(text, onMatches, asOfBySourceIndex, TODAY);
      const claims = stage1b.byStatementIndex.get(statementIndex) || [];
      let onVerdict = onNo1b.agg.verdict;
      let claimUpgrade = false;
      if (claims.length >= 2) {
        const claimVerdicts = [];
        for (const claim of claims) {
          const claimMatches = claimPairMatches.filter(
            (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
          );
          const claimResolved = withSupersession(claim.text, claimMatches, asOfBySourceIndex, TODAY);
          claimVerdicts.push(claimResolved.agg.verdict);
        }
        const residual = residualHasUnclaimedAnchor(text, claims);
        const wholeSentenceHasConflict = onMatches.some(
          (m) => String(m?.classification || "").trim() === "conflicting"
        );
        const rolled = rollupClaimVerdicts({
          vToday: onNo1b.agg.verdict,
          claimVerdicts,
          residualBlocked: residual.blocked,
          wholeSentenceHasConflict,
        });
        onVerdict = rolled.verdict;
        claimUpgrade = rolled.claimUpgrade === true;
      }

      const passages = onMatches.map((m) => m.passage).filter(Boolean);
      const superPhrase = findUnevidencedSuperlative(text, passages);
      if (superPhrase && (onVerdict === "confirmed" || onVerdict === "partially_confirmed")) {
        superlatives.push({
          key: `${label}|S${statementIndex}`,
          phrase: superPhrase,
          verdict: onVerdict,
          hasConflict: onNo1b.agg.hasConflict === true,
          text: trunc(text, 140),
        });
      }

      stmtRows.push({
        key: `${label}|${statementIndex}`,
        label,
        statementIndex,
        text,
        offVerdict: off.agg.verdict,
        offHasConflict: off.agg.hasConflict === true,
        onNo1bVerdict: onNo1b.agg.verdict,
        onNo1bHasConflict: onNo1b.agg.hasConflict === true,
        onVerdict,
        onHasConflict: onNo1b.agg.hasConflict === true,
        claimUpgrade,
        decomposed: claims.length >= 2,
      });
    }
  }

  const cacheSummary = endCacheRun();
  logCacheRunSummary(cacheSummary, "review-four");

  console.log("");
  console.log("## Pair transitions (cached class -> replayed overlap/currency backstop)");
  const pairMoves = pairRows.filter((r) => r.offClass !== r.onClass);
  if (pairMoves.length === 0) console.log("  (none)");
  for (const r of pairMoves) {
    let part = "UNATTRIBUTED";
    if (r.periodsDoNotOverlap && r.onClass === "no_support") part = "Part 1";
    console.log(
      `  [${part}] ${r.key} ${r.offClass} -> ${r.onClass} tokens=${r.statementPeriod || "null"}/${r.sourcePeriod || "null"}`
    );
  }

  console.log("");
  console.log("## Statement transitions");
  const stmtMoves = stmtRows.filter(
    (r) =>
      r.offVerdict !== r.onVerdict ||
      r.offHasConflict !== r.onHasConflict ||
      r.onNo1bVerdict !== r.onVerdict
  );
  if (stmtMoves.length === 0) console.log("  (none)");
  for (const r of stmtMoves) {
    const part1 = r.offVerdict !== r.onNo1bVerdict || r.offHasConflict !== r.onNo1bHasConflict;
    const part3 = r.onNo1bVerdict !== r.onVerdict;
    const part = part1 && part3 ? "Part 1+3" : part1 ? "Part 1" : part3 ? "Part 3" : "UNATTRIBUTED";
    console.log(
      `  [${part}] ${r.key} ${evidenceKey({ verdict: r.offVerdict, hasConflict: r.offHasConflict })} -> ${evidenceKey({ verdict: r.onVerdict, hasConflict: r.onHasConflict })} (no1b=${r.onNo1bVerdict}) | ${trunc(r.text, 80)}`
    );
  }

  console.log("");
  console.log("## Part 3 Stage 1b reverts");
  const contig = reverts.filter((r) => r.reason === "not_contiguous_substring");
  console.log(`  not_contiguous_substring=${contig.length} totalReverts=${reverts.length}`);
  for (const r of contig) {
    console.log(`  ${r.label} S${r.statementIndex} ${r.reason} | ${trunc(r.parent, 90)}`);
  }
  for (const spec of PART3_TARGETS) {
    const stmt = stmtRows.find((r) => r.label === spec.label && String(r.text || "").includes(spec.includes));
    const rev = reverts.find(
      (r) => r.label === spec.label && String(r.parent || "").includes(spec.includes)
    );
    const dec = decomposed.find(
      (r) => r.label === spec.label && String(r.text || "").includes(spec.includes)
    );
    console.log(
      `  target ${spec.name} found=${Boolean(stmt)} decomposed=${Boolean(dec)} reverted=${rev ? rev.reason : "no"}`
    );
    if (rev && rev.reason === "not_contiguous_substring") {
      failures.push(`${spec.name} still reverted as not_contiguous_substring`);
    }
    if (!stmt) failures.push(`${spec.name} statement missing`);
  }

  console.log("");
  console.log("## Part 4 unevidenced superlatives");
  console.log(`  count=${superlatives.length}`);
  for (const s of superlatives) {
    console.log(`  ${s.key} phrase="${s.phrase}" verdict=${s.verdict} conflict=${s.hasConflict ? "1" : "0"} | ${s.text}`);
  }

  console.log("");
  console.log("## Range claims in corpus statements");
  console.log(`  count=${rangeClaims.length}`);
  for (const r of rangeClaims) {
    console.log(`  ${r.label} S${r.statementIndex} | ${trunc(r.text, 120)}`);
  }

  const predictedPair = pairRows.find((r) => r.key === "supersession|S0|source_A_annual_report_2019");
  if (!predictedPair) failures.push("predicted pair supersession S0 x 2019 AR missing");
  else if (predictedPair.offClass !== "conflicting" || predictedPair.onClass !== "no_support") {
    failures.push(
      `Part 1 predicted supersession S0 conflicting -> no_support, got ${predictedPair.offClass} -> ${predictedPair.onClass}`
    );
  }

  for (const r of pairMoves) {
    if (r.key === "supersession|S0|source_A_annual_report_2019") continue;
    if (!(r.periodsDoNotOverlap && r.onClass === "no_support")) {
      failures.push(`unattributable pair move: ${r.key} ${r.offClass} -> ${r.onClass}`);
    }
  }

  for (const r of stmtMoves) {
    const part1 = r.offVerdict !== r.onNo1bVerdict || r.offHasConflict !== r.onNo1bHasConflict;
    const part3 = r.onNo1bVerdict !== r.onVerdict;
    if (part3) {
      if (!(r.onNo1bVerdict === "partially_confirmed" && r.onVerdict === "confirmed")) {
        failures.push(
          `Part 3 verdict move not upgrade-only: ${r.key} ${r.onNo1bVerdict} -> ${r.onVerdict}`
        );
      }
    }
    if (part1 && r.key !== "supersession|0" && !r.key.startsWith("supersession|0")) {
      // Part 1 may also change hasConflict on S0. Any other stmt-level move from pair replay must be listed; fail if not period-driven.
      const relatedPairs = pairMoves.filter(
        (p) => p.label === r.label && Number(p.statementIndex) === Number(r.statementIndex)
      );
      const allPart1 = relatedPairs.every((p) => p.periodsDoNotOverlap && p.onClass === "no_support");
      if (relatedPairs.length === 0 || !allPart1) {
        failures.push(`unattributable statement move: ${r.key}`);
      }
    }
  }

  for (const key of HEADCOUNT_KEYS) {
    const row = pairRows.find((r) => r.key === key);
    if (!row) failures.push(`must-still-fire missing: ${key}`);
    else if (row.onClass !== "conflicting") failures.push(`must-still-fire lost: ${key} onClass=${row.onClass}`);
  }
  const f19 = pairRows.find((r) => r.key === "F19|S2|19_synth_annual_report");
  if (!f19) failures.push("F19 S2 missing");
  else if (f19.onClass !== "conflicting") failures.push(`F19 S2 onClass=${f19.onClass}`);
  const ic = pairRows.find((r) => r.key === "b67-probe|S6|IC memo");
  if (!ic) failures.push("b67-probe S6 x IC memo missing");
  else if (ic.onClass !== "conflicting") failures.push(`b67 S6 IC onClass=${ic.onClass}`);

  const probeDraft = (await readFile(path.join(B72_DIR, "draft.txt"), "utf8")).trim();
  const probeSrc = await readFile(path.join(B72_DIR, "source_ebitda_margin.txt"), "utf8");
  const probeGap = hasEgregiousMagnitudeGap(probeDraft, probeSrc);
  console.log("");
  console.log(`## B72 probe force=${probeGap ? "1" : "0"}`);
  if (probeGap) failures.push("B72 probe still forces");

  const part3Upgrades = stmtRows.filter((r) => r.onNo1bVerdict !== r.onVerdict);
  for (const r of part3Upgrades) {
    if (!(r.onNo1bVerdict === "partially_confirmed" && r.onVerdict === "confirmed")) {
      failures.push(`Part 3 non-upgrade ${r.key} ${r.onNo1bVerdict} -> ${r.onVerdict}`);
    }
  }

  console.log("");
  console.log("## Cost and cache");
  console.log(`  liveCostUsd=${liveCostUsd.toFixed(4)} trace=${traceId}`);
  console.log(
    `  cache hits=${cacheSummary.hits} misses=${cacheSummary.misses} hitRate=${(cacheSummary.hitRate * 100).toFixed(1)}%`
  );
  for (const [stage, row] of Object.entries(cacheSummary.byStage || {})) {
    console.log(
      `  ${stage} hits=${row.hits} misses=${row.misses} hitRate=${(row.hitRate * 100).toFixed(1)}%`
    );
  }

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
