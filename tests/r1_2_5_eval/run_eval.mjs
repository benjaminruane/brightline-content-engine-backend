#!/usr/bin/env node
/**
 * R1.2.5 — Stage 2 model/provider comparison on locked 47-pair eval.
 *
 * Usage:
 *   node tests/r1_2_5_eval/run_eval.mjs
 *   node tests/r1_2_5_eval/run_eval.mjs --score-only
 *
 * Env:
 *   R1_2_5_SCORE_ONLY=1  -> score-only mode
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  callLLM,
  calculateLlmCostUsd,
  createTraceId,
  flushObservability,
  hasProviderApiKey,
} from "../../lib/observability.js";
import {
  ALLOWED_CLASSIFICATIONS,
  buildStage2UserPrompt,
  parseStage2Response,
} from "../r1_2_mini_eval/stage2_eval_mirror.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = __dirname;
const LOCKED_DIR = join(__dirname, "..", "r1_2_mini_eval");
const INPUTS_PATH = join(LOCKED_DIR, "inputs.json");
const PROMPT_V2_PATH = join(LOCKED_DIR, "prompts", "stage2_v2.md");
const RESULTS_PATH = join(DIR, "results.md");

const CLASS_ORDER = ["confirmed", "partially_confirmed", "conflicting", "no_support"];
const GT_CONFLICT_PAIR_IDS = new Set(["P01", "P04", "P27", "P30", "P47"]);
const LOCKED_GT_VS_GPT4O_MISMATCH_IDS = ["P04", "P27", "P29", "P30", "P33", "P44", "P47"];
const BASELINE_AGREEMENT_RATE = 46 / 47;
const AGREEMENT_FLOOR = BASELINE_AGREEMENT_RATE - 0.02;
const PROD_STAGE2_CALLS_PER_RUN = 75; // 25 statements x 3 sources

function validateLockedReferenceStats(pairs) {
  if (!Array.isArray(pairs) || pairs.length !== 47) return;
  const mismatches = [];
  for (const pair of pairs) {
    if (pair?.gt_classification !== pair?.gpt4o_classification) mismatches.push(String(pair?.pairId));
  }
  mismatches.sort();
  const expected = [...LOCKED_GT_VS_GPT4O_MISMATCH_IDS].sort();
  const ok = mismatches.length === expected.length && mismatches.every((id, idx) => id === expected[idx]);
  if (!ok) {
    throw new Error(
      `Locked sanity: GT vs gpt4o mismatch pairs expected [${expected.join(", ")}], got [${mismatches.join(", ")}]`
    );
  }
  const agree = pairs.filter((pair) => pair?.gt_classification === pair?.gpt4o_classification).length;
  if (agree !== 40) {
    throw new Error(`Locked sanity: expected 40 agreements between gpt4o_classification and GT, got ${agree}`);
  }
}

const CANDIDATES = [
  {
    id: "openai_gpt4o",
    provider: "openai",
    model: "gpt-4o",
    temperature: 0,
    outputFile: "openai_gpt4o_outputs.json",
    label: "openai / gpt-4o",
  },
  {
    id: "openai_gpt5",
    provider: "openai",
    model: "gpt-5",
    temperature: 1,
    outputFile: "openai_gpt5_outputs.json",
    label: "openai / gpt-5",
  },
  {
    id: "openai_gpt5mini",
    provider: "openai",
    model: "gpt-5-mini",
    temperature: 1,
    outputFile: "openai_gpt5mini_outputs.json",
    label: "openai / gpt-5-mini",
  },
  {
    id: "anthropic_sonnet46",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0,
    outputFile: "anthropic_sonnet46_outputs.json",
    label: "anthropic / claude-sonnet-4-6",
  },
  {
    id: "anthropic_haiku45",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    temperature: 0,
    outputFile: "anthropic_haiku45_outputs.json",
    label: "anthropic / claude-haiku-4-5",
  },
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadPromptV2() {
  return readFileSync(PROMPT_V2_PATH, "utf8").trim();
}

function outputPathFor(candidate) {
  return join(DIR, candidate.outputFile);
}

function loadCandidateRows(candidate) {
  const path = outputPathFor(candidate);
  if (!existsSync(path)) return [];
  const parsed = loadJson(path);
  return Array.isArray(parsed) ? parsed : [];
}

function saveCandidateRows(candidate, rows) {
  const path = outputPathFor(candidate);
  const sorted = [...rows].sort((a, b) => String(a.pairId).localeCompare(String(b.pairId)));
  writeFileSync(path, JSON.stringify(sorted, null, 2), "utf8");
}

function isValidClassification(value) {
  return ALLOWED_CLASSIFICATIONS.has(value);
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function emptyMatrix() {
  const matrix = {};
  for (const gt of CLASS_ORDER) {
    matrix[gt] = {};
    for (const pred of CLASS_ORDER) matrix[gt][pred] = 0;
  }
  return matrix;
}

function formatMatrix(matrix) {
  const header = `| GT \\\\ Pred | ${CLASS_ORDER.join(" | ")} |`;
  const sep = `| --- | ${CLASS_ORDER.map(() => "---").join(" | ")} |`;
  const rows = CLASS_ORDER.map(
    (gt) => `| **${gt}** | ${CLASS_ORDER.map((pred) => matrix[gt][pred]).join(" | ")} |`
  );
  return [header, sep, ...rows].join("\n");
}

function scoreCandidate(pairs, rows, candidate) {
  const byId = new Map(rows.map((row) => [String(row.pairId), row]));
  const matrix = emptyMatrix();
  const disagreements = [];
  const conflictSlips = [];
  let agree = 0;
  let schemaFails = 0;
  let conflictCorrect = 0;
  let conflictTotal = 0;
  let totalCost = 0;
  const latencies = [];
  let retriedCount = 0;

  for (const pair of pairs) {
    const row = byId.get(String(pair.pairId));
    const pred = row?.classification;
    const valid = isValidClassification(pred);
    if (!valid || row?.schema_valid === false) schemaFails += 1;
    if (row?.retried) retriedCount += 1;
    if (typeof row?.latencyMs === "number" && Number.isFinite(row.latencyMs)) latencies.push(row.latencyMs);
    totalCost += Number(row?.costUsd) || 0;

    if (valid && pred === pair.gt_classification) agree += 1;
    if (valid) matrix[pair.gt_classification][pred] += 1;

    if (pred !== pair.gt_classification) {
      disagreements.push({
        pairId: pair.pairId,
        gt: pair.gt_classification,
        predicted: valid ? pred : String(pred || "invalid"),
        explanation: row?.explanation || "",
      });
    }

    if (pair.gt_classification === "conflicting") {
      conflictTotal += 1;
      if (pred === "conflicting") conflictCorrect += 1;
      else {
        conflictSlips.push({
          pairId: pair.pairId,
          gt: pair.gt_classification,
          predicted: valid ? pred : String(pred || "invalid"),
          explanation: row?.explanation || "",
        });
      }
    }
  }

  const agreementRate = agree / pairs.length;
  const conflictRate = conflictTotal > 0 ? conflictCorrect / conflictTotal : 0;
  const avgPerCallCost = pairs.length > 0 ? totalCost / pairs.length : 0;
  const projectionCost = avgPerCallCost * PROD_STAGE2_CALLS_PER_RUN;
  return {
    candidate,
    matrix,
    disagreements,
    conflictSlips,
    agreementRate,
    conflictRate,
    schemaFails,
    retriedCount,
    totalCost,
    avgPerCallCost,
    projectionCost,
    p50Latency: percentile(latencies, 50),
    p95Latency: percentile(latencies, 95),
    byId,
  };
}

async function callOnePair(candidate, pair, systemPrompt) {
  const traceId = createTraceId();
  const userPrompt = buildStage2UserPrompt(pair.statement, pair.sourceText);

  async function attempt() {
    const response = await callLLM({
      provider: candidate.provider,
      model: candidate.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: candidate.temperature,
      responseFormat: "json",
      traceId,
      traceName: "r1.2.5-stage2-eval",
      spanName: "qc-stage2-source-matching",
      metadata: {
        eval: "r1.2.5",
        provider: candidate.provider,
        model: candidate.model,
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
  const costUsd = calculateLlmCostUsd(candidate.provider, candidate.model, usage);

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
      provider: response?.provider ?? candidate.provider,
      model: response?.model ?? candidate.model,
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
    provider: response?.provider ?? candidate.provider,
    model: response?.model ?? candidate.model,
  };
}

async function runCandidate(pairs, candidate, systemPrompt) {
  const existing = loadCandidateRows(candidate);
  const existingById = new Map(existing.map((row) => [String(row.pairId), row]));
  const missingPairs = pairs.filter((pair) => !existingById.has(String(pair.pairId)));
  if (missingPairs.length === 0) {
    console.log(`[r1.2.5] ${candidate.label}: already complete (${existing.length}/${pairs.length}).`);
    return existing;
  }

  if (!hasProviderApiKey(candidate.provider)) {
    throw new Error(`[r1.2.5] ${candidate.label}: missing API key for provider ${candidate.provider}`);
  }

  const rows = [...existing];
  for (let i = 0; i < missingPairs.length; i += 1) {
    const pair = missingPairs[i];
    process.stdout.write(
      `\r[r1.2.5] ${candidate.label}: ${i + 1}/${missingPairs.length} (pair ${pair.pairId})`
    );
    const row = await callOnePair(candidate, pair, systemPrompt);
    rows.push(row);
    saveCandidateRows(candidate, rows);
  }
  process.stdout.write("\n");
  return rows;
}

function recommendationBlock(scoredById) {
  const baseline = scoredById.openai_gpt4o;
  const evaluations = Object.values(scoredById);
  const passing = evaluations.filter(
    (s) => s.conflictRate >= 1 - 1e-9 && s.agreementRate + 1e-9 >= AGREEMENT_FLOOR
  );

  const lines = [];
  lines.push("## Recommendation", "");
  lines.push(
    `Baseline (openai / gpt-4o): ${(baseline.agreementRate * 100).toFixed(2)}% agreement, ${(baseline.conflictRate * 100).toFixed(1)}% conflict detection.`
  );
  lines.push(`Decision thresholds: conflict 4/4 and agreement >= ${(AGREEMENT_FLOOR * 100).toFixed(2)}%.`, "");

  if (passing.length === 0) {
    lines.push("**Recommendation: KEEP gpt-4o + v2.** No candidate passed both criteria.", "");
    lines.push("Failure reasons by candidate:");
    for (const s of evaluations.filter((e) => e.candidate.id !== "openai_gpt4o")) {
      const failedA = s.conflictRate < 1 - 1e-9;
      const failedB = s.agreementRate + 1e-9 < AGREEMENT_FLOOR;
      const reasons = [];
      if (failedA) reasons.push(`conflict ${(s.conflictRate * 100).toFixed(1)}%`);
      if (failedB) reasons.push(`agreement ${(s.agreementRate * 100).toFixed(2)}%`);
      lines.push(`- ${s.candidate.label}: ${reasons.length ? reasons.join("; ") : "passes thresholds"}`);
    }
    return lines;
  }

  passing.sort((a, b) => {
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
    return a.p50Latency - b.p50Latency;
  });
  const winner = passing[0];
  lines.push(
    `**Recommendation: ${winner.candidate.label}.** It satisfies conflict + agreement gates and is the cheapest qualifying candidate (tie-break: p50 latency).`,
    ""
  );
  if (winner.candidate.provider === "anthropic") {
    lines.push(
      "Note: winner is Anthropic. Prompt caching may yield additional savings because Stage 2 repeatedly sends similar source text across calls."
    );
  }
  return lines;
}

function buildResultsMd(pairs, scoredById) {
  const scored = CANDIDATES.map((c) => scoredById[c.id]);
  const baseline = scoredById.openai_gpt4o;

  const lines = [];
  lines.push("# R1.2.5 — Stage 2 model/provider comparison", "");
  lines.push(`Generated: ${new Date().toISOString()}`, "");

  lines.push("## Headline Summary", "");
  lines.push(
    "| Provider | Model | Temperature | Agreement vs GT | Conflict rate | Total cost | p50 latency | p95 latency | Schema fails |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const s of scored) {
    lines.push(
      `| ${s.candidate.provider} | ${s.candidate.model} | ${s.candidate.temperature} | ${(s.agreementRate * 100).toFixed(2)}% | ${(s.conflictRate * 100).toFixed(1)}% (${GT_CONFLICT_PAIR_IDS.size - s.conflictSlips.length}/${GT_CONFLICT_PAIR_IDS.size}) | $${s.totalCost.toFixed(4)} | ${Math.round(s.p50Latency)} ms | ${Math.round(s.p95Latency)} ms | ${s.schemaFails} |`
    );
  }
  lines.push("");
  lines.push(
    "Note: gpt-5 and gpt-5-mini do not support temperature 0 (OpenAI constraint). They were evaluated at temperature 1. Other candidates ran at temperature 0.",
    ""
  );

  lines.push("## Confusion Matrices", "");
  for (const s of scored) {
    lines.push(`### ${s.candidate.label}`, "", formatMatrix(s.matrix), "");
  }

  lines.push("## Conflict Slips (GT=conflicting, prediction!=conflicting)", "");
  for (const s of scored) {
    lines.push(`### ${s.candidate.label}`);
    if (s.conflictSlips.length === 0) {
      lines.push("_None._", "");
      continue;
    }
    for (const slip of s.conflictSlips) {
      lines.push(
        `- **${slip.pairId}**: GT=\`${slip.gt}\`, predicted=\`${slip.predicted}\` — ${String(slip.explanation || "").replace(/\n/g, " ")}`
      );
    }
    lines.push("");
  }

  lines.push("## Disagreements vs Ground Truth", "");
  for (const s of scored) {
    lines.push(`### ${s.candidate.label}`);
    if (s.disagreements.length === 0) {
      lines.push("_None._", "");
      continue;
    }
    for (const d of s.disagreements) {
      lines.push(
        `- **${d.pairId}**: GT=\`${d.gt}\`, predicted=\`${d.predicted}\` — ${String(d.explanation || "").replace(/\n/g, " ")}`
      );
    }
    lines.push("");
  }

  lines.push("## Cross-Candidate Pair Comparison", "");
  lines.push(
    "| PairId | GT | openai/gpt-4o | openai/gpt-5 | openai/gpt-5-mini | anthropic/sonnet-4-6 | anthropic/haiku-4-5 |"
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const pair of pairs) {
    const preds = CANDIDATES.map((candidate) => {
      const row = scoredById[candidate.id].byId.get(String(pair.pairId));
      return isValidClassification(row?.classification) ? row.classification : "schema_fail";
    });
    lines.push(`| ${pair.pairId} | ${pair.gt_classification} | ${preds.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## Cost Projection (75 Stage 2 calls)", "");
  lines.push("| Provider | Model | Avg cost/call | Projected Stage 2 cost/run | Delta vs gpt-4o |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const s of scored) {
    const delta = s.projectionCost - baseline.projectionCost;
    const deltaLabel = `${delta >= 0 ? "+" : ""}$${delta.toFixed(4)}`;
    lines.push(
      `| ${s.candidate.provider} | ${s.candidate.model} | $${s.avgPerCallCost.toFixed(6)} | $${s.projectionCost.toFixed(4)} | ${deltaLabel} |`
    );
  }
  lines.push("");

  lines.push(...recommendationBlock(scoredById), "");

  writeFileSync(RESULTS_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${RESULTS_PATH}`);
}

function validatePairs(inputs) {
  const pairs = inputs?.pairs;
  if (!Array.isArray(pairs) || pairs.length !== 47) {
    throw new Error("Expected locked inputs.json with exactly 47 pairs.");
  }
  for (const pair of pairs) {
    if (!isValidClassification(pair?.gt_classification)) {
      throw new Error(`Invalid gt_classification at pair ${pair?.pairId}`);
    }
  }
  validateLockedReferenceStats(pairs);
  return pairs;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const scoreOnly = process.argv.includes("--score-only") || process.env.R1_2_5_SCORE_ONLY === "1";
  const pairs = validatePairs(loadJson(INPUTS_PATH));
  const systemPrompt = loadPromptV2();

  if (!scoreOnly) {
    for (const candidate of CANDIDATES) {
      await runCandidate(pairs, candidate, systemPrompt);
    }
    await flushObservability();
  }

  const scoredById = {};
  for (const candidate of CANDIDATES) {
    const rows = loadCandidateRows(candidate);
    if (rows.length !== pairs.length) {
      throw new Error(
        `[r1.2.5] ${candidate.label}: expected ${pairs.length} output rows, found ${rows.length}. Run without --score-only first.`
      );
    }
    scoredById[candidate.id] = scoreCandidate(pairs, rows, candidate);
  }

  buildResultsMd(pairs, scoredById);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
