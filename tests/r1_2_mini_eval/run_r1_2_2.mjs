#!/usr/bin/env node
/**
 * R1.2.2 — Compare Stage 2 prompt v1 vs v2 (tightened) for gpt-4o and gpt-4o-mini on the locked 47 pairs.
 *
 * Reuses v1 outputs (no re-call): gpt-4o+v1 from inputs.gpt4o_classification; mini+v1 from mini_outputs_v1.json (or mini_outputs.json).
 * New API calls only for gpt-4o+v2 and gpt-4o-mini+v2 (94 calls, ~$0.05 budget).
 *
 *   node tests/r1_2_mini_eval/run_r1_2_2.mjs              # run v2 APIs + write results_v2.md
 *   node tests/r1_2_mini_eval/run_r1_2_2.mjs --report-only  # results_v2.md only (no API)
 *
 * Env: OPENAI_API_KEY required unless --report-only.
 * Prompt variant for API runs: R1_2_PROMPT_VARIANT=v2 (default) or `--prompt-variant=v2`.
 * Only v2 is supported for new API calls in this sprint (v1 labels are reused from disk).
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { callOpenAI, createTraceId, flushObservability } from "../../lib/observability.js";
import { buildStage2UserPrompt, parseStage2Response, ALLOWED_CLASSIFICATIONS } from "./stage2_eval_mirror.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = __dirname;
const INPUTS_PATH = join(DIR, "inputs.json");
const MINI_LEGACY = join(DIR, "mini_outputs.json");
const MINI_V1 = join(DIR, "mini_outputs_v1.json");
const MINI_V2 = join(DIR, "mini_outputs_v2.json");
const GPT4O_V2 = join(DIR, "gpt4o_outputs_v2.json");
const PROMPT_V1 = join(DIR, "prompts", "stage2_v1.md");
const PROMPT_V2 = join(DIR, "prompts", "stage2_v2.md");
const RESULTS_V2 = join(DIR, "results_v2.md");

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

const MINI_IN = 0.15 / 1e6;
const MINI_OUT = 0.6 / 1e6;
/** Approximate list pricing; update when OpenAI changes rates. */
const GPT4O_IN = 5.0 / 1e6;
const GPT4O_OUT = 15.0 / 1e6;

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadPrompt(variant) {
  const path = variant === "v2" ? PROMPT_V2 : PROMPT_V1;
  return readFileSync(path, "utf8").trim();
}

/** v1 labels are reused from disk; only v2 is supported for paid API runs in R1.2.2. */
function getPromptVariantForApiRun() {
  const arg = process.argv.find((a) => a.startsWith("--prompt-variant="));
  const fromArg = arg?.slice("--prompt-variant=".length).trim();
  const v = String(fromArg || process.env.R1_2_PROMPT_VARIANT || "v2")
    .toLowerCase()
    .trim();
  if (v !== "v2") {
    console.error(
      "R1.2.2: API runs only support --prompt-variant=v2 (or R1_2_PROMPT_VARIANT=v2). v1 is not re-called; use inputs.json + mini_outputs_v1.json."
    );
    process.exit(1);
  }
  return "v2";
}

function usdFromUsage(usage, model) {
  if (!usage) return 0;
  const inT = Number(usage.prompt_tokens) || 0;
  const outT = Number(usage.completion_tokens) || 0;
  const isMini = String(model).includes("mini");
  if (isMini) return inT * MINI_IN + outT * MINI_OUT;
  return inT * GPT4O_IN + outT * GPT4O_OUT;
}

function emptyMatrix() {
  const m = {};
  for (const gt of CLASS_ORDER) {
    m[gt] = {};
    for (const pr of CLASS_ORDER) m[gt][pr] = 0;
  }
  return m;
}

function addConfusion(matrix, actual, predicted) {
  if (!CLASS_ORDER.includes(actual) || !CLASS_ORDER.includes(predicted)) return;
  matrix[actual][predicted] += 1;
}

function formatMatrix(matrix) {
  const header = `| GT \\ Pred | ${CLASS_ORDER.join(" | ")} |`;
  const sep = `| --- | ${CLASS_ORDER.map(() => "---").join(" | ")} |`;
  const rows = CLASS_ORDER.map(
    (gt) => `| **${gt}** | ${CLASS_ORDER.map((pr) => matrix[gt][pr]).join(" | ")} |`
  );
  return [header, sep, ...rows].join("\n");
}

function alignMiniRows(pairs, miniRows) {
  const byId = new Map(miniRows.map((r) => [String(r.pairId), r]));
  return pairs.map((p) => {
    const r = byId.get(String(p.pairId));
    if (!r) throw new Error(`Missing mini output for ${p.pairId}`);
    return r;
  });
}

