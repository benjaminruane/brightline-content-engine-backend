/**
 * B453 replay. No model call.
 * Reads scripts/diagnostic/b446/pass-1.json through the display functions.
 *
 *   node scripts/diagnostic/b453/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cardEvidenceFindings, shownEvidenceProse } from "../../../lib/qc/evidence-findings.mjs";
import { partialSentence, PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { READER_LINES } from "../../../lib/qc/reader-lines.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { flattenStatements, joinKey, mapGroupA } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { readingHeaderParts } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b446/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

function pad(id) {
  return String(id).padStart(2, "0");
}

function silenceIds(card) {
  return (Array.isArray(card?.silences) ? card.silences : []).map((row) => row?.id).filter(Boolean);
}

function isPartialSupport(card) {
  return card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial"
    || card?.sentenceState === "partial"
    || shownState(card) === "partial";
}

function holdsPartialReason(card) {
  return card?.partialGround?.recorded === true
    && (card.partialGround.source === "evidence_summary" || card.partialGround.source === "stage2_explanation");
}

function readerSentence(card) {
  const state = shownState(card);
  if (state === "partial") return partialSentence(card);
  const note = card?.readingNote;
  const wording = note?.bucket === "wording";
  const given = !wording && typeof note?.text === "string" ? note.text : "";
  const line = shownEvidenceProse(card, state, given);
  return typeof line === "string" ? line : "";
}

function identity(card) {
  return {
    displayVerdict: card.displayVerdict ?? null,
    sentenceState: card.sentenceState ?? null,
    sentenceLabel: card.sentenceLabel ?? null,
    tier: card.tier ?? null,
  };
}

function project(card) {
  const next = {
    displayVerdict: card.displayVerdict ?? null,
    sentenceState: card.sentenceState ?? null,
    sentenceLabel: card.sentenceLabel ?? null,
    tier: card.tier ?? null,
  };
  const refused = silenceIds(card).includes("note_refused");
  const quiet = next.sentenceState === "nothing_raised" || next.sentenceState === "nothing_to_raise";
  if (refused && quiet) {
    next.sentenceState = "note_withheld";
    next.sentenceLabel = "Needs a look";
    next.tier = "demands";
  }
  return next;
}

function catchOf(byKey, design, mapped) {
  let raised = 0;
  const misses = [];
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const spoke = layers ? Object.values(layers).some((layer) => layer.raised) : false;
    if (spoke) raised += 1;
    else misses.push(fault.id);
  }
  return { raised, n: design.faults.length, misses };
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b453 replay: expected 261 cards, found ${cards?.length}`);
}

const partials = cards.filter(isPartialSupport);
const shownPartial = partials.filter((card) => shownState(card) === "partial");
const withFinding = shownPartial.filter((card) => (
  cardEvidenceFindings(card, []).some((row) => row.rule === "partial" && row.note)
));
const louderPartial = partials.length - shownPartial.length;

const unrecorded = [];
for (const card of cards) {
  const sentence = readerSentence(card);
  const bare = silenceIds(card).includes("reassurance_stripped") && !sentence;
  const printed = sentence.includes("was not recorded") && holdsPartialReason(card);
  if (bare || printed) {
    unrecorded.push(`${pad(card.fixtureId)}:${card.index}`);
  }
}

const named = ["08:16", "15:9", "15:25"].map((key) => {
  const [fixtureId, index] = key.split(":");
  const card = cards.find((row) => pad(row.fixtureId) === fixtureId && row.index === Number(index));
  return { key, sentence: card ? partialSentence(card) : "" };
});
const cleared = cards.find((card) => pad(card.fixtureId) === "14" && card.index === 2);
const clearedLine = cleared ? readerSentence(cleared) : "";

const moved = [];
let identical = 0;
for (const card of cards) {
  const before = identity(card);
  const after = project(card);
  const same = before.displayVerdict === after.displayVerdict
    && before.sentenceState === after.sentenceState
    && before.sentenceLabel === after.sentenceLabel
    && before.tier === after.tier;
  if (same) identical += 1;
  else {
    moved.push({
      key: `${pad(card.fixtureId)}:${card.index}`,
      before,
      after,
      refused: silenceIds(card).includes("note_refused"),
    });
  }
}

const needsLook = cards.filter((card) => project(card).sentenceLabel === "Needs a look");

const byFixture = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!byFixture.has(id)) byFixture.set(id, []);
  byFixture.get(id).push(card);
}
let attentionDrafts = 0;
let numbersWithAttention = 0;
let numbersShown = 0;
const draftCount = byFixture.size;
for (const rows of byFixture.values()) {
  const sentences = rows.map((card) => ({
    sentenceState: card.sentenceState,
    displayVerdict: card.displayVerdict,
    facts: [],
  }));
  const header = { numbers: "facts matched", line: "Backend line." };
  const parts = readingHeaderParts(header, sentences);
  if (parts.numbers) numbersShown += 1;
  if (parts.attention) {
    attentionDrafts += 1;
    if (parts.numbers) numbersWithAttention += 1;
  }
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

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}

const confirmed = [];
const byKey = indexCards(cards);
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byKey.get(key);
  if (!card) throw new Error(`b453 replay: confirmed label has no card (${key})`);
  confirmed.push(card);
}
if (confirmed.length !== 74) throw new Error(`b453 replay: expected 74 confirmed, found ${confirmed.length}`);

const beforeTally = tallyLeaveAlone(confirmed);
const afterCards = cards.map((card) => ({ ...card, ...project(card) }));
const afterConfirmed = [];
const afterByKey = indexCards(afterCards);
for (const card of confirmed) {
  const next = afterByKey.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (!next) throw new Error("b453 replay: confirmed card missing after projection");
  afterConfirmed.push(next);
}
const afterTally = tallyLeaveAlone(afterConfirmed);
const beforeCatch = catchOf(byKey, design, mapped);
const afterCatch = catchOf(afterByKey, design, mapped);

const refusedKeys = ["06:3", "17:7"];
const inConfirmed = refusedKeys.map((key) => {
  const [fixtureId, index] = key.split(":");
  const card = cards.find((row) => pad(row.fixtureId) === fixtureId && row.index === Number(index));
  const label = card ? labelByKey.get(joinKey(card.fixtureId, card.statement, card.occurrence)) : null;
  return { key, label: label?.label || "no label", in74: label?.label === "confirmed" };
});

const wording = cards.filter((card) => silenceIds(card).includes("wording_note_withheld"));
const wordingMoved = wording.filter((card) => {
  const after = project(card);
  return after.sentenceState !== card.sentenceState || after.sentenceLabel !== card.sentenceLabel;
});

const problems = [];
if (withFinding.length !== shownPartial.length) problems.push("partial finding missing");
if (unrecorded.length !== 0) problems.push(`unrecorded still printed: ${unrecorded.join(", ")}`);
if (needsLook.length !== 2) problems.push(`needs a look ${needsLook.length}`);
if (identical !== 259) problems.push(`identical ${identical}`);
if (moved.length !== 2 || moved.some((row) => !row.refused)) problems.push("movement is not exactly the refused notes");
if (moved.some((row) => row.before.displayVerdict !== row.after.displayVerdict)) problems.push("displayVerdict moved");
if (beforeCatch.raised !== afterCatch.raised) problems.push("catch moved");
if (clearedLine !== READER_LINES.noteCleared) problems.push("cleared line missing");
if (named.some((row) => !row.sentence || row.sentence.includes("was not recorded"))) problems.push("named partial still unrecorded");
if (wordingMoved.length !== 0) problems.push("wording note moved");
if (numbersShown !== draftCount || numbersWithAttention !== attentionDrafts) problems.push("header numbers dropped");

const result = {
  partialSupport: partials.length,
  shownPartial: shownPartial.length,
  withFinding: withFinding.length,
  louderPartial,
  unrecorded,
  named,
  clearedLine,
  needsLook: needsLook.map((card) => `${pad(card.fixtureId)}:${card.index}`),
  identical,
  moved,
  attentionDrafts,
  numbersWithAttention,
  numbersShown,
  draftCount,
  beforeTally: { combinedQuiet: beforeTally.combinedQuiet, evidenceLeaveAlone: beforeTally.evidenceLeaveAlone, n: beforeTally.n },
  afterTally: { combinedQuiet: afterTally.combinedQuiet, evidenceLeaveAlone: afterTally.evidenceLeaveAlone, n: afterTally.n },
  beforeCatch,
  afterCatch,
  inConfirmed,
  wording: wording.length,
  problems,
};

const lines = [
  "# B453 result",
  "",
  "Replay of `scripts/diagnostic/b446/pass-1.json` (261 cards, 20 drafts) through the display code. No model call. USD 0.",
  "",
  "The pass does not store `header.numbers` or the fact list. The header count below applies the display rule to each draft's sentences, with a numbers string present, the same way the screen receives one.",
  "",
  "## Counts",
  "",
  `- Partial cards carrying an evidence finding. Was 0 of ${partials.length}. Now ${withFinding.length} of ${shownPartial.length} cards whose shown state is partial. The other ${louderPartial} partial-support cards have a louder shown state, so a partial finding is not added under that label.`,
  `- Drafts where header.numbers survives alongside the attention line. Was 3 of ${draftCount} (numbers were on screen only when the attention line was empty). Now ${numbersShown} of ${draftCount} show the numbers. ${numbersWithAttention} of ${attentionDrafts} drafts with an attention line also show the numbers.`,
  `- Cards printing "was not recorded" while holding a reason. Was 4. Now ${unrecorded.length}.`,
  `- Cards labelled "Needs a look". Was 0. Now ${needsLook.length}: ${needsLook.map((card) => `${pad(card.fixtureId)} index ${card.index}`).join(", ")}.`,
  `- Cards identical on displayVerdict, sentenceState, sentenceLabel and tier: ${identical} of ${cards.length}.`,
  "",
  "## The four sentences",
  "",
  ...named.map((row) => `- Fixture ${row.key}. ${row.sentence}`),
  `- Fixture 14 index 2. ${clearedLine}`,
  "",
  "The three partial sentences are the stored evidence summary, passed through the same editor as a stage 2 explanation. The editor keeps that summary as one part, so the reader sees the summary's own words, including a sentence that tells the reviewer what to add. That is the recorded reason. It is not a new sentence.",
  "",
  "The fourth sentence is the one chosen for a note that was stripped. The product removed every sentence of the note and left the label. A sentence that said what the source supports or does not support would put a claim back that the strip took out. The line only says a note was written and is not on the screen. It does not mention the source.",
  "",
  "## Movement",
  "",
  "Parts one, two and three do not write displayVerdict, sentenceState, sentenceLabel or tier. Part four writes those three fields, and not displayVerdict, only when the stored state is quiet and the card holds a refused note.",
  "",
  ...moved.map((row) => (
    `- ${row.key}. ${row.before.sentenceLabel} / ${row.before.tier} to ${row.after.sentenceLabel} / ${row.after.tier}. displayVerdict stays ${row.after.displayVerdict}.`
  )),
  "",
  `Catch. Before ${beforeCatch.raised} of ${beforeCatch.n}. After ${afterCatch.raised} of ${afterCatch.n}.`,
  `Evidence leave-alone on the confirmed 74. Before ${beforeTally.evidenceLeaveAlone} of ${beforeTally.n}. After ${afterTally.evidenceLeaveAlone} of ${afterTally.n}.`,
  `Combined quiet on the confirmed 74. Before ${beforeTally.combinedQuiet} of ${beforeTally.n}. After ${afterTally.combinedQuiet} of ${afterTally.n}.`,
  "",
  "The leave-alone module reads displayVerdict, the note bucket, and concerns. It does not read sentenceLabel. The two refused cards stay at the same display verdict, so the quiet counts do not move. That is the module, not a missed state change.",
  "",
  ...inConfirmed.map((row) => `- Fixture ${row.key}. ${row.in74 ? "In the confirmed 74." : "Not in the labelled set, so not in the confirmed 74."}`),
  "",
  `Wording notes stay withheld. ${wording.length} cards carry wording_note_withheld. ${wordingMoved.length} of them changed state or label. The silence is not rendered.`,
  "",
  "## What stayed put",
  "",
  "No prompt, rule, detector, or schema change. The style guide, the mechanics scan, and the craft note are untouched. Silences are not rendered. The replay reads a silence id only to know that a note was refused or stripped.",
  "",
];

if (problems.length) {
  lines.push("## Problems", "", ...problems.map((row) => `- ${row}`), "");
}

writeFileSync(OUT, lines.join("\n"));
console.log(JSON.stringify(result, null, 2));
if (problems.length) process.exit(1);
