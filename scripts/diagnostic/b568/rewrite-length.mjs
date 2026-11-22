/**
 * B568. One live Rewrite of a short GP Industries draft.
 * Cap USD 0.25. Never the 3i FY2025 PDF.
 *
 *   node scripts/diagnostic/b568/rewrite-length.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { armSpendCap, disarmSpendCap } from "../lib/cost-guard.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, getLlmSpend, calculateLlmCostUsd } = await import("../../../lib/observability.js");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { beginRequestBudget, FUNCTION_MAX_DURATION_MS } = await import("../../../lib/qc/request-budget.mjs");
const {
  countRewriteWords,
  lengthGapLine,
  lengthIsOff,
  lengthPromptLine,
  lengthTargetFromInstruction,
} = await import("../../../lib/rewrite-length-target.mjs");

const CAP = 0.25;
const INSTRUCTION = "shorten by 30%";
const DRAFT = `GP Industries makes batteries for warehouse trucks and backup power. In the year to March 2025 the battery division lifted gross margin to 25%, from 22% a year earlier. The gain came from a cheaper cathode mix and from running the Penang plant closer to full capacity. Volumes rose in Europe, where two forklift makers signed longer supply agreements, and they were flat in North America. The industrial tools division did not keep pace. Its margin slipped as steel costs stayed high and a delayed product launch left the factory underused. Management left the full year outlook unchanged and said the battery order book covers the next two quarters. Cash from operations paid for the Penang expansion without new borrowing. Net debt finished the year lower than it started. The board kept the dividend flat and said a special dividend would wait until the new line is producing at the planned rate. Customers in the backup power market asked for longer warranties, and the firm agreed where the cell data supported a five year term. No acquisition was announced. The notes to the accounts show one customer above 10% of battery revenue, a European forklift group, and no other concentration that management called material. Research spending stayed at the prior year level and was aimed at a cooler running cell for enclosed warehouses. The company repeated that it does not sell into passenger cars.`;

const wordsBefore = countRewriteWords(DRAFT);
const target = lengthTargetFromInstruction(INSTRUCTION, wordsBefore);
if (!target) {
  console.error("No word target was computed.");
  process.exit(1);
}

const modelConfig = STAGE_MODELS["writing-rewrite"];
beginRequestBudget({
  startedAt: Date.now(),
  maxDurationMs: FUNCTION_MAX_DURATION_MS,
  model: modelConfig.model,
});
armSpendCap(CAP);

function userPrompt(extra) {
  return `Rewrite the draft. ${lengthPromptLine(target)}
The user's instruction is: ${INSTRUCTION}
This word target replaces any other length limit.
Keep the same facts. Do not add facts that are not in the draft.
Return ONLY valid JSON: {"draftText":"string"}

DRAFT:
${DRAFT}
${extra || ""}`.trim();
}

async function once(extra) {
  const completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: "You rewrite the draft to the stated word target. Return only the JSON object." },
      { role: "user", content: userPrompt(extra) },
    ],
    traceId: randomUUID(),
    traceName: "b568-rewrite-length",
    spanName: "writing-rewrite",
    metadata: { route: "rewrite", wordTarget: target },
  });
  let raw = typeof completion?.text === "string" ? completion.text.trim() : "";
  const fence = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fence) raw = fence[1].trim();
  let draftText = "";
  try {
    const parsed = JSON.parse(raw);
    draftText = typeof parsed.draftText === "string" ? parsed.draftText.trim() : "";
  } catch {
    draftText = raw;
  }
  return { draftText, completion };
}

let result;
let calls = 1;
try {
  result = await once("");
  let wordsAfter = countRewriteWords(result.draftText);
  if (result.draftText && lengthIsOff(wordsAfter, target)) {
    calls = 2;
    const second = await once(`\n\n${lengthGapLine(wordsAfter, target)}`);
    if (second.draftText) result = second;
  }
} finally {
  disarmSpendCap();
  await flushObservability();
}

const wordsAfter = countRewriteWords(result.draftText);
const spend = getLlmSpend() || {};
const usage = result.completion?.usage || null;
const costUsd = Number(spend.costUsd) || calculateLlmCostUsd(modelConfig.provider, modelConfig.model, usage || {});
if (costUsd > CAP) {
  console.error(`Spend USD ${costUsd.toFixed(4)} passed the cap of USD ${CAP.toFixed(2)}.`);
  process.exit(1);
}

const outDir = path.join(process.env.HOME, "ce-diagnostics", "b568");
mkdirSync(outDir, { recursive: true });
const saved = {
  ok: true,
  instruction: INSTRUCTION,
  wordsBefore,
  wordTarget: target,
  wordsAfter,
  calls,
  costUsd,
  model: modelConfig.model,
  provider: modelConfig.provider,
  spend,
  draftText: result.draftText,
};
writeFileSync(path.join(outDir, "rewrite-length.json"), JSON.stringify(saved, null, 2));
console.log(`Words before ${wordsBefore}. Target ${target}. Words after ${wordsAfter}.`);
console.log(`Cost USD ${costUsd} across ${Number(spend.calls) || calls} call(s). Model ${modelConfig.model}.`);
console.log(`Wrote ${path.join(outDir, "rewrite-length.json")}`);
