#!/usr/bin/env node
/**
 * Trim vs untrimmed stage2_v4.md on E1 only. Six calls, cache OFF.
 * Usage: node scripts/diagnostic/eval-ablation/run-trim-test.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";
import { fingerprintFromCompletion } from "./fingerprint.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const MERIDIAN_PATH = path.join(__dirname, "meridian_source_production.txt");
const STAGE2_SEED = 1;
const STATEMENT =
  "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.";

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function safeJsonParse(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function matchOnce(systemPrompt, runIndex, variantId) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const userPrompt = `Statement:
${STATEMENT}

Source:
${meridian}`.trim();

  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    traceName: "diag-eval-ablation-trim-test",
    spanName: "stage2-trim-test",
    metadata: { variantId, runIndex },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  return {
    classification: typeof parsed?.classification === "string" ? parsed.classification.trim() : null,
    explanation: typeof parsed?.explanation === "string" ? parsed.explanation : null,
    systemFingerprint: fingerprintFromCompletion(completion),
    costUsd: Number(calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage)) || 0,
    usage: {
      inputTokens: Number(completion?.usage?.inputTokens) || 0,
      outputTokens: Number(completion?.usage?.outputTokens) || 0,
    },
  };
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) throw new Error("missing API key");

  const raw = await readFile(STAGE2_PROMPT_PATH, "utf8");
  const untrimmed = raw;
  const trimmed = raw.trim();
  if (untrimmed === trimmed) throw new Error("file has no trim difference; test vacuous");
  if (trimmed !== untrimmed.trim()) throw new Error("trim mismatch");

  const variants = {
    "A2-untrimmed": untrimmed,
    "A2-trimmed": trimmed,
  };
  const meta = {};
  for (const [id, p] of Object.entries(variants)) {
    meta[id] = { length: p.length, sha256: sha256(p) };
    console.log(`${id}  ${meta[id].length}  ${meta[id].sha256}`);
  }

  const rows = [];
  let totalCost = 0;
  for (const vid of ["A2-untrimmed", "A2-trimmed"]) {
    for (let run = 1; run <= 3; run++) {
      process.stdout.write(`${vid} r${run} `);
      const r = await matchOnce(variants[vid], run, vid);
      totalCost += r.costUsd;
      rows.push({ variantId: vid, run, ...r });
      console.log(`${r.classification} fp=${r.systemFingerprint || "null"}`);
    }
  }

  const out = {
    meta: {
      probe: "stage2-trim-test",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      promptMeta: meta,
      totalCostUsd: totalCost,
      ranAt: new Date().toISOString(),
    },
    rows,
  };
  const outDir = path.join(DIAG_ROOT, "eval-ablation");
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "trim-test-rows.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`cost $${totalCost.toFixed(6)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
