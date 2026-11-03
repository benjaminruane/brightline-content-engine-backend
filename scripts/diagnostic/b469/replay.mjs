/**
 * B469. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b469/replay.mjs
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
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { cardEvidenceFindings } from "../../../lib/qc/evidence-findings.mjs";
import { absenceOverQuotedFact, backedAbsence, liveContradiction, quoteStatesStatement } from "../../../lib/qc/contradiction-floor.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { attentionHeader } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";
import { readerEvidenceSentence as screenSentence } from "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const UNRECORDED = "Part of this statement is in the source. Which part was not recorded.";
const FAULTY = new Set(["conflicting", "no_support"]);
const WEIGHT = {
  "Conflicts with the source": 4,
  "Not in the source": 3,
  "Needs a look": 3,
  "Partly in the source": 2,
  "Goes beyond the source": 2,
  "Nothing raised": 1,
  "Nothing to raise": 1,
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
function headerFor(group, shown) {
  return attentionHeader(group.map((card) => ({
    sentenceState: shown ? shownState(card) : card.sentenceState,
    sentenceLabel: shown ? shownLabel(card) : card.sentenceLabel,
    facts: card.readingFacts || [],
  })));
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const lines = [];
const problems = [];

let drift = 0;
let exportDiff = 0;
let wordingShown = 0;
let unrecorded = 0;
let emptyRaised = 0;
let repeatedNote = 0;
let heavier = 0;
let lighter = 0;
const faults = [];
const moves = [];
const partialGaps = [];
const dangling = [];
let longest = { key: "", text: "", n: 0 };
let quotedBefore = 0;

for (const card of cards) {
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  if (reason !== screen) drift += 1;
  const state = shownState(card);
  if (["partial", "beyond", "conflicts", "not_in_source"].includes(state)) {
    if ((evidenceFindingForExport(card, false) || "") !== reason) exportDiff += 1;
    if (!reason) emptyRaised += 1;
  }
  if (card.readingNote?.bucket === "wording" && reason && reason === String(card.readingNote.text || "").trim()) {
    wordingShown += 1;
  }
  if (reason === UNRECORDED) unrecorded += 1;
  if (reason && reason !== UNRECORDED && reason.split(UNRECORDED).length > 2) unrecorded += 10;
  if (reason) {
    const fault = reasonFault(reason);
    if (fault) faults.push(`${keyOf(card)}: ${fault}`);
    if (reason.length > longest.n) longest = { key: keyOf(card), text: reason, n: reason.length };
    const namesSource = /\b(?:the source|the passage)\b/i.test(reason) || /states "|says "/i.test(reason);
    const namesDifference = /\b(?:however|does not|do not|whereas|not state|not record|broader|missing|adds|omits)\b/i.test(reason);
    if (shownLabel(card) === "Partly in the source" && reason !== UNRECORDED && namesSource && !namesDifference) {
      partialGaps.push(keyOf(card));
    }
  }
  if (/^(?:However|But|Although)\b/.test(reason)) dangling.push(keyOf(card));
  const beforeLabel = card.sentenceLabel;
  const afterLabel = shownLabel(card);
  if ((WEIGHT[afterLabel] || 0) > (WEIGHT[beforeLabel] || 0)) {
    heavier += 1;
    const finding = liveContradiction(card);
    moves.push({ key: keyOf(card), beforeLabel, beforeTier: card.tier, afterLabel, afterTier: shownTier(state), finding: finding?.explanation || "" });
  }
  if ((WEIGHT[afterLabel] || 0) < (WEIGHT[beforeLabel] || 0)) lighter += 1;
  const prose = clean(card.displayedEvidenceProse);
  if (card.sentenceLabel === "Not in the source" && /states "/.test(prose) && quoteStatesStatement(card.statement, prose)) {
    quotedBefore += 1;
  }
  const findings = cardEvidenceFindings(card, []);
  for (const row of findings) {
    if (row.rule === "partial" && clean(row.note) && clean(row.note) === reason) repeatedNote += 1;
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
const afterLeave = tallyLeaveAlone(confirmed);
const afterLeaveLabel = tallyLeaveAloneWithLabel(confirmed);
const demanded = confirmed.filter((card) => shownState(card) === "conflicts" && card.sentenceState !== "conflicts").map(keyOf);

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}

const quotedAfter = cards.filter((card) => absenceOverQuotedFact(card, readerEvidenceSentence(card) || "")).length;
const oldReading = cards.filter((card) => backedAbsence(card)).length;

if (drift !== 0) problems.push(`drift ${drift}`);
if (exportDiff !== 0) problems.push(`export ${exportDiff}`);
if (wordingShown !== 0) problems.push(`wording ${wordingShown}`);
if (unrecorded !== 2) problems.push(`unrecorded ${unrecorded}`);
if (faults.length) problems.push(`faults ${faults.join("; ")}`);
if (dangling.length) problems.push(`dangling ${dangling.join(" ")}`);
if (partialGaps.length) problems.push(`partial without difference ${partialGaps.join(" ")}`);
if (emptyRaised !== 0) problems.push(`empty raised ${emptyRaised}`);
if (repeatedNote !== 0) problems.push(`repeated note ${repeatedNote}`);
if (lighter !== 0) problems.push(`lighter ${lighter}`);
if (heavier !== 3) problems.push(`heavier ${heavier}`);
if (quotedAfter !== 0) problems.push(`absence over quote ${quotedAfter}`);
if (oldReading !== 1) problems.push(`old reading ${oldReading}`);
if (quotedBefore !== 2) problems.push(`quoted before ${quotedBefore}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}
if (demanded.length) problems.push(`confirmed gained a demand ${demanded.join(" ")}`);

function block(title, body) {
  lines.push(title);
  lines.push("");
  lines.push(body);
  lines.push("");
}

lines.push("# B469. A contradiction is never shown as something lighter");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("The floor reads a conflicting match that was not written for a confirmed repair. When the stored label is lighter than Conflicts with the source, the reader is shown that label, at demands. The stored verdict, sentence state, label, and tier are not rewritten. A fully backed card is not given a demand.");
lines.push("");
lines.push("Where that match is the finding and the note is not already a conflict, the reason is the match's explanation. Where the note is already a conflict, that note stays.");
lines.push("");
lines.push("An absence headline whose reason quotes the source stating the draft is replaced by the absent fact the card already stored. The measure of a headline that contradicts its evidence is no longer limited to a fully backed verdict. The old count is still printed.");
lines.push("");
lines.push("A sentence that says the source supports the statement keeps the clause in front of that relative clause, then the difference. A reason may not open with However, But, or Although. A reason that names the difference names what the source says.");
lines.push("");
lines.push("Callers. floorState: shownState, the reader reason, the screen's statementVerdictState, and the screen's readerEvidenceSentence. absenceOverQuote: both readerEvidenceSentence copies. shownLabel: the reading payload, the export label, and the leave-alone tally. The screen copy is src/modules/drafting/contradictionFloor.js.");
lines.push("");
lines.push("## Problem 1. The disagreement is what the reviewer sees");
lines.push("");
for (const key of ["05:0", "19:2", "18:8"]) {
  const card = cardAt(cards, key);
  const finding = liveContradiction(card);
  lines.push(`${key} before: ${card.sentenceLabel}. ${card.tier}. ${clean(card.displayedEvidenceProse)}`);
  lines.push("");
  lines.push(`${key} after: ${shownLabel(card)}. ${shownTier(shownState(card))}. ${readerEvidenceSentence(card)}`);
  lines.push("");
  lines.push(`Finding: ${clean(finding?.explanation)}`);
  lines.push("");
}
lines.push(`Other cards whose label or tier moved: ${moves.length === 3 ? "none" : moves.map((row) => row.key).join(", ")}.`);
lines.push("");
lines.push(`Cards whose label became heavier: ${heavier}. Cards whose label became lighter: ${lighter}.`);
lines.push("");
lines.push("19:4 stays Nothing raised, quiet. 19:13 stays Goes beyond the source, light. No other label moved, so the seven cards whose figures are backed while the sentence adds a claim stay Goes beyond the source, and the four cards whose note was already the heavier finding stay on that label.");
lines.push("");
lines.push("## Problem 2. The headline no longer contradicts the quotation");
lines.push("");
const beforeQuote = "19_synth_annual_report states \"The European parcel volume environment has been softer than expected, with overall European parcel volumes down approximately 3% year-on-year.\"";
lines.push(`19:7 before: Not in the source. ${beforeQuote}`);
lines.push("");
lines.push(`19:7 after: ${shownLabel(cardAt(cards, "19:7"))}. ${readerEvidenceSentence(cardAt(cards, "19:7"))}`);
lines.push("");
lines.push(`01:0 is the other card in this condition. Its label stays Not in the source. Before, the reason quoted the founding sentence the draft also states. After: ${readerEvidenceSentence(cardAt(cards, "01:0"))}`);
lines.push("");
lines.push(`Cards in this condition, every verdict: ${quotedAfter}.`);
lines.push("");
lines.push("## Problem 3. The measure reads every card");
lines.push("");
lines.push(`Old reading, fully backed and the stored state Not in the source: ${oldReading}. That is 01:0, the figure carried since B464. Before B457 it was 24. On the replay of the old pass it was 0.`);
lines.push("");
lines.push(`New reading, any verdict, the shown label Not in the source, and the reason quoting the source stating the draft. Before this change: ${quotedBefore}. After: ${quotedAfter}.`);
lines.push("");
lines.push("## Problem 4. Both halves of the reason");
lines.push("");
lines.push("08:3 before: However, 'exceptional' is a broader evaluative claim that the source does not state.");
lines.push("");
lines.push(`08:3 after: ${readerEvidenceSentence(cardAt(cards, "08:3"))}`);
lines.push("");
lines.push("14:2 before: However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.");
lines.push("");
lines.push(`14:2 after: ${readerEvidenceSentence(cardAt(cards, "14:2"))}`);
lines.push("");
lines.push(`Reasons opening with a dangling connective: ${dangling.length}.`);
lines.push("");
lines.push("## Headers");
lines.push("");
for (const id of ["05", "18", "19", "02"]) {
  lines.push(`Draft ${id} before: ${headerFor(groups.get(id), false) || "(empty)"}`);
  lines.push("");
  lines.push(`Draft ${id} after: ${headerFor(groups.get(id), true) || "(empty)"}`);
  lines.push("");
}
lines.push("## Readability");
lines.push("");
lines.push(`Gate failures: ${faults.length ? faults.join("; ") : "none"}.`);
lines.push("");
lines.push(`Partial headlines that name the source and not the difference: ${partialGaps.length}.`);
lines.push("");
lines.push(`Unrecorded line: ${cards.filter((card) => (readerEvidenceSentence(card) || "") === UNRECORDED).length}. Findings whose note repeats the reason: ${repeatedNote}.`);
lines.push("");
lines.push(`Longest reason: ${longest.key}, ${longest.n} characters.`);
lines.push("");
lines.push(longest.text);
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`);
lines.push("");
lines.push(`With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n}. Combined quiet ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}.`);
lines.push("");
lines.push(`Confirmed cards whose shown state became conflicts while the rebuilt state was not: ${demanded.length ? demanded.join(", ") : "none"}.`);
lines.push("");
lines.push(`Screen reasons that differ: ${drift}. Export sentences that differ from the card: ${exportDiff}. Wording notes shown: ${wordingShown}. Raised cards with no reason: ${emptyRaised}.`);
lines.push("");
lines.push("The stored pass was not rewritten. 05:0 and 19:2 still store Not in the source. 18:8 still stores Goes beyond the source.");
lines.push("");
lines.push("## Assertions that moved");
lines.push("");
lines.push("tests/b468-clause-kept.test.mjs required 08:3 and 14:2 to be only the However sentence. That dropped the clause naming what the source contains, which is the half this spec keeps. The assertion was wrong.");
lines.push("");
lines.push("tests/b466-reason-reads.test.mjs required every stored prose that did not assert agreement to be shown unchanged. The screen copy of that assertion is src/modules/drafting/__tests__/b466-reason-reads.test.js. 18:8's stored prose is the lighter note that the statement adds gross, while the conflicting check names 2.6x and 21% against 2.8x and 23%. 01:0 and 19:7's stored prose quotes the source stating a fact the headline calls absent. Those three are no longer required to equal the stored prose.");
lines.push("");
lines.push("tests/b468-header-agrees.test.mjs required draft 19's header to omit conflict, counting the stored label. 19:2's stored label is still Not in the source. The label the reader sees is Conflicts with the source, and the header counts that.");
lines.push("");
lines.push("tests/b462-summary-lines.test.mjs required draft 18 on the B456 pass to keep a beyond line. 18:8 on that pass is a disagreement, the same finding as on this pass. The summary now counts it as a conflict, and that draft no longer has a separate beyond line. The expected lengths go from three drafts at 5 lines to two.");
lines.push("");
lines.push("The browser was not opened. The confirming measurement is this replay of the stored pass.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(`heavier ${heavier} lighter ${lighter} quoted ${quotedBefore} -> ${quotedAfter} old ${oldReading}`);
console.log(`catch ${faultyRaised}/${faultyN} group ${groupRaised} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet} label ${afterLeaveLabel.evidenceLeaveAlone}/${afterLeaveLabel.combinedQuiet}`);
console.log(`longest ${longest.key} ${longest.n}`);
if (problems.length) process.exit(1);
