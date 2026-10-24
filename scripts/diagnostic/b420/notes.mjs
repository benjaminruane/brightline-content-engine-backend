/**
 * B420. Re-run the note step on the four clean drafts only.
 * Does not call a model unless QC_B420_NOTES=1.
 * Prints the estimate first and stops above USD 3.
 *
 *   QC_B420_NOTES=1 node scripts/diagnostic/b420/notes.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b420/runs/notes.json");
const PRIOR = path.join(ROOT, "scripts/diagnostic/b403c/runs/reading.json");
const CEILING_USD = 3;
const OUTPUT_TOKEN_CEILING = 300;
const RATES = { input: 5, output: 25 };

const DOCS = [
  { doc: "3i", source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt", clean: "tests/fixtures/real-runs-2026-09-29/clean-review.json" },
  { doc: "HICL", source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt", clean: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json" },
  { doc: "GPI", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt", clean: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json" },
  { doc: "ClearPoint", source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt", clean: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json" },
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function statementText(row) {
  if (typeof row?.text === "string" && row.text.trim()) return row.text.trim();
  if (typeof row?.qcCard?.statement === "string") return row.qcCard.statement.trim();
  return "";
}

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const drafts = DOCS.map((doc) => {
  const sourceText = read(doc.source);
  if (!sourceText.trim()) throw new Error(`empty source ${doc.source}`);
  const review = JSON.parse(read(doc.clean));
  const statements = (review.statements || []).map(statementText);
  if (statements.some((text) => !text)) throw new Error(`${doc.doc} clean has an empty statement`);
  return { doc: doc.doc, sourceText, statements, draft: statements.join("\n") };
});

let inputChars = 0;
for (const draft of drafts) {
  for (const statement of draft.statements) {
    inputChars += draft.sourceText.length + statement.length + draft.draft.length + 1200;
  }
}
const calls = drafts.reduce((sum, draft) => sum + draft.statements.length, 0);
const inputTokens = Math.ceil(inputChars / 4);
const outputTokens = calls * OUTPUT_TOKEN_CEILING;
const estimateUsd = (inputTokens / 1_000_000) * RATES.input + (outputTokens / 1_000_000) * RATES.output;
console.log(JSON.stringify({ calls, inputTokens, outputTokens, estimateUsd: Number(estimateUsd.toFixed(4)) }));
if (estimateUsd > CEILING_USD) {
  throw new Error(`estimate USD ${estimateUsd.toFixed(4)} is above ${CEILING_USD}`);
}
if (process.env.QC_B420_NOTES !== "1") {
  console.log("QC_B420_NOTES is not 1. No model call.");
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is missing");
}

const { noteDraft } = await import("../../../lib/qc/reading-review.mjs");
const { noteEndorsement } = await import("../../../lib/qc/reading-contract.mjs");

const changed = [];
const runs = [];
let spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
for (const draft of drafts) {
  const result = await noteDraft({
    statements: draft.statements,
    draft: draft.draft,
    sourceText: draft.sourceText,
  });
  spend = {
    calls: spend.calls + result.spend.calls,
    inputTokens: spend.inputTokens + result.spend.inputTokens,
    outputTokens: spend.outputTokens + result.spend.outputTokens,
    cachedInputTokens: spend.cachedInputTokens + result.spend.cachedInputTokens,
    costUsd: spend.costUsd + result.spend.costUsd,
    listUsd: spend.listUsd + result.spend.listUsd,
  };
  const stored = prior.drafts.find((row) => row.doc === draft.doc && row.arm === "clean");
  const notes = result.notes.map((note, index) => {
    const previous = stored?.statements?.[index];
    const text = note.note?.refused ? "" : (note.note?.text || "");
    const bucket = note.note?.bucket || (note.note?.refused ? "refused" : "");
    const previousText = previous?.shownNote || "";
    const previousBucket = previous?.bucket || "";
    const row = {
      index,
      text: draft.statements[index],
      bucket,
      note: text,
      refused: Boolean(note.note?.refused),
      reason: note.note?.reason || null,
      endorsement: text ? noteEndorsement(text) : null,
      previousBucket,
      previousNote: previousText,
      changed: bucket !== previousBucket || text !== previousText,
    };
    if (row.changed) {
      changed.push({ doc: draft.doc, index, previousBucket, bucket, previousNote: previousText, note: text, refused: row.refused, reason: row.reason });
    }
    return row;
  });
  runs.push({ doc: draft.doc, notes });
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ model: "claude-opus-4-7", estimateUsd, spend, changed, runs }, null, 2));
console.log(JSON.stringify({ spend, changed: changed.length }, null, 2));
