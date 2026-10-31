/**
 * B454 replay. No model call.
 * Reads scripts/diagnostic/b446/pass-1.json and seals each card.
 *
 *   node scripts/diagnostic/b454/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { partialSentence } from "../../../lib/qc/partial-sentence.mjs";
import { sealReaderCard } from "../../../lib/qc/reader-prose-guard.mjs";
import { noteEndorsement } from "../../../lib/qc/reading-contract.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { isScannedHouseStyle, layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { flattenStatements, joinKey, mapGroupA } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b446/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function isPartialSupport(card) {
  return card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial"
    || card?.sentenceState === "partial"
    || shownState(card) === "partial";
}

function identity(card) {
  return {
    displayVerdict: card.displayVerdict ?? null,
    sentenceState: card.sentenceState ?? null,
    sentenceLabel: card.sentenceLabel ?? null,
    tier: card.tier ?? null,
  };
}

function sameIdentity(left, right) {
  return left.displayVerdict === right.displayVerdict
    && left.sentenceState === right.sentenceState
    && left.sentenceLabel === right.sentenceLabel
    && left.tier === right.tier;
}

function composerInputs(card) {
  const texts = [];
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    if (typeof row?.explanation === "string" && row.explanation.trim()) texts.push(row.explanation);
  }
  const ground = card?.partialGround;
  if (ground?.recorded === true && typeof ground.text === "string" && ground.text.trim()) texts.push(ground.text);
  return texts;
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

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}

function houseStyleFlip(before, after) {
  const fields = ["editorialConcerns", "complianceConcerns", "sourceRecencyConcerns", "framingFidelityConcerns"];
  const flips = [];
  for (const field of fields) {
    const left = Array.isArray(before[field]) ? before[field] : [];
    const right = Array.isArray(after[field]) ? after[field] : [];
    if (left.length !== right.length) flips.push(`${keyOf(before)} ${field} length ${left.length} to ${right.length}`);
    for (let i = 0; i < left.length; i += 1) {
      if (isScannedHouseStyle(left[i]) !== isScannedHouseStyle(right[i])) {
        flips.push(`${keyOf(before)} ${field}[${i}] ${left[i]?.concernCode || left[i]?.rule || "no code"}`);
      }
    }
  }
  return flips;
}

function bump(map, phrase) {
  map.set(phrase, (map.get(phrase) || 0) + 1);
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b454 replay: expected 261 cards, found ${cards?.length}`);
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

const confirmed = [];
const byKey = indexCards(cards);
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byKey.get(key);
  if (!card) throw new Error(`b454 replay: confirmed label has no card (${key})`);
  confirmed.push(card);
}
if (confirmed.length !== 74) throw new Error(`b454 replay: expected 74 confirmed, found ${confirmed.length}`);

const beforeTally = tallyLeaveAlone(confirmed);
const beforeCatch = catchOf(byKey, design, mapped);

const sealed = cards.map((card) => sealReaderCard(card));
const afterByKey = indexCards(sealed);
const afterConfirmed = confirmed.map((card) => {
  const next = afterByKey.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (!next) throw new Error("b454 replay: confirmed card missing after the seal");
  return next;
});
const afterTally = tallyLeaveAlone(afterConfirmed);
const afterCatch = catchOf(afterByKey, design, mapped);

let identical = 0;
const moved = [];
const flips = [];
const phraseCounts = new Map();
const fieldCounts = new Map();
let partialCards = 0;
let partialWithheld = 0;
let partialSourceFail = 0;
const partialSourceFailComposedPass = [];
let displayedPresent = 0;
let displayedFail = 0;
const displayedWithheld = [];
let readingPresent = 0;
let readingFail = 0;
let readingMoved = 0;
let summaryPresent = 0;
let summaryFail = 0;
let matchCards = 0;
let matchFailCards = 0;
let summaryStoredMoved = 0;
let explanationStoredMoved = 0;
let editorialRows = 0;
let complianceRows = 0;
let recencyRows = 0;
let framingRows = 0;
let findingNotes = 0;
let findingFail = 0;

for (let i = 0; i < cards.length; i += 1) {
  const before = cards[i];
  const after = sealed[i];
  if (sameIdentity(identity(before), identity(after))) identical += 1;
  else moved.push(keyOf(before));
  flips.push(...houseStyleFlip(before, after));

  if (JSON.stringify(before.evidenceSummary ?? null) !== JSON.stringify(after.evidenceSummary ?? null)) summaryStoredMoved += 1;
  if (JSON.stringify(before.matchExplanations ?? null) !== JSON.stringify(after.matchExplanations ?? null)) explanationStoredMoved += 1;
  if (JSON.stringify(before.readingNote ?? null) !== JSON.stringify(after.readingNote ?? null)) readingMoved += 1;

  editorialRows += Array.isArray(before.editorialConcerns) ? before.editorialConcerns.length : 0;
  complianceRows += Array.isArray(before.complianceConcerns) ? before.complianceConcerns.length : 0;
  recencyRows += Array.isArray(before.sourceRecencyConcerns) ? before.sourceRecencyConcerns.length : 0;
  framingRows += Array.isArray(before.framingFidelityConcerns) ? before.framingFidelityConcerns.length : 0;
  for (const row of Array.isArray(before.evidenceFindings) ? before.evidenceFindings : []) {
    if (typeof row?.note !== "string" || !row.note.trim()) continue;
    findingNotes += 1;
    if (noteEndorsement(row.note)) findingFail += 1;
  }

  const noteText = typeof before.readingNote?.text === "string" ? before.readingNote.text.trim() : "";
  if (noteText) {
    readingPresent += 1;
    if (noteEndorsement(noteText)) readingFail += 1;
  }
  const summary = typeof before.evidenceSummary === "string" ? before.evidenceSummary.trim() : "";
  if (summary) {
    summaryPresent += 1;
    if (noteEndorsement(summary)) summaryFail += 1;
  }
  const explanations = Array.isArray(before.matchExplanations) ? before.matchExplanations : [];
  if (explanations.some((row) => typeof row?.explanation === "string" && row.explanation.trim())) matchCards += 1;
  if (explanations.some((row) => noteEndorsement(row?.explanation))) matchFailCards += 1;

  const stored = typeof before.displayedEvidenceProse === "string" ? before.displayedEvidenceProse.trim() : "";
  if (stored) {
    displayedPresent += 1;
    if (noteEndorsement(stored)) {
      displayedFail += 1;
      const shown = typeof after.displayedEvidenceProse === "string" ? after.displayedEvidenceProse.trim() : "";
      if (shown !== stored) displayedWithheld.push(keyOf(before));
    }
  }

  if (isPartialSupport(before)) {
    partialCards += 1;
    const composed = partialSentence(before);
    const composedFail = Boolean(noteEndorsement(composed));
    const sourceFail = composerInputs(before).some((text) => noteEndorsement(text));
    if (sourceFail) partialSourceFail += 1;
    if (composedFail) partialWithheld += 1;
    if (sourceFail && !composedFail) partialSourceFailComposedPass.push(keyOf(before));
  }

  for (const row of Array.isArray(after.silences) ? after.silences : []) {
    if (row?.id !== "reader_prose_withheld") continue;
    bump(fieldCounts, row.field || "missing");
    bump(phraseCounts, row.reason || "missing");
  }
}

const phrases = [...phraseCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const fields = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const problems = [];
if (identical !== 261) problems.push(`identical ${identical}`);
if (moved.length) problems.push(`identity moved: ${moved.join(", ")}`);
if (beforeCatch.raised !== afterCatch.raised || beforeCatch.n !== afterCatch.n) problems.push("catch moved");
if (beforeTally.evidenceLeaveAlone !== afterTally.evidenceLeaveAlone) problems.push("evidence leave-alone moved");
if (beforeTally.combinedQuiet !== afterTally.combinedQuiet) problems.push("combined quiet moved");
if (flips.length) problems.push(`house style flipped: ${flips.join("; ")}`);
if (readingFail !== 0) problems.push(`reading notes failed the guard: ${readingFail}`);
if (readingMoved !== 0) problems.push(`reading notes changed: ${readingMoved}`);
if (summaryStoredMoved !== 0) problems.push("evidenceSummary was rewritten");
if (explanationStoredMoved !== 0) problems.push("matchExplanations were rewritten");
if (displayedWithheld.length !== displayedFail) problems.push(`displayed withheld ${displayedWithheld.length} of ${displayedFail} failures`);
if (findingFail > 0 && (fieldCounts.get("evidenceFindings") || 0) < findingFail) {
  problems.push(`evidence finding notes failed ${findingFail} and silences are ${fieldCounts.get("evidenceFindings") || 0}`);
}

const result = {
  partialCards,
  partialWithheld,
  partialSourceFail,
  partialSourceFailComposedPass,
  displayedPresent,
  displayedFail,
  displayedWithheld,
  summaryPresent,
  summaryFail,
  matchCards,
  matchFailCards,
  readingPresent,
  readingFail,
  identical,
  fields,
  phrases,
  beforeCatch,
  afterCatch,
  beforeTally: {
    combinedQuiet: beforeTally.combinedQuiet,
    evidenceLeaveAlone: beforeTally.evidenceLeaveAlone,
    n: beforeTally.n,
  },
  afterTally: {
    combinedQuiet: afterTally.combinedQuiet,
    evidenceLeaveAlone: afterTally.evidenceLeaveAlone,
    n: afterTally.n,
  },
  problems,
};

const lines = [
  "# B454 result",
  "",
  "Replay of `scripts/diagnostic/b446/pass-1.json` (261 cards) through `sealReaderCard`. No model call. USD 0.",
  "",
  "## Where the choke point sits",
  "",
  "The endorsement list stays in `lib/qc/reading-contract.mjs`. `acceptNote` still refuses a reading note. The craft note still uses its own list. Neither list was edited.",
  "",
  "`lib/qc/reader-prose-guard.mjs` is the other door. `releaseReaderProse` is the only call that tests a reader string against `noteEndorsement`. `sealReaderCard` is the card walk. It records a silence and replaces the string the reader would see. It does not rewrite `evidenceSummary`, `matchExplanations`, the reading note, or the craft note.",
  "",
  "The walk sits on the card after assembly, after the dateline, and again when the reading contract returns the card, and on a recheck row. Export of an evidence finding uses the same function, because that string can leave without another pass over the card. The check is not copied at each writer. The writers still store what they stored.",
  "",
  "A failing string becomes the line the partial path already uses when the reason was not recorded. It is not rewritten into a report. The silence id is `reader_prose_withheld`. The reason is the first phrase `noteEndorsement` hits. The screen does not render silences.",
  "",
  "## Counts",
  "",
  `- Partial cards whose composed sentence is now withheld: ${partialWithheld} of ${partialCards}.`,
  `- Partial cards whose matcher explanation or stored ground fails the guard: ${partialSourceFail} of ${partialCards}. ${partialSourceFailComposedPass.length} of those compose a sentence that passes, because a later endorsing sentence is dropped when an earlier sentence already quotes every gap it quotes. Those ${partialSourceFailComposedPass.length} stay on screen: ${partialSourceFailComposedPass.join(", ") || "none"}.`,
  `- Displayed evidence lines withheld: ${displayedWithheld.length} of ${displayedPresent} present (${displayedFail} failed the guard).`,
  `- Cards identical on displayVerdict, sentenceState, sentenceLabel and tier: ${identical} of ${cards.length}.`,
  "",
  "## Other paths the seal blocks",
  "",
  "These counts are silences on the sealed card, one per field per phrase per card. A stored field that fails and is not the string on screen is still a silence when the seal discards it.",
  "",
  ...fields.map(([field, count]) => `- ${field}: ${count}`),
  "",
  `Matcher explanations fail the guard on ${matchFailCards} of ${matchCards} cards that have one. The stored explanation is left as written. It reaches the reader only as the partial sentence, and only when that composed sentence passes.`,
  "",
  `Evidence summaries fail the guard on ${summaryFail} of ${summaryPresent}. The stored summary is left as written. The commentary the reader sees is the unrecorded line when the summary fails.`,
  "",
  `Reading notes: ${readingPresent} present, ${readingFail} fail. ${readingMoved} changed by the seal.`,
  "",
  `Concern rows walked: editorial ${editorialRows}, compliance ${complianceRows}, source recency ${recencyRows}, framing ${framingRows}. Evidence finding notes on the stored cards: ${findingNotes} present, ${findingFail} fail. Compliance, source recency, and stored finding notes added no silence.`,
  "",
  "## Phrases",
  "",
  "Each count is a silence. The phrase is the first hit in `NOTE_BANNED_PHRASES`, which is the brief for a later matcher prompt change. This spec does not change that prompt.",
  "",
  ...phrases.map(([phrase, count]) => `- ${phrase}: ${count}`),
  "",
  "## Catch and quiet",
  "",
  `Catch. Before ${beforeCatch.raised} of ${beforeCatch.n}. After ${afterCatch.raised} of ${afterCatch.n}.`,
  `Evidence leave-alone on the confirmed 74. Before ${beforeTally.evidenceLeaveAlone} of ${beforeTally.n}. After ${afterTally.evidenceLeaveAlone} of ${afterTally.n}.`,
  `Combined quiet on the confirmed 74. Before ${beforeTally.combinedQuiet} of ${beforeTally.n}. After ${afterTally.combinedQuiet} of ${afterTally.n}.`,
  "",
  "Leave-alone reads displayVerdict, the note bucket, and whether a concern is present. It does not read the concern's words, except the scanned house-style test for a first-person voice concern. No concern changed that test. No verdict field moved.",
  "",
  "## What stayed put",
  "",
  "No prompt, rule, detector, or schema change. `NOTE_BANNED_PHRASES` is unchanged. The matcher still writes what it writes. Wording notes stay withheld. Silences are not rendered.",
  "",
];

if (problems.length) {
  lines.push("## Problems", "", ...problems.map((row) => `- ${row}`), "");
}

writeFileSync(OUT, lines.join("\n"));
console.log(JSON.stringify(result, null, 2));
if (problems.length) process.exit(1);
