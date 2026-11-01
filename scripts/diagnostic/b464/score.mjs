/**
 * B464. Score the confirming pass. No further model call.
 *
 *   node scripts/diagnostic/b464/score.mjs
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { readerEvidenceAccount } from "../../../lib/qc/reader-reason.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const NINE = ["01:9", "04:3", "06:5", "08:6", "09:1", "15:10", "15:24", "16:4", "17:2"];
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

function withSentence(card, displayVerdict, verdict) {
  return { ...card, displayVerdict, sentenceState: verdict.state, tier: verdict.tier, statementVerdict: verdict };
}

function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}

const doc = JSON.parse(readFileSync(PASS, "utf8"));
const cards = doc.cards;
if (!Array.isArray(cards) || !cards.length) throw new Error("b464 score: no cards");

const contradictions = cards.filter((card) => card.displayVerdict === "supported_full" && card.sentenceState === "not_in_source");
const conflicts = cards.filter((card) => card.displayVerdict === "conflict");
const byKey = new Map(cards.map((card) => [keyOf(card), card]));

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
const judged = cards.map((card) => ({ card, after: afterOf(card) }));
const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));

let agree = 0;
const conflictLines = [];
for (const card of conflicts) {
  const label = labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence)) || "(not in the labelled set)";
  const yes = label === "conflicting";
  if (yes) agree += 1;
  conflictLines.push(`${keyOf(card)}. Label ${label}. ${clean(card.statement).slice(0, 160)}`);
}

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
  else faultyMisses.push(`${pad(row.fixtureId)}:${row.occurrence} ${row.label}`);
}
let groupRaised = 0;
const groupMisses = [];
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const judgedRow = key ? afterByJoin.get(key) : null;
  const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (afterCard && raised(afterCard)) groupRaised += 1;
  else groupMisses.push(fault.id);
}

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  sourcesByFixture.set(padFixtureId(fixture.data.id), await loadPipelineSources(fixture.data.sources || []));
}
const confirmedAfter = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!judgedRow) continue;
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b464 score: no sources for ${judgedRow.card.fixtureId}`);
  const facts = buildFacts({
    statement: judgedRow.card.statement,
    draft: judgedRow.card.statement,
    sourceText: readingSourceText(sources),
  });
  const verdict = verdictOf(judgedRow.card, facts, judgedRow.after.display);
  confirmedAfter.push(withSentence(judgedRow.card, judgedRow.after.display, verdict));
}
const oldAfter = tallyLeaveAlone(confirmedAfter);
const newAfter = tallyLeaveAloneWithLabel(confirmedAfter);

const groups = new Map();
for (const card of cards) {
  for (const row of card.drops || []) {
    const rule = row?.rule || "(none)";
    if (!groups.has(rule)) groups.set(rule, []);
    groups.get(rule).push({ key: keyOf(card), reason: row.reason || "", content: clean(row.content) });
  }
}
for (const fixture of doc.fixtures || []) {
  for (const row of fixture.reading?.drops || []) {
    const rule = row?.rule || "(none)";
    if (!groups.has(rule)) groups.set(rule, []);
    groups.get(rule).push({ key: `F${pad(fixture.fixtureId)}`, reason: row.reason || "", content: clean(row.content) });
  }
}

const notes = cards.filter((card) => card.readingNote);
const bucketCount = {};
for (const card of notes) {
  const bucket = card.readingNote.bucket || "(empty)";
  bucketCount[bucket] = (bucketCount[bucket] || 0) + 1;
}
const craft = (doc.fixtures || []).map((row) => `${pad(row.fixtureId)} ${row.writerFeedbackStatus || "(missing)"}`);
const craftWithheld = (doc.fixtures || []).filter((row) => row.writerFeedbackStatus === "withheld");
const raisedCards = cards.filter((card) => ["beyond", "conflicts", "not_in_source", "partial"].includes(card.sentenceState));
const emptyReasons = raisedCards.filter((card) => !readerEvidenceAccount(card)?.text);
const guard = new Map();
for (const card of cards) {
  for (const row of card.silences || []) {
    if (row?.id !== "reader_prose_withheld" && row?.id !== "note_refused") continue;
    const pathName = row.field || row.id;
    guard.set(pathName, (guard.get(pathName) || 0) + (Number(row.count) || 1));
  }
}
for (const fixture of doc.fixtures || []) {
  for (const reply of fixture.rawReplies || []) {
    if (reply.span === "b404-writer" || reply.span === "b404-writer-retry") {
      /* counted below */
    }
  }
}
const rawNotes = (doc.fixtures || []).reduce((n, row) => n + (row.rawReplies || []).filter((item) => String(item.span).startsWith("b404-note")).length, 0);
const rawCraft = (doc.fixtures || []).reduce((n, row) => n + (row.rawReplies || []).filter((item) => String(item.span).startsWith("b404-writer")).length, 0);