function ensureMiniV1Copy() {
  if (!existsSync(MINI_V1) && existsSync(MINI_LEGACY)) {
    copyFileSync(MINI_LEGACY, MINI_V1);
    console.log(`Copied ${MINI_LEGACY} → ${MINI_V1}`);
  }
}

function predictionsFromInputsGpt4oV1(pairs) {
  return pairs.map((p) => ({
    pairId: p.pairId,
    classification: p.gpt4o_classification,
    passage: "",
    explanation: "— (locked `gpt4o_classification` in inputs.json; no stored passage/explanation for v1 API runs.)",
    raw_response: "",
    schema_valid: true,
    retried: false,
    latencyMs: 0,
    usage: null,
    model: "gpt-4o",
    promptVariant: "v1",
  }));
}

function scoreBlock(name, pairs, rows) {
  const byId = new Map(rows.map((r) => [String(r.pairId), r]));
  let agree = 0;
  const n = pairs.length;
  const matrix = emptyMatrix();
  let totalGtConflicting = 0;
  let correctConflicting = 0;
  const conflictSlips = [];
  let sumLat = 0;
  let totalUsd = 0;

  for (const p of pairs) {
    const r = byId.get(String(p.pairId));
    const pred = r?.classification;
    const validPred = ALLOWED_CLASSIFICATIONS.has(pred);
    if (validPred && pred === p.gt_classification) agree += 1;
    if (validPred) addConfusion(matrix, p.gt_classification, pred);
    if (typeof r?.latencyMs === "number") sumLat += r.latencyMs;
    totalUsd += usdFromUsage(r?.usage, r?.model || name);

    if (p.gt_classification === "conflicting") {
      totalGtConflicting += 1;
      if (pred === "conflicting") correctConflicting += 1;
      else {
        conflictSlips.push({
          pairId: p.pairId,
          gt: p.gt_classification,
          predicted: validPred ? pred : String(pred || "missing"),
          explanation: r?.explanation || "",
        });
      }
    }
  }

  const agreeRate = n > 0 ? agree / n : 0;
  const conflictRate = totalGtConflicting > 0 ? correctConflicting / totalGtConflicting : 0;

  return {
    name,
    agree,
    n,
    agreeRate,
    matrix,
    totalGtConflicting,
    correctConflicting,
    conflictRate,
    conflictSlips,
    sumLat,
    totalUsd,
  };
}

async function callOnePair({ model, pair, systemPrompt, evalSlug, promptVariant }) {
  const traceId = createTraceId();
  const userContent = buildStage2UserPrompt(pair.statement, pair.sourceText);
  const evalTag = `r1.2.2-${evalSlug}-${promptVariant}`;

  async function attempt() {
    const t0 = Date.now();
    const response = await callOpenAI(
      {
        model,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      },
      {
        traceId,
        traceName: "r1.2.2-stage2-eval",
        spanName: "qc-stage2-source-matching",
        metadata: { eval: evalTag, pairId: String(pair.pairId) },
      }
    );
    const latencyMs = Date.now() - t0;
    const raw = response?.choices?.[0]?.message?.content ?? "";
    const normalized = parseStage2Response(raw, pair.sourceText);
    return { raw, normalized, latencyMs, usage: response?.usage ?? null };
  }

  let retried = false;
  let { raw, normalized, latencyMs, usage } = await attempt();
  if (!normalized) {
    retried = true;
    const second = await attempt();
    raw = second.raw;
    normalized = second.normalized;
    latencyMs += second.latencyMs;
    usage = second.usage;
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
      model,
      promptVariant,
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
    model,
    promptVariant,
  };
}

async function runV2Apis(pairs, systemPrompt, promptVariant) {
  const gpt4oRows = [];
  const miniRows = [];
  let i = 0;
  for (const p of pairs) {
    i += 1;
    process.stdout.write(`\r[r1.2.2] ${promptVariant} API ${i}/94 (gpt-4o + mini)…`);
    gpt4oRows.push(
      await callOnePair({ model: "gpt-4o", pair: p, systemPrompt, evalSlug: "gpt-4o", promptVariant })
    );
    miniRows.push(
      await callOnePair({ model: "gpt-4o-mini", pair: p, systemPrompt, evalSlug: "gpt-4o-mini", promptVariant })
    );
  }
  process.stdout.write("\n");
  writeFileSync(GPT4O_V2, JSON.stringify(gpt4oRows, null, 2), "utf8");
  writeFileSync(MINI_V2, JSON.stringify(miniRows, null, 2), "utf8");
  console.log(`Wrote ${GPT4O_V2} and ${MINI_V2}`);
}

