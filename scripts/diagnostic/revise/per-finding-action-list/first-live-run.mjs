#!/usr/bin/env node
/**
 * First live run of the shipped per-finding action list.
 * Three passes of the stored r10-review1 card through runActionList.
 * Does not set REVISE_ACTION_LIST. Does not call the HTTP route.
 * Does not import the old reviser, Stage 1 prompt, or diagnostic inventory.
 *
 * Usage: node scripts/diagnostic/revise/per-finding-action-list/first-live-run.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../../lib/qc/model-config.mjs");
const { runActionList } = await import("../../../../lib/revise-actions/run.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARD_PATH = path.join(__dirname, "..", "suggest-after-r10-review1.json");
const OUT_PATH = path.join(__dirname, "first-live-run.json");
const RUNS = 3;
const COST_CEILING_USD = 1;
const PREFLIGHT_IN = 2000;
const PREFLIGHT_OUT = 400;
const AUTHORING = "Halden Group";
const EXPECTED_ACTION_IDS = [
  "S1:editorial:voice_consistency:1",
  "S4:evidence:conflicting:0",
  "S7:editorial:voice_consistency:0",
  "S8:editorial:first_person_plural:0",
];

const modelConfig = STAGE_MODELS["writing-rewrite"];
const json = JSON.parse(await readFile(CARD_PATH, "utf8"));
const statements = json?.payload?.statements ?? [];

const preflightUsd =
  EXPECTED_ACTION_IDS.length *
  RUNS *
  calculateLlmCostUsd(modelConfig.provider, modelConfig.model, {
    inputTokens: PREFLIGHT_IN,
    outputTokens: PREFLIGHT_OUT,
    cachedInputTokens: 0,
  });

const preflight = {
  file: "suggest-after-r10-review1.json",
  route: "lib/revise-actions/run.mjs runActionList",
  notExercised: [
    "api/revise-actions.js flag gate (404 when off)",
    "CORS and OPTIONS",
    "405 method",
    "400 missing statements",
    "500 missing provider key",
    "Vercel maxDuration 60s",
    "string-body JSON parse",
  ],
  expectedActionIds: EXPECTED_ACTION_IDS,
  runs: RUNS,
  expectedCalls: EXPECTED_ACTION_IDS.length * RUNS,
  preflightUsd,
  costCeilingUsd: COST_CEILING_USD,
};

console.log(JSON.stringify({ preflight }, null, 2));

if (preflightUsd >= COST_CEILING_USD) {
  console.error("STOP: pre-flight at or above one dollar");
  process.exit(1);
}

if (!hasProviderApiKey(modelConfig.provider)) {
  console.error("Missing provider API key for writing-rewrite");
  process.exit(1);
}

function conditions(result, costUsd) {
  return {
    provider: result.provider,
    model: result.model,
    temperature: 0,
    seed: 1,
    latencyMs: result.latencyMs,
    usage: result.usage,
    costUsd,
    systemFingerprint:
      result.raw && typeof result.raw === "object" ? result.raw.system_fingerprint ?? null : null,
  };
}

const callLedger = [];

async function callModel(prompt, meta) {
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0,
    seed: 1,
    responseFormat: "json",
    messages: [{ role: "user", content: prompt }],
    traceName: `revise-actions-${meta.id}`,
    spanName: `revise-actions-${meta.id}`,
    metadata: { route: "revise-actions", findingId: meta.id, diagnostic: "first-live-run" },
  });
  const costUsd = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, completion.usage);
  callLedger.push({
    findingId: meta.id,
    costUsd,
    conditions: conditions(completion, costUsd),
  });
  return { text: completion?.text ?? "" };
}

const runs = [];
for (let run = 1; run <= RUNS; run++) {
  const before = callLedger.length;
  const result = await runActionList(statements, {
    authoringOrganisation: AUTHORING,
    callModel,
  });
  const calls = callLedger.slice(before);
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  const action = entries.filter((e) => e.disposition === "ACTION");
  const acknowledge = entries.filter((e) => e.disposition === "ACKNOWLEDGE");
  runs.push({
    run,
    ok: result?.ok === true,
    actionIds: action.map((e) => e.id),
    actionCount: action.length,
    acknowledgeCount: acknowledge.length,
    callCount: calls.length,
    callUsd: calls.reduce((sum, c) => sum + (c.costUsd || 0), 0),
    calls,
    entries,
  });
}

await flushObservability();

const totalUsd = callLedger.reduce((sum, c) => sum + (c.costUsd || 0), 0);
const out = {
  ranAt: new Date().toISOString(),
  preflight,
  actual: {
    runs: RUNS,
    calls: callLedger.length,
    totalUsd,
  },
  runs,
};

await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      ok: true,
      outPath: OUT_PATH,
      preflightUsd: preflight.preflightUsd,
      actual: out.actual,
      perRun: runs.map((r) => ({
        run: r.run,
        actionCount: r.actionCount,
        actionIds: r.actionIds,
        acknowledgeCount: r.acknowledgeCount,
        callCount: r.callCount,
        callUsd: r.callUsd,
      })),
    },
    null,
    2
  )
);
