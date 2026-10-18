/**
 * B403B measurement. Facts are deterministic. The note step runs on all
 * eight drafts for each of three models, cheapest first. A model is not
 * called when its estimate would put the running total over USD 6.
 * Does not call a model unless QC_B403B_READING=1. Prints each estimate
 * before that model's calls.
 *
 *   QC_B403B_READING=1 node scripts/diagnostic/b403b/measure.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b403b/runs/reading.json");
const PRIOR = path.join(ROOT, "scripts/diagnostic/b403a/runs/reading.json");
const OUTPUT_TOKEN_CEILING = 300;
const CEILING_USD = 6;

const MODELS = [
  { id: "gpt-4o", model: "gpt-4o-2024-08-06", provider: "openai" },
  { id: "sonnet", model: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "opus", model: "claude-opus-4-7", provider: "anthropic" },
];

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

const KNOWN_ERRORS = [
  { doc: "3i", index: 0 },
  { doc: "3i", index: 6 },
  { doc: "3i", index: 11 },
  { doc: "HICL", index: 1 },
  { doc: "HICL", index: 2 },
  { doc: "GPI", index: 3 },
];

const RATES = {
  "gpt-4o-2024-08-06": { input: 2.5, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 5, output: 25 },
};

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

function knownError(doc, index) {
  return KNOWN_ERRORS.some((row) => row.doc === doc && row.index === index);
}

const {
  READING_NOTE_PROMPT,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  noteEndorses,
  sentenceState,
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
    const plantedIndexes = new Set(run.entries.map((entry) => entry.statementIndex));
    for (const arm of ["clean", "doctored"]) {
      const review = load(doc[arm]);
      const statements = Array.isArray(review.statements) ? review.statements : [];
      const texts = statements.map(statementText);
      if (texts.some((text) => !text)) throw new Error(`${doc.doc} ${arm} has an empty statement`);
      drafts.push({
        doc: doc.doc,
        arm,
        sourceText,
        plantedIndexes: arm === "doctored" ? plantedIndexes : new Set(),
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

function estimateFor(rows, model) {
  const rate = RATES[model];
  if (!rate) throw new Error(`no price for ${model}`);
  let inputChars = 0;
  let calls = 0;
  for (const draft of rows) {
    const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
    for (const row of draft.statements) {
      const facts = buildFacts({ statement: row.text, draft: draft.draftText, sourceText: draft.sourceText });
      inputChars += system.length + userPrompt(row.text, facts).length;
      calls += 1;
    }
  }
  const inputTokens = Math.ceil(inputChars / 4);
  const inputUsd = (inputTokens / 1_000_000) * rate.input;
  const outputUsd = ((calls * OUTPUT_TOKEN_CEILING) / 1_000_000) * rate.output;
  return { model, calls, inputTokens, inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

function schemaEcho(bucket) {
  const text = String(bucket || "");
  return text.includes("|");
}

const drafts = loadDrafts();

let matchedFacts = 0;
let lineGaps = 0;
let missingCount = 0;
let multi = 0;
const largest = {};
const twenty = [];
for (const draft of drafts) {
  let draftMax = 0;
  for (const row of draft.statements) {
    for (const fact of buildFacts({ statement: row.text, draft: draft.draftText, sourceText: draft.sourceText })) {
      if (fact.status !== "matched" && fact.status !== "matched_disputed") continue;
      matchedFacts += 1;
      if (fact.lineGap !== false || !Array.isArray(fact.occurrences) || fact.occurrences.length < 1) lineGaps += 1;
      if (fact.occurrenceCount !== fact.occurrences?.length) missingCount += 1;
      if (fact.occurrenceCount > 1) multi += 1;
      if (fact.occurrenceCount > draftMax) draftMax = fact.occurrenceCount;
      if (draft.doc === "HICL" && draft.arm === "doctored" && fact.surface === "20") {
        const card = shownOccurrences(fact);
        twenty.push({
          index: row.index,
          occurrenceCount: fact.occurrenceCount,
          more: card.more,
          lines: fact.occurrences.map((hit) => ({ lineId: hit.lineId, extract: hit.extract })),
        });
      }
    }
  }
  largest[`${draft.doc} ${draft.arm}`] = draftMax;
}
console.log(`Matched facts ${matchedFacts}, line gaps ${lineGaps}, count mismatches ${missingCount}, facts with more than one occurrence ${multi}`);
console.log(`Largest occurrence count: ${Object.entries(largest).map(([key, value]) => `${key} ${value}`).join("; ")}`);
console.log(`HICL doctored 20: ${JSON.stringify(twenty)}`);

for (const row of MODELS) {
  const estimate = estimateFor(drafts, row.model);
  console.log(
    `B403B estimate ${row.id}: ${estimate.calls} calls, ${estimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${estimate.totalUsd.toFixed(4)} list. Model ${row.model}. Ceiling USD ${CEILING_USD}. No cache assumed.`
  );
}

if (process.env.QC_B403B_READING !== "1") {
  console.log("QC_B403B_READING is not 1. Not run.");
  process.exit(0);
}

const { calculateLlmCostUsd, callLLM, hasProviderApiKey } = await import("../../../lib/observability.js");

function listUsd(model, usage) {
  const rate = RATES[model];
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
}

function emptySpend() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0 };
}

async function complete(spend, model, provider, messages, spanName) {
  const result = await callLLM({
    provider,
    model,
    messages,
    temperature: provider === "anthropic" ? null : 0,
    seed: 1,
    responseFormat: "json",
    spanName,
  });
  const usage = result.usage || {};
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += calculateLlmCostUsd(provider, model, usage);
  spend.listUsd += listUsd(model, usage);
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

async function readOne(spend, model, provider, draft, row) {
  const facts = buildFacts({ statement: row.text, draft: draft.draftText, sourceText: draft.sourceText });
  const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
  const user = userPrompt(row.text, facts);
  const attempts = [];
  const firstText = await complete(spend, model, provider, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], "b403b-note");
  let parsed = proposalFrom(parseJson(firstText));
  attempts.push({ bucket: parsed?.bucket ?? null, text: parsed?.text ?? "", schemaEcho: schemaEcho(parsed?.bucket), refusedReason: null });
  let accepted = acceptNote(parsed, facts);
  if (!accepted.ok) {
    attempts[attempts.length - 1].refusedReason = accepted.reason;
    const secondText = await complete(spend, model, provider, [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: firstText || "{}" },
      { role: "user", content: retryPrompt(accepted.reason, attempts[0].text) },
    ], "b403b-note-retry");
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
  if (applied.readingNote && applied.readingNote.text && noteEndorses(applied.readingNote.text)) {
    throw new Error(`${draft.doc} ${draft.arm} S${row.index} showed an endorsing note`);
  }
  return {
    index: row.index,
    text: row.text,
    knownError: draft.arm === "clean" && knownError(draft.doc, row.index),
    facts: settled,
    editorial: accepted.ok
      ? {
          bucket: accepted.note.bucket,
          text: accepted.note.text,
          disputedIndices: accepted.note.disputedIndices,
        }
      : { refused: true, reason: accepted.reason, withheldText: attempts[attempts.length - 1].text },
    attempts,
    sentenceState: state,
    sentenceLabel: applied.sentenceLabel,
    wordingLine: applied.wordingLine,
    shownNote: applied.readingNote ? applied.readingNote.text || "" : "",
  };
}

function summarise(rows) {
  const refusalsBefore = rows.filter((row) => row.attempts[0]?.refusedReason).length;
  const refusalsAfter = rows.filter((row) => row.editorial.refused).length;
  const echoes = rows.filter((row) => row.attempts.some((attempt) => attempt.schemaEcho)).length;
  const buckets = { conflicts: 0, beyond: 0, wording: 0, none: 0, withheld: 0 };
  for (const row of rows) {
    if (row.editorial.refused) buckets.withheld += 1;
    else buckets[row.editorial.bucket] += 1;
  }
  return { statements: rows.length, refusalsBefore, refusalsAfter, schemaEchoes: echoes, buckets };
}

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const priorFlagged = new Set();
for (const draft of prior.drafts) {
  if (draft.arm !== "doctored") continue;
  for (const row of draft.statements) {
    if (row.sentenceState && row.sentenceState !== "nothing_to_raise") priorFlagged.add(`${draft.doc}|${row.index}`);
  }
}

const report = {
  ceilingUsd: CEILING_USD,
  sonnet:
    "claude-sonnet-4-6. It is the Sonnet snapshot priced in lib/observability.js and used by tests/r1_2_5_eval. STAGE_MODELS does not name a Sonnet.",
  twenty,
  largest,
  matchedFacts,
  lineGaps,
  multi,
  models: [],
};
let spentList = 0;

for (const row of MODELS) {
  const estimate = estimateFor(drafts, row.model);
  console.log(
    `B403B before ${row.id}: ${estimate.calls} calls, ${estimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${estimate.totalUsd.toFixed(4)} list. Running total so far USD ${spentList.toFixed(4)}. Ceiling USD ${CEILING_USD}.`
  );
  if (spentList + estimate.totalUsd > CEILING_USD) {
    report.models.push({ id: row.id, model: row.model, ran: false, reason: "estimate would cross USD 6", estimate });
    console.log(`${row.id} not run. Estimate would cross USD 6.`);
    continue;
  }
  if (!hasProviderApiKey(row.provider)) {
    report.models.push({ id: row.id, model: row.model, ran: false, reason: `${row.provider} API key is missing`, estimate });
    console.log(`${row.id} not run. ${row.provider} API key is missing.`);
    continue;
  }
  const spend = emptySpend();
  const modelDrafts = [];
  for (const draft of drafts) {
    const statementRows = [];
    for (const statement of draft.statements) {
      statementRows.push(await readOne(spend, row.model, row.provider, draft, statement));
    }
    const header = draftHeader(
      statementRows.map((item) => ({
        facts: item.facts,
        sentenceState: item.sentenceState,
        note: item.editorial.refused ? null : { bucket: item.editorial.bucket },
      }))
    );
    modelDrafts.push({
      doc: draft.doc,
      arm: draft.arm,
      header: { numbers: header.numbers, line: header.line },
      statements: statementRows,
    });
    console.log(`${row.id} ${draft.doc} ${draft.arm}: ${header.numbers} | ${header.line || "(no extra line)"} | USD ${spend.costUsd.toFixed(6)}`);
  }
  const flat = modelDrafts.flatMap((draft) => draft.statements.map((statement) => ({ doc: draft.doc, arm: draft.arm, ...statement })));
  const plantedNow = [];
  for (const draft of drafts.filter((item) => item.arm === "doctored")) {
    const result = modelDrafts.find((item) => item.doc === draft.doc && item.arm === "doctored");
    for (const index of draft.plantedIndexes) {
      const statement = result.statements[index];
      const flagged = statement.sentenceState !== "nothing_to_raise";
      const wasFlagged = priorFlagged.has(`${draft.doc}|${index}`);
      plantedNow.push({
        doc: draft.doc,
        index,
        flagged,
        wasFlagged,
        sentenceState: statement.sentenceState,
        bucket: statement.editorial.bucket || "withheld",
        regressed: wasFlagged && !flagged,
      });
    }
  }
  const clean = flat.filter((item) => item.arm === "clean");
  const marked = clean.filter((item) => item.sentenceState !== "nothing_to_raise");
  const entry = {
    id: row.id,
    model: row.model,
    ran: true,
    estimate,
    spend,
    summary: summarise(flat),
    cleanSummary: summarise(clean),
    nullStates: flat.filter((item) => item.sentenceState == null).length,
    planted: {
      count: plantedNow.length,
      flagged: plantedNow.filter((item) => item.flagged).length,
      regressed: plantedNow.filter((item) => item.regressed),
    },
    marked: marked.map((item) => ({
      doc: item.doc,
      index: item.index,
      sentenceState: item.sentenceState,
      bucket: item.editorial.bucket || "withheld",
      knownError: item.knownError,
      text: item.shownNote || item.editorial.withheldText || "",
    })),
    headers: modelDrafts.map((draft) => ({ doc: draft.doc, arm: draft.arm, numbers: draft.header.numbers, line: draft.header.line })),
    wording: modelDrafts.map((draft) => ({
      doc: draft.doc,
      arm: draft.arm,
      notes: draft.statements.filter((item) => item.editorial.bucket === "wording" && !item.editorial.refused).length,
      marking: draft.statements.filter((item) => item.editorial.bucket === "wording" && item.sentenceState !== "nothing_to_raise" && item.sentenceState !== "not_in_source").length,
    })),
    acceptance: ["HICL", "3i"].map((doc) => {
      const index = doc === "HICL" ? 2 : 6;
      const statement = modelDrafts.find((item) => item.doc === doc && item.arm === "clean").statements[index];
      return {
        doc,
        index,
        bucket: statement.editorial.bucket || "withheld",
        state: statement.sentenceState,
        text: statement.shownNote || statement.editorial.withheldText || "",
      };
    }),
    drafts: modelDrafts,
  };
  report.models.push(entry);
  spentList += spend.listUsd;
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${row.id} done. List USD ${spend.listUsd.toFixed(6)} discounted USD ${spend.costUsd.toFixed(6)} calls ${spend.calls}. Running list USD ${spentList.toFixed(6)}`);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
