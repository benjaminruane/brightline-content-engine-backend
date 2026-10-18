/**
 * B402 measurement. Facts are deterministic. The note is one model call
 * per statement, plus one draft-level note. Does not call a model unless
 * QC_B402_READING=1. Prints the estimate first. Does not run above USD 5.
 *
 *   QC_B402_READING=1 node scripts/diagnostic/b402/measure.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b402/runs/reading.json");
const OUTPUT_TOKEN_CEILING = 300;
const INPUT_USD_PER_MILLION = 2.5;
const OUTPUT_USD_PER_MILLION = 10;
const CEILING_USD = 5;

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

function userPrompt(statement, facts) {
  const elements = facts.map((fact) => `${fact.kind}: ${fact.surface}`).join("\n");
  return `Statement:\n${statement}\n\nElements:\n${elements || "(none)"}`;
}

const {
  READING_NOTE_PROMPT,
  WRITER_FEEDBACK_PROMPT,
  acceptNote,
  applyReadingContract,
  buildFacts,
  draftHeader,
  noteEndorses,
  sentenceState,
  settleFacts,
} = await import("../../../lib/qc/reading-contract.mjs");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

const MODEL = STAGE_MODELS["stage5-commentary"].model;

function loadDrafts() {
  const labels = load("scripts/diagnostic/b385/labels.json");
  const byRun = new Map(labels.runs.map((run) => [run.runId, run]));
  const drafts = [];
  for (const doc of DOCS) {
    const sourceText = read(doc.source);
    if (!sourceText.trim()) throw new Error(`empty source ${doc.source}`);
    const run = byRun.get(doc.runId);
    if (!run) throw new Error(`no labels for ${doc.runId}`);
    const subs = [];
    for (const entry of run.entries) {
      for (const sub of entry.substitutions) {
        subs.push({ ...sub, statementIndex: entry.statementIndex });
      }
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
  const planted = drafts
    .filter((row) => row.arm === "doctored")
    .reduce((sum, row) => sum + row.subs.length, 0);
  if (planted !== 37) throw new Error(`expected 37 planted substitutions, found ${planted}`);
  return drafts;
}

function estimateFor(drafts) {
  let inputChars = 0;
  let calls = 0;
  for (const draft of drafts) {
    const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
    for (const row of draft.statements) {
      const facts = buildFacts({
        statement: row.text,
        draft: draft.draftText,
        sourceText: draft.sourceText,
      });
      inputChars += system.length + userPrompt(row.text, facts).length;
      calls += 1;
    }
    calls += 1;
    inputChars += WRITER_FEEDBACK_PROMPT.length + 2000;
  }
  const inputTokens = Math.ceil(inputChars / 4);
  const inputUsd = (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION;
  const outputUsd = ((calls * OUTPUT_TOKEN_CEILING) / 1_000_000) * OUTPUT_USD_PER_MILLION;
  return { calls, inputTokens, inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

const drafts = loadDrafts();
const estimate = estimateFor(drafts);
console.log(
  `B402 reading estimate: ${estimate.calls} calls, ${estimate.inputTokens} input tokens at chars/4, output ceiling ${OUTPUT_TOKEN_CEILING} tokens each, USD ${estimate.totalUsd.toFixed(4)} list (input ${estimate.inputUsd.toFixed(4)}, output ${estimate.outputUsd.toFixed(4)}). No cache assumed. Model ${MODEL}.`
);

if (estimate.totalUsd > CEILING_USD) {
  console.log("Estimate is above USD 5. Not run.");
  process.exit(0);
}

if (process.env.QC_B402_READING !== "1") {
  console.log("QC_B402_READING is not 1. Not run.");
  process.exit(0);
}

const { calculateLlmCostUsd, callLLM, hasProviderApiKey } = await import("../../../lib/observability.js");
if (!hasProviderApiKey("openai")) {
  throw new Error("OpenAI API key is missing");
}

const spend = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  costUsd: 0,
};

function listUsd(usage) {
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (input / 1_000_000) * INPUT_USD_PER_MILLION + (output / 1_000_000) * OUTPUT_USD_PER_MILLION;
}

async function complete(messages, spanName) {
  if (spend.costUsd > CEILING_USD) {
    throw new Error(`spend crossed USD ${CEILING_USD} before ${spanName}`);
  }
  const result = await callLLM({
    provider: "openai",
    model: MODEL,
    messages,
    temperature: 0,
    seed: 1,
    responseFormat: "json",
    spanName,
  });
  const usage = result.usage || {};
  const costUsd = calculateLlmCostUsd("openai", MODEL, usage);
  spend.calls += 1;
  spend.inputTokens += Number(usage.inputTokens) || 0;
  spend.outputTokens += Number(usage.outputTokens) || 0;
  spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
  spend.costUsd += costUsd;
  return { text: result.text, costUsd, listUsd: listUsd(usage) };
}

function knownError(doc, index) {
  return KNOWN_ERRORS.some((row) => row.doc === doc && row.index === index);
}

const results = [];
const plantedRows = [];
const rejections = [];
const endorsingKept = [];
const endorsingRefused = [];

for (const draft of drafts) {
  const system = `${READING_NOTE_PROMPT}\n\nSource:\n${draft.sourceText}`;
  const statementRows = [];
  for (const row of draft.statements) {
    const facts = buildFacts({
      statement: row.text,
      draft: draft.draftText,
      sourceText: draft.sourceText,
    });
    let completion = await complete(
      [
        { role: "system", content: system },
        { role: "user", content: userPrompt(row.text, facts) },
      ],
      "b402-note"
    );
    let parsed = parseJson(completion.text);
    if (!parsed) {
      completion = await complete(
        [
          { role: "system", content: system },
          { role: "user", content: userPrompt(row.text, facts) },
        ],
        "b402-note-retry"
      );
      parsed = parseJson(completion.text);
    }
    const proposal = parsed
      ? {
          bucket: parsed.bucket,
          text: typeof parsed.note === "string" ? parsed.note : "",
          disputedElements: parsed.disputedElements,
        }
      : null;
    const accepted = acceptNote(proposal, facts);
    if (!accepted.ok && proposal && noteEndorses(proposal.text)) {
      endorsingRefused.push({
        doc: draft.doc,
        arm: draft.arm,
        index: row.index,
        text: proposal.text,
      });
    }
    const settled = accepted.ok ? settleFacts(facts, accepted.note) : facts;
    const state = sentenceState(settled, accepted.ok ? accepted.note : { refused: true });
    const reading = {
      facts: settled,
      note: accepted.ok ? accepted.note : null,
      sentenceState: state,
    };
    const card = row.card || {
      statement: row.text,
      displayVerdict: row.displayVerdict,
      factualBadge: row.factualBadge,
    };
    const applied = applyReadingContract(card, reading);
    if (applied.displayVerdict !== card.displayVerdict || applied.factualBadge !== card.factualBadge) {
      throw new Error(`${draft.doc} ${draft.arm} S${row.index} changed an existing card field`);
    }
    if (card.sentenceState !== undefined) {
      throw new Error(`${draft.doc} ${draft.arm} S${row.index} mutated the stored card`);
    }
    if (accepted.ok && noteEndorses(accepted.note.text)) {
      endorsingKept.push({ doc: draft.doc, arm: draft.arm, index: row.index, text: accepted.note.text });
    }
    for (const rejection of accepted.rejections) {
      rejections.push({ doc: draft.doc, arm: draft.arm, index: row.index, ...rejection });
    }
    statementRows.push({
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
            disputedElements: accepted.note.disputedElements,
            rejections: accepted.rejections,
          }
        : {
            refused: true,
            reason: accepted.reason,
            proposedBucket: proposal?.bucket ?? null,
            proposedText: proposal?.text ?? null,
          },
      sentenceState: state,
      sentenceLabel: state ? applied.sentenceLabel : null,
    });
  }

  const header = draftHeader(
    statementRows.map((row) => ({ facts: row.facts, sentenceState: row.sentenceState }))
  );
  const feedbackSource = statementRows
    .map((row) => {
      const note = row.editorial.refused ? `(refused: ${row.editorial.reason})` : row.editorial.text || "(empty)";
      return `S${row.index} [${row.sentenceState || "refused"}] ${note}`;
    })
    .join("\n");
  let feedbackCompletion = await complete(
    [
      { role: "system", content: WRITER_FEEDBACK_PROMPT },
      { role: "user", content: feedbackSource },
    ],
    "b402-writer"
  );
  let feedbackParsed = parseJson(feedbackCompletion.text);
  let feedbackText = typeof feedbackParsed?.note === "string" ? feedbackParsed.note : "";
  if (!feedbackParsed || noteEndorses(feedbackText)) {
    feedbackCompletion = await complete(
      [
        { role: "system", content: WRITER_FEEDBACK_PROMPT },
        {
          role: "user",
          content: `${feedbackSource}\n\nRewrite the note. Describe the pattern. Do not praise the draft with a verdict word.`,
        },
      ],
      "b402-writer-retry"
    );
    feedbackParsed = parseJson(feedbackCompletion.text);
    feedbackText = typeof feedbackParsed?.note === "string" ? feedbackParsed.note : "";
  }
  const writerFeedback = feedbackText && !noteEndorses(feedbackText) ? feedbackText : null;
  if (feedbackText && noteEndorses(feedbackText)) {
    endorsingRefused.push({ doc: draft.doc, arm: draft.arm, index: "writer", text: feedbackText });
  }

  for (const sub of draft.subs) {
    const statement = statementRows[sub.statementIndex];
    if (!statement) throw new Error(`${sub.id} has no statement ${sub.statementIndex}`);
    const span = locate(statement.text, String(sub.written || ""));
    const inSpan = span
      ? statement.facts.filter((fact) => fact.start < span.end && fact.end > span.start)
      : [];
    const notFound = inSpan.some((fact) => fact.status === "not_found");
    const bucket = statement.editorial.bucket || null;
    const noteRaised = bucket === "conflicts" || bucket === "beyond";
    plantedRows.push({
      id: sub.id,
      doc: draft.doc,
      statementIndex: sub.statementIndex,
      written: sub.written,
      elementsInWritten: inSpan.map((fact) => fact.surface),
      notFound,
      noteRaised,
      bucket,
      sentenceState: statement.sentenceState,
      neither: !notFound && !noteRaised,
    });
  }

  results.push({
    doc: draft.doc,
    arm: draft.arm,
    header: {
      stamp: header.stamp,
      numbers: header.numbers,
      line: header.line,
      footnote: header.footnote,
    },
    counts: header.counts,
    writerFeedback,
    statements: statementRows,
  });
  console.log(
    `${draft.doc} ${draft.arm}: ${header.numbers} | ${header.line || "(no extra line)"} | calls ${spend.calls} | USD ${spend.costUsd.toFixed(6)}`
  );
}

const cleanStatements = results
  .filter((row) => row.arm === "clean")
  .flatMap((row) => row.statements.map((statement) => ({ doc: row.doc, ...statement })));
if (cleanStatements.length !== 38) {
  throw new Error(`expected 38 clean statements, found ${cleanStatements.length}`);
}
const genuinelyClean = cleanStatements.filter((row) => !row.knownError);
if (genuinelyClean.length !== 32) {
  throw new Error(`expected 32 genuinely clean statements, found ${genuinelyClean.length}`);
}

const m2Checks = [
  { doc: "3i", index: 0, needle: "30 June 2025", name: "3i period date" },
  { doc: "HICL", index: 1, needle: "HCIL", name: "HICL S1 misspelling" },
  { doc: "HICL", index: 2, needle: "budgets", name: "HICL S2 budgets" },
];
const m2 = m2Checks.map((check) => {
  const statement = cleanStatements.find((row) => row.doc === check.doc && row.index === check.index);
  if (!statement) throw new Error(`missing ${check.name}`);
  if (!statement.text.includes(check.needle)) {
    throw new Error(`${check.name} text does not include ${check.needle}`);
  }
  return {
    name: check.name,
    doc: check.doc,
    index: check.index,
    sentenceState: statement.sentenceState,
    sentenceLabel: statement.sentenceLabel,
    bucket: statement.editorial.bucket || null,
    refused: statement.editorial.refused === true,
    text: statement.editorial.text || statement.editorial.proposedText || "",
  };
});

const report = {
  model: MODEL,
  estimate,
  spend: {
    ...spend,
    listUsd:
      (spend.inputTokens / 1_000_000) * INPUT_USD_PER_MILLION +
      (spend.outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION,
  },
  lineGap:
    "Matched elements carry lineGap true. The matcher did not report a line, and this run did not search for one.",
  drafts: results,
  m1: {
    planted: plantedRows.length,
    notFound: plantedRows.filter((row) => row.notFound).length,
    conflictsOrBeyond: plantedRows.filter((row) => row.noteRaised).length,
    neither: plantedRows.filter((row) => row.neither).map((row) => row.id),
    rows: plantedRows,
  },
  m2,
  m3: {
    genuinelyClean: genuinelyClean.length,
    wording: genuinelyClean.filter((row) => row.editorial.bucket === "wording").length,
    ids: genuinelyClean
      .filter((row) => row.editorial.bucket === "wording")
      .map((row) => `${row.doc} S${row.index}`),
  },
  m4: {
    kept: endorsingKept,
    refused: endorsingRefused,
  },
  m5: {
    count: rejections.length,
    rows: rejections,
  },
};

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `B402 measured: calls ${spend.calls}, discounted USD ${spend.costUsd.toFixed(6)}, list USD ${report.spend.listUsd.toFixed(6)}`
);
console.log(
  `M1 not_found ${report.m1.notFound}, conflicts or beyond ${report.m1.conflictsOrBeyond}, neither ${report.m1.neither.length}`
);
console.log(`M3 wording on genuinely clean: ${report.m3.wording}`);
console.log(`M4 kept endorsements: ${report.m4.kept.length}, refused: ${report.m4.refused.length}`);
console.log(`M5 rejected surfaces: ${report.m5.count}`);
