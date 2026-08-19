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

loadLocalEnvFiles();

const TODAY = new Date("2026-08-18T00:00:00Z");
const N_RUNS = 5;
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const { matchAllSources } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { aggregateVerdict } = await import("../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs");
const { extractClaimSpans } = await import("../../../lib/qc/pipeline-v4/stage1b-extract-claim-spans.mjs");
const { resolveSupersession, buildAsOfBySourceIndex } = await import("../../../lib/qc/supersession.mjs");
const { RELATIONAL_CONNECTIVES } = await import("../../../lib/qc/claim-spans.mjs");
const { callLLM } = await import("../../../lib/observability.js");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { readFile: readPrompt } = await import("node:fs/promises");

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
  const t = String(text || "");
  const lower = t.toLowerCase();
  return RELATIONAL_CONNECTIVES.filter((c) => lower.includes(c.toLowerCase()));
}

function arithmeticKinds(text) {
  const t = String(text || "");
  const kinds = [];
  if (/\d[\d,.']*\s*(?:%|per\s?cent)\s+of\b/i.test(t)) kinds.push("percentage_of_base");
  const endpointCue =
    /\b(?:up from|down from|grew from|increased from|rose from|fell from|declined from)\b/i.test(t) ||
    /\bfrom\s+(?:EUR|GBP|USD|SEK|CHF|\$|€|£)?\s*[\d,.']+.+\bto\s+(?:EUR|GBP|USD|SEK|CHF|\$|€|£)?\s*[\d,.']+/i.test(t);
  if (endpointCue) kinds.push("change_between_endpoints");
  if (
    /\bof which\b/i.test(t) ||
    (/\b(?:comprising|composed of|broken down into)\b/i.test(t) && (t.match(/\d/g) || []).length >= 2)
  ) {
    kinds.push("total_and_parts");
  }
  if (
    /\b(?:share|fraction|portion)\s+of\b/i.test(t) ||
    /\b(?:one|two|three)[- ]thirds?\b/i.test(t) ||
    /\bhalf of\b/i.test(t)
  ) {
    kinds.push("share_and_fraction");
  }
  return [...new Set(kinds)];
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
  const stage1 = await extractStatements({ draftText: caseRow.draft });
  const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const { matches } = await matchAllSources({ statements, sources: caseRow.sources });
  const asOf = buildAsOfBySourceIndex(caseRow.sources);
  const rows = statements.map((s, ord) => {
    const statementIndex = Number.isFinite(s?.index) ? Number(s.index) : ord;
    const text = typeof s?.text === "string" ? s.text : "";
    const sourceMatches = (matches || [])
      .filter((m) => Number(m.statementIndex) === statementIndex)
      .slice()
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    const out = withSupersession(text, sourceMatches, asOf);
    return {
      statementIndex,
      text,
      verdict: out.agg.verdict,
      hasConflict: out.agg.hasConflict === true,
      classifications: sourceMatches.map((m) => ({
        sourceIndex: m.sourceIndex,
        sourceLabel: m.sourceLabel,
        classification: m.classification,
      })),
    };
  });
  return { statements, matches, rows };
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
    seedInRequest: false,
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
    if (String(args[0] || "").startsWith("[stage3]")) return;
    origDebug.apply(console, args);
  };

  console.log("# Stage 2 temperature-0 determinism");
  console.log(`N=${N_RUNS}  Stages 1-3 only`);
  console.log("");

  const seedInSource = false;
  const probe = await probeFingerprint();
  console.log("## f. seed / system_fingerprint (probe call, no pipeline change)");
  console.log(`  Stage 2 request passes seed parameter: ${seedInSource ? "yes" : "no"}`);
  console.log(
    `  API response carries system_fingerprint field: ${probe.systemFingerprintPresent ? "yes" : "no"}` +
      (probe.systemFingerprintValue ? ` (value=${probe.systemFingerprintValue})` : " (field present but null/empty)")
  );
  console.log(
    "  Stage 2 concurrency: no cap. matchAllSources Promise.all over every statement x source pair (parallel across both statements and sources)."
  );
  console.log("");

  const subset = await loadSubset();
  console.log("## Subset");
  for (const c of subset) {
    console.log(`  ${c.label} draftChars=${c.draft.length} sources=${c.sources.length}`);
  }

  const runs = [];
  for (let i = 0; i < N_RUNS; i += 1) {
    console.log("");
    console.log(`## Run ${i + 1}/${N_RUNS}`);
    const byLabel = {};
    for (const c of subset) {
      const ev = await runEvidence(c);
      byLabel[c.label] = ev;
      console.log(`  ${c.label} statements=${ev.rows.length}`);
    }
    runs.push(byLabel);
  }

  const pairMap = new Map();
  const stmtMap = new Map();
  for (let r = 0; r < runs.length; r += 1) {
    for (const c of subset) {
      const ev = runs[r][c.label];
      for (const row of ev.rows) {
        const sk = stmtKey(c.label, row.text);
        if (!stmtMap.has(sk)) {
          stmtMap.set(sk, {
            label: c.label,
            text: row.text,
            verdicts: [],
            conflicts: [],
          });
        }
        stmtMap.get(sk).verdicts.push(row.verdict);
        stmtMap.get(sk).conflicts.push(row.hasConflict);
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
  const stmtFlips = [];
  for (const row of stmtMap.values()) {
    const uniqueV = [...new Set(row.verdicts)];
    if (uniqueV.length > 1) {
      stmtFlips.push({
        label: row.label,
        text: row.text,
        verdicts: row.verdicts,
        pair: uniqueV.slice().sort().join(" <-> "),
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
  for (const s of stmtFlips) {
    fixtureStmtFlipCounts[s.label] = (fixtureStmtFlipCounts[s.label] || 0) + 1;
  }

  console.log("");
  console.log("## 1a. Per statement-source pair");
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
  console.log("## 1b. Classification flip rate");
  const pairTotal = pairMap.size;
  const pairPct = pairTotal ? ((100 * pairFlipCount) / pairTotal).toFixed(2) : "0.00";
  console.log(`  pairs=${pairTotal} flipped=${pairFlipCount} rate=${pairPct}%`);
  console.log("  flip pairs observed:");
  for (const [k, v] of Object.entries(pairFlipPairs).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (Object.keys(pairFlipPairs).length === 0) console.log("    (none)");

  console.log("");
  console.log("## 1c. Statement-level VERDICT changes (the number that matters)");
  const stmtTotal = stmtMap.size;
  const stmtPct = stmtTotal ? ((100 * stmtFlips.length) / stmtTotal).toFixed(2) : "0.00";
  console.log(`  statements=${stmtTotal} verdict-changed=${stmtFlips.length} rate=${stmtPct}%`);
  if (stmtFlips.length === 0) console.log("  (none)");
  for (const s of stmtFlips) {
    console.log(`  ${s.label} ${s.pair} runs=[${s.verdicts.join(", ")}] | ${trunc(s.text, 110)}`);
  }

  console.log("");
  console.log("## 1d. CONFLICTING involvement (prominent)");
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
  console.log("  verdict flips by fixture:");
  for (const [k, v] of Object.entries(fixtureStmtFlipCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  if (!Object.keys(fixtureStmtFlipCounts).length) console.log("    (none)");

  console.log("");
  console.log("## 2. Backlog sizing (full loadable corpus, Stage 1 + Stage 1b)");
  const corpus = await loadCorpusCases();
  const connectiveByToken = {};
  const connectiveExamples = [];
  let connectiveSentenceCount = 0;
  const arithByKind = {};
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
      const kinds = arithmeticKinds(text);
      if (kinds.length) {
        arithSentenceCount += 1;
        for (const k of kinds) arithByKind[k] = (arithByKind[k] || 0) + 1;
        if (arithExamples.length < 15) {
          arithExamples.push({ kinds, label: c.label, text });
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
  console.log("### 2B. Arithmetic-checkable structures (count only, not correctness)");
  console.log(`  unique sentences=${arithSentenceCount}`);
  for (const [k, n] of Object.entries(arithByKind).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${n}`);
  }
  if (!Object.keys(arithByKind).length) console.log("    (none)");
  console.log("  examples (up to 15):");
  for (const ex of arithExamples) {
    console.log(`    [${ex.label}] ${ex.kinds.join(",")} | ${ex.text}`);
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
        pairTotal,
        pairFlipCount,
        pairPct,
        pairFlipPairs,
        conflictingTouchPairs,
        stmtTotal,
        stmtFlipCount: stmtFlips.length,
        stmtPct,
        stmtFlips,
        flippedPairs,
        fixtureFlipCounts,
        fixtureStmtFlipCounts,
        agreementHistogram,
        connectiveSentenceCount,
        arithSentenceCount,
        sourceFlipCounts,
        connectiveByToken,
        connectiveExamples,
        arithByKind,
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
