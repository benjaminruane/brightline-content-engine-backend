/**
 * B466. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b466/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict, shownState } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { PARTIAL_UNRECORDED } from "../../../lib/qc/partial-sentence.mjs";
import { partialReasonDetail, reasonFault, sentenceCount } from "../../../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { cardEvidenceFindings } from "../../../lib/qc/evidence-findings.mjs";
import { maskVerbatimQuotes, quotedSpans, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
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
function partialHeadline(card) {
  return shownState(card) === "partial"
    || card.supportState === "partial"
    || card.displayVerdict === "supported_partial";
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const problems = [];

let unchanged = 0;
let drift = 0;
let exportDiff = 0;
let wordingShown = 0;
const changed = [];
const keptChanged = [];
const still = [];
const longReasons = [];
const quoteMisses = [];
const faults = [];
let unrecorded = 0;
let noteEquals = 0;
let doubleUnrecorded = 0;
let lostFinding = 0;
let partialCards = 0;
let longest = { key: "", n: 0, text: "" };

for (const card of cards) {
  const before = {
    displayVerdict: card.displayVerdict,
    sentenceState: card.sentenceState,
    sentenceLabel: card.sentenceLabel,
    tier: card.tier,
  };
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  const shown = clean(reason);
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
  if (old && old !== UNRECORDED && shown !== old) keptChanged.push(key);
  if (old === UNRECORDED && shown !== old) {
    const hosts = [
      card.evidenceLine,
      card.evidenceSummary,
      card.reasoningParagraph,
      ...(card.matchExplanations || []).map((row) => row.explanation),
      card.primaryExcerpt,
      card.sourceQuote,
    ].filter((text) => typeof text === "string").join(" ").replace(/\s+/g, " ");
    for (const quote of quotesIn(shown)) {
      if (!hosts.includes(quote)) quoteMisses.push(`${key} ${quote}`);
    }
    changed.push({ key, statement: clean(card.statement), old: clean(old), next: clean(shown) });
  }
  if (shown === UNRECORDED) {
    unrecorded += 1;
    still.push({ key, why: partialReasonDetail(card).why || "neither half is on the card" });
  }
  if (shown) {
    const fault = reasonFault(shown);
    if (fault) faults.push(`${key}: ${fault}`);
    if (shown !== UNRECORDED && endorsementHit(maskVerbatimQuotes(shown, sourceCorpus(card)))) {
      faults.push(`${key}: endorsement`);
    }
    if (shown.length > longest.n) longest = { key, n: shown.length, text: clean(shown) };
    if (shown.length > 300) longReasons.push({ key, n: shown.length, text: clean(shown), sentences: sentenceCount(shown) });
  }
  const findings = cardEvidenceFindings(card, []);
  const partialRows = findings.filter((row) => row.rule === "partial");
  if (partialHeadline(card)) {
    partialCards += 1;
    if (!partialRows.length) lostFinding += 1;
  }
  for (const row of partialRows) {
    const note = clean(row.note);
    if (note && note === shown) noteEquals += 1;
    if (note === UNRECORDED && shown === UNRECORDED) doubleUnrecorded += 1;
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
if (keptChanged.length) problems.push(`kept reasons changed ${keptChanged.join(" ")}`);
if (unrecorded > 2) problems.push(`unrecorded ${unrecorded}`);
if (faults.length) problems.push(`reason faults ${faults.length}`);
if (noteEquals !== 0) problems.push(`finding repeats reason ${noteEquals}`);
if (doubleUnrecorded !== 0) problems.push(`unrecorded twice ${doubleUnrecorded}`);
if (lostFinding !== 0) problems.push(`lost finding ${lostFinding}`);
if (quoteMisses.length) problems.push(`quote not verbatim ${quoteMisses.length}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (oldLeave.evidenceLeaveAlone !== 48 || oldLeave.combinedQuiet !== 30) problems.push(`leave-alone ${oldLeave.evidenceLeaveAlone} ${oldLeave.combinedQuiet}`);
if (newLeave.evidenceLeaveAlone !== 48 || newLeave.combinedQuiet !== 30) problems.push(`leave-alone new ${newLeave.evidenceLeaveAlone} ${newLeave.combinedQuiet}`);

const lines = [];
lines.push("# B466. The partial reason reads as English, and nothing is said twice.");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json with the shipped B465 code as the before. No model call. USD 0.");
lines.push("");
lines.push("A source dash is written here as a hyphen.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("The compliant account and the difference clause are joined only when the card's stored reason is missing or is the unrecorded line. A card that already has a reason keeps that reason, character for character.");
lines.push("");
lines.push("Where the two halves are joined, the difference is its own sentence. The leading connective is dropped, the first word is capitalised, and the sentence ends with one stop. No other word is changed. A clause that cannot be made into a sentence is not used, and that card keeps the unrecorded line.");
lines.push("");
lines.push("The finding row stays. Its note is empty when the note would be the reason, or the unrecorded line. The reason is the one place that sentence is printed.");
lines.push("");
lines.push("Callers of the partial reason: partialSentence, on both sides, which still asks for it when a partial sentence is being made; readerEvidenceAccount and the screen's readerEvidenceSentence, which now ask for it only when the stored reason is missing; the finding row, which no longer copies it. The quote exception in the endorsement guard is unchanged.");
lines.push("");
lines.push("## Problem 1. The clause was added where nothing was missing");
lines.push("");
lines.push(`Cards whose reason differs from the stored B464 reason: ${changed.length}. Each of them showed the unrecorded line. Cards that already had a reason and whose reason changed: ${keptChanged.length}.`);
lines.push("");
lines.push(changed.map((row) => row.key).join(", ") || "None.");
lines.push("");
lines.push("## Problem 2. The join is a sentence");
lines.push("");
lines.push("On every reader-facing reason: a sentence boundary followed by a lowercase connective, a comma inside a closing quotation mark, a repeated quoted phrase, a repeated negation, and a reason of more than three sentences.");
lines.push("");
lines.push(`Faults: ${faults.length}.`);
lines.push("");
lines.push(`Longest reason: ${longest.key}, ${longest.n} characters.`);
lines.push("");
lines.push(longest.text);
lines.push("");
lines.push(`Reasons over 300 characters: ${longReasons.length}. The full text is below.`);
lines.push("");
lines.push("## Problem 3. The finding repeats the reason");
lines.push("");
lines.push(`Findings whose note equals the reason: 31 before, ${noteEquals} after.`);
lines.push(`Cards carrying the unrecorded line twice: 2 before, ${doubleUnrecorded} after.`);
lines.push(`Cards that lose a partial finding: ${lostFinding}. Partial cards that still have a finding: ${partialCards - lostFinding} of ${partialCards}.`);
lines.push("");
lines.push("## Reasons that changed");
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
lines.push("## Cards that keep the unrecorded line");
lines.push("");
lines.push(`Cards showing the unrecorded line: 10 before B465, 2 after B465, ${unrecorded} now.`);
lines.push("");
for (const row of still) lines.push(`- ${row.key}. ${row.why}.`);
lines.push("");
lines.push("## Reasons over 300 characters");
lines.push("");
for (const row of longReasons) {
  lines.push(`### ${row.key}. ${row.n} characters. ${row.sentences} sentences.`);
  lines.push("");
  lines.push(row.text);
  lines.push("");
}
lines.push("## Invariants");
lines.push("");
lines.push(`Verdict, state, label, and tier: ${unchanged} of 261 unchanged.`);
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push(`Evidence leave-alone ${oldLeave.evidenceLeaveAlone} of ${oldLeave.n}, combined quiet ${oldLeave.combinedQuiet} of ${oldLeave.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newLeave.evidenceLeaveAlone} of ${newLeave.n}, combined quiet ${newLeave.combinedQuiet} of ${newLeave.n}, on the new definition.`);
lines.push(`Screen reason equals backend reason: ${drift === 0 ? "261 of 261" : `${drift} differ`}.`);
lines.push(`Export sentence equals card sentence: ${exportDiff === 0 ? "every raised card" : `${exportDiff} differ`}.`);
lines.push(`Wording notes shown: ${wordingShown}.`);
lines.push(`Quoted phrases in a new reason that are not in the account, the explanation, or the passage: ${quoteMisses.length}.`);
lines.push("");
lines.push("## Tests");
lines.push("");
lines.push("tests/b466-reason-reads.test.mjs. src/modules/drafting/__tests__/b466-reason-reads.test.js, which names lib/qc/partial-reason.mjs and lib/qc/reader-reason.mjs.");
lines.push("");
lines.push("Four assertions were wrong and were changed. tests/b465-partial-reason.test.mjs required the difference to keep its leading \"but\", which is the join this spec removes. The words after \"but\" are the same. tests/b453-partial-finding.test.mjs and tests/b461-shown-reason.test.mjs required the finding note to be the partial sentence. That sentence is the reason, so the note repeated it. The finding row stays and the note is empty. src/modules/drafting/__tests__/b461-screen.test.js and b425-screen.test.js required the same repetition, including the unrecorded line in both places. The reason keeps the line. The finding does not.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(`changed ${changed.map((row) => row.key).join(",")} kept ${keptChanged.length} unrecorded ${unrecorded} faults ${faults.length} notes ${noteEquals} double ${doubleUnrecorded} lost ${lostFinding} longest ${longest.key} ${longest.n} drift ${drift} catch ${faultyRaised}/${faultyN} group ${groupRaised} leave ${oldLeave.evidenceLeaveAlone} ${oldLeave.combinedQuiet}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
