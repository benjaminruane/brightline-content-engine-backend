#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { assembleCard } from "../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { loadAllFixtures } from "./lib/fixtures.mjs";
import { RUNS_DIR } from "./lib/paths.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";

const CORPUS_RUN = "2026-08-16-172115";
const EXPECTED_FIRES = new Set(["04:20", "12:1"]);
const FAITHFUL_RELAYS = new Set([
  "01:8", "01:9", "02:5", "02:6", "04:6", "04:10", "05:1", "06:6", "06:10", "08:3",
  "08:9", "08:11", "08:16", "09:0", "09:11", "11:4", "13:2", "13:12", "13:14", "14:0",
  "14:1", "14:3", "14:5", "14:6", "14:8", "15:14", "15:20", "15:21", "15:31", "16:2",
  "19:11", "19:12", "20:1", "20:6", "20:7"
]);
const INTENDED_QUIET = new Set([
  "08:8", "12:8", "13:11", "14:7", "15:32", "17:6", "18:4", "18:9", "19:4", "20:4", "22:2", "23:3"
]);

async function loadRun(ts) {
  const root = path.join(RUNS_DIR, ts);
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

function keyOf(fid, idx) {
  return `${String(fid).padStart(2, "0")}:${idx}`;
}

function trunc(text, n = 120) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

async function main() {
  const fixtures = await loadAllFixtures();
  const runData = await loadRun(CORPUS_RUN);
  const rows = [];

  for (const fx of fixtures.filter((f) => /^\d+$/.test(String(f.data.id)))) {
    const fid = String(fx.data.id).padStart(2, "0");
    const data = runData.get(fid);
    if (!data) continue;
    const sources = await loadPipelineSources(fx.data.sources || []);
    const stage2 = Array.isArray(data?.pipelineResult?.stage2) ? data.pipelineResult.stage2 : [];
    const baselineCards = Array.isArray(data?.pipelineResult?.qcCards) ? data.pipelineResult.qcCards : [];
    for (let i = 0; i < stage2.length; i++) {
      const entry = stage2[i];
      const baseline = baselineCards[i] || {};
      const card = await assembleCard(
        {
          ...entry,
          supportSpans: Array.isArray(baseline?.supportSpans) ? baseline.supportSpans : [],
        },
        i,
        {
          pipelineRoute: "v4",
          outputType: fx.data?.config?.outputType,
          traceId: data?.traceId,
          sources,
          skipEditorialDuplicationJudge: true,
        }
      );
      rows.push({
        fid,
        idx: i,
        statement: card.statement,
        supportState: card.supportState,
        displayVerdict: card.displayVerdict,
        concernLevel: card.concernLevel,
        hasConflict: Boolean(card.hasConflict),
        baselineSupportState: baseline.supportState,
        baselineDisplayVerdict: baseline.displayVerdict,
        baselineConcernLevel: baseline.concernLevel,
        baselineHasConflict: Boolean(baseline.hasConflict),
        framing: Array.isArray(card.framingFidelityConcerns) ? card.framingFidelityConcerns : [],
        editorial: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
        compliance: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
        materiality: card.materiality?.level ?? null,
      });
    }
  }

  const fires = rows.filter((r) => r.framing.length > 0);
  const fireKeys = new Set(fires.map((r) => keyOf(r.fid, r.idx)));
  const missingExpected = [...EXPECTED_FIRES].filter((k) => !fireKeys.has(k));
  const extraFires = [...fireKeys].filter((k) => !EXPECTED_FIRES.has(k));
  const verdictDrift = rows.filter(
    (r) =>
      r.supportState !== r.baselineSupportState ||
      r.displayVerdict !== r.baselineDisplayVerdict ||
      r.concernLevel !== r.baselineConcernLevel ||
      r.hasConflict !== r.baselineHasConflict
  );
  const mixedIntoOtherSignals = fires.filter(
    (r) =>
      r.editorial.some((c) => c?.concernCode === "framing_fidelity" || c?.category === "framing_fidelity") ||
      r.compliance.some((c) => c?.concernCode === "framing_fidelity" || c?.category === "framing_fidelity")
  );
  const faithfulWrongFire = rows.filter((r) => FAITHFUL_RELAYS.has(keyOf(r.fid, r.idx)) && r.framing.length > 0);
  const intendedQuietWrongFire = rows.filter((r) => INTENDED_QUIET.has(keyOf(r.fid, r.idx)) && r.framing.length > 0);
  const factualControls = rows.filter((r) =>
    ["01:0", "01:2", "03:2", "04:1", "06:5", "11:2", "15:10", "19:11", "20:2", "23:0"].includes(
      keyOf(r.fid, r.idx)
    )
  );
  const factualControlFires = factualControls.filter((r) => r.framing.length > 0);

  console.log("# Framing-fidelity wire-in GATE");
  console.log(`Corpus baseline=${CORPUS_RUN}`);
  console.log("");
  console.log("## Framing fires");
  for (const row of fires) {
    console.log(`- F${row.fid} S${row.idx} materiality=${row.materiality}`);
    console.log(`  ${trunc(row.statement)}`);
    console.log(`  NOTE: ${row.framing[0]?.note || ""}`);
  }
  if (fires.length === 0) console.log("(none)");

  console.log("");
  console.log("## Expected set");
  console.log(`Expected fires=[${[...EXPECTED_FIRES].join(", ")}]`);
  console.log(`Missing expected=[${missingExpected.join(", ") || "none"}]`);
  console.log(`Extra fires=[${extraFires.join(", ") || "none"}]`);

  console.log("");
  console.log("## PROOF: evidence verdict unchanged vs baseline");
  console.log(`Statements compared=${rows.length}`);
  console.log(`supportState/displayVerdict/concernLevel/hasConflict changes=${verdictDrift.length}`);
  console.log(`framing_fidelity mixed into editorial/compliance arrays=${mixedIntoOtherSignals.length}`);

  console.log("");
  console.log("## Quiet checks");
  console.log(`Faithful relays wrong-fired=${faithfulWrongFire.length}`);
  console.log(`Mild-praise/intended-quiet wrong-fired=${intendedQuietWrongFire.length}`);
  console.log(`Factual controls wrong-fired=${factualControlFires.length}`);

  const pass =
    missingExpected.length === 0 &&
    extraFires.length === 0 &&
    verdictDrift.length === 0 &&
    mixedIntoOtherSignals.length === 0 &&
    faithfulWrongFire.length === 0 &&
    intendedQuietWrongFire.length === 0 &&
    factualControlFires.length === 0;

  console.log("");
  console.log(`GATE ${pass ? "PASS" : "FAIL"}`);
  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
