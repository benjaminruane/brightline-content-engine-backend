#!/usr/bin/env node
/**
 * Stage 2: three runs of arm one, three of arm two, r10-review1 ACTION findings.
 * Throwaway. Does not import the abandoned per-statement prompt or validator.
 * Does not call findingRestsOnSilence.
 *
 * Usage: node scripts/diagnostic/revise/per-finding-action-list/stage2-run.mjs
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
const { ARTEFACTS, inventoryArtefact } = await import("./inventory.mjs");
const { buildArmOnePrompt, buildArmTwoPrompt, parseJsonObject, decisionVerb } = await import(
  "./prompt.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = path.join(__dirname, "..");
const TARGET_STEM = "r10-review1";
const RUNS = 3;
const COST_CEILING_USD = 1;
const ARM_ONE_IN = 2500;
const ARM_ONE_OUT = 400;
const ARM_TWO_IN = 7000;
const ARM_TWO_OUT = 1600;
const AUTHORING = "Halden Group";

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

function scoreArmTwo(expectedIds, returned) {
  const E = expectedIds.slice();
  const counts = new Map();
  const extras = [];
  const unissued = [];
  const parsedRows = [];
  for (const row of returned) {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id) {
      extras.push({ reason: "no_id", row });
      continue;
    }
    if (!E.includes(id)) {
      extras.push({ reason: "unissued", id, row });
      unissued.push(id);
      continue;
    }
    counts.set(id, (counts.get(id) || 0) + 1);
    parsedRows.push(row);
  }
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
  const missing = E.filter((id) => !counts.has(id));
  const legal = parsedRows.filter((r) => E.includes(r.id));
  return {
    expectedCount: E.length,
    returnedCount: returned.length,
    legalCount: legal.length,
    extra: extras,
    unissued,
    duplicates,
    missing,
  };
}

const spec = ARTEFACTS.find((a) => a.stem === TARGET_STEM);
const raw = JSON.parse(await readFile(path.join(REVISE_DIR, spec.file), "utf8"));
const artefact = inventoryArtefact(spec.stem, spec.file, raw.payload);
const action = artefact.findings.filter((f) => f.disposition === "ACTION");
const expectedIds = action.map((f) => f.id);

const modelConfig = STAGE_MODELS["writing-rewrite"];
const armOneCalls = action.length * RUNS;
const armTwoCalls = RUNS;
const preflightUsd =
  armOneCalls *
    calculateLlmCostUsd(modelConfig.provider, modelConfig.model, {
      inputTokens: ARM_ONE_IN,
      outputTokens: ARM_ONE_OUT,
      cachedInputTokens: 0,
    }) +
  armTwoCalls *
    calculateLlmCostUsd(modelConfig.provider, modelConfig.model, {
      inputTokens: ARM_TWO_IN,
      outputTokens: ARM_TWO_OUT,
      cachedInputTokens: 0,
    });

const preflight = {
  file: spec.file,
  actionCount: action.length,
  expectedIds,
  runs: RUNS,
  armOneCalls,
  armTwoCalls,
  totalCalls: armOneCalls + armTwoCalls,
  preflightUsd,
  costCeilingUsd: COST_CEILING_USD,
};

console.log(JSON.stringify({ preflight }, null, 2));

if (preflightUsd >= COST_CEILING_USD) {
  await writeFile(path.join(__dirname, "stage2-preflight.json"), `${JSON.stringify({ ok: false, preflight }, null, 2)}\n`);
  console.error("STOP: pre-flight at or above one dollar");
  process.exit(0);
}

if (!hasProviderApiKey(modelConfig.provider)) {
  console.error("Missing provider API key for writing-rewrite");
  process.exit(1);
}

const armOne = [];
const armTwo = [];
let armOneUsd = 0;
let armTwoUsd = 0;

for (let run = 1; run <= RUNS; run++) {
  const runRows = [];
  for (const finding of action) {
    const result = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      messages: [
        { role: "system", content: "You return only the JSON object requested. No markdown." },
        { role: "user", content: buildArmOnePrompt(finding, AUTHORING) },
      ],
      temperature: 0,
      seed: 1,
      responseFormat: "json",
      traceName: "per-finding-action-list-stage2",
      spanName: "arm-one",
      metadata: { findingId: finding.id, arm: "one", run },
    });
    const cost = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, result.usage);
    armOneUsd += cost;
    const parsed = parseJsonObject(result.text);
    const proposedChange =
      parsed && typeof parsed.proposedChange === "string" ? parsed.proposedChange : null;
    const why = parsed && typeof parsed.why === "string" ? parsed.why : null;
    runRows.push({
      arm: "one",
      run,
      findingId: finding.id,
      kind: finding.kind,
      rule: finding.rule,
      statementId: finding.statementId,
      proposedChange,
      why,
      decisionVerb: decisionVerb(proposedChange),
      rawText: result.text,
      parseOk: Boolean(proposedChange && why),
      conditions: conditions(result, cost),
    });
  }
  armOne.push({ run, rows: runRows });
}

for (let run = 1; run <= RUNS; run++) {
  const result = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    messages: [
      { role: "system", content: "You return only the JSON object requested. No markdown." },
      { role: "user", content: buildArmTwoPrompt(action, AUTHORING) },
    ],
    temperature: 0,
    seed: 1,
    responseFormat: "json",
    traceName: "per-finding-action-list-stage2",
    spanName: "arm-two",
    metadata: { arm: "two", run },
  });
  const cost = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, result.usage);
  armTwoUsd += cost;
  const parsed = parseJsonObject(result.text);
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const keyScore = scoreArmTwo(expectedIds, actions);
  const rows = actions.map((row) => {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    const proposedChange = typeof row?.proposedChange === "string" ? row.proposedChange : null;
    const why = typeof row?.why === "string" ? row.why : null;
    const finding = action.find((f) => f.id === id);
    return {
      arm: "two",
      run,
      findingId: id || null,
      kind: finding?.kind ?? null,
      rule: finding?.rule ?? null,
      statementId: finding?.statementId ?? null,
      proposedChange,
      why,
      decisionVerb: decisionVerb(proposedChange),
      legal: expectedIds.includes(id),
    };
  });
  armTwo.push({
    run,
    keyScore,
    rows,
    rawText: result.text,
    parseOk: Boolean(parsed && Array.isArray(parsed.actions)),
    conditions: conditions(result, cost),
  });
}

await flushObservability();

const out = {
  ranAt: new Date().toISOString(),
  preflight,
  actual: {
    armOneCalls,
    armTwoCalls,
    armOneUsd,
    armTwoUsd,
    totalUsd: armOneUsd + armTwoUsd,
  },
  armOne,
  armTwo,
};

await writeFile(path.join(__dirname, "stage2-runs.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      ok: true,
      preflightUsd: preflight.preflightUsd,
      actual: out.actual,
      armTwoKeys: armTwo.map((r) => ({
        run: r.run,
        legalCount: r.keyScore.legalCount,
        extra: r.keyScore.extra.length,
        missing: r.keyScore.missing,
        duplicates: r.keyScore.duplicates,
        unissued: r.keyScore.unissued,
      })),
    },
    null,
    2
  )
);
