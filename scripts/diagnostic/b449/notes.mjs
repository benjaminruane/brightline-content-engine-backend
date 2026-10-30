/**
 * B449. Free checks first, then the writer step on the twenty drafts.
 * Ceiling USD 2. No pipeline.
 *
 *   node scripts/diagnostic/b449/notes.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { suppressLinkedInCreditLines } from "../../../lib/qc/linkedin-credit-line.mjs";
import { applyNoteHouseStyle, noteHouseStyleCounts } from "../../../lib/qc/note-house-style.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_OUT = path.join(__dirname, "notes.json");
const RESULT_OUT = path.join(__dirname, "RESULT.md");
const PRIOR_NOTES = path.join(__dirname, "../b448/notes.json");
const PASS = path.join(__dirname, "../b446/pass-1.json");
const CEILING_USD = 2;

function show(text) {
  return String(text ?? "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
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

function freeHouseStyle() {
  const prior = JSON.parse(readFileSync(PRIOR_NOTES, "utf8"));
  const drafts = Array.isArray(prior.drafts) ? prior.drafts : null;
  if (!drafts || drafts.length !== 20) throw new Error(`b449: expected 20 stored notes, found ${drafts?.length}`);
  const rows = [];
  const totals = { emDashes: 0, enDashes: 0, percentWords: 0, quotedPercentWords: 0, notesWithEmDash: 0 };
  for (const draft of drafts) {
    if (typeof draft.note !== "string" || !draft.note.trim()) {
      throw new Error(`b449: fixture ${draft.id} has no stored note`);
    }
    const before = noteHouseStyleCounts(draft.note);
    const after = applyNoteHouseStyle(draft.note);
    const afterCounts = noteHouseStyleCounts(after);
    if (afterCounts.dashes !== 0) throw new Error(`b449: fixture ${draft.id} still has a long dash after substitution`);
    if (afterCounts.percentWords !== 0) throw new Error(`b449: fixture ${draft.id} still has an unquoted percent word`);
    if (afterCounts.quotedPercentWords !== before.quotedPercentWords) {
      throw new Error(`b449: fixture ${draft.id} changed a quoted percent word`);
    }
    if (before.emDashes > 0) totals.notesWithEmDash += 1;
    totals.emDashes += before.emDashes;
    totals.enDashes += before.enDashes;
    totals.percentWords += before.percentWords;
    totals.quotedPercentWords += before.quotedPercentWords;
    rows.push({ id: draft.id, ...before });
  }
  return { totals, rows };
}

function freeLinkedIn() {
  const pass = JSON.parse(readFileSync(PASS, "utf8"));
  const cards = Array.isArray(pass.cards) ? pass.cards : null;
  if (!cards) throw new Error("b449: the B446 pass has no cards");
  const dropped = [];
  for (const card of cards) {
    const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const outputType = card.outputType;
    const kept = suppressLinkedInCreditLines(concerns, card.statement, outputType);
    if (kept.length === concerns.length) continue;
    for (const concern of concerns) {
      if (kept.includes(concern)) continue;
      dropped.push({
        fixtureId: String(card.fixtureId).padStart(2, "0"),
        index: card.index,
        outputType,
        code: concern.concernCode,
        statement: card.statement,
      });
    }
  }
  return dropped;
}

const house = freeHouseStyle();
const dropped = freeLinkedIn();
if (dropped.length !== 1) {
  throw new Error(`b449: expected 1 LinkedIn concern to drop, found ${dropped.length}: ${JSON.stringify(dropped)}`);
}
const only = dropped[0];
if (only.fixtureId !== "12" || only.index !== 6 || only.outputType !== "linkedin_post" || only.code !== "structural_integrity") {
  throw new Error(`b449: the dropped concern is not fixture 12 index 6: ${JSON.stringify(only)}`);
}
process.stdout.write(
  `free: em ${house.totals.emDashes} en ${house.totals.enDashes} percent ${house.totals.percentWords} quoted percent ${house.totals.quotedPercentWords} notes with em ${house.totals.notesWithEmDash}\n`
);
process.stdout.write(`free: dropped F${only.fixtureId} index ${only.index} ${only.code}\n`);

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
if (selected.length !== 20) throw new Error(`b449 notes: expected 20 drafts, found ${selected.length}`);

const gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const drafts = [];

for (const item of selected) {
  if (typeof item.draft !== "string" || !item.draft.trim()) {
    throw new Error(`b449 notes: fixture ${item.id} has no draft`);
  }
  if (typeof item.outputType !== "string" || !item.outputType.trim()) {
    throw new Error(`b449 notes: fixture ${item.id} has no output type`);
  }
  const before = getLlmSpend();
  if ((Number(before.costUsd) || 0) >= CEILING_USD) {
    throw new Error(`b449 notes: USD ${Number(before.costUsd).toFixed(4)} reached the ceiling before fixture ${item.id}`);
  }
  const raws = [];
  const complete = async (messages, spanName) => {
    const schema = writerJsonSchemaForSpan(spanName);
    if (!schema) throw new Error(`b449 notes: span ${spanName} has no note schema`);
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
  const row = {
    id: item.id,
    outputType: item.outputType,
    status: settled.writerFeedbackStatus,
    note: typeof settled.writerFeedback === "string" ? settled.writerFeedback : null,
    rawNote,
    refusal: settled.writerFeedbackRefusal || null,
    attempts: Array.isArray(settled.writerFeedbackAttempts) ? settled.writerFeedbackAttempts : [],
    calls: raws,
    spend: spendDelta(before, after),
  };
  drafts.push(row);
  process.stdout.write(`F${item.id} ${row.status} chars=${row.note ? row.note.length : 0} calls=${raws.length} spend=${Number(after.costUsd).toFixed(4)}\n`);
}

const spend = getLlmSpend();
const body = { gitSha, model: READING_MODEL, ceilingUsd: CEILING_USD, drafts, spend };
writeFileSync(NOTES_OUT, `${JSON.stringify(body, null, 2)}\n`);

const rawTotals = { emDashes: 0, enDashes: 0, percentWords: 0, quotedPercentWords: 0 };
const shownTotals = { emDashes: 0, enDashes: 0, percentWords: 0, quotedPercentWords: 0 };
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
  }
}

const lines = [];
lines.push("# B449");
lines.push("");
lines.push("## Why the LinkedIn exception did not hold");
lines.push("");
lines.push("The reviewer note reaches the model. `buildEditorialStyleSystemPrompt` puts `reviewerNoteByOutput.linkedin_post` on `structural_integrity` when the output slug is `linkedin_post`, and the LinkedIn calibration block says the same thing in prose. CONFIRMED `lib/qc/editorial-compliance-reviewer.mjs` `effectiveReviewerNote` and `buildEditorialOutputTypeCalibration`. The B446 pass still stored the fragment flag on fixture 12 index 6. The note was in the prompt. The model ignored it.");
lines.push("");
lines.push("The exception is now deterministic. On `linkedin_post` only, a `structural_integrity` concern whose cited text is a name plus a relative clause, or a short credit line, is dropped. A dangling modifier, a run-on, and an agreement error do not match those shapes.");
lines.push("");
lines.push("## Free check, before the writer calls");
lines.push("");
lines.push(`The twenty notes in \`scripts/diagnostic/b448/notes.json\` contain ${house.totals.emDashes} em dashes and ${house.totals.enDashes} en dashes. ${house.totals.notesWithEmDash} of the 20 notes contain an em dash. Unquoted percent words: ${house.totals.percentWords}. Quoted percent words, left untouched: ${house.totals.quotedPercentWords}.`);
lines.push("");
lines.push("After substitution, no note still contains a long dash or an unquoted percent word, and the quoted percent count is unchanged.");
lines.push("");
lines.push("The dry scan of `scripts/diagnostic/b446/pass-1.json` drops one concern: fixture 12 index 6, `structural_integrity`, output type `linkedin_post`. No concern on any other output type moves.");
lines.push("");
lines.push(`Concern text: ${show(only.statement)}`);
lines.push("");
lines.push("## The asymmetry");
lines.push("");
lines.push("A long dash is replaced inside quotation marks. A percent word is not. I agree with that. A long dash is a character this product does not use in its own copy, and quoting it would still put the character on the screen. A percent word inside quotation marks is the draft's wording, cited so the writer can see what to change. Rewriting that quote would make the note say the draft wrote something it did not write.");
lines.push("");
lines.push("The quotation ranges are the ones in `quotationRanges`. That helper sees straight double quotes and curly double quotes. A single-quoted percent word is not inside one of those ranges, so the substitution would change it. The stored notes did not need that case.");
lines.push("");
lines.push("## The prompt");
lines.push("");
lines.push("`WRITER_FEEDBACK_PROMPT` is Ben's copy. The required note schema is unchanged. The craft-note ban list is unchanged. The code still rewrites the note after the model returns, so the prompt line is not the guarantee.");
lines.push("");
lines.push("## The writer step");
lines.push("");
lines.push("Same twenty drafts. Writer only. No pipeline. The stored note is the text after substitution. `rawNote` is the tool input before it.");
lines.push("");
lines.push(`Withheld: ${withheld} of 20.`);
lines.push(`Raw model output, before substitution: em dashes ${rawTotals.emDashes}, en dashes ${rawTotals.enDashes}, unquoted percent words ${rawTotals.percentWords}, quoted percent words ${rawTotals.quotedPercentWords}.`);
lines.push(`Shown note, after substitution: em dashes ${shownTotals.emDashes}, en dashes ${shownTotals.enDashes}, unquoted percent words ${shownTotals.percentWords}, quoted percent words ${shownTotals.quotedPercentWords}.`);
lines.push(`Calls ${spend.calls}. Discounted USD ${Number(spend.costUsd).toFixed(6)}. Input ${spend.inputTokens}. Output ${spend.outputTokens}. Cached input ${spend.cachedInputTokens}. Unpriced ${spend.unpricedCalls}.`);
lines.push(`Ceiling USD ${CEILING_USD}. ${Number(spend.costUsd) < CEILING_USD ? "Not crossed." : "Crossed."}`);
lines.push("Opus records no cached input on this path, so discounted USD is the list figure.");
lines.push("");
lines.push("## Each draft");
lines.push("");
for (const draft of drafts) {
  const raw = typeof draft.rawNote === "string" ? noteHouseStyleCounts(draft.rawNote) : null;
  const rawBit = raw ? ` Raw em ${raw.emDashes}, en ${raw.enDashes}, percent words ${raw.percentWords}.` : "";
  lines.push(`- Fixture ${draft.id}: ${draft.status}.${rawBit}`);
}
lines.push("");

writeFileSync(RESULT_OUT, `${lines.join("\n")}\n`);
process.stdout.write(`Wrote ${NOTES_OUT}\n`);
process.stdout.write(`Wrote ${RESULT_OUT}\n`);
process.stdout.write(`withheld ${withheld} of 20 spend ${Number(spend.costUsd).toFixed(6)}\n`);
