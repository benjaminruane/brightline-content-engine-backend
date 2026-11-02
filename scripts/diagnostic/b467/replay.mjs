/**
 * B467. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b467/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict, shownState } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { assertsAgreement } from "../../../lib/qc/source-account.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { reasonFault } from "../../../lib/qc/partial-reason.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { notCheckedReasonSentence } from "../../../lib/qc/not-reviewed-reason.mjs";
import { restoredSourceAwarenessConcerns } from "../../../lib/qc/editorial-source-awareness.mjs";
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

const HEADER_BEFORE = {
  "02": "1 worth a glance",
  "19": "2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance",
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
function withRestored(card) {
  const restored = restoredSourceAwarenessConcerns(card);
  if (!restored.length) return card;
  return {
    ...card,
    editorialConcerns: [...(card.editorialConcerns || []), ...restored],
    editorialVerdict: card.editorialVerdict === "not_reviewed" ? card.editorialVerdict : "concern",
  };
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
const lines = [];
const problems = [];

let unchanged = 0;
let drift = 0;
let exportDiff = 0;
let wordingShown = 0;
let unrecorded = 0;
const faults = [];
const reasonChanges = [];

for (const card of cards) {
  const reason = readerEvidenceSentence(card) || "";
  const screen = screenSentence(card) || "";
  if (reason !== screen) drift += 1;
  if (
    card.displayVerdict != null
    && card.sentenceState != null
    && card.sentenceLabel != null
    && card.tier != null
  ) unchanged += 1;
  const state = shownState(card);
  if (["partial", "beyond", "conflicts", "not_in_source"].includes(state)) {
    if ((evidenceFindingForExport(card, false) || "") !== reason) exportDiff += 1;
  }
  if (card.readingNote?.bucket === "wording" && reason && reason === String(card.readingNote.text || "").trim()) {
    wordingShown += 1;
  }
  if (reason === UNRECORDED) unrecorded += 1;
  if (reason) {
    const fault = reasonFault(reason);
    if (fault) faults.push(`${keyOf(card)}: ${fault}`);
    if (reason !== UNRECORDED && endorsementHit(maskVerbatimQuotes(reason, sourceCorpus(card)))) {
      faults.push(`${keyOf(card)}: endorsement`);
    }
    if (assertsAgreement(reason)) faults.push(`${keyOf(card)}: agreement`);
  }
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && prose !== UNRECORDED && reason !== prose) {
    reasonChanges.push({ key: keyOf(card), before: clean(prose), after: clean(reason) });
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
const beforeLeave = tallyLeaveAlone(confirmed);
const beforeLeaveLabel = tallyLeaveAloneWithLabel(confirmed);
const restoredConfirmed = confirmed.map(withRestored);
const afterLeave = tallyLeaveAlone(restoredConfirmed);
const afterLeaveLabel = tallyLeaveAloneWithLabel(restoredConfirmed);
const moved = [];
for (let i = 0; i < confirmed.length; i += 1) {
  const was = layerSpoken(confirmed[i]).editorial.raised;
  const now = layerSpoken(restoredConfirmed[i]).editorial.raised;
  if (was !== now) moved.push(keyOf(confirmed[i]));
}

if (unchanged !== 261) problems.push(`verdict fields ${unchanged}`);
if (drift !== 0) problems.push(`drift ${drift}`);
if (exportDiff !== 0) problems.push(`export ${exportDiff}`);
if (wordingShown !== 0) problems.push(`wording ${wordingShown}`);
if (unrecorded > 2) problems.push(`unrecorded ${unrecorded}`);
if (faults.length) problems.push(`faults ${faults.join("; ")}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
const headerNow = new Map();
for (const [id, group] of groups) {
  headerNow.set(id, attentionHeader(group.map((card) => ({
    sentenceState: card.sentenceState,
    displayVerdict: card.displayVerdict,
    facts: card.readingFacts || [],
  }))));
}

lines.push("# B467. Six sites, and the instrument that ranks them");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("Agreement is tested on the whole sentence. A possessive is not treated as a quotation, so the verb is still visible. The verb has to be about the statement. A negation, and a sentence that only reports what the source contains, stay.");
lines.push("");
lines.push("A joined difference that starts with a bare verb takes the subject the model already wrote before the join. No new word is added.");
lines.push("");
lines.push("Source awareness drops a concern only when the objection is causal or evaluative. House style, number form, and whether a sentence belongs in the draft stay. On a stored card those three drops are shown again.");
lines.push("");
lines.push("A stored reason for a check that did not run is shown as a sentence. The slug is not shown.");
lines.push("");
lines.push("The header names a conflict that sits on a card whose sentence state is not conflicts, when the draft would otherwise not say conflict. A needs-a-look card leads when nothing heavier is in the line. A draft that already names a conflict keeps its line.");
lines.push("");
lines.push("The census counts the fault named by the reviewer sentence. Where the fault cannot be split from the population, the row says it cannot be counted.");
lines.push("");
lines.push("Callers. assertsAgreement: reader-reason accept, the B456 score, the B460 replay, the B456 test, and the screen's allowed(). asOwnSentence: partial reason on both sides, and the reader reason that asks for it when the stored sentence is missing. applyEditorialSourceAwareness: stage 7 assemble, and the editorial tests. attentionHeader: the reading header, the B460 census, and the reading-view test.");
lines.push("");
lines.push("## Problem 1. Agreement");
lines.push("");
lines.push("08:3 now shows:");
lines.push("");
lines.push(readerEvidenceSentence(cardAt(cards, "08:3")));
lines.push("");
lines.push("14:2 now shows:");
lines.push("");
lines.push(readerEvidenceSentence(cardAt(cards, "14:2")));
lines.push("");
lines.push("Sentences on the pass that the wider test withholds, and that the eighty-character test did not. Each of these was a stored explanation or the stored prose. The shown reason changes only where that text was the sentence on the card.");
lines.push("");
for (const row of reasonChanges) {
  lines.push(`- ${row.key}`);
  lines.push(`  Before: ${row.before}`);
  lines.push(`  After: ${row.after}`);
}
lines.push("");
lines.push("The other withheld explanations are 02:7, 04:15, 13:1, 13:2, 14:11, and 19:12. They were not the sentence on the card, so the card's reason is unchanged.");
lines.push("");
lines.push(`Cards with no reason under a raised verdict: ${cards.filter((card) => ["partial", "beyond", "conflicts", "not_in_source"].includes(shownState(card)) && !readerEvidenceSentence(card)).length}.`);
lines.push("");
lines.push("## Problem 2. A joined sentence with no subject");
lines.push("");
lines.push("08:10 before: The source states base case revenue growth of 9% CAGR, with components including organic growth tied to end-market expansion and aerospace build-rate increases of ~40% over five years. Does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases.");
lines.push("");
lines.push(`08:10 after: ${readerEvidenceSentence(cardAt(cards, "08:10"))}`);
lines.push("");
lines.push("18:6 was the same shape. Before, the second sentence began \"Does not specifically mention\". The model wrote \"but does not\", and the subject \"The source\" is the opening of that explanation.");
lines.push("");
lines.push(`18:6 after: ${readerEvidenceSentence(cardAt(cards, "18:6"))}`);
lines.push("");
lines.push(`Reason faults, including a bare verb, a lowercase connective after a stop, a comma inside a closing quote, and a reason past three sentences: ${faults.length}.`);
lines.push("");
lines.push("## Problem 3. House style survives");
lines.push("");
lines.push("Shown again, verdict before clean, after concern:");
lines.push("");
for (const key of ["16:0", "15:24", "09:12"]) {
  const row = cardAt(cards, key);
  const text = restoredSourceAwarenessConcerns(row)[0]?.note || "";
  lines.push(`- ${key}. Before: ${row.editorialVerdict}. After: concern.`);
  lines.push(`  ${text}`);
}
lines.push("");
lines.push("Still dropped:");
lines.push("");
const stayed = [];
for (const card of cards) {
  for (const drop of card.drops || []) {
    if (drop?.rule !== "source_awareness" || drop?.reason !== "dropped") continue;
    if (restoredSourceAwarenessConcerns(card).some((row) => row.note === drop.content)) continue;
    stayed.push(`- ${keyOf(card)}. ${clean(drop.content)}`);
  }
}
lines.push(stayed.join("\n"));
lines.push("");
lines.push(`Leave-alone before the restore: evidence ${beforeLeave.evidenceLeaveAlone} of ${confirmed.length}, combined quiet ${beforeLeave.combinedQuiet} of ${confirmed.length}. With the label: ${beforeLeaveLabel.evidenceLeaveAlone} and ${beforeLeaveLabel.combinedQuiet}.`);
lines.push("");
lines.push(`After the three objections are restored: evidence ${afterLeave.evidenceLeaveAlone}, combined quiet ${afterLeave.combinedQuiet}. With the label: ${afterLeaveLabel.evidenceLeaveAlone} and ${afterLeaveLabel.combinedQuiet}.`);
lines.push("");
lines.push(`Cards whose editorial layer starts speaking because of the restore, inside the 74 confirmed statements: ${moved.join(", ") || "none"}. The three restored cards are not in that confirmed set, so both leave-alone figures stay.`);
lines.push("");
lines.push("## Problem 4. Not checked");
lines.push("");
for (const key of ["11:9", "15:12"]) {
  const row = cardAt(cards, key);
  lines.push(`${key}: ${notCheckedReasonSentence(row.evidenceNotReviewedReason)}`);
}
lines.push("");
lines.push("## Problem 5. The header");
lines.push("");
lines.push("Draft 19. Heaviest card verdict: conflict. Before: 2 facts are not in the source, across 2 of your 14 statements. 1 worth a glance. After: " + headerNow.get("19"));
lines.push("");
lines.push("Draft 02. Heaviest card verdict: Needs a look. Before: 1 worth a glance. After: " + headerNow.get("02"));
lines.push("");
const headerMoves = [];
for (const [id, line] of headerNow) {
  if (HEADER_BEFORE[id] && HEADER_BEFORE[id] !== line) headerMoves.push(id);
}
lines.push(`Drafts whose header changed: ${[...headerNow.keys()].filter((id) => HEADER_BEFORE[id]).join(", ")}.`);
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Verdict fields present on every card: ${unchanged} of ${cards.length}. displayVerdict, sentenceState, sentenceLabel, and tier are the stored values. None of this spec writes them.`);
lines.push("");
lines.push(`Catch ${faultyRaised} of ${faultyN}. Group A ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Screen drift: ${drift}. Export differs from the card sentence: ${exportDiff}. Wording notes shown: ${wordingShown}. Unrecorded line: ${unrecorded}.`);
lines.push("");
lines.push("The B466 test required every stored sentence to stay, including 08:3 and 14:2. That assertion was wrong: those sentences tell the reader the source supports the statement. They are withheld, and the evidence line is what the card shows. The same test also required 08:10 to begin its second sentence with \"Does not\". That was the subjectless join this spec removes. The words after \"does not\" are unchanged.");
lines.push("");
lines.push("The three B465 quote lines are still released. The banned word sits inside a quotation from the card's own passage.");
lines.push("");
for (const key of ["06:3", "15:9", "17:7"]) {
  const row = cardAt(cards, key);
  const reason = readerEvidenceSentence(row) || "";
  const quoted = /support/i.test(reason)
    ? reason
    : ((row.drops || []).find((drop) => drop?.rule === "reader_prose_withheld")?.content || row.evidenceLine || "");
  lines.push(`- ${key}: ${clean(quoted).slice(0, 220)}`);
}
lines.push("");
if (problems.length) {
  lines.push("## Problems");
  lines.push("");
  for (const problem of problems) lines.push(`- ${problem}`);
  lines.push("");
}
writeFileSync(RESULT, lines.join("\n"));
console.log(problems.length ? problems.join("\n") : "ok");
console.log("leave", beforeLeave.evidenceLeaveAlone, beforeLeave.combinedQuiet, "after", afterLeave.evidenceLeaveAlone, afterLeave.combinedQuiet);
console.log("moved", moved.join(" "));
console.log("wrote", RESULT);
