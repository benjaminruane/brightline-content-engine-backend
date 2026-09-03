#!/usr/bin/env node
/**
 * B154 / B149 free sizing. Zero model calls.
 * Prints the counting rule, then EXPLORATORY numbers.
 * Usage: node scripts/diagnostic/review/b154-b149-sizing/run.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isProceduralCloserStatement } from "../../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import {
  isEvidenceGap,
  sourceSpokeTestsFired,
  statementIsSilent,
} from "../../../../lib/revise-actions/silence.mjs";
import { ARTEFACTS } from "../../revise/per-finding-action-list/inventory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../../..");
const REVISE_DIR = path.join(ROOT, "scripts/diagnostic/revise");

const DESIGN = {
  exploratory: true,
  baseline: false,
  gate: false,
  billed: false,
  countingRulePinnedBeforeNumbers: true,
  count1:
    "B149: evidence-gap qcCards on the four Stage 0 Review artefacts. b149SpanConflictFired = supportSpan_classification_conflicting fired. b149SoleCause = that was the only STRUCTURAL_TESTS fire. Per artefact. Never summed.",
  count2:
    "Period-gate shaped: corpusRows variantId R10, preBackstopClassification in {confirmed, conflicting}, classification no_support, not a procedural closer. Not a SHAPE A rate.",
  count3: "SHAPE A / SHAPE B rates refused. No sound mechanical check.",
};

function collapse(value) {
  return String(value ?? "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function classificationsFrom(list, key = "classification") {
  if (!Array.isArray(list)) return [];
  return list.map((row) => String(row?.[key] ?? "").trim().toLowerCase()).filter(Boolean);
}

function cardOf(row) {
  return row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
}

function statementOf(row, card) {
  if (typeof card?.statement === "string" && card.statement) return card.statement;
  if (typeof row?.text === "string" && row.text) return row.text;
  return "";
}

function inventoryCard(artefact, row) {
  const card = cardOf(row);
  if (!card) return null;
  const gap = isEvidenceGap(card);
  const testsFired = gap ? sourceSpokeTestsFired(card) : [];
  const spanConflict = testsFired.includes("supportSpan_classification_conflicting");
  return {
    artefact: artefact.stem,
    file: artefact.file,
    statementId: String(row.id ?? card.index ?? ""),
    statement: collapse(statementOf(row, card)),
    supportState: card.supportState ?? null,
    displayVerdict: card.displayVerdict ?? null,
    hasConflict: card.hasConflict === true,
    evidenceGap: gap,
    testsFired,
    silent: gap ? statementIsSilent(card) : null,
    b149SpanConflictFired: spanConflict,
    b149SoleCause: spanConflict && testsFired.length === 1,
    stage2Classifications: classificationsFrom(card.stage2SourceFingerprints),
    supportSpanClassifications: classificationsFrom(card.supportSpans),
    unsupportedSpanClassifications: classificationsFrom(card.unsupportedSpans),
    claimRoles: Array.isArray(card.claims)
      ? card.claims.map((c) => String(c?.role ?? "").trim().toLowerCase()).filter(Boolean)
      : [],
    supportSpanCount: Array.isArray(card.supportSpans) ? card.supportSpans.length : 0,
  };
}

function summariseArtefact(stem, file, rows) {
  const gap = rows.filter((r) => r.evidenceGap);
  const partial = gap.filter((r) => {
    const s = String(r.supportState ?? "").toLowerCase();
    return s === "partial" || s === "partially_confirmed";
  });
  const notSupported = gap.filter((r) => {
    const s = String(r.supportState ?? "").toLowerCase();
    return s === "not_supported" || s === "no_support";
  });
  return {
    stem,
    file,
    cardCount: rows.length,
    evidenceGapCount: gap.length,
    partialCount: partial.length,
    notSupportedCount: notSupported.length,
    silentGapCount: gap.filter((r) => r.silent === true).length,
    notSilentGapCount: gap.filter((r) => r.silent === false).length,
    b149SpanConflictFired: gap.filter((r) => r.b149SpanConflictFired).length,
    b149SoleCause: gap.filter((r) => r.b149SoleCause).length,
    b149SpanConflictOnPartial: partial.filter((r) => r.b149SpanConflictFired).length,
    b149SoleCauseOnPartial: partial.filter((r) => r.b149SoleCause).length,
    doNotSum: true,
    exploratory: true,
  };
}

function walkCorpusRows(raw) {
  return Array.isArray(raw?.corpusRows) ? raw.corpusRows : [];
}

const artefacts = [];
const rows = [];
for (const spec of ARTEFACTS) {
  const filePath = path.join(REVISE_DIR, spec.file);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const statements = Array.isArray(raw?.payload?.statements) ? raw.payload.statements : [];
  const artefactRows = [];
  for (const row of statements) {
    const inventoried = inventoryCard(spec, row);
    if (!inventoried) continue;
    artefactRows.push(inventoried);
    rows.push(inventoried);
  }
  artefacts.push(summariseArtefact(spec.stem, spec.file, artefactRows));
}

const brackenhillRaw = JSON.parse(
  await readFile(path.join(REVISE_DIR, "per-finding-action-list/brackenhill-2026-09-02.json"), "utf8")
);
const brackenhillRows = (Array.isArray(brackenhillRaw?.entries) ? brackenhillRaw.entries : [])
  .filter((e) => e?.kind === "evidence")
  .map((e) => ({
    source: "brackenhill-2026-09-02.json",
    provenance:
      "Transcribed action-list response. Must not be regenerated. Not a Review payload. thing2 copied from evidenceSummary.",
    statementId: e.statementId ?? null,
    statement: collapse(e.statement),
    rule: e.rule ?? null,
    disposition: e.disposition ?? null,
    silenceOnCard: e?.sort?.silenceOnCard === true,
    reasonCode: e?.sort?.reasonCode ?? null,
    thing1State: e.thing1State ?? null,
    thing2Length: typeof e.thing2 === "string" ? e.thing2.length : 0,
    machineShapeLabel: null,
    note: "Unlabelled. Do not treat this row as a SHAPE A or SHAPE B count.",
    exploratory: true,
  }));

const blastRaw = JSON.parse(
  await readFile(path.join(ROOT, "scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json"), "utf8")
);
const blastBackstopRows = [];
for (const row of walkCorpusRows(blastRaw)) {
  if (row?.variantId !== "R10") continue;
  const pre = String(row?.preBackstopClassification ?? "").trim();
  const post = String(row?.classification ?? "").trim();
  const procedural = isProceduralCloserStatement(row?.statementText);
  const periodGateShaped =
    !procedural && (pre === "confirmed" || pre === "conflicting") && post === "no_support";
  if (!periodGateShaped && row?.backstopChanged !== true) continue;
  blastBackstopRows.push({
    pairId: row.pairId ?? null,
    statementId: row.statementId ?? null,
    statement: collapse(row.statementText),
    plant: row.plant ?? null,
    sourceLabel: row.sourceLabel ?? null,
    preBackstopClassification: pre,
    classification: post,
    backstopChanged: row.backstopChanged === true,
    proceduralCloser: procedural,
    periodGateShaped,
    periodAssessmentPresent: Object.prototype.hasOwnProperty.call(row, "periodAssessment"),
    exploratory: true,
  });
}

const periodGateShaped = blastBackstopRows.filter((r) => r.periodGateShaped);

const summary = {
  generatedAt: new Date().toISOString(),
  exploratory: true,
  baseline: false,
  gate: false,
  design: DESIGN,
  count1_b149: {
    artefacts,
    neverSumAcrossArtefacts: true,
    note: "EXPLORATORY. Per artefact only. Not a SHAPE B rate. Not a live exposure rate.",
  },
  count2_periodGateShaped: {
    source: "scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json corpusRows",
    variant: "R10",
    r10RowCount: walkCorpusRows(blastRaw).filter((r) => r?.variantId === "R10").length,
    backstopChangedRowCount: blastBackstopRows.filter((r) => r.backstopChanged).length,
    periodGateShapedCount: periodGateShaped.length,
    periodGateShapedPlanted: periodGateShaped.filter((r) => r.plant === "PLANTED").length,
    periodGateShapedIndependent: periodGateShaped.filter((r) => r.plant === "INDEPENDENT").length,
    periodGateShapedCorpus: periodGateShaped.filter((r) => r.plant === "CORPUS").length,
    periodAssessmentPresentOnBlastRows: false,
    note: "EXPLORATORY. Fixture corpus. Not a SHAPE A rate. Not live exposure.",
  },
  count3_shapeRates: {
    refused: true,
    reason:
      "No sound mechanical check. Commentary and primaryExcerpt are forbidden detectors. Stored Review cards lack preBackstopClassification and periodAssessment.",
  },
  brackenhillEvidenceRowCount: brackenhillRows.length,
};

const out = async (name, value) => {
  const target = path.join(__dirname, name);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
};

const paths = {
  rows: await out("rows.json", rows),
  summary: await out("summary.json", summary),
  brackenhill: await out("brackenhill-rows.json", brackenhillRows),
  blast: await out("blast-backstop-rows.json", blastBackstopRows),
};

console.log("COUNT DESIGN (pinned before numbers)");
console.log(DESIGN.count1);
console.log(DESIGN.count2);
console.log(DESIGN.count3);
console.log("");
console.log("ATTACK");
console.log("- Count 1 zero on these four artefacts is not safety on Brackenhill.");
console.log("- Count 1 cannot tell a wrong span mark from a genuine span conflict.");
console.log("- Count 2 is a fixture corpus. It measures fixture authors more than live drafts.");
console.log("- SHAPE A and SHAPE B are not scored.");
console.log("");
console.log("EXPLORATORY NUMBERS (not a baseline, not a gate)");
console.log(JSON.stringify({ artefacts, count2: summary.count2_periodGateShaped, paths }, null, 2));