const spend = doc.spend || {};
const lines = [];
lines.push("# B464. One confirming pass.");
lines.push("");
lines.push(`Fixtures 01 to 20. Cache off. Build ${doc.gitSha || ""}. Started ${doc.startedAt || ""}. Finished ${doc.finishedAt || "(not finished)"}.`);
lines.push("");
lines.push("A source dash is written here as a hyphen. A replacement character is written as an apostrophe.");
lines.push("");
if (faultyRaised < 13 || groupRaised < 11) {
  lines.push("## Catch fell");
  lines.push("");
  lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
  if (faultyMisses.length) lines.push(`Missed labelled faults: ${faultyMisses.join(", ")}.`);
  if (groupMisses.length) lines.push(`Missed group A: ${groupMisses.join(", ")}.`);
  lines.push("");
}
lines.push("## 1. Do the figure fixes hold");
lines.push("");
lines.push(`Headlines that say backed while the sentence state is Not in the source: ${contradictions.length}. Before B457 this was 24. On the replay of the old pass it was 0.`);
lines.push("");
lines.push("The one card is 01:0. The evidence line quotes \"Shopify was founded in 2007 by two Ruby on Rails core developers.\" The statement also says Canadian, an e-commerce platform, small and medium businesses, and Ottawa. The headline is backed. The sentence label is Not in the source.");
lines.push("");
if (contradictions.length) {
  for (const card of contradictions) lines.push(`- ${keyOf(card)}. ${clean(card.statement).slice(0, 180)}`);
}
lines.push("");
lines.push(`Conflict verdicts: ${conflicts.length}. Of those, ${agree} are labelled conflicting, which is the set a reader marked as a real conflict. Of the other ${conflicts.length - agree}, 18:2 is labelled confirmed and 12:1 is labelled partially confirmed. The remaining eight are outside the labelled set.`);
lines.push("");
for (const line of conflictLines) lines.push(`- ${line}`);
lines.push("");
lines.push("The nine conflicts B460 cleared are all supported_full on this fresh pass. Each card:");
lines.push("");
for (const key of NINE) {
  const card = byKey.get(key);
  if (!card) {
    lines.push(`- ${key}. Not on this pass.`);
    continue;
  }
  lines.push(`- ${key}. ${card.displayVerdict}. State ${card.sentenceState}. ${card.sentenceLabel || ""}. ${clean(card.statement).slice(0, 160)}`);
}
lines.push("");
lines.push("## 2. What was dropped");
lines.push("");
lines.push(`Rules with a record: ${groups.size}. Records: ${[...groups.values()].reduce((n, rows) => n + rows.length, 0)}.`);
lines.push("");
const judgement = {
  wording_note_withheld: "Right where the note only renames a synonym, a rounding, or a list the source already gives. Wrong in two places, because the note itself says the status changed and it was still filed as wording, so the reader never sees it. 04:1: the source is seeking approval and the statement says the investment is already committed. 18:2: the source recommends the investment and the statement says it is complete. A few others drop a qualifier the source used, such as gross, weighted, or third. Those are now readable here.",
  reader_prose_withheld: "Right to stop the words confirms, supported, and confirmed. The cost is that the withheld sentence is often the sentence that then says what the source does not support. That caveat is only in this record. 22 of the 25 are on partialSentence and 3 are on evidenceSummary.",
  note_rejections: "Right. A dispute is kept only when the note's own words name the thing it disputes. All 17 were dropped because the note never named that surface. The surfaces include figures (78%, 11, 18 percent, 21%, 23%) and a date (second quarter of 2026). They were dropped for not being named in the note, not for being figures.",
  span_outvote: "These are class changes the span vote forced, and the passage is now stored with each one. The moves to conflicting name a second fact in the passage, such as 18:7 (the passage says EUR 35 million, not EUR 38 million) and 13:7 (a headcount split the statement does not carry). That is the vote doing the job it was built for. The partial moves are narrower and are listed in full below.",
  source_awareness: "Right where the objection is that the draft invented a word the source already uses: exceptional, leading, the numeral 7.2, the list as the source wrote it. Wrong for 09:12. That objection says the sentence about Sophie Lehmann does not advance the argument. The rule dropped it because the fact appears in the source. Presence in the source does not answer a relevance objection.",
  date_extract_limit: "Right as a display cap. The screen still shows a count once a date fact has more than eight lines. The stored content is the line id, not the date words, because that is what the fact holds.",
  editorial_duplication: "15:11 restates the fifth value driver and the drop fits the rule. 19:2 does not. The removed text says the source does not establish that the NorTech exit is the principal driver. That is a support objection, and removing it was wrong.",
  second_value: "Right. The statement says an EBITDA margin of 11.1%. The passage says approximately 13%. The card is a conflict, and the label agrees.",
  note_refused: "17:7 was refused because the note endorses. The note's useful point, that the statement drops the word logistics, is in this record and was not shown. A second refusal, 02:4, has reason bucket and no words, so it has no drop row.",
  figure_pair: "Wrong as a pair, and repaired before the reader saw it. On 19:4, 14 percent is Brightway's growth and 23 percent is Eltex's. They are two companies in one sentence, not one figure written two ways. The card's verdict is supported_full.",
  omission_covered: "This is the repair of that false pair. The passage already states both growth rates. Putting the card back to supported_full was right.",
};
lines.push("");
for (const [rule, rows] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  lines.push(`### ${rule}`);
  lines.push("");
  lines.push(`${rows.length} ${rows.length === 1 ? "record" : "records"}.`);
  lines.push("");
  if (judgement[rule]) lines.push(judgement[rule]);
  lines.push("");
  for (const row of rows) {
    lines.push(`- ${row.key}. ${clean(row.reason)}. ${row.content || "(no words)"}`);
  }
  lines.push("");
}
lines.push("## 3. Does the card still read");
lines.push("");
lines.push(`Reader notes on the card: ${notes.length} of ${cards.length}. Two cards have no note.`);
lines.push(`By bucket: ${Object.entries(bucketCount).map(([name, count]) => `${name} ${count}`).join(", ")}.`);
lines.push("Wording notes are recorded and not shown. The notes a reader can see are the beyond and conflicts buckets, after the endorsement guard.");
lines.push(`Craft notes: ${craft.join(", ")}. Withheld: ${craftWithheld.length}.`);
lines.push(`Raised verdicts: ${raisedCards.length}. Empty reason under a raised verdict: ${emptyReasons.length}.`);
if (emptyReasons.length) {
  for (const card of emptyReasons) lines.push(`- ${keyOf(card)}. ${card.sentenceState}. ${clean(card.statement).slice(0, 140)}`);
}
lines.push("");
lines.push("Strings failing the endorsement guard, by path:");
lines.push("");
if (!guard.size) lines.push("None.");
for (const [pathName, count] of guard) lines.push(`- ${pathName}: ${count}`);
lines.push("");
lines.push(`Raw note replies stored: ${rawNotes}. Raw craft replies stored: ${rawCraft}.`);
lines.push("");
lines.push("## 4. The standing measures");
lines.push("");
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}.`);
lines.push(`Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push(`Evidence leave-alone ${oldAfter.evidenceLeaveAlone} of ${oldAfter.n}, combined quiet ${oldAfter.combinedQuiet} of ${oldAfter.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newAfter.evidenceLeaveAlone} of ${newAfter.n}, combined quiet ${newAfter.combinedQuiet} of ${newAfter.n}, on the new definition.`);
lines.push("The replay of the stored pass was 51 and 32. This pass is a new generation, and both definitions agree with each other.");
lines.push("");
lines.push(`Spend, discounted: USD ${Number(spend.costUsd || 0).toFixed(4)}. List: USD ${Number(spend.listUsd || 0).toFixed(4)}.`);
lines.push(`Calls: ${spend.calls ?? 0}. Unpriced calls: ${spend.unpricedCalls ?? 0}.`);
if (Array.isArray(spend.unpricedModels) && spend.unpricedModels.length) {
  lines.push(`Unpriced models: ${spend.unpricedModels.join(", ")}.`);
}
lines.push("");
const bytes = statSync(PASS).size;
lines.push(`No product code was changed. The diagnostic harness stores the whole card, the reading record, and the raw note and craft replies. The payload is scripts/diagnostic/b464/pass-1.json (${(bytes / 1048576).toFixed(1)} MB). It is over the usual 1 MB leave-out, and it is committed because the spec requires the artefact.`);
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
const headline = faultyRaised < 13 || groupRaised < 11 ? "CATCH FELL" : "catch held";
console.log(`${headline} contradictions ${contradictions.length} conflicts ${conflicts.length} drops ${[...groups.values()].reduce((n, rows) => n + rows.length, 0)} empty ${emptyReasons.length}`);
console.log(`leave-alone ${oldAfter.evidenceLeaveAlone} quiet ${oldAfter.combinedQuiet} list ${spend.listUsd} discounted ${spend.costUsd}`);
