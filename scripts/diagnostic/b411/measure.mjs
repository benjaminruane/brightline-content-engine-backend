/**
 * B411. Notes on eight drafts, with the optional replacement field.
 * Prints the estimate before the first call.
 *
 * Bar, written before the run:
 * N3 is worse if clean statements marked rise above 8, or a ledger-correct
 * statement moves into demands. Noise in demands must stay 0.
 * N1 is worse if clean conflicts rise above 2.
 * Both false-proposal counts must be 0 among proposals that pass the
 * presence check. At least five of the seven known-good pairs must be
 * offered and correct.
 *
 *   node scripts/diagnostic/b411/measure.mjs
 */
import { mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { draftFromStatementSpans } from "../../../lib/qc/draft-marks.mjs";
import { namedReplacement, replacementInSource } from "../../../lib/qc/proposal-check.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { noteDraft, proposeDraft } from "../../../lib/qc/reading-review.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PRIOR = path.join(ROOT, "scripts/diagnostic/b403c/runs/reading.json");
const OUT = path.join(ROOT, "scripts/diagnostic/b411/runs");
const INPUT_RATE = 5;
const OUTPUT_RATE = 25;
const OUTPUT_CEILING = 1024;
const CEILING_USD = 8;

const RUNS = [
  ["3i", "clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["3i", "doctored", "tests/fixtures/real-runs-2026-09-29/doc-review.json", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["HICL", "clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["HICL", "doctored", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["GPI", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["GPI", "doctored", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["ClearPoint", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
  ["ClearPoint", "doctored", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
];

const FIRM = new Set(["3i:0", "HICL:1", "HICL:2"]);

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const prepared = RUNS.map(([doc, arm, reviewPath, sourcePath]) => {
  const review = load(reviewPath);
  const source = readFileSync(path.join(ROOT, sourcePath), "utf8");
  const draft = draftFromStatementSpans(review.statements);
  const statements = review.statements.map((row, index) => ({
    index: row.qcCard?.index ?? index,
    text: row.qcCard?.statement || row.text,
  }));
  return { doc, arm, source, draft, statements };
});

if (process.argv[2] === "proposals") {
  await measureProposals(prepared);
  process.exit(0);
}

const calls = prepared.reduce((sum, row) => sum + row.statements.length, 0);
const inputChars = prepared.reduce((sum, row) => {
  const statements = row.statements.reduce((n, item) => n + item.text.length, 0);
  return sum + row.statements.length * (row.source.length + row.draft.length + 1800) + statements;
}, 0);
const inputTokens = Math.ceil(inputChars / 4);
const onePass = (inputTokens / 1_000_000) * INPUT_RATE + ((calls * OUTPUT_CEILING) / 1_000_000) * OUTPUT_RATE;
const estimate = onePass * 2;
writeSync(1,
  `estimate before call: USD ${estimate.toFixed(4)} list `
  + `(${calls} statements, ${inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_CEILING}, `
  + `one retry included, claude-opus-4-7, temperature omitted)\n`
);
if (estimate > CEILING_USD) {
  throw new Error(`measure: estimate USD ${estimate.toFixed(4)} is above USD ${CEILING_USD}. No call made.`);
}

const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
const drafts = [];
for (const row of prepared) {
  const result = await noteDraft({
    statements: row.statements,
    draft: row.draft,
    sourceText: row.source,
  });
  for (const key of Object.keys(spend)) spend[key] += result.spend[key] || 0;
  const stored = prior.drafts.find((item) => item.doc === row.doc && item.arm === row.arm);
  drafts.push({
    doc: row.doc,
    arm: row.arm,
    statements: result.notes.map((note, index) => {
      const facts = note.facts || [];
      const notFound = facts
        .map((fact, factIndex) => ({ fact, factIndex }))
        .filter((item) => item.fact.status === "not_found")
        .map((item) => {
          const named = namedReplacement(item.fact, note.note, item.factIndex);
          const present = named ? replacementInSource(item.fact, named, row.source) : false;
          return {
            index: item.factIndex,
            kind: item.fact.kind,
            surface: item.fact.surface,
            named: named || "none",
            present,
          };
        });
      return {
        index: row.statements[index].index,
        text: row.statements[index].text,
        bucket: note.note?.bucket || (note.note?.refused ? "refused" : null),
        sentenceState: note.sentenceState,
        tier: note.sentenceState === "nothing_to_raise" ? "quiet" : (note.sentenceState === "beyond" ? "light" : "demands"),
        note: note.note?.text || "",
        replacements: note.note?.replacements || [],
        priorBucket: stored?.statements?.[index]?.bucket || null,
        priorNote: stored?.statements?.[index]?.shownNote || "",
        notFound,
      };
    }),
  });
  writeSync(1, `${row.doc} ${row.arm} calls ${result.spend.calls} list USD ${result.spend.listUsd.toFixed(6)}\n`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "notes.json"), JSON.stringify({ spend, drafts }, null, 2));
console.log(JSON.stringify(spend));

const clean = drafts.filter((row) => row.arm === "clean");
let marked = 0;
let conflicts = 0;
let noise = 0;
for (const row of clean) {
  for (const statement of row.statements) {
    if (statement.tier !== "quiet") marked += 1;
    if (statement.bucket === "conflicts") conflicts += 1;
    const key = `${row.doc}:${statement.index}`;
    if (statement.tier === "demands" && !FIRM.has(key)) noise += 1;
  }
}
console.log(JSON.stringify({ cleanMarked: marked, cleanConflicts: conflicts, noiseInDemands: noise }));

async function measureProposals(rows) {
  const jobs = rows.map((row) => ({
    ...row,
    targets: row.statements.filter((statement) => buildFacts({
      statement: statement.text,
      draft: row.draft,
      sourceText: row.source,
    }).some((fact) => fact.status === "not_found")),
  }));
  const callCount = jobs.reduce((sum, row) => sum + row.targets.length, 0);
  const inputChars = jobs.reduce((sum, row) => sum + row.targets.reduce(
    (inner, statement) => inner + row.source.length + row.draft.length + statement.text.length + 900,
    0
  ), 0);
  const inputTokens = Math.ceil(inputChars / 4);
  const outputCeiling = 512;
  const onePass = (inputTokens / 1_000_000) * INPUT_RATE + ((callCount * outputCeiling) / 1_000_000) * OUTPUT_RATE;
  const estimate = onePass * 2;
  writeSync(1,
    `estimate before proposal call: USD ${estimate.toFixed(4)} list `
    + `(${callCount} statements with a missing fact, ${inputTokens} input tokens at chars/4, `
    + `output ceiling ${outputCeiling}, one retry included, claude-opus-4-7, temperature omitted)\n`
  );
  if (estimate > 3) {
    throw new Error(`measure: proposal estimate USD ${estimate.toFixed(4)} is above USD 3. No call made.`);
  }
  const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
  const drafts = [];
  for (const row of jobs) {
    const result = await proposeDraft({
      statements: row.statements,
      draft: row.draft,
      sourceText: row.source,
    });
    for (const key of Object.keys(spend)) spend[key] += result.spend[key] || 0;
    drafts.push({
      doc: row.doc,
      arm: row.arm,
      calls: result.spend.calls,
      listUsd: result.spend.listUsd,
      statements: result.proposals.map((item, index) => ({
        index: row.statements[index].index,
        text: row.statements[index].text,
        called: item.called,
        replacements: item.replacements,
        notFound: item.facts
          .map((fact, factIndex) => ({ fact, factIndex }))
          .filter((entry) => entry.fact.status === "not_found")
          .map((entry) => {
            const named = namedReplacement(entry.fact, { replacements: item.replacements }, entry.factIndex);
            return {
              index: entry.factIndex,
              kind: entry.fact.kind,
              surface: entry.fact.surface,
              named: named || "none",
              present: named ? replacementInSource(entry.fact, named, row.source) : false,
            };
          }),
      })),
    });
    writeSync(1, `${row.doc} ${row.arm} proposal calls ${result.spend.calls} list USD ${result.spend.listUsd.toFixed(6)}\n`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "proposals.json"), JSON.stringify({ spend, drafts }, null, 2));
  writeSync(1, `${JSON.stringify(spend)}\n`);
}
