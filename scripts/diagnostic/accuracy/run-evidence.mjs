#!/usr/bin/env node
/**
 * Evidence-only accuracy scoring run. Fixtures 01-20. Cache off.
 * Editorial and compliance off. Commentary skipped (Stages 1, 1b, 2, 3).
 *
 *   node scripts/diagnostic/accuracy/run-evidence.mjs --pass 1
 *   node scripts/diagnostic/accuracy/run-evidence.mjs --pass 2
 *
 * Combined ceiling USD 40 for both passes. Remaining budget via ACCURACY_COST_REMAINING.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { addOccurrenceIndices, padFixtureId } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMBINED_CEILING_USD = 40;

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
  }));
  return addOccurrenceIndices(
    rows.map((r) => ({
      fixtureId: r.fixtureId,
      text: r.statement,
      index: r.index,
      displayVerdict: r.displayVerdict,
      hasConflict: r.hasConflict,
      sourceMatches: r.sourceMatches,
    }))
  ).map((r) => ({
    fixtureId: r.fixtureId,
    statement: r.text,
    occurrence: r.occurrence,
    index: r.index,
    displayVerdict: r.displayVerdict,
    hasConflict: r.hasConflict,
    sourceMatches: r.sourceMatches,
  }));
}

async function runOneFixture(fixture, runPipelineV4, calculateLlmCostUsd) {
  const id = padFixtureId(fixture.data.id);
  const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
  const sources = await loadPipelineSources(fixture.data.sources || []);
  const cfg = fixture.data.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
  const result = await runPipelineV4(draft, sources, {
    pipelineRoute: "v4",
    requiredVersion: cfg.requiredVersion === "public" ? "public" : "complete",
    outputType: typeof cfg.outputType === "string" ? cfg.outputType : undefined,
    eventType: typeof cfg.eventType === "string" ? cfg.eventType : undefined,
    editorialEnabled: false,
    complianceEnabled: false,
    skipCommentary: true,
  });
  return {
    fixtureId: id,
    label: fixture.data.label ?? "",
    costUsd: sumMatchCosts(result, calculateLlmCostUsd),
    statementCount: Array.isArray(result?.qcCards) ? result.qcCards.length : 0,
    stage1Source: result?.stage1?.source ?? null,
    cards: compactCards(id, result),
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
    console.log(`pass ${pass} F${id} starting remaining=${(remaining - spent).toFixed(4)}`);
    const row = await runOneFixture(fixture, runPipelineV4, calculateLlmCostUsd);
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
  const payload = {
    pass: Number(pass),
    range: "01-20",
    cache: "off",
    editorialEnabled: false,
    complianceEnabled: false,
    skipCommentary: true,
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
