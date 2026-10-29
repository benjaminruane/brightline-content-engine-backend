/**
 * B448. The writer step only, on the twenty B446 drafts. Stores the note.
 * Ceiling USD 2. No pipeline.
 *
 *   node scripts/diagnostic/b448/notes.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, getLlmSpend } = await import("../../../lib/observability.js");
const { READING_MODEL, writerJsonSchemaForSpan, writerNote } = await import("../../../lib/qc/reading-review.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "notes.json");
const CEILING_USD = 2;

function toolBlock(raw) {
  const blocks = Array.isArray(raw?.content) ? raw.content : [];
  return blocks.find((entry) => entry && entry.type === "tool_use" && entry.name === "json_response") || null;
}

function spendDelta(before, after) {
  return {
    calls: after.calls - before.calls,
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cachedInputTokens: after.cachedInputTokens - before.cachedInputTokens,
    costUsd: Number((after.costUsd - before.costUsd).toFixed(6)),
    unpricedCalls: after.unpricedCalls - before.unpricedCalls,
  };
}

const fixtures = await loadAllFixtures();
const selected = fixtures
  .map((fixture) => ({
    id: String(fixture.data?.id ?? "").padStart(2, "0"),
    draft: fixture.data?.draft,
    outputType: fixture.data?.config?.outputType,
  }))
  .filter((row) => row.id >= "01" && row.id <= "20")
  .sort((a, b) => a.id.localeCompare(b.id));
if (selected.length !== 20) throw new Error(`b448 notes: expected 20 drafts, found ${selected.length}`);

const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const drafts = [];

for (const item of selected) {
  if (typeof item.draft !== "string" || !item.draft.trim()) {
    throw new Error(`b448 notes: fixture ${item.id} has no draft`);
  }
  if (typeof item.outputType !== "string" || !item.outputType.trim()) {
    throw new Error(`b448 notes: fixture ${item.id} has no output type`);
  }
  const before = getLlmSpend();
  if ((Number(before.costUsd) || 0) >= CEILING_USD) {
    writeFileSync(OUT, `${JSON.stringify({ gitSha, model: READING_MODEL, ceilingUsd: CEILING_USD, stoppedBefore: item.id, drafts, spend: before }, null, 2)}\n`);
    throw new Error(`b448 notes: USD ${Number(before.costUsd).toFixed(4)} reached the ceiling before fixture ${item.id}`);
  }
  const raws = [];
  const complete = async (messages, spanName) => {
    const schema = writerJsonSchemaForSpan(spanName);
    if (!schema) throw new Error(`b448 notes: span ${spanName} has no note schema`);
    const result = await callLLM({
      provider: "anthropic",
      model: READING_MODEL,
      messages,
      temperature: null,
      seed: 1,
      responseFormat: "json",
      jsonSchema: schema,
      spanName,
    });
    const block = toolBlock(result?.raw);
    raws.push({
      spanName,
      stopReason: result?.raw?.stop_reason ?? null,
      toolInput: block ? (block.input ?? null) : null,
      extracted: typeof result?.text === "string" ? result.text : "",
      usage: result?.usage || null,
    });
    return typeof result?.text === "string" ? result.text : "";
  };
  const settled = await writerNote(item.draft, complete);
  const after = getLlmSpend();
  const row = {
    id: item.id,
    outputType: item.outputType,
    status: settled.writerFeedbackStatus,
    note: typeof settled.writerFeedback === "string" ? settled.writerFeedback : null,
    refusal: settled.writerFeedbackRefusal || null,
    attempts: Array.isArray(settled.writerFeedbackAttempts) ? settled.writerFeedbackAttempts : [],
    calls: raws,
    spend: spendDelta(before, after),
  };
  drafts.push(row);
  process.stdout.write(`F${item.id} ${row.status} chars=${row.note ? row.note.length : 0} calls=${raws.length} spend=${Number(after.costUsd).toFixed(4)}\n`);
}

const spend = getLlmSpend();
const body = {
  gitSha,
  model: READING_MODEL,
  ceilingUsd: CEILING_USD,
  drafts,
  spend,
};
writeFileSync(OUT, `${JSON.stringify(body, null, 2)}\n`);
const withheld = drafts.filter((row) => row.status !== "shown").length;
process.stdout.write(`Wrote ${OUT}\n`);
process.stdout.write(`shown ${drafts.length - withheld} of ${drafts.length} spend ${Number(spend.costUsd).toFixed(6)}\n`);
