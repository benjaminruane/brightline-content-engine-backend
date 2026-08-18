#!/usr/bin/env node
/**
 * SOURCE-RECENCY WIRE-IN GATE — re-assemble saved runs (no LLM).
 * Proves additive emit: same evidence verdicts as baseline; new source_recency flags only.
 *
 * Usage:
 *   node scripts/diagnostic/r7-source-recency-wirein-gate.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { assembleCard } from "../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { loadAllFixtures } from "./lib/fixtures.mjs";
import { RUNS_DIR } from "./lib/paths.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");
const CORPUS_RUN = "2026-08-16-172115";
const ADVERSARIAL_RUNS = {
  "90": "2026-08-18-124010",
  "91": "2026-08-18-124030",
  "92": "2026-08-18-124044",
};

const EXPECTED_CORPUS = [
  ["01", 4],
  ["01", 6],
  ["01", 9],
  ["04", 1],
  ["04", 3],
  ["04", 4],
  ["04", 8],
  ["04", 13],
];

async function loadRun(ts) {
  const root = path.isAbsolute(ts) ? ts : path.join(RUNS_DIR, ts);
  const names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
  const byId = new Map();
  for (const dir of names) {
    try {
      const data = JSON.parse(await readFile(path.join(root, dir.name, "result.json"), "utf8"));
      byId.set(String(data.fixtureId).padStart(2, "0"), data);
    } catch {
      /* skip */
    }
  }
  return byId;
}

function trunc(s, n = 96) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

async function reassembleFixture(fx, runData) {
  const fid = String(fx.data.id).padStart(2, "0");
  const data = runData.get(fid);
  if (!data) return { fid, label: fx.data.label, missing: true, rows: [] };
  const sources = await loadPipelineSources(fx.data.sources || []);
  const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
  const baselineCards = Array.isArray(data?.pipelineResult?.qcCards)
    ? data.pipelineResult.qcCards
    : [];
  const rows = [];
  for (let i = 0; i < stage2.length; i++) {
    const entry = stage2[i];
    const baseline = baselineCards[i] || null;
    const after = await assembleCard(entry, i, {
      pipelineRoute: "v4",
      outputType: fx.data?.config?.outputType,
      sources,
      today: TODAY,
      skipEditorialDuplicationJudge: true,
    });
    const recency = Array.isArray(after.sourceRecencyConcerns) ? after.sourceRecencyConcerns : [];
    const verdictChanged =
      (baseline?.supportState ?? null) !== after.supportState ||
      (baseline?.displayVerdict ?? null) !== after.displayVerdict ||
      (baseline?.concernLevel ?? null) !== after.concernLevel ||
      Boolean(baseline?.hasConflict) !== Boolean(after.hasConflict);
    const recencyMixedIntoEditorial = (Array.isArray(after.editorialConcerns) ? after.editorialConcerns : []).some(
      (c) => c?.concernCode === "source_recency" || c?.category === "source_recency"
    );
    const recencyMixedIntoCompliance = (Array.isArray(after.complianceConcerns) ? after.complianceConcerns : []).some(
      (c) => c?.concernCode === "source_recency" || c?.category === "source_recency"
    );
    rows.push({
      fid,
      label: fx.data.label,
      index: Number.isFinite(entry?.statementIndex) ? entry.statementIndex : i,
      statement: entry?.statementText || after.statement || "",
      baselineVerdict: entry?.verdictResult?.verdict ?? baseline?.supportState ?? null,
      afterSupportState: after.supportState,
      afterDisplayVerdict: after.displayVerdict,
      baselineMateriality: baseline?.materiality?.level ?? null,
      afterMateriality: after.materiality?.level ?? null,
      recency,
      verdictChanged,
      recencyMixedIntoEditorial,
      recencyMixedIntoCompliance,
    });
  }
  return { fid, label: fx.data.label, missing: false, rows };
}

function keyOf(fid, index) {
  return `${String(fid).padStart(2, "0")}:${index}`;
}

