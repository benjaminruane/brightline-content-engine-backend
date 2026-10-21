/**
 * B410. One note call for one changed HICL statement.
 * Prints the estimate before the call. Stores the usage.
 *
 *   node scripts/diagnostic/b410/measure-recheck.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import { recheckStatements } from "../../../lib/qc/reading-review.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REVIEW = "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json";
const SOURCE = "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt";
const OUT = path.join(ROOT, "scripts/diagnostic/b410/runs");
const INPUT_RATE = 5;
const OUTPUT_RATE = 25;
const OUTPUT_CEILING = 4096;
const CEILING_USD = 1;

const review = JSON.parse(readFileSync(path.join(ROOT, REVIEW), "utf8"));
const source = readFileSync(path.join(ROOT, SOURCE), "utf8");
const draft = draftFromStatementSpans(review.statements);
const from = "in line with budgets";
const to = "in line with budget";
if (draft.split(from).length !== 2) {
  throw new Error("measure: the budgets phrase is not unique in the reconstructed draft");
}
const changed = draft.replace(from, to);
const statements = review.statements.map((row, index) => {
  const text = row.qcCard?.statement || row.text;
  return {
    index: row.qcCard?.index ?? index,
    id: String(row.qcCard?.index ?? index),
    text,
    facts: buildFacts({ statement: text, draft, sourceText: source }),
    note: null,
    sentenceState: "nothing_to_raise",
  };
});
const inputChars = source.length + changed.length + 2500;
const inputTokens = Math.ceil(inputChars / 4);
const oneCall = (inputTokens / 1_000_000) * INPUT_RATE + (OUTPUT_CEILING / 1_000_000) * OUTPUT_RATE;
const estimate = oneCall * 2;
console.log(
  `estimate before call: USD ${estimate.toFixed(4)} list `
  + `(${inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_CEILING}, `
  + `one retry included, claude-opus-4-7)`
);
if (estimate > CEILING_USD) {
  throw new Error(`measure: estimate USD ${estimate.toFixed(4)} is above USD ${CEILING_USD}. No call made.`);
}

const result = await recheckStatements({
  draft: changed,
  statements,
  sources: [{ text: source }],
});
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "recheck-one.json"), JSON.stringify({
  stale: result.stale,
  spend: result.spend,
  header: result.header,
  changed: result.sentences.filter((row) => row.stale).map((row) => ({
    index: row.index,
    sentenceState: row.sentenceState,
    note: row.note,
    factStatuses: (row.facts || []).map((fact) => `${fact.kind}:${fact.status}:${fact.surface}`),
  })),
}, null, 2));
console.log(JSON.stringify({ stale: result.stale, spend: result.spend }));
