/**
 * One full-pipeline pass over fixtures 01 to 20.
 * B446 imports this. B441 keeps its own copy. This is the resume path:
 * each finished fixture is written by rename, and a file that does not parse
 * is refused rather than started again.
 */
import { execSync } from "node:child_process";
import { appendFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "./env.mjs";
import { filterFixtures, loadAllFixtures } from "./fixtures.mjs";
import { loadPipelineSources } from "./sources.mjs";
import {
  assertFreezeCountForSelectedIds,
  assertMatchesFreeze,
  frozenRowsByFixture,
} from "../accuracy/run-evidence.mjs";
import { padFixtureId } from "../accuracy/lib.mjs";
import { buildEstimate } from "../b437/estimate.mjs";

function clip(value, max = 2000) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function concernSpans(concern) {
  const raw = Array.isArray(concern?.span) ? concern.span : concern?.span ? [concern.span] : [];
  const spans = [];
  for (const span of raw) {
    const startChar = Number(span?.startChar);
    const endChar = Number(span?.endChar);
    if (!Number.isInteger(startChar) || !Number.isInteger(endChar) || endChar <= startChar) continue;
    spans.push({ startChar, endChar });
  }
  return spans;
}

function concernRow(concern) {
  if (!concern || typeof concern !== "object") return { concernCode: null, text: clip(concern), quote: "", span: [] };
  const code = concern.concernCode || concern.rule || concern.ruleId || null;
  const text = concern.concernText || concern.note || concern.suggestedDirection || "";
  const quote = concern?.thing1?.quote || concern.quote || concern.quotedText || concern.phrase || concern.evaluativePhrase || "";
  return {
    concernCode: typeof code === "string" ? code : code == null ? null : String(code),
    text: clip(text),
    quote: clip(quote, 500),
    span: concernSpans(concern),
  };
}

function findingRow(finding) {
  if (!finding || typeof finding !== "object") return null;
  return {
    rule: typeof finding.rule === "string" ? finding.rule : null,
    quote: clip(finding.quote, 500),
    note: clip(finding.note),
  };
}

function spanBits(spans) {
  return (Array.isArray(spans) ? spans : []).map((span) => {
    if (typeof span === "string") return clip(span, 400);
    if (typeof span?.text === "string") return clip(span.text, 400);
    if (typeof span?.quote === "string") return clip(span.quote, 400);
    return "";
  }).filter(Boolean);
}

function excerptText(value) {
  if (typeof value === "string") return clip(value);
  if (value && typeof value.passage === "string") return clip(value.passage);
  return "";
}

function compactCard(fixtureId, card, index, occurrence, outputType) {
  const note = card?.readingNote && typeof card.readingNote === "object" ? card.readingNote : null;
  return {
    fixtureId: padFixtureId(fixtureId),
    outputType: typeof outputType === "string" ? outputType : null,
    statement: typeof card?.statement === "string" ? card.statement : "",
    index: Number.isFinite(card?.index) ? card.index : index,
    occurrence,
    displayVerdict: card?.displayVerdict ?? null,
    displayVerdictReason: card?.displayVerdictReason ?? null,
    supportState: card?.supportState ?? null,
    hasConflict: card?.hasConflict === true,
    evidenceSummary: clip(card?.evidenceSummary || card?.reasoningParagraph || ""),
    primaryExcerpt: excerptText(card?.primaryExcerpt),
    conflictExcerpt: excerptText(card?.conflictExcerpt),
    unsupportedSpans: spanBits(card?.unsupportedSpans),
    evidenceFindings: (Array.isArray(card?.evidenceFindings) ? card.evidenceFindings : [])
      .map(findingRow)
      .filter(Boolean),
    displayedEvidenceProse: clip(card?.displayedEvidenceProse || ""),
    sourceAccount: card?.sourceAccount === true,
    sourceQuote: typeof card?.sourceQuote === "string" ? card.sourceQuote : "",
    sourceDifference: typeof card?.sourceDifference === "string" ? card.sourceDifference : "",
    editorialVerdict: card?.editorialVerdict ?? null,
    editorialConcerns: (Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : []).map(concernRow),
    complianceVerdict: card?.complianceVerdict ?? null,
    complianceConcerns: (Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : []).map(concernRow),
    framingFidelityConcerns: (Array.isArray(card?.framingFidelityConcerns) ? card.framingFidelityConcerns : []).map(concernRow),
    sourceRecencyConcerns: (Array.isArray(card?.sourceRecencyConcerns) ? card.sourceRecencyConcerns : []).map(concernRow),
    sentenceState: card?.sentenceState ?? null,
    sentenceLabel: card?.sentenceLabel ?? null,
    tier: card?.tier ?? null,
    readingNote: note
      ? { bucket: typeof note.bucket === "string" ? note.bucket : null, text: clip(note.text || note.note || "") }
      : null,
    evidenceNotReviewedReason: card?.evidenceNotReviewedReason ?? null,
    notReviewedRecord: card?.notReviewedRecord ?? null,
    editorialNotReviewedReason: card?.editorialNotReviewedReason ?? null,
    complianceNotReviewedReason: card?.complianceNotReviewedReason ?? null,
    commentaryNotReviewedReason: card?.commentaryNotReviewedReason ?? null,
    matchExplanations: (Array.isArray(card?.matchExplanations) ? card.matchExplanations : []).map((row) => ({
      sourceIndex: row?.sourceIndex ?? null,
      sourceLabel: row?.sourceLabel ?? null,
      classification: row?.classification ?? null,
      writtenFor: row?.writtenFor ?? null,
      explanation: clip(row?.explanation || ""),
    })),
    partialGround: card?.partialGround ?? null,
    wordingNoteWithheld: card?.wordingNoteWithheld ?? null,
    silences: Array.isArray(card?.silences) ? card.silences : [],
    secondValueLine: typeof card?.secondValueLine === "string" ? card.secondValueLine : "",
  };
}

function listUsd(spend, pricing) {
  let total = 0;
  const byModel = spend?.byModel && typeof spend.byModel === "object" ? spend.byModel : {};
  for (const [key, bucket] of Object.entries(byModel)) {
    const slash = key.indexOf("/");
    const provider = key.slice(0, slash);
    const model = key.slice(slash + 1);
    const rate = pricing?.[provider]?.[model];
    if (!rate) continue;
    total += ((Number(bucket.inputTokens) || 0) / 1e6) * rate.input;
    total += ((Number(bucket.outputTokens) || 0) / 1e6) * rate.output;
  }
  return total;
}

function spendView(spend, pricing) {
  return {
    calls: spend.calls,
    inputTokens: spend.inputTokens,
    cachedInputTokens: spend.cachedInputTokens,
    outputTokens: spend.outputTokens,
    costUsd: spend.costUsd,
    listUsd: listUsd(spend, pricing),
    unpricedCalls: spend.unpricedCalls,
    unpricedModels: spend.unpricedModels,
    byModel: spend.byModel,
  };
}

function addViews(a, b) {
  if (!a) return b;
  if (!b) return a;
  const byModel = {};
  for (const source of [a.byModel || {}, b.byModel || {}]) {
    for (const [key, bucket] of Object.entries(source)) {
      if (!byModel[key]) {
        byModel[key] = {
          calls: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          unpricedCalls: 0,
        };
      }
      const dest = byModel[key];
      dest.calls += bucket.calls || 0;
      dest.inputTokens += bucket.inputTokens || 0;
      dest.cachedInputTokens += bucket.cachedInputTokens || 0;
      dest.outputTokens += bucket.outputTokens || 0;
      dest.costUsd += bucket.costUsd || 0;
      dest.unpricedCalls += bucket.unpricedCalls || 0;
    }
  }
  return {
    calls: (a.calls || 0) + (b.calls || 0),
    inputTokens: (a.inputTokens || 0) + (b.inputTokens || 0),
    cachedInputTokens: (a.cachedInputTokens || 0) + (b.cachedInputTokens || 0),
    outputTokens: (a.outputTokens || 0) + (b.outputTokens || 0),
    costUsd: (a.costUsd || 0) + (b.costUsd || 0),
    listUsd: (a.listUsd || 0) + (b.listUsd || 0),
    unpricedCalls: (a.unpricedCalls || 0) + (b.unpricedCalls || 0),
    unpricedModels: [...new Set([...(a.unpricedModels || []), ...(b.unpricedModels || [])])],
    byModel,
  };
}

function parseArgs(argv) {
  const out = { resume: false };
  for (const arg of argv) {
    if (arg === "--resume") out.resume = true;
    else if (arg.startsWith("-")) throw new Error(`paid pass: unknown argument ${arg}`);
  }
  return out;
}

async function loadPass(filePath, resume) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
  try {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.fixtures) || !Array.isArray(doc.cards)) {
      throw new Error("pass file has no fixtures array");
    }
    return doc;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new Error(
      resume
        ? `paid pass: ${filePath} does not parse (${why}). Resume will not start the pass again.`
        : `paid pass: ${filePath} already exists and does not parse (${why}).`
    );
  }
}

