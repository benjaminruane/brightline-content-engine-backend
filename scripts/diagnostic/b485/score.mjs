/**
 * B485. Score the pass. No further model call.
 *
 *   node scripts/diagnostic/b485/score.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceBody } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const PRIOR = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const FRONT = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js");
const FAULTY = new Set(["conflicting", "no_support"]);
const SHOWN = [
  ["18", 0],
  ["18", 2],
  ["18", 8],
  ["23", 0],
  ["25", 0],
  ["25", 2],
  ["25", 8],
];

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
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

function labelOf(card) {
  return card.sentenceLabel || shownLabel(card) || "";
}

function reasonOf(card) {
  return readerEvidenceSentence(card) || "";
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

function readerFacing(card) {
  const note = card.readingNote && (card.readingNote.bucket === "beyond" || card.readingNote.bucket === "conflicts")
    ? card.readingNote.text
    : "";
  return [labelOf(card), card.tier, reasonOf(card), note, card.evidenceSummary, card.displayedEvidenceProse, card.sourceQuote, card.sourceDifference];
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const cards = Array.isArray(doc.cards) ? doc.cards : [];
if (!cards.length) throw new Error("b485 score: no cards");
const corpusCards = corpusOnly(cards);
const priorByKey = new Map(corpusOnly(prior.cards || []).map((card) => [keyOf(card), card]));

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
  if (!sources) throw new Error(`b485 score: no sources for ${judgedRow.card.fixtureId}`);
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
const leaveLabel = tallyLeaveAloneWithLabel(confirmedAfter);

let quietCorrect = 0;
for (const card of corpusCards) {
  const label = labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (quietOnCorrect(card, label)) quietCorrect += 1;
}

let endorsement = 0;
let dashes = 0;
for (const card of corpusCards) {
  const reason = reasonOf(card);
  const corpus = sourceCorpus(card);
  const examined = corpus.length ? maskVerbatimQuotes(reason, corpus) : reason;
  if (endorsementHit(examined)) endorsement += 1;
  const pieces = [card.statement, ...excerptsOf(card), card.sourceQuote];
  for (const text of readerFacing(card)) {
    if (introducedDash(text, pieces)) dashes += 1;
  }
}

let parityDiff = 0;
let parityNote = "";
try {
  const screen = await import(pathToFileURL(FRONT).href);
  for (const card of cards) {
    const left = reasonOf(card);
    const right = screen.readerEvidenceSentence(card) || "";
    if (left !== right) parityDiff += 1;
  }
} catch (err) {
  parityDiff = cards.length;
  parityNote = err instanceof Error ? err.message : String(err);
}

const byKey = new Map(cards.map((card) => [keyOf(card), card]));
const shownBlocks = [];
for (const [id, index] of SHOWN) {
  const card = byKey.get(`${id}:${index}`);
  if (!card) {
    shownBlocks.push(`F${id} #${index}\nmissing`);
    continue;
  }
  shownBlocks.push([
    `F${id} #${index}`,
    `label: ${labelOf(card)}`,
    `tier: ${card.tier || ""}`,
    `reason: ${reasonOf(card)}`,
    `reading note: ${card.readingNote?.text || ""}`,
    `statement: ${card.statement || ""}`,
  ].join("\n"));
}

const changes = [];
for (const card of corpusCards) {
  const old = priorByKey.get(keyOf(card));
  if (!old) continue;
  const nextLabel = labelOf(card);
  const oldLabel = labelOf(old);
  if (nextLabel !== oldLabel) {
    changes.push(`${pad(card.fixtureId)}\t${card.index}\t${oldLabel}\t${nextLabel}\t${card.statement || ""}`);
  }
}

const revision = cards
  .filter((card) => pad(card.fixtureId) === "18")
  .map((card) => reasonOf(card))
  .filter((text) => /The later source|The documents differ/.test(text));

const rulingPaths = [
  path.resolve(__dirname, "../../../claude/card-copy-rulings.md"),
  path.resolve(__dirname, "../../../../claude/card-copy-rulings.md"),
];
let rulingText = "";
for (const file of rulingPaths) {
  try {
    rulingText = readFileSync(file, "utf8");
    break;
  } catch {
    /* the next path */
  }
}
const rulingSentences = rulingText
  ? [...rulingText.matchAll(/The later source[^.]*\.(?: The earlier source[^.]*\.)?/g)].map((match) => match[0])
  : [];

const lines = [
  "catch, labelled faulty: " + `${faultyRaised}/${faultyN}`,
  "group A: " + `${groupRaised}/${design.faults.length}`,
  "evidence leave-alone: " + `${leave.evidenceLeaveAlone}/${leave.n}`,
  "combined quiet: " + `${leave.combinedQuiet}/${leave.n}`,
  "evidence leave-alone with label: " + `${leaveLabel.evidenceLeaveAlone}/${leaveLabel.n}`,
  "combined quiet with label: " + `${leaveLabel.combinedQuiet}/${leaveLabel.n}`,
  "quiet on text known to be correct: " + String(quietCorrect),
  "endorsement guard violations: " + String(endorsement),
  "em or en dashes introduced in any reader-facing string: " + String(dashes),
  "backend and screen parity over this pass: " + `${parityDiff} differences`,
];
if (parityNote) lines.push("parity import: " + parityNote);
lines.push("");
lines.push("fixture 18 revision sentences");
if (!rulingText) lines.push("rulings file: missing");
for (const sentence of (rulingSentences.length ? rulingSentences : revision)) lines.push(sentence);
if (rulingSentences.length) {
  lines.push("pass");
  for (const sentence of revision) lines.push(sentence);
}
lines.push("");
lines.push("cards");
for (const block of shownBlocks) {
  lines.push(block);
  lines.push("");
}
lines.push("label changes from B464");
if (!changes.length) lines.push("none");
for (const row of changes) lines.push(row);
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(lines.slice(0, 12).join("\n"));
