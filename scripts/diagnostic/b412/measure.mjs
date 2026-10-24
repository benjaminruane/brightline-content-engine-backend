/**
 * B412. Form, house rules, and the three repeated calls.
 * The form report uses the stored B411 proposals. No model call.
 * The consistency report calls the proposal model.
 *
 * Bar, written before the consistency run:
 * Both false-proposal counts stay 0.
 * At least ten of the fifteen survive the form and the house rules
 * and read as correct English.
 * Each repeated call gives the same answer three times out of three.
 *
 *   node scripts/diagnostic/b412/measure.mjs
 *   node scripts/diagnostic/b412/measure.mjs consistency
 */
import { mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import {
  fitReplacement,
  proposalHouseChecks,
  statementAfterSubstitution,
} from "../../../lib/qc/proposal-check.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { proposeDraft } from "../../../lib/qc/reading-review.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b412/runs");
const INPUT_RATE = 5;
const OUTPUT_RATE = 25;

const RUNS = [
  ["3i", "doctored", "tests/fixtures/real-runs-2026-09-29/doc-review.json", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["HICL", "clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["HICL", "doctored", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["GPI", "doctored", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["ClearPoint", "doctored", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
];

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

const stored = load("scripts/diagnostic/b411/runs/proposals.json");
const rows = [];
for (const [doc, arm, reviewPath, sourcePath] of RUNS) {
  const review = load(reviewPath);
  const source = readFileSync(path.join(ROOT, sourcePath), "utf8");
  const draft = draftFromStatementSpans(review.statements);
  const prior = stored.drafts.find((item) => item.doc === doc && item.arm === arm);
  for (const statement of prior.statements) {
    for (const fact of statement.notFound) {
      if (fact.named === "none") continue;
      const reviewRow = review.statements.find((item, index) => (item.qcCard?.index ?? index) === statement.index);
      const text = reviewRow?.qcCard?.statement || statement.text;
      const facts = buildFacts({ statement: text, draft, sourceText: source });
      const live = facts.find((item) => item.kind === fact.kind && item.surface === fact.surface && item.status === "not_found");
      const passage = typeof reviewRow?.qcCard?.primaryExcerpt === "string" ? reviewRow.qcCard.primaryExcerpt : "";
      const before = live ? statementAfterSubstitution(text, live, fact.named) : null;
      const fitted = live ? fitReplacement(live, fact.named, source) : null;
      const check = fitted
        ? proposalHouseChecks({ statement: text, fact: live, replacement: fitted, sourceText: source, passage, bannedWords: [] })
        : { styled: null, resulting: null, reasons: ["form"], offered: false };
      rows.push({
        doc,
        arm,
        index: statement.index,
        surface: fact.surface,
        beforeForm: fact.named,
        afterForm: check.styled,
        beforeSentence: before,
        afterSentence: check.resulting,
        reasons: check.reasons,
        offered: check.offered,
        passage: passage || null,
      });
    }
  }
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "forms.json"), JSON.stringify(rows, null, 2));
writeSync(1, `fifteen: ${rows.length} offered after form and house rules: ${rows.filter((row) => row.offered).length}\n`);
for (const row of rows) {
  writeSync(1, [
    `${row.doc} ${row.arm} S${row.index} ${row.surface}`,
    `  before: ${row.beforeForm}`,
    `  after:  ${row.afterForm || "(dropped)"}`,
    `  checks: ${row.offered ? "pass" : row.reasons.join(", ")}`,
    `  before sentence: ${row.beforeSentence}`,
    `  after sentence:  ${row.afterSentence || "(none)"}`,
    "",
  ].join("\n") + "\n");
}

if (process.argv[2] !== "consistency") process.exit(0);

const hiclSource = readFileSync(path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"), "utf8");
const hiclClean = load("tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json");
const hiclDoc = load("tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json");
const cleanDraft = draftFromStatementSpans(hiclClean.statements);
const docDraft = draftFromStatementSpans(hiclDoc.statements);

function statementAt(review, index) {
  const row = review.statements.find((item, i) => (item.qcCard?.index ?? i) === index);
  return row?.qcCard?.statement || row?.text;
}

const calls = [
  ["HICL clean S1 HCIL", statementAt(hiclClean, 1), cleanDraft],
  ["HICL clean S2 budgets", statementAt(hiclClean, 2), cleanDraft],
  ["HICL doctored S2 budgets", statementAt(hiclDoc, 2), docDraft],
  ["HICL doctored S1 HCIL", statementAt(hiclDoc, 1), docDraft],
];
const repeats = 3;
const callCount = calls.length * repeats;
const inputChars = calls.reduce((sum, [, text, draft]) => sum + repeats * (hiclSource.length + draft.length + text.length + 900), 0);
const inputTokens = Math.ceil(inputChars / 4);
const outputCeiling = 512;
const estimate = ((inputTokens / 1_000_000) * INPUT_RATE + ((callCount * outputCeiling) / 1_000_000) * OUTPUT_RATE) * 2;
writeSync(1,
  `estimate before consistency call: USD ${estimate.toFixed(4)} list `
  + `(${callCount} calls, ${inputTokens} input tokens at chars/4, output ceiling ${outputCeiling}, `
  + `one retry included, claude-opus-4-7, temperature omitted)\n`
);
if (estimate > 2) {
  throw new Error(`measure: consistency estimate USD ${estimate.toFixed(4)} is above USD 2. No call made.`);
}

const repeatsOut = [];
const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
for (const [label, text, draft] of calls) {
  const answers = [];
  for (let n = 0; n < repeats; n += 1) {
    const result = await proposeDraft({ statements: [text], draft, sourceText: hiclSource });
    for (const key of Object.keys(spend)) spend[key] += result.spend[key] || 0;
    const proposal = result.proposals[0];
    const named = proposal.facts
      .map((fact, index) => ({ fact, index }))
      .filter((item) => item.fact.status === "not_found")
      .map((item) => {
        const row = proposal.replacements.find((entry) => entry.index === item.index);
        return `${item.fact.surface}=${row ? row.text : "none"}`;
      });
    answers.push(named.join("; "));
    writeSync(1, `${label} run ${n + 1}: ${named.join("; ")} USD ${result.spend.listUsd.toFixed(6)}\n`);
  }
  repeatsOut.push({ label, answers });
}
writeFileSync(path.join(OUT, "consistency.json"), JSON.stringify({ spend, repeats: repeatsOut }, null, 2));
writeSync(1, `${JSON.stringify(spend)}\n`);
