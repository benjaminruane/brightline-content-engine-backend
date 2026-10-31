/**
 * B457. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b457/replay.mjs
 *
 * Recomputes which figures, dates, and names are found, then composes the
 * evidence line from the note already stored on the card. Writes RESULT.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { evidenceLine, quoteIsVerbatim } from "../../../lib/qc/evidence-line.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b456/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

const FAULTY = new Set(["conflicting", "no_support"]);

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}

function foldSpace(text) {
  return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function quotedSpans(text) {
  const found = [];
  const re = /"([^"]+)"/g;
  let match;
  while ((match = re.exec(String(text || "")))) found.push(match[1]);
  return found;
}

function citingSource(quote, sources) {
  const text = typeof quote === "string" ? quote : "";
  if (!text.trim()) return null;
  return (sources || []).find((source) => typeof source?.text === "string" && source.text.includes(text)) || null;
}

function noteRefused(card) {
  return (Array.isArray(card.silences) ? card.silences : []).some((row) => row?.id === "note_refused");
}

function compose(card, sources) {
  const refused = noteRefused(card);
  const stored = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  const quote = typeof card.sourceQuote === "string" && card.sourceQuote.trim()
    ? card.sourceQuote
    : (typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : "");
  const cited = citingSource(quote, sources);
  const fileName = cited?.label || sources[0]?.label || "";
  const verbatim = quote.trim() ? quoteIsVerbatim(quote, sources) : false;
  const line = evidenceLine({
    fileName,
    quote: verbatim ? quote : "",
    noteText: refused ? "" : stored,
  });
  return { line, fileName: cited?.label || fileName, quote: verbatim ? quote : "", refused, cited: Boolean(cited) };
}

function block(text) {
  return String(text || "").split("\n").map((line) => `> ${line}`).join("\n");
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b457 replay: expected 261 cards, found ${cards?.length}`);
}

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const labelByKey = new Map();
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  labelByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row);
}
const byJoin = indexCards(cards);

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  const id = padFixtureId(fixture.data.id);
  sourcesByFixture.set(id, await loadPipelineSources(fixture.data.sources || []));
}

const rows = [];
for (const card of cards) {
  const sources = sourcesByFixture.get(pad(card.fixtureId));
  if (!sources) throw new Error(`b457 replay: no sources for fixture ${card.fixtureId}`);
  const sourceText = readingSourceText(sources);
  const facts = buildFacts({ statement: card.statement, draft: card.statement, sourceText });
  const refused = noteRefused(card);
  const note = card.readingNote
    ? { bucket: card.readingNote.bucket, text: card.readingNote.text, refused }
    : null;
  const verdict = shownVerdict(statementVerdict({ facts, note, entries: [] }), card.displayVerdict);
  const composed = compose(card, sources);
  const unmatched = facts
    .filter((fact) => fact.status === "not_found")
    .map((fact) => `${fact.kind}:${fact.surface}`);
  const spans = quotedSpans(composed.line);
  const sourceFold = foldSpace(sources.map((source) => source.text).join("\n"));
  const statementFold = foldSpace(card.statement);
  const spanMisses = spans.filter((span) => {
    const folded = foldSpace(span.replace(/[\s,.;:]+$/u, "").replace(/^[\s,.;:]+/u, ""));
    if (!folded) return false;
    return !sourceFold.includes(folded) && !statementFold.includes(folded);
  });
  rows.push({
    key: keyOf(card),
    card,
    state: verdict.state,
    label: shownLabel({ statementVerdict: verdict, displayVerdict: card.displayVerdict }),
    unmatched,
    ...composed,
    spanMisses,
  });
}

const storedContradictions = cards.filter((card) => card.displayVerdict === "supported_full" && card.sentenceState === "not_in_source");
const contradictions = rows.filter((row) => row.card.displayVerdict === "supported_full" && row.state === "not_in_source");
const emptyLines = rows.filter((row) => !row.line);
const spanMisses = rows.filter((row) => row.spanMisses.length > 0);

const faulty = [];
const faultyMisses = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  const card = byJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const spoke = card ? Object.values(layerSpoken(card)).some((layer) => layer.raised) : false;
  faulty.push(row.label);
  if (!spoke) faultyMisses.push(`${pad(row.fixtureId)} ${row.label}`);
}

let groupRaised = 0;
const groupMisses = [];
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const card = key ? byJoin.get(key) : null;
  const spoke = card ? Object.values(layerSpoken(card)).some((layer) => layer.raised) : false;
  if (spoke) groupRaised += 1;
  else groupMisses.push(fault.id);
}

const confirmed = [];
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byJoin.get(key);
  if (!card) throw new Error(`b457 replay: confirmed label has no card (${key})`);
  confirmed.push(card);
}
const leave = tallyLeaveAlone(confirmed);

const confirmedKeys = new Set(confirmed.map((card) => keyOf(card)));
const ofThe24InConfirmed = storedContradictions.filter((card) => confirmedKeys.has(keyOf(card)));

function pick(key) {
  return rows.find((row) => row.key === key);
}

const wanted = ["01:1", "01:2", "01:3", "06:3", "11:5", "17:7"];
const chosen = [];
for (const key of wanted) {
  const row = pick(key);
  if (row) chosen.push(row);
}
const rest = rows.filter((row) => !chosen.includes(row));
const partial = rest.find((row) => row.card.displayVerdict === "supported_partial");
const conflict = rest.find((row) => row.card.displayVerdict === "conflict");
const quietFull = rest.find((row) => row.card.displayVerdict === "supported_full" && row.line && !row.card.readingNote?.text);
const notedFull = rest.find((row) => row.card.displayVerdict === "supported_full" && row.card.readingNote?.text && !chosen.includes(row));
for (const row of [notedFull, quietFull, partial, conflict]) {
  if (row && !chosen.includes(row)) chosen.push(row);
}
const ten = chosen.slice(0, 10);

const lines = [];
lines.push("# B457. A card must not contradict its own evidence, and the evidence line gets one voice.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0.");
lines.push("");
lines.push("## What was measured");
lines.push("");
lines.push(`Cards: ${rows.length}.`);
lines.push(`Headline contradicts the evidence, before: ${storedContradictions.length}. After: ${contradictions.length}.`);
if (contradictions.length) {
  for (const row of contradictions) {
    lines.push(`- ${row.key} stays Not in the source. Unmatched: ${row.unmatched.join("; ") || "none"}.`);
  }
}
lines.push(`Catch on labelled faulty statements (conflicting and no_support): ${faulty.length - faultyMisses.length} of ${faulty.length}.`);
if (faultyMisses.length) lines.push(`Misses: ${faultyMisses.join(", ")}.`);
lines.push(`Catch on the group A design faults: ${groupRaised} of ${design.faults.length}.`);
if (groupMisses.length) lines.push(`Misses: ${groupMisses.join(", ")}.`);
lines.push(`Evidence leave-alone: ${leave.evidenceLeaveAlone} of ${leave.n}. Combined quiet: ${leave.combinedQuiet} of ${leave.n}.`);
const stillUnmatched = rows.filter((row) => row.card.displayVerdict === "supported_full" && row.unmatched.length);
lines.push(`Fully backed cards that still record an unmatched element: ${stillUnmatched.length}.`);
for (const row of stillUnmatched) {
  lines.push(`- ${row.key} sentence ${row.label}. Unmatched: ${row.unmatched.join("; ")}.`);
}
lines.push(`Of the original ${storedContradictions.length} contradictory cards, ${ofThe24InConfirmed.length} sit in the confirmed 74. Sentence state is not a leave-alone layer, so clearing a false Not in the source does not move this tally.`);
lines.push(`Cards with no evidence line: ${emptyLines.length}.`);
if (emptyLines.length) lines.push(emptyLines.map((row) => row.key).join(", "));
lines.push(`Quoted spans that are not in the source and not in the statement, after line breaks are collapsed: ${spanMisses.length}. A passage the line inserts is copied only when the source contains it character for character.`);
if (spanMisses.length) {
  for (const row of spanMisses.slice(0, 8)) {
    lines.push(`- ${row.key}: ${row.spanMisses[0].slice(0, 80)}`);
  }
}
lines.push("");
const WHY = {
  "01:2": "The sentence says more than 150 percent. The source says +151 percent. 150 is not 151, and more than 150 is not treated as equal to 151.",
  "11:5": "The sentence says 19 percent international at entry. The source says over 80 percent of revenue was Nordic. 19 is not written, and the complement of over 80 percent is not inferred.",
};
lines.push("## Why the remaining headlines are legitimate");
lines.push("");
if (!contradictions.length) {
  lines.push("None remain.");
  lines.push("");
}
for (const row of contradictions) {
  lines.push(`**${row.key}.** ${row.card.statement}`);
  lines.push("");
  lines.push(WHY[row.key] || "The unmatched element is not a house-style form of a figure the source states.");
  lines.push("");
  lines.push(`Unmatched: ${row.unmatched.join("; ") || "none"}.`);
  lines.push("");
  lines.push(block(row.quote || row.card.sourceQuote || row.card.primaryExcerpt || ""));
  lines.push("");
}
lines.push("## Ten cards");
lines.push("");
for (const row of ten) {
  lines.push(`### ${row.key}`);
  lines.push("");
  lines.push(`Verdict: ${row.card.displayVerdict}. Sentence: ${row.label}.`);
  lines.push("");
  lines.push(block(row.card.statement));
  lines.push("");
  lines.push(block(row.line));
  lines.push("");
}
lines.push("## Design");
lines.push("");
lines.push("A figure, quantity, date, or name counts as found when the source has the same value in another written form. The comparison is deterministic. It does not call a model and it does not change displayVerdict. Apostrophe thousands separators match commas. A spelled number from zero to twenty matches the numeral. The word percent matches the symbol. An ISO code matches the currency symbol, and mm means million only when a currency is present. An en dash or an em dash joins a range so the currency and the scale carry across. A name matches with or without an honorific, in either case, and a defined-term Company is ignored. An initialism matches the words, and the words match the initialism. A source token whose character was replaced by the replacement character still matches the name.");
lines.push("");
lines.push("150 does not match 151, and 19 percent is not inferred from 81 percent. Those two facts stay unmatched. The note on each card is bucket wording: it already says the difference does not change the claim. A wording note does not leave the headline saying the figure is absent. The unmatched fact is still stored, so the next read can see which element failed.");
lines.push("");
lines.push("The evidence line is the reader's note when that note has text. A refused note is not explained. When there is nothing to report, the line names the source file and quotes the passage, and it stops. It does not say the passage supports the statement. The span call is gone. The prompt file is gone. The model key is gone.");
lines.push("");
lines.push("Leave-alone does not rise. The tally reads displayVerdict, the note bucket, editorial, compliance, framing, and recency. It does not read sentence state. The 24 false headlines were never an input to it.");
lines.push("");
lines.push("## Files");
lines.push("");
lines.push("- `lib/qc/evidence-line.mjs`. Composes the one line. A note with text is the line. Otherwise the file name and a verbatim passage.");
lines.push("- `lib/qc/b394-elements.mjs`. The form comparison. House style and the other equivalent forms count as found. 150 does not count as 151.");
lines.push("- `tests/b457-form-and-line.test.mjs`. Locks the forms, the two non-matches, and the line. Also locks that the span prompt and the model call are gone.");
lines.push("- `scripts/diagnostic/b457/replay.mjs`. Replays the B456 pass. No model call.");
lines.push("- `lib/qc/pipeline-v4/prompts/source-difference.md`. Deleted. The span call is not left on disk.");
lines.push("");
lines.push("Tests rewritten to the new line, not deleted: `tests/actor-of-the-action.test.mjs`, `tests/b360-two-passages.test.mjs`, `tests/b362-silence-and-scale.test.mjs`, `tests/b363-role-party.test.mjs`, `tests/b364-house-style-source-quote.test.mjs`, `tests/b366-party-and-empty-quote.test.mjs`, `tests/b369-quote-without-comment.test.mjs`, `tests/b371-actor-off.test.mjs`, `tests/b372-relation-company-date.test.mjs`, `tests/commentary-inventory.test.mjs`, `tests/card-honesty-invariant.test.mjs`, `tests/editorial-source-awareness.test.mjs`, `tests/b421-combined-verdict.test.mjs`. Each still asserts the verdict. The comment they used to require was the span sentence or an empty summary. They now require the evidence line.");
lines.push("");
lines.push("`tests/b369-quote-without-comment.test.mjs` again requires a comment whenever a quote is shown. The exception for a fully backed card and for a missing difference is gone.");
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(lines.slice(0, 16).join("\n"));
console.log("--- ten ---");
for (const row of ten) console.log(row.key, row.card.displayVerdict, row.label, row.line ? "line" : "EMPTY");
console.log("span misses", spanMisses.length);
console.log("empty", emptyLines.map((row) => row.key).join(", ") || "none");
