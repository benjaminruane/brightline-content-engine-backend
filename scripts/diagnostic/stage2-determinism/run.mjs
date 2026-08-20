#!/usr/bin/env node
/**
 * Stage 2 temperature-0 determinism diagnostic (read-only).
 * Five repeats of Stages 1-3 on a representative subset, plus corpus sizing A/B/C.
 *
 * Usage:
 *   node scripts/diagnostic/stage2-determinism/run.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const TODAY = new Date("2026-08-18T00:00:00Z");
const N_RUNS = 5;
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources, matchClaimSourcePairs, STAGE2_SEED, STAGE2_CONCURRENCY } = await import(
  "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { relationalConnectivesIn, residualHasUnclaimedAnchor, rollupClaimVerdicts } = await import(
  "../../../lib/qc/claim-spans.mjs"
);
const { callLLM } = await import("../../../lib/observability.js");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { readFile: readPrompt } = await import("node:fs/promises");

/** Prior unlimited-concurrency diagnostic (2026-08-19): 5 OFF-only subset passes. */
const PREV_UNLIMITED_MS_PER_PASS = 24000;

function trunc(s, n = 140) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}...`;
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

async function loadSupersession() {
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

async function loadFixture(id) {
  const fixtures = await loadAllFixtures();
  const want = String(id).padStart(2, "0");
  const fx = fixtures.find((f) => String(f.data.id).padStart(2, "0") === want);
  if (!fx) throw new Error(`fixture ${want} not found`);
  const draft = typeof fx.data.draft === "string" ? fx.data.draft : "";
  const sources = await loadPipelineSources(fx.data.sources || []);
  return { label: `F${want}`, draft, sources };
}

function pairKey(label, statementText, sourceIndex) {
  return `${label}||${String(statementText || "").replace(/\s+/g, " ").trim()}||src${sourceIndex}`;
}

function stmtKey(label, statementText) {
  return `${label}||${String(statementText || "").replace(/\s+/g, " ").trim()}`;
}

function connectiveHits(text) {
  return relationalConnectivesIn(text);
}

const FIGURE = String.raw`(?:EUR|GBP|USD|SEK|CHF|\$|€|£)?\s*[\d,.']+\s*(?:million|billion|thousand|percent|per\s?cent|%|m|bn)?`;

function checkableArithmetic(text) {
  const t = String(text || "");
  const fromTo = new RegExp(`\\bfrom\\s+${FIGURE}\\s+to\\s+${FIGURE}`, "i").test(t);
  const upFromPair = new RegExp(`${FIGURE}\\s*,?\\s*(?:up from|down from)\\s+${FIGURE}`, "i").test(t);
  const grewToUpFrom = new RegExp(
    `\\b(?:grew to|reached|rose to|increased to|stands at)\\s+${FIGURE}[\\s\\S]{0,120}?\\b(?:up from|down from)\\s+${FIGURE}`,
    "i"
  ).test(t);
  const baseAndResult = fromTo || upFromPair || grewToUpFrom;
  const changeAndResult = new RegExp(
    `\\b(?:grew|increased|rose|fell|declined)\\s+by\\s+${FIGURE}\\s+to\\s+${FIGURE}`,
    "i"
  ).test(t);
  const baseAndChange = new RegExp(
    `\\b(?:grew|increased|rose|fell|declined)\\s+(?:by\\s+)?${FIGURE}\\s+from\\s+${FIGURE}`,
    "i"
  ).test(t);
  let why = "";
  if (baseAndResult) why = "base+result";
  else if (changeAndResult) why = "change+result";
  else if (baseAndChange) why = "base+change";
  return { ok: Boolean(why), why };
}

function isNordholtIrrTarget(text) {
  const t = String(text || "");
  return /in line with underwriting/i.test(t) && /14 per cent/i.test(t);
}

function majorityCount(values) {
  const counts = {};
  for (const v of values) {
    const key = String(v || "");
    counts[key] = (counts[key] || 0) + 1;
  }
  let top = 0;
  for (const n of Object.values(counts)) if (n > top) top = n;
  return { top, n: values.length, counts };
}

function looksQualitativeClaim(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\d/.test(t)) return false;
  return /\b(?:in line with|ahead of|well positioned|fundamentally|modestly|broadly|continues to|strong demand|market-leading|exceptional|sound)\b/i.test(
    t
  );
}

