#!/usr/bin/env node
/**
 * R1.2: Evaluate gpt-4o-mini vs locked ground truth for Stage 2 source matching.
 * Parallel to production — does not import stage2-match-sources.mjs.
 *
 * Usage (from repo root):
 *   node tests/r1_2_mini_eval/run_eval.mjs              # full run (needs OPENAI_API_KEY)
 *   node tests/r1_2_mini_eval/run_eval.mjs --score-only # recompute results.md from mini_outputs.json only
 *
 * Score-only does not call the API and does not require OPENAI_API_KEY.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callOpenAI, createTraceId, flushObservability } from "../../lib/observability.js";
import {
  STAGE2_SYSTEM_PROMPT,
  buildStage2UserPrompt,
  parseStage2Response,
  ALLOWED_CLASSIFICATIONS,
} from "./stage2_eval_mirror.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = __dirname;
const INPUTS_PATH = join(DIR, "inputs.json");
const OUTPUTS_PATH = join(DIR, "mini_outputs.json");
const RESULTS_PATH = join(DIR, "results.md");

const EVAL_MODEL = "gpt-4o-mini";
/** OpenAI list pricing USD per 1M tokens (update when pricing changes). */
const MINI_INPUT_USD_PER_1M = 0.15;
const MINI_OUTPUT_USD_PER_1M = 0.6;

const CLASS_ORDER = ["confirmed", "partially_confirmed", "conflicting", "no_support"];

/** Expected GT vs gpt4o_classification disagreements on locked_ground_truth_v1.csv (6 pairs). */
const LOCKED_GT_VS_GPT4O_MISMATCH_IDS = ["P04", "P27", "P29", "P30", "P33", "P44"];

function isCanonicalP01ToP47(pairs) {
  if (!Array.isArray(pairs) || pairs.length !== 47) return false;
  return pairs.every((p, i) => String(p.pairId) === `P${String(i + 1).padStart(2, "0")}`);
}

function assertInputLabels(pairs) {
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    const gt = p.gt_classification;
    const g4 = p.gpt4o_classification;
    if (!ALLOWED_CLASSIFICATIONS.has(gt)) {
      throw new Error(`inputs.json row ${i + 1} (${p.pairId}): invalid gt_classification ${JSON.stringify(gt)}`);
    }
    if (!ALLOWED_CLASSIFICATIONS.has(g4)) {
      throw new Error(`inputs.json row ${i + 1} (${p.pairId}): invalid gpt4o_classification ${JSON.stringify(g4)}`);
    }
  }
}

/** Fail fast if inputs look like the canonical lock but don’t match reference stats. */
function validateLockedReferenceStats(pairs) {
  if (!isCanonicalP01ToP47(pairs)) return;

  const mismatches = [];
  for (const p of pairs) {
    if (p.gt_classification !== p.gpt4o_classification) mismatches.push(String(p.pairId));
  }
  mismatches.sort();
  const expected = [...LOCKED_GT_VS_GPT4O_MISMATCH_IDS].sort();
  const ok =
    mismatches.length === expected.length && mismatches.every((id, idx) => id === expected[idx]);
  if (!ok) {
    throw new Error(
      `Locked sanity: GT vs gpt4o mismatch pairs expected [${expected.join(", ")}], got [${mismatches.join(", ")}]`
    );
  }

  const agree = pairs.filter((p) => p.gt_classification === p.gpt4o_classification).length;
  if (agree !== 41) {
    throw new Error(`Locked sanity: expected 41 agreements between gpt4o_classification and GT, got ${agree}`);
  }
}

