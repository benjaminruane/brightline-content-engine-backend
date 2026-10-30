/**
 * B450. Print the composed prompt, then the writer step on the twenty drafts.
 * Ceiling USD 2. No pipeline.
 *
 *   node scripts/diagnostic/b450/notes.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { noteHouseStyleCounts } from "../../../lib/qc/note-house-style.mjs";
import { WRITER_FEEDBACK_PROMPT } from "../../../lib/qc/reading-contract.mjs";
import {
  NOTE_ENFORCED_REWRITES,
  NOTE_PROMPT_ONLY,
  NOTE_STYLE_EXCLUSIONS,
  enforcedNoteStyleRuleIds,
  writerNoteStyleBlock,
} from "../../../lib/qc/note-style-block.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_OUT = path.join(__dirname, "notes.json");
const RESULT_OUT = path.join(__dirname, "RESULT.md");
const PRIOR = path.join(__dirname, "../b449/notes.json");
const EARLIER = path.join(__dirname, "../b448/notes.json");
const CEILING_USD = 2;

const BRITISH = [
  /\b\w*ise\b/gi,
  /\b\w*isations?\b/gi,
  /\b\w*ised\b/gi,
  /\b\w*ising\b/gi,
  /\b\w*our\b/gi,
  /\b\w*ours\b/gi,
  /\b\w*oured\b/gi,
  /\b\w*ouring\b/gi,
  /\bcentres?\b/gi,
  /\btheatres?\b/gi,
  /\blitres?\b/gi,
  /\bmetres?\b/gi,
  /\bdefences?\b/gi,
  /\boffences?\b/gi,
  /\blicences?\b/gi,
  /\bgrey\b/gi,
  /\bjudgements?\b/gi,
  /\bcheques?\b/gi,
  /\btravelled\b/gi,
  /\btravelling\b/gi,
  /\bcancelled\b/gi,
  /\bcancelling\b/gi,
  /\bmodelled\b/gi,
  /\bmodelling\b/gi,
  /\blabelled\b/gi,
  /\blabelling\b/gi,
  /\bwhilst\b/gi,
  /\bamongst\b/gi,
  /\btowards\b/gi,
];
const BRITISH_ALLOW = /^(?:rise|wise|advise|exercise|promise|surprise|supervise|comprise|devise|revise|enterprise|franchise|merchandise|disguise|despise|chastise|paradise|expertise|otherwise|likewise|our|your|hour|hours|four|pour|tour|source|course|court)$/i;

function show(text) {
  return String(text ?? "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function britishWords(text) {
  const found = new Map();
  for (const pattern of BRITISH) {
    for (const match of String(text).matchAll(pattern)) {
      const word = match[0];
      if (BRITISH_ALLOW.test(word)) continue;
      const key = word.toLowerCase();
      found.set(key, (found.get(key) || 0) + 1);
    }
  }
  return [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function meanLength(drafts) {
  const notes = drafts.map((row) => row.note).filter((note) => typeof note === "string");
  if (!notes.length) return 0;
  return notes.reduce((sum, note) => sum + note.length, 0) / notes.length;
}

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

if (WRITER_FEEDBACK_PROMPT.includes("plain hyphens, never a long dash")) {
  throw new Error("b450: the hand-written house-style line is still in the prompt");
}
if (/[\u2014\u2013\u201C\u201D\u2018\u2019]/.test(WRITER_FEEDBACK_PROMPT)) {
  throw new Error("b450: the composed prompt contains a long dash or a curly quote");
}
if (!WRITER_FEEDBACK_PROMPT.includes(writerNoteStyleBlock())) {
  throw new Error("b450: the prompt does not contain the composed block");
}
enforcedNoteStyleRuleIds();

loadLocalEnvFiles({ liveMeasurement: true });
const { callLLM, getLlmSpend } = await import("../../../lib/observability.js");
const { READING_MODEL, writerJsonSchemaForSpan, writerNote } = await import("../../../lib/qc/reading-review.mjs");

const fixtures = await loadAllFixtures();
const selected = fixtures
  .map((fixture) => ({
    id: String(fixture.data?.id ?? "").padStart(2, "0"),
    draft: fixture.data?.draft,
    outputType: fixture.data?.config?.outputType,
  }))
  .filter((row) => row.id >= "01" && row.id <= "20")
  .sort((a, b) => a.id.localeCompare(b.id));
if (selected.length !== 20) throw new Error(`b450 notes: expected 20 drafts, found ${selected.length}`);

const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const drafts = [];

for (const item of selected) {
  if (typeof item.draft !== "string" || !item.draft.trim()) {
    throw new Error(`b450 notes: fixture ${item.id} has no draft`);
  }
  if (typeof item.outputType !== "string" || !item.outputType.trim()) {
    throw new Error(`b450 notes: fixture ${item.id} has no output type`);
  }
  const before = getLlmSpend();
  if ((Number(before.costUsd) || 0) >= CEILING_USD) {
    throw new Error(`b450 notes: USD ${Number(before.costUsd).toFixed(4)} reached the ceiling before fixture ${item.id}`);
  }
  const raws = [];
  const complete = async (messages, spanName) => {
    const schema = writerJsonSchemaForSpan(spanName);
    if (!schema) throw new Error(`b450 notes: span ${spanName} has no note schema`);
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
  const rawNote = typeof raws.at(-1)?.toolInput?.note === "string" ? raws.at(-1).toolInput.note : null;
  drafts.push({
    id: item.id,
    outputType: item.outputType,
    status: settled.writerFeedbackStatus,
    note: typeof settled.writerFeedback === "string" ? settled.writerFeedback : null,
    rawNote,
    refusal: settled.writerFeedbackRefusal || null,
    attempts: Array.isArray(settled.writerFeedbackAttempts) ? settled.writerFeedbackAttempts : [],
    calls: raws,
    spend: spendDelta(before, after),
  });
  process.stdout.write(`F${item.id} ${settled.writerFeedbackStatus} chars=${typeof settled.writerFeedback === "string" ? settled.writerFeedback.length : 0} spend=${Number(after.costUsd).toFixed(4)}\n`);
}

const spend = getLlmSpend();
writeFileSync(NOTES_OUT, `${JSON.stringify({ gitSha, model: READING_MODEL, ceilingUsd: CEILING_USD, drafts, spend }, null, 2)}\n`);

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const earlier = JSON.parse(readFileSync(EARLIER, "utf8"));
const rawTotals = { emDashes: 0, enDashes: 0, percentWords: 0, quotedPercentWords: 0 };
const shownTotals = { emDashes: 0, enDashes: 0, percentWords: 0, quotedPercentWords: 0 };
const spellings = [];
let withheld = 0;
for (const draft of drafts) {
  if (draft.status !== "shown") withheld += 1;
  if (typeof draft.rawNote === "string") {
    const counts = noteHouseStyleCounts(draft.rawNote);
    rawTotals.emDashes += counts.emDashes;
    rawTotals.enDashes += counts.enDashes;
    rawTotals.percentWords += counts.percentWords;
    rawTotals.quotedPercentWords += counts.quotedPercentWords;
  }
  if (typeof draft.note === "string") {
    const counts = noteHouseStyleCounts(draft.note);
    shownTotals.emDashes += counts.emDashes;
    shownTotals.enDashes += counts.enDashes;
    shownTotals.percentWords += counts.percentWords;
    shownTotals.quotedPercentWords += counts.quotedPercentWords;
    const words = britishWords(draft.note);
    if (words.length) spellings.push({ id: draft.id, words });
  }
}
const priorSpellings = [];
for (const draft of prior.drafts || []) {
  const words = britishWords(draft.note || "");
  if (words.length) priorSpellings.push({ id: draft.id, words });
}

const lines = [];
lines.push("# B450");
lines.push("");
lines.push("## Which rules apply to the note");
lines.push("");
lines.push("The note is prose an editor writes to a writer. It is not the draft. Universal house-style rules are the candidates. Voice, person, and rules whose job is to judge the draft's argument or register are excluded, because the note is allowed to talk about those things and must not be forced into the draft's voice.");
lines.push("");
lines.push("Excluded:");
for (const row of NOTE_STYLE_EXCLUSIONS) lines.push(`- \`${row.id}\`. ${row.reason}`);
lines.push("");
lines.push("The code enforces a rule only when one pattern has one correct form.");
lines.push("");
lines.push("Enforced:");
for (const row of NOTE_ENFORCED_REWRITES) lines.push(`- \`${row.id}\`. ${row.reason}`);
lines.push("");
lines.push("Prompt only:");
for (const row of NOTE_PROMPT_ONLY) lines.push(`- \`${row.id}\`. ${row.reason}`);
lines.push("");
lines.push("## The prompt");
lines.push("");
lines.push("```");
lines.push(WRITER_FEEDBACK_PROMPT);
lines.push("```");
lines.push("");
lines.push("## The writer step");
lines.push("");
lines.push("Same twenty drafts. Writer only. No pipeline. The stored note is the text after substitution. `rawNote` is the tool input before it.");
lines.push("");
lines.push(`Withheld: ${withheld} of 20. B449 was 0 of 20.`);
lines.push(`Mean note length: ${meanLength(drafts).toFixed(0)} characters. B449 was ${meanLength(prior.drafts).toFixed(0)}. B448, before the hand-written line, was ${meanLength(earlier.drafts).toFixed(0)}.`);
lines.push(`Raw model output, before substitution: em dashes ${rawTotals.emDashes}, en dashes ${rawTotals.enDashes}, unquoted percent words ${rawTotals.percentWords}, quoted percent words ${rawTotals.quotedPercentWords}. B449 raw was 4 em dashes and 0 unquoted percent words.`);
lines.push(`Shown note, after substitution: em dashes ${shownTotals.emDashes}, en dashes ${shownTotals.enDashes}, unquoted percent words ${shownTotals.percentWords}, quoted percent words ${shownTotals.quotedPercentWords}.`);
lines.push(`British spellings in the shown notes: ${spellings.length} notes. B449, measured with the same word list, was ${priorSpellings.length} notes.`);
if (spellings.length) {
  for (const row of spellings) lines.push(`- Fixture ${row.id}: ${row.words.map(([word, count]) => `${word} ${count}`).join(", ")}.`);
} else {
  lines.push("None.");
}
if (priorSpellings.length) {
  lines.push("B449 words, for the comparison:");
  for (const row of priorSpellings) lines.push(`- Fixture ${row.id}: ${row.words.map(([word, count]) => `${word} ${count}`).join(", ")}.`);
}
lines.push(`Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Input ${spend.inputTokens}. Output ${spend.outputTokens}. Cached input ${spend.cachedInputTokens}. Unpriced ${spend.unpricedCalls}.`);
lines.push(`Ceiling USD ${CEILING_USD}. ${Number(spend.costUsd) < CEILING_USD ? "Not crossed." : "Crossed."}`);
lines.push("Opus records no cached input on this path, so discounted USD is the list figure.");
lines.push("");
lines.push("## Each draft");
lines.push("");
for (const draft of drafts) {
  const raw = typeof draft.rawNote === "string" ? noteHouseStyleCounts(draft.rawNote) : null;
  const rawBit = raw ? ` Raw em ${raw.emDashes}, en ${raw.enDashes}, percent words ${raw.percentWords}.` : "";
  const chars = typeof draft.note === "string" ? draft.note.length : 0;
  lines.push(`- Fixture ${draft.id}: ${draft.status}. ${chars} characters.${rawBit}`);
}
lines.push("");
lines.push("## House-style commentary");
lines.push("");
lines.push("Filled after reading the stored notes.");
lines.push("");

writeFileSync(RESULT_OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${NOTES_OUT}\n`);
process.stdout.write(`Wrote ${RESULT_OUT}\n`);
process.stdout.write(`withheld ${withheld} of 20 mean ${meanLength(drafts).toFixed(0)} spend ${Number(spend.costUsd).toFixed(6)}\n`);
process.stdout.write(`raw em ${rawTotals.emDashes} percent ${rawTotals.percentWords} british ${spellings.length}\n`);