function buildReport(pairs) {
  assertInputLabels(pairs);
  validateLockedReferenceStats(pairs);
  ensureMiniV1Copy();
  if (!existsSync(MINI_V1)) throw new Error(`Need ${MINI_V1} or ${MINI_LEGACY} for mini v1`);
  if (!existsSync(GPT4O_V2) || !existsSync(MINI_V2)) {
    throw new Error(`Missing v2 outputs. Run without --report-only first to generate ${GPT4O_V2} and ${MINI_V2}`);
  }

  const miniV1Rows = alignMiniRows(pairs, loadJson(MINI_V1));
  const gpt4oV1Rows = predictionsFromInputsGpt4oV1(pairs);
  const gpt4oV2Rows = alignMiniRows(pairs, loadJson(GPT4O_V2));
  const miniV2Rows = alignMiniRows(pairs, loadJson(MINI_V2));

  const combos = [
    scoreBlock("gpt-4o + v1", pairs, gpt4oV1Rows),
    scoreBlock("gpt-4o-mini + v1", pairs, miniV1Rows),
    scoreBlock("gpt-4o + v2", pairs, gpt4oV2Rows),
    scoreBlock("gpt-4o-mini + v2", pairs, miniV2Rows),
  ];

  const byName = Object.fromEntries(combos.map((c) => [c.name, c]));

  const lines = [
    "# R1.2.2 — Stage 2 prompt v1 vs v2 (conflict focus)",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Q1 & Q2 (executive)",
    "",
    "**Q1:** Does prompt tightening fix gpt-4o’s hedging on conflicts (partially_confirmed where GT is conflicting)?",
    "",
    "**Q2:** Does prompt tightening fix gpt-4o-mini’s false `confirmed` on GT-conflicting pairs?",
    "",
    "See **Conflict detection** and **Conflict slips** below per combination.",
    "",
    "## Agreement vs ground truth (47 pairs)",
    "",
    "_gpt-4o + v1 uses locked `gpt4o_classification` in `inputs.json` (no stored passage or explanation)._",
    "",
    ...combos.map(
      (c) =>
        `- **${c.name}:** ${(c.agreeRate * 100).toFixed(2)}% (${c.agree}/${c.n}; invalid or missing predictions count as disagreements)`
    ),
    "",
    "## Conflict detection rate",
    "",
    "_Definition:_ (pairs with GT = `conflicting` and prediction = `conflicting`) / (total pairs with GT = `conflicting`).",
    "",
    ...combos.map(
      (c) =>
        `- **${c.name}:** **${(c.conflictRate * 100).toFixed(1)}%** (${c.correctConflicting}/${c.totalGtConflicting} GT-conflicting pairs)`
    ),
    "",
    "## Per-combination cost & latency",
    "",
    ...combos.map(
      (c) =>
        `- **${c.name}:** ~$${c.totalUsd.toFixed(4)} USD (usage × list rates in script), latency sum ${c.sumLat} ms`
    ),
    "",
    "## Confusion matrices (rows = GT, cols = pred)",
    "",
  ];

  for (const c of combos) {
    lines.push(`### ${c.name}`, "", formatMatrix(c.matrix), "");
  }

  lines.push("## Conflict slips (GT = conflicting, prediction ≠ conflicting)", "");
  for (const c of combos) {
    lines.push(`### ${c.name}`, "");
    if (c.conflictSlips.length === 0) lines.push("_None._", "");
    else {
      for (const s of c.conflictSlips) {
        lines.push(
          `- **${s.pairId}**: GT=\`${s.gt}\`, predicted=\`${s.predicted}\` — ${s.explanation.replace(/\n/g, " ")}`
        );
      }
      lines.push("");
    }
  }

  lines.push("## Recommendation matrix", "", "| Model | v1 conflict rate | v2 conflict rate | v1 agreement | v2 agreement | Verdict |", "| --- | --- | --- | --- | --- | --- |");

  const combo = (modelLabel, variant) => byName[`${modelLabel} + ${variant}`];
  const row = (modelLabel, display) => {
    const c1 = combo(modelLabel, "v1");
    const c2 = combo(modelLabel, "v2");
    const ver = verdictCell(c1, c2);
    return `| ${display} | ${(c1.conflictRate * 100).toFixed(1)}% (${c1.correctConflicting}/${c1.totalGtConflicting}) | ${(c2.conflictRate * 100).toFixed(1)}% (${c2.correctConflicting}/${c2.totalGtConflicting}) | ${(c1.agreeRate * 100).toFixed(2)}% | ${(c2.agreeRate * 100).toFixed(2)}% | ${ver} |`;
  };
  lines.push(row("gpt-4o", "gpt-4o"), row("gpt-4o-mini", "gpt-4o-mini"), "");

  lines.push("### Decision summary", "", ...recommendationText(byName), "");

  writeFileSync(RESULTS_V2, lines.join("\n"), "utf8");
  console.log(`Wrote ${RESULTS_V2}`);
}

