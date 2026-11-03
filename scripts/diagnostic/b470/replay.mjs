/**
 * B470. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b470/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownState, shownTier, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { reasonFault } from "../../../lib/qc/partial-reason.mjs";
import { sentenceFault } from "../../../lib/qc/absent-element-line.mjs";
import { buildReviewData, evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { cardEvidenceFindings } from "../../../lib/qc/evidence-findings.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { attentionHeader } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";
import { readerEvidenceSentence as screenSentence } from "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";
import { statementVerdictState } from "../../../../brightline-content-engine-frontend/src/modules/drafting/displayVerdictLabels.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const UNRECORDED = "Part of this statement is in the source. Which part was not recorded.";
const FAULTY = new Set(["conflicting", "no_support"]);
const RAISED = new Set(["partial", "beyond", "conflicts", "not_in_source"]);
const BEFORE_FRAGMENT = {
  "01:0": "Canadian, not in the source.",
  "19:7": "14, not in the source.",
};

function pad(id) {
  return String(id).padStart(2, "0");
}
function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}
function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
function cardAt(cards, key) {
  const [fixture, index] = key.split(":");
  return cards.find((row) => pad(row.fixtureId) === fixture && row.index === Number(index));
}
function priorLabel(card) {
  return shownLabel({ ...card, evidenceNotReviewedReason: "" });
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
function headerFor(group) {
  return attentionHeader(group.map((card) => ({
    sentenceState: shownState(card),
    sentenceLabel: shownLabel(card),
    facts: card.readingFacts || [],
  })));
}
function headerTermsOnCards(line, group) {
  if (!line) return [];
  const labels = new Set(group.map((card) => shownLabel(card)));
  const missing = [];
  if (/conflicts with the source/i.test(line) && !labels.has("Conflicts with the source")) missing.push("conflicts");
  if (/needs a look/i.test(line) && !labels.has("Needs a look")) missing.push("needs a look");
  if (/not in the source/i.test(line) && !labels.has("Not in the source")) missing.push("not in the source");
  if (/worth a glance/i.test(line) && !labels.has("Goes beyond the source") && !labels.has("Partly in the source")) {
    missing.push("worth a glance");
  }
  return missing;
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const lines = [];
const problems = [];

let drift = 0;
let stateDrift = 0;
let exportDiff = 0;
let wordingShown = 0;
let unrecordedCards = 0;
let unrecordedTwice = 0;
let emptyRaised = 0;
let repeatedNote = 0;
let fragmentAfter = 0;
const faults = [];
const labelMoves = [];
let longest = { key: "", text: "", n: 0 };
const quietUnchecked = [];

for (const card of cards) {
  const key = keyOf(card);
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  if (reason !== screen) drift += 1;
  const state = shownState(card);
  const screenState = statementVerdictState(card);
  if (state !== screenState) stateDrift += 1;
  const sentenceBearing = RAISED.has(state) || (state === "note_withheld" && card.evidenceNotReviewedReason);
  if (sentenceBearing) {
    const finding = evidenceFindingForExport(card, false) || "";
    const exported = buildReviewData({ statements: [{ qcCard: card }] }).statements[0];
    if (finding !== reason || (exported.evidenceFinding || "") !== reason) exportDiff += 1;
    if (!reason) emptyRaised += 1;
  }
  if (card.readingNote?.bucket === "wording" && reason && reason === String(card.readingNote.text || "").trim()) {
    wordingShown += 1;
  }
  if (reason === UNRECORDED) unrecordedCards += 1;
  if (reason && reason !== UNRECORDED && reason.split(UNRECORDED).length > 2) unrecordedTwice += 1;
  if (reason && sentenceFault(reason)) fragmentAfter += 1;
  if (reason) {
    const fault = reasonFault(reason);
    if (fault) faults.push(`${key}: ${fault}`);
    if (reason.length > longest.n) longest = { key, text: reason, n: reason.length };
  }
  if (shownLabel(card) === "Nothing raised" && card.evidenceNotReviewedReason) quietUnchecked.push(key);
  const before = priorLabel(card);
  const after = shownLabel(card);
  if (before !== after) {
    labelMoves.push({
      key,
      before,
      after,
      beforeTier: shownTier(shownState({ ...card, evidenceNotReviewedReason: "" })),
      afterTier: shownTier(state),
      reason,
      cause: card.evidenceNotReviewedReason || "",
    });
  }
  const findings = cardEvidenceFindings(card, []);
  for (const row of findings) {
    if (clean(row.note) && clean(row.note) === reason) repeatedNote += 1;
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
const membership = [];
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
  const rebuilt = {
    ...judgedRow.card,
    displayVerdict: judgedRow.display,
    sentenceState: verdict.state,
    tier: verdict.tier,
    statementVerdict: verdict,
  };
  confirmed.push(rebuilt);
  const key = keyOf(judgedRow.card);
  if (key === "11:9" || key === "15:12") {
    membership.push({
      key,
      label: row.label,
      display: judgedRow.display,
      evidenceRaised: layerSpoken(rebuilt).evidence.raised,
      shown: shownLabel(rebuilt),
    });
  }
}
const afterLeave = tallyLeaveAlone(confirmed);
const afterLeaveLabel = tallyLeaveAloneWithLabel(confirmed);

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
const headerMiss = [];
for (const [id, group] of groups) {
  const miss = headerTermsOnCards(headerFor(group), group);
  if (miss.length) headerMiss.push(`${id}: ${miss.join(", ")}`);
}

const stay = ["05:0", "19:2", "18:8", "19:4", "19:13"].map((key) => {
  const card = cardAt(cards, key);
  return `${key} ${shownLabel(card)} ${shownTier(shownState(card))}`;
});

if (drift !== 0) problems.push(`drift ${drift}`);
if (stateDrift !== 0) problems.push(`state drift ${stateDrift}`);
if (exportDiff !== 0) problems.push(`export ${exportDiff}`);
if (wordingShown !== 0) problems.push(`wording ${wordingShown}`);
if (unrecordedCards !== 2) problems.push(`unrecorded ${unrecordedCards}`);
if (unrecordedTwice !== 0) problems.push(`unrecorded twice ${unrecordedTwice}`);
if (faults.length) problems.push(`faults ${faults.join("; ")}`);
if (emptyRaised !== 0) problems.push(`empty raised ${emptyRaised}`);
if (repeatedNote !== 0) problems.push(`repeated note ${repeatedNote}`);
if (fragmentAfter !== 0) problems.push(`fragments ${fragmentAfter}`);
if (quietUnchecked.length) problems.push(`nothing raised unchecked ${quietUnchecked.join(" ")}`);
if (labelMoves.length !== 2 || labelMoves.some((row) => !["11:9", "15:12"].includes(row.key))) {
  problems.push(`label moves ${labelMoves.map((row) => row.key).join(" ") || "none"}`);
}
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}
if (headerMiss.length) problems.push(`header ${headerMiss.join("; ")}`);
if (shownLabel(cardAt(cards, "19:4")) !== "Nothing raised") problems.push("19:4 moved");
if (shownLabel(cardAt(cards, "19:13")) !== "Goes beyond the source") problems.push("19:13 moved");
for (const key of ["05:0", "19:2", "18:8"]) {
  if (shownLabel(cardAt(cards, key)) !== "Conflicts with the source") problems.push(`${key} not conflicts`);
}

function say(title, body) {
  lines.push(title);
  lines.push("");
  lines.push(body);
  lines.push("");
}

lines.push("# B470. A reason is a sentence, and a sentence nobody checked does not say nothing was raised");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
say("## What was built", [
  "An absent element is named in a sentence. The element is the one the card already stored. The sentence says the source does not contain it, and nothing else about the source.",
  "A sentence whose evidence check did not run is shown as Needs a look, at demands. The reason is the sentence B467 already wrote for that refusal. The stored verdict, sentence state, label, and tier are not rewritten.",
  "A reason that is not a sentence is refused. A comma inside a quotation is not treated as the start of a fragment.",
  "Callers. absentElementLine: absenceOverQuote on both sides. sentenceFault: reasonFault on both sides. uncheckedLook: shownState, statementVerdictState, both readerEvidenceSentence copies, and the export. The screen copy of the sentences is src/modules/drafting/contradictionFloor.js. The screen copy of the sentence check is src/modules/drafting/partialReason.js.",
].join("\n\n"));

say("## Problem 1. The reason is a sentence", [
  `01:0 before: ${BEFORE_FRAGMENT["01:0"]}`,
  `01:0 after: ${readerEvidenceSentence(cardAt(cards, "01:0"))}`,
  `19:7 before: ${BEFORE_FRAGMENT["19:7"]}`,
  `19:7 after: ${readerEvidenceSentence(cardAt(cards, "19:7"))}`,
  `Fragment reasons before: ${Object.keys(BEFORE_FRAGMENT).length}. Fragment reasons after: ${fragmentAfter}.`,
].join("\n\n"));

say("## Problem 2. A sentence nobody checked", [
  ...["11:9", "15:12"].flatMap((key) => {
    const card = cardAt(cards, key);
    const move = labelMoves.find((row) => row.key === key);
    return [
      `${key} before: ${move?.before}. ${move?.beforeTier}. No reason under the label.`,
      `${key} after: ${move?.after}. ${move?.afterTier}. ${move?.reason}`,
    ];
  }),
  `Cards shown as Nothing raised whose evidence check did not run: ${quietUnchecked.length}.`,
  `Cards whose label moved from the label shipped in B469: ${labelMoves.map((row) => `${row.key} (${row.cause})`).join("; ") || "none"}.`,
  `11:9 is in the labelled 74. Its accuracy label is confirmed. Its stored display verdict is not reviewed, so the evidence layer already counted it as raised before this label moved. 15:12 is not in the labelled 74. Evidence leave-alone stays ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet stays ${afterLeave.combinedQuiet} of ${afterLeave.n}. With the sentence label: ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n} and ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}. The cause is the stored not-reviewed verdict, not the new label.`,
  `Membership detail: ${membership.map((row) => `${row.key} ${row.label} display ${row.display} evidence raised ${row.evidenceRaised} shown ${row.shown}`).join("; ") || "neither card was rebuilt"}.`,
].join("\n\n"));

say("## What stayed", stay.join(". ") + ".");

const headerLines = [];
for (const id of ["11", "15"]) {
  headerLines.push(`Draft ${id}: ${headerFor(groups.get(id)) || "(empty)"}`);
}
say("## Headers", headerLines.join("\n\n"));

say("## Readability", [
  `Gate failures: ${faults.length ? faults.join("; ") : "none"}.`,
  `Unrecorded line: ${unrecordedCards}. Unrecorded line more than once: ${unrecordedTwice}. Findings whose note repeats the reason: ${repeatedNote}.`,
  `Longest reason: ${longest.key}, ${longest.n} characters.`,
  longest.text,
].join("\n\n"));

say("## Invariants", [
  `Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`,
  `Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`,
  `With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n}. Combined quiet ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}.`,
  `Screen reasons that differ: ${drift}. Screen states that differ: ${stateDrift}. Export sentences that differ from the card: ${exportDiff}. Wording notes shown: ${wordingShown}. Raised cards with no reason: ${emptyRaised}.`,
  "The stored pass was not rewritten. displayVerdict, sentenceState, sentenceLabel, and tier on the file are unchanged.",
].join("\n\n"));

say("## Assertions that moved", [
  "tests/b469-contradiction-floor.test.mjs required 01:0 to read \"Canadian, not in the source.\" and 19:7 to read \"14, not in the source.\" The frontend copy is src/modules/drafting/__tests__/b469-contradiction-floor.test.js. Those strings are the element and a label pushed together. They were true and they were not sentences. The assertion was wrong.",
  "tests/b466-reason-reads.test.mjs required a card with no stored reason to keep an empty shown reason, apart from eight partial joins. 11:9 and 15:12 had no stored reason because the check did not run. They now show the sentence that says so. The assertion was wrong.",
  "tests/b462-summary-lines.test.mjs required the B456 pass to keep its line counts. Drafts 11 and 15 each gain a needs-a-look line for the same two sentences. One draft moves from 4 lines to 5, and one from 5 lines to 6. The assertion counted the labels from before an unchecked sentence was Needs a look.",
].join("\n\n"));

lines.push("The browser was not opened. The confirming measurement is this replay of the stored pass.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(labelMoves.map((row) => `${row.key} ${row.before}/${row.beforeTier} -> ${row.after}/${row.afterTier}`).join("\n"));
console.log(`catch ${faultyRaised}/${faultyN} group ${groupRaised} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet} label ${afterLeaveLabel.evidenceLeaveAlone}/${afterLeaveLabel.combinedQuiet}`);
console.log(`longest ${longest.key} ${longest.n} fragments ${fragmentAfter} drift ${drift} export ${exportDiff}`);
console.log(membership);
if (problems.length) process.exit(1);
