/**
 * B460. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b460/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { assertsAgreement } from "../../../lib/qc/source-account.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { hasEgregiousMagnitudeGap } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { evidenceQuietOf, layerSpoken, quietOf, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { censusMarkdown } from "./census.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b456/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const CENSUS = path.join(__dirname, "CENSUS3.md");
const FAULTY = new Set(["conflicting", "no_support"]);

const BOTH = ["01:9", "04:3", "06:5", "08:6", "09:1", "11:7", "12:0", "14:11", "15:10", "15:11", "15:24", "16:4", "17:2", "19:1", "19:7", "19:13"];
const NINE = ["01:9", "04:3", "06:5", "08:6", "09:1", "15:10", "15:24", "16:4", "17:2"];
const REAL = ["05:0", "05:5", "08:2", "13:4", "13:7", "15:2", "18:0", "18:2", "18:3", "18:4", "18:5", "18:7", "18:8", "19:2"];
const MODALITY = ["18:2", "08:2", "15:2", "18:0"];
const REMAIN = {
  "11:7": "The stored match is confirmed and says the source agrees. The conflict is a span, and the card's silence is source_difference_missing, so no difference was written.",
  "12:0": "The stored match is confirmed. The conflict is a span: the sentence says more than four years, and the source also gives the acquisition year. The span is not on the card.",
  "14:11": "Labelled conflicting. The stored match is partial, not a demoted confirmation. The sentence is already Goes beyond the source. Clearing the conflict would drop catch.",
  "15:11": "The stored match is confirmed. The source uses both fifth and third for the same format. The conflict is a span, not a figure pair.",
  "19:1": "The quoted passage contains both 0.94x and 2.13x, so this guard does not demote it. The stored match is still confirmed. The conflict was a span that was not stored.",
  "19:7": "The stored match is partial. 2024 is the investment year and the 2025 figures are in the passage. This was not a confirmed class demoted by a figure pair.",
  "19:13": "The stored match is partial. The sentence adds the quarters. The label is already Goes beyond the source. This was not a figure pair.",
};

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

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function clip(text) {
  const body = clean(text);
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

function excerptsOf(card) {
  return [card.primaryExcerpt, card.conflictExcerpt].filter((text) => typeof text === "string" && text.trim());
}

function stillDemotes(card) {
  const hits = [];
  for (const text of excerptsOf(card)) {
    const verdict = confirmingPassageVerdict(card.statement, text);
    if (verdict.demoteTo) hits.push(verdict);
  }
  return hits;
}

function afterOf(card) {
  const before = card.displayVerdict;
  if (before !== "conflict") return { display: before, restored: false, why: "not a conflict" };
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const flipped = matches.filter((row) => row.classification === "conflicting" && row.writtenFor === "confirmed");
  if (!flipped.length) return { display: before, restored: false, why: "the model, a span, or another backstop wrote it" };
  if (!excerptsOf(card).length) return { display: before, restored: false, why: "no passage is stored to re-test" };
  const hits = stillDemotes(card);
  if (hits.length) return { display: before, restored: false, why: `the guard still fires (${hits[0].evidence || hits[0].rule})` };
  const next = matches.map((row) => (
    row.classification === "conflicting" && row.writtenFor === "confirmed"
      ? { ...row, classification: "confirmed" }
      : row
  ));
  if (next.some((row) => row.classification === "conflicting")) {
    return { display: before, restored: false, why: "another match on the card is still conflicting" };
  }
  if (next.some((row) => row.classification === "partially_confirmed")) {
    return { display: "supported_partial", restored: true, why: "the demote was the only conflict" };
  }
  if (next.some((row) => row.classification === "confirmed")) {
    return { display: "supported_full", restored: true, why: "the demote was the only conflict" };
  }
  return { display: "not_supported", restored: true, why: "the demote was the only conflict" };
}

function modelWroteConflict(row) {
  return row?.classification === "conflicting" && !row.writtenFor && !assertsAgreement(row.explanation);
}

function explainable(card, after) {
  if (card.displayVerdict !== "conflict") return false;
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const conflicting = matches.filter((row) => row.classification === "conflicting");
  if (typeof card.secondValueLine === "string" && card.secondValueLine.trim() && conflicting.every((row) => modelWroteConflict(row) || !row.writtenFor)) {
    if (conflicting.length && conflicting.every(modelWroteConflict)) return true;
    if (!conflicting.length && card.secondValueLine.trim()) return true;
  }
  if (!conflicting.length) return false;
  if (conflicting.every(modelWroteConflict)) return true;
  if (!after) return false;
  return conflicting.every((row) => {
    if (modelWroteConflict(row)) return true;
    if (row.writtenFor === "confirmed") {
      const hits = stillDemotes(card);
      return hits.length > 0 && Boolean(hits[0].evidence);
    }
    if (row.writtenFor === "partially_confirmed") {
      return excerptsOf(card).some((text) => hasEgregiousMagnitudeGap(card.statement, text));
    }
    return false;
  });
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

function withSentence(card, displayVerdict, verdict) {
  return { ...card, displayVerdict, sentenceState: verdict.state, tier: verdict.tier, statementVerdict: verdict };
}

function tallyLine(label, tally) {
  return `${label}: evidence leave-alone ${tally.evidenceLeaveAlone} of ${tally.n}, combined quiet ${tally.combinedQuiet} of ${tally.n}.`;
}

function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b460 replay: expected 261 cards, found ${cards?.length}`);
}

const byKey = new Map(cards.map((card) => [keyOf(card), card]));
for (const key of [...BOTH, ...REAL, ...MODALITY]) {
  if (!byKey.has(key)) throw new Error(`b460 replay: missing card ${key}`);
}

const judged = cards.map((card) => ({ card, key: keyOf(card), after: afterOf(card) }));
const conflictsBefore = judged.filter((row) => row.card.displayVerdict === "conflict");
const conflictsAfter = judged.filter((row) => row.after.display === "conflict");
const explainBefore = conflictsBefore.filter((row) => explainable(row.card, false));
const explainAfter = conflictsAfter.filter((row) => explainable(row.card, true));

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const byJoin = new Map(cards.map((card) => [joinKey(card.fixtureId, card.statement, card.occurrence), card]));
const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));

let faultyN = 0;
let faultyRaised = 0;
const faultyMisses = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (card && raised(card)) faultyRaised += 1;
  else faultyMisses.push(`${pad(row.fixtureId)} ${row.label}`);
}
let groupRaised = 0;
const groupMisses = [];
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const card = key ? byJoin.get(key) : null;
  const judgedRow = card ? judged.find((row) => row.card === card) : null;
  const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (afterCard && raised(afterCard)) groupRaised += 1;
  else groupMisses.push(fault.id);
}

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  sourcesByFixture.set(padFixtureId(fixture.data.id), await loadPipelineSources(fixture.data.sources || []));
}

const confirmedBefore = [];
const confirmedAfter = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const card = byJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!card) throw new Error(`b460 replay: confirmed label has no card ${row.fixtureId}`);
  const sources = sourcesByFixture.get(pad(card.fixtureId));
  if (!sources) throw new Error(`b460 replay: no sources for ${card.fixtureId}`);
  const facts = buildFacts({ statement: card.statement, draft: card.statement, sourceText: readingSourceText(sources) });
  const judgedRow = judged.find((item) => item.card === card);
  confirmedBefore.push(withSentence(card, card.displayVerdict, verdictOf(card, facts, card.displayVerdict)));
  confirmedAfter.push(withSentence(card, judgedRow.after.display, verdictOf(card, facts, judgedRow.after.display)));
}
const oldBefore = tallyLeaveAlone(confirmedBefore);
const newBefore = tallyLeaveAloneWithLabel(confirmedBefore);
const oldAfter = tallyLeaveAlone(confirmedAfter);
const newAfter = tallyLeaveAloneWithLabel(confirmedAfter);

const census = censusMarkdown(cards);
writeFileSync(CENSUS, census.markdown);

const unmatched = census.rows.filter((row) => row.store.startsWith("Store what the code already knows"));

function lineFor(key) {
  const card = byKey.get(key);
  const after = afterOf(card);
  return { key, before: card.displayVerdict, after: after.display, why: REMAIN[key] || after.why, statement: clip(card.statement) };
}

const bothLines = BOTH.map(lineFor);
const nineLeft = NINE.map(lineFor).filter((row) => row.after === "conflict");
const realLines = REAL.map(lineFor);
const realMoved = realLines.filter((row) => row.after !== "conflict");
const modalityLines = MODALITY.map(lineFor);
const modalityMoved = modalityLines.filter((row) => row.before !== row.after);

const lines = [];
lines.push("# B460. A figure pair does not invent a conflict.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.");
lines.push("");
lines.push("A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("Rule (b) in `confirmingPassageVerdict` no longer treats two figures as one quantity when the draft figure's number is already in the passage, or when the source number rounded to the draft's decimal places equals the draft. That is the same rounding test the magnitude backstop already uses. Rule (a), the single-money case, is unchanged. A class the model already set to conflicting is not opened.");
lines.push("");
lines.push("Every step that changes a classification appends `{ rule, from, to, evidence }`. The evidence is the two figures, the two periods, or the span's passage and its class. The record is copied onto the match explanation and onto the card. The screen does not read it. The next stored pass will, through `compactCard`.");
lines.push("");
lines.push("Rules recorded: `figure_pair`, `date_pair`, `single_money`, `magnitude_gap`, `within_rounding`, `procedural_closer`, `period_non_overlap`, `period_same_frame`, `period_frame_mismatch`, `empty_confirmation`, `span_outvote`, `second_value`, `superseded_source`, `coverage_union`, `omission_covered`, `empty_confirmation_recovery`, `excerpt_not_locatable`, `excerpt_honesty`, `framing_fidelity`, `actor_mismatch`, `scale_cause`, `role_party`, `generic_company`, `announcement_dateline`.");
lines.push("");
lines.push("`lib/qc/pipeline-v4/prompts/source-difference.md` was already removed in B457. The test that asserts it is gone still passes. `buildSourceAccount` is removed from `lib/qc/source-account.mjs`. The live path did not import it. `assertsAgreement`, `sentenceIsTemplate`, `productSentences`, and `renderDifference` stay, because the B456 score and the B459 read still use them to recognise a stored sentence. The live quote check is `quoteIsVerbatim` in `lib/qc/evidence-line.mjs`.");
lines.push("");
lines.push("## The 16 that can both be true");
lines.push("");
lines.push("| Card | Before | After | Why |");
lines.push("| --- | --- | --- | --- |");
for (const row of bothLines) {
  lines.push(`| ${row.key} | ${row.before} | ${row.after} | ${String(row.why).replace(/\.$/, "")}. ${row.statement} |`);
}
lines.push("");
const nineCleared = NINE.filter((key) => byKey.get(key) && afterOf(byKey.get(key)).display !== "conflict");
lines.push(`The nine demotions: ${nineCleared.length} of 9 cleared.`);
if (nineLeft.length) {
  lines.push("");
  lines.push("Still a conflict:");
  for (const row of nineLeft) lines.push(`- ${row.key}: ${row.why}. ${row.statement}`);
}
lines.push("");
lines.push("The other seven of the sixteen were not this demote. They stay conflicts because a span or the model wrote them, not because a figure pair did:");
for (const row of bothLines.filter((item) => !NINE.includes(item.key))) {
  lines.push(`- ${row.key} stays ${row.after}. ${row.why} ${row.statement}`);
}
lines.push("");
lines.push("## The 14 real conflicts");
lines.push("");
lines.push(realMoved.length ? `${realMoved.length} moved. That is a defect in the guard.` : "All 14 stayed conflicts.");
lines.push("");
for (const row of realLines) lines.push(`- ${row.key} ${row.before} -> ${row.after}. ${row.statement}`);
lines.push("");
lines.push("## The modality shape");
lines.push("");
lines.push("`18:2` is the labelled case: invested against a source that still recommends the investment. `08:2`, `15:2`, and `18:0` are the same shape, a status the model wrote, and the figures match. The guard does not read status words, and it does not open a class the model set to conflicting.");
lines.push("");
for (const row of modalityLines) lines.push(`- ${row.key} ${row.before} -> ${row.after}. ${row.statement}`);
lines.push("");
lines.push(modalityMoved.length ? "One of them moved. That is a defect." : "All four are untouched.");
lines.push("");
lines.push("## Catch, and what is left alone");
lines.push("");
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}.`);
if (faultyMisses.length) lines.push(`Misses: ${faultyMisses.join(", ")}.`);
lines.push(`Group A: ${groupRaised} of ${design.faults.length}.`);
if (groupMisses.length) lines.push(`Misses: ${groupMisses.join(", ")}.`);
lines.push("");
lines.push("B458, on this same pass: old definition 49 of 74 and combined quiet 32 of 74, on the stored cards and on the B457 and B458 replays. New definition on the stored cards: 47 of 74 and 30 of 74. On the B457 and B458 replays the new numbers are 49 and 32.");
lines.push("");
lines.push("This replay uses the same fact build as the B458 replay, then the display verdict after the guard.");
lines.push("");
lines.push(tallyLine("Before, old definition", oldBefore));
lines.push(tallyLine("Before, new definition", newBefore));
lines.push(tallyLine("After, old definition", oldAfter));
lines.push(tallyLine("After, new definition", newAfter));
lines.push("");
const rose = [];
for (let i = 0; i < confirmedBefore.length; i += 1) {
  if (!evidenceQuietOf(confirmedBefore[i]) && evidenceQuietOf(confirmedAfter[i])) {
    const card = confirmedAfter[i];
    rose.push(`${pad(card.fixtureId)}:${card.index}${quietOf(card) ? "" : " (another layer still speaks)"}`);
  }
}
lines.push(`Evidence leave-alone rose by ${rose.length}, on both definitions: ${rose.join(", ")}. Combined quiet stayed ${newAfter.combinedQuiet} because those two still have another layer speaking. 01:9 is in the 74 and is no longer a contradiction. A source-recency concern still speaks, so it does not enter the leave-alone count. The other six demotions are not in the 74.`);
lines.push("");
lines.push("## Conflict cards that explain themselves");
lines.push("");
lines.push(`Before: ${explainBefore.length} of ${conflictsBefore.length}. A conflict counts as explained when every conflicting match was written by the model and the explanation does not say the two sides agree, or a second value is stored and there is no flipped match.`);
lines.push(`After: ${explainAfter.length} of ${conflictsAfter.length}. A flipped match is explained when the guard still names the pair, or a magnitude gap can be recomputed from the statement and the stored passage. A span that outvoted the pair is still not on this file.`);
lines.push("");
const unexplained = conflictsAfter.filter((row) => !explainable(row.card, true));
if (unexplained.length) {
  lines.push("Still not explainable from this stored card:");
  for (const row of unexplained) lines.push(`- ${row.key}. ${clip(row.card.statement)}`);
  lines.push("");
  lines.push("What would need storing, and what a later pass now stores: the span's passage and class, on `classificationRewrites`, rule `span_outvote`. This pass was stored before that field existed, so the replay cannot invent the span.");
}
lines.push("");
lines.push("## Tests");
lines.push("");
lines.push("`tests/b460-figure-pair.test.mjs` is new. It locks the four false pairs, the 12 percent against 9 percent demotion and its record, 320 against 285, a model conflict left untouched, a span outvote that records the passage and the class, and an empty confirmation that records the refusal.");
lines.push("");
lines.push("`tests/b456-source-account.test.mjs` no longer calls `buildSourceAccount`. The writer was removed. The template, agreement, and refusal assertions stay. The quote assertion now calls `quoteIsVerbatim` in `lib/qc/evidence-line.mjs`, which is the live check. `productSentences` of an empty difference is still empty.");
lines.push("");
lines.push("No test assertion was loosened. T5 in `tests/confirming-passage-cannot-confirm.test.mjs` still requires 12 percent against 9 percent to conflict.");
lines.push("");
lines.push("## Census");
lines.push("");
lines.push("The recount is `scripts/diagnostic/b460/CENSUS3.md`. It is every table row in sections 3 to 12 of the B426 census, plus the mode that has no row. Ordered by how often it fires. A site the code describes is restated as what the reviewer sees.");
if (unmatched.length) {
  lines.push("");
  lines.push(`Rows the counter did not recognise, and therefore marked cannot: ${unmatched.length}. Each one says what the census itself said the product knows.`);
}
lines.push("");
lines.push("## Browser");
lines.push("");
lines.push("Skipped. The visible change is a verdict on a future Review. Replaying a Review to see a label would spend a model call, and this spec spends nothing. The cards are not on the local screen.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);

const problems = [];
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised} of ${design.faults.length}`);
if (realMoved.length) problems.push(`real conflicts moved: ${realMoved.map((row) => row.key).join(", ")}`);
if (modalityMoved.length) problems.push(`modality moved: ${modalityMoved.map((row) => row.key).join(", ")}`);
if (nineCleared.length !== 9) problems.push(`nine cleared ${nineCleared.length}: left ${nineLeft.map((row) => row.key).join(", ")}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`conflicts ${conflictsBefore.length} -> ${conflictsAfter.length}`);
console.log(`explainable ${explainBefore.length} -> ${explainAfter.length}`);
console.log(tallyLine("after old", oldAfter));
console.log(tallyLine("after new", newAfter));
console.log(`census sites ${census.rows.length}, unmatched ${unmatched.length}`);
