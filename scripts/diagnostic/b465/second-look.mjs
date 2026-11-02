/**
 * B465 part 4. One question per stored wording note. No pipeline.
 * Ceiling USD 5. Cache off.
 *
 *   node scripts/diagnostic/b465/second-look.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
const { calculateLlmCostUsd, callLLM } = await import("../../../lib/observability.js");
const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
if (isLlmCacheEnabled()) {
  throw new Error("b465 second look: the cache is on");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ANSWERS = path.join(__dirname, "second-look.json");
const NOTES = path.join(__dirname, "NOTES.md");
const MODEL = "claude-opus-4-7";
const CEILING = 5;
const NAMED = ["04:1", "18:2", "08:13", "11:12"];

const PROMPT = `A note filed as a wording difference is below. It describes a difference between a draft sentence and the source.

Does that difference change the claim a reader would act on?

Reply with JSON only, in this shape: {"changes": true, "reason": "one sentence"} or {"changes": false, "reason": "one sentence"}.

The reason is one sentence. Do not grade the draft. Do not say whether the draft should stand. Say only whether the difference the note describes would change what a reader does.`;

if (endorsementHit(PROMPT)) {
  throw new Error(`b465 second look: the prompt contains a banned phrase (${endorsementHit(PROMPT)})`);
}

function pad(id) {
  return String(id).padStart(2, "0");
}
function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}
function clean(text) {
  return String(text || "")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function oneSentence(text) {
  const body = clean(text);
  if (!body) return "";
  const parts = body.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
  return parts.length === 1 ? body : "";
}
function parseAnswer(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || ""));
  } catch {
    return null;
  }
  if (!parsed || (parsed.changes !== true && parsed.changes !== false)) return null;
  const reason = oneSentence(parsed.reason);
  if (!reason) return null;
  return { changes: parsed.changes, reason };
}

const cards = JSON.parse(readFileSync(PASS, "utf8")).cards;
const notes = cards
  .filter((card) => card.readingNote?.bucket === "wording" && String(card.readingNote.text || "").trim())
  .map((card) => ({
    key: keyOf(card),
    statement: clean(card.statement),
    note: clean(card.readingNote.text),
  }));
if (notes.length !== 113) {
  throw new Error(`b465 second look: expected 113 wording notes, found ${notes.length}`);
}

let stored = { answers: [], spend: emptySpend() };
try {
  stored = JSON.parse(readFileSync(ANSWERS, "utf8"));
  if (!Array.isArray(stored.answers)) stored.answers = [];
  if (!stored.spend) stored.spend = emptySpend();
} catch {
  stored = { answers: [], spend: emptySpend() };
}
const done = new Set(stored.answers.map((row) => row.key));

function emptySpend() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0, unpricedCalls: 0 };
}

function listUsd(usage) {
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (input / 1_000_000) * 5 + (output / 1_000_000) * 25;
}

async function ask(note) {
  const messages = [
    { role: "system", content: PROMPT },
    { role: "user", content: `Note:\n${note.note}` },
  ];
  let last = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (stored.spend.costUsd >= CEILING) {
      throw new Error(`b465 second look: ceiling USD ${CEILING} reached before ${note.key}`);
    }
    const result = await callLLM({
      provider: "anthropic",
      model: MODEL,
      messages,
      temperature: null,
      responseFormat: "json",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["changes", "reason"],
        properties: {
          changes: { type: "boolean" },
          reason: { type: "string" },
        },
      },
      spanName: "b465-wording-look",
    });
    const usage = result?.usage || {};
    const priced = calculateLlmCostUsd("anthropic", MODEL, usage);
    stored.spend.calls += 1;
    stored.spend.inputTokens += Number(usage.inputTokens) || 0;
    stored.spend.outputTokens += Number(usage.outputTokens) || 0;
    stored.spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
    if (!usage.inputTokens && !usage.outputTokens) {
      stored.spend.unpricedCalls += 1;
      throw new Error(`b465 second look: ${note.key} returned no usage`);
    }
    if (!(priced > 0)) {
      stored.spend.unpricedCalls += 1;
      throw new Error(`b465 second look: ${note.key} was not priced`);
    }
    stored.spend.costUsd += priced;
    stored.spend.listUsd += listUsd(usage);
    last = typeof result.text === "string" ? result.text : "";
    const parsed = parseAnswer(last);
    if (parsed) return { ...parsed, raw: last };
  }
  return { changes: null, reason: "", raw: last, shape: "the reply was not a yes or no with one sentence" };
}

const pending = notes.filter((note) => !done.has(note.key));
console.log(`b465 second look: ${pending.length} to ask, ${done.size} already stored`);

for (const note of pending) {
  if (stored.spend.costUsd >= CEILING) {
    writeFileSync(ANSWERS, JSON.stringify(stored, null, 2));
    throw new Error(`b465 second look: stopped at USD ${stored.spend.costUsd.toFixed(4)}. ${stored.answers.length} of 113 answered.`);
  }
  const answer = await ask(note);
  stored.answers.push({ ...note, ...answer });
  writeFileSync(ANSWERS, JSON.stringify(stored, null, 2));
  console.log(`${note.key} ${answer.changes === true ? "yes" : answer.changes === false ? "no" : "shape"} USD ${stored.spend.costUsd.toFixed(4)}`);
}

const byKey = new Map(stored.answers.map((row) => [row.key, row]));
const missing = notes.filter((note) => !byKey.has(note.key));
if (missing.length) {
  throw new Error(`b465 second look: ${missing.length} notes have no answer`);
}
const ordered = notes.map((note) => byKey.get(note.key));
const yes = ordered.filter((row) => row.changes === true);
const no = ordered.filter((row) => row.changes === false);
const bad = ordered.filter((row) => row.changes !== true && row.changes !== false);

const lines = [];
lines.push("# B465. A second look at every wording note.");
lines.push("");
lines.push("One question, asked of each of the 113 notes stored on the B464 pass. No pipeline. The question was whether the difference the note describes changes the claim a reader would act on.");
lines.push("");
lines.push(`Answered: ${ordered.length} of 113. Yes: ${yes.length}. No: ${no.length}. Shape failed: ${bad.length}.`);
lines.push("");
lines.push(`The rate at which the wording bucket buries a claim, on this second look: ${yes.length} of 113.`);
lines.push("");
lines.push("## The four named notes");
lines.push("");
for (const key of NAMED) {
  const row = byKey.get(key);
  lines.push(`### ${key}`);
  lines.push("");
  lines.push(clean(row.note));
  lines.push("");
  lines.push(`${row.changes === true ? "Yes" : row.changes === false ? "No" : "No shape"}. ${clean(row.reason) || clean(row.shape)}`);
  lines.push("");
}
lines.push("## All 113");
lines.push("");
for (const row of ordered) {
  const verdict = row.changes === true ? "Yes" : row.changes === false ? "No" : "No shape";
  lines.push(`### ${row.key}. ${verdict}`);
  lines.push("");
  lines.push(clean(row.note));
  lines.push("");
  lines.push(clean(row.reason) || clean(row.shape) || "(no sentence)");
  lines.push("");
}
const spend = stored.spend;
lines.push("## Spend");
lines.push("");
lines.push(`Model: ${MODEL}. Calls: ${spend.calls}. Unpriced calls: ${spend.unpricedCalls}.`);
lines.push(`Discounted: USD ${spend.costUsd.toFixed(4)}. List: USD ${spend.listUsd.toFixed(4)}.`);
lines.push(`Input tokens: ${spend.inputTokens}. Output tokens: ${spend.outputTokens}. Cached input: ${spend.cachedInputTokens}.`);
lines.push("Ceiling USD 5. Opus has no cached rate, so list and discounted use the same published rates.");
lines.push("");

writeFileSync(NOTES, `${lines.join("\n")}\n`);
console.log(`yes ${yes.length} no ${no.length} bad ${bad.length} USD ${spend.costUsd.toFixed(4)}`);
if (bad.length || ordered.length !== 113) process.exit(1);