async function main() {
  const fixtures = await loadAllFixtures();
  const numbered = fixtures.filter((f) => /^\d+$/.test(String(f.data.id)));
  const corpusFx = numbered.filter((f) => {
    const n = parseInt(String(f.data.id), 10);
    return n >= 1 && n <= 23;
  });
  const advFx = numbered.filter((f) => ["90", "91", "92"].includes(String(f.data.id).padStart(2, "0")));

  const corpusRun = await loadRun(CORPUS_RUN);
  const advRuns = new Map();
  for (const [id, ts] of Object.entries(ADVERSARIAL_RUNS)) {
    const m = await loadRun(ts);
    const row = m.get(id);
    if (row) advRuns.set(id, row);
  }

  console.log(`# Source-recency wire-in GATE`);
  console.log(`Today=${TODAY.toISOString().slice(0, 10)} threshold=18 months`);
  console.log(`Corpus baseline=${CORPUS_RUN}; F90–92=${Object.values(ADVERSARIAL_RUNS).join(", ")}`);
  console.log(`Method=re-assemble saved stage2 through assembleCard (no LLM / no Stage 2–3 rerun)`);
  console.log("");

  const corpusRows = [];
  for (const fx of corpusFx) {
    const ev = await reassembleFixture(fx, corpusRun);
    if (ev.missing) console.log(`MISSING corpus run for F${ev.fid}`);
    corpusRows.push(...ev.rows);
  }

  const advRows = [];
  for (const fx of advFx) {
    const fid = String(fx.data.id).padStart(2, "0");
    const runMap = new Map([[fid, advRuns.get(fid)]]);
    const ev = await reassembleFixture(fx, runMap);
    if (ev.missing) console.log(`MISSING adversarial run for F${ev.fid}`);
    advRows.push(...ev.rows);
  }

  const allRows = [...corpusRows, ...advRows];
  const fires = allRows.filter((r) => r.recency.length > 0);
  const corpusFires = corpusRows.filter((r) => r.recency.length > 0);
  const verdictDrift = allRows.filter((r) => r.verdictChanged);
  const mixed = allRows.filter((r) => r.recencyMixedIntoEditorial || r.recencyMixedIntoCompliance);

  console.log(`## Flags emitted`);
  for (const r of fires) {
    const note = r.recency[0]?.note || "";
    console.log(`- F${r.fid} S${r.index} [${r.baselineVerdict}] materiality ${r.baselineMateriality}→${r.afterMateriality}`);
    console.log(`  ${trunc(r.statement, 110)}`);
    console.log(`  NOTE: ${note}`);
  }
  if (fires.length === 0) console.log(`(none)`);

  console.log("");
  console.log(`## Expected set`);
  const got = new Set(corpusFires.map((r) => keyOf(r.fid, r.index)));
  const expect = new Set(EXPECTED_CORPUS.map(([fid, idx]) => keyOf(fid, idx)));
  const missingExpected = [...expect].filter((k) => !got.has(k));
  const extraCorpus = [...got].filter((k) => !expect.has(k));
  const f91 = advRows.filter((r) => r.fid === "91" && r.recency.length);
  const f92 = advRows.filter((r) => r.fid === "92" && r.recency.length);
  const f90 = advRows.filter((r) => r.fid === "90" && r.recency.length);
  console.log(`Corpus fires=${corpusFires.length}/8 expected; missing=[${missingExpected.join(",") || "none"}]; extra=[${extraCorpus.join(",") || "none"}]`);
  console.log(`F90 fires=${f90.length} (expect 0); F91 fires=${f91.length} (expect >0); F92 fires=${f92.length} (expect >0)`);

  console.log("");
  console.log(`## PROOF: evidence verdict unchanged vs baseline`);
  console.log(`Statements compared=${allRows.length}`);
  console.log(`supportState/displayVerdict/concernLevel/hasConflict changes=${verdictDrift.length}`);
  console.log(`source_recency mixed into editorial/compliance arrays=${mixed.length}`);
  if (verdictDrift.length) {
    for (const r of verdictDrift.slice(0, 20)) {
      console.log(`- DRIFT F${r.fid} S${r.index} ${r.baselineVerdict} → ${r.afterSupportState}/${r.afterDisplayVerdict}`);
    }
  }

  const recencyNowMaterial = fires.filter((r) => r.afterMateriality === "material");
  console.log("");
  console.log(`## B13 materiality`);
  console.log(`Flags with materiality=material: ${recencyNowMaterial.length}/${fires.length}`);

  const pass =
    verdictDrift.length === 0 &&
    mixed.length === 0 &&
    missingExpected.length === 0 &&
    extraCorpus.length === 0 &&
    f90.length === 0 &&
    f91.length > 0 &&
    f92.length > 0 &&
    recencyNowMaterial.length === fires.length;

  console.log("");
  console.log(`GATE ${pass ? "PASS" : "FAIL"}`);
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
