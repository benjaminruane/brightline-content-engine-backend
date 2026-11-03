/**
 * B471. One question per stored wording note. No pipeline. No product change.
 * The scoring key is applied after the answers exist. It is not sent to the model.
 * Ceiling USD 5. Cache off.
 *
 *   node scripts/diagnostic/b471/second-look.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENDORSEMENT_PHRASE_RECORDS, endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
const { calculateLlmCostUsd, callLLM } = await import("../../../lib/observability.js");
const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
if (isLlmCacheEnabled()) {
  throw new Error("b471 second look: the cache is on");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ANSWERS = path.join(__dirname, "second-look.json");
const NOTES = path.join(__dirname, "NOTES.md");
const MODEL = "claude-opus-4-7";
const CEILING = 5;
const ANSWERS_ALLOWED = new Set(["conflicts", "beyond", "none"]);

const QUESTION = `A note filed as a wording difference is below. It describes a difference between a draft sentence and the source.

Does the draft assert something the source contradicts, or something the source does not support, or neither?

A draft that says less than the source asserts nothing new. Dropping a qualifier, an ordinal, a figure, or a scenario is the draft saying less. The answer then is neither.

Reply with JSON only, in this shape: {"answer":"conflicts","reason":"one sentence"} or {"answer":"beyond","reason":"one sentence"} or {"answer":"none","reason":"one sentence"}.

conflicts means the draft asserts something the source contradicts.
beyond means the draft asserts something the source does not support.
none means neither.

The reason is one sentence. Do not grade the statement. Do not say whether the statement should stand.`;

const forbidden = ENDORSEMENT_PHRASE_RECORDS.map((row) => row.phrase).join(", ");
const PROMPT = `${QUESTION}\n\nUse none of these words in the reason: ${forbidden}.`;

if (endorsementHit(QUESTION)) {
  throw new Error(`b471 second look: the question contains a banned phrase (${endorsementHit(QUESTION)})`);
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
  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  if (!ANSWERS_ALLOWED.has(answer)) return null;
  const reason = oneSentence(parsed.reason);
  if (!reason) return null;
  return { answer, reason };
}
function emptySpend() {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0, listUsd: 0, unpricedCalls: 0 };
}
function listUsd(usage) {
  const input = Number(usage?.inputTokens) || 0;
  const output = Number(usage?.outputTokens) || 0;
  return (input / 1_000_000) * 5 + (output / 1_000_000) * 25;
}

const cards = JSON.parse(readFileSync(PASS, "utf8")).cards;
const notes = cards
  .filter((card) => card.readingNote?.bucket === "wording" && String(card.readingNote.text || "").trim())
  .map((card) => ({
    key: keyOf(card),
    note: clean(card.readingNote.text),
  }));
if (notes.length !== 113) {
  throw new Error(`b471 second look: expected 113 wording notes, found ${notes.length}`);
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

async function ask(note) {
  const messages = [
    { role: "system", content: PROMPT },
    { role: "user", content: `Note:\n${note.note}` },
  ];
  let last = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (stored.spend.costUsd > CEILING) {
      throw new Error(`b471 second look: ceiling USD ${CEILING} reached before ${note.key}`);
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
        required: ["answer", "reason"],
        properties: {
          answer: { type: "string", enum: ["conflicts", "beyond", "none"] },
          reason: { type: "string" },
        },
      },
      spanName: "b471-second-look",
    });
    const usage = result?.usage || {};
    const priced = calculateLlmCostUsd("anthropic", MODEL, usage);
    stored.spend.calls += 1;
    stored.spend.inputTokens += Number(usage.inputTokens) || 0;
    stored.spend.outputTokens += Number(usage.outputTokens) || 0;
    stored.spend.cachedInputTokens += Number(usage.cachedInputTokens) || 0;
    if (!usage.inputTokens && !usage.outputTokens) {
      stored.spend.unpricedCalls += 1;
      throw new Error(`b471 second look: ${note.key} returned no usage`);
    }
    if (!(priced > 0)) {
      stored.spend.unpricedCalls += 1;
      throw new Error(`b471 second look: ${note.key} was not priced`);
    }
    stored.spend.costUsd += priced;
    stored.spend.listUsd += listUsd(usage);
    last = typeof result.text === "string" ? result.text : "";
    const parsed = parseAnswer(last);
    if (parsed) return { ...parsed, raw: last, banned: endorsementHit(parsed.reason) };
    if (stored.spend.costUsd > CEILING) break;
  }
  return { answer: "", reason: "", raw: last, shape: "the reply was not one of the three words with one sentence" };
}

const pending = notes.filter((note) => !done.has(note.key));
console.log(`b471 second look: ${pending.length} to ask, ${done.size} already stored`);

for (const note of pending) {
  if (stored.spend.costUsd > CEILING) {
    writeFileSync(ANSWERS, JSON.stringify(stored, null, 2));
    throw new Error(`b471 second look: stopped at USD ${stored.spend.costUsd.toFixed(4)}. ${stored.answers.length} of 113 answered.`);
  }
  const answer = await ask(note);
  stored.answers.push({ ...note, ...answer });
  writeFileSync(ANSWERS, JSON.stringify(stored, null, 2));
  console.log(`${note.key} ${answer.answer || "shape"} USD ${stored.spend.costUsd.toFixed(4)}`);
  if (stored.spend.costUsd > CEILING) {
    writeFileSync(ANSWERS, JSON.stringify(stored, null, 2));
    throw new Error(`b471 second look: stopped at USD ${stored.spend.costUsd.toFixed(4)}. ${stored.answers.length} of 113 answered.`);
  }
}

const byKey = new Map(stored.answers.map((row) => [row.key, row]));
const missing = notes.filter((note) => !byKey.has(note.key));
if (missing.length) {
  throw new Error(`b471 second look: ${missing.length} notes have no answer`);
}
const ordered = notes.map((note) => byKey.get(note.key));
const shown = ordered.filter((row) => row.answer === "conflicts" || row.answer === "beyond");
const hidden = ordered.filter((row) => row.answer === "none");
const bad = ordered.filter((row) => !ANSWERS_ALLOWED.has(row.answer));

const KEY = {
  "04:1": "conflicts",
  "10:4": "beyond",
  "17:6": "beyond",
  "05:2": "none",
  "11:12": "none",
  "15:12": "none",
  "15:25": "none",
  "18:2": "conflicts",
};
const KEY_WHY = {
  "04:1": "The source seeks approval. The draft says committed.",
  "10:4": "The source says support. The draft says support an acceleration of.",
  "17:6": "The source puts the 18 percent across the portfolio, with the strongest potential in two cities. The draft says it is concentrated in those two.",
  "05:2": "The draft says less than the source.",
  "11:12": "The draft says less than the source.",
  "15:12": "The draft says less than the source.",
  "15:25": "The draft says less than the source.",
  "18:2": "The reader already sees this card as a conflict by another route.",
};
const keyShown = new Set(Object.entries(KEY).filter(([, answer]) => answer !== "none").map(([key]) => key));
const misses = Object.entries(KEY).filter(([key, answer]) => byKey.get(key)?.answer !== answer);
const extras = shown.filter((row) => !keyShown.has(row.key));
let verdict;
if (misses.length === 0 && extras.length === 0 && bad.length === 0) {
  verdict = "The answers reproduce the key. The instrument is trustworthy enough to decide a bucket live.";
} else if (extras.length > 0) {
  verdict = "The answers return more than the key. The instrument is not trustworthy enough to decide a bucket live.";
} else {
  verdict = "The answers do not reproduce the key. The instrument is not trustworthy enough to decide a bucket live.";
}

const lines = [];
lines.push("# B471. The second look, asked the right question");
lines.push("");
lines.push("Each of the 113 wording notes stored on the B464 pass was asked once. No pipeline. The question was whether the draft asserts something the source contradicts, or something the source does not support, or neither. A draft that says less asserts nothing new, and the answer is neither.");
lines.push("");
lines.push("The scoring key was applied after the answers were stored. It was not in the prompt and it was not in the note the model read.");
lines.push("");
lines.push(`Answered: ${ordered.length} of 113. Conflicts: ${ordered.filter((row) => row.answer === "conflicts").length}. Beyond: ${ordered.filter((row) => row.answer === "beyond").length}. None: ${hidden.length}. Shape failed: ${bad.length}.`);
lines.push("");
lines.push(`Would be shown: ${shown.length}. Would stay hidden: ${hidden.length}.`);
lines.push("");
lines.push(verdict);
lines.push("");
lines.push("The product was not changed.");
lines.push("");
lines.push("## The eight cards");
lines.push("");
for (const [key, expected] of Object.entries(KEY)) {
  const row = byKey.get(key);
  const got = row?.answer || "no answer";
  const hit = got === expected ? "hit" : "miss";
  lines.push(`### ${key}. ${hit}`);
  lines.push("");
  lines.push(`Expected ${expected}. Answered ${got}.`);
  lines.push("");
  lines.push(KEY_WHY[key]);
  lines.push("");
  lines.push(clean(row?.note));
  lines.push("");
  lines.push(clean(row?.reason) || clean(row?.shape) || "(no sentence)");
  lines.push("");
}
if (extras.length) {
  lines.push("## Shown beyond the key");
  lines.push("");
  for (const row of extras) {
    lines.push(`### ${row.key}. ${row.answer}`);
    lines.push("");
    lines.push(clean(row.note));
    lines.push("");
    lines.push(clean(row.reason));
    lines.push("");
  }
}
if (misses.length) {
  lines.push("## Misses");
  lines.push("");
  lines.push(misses.map(([key, expected]) => `${key} expected ${expected}, answered ${byKey.get(key)?.answer || "nothing"}`).join(". ") + ".");
  lines.push("");
}
lines.push("## All 113");
lines.push("");
for (const row of ordered) {
  const label = ANSWERS_ALLOWED.has(row.answer) ? row.answer : "no shape";
  lines.push(`### ${row.key}. ${label}`);
  lines.push("");
  lines.push(clean(row.note));
  lines.push("");
  lines.push(clean(row.reason) || clean(row.shape) || "(no sentence)");
  lines.push("");
}
const banned = ordered.filter((row) => row.banned);
if (banned.length) {
  lines.push("## Reasons that used a refused word");
  lines.push("");
  lines.push(banned.map((row) => `${row.key} (${row.banned})`).join(", ") + ".");
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
console.log(`shown ${shown.length} hidden ${hidden.length} bad ${bad.length} misses ${misses.length} extras ${extras.length}`);
console.log(verdict);
console.log(`USD ${spend.costUsd.toFixed(4)} list ${spend.listUsd.toFixed(4)} calls ${spend.calls}`);
if (bad.length || ordered.length !== 113) process.exit(1);
