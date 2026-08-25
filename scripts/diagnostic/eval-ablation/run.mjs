#!/usr/bin/env node
/**
 * Stage 2 false-green ablation. Six prompt variants of stage2_v4.md (built in
 * this script only) against six statements. Cache OFF. 36 live calls, once each.
 *
 * Usage:
 *   node scripts/diagnostic/eval-ablation/run.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT, REPO_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(DIAG_ROOT, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(
  REPO_ROOT,
  "lib/qc/pipeline-v4/prompts/stage2_v4.md"
);
const MERIDIAN_PATH = path.join(__dirname, "meridian_source.txt");
const STAGE2_SEED = 1;

const LINE154 =
  "If the checkable facts match the source, classify confirmed even if the explanation mentions extra wording. Do not classify partially_confirmed while stating that the fact matches.";

const LINE154_C =
  "If the checkable facts match the source and the remaining wording is framing, classify confirmed. If the statement also asserts a comparison, ranking, risk level or causal relationship the source does not state, classify partially_confirmed.";

const ENTITY_ROLES_BLOCK = `Entity roles
A different entity in the same role, including ownership-period context, is conflicting (examples 9 and 10).
The source names fewer entities, and the missing name is absent rather than replaced → partially_confirmed.

Mixed statements`;

const ENTITY_ROLES_PLUS_EVALUATIVE = `Entity roles
A different entity in the same role, including ownership-period context, is conflicting (examples 9 and 10).
The source names fewer entities, and the missing name is absent rather than replaced → partially_confirmed.

Evaluative claims
Descriptive wording is FRAMING when it characterises something the source already asserts. Framing does not block confirmed.
Descriptive wording is an ADDITIONAL CHECKABLE CLAIM when it asserts a comparison or ranking, a quantity or threshold, a causal relationship, or a level of risk or certainty, and the source does not state it. That makes the statement partially_confirmed even when every other fact matches.
Test: could a reader ask "compared to what?" or "according to whom?" and find no answer in the source? Then it is a checkable claim, not framing.

Mixed statements`;

const JSON_TEMPLATE_BLOCK = `  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>",
  "explanation": "<one to two sentences>"`;

const JSON_TEMPLATE_B = `  "explanation": "<one to two sentences>",
  "classification": "<one of the four values below>",
  "passage": "<verbatim excerpt from the source>"`;

function applyB(prompt) {
  if (!prompt.includes(JSON_TEMPLATE_BLOCK)) {
    throw new Error("Variant B: JSON template block not found exactly");
  }
  return prompt.replace(JSON_TEMPLATE_BLOCK, JSON_TEMPLATE_B);
}

function applyC(prompt) {
  if (!prompt.includes(LINE154)) {
    throw new Error("Variant C: line 154 text not found exactly");
  }
  return prompt.replace(LINE154, LINE154_C);
}

function applyD(prompt) {
  if (!prompt.includes(ENTITY_ROLES_BLOCK)) {
    throw new Error("Variant D: Entity roles block not found exactly");
  }
  return prompt.replace(ENTITY_ROLES_BLOCK, ENTITY_ROLES_PLUS_EVALUATIVE);
}

function buildVariants(baseline) {
  const A = baseline;
  const B = applyB(baseline);
  const C = applyC(baseline);
  const D = applyD(baseline);
  const E = applyD(applyC(baseline));
  const F = applyD(applyC(applyB(baseline)));
  return { A, B, C, D, E, F };
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

function classificationOf(parsed) {
  const c = parsed?.classification;
  return typeof c === "string" ? c.trim() : null;
}

function explanationOf(parsed) {
  const e = parsed?.explanation;
  return typeof e === "string" ? e : null;
}

async function matchOnce({ systemPrompt, statement, sourceText, variantId, statementId }) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const userPrompt = `Statement:
${statement}

Source:
${sourceText}`.trim();

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
    traceName: "diag-eval-ablation",
    spanName: "stage2-ablation",
    metadata: { variantId, statementId },
  });

  const raw = completion?.text ?? "";
  const parsed = safeJsonParse(raw);
  const costUsd = calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage);
  return {
    classification: classificationOf(parsed),
    explanation: explanationOf(parsed),
    passage: typeof parsed?.passage === "string" ? parsed.passage : null,
    raw,
    usage: {
      inputTokens: Number(completion?.usage?.inputTokens) || 0,
      outputTokens: Number(completion?.usage?.outputTokens) || 0,
    },
    costUsd: Number(costUsd) || 0,
  };
}

function pad(s, n) {
  const t = String(s ?? "");
  return t.length >= n ? t.slice(0, n) : t + " ".repeat(n - t.length);
}

async function main() {
  const stageModel = STAGE_MODELS["stage2-matching"];
  if (!hasProviderApiKey(stageModel.provider)) {
    throw new Error(`Missing API key for ${stageModel.provider}`);
  }

  const baseline = await readFile(STAGE2_PROMPT_PATH, "utf8");
  const meridian = await readFile(MERIDIAN_PATH, "utf8");
  const variants = buildVariants(baseline);

  // Sanity: A identical; each apply changes something; E != C and E != D; F differs from E by B only.
  if (variants.A !== baseline) throw new Error("A must be unmodified baseline");
  if (variants.B === baseline) throw new Error("B did not change prompt");
  if (variants.C === baseline) throw new Error("C did not change prompt");
  if (variants.D === baseline) throw new Error("D did not change prompt");
  if (variants.E === variants.C || variants.E === variants.D) {
    throw new Error("E must combine C and D");
  }
  if (applyB(variants.E) !== variants.F) {
    throw new Error("F must equal B applied to E");
  }

  const statements = [
    {
      id: "E1",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement:
        "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
      source: meridian,
    },
    {
      id: "E2",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement:
        "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
      source: meridian,
    },
    {
      id: "E3",
      kind: "exhibit",
      expected: "partially_confirmed",
      statement:
        "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
      source: meridian,
    },
    {
      id: "C1",
      kind: "control",
      expected: "confirmed",
      statement:
        "Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.",
      source: meridian,
    },
    {
      id: "C2",
      kind: "control",
      expected: "confirmed",
      note: "prompt worked example 3",
      statement:
        "In summary, the Company combines a defensible competitive position in a specialised vertical with high switching costs.",
      source:
        "NSH occupies a strong position in a deeply specialised vertical with high switching costs.",
    },
    {
      id: "C3",
      kind: "control",
      expected: "confirmed",
      statement:
        "The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.",
      source: meridian,
    },
  ];

  const variantIds = ["A", "B", "C", "D", "E", "F"];
  const rows = [];
  let totalCost = 0;
  let totalIn = 0;
  let totalOut = 0;

  console.log("Stage 2 false-green ablation");
  console.log(`Model: ${stageModel.provider}/${stageModel.model}`);
  console.log("Cache: OFF (live measurement)");
  console.log("Single run per cell: cannot separate a real effect from model variance.");
  console.log(`Calls: ${statements.length * variantIds.length}`);
  console.log("");

  for (const st of statements) {
    for (const vid of variantIds) {
      process.stdout.write(`  ${st.id} x ${vid} ... `);
      const result = await matchOnce({
        systemPrompt: variants[vid],
        statement: st.statement,
        sourceText: st.source,
        variantId: vid,
        statementId: st.id,
      });
      totalCost += result.costUsd;
      totalIn += result.usage.inputTokens;
      totalOut += result.usage.outputTokens;
      const row = {
        statementId: st.id,
        kind: st.kind,
        expected: st.expected,
        variantId: vid,
        classification: result.classification,
        explanation: result.explanation,
        passage: result.passage,
        usage: result.usage,
        costUsd: result.costUsd,
        statement: st.statement,
        sourceNote: st.id === "C2" ? "prompt_worked_example_3" : "meridian_source_v2",
      };
      rows.push(row);
      console.log(`${result.classification ?? "PARSE_FAIL"} ($${result.costUsd.toFixed(4)})`);
    }
  }

  const matrix = {};
  for (const st of statements) {
    matrix[st.id] = {};
    for (const vid of variantIds) {
      const row = rows.find((r) => r.statementId === st.id && r.variantId === vid);
      matrix[st.id][vid] = row?.classification ?? null;
    }
  }

  const exhibitIds = ["E1", "E2", "E3"];
  const controlIds = ["C1", "C2", "C3"];
  const winners = [];
  for (const vid of variantIds) {
    const exhibitsOk = exhibitIds.every((id) => matrix[id][vid] === "partially_confirmed");
    const controlsOk = controlIds.every((id) => matrix[id][vid] === "confirmed");
    if (exhibitsOk && controlsOk) winners.push(vid);
  }

  const bMoved = statements.some((st) => matrix[st.id].A !== matrix[st.id].B);

  const exhibitExplanations = {};
  for (const id of exhibitIds) {
    exhibitExplanations[id] = {};
    for (const vid of variantIds) {
      const row = rows.find((r) => r.statementId === id && r.variantId === vid);
      exhibitExplanations[id][vid] = row?.explanation ?? null;
    }
  }

  const report = {
    meta: {
      probe: "stage2-false-green-ablation",
      model: `${stageModel.provider}/${stageModel.model}`,
      cache: "off",
      singleRun: true,
      caveat: "Single runs cannot separate a real effect from model variance.",
      promptPath: "lib/qc/pipeline-v4/prompts/stage2_v4.md",
      meridianSource: "scripts/diagnostic/eval-ablation/meridian_source.txt",
      totalCalls: rows.length,
      totalCostUsd: totalCost,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      ranAt: new Date().toISOString(),
    },
    matrix,
    winners,
    variantBAloneMovedAnything: bMoved,
    exhibitExplanations,
    rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "rows.json"), JSON.stringify(report, null, 2) + "\n");

  console.log("");
  console.log("MATRIX (statements x variants)");
  console.log(
    pad("stmt", 6) + variantIds.map((v) => pad(v, 22)).join("")
  );
  for (const st of statements) {
    console.log(
      pad(st.id, 6) +
        variantIds.map((v) => pad(matrix[st.id][v] ?? "?", 22)).join("")
    );
  }
  console.log("");
  console.log(`Measured cost: $${totalCost.toFixed(6)} (in=${totalIn} out=${totalOut})`);
  console.log(
    winners.length
      ? `Winners (all exhibits off confirmed, all controls confirmed): ${winners.join(", ")}`
      : "Winners: none"
  );
  console.log(
    bMoved
      ? "Variant B alone: moved at least one classification vs A."
      : "Variant B alone: moved nothing vs A."
  );
  console.log(`Wrote ${path.join(OUT_DIR, "rows.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
