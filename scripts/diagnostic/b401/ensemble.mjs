/**
 * B401 R2. Repeats the Stage 5 commentary step 5 times on the HICL clean draft.
 * Does not call a model unless QC_B401_ENSEMBLE=1, and not if the estimate
 * is above USD 5.
 *
 * The stored card does not keep sourceExplanations or claimInventory.
 * Those inputs are omitted and the omission is printed. The verdict passed
 * in is the stored Stage 2 classification.
 *
 *   QC_B401_ENSEMBLE=1 node scripts/diagnostic/b401/ensemble.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REVIEW = path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json");
const PROMPT = path.join(ROOT, "lib/qc/pipeline-v4/prompts/stage5_v2.md");
const OUT = path.join(ROOT, "scripts/diagnostic/b401/runs/ensemble.json");
const N = 5;
const OUTPUT_TOKEN_CEILING = 400;
const INPUT_USD_PER_MILLION = 2.5;
const OUTPUT_USD_PER_MILLION = 10;

function verdictFor(card) {
  const fingerprint = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const classes = fingerprint.map((row) => String(row?.classification || "")).filter(Boolean);
  if (classes.includes("conflicting")) return "conflicting";
  if (classes.includes("partially_confirmed")) return "partially_confirmed";
  if (classes.includes("confirmed")) return "confirmed";
  if (classes.includes("no_support") || classes.includes("not_supported")) return "not_supported";
  const display = String(card.displayVerdict || "");
  if (display === "supported_full") return "confirmed";
  if (display === "supported_partial") return "partially_confirmed";
  if (display === "conflict") return "conflicting";
  if (display === "not_supported") return "not_supported";
  return null;
}

function excerptText(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.passage === "string") return value.passage;
  return "";
}

function readingOf(commentary) {
  const text = String(commentary || "");
  const objects =
    /does not [\s\S]{0,40}(say|state|mention|confirm|use)|not stated|not in the source|however, it does not|rather than|instead of|expectations, not budgets|not budgets/i.test(
      text
    );
  const endorses = /confirms the statement|confirms that|source confirms|aligns with the statement|aligning with the statement/i.test(
    text
  );
  if (objects && endorses) return "mixed";
  if (objects) return "objects";
  if (endorses) return "endorses";
  return "other";
}

function estimateUsd(inputTokens) {
  const calls = 8 * N;
  const inputUsd = (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION;
  const outputUsd = ((calls * OUTPUT_TOKEN_CEILING) / 1_000_000) * OUTPUT_USD_PER_MILLION;
  return { calls, inputTokens, inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

function buildCalls(review, systemPrompt) {
  const statements = Array.isArray(review.statements) ? review.statements : [];
  if (statements.length !== 8) {
    throw new Error(`HICL clean draft has ${statements.length} statements, expected 8`);
  }
  return statements.map((row, index) => {
    const card = row.qcCard;
    if (!card) throw new Error(`statement ${index} has no qcCard`);
    const verdict = verdictFor(card);
    if (!verdict) throw new Error(`statement ${index} has no stored verdict`);
    const user = [
      `statement: ${card.statement || row.text || ""}`,
      `verdict: ${verdict}`,
      `hasConflict: ${card.hasConflict === true ? "true" : "false"}`,
      `primaryExcerpt: ${excerptText(card.primaryExcerpt) || "(none)"}`,
      `conflictExcerpt: ${excerptText(card.conflictExcerpt) || "(none)"}`,
      "sourceExplanations: (none)",
      "claimInventory: (none)",
      'Return JSON only: { "commentary": "<string>" }',
    ].join("\n\n");
    return { index, verdict, displayVerdict: card.displayVerdict, user, systemChars: systemPrompt.length };
  });
}

const review = JSON.parse(readFileSync(REVIEW, "utf8"));
const systemPrompt = readFileSync(PROMPT, "utf8");
const calls = buildCalls(review, systemPrompt);
const inputChars = calls.reduce((sum, row) => sum + systemPrompt.length + row.user.length, 0) * N;
const inputTokens = Math.ceil(inputChars / 4);
const estimate = estimateUsd(inputTokens);

console.log(
  `B401 ensemble estimate: ${estimate.calls} calls, ${estimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING} tokens each, USD ${estimate.totalUsd.toFixed(4)} list (input ${estimate.inputUsd.toFixed(4)}, output ${estimate.outputUsd.toFixed(4)}). No cache assumed.`
);
console.log(
  "Omitted inputs: sourceExplanations and claimInventory are not on the stored card. The replay does not invent them."
);

if (estimate.totalUsd > 5) {
  console.log("Estimate is above USD 5. Not run.");
  process.exit(0);
}

if (process.env.QC_B401_ENSEMBLE !== "1") {
  console.log("QC_B401_ENSEMBLE is not 1. Not run.");
  process.exit(0);
}

const { generateCommentary } = await import("../../../lib/qc/pipeline-v4/stage5-generate-commentary.mjs");
const { hasProviderApiKey } = await import("../../../lib/observability.js");

if (!hasProviderApiKey("openai")) {
  throw new Error("OPENAI_API_KEY is missing. Refusing to call.");
}

const runs = [];
let spent = 0;
for (const row of calls) {
  const attempt = [];
  for (let n = 1; n <= N; n += 1) {
    const result = await generateCommentary({
      statement: review.statements[row.index].qcCard.statement,
      verdict: row.verdict,
      hasConflict: review.statements[row.index].qcCard.hasConflict === true,
      primaryExcerpt: excerptText(review.statements[row.index].qcCard.primaryExcerpt),
      conflictExcerpt: excerptText(review.statements[row.index].qcCard.conflictExcerpt),
      sourceExplanations: [],
      claimInventory: [],
      statementIndex: row.index,
      traceId: `b401-ensemble-s${row.index}-n${n}`,
    });
    const cost = Number(result.costUsd) || 0;
    spent += cost;
    attempt.push({
      n,
      commentary: result.commentary,
      notReviewed: result.notReviewed === true,
      reading: readingOf(result.commentary),
      costUsd: cost,
      usage: result.usage,
    });
    if (spent > 5) {
      throw new Error(`stopped: measured spend USD ${spent.toFixed(4)} passed the ceiling`);
    }
  }
  const counts = {};
  for (const item of attempt) counts[item.reading] = (counts[item.reading] || 0) + 1;
  const agreed = Math.max(...Object.values(counts));
  runs.push({
    index: row.index,
    verdictPassedIn: row.verdict,
    displayVerdict: row.displayVerdict,
    statement: review.statements[row.index].qcCard.statement,
    agreed,
    counts,
    runs: attempt,
  });
  console.log(`statement ${row.index}: ${agreed} of ${N} agree`, counts);
}

const s2 = runs.find((row) => row.index === 2);
const report = {
  estimate,
  measuredUsd: spent,
  calls: runs.reduce((sum, row) => sum + row.runs.length, 0),
  omitted: ["sourceExplanations", "claimInventory"],
  statements: runs,
  s2UnanimousEndorsement: s2 ? s2.runs.every((item) => item.reading === "endorses") : null,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`measured USD ${spent.toFixed(4)} across ${report.calls} calls`);
console.log(`S2 unanimous endorsement: ${report.s2UnanimousEndorsement}`);
