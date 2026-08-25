#!/usr/bin/env node
/**
 * Evaluative residual-anchor shadow. One process. Stage 1, whole-sentence
 * Stage 2, Stage 1b, and per-claim Stage 2 run once and are shared. The only
 * variable is residualHasUnclaimedAnchor includeEvaluative false vs true.
 *
 * Usage:
 *   node scripts/diagnostic/claim-spans/run-evaluative-anchor-shadow.mjs
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { createBaselineStore } from "./baseline-cache.mjs";

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources, matchClaimSourcePairs } = await import(
  "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { residualHasUnclaimedAnchor, rollupClaimVerdicts } = await import("../../../lib/qc/claim-spans.mjs");
const { extractEvaluativeAssertionSpans } = await import("../../../lib/qc/evaluative-language.mjs");
const {
  beginCacheRun,
  endCacheRun,
  getLlmCacheStore,
  isLlmCacheEnabled,
  llmCacheDiskPathFromEnv,
} = await import("../../../lib/qc/llm-cache.mjs");

function trunc(s, n = 110) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
}

function confidenceRank(verdict) {
  const v = String(verdict || "");
  if (v === "confirmed") return 3;
  if (v === "partially_confirmed") return 2;
  return 1;
}

function claimAt(parent, text) {
  const idx = parent.indexOf(text);
  if (idx < 0) throw new Error(`claim not in parent: ${JSON.stringify(text)}`);
  return { text, localStart: idx, localEnd: idx + text.length };
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

function matchesForStatement(allMatches, statementIndex) {
  return (Array.isArray(allMatches) ? allMatches : [])
    .filter((m) => Number(m.statementIndex) === Number(statementIndex))
    .slice()
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function rollupArm({ text, off, wholeSentenceHasConflict, claims, includeEvaluative }) {
  if (!Array.isArray(claims) || claims.length < 2) {
    return {
      decomposed: false,
      verdict: off.agg.verdict,
      hasConflict: off.agg.hasConflict === true,
      claimUpgrade: false,
      blockedBy: [],
      claims: [],
      residualAnchors: [],
      residual: "",
    };
  }
  const residual = residualHasUnclaimedAnchor(text, claims, { includeEvaluative });
  const claimVerdicts = claims.map((c) => c.verdict);
  const rolled = rollupClaimVerdicts({
    vToday: off.agg.verdict,
    claimVerdicts,
    residualBlocked: residual.blocked === true,
    wholeSentenceHasConflict,
  });
  return {
    decomposed: true,
    verdict: rolled.verdict,
    hasConflict: off.agg.hasConflict === true,
    claimUpgrade: rolled.claimUpgrade === true,
    blockedBy: rolled.blockedBy,
    claims,
    residualAnchors: (residual.anchors || []).map((a) => ({ text: a.text, kind: a.kind })),
    residual: residual.residual,
  };
}

function probeExhibit(name, parent, claimTexts) {
  const claims = claimTexts.map((t) => claimAt(parent, t));
  const off = residualHasUnclaimedAnchor(parent, claims, { includeEvaluative: false });
  const on = residualHasUnclaimedAnchor(parent, claims);
  const rolledOff = rollupClaimVerdicts({
    vToday: "partially_confirmed",
    claimVerdicts: claims.map(() => "confirmed"),
    residualBlocked: off.blocked,
    wholeSentenceHasConflict: false,
  });
  const rolledOn = rollupClaimVerdicts({
    vToday: "partially_confirmed",
    claimVerdicts: claims.map(() => "confirmed"),
    residualBlocked: on.blocked,
    wholeSentenceHasConflict: false,
  });
  return {
    name,
    parent,
    offBlocked: off.blocked === true,
    onBlocked: on.blocked === true,
    offUpgrade: rolledOff.claimUpgrade === true,
    onUpgrade: rolledOn.claimUpgrade === true,
    offVerdict: rolledOff.verdict,
    onVerdict: rolledOn.verdict,
    onAnchors: (on.anchors || []).map((a) => ({ text: a.text, kind: a.kind })),
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

async function loadCorpus() {
  const out = [];
  for (const kind of ["clean", "dirty"]) {
    try {
      const row = await loadNordholt(kind);
      out.push({ label: kind === "dirty" ? "nordholt-dirty" : "nordholt-clean", ...row });
    } catch {
      /* skip */
    }
  }
  try {
    out.push({ label: "supersession", ...(await loadSupersessionFixture()) });
  } catch {
    /* skip */
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
    } catch {
      /* skip */
    }
  }
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  if (!isLlmCacheEnabled()) {
    console.error("QC_LLM_CACHE must be on for this shadow (default ON)");
    process.exit(1);
  }

  const diskPath = llmCacheDiskPathFromEnv();
  const store = getLlmCacheStore();
  const diskExisted = Boolean(diskPath && existsSync(diskPath));

  const baselineStore = await createBaselineStore({ refresh: false });
  const cases = await loadCorpus();

  console.log("# Evaluative residual-anchor SHADOW");
  console.log("Both arms in one process. LLM cache is the shared baseline.");
  console.log(
    `QC_LLM_CACHE_DISK=${diskPath || "(unset)"} diskFileExisted=${diskExisted ? "yes" : "no"} storeKind=${store?.kind || "unknown"} entries=${store?.size?.() ?? "?"}`
  );
  console.log(
    `baseline.json fingerprint-valid=${baselineStore.loaded ? "yes" : "no"} fingerprint=${baselineStore.fingerprint.slice(0, 12)}`
  );
  console.log(`corpus cases: ${cases.map((c) => c.label).join(", ") || "(none)"}`);
  console.log("");

  console.log("## 0. Known-exhibit probes (deterministic; no LLM)");
  const leverageParent =
    "Across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits, and these returns have been generated without recourse to aggressive leverage.";
  const regardedParent =
    "The team is widely regarded as among the most disciplined operators in the European lower-mid-market, and the fund generated 2.4x gross MOIC on seventeen exits.";
  const exhibits = [
    probeExhibit("leverage", leverageParent, [
      "Across Funds I to IV the manager realised 2.4x gross MOIC",
      "21% gross IRR on seventeen exits",
    ]),
    probeExhibit("widely-regarded", regardedParent, [
      "operators in the European lower-mid-market",
      "the fund generated 2.4x gross MOIC on seventeen exits",
    ]),
  ];
  for (const ex of exhibits) {
    console.log(
      `  ${ex.name} offUpgrade=${ex.offUpgrade} onUpgrade=${ex.onUpgrade} offVerdict=${ex.offVerdict} onVerdict=${ex.onVerdict} anchors=${JSON.stringify(ex.onAnchors)}`
    );
  }

  const rows = [];
  let claimJobs = 0;
  let claimHits = 0;
  let claimMisses = 0;
  let liveCostUsd = 0;

  for (const caseRow of cases) {
    const { label, draft, sources } = caseRow;
    let statements;
    let matches;
    const cached = baselineStore.get(label, draft, sources);
    if (cached) {
      statements = cached.statements;
      matches = cached.matches;
      console.log(`  ${label} baseline=hit statements=${statements.length}`);
    } else {
      const stage1 = await extractStatements({ draftText: draft });
      statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
      const matched = await matchAllSources({ statements, sources });
      matches = Array.isArray(matched?.matches) ? matched.matches : [];
      await baselineStore.set(label, draft, sources, statements, matches);
      console.log(`  ${label} baseline=store statements=${statements.length}`);
    }

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
    claimJobs += jobs.length;

    beginCacheRun({ recordEvents: true });
    const claimMatch = jobs.length > 0 ? await matchClaimSourcePairs({ claims: jobs, sources }) : { matches: [] };
    const claimStats = endCacheRun();
    claimHits += claimStats.byStage?.stage2?.hits || 0;
    claimMisses += claimStats.byStage?.stage2?.misses || 0;
    const pairMatches = Array.isArray(claimMatch.matches) ? claimMatch.matches : [];
    if ((claimStats.byStage?.stage2?.misses || 0) > 0) {
      for (const m of pairMatches) liveCostUsd += Number(m.costUsd) || 0;
    }

    for (let ord = 0; ord < statements.length; ord += 1) {
      const stmt = statements[ord];
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      const rowMatches = matchesForStatement(matches, statementIndex);
      const offBase = withSupersession(text, rowMatches, asOfBySourceIndex, TODAY);
      const wholeSentenceHasConflict = rowMatches.some(
        (m) => String(m?.classification || "").trim() === "conflicting"
      );

      const rawClaims = claimsByIndex.get(statementIndex) || [];
      const decorated = rawClaims.map((claim) => {
        const claimMatches = pairMatches.filter(
          (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
        );
        const claimResolved = withSupersession(claim.text, claimMatches, asOfBySourceIndex, TODAY);
        return {
          index: claim.index,
          text: claim.text,
          localStart: claim.localStart,
          localEnd: claim.localEnd,
          verdict: claimResolved.agg.verdict,
          hasConflict: claimResolved.agg.hasConflict === true,
        };
      });

      const before = rollupArm({
        text,
        off: offBase,
        wholeSentenceHasConflict,
        claims: decorated,
        includeEvaluative: false,
      });
      const after = rollupArm({
        text,
        off: offBase,
        wholeSentenceHasConflict,
        claims: decorated,
        includeEvaluative: true,
      });

      rows.push({
        label,
        statementIndex,
        text,
        vToday: offBase.agg.verdict,
        before,
        after,
        wholeSentenceHasConflict,
      });
    }
  }

  const moreConfident = rows.filter(
    (r) => confidenceRank(r.after.verdict) > confidenceRank(r.before.verdict)
  );
  const newlyBlocked = rows.filter((r) => r.before.claimUpgrade === true && r.after.claimUpgrade !== true);
  const evaluativeResidualUpgradedOff = rows.filter((r) => {
    if (!r.before.decomposed) return false;
    if (!r.before.claims.length || !r.before.claims.every((c) => c.verdict === "confirmed")) return false;
    const hasEval = extractEvaluativeAssertionSpans(r.after.residual || "").length > 0;
    return hasEval && r.before.claimUpgrade === true;
  });
  const evaluativeStillUpgrading = evaluativeResidualUpgradedOff.filter((r) => r.after.claimUpgrade === true);

  console.log("");
  console.log("## 1. Cache / cost");
  console.log(`  claim jobs=${claimJobs} Stage 2 hits=${claimHits} misses=${claimMisses} pairCostUsd=$${liveCostUsd.toFixed(4)}`);
  console.log(`  store entries after=${store?.size?.() ?? "?"}`);

  console.log("");
  console.log("## 2. Newly blocked upgrades (over-firing measure)");
  console.log(`  count=${newlyBlocked.length}`);
  if (newlyBlocked.length === 0) console.log("  (none)");
  for (const row of newlyBlocked) {
    const evalAnchors = (row.after.residualAnchors || []).filter((a) => a.kind === "evaluative");
    const blocking = evalAnchors.length ? evalAnchors : row.after.residualAnchors;
    console.log(
      `  ${row.label} S${row.statementIndex} vToday=${row.vToday} anchors=${JSON.stringify(blocking)} | ${trunc(row.text)}`
    );
  }

  console.log("");
  console.log("## 3. More-confident transitions");
  if (moreConfident.length === 0) console.log("  (none)");
  for (const row of moreConfident) {
    console.log(
      `  ${row.label} S${row.statementIndex} ${row.before.verdict} -> ${row.after.verdict} | ${trunc(row.text)}`
    );
  }

  const exhibitLeverage = exhibits.find((e) => e.name === "leverage");
  const exhibitRegarded = exhibits.find((e) => e.name === "widely-regarded");
  const condMoreConfident = moreConfident.length === 0;
  const condEvaluativeWithholds = evaluativeStillUpgrading.length === 0;
  const condLeverage = exhibitLeverage && exhibitLeverage.offUpgrade && !exhibitLeverage.onUpgrade && exhibitLeverage.onVerdict !== "confirmed";
  const condRegarded = exhibitRegarded && exhibitRegarded.offUpgrade && !exhibitRegarded.onUpgrade && exhibitRegarded.onVerdict !== "confirmed";

  console.log("");
  console.log("## 4. Pass conditions");
  console.log(`  [1] no card more confident: ${condMoreConfident ? "PASS" : "FAIL"} (n=${moreConfident.length})`);
  console.log(
    `  [2] confirmed-claims + evaluative residual: claimUpgrade false where it was true: ${condEvaluativeWithholds ? "PASS" : "FAIL"} (offUpgradeWithEval=${evaluativeResidualUpgradedOff.length} stillUpgrading=${evaluativeStillUpgrading.length})`
  );
  console.log(
    `  [3a] leverage exhibit stops confirmed/supported_full: ${condLeverage ? "PASS" : "FAIL"} offUpgrade=${exhibitLeverage?.offUpgrade} onUpgrade=${exhibitLeverage?.onUpgrade} onVerdict=${exhibitLeverage?.onVerdict}`
  );
  console.log(
    `  [3b] widely-regarded exhibit stops confirmed/supported_full: ${condRegarded ? "PASS" : "FAIL"} offUpgrade=${exhibitRegarded?.offUpgrade} onUpgrade=${exhibitRegarded?.onUpgrade} onVerdict=${exhibitRegarded?.onVerdict}`
  );
  console.log(`  [4] newly blocked upgrades reported above: count=${newlyBlocked.length}`);

  const pass = condMoreConfident && condEvaluativeWithholds && condLeverage && condRegarded;
  console.log("");
  console.log(`GATE ${pass ? "PASS" : "FAIL"}`);
  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
