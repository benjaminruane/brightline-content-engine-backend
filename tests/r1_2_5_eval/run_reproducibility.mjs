#!/usr/bin/env node
/**
 * R1.2.5.3 — gpt-5-mini reproducibility across 3 runs.
 *
 * Run:
 *   node tests/r1_2_5_eval/run_reproducibility.mjs
 *
 * Report-only (no API calls):
 *   node tests/r1_2_5_eval/run_reproducibility.mjs --report-only
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { callLLM, calculateLlmCostUsd, createTraceId, flushObservability } from "../../lib/observability.js";
import { buildStage2UserPrompt, parseStage2Response, ALLOWED_CLASSIFICATIONS } from "../r1_2_mini_eval/stage2_eval_mirror.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = __dirname;
const LOCKED_DIR = join(__dirname, "..", "r1_2_mini_eval");
const INPUTS_PATH = join(LOCKED_DIR, "inputs.json");
const PROMPT_V2_PATH = join(LOCKED_DIR, "prompts", "stage2_v2.md");
const RUN1_PATH = join(DIR, "openai_gpt5mini_outputs.json");
const RUN2_PATH = join(DIR, "openai_gpt5mini_outputs_run2.json");
const RUN3_PATH = join(DIR, "openai_gpt5mini_outputs_run3.json");
const REPORT_PATH = join(DIR, "results_reproducibility.md");
const GT_CONFLICT_IDS = new Set(["P01", "P04", "P27", "P30", "P47"]);

const TARGET = {
  provider: "openai",
  model: "gpt-5-mini",
  temperature: 1,
};

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveJson(path, data) {
  const sorted = [...data].sort((a, b) => String(a.pairId).localeCompare(String(b.pairId)));
  writeFileSync(path, JSON.stringify(sorted, null, 2), "utf8");
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function predictionLabel(row) {
  if (!row || row.schema_valid === false || !ALLOWED_CLASSIFICATIONS.has(row.classification)) return "schema_fail";
  return row.classification;
}

async function callOnePair(pair, systemPrompt, runNumber) {
  const traceId = createTraceId();
  const userPrompt = buildStage2UserPrompt(pair.statement, pair.sourceText);

  async function attempt() {
    const response = await callLLM({
      provider: TARGET.provider,
      model: TARGET.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: TARGET.temperature,
      responseFormat: "json",
      traceId,
      traceName: "r1.2.5-stage2-eval",
      spanName: "qc-stage2-source-matching",
      metadata: {
        eval: "r1.2.5.3-reproducibility",
        run: runNumber,
        pairId: String(pair.pairId),
      },
    });
    const normalized = parseStage2Response(response?.text ?? "", pair.sourceText);
    return { response, normalized };
  }

  let retried = false;
  let { response, normalized } = await attempt();
  if (!normalized) {
    retried = true;
    const second = await attempt();
    response = second.response;
    normalized = second.normalized;
  }

  const usage = response?.usage ?? { inputTokens: 0, outputTokens: 0 };
  const costUsd = calculateLlmCostUsd(TARGET.provider, TARGET.model, usage);

  if (normalized) {
    return {
      pairId: pair.pairId,
      classification: normalized.classification,
      passage: normalized.passage,
      explanation: normalized.explanation,
      raw_response: response?.text ?? "",
      schema_valid: true,
      retried,
      latencyMs: response?.latencyMs ?? 0,
      usage,
      costUsd,
      provider: response?.provider ?? TARGET.provider,
      model: response?.model ?? TARGET.model,
    };
  }

  return {
    pairId: pair.pairId,
    classification: "schema_validation_failed",
    passage: "",
    explanation: "",
    raw_response: response?.text ?? "",
    schema_valid: false,
    retried,
    latencyMs: response?.latencyMs ?? 0,
    usage,
    costUsd,
    provider: response?.provider ?? TARGET.provider,
    model: response?.model ?? TARGET.model,
  };
}

async function runAdditionalRun(pairs, runNumber, outputPath, systemPrompt) {
  const existing = existsSync(outputPath) ? loadJson(outputPath) : [];
  const byId = new Map(existing.map((row) => [String(row.pairId), row]));
  const missing = pairs.filter((p) => !byId.has(String(p.pairId)));
  if (missing.length === 0) {
    console.log(`[r1.2.5.3] run${runNumber} complete (${existing.length}/${pairs.length})`);
    return existing;
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error(`[r1.2.5.3] run${runNumber} missing OPENAI_API_KEY for remaining ${missing.length} pairs`);
  }

  const rows = [...existing];
  for (let i = 0; i < missing.length; i += 1) {
    const pair = missing[i];
    process.stdout.write(`\r[r1.2.5.3] run${runNumber}: ${i + 1}/${missing.length} (${pair.pairId})`);
    const row = await callOnePair(pair, systemPrompt, runNumber);
    rows.push(row);
    saveJson(outputPath, rows);
  }
  process.stdout.write("\n");
  return rows;
}

function scoreRun(pairs, rows) {
  const byId = new Map(rows.map((r) => [String(r.pairId), r]));
  let agree = 0;
  for (const pair of pairs) {
    const pred = predictionLabel(byId.get(String(pair.pairId)));
    if (pred === pair.gt_classification) agree += 1;
  }
  return { agree, total: pairs.length, rate: pairs.length ? agree / pairs.length : 0, byId };
}

function costOfRow(row) {
  if (!row) return 0;
  if (Number.isFinite(Number(row.costUsd))) return Number(row.costUsd);
  return calculateLlmCostUsd(TARGET.provider, TARGET.model, row.usage ?? null);
}

function buildReport(pairs, run1Rows, run2Rows, run3Rows) {
  const run1 = scoreRun(pairs, run1Rows);
  const run2 = scoreRun(pairs, run2Rows);
  const run3 = scoreRun(pairs, run3Rows);

  const unstable = [];
  let stableCount = 0;
  let stableConflictAtConflicting = 0;

  const lines = [];
  lines.push("# R1.2.5.3 — gpt-5-mini reproducibility", "");
  lines.push(`Generated: ${new Date().toISOString()}`, "");

  lines.push("## Per-run Agreement vs GT", "");
  lines.push("| Run | Provider | Model | Temperature | Agreement |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(`| Run 1 | ${TARGET.provider} | ${TARGET.model} | ${TARGET.temperature} | ${(run1.rate * 100).toFixed(2)}% (${run1.agree}/${run1.total}) |`);
  lines.push(`| Run 2 | ${TARGET.provider} | ${TARGET.model} | ${TARGET.temperature} | ${(run2.rate * 100).toFixed(2)}% (${run2.agree}/${run2.total}) |`);
  lines.push(`| Run 3 | ${TARGET.provider} | ${TARGET.model} | ${TARGET.temperature} | ${(run3.rate * 100).toFixed(2)}% (${run3.agree}/${run3.total}) |`);
  lines.push("");

  lines.push("## Pair Stability (47 pairs)", "");
  lines.push("| PairId | GT | Run 1 | Run 2 | Run 3 | Stable? |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const pair of pairs) {
    const p1 = predictionLabel(run1.byId.get(String(pair.pairId)));
    const p2 = predictionLabel(run2.byId.get(String(pair.pairId)));
    const p3 = predictionLabel(run3.byId.get(String(pair.pairId)));
    const stable = p1 === p2 && p2 === p3 && p1 !== "schema_fail";
    if (stable) stableCount += 1;
    if (GT_CONFLICT_IDS.has(String(pair.pairId)) && stable && p1 === "conflicting") {
      stableConflictAtConflicting += 1;
    }
    if (!stable) {
      unstable.push({
        pairId: pair.pairId,
        gt: pair.gt_classification,
        run1: p1,
        run2: p2,
        run3: p3,
      });
    }
    lines.push(`| ${pair.pairId} | ${pair.gt_classification} | ${p1} | ${p2} | ${p3} | ${stable ? "yes" : "no"} |`);
  }
  lines.push("");

  const unstableCount = pairs.length - stableCount;
  lines.push("## Stability Summary", "");
  lines.push(`- Stable pairs: **${stableCount}/${pairs.length}**`);
  lines.push(`- Unstable pairs: **${unstableCount}/${pairs.length}**`);
  lines.push(
    `- Conflict-pair stability at conflicting: **${stableConflictAtConflicting}/${GT_CONFLICT_IDS.size}** (GT-conflicting pairs stable across all 3 runs at \`conflicting\`)`
  );
  lines.push("");

  lines.push("## Unstable Pairs", "");
  if (unstable.length === 0) {
    lines.push("_None._", "");
  } else {
    for (const u of unstable) {
      const agreed = [];
      if (u.run1 === u.gt) agreed.push("run1");
      if (u.run2 === u.gt) agreed.push("run2");
      if (u.run3 === u.gt) agreed.push("run3");
      const agreedText = agreed.length ? agreed.join(", ") : "none";
      lines.push(`- **${u.pairId}**: GT=\`${u.gt}\`; run1=\`${u.run1}\`, run2=\`${u.run2}\`, run3=\`${u.run3}\`; runs matching GT: ${agreedText}`);
    }
    lines.push("");
  }

  const allRows = [...run1Rows, ...run2Rows, ...run3Rows];
  const totalCost = allRows.reduce((sum, row) => sum + costOfRow(row), 0);
  const latencies = allRows
    .map((row) => Number(row?.latencyMs))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const latencySum = latencies.reduce((a, b) => a + b, 0);
  lines.push("## Cost and Latency", "");
  lines.push(`- Total cost across all 3 runs: **$${totalCost.toFixed(4)}**`);
  lines.push(`- Total latency sum across all calls: **${latencySum} ms**`);
  lines.push(`- Latency p50 across all calls: **${Math.round(percentile(latencies, 50))} ms**`);
  lines.push(`- Latency p95 across all calls: **${Math.round(percentile(latencies, 95))} ms**`);
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
}

async function main() {
  const reportOnly = process.argv.includes("--report-only");
  const inputs = loadJson(INPUTS_PATH);
  const pairs = Array.isArray(inputs?.pairs) ? inputs.pairs : [];
  if (pairs.length !== 47) throw new Error("Expected locked 47-pair inputs.json");
  const systemPrompt = readFileSync(PROMPT_V2_PATH, "utf8").trim();

  const run1Rows = existsSync(RUN1_PATH) ? loadJson(RUN1_PATH) : [];
  if (run1Rows.length !== 47) {
    throw new Error(`Missing/incomplete run1 file: ${RUN1_PATH} (expected 47 rows, got ${run1Rows.length})`);
  }

  let run2Rows = existsSync(RUN2_PATH) ? loadJson(RUN2_PATH) : [];
  let run3Rows = existsSync(RUN3_PATH) ? loadJson(RUN3_PATH) : [];

  if (!reportOnly) {
    run2Rows = await runAdditionalRun(pairs, 2, RUN2_PATH, systemPrompt);
    run3Rows = await runAdditionalRun(pairs, 3, RUN3_PATH, systemPrompt);
    await flushObservability();
  }

  if (run2Rows.length !== 47 || run3Rows.length !== 47) {
    throw new Error(
      `Cannot build reproducibility report until run2/run3 are complete (run2=${run2Rows.length}, run3=${run3Rows.length})`
    );
  }

  buildReport(pairs, run1Rows, run2Rows, run3Rows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