async function runEvidence(caseRow) {
  const t0 = Date.now();
  const stage1 = await extractStatements({ draftText: caseRow.draft });
  const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const tStage1 = Date.now();
  const { matches } = await matchAllSources({ statements, sources: caseRow.sources });
  const tStage2 = Date.now();
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
  const t1b = Date.now();
  const claimMatchResult =
    claimJobs.length > 0 ? await matchClaimSourcePairs({ claims: claimJobs, sources: caseRow.sources }) : { matches: [] };
  const claimPairMatches = Array.isArray(claimMatchResult.matches) ? claimMatchResult.matches : [];
  const tClaim2 = Date.now();

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
    let blockedBy = [];
    const claimBreakdown = [];
    const claimClassifications = [];
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
      blockedBy = rolled.blockedBy;
    }
    return {
      statementIndex,
      text,
      offVerdict: off.agg.verdict,
      onVerdict,
      offHasConflict: off.agg.hasConflict === true,
      onHasConflict: off.agg.hasConflict === true,
      claimUpgrade,
      blockedBy,
      decomposed: claims.length >= 2,
      classifications: sourceMatches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
        systemFingerprint: m.systemFingerprint || null,
      })),
      claimBreakdown,
      claimClassifications,
    };
  });

  return {
    statements,
    matches,
    rows,
    timings: {
      stage1Ms: tStage1 - t0,
      stage2Ms: tStage2 - tStage1,
      stage1bMs: t1b - tStage2,
      claimStage2Ms: tClaim2 - t1b,
      totalMs: tClaim2 - t0,
      wholeSentencePairs: (matches || []).length,
      claimPairs: claimPairMatches.length,
    },
  };
}

async function probeFingerprint() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const promptPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../lib/qc/pipeline-v4/prompts/stage2_v4.md"
  );
  const systemPrompt = (await readPrompt(promptPath, "utf8")).trim();
  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: "Statement:\nRevenue was EUR 10 million.\n\nSource:\nRevenue was EUR 10 million.\n",
      },
    ],
    traceName: "qc-run",
    spanName: "stage2-determinism-probe",
    metadata: { stage: "stage2-determinism-probe" },
  });
  const raw = completion?.raw && typeof completion.raw === "object" ? completion.raw : {};
  return {
    seedInRequest: true,
    seedValue: STAGE2_SEED,
    systemFingerprintPresent: Object.prototype.hasOwnProperty.call(raw, "system_fingerprint"),
    systemFingerprintValue:
      raw.system_fingerprint === undefined || raw.system_fingerprint === null
        ? null
        : String(raw.system_fingerprint),
  };
}

async function loadSubset() {
  return [
    await loadNordholt("clean"),
    await loadNordholt("dirty"),
    await loadFixture("06"),
    await loadFixture("18"),
    await loadSupersession(),
  ];
}

