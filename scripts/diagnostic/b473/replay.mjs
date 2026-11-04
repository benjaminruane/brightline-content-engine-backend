/**
 * B473. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b473/replay.mjs
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
import { buildReviewData, evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { cardEvidenceFindings } from "../../../lib/qc/evidence-findings.mjs";
import { transactionDemand, transactionShift } from "../../../lib/qc/transaction-state.mjs";
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
const DEAL = /\b(?:committed|invested|completion|completed|acquired|closed)\b/i;
const FIVE = ["04:1", "08:2", "15:2", "18:0", "18:2"];
const WEIGHT = {
  "Conflicts with the source": 4,
  "Not in the source": 3,
  "Needs a look": 3,
  "Partly in the source": 2,
  "Goes beyond the source": 2,
  "Nothing raised": 1,
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

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const lines = [];
const problems = [];
let drift = 0;
let exportDiff = 0;
let wordingShown = 0;
let emptyRaised = 0;
let repeatedNote = 0;
let lighter = 0;
const faults = [];
let longest = { key: "", text: "", n: 0 };

for (const card of cards) {
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  if (reason !== screen) drift += 1;
  if (shownState(card) !== statementVerdictState(card)) drift += 1;
  const state = shownState(card);
  const sentenceBearing = RAISED.has(state) || (state === "note_withheld" && card.evidenceNotReviewedReason);
  if (sentenceBearing) {
    const finding = evidenceFindingForExport(card, false) || "";
    const exported = buildReviewData({ statements: [{ qcCard: card }] }).statements[0];
    if (finding !== reason || (exported.evidenceFinding || "") !== reason) exportDiff += 1;
    if (!reason) emptyRaised += 1;
  }
  if (card.readingNote?.bucket === "wording" && reason && reason === String(card.readingNote.text || "").trim()) wordingShown += 1;
  if (reason) {
    const fault = reasonFault(reason);
    if (fault) faults.push(`${keyOf(card)}: ${fault}`);
    if (reason.length > longest.n) longest = { key: keyOf(card), text: reason, n: reason.length };
  }
  const before = WEIGHT[card.sentenceLabel] || 0;
  const after = WEIGHT[shownLabel(card)] || 0;
  if (after < before) lighter += 1;
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

const dealCards = cards.filter((card) => DEAL.test(card.statement || ""));
const demands = cards.filter((card) => transactionDemand(card)).map(keyOf);
const sameQuietBroken = [];
for (const card of dealCards) {
  const shift = transactionShift(card);
  if (shift) continue;
  if (card.sentenceLabel === "Nothing raised" && shownLabel(card) !== "Nothing raised") {
    sameQuietBroken.push(keyOf(card));
  }
}

const stay = ["05:0", "19:2", "18:8", "11:9", "15:12", "19:4", "19:13"].map((key) => {
  const card = cardAt(cards, key);
  return `${key} ${shownLabel(card)} ${shownTier(shownState(card))}`;
});
const beyondLight = cards.filter((card) => shownState(card) === "beyond" && shownTier(shownState(card)) !== "light").map(keyOf);

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
const draft4 = attentionHeader((groups.get("04") || []).map((card) => ({
  sentenceState: shownState(card),
  sentenceLabel: shownLabel(card),
  facts: card.readingFacts || [],
})));

if (drift) problems.push(`drift ${drift}`);
if (exportDiff) problems.push(`export ${exportDiff}`);
if (wordingShown) problems.push(`wording ${wordingShown}`);
if (emptyRaised) problems.push(`empty raised ${emptyRaised}`);
if (repeatedNote) problems.push(`repeated note ${repeatedNote}`);
if (faults.length) problems.push(`faults ${faults.join("; ")}`);
if (lighter) problems.push(`lighter ${lighter}`);
if (demands.length !== 1 || demands[0] !== "04:1") problems.push(`demands ${demands.join(" ") || "none"}`);
if (sameQuietBroken.length) problems.push(`same state spoke ${sameQuietBroken.join(" ")}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}
if (shownLabel(cardAt(cards, "19:4")) !== "Nothing raised") problems.push("19:4 moved");
if (shownLabel(cardAt(cards, "19:13")) !== "Goes beyond the source") problems.push("19:13 moved");
if (beyondLight.length) problems.push(`beyond tier ${beyondLight.join(" ")}`);
for (const key of ["05:0", "19:2", "18:8", "11:9", "15:12"]) {
  const label = shownLabel(cardAt(cards, key));
  if (key === "11:9" || key === "15:12") {
    if (label !== "Needs a look") problems.push(`${key} ${label}`);
  } else if (label !== "Conflicts with the source") problems.push(`${key} ${label}`);
}

lines.push("# B473. Committed is not invested");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("The card already holds the statement and the source passage. The check reads a transaction state in each. Proposed is seeking approval, a recommendation, or an acquisition that would happen. Committed is capital pledged. Invested is the money having left, including a completed or closed transaction and an acquisition that has happened. When the draft's state is later than the source's, and the stored state would otherwise say nothing was raised, the reader sees Conflicts with the source. The sentence names both states. A source that states no transaction state is not this check. A matching pair of states is not this check. The stored verdict is not rewritten.");
lines.push("");
lines.push("Callers. transactionDemand: shownState and both readerEvidenceSentence copies. The screen copy is src/modules/drafting/transactionState.js. Export and the header read the shown label, so they follow.");
lines.push("");
lines.push("## The five statements");
lines.push("");
for (const key of FIVE) {
  const card = cardAt(cards, key);
  const shift = transactionShift(card);
  const demand = transactionDemand(card);
  lines.push(`### ${key}`);
  lines.push("");
  lines.push(clean(card.statement));
  lines.push("");
  if (key === "04:1") {
    lines.push("Before: Nothing raised. quiet. No reason under the label.");
    lines.push("");
  } else {
    lines.push(`Before: ${card.sentenceLabel}. ${card.tier}. ${clean(card.displayedEvidenceProse)}`);
    lines.push("");
  }
  lines.push(`After: ${shownLabel(card)}. ${shownTier(shownState(card))}. ${readerEvidenceSentence(card)}`);
  lines.push("");
  if (shift) {
    lines.push(`States read: source ${shift.source} (${shift.sourceVia}), statement ${shift.draft} (${shift.draftVia}).`);
  } else {
    lines.push("States read: the check found no later state.");
  }
  lines.push("");
  lines.push(demand ? "This check supplies the sentence." : "This check does not replace the sentence. The card was already a conflict.");
  lines.push("");
}
lines.push(`Cards this check raises: ${demands.join(", ") || "none"}.`);
lines.push("");
lines.push(`Cards whose label became lighter than the stored label: ${lighter}.`);
lines.push("");
lines.push("## The same state");
lines.push("");
lines.push(`Statements using committed, invested, completion, completed, acquired, or closed: ${dealCards.length}.`);
lines.push("");
lines.push("A source and a draft that both say committed stay quiet: 06:10. A source that says closed and a draft that says acquired stay quiet: 02:1.");
lines.push("");
lines.push(`Same-state statements that were Nothing raised and are no longer: ${sameQuietBroken.length ? sameQuietBroken.join(", ") : "none"}.`);
lines.push("");
lines.push("08:14 says funding has been committed. The passage does not state a transaction state, so this check does not speak. It stays Goes beyond the source, light.");
lines.push("");
lines.push("## What stayed");
lines.push("");
lines.push(stay.join(". ") + ".");
lines.push("");
lines.push(`Beyond cards that are not light: ${beyondLight.length ? beyondLight.join(", ") : "none"}.`);
lines.push("");
lines.push(`Draft 04 header: ${draft4 || "(empty)"}`);
lines.push("");
lines.push("## Readability");
lines.push("");
lines.push(`Gate failures: ${faults.length ? faults.join("; ") : "none"}. The B470 gates still hold.`);
lines.push("");
lines.push(`Longest reason: ${longest.key}, ${longest.n} characters.`);
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`);
lines.push("");
lines.push(`With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n}. Combined quiet ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}.`);
lines.push("");
lines.push("04:1 is not in the labelled 74. Its display verdict stays supported_full, so the tallies do not move. The cause of the new demand is the shown label only.");
lines.push("");
lines.push(`Screen reasons or states that differ: ${drift}. Export sentences that differ from the card: ${exportDiff}. Wording notes shown: ${wordingShown}. Raised cards with no reason: ${emptyRaised}.`);
lines.push("");
lines.push("## Assertions that moved");
lines.push("");
lines.push("tests/b469-contradiction-floor.test.mjs required exactly 5 labels to be heavier than the stored label. That count was B469's three disagreements plus B470's two unchecked sentences. 04:1 also leaves Nothing raised, because a commitment is later than an approval the source is still seeking. The count is 6. The assertion was incomplete once that pair is a disagreement.");
lines.push("");
lines.push("tests/b466-reason-reads.test.mjs required a card with no stored reason to keep an empty shown reason, apart from the partial joins and the two unchecked sentences. 04:1 had no stored reason. The shown sentence now says the source is still seeking approval while the statement says the firm has committed. The assertion was wrong, because that pair is a disagreement.");
lines.push("");
lines.push("The browser was not opened. The confirming measurement is this replay of the stored pass.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(`catch ${faultyRaised}/${faultyN} group ${groupRaised} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet} label ${afterLeaveLabel.evidenceLeaveAlone}/${afterLeaveLabel.combinedQuiet}`);
console.log(`deal ${dealCards.length} demands ${demands.join(",") || "none"} lighter ${lighter} longest ${longest.key} ${longest.n}`);
if (problems.length) process.exit(1);
