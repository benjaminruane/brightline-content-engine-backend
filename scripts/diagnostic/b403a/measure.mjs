/**
 * B403A measurement. Facts are deterministic. The note is one model call
 * per statement, retried once on a refusal. A second run, clean drafts only,
 * uses the strongest priced model. Does not call a model unless
 * QC_B403A_READING=1. Prints each estimate before those calls. The second
 * run does not start if its estimate is above USD 3.
 *
 *   QC_B403A_READING=1 node scripts/diagnostic/b403a/measure.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b403a/runs/reading.json");
const PRIOR = path.join(ROOT, "scripts/diagnostic/b402/runs/reading.json");
const OUTPUT_TOKEN_CEILING = 300;
const PART7_CEILING_USD = 3;

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
  "gpt-5.1-2025-11-13": { input: 1.25, output: 10 },
  "claude-opus-4-7": { input: 5, output: 25 },
};

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function load(rel) {
  return JSON.parse(read(rel));
}

function foldLocate(text) {
  return String(text).replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-");
}

function locate(statement, written) {
  const foldedStatement = foldLocate(statement);
  const variants = [
    written,
    written.replace(/£/g, "GBP ").replace(/\$/g, "USD ").replace(/€/g, "EUR ").replace(/\s+/g, " ").trim(),
    written.replace(/£/g, "GBP").replace(/\$/g, "USD").replace(/€/g, "EUR"),
  ];
  for (const variant of variants) {
    const folded = foldLocate(variant);
    const at = foldedStatement.indexOf(folded);
    if (at >= 0) return { start: at, end: at + folded.length };
  }
  return null;
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
} = await import("../../../lib/qc/reading-contract.mjs");
const { droppedPeriodLengths } = await import("../../../lib/qc/b394-elements.mjs");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

const PRIMARY_MODEL = STAGE_MODELS["stage5-commentary"].model;
const STRONG_MODEL = "claude-opus-4-7";

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
    const subs = [];
    for (const entry of run.entries) {
      for (const sub of entry.substitutions) subs.push({ ...sub, statementIndex: entry.statementIndex });
    }
    for (const arm of ["clean", "doctored"]) {
      const review = load(doc[arm]);
      const statements = Array.isArray(review.statements) ? review.statements : [];
      const texts = statements.map(statementText);
      if (texts.some((text) => !text)) throw new Error(`${doc.doc} ${arm} has an empty statement`);
      drafts.push({
        doc: doc.doc,
        arm,
        sourceText,
        subs: arm === "doctored" ? subs : [],
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

function estimateFor(drafts, model) {
  const rate = RATES[model];
  if (!rate) throw new Error(`no price for ${model}`);
  let inputChars = 0;
  let calls = 0;
  for (const draft of drafts) {
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

const drafts = loadDrafts();
const primaryEstimate = estimateFor(drafts, PRIMARY_MODEL);
console.log(
  `B403A primary estimate: ${primaryEstimate.calls} calls, ${primaryEstimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${primaryEstimate.totalUsd.toFixed(4)} list. Model ${PRIMARY_MODEL}. No cache assumed.`
);

const dropped = [];
let matchedFacts = 0;
let lineGaps = 0;
for (const draft of drafts) {
  for (const row of draft.statements) {
    for (const item of droppedPeriodLengths(row.text, draft.draftText, draft.sourceText)) {
      dropped.push({ doc: draft.doc, arm: draft.arm, index: row.index, surface: item.surface });
    }
    for (const fact of buildFacts({ statement: row.text, draft: draft.draftText, sourceText: draft.sourceText })) {
      if (fact.status !== "matched" && fact.status !== "matched_disputed") continue;
      matchedFacts += 1;
      if (fact.lineGap !== false || !fact.lineId || !fact.extract) lineGaps += 1;
    }
  }
}
console.log(`Derived-period elements removed: ${dropped.map((row) => `${row.doc} ${row.arm} S${row.index} ${row.surface}`).join("; ") || "none"}`);
console.log(`Matched facts ${matchedFacts}, line gaps ${lineGaps}`);

const strongEstimate = estimateFor(drafts.filter((draft) => draft.arm === "clean"), STRONG_MODEL);
console.log(
  `B403A part 7 estimate: ${strongEstimate.calls} calls, ${strongEstimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING}, USD ${strongEstimate.totalUsd.toFixed(4)} list. Model ${STRONG_MODEL}. Ceiling USD ${PART7_CEILING_USD}.`
);

if (process.env.QC_B403A_READING !== "1") {
  console.log("QC_B403A_READING is not 1. Not run.");
  process.exit(0);
}

const { calculateLlmCostUsd, callLLM, hasProviderApiKey } = await import("../../../lib/observability.js");
if (!hasProviderApiKey("openai")) throw new Error("OpenAI API key is missing");

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
  const costUsd = calculateLlmCostUsd(provider, model, usage);
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += costUsd;
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
  ], "b403a-note");
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
    ], "b403a-note-retry");
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
    displayVerdict: card.displayVerdict ?? null,
    factualBadge: card.factualBadge ?? null,
    knownError: draft.arm === "clean" && knownError(draft.doc, row.index),
    facts: settled,
    editorial: accepted.ok
      ? {
          bucket: accepted.note.bucket,
          text: accepted.note.text,
          disputedIndices: accepted.note.disputedIndices,
          rejections: accepted.rejections,
        }
      : {
          refused: true,
          reason: accepted.reason,
          withheldText: attempts[attempts.length - 1].text,
        },
    attempts,
    sentenceState: state,
    sentenceLabel: applied.sentenceLabel,
    shownNote: applied.readingNote ? applied.readingNote.text || "" : "",
  };
}

function schemaEcho(bucket) {
  const text = String(bucket || "");
  return text.includes("|");
}

function summarise(label, rows) {
  const refusals = rows.filter((row) => row.editorial.refused).length;
  const echoes = rows.filter((row) => row.attempts.some((attempt) => attempt.schemaEcho)).length;
  const buckets = { conflicts: 0, beyond: 0, wording: 0, none: 0, withheld: 0 };
  for (const row of rows) {
    if (row.editorial.refused) buckets.withheld += 1;
    else buckets[row.editorial.bucket] += 1;
  }
  return { label, statements: rows.length, refusals, schemaEchoes: echoes, buckets };
}

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const priorBucket = new Map();
const priorFlagged = new Set();
for (const draft of prior.drafts) {
  for (const row of draft.statements) {
    const key = `${draft.doc}|${draft.arm}|${row.index}`;
    priorBucket.set(key, row.editorial.bucket || (row.editorial.refused ? "refused" : null));
    if (draft.arm === "doctored" && row.sentenceState && row.sentenceState !== "nothing_to_raise") {
      priorFlagged.add(`${draft.doc}|${row.index}`);
    }
  }
}

const spend = emptySpend();
const results = [];
for (const draft of drafts) {
  const statementRows = [];
  for (const row of draft.statements) {
    statementRows.push(await readOne(spend, PRIMARY_MODEL, "openai", draft, row));
  }
  const header = draftHeader(statementRows.map((row) => ({ facts: row.facts, sentenceState: row.sentenceState })));
  results.push({
    doc: draft.doc,
    arm: draft.arm,
    header: { stamp: header.stamp, numbers: header.numbers, line: header.line, footnote: header.footnote },
    counts: header.counts,
    statements: statementRows,
  });
  console.log(`${draft.doc} ${draft.arm}: ${header.numbers} | ${header.line || "(no extra line)"} | USD ${spend.costUsd.toFixed(6)}`);
}

console.log(`Primary so far USD ${spend.costUsd.toFixed(6)} calls ${spend.calls}`);
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ partial: true, spend, drafts: results }, null, 2)}\n`);

const cleanDrafts = drafts.filter((draft) => draft.arm === "clean");
let strong = { ran: false, estimate: strongEstimate, reason: null, spend: null, drafts: [] };
if (strongEstimate.totalUsd > PART7_CEILING_USD) {
  strong.reason = "estimate above USD 3";
  console.log("Part 7 estimate is above USD 3. Not run.");
} else if (!hasProviderApiKey("anthropic")) {
  strong.reason = "Anthropic API key is missing";
  console.log("Part 7 not run: Anthropic API key is missing.");
} else {
  const strongSpend = emptySpend();
  for (const draft of cleanDrafts) {
    const statementRows = [];
    for (const row of draft.statements) {
      statementRows.push(await readOne(strongSpend, STRONG_MODEL, "anthropic", draft, row));
    }
    const header = draftHeader(statementRows.map((row) => ({ facts: row.facts, sentenceState: row.sentenceState })));
    strong.drafts.push({
      doc: draft.doc,
      arm: draft.arm,
      header: { stamp: header.stamp, numbers: header.numbers, line: header.line },
      statements: statementRows,
    });
    console.log(`part 7 ${draft.doc}: ${header.numbers} | ${header.line || "(no extra line)"} | USD ${strongSpend.costUsd.toFixed(6)}`);
  }
  strong = { ...strong, ran: true, spend: strongSpend };
}

function flat(rows) {
  return rows.flatMap((draft) => draft.statements.map((statement) => ({ doc: draft.doc, arm: draft.arm, ...statement })));
}

const all = flat(results);
const nullStates = all.filter((row) => row.sentenceState == null);
const refused = all.filter((row) => row.editorial.refused);
const resolved = all.reduce((sum, row) => sum + (row.editorial.disputedIndices?.length || 0), 0);
const rejected = all.reduce((sum, row) => sum + (row.editorial.rejections?.length || 0), 0);
const matched = all.reduce(
  (sum, row) => sum + row.facts.filter((fact) => fact.status === "matched" || fact.status === "matched_disputed").length,
  0
);
const gaps = all.reduce(
  (sum, row) =>
    sum +
    row.facts.filter((fact) => (fact.status === "matched" || fact.status === "matched_disputed") && fact.lineGap !== false).length,
  0
);

const bucketChanges = all
  .map((row) => {
    const before = priorBucket.get(`${row.doc}|${row.arm}|${row.index}`);
    const after = row.editorial.bucket || "withheld";
    return { doc: row.doc, arm: row.arm, index: row.index, before, after, text: row.editorial.text || row.editorial.withheldText || "" };
  })
  .filter((row) => row.before !== row.after);

const plantedNow = [];
for (const draft of drafts.filter((row) => row.arm === "doctored")) {
  const result = results.find((row) => row.doc === draft.doc && row.arm === "doctored");
  for (const index of draft.plantedIndexes) {
    const statement = result.statements[index];
    const flagged = statement.sentenceState !== "nothing_to_raise";
    const wasFlagged = priorFlagged.has(`${draft.doc}|${index}`);
    plantedNow.push({ doc: draft.doc, index, flagged, wasFlagged, sentenceState: statement.sentenceState, regressed: wasFlagged && !flagged });
  }
}

const clean = all.filter((row) => row.arm === "clean");
const marked = clean.filter((row) => row.sentenceState !== "nothing_to_raise");

const report = {
  structuredOutput:
    "callLLM responseFormat json. OpenAI uses response_format json_object. Anthropic uses an open tool schema. Neither is an enum. acceptNote allows only the four bucket words. The pipe-joined literal is not in the prompt.",
  primaryModel: PRIMARY_MODEL,
  primaryEstimate,
  spend,
  droppedPeriodLengths: dropped,
  drafts: results,
  bucketChanges,
  m1: { nullStates: nullStates.length },
  m2: {
    refusedAfterRetry: refused.map((row) => ({
      doc: row.doc,
      arm: row.arm,
      index: row.index,
      reason: row.editorial.reason,
      attempts: row.attempts.length,
    })),
    schemaEchoes: all.filter((row) => row.attempts[0]?.schemaEcho).map((row) => `${row.doc} ${row.arm} S${row.index}`),
  },
  m3: { resolved, rejected, attempted: resolved + rejected },
  m4: { matched, lineGaps: gaps },
  m5: {
    planted: plantedNow.length,
    flagged: plantedNow.filter((row) => row.flagged).length,
    regressed: plantedNow.filter((row) => row.regressed),
  },
  m6: {
    clean: clean.length,
    marked: marked.length,
    rows: marked.map((row) => ({
      doc: row.doc,
      index: row.index,
      sentenceState: row.sentenceState,
      bucket: row.editorial.bucket || "withheld",
      knownError: row.knownError,
      text: row.editorial.text || row.editorial.withheldText || "",
    })),
  },
  m7: results.map((draft) => ({ doc: draft.doc, arm: draft.arm, numbers: draft.header.numbers, line: draft.header.line })),
  part7: {
    model: STRONG_MODEL,
    ran: strong.ran,
    reason: strong.reason,
    estimate: strongEstimate,
    spend: strong.spend,
    summary: strong.ran ? summarise("opus", flat(strong.drafts)) : null,
    primarySummary: summarise("gpt-4o", clean),
    drafts: strong.drafts,
  },
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Primary USD ${spend.costUsd.toFixed(6)} list ${spend.listUsd.toFixed(6)} calls ${spend.calls}`);
console.log(`M1 null ${report.m1.nullStates} M3 resolved ${resolved} of ${resolved + rejected} M4 gaps ${gaps} M5 flagged ${report.m5.flagged} of ${report.m5.planted}`);
console.log(`M2 still refused ${refused.length} M6 marked ${marked.length} of ${clean.length}`);
if (strong.ran) console.log(`Part 7 USD ${strong.spend.costUsd.toFixed(6)} calls ${strong.spend.calls}`);