function verdictCell(c1, c2) {
  if (c2.conflictRate >= 1 - 1e-9 && c2.agreeRate + 0.02 >= c1.agreeRate - 1e-9) return "Candidate v2";
  if (c2.conflictRate > c1.conflictRate + 1e-9) return "Improved";
  if (c2.conflictRate < c1.conflictRate - 1e-9) return "Regressed";
  return "Flat";
}

function recommendationText(byName) {
  const g4v1 = byName["gpt-4o + v1"];
  const g4v2 = byName["gpt-4o + v2"];
  const miniv1 = byName["gpt-4o-mini + v1"];
  const miniv2 = byName["gpt-4o-mini + v2"];

  const fourFour = (c) => c.totalGtConflicting > 0 && c.correctConflicting === c.totalGtConflicting;
  const agreeOk = (c2, c1) => c2.agreeRate + 0.02 >= c1.agreeRate - 1e-9;

  const parts = [];

  const miniLock = fourFour(miniv2) && agreeOk(miniv2, miniv1);
  const g4Lock = fourFour(g4v2) && agreeOk(g4v2, g4v1);

  const conflictImprovedEither =
    g4v2.conflictRate > g4v1.conflictRate + 1e-9 || miniv2.conflictRate > miniv1.conflictRate + 1e-9;
  const conflictWorseBoth =
    g4v2.conflictRate < g4v1.conflictRate - 1e-9 && miniv2.conflictRate < miniv1.conflictRate - 1e-9;

  if (miniLock) {
    parts.push(
      "**Recommend gpt-4o-mini + prompt v2 for Stage 2 in the rebuild** — rule (b): 4/4 conflict detection on mini and agreement vs GT within −2 percentage points of mini v1 (cost win)."
    );
  } else if (g4Lock) {
    parts.push(
      "**Recommend gpt-4o + prompt v2 for Stage 2 in the rebuild** — rule (a): 4/4 conflict detection on gpt-4o and agreement within −2pp of gpt-4o v1."
    );
  } else if (fourFour(miniv2) && !agreeOk(miniv2, miniv1)) {
    parts.push(
      "**Do not lock mini + v2 yet** — mini reaches 4/4 on conflicts but overall agreement drops more than 2 percentage points vs mini v1; refine prompt or expand fixtures before a cost-driven switch."
    );
  } else if (fourFour(g4v2) && !agreeOk(g4v2, g4v1)) {
    parts.push(
      "**Do not lock gpt-4o + v2 yet** — gpt-4o reaches 4/4 on conflicts but overall agreement drops more than 2 percentage points vs gpt-4o v1; refine prompt or expand fixtures."
    );
  } else if (conflictImprovedEither && !fourFour(g4v2) && !fourFour(miniv2)) {
    parts.push(
      "**EXPAND eval** — rule (c): v2 improves conflict detection on at least one model vs v1 but neither reaches 4/4; add more conflicting-case fixtures before deciding."
    );
  } else if (conflictWorseBoth) {
    parts.push(
      "**KEEP production Stage 2 prompt + gpt-4o** — rule (d): v2 strictly lowers conflict-detection rate on both models vs v1; backlog deeper investigation."
    );
  } else {
    parts.push(
      "**KEEP production Stage 2 prompt + gpt-4o** — v2 does not meet the 4/4 + agreement bar on either model; treat as inconclusive or mild regression for locking Stage 2."
    );
  }

  parts.push("");
  parts.push(
    "_Rules:_ (a) 4/4 conflicts on either model with agreement within −2pp of that model’s v1 → recommend that model + v2. (b) If mini satisfies (a), prefer mini + v2 (cost). (c) Improvement but not 4/4 → EXPAND. (d) Clear regression on conflict detection → KEEP v1 + gpt-4o and investigate."
  );

  return parts;
}

async function main() {
  const reportOnly = process.argv.includes("--report-only");

  const { pairs } = loadJson(INPUTS_PATH);
  if (!Array.isArray(pairs) || pairs.length !== 47) {
    console.error("Expected 47 pairs in inputs.json for R1.2.2");
    process.exit(1);
  }
  assertInputLabels(pairs);
  validateLockedReferenceStats(pairs);

  ensureMiniV1Copy();

  if (reportOnly) {
    buildReport(pairs);
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY required (or use --report-only after v2 outputs exist).");
    process.exit(1);
  }

  const promptVariant = getPromptVariantForApiRun();
  const systemPrompt = loadPrompt(promptVariant);
  await runV2Apis(pairs, systemPrompt, promptVariant);
  await flushObservability();
  buildReport(pairs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
