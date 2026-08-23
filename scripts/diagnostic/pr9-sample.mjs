#!/usr/bin/env node
/**
 * Pr9 throwaway diagnostic — build prompt → writing-rewrite LLM (temp 0) →
 * parse/normalize with the same pure helpers the endpoint uses.
 * Prints RAW model output (pre-parse), revisedDraft, and markers per fixture.
 *
 * Usage:
 *   node scripts/diagnostic/pr9-sample.mjs
 *
 * Requires OPENAI_API_KEY (loaded from .env.local / .env). No API server needed.
 */

import { loadLocalEnvFiles } from "./lib/env.mjs";

loadLocalEnvFiles();

const { callLLM, flushObservability, hasProviderApiKey } = await import("../../lib/observability.js");
const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");
const {
  gatherConcerns,
  buildPublicationMap,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
} = await import("../../lib/build-revision-prompt.mjs");
const { PR9_FIXTURES } = await import("./pr9-fixtures.mjs");

const modelConfig = STAGE_MODELS["writing-rewrite"];
if (!hasProviderApiKey(modelConfig.provider)) {
  console.error(`[pr9-sample] Missing API key for provider ${modelConfig.provider}`);
  process.exit(1);
}

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

async function runFixture(fixture) {
  const publicationMap = buildPublicationMap(fixture.sources);
  const concerns = gatherConcerns(fixture.statements, publicationMap);
  const prompt = buildRevisionPrompt(fixture.draftText, concerns, {
    outputType: fixture.outputType,
    requiredVersion: fixture.requiredVersion,
  });

  console.log(`\n${"=".repeat(72)}`);
  console.log(fixture.label);
  console.log("=".repeat(72));
  console.log(`[pr9-sample] concerns: ${concerns.length}`);
  console.log(`[pr9-sample] model: ${modelConfig.provider}/${modelConfig.model} temp=0`);

  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
    traceName: "suggest-revision-diag",
    spanName: "suggest-revision-diag",
    metadata: {
      route: "pr9-sample",
      fixture: fixture.label,
      concernCount: concerns.length,
    },
  });

  const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
  if (!raw.trim()) {
    console.error("[pr9-sample] EMPTY raw completion");
    return { ok: false };
  }

  const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);

  console.log("\n——— RAW (pre-parse, delimiters intact) ———\n");
  console.log(raw);
  console.log("\n——— revisedDraft (clean) ———\n");
  console.log(revisedDraft);
  console.log("\n——— markers ———\n");
  if (markers.length === 0) {
    console.log("(none)");
  } else {
    for (const m of markers) {
      console.log(`[${m.start},${m.end}] ${m.note}`);
    }
  }
  console.log("\n——— end fixture ———\n");

  return { ok: true, raw, revisedDraft, markers };
}

const fixtures = PR9_FIXTURES;
let failed = 0;

try {
  for (const fixture of fixtures) {
    const result = await runFixture(fixture);
    if (!result.ok) failed += 1;
  }
} finally {
  await flushObservability();
}

if (failed > 0) {
  console.error(`[pr9-sample] ${failed}/${fixtures.length} fixture(s) failed`);
  process.exit(1);
}

console.log(`[pr9-sample] done — ${fixtures.length} fixtures`);
