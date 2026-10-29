/**
 * B447. One writer call per draft, the same call defaultComplete makes.
 * No pipeline. Cache off.
 *
 *   node scripts/diagnostic/b447/probe.mjs
 *
 * Fixtures 01, 02 and 03 withheld the note on B446. Fixture 05 showed one.
 * Those four are the probe. The choice was made before the calls.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, getLlmSpend, calculateLlmCostUsd } = await import("../../../lib/observability.js");
const { READING_MODEL, writerText } = await import("../../../lib/qc/reading-review.mjs");
const { WRITER_FEEDBACK_PROMPT } = await import("../../../lib/qc/reading-contract.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "PROBE.md");
const CEILING_USD = 1;
const IDS = [
  { id: "01", b446: "withheld" },
  { id: "02", b446: "withheld" },
  { id: "03", b446: "withheld" },
  { id: "05", b446: "shown" },
];

function show(text) {
  return String(text ?? "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function toolBlock(raw) {
  const blocks = Array.isArray(raw?.content) ? raw.content : [];
  return blocks.find((block) => block && block.type === "tool_use" && block.name === "json_response") || null;
}

function extractedString(raw) {
  const block = toolBlock(raw);
  if (!block || typeof block.input !== "object" || block.input == null) return "";
  return JSON.stringify(block.input);
}

const fixtures = await loadAllFixtures();
const byId = new Map();
for (const fixture of fixtures) {
  const id = String(fixture.data?.id ?? "").padStart(2, "0");
  byId.set(id, fixture);
}

const rows = [];
for (const item of IDS) {
  const fixture = byId.get(item.id);
  const draft = fixture?.data?.draft;
  if (typeof draft !== "string" || !draft.trim()) {
    throw new Error(`b447 probe: fixture ${item.id} has no draft`);
  }
  const before = getLlmSpend();
  const beforeCalls = Number(before?.calls) || 0;
  const beforeList = Number(before?.costUsd) || 0;
  const result = await callLLM({
    provider: "anthropic",
    model: READING_MODEL,
    messages: [
      { role: "system", content: WRITER_FEEDBACK_PROMPT },
      { role: "user", content: draft },
    ],
    temperature: null,
    seed: 1,
    responseFormat: "json",
    spanName: "b404-writer",
  });
  const after = getLlmSpend();
  const calls = (Number(after?.calls) || 0) - beforeCalls;
  const listDelta = (Number(after?.costUsd) || 0) - beforeList;
  if ((Number(after?.costUsd) || 0) > CEILING_USD) {
    throw new Error(`b447 probe: spend USD ${after.costUsd} crossed ${CEILING_USD}`);
  }
  const raw = result?.raw || {};
  const blocks = Array.isArray(raw.content) ? raw.content : [];
  const block = toolBlock(raw);
  const text = typeof result?.text === "string" ? result.text : "";
  rows.push({
    id: item.id,
    b446: item.b446,
    stopReason: raw.stop_reason ?? null,
    blockTypes: blocks.map((entry) => entry?.type ?? null),
    toolInput: block ? block.input : null,
    extracted: extractedString(raw),
    returnedText: text,
    writer: writerText(text),
    calls,
    listUsd: listDelta,
    usage: result?.usage || null,
  });
  process.stdout.write(
    `F${item.id} stop=${raw.stop_reason} blocks=${rows.at(-1).blockTypes.join(",")} calls=${calls} writer=${JSON.stringify(rows.at(-1).writer).slice(0, 80)}\n`
  );
}

const spend = getLlmSpend();
const lines = [];
lines.push("# B447 probe");
lines.push("");
lines.push("Four writer calls. Same model, prompt, response format, temperature, and seed as `defaultComplete` in `lib/qc/reading-review.mjs`. Cache off. No pipeline. Fixtures 01, 02, and 03 withheld the note on B446. Fixture 05 showed one. The four were chosen before the calls.");
lines.push("");
lines.push(`Model \`${READING_MODEL}\`. Prompt \`WRITER_FEEDBACK_PROMPT\`. responseFormat json. temperature omitted, because the product passes null. seed 1, which this Anthropic call does not send.`);
lines.push("");
lines.push(`Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Unpriced ${spend.unpricedCalls}.`);
lines.push("");

for (const row of rows) {
  lines.push(`## Fixture ${row.id}`);
  lines.push("");
  lines.push(`B446 status: ${row.b446}.`);
  lines.push(`stop_reason: ${row.stopReason}.`);
  lines.push(`Content block types: ${row.blockTypes.length ? row.blockTypes.join(", ") : "none"}.`);
  lines.push("Tool input:");
  lines.push("");
  lines.push("```");
  lines.push(show(row.toolInput == null ? "(no tool_use block)" : JSON.stringify(row.toolInput, null, 2)));
  lines.push("```");
  lines.push("");
  lines.push("String from the same extraction `extractToolJsonTextFromAnthropicResponse` does:");
  lines.push("");
  lines.push("```");
  lines.push(show(row.extracted || "(empty string)"));
  lines.push("```");
  lines.push("");
  lines.push(`The string callLLM returned ${row.returnedText === row.extracted ? "matches" : "does not match"} that extraction.`);
  lines.push(`writerText extracts: ${JSON.stringify(show(row.writer))}.`);
  lines.push(`Provider calls this complete() consumed: ${row.calls}.`);
  lines.push(`Discounted USD for this call: ${row.listUsd.toFixed(6)}.`);
  lines.push("");
}

const emptyObjects = rows.filter((row) => {
  const input = row.toolInput;
  return input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0;
});
const noNote = rows.filter((row) => row.writer === "");
lines.push("## What this shows");
lines.push("");
if (emptyObjects.length && emptyObjects.every((row) => row.writer === "" && row.calls === 1)) {
  lines.push(`${emptyObjects.map((row) => row.id).join(", ")} returned a tool input of {}. writerText found no note, feedback, or text key and returned the empty string. Each of those complete() calls consumed ${emptyObjects[0].calls} provider call, so the schema retry inside callLLM did not fire. {} is valid JSON, which is why that retry stays quiet.`);
} else if (noNote.length) {
  lines.push(`${noNote.length} calls produced no note. The tool inputs are above. They are not all empty objects, so the empty-object hypothesis is not the whole story.`);
} else {
  lines.push("Every call produced a note. The empty-object hypothesis is not what these four calls did.");
}
lines.push("");

writeFileSync(OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${OUT}\n`);
process.stdout.write(`spend calls=${spend.calls} usd=${Number(spend.costUsd).toFixed(6)}\n`);
