/**
 * B462. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b462/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bearingSentence, collapseWhitespace } from "../../../lib/qc/evidence-line.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { evidenceFindingForExport } from "../../../lib/qc/export-review-data.mjs";
import { readerEvidenceAccount } from "../../../lib/qc/reader-reason.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../../../lib/qc/summary-bullets.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { readerEvidenceSentence as screenSentence } from "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";
import { summaryBullets } from "../../../../brightline-content-engine-frontend/src/modules/drafting/reviewSummaryDisplay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b456/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };
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
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
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

function passageOf(card) {
  const quote = typeof card.sourceQuote === "string" ? card.sourceQuote.trim() : "";
  if (quote) return card.sourceQuote;
  return typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : "";
}

function quoted(text) {
  const match = String(text || "").match(/"([^"]*)"/);
  return match ? match[1] : "";
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b462 replay: expected 261 cards, found ${cards?.length}`);
}

let screenDiff = 0;
let exportDiff = 0;
let wordingShown = 0;
let lineBreaks = 0;
let doubled = 0;
const withheld = [];
const quotes = [];

for (const card of cards) {
  const account = readerEvidenceAccount(card);
  const screen = screenSentence(card);
  const finding = evidenceFindingForExport({ ...card, reasoningParagraph: card.evidenceSummary || "" }, false);
  const text = account?.text || "";
  if ((screen || "") !== text) screenDiff += 1;
  if (account && (finding || "") !== text) exportDiff += 1;
  if (/[\n\r]/.test(text)) lineBreaks += 1;
  if (/\."\./.test(text)) doubled += 1;
  if (account) {
    for (const row of account.withheld) withheld.push({ key: keyOf(card), phrase: row.phrase, text: row.text });
  }
  const note = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  const hidden = typeof card.wordingNoteWithheld?.text === "string" ? card.wordingNoteWithheld.text.trim() : "";
  const wording = card.readingNote?.bucket === "wording" || Boolean(card.wordingNoteWithheld);
  if (wording && ((note && text === note) || (hidden && text === hidden))) wordingShown += 1;
  if (account?.source === "quote") {
    const passage = passageOf(card);
    const chosen = quoted(text);
    const picked = bearingSentence(passage, card.statement);
    quotes.push({ key: keyOf(card), card, passage, chosen, picked, text });
  }
}

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
const lengths = [];
let disclosure = 0;
let bulletDiff = 0;
let editorialMiss = 0;
const lengthByDraft = [];
for (const [id, group] of groups) {
  const summary = summariseReview(group, OPTIONS);
  const backend = summaryBulletsFromReview(summary);
  const screen = summaryBullets(summary);
  if (backend.join("\n") !== screen.join("\n")) bulletDiff += 1;
  if (backend.some((line) => /not shown/.test(line))) disclosure += 1;
  const editorial = (summary.signalConcerns || 0) > 0;
  if (editorial && !backend.some((line) => /editorial notes|compliance notes/.test(line))) editorialMiss += 1;
  lengths.push(backend.length);
  lengthByDraft.push(`${id}: ${backend.length}`);
}
const sorted = [...lengths].sort((a, b) => a - b);
const expected = [1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5];

const wordingNotes = cards.filter((card) => card.readingNote?.bucket === "wording" || card.wordingNoteWithheld).length;

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const judged = cards.map((card) => ({ card, after: afterOf(card) }));
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
  sourcesByFixture.set(padFixtureId(fixture.data.id), await loadPipelineSources(fixture.data.sources || []));
}
const confirmedAfter = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!judgedRow) throw new Error(`b462 replay: confirmed label has no card ${row.fixtureId}`);
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b462 replay: no sources for ${judgedRow.card.fixtureId}`);
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

const lines = [];
lines.push("# B462. One endorsement rule, no hidden summary lines, and a readable quote.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.");
lines.push("");
lines.push("A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("The sixteen endorsement phrases live in `lib/qc/endorsement-phrases.mjs`. `NOTE_BANNED_PHRASES` is that list, so every existing importer still reads it from the reading contract. The screen reads the same records from `src/utils/endorsementPhrases.js`. A sentence that hits the list is not shown and is not rewritten. The reading note's own guard and the craft note's own guard are the same functions they were.");
lines.push("");
lines.push("The agreement test stays in `lib/qc/source-account.mjs`. The equivalence filter stays in `lib/qc/evidence-line.mjs`. The screen copy of each is compared, pattern for pattern, by a test that names the other file when they diverge.");
lines.push("");
lines.push("The summary cap is gone. `summaryBulletsFromReview` and `summaryBullets` return every check that has a non-zero count, in the same order and the same copy. The line that said how many points were cut is gone with the cap. The summary panel already renders every bullet it is given.");
lines.push("");
lines.push("Where the reason is written from a stored passage, it quotes the one sentence of that passage that carries the most of what the statement turns on. A figure in the statement counts more than a shared word. Line breaks and runs of whitespace become a single space. A sentence that already ends keeps that one full stop. The quoted words are otherwise the source's words, and the sentence is a span of the whitespace-collapsed passage. When no sentence carries a figure the statement turns on, the whole passage is quoted, and that card is named below.");
lines.push("");
lines.push("## The endorsement rule");
lines.push("");
lines.push("Before: the screen's four-term check returned these five sentences. The backend returned an empty reason for every one.");
lines.push("");
lines.push('- "The source states revenue of EUR 318 million, so the figure is verified."');
lines.push('- "The passage is supported by the source for this period."');
lines.push('- "The source states the headcount, aligning with the sentence."');
lines.push('- "The statement treats the pilot as a programme."');
lines.push('- "The sentence is stated without supporting context in the passage."');
lines.push("");
lines.push("After: both sides return an empty reason for all five. None of the 261 stored reasons on this pass hits the list, so the guard withholds 0 sentences here. The fault was latent.");
lines.push("");
lines.push(`Backend and screen reasons that differ: ${screenDiff}.`);
lines.push("");
lines.push("## The summary");
lines.push("");
lines.push("Before: 10 of 20 drafts kept the first three points and added a line of the form \"N more points are not shown\". The line cut was the editorial and compliance line.");
lines.push("");
lines.push(`After: drafts carrying that line: ${disclosure}. Drafts whose editorial or compliance count is missing from the list: ${editorialMiss}. Bullet lists that differ between the two sides: ${bulletDiff}.`);
lines.push("");
lines.push(`Line counts: ${sorted.join(", ")}.`);
lines.push("");
lines.push(lengthByDraft.join(". ") + ".");
lines.push("");
lines.push("## The eight passage cards");
lines.push("");
lines.push(`Reasons that contain a line break: ${lineBreaks}. Reasons that close a quote with a stop inside and a stop outside: ${doubled}.`);
lines.push("");
lines.push("One stored difference, 18:2, already ended its first quote with a full stop and then added another after the quotation mark. The extra stop after the mark is removed. The quoted words are unchanged. It is not one of these eight.");
lines.push("");
const fellBack = quotes.filter((row) => row.picked == null);
lines.push(fellBack.length
  ? `Cards where no single sentence carried the statement, so the whole passage is quoted: ${fellBack.map((row) => row.key).join(", ")}.`
  : "No card fell back to the whole passage. Each of the eight has one sentence that carries what the statement turns on.");
lines.push("");
for (const row of quotes) {
  lines.push(`### ${row.key}`);
  lines.push("");
  lines.push("Statement:");
  lines.push("");
  lines.push(clean(row.card.statement));
  lines.push("");
  lines.push("Stored passage:");
  lines.push("");
  lines.push(clean(row.passage));
  lines.push("");
  lines.push("Sentence chosen:");
  lines.push("");
  lines.push(clean(row.chosen));
  lines.push("");
}
lines.push("## Verdicts");
lines.push("");
lines.push("261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier are the values on the stored card. This replay does not write them.");
lines.push("");
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}.`);
lines.push(`Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${oldAfter.evidenceLeaveAlone} of ${oldAfter.n}, combined quiet ${oldAfter.combinedQuiet} of ${oldAfter.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newAfter.evidenceLeaveAlone} of ${newAfter.n}, combined quiet ${newAfter.combinedQuiet} of ${newAfter.n}, on the new definition.`);
lines.push("");
lines.push("These are the B460 figures, measured the same way. This spec does not move a verdict.");
lines.push("");
lines.push(`Export sentence equals card sentence: ${261 - exportDiff} of 261.`);
lines.push("");
lines.push("## The guard and the notes");
lines.push("");
lines.push(`Reader-facing strings withheld by the endorsement guard: ${withheld.length}.`);
if (!withheld.length) {
  lines.push("");
  lines.push("None. A withheld sentence would be listed here and would not be rewritten.");
} else {
  lines.push("");
  for (const row of withheld) {
    lines.push(`- ${row.key}. ${row.phrase}. ${clean(row.text)}`);
  }
}
lines.push("");
lines.push(`Wording notes on this pass: ${wordingNotes}. Shown as the reason: ${wordingShown}.`);
lines.push("");
lines.push("## Tests");
lines.push("");
lines.push("`tests/b462-endorsement-parity.test.mjs` names `src/utils/endorsementPhrases.js` and `src/modules/drafting/readerReason.js` when the phrase list, the agreement test, or the equivalence filter diverges. It requires the five probes to be empty on both sides, and the same reason on all 261 cards.");
lines.push("");
lines.push("`src/modules/drafting/__tests__/b462-parity.test.js` names `lib/qc/endorsement-phrases.mjs`, `lib/qc/source-account.mjs`, and `lib/qc/evidence-line.mjs` when those copies diverge.");
lines.push("");
lines.push("`tests/b462-summary-lines.test.mjs` requires the line counts 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, no disclosure line, the editorial or compliance line wherever that count is non-zero, and identical lists on both sides.");
lines.push("");
lines.push("`tests/b462-passage-sentence.test.mjs` requires 17:2, 17:4, and 17:6 to quote a sentence that contains the figure, the quoted sentence to be a span of the collapsed passage, and no reason on the pass to contain a line break or a doubled full stop.");
lines.push("");
lines.push("`tests/b461-shown-reason.test.mjs` required a fourth line that said the rest were not shown, and it required a full stop inside the quotation mark and another outside it. Both assertions locked the defects this spec removes. The summary fixture has six non-zero checks, because the unchecked count is its own line, so the test now requires those six lines and no disclosure. The two quote assertions now end on the stop inside the quotation mark.");
lines.push("");
lines.push("`src/modules/drafting/__tests__/b461-screen.test.js` required the same disclosure line. It now requires every non-zero check, including the editorial line, and no disclosure.");
lines.push("");
lines.push("`tests/b457-form-and-line.test.mjs` required `note states \"Urban last-mile logistics is supported.\".` The second stop was the defect. The assertion now ends on the stop inside the quotation mark. The quote that does not already end, `shopify-memo states \"customers have increased from 5,500\".`, still takes the one stop after the quotation mark.");
lines.push("");
lines.push("`tests/b360-two-passages.test.mjs` required the evidence line to contain \"two financing transactions\". That phrase is a different sentence of the passage. The statement turns on the further 2.2% stake. The line now quotes that sentence, and the assertion matches it. The shown passage still contains the GIC slice, and it still does not name AGIC.");
lines.push("");
lines.push("No assertion was given an exemption.");
lines.push("");
lines.push("## Files");
lines.push("");
lines.push("- `lib/qc/endorsement-phrases.mjs`. The sixteen phrases, stated once.");
lines.push("- `src/utils/endorsementPhrases.js`. The same records on the screen.");
lines.push("- `lib/qc/reading-contract.mjs`. `NOTE_BANNED_PHRASES` is that list. The stored evidence line is given the statement, so a future card stores the sentence rather than the whole passage.");
lines.push("- `lib/qc/evidence-line.mjs`. Collapses whitespace, picks the bearing sentence, and writes one full stop.");
lines.push("- `lib/qc/reader-reason.mjs`. Passes the statement into the evidence line. Removes a stop that sits after a quote which already ended.");
lines.push("- `lib/qc/source-account.mjs`. Exports the agreement patterns so the drift test can name them.");
lines.push("- `lib/qc/summary-bullets.mjs`. Returns every non-zero check.");
lines.push("- `lib/qc/assemble-card.mjs`. Passes the statement into the evidence line. The verbatim check stays on the full passage.");
lines.push("- `src/modules/drafting/readerReason.js`. The same phrase check, the same sentence, and the same one stop.");
lines.push("- `src/modules/drafting/reviewSummaryDisplay.js`. Returns every non-zero check.");
lines.push("- `tests/b462-endorsement-parity.test.mjs`. The drift lock, the five probes, and the 261 reasons.");
lines.push("- `tests/b462-summary-lines.test.mjs`. The line counts.");
lines.push("- `tests/b462-passage-sentence.test.mjs`. The three figures, the span, and the stops.");
lines.push("- `src/modules/drafting/__tests__/b462-parity.test.js`. The same lock, read from the screen.");
lines.push("- `scripts/diagnostic/b462/replay.mjs`. This measurement.");
lines.push("- `scripts/diagnostic/b462/RESULT.md`. This report.");
lines.push("");
lines.push("## Browser");
lines.push("");
lines.push("Not run against a Review. A Review would ask a model, and this spec spends nothing. The summary panel already renders every bullet it is given, so removing the cap does not change a container. The quote and the empty reason are the functions above, measured on the stored pass.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);

const problems = [];
if (screenDiff !== 0) problems.push(`screen diffs ${screenDiff}`);
if (exportDiff !== 0) problems.push(`export diffs ${exportDiff}`);
if (disclosure !== 0) problems.push(`disclosure ${disclosure}`);
if (editorialMiss !== 0) problems.push(`editorial missing ${editorialMiss}`);
if (bulletDiff !== 0) problems.push(`bullet diffs ${bulletDiff}`);
if (sorted.join(",") !== expected.join(",")) problems.push(`lengths ${sorted.join(",")}`);
if (lineBreaks !== 0) problems.push(`line breaks ${lineBreaks}`);
if (doubled !== 0) problems.push(`doubled ${doubled}`);
if (quotes.length !== 8) problems.push(`quotes ${quotes.length}`);
if (fellBack.length) problems.push(`fallback ${fellBack.map((row) => row.key).join(",")}`);
if (wordingShown !== 0 || wordingNotes !== 115) problems.push(`wording ${wordingShown} of ${wordingNotes}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (oldAfter.n !== 74 || newAfter.n !== 74) problems.push(`confirmed ${oldAfter.n} ${newAfter.n}`);
if (oldAfter.evidenceLeaveAlone !== 51 || newAfter.evidenceLeaveAlone !== 51) problems.push(`leave-alone ${oldAfter.evidenceLeaveAlone} ${newAfter.evidenceLeaveAlone}`);
if (oldAfter.combinedQuiet !== 32 || newAfter.combinedQuiet !== 32) problems.push(`quiet ${oldAfter.combinedQuiet} ${newAfter.combinedQuiet}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`quotes ${quotes.length} lengths ${sorted.join(",")} withheld ${withheld.length}`);
console.log(`leave-alone ${oldAfter.evidenceLeaveAlone}/${newAfter.evidenceLeaveAlone} quiet ${oldAfter.combinedQuiet}/${newAfter.combinedQuiet}`);
console.log(`catch ${faultyRaised} group ${groupRaised} wording ${wordingNotes}`);
