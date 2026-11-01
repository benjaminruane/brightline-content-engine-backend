/**
 * B461. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b461/replay.mjs
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
import { classifyCard, summariseReview } from "../../../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../../../lib/qc/summary-bullets.mjs";
import { evidenceQuietOf, layerSpoken, quietOf, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";
import { readerEvidenceSentence as screenSentence } from "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";
import { relationPrefix } from "../../../../brightline-content-engine-frontend/src/utils/sourceRelationPrefix.js";
import { summaryBullets } from "../../../../brightline-content-engine-frontend/src/modules/drafting/reviewSummaryDisplay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b456/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };
const FAULTY = new Set(["conflicting", "no_support"]);
const NAMED = new Set(["confirmed", "partially_confirmed", "partial", "conflicting", "conflict", "no_support", "not_supported", "not_reviewed"]);

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

function bulletSlots(summary) {
  const ev = summary?.evidence || {};
  const slots = [];
  if (ev.notSupported > 0) slots.push("unsupported");
  if (ev.conflicting > 0) slots.push("conflicting");
  if ((summary?.notChecked || 0) > 0) slots.push("not checked");
  if (ev.beyond > 0) slots.push("beyond");
  if (ev.partial > 0) slots.push("partial");
  if (ev.needsLook > 0) slots.push("needs a look");
  if ((summary?.signalConcerns || 0) > 0) slots.push("editorial or compliance");
  if (ev.unbadged > 0) slots.push("unbadged");
  return slots;
}

function saysCut(bullets) {
  return bullets.some((line) => /not shown/.test(line));
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b461 replay: expected 261 cards, found ${cards?.length}`);
}

const identity = cards.map((card) => ({
  key: keyOf(card),
  displayVerdict: card.displayVerdict ?? null,
  sentenceState: card.sentenceState ?? null,
  sentenceLabel: card.sentenceLabel ?? null,
  tier: card.tier ?? null,
}));

const empty = [];
const split = { stored: 0, clause: 0, quote: 0, other: 0 };
const withheld = [];
let screenDiff = 0;
let exportDiff = 0;
let proseDiff = 0;
let wordingShown = 0;
let emptyReason = 0;
const byKey = new Map();

for (const card of cards) {
  const key = keyOf(card);
  byKey.set(key, card);
  const before = identity.find((row) => row.key === key);
  const account = readerEvidenceAccount(card);
  const screen = screenSentence(card);
  const finding = evidenceFindingForExport({ ...card, reasoningParagraph: card.evidenceSummary || "" }, false);
  if (account && screen !== account.text) screenDiff += 1;
  if (account && (finding || "") !== (account.text || "")) exportDiff += 1;
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && finding && finding !== prose && finding !== "Not checked.") proseDiff += 1;
  if (account) {
    for (const row of account.withheld) withheld.push({ key, phrase: row.phrase, text: row.text });
  }
  const note = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  const hidden = typeof card.wordingNoteWithheld?.text === "string" ? card.wordingNoteWithheld.text.trim() : "";
  const shown = account?.text || "";
  const wording = card.readingNote?.bucket === "wording" || Boolean(card.wordingNoteWithheld);
  if (wording && ((note && shown === note) || (hidden && shown === hidden))) wordingShown += 1;
  const raisedState = card.sentenceState === "beyond" || card.sentenceState === "conflicts" || card.sentenceState === "not_in_source";
  if (raisedState && !prose) {
    empty.push({ key, card, account });
    split[account?.source] = (split[account?.source] || 0) + 1;
    if (!shown) emptyReason += 1;
  }
  if (
    before.displayVerdict !== (card.displayVerdict ?? null)
    || before.sentenceState !== (card.sentenceState ?? null)
    || before.sentenceLabel !== (card.sentenceLabel ?? null)
    || before.tier !== (card.tier ?? null)
  ) {
    throw new Error(`b461 replay: ${key} moved`);
  }
}

const partials = cards.filter((card) => card.displayVerdict === "supported_partial" || card.supportState === "partial");
const noFinding = partials.filter((card) => cardEvidenceFindings(card, []).length === 0);
let beyondHidden = 0;
for (const card of cards) {
  if (card.sentenceState !== "beyond") continue;
  const cls = classifyCard(card, OPTIONS);
  if (!cls.needsAttention) beyondHidden += 1;
}

let unnamed = 0;
const classNames = new Map();
for (const card of cards) {
  for (const row of card.matchExplanations || []) {
    const cls = String(row.classification || "");
    if (!cls || NAMED.has(cls)) {
      if (cls && !["confirmed", "partially_confirmed", "conflicting"].includes(cls)) {
        classNames.set(cls, relationPrefix(cls));
        if (relationPrefix(cls) === "Relates to the statement:") unnamed += 1;
      }
      continue;
    }
    classNames.set(cls, relationPrefix(cls));
    if (relationPrefix(cls) === "Relates to the statement:") unnamed += 1;
  }
}

const groups = new Map();
for (const card of cards) {
  const id = pad(card.fixtureId);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(card);
}
let silentCap = 0;
let crowdedSilent = 0;
let lengthened = 0;
const lengthNotes = [];
for (const [id, group] of groups) {
  const summary = summariseReview(group, OPTIONS);
  const slots = bulletSlots(summary);
  const bullets = summaryBulletsFromReview(summary);
  const screen = summaryBullets(summary);
  if (bullets.join("\n") !== screen.join("\n")) {
    throw new Error(`b461 replay: summary bullets differ on ${id}`);
  }
  if (slots.length > 3 && !saysCut(bullets)) silentCap += 1;
  const editorialCut = slots.includes("editorial or compliance") && slots.length > 3 && slots.slice(0, 3).every((name) => name !== "editorial or compliance");
  if (editorialCut && !bullets.some((line) => /editorial or compliance/.test(line))) crowdedSilent += 1;
  if (slots.length > 3) {
    lengthened += 1;
    lengthNotes.push(`${id}: ${slots.length} points, shown as 3 plus "${bullets[bullets.length - 1]}"`);
  }
}

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
  const card = key ? afterByJoin.get(key)?.card : null;
  const judgedRow = key ? afterByJoin.get(key) : null;
  const afterCard = judgedRow ? { ...card, displayVerdict: judgedRow.after.display } : null;
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
  if (!judgedRow) throw new Error(`b461 replay: confirmed label has no card ${row.fixtureId}`);
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b461 replay: no sources for ${judgedRow.card.fixtureId}`);
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

function quoteCard(card) {
  const account = readerEvidenceAccount(card);
  const findings = cardEvidenceFindings(card, []);
  const lines = [
    `${keyOf(card)}. ${card.sentenceLabel || "(no label)"}. State ${card.sentenceState}. Verdict ${card.displayVerdict}. Tier ${card.tier}.`,
    clean(card.statement),
    account?.text ? clean(account.text) : "(no reason under this label)",
  ];
  if (findings.length) lines.push(findings.map((row) => clean(row.note)).filter(Boolean).join(" "));
  return lines.join("\n");
}

function first(list, pred) {
  return list.find(pred) || null;
}

const conflictProse = first(cards, (card) => card.sentenceState === "conflicts" && (card.displayedEvidenceProse || "").trim());
const conflictNew = first(empty, (row) => row.card.sentenceState === "conflicts");
const partial = first(partials, (card) => cardEvidenceFindings(card, []).length > 0 && card.sentenceState === "partial")
  || first(partials, (card) => card.sentenceState === "beyond");
const beyondProse = first(cards, (card) => card.sentenceState === "beyond" && (card.displayedEvidenceProse || "").trim());
const backed = first(cards, (card) => card.sentenceState === "nothing_raised" && card.displayVerdict === "supported_full");
const quoteStored = first(empty, (row) => row.account?.source === "quote");
const clauseStored = first(empty, (row) => row.account?.source === "clause");
const fieldStored = first(empty, (row) => row.account?.source === "stored" && row.card.sentenceState === "not_in_source");
const eight = [conflictProse, conflictNew?.card, partial, beyondProse, backed, quoteStored?.card, clauseStored?.card, fieldStored?.card];

const lines = [];
lines.push("# B461. Show what the product already knows.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0. Nothing a model is asked was changed.");
lines.push("");
lines.push("A source dash is written here as a hyphen. A replacement character in a stored excerpt is written as an apostrophe.");
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("`lib/qc/reader-reason.mjs` is the one sentence under a raised verdict. The screen copy is `src/modules/drafting/readerReason.js`. They agree on every card of this pass. The export calls the same sentence.");
lines.push("");
lines.push("The sentence is, in order: the prose already stored for the reader; a difference, summary, or evidence line already on the card; the partial sentence when this card is a partial; the source half of a stored note; the evidence line written from the stored passage. A wording note is not a candidate. A sentence that says the two sides agree is not a candidate. A sentence that fails the endorsement guard is not shown.");
lines.push("");
lines.push("`applyReadingContract` stores that sentence on `displayedEvidenceProse` when the field would have been empty. On this pass the field is still empty, because the pass was stored before that write. The replay reads the other fields and produces the sentence. The next review stores it.");
lines.push("");
lines.push("A partial card carries that stored partial sentence as a finding, including when the sentence state is beyond or not in the source. The state, the label, and the tier stay where they were.");
lines.push("");
lines.push("To look at includes a beyond sentence. The flag is `needsAttention` in `lib/qc/review-summary.mjs` and the same check in `src/utils/summariseReview.js`.");
lines.push("");
lines.push("A summary longer than three points keeps the first three and adds one line that says how many were cut. When editorial or compliance notes are among the cut points, that line names them. The same helper is in `lib/qc/summary-bullets.mjs` and `src/modules/drafting/reviewSummaryDisplay.js`.");
lines.push("");
lines.push("`no_support` is named Does not support the statement. `not_reviewed` is named Not checked against the statement. Both stay amber.");
lines.push("");
lines.push("## The 44");
lines.push("");
lines.push(`Empty reasons after the sentence is read: ${emptyReason}.`);
lines.push("");
lines.push(`Reason was stored: ${split.stored + split.clause}. ${split.stored} were already a field on the card, a difference or a summary, and the screen was not reading it. ${split.clause} were the source half of a note already on the card. The agreement half of that note stays hidden.`);
lines.push("");
lines.push(`Reason had to be stored: ${split.quote}. The note was an agreement note, or it did not say what the source says. The passage was on the card. The evidence line the product already writes from a passage is now the sentence, and the writer stores it. The filename is not on this compact card, so the line says "The source" and the missing filename is logged.`);
lines.push("");
lines.push("## The other five");
lines.push("");
lines.push(`Export sentences that differ from the card: ${proseDiff}. Screen sentences that differ from the export: ${screenDiff + exportDiff}.`);
lines.push("");
lines.push(`Beyond sentences left out of To look at: ${beyondHidden}.`);
lines.push("");
lines.push(`Partial or beyond headlines with no finding: ${noFinding.length}.`);
lines.push("");
lines.push(`Summaries that cut the list and do not say so: ${silentCap}. Editorial or compliance notes cut and not named: ${crowdedSilent}.`);
lines.push("");
lines.push(`The cut adds one line. ${lengthened} drafts go from 3 lines to 4. The three evidence points stay. The fourth line is the count, and it names editorial or compliance when those notes were among the points cut. It does not replace an evidence point with the editorial sentence.`);
if (lengthNotes.length) {
  lines.push("");
  for (const note of lengthNotes) lines.push(`- ${note}`);
}
lines.push("");
lines.push(`Amber classes with no name: ${unnamed}.`);
for (const [cls, name] of classNames) lines.push(`- ${cls}: ${name}`);
lines.push("");
lines.push("## The guard, the notes, and the silences");
lines.push("");
lines.push(`Newly shown strings withheld by the endorsement guard: ${withheld.length}.`);
if (withheld.length) {
  for (const row of withheld) lines.push(`- ${row.key}. ${row.phrase}. ${clean(row.text)}`);
}
lines.push("");
lines.push(`Wording notes on this pass: ${wordingNotes}. Shown as the reason: ${wordingShown}. They stay on the card as a withheld note. The reader does not see them.`);
lines.push("");
lines.push("A silence written for a withheld sentence has an id and a count. It does not carry the sentence. None of these 261 needed one.");
lines.push("");
lines.push("## Verdicts");
lines.push("");
lines.push(`261 of 261. displayVerdict, sentenceState, sentenceLabel, and tier are the values on the stored card.`);
lines.push("");
lines.push(`Labelled faults: ${faultyRaised} of ${faultyN}.`);
lines.push(`Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${oldAfter.evidenceLeaveAlone} of ${oldAfter.n}, combined quiet ${oldAfter.combinedQuiet} of ${oldAfter.n}, on the old definition.`);
lines.push(`Evidence leave-alone ${newAfter.evidenceLeaveAlone} of ${newAfter.n}, combined quiet ${newAfter.combinedQuiet} of ${newAfter.n}, on the new definition.`);
lines.push("");
lines.push("These are the B460 figures. This spec does not move a verdict, so the leave-alone count is the same measurement as that replay.");
lines.push("");
lines.push("## Eight cards");
lines.push("");
for (const card of eight) {
  if (!card) continue;
  lines.push(quoteCard(card));
  lines.push("");
}
lines.push("## Tests");
lines.push("");
lines.push("`tests/b461-shown-reason.test.mjs` is new. It locks the shared sentence, the hidden wording note, the passage line, a withheld certifying sentence, beyond inside To look at, the summary line, and the partial finding.");
lines.push("");
lines.push("`src/modules/drafting/__tests__/b461-screen.test.js` is new. It locks the same sentence on the screen, the summary line, and the two class names.");
lines.push("");
lines.push("`tests/b453-partial-finding.test.mjs` used to require an empty finding list when a supported_partial card's sentence state was not_in_source. That empty list is the defect. The test now requires the stored partial sentence, and it requires the state, the label, and the verdict to stay put.");
lines.push("");
lines.push("No assertion was given an exemption.");
lines.push("");
lines.push("## Files");
lines.push("");
lines.push("- `lib/qc/reader-reason.mjs`. The sentence under a raised verdict, shared by the writer and the export.");
lines.push("- `src/modules/drafting/readerReason.js`. The same sentence on the screen. The screen cannot import the backend.");
lines.push("- `tests/b461-shown-reason.test.mjs`. Locks the sentence, the guard, the filter, and the summary line.");
lines.push("- `src/modules/drafting/__tests__/b461-screen.test.js`. Locks the screen copy.");
lines.push("- `scripts/diagnostic/b461/replay.mjs`. This measurement.");
lines.push("- `scripts/diagnostic/b461/RESULT.md`. This report.");
lines.push("");
lines.push("## Browser");
lines.push("");
lines.push("Not run against a Review. A Review would ask a model, and this spec spends nothing. The sentences, the filter flag, the summary line, and the class names are the functions above, measured on the stored pass.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);

const problems = [];
if (emptyReason !== 0) problems.push(`empty reasons ${emptyReason}`);
if (proseDiff !== 0 || screenDiff !== 0 || exportDiff !== 0) problems.push(`export diffs prose ${proseDiff} screen ${screenDiff} export ${exportDiff}`);
if (beyondHidden !== 0) problems.push(`beyond hidden ${beyondHidden}`);
if (noFinding.length !== 0) problems.push(`no finding ${noFinding.length}`);
if (silentCap !== 0 || crowdedSilent !== 0) problems.push(`summary silent ${silentCap} crowded ${crowdedSilent}`);
if (unnamed !== 0) problems.push(`unnamed ${unnamed}`);
if (withheld.length !== 0) problems.push(`withheld ${withheld.length}`);
if (wordingShown !== 0) problems.push(`wording shown ${wordingShown}`);
if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (oldAfter.evidenceLeaveAlone < 51 || newAfter.evidenceLeaveAlone < 51) problems.push(`leave-alone ${oldAfter.evidenceLeaveAlone} ${newAfter.evidenceLeaveAlone}`);
if (oldAfter.combinedQuiet < 32 || newAfter.combinedQuiet < 32) problems.push(`quiet ${oldAfter.combinedQuiet} ${newAfter.combinedQuiet}`);
if (split.stored + split.clause + split.quote !== 44) problems.push(`split ${JSON.stringify(split)}`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`44 stored ${split.stored} clause ${split.clause} quote ${split.quote}`);
console.log(`leave-alone ${oldAfter.evidenceLeaveAlone}/${newAfter.evidenceLeaveAlone} quiet ${oldAfter.combinedQuiet}/${newAfter.combinedQuiet}`);
console.log(`catch ${faultyRaised} group ${groupRaised} wording ${wordingNotes} lengthened ${lengthened}`);