function requireNote(fixtureId, fields) {
  const status = fields?.writerFeedbackStatus;
  if (status !== "shown" && status !== "withheld") {
    throw new Error(`F${fixtureId}: craft note status is missing`);
  }
  if (status === "shown") {
    if (typeof fields.writerFeedback !== "string" || !fields.writerFeedback.trim()) {
      throw new Error(`F${fixtureId}: craft note was shown and the text is missing`);
    }
  }
  if (status === "withheld") {
    if (typeof fields.writerFeedbackRefusal !== "string" || !fields.writerFeedbackRefusal.trim()) {
      throw new Error(`F${fixtureId}: craft note was withheld and the phrase is missing`);
    }
  }
}

async function writeJson(filePath, value) {
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, filePath);
}

/**
 * @param {{ dir: string, label: string, ceilingUsd?: number }} options
 */
export async function runPaidPass({ dir, label, ceilingUsd = 40 } = {}) {
  if (typeof dir !== "string" || !dir) throw new Error("paid pass: dir is missing");
  if (typeof label !== "string" || !label) throw new Error("paid pass: label is missing");
  loadLocalEnvFiles({ liveMeasurement: true });
  const { writerNoteFields } = await import("../../../lib/qc/reading-review.mjs");
  const args = parseArgs(process.argv.slice(2));
  const progress = path.join(dir, "progress.log");
  const log = (line) => {
    const row = `${new Date().toISOString()} ${line}`;
    process.stdout.write(`${row}\n`);
    appendFileSync(progress, `${row}\n`);
  };
  if (!args.resume) writeFileSync(progress, "");

  const estimate = await buildEstimate();
  await mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, "estimate.json"), estimate);
  const one = estimate.onePass;
  log(
    `ESTIMATE ${label} one pass USD ${one.usd} pipeline ${one.pipelineUsd} note ${one.noteUsd} ` +
      `scheduler wall ${(one.tpmFloorMs / 60000).toFixed(1)} min (TPM floor)`
  );
  if (one.usd > ceilingUsd) {
    throw new Error(`Estimate USD ${one.usd} is above ${ceilingUsd}. Not spending.`);
  }

  const { runPipelineV4 } = await import("../../../lib/qc/pipeline-v4/index.mjs");
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { flushObservability, hasProviderApiKey, getLlmSpend, resetLlmSpend, getLlmPricingTable } =
    await import("../../../lib/observability.js");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  if (!hasProviderApiKey("openai")) throw new Error("OPENAI_API_KEY required");
  if (!hasProviderApiKey("anthropic")) throw new Error("ANTHROPIC_API_KEY required");

  const pricing = getLlmPricingTable();
  const statementsPath = path.join(dir, "../accuracy/statements.json");
  const statementsDoc = JSON.parse(await readFile(statementsPath, "utf8"));
  const { byId: frozenByFixture } = frozenRowsByFixture(statementsDoc);
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const selectedIds = fixtures.map((fixture) => padFixtureId(fixture.data.id));
  const frozenCount = assertFreezeCountForSelectedIds(statementsDoc, selectedIds);
  const repoRoot = path.join(dir, "../../..");
  const sha = execSync("git rev-parse --short HEAD", { cwd: repoRoot }).toString().trim();
  log(`FREEZE ${frozenCount} statements. Build ${sha}. Cache off. ${label}.`);

  let carried = spendView(getLlmSpend(), pricing);
  const pass = "1";
  resetLlmSpend();
  const outPath = path.join(dir, `pass-${pass}.json`);
  const prior = await loadPass(outPath, args.resume);
  if (prior && !args.resume) {
    throw new Error(`paid pass: ${outPath} already exists. Re-run with --resume, or remove it first.`);
  }
  if (args.resume && !prior) {
    throw new Error(`paid pass: --resume found no pass file at ${outPath}.`);
  }
  const resumeBase = prior?.spend || null;
  const doneRows = (Array.isArray(prior?.fixtures) ? prior.fixtures : []).filter((row) => row && row.ok === true);
  const done = new Set(doneRows.map((row) => padFixtureId(row.fixtureId)));
  const priorCards = Array.isArray(prior?.cards) ? prior.cards : [];
  for (const row of doneRows) {
    const id = padFixtureId(row.fixtureId);
    const count = priorCards.filter((card) => padFixtureId(card.fixtureId) === id).length;
    if (count !== row.statementCount) {
      throw new Error(`paid pass: stored F${id} says ${row.statementCount} statements and has ${count} cards. Resume stopped.`);
    }
    const fields = writerNoteFields(row);
    requireNote(id, fields);
  }
  const doc = {
    pass,
    label,
    gitSha: prior?.gitSha || sha,
    cache: "off",
    flags: {
      evidenceEnabled: true,
      editorialEnabled: true,
      complianceEnabled: true,
      skipCommentary: false,
      readingView: "default on",
    },
    startedAt: prior?.startedAt || new Date().toISOString(),
    fixtures: doneRows,
    cards: priorCards.filter((card) => done.has(padFixtureId(card.fixtureId))),
  };
  log(`PASS ${pass} start. Already stored: ${done.size}.`);

  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    if (done.has(id)) {
      log(`PASS ${pass} F${id} skipped (resume)`);
      continue;
    }
    const before = addViews(addViews(carried, resumeBase), spendView(getLlmSpend(), pricing));
    if (before.costUsd > ceilingUsd || before.listUsd > ceilingUsd) {
      doc.stopped = `ceiling USD ${ceilingUsd} reached before F${id}`;
      doc.spend = addViews(resumeBase, spendView(getLlmSpend(), pricing));
      await writeJson(outPath, doc);
      throw new Error(doc.stopped);
    }
    const t0 = Date.now();
    const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
    const sources = await loadPipelineSources(fixture.data.sources || []);
    const cfg = fixture.data.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
    const outputType = typeof cfg.outputType === "string" ? cfg.outputType : "";
    if (!outputType) throw new Error(`F${id}: output type is missing`);
    const freeze = frozenByFixture.get(id) || [];
    let result;
    try {
      result = await runPipelineV4(draft, sources, {
        pipelineRoute: "v4",
        requiredVersion: cfg.requiredVersion === "public" ? "public" : "complete",
        outputType,
        eventType: typeof cfg.eventType === "string" ? cfg.eventType : undefined,
        evidenceEnabled: true,
        editorialEnabled: true,
        complianceEnabled: true,
        skipCommentary: false,
        frozenStatements: freeze.map((row) => ({
          text: row.text,
          charStart: row.charStart,
          charEnd: row.charEnd,
          index: row.index,
        })),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`PASS ${pass} F${id} failed before it was stored. ${message} Re-run with --resume.`);
      throw err;
    }
    const rawCards = Array.isArray(result?.qcCards) ? result.qcCards : [];
    const cards = rawCards.map((card, index) =>
      compactCard(id, card, index, freeze[index]?.occurrence ?? 0, outputType)
    );
    assertMatchesFreeze({
      fixtureId: id,
      frozenRows: freeze,
      cards,
      stage1Source: result?.stage1?.source ?? null,
    });
    const noteFields = writerNoteFields(result?.reading);
    requireNote(id, noteFields);
    doc.cards.push(...cards);
    doc.fixtures.push({
      fixtureId: id,
      ok: true,
      statementCount: cards.length,
      outputType,
      stage1Source: result?.stage1?.source ?? null,
      wallMs: Date.now() - t0,
      noteSpend: result?.reading?.spend ?? null,
      wordingNotesWithheld: result?.reading?.wordingNotesWithheld ?? null,
      ...noteFields,
    });
    const after = addViews(resumeBase, spendView(getLlmSpend(), pricing));
    doc.spend = after;
    await writeJson(outPath, doc);
    log(
      `PASS ${pass} F${id} cards=${cards.length} wallMs=${Date.now() - t0} ` +
        `spend=${after.costUsd.toFixed(4)} list=${after.listUsd.toFixed(4)} calls=${after.calls} ` +
        `note=${noteFields.writerFeedbackStatus}`
    );
  }

  doc.finishedAt = new Date().toISOString();
  doc.spend = addViews(resumeBase, spendView(getLlmSpend(), pricing));
  doc.cardCount = doc.cards.length;
  await writeJson(outPath, doc);
  await flushObservability();
  const passSpend = doc.spend;
  carried = addViews(carried, passSpend);
  log(`PASS ${pass} done. cards=${doc.cardCount} list=${passSpend.listUsd.toFixed(4)} discounted=${passSpend.costUsd.toFixed(4)}`);
  if (doc.cardCount !== frozenCount) {
    throw new Error(`PASS ${pass} stored ${doc.cardCount} cards, freeze is ${frozenCount}`);
  }
  if (doc.fixtures.length !== fixtures.length) {
    throw new Error(`PASS ${pass} stored ${doc.fixtures.length} fixtures, expected ${fixtures.length}`);
  }

  await writeJson(path.join(dir, "spend.json"), { ceilingUsd, estimate, combined: carried });
  log(`COMBINED list=${carried.listUsd.toFixed(4)} discounted=${carried.costUsd.toFixed(4)} calls=${carried.calls} unpriced=${carried.unpricedCalls}`);
  return { spend: carried, cardCount: doc.cardCount, gitSha: doc.gitSha };
}