function alignMiniOutputs(pairs, miniRows) {
  const byId = new Map(miniRows.map((r) => [String(r.pairId), r]));
  return pairs.map((p) => {
    const id = String(p.pairId);
    const r = byId.get(id);
    if (!r) throw new Error(`mini_outputs.json missing pairId ${id}`);
    return r;
  });
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function usdFromUsage(usage) {
  if (!usage) return 0;
  const inT = Number(usage.prompt_tokens) || 0;
  const outT = Number(usage.completion_tokens) || 0;
  return (inT / 1e6) * MINI_INPUT_USD_PER_1M + (outT / 1e6) * MINI_OUTPUT_USD_PER_1M;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function emptyMatrix() {
  const m = {};
  for (const a of CLASS_ORDER) {
    m[a] = {};
    for (const b of CLASS_ORDER) m[a][b] = 0;
  }
  return m;
}

function addConfusion(matrix, actual, predicted) {
  if (!CLASS_ORDER.includes(actual) || !CLASS_ORDER.includes(predicted)) return;
  matrix[actual][predicted] += 1;
}

function formatMatrix(title, matrix) {
  const header = `| GT \\ Pred | ${CLASS_ORDER.join(" | ")} |`;
  const sep = `|${CLASS_ORDER.map(() => "---").join("|")}|`;
  const rows = CLASS_ORDER.map(
    (gt) => `| **${gt}** | ${CLASS_ORDER.map((pr) => matrix[gt][pr]).join(" | ")} |`
  );
  return [`### ${title}`, "", header, sep, ...rows, ""].join("\n");
}

function isOutputComplete(rec) {
  if (!rec || typeof rec !== "object") return false;
  if (rec.schema_valid === true && ALLOWED_CLASSIFICATIONS.has(rec.classification)) return true;
  if (rec.retried === true && rec.schema_valid === false && rec.classification === "schema_validation_failed")
    return true;
  return false;
}

async function callMiniForPair(pair) {
  const traceId = createTraceId();
  const userContent = buildStage2UserPrompt(pair.statement, pair.sourceText);
  const baseMeta = { eval: "r1.2-mini", pairId: String(pair.pairId) };

  async function oneAttempt() {
    const t0 = Date.now();
    const response = await callOpenAI(
      {
        model: EVAL_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: STAGE2_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      {
        traceId,
        traceName: "r1.2-mini-eval",
        spanName: "qc-stage2-source-matching",
        metadata: { ...baseMeta },
      }
    );
    const latencyMs = Date.now() - t0;
    const raw = response?.choices?.[0]?.message?.content ?? "";
    const normalized = parseStage2Response(raw, pair.sourceText);
    return { raw, normalized, latencyMs, usage: response?.usage ?? null };
  }

  let retried = false;
  let first = await oneAttempt();
  let normalized = first.normalized;
  let raw = first.raw;
  let latencyMs = first.latencyMs;
  let usage = first.usage;

  if (!normalized) {
    retried = true;
    const second = await oneAttempt();
    raw = second.raw;
    normalized = second.normalized;
    latencyMs += second.latencyMs;
    usage = mergeUsage(usage, second.usage);
  }

  if (normalized) {
    return {
      pairId: pair.pairId,
      classification: normalized.classification,
      passage: normalized.passage,
      explanation: normalized.explanation,
      raw_response: raw,
      schema_valid: true,
      retried,
      latencyMs,
      usage,
    };
  }

  return {
    pairId: pair.pairId,
    classification: "schema_validation_failed",
    passage: "",
    explanation: "",
    raw_response: raw,
    schema_valid: false,
    retried,
    latencyMs,
    usage,
  };
}

function mergeUsage(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    prompt_tokens: (Number(a.prompt_tokens) || 0) + (Number(b.prompt_tokens) || 0),
    completion_tokens: (Number(a.completion_tokens) || 0) + (Number(b.completion_tokens) || 0),
    total_tokens: (Number(a.total_tokens) || 0) + (Number(b.total_tokens) || 0),
  };
}

function loadCompleteOutputs() {
  const m = new Map();
  if (!existsSync(OUTPUTS_PATH)) return m;
  const arr = loadJson(OUTPUTS_PATH);
  if (!Array.isArray(arr)) return m;
  for (const row of arr) {
    if (row?.pairId != null && isOutputComplete(row)) {
      m.set(String(row.pairId), row);
    }
  }
  return m;
}

async function main() {
  const scoreOnly = process.argv.includes("--score-only") || process.env.R1_2_SCORE_ONLY === "1";

  if (!existsSync(INPUTS_PATH)) {
    console.error(`Missing ${INPUTS_PATH}. Run: node tests/r1_2_mini_eval/build_inputs.mjs`);
    process.exit(1);
  }

  const { pairs } = loadJson(INPUTS_PATH);
  if (!Array.isArray(pairs) || pairs.length === 0) {
    console.error("inputs.json has no pairs.");
    process.exit(1);
  }

  try {
    assertInputLabels(pairs);
    validateLockedReferenceStats(pairs);
  } catch (e) {
    console.error(e.message || String(e));
    process.exit(1);
  }

  if (scoreOnly) {
    if (!existsSync(OUTPUTS_PATH)) {
      console.error(`Missing ${OUTPUTS_PATH} for --score-only`);
      process.exit(1);
    }
    const miniRowsRaw = loadJson(OUTPUTS_PATH);
    if (!Array.isArray(miniRowsRaw)) {
      console.error("mini_outputs.json must be an array");
      process.exit(1);
    }
    let aligned;
    try {
      aligned = alignMiniOutputs(pairs, miniRowsRaw);
    } catch (e) {
      console.error(e.message || String(e));
      process.exit(1);
    }
    const report = buildReport(pairs, aligned);
    writeFileSync(RESULTS_PATH, report, "utf8");
    console.log(`Wrote ${RESULTS_PATH} (--score-only, no API calls)`);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required (or use --score-only).");
    process.exit(1);
  }

  const completeById = loadCompleteOutputs();
  const finalOutputs = [];

  for (const pair of pairs) {
    const id = String(pair.pairId);
    let rec = completeById.get(id);
    if (!rec) {
      console.log(`[r1.2-mini-eval] Running pair ${id}…`);
      rec = await callMiniForPair(pair);
      completeById.set(id, rec);
    }
    finalOutputs.push(rec);
  }

  writeFileSync(OUTPUTS_PATH, JSON.stringify(finalOutputs, null, 2), "utf8");
  await flushObservability();

  const report = buildReport(pairs, finalOutputs);
  writeFileSync(RESULTS_PATH, report, "utf8");
  console.log(`Wrote ${RESULTS_PATH}`);
}

function buildReport(pairs, miniRows) {
  const byMini = new Map(miniRows.map((r) => [String(r.pairId), r]));

  const latencies = [];
  let totalCost = 0;
  let schemaFail = 0;
  let retryCount = 0;

  for (const r of miniRows) {
    if (typeof r.latencyMs === "number") latencies.push(r.latencyMs);
    totalCost += usdFromUsage(r.usage);
    if (r.schema_valid === false) schemaFail += 1;
    if (r.retried) retryCount += 1;
  }

  latencies.sort((a, b) => a - b);
  const sumLat = latencies.reduce((a, b) => a + b, 0);

  const N = pairs.length;
  let miniValid = 0;
  let miniAgree = 0;
  let gpt4oAgree = 0;
  let gpt4oN = 0;

  const matrixMini = emptyMatrix();
  const matrix4o = emptyMatrix();

  const disagreeGt = [];
  const disagree4o = [];

  for (const p of pairs) {
    const id = String(p.pairId);
    const m = byMini.get(id);
    const gt = p.gt_classification;
    const g4 = p.gpt4o_classification;

    if (ALLOWED_CLASSIFICATIONS.has(g4) && ALLOWED_CLASSIFICATIONS.has(gt)) {
      gpt4oN += 1;
      if (g4 === gt) gpt4oAgree += 1;
      addConfusion(matrix4o, gt, g4);
    }

    if (m?.schema_valid && ALLOWED_CLASSIFICATIONS.has(m.classification)) {
      miniValid += 1;
      if (m.classification === gt) miniAgree += 1;
      if (ALLOWED_CLASSIFICATIONS.has(gt)) addConfusion(matrixMini, gt, m.classification);
      if (m.classification !== gt) {
        disagreeGt.push({
          pairId: id,
          gt,
          mini: m.classification,
          explanation: m.explanation,
        });
      }
      if (ALLOWED_CLASSIFICATIONS.has(g4) && m.classification !== g4) {
        disagree4o.push({ pairId: id, gpt4o: g4, mini: m.classification });
      }
    }
  }

  const miniRate = miniValid > 0 ? miniAgree / miniValid : 0;
  const gpt4oRate = gpt4oN > 0 ? gpt4oAgree / gpt4oN : 0;

  /** Serious conflict slips: GT is conflicting but mini is `no_support` or `confirmed`. */
  let conflictMisses = 0;
  for (const row of disagreeGt) {
    if (row.gt === "conflicting" && (row.mini === "no_support" || row.mini === "confirmed")) {
      conflictMisses += 1;
    }
  }

  const ref47Note =
    N === 47
      ? "Reference locked eval: gpt-4o vs GT was **41/47 (87.23%)** on the same sheet."
      : `_This run used **${N}** pairs (not the full 47-pair lock). For the go/no-go headline, re-run after placing the full export in \`inputs.json\`.)_`;

  const rec = recommend({ N, miniRate, gpt4oRate, schemaFail, conflictMisses, miniValid });

  const lines = [
    "# R1.2 — gpt-4o-mini Stage 2 source-matching eval",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- **Total pairs in inputs:** ${N}`,
    `- **Mini calls with valid schema (4-way class):** ${miniValid}`,
    `- **Schema validation failures (after retry):** ${schemaFail}`,
    `- **Retries (first attempt failed schema):** ${retryCount}`,
    `- **Total mini API cost (USD, from usage × list price):** $${totalCost.toFixed(4)}`,
    `- **Total mini latency (sum):** ${sumLat} ms`,
    `- **Mini latency p50 / p95:** ${percentile(latencies, 0.5)} ms / ${percentile(latencies, 0.95)} ms`,
    "",
    "## Agreement vs ground truth",
    "",
    `- **gpt-4o agreement rate** (from \`gpt4o_classification\` in inputs): **${(gpt4oRate * 100).toFixed(2)}%** (${gpt4oAgree}/${gpt4oN} pairs with both labels valid)`,
    `- **gpt-4o-mini agreement rate** (valid mini only): **${(miniRate * 100).toFixed(2)}%** (${miniAgree}/${miniValid})`,
    "",
    ref47Note,
    "",
    formatMatrix("Confusion matrix — gpt-4o-mini (rows = GT, cols = mini)", matrixMini),
    formatMatrix("Confusion matrix — gpt-4o labels in inputs (rows = GT, cols = gpt4o)", matrix4o),
    "",
    "## Pairs where mini disagrees with ground truth",
    "",
    disagreeGt.length
      ? disagreeGt.map((r) => `- **${r.pairId}**: GT=\`${r.gt}\`, mini=\`${r.mini}\` — ${r.explanation}`).join("\n")
      : "_None._",
    "",
    "## Pairs where mini disagrees with gpt-4o (inputs)",
    "",
    disagree4o.length
      ? disagree4o.map((r) => `- **${r.pairId}**: gpt-4o=\`${r.gpt4o}\`, mini=\`${r.mini}\``).join("\n")
      : "_None._",
    "",
    "## Recommendation (decision rule from spec)",
    "",
    rec,
    "",
    "## Cost model note",
    "",
    "Per-pair usage is summed from OpenAI `usage` on each completion. Update `MINI_INPUT_USD_PER_1M` / `MINI_OUTPUT_USD_PER_1M` in `run_eval.mjs` when OpenAI pricing changes, then re-run to refresh dollars.",
    "",
  ];

  return lines.join("\n");
}

function recommend({ N, miniRate, gpt4oRate, schemaFail, conflictMisses, miniValid }) {
  const parts = [];
  /** Locked reference rate for gpt-4o on the 47-pair sheet (41/47). */
  const LOCKED_GPT4O_RATE = 41 / 47;
  const miniBeatsGpt4oLabels = miniRate >= gpt4oRate - 1e-9;
  const miniMeetsLockedBar = miniRate >= LOCKED_GPT4O_RATE - 1e-9;
  const conflictOk = conflictMisses <= 1;
  const schemaOkSwitch = schemaFail <= 1;
  const schemaOkExpand = schemaFail <= 2;
  const atOrAbove80 = miniRate >= 0.8 - 1e-9;

  parts.push(`1. **Mini vs GT (valid mini only):** ${(miniRate * 100).toFixed(2)}%.`);
  parts.push(`2. **gpt-4o labels vs GT (this file):** ${(gpt4oRate * 100).toFixed(2)}% (locked sheet reference: **${(LOCKED_GPT4O_RATE * 100).toFixed(2)}%**, 41/47).`);
  parts.push(
    `3. **Serious conflict slips:** ${conflictMisses} pair(s) where GT is \`conflicting\` but mini is \`no_support\` or \`confirmed\`.`
  );
  parts.push(`4. **Schema failures (after retry):** ${schemaFail}.`);
  parts.push(`5. **Valid mini responses:** ${miniValid}/${N}.`);

  let verdict =
    "**KEEP gpt-4o** — mini does not meet the SWITCH bar, or conflict/schema risk is too high for Stage 2.";

  if (N < 47) {
    verdict =
      "**EXPAND THE EVAL** — this `inputs.json` is not the full 47-pair lock. Export **All pairs** from `Brightline_R1.2_GroundTruth_v1.xlsx`, run `build_inputs.mjs`, then re-run `run_eval.mjs` before a final SWITCH/KEEP decision.";
  } else if (miniBeatsGpt4oLabels && miniMeetsLockedBar && conflictOk && schemaOkSwitch) {
    verdict =
      "**SWITCH to gpt-4o-mini** — mini ≥ gpt-4o agreement on these pairs, mini ≥ locked 41/47 rate, conflict-related slips ≤1, schema failures ≤1.";
  } else if (atOrAbove80 && schemaOkExpand && (conflictMisses <= 2 || miniRate >= gpt4oRate - 0.05)) {
    verdict =
      "**EXPAND THE EVAL** — mini is in a borderline band (~≥80%) or disagreements look like framing/partial vs confirmed noise; widen drafts and pair count before switching.";
  } else {
    verdict = "**KEEP gpt-4o** — mini below the SWITCH / EXPAND thresholds on this lock.";
  }

  parts.push("");
  parts.push(verdict);
  return parts.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
