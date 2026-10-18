/**
 * B403C measurement. Benchmark facts are deterministic. The note step is
 * claude-opus-4-7 on all eight drafts. Does not call a model unless
 * QC_B403C_READING=1. Prints the estimate first. Does not start if the
 * estimate is above USD 3, or if the benchmark count is not 12.
 *
 *   QC_B403C_READING=1 node scripts/diagnostic/b403c/measure.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b403c/runs/reading.json");
const PRIOR = path.join(ROOT, "scripts/diagnostic/b403b/runs/reading.json");
const OUTPUT_TOKEN_CEILING = 300;
const CEILING_USD = 3;
const MODEL = "claude-opus-4-7";

const DOCS = [
  {
    doc: "3i",
    runId: "3i-hy25-doctored",
    source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-09-29/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-09-29/clean-review.json",
  },
  {
    doc: "HICL",
    runId: "hicl-interim-doctored",
    source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json",
  },
  {
    doc: "GPI",
    runId: "gpi-press-release-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json",
  },
  {
    doc: "ClearPoint",
    runId: "clearpoint-q1-2026-doctored",
    source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    doctored: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json",
    clean: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
  },
];

const FIRM = [
  { doc: "3i", index: 0 },
  { doc: "HICL", index: 1 },
  { doc: "HICL", index: 2 },
];
const SOFT = [{ doc: "3i", index: 11 }];
const REJECTED = [
  { doc: "3i", index: 6 },
  { doc: "GPI", index: 3 },
];

const RATES = { "claude-opus-4-7": { input: 5, output: 25 } };

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function load(rel) {
  return JSON.parse(read(rel));
}

function statementText(row) {
  if (typeof row?.text === "string" && row.text.trim()) return row.text;
  if (typeof row?.qcCard?.statement === "string") return row.qcCard.statement;
  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function ledgerClass(doc, index) {
  if (FIRM.some((row) => row.doc === doc && row.index === index)) return "firm";
  if (SOFT.some((row) => row.doc === doc && row.index === index)) return "soft";
  if (REJECTED.some((row) => row.doc === doc && row.index === index)) return "rejected";
  return "correct";
}

const {
  DATE_EXTRACT_LIMIT,
  READING_NOTE_PROMPT,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  missingBenchmarkCard,
  sentenceState,
  sentenceTier,
  settleFacts,
  shownOccurrences,
} = await import("../../../lib/qc/reading-contract.mjs");

function userPrompt(statement, facts) {
  const elements = facts.map((fact, index) => `${index}. ${fact.kind}: ${fact.surface}`).join("\n");
  return `Statement:\n${statement}\n\nElements:\n${elements || "(none)"}`;
}

function proposalFrom(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const indices = Array.isArray(parsed.disputedIndices) ? parsed.disputedIndices : parsed.disputedElements;
  return {
    bucket: typeof parsed.bucket === "string" ? parsed.bucket.trim().toLowerCase() : parsed.bucket,
    text: typeof parsed.note === "string" ? parsed.note : "",
    disputedIndices: indices,
  };
}

function loadDrafts() {
  const labels = load("scripts/diagnostic/b385/labels.json");
  const byRun = new Map(labels.runs.map((run) => [run.runId, run]));
  const drafts = [];
  for (const doc of DOCS) {
    const sourceText = read(doc.source);
    if (!sourceText.trim()) throw new Error(`empty source ${doc.source}`);
    const run = byRun.get(doc.runId);
    if (!run) throw new Error(`no labels for ${doc.runId}`);
    const plantedIndexes = [...new Set(run.entries.map((entry) => entry.statementIndex))].sort((a, b) => a - b);
    for (const arm of ["clean", "doctored"]) {
      const review = load(doc[arm]);
      const statements = Array.isArray(review.statements) ? review.statements : [];
      const texts = statements.map(statementText);
      if (texts.some((text) => !text)) throw new Error(`${doc.doc} ${arm} has an empty statement`);
      drafts.push({
        doc: doc.doc,
        arm,
        sourceText,
        plantedIndexes: arm === "doctored" ? plantedIndexes : [],
        statements: statements.map((row, index) => ({
          index,
          text: texts[index],
          displayVerdict: row.qcCard?.displayVerdict ?? null,
          factualBadge: row.qcCard?.factualBadge ?? null,
          card: row.qcCard ?? null,
        })),
        draftText: texts.join("\n"),
      });
    }
  }
  return drafts;
}

function factsFor(draft, row) {
  return buildFacts({ statement: row.text, draft: draft.draftText, sourceText: draft.sourceText });
}

function estimateFor(rows) {
  const rate = RATES[MODEL];
  let inputChars = 0;
  let calls = 0;
  for (const draft of rows) {
    const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
    for (const row of draft.statements) {
      inputChars += system.length + userPrompt(row.text, factsFor(draft, row)).length;
      calls += 1;
    }
  }
  const inputTokens = Math.ceil(inputChars / 4);
  const totalUsd = (inputTokens / 1_000_000) * rate.input + ((calls * OUTPUT_TOKEN_CEILING) / 1_000_000) * rate.output;
  return { calls, inputTokens, totalUsd };
}

const drafts = loadDrafts();
const benchmarks = [];
const busyDates = [];
for (const draft of drafts) {
  for (const row of draft.statements) {
    for (const fact of factsFor(draft, row)) {
      if (fact.kind === "benchmark") {
        const card = fact.status === "not_found" ? missingBenchmarkCard(fact) : null;
        benchmarks.push({
          doc: draft.doc,
          arm: draft.arm,
          index: row.index,
          surface: fact.surface,
          status: fact.status,
          source: card ? card.source.map((item) => ({ word: item.word, lineId: item.lineId, extract: item.extract })) : [],
        });
      }
      if (fact.kind === "date" && fact.status === "matched" && fact.occurrenceCount > DATE_EXTRACT_LIMIT) {
        const card = shownOccurrences(fact);
        busyDates.push({
          doc: draft.doc,
          arm: draft.arm,
          index: row.index,
          surface: fact.surface,
          occurrenceCount: fact.occurrenceCount,
          countOnly: card.countOnly,
          shown: card.shown.length,
        });
      }
    }
  }
}
const matchedBench = benchmarks.filter((row) => row.status === "matched");
const missingBench = benchmarks.filter((row) => row.status === "not_found");
console.log(`Benchmarks ${benchmarks.length}, matched ${matchedBench.length}, not_found ${missingBench.length}`);
for (const row of benchmarks) console.log(`${row.doc} ${row.arm} S${row.index} ${row.status} ${row.surface}`);
console.log(`Dates over ${DATE_EXTRACT_LIMIT}: ${busyDates.map((row) => `${row.doc} ${row.arm} S${row.index} ${row.surface} ${row.occurrenceCount}`).join("; ") || "none"}`);

const countOk = benchmarks.length === 12 && matchedBench.length === 10 && missingBench.length === 2
  && missingBench.every((row) => row.doc === "HICL" && row.index === 2 && row.surface === "budgets");
if (!countOk) {
  console.log("Benchmark count differs from 12 occurrences, 10 matched, two not_found budgets. Stopped before the note run.");
  process.exit(0);
}

const estimate = estimateFor(drafts);
console.log(
  `B403C estimate: ${estimate.calls} calls, ${estimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${estimate.totalUsd.toFixed(4)} list. Model ${MODEL}. Ceiling USD ${CEILING_USD}. No cache assumed.`
);

if (process.env.QC_B403C_READING !== "1") {
  console.log("QC_B403C_READING is not 1. Not run.");
  process.exit(0);
}
if (estimate.totalUsd > CEILING_USD) {
  console.log("Estimate is above USD 3. Not run.");
  process.exit(0);
}

const { calculateLlmCostUsd, callLLM, hasProviderApiKey } = await import("../../../lib/observability.js");
if (!hasProviderApiKey("anthropic")) throw new Error("Anthropic API key is missing");

function listUsd(usage) {
  const rate = RATES[MODEL];
  return ((Number(usage?.inputTokens) || 0) / 1_000_000) * rate.input + ((Number(usage?.outputTokens) || 0) / 1_000_000) * rate.output;
}

const spend = { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };

async function complete(messages, spanName) {
  const result = await callLLM({
    provider: "anthropic",
    model: MODEL,
    messages,
    temperature: null,
    seed: 1,
    responseFormat: "json",
    spanName,
  });
  const usage = result.usage || {};
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += calculateLlmCostUsd("anthropic", MODEL, usage);
  spend.listUsd += listUsd(usage);
  return result.text;
}

function retryPrompt(reason, previous) {
  return `The previous reply was refused. Reason: ${reason}.
bucket must be one of these words, and nothing else:
conflicts
beyond
wording
none
disputedIndices must be an array of integers.
Describe what the source says and what the statement says.
Previous note:
${previous || "(empty)"}`;
}

function schemaEcho(bucket) {
  return String(bucket || "").includes("|");
}

async function readOne(draft, row) {
  const facts = factsFor(draft, row);
  const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
  const user = userPrompt(row.text, facts);
  const attempts = [];
  const firstText = await complete([
    { role: "system", content: system },
    { role: "user", content: user },
  ], "b403c-note");
  let parsed = proposalFrom(parseJson(firstText));
  attempts.push({ bucket: parsed?.bucket ?? null, text: parsed?.text ?? "", schemaEcho: schemaEcho(parsed?.bucket), refusedReason: null });
  let accepted = acceptNote(parsed, facts);
  if (!accepted.ok) {
    attempts[attempts.length - 1].refusedReason = accepted.reason;
    const secondText = await complete([
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: firstText || "{}" },
      { role: "user", content: retryPrompt(accepted.reason, attempts[0].text) },
    ], "b403c-note-retry");
    parsed = proposalFrom(parseJson(secondText));
    attempts.push({ bucket: parsed?.bucket ?? null, text: parsed?.text ?? "", schemaEcho: schemaEcho(parsed?.bucket), refusedReason: null });
    accepted = acceptNote(parsed, facts);
    if (!accepted.ok) attempts[attempts.length - 1].refusedReason = accepted.reason;
  }
  const settled = accepted.ok ? settleFacts(facts, accepted.note) : facts;
  const state = sentenceState(settled, accepted.ok ? accepted.note : { refused: true });
  if (state == null) throw new Error(`${draft.doc} ${draft.arm} S${row.index} sentenceState is null`);
  const card = row.card || { statement: row.text, displayVerdict: row.displayVerdict, factualBadge: row.factualBadge };
  const applied = applyReadingContract(card, {
    facts: settled,
    note: accepted.ok ? accepted.note : null,
    sentenceState: state,
  });
  if (applied.displayVerdict !== card.displayVerdict || applied.factualBadge !== card.factualBadge) {
    throw new Error(`${draft.doc} ${draft.arm} S${row.index} changed an existing card field`);
  }
  const benchmarkCards = settled
    .filter((fact) => fact.kind === "benchmark" && fact.status === "not_found")
    .map((fact) => missingBenchmarkCard(fact));
  return {
    index: row.index,
    text: row.text,
    ledger: draft.arm === "clean" ? ledgerClass(draft.doc, row.index) : null,
    sentenceState: state,
    tier: sentenceTier(state),
    wordingLine: applied.wordingLine,
    bucket: accepted.ok ? accepted.note.bucket : "withheld",
    shownNote: applied.readingNote?.text || "",
    withheldText: accepted.ok ? "" : attempts[attempts.length - 1].text,
    attempts,
    notFound: settled.filter((fact) => fact.status === "not_found").map((fact) => `${fact.kind}:${fact.surface}`),
    benchmarkCards,
  };
}

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const priorOpus = prior.models.find((row) => row.id === "opus");
const priorFlagged = new Set();
for (const draft of priorOpus.drafts) {
  if (draft.arm !== "doctored") continue;
  for (const row of draft.statements) {
    if (row.sentenceState && row.sentenceState !== "nothing_to_raise") priorFlagged.add(`${draft.doc}|${row.index}`);
  }
}

const results = [];
for (const draft of drafts) {
  const statementRows = [];
  for (const row of draft.statements) statementRows.push(await readOne(draft, row));
  const header = draftHeader(statementRows.map((item) => ({
    facts: factsFor(draft, draft.statements[item.index]).map((fact) => {
      const settled = item.notFound.includes(`${fact.kind}:${fact.surface}`) ? { ...fact, status: "not_found" } : fact;
      return settled;
    }),
    sentenceState: item.sentenceState,
    note: item.bucket === "withheld" ? null : { bucket: item.bucket },
  })));
  results.push({
    doc: draft.doc,
    arm: draft.arm,
    header: { numbers: header.numbers, line: header.line },
    tiers: header.counts.tiers,
    statements: statementRows,
  });
  console.log(`${draft.doc} ${draft.arm}: ${header.numbers} | ${header.line || "(no extra line)"} | USD ${spend.costUsd.toFixed(6)}`);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ partial: true, spend, benchmarks, busyDates, drafts: results }, null, 2)}\n`);
}

const planted = [];
for (const draft of drafts.filter((row) => row.arm === "doctored")) {
  const result = results.find((row) => row.doc === draft.doc && row.arm === "doctored");
  for (const index of draft.plantedIndexes) {
    const statement = result.statements[index];
    const flagged = statement.tier !== "quiet";
    planted.push({
      doc: draft.doc,
      index,
      flagged,
      tier: statement.tier,
      state: statement.sentenceState,
      regressed: priorFlagged.has(`${draft.doc}|${index}`) && !flagged,
    });
  }
}

const report = {
  model: MODEL,
  estimate,
  spend,
  dateExtractLimit: DATE_EXTRACT_LIMIT,
  benchmarks,
  busyDates,
  planted: {
    count: planted.length,
    flagged: planted.filter((row) => row.flagged).length,
    regressed: planted.filter((row) => row.regressed),
  },
  drafts: results,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Opus USD ${spend.costUsd.toFixed(6)} list ${spend.listUsd.toFixed(6)} calls ${spend.calls}`);
console.log(`Planted flagged ${report.planted.flagged} of ${report.planted.count}`);
