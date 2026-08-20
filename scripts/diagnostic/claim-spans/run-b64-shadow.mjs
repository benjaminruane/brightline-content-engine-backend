#!/usr/bin/env node
/**
 * B64 claim-anchor shadow. One process, one in-memory LLM cache.
 * Stage 1 + whole-sentence Stage 2 reuse .baseline.json when the fingerprint
 * matches; otherwise they populate it. Both arms then replay identical LLM
 * output. The only variable is the claim-spans anchor rule.
 *
 * Usage:
 *   node scripts/diagnostic/claim-spans/run-b64-shadow.mjs
 */

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
const {
  extractVerifiableAnchors,
  residualHasUnclaimedAnchor,
  rollupClaimVerdicts,
} = await import("../../../lib/qc/claim-spans.mjs");
const {
  beginCacheRun,
  createMemoryStore,
  endCacheRun,
  isLlmCacheEnabled,
  setLlmCacheStore,
} = await import("../../../lib/qc/llm-cache.mjs");

function trunc(s, n = 110) {
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

function claimTextOf(c) {
  if (typeof c === "string") return c;
  return typeof c?.text === "string" ? c.text : "";
}

function oldClaimsValid(claims) {
  if (!Array.isArray(claims) || claims.length < 2) return false;
  return claims.every((c) => extractVerifiableAnchors(claimTextOf(c)).length >= 1);
}

function claimJob(statementIndex, claim, parentSentence) {
  return {
    statementIndex,
    claimIndex: claim.index,
    text: claim.text,
    parentSentence,
  };
}

function reasonCounts(rows) {
  const out = {};
  for (const row of rows) {
    const reason = row.reason || "unknown";
    out[reason] = (out[reason] || 0) + 1;
  }
  return out;
}

function formatReasons(counts) {
  return Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
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

function rollupArm({ text, off, wholeSentenceHasConflict, claims, residualFn }) {
  if (!Array.isArray(claims) || claims.length < 2) {
    return {
      decomposed: false,
      verdict: off.agg.verdict,
      hasConflict: off.agg.hasConflict === true,
      claimUpgrade: false,
      blockedBy: [],
      claims: [],
      residualAnchors: [],
    };
  }
  const residual = residualFn(text, claims);
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
    residualAnchors: (residual.anchors || []).map((a) => a.text),
  };
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

  const llmStore = createMemoryStore();
  setLlmCacheStore(llmStore);
  if (!isLlmCacheEnabled()) {
    console.error("QC_LLM_CACHE must be on for this shadow (default ON)");
    process.exit(1);
  }

  const baselineStore = await createBaselineStore({ refresh: false });
  const cases = await loadCorpus();

  console.log("# B64 claim-anchor SHADOW");
  console.log("Both arms in one process. LLM cache is the shared baseline.");
  console.log(
    `baseline.json fingerprint-valid=${baselineStore.loaded ? "yes" : "no"} fingerprint=${baselineStore.fingerprint.slice(0, 12)}`
  );
  console.log(`corpus cases: ${cases.map((c) => c.label).join(", ")}`);
  console.log("");

  const beforeReverts = [];
  const afterReverts = [];
  let beforeDecomposed = 0;
  let afterDecomposed = 0;
  let afterPrefilter = 0;
  const rows = [];

  let beforeClaimJobs = 0;
  let afterClaimJobs = 0;
  let afterArmMisses = 0;
  let afterArmHits = 0;
  let afterArmLiveCostUsd = 0;
  let afterArmNewPairs = 0;

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
    afterPrefilter += Number(stage1b.stats?.prefilterPassed) || 0;
    afterDecomposed += Number(stage1b.stats?.decomposed) || 0;
    for (const rev of stage1b.stats?.reverted || []) {
      afterReverts.push({ ...rev, caseLabel: label });
      beforeReverts.push({ ...rev, caseLabel: label });
    }

    const afterByIndex = new Map();
    const beforeByIndex = new Map();
    const beforeJobs = [];
    const afterJobs = [];

    for (const [statementIndex, claims] of stage1b.byStatementIndex.entries()) {
      const parent = statements.find((s, ord) => (Number.isFinite(s?.index) ? Number(s.index) : ord) === statementIndex);
      const parentSentence = typeof parent?.text === "string" ? parent.text : "";
      afterByIndex.set(statementIndex, claims);
      for (const claim of claims) afterJobs.push(claimJob(statementIndex, claim, parentSentence));

      if (oldClaimsValid(claims)) {
        beforeByIndex.set(statementIndex, claims);
        beforeDecomposed += 1;
        for (const claim of claims) beforeJobs.push(claimJob(statementIndex, claim, parentSentence));
      } else {
        beforeReverts.push({
          caseLabel: label,
          statementIndex,
          reason: "anchorless_claim",
          parent: parentSentence,
        });
      }
    }

    beforeClaimJobs += beforeJobs.length;
    afterClaimJobs += afterJobs.length;

    const beforeKey = (job) => `${job.statementIndex}\t${job.claimIndex}\t${job.text}`;
    const beforeKeySet = new Set(beforeJobs.map(beforeKey));

    beginCacheRun({ recordEvents: true });
    const beforeMatch =
      beforeJobs.length > 0 ? await matchClaimSourcePairs({ claims: beforeJobs, sources }) : { matches: [] };
    endCacheRun();

    beginCacheRun({ recordEvents: true });
    const afterMatch =
      afterJobs.length > 0 ? await matchClaimSourcePairs({ claims: afterJobs, sources }) : { matches: [] };
    const afterClaimStats = endCacheRun();
    afterArmMisses += afterClaimStats.byStage?.stage2?.misses || 0;
    afterArmHits += afterClaimStats.byStage?.stage2?.hits || 0;

    const afterPairMatches = Array.isArray(afterMatch.matches) ? afterMatch.matches : [];
    const beforePairMatches = Array.isArray(beforeMatch.matches) ? beforeMatch.matches : [];
    const newClaimIndexes = new Set(
      afterJobs.filter((job) => !beforeKeySet.has(beforeKey(job))).map((job) => `${job.statementIndex}:${job.claimIndex}`)
    );
    afterArmNewPairs += newClaimIndexes.size;
    for (const m of afterPairMatches) {
      const key = `${m.statementIndex}:${m.claimIndex}`;
      if (!newClaimIndexes.has(key)) continue;
      afterArmLiveCostUsd += Number(m.costUsd) || 0;
    }

    for (let ord = 0; ord < statements.length; ord += 1) {
      const stmt = statements[ord];
      const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
      const text = typeof stmt?.text === "string" ? stmt.text : "";
      const rowMatches = matchesForStatement(matches, statementIndex);
      const off = withSupersession(text, rowMatches, asOfBySourceIndex, TODAY);
      const wholeSentenceHasConflict = rowMatches.some(
        (m) => String(m?.classification || "").trim() === "conflicting"
      );

      function decorate(claims, pairMatches) {
        return (Array.isArray(claims) ? claims : []).map((claim) => {
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
      }

      const beforeArm = rollupArm({
        text,
        off,
        wholeSentenceHasConflict,
        claims: decorate(beforeByIndex.get(statementIndex) || [], beforePairMatches),
        residualFn: (parent, claims) => {
          const neu = residualHasUnclaimedAnchor(parent, claims);
          const oldAnchors = extractVerifiableAnchors(neu.residual);
          return { blocked: oldAnchors.length > 0, anchors: oldAnchors, residual: neu.residual };
        },
      });
      const afterArm = rollupArm({
        text,
        off,
        wholeSentenceHasConflict,
        claims: decorate(afterByIndex.get(statementIndex) || [], afterPairMatches),
        residualFn: residualHasUnclaimedAnchor,
      });

      rows.push({
        label,
        statementIndex,
        text,
        vToday: off.agg.verdict,
        before: beforeArm,
        after: afterArm,
        wholeSentenceHasConflict,
      });
    }
  }

  const beforeReasons = reasonCounts(beforeReverts);
  const afterReasons = reasonCounts(afterReverts);

  console.log("");
  console.log("## 1. Decomposed / reverted");
  console.log(`  prefilterPassed (unchanged pre-filter)=${afterPrefilter}`);
  console.log(`  BEFORE decomposed=${beforeDecomposed} reverted=${beforeReverts.length} ${formatReasons(beforeReasons)}`);
  console.log(`  AFTER  decomposed=${afterDecomposed} reverted=${afterReverts.length} ${formatReasons(afterReasons)}`);
  console.log(
    `  anchorless_claim ${beforeReasons.anchorless_claim || 0} -> ${afterReasons.anchorless_claim || 0}`
  );
  for (const row of afterReverts.filter((r) => r.reason === "anchorless_claim")) {
    console.log(
      `  - remaining ${row.caseLabel} S${row.statementIndex} failedClaim=${JSON.stringify(trunc(row.failedClaim || "", 80))}`
    );
  }

  const verdictChanges = rows.filter((r) => r.before.verdict !== r.after.verdict);
  const conflictChanges = rows.filter((r) => r.before.hasConflict !== r.after.hasConflict);
  const newlyBlocked = rows.filter(
    (r) => r.before.claimUpgrade === true && r.after.claimUpgrade !== true && r.after.blockedBy.includes("c")
  );
  const illegal = verdictChanges.filter(
    (r) => !(r.before.verdict === "partially_confirmed" && r.after.verdict === "confirmed")
  );

  console.log("");
  console.log("## 2. Verdict changes (OLD -> NEW)");
  if (verdictChanges.length === 0) console.log("  (none)");
  for (const row of verdictChanges) {
    console.log(
      `  ${row.label} S${row.statementIndex} ${row.before.verdict} -> ${row.after.verdict} upgrade=${row.after.claimUpgrade} | ${trunc(row.text)}`
    );
    for (const claim of row.after.claims) {
      console.log(
        `    claim[${claim.index}] ${claim.verdict} conflict=${claim.hasConflict ? "1" : "0"} | ${trunc(claim.text, 88)}`
      );
    }
    console.log(
      `    before decomposed=${row.before.decomposed} blockedBy=${row.before.blockedBy.join(",") || "-"} residual=${JSON.stringify(row.before.residualAnchors)}`
    );
    console.log(
      `    after  decomposed=${row.after.decomposed} blockedBy=${row.after.blockedBy.join(",") || "-"} residual=${JSON.stringify(row.after.residualAnchors)}`
    );
  }

  console.log("");
  console.log("## 3. hasConflict changes");
  if (conflictChanges.length === 0) console.log("  (none)");
  for (const row of conflictChanges) {
    console.log(
      `  ${row.label} S${row.statementIndex} ${row.before.hasConflict} -> ${row.after.hasConflict} | ${trunc(row.text)}`
    );
  }

  console.log("");
  console.log("## 4. Upgrades newly BLOCKED by the widened coverage guard");
  if (newlyBlocked.length === 0) console.log("  (none)");
  for (const row of newlyBlocked) {
    console.log(
      `  ${row.label} S${row.statementIndex} residual=${JSON.stringify(row.after.residualAnchors)} | ${trunc(row.text)}`
    );
    for (const claim of row.after.claims) {
      console.log(`    claim[${claim.index}] ${claim.verdict} | ${trunc(claim.text, 88)}`);
    }
  }

  console.log("");
  console.log("## 5. Second-arm claim Stage 2 cache");
  console.log(`  BEFORE claim jobs=${beforeClaimJobs}`);
  console.log(`  AFTER  claim jobs=${afterClaimJobs} (new claim texts=${afterArmNewPairs})`);
  console.log(
    `  AFTER arm Stage 2 hits=${afterArmHits} misses=${afterArmMisses} liveCostOnNewClaims=$${afterArmLiveCostUsd.toFixed(4)}`
  );
  console.log(
    "  Misses on the second arm are genuinely new claims created by the widened validator; those keys did not exist on the first arm."
  );

  const failures = [];
  if (illegal.length > 0) {
    for (const row of illegal) {
      failures.push(`${row.label} S${row.statementIndex} illegal ${row.before.verdict} -> ${row.after.verdict}`);
    }
  }
  if (conflictChanges.length > 0) {
    failures.push(`hasConflict changed on ${conflictChanges.length} statement(s)`);
  }
  const beforeAnchorless = beforeReasons.anchorless_claim || 0;
  const afterAnchorless = afterReasons.anchorless_claim || 0;
  if (afterAnchorless >= beforeAnchorless) {
    failures.push(
      `anchorless_claim did not fall (${beforeAnchorless} -> ${afterAnchorless}); expected a material drop from ~16`
    );
  }

  const pass = failures.length === 0;
  console.log("");
  console.log(`GATE ${pass ? "PASS" : "FAIL"}`);
  if (!pass) {
    for (const f of failures) console.log(`- ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
