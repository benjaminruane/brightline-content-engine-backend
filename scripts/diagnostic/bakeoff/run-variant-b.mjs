#!/usr/bin/env node
/**
 * Variant B: whole-context fault finder. Cache off. gpt-4o temp 0 seed 1.
 * Does not send the frozen statement list or the four labels.
 *
 *   node scripts/diagnostic/bakeoff/run-variant-b.mjs --pass 1
 *   node scripts/diagnostic/bakeoff/run-variant-b.mjs --estimate
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import {
  MODEL,
  buildVariantBUser,
  estimateFourRunsUsd,
  loadFixtureContexts,
  loadPrompt,
  parseJsonObject,
} from "./load-context.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CEILING_USD = 15;

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const argv = process.argv.slice(2);
  const estimateOnly = argv.includes("--estimate");
  const passIdx = argv.indexOf("--pass");
  const pass = passIdx >= 0 ? String(argv[passIdx + 1] || "1") : "1";

  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
    "../../../lib/observability.js"
  );
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");

  const contexts = await loadFixtureContexts();
  const promptA = await loadPrompt("variant-a.md");
  const promptB = await loadPrompt("variant-b.md");
  const estimate = estimateFourRunsUsd(contexts, promptA, promptB);
  console.log(
    `estimate four-runs USD ${estimate.fourRuns.toFixed(4)} (A ${estimate.onePassA.toFixed(4)} / B ${estimate.onePassB.toFixed(4)}) ceiling ${CEILING_USD}`
  );
  if (estimate.fourRuns > CEILING_USD) {
    throw new Error(`Estimate ${estimate.fourRuns.toFixed(4)} exceeds ceiling ${CEILING_USD}. Stopping.`);
  }
  if (estimateOnly) return;

  if (!hasProviderApiKey("openai")) throw new Error("OPENAI_API_KEY required");

  const t0 = Date.now();
  const fixturesOut = [];
  let spent = 0;
  for (const fx of contexts) {
    console.log(`variant-b pass ${pass} F${fx.fixtureId}`);
    const res = await callLLM({
      provider: "openai",
      model: MODEL,
      temperature: 0,
      seed: 1,
      responseFormat: "json",
      spanName: `bakeoff-b-${fx.fixtureId}-p${pass}`,
      messages: [
        { role: "system", content: promptB },
        { role: "user", content: buildVariantBUser(fx) },
      ],
    });
    const cost = calculateLlmCostUsd("openai", MODEL, res.usage);
    spent += cost;
    if (spent > CEILING_USD) throw new Error(`Spent ${spent.toFixed(4)} exceeds ceiling. Stopping.`);
    let parsed;
    try {
      parsed = parseJsonObject(res.text);
    } catch (err) {
      parsed = { findings: [], parseError: String(err.message || err) };
    }
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map((f) => ({
      draftQuote: typeof f.draftQuote === "string" ? f.draftQuote : "",
      problem: typeof f.problem === "string" ? f.problem : "",
      sourceIndex: Number.isFinite(f.sourceIndex) ? f.sourceIndex : 0,
      evidenceQuote: typeof f.evidenceQuote === "string" ? f.evidenceQuote : "",
      issueClass: typeof f.issueClass === "string" ? f.issueClass : "",
      betweenDraftSentences: f.betweenDraftSentences === true,
    }));
    fixturesOut.push({
      fixtureId: fx.fixtureId,
      label: fx.label,
      costUsd: cost,
      usage: res.usage || null,
      sources: fx.sources.map((s) => ({ index: s.index, label: s.label, text: s.text })),
      findings,
      rawText: res.text,
    });
  }

  const outDir = path.join(__dirname, "runs");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `variant-b-pass-${pass}.json`);
  const doc = {
    variant: "B",
    pass,
    model: MODEL,
    temperature: 0,
    seed: 1,
    cache: "off",
    ranAt: new Date().toISOString(),
    wallClockMs: Date.now() - t0,
    costUsd: spent,
    estimate,
    fixtures: fixturesOut,
  };
  await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${outPath} costUsd=${spent.toFixed(4)} wallClockMs=${doc.wallClockMs}`);
  await flushObservability();
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
