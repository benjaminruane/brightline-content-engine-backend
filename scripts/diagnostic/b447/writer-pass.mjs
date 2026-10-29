/**
 * B447. The writer step only, on the twenty B446 drafts. No pipeline.
 * Ceiling USD 5.
 *
 *   node scripts/diagnostic/b447/writer-pass.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, getLlmSpend } = await import("../../../lib/observability.js");
const { READING_MODEL, writerJsonSchemaForSpan, writerNote } = await import("../../../lib/qc/reading-review.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "RESULT.md");
const CEILING_USD = 5;

function show(text) {
  return String(text ?? "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function toolInput(raw) {
  const blocks = Array.isArray(raw?.content) ? raw.content : [];
  const block = blocks.find((entry) => entry && entry.type === "tool_use" && entry.name === "json_response");
  if (!block) return null;
  return block.input ?? null;
}

const fixtures = await loadAllFixtures();
const selected = fixtures
  .map((fixture) => ({
    id: String(fixture.data?.id ?? "").padStart(2, "0"),
    draft: fixture.data?.draft,
  }))
  .filter((row) => row.id >= "01" && row.id <= "20")
  .sort((a, b) => a.id.localeCompare(b.id));
if (selected.length !== 20) throw new Error(`b447 writer: expected 20 drafts, found ${selected.length}`);

const rows = [];
for (const item of selected) {
  if (typeof item.draft !== "string" || !item.draft.trim()) {
    throw new Error(`b447 writer: fixture ${item.id} has no draft`);
  }
  const spent = Number(getLlmSpend().costUsd) || 0;
  if (spent >= CEILING_USD) {
    throw new Error(`b447 writer: USD ${spent.toFixed(4)} reached the ceiling before fixture ${item.id}`);
  }
  const raws = [];
  const complete = async (messages, spanName) => {
    const schema = writerJsonSchemaForSpan(spanName);
    if (!schema) throw new Error(`b447 writer: span ${spanName} has no note schema`);
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
    raws.push({ spanName, raw: result?.raw || null });
    return typeof result?.text === "string" ? result.text : "";
  };
  const settled = await writerNote(item.draft, complete);
  rows.push({
    id: item.id,
    status: settled.writerFeedbackStatus,
    refusal: settled.writerFeedbackRefusal || "",
    attempts: Array.isArray(settled.writerFeedbackAttempts) ? settled.writerFeedbackAttempts.length : 0,
    note: typeof settled.writerFeedback === "string" ? settled.writerFeedback : "",
    calls: raws.map((entry) => ({
      span: entry.spanName,
      stopReason: entry.raw?.stop_reason ?? null,
      toolInput: toolInput(entry.raw),
    })),
  });
  process.stdout.write(`F${item.id} ${settled.writerFeedbackStatus} calls=${raws.length} spend=${Number(getLlmSpend().costUsd).toFixed(4)}\n`);
}

const spend = getLlmSpend();
const withheld = rows.filter((row) => row.status === "withheld");
const lines = [];
lines.push("# B447");
lines.push("");
lines.push("The probe in `scripts/diagnostic/b447/PROBE.md` showed fixtures 01 and 02 satisfying the writer tool with {}. That string is valid JSON, so the schema retry did not run, and writerText found no note key. The fix gives that call a schema with a required `note` string. No other JSON call passes a schema, so each keeps `{ type: \"object\", additionalProperties: true }`. The prompt, the craft-note ban, and the per-sentence note path are unchanged.");
lines.push("");
lines.push("This run is the writer step only, on the twenty drafts from the B446 fixtures. No pipeline.");
lines.push("");
lines.push(`Withheld: ${withheld.length} of 20. B446 was 15 of 20.`);
lines.push(`Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Input ${spend.inputTokens}. Output ${spend.outputTokens}. Cached input ${spend.cachedInputTokens}. Unpriced ${spend.unpricedCalls}.`);
lines.push(`Ceiling USD ${CEILING_USD}. ${Number(spend.costUsd) < CEILING_USD ? "Not crossed." : "Crossed."}`);
lines.push("Opus records no cached input on this path, so discounted USD is the list figure.");
lines.push("");
lines.push("## Each draft");
lines.push("");
for (const row of rows) {
  lines.push(`- Fixture ${row.id}: ${row.status}.${row.attempts ? ` Attempts ${row.attempts}.` : ""}${row.refusal ? ` Reason ${show(row.refusal)}.` : ""}`);
}
lines.push("");
lines.push("## Still withheld");
lines.push("");
if (!withheld.length) {
  lines.push("None.");
} else {
  for (const row of withheld) {
    lines.push(`### Fixture ${row.id}`);
    lines.push("");
    lines.push(`Reason: ${show(row.refusal) || "(none)"}.`);
    for (const call of row.calls) {
      lines.push(`${call.span} stop_reason: ${call.stopReason}.`);
      lines.push("Tool input:");
      lines.push("");
      lines.push("```");
      lines.push(show(call.toolInput == null ? "(no tool_use block)" : JSON.stringify(call.toolInput, null, 2)));
      lines.push("```");
      lines.push("");
    }
  }
}
lines.push("");

writeFileSync(OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${OUT}\n`);
process.stdout.write(`withheld ${withheld.length} of 20 spend ${Number(spend.costUsd).toFixed(6)}\n`);
