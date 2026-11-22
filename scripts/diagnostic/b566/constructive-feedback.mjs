/**
 * B566. One constructive-feedback call on the ClearPoint review.
 * Cap USD 0.50. Cache off. Stops before the call if the estimate is over the cap.
 *
 *   node scripts/diagnostic/b566/constructive-feedback.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { armSpendCap, disarmSpendCap } from "../lib/cost-guard.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, getLlmSpend, calculateLlmCostUsd } = await import("../../../lib/observability.js");
const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const {
  buildConstructiveFeedbackV2,
  constructiveFeedbackSystemPrompt,
  normalizeConstructiveFeedbackPlainText,
  prependReadiness,
} = await import("../../../lib/qc/constructive-feedback-v2.mjs");
const { beginRequestBudget, FUNCTION_MAX_DURATION_MS } = await import("../../../lib/qc/request-budget.mjs");
const { enterRequestSpend } = await import("../../../lib/spend/ledger.mjs");

if (isLlmCacheEnabled()) throw new Error("b566: the cache is on");

const CAP = 0.5;
const review = JSON.parse(readFileSync("/Users/benjaminruane/ce-diagnostics/b565/clearpoint-pdf-review.json", "utf8"));
const draftText = (review.statements || []).map((row) => row.text || "").join("\n\n");
let built;
try {
  built = buildConstructiveFeedbackV2({
    draftText,
    outputType: "reporting_commentary",
    outputTypeLabel: "Reporting commentary",
    eventType: "OTHER_UPDATE",
    visibility: "complete",
    reviewOptions: review.meta?.reviewOptions,
    statements: (review.statements || []).map((row) => ({ text: row.text || "", qcCard: row.qcCard })),
  });
} catch (err) {
  console.error("build failed:", err?.message || err);
  process.exit(1);
}

const modelConfig = STAGE_MODELS["constructive-feedback"];
const system = constructiveFeedbackSystemPrompt();
const user = JSON.stringify(built.payload, null, 2);
const inputTokens = Math.ceil((system.length + user.length) / 4);
const outputTokens = 1200;
const estimate = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, {
  inputTokens,
  outputTokens,
});
console.log(`Estimated cost USD ${estimate.toFixed(4)} (${inputTokens} input tokens, ${outputTokens} output tokens reserved). Cap USD ${CAP.toFixed(2)}.`);
if (estimate > CAP) {
  console.error(`Estimate USD ${estimate.toFixed(4)} is above the USD ${CAP.toFixed(2)} cap. Not running.`);
  process.exit(1);
}

enterRequestSpend();
beginRequestBudget({
  startedAt: Date.now(),
  maxDurationMs: FUNCTION_MAX_DURATION_MS,
  model: modelConfig.model,
});
armSpendCap(CAP);
let completion;
try {
  completion = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    temperature: null,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    traceId: randomUUID(),
    traceName: "b566-constructive-feedback",
    spanName: "constructive-feedback",
    metadata: { route: "constructive-feedback", findingCount: built.payload.findings.length },
  });
} finally {
  disarmSpendCap();
  await flushObservability();
}

const raw = typeof completion?.text === "string" ? completion.text.trim() : "";
const feedbackText = prependReadiness(built.readiness, normalizeConstructiveFeedbackPlainText(raw));
if (!feedbackText) {
  console.error("The call returned no author-facing notes.");
  process.exit(1);
}
const spend = getLlmSpend() || {};
const usage = completion?.usage || completion?.raw?.usage || null;
const costUsd = Number(spend.costUsd) || calculateLlmCostUsd(
  modelConfig.provider,
  modelConfig.model,
  usage || {}
);
if (costUsd > CAP) {
  console.error(`Spend USD ${costUsd.toFixed(4)} passed the cap of USD ${CAP.toFixed(2)}.`);
  process.exit(1);
}

const outDir = path.join(process.env.HOME, "ce-diagnostics", "b566");
mkdirSync(outDir, { recursive: true });
const saved = {
  ok: true,
  readiness: built.readiness,
  feedbackText,
  costUsd,
  calls: Number(spend.calls) || 1,
  model: modelConfig.model,
  provider: modelConfig.provider,
  findingCount: built.payload.findings.length,
  spend,
};
writeFileSync(path.join(outDir, "constructive-feedback.json"), JSON.stringify(saved, null, 2));
console.log(`Wrote ${path.join(outDir, "constructive-feedback.json")}`);
console.log(`Cost USD ${costUsd} across ${saved.calls} call(s).`);
console.log(feedbackText.slice(0, 400));
