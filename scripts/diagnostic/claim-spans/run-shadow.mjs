#!/usr/bin/env node
/**
 * B53a claim-span shadow gate (read-only, blocking).
 * Shared Stage 1 + whole-sentence Stage 2; flag-OFF = V_today; flag-ON adds
 * Stage 1b + per-claim Stage 2 + upgrade-only rollup.
 *
 * Usage:
 *   node scripts/diagnostic/claim-spans/run-shadow.mjs
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
  residualHasUnclaimedAnchor,
  rollupClaimVerdicts,
} = await import("../../../lib/qc/claim-spans.mjs");

function trunc(s, n = 110) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
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

function matchesForStatement(allMatches, statementIndex) {
  return (Array.isArray(allMatches) ? allMatches : [])
    .filter((m) => Number(m.statementIndex) === Number(statementIndex))
    .slice()
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function isNordholtIrrTarget(text) {
  const t = String(text || "");
  return /in line with underwriting/i.test(t) && /14 per cent/i.test(t);
}

async function evaluateDraft(label, draft, sources, baselineStore) {
  let statements;
  let matches;
  const cached = baselineStore ? baselineStore.get(label, draft, sources) : null;
  if (cached) {
    statements = cached.statements;
    matches = cached.matches;
    console.log(`  ${label} baseline=hit statements=${statements.length} matches=${matches.length}`);
  } else {
    const stage1 = await extractStatements({ draftText: draft });
    statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    const matched = await matchAllSources({ statements, sources });
    matches = Array.isArray(matched?.matches) ? matched.matches : [];
    if (baselineStore) {
      await baselineStore.set(label, draft, sources, statements, matches);
      console.log(`  ${label} baseline=store statements=${statements.length} matches=${matches.length}`);
    }
  }
  const asOfBySourceIndex = buildAsOfBySourceIndex(sources);

  const stage1b = await extractClaimSpans({
    statements,
    draftText: draft,
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
    claimJobs.length > 0 ? await matchClaimSourcePairs({ claims: claimJobs, sources }) : { matches: [] };
  const claimPairMatches = Array.isArray(claimMatchResult.matches) ? claimMatchResult.matches : [];

  const rows = [];
  for (let ord = 0; ord < statements.length; ord += 1) {
    const stmt = statements[ord];
    const statementIndex = Number.isFinite(stmt?.index) ? Number(stmt.index) : ord;
    const text = typeof stmt?.text === "string" ? stmt.text : "";
    const rowMatches = matchesForStatement(matches, statementIndex);
    const off = withSupersession(text, rowMatches, asOfBySourceIndex, TODAY);
    const wholeSentenceHasConflict = rowMatches.some(
      (m) => String(m?.classification || "").trim() === "conflicting"
    );

    const claims = stage1b.byStatementIndex.get(statementIndex) || [];
    let onVerdict = off.agg.verdict;
    let claimUpgrade = false;
    let blockedBy = [];
    let claimBreakdown = [];
    let residualAnchors = [];
    if (claims.length >= 2) {
      for (const claim of claims) {
        const claimMatches = claimPairMatches.filter(
          (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
        );
        const claimResolved = withSupersession(claim.text, claimMatches, asOfBySourceIndex, TODAY);
        claimBreakdown.push({
          index: claim.index,
          text: claim.text,
          verdict: claimResolved.agg.verdict,
          hasConflict: claimResolved.agg.hasConflict === true,
        });
      }
      const residual = residualHasUnclaimedAnchor(text, claims);
      residualAnchors = residual.anchors.map((a) => a.text);
      const rolled = rollupClaimVerdicts({
        vToday: off.agg.verdict,
        claimVerdicts: claimBreakdown.map((c) => c.verdict),
        residualBlocked: residual.blocked,
        wholeSentenceHasConflict,
      });
      onVerdict = rolled.verdict;
      claimUpgrade = rolled.claimUpgrade === true;
      blockedBy = rolled.blockedBy;
    }

    rows.push({
      label,
      statementIndex,
      text,
      offVerdict: off.agg.verdict,
      offHasConflict: off.agg.hasConflict === true,
      onVerdict,
      onHasConflict: off.agg.hasConflict === true,
      claimUpgrade,
      blockedBy,
      claims: claimBreakdown,
      residualAnchors,
      decomposed: claims.length >= 2,
      supersededNotes: Array.isArray(off.resolved.supersededNotes) ? off.resolved.supersededNotes : [],
      sourceClassifications: rowMatches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
      })),
    });
  }

  return { label, statements, rows, stats: stage1b.stats };
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

function fixtureRole(text) {
  const t = String(text || "");
  if (/EUR 200 million/i.test(t) && /2025|twelve months/i.test(t)) return "S0";
  if (/employs 720/i.test(t)) return "S1";
  if (/EBITDA/i.test(t) && /FY2024|45/i.test(t)) return "S2";
  if (/12 portfolio companies/i.test(t)) return "S3";
  return null;
}

async function main() {
  const origDebug = console.debug;
  console.debug = (...args) => {
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  const failures = [];
  const allRows = [];
  const statsAcc = { prefilterPassed: 0, decomposed: 0, reverted: [] };

  function absorbStats(stats, caseLabel) {
    statsAcc.prefilterPassed += Number(stats?.prefilterPassed) || 0;
    statsAcc.decomposed += Number(stats?.decomposed) || 0;
    for (const row of Array.isArray(stats?.reverted) ? stats.reverted : []) {
      statsAcc.reverted.push({ ...row, caseLabel });
    }
  }

  const onlyNordholt = process.argv.includes("--nordholt-only");
  const refreshBaseline = process.argv.includes("--refresh-baseline");
  const baselineStore = await createBaselineStore({ refresh: refreshBaseline });

  console.log("# B53a claim-span SHADOW");
  console.log(`Today=${TODAY.toISOString().slice(0, 10)}`);
  if (onlyNordholt) console.log("mode=nordholt-only");
  console.log(
    `baseline fingerprint=${baselineStore.fingerprint.slice(0, 12)} refresh=${refreshBaseline ? "1" : "0"} loaded=${baselineStore.loaded ? "1" : "0"}`
  );
  console.log(
    "Stage 2 concurrency: no cap. matchAllSources Promise.all over every statement x source pair (parallel across both)."
  );
  console.log("");

  console.log("## Nordholt CLEAN");
  const nordholtClean = await loadNordholt("clean");
  const cleanEval = await evaluateDraft("nordholt-clean", nordholtClean.draft, nordholtClean.sources, baselineStore);
  absorbStats(cleanEval.stats, "nordholt-clean");
  allRows.push(...cleanEval.rows);
  console.log(
    `  statements=${cleanEval.rows.length} prefilter=${cleanEval.stats.prefilterPassed} decomposed=${cleanEval.stats.decomposed} reverted=${cleanEval.stats.reverted.length}`
  );

  if (!onlyNordholt) {
  console.log("");
  console.log("## Nordholt DIRTY");
  const nordholtDirty = await loadNordholt("dirty");
  const dirtyEval = await evaluateDraft("nordholt-dirty", nordholtDirty.draft, nordholtDirty.sources, baselineStore);
  absorbStats(dirtyEval.stats, "nordholt-dirty");
  allRows.push(...dirtyEval.rows);
  console.log(
    `  statements=${dirtyEval.rows.length} prefilter=${dirtyEval.stats.prefilterPassed} decomposed=${dirtyEval.stats.decomposed} reverted=${dirtyEval.stats.reverted.length}`
  );

  console.log("");
  console.log("## Supersession fixture");
  const fx = await loadSupersessionFixture();
  const fxEval = await evaluateDraft("supersession", fx.draft, fx.sources, baselineStore);
  absorbStats(fxEval.stats, "supersession");
  allRows.push(...fxEval.rows);
  for (const row of fxEval.rows) {
    const role = fixtureRole(row.text) || `S${row.statementIndex}`;
    console.log(
      `  ${role} off=${evidenceKey({ verdict: row.offVerdict, hasConflict: row.offHasConflict })} on=${evidenceKey({
        verdict: row.onVerdict,
        hasConflict: row.onHasConflict,
      })} notes=${row.supersededNotes.length} | ${trunc(row.text, 88)}`
    );
    if (role === "S0" || role === "S1") {
      const ok = row.onVerdict === "confirmed" && row.onHasConflict === false && row.supersededNotes.length > 0;
      if (!ok) {
        failures.push(
          `${role} expected confirmed+hasConflict=false+note; got ${evidenceKey({
            verdict: row.onVerdict,
            hasConflict: row.onHasConflict,
          })} notes=${row.supersededNotes.length}`
        );
      }
    }
    if (role === "S2" || role === "S3") {
      const stayConflict = row.onHasConflict === true || row.onVerdict === "conflicting";
      if (!stayConflict) {
        failures.push(
          `${role} expected to stay conflicting; got ${evidenceKey({
            verdict: row.onVerdict,
            hasConflict: row.onHasConflict,
          })}`
        );
      }
    }
  }

  console.log("");
  console.log("## Diagnostic fixtures 01-23 (txt sources)");
  const fixtures = await loadAllFixtures();
  const numbered = fixtures.filter((f) => {
    const n = parseInt(String(f.data.id), 10);
    return Number.isFinite(n) && n >= 1 && n <= 23;
  });
  for (const fxRow of numbered) {
    const fid = String(fxRow.data.id).padStart(2, "0");
    const draft = typeof fxRow.data.draft === "string" ? fxRow.data.draft : "";
    if (!draft.trim() || draft.trim() === "PLACEHOLDER") {
      console.log(`  F${fid} skipped: no draft`);
      continue;
    }
    let sources;
    try {
      sources = await loadPipelineSources(fxRow.data.sources || []);
    } catch (err) {
      console.log(`  F${fid} skipped: ${err.message}`);
      continue;
    }
    if (!sources.length) {
      console.log(`  F${fid} skipped: no sources`);
      continue;
    }
    const ev = await evaluateDraft(`F${fid}`, draft, sources, baselineStore);
    absorbStats(ev.stats, `F${fid}`);
    allRows.push(...ev.rows.map((r) => ({ ...r, label: `F${fid}` })));
    console.log(
      `  F${fid} statements=${ev.rows.length} prefilter=${ev.stats.prefilterPassed} decomposed=${ev.stats.decomposed}`
    );
  }
  }

  console.log("");
  console.log("## 1. Pre-filter / decompose / revert counts");
  console.log(`  prefilterPassed=${statsAcc.prefilterPassed}`);
  console.log(`  decomposed=${statsAcc.decomposed}`);
  console.log(`  reverted=${statsAcc.reverted.length}`);
  for (const row of statsAcc.reverted) {
    console.log(`  - revert ${row.caseLabel} S${row.statementIndex} reason=${row.reason}`);
  }

  const verdictChanges = allRows.filter((r) => r.offVerdict !== r.onVerdict);
  const conflictChanges = allRows.filter((r) => r.offHasConflict !== r.onHasConflict);
  const blocked = allRows.filter((r) => r.decomposed && r.offVerdict === "partially_confirmed" && !r.claimUpgrade);

  console.log("");
  console.log("## 2. Verdict changes (OLD -> NEW)");
  if (verdictChanges.length === 0) console.log("  (none)");
  for (const row of verdictChanges) {
    console.log(
      `  ${row.label} S${row.statementIndex} ${row.offVerdict} -> ${row.onVerdict} upgrade=${row.claimUpgrade} | ${trunc(row.text)}`
    );
    for (const claim of row.claims) {
      console.log(`    claim[${claim.index}] ${claim.verdict} conflict=${claim.hasConflict ? "1" : "0"} | ${trunc(claim.text, 88)}`);
    }
    const a = row.offVerdict === "partially_confirmed";
    const b = row.claims.length > 0 && row.claims.every((c) => c.verdict === "confirmed");
    const c = row.residualAnchors.length === 0;
    const d = true;
    console.log(`    conditions a=${a} b=${b} c=${c} (residual empty) d=no-whole-sentence-conflict`);
    if (row.offVerdict !== "partially_confirmed" || row.onVerdict !== "confirmed") {
      failures.push(
        `${row.label} S${row.statementIndex} illegal transition ${row.offVerdict} -> ${row.onVerdict}`
      );
    }
  }

  console.log("");
  console.log("## 3. hasConflict changes");
  if (conflictChanges.length === 0) console.log("  (none)");
  for (const row of conflictChanges) {
    console.log(
      `  ${row.label} S${row.statementIndex} ${row.offHasConflict} -> ${row.onHasConflict} | ${trunc(row.text)}`
    );
    failures.push(`${row.label} S${row.statementIndex} hasConflict changed`);
  }

  console.log("");
  console.log("## 4. Upgrade blocked (V_today partial, decomposed)");
  if (blocked.length === 0) console.log("  (none)");
  for (const row of blocked) {
    console.log(
      `  ${row.label} S${row.statementIndex} blockedBy=${row.blockedBy.join(",") || "?"} residual=${JSON.stringify(
        row.residualAnchors
      )} | ${trunc(row.text)}`
    );
    for (const claim of row.claims) {
      console.log(`    claim[${claim.index}] ${claim.verdict} | ${trunc(claim.text, 88)}`);
    }
  }

  const nordholtUpgrade = cleanEval.rows.find((r) => isNordholtIrrTarget(r.text) && r.claimUpgrade);
  const nordholtTarget = cleanEval.rows.find((r) => isNordholtIrrTarget(r.text));
  console.log("");
  console.log("## Nordholt CLEAN underwriting/IRR target");
  if (!nordholtTarget) {
    console.log("  MISSING sentence");
    failures.push("Nordholt CLEAN underwriting + 14 per cent IRR sentence not found");
  } else {
    console.log(
      `  S${nordholtTarget.statementIndex} off=${nordholtTarget.offVerdict} on=${nordholtTarget.onVerdict} upgrade=${nordholtTarget.claimUpgrade} decomposed=${nordholtTarget.decomposed}`
    );
    for (const src of nordholtTarget.sourceClassifications || []) {
      console.log(`    whole-sentence src[${src.sourceIndex}] ${src.sourceLabel}=${src.classification}`);
    }
    for (const claim of nordholtTarget.claims) {
      console.log(`    claim[${claim.index}] ${claim.verdict} | ${trunc(claim.text, 88)}`);
    }
    if (!nordholtUpgrade) {
      failures.push(
        `Nordholt CLEAN S${nordholtTarget.statementIndex} underwriting/IRR was not upgraded (${nordholtTarget.offVerdict} -> ${nordholtTarget.onVerdict}, decomposed=${nordholtTarget.decomposed}, blockedBy=${nordholtTarget.blockedBy.join(",")})`
      );
    }
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
