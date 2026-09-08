#!/usr/bin/env node
/**
 * Evidence-only accuracy scoring run. Fixtures 01-20. Cache off.
 * Editorial and compliance off. Commentary skipped (Stages 2, 3 onward).
 * Stage 1 is not called. Statements come from the frozen list in statements.json.
 *
 *   node scripts/diagnostic/accuracy/run-evidence.mjs --pass 1
 *   node scripts/diagnostic/accuracy/run-evidence.mjs --pass 2
 *
 * Combined ceiling USD 40 for both passes. Remaining budget via ACCURACY_COST_REMAINING.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { addOccurrenceIndices, flattenStatements, normalizeStatementText, padFixtureId } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMBINED_CEILING_USD = 40;
const FREEZE_PATH = path.join(__dirname, "statements.json");

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

function costOf(node, calculateLlmCostUsd) {
  const direct = Number(node?.costUsd) || 0;
  const span = Number(node?.spanElicitCostUsd) || 0;
  const usage = node?.usage;
  const fromUsage =
    usage && (usage.inputTokens || usage.outputTokens)
      ? calculateLlmCostUsd("openai", "gpt-4o-2024-08-06", usage)
      : 0;
  return direct + span + (direct > 0 ? 0 : fromUsage);
}

export function sumMatchCosts(pipelineResult, calculateLlmCostUsd) {
  let total = 0;
  const stage2 = Array.isArray(pipelineResult?.stage2) ? pipelineResult.stage2 : [];
  for (const entry of stage2) {
    total += costOf(entry, calculateLlmCostUsd);
    for (const m of Array.isArray(entry?.sourceMatches) ? entry.sourceMatches : []) {
      total += costOf(m, calculateLlmCostUsd);
    }
    const claims = entry?.claimSpans?.claims;
    if (Array.isArray(claims)) {
      for (const c of claims) {
        total += costOf(c, calculateLlmCostUsd);
        for (const m of Array.isArray(c?.matches) ? c.matches : []) {
          total += costOf(m, calculateLlmCostUsd);
        }
      }
    }
  }
  total += costOf(pipelineResult?.stage1, calculateLlmCostUsd);
  return total;
}

function compactSupportSpans(card) {
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  return spans.map((s) => ({
    sourceRefId: s?.sourceRefId,
    classification: s?.classification ?? null,
    statementId: s?.statementId ?? null,
    passage: typeof s?.passage === "string" ? s.passage : "",
    start: Number.isFinite(s?.start) ? s.start : s?.start ?? null,
    end: Number.isFinite(s?.end) ? s.end : s?.end ?? null,
  }));
}

export function compactCards(fixtureId, pipelineResult) {
  const cards = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards : [];
  const rows = cards.map((card, i) => ({
    fixtureId: padFixtureId(fixtureId),
    statement: typeof card?.statement === "string" ? card.statement : "",
    index: Number.isFinite(card?.index) ? card.index : i,
    displayVerdict: card?.displayVerdict ?? null,
    hasConflict: card?.hasConflict === true,
    sourceMatches: (Array.isArray(card?.stage2SourceFingerprints)
      ? card.stage2SourceFingerprints
      : Array.isArray(pipelineResult?.stage2?.[i]?.sourceMatches)
        ? pipelineResult.stage2[i].sourceMatches
        : []
    ).map((m) => ({
      classification: m?.classification ?? null,
      sourceIndex: m?.sourceIndex,
    })),
    supportSpans: compactSupportSpans(card),
  }));
  return addOccurrenceIndices(
    rows.map((r) => ({
      fixtureId: r.fixtureId,
      text: r.statement,
      index: r.index,
      displayVerdict: r.displayVerdict,
      hasConflict: r.hasConflict,
      sourceMatches: r.sourceMatches,
      supportSpans: r.supportSpans,
    }))
  ).map((r) => ({
    fixtureId: r.fixtureId,
    statement: r.text,
    occurrence: r.occurrence,
    index: r.index,
    displayVerdict: r.displayVerdict,
    hasConflict: r.hasConflict,
    sourceMatches: r.sourceMatches,
    supportSpans: r.supportSpans,
  }));
}

export function frozenRowsByFixture(statementsDoc) {
  const all = flattenStatements(statementsDoc);
  const byId = new Map();
  for (const row of all) {
    const id = padFixtureId(row.fixtureId);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  }
  return { all, byId };
}

/**
 * Fail loudly if the pipeline did not run the exact frozen list.
 * Compares count and each statement text (NFC, collapsed whitespace).
 */
export function assertMatchesFreeze({ fixtureId, frozenRows, cards, stage1Source }) {
  const id = padFixtureId(fixtureId);
  const freeze = Array.isArray(frozenRows) ? frozenRows : [];
  const loaded = Array.isArray(cards) ? cards : [];
  if (stage1Source !== "frozen") {
    throw new Error(
      `FROZEN LIST LEAK F${id}: stage1.source is ${JSON.stringify(stage1Source)}, expected "frozen". Stage 1 must not run on this path.`
    );
  }
  if (loaded.length !== freeze.length) {
    throw new Error(
      `FROZEN LIST LEAK F${id}: loaded ${loaded.length} statements, freeze has ${freeze.length}.`
    );
  }
  for (let i = 0; i < freeze.length; i += 1) {
    const expected = normalizeStatementText(freeze[i]?.text);
    const got = normalizeStatementText(loaded[i]?.statement ?? loaded[i]?.text);
    if (expected !== got) {
      throw new Error(
        `FROZEN LIST LEAK F${id}: statement ${i} text differs from freeze.\nfreeze: ${expected}\nloaded: ${got}`
      );
    }
  }
}

