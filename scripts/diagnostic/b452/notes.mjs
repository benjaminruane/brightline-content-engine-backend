/**
 * B452. Writer step on the twenty drafts. The schema asks for paragraphs.
 * The prompt is not changed. Ceiling USD 2. No pipeline.
 *
 *   node scripts/diagnostic/b452/notes.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { WRITER_FEEDBACK_PROMPT } from "../../../lib/qc/reading-contract.mjs";
import { writerNoteStyleBlock } from "../../../lib/qc/note-style-block.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_OUT = path.join(__dirname, "notes.json");
const RESULT_OUT = path.join(__dirname, "RESULT.md");
const PAGE_OUT = path.join(__dirname, "../../../docs/design/craft-note-readability.html");
const PRIOR = path.join(__dirname, "../b450/notes.json");
const CEILING_USD = 2;
const QUOTE_INLINE_MAX = 80;
const NOTE_MEASURE_CH = 72;

const QUOTE_RE_SOURCE = /"([^"]*)"|\u201C([^\u201D]*)\u201D/.source;

function paragraphsOf(note) {
  if (typeof note !== "string" || !note.trim()) return [];
  return note.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

function quoteSpans(note) {
  const spans = [];
  for (const paragraph of paragraphsOf(note)) {
    const re = new RegExp(QUOTE_RE_SOURCE, "g");
    for (const match of paragraph.matchAll(re)) {
      const inner = match[1] != null ? match[1] : (match[2] ?? "");
      spans.push(inner.length);
    }
  }
  return spans;
}

function paragraphLabel(paragraph) {
  const match = String(paragraph).match(/^(\S+(?:\s+\S+){0,3}):/);
  return match ? match[0] : null;
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

function previewHtml(drafts) {
  const payload = drafts.map((row) => ({
    id: row.id,
    outputType: row.outputType,
    note: typeof row.note === "string" ? row.note : "",
  }));
  const notesJson = JSON.stringify(payload).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Craft note</title>
</head>
<body>
<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #e2e8f0; color: #0f172a; }
  .page { width: 760px; margin: 0 auto; padding: 28px 0 48px; }
  h1 { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  .lede { margin-top: 8px; font-size: 13px; line-height: 1.5; color: #334155; }
  .tune { margin-top: 14px; font-size: 13px; color: #334155; }
  .tune input { width: 4.5rem; font: inherit; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 6px; }
  .counts { margin-top: 8px; font-size: 13px; color: #475569; }
  .fixture { margin-top: 22px; }
  .meta { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 6px; }
  .band { border-top: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 16px; }
  .column { max-width: ${NOTE_MEASURE_CH}ch; font-size: 13px; line-height: 1.625; color: #475569; }
  .para + .para { margin-top: 1.625em; }
  .quote-inline { font-style: italic; }
  .quote-block { display: block; margin: 8px 0; padding-left: 1.5rem; font-style: normal; }
</style>
<div class="page">
  <h1>Craft note</h1>
  <p class="lede">The column is ${NOTE_MEASURE_CH} characters, the middle of the 68 to 78 range, and the usual measure for a column of prose. A quoted span renders inline, in italics, at ${QUOTE_INLINE_MAX} characters or fewer. Longer than that, it steps onto its own line, indented, in roman. The length is the characters between the quotation marks. The marks stay.</p>
  <p class="tune">Threshold <input id="threshold" type="number" min="1" value="${QUOTE_INLINE_MAX}"> characters</p>
  <p class="counts" id="counts"></p>
  <div id="notes"></div>
</div>
<script>
const NOTES = ${notesJson};
const MEASURE = ${NOTE_MEASURE_CH};

function paragraphsOf(note) {
  if (typeof note !== "string" || !note.trim()) return [];
  return note.split(/\\n\\s*\\n/).map((part) => part.trim()).filter(Boolean);
}

function runsIn(paragraph, max) {
  const runs = [];
  const re = /"([^"]*)"|\\u201C([^\\u201D]*)\\u201D/g;
  let cursor = 0;
  for (const match of paragraph.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ kind: "text", text: paragraph.slice(cursor, start) });
    const full = match[0];
    const inner = match[1] != null ? match[1] : (match[2] ?? "");
    runs.push({ kind: "quote", text: full, display: inner.length > max ? "block" : "inline" });
    cursor = start + full.length;
  }
  if (cursor < paragraph.length) runs.push({ kind: "text", text: paragraph.slice(cursor) });
  return runs;
}

function quoteLengths(note) {
  const lengths = [];
  for (const paragraph of paragraphsOf(note)) {
    const re = /"([^"]*)"|\\u201C([^\\u201D]*)\\u201D/g;
    for (const match of paragraph.matchAll(re)) {
      const inner = match[1] != null ? match[1] : (match[2] ?? "");
      lengths.push(inner.length);
    }
  }
  return lengths;
}

function render(max) {
  const lengths = NOTES.flatMap((row) => quoteLengths(row.note));
  const under = lengths.filter((length) => length <= max).length;
  const over = lengths.filter((length) => length > max).length;
  document.getElementById("counts").textContent = lengths.length + " quoted spans in these twenty notes. " + under + " at " + max + " characters or fewer, shown inline. " + over + " longer, set out on their own line.";
  const root = document.getElementById("notes");
  root.replaceChildren();
  for (const row of NOTES) {
    const fixture = document.createElement("div");
    fixture.className = "fixture";
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "Fixture " + row.id + "  " + row.outputType;
    const band = document.createElement("div");
    band.className = "band";
    const column = document.createElement("div");
    column.className = "column";
    paragraphsOf(row.note).forEach((paragraph) => {
      const block = document.createElement("div");
      block.className = "para";
      for (const run of runsIn(paragraph, max)) {
        const el = document.createElement(run.kind === "quote" && run.display === "inline" ? "em" : "span");
        if (run.kind === "quote") el.className = run.display === "block" ? "quote-block" : "quote-inline";
        el.textContent = run.text;
        block.appendChild(el);
      }
      column.appendChild(block);
    });
    band.appendChild(column);
    fixture.append(meta, band);
    root.appendChild(fixture);
  }
}

const input = document.getElementById("threshold");
input.addEventListener("input", () => {
  const max = Number(input.value);
  if (!Number.isInteger(max) || max < 1) return;
  render(max);
});
render(${QUOTE_INLINE_MAX});
</script>
</body>
</html>
`;
}

if (!WRITER_FEEDBACK_PROMPT.includes("Do not label the parts of the note and do not go sentence by sentence.")) {
  throw new Error("b452: the no-labels line is missing");
}
if (!WRITER_FEEDBACK_PROMPT.includes('Return JSON only: {"note":"..."}')) {
  throw new Error("b452: the return line changed");
}
if (!WRITER_FEEDBACK_PROMPT.includes(writerNoteStyleBlock())) {
  throw new Error("b452: the composed style block is missing");
}
if (WRITER_FEEDBACK_PROMPT.includes("at least two")) {
  throw new Error("b452: the prompt was changed to ask for paragraphs");
}

const fromNotes = process.argv.includes("--from-notes");
let drafts;
let spend;
let gitSha;

if (fromNotes) {
  const stored = JSON.parse(readFileSync(NOTES_OUT, "utf8"));
  if (!Array.isArray(stored.drafts) || stored.drafts.length !== 20) {
    throw new Error("b452: notes.json does not hold twenty drafts");
  }
  drafts = stored.drafts;
  spend = stored.spend;
  gitSha = stored.gitSha;
} else {
  loadLocalEnvFiles({ liveMeasurement: true });
  const loaded = await loadWriter();
  ({ drafts, spend, gitSha } = await runWriter(loaded));
  writeFileSync(NOTES_OUT, `${JSON.stringify({ gitSha, model: loaded.READING_MODEL, ceilingUsd: CEILING_USD, quoteInlineMax: QUOTE_INLINE_MAX, measureCh: NOTE_MEASURE_CH, drafts, spend }, null, 2)}\n`);
}

async function loadWriter() {
  const { callLLM, getLlmSpend } = await import("../../../lib/observability.js");
  const { READING_MODEL, joinWriterNoteParagraphs, writerJsonSchemaForSpan, writerNote } = await import("../../../lib/qc/reading-review.mjs");
  const schema = writerJsonSchemaForSpan("b404-writer");
  if (schema?.properties?.note?.type !== "array" || schema.properties.note.minItems !== 2) {
    throw new Error("b452: the writer schema does not require a list of at least two paragraphs");
  }
  if (writerJsonSchemaForSpan("b404-note") !== undefined) {
    throw new Error("b452: the per-sentence note gained a schema");
  }
  return { callLLM, getLlmSpend, READING_MODEL, joinWriterNoteParagraphs, writerJsonSchemaForSpan, writerNote };
}

async function runWriter(loaded) {
  const { callLLM, getLlmSpend, READING_MODEL, joinWriterNoteParagraphs, writerJsonSchemaForSpan, writerNote } = loaded;
  const fixtures = await loadAllFixtures();
  const selected = fixtures
    .map((fixture) => ({
      id: String(fixture.data?.id ?? "").padStart(2, "0"),
      draft: fixture.data?.draft,
      outputType: fixture.data?.config?.outputType,
    }))
    .filter((row) => row.id >= "01" && row.id <= "20")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (selected.length !== 20) throw new Error(`b452 notes: expected 20 drafts, found ${selected.length}`);

  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const rows = [];
  for (const item of selected) {
    if (typeof item.draft !== "string" || !item.draft.trim()) {
      throw new Error(`b452 notes: fixture ${item.id} has no draft`);
    }
    if (typeof item.outputType !== "string" || !item.outputType.trim()) {
      throw new Error(`b452 notes: fixture ${item.id} has no output type`);
    }
    const before = getLlmSpend();
    if ((Number(before.costUsd) || 0) >= CEILING_USD) {
      throw new Error(`b452 notes: USD ${Number(before.costUsd).toFixed(4)} reached the ceiling before fixture ${item.id}`);
    }
    const raws = [];
    const complete = async (messages, spanName) => {
      const spanSchema = writerJsonSchemaForSpan(spanName);
      if (!spanSchema) throw new Error(`b452 notes: span ${spanName} has no note schema`);
      const result = await callLLM({
        provider: "anthropic",
        model: READING_MODEL,
        messages,
        temperature: null,
        seed: 1,
        responseFormat: "json",
        jsonSchema: spanSchema,
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
    const toolNote = raws.at(-1)?.toolInput?.note;
    const rawJoined = joinWriterNoteParagraphs(toolNote);
    rows.push({
      id: item.id,
      outputType: item.outputType,
      status: settled.writerFeedbackStatus,
      note: typeof settled.writerFeedback === "string" ? settled.writerFeedback : null,
      rawParagraphs: toolNote === undefined ? null : toolNote,
      rawNote: rawJoined || null,
      refusal: settled.writerFeedbackRefusal || null,
      attempts: Array.isArray(settled.writerFeedbackAttempts) ? settled.writerFeedbackAttempts : [],
      calls: raws,
      spend: spendDelta(before, after),
    });
    const count = paragraphsOf(settled.writerFeedback).length;
    process.stdout.write(`F${item.id} ${settled.writerFeedbackStatus} paras=${count} chars=${typeof settled.writerFeedback === "string" ? settled.writerFeedback.length : 0} spend=${Number(after.costUsd).toFixed(4)}\n`);
  }
  return { drafts: rows, spend: getLlmSpend(), gitSha: head };
}

mkdirSync(path.dirname(PAGE_OUT), { recursive: true });
writeFileSync(PAGE_OUT, previewHtml(drafts));

const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
let withheld = 0;
let twoParagraphs = 0;
const labels = [];
const spans = [];
for (const draft of drafts) {
  if (draft.status !== "shown") withheld += 1;
  const paragraphs = paragraphsOf(draft.note);
  if (paragraphs.length >= 2) twoParagraphs += 1;
  for (const paragraph of paragraphs) {
    const label = paragraphLabel(paragraph);
    if (label) labels.push({ id: draft.id, label, paragraph });
  }
  spans.push(...quoteSpans(draft.note || ""));
}
const over = spans.filter((length) => length > QUOTE_INLINE_MAX).length;

const lines = [];
lines.push("# B452");
lines.push("");
lines.push("## What was chosen");
lines.push("");
lines.push(`The text column is ${NOTE_MEASURE_CH} characters. That is the middle of the 68 to 78 range, and it is the usual measure for a column of continuous prose. A quote is pulled out when the words inside it are longer than ${QUOTE_INLINE_MAX} characters, just wider than the column, so an inline quote does not run on past the measure.`);
lines.push("");
lines.push("The length is the characters between the quotation marks. On the B450 notes that length has median 68 and maximum 220. The marks are kept either way.");
lines.push("");
lines.push("A quotation mark with no partner is left in the text. A quote whose closing mark sits in the next paragraph is the same case: pulling it out would glue the paragraphs together. The marks stay where the writer put them.");
lines.push("");
lines.push("The schema asks for a list of at least two paragraphs. The prompt still shows a string, and it was not edited. A string that is itself the list is unwrapped and joined, including one the model wrapped in brackets and then broke with an inner quotation mark. Any other string is shown as that string, because dropping it would withhold the note. A list is joined with a blank line and then passed through house style and the ban. A list that contains a non-string is empty, which is the existing withhold path.");
lines.push("");
lines.push("The gap between paragraphs on the page is one line of the note's own leading, which is the blank line in the stored string.");
lines.push("");
lines.push("## The writer step");
lines.push("");
lines.push("Same twenty drafts. Writer only. No pipeline. The stored note is one string, the paragraphs joined by a blank line, after house style. `rawParagraphs` is the tool input.");
lines.push("");
lines.push(`Notes with at least two paragraphs: ${twoParagraphs} of 20. Target 20 of 20.`);
lines.push(`Paragraphs that begin with a label (up to four words, then a colon): ${labels.length}. Target 0.`);
if (labels.length) {
  for (const row of labels) lines.push(`- Fixture ${row.id}: ${row.label} ${row.paragraph}`);
} else {
  lines.push("None.");
}
lines.push(`Withheld: ${withheld} of 20. B450 was 0 of 20.`);
lines.push(`Mean note length: ${meanLength(drafts).toFixed(0)} characters. B450 was ${meanLength(prior.drafts).toFixed(0)}. The band to stay in is 1100 to 1400.`);
lines.push(`Quoted spans: ${spans.length} across 20 notes, ${(spans.length / 20).toFixed(2)} per note. B450 was 59 spans, 3.0 per note. ${spans.length - over} at ${QUOTE_INLINE_MAX} characters or fewer. ${over} longer.`);
lines.push(`Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Input ${spend.inputTokens}. Output ${spend.outputTokens}. Cached input ${spend.cachedInputTokens}. Unpriced ${spend.unpricedCalls}.`);
lines.push(`Ceiling USD ${CEILING_USD}. ${Number(spend.costUsd) < CEILING_USD ? "Not crossed." : "Crossed."}`);
lines.push("Opus records no cached input on this path, so discounted USD is the list figure.");
lines.push("");
lines.push("## Each draft");
lines.push("");
for (const draft of drafts) {
  const paragraphs = paragraphsOf(draft.note);
  const quoteCount = quoteSpans(draft.note || "").length;
  const longCount = quoteSpans(draft.note || "").filter((length) => length > QUOTE_INLINE_MAX).length;
  const shape = Array.isArray(draft.rawParagraphs) ? `array of ${draft.rawParagraphs.length}` : typeof draft.rawParagraphs;
  const chars = typeof draft.note === "string" ? draft.note.length : 0;
  lines.push(`- Fixture ${draft.id} (${draft.outputType}): ${draft.status}. ${paragraphs.length} paragraphs. ${chars} characters. ${quoteCount} quotes, ${longCount} over ${QUOTE_INLINE_MAX}. Tool input ${shape}.`);
}
lines.push("");
lines.push("## House-style commentary");
lines.push("");
lines.push("Filled after reading the stored notes.");
lines.push("");

writeFileSync(RESULT_OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${RESULT_OUT}\n`);
process.stdout.write(`Wrote ${PAGE_OUT}\n`);
process.stdout.write(`paragraphs ${twoParagraphs} of 20 withheld ${withheld} of 20 labels ${labels.length} mean ${meanLength(drafts).toFixed(0)} quotes ${spans.length} over ${over} spend ${Number(spend.costUsd).toFixed(6)}\n`);
