/**
 * B477. Replay the stored B464 pass after a revised figure is named. No model call.
 *
 *   node scripts/diagnostic/b477/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { floorState, liveContradiction } from "../../../lib/qc/contradiction-floor.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { readerEvidenceSentence, readerSentences } from "../../../lib/qc/reader-reason.mjs";
import { reasonFault } from "../../../lib/qc/partial-reason.mjs";
import { shownLabel, shownState, shownTier, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { buildAsOfBySourceIndex, resolveSupersession } from "../../../lib/qc/supersession.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const DATING = path.join(__dirname, "dating.md");
const FAULTY = new Set(["conflicting", "no_support"]);
const SIX = {
  "05:0": "Conflicts with the source",
  "19:2": "Conflicts with the source",
  "18:8": "Conflicts with the source",
  "11:9": "Needs a look",
  "15:12": "Needs a look",
  "04:1": "Conflicts with the source",
};
const FOUR = [3, 4, 5, 8];
const SENTENCE = new Set(["partial", "beyond", "conflicts", "not_in_source"]);

function pad(id) {
  return String(id).padStart(2, "0");
}
function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
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

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const dating = readFileSync(DATING, "utf8");
const fixtures = await loadAllFixtures();
const loaded = new Map();
for (const fixture of fixtures) {
  const id = pad(fixture.data.id);
  if (Number(id) < 1 || Number(id) > 20) continue;
  const sources = await loadPipelineSources(fixture.data.sources || []);
  loaded.set(id, { sources, asOf: buildAsOfBySourceIndex(sources) });
}

function apply(card) {
  const row = loaded.get(pad(card.fixtureId));
  if (!row) return { ...card, supersededSourceNotes: card.supersededSourceNotes || [] };
  const matches = Array.isArray(card.matchExplanations) && card.matchExplanations.length >= 2
    ? card.matchExplanations
    : [{ sourceIndex: 0 }, { sourceIndex: 1 }];
  const resolved = resolveSupersession({
    statement: card.statement,
    aggregateVerdict: "conflicting",
    sourceMatches: matches,
    asOfBySourceIndex: row.asOf,
    sources: row.sources,
  });
  return { ...card, supersededSourceNotes: resolved.supersededNotes };
}

const original = pass.cards;
const cards = original.map(apply);
const problems = [];
const noted = cards.filter((card) => Array.isArray(card.supersededSourceNotes) && card.supersededSourceNotes.length);
const notedKeys = noted.map(keyOf);
if (notedKeys.join(",") !== "18:3,18:4,18:5,18:8") problems.push(`notes on ${notedKeys.join(", ") || "none"}`);

let outsideChanged = 0;
let storedMoved = 0;
let lighter = 0;
const reasonChanges = [];
for (let i = 0; i < original.length; i += 1) {
  const before = original[i];
  const after = cards[i];
  if (before.displayVerdict !== after.displayVerdict || before.sentenceState !== after.sentenceState || before.tier !== after.tier) {
    storedMoved += 1;
  }
  const labelBefore = shownLabel(before);
  const labelAfter = shownLabel(after);
  if (labelBefore !== labelAfter) {
    const order = ["Needs a look", "Conflicts with the source", "Not in the source", "Goes beyond the source", "Partly in the source", "Nothing raised", "Nothing to raise"];
    if (order.indexOf(labelAfter) > order.indexOf(labelBefore)) lighter += 1;
  }
  const reasonBefore = readerEvidenceSentence(before);
  const reasonAfter = readerEvidenceSentence(after);
  if (reasonBefore !== reasonAfter || labelBefore !== labelAfter || shownTier(shownState(before)) !== shownTier(shownState(after))) {
    if (pad(before.fixtureId) !== "18") outsideChanged += 1;
    reasonChanges.push(keyOf(before));
  }
}
if (outsideChanged) problems.push(`${outsideChanged} cards outside fixture 18 changed`);
if (storedMoved) problems.push(`${storedMoved} stored fields moved`);
if (lighter) problems.push(`${lighter} labels became lighter`);
const expectedChanges = new Set(FOUR.map((index) => `18:${index}`));
for (const key of reasonChanges) {
  if (!expectedChanges.has(key)) problems.push(`unexpected change ${key}`);
}
for (const key of expectedChanges) {
  if (!reasonChanges.includes(key)) problems.push(`missing change ${key}`);
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
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}

let longReason = 0;
let emptyRaised = 0;
let wordingShown = 0;
let exportDrift = 0;
let faults = 0;
const labelCounts = new Map();
for (const card of cards) {
  const state = shownState(card);
  const label = shownLabel(card);
  labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  const reason = readerEvidenceSentence(card) || "";
  const sentenceBearing = SENTENCE.has(state) || (state === "note_withheld" && card.evidenceNotReviewedReason);
  if (sentenceBearing) {
    if (!reason) emptyRaised += 1;
    if (readerSentences(reason).length > 3) longReason += 1;
    if ((evidenceFindingForExport(card) || "") !== reason) exportDrift += 1;
    if (reasonFault(reason)) faults += 1;
  }
  if (String(card?.readingNote?.bucket || "").toLowerCase() === "wording" && reason && reason === String(card.readingNote.text || "").trim()) {
    wordingShown += 1;
  }
}
if (faults) problems.push(`${faults} reasons fail a readability gate`);
if (longReason) problems.push(`${longReason} reasons over three sentences`);
if (emptyRaised) problems.push(`${emptyRaised} raised cards with no reason`);
if (wordingShown) problems.push(`${wordingShown} wording notes shown`);
if (exportDrift) problems.push(`${exportDrift} export sentences differ`);
for (const [key, label] of Object.entries(SIX)) {
  const [fixture, index] = key.split(":");
  const card = cards.find((row) => pad(row.fixtureId) === fixture && row.index === Number(index));
  if (shownLabel(card) !== label) problems.push(`${key} ${shownLabel(card)}`);
}

const beforeCounts = new Map();
for (const card of original) {
  const label = shownLabel(card);
  beforeCounts.set(label, (beforeCounts.get(label) || 0) + 1);
}
for (const [label, count] of beforeCounts) {
  if (labelCounts.get(label) !== count) problems.push(`header count ${label} ${labelCounts.get(label)} from ${count}`);
}

const eightBefore = original.find((row) => pad(row.fixtureId) === "18" && row.index === 8);
const eightAfter = cards.find((row) => pad(row.fixtureId) === "18" && row.index === 8);
const floorText = liveContradiction(eightBefore)?.explanation || "";

const lines = [];
lines.push("# B477. A figure the newest source has revised");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push(dating.trim());
lines.push("");
lines.push("Part One was written before the card behaviour changed. Fixture 18's two sources are both dated from a Date: line, 15 April 2025 and 28 May 2025, and the dates are not equal. The order is established. The update states 412 property management companies. The brief's 420 is not the figure in that document.");
lines.push("");
lines.push("## The four cards");
lines.push("");
lines.push("The initial memo is 18a_synth_cross_source_pair_initial, dated 15 April 2025, cue Date: label, confident. The update is 18b_synth_cross_source_pair_update, dated 28 May 2025, cue Date: label, confident.");
lines.push("");
for (const index of FOUR) {
  const before = original.find((row) => pad(row.fixtureId) === "18" && row.index === index);
  const after = cards.find((row) => pad(row.fixtureId) === "18" && row.index === index);
  lines.push(`### 18:${index}`);
  lines.push("");
  lines.push(before.statement);
  lines.push("");
  lines.push(`Shown label before: ${shownLabel(before)}. Tier before: ${shownTier(shownState(before))}.`);
  lines.push("");
  lines.push(`Shown label after: ${shownLabel(after)}. Tier after: ${shownTier(shownState(after))}.`);
  lines.push("");
  lines.push(`Reason before: ${readerEvidenceSentence(before)}`);
  lines.push("");
  lines.push(`Reason after: ${readerEvidenceSentence(after)}`);
  lines.push("");
}
lines.push("18:3, 18:4, and 18:5 were already Conflicts with the source from the matcher. They stay that. The reason is now the revision sentence.");
lines.push("");
lines.push("18:8's label is still Conflicts with the source because the B469 floor sees a live conflicting match and the stored sentence state is beyond. That floor still supplies the label. It does not supply the reason. Before, the reason was the floor's explanation. After, the reason is the revision sentence alone. The floor explanation is not appended, so the disagreement is not counted twice.");
lines.push("");
lines.push(`Floor explanation that used to be the reason: ${floorText}`);
lines.push("");
lines.push(`Floor state after: ${floorState(eightAfter)}.`);
lines.push("");
lines.push("## Notes");
lines.push("");
lines.push(`supersededSourceNotes was empty on all 261 stored cards. After this reading it is non-empty on ${notedKeys.join(", ")} only.`);
lines.push("");
lines.push("No card outside fixture 18 changed label, tier, or reason. No stored displayVerdict, sentenceState, or tier changed. Labels that became lighter: 0.");
lines.push("");
lines.push("## The other direction, and silence");
lines.push("");
lines.push("The exonerating direction is unchanged. A newer source that confirms the draft still clears a strictly older conflict, and that note still begins 'An older source'. The corpus has no such card. The test constructs one.");
lines.push("");
lines.push("When the two dates are equal, or one source has no date, the note is empty and the reason is the one the card has today. The test constructs both.");
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`);
lines.push("");
lines.push(`With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n}. Combined quiet ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}. Movement: none.`);
lines.push("");
lines.push("The six labels raised by B469, B470, and B473 stay raised, including 18:8.");
lines.push("");
lines.push(`Export sentence differs from the card sentence on ${exportDrift} raised cards. Wording notes shown: ${wordingShown}. Raised cards with no reason: ${emptyRaised}. Reasons over three sentences: ${longReason}. Readability faults: ${faults}.`);
lines.push("");
lines.push("The header counts the shown label. Those counts are unchanged, because no label changed.");
lines.push("");
lines.push("Callers of resolveSupersession: the statement path in lib/qc/pipeline-v4/index.mjs now passes the source texts, and can store this note without moving the verdict. The claim-span path does not pass source texts, so it is unchanged. Tests and diagnostic scripts that call the function without source texts are unchanged.");
lines.push("");
lines.push("The browser was not opened. The sentence is the stored pass, not a screen that can be seeded without a review.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(`notes ${notedKeys.join(",")} catch ${faultyRaised}/${faultyN} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet}`);
if (problems.length) process.exit(1);