async function loadCorpusCases() {
  const out = [
    await loadNordholt("clean"),
    await loadNordholt("dirty"),
    await loadSupersession(),
  ];
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

async function main() {
  const origDebug = console.debug;
  console.debug = (...args) => {
    const first = String(args[0] || "");
    if (first.startsWith("[stage3]")) return;
    if (first.startsWith("[stage2] fingerprint=")) return;
    origDebug.apply(console, args);
  };

  if (process.argv.includes("--timing-once")) {
    console.log(`# Stage 2 timing (concurrency=${STAGE2_CONCURRENCY} seed=${STAGE2_SEED})`);
    const subset = await loadSubset();
    const rows = [];
    for (const c of subset) {
      const t0 = Date.now();
      const stage1 = await extractStatements({ draftText: c.draft });
      const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
      const t1 = Date.now();
      const { matches } = await matchAllSources({ statements, sources: c.sources });
      const t2 = Date.now();
      const row = {
        label: c.label,
        statements: statements.length,
        pairs: (matches || []).length,
        stage1Ms: t1 - t0,
        stage2Ms: t2 - t1,
      };
      rows.push(row);
      console.log(
        `  ${row.label} statements=${row.statements} pairs=${row.pairs} stage1Ms=${row.stage1Ms} stage2Ms=${row.stage2Ms}`
      );
    }
    const mean = rows.length ? Math.round(rows.reduce((n, r) => n + r.stage2Ms, 0) / rows.length) : 0;
    console.log(`  mean whole-sentence Stage 2 per case=${mean}ms (cap ${STAGE2_CONCURRENCY})`);
    console.log("  prior: unlimited ~4800ms/case (estimated); cap 8 = 5655ms/case");
    return;
  }

  console.log("# Stage 2 temperature-0 determinism");
  console.log(`N=${N_RUNS}  Stages 1-3 only  OFF + ON (shared Stage 1 + whole-sentence Stage 2 per run)`);
  console.log("");

  const probe = await probeFingerprint();
  console.log("## seed / system_fingerprint / concurrency");
  console.log(`  Stage 2 request passes seed parameter: yes (seed=${STAGE2_SEED})`);
  console.log(
    `  API response carries system_fingerprint field: ${probe.systemFingerprintPresent ? "yes" : "no"}` +
      (probe.systemFingerprintValue ? ` (value=${probe.systemFingerprintValue})` : " (field present but null/empty)")
  );
  console.log(
    `  Stage 2 concurrency cap: ${STAGE2_CONCURRENCY} (named STAGE2_CONCURRENCY; parallel across statement×source and claim×source pools)`
  );
  console.log(
    `  Prior unlimited wall (2026-08-19, 5 OFF-only subset passes): ~${PREV_UNLIMITED_MS_PER_PASS}ms per pass`
  );
  console.log("");

  const subset = await loadSubset();
  console.log("## Subset");
  for (const c of subset) {
    console.log(`  ${c.label} draftChars=${c.draft.length} sources=${c.sources.length}`);
  }

  const runs = [];
  const timingAcc = { stage2Ms: 0, claimStage2Ms: 0, passes: 0, wholeSentencePairs: 0, claimPairs: 0 };
  const fingerprints = new Set();
  const tAll = Date.now();
  for (let i = 0; i < N_RUNS; i += 1) {
    console.log("");
    console.log(`## Run ${i + 1}/${N_RUNS}`);
    const byLabel = {};
    for (const c of subset) {
      const ev = await runEvidence(c);
      byLabel[c.label] = ev;
      timingAcc.stage2Ms += ev.timings.stage2Ms;
      timingAcc.claimStage2Ms += ev.timings.claimStage2Ms;
      timingAcc.wholeSentencePairs += ev.timings.wholeSentencePairs;
      timingAcc.claimPairs += ev.timings.claimPairs;
      timingAcc.passes += 1;
      for (const m of ev.matches || []) {
        if (m.systemFingerprint) fingerprints.add(String(m.systemFingerprint));
      }
      console.log(
        `  ${c.label} statements=${ev.rows.length} decomposed=${ev.rows.filter((r) => r.decomposed).length} stage2Ms=${ev.timings.stage2Ms} claimStage2Ms=${ev.timings.claimStage2Ms} pairs=${ev.timings.wholeSentencePairs}/${ev.timings.claimPairs}`
      );
    }
    runs.push(byLabel);
  }
  const subsetWallMs = Date.now() - tAll;
  const avgStage2Ms = timingAcc.passes ? Math.round(timingAcc.stage2Ms / timingAcc.passes) : 0;
  console.log("");
  console.log("## Wall clock (cap 8 vs prior unlimited)");
  console.log(`  subset 5× OFF+ON wall=${subsetWallMs}ms`);
  console.log(
    `  mean whole-sentence Stage 2 per case=${avgStage2Ms}ms (prior unlimited ~${PREV_UNLIMITED_MS_PER_PASS}ms per full 5-case pass / 5 ≈ ${Math.round(PREV_UNLIMITED_MS_PER_PASS / 5)}ms per case if evenly split)`
  );
  console.log(
    `  sum whole-sentence Stage 2=${timingAcc.stage2Ms}ms  sum claim Stage 2=${timingAcc.claimStage2Ms}ms  pairs whole=${timingAcc.wholeSentencePairs} claim=${timingAcc.claimPairs}`
  );
  console.log(
    `  unique system_fingerprint values observed on whole-sentence matches: ${fingerprints.size ? [...fingerprints].join(", ") : "(none)"}`
  );

  const pairMap = new Map();
  const stmtMap = new Map();
  const claimPairMap = new Map();
  const nordholtS0 = [];
  for (let r = 0; r < runs.length; r += 1) {
    for (const c of subset) {
      const ev = runs[r][c.label];
      for (const row of ev.rows) {
        const sk = stmtKey(c.label, row.text);
        if (!stmtMap.has(sk)) {
          stmtMap.set(sk, {
            label: c.label,
            text: row.text,
            offVerdicts: [],
            onVerdicts: [],
            offConflicts: [],
            onConflicts: [],
            upgrades: [],
            decomposed: [],
          });
        }
        const rec = stmtMap.get(sk);
        rec.offVerdicts.push(row.offVerdict);
        rec.onVerdicts.push(row.onVerdict);
        rec.offConflicts.push(row.offHasConflict);
        rec.onConflicts.push(row.onHasConflict);
        rec.upgrades.push(row.claimUpgrade);
        rec.decomposed.push(row.decomposed);
        if (c.label === "nordholt-clean" && isNordholtIrrTarget(row.text)) {
          nordholtS0.push({
            run: r + 1,
            offVerdict: row.offVerdict,
            onVerdict: row.onVerdict,
            offHasConflict: row.offHasConflict,
            claimUpgrade: row.claimUpgrade,
            decomposed: row.decomposed,
            blockedBy: row.blockedBy,
            claims: row.claimBreakdown,
            classifications: row.classifications,
          });
        }
        for (const m of row.classifications) {
          const pk = pairKey(c.label, row.text, m.sourceIndex);
          if (!pairMap.has(pk)) {
            pairMap.set(pk, {
              label: c.label,
              text: row.text,
              sourceIndex: m.sourceIndex,
              sourceLabel: m.sourceLabel,
              classifications: [],
            });
          }
          pairMap.get(pk).classifications.push(m.classification);
        }
        for (const m of row.claimClassifications || []) {
          const ck = `${c.label}||${String(row.text || "").replace(/\s+/g, " ").trim()}||${String(m.claimText || "").replace(/\s+/g, " ").trim()}||src${m.sourceIndex}`;
          if (!claimPairMap.has(ck)) {
            claimPairMap.set(ck, {
              label: c.label,
              parent: row.text,
              claimText: m.claimText,
              sourceIndex: m.sourceIndex,
              sourceLabel: m.sourceLabel,
              classifications: [],
            });
          }
          claimPairMap.get(ck).classifications.push(m.classification);
        }
      }
    }
  }

  const pairFlipPairs = {};
  let pairFlipCount = 0;
  let conflictingTouchPairs = 0;
  const pairRows = [];
  const agreementHistogram = {};
  for (const row of pairMap.values()) {
    const unique = [...new Set(row.classifications)];
    const maj = majorityCount(row.classifications);
    const flipped = unique.length > 1;
    const agreeLabel = `${maj.top}/${maj.n}`;
    agreementHistogram[agreeLabel] = (agreementHistogram[agreeLabel] || 0) + 1;
    if (flipped) {
      pairFlipCount += 1;
      const pairName = unique.slice().sort().join(" <-> ");
      pairFlipPairs[pairName] = (pairFlipPairs[pairName] || 0) + 1;
      if (unique.includes("conflicting")) conflictingTouchPairs += 1;
    }
    pairRows.push({
      ...row,
      agreement: maj.top,
      observed: maj.n,
      unique,
      flipped,
    });
  }

  const flippedPairs = pairRows.filter((p) => p.flipped);
  const offStmtFlips = [];
  const onStmtFlips = [];
  const offConflictFlips = [];
  const onConflictFlips = [];
  for (const row of stmtMap.values()) {
    const uniqueOffV = [...new Set(row.offVerdicts)];
    const uniqueOnV = [...new Set(row.onVerdicts)];
    if (uniqueOffV.length > 1) {
      offStmtFlips.push({
        label: row.label,
        text: row.text,
        verdicts: row.offVerdicts,
        pair: uniqueOffV.slice().sort().join(" <-> "),
      });
    }
    if (uniqueOnV.length > 1) {
      onStmtFlips.push({
        label: row.label,
        text: row.text,
        verdicts: row.onVerdicts,
        pair: uniqueOnV.slice().sort().join(" <-> "),
      });
    }
    const uniqueOffC = [...new Set(row.offConflicts.map(Boolean))];
    const uniqueOnC = [...new Set(row.onConflicts.map(Boolean))];
    const trueN = row.offConflicts.filter(Boolean).length;
    const falseN = row.offConflicts.length - trueN;
    if (uniqueOffC.length > 1) {
      offConflictFlips.push({
        label: row.label,
        text: row.text,
        trueN,
        falseN,
        runs: row.offConflicts,
      });
    }
    if (uniqueOnC.length > 1) {
      onConflictFlips.push({
        label: row.label,
        text: row.text,
        trueN: row.onConflicts.filter(Boolean).length,
        falseN: row.onConflicts.length - row.onConflicts.filter(Boolean).length,
        runs: row.onConflicts,
      });
    }
  }

  const fixtureFlipCounts = {};
  const sourceFlipCounts = {};
  const fixtureStmtFlipCounts = {};
  for (const p of flippedPairs) {
    fixtureFlipCounts[p.label] = (fixtureFlipCounts[p.label] || 0) + 1;
    const src = p.sourceLabel || `src${p.sourceIndex}`;
    sourceFlipCounts[`${p.label}/${src}`] = (sourceFlipCounts[`${p.label}/${src}`] || 0) + 1;
  }
  for (const s of offStmtFlips) {
    fixtureStmtFlipCounts[s.label] = (fixtureStmtFlipCounts[s.label] || 0) + 1;
  }

  const claimFlipPairs = {};
  let claimFlipCount = 0;
  let claimConflictingTouch = 0;
  const claimFlipped = [];
  const claimAgreementHistogram = {};
  for (const row of claimPairMap.values()) {
    const unique = [...new Set(row.classifications)];
    const maj = majorityCount(row.classifications);
    const flipped = unique.length > 1;
    const agreeLabel = `${maj.top}/${maj.n}`;
    claimAgreementHistogram[agreeLabel] = (claimAgreementHistogram[agreeLabel] || 0) + 1;
    if (flipped) {
      claimFlipCount += 1;
      const pairName = unique.slice().sort().join(" <-> ");
      claimFlipPairs[pairName] = (claimFlipPairs[pairName] || 0) + 1;
      if (unique.includes("conflicting")) claimConflictingTouch += 1;
      claimFlipped.push({ ...row, unique, agreement: maj.top, observed: maj.n });
    }
  }

  console.log("");
  console.log("## 1a. Per statement-source pair (whole sentence, flag OFF)");
  console.log("  agreement histogram (majority/observed):");
  for (const [k, v] of Object.entries(agreementHistogram).sort((a, b) => b[0].localeCompare(a[0]))) {
    console.log(`    ${k}: ${v} pairs`);
  }
  console.log("  flips:");
  if (flippedPairs.length === 0) console.log("    (none)");
  for (const p of flippedPairs) {
    console.log(
      `    ${p.label} src[${p.sourceIndex}] ${p.sourceLabel} agree=${p.agreement}/${p.observed} runs=[${p.classifications.join(", ")}] | ${trunc(p.text, 100)}`
    );
  }

  console.log("");
  console.log("## 1b. Classification flip rate (whole sentence)");
  const pairTotal = pairMap.size;
  const pairPct = pairTotal ? ((100 * pairFlipCount) / pairTotal).toFixed(2) : "0.00";
  console.log(`  pairs=${pairTotal} flipped=${pairFlipCount} rate=${pairPct}%`);
  console.log("  flip pairs observed:");
  for (const [k, v] of Object.entries(pairFlipPairs).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (Object.keys(pairFlipPairs).length === 0) console.log("    (none)");

  console.log("");
  console.log("## 1c. Statement-level VERDICT stability OFF vs ON");
  const stmtTotal = stmtMap.size;
  const offStmtPct = stmtTotal ? ((100 * offStmtFlips.length) / stmtTotal).toFixed(2) : "0.00";
  const onStmtPct = stmtTotal ? ((100 * onStmtFlips.length) / stmtTotal).toFixed(2) : "0.00";
  console.log(`  statements=${stmtTotal}`);
  console.log(`  OFF verdict-changed=${offStmtFlips.length} rate=${offStmtPct}%`);
  console.log(`  ON  verdict-changed=${onStmtFlips.length} rate=${onStmtPct}%`);
  console.log("  OFF flips:");
  if (offStmtFlips.length === 0) console.log("    (none)");
  for (const s of offStmtFlips) {
    console.log(`    ${s.label} ${s.pair} runs=[${s.verdicts.join(", ")}] | ${trunc(s.text, 110)}`);
  }
  console.log("  ON flips:");
  if (onStmtFlips.length === 0) console.log("    (none)");
  for (const s of onStmtFlips) {
    console.log(`    ${s.label} ${s.pair} runs=[${s.verdicts.join(", ")}] | ${trunc(s.text, 110)}`);
  }

  console.log("");
  console.log("## 1c2. hasConflict stability OFF vs ON");
  const offConfPct = stmtTotal ? ((100 * offConflictFlips.length) / stmtTotal).toFixed(2) : "0.00";
  const onConfPct = stmtTotal ? ((100 * onConflictFlips.length) / stmtTotal).toFixed(2) : "0.00";
  console.log(`  OFF hasConflict-unstable=${offConflictFlips.length} rate=${offConfPct}%`);
  console.log(`  ON  hasConflict-unstable=${onConflictFlips.length} rate=${onConfPct}%`);
  console.log("  (ON cannot change hasConflict by design; rates should match.)");
  console.log("  per statement (unstable only; trueN/falseN of 5):");
  if (offConflictFlips.length === 0) console.log("    (none)");
  for (const s of offConflictFlips) {
    console.log(
      `    ${s.label} true=${s.trueN} false=${s.falseN} runs=[${s.runs.map((v) => (v ? "1" : "0")).join("")}] | ${trunc(s.text, 110)}`
    );
  }

  console.log("");
  console.log("## 1d. CONFLICTING involvement on whole-sentence pairs (prominent)");
  if (conflictingTouchPairs === 0) {
    console.log("  NONE. No statement-source pair flipped to or from conflicting across the 5 runs.");
  } else {
    console.log(`  YES. ${conflictingTouchPairs} pair(s) involved conflicting in either direction.`);
    for (const p of flippedPairs.filter((x) => x.unique.includes("conflicting"))) {
      console.log(
        `  ${p.label} src[${p.sourceIndex}] ${p.sourceLabel} runs=[${p.classifications.join(", ")}] | ${trunc(p.text, 100)}`
      );
    }
  }

  console.log("");
  console.log("## 1e. Clustering");
  console.log("  classification flips by fixture:");
  for (const [k, v] of Object.entries(fixtureFlipCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v} flipping pairs`);
  }
  if (!Object.keys(fixtureFlipCounts).length) console.log("    (none)");
  console.log("  classification flips by fixture/source:");
  for (const [k, v] of Object.entries(sourceFlipCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (!Object.keys(sourceFlipCounts).length) console.log("    (none)");
  console.log("  OFF verdict flips by fixture:");
  for (const [k, v] of Object.entries(fixtureStmtFlipCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (!Object.keys(fixtureStmtFlipCounts).length) console.log("    (none)");

  console.log("");
  console.log("## 1f. Per-claim classification stability (flag ON)");
  const claimTotal = claimPairMap.size;
  const claimPct = claimTotal ? ((100 * claimFlipCount) / claimTotal).toFixed(2) : "0.00";
  console.log(`  claim-source pairs=${claimTotal} flipped=${claimFlipCount} rate=${claimPct}%`);
  console.log("  agreement histogram:");
  for (const [k, v] of Object.entries(claimAgreementHistogram).sort((a, b) => b[0].localeCompare(a[0]))) {
    console.log(`    ${k}: ${v} pairs`);
  }
  if (!Object.keys(claimAgreementHistogram).length) console.log("    (none)");
  console.log("  flip pairs observed:");
  for (const [k, v] of Object.entries(claimFlipPairs).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (!Object.keys(claimFlipPairs).length) console.log("    (none)");
  console.log(`  claim pairs touching conflicting: ${claimConflictingTouch}`);
  console.log("  flips:");
  if (claimFlipped.length === 0) console.log("    (none)");
  for (const p of claimFlipped) {
    console.log(
      `    ${p.label} src[${p.sourceIndex}] ${p.sourceLabel} agree=${p.agreement}/${p.observed} runs=[${p.classifications.join(", ")}] | ${trunc(p.claimText, 90)}`
    );
  }

  console.log("");
  console.log("## 1g. Nordholt CLEAN S0 hypothesis");
  console.log(
    "  Hypothesis: when whole-sentence is partial, upgrade fires to confirmed; when confirmed, stays confirmed; card stops moving."
  );
  if (nordholtS0.length === 0) {
    console.log("  MISSING target sentence");
  } else {
    const onStable = new Set(nordholtS0.map((r) => r.onVerdict)).size === 1;
    const offStable = new Set(nordholtS0.map((r) => r.offVerdict)).size === 1;
    const allOnConfirmed = nordholtS0.every((r) => r.onVerdict === "confirmed");
    const upgradesWhenPartial = nordholtS0.filter((r) => r.offVerdict === "partially_confirmed");
    const upgradeOk = upgradesWhenPartial.every((r) => r.claimUpgrade && r.onVerdict === "confirmed");
    const staysWhenConfirmed = nordholtS0
      .filter((r) => r.offVerdict === "confirmed")
      .every((r) => r.onVerdict === "confirmed" && r.claimUpgrade === false);
    console.log(`  OFF stable=${offStable ? "yes" : "no"}  ON stable=${onStable ? "yes" : "no"}  all ON confirmed=${allOnConfirmed ? "yes" : "no"}`);
    console.log(
      `  upgrade fires on every OFF-partial run=${upgradeOk ? "yes" : "no"}  stays confirmed on every OFF-confirmed run=${staysWhenConfirmed ? "yes" : "no"}`
    );
    console.log(`  HYPOTHESIS: ${onStable && allOnConfirmed && upgradeOk && staysWhenConfirmed ? "CONFIRMED" : "REFUTED"}`);
    for (const r of nordholtS0) {
      console.log(
        `  run ${r.run} off=${r.offVerdict} on=${r.onVerdict} upgrade=${r.claimUpgrade} decomposed=${r.decomposed} blockedBy=${(r.blockedBy || []).join(",") || "-"}`
      );
      for (const src of r.classifications) {
        console.log(`    whole src[${src.sourceIndex}] ${src.sourceLabel}=${src.classification}`);
      }
      for (const claim of r.claims || []) {
        console.log(`    claim[${claim.index}] ${claim.verdict} | ${trunc(claim.text, 88)}`);
      }
    }
  }

  console.log("");
  console.log("## 2. Backlog sizing (full loadable corpus, Stage 1 + Stage 1b)");
  const corpus = await loadCorpusCases();
  const connectiveByToken = {};
  const connectiveExamples = [];
  let connectiveSentenceCount = 0;
  const arithByWhy = {};
  const arithExamples = [];
  let arithSentenceCount = 0;
  const allReverts = [];

  for (const c of corpus) {
    const stage1 = await extractStatements({ draftText: c.draft });
    const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
    for (const s of statements) {
      const text = typeof s?.text === "string" ? s.text : "";
      const hits = connectiveHits(text);
      if (hits.length) {
        connectiveSentenceCount += 1;
        for (const h of hits) connectiveByToken[h] = (connectiveByToken[h] || 0) + 1;
        if (connectiveExamples.length < 15) {
          connectiveExamples.push({ tokens: hits, label: c.label, text });
        }
      }
      const arith = checkableArithmetic(text);
      if (arith.ok) {
        arithSentenceCount += 1;
        arithByWhy[arith.why] = (arithByWhy[arith.why] || 0) + 1;
        if (arithExamples.length < 15) {
          arithExamples.push({ why: arith.why, label: c.label, text });
        }
      }
    }
    const stage1b = await extractClaimSpans({
      statements,
      draftText: c.draft,
      options: { claimSpansEnabled: true },
    });
    for (const row of stage1b.stats.reverted || []) {
      allReverts.push({
        label: c.label,
        statementIndex: row.statementIndex,
        reason: row.reason,
        parent: row.parent || "",
        failedClaim: row.failedClaim || "",
        claims: Array.isArray(row.claims) ? row.claims : [],
      });
    }
  }

  console.log("");
  console.log("### 2A. Relational connectives");
  console.log(`  unique sentences=${connectiveSentenceCount}`);
  const tokenLines = Object.entries(connectiveByToken).sort((a, b) => b[1] - a[1]);
  for (const [tok, n] of tokenLines) console.log(`    ${JSON.stringify(tok)}: ${n}`);
  if (!tokenLines.length) console.log("    (none)");
  console.log("  examples (up to 15):");
  for (const ex of connectiveExamples) {
    console.log(`    [${ex.label}] ${ex.tokens.map((t) => JSON.stringify(t)).join(",")} | ${ex.text}`);
  }
  if (!connectiveExamples.length) console.log("    (none)");

  console.log("");
  console.log("### 2B. Arithmetic-checkable (stricter: at least two of base/change/result)");
  console.log(`  unique sentences=${arithSentenceCount} (prior loose count was 34)`);
  for (const [k, n] of Object.entries(arithByWhy).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${n}`);
  }
  if (!Object.keys(arithByWhy).length) console.log("    (none)");
  console.log("  examples (up to 15):");
  for (const ex of arithExamples) {
    console.log(`    [${ex.label}] ${ex.why} | ${ex.text}`);
  }
  if (!arithExamples.length) console.log("    (none)");

  console.log("");
  console.log("### 2C. Stage 1b reverts (fresh pass; same validation as B53a)");
  console.log(`  reverted=${allReverts.length}`);
  const byReason = {};
  for (const row of allReverts) byReason[row.reason] = (byReason[row.reason] || 0) + 1;
  for (const [k, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${n}`);
  }
  const anchorless = allReverts.filter((r) => r.reason === "anchorless_claim");
  const qualitative = anchorless.filter((r) => looksQualitativeClaim(r.failedClaim));
  console.log(
    `  anchorless_claim=${anchorless.length} qualitative-looking failedClaim=${qualitative.length} other-fragment=${anchorless.length - qualitative.length}`
  );
  for (const row of allReverts) {
    const tag =
      row.reason === "anchorless_claim"
        ? looksQualitativeClaim(row.failedClaim)
          ? "qualitative"
          : "fragment"
        : row.reason;
    console.log(`  ${row.label} S${row.statementIndex} reason=${row.reason} tag=${tag}`);
    console.log(`    parent: ${row.parent}`);
    console.log(`    failedClaim: ${row.failedClaim || "(none)"}`);
    if (row.claims.length) {
      console.log(`    claims: ${row.claims.map((c) => JSON.stringify(String(c))).join(" || ")}`);
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, "last-run.json"),
    JSON.stringify(
      {
        nRuns: N_RUNS,
        probe,
        subsetWallMs,
        avgStage2Ms,
        timingAcc,
        fingerprints: [...fingerprints],
        pairTotal,
        pairFlipCount,
        pairPct,
        pairFlipPairs,
        conflictingTouchPairs,
        stmtTotal,
        offStmtFlipCount: offStmtFlips.length,
        onStmtFlipCount: onStmtFlips.length,
        offStmtPct,
        onStmtPct,
        offStmtFlips,
        onStmtFlips,
        offConflictFlips,
        onConflictFlips,
        offConfPct,
        onConfPct,
        claimTotal,
        claimFlipCount,
        claimPct,
        claimFlipPairs,
        claimFlipped,
        nordholtS0,
        flippedPairs,
        fixtureFlipCounts,
        fixtureStmtFlipCounts,
        agreementHistogram,
        connectiveSentenceCount,
        arithSentenceCount,
        sourceFlipCounts,
        connectiveByToken,
        connectiveExamples,
        arithByWhy,
        arithExamples,
        reverts: allReverts,
      },
      null,
      2
    ),
    "utf8"
  );
  console.log("");
  console.log(`Wrote ${path.join(OUT_DIR, "last-run.json")} (gitignored)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