async function runOneFixture(fixture, runPipelineV4, calculateLlmCostUsd, frozenRows) {
  const id = padFixtureId(fixture.data.id);
  const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
  const sources = await loadPipelineSources(fixture.data.sources || []);
  const cfg = fixture.data.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
  const freeze = Array.isArray(frozenRows) ? frozenRows : [];
  const result = await runPipelineV4(draft, sources, {
    pipelineRoute: "v4",
    requiredVersion: cfg.requiredVersion === "public" ? "public" : "complete",
    outputType: typeof cfg.outputType === "string" ? cfg.outputType : undefined,
    eventType: typeof cfg.eventType === "string" ? cfg.eventType : undefined,
    editorialEnabled: false,
    complianceEnabled: false,
    skipCommentary: true,
    frozenStatements: freeze.map((s) => ({
      text: s.text,
      charStart: s.charStart,
      charEnd: s.charEnd,
      index: s.index,
    })),
  });
  const cards = compactCards(id, result);
  assertMatchesFreeze({
    fixtureId: id,
    frozenRows: freeze,
    cards,
    stage1Source: result?.stage1?.source ?? null,
  });
  return {
    fixtureId: id,
    label: fixture.data.label ?? "",
    costUsd: sumMatchCosts(result, calculateLlmCostUsd),
    statementCount: cards.length,
    stage1Source: result?.stage1?.source ?? null,
    cards,
  };
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const argv = process.argv.slice(2);
  const passIdx = argv.indexOf("--pass");
  const pass = passIdx >= 0 ? String(argv[passIdx + 1] || "1") : "1";
  const remaining = Number(process.env.ACCURACY_COST_REMAINING || COMBINED_CEILING_USD);
  if (!(remaining > 0)) {
    throw new Error(`No remaining budget (ACCURACY_COST_REMAINING=${remaining}). Stopping.`);
  }

  const statementsDoc = JSON.parse(await readFile(FREEZE_PATH, "utf8"));
  const { all: frozenAll, byId: frozenByFixture } = frozenRowsByFixture(statementsDoc);
  if (frozenAll.length !== 261) {
    throw new Error(`Freeze has ${frozenAll.length} statements, expected 261. Not spending.`);
  }

  const { runPipelineV4 } = await import("../../../lib/qc/pipeline-v4/index.mjs");
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
    "../../../lib/observability.js"
  );
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  if (!hasProviderApiKey(STAGE_MODELS["stage2-matching"]?.provider)) {
    throw new Error("OPENAI_API_KEY required");
  }

  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const outDir = path.join(__dirname, "runs", `evidence-pass-${pass}`);
  await mkdir(outDir, { recursive: true });

  const fixturesOut = [];
  let spent = 0;
  for (const fixture of fixtures) {
    const id = padFixtureId(fixture.data.id);
    const freeze = frozenByFixture.get(id) || [];
    console.log(`pass ${pass} F${id} starting remaining=${(remaining - spent).toFixed(4)} freeze=${freeze.length}`);
    const row = await runOneFixture(fixture, runPipelineV4, calculateLlmCostUsd, freeze);
    await flushObservability();
    spent += row.costUsd;
    fixturesOut.push(row);
    console.log(
      `pass ${pass} F${id} statements=${row.statementCount} stage1=${row.stage1Source} costUsd=${row.costUsd.toFixed(4)} spent=${spent.toFixed(4)}`
    );
    if (spent > remaining) {
      throw new Error(
        `Pass ${pass} spent ${spent.toFixed(4)} which exceeds remaining budget ${remaining.toFixed(4)}. Stopping.`
      );
    }
  }

  const allCards = fixturesOut.flatMap((f) => f.cards);
  if (allCards.length !== frozenAll.length) {
    throw new Error(
      `FROZEN LIST LEAK: loaded ${allCards.length} cards across fixtures, freeze has ${frozenAll.length}.`
    );
  }

  const payload = {
    pass: Number.isFinite(Number(pass)) ? Number(pass) : pass,
    range: "01-20",
    cache: "off",
    editorialEnabled: false,
    complianceEnabled: false,
    skipCommentary: true,
    frozenList: true,
    frozenFrom: statementsDoc.frozenFrom ?? "statements.json",
    costUsd: spent,
    ceilingRemainingAtStart: remaining,
    extractedAt: new Date().toISOString(),
    perFixture: fixturesOut.map((f) => ({
      fixtureId: f.fixtureId,
      label: f.label,
      statementCount: f.statementCount,
      stage1Source: f.stage1Source,
      costUsd: f.costUsd,
    })),
    cards: allCards,
  };
  const outPath = path.join(outDir, "cards.json");
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`PASS ${pass} DONE costUsd=${spent.toFixed(4)} cards=${allCards.length} wrote ${outPath}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
