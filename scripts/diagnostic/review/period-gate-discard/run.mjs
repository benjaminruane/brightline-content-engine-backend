#!/usr/bin/env node
/**
 * Free. Stored-data blast radius for the period-overlap rewrite
 * confirmed|conflicting -> no_support.
 * Zero model calls.
 *
 * Usage: node scripts/diagnostic/review/period-gate-discard/run.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyPeriodGateBackstop,
  isProceduralCloserStatement,
  periodsDoNotOverlap,
} from "../../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../../..");

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPeriodGateRewrite(pre, post) {
  return (pre === "confirmed" || pre === "conflicting") && post === "no_support";
}

const blastRaw = JSON.parse(
  await readFile(path.join(ROOT, "scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json"), "utf8")
);
const corpusRows = Array.isArray(blastRaw?.corpusRows) ? blastRaw.corpusRows : [];
const r10 = corpusRows.filter((r) => r?.variantId === "R10");
const r10Rewrites = [];
for (const row of r10) {
  const pre = String(row?.preBackstopClassification ?? "").trim();
  const post = String(row?.classification ?? "").trim();
  const procedural = isProceduralCloserStatement(row?.statementText);
  if (procedural) continue;
  if (!isPeriodGateRewrite(pre, post)) continue;
  r10Rewrites.push({
    pairId: row.pairId,
    statementId: row.statementId,
    statement: collapse(row.statementText),
    plant: row.plant ?? null,
    sourceLabel: row.sourceLabel,
    preBackstopClassification: pre,
    classification: post,
    explanation: row.explanation ?? null,
    passage: row.passage ?? null,
    periodAssessmentPresent: Object.prototype.hasOwnProperty.call(row, "periodAssessment"),
    ifRewriteStopped: `classification would remain ${pre}; Stage 3 would aggregate ${pre === "conflicting" ? "conflicting" : "confirmed"} from this pair.`,
  });
}

const exhibitPairs = JSON.parse(
  await readFile(path.join(ROOT, "scripts/diagnostic/review/b154-exhibit/stage2-pairs.json"), "utf8")
);
const exhibitRewrites = [];
for (const m of Array.isArray(exhibitPairs?.matches) ? exhibitPairs.matches : []) {
  const pre = String(m?.preBackstopClassification ?? "").trim();
  const gated = applyPeriodGateBackstop(
    {
      classification: pre,
      passage: m?.passage ?? "",
      explanation: m?.explanation ?? "",
      periodAssessment: m?.periodAssessment ?? null,
    },
    { statementText: "" }
  );
  const post = String(m?.classification ?? "").trim();
  const proven =
    periodsDoNotOverlap(m?.periodAssessment) && isPeriodGateRewrite(pre, post) && gated.classification === "no_support";
  if (!proven) continue;
  exhibitRewrites.push({
    statementIndex: m.statementIndex,
    preBackstopClassification: pre,
    classification: post,
    periodAssessment: m.periodAssessment,
    periodsDoNotOverlap: true,
    explanation: m.explanation ?? null,
    passage: m.passage ?? null,
    ifRewriteStopped: `classification would remain ${pre}. Card displayVerdict would be conflict, not not_supported. Silence would not treat the card as silent. Implement Changes could grant ACTION.`,
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  billed: false,
  populationsNotSummed: true,
  r10CorpusBlast: {
    file: "scripts/diagnostic/eval-ablation/r10-corpus-blast-rows.json",
    variant: "R10",
    pairCount: r10.length,
    periodGateRewriteCount: r10Rewrites.length,
    rows: r10Rewrites,
    periodAssessmentPresentOnBlastRows: false,
    note: "Shaped by preBackstop vs classification. Blast rows do not store periodAssessment, so this is period-gate-shaped, not period-gate-proven. The one row is planted F90 (B17 latent). Zero CORPUS. Zero INDEPENDENT.",
  },
  b154Exhibit: {
    file: "scripts/diagnostic/review/b154-exhibit/stage2-pairs.json",
    pairCount: Array.isArray(exhibitPairs?.matches) ? exhibitPairs.matches.length : 0,
    periodGateRewriteCount: exhibitRewrites.length,
    rows: exhibitRewrites,
    note: "Proven: periodsDoNotOverlap and applyPeriodGateBackstop on the stored periodAssessment.",
  },
};

await writeFile(path.join(__dirname, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
