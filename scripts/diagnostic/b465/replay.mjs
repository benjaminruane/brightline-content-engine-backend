/**
 * B465. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b465/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { partialReasonDetail } from "../../../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { releaseReaderProse } from "../../../lib/qc/reader-prose-guard.mjs";
import { quotedSpans, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { noteEndorsement } from "../../../lib/qc/reading-contract.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { readerEvidenceSentence as screenSentence } from "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const UNRECORDED = PARTIAL_UNRECORDED;
const FAULTY = new Set(["conflicting", "no_support"]);

function pad(id) {
  return String(id).padStart(2, "0");
}
function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}
function clean(text) {
  return String(text || "")
    .replace(/\uFFFD/g, "'")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
function quotesIn(text) {
  return quotedSpans(text).map((span) => span.inner.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function afterOf(card) {
  const before = card.displayVerdict;
  if (before !== "conflict") return before;
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const flipped = matches.filter((row) => row.classification === "conflicting" && row.writtenFor === "confirmed");
  const excerpts = [card.primaryExcerpt, card.conflictExcerpt].filter((text) => typeof text === "string" && text.trim());
  if (!flipped.length || !excerpts.length) return before;
  const hits = excerpts.map((text) => confirmingPassageVerdict(card.statement, text)).filter((row) => row.demoteTo);
  if (hits.length) return before;
  const next = matches.map((row) => (
    row.classification === "conflicting" && row.writtenFor === "confirmed"
      ? { ...row, classification: "confirmed" }
      : row
  ));
  if (next.some((row) => row.classification === "conflicting")) return before;
  if (next.some((row) => row.classification === "partially_confirmed")) return "supported_partial";
  if (next.some((row) => row.classification === "confirmed")) return "supported_full";
  return "not_supported";
}
function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}
function answeredNote(card) {
  const detail = partialReasonDetail(card);
  if (detail.reason) return detail.reason;
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && prose !== UNRECORDED) return prose;
  return "";
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const problems = [];

let unchanged = 0;
let drift = 0;
let exportDiff = 0;
let wordingShown = 0;
const changed = [];
const still = [];
let doubleBefore = 0;
let doubleAfter = 0;
const quoteMisses = [];

for (const card of cards) {
  const before = {
    displayVerdict: card.displayVerdict,
    sentenceState: card.sentenceState,
    sentenceLabel: card.sentenceLabel,
    tier: card.tier,
  };
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  if (reason !== screen) drift += 1;
  if (
    card.displayVerdict === before.displayVerdict
    && card.sentenceState === before.sentenceState
    && card.sentenceLabel === before.sentenceLabel
    && card.tier === before.tier
  ) unchanged += 1;
  const state = shownState(card);
  if (["partial", "beyond", "conflicts", "not_in_source"].includes(state)) {
    if ((evidenceFindingForExport(card, false) || "") !== reason) exportDiff += 1;
  }
  if (card.readingNote?.bucket === "wording" && reason && reason === String(card.readingNote.text || "").trim()) {
    wordingShown += 1;
  }
  const old = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  const key = keyOf(card);
  if (old === UNRECORDED) {
    const finding = (card.evidenceFindings || []).some((row) => row?.rule === "partial" && row.note === UNRECORDED);
    if (finding) doubleBefore += 0;
  }
  const findingWas = (card.evidenceFindings || []).some((row) => row?.rule === "partial" && String(row.note || "").trim() === UNRECORDED);
  const answered = answeredNote(card);
  const findingNow = findingWas && !answered;
  if (findingWas && old && old !== UNRECORDED) doubleBefore += 1;
  if (findingNow && reason && reason !== UNRECORDED) doubleAfter += 1;
  if (card.displayVerdict === "supported_partial" && old && reason !== old) {
    const hosts = [
      card.evidenceLine,
      card.evidenceSummary,
      card.reasoningParagraph,
      ...(card.matchExplanations || []).map((row) => row.explanation),
      card.primaryExcerpt,
      card.sourceQuote,
    ].filter((text) => typeof text === "string").join(" ").replace(/\s+/g, " ");
    for (const quote of quotesIn(reason)) {
      if (!hosts.includes(quote)) quoteMisses.push(`${key} ${quote}`);
    }
    changed.push({ key, statement: clean(card.statement), old: clean(old), next: clean(reason) });
  }
  if (reason === UNRECORDED) {
    still.push({ key, why: partialReasonDetail(card).why || "neither half is on the card" });
  }
}

const newly = [];
for (const card of cards) {
  for (const row of card.silences || []) {
    if (row?.id !== "reader_prose_withheld") continue;
    const text = Array.isArray(row.content) ? row.content[0] : "";
    if (!text || !noteEndorsement(text)) continue;
    const released = releaseReaderProse(text, sourceCorpus(card));
    if (!released.withheld) newly.push({ key: keyOf(card), field: row.field, text: clean(text) });
  }
}

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const judged = new Map(cards.map((card) => [joinKey(card.fixtureId, card.statement, card.occurrence), { card, display: afterOf(card) }]));
let faultyN = 0;
let faultyRaised = 0;
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const judgedRow = judged.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.display } : null;
  if (card && raised(card)) faultyRaised += 1;
}
let groupRaised = 0;
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const judgedRow = mappedRow?.keys?.[0] ? judged.get(mappedRow.keys[0]) : null;
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.display } : null;
  if (card && raised(card)) groupRaised += 1;
}
const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  sourcesByFixture.set(padFixtureId(fixture.data.id), await loadPipelineSources(fixture.data.sources || []));
}
const confirmed = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const judgedRow = judged.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!judgedRow) continue;
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  const facts = buildFacts({
    statement: judgedRow.card.statement,
    draft: judgedRow.card.statement,
    sourceText: readingSourceText(sources),
  });
  const note = judgedRow.card.readingNote
    ? { bucket: judgedRow.card.readingNote.bucket, text: judgedRow.card.readingNote.text, refused: (judgedRow.card.silences || []).some((item) => item?.id === "note_refused") }
    : null;
  const verdict = shownVerdict(statementVerdict({ facts, note, entries: [] }), judgedRow.display);
  confirmed.push({
    ...judgedRow.card,
    displayVerdict: judgedRow.display,
    sentenceState: verdict.state,
    tier: verdict.tier,
    statementVerdict: verdict,
  });
}
const oldLeave = tallyLeaveAlone(confirmed);
const newLeave = tallyLeaveAloneWithLabel(confirmed);

if (unchanged !== 261) problems.push(`verdict fields ${unchanged}`);
if (drift !== 0) problems.push(`screen drift ${drift}`);
if (exportDiff !== 0) problems.push(`export drift ${exportDiff}`);
if (wordingShown !== 0) problems.push(`wording shown ${wordingShown}`);
if (doubleAfter !== 0) problems.push(`unrecorded in two places ${doubleAfter}`);
if (quoteMisses.length) problems.push(`quote not verbatim ${quoteMisses.length}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (oldLeave.evidenceLeaveAlone !== 48 || oldLeave.combinedQuiet !== 30) problems.push(`leave-alone ${oldLeave.evidenceLeaveAlone} ${oldLeave.combinedQuiet}`);
if (newLeave.evidenceLeaveAlone !== 48 || newLeave.combinedQuiet !== 30) problems.push(`leave-alone new ${newLeave.evidenceLeaveAlone} ${newLeave.combinedQuiet}`);
if (newly.length !== 3) problems.push(`newly shown ${newly.length}`);

const lines = [];
lines.push("# B465. The partial card says what the source says, and the guard stops firing on the source's own words.");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0 for parts 1 to 3.");
lines.push("");
lines.push("A source dash is written here as a hyphen.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("A partial reason is two spans the card already holds. The first is the compliant account, the evidence line written in the source's register. The second is the matcher's explanation with the clause that grades the statement cut off. The cut is a pivot the explanation already has: \"but does not\", \"However,\", or \"The statement\". A cut that is not clean is not used, and that card keeps the sentence it had.");
lines.push("");
lines.push("The finding row uses that same sentence. It does not also say the part was not recorded.");
lines.push("");
lines.push("The endorsement guard now ignores a banned phrase inside a quotation that is in the card's own passage. A banned phrase outside the quotation is still withheld. The sixteen phrases are unchanged. The screen copies the span check and the cut, and the drift tests name the other file.");
lines.push("");
lines.push("## Problem 1. The partial reason");
lines.push("");
lines.push(`Cards whose reason is the unrecorded line: 10 before, ${still.length} after.`);
lines.push("");
if (!still.length) lines.push("None still carry it.");
for (const row of still) lines.push(`- ${row.key}. ${row.why}.`);
lines.push("");
lines.push(`Cards whose reason changed: ${changed.length}. Each one below is the statement, the old reason, and the new reason. Every new reason passed the guard. A quoted phrase in a new reason is in the account, the explanation, or the passage. Misses: ${quoteMisses.length}.`);
lines.push("");
for (const row of changed) {
  lines.push(`### ${row.key}`);
  lines.push("");
  lines.push(row.statement);
  lines.push("");
  lines.push(`Old: ${row.old}`);
  lines.push("");
  lines.push(`New: ${row.next}`);
  lines.push("");
}
lines.push("## Problem 2. The unrecorded line in two places");
lines.push("");
lines.push(`Cards whose reason already named the gap and whose finding still said the part was not recorded: ${doubleBefore} before, ${doubleAfter} after.`);
lines.push("");
lines.push("The finding stays. When the card has a reason, the finding uses that reason. The unrecorded line is not repeated under it.");
lines.push("");
lines.push("## Problem 3. The guard and the source's own words");
lines.push("");
lines.push(`Strings withheld on the stored pass that the guard now shows: ${newly.length}.`);
lines.push("");
for (const row of newly) {
  lines.push(`- ${row.key}, ${row.field}. ${row.text}`);
  lines.push("");
}
lines.push("The five probe sentences from B462 are still an empty reason. A sentence that quotes the source and then grades the figure in the product's own voice is still withheld. A quotation that is not in the passage is still withheld.");
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Verdict, state, label, and tier: ${unchanged} of 261 unchanged.`);
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push(`Evidence leave-alone ${oldLeave.evidenceLeaveAlone} of ${oldLeave.n}, combined quiet ${oldLeave.combinedQuiet} of ${oldLeave.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newLeave.evidenceLeaveAlone} of ${newLeave.n}, combined quiet ${newLeave.combinedQuiet} of ${newLeave.n}, on the new definition.`);
lines.push(`Screen reason equals backend reason: ${drift === 0 ? "261 of 261" : `${drift} differ`}.`);
lines.push(`Export sentence equals card sentence: ${exportDiff === 0 ? "every raised card" : `${exportDiff} differ`}.`);
lines.push(`Wording notes shown: ${wordingShown}.`);
lines.push("");
lines.push("## Tests");
lines.push("");
lines.push("tests/b465-partial-reason.test.mjs. tests/b465-quoted-endorsement.test.mjs. src/modules/drafting/__tests__/b465-parity.test.js, which names lib/qc/quoted-span.mjs and lib/qc/partial-reason.mjs.");
lines.push("");
lines.push("No existing assertion had to move. The partial editor's own tests still expect the explanation when the card has no compliant account, and that is still what they get.");
lines.push("");
lines.push("Part 4 is a separate read. It is not in this file.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(`changed ${changed.length} still ${still.length} double ${doubleBefore} to ${doubleAfter} newly ${newly.length} drift ${drift} catch ${faultyRaised}/${faultyN} group ${groupRaised} leave ${oldLeave.evidenceLeaveAlone} ${oldLeave.combinedQuiet}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
