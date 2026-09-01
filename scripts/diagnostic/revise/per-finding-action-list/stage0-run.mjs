#!/usr/bin/env node
/**
 * Stage 0: per-finding inventory on four stored Review artefacts.
 * Zero model calls.
 *
 * Usage: node scripts/diagnostic/revise/per-finding-action-list/stage0-run.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARTEFACTS, inventoryArtefact, summariseArtefact } from "./inventory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = path.join(__dirname, "..");

function q1Across(artefacts) {
  const evidence = artefacts.flatMap((a) => a.findings.filter((f) => f.kind === "evidence"));
  const populated = (key, pred) => evidence.filter((f) => pred(f.q1)).length;
  return {
    evidenceFindingCount: evidence.length,
    hasConflictTrue: populated("hasConflict", (q) => q.hasConflict === true),
    conflictExcerptPresent: populated("conflictExcerpt", (q) => q.conflictExcerptPresent === true),
    conflictValuesNonNull: populated("conflictValues", (q) => q.conflictValues != null),
    conflictEvidenceNonNull: populated("conflictEvidence", (q) => q.conflictEvidence != null),
    stage2Conflicting: populated("stage2", (q) => q.stage2Classifications.includes("conflicting")),
    unsupportedSpanConflicting: populated("unspan", (q) =>
      q.unsupportedSpanClassifications.includes("conflicting")
    ),
    supportSpanConflicting: populated("sspan", (q) => q.supportSpanClassifications.includes("conflicting")),
    claimRoleConflict: populated("claims", (q) => q.claimRoles.includes("conflict")),
    decomposedTrue: populated("decomposed", (q) => q.decomposed === true),
  };
}

const artefacts = [];
for (const spec of ARTEFACTS) {
  const raw = JSON.parse(await readFile(path.join(REVISE_DIR, spec.file), "utf8"));
  artefacts.push(inventoryArtefact(spec.stem, spec.file, raw.payload));
}

const annex = {
  generatedAt: new Date().toISOString(),
  phraseRatioLine: 0.8,
  artefacts,
  summaries: artefacts.map(summariseArtefact),
  q1FieldPopulation: q1Across(artefacts),
  unsatisfiableDirectionPairs: artefacts.flatMap((a) => a.unsatisfiable),
};

const annexPath = path.join(__dirname, "stage0-annex.json");
const summaryPath = path.join(__dirname, "stage0-summary.json");
await writeFile(annexPath, `${JSON.stringify(annex, null, 2)}\n`);
await writeFile(summaryPath, `${JSON.stringify({ summaries: annex.summaries, q1FieldPopulation: annex.q1FieldPopulation, unsatisfiableDirectionPairs: annex.unsatisfiableDirectionPairs }, null, 2)}\n`);

console.log(JSON.stringify({ annexPath, summaryPath, summaries: annex.summaries, q1: annex.q1FieldPopulation, unsatisfiable: annex.unsatisfiableDirectionPairs }, null, 2));
