/**
 * B488. Replay the stored B486 pass through the current reason and labels.
 * No model call.
 *
 *   node scripts/diagnostic/b488/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { floorState, uncheckedLook } from "../../../lib/qc/contradiction-floor.mjs";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { plainReaderText } from "../../../lib/qc/reader-plain.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { bothReadingsSupport, readingState, shownLabel, shownState, shownTier, shownVerdict, SHOWN_LABELS } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { transactionDemand } from "../../../lib/qc/transaction-state.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b486/pass-1.json");
const RESULT = path.join(__dirname, "RESULT.md");
const ACCURACY = path.join(__dirname, "../accuracy");
const FRONT_HEADER = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js");
const FRONT_REASON = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js");
const FAULTY = new Set(["conflicting", "no_support"]);
const RAISED = new Set(["beyond", "conflicts", "not_in_source", "partial"]);
const OUTCOME_ONE = [["01", 0], ["18", 4], ["19", 7], ["25", 4]];
const OUTCOME_THREE = [["08", 3], ["08", 6], ["14", 3], ["15", 9]];
const BEFORE = {
  "01:0": ["Not in the source", "demands", ""],
  "18:4": ["Conflicts with the source", "demands", ""],
  "19:7": ["Not in the source", "demands", ""],
  "25:4": ["Conflicts with the source", "demands", ""],
  "08:3": ["Partly in the source", "light", PARTIAL_UNRECORDED],
  "08:6": ["Partly in the source", "light", PARTIAL_UNRECORDED],
  "14:3": ["Partly in the source", "light", PARTIAL_UNRECORDED],
  "15:9": ["Partly in the source", "light", PARTIAL_UNRECORDED],
};

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function cardOf(cards, id, index) {
  return cards.find((card) => pad(card.fixtureId) === id && card.index === index);
}

function stateBefore(card) {
  if (bothReadingsSupport(card)) return "nothing_raised";
  const floored = floorState(card);
  if (floored) return floored;
  if (uncheckedLook(card)) return "note_withheld";
  if (transactionDemand(card)) return "conflicts";
  const state = readingState(card);
  if (state !== "nothing_raised" && state !== "nothing_to_raise") return state;
  const notes = card?.supersededSourceNotes;
  const note = Array.isArray(notes) ? String(notes[0] || "").trim() : "";
  if (note.startsWith("The later source ")) return "conflicts";
  const display = String(card?.displayVerdict || "").toLowerCase().trim();
  if (display === "conflict" || display === "conflicts" || display === "conflicting") return "conflicts";
  if (display === "not_supported" || display === "no_clear_support") return "not_in_source";
  if (display === "supported_partial" || display === "partially_confirmed") return "partial";
  return state;
}

function headerBefore(rows) {
  let conflicts = 0;
  let needsLook = 0;
  let light = 0;
  let notFound = 0;
  let across = 0;
  for (const row of rows) {
    const label = typeof row?.sentenceLabel === "string" ? row.sentenceLabel.trim() : "";
    if (label === "Conflicts with the source") conflicts += 1;
    if (label === "Needs a look") needsLook += 1;
    if (label === "Goes beyond the source" || label === "Partly in the source") light += 1;
    if (label !== "Not in the source") continue;
    const facts = Array.isArray(row?.readingFacts) ? row.readingFacts : [];
    const missing = facts.filter((fact) => fact?.status === "not_found").length;
    notFound += missing;
    if (missing > 0) across += 1;
  }
  const parts = [];
  if (conflicts === 1) parts.push("1 statement conflicts with the source");
  else if (conflicts > 1) parts.push(`${conflicts} statements conflict with the source`);
  if (needsLook === 1) parts.push("1 statement needs a look");
  else if (needsLook > 1) parts.push(`${needsLook} statements need a look`);
  if (notFound > 0) {
    parts.push(`${notFound} ${notFound === 1 ? "fact is" : "facts are"} not in the source, across ${across} of your ${rows.length} statements`);
  }
  if (light === 1) parts.push("1 worth a glance");
  else if (light > 1) parts.push(`${light} worth a glance`);
  return parts.join(". ");
}

function corpusOnly(cards) {
  return cards.filter((card) => Number(pad(card.fixtureId)) <= 20);
}

function excerptsOf(card) {
  return [card.primaryExcerpt, card.conflictExcerpt].filter((text) => typeof text === "string" && text.trim());
}

function afterOf(card) {
  const before = card.displayVerdict;
  if (before !== "conflict") return { display: before };
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const flipped = matches.filter((row) => row.classification === "conflicting" && row.writtenFor === "confirmed");
  if (!flipped.length || !excerptsOf(card).length) return { display: before };
  const hits = excerptsOf(card).map((text) => confirmingPassageVerdict(card.statement, text)).filter((row) => row.demoteTo);
  if (hits.length) return { display: before };
  const next = matches.map((row) => (
    row.classification === "conflicting" && row.writtenFor === "confirmed"
      ? { ...row, classification: "confirmed" }
      : row
  ));
  if (next.some((row) => row.classification === "conflicting")) return { display: before };
  if (next.some((row) => row.classification === "partially_confirmed")) return { display: "supported_partial" };
  if (next.some((row) => row.classification === "confirmed")) return { display: "supported_full" };
  return { display: "not_supported" };
}

function noteRefused(card) {
  return (card.silences || []).some((row) => row?.id === "note_refused");
}

function verdictOf(card, facts, displayVerdict) {
  const note = card.readingNote
    ? { bucket: card.readingNote.bucket, text: card.readingNote.text, refused: noteRefused(card) }
    : null;
  return shownVerdict(statementVerdict({ facts, note, entries: [] }), displayVerdict);
}

function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}

function readingSourceBody(sources) {
  const list = Array.isArray(sources) ? sources : null;
  if (!list || list.length === 0) throw new Error("b488 replay: source text is missing");
  const texts = list.map((source, index) => {
    if (typeof source === "string") return source;
    if (!source || typeof source.text !== "string") throw new Error(`b488 replay: source ${index} has no text`);
    return source.text;
  });
  if (texts.every((text) => text.trim() === "")) throw new Error("b488 replay: source text is missing");
  return texts.join("\n");
}

function quietOnCorrect(card, label) {
  if (FAULTY.has(label) || label === "partially_confirmed") return false;
  return card.displayVerdict === "supported_full"
    && (card.sentenceState === "nothing_raised" || card.sentenceState === "nothing_to_raise");
}

function introducedDash(text, corpus) {
  let left = String(text || "");
  if (!/[\u2014\u2013]/.test(left)) return false;
  for (const piece of corpus) {
    if (typeof piece === "string" && piece && left.includes(piece)) left = left.split(piece).join("");
  }
  return /[\u2014\u2013]/.test(left);
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = Array.isArray(doc.cards) ? doc.cards : [];
if (!cards.length) throw new Error("b488 replay: no cards");
const { attentionHeader } = await import(pathToFileURL(FRONT_HEADER).href);
const screen = await import(pathToFileURL(FRONT_REASON).href);

const empty = [];
const unrecorded = [];
for (const card of cards) {
  const state = shownState(card);
  const reason = readerEvidenceSentence(card) || "";
  if (RAISED.has(state) && !reason) empty.push(keyOf(card));
  if (reason.includes("Which part was not recorded")) unrecorded.push(keyOf(card));
}

const byDraft = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!byDraft.has(id)) byDraft.set(id, []);
  byDraft.get(id).push(card);
}

const lines = [];
lines.push(`raised cards with an empty reason: ${empty.length}`);
if (!empty.length) lines.push("none");
for (const key of empty) lines.push(key);
lines.push("");
lines.push(`cards showing "Which part was not recorded": ${unrecorded.length}`);
if (!unrecorded.length) lines.push("none");
for (const key of unrecorded) lines.push(key);
lines.push("");
lines.push("headers");
for (const [id, rows] of [...byDraft.entries()].sort()) {
  lines.push(id);
  lines.push("before: " + (headerBefore(rows) || ""));
  lines.push("after: " + (attentionHeader(rows) || ""));
}
lines.push("");

function paint(card) {
  const state = shownState(card);
  return [shownLabel(card) || "", shownTier(state) || "", readerEvidenceSentence(card) || ""];
}

lines.push("outcome 1");
for (const [id, index] of OUTCOME_ONE) {
  const card = cardOf(cards, id, index);
  const key = `${id}:${index}`;
  const before = BEFORE[key];
  const after = paint(card);
  lines.push(key);
  lines.push(`before: ${before[0]} | ${before[1]} | ${before[2]}`);
  lines.push(`after: ${after[0]} | ${after[1]} | ${after[2]}`);
}
lines.push("");
lines.push("outcome 3");
for (const [id, index] of OUTCOME_THREE) {
  const card = cardOf(cards, id, index);
  const key = `${id}:${index}`;
  const before = BEFORE[key];
  const after = paint(card);
  lines.push(key);
  lines.push(`before: ${before[0]} | ${before[1]} | ${before[2]}`);
  lines.push(`after: ${after[0]} | ${after[1]} | ${after[2]}`);
}
lines.push("");
lines.push("label changes from B486");
const changes = [];
for (const card of cards) {
  const before = SHOWN_LABELS[stateBefore(card)] || stateBefore(card) || "";
  const after = shownLabel(card) || "";
  if (before !== after) changes.push(`${pad(card.fixtureId)}:${card.index}\t${before}\t${after}\t${card.statement || ""}`);
}
lines.push(String(changes.length));
if (!changes.length) lines.push("none");
for (const row of changes) lines.push(row);
lines.push("");

const corpusCards = corpusOnly(cards);
const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const labelByJoin = new Map();
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  labelByJoin.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row.label);
}
const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));

let faultyN = 0;
let faultyRaised = 0;
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (card && raised(card)) faultyRaised += 1;
}
let groupRaised = 0;
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const judgedRow = key ? afterByJoin.get(key) : null;
  const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (afterCard && raised(afterCard)) groupRaised += 1;
}

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  const id = padFixtureId(fixture.data.id);
  if (Number(id) > 20) continue;
  sourcesByFixture.set(id, await loadPipelineSources(fixture.data.sources || []));
}
const confirmedAfter = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!judgedRow) continue;
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b488 replay: no sources for ${judgedRow.card.fixtureId}`);
  const facts = buildFacts({
    statement: judgedRow.card.statement,
    draft: judgedRow.card.statement,
    sourceText: readingSourceBody(sources),
  });
  const verdict = verdictOf(judgedRow.card, facts, judgedRow.after.display);
  confirmedAfter.push({
    ...judgedRow.card,
    displayVerdict: judgedRow.after.display,
    sentenceState: verdict.state,
    tier: verdict.tier,
    statementVerdict: verdict,
  });
}
const leave = tallyLeaveAlone(confirmedAfter);

let quietCorrect = 0;
for (const card of corpusCards) {
  const label = labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (quietOnCorrect(card, label)) quietCorrect += 1;
}

let endorsement = 0;
let dashes = 0;
let internal = 0;
const INTERNAL = /\brungs?\b|\bmodality\b/i;
for (const card of corpusCards) {
  const reason = readerEvidenceSentence(card) || "";
  const corpus = sourceCorpus(card);
  const examined = corpus.length ? maskVerbatimQuotes(reason, corpus) : reason;
  if (endorsementHit(examined)) endorsement += 1;
  const pieces = [card.statement, ...excerptsOf(card), card.sourceQuote];
  const note = card.readingNote && (card.readingNote.bucket === "beyond" || card.readingNote.bucket === "conflicts")
    ? plainReaderText(card.readingNote.text || "")
    : "";
  for (const text of [shownLabel(card) || "", shownTier(shownState(card)) || "", reason, note]) {
    if (introducedDash(text, pieces)) dashes += 1;
    if (INTERNAL.test(text)) internal += 1;
  }
}

let parity = 0;
for (const card of cards) {
  const left = readerEvidenceSentence(card) || "";
  const right = screen.readerEvidenceSentence(card) || "";
  if (left !== right) parity += 1;
}

lines.push("gates");
lines.push(`catch: ${faultyRaised}/${faultyN} (B486 13/13)`);
lines.push(`group A: ${groupRaised}/${design.faults.length} (B486 11/11)`);
lines.push(`leave-alone: ${leave.evidenceLeaveAlone}/${leave.n} (B486 53/74)`);
lines.push(`combined quiet: ${leave.combinedQuiet}/${leave.n} (B486 34/74)`);
lines.push(`quiet on correct: ${quietCorrect} (B486 182)`);
lines.push(`endorsement: ${endorsement} (B486 0)`);
lines.push(`dashes: ${dashes} (B486 0)`);
lines.push(`internal words: ${internal} (B486 0)`);
lines.push(`parity: ${parity} (B486 0)`);
lines.push("");
lines.push("fixture 18 revision sentences");
for (const index of [3, 4, 5]) {
  const card = cardOf(cards, "18", index);
  lines.push(`18:${index}: ${readerEvidenceSentence(card) || ""}`);
}
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(lines.filter((line) => line.startsWith("raised") || line.startsWith("cards showing") || line.startsWith("catch") || line.startsWith("group") || line.startsWith("leave-alone:") || line.startsWith("combined") || line.startsWith("quiet") || line.startsWith("endorsement") || line.startsWith("dashes") || line.startsWith("internal") || line.startsWith("parity") || line.startsWith("18:")).join("\n"));
if (faultyRaised < 13 || groupRaised < 11) {
  console.error(`STOP catch ${faultyRaised}/${faultyN} group A ${groupRaised}/${design.faults.length}`);
  process.exitCode = 2;
}
