/**
 * B441 one full-pipeline pass. Cache off. Frozen statements.
 * Evidence, editorial, compliance, commentary, and the reader's note, all on.
 *
 *   node scripts/diagnostic/b441/run.mjs
 *   node scripts/diagnostic/b441/run.mjs --resume
 *
 * Prints the one-pass estimate first. Stops above USD 40.
 */
import { execSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import {
  assertFreezeCountForSelectedIds,
  assertMatchesFreeze,
  frozenRowsByFixture,
} from "../accuracy/run-evidence.mjs";
import { padFixtureId } from "../accuracy/lib.mjs";
import { buildEstimate } from "../b437/estimate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CEILING_USD = 40;
const PROGRESS = path.join(__dirname, "progress.log");

function log(line) {
  const row = `${new Date().toISOString()} ${line}`;
  process.stdout.write(`${row}\n`);
  appendFileSync(PROGRESS, `${row}\n`);
}
const STATEMENTS_PATH = path.join(__dirname, "../accuracy/statements.json");

function clip(value, max = 2000) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function concernRow(concern) {
  if (!concern || typeof concern !== "object") return { concernCode: null, text: clip(concern) };
  const code = concern.concernCode || concern.rule || concern.ruleId || null;
  const text = concern.concernText || concern.note || concern.suggestedDirection || "";
  const quote = concern?.thing1?.quote || concern.quotedText || concern.phrase || concern.evaluativePhrase || "";
  return {
    concernCode: typeof code === "string" ? code : code == null ? null : String(code),
    text: clip(text),
    quote: clip(quote, 500),
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

function compactCard(fixtureId, card, index, occurrence) {
  const note = card?.readingNote && typeof card.readingNote === "object" ? card.readingNote : null;
  return {
    fixtureId: padFixtureId(fixtureId),
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
  }
  return out;
}

async function loadPass(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const doc = JSON.parse(raw);
    return doc && typeof doc === "object" ? doc : null;
  } catch {
    return null;
  }
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  const args = parseArgs(process.argv.slice(2));
  const estimate = await buildEstimate();
  await mkdir(__dirname, { recursive: true });
  await writeFile(path.join(__dirname, "estimate.json"), `${JSON.stringify(estimate, null, 2)}\n`);
  const one = estimate.onePass;
  log(
    `ESTIMATE one pass USD ${one.usd} pipeline ${one.pipelineUsd} note ${one.noteUsd} ` +
      `scheduler wall ${(one.tpmFloorMs / 60000).toFixed(1)} min (TPM floor)`
  );
  if (one.usd > CEILING_USD) {
    throw new Error(`Estimate USD ${one.usd} is above ${CEILING_USD}. Not spending.`);
  }

  const { runPipelineV4 } = await import("../../../lib/qc/pipeline-v4/index.mjs");
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { flushObservability, hasProviderApiKey, getLlmSpend, resetLlmSpend, getLlmPricingTable } =
    await import("../../../lib/observability.js");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  if (!hasProviderApiKey("openai")) throw new Error("OPENAI_API_KEY required");
  if (!hasProviderApiKey("anthropic")) throw new Error("ANTHROPIC_API_KEY required");

  const pricing = getLlmPricingTable();
  const statementsDoc = JSON.parse(await readFile(STATEMENTS_PATH, "utf8"));
  const { byId: frozenByFixture } = frozenRowsByFixture(statementsDoc);
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const selectedIds = fixtures.map((fixture) => padFixtureId(fixture.data.id));
  const frozenCount = assertFreezeCountForSelectedIds(statementsDoc, selectedIds);
  const sha = execSync("git rev-parse --short HEAD", { cwd: path.join(__dirname, "../../..") }).toString().trim();
  log(`FREEZE ${frozenCount} statements. Build ${sha}. Cache off.`);

  const passes = ["1"];
  let carried = spendView(getLlmSpend(), pricing);

  for (const pass of passes) {
    resetLlmSpend();
    const outPath = path.join(__dirname, `pass-${pass}.json`);
    const prior = args.resume ? await loadPass(outPath) : null;
    const resumeBase = prior?.spend || null;
    const done = new Set(
      (Array.isArray(prior?.fixtures) ? prior.fixtures : [])
        .filter((row) => row && row.ok === true)
        .map((row) => padFixtureId(row.fixtureId))
    );
    const doc = {
      pass,
      gitSha: sha,
      cache: "off",
      flags: {
        evidenceEnabled: true,
        editorialEnabled: true,
        complianceEnabled: true,
        skipCommentary: false,
        readingView: "default on",
      },
      startedAt: prior?.startedAt || new Date().toISOString(),
      fixtures: Array.isArray(prior?.fixtures) ? prior.fixtures.filter((row) => row?.ok === true) : [],
      cards: Array.isArray(prior?.cards) ? prior.cards : [],
    };
    log(`PASS ${pass} start. Already stored: ${done.size}.`);

    for (const fixture of fixtures) {
      const id = padFixtureId(fixture.data.id);
      if (done.has(id)) {
        log(`PASS ${pass} F${id} skipped (resume)`);
        continue;
      }
      const before = addViews(addViews(carried, resumeBase), spendView(getLlmSpend(), pricing));
      if (before.costUsd > CEILING_USD || before.listUsd > CEILING_USD) {
        doc.stopped = `ceiling USD ${CEILING_USD} reached before F${id}`;
        doc.spend = addViews(resumeBase, spendView(getLlmSpend(), pricing));
        await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`);
        throw new Error(doc.stopped);
      }
      const t0 = Date.now();
      const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
      const sources = await loadPipelineSources(fixture.data.sources || []);
      const cfg = fixture.data.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
      const freeze = frozenByFixture.get(id) || [];
      const result = await runPipelineV4(draft, sources, {
        pipelineRoute: "v4",
        requiredVersion: cfg.requiredVersion === "public" ? "public" : "complete",
        outputType: typeof cfg.outputType === "string" ? cfg.outputType : undefined,
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
      const rawCards = Array.isArray(result?.qcCards) ? result.qcCards : [];
      const cards = rawCards.map((card, index) =>
        compactCard(id, card, index, freeze[index]?.occurrence ?? 0)
      );
      assertMatchesFreeze({
        fixtureId: id,
        frozenRows: freeze,
        cards,
        stage1Source: result?.stage1?.source ?? null,
      });
      doc.cards.push(...cards);
      doc.fixtures.push({
        fixtureId: id,
        ok: true,
        statementCount: cards.length,
        stage1Source: result?.stage1?.source ?? null,
        wallMs: Date.now() - t0,
        noteSpend: result?.reading?.spend ?? null,
        wordingNotesWithheld: result?.reading?.wordingNotesWithheld ?? null,
        writerFeedbackStatus: result?.reading?.writerFeedbackStatus ?? null,
      });
      const after = addViews(resumeBase, spendView(getLlmSpend(), pricing));
      doc.spend = after;
      await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`);
      log(
        `PASS ${pass} F${id} cards=${cards.length} wallMs=${Date.now() - t0} ` +
          `spend=${after.costUsd.toFixed(4)} list=${after.listUsd.toFixed(4)} calls=${after.calls}`
      );
    }

    doc.finishedAt = new Date().toISOString();
    doc.spend = addViews(resumeBase, spendView(getLlmSpend(), pricing));
    doc.cardCount = doc.cards.length;
    await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`);
    await flushObservability();
    const passSpend = doc.spend;
    carried = addViews(carried, passSpend);
    log(`PASS ${pass} done. cards=${doc.cardCount} list=${passSpend.listUsd.toFixed(4)} discounted=${passSpend.costUsd.toFixed(4)}`);
    if (doc.cardCount !== frozenCount) {
      throw new Error(`PASS ${pass} stored ${doc.cardCount} cards, freeze is ${frozenCount}`);
    }
  }

  await writeFile(path.join(__dirname, "spend.json"), `${JSON.stringify({ ceilingUsd: CEILING_USD, estimate, combined: carried }, null, 2)}\n`);
  log(`COMBINED list=${carried.listUsd.toFixed(4)} discounted=${carried.costUsd.toFixed(4)} calls=${carried.calls}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
