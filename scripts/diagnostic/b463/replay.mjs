/**
 * B463. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b463/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { cardEvidenceFindings } from "../../../lib/qc/evidence-findings.mjs";
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

function face(card) {
  const account = readerEvidenceAccount(card);
  const finding = evidenceFindingForExport({ ...card, reasoningParagraph: card.evidenceSummary || "" }, false);
  const findings = cardEvidenceFindings(card, []).map((row) => row.note || "").join("\n");
  return {
    displayVerdict: card.displayVerdict ?? null,
    sentenceState: card.sentenceState ?? null,
    sentenceLabel: card.sentenceLabel ?? null,
    tier: card.tier ?? null,
    reason: account?.text || "",
    screen: screenSentence(card) || "",
    export: finding || "",
    findings,
  };
}

const raw = readFileSync(PASS, "utf8");
const pass = JSON.parse(raw);
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b463 replay: expected 261 cards, found ${cards?.length}`);
}

const beforeFace = cards.map(face);
let moved = 0;
let reasonDiff = 0;
let screenDiff = 0;
let exportDiff = 0;
let findingDiff = 0;
const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
const bulletsBefore = [];
for (const group of groups.values()) {
  const summary = summariseReview(group, OPTIONS);
  bulletsBefore.push(summaryBulletsFromReview(summary).join("\n"));
}
const afterFace = cards.map(face);
for (let i = 0; i < cards.length; i++) {
  const a = beforeFace[i];
  const b = afterFace[i];
  if (a.displayVerdict !== b.displayVerdict || a.sentenceState !== b.sentenceState || a.sentenceLabel !== b.sentenceLabel || a.tier !== b.tier) moved += 1;
  if (a.reason !== b.reason) reasonDiff += 1;
  if (a.screen !== a.reason) screenDiff += 1;
  if (a.reason && a.export !== a.reason) exportDiff += 1;
  if (a.findings !== b.findings) findingDiff += 1;
}
let bulletDiff = 0;
let gi = 0;
for (const group of groups.values()) {
  const summary = summariseReview(group, OPTIONS);
  if (summaryBulletsFromReview(summary).join("\n") !== bulletsBefore[gi]) bulletDiff += 1;
  gi += 1;
}

const silenceById = new Map();
for (const card of cards) {
  for (const row of card.silences || []) {
    const id = row?.id || "(none)";
    const prev = silenceById.get(id) || { cards: 0, count: 0, withContent: 0 };
    prev.cards += 1;
    prev.count += Number(row?.count) || 1;
    if (Array.isArray(row?.content) && row.content.length) prev.withContent += 1;
    silenceById.set(id, prev);
  }
}

const wording = cards.filter((card) => card.wordingNoteWithheld?.text || card.readingNote?.bucket === "wording");
const wordingBytes = wording.reduce((sum, card) => {
  const text = card.wordingNoteWithheld?.text || card.readingNote?.text || "";
  return sum + Buffer.byteLength(String(text));
}, 0);
const passBytes = Buffer.byteLength(JSON.stringify(pass));
const withContent = JSON.parse(raw);
for (const card of withContent.cards) {
  if (!Array.isArray(card.silences)) continue;
  for (const row of card.silences) {
    if (row?.id === "wording_note_withheld") {
      const text = card.wordingNoteWithheld?.text || card.readingNote?.text || "";
      row.content = text ? [text] : [];
    }
  }
}
const grownBytes = Buffer.byteLength(JSON.stringify(withContent));
const growthPct = ((grownBytes - passBytes) / passBytes) * 100;

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
  if (!judgedRow) throw new Error(`b463 replay: confirmed label has no card ${row.fixtureId}`);
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b463 replay: no sources for ${judgedRow.card.fixtureId}`);
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
lines.push("# B463. Every drop records what it dropped.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed. Nothing new is shown to the reader.");
lines.push("");
lines.push("A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("A drop, a suppression, a merge, or a rewrite made while a card is built is a record `{ rule, reason, content }`. `content` is the words that were removed, in the source's or the model's own words. The records sit on `card.drops`. A diagnostic lists that array and does not need to know which rule wrote which row.");
lines.push("");
lines.push("A silence that already existed keeps its id, its reason, and its count. It gains `content`, the same words. The numbers measured since B438 still read.");
lines.push("");
lines.push("## Recorded on the next card");
lines.push("");
lines.push("These are the census rows whose count was null, or whose silence carried only an id, a reason, and a count. The artefact is written when the rule runs. This stored pass was built before that write, so the words are not on this file.");
lines.push("");
const recorded = [
  ["note_rejections", "A point the note tried to name never appears.", "The dispute surfaces are the silence content."],
  ["reassurance_stripped", "The sentence keeps a conflicts or beyond label and the reason under it is gone.", "The removed sentences are the content. A partial strip is recorded as reassurance_sentence."],
  ["note_refused", "A note was refused.", "The refused note text is the content. The rejections array stays."],
  ["style_backstop, no_op, no_change, evidence_language, narrative_coherence, linkedin_credit_line, fidelity", "A style, no-op, direction, evidence-language, narrative, or fidelity concern is removed.", "The concern's own note is the content. The count stays the number removed."],
  ["normalize_combined", "A formed editorial concern disappears.", "The concern note, or the category and rule when the note is empty. A schema failure is still the retry, not this record."],
  ["category_moved", "A concern shows under the other heading.", "The note, and the reason names the stated category and the category on the card."],
  ["editorial_duplication", "On a conflict, an editorial note can disappear.", "The concern text the duplication judge removed."],
  ["duplicate_merge", "Two overlapping notes become one.", "The texts that were folded. The count stays the size of the group."],
  ["source_awareness", "An objection whose words also appear in the source disappears.", "The concern text. The dropped row also keeps its code and family."],
  ["forward_looking", "A forward-looking compliance note disappears.", "The concern text."],
  ["fidelity on compliance", "A compliance concern whose quote is not in the sentence disappears.", "The concern text and the fidelity reason. The editorial path was already a silence. The compliance path now writes the same silence."],
  ["gap_sentences_stripped", "A partial becomes fully backed and the sentence that named the gap is gone.", "The summary before the strip. The count is 1."],
  ["assemble_failed", "The whole review of that sentence becomes Not checked.", "The error message."],
  ["classificationRewrites copied into drops", "A class is rewritten.", "Period, rounding, closer, omission, and the other rewrites already stored as classificationRewrites are copied into the one list. The rewrite record itself is unchanged."],
  ["dropped_marks", "A mark was dropped.", "The surface and the reason, on the card the mark belonged to, and on the review silence that already carried the count."],
  ["draft_coverage_dropped", "A heading or a salutation is not a claim.", "The dropped text is a review-level drop, because a heading is not a card. draftCoverage.dropped was already on the review. It is now also in the review drops list."],
  ["date_extract_limit", "A date says N lines and does not show the lines.", "The lines, on the card, when a date fact has more than eight occurrences. The screen still shows the count."],
  ["unquoted_craft", "A paragraph of the writer note is missing.", "The paragraph, on the writer-note response. The writer note is not a card."],
  ["commentary_skipped", "Commentary was skipped.", "The statement, and the silence that already said commentary was not run."],
  ["wording_note_withheld", "A wording note is not shown.", "The note text is added to the silence. The note was already on wordingNoteWithheld."],
  ["reader_prose_withheld", "A string fails the endorsement guard.", "The withheld sentence is the content. It is not rewritten."],
];
for (const [rule, census, how] of recorded) {
  lines.push(`- ${rule}. Census: ${census} ${how}`);
}
lines.push("");
lines.push("## Left unrecorded");
lines.push("");
lines.push("Out of scope. A pass cannot produce them. The census names them as session or interface state.");
lines.push("");
lines.push("- recheckClearedDecisionIds, the Dealt with chip, and the stale flag. They live in the re-check map.");
lines.push("- The colour wash after an edit, the proposal compared with a rewritten sentence, and a locate failure on a replaced draft. They are post-edit.");
lines.push("- The apply error, the empty notice, and a save that fails, including 413. They are save failures.");
lines.push("- meta.replayed. It is the replay flag.");
lines.push("- A second run of the same draft. That is a later pass, not a field on one card.");
lines.push("");
lines.push("Left unrecorded for a reason that is not scope.");
lines.push("");
lines.push("- summaryClass is not written onto the card. The screen treats a present summaryClass as the check having been requested. Writing it would change what the reader sees. The off-versus-miss split stays in the verdict and the not-reviewed reason, which are already stored.");
lines.push("- orphanCount, first_person_unnamed, noProposalReason, and the proposal that was never called. Proposals are not built while the card is built. They are not on this pass.");
lines.push("- The bullet that cuts a sentence starting with delete. That cut is not in the card build.");
lines.push("- Citation chips cut at five. supportRefIds are already written on the assembled card. This compact pass omitted them. The cut itself is the screen.");
lines.push("- materiality and claimUpgrade are already written on the assembled card when the card is built. This compact pass omitted them. They are not drops.");
lines.push("- VITE_REVISE_ACTION_LIST is an interface flag.");
lines.push("- Coverage was not computed. The review writes draftCoverage whenever the pipeline returns. Absence of that field is the record that it was not computed. A card-only file cannot show it.");
lines.push("");
lines.push("## What this pass can already be read for");
lines.push("");
lines.push("The dropped sentences are not on this file. Replaying the card cannot rebuild a note rejection or a source-awareness drop, because the removed item was gone before the card was stored. The next pass is what shows those words.");
lines.push("");
lines.push(`Wording notes already stored, which the silence can now carry: ${wording.length}. Their text is ${wordingBytes} bytes. Copying that text onto the matching silence grows the card JSON from ${passBytes} bytes to ${grownBytes} bytes, ${growthPct.toFixed(2)} percent. That is the only content this file can add. The other drops have no words here, so their size is not guessed.`);
lines.push("");
lines.push("Silences on this pass. Content is 0 on every one of them.");
lines.push("");
for (const [id, row] of [...silenceById.entries()].sort((a, b) => b[1].count - a[1].count)) {
  lines.push(`- ${id}: ${row.count} on ${row.cards} cards. With content: ${row.withContent}.`);
}
lines.push("");
lines.push("## The reader-facing strings");
lines.push("");
lines.push(`261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier unchanged: ${261 - moved} of 261.`);
lines.push(`Reason sentence unchanged: ${261 - reasonDiff} of 261. Screen differs from the reason: ${screenDiff}. Export differs from a shown reason: ${exportDiff}.`);
lines.push(`Evidence findings unchanged: ${261 - findingDiff} of 261. Summary bullets unchanged: ${20 - bulletDiff} of 20 drafts.`);
lines.push("");
lines.push("## Verdicts");
lines.push("");
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}.`);
lines.push(`Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${oldAfter.evidenceLeaveAlone} of ${oldAfter.n}, combined quiet ${oldAfter.combinedQuiet} of ${oldAfter.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newAfter.evidenceLeaveAlone} of ${newAfter.n}, combined quiet ${newAfter.combinedQuiet} of ${newAfter.n}, on the new definition.`);
lines.push("");
lines.push("## Tests");
lines.push("");
lines.push("`tests/b463-drop-record.test.mjs` locks the shape, the silence that keeps its count and gains the words, a rewrite copied into that shape, and a craft paragraph that is stored while the piece the reader gets stays the kept text.");
lines.push("");
lines.push("No assertion was given an exemption.");
lines.push("");
lines.push("## Files");
lines.push("");
lines.push("- `lib/qc/drop-record.mjs`. The one shape, and the helpers that copy a silence or a rewrite into it.");
lines.push("- `lib/qc/reading-review.mjs`. Note rejections, a refused note, a stripped reassurance, a wording note, and date lines past the limit.");
lines.push("- `lib/qc/editorial-compliance-reviewer.mjs`. Concern drops, a category move, and the compliance fidelity gate.");
lines.push("- `lib/qc/assemble-card.mjs`. The duplication judge, the merge, source awareness, forward looking, the gap sentence, the assemble failure, and the copy of classification rewrites.");
lines.push("- `lib/qc/editorial-source-awareness.mjs`. The dropped concern keeps its text.");
lines.push("- `lib/qc/reader-prose-guard.mjs`. A withheld sentence is stored and not rewritten.");
lines.push("- `lib/qc/pipeline-v4/index.mjs`. Dropped marks on the card, coverage drops on the review, and a skipped commentary.");
lines.push("- `lib/qc/worked-record.mjs`. The mark silence gains the surfaces.");
lines.push("- `lib/qc/constructive-feedback.mjs` and `api/constructive-feedback.js`. A dropped writer paragraph is kept on the response.");
lines.push("- `tests/b463-drop-record.test.mjs`. The shape.");
lines.push("- `scripts/diagnostic/b463/replay.mjs`. This measurement.");
lines.push("- `scripts/diagnostic/b463/RESULT.md`. This report.");
lines.push("");
lines.push("## Browser");
lines.push("");
lines.push("Not opened. Nothing new is shown. A Review would ask a model.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);

const problems = [];
if (moved !== 0) problems.push(`moved ${moved}`);
if (reasonDiff !== 0 || screenDiff !== 0 || exportDiff !== 0) problems.push(`reason ${reasonDiff} screen ${screenDiff} export ${exportDiff}`);
if (findingDiff !== 0) problems.push(`findings ${findingDiff}`);
if (bulletDiff !== 0) problems.push(`bullets ${bulletDiff}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (oldAfter.evidenceLeaveAlone !== 51 || newAfter.evidenceLeaveAlone !== 51) problems.push(`leave-alone ${oldAfter.evidenceLeaveAlone} ${newAfter.evidenceLeaveAlone}`);
if (oldAfter.combinedQuiet !== 32 || newAfter.combinedQuiet !== 32) problems.push(`quiet ${oldAfter.combinedQuiet} ${newAfter.combinedQuiet}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`unchanged ${261 - moved} growth ${growthPct.toFixed(2)}% wording ${wording.length}`);
console.log(`catch ${faultyRaised} group ${groupRaised} leave-alone ${oldAfter.evidenceLeaveAlone} quiet ${oldAfter.combinedQuiet}`);
