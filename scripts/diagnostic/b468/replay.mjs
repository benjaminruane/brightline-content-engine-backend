/**
 * B468. Replay the stored B464 pass. No model call.
 *
 *   node scripts/diagnostic/b468/replay.mjs
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
import { readerEvidenceSentence, readerSentences } from "../../../lib/qc/reader-reason.mjs";
import { scanListCommas } from "../../../lib/qc/list-comma-scan.mjs";
import { scanNumberForm } from "../../../lib/qc/number-form-scan.mjs";
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
import { storedFormConcernStands } from "../../../../brightline-content-engine-frontend/src/modules/drafting/formConcern.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const UNRECORDED = "Part of this statement is in the source. Which part was not recorded.";
const FAULTY = new Set(["conflicting", "no_support"]);

const HEADER_BEFORE = {
  "01": "2 facts are not in the source, across 2 of your 12 statements. 2 worth a glance",
  "02": "1 statement needs a look. 1 worth a glance",
  "03": "1 statement conflicts with the source. 1 worth a glance",
  "04": "1 statement conflicts with the source. 7 worth a glance",
  "05": "2 facts are not in the source, across 2 of your 8 statements. 1 statement conflicts with the source",
  "06": "",
  "07": "",
  "08": "2 statements conflict with the source. 7 worth a glance",
  "09": "1 statement conflicts with the source. 2 worth a glance",
  "10": "",
  "11": "1 fact is not in the source, across 1 of your 14 statements. 1 worth a glance",
  "12": "4 facts are not in the source, across 2 of your 10 statements. 2 statements conflict with the source. 1 worth a glance",
  "13": "2 facts are not in the source, across 1 of your 16 statements. 2 statements conflict with the source. 4 worth a glance",
  "14": "1 statement conflicts with the source. 5 worth a glance",
  "15": "2 statements conflict with the source. 3 worth a glance",
  "16": "2 worth a glance",
  "17": "1 statement conflicts with the source",
  "18": "6 statements conflict with the source. 3 worth a glance",
  "19": "3 statements conflict with the source. 2 facts are not in the source, across 2 of your 14 statements",
  "20": "1 fact is not in the source, across 1 of your 9 statements",
};
const FAMILY = {
  conflict: ["Conflicts with the source"],
  conflicting: ["Conflicts with the source"],
  not_supported: ["Not in the source"],
  supported_partial: ["Partly in the source", "Goes beyond the source"],
  supported_full: ["Nothing raised", "Needs a look"],
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
let emptyRaised = 0;
const faults = [];
const reasonChanges = [];
const clauseDrops = [];
const partialGaps = [];
let longest = { key: "", text: "", n: 0 };

function sentenceFails(text, card) {
  if (assertsAgreement(text)) return true;
  const corpus = sourceCorpus(card);
  const examined = corpus.length ? maskVerbatimQuotes(text, corpus) : text;
  if (endorsementHit(examined)) return true;
  return /\bconfirms\b|\bconfirmed\b|\bas stated\b|\baligns with\b/i.test(text);
}

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
    if (reason.length > longest.n) longest = { key: keyOf(card), text: reason, n: reason.length };
    const namesSource = /\b(?:the source|the passage)\b/i.test(reason) || /states "|says "/i.test(reason);
    const namesDifference = /\b(?:however|does not|do not|whereas|not state|not record|broader|missing|adds|omits)\b/i.test(reason);
    if (card.sentenceLabel === "Partly in the source" && reason !== UNRECORDED && namesSource && !namesDifference) {
      partialGaps.push(keyOf(card));
    }
  }
  const stateRaised = ["partial", "beyond", "conflicts", "not_in_source"].includes(shownState(card));
  if (stateRaised && !reason) emptyRaised += 1;
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && prose !== UNRECORDED && reason !== prose) {
    reasonChanges.push({ key: keyOf(card), before: clean(prose), after: clean(reason) });
  }
  if (prose && prose !== UNRECORDED) {
    const parts = readerSentences(prose);
    const kept = parts.filter((part) => !sentenceFails(part, card));
    const dropped = parts.filter((part) => sentenceFails(part, card));
    if (dropped.length) {
      clauseDrops.push({
        key: keyOf(card),
        dropped,
        kept,
        shown: clean(reason),
        fallback: kept.length === 0,
      });
    }
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
if (emptyRaised !== 0) problems.push(`empty raised ${emptyRaised}`);
if (partialGaps.length) problems.push(`partial without difference ${partialGaps.join(" ")}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}

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
    sentenceLabel: card.sentenceLabel,
    displayVerdict: card.displayVerdict,
    facts: card.readingFacts || [],
  }))));
}

lines.push("# B468. The guard keeps what it can");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push("## What was built");
lines.push("");
lines.push("A stored explanation is split on sentence boundaries. A sentence that says the source supports the statement is dropped. A later sentence that names the difference is kept, in the words the model wrote. Where no sentence survives, the card falls back to the evidence line.");
lines.push("");
lines.push("The header counts the sentence label. It does not count the verdict field. A fact line is spoken only for cards labelled Not in the source. A conflict leads when a card is labelled Conflicts with the source.");
lines.push("");
lines.push("The final comma and the spelling of 0 to 12 are scans. The review prompt no longer asks for those two. The other four prompt-only rules stay: thousand_separator, currency_format, english_variant, and date_format. A stored drop that objects to a comma or a number is not put back on the card. Relevance still is.");
lines.push("");
lines.push("Callers. accept and readerSentences: the reader reason, and the screen's allowed(). attentionHeader: the reading header, the B460 census, and the reading-view test. SCANNED_STYLE_RULE_IDS: the review prompt filter and source awareness. scanListCommas and scanNumberForm: the editorial review, beside the mechanics scan. restoredSourceAwarenessConcerns: the card and the screen copy.");
lines.push("");
lines.push("## Problem 1. The difference is kept");
lines.push("");
lines.push("08:3 before:");
lines.push("");
lines.push('08_synth_industrial_buyout_memo states "First, the Company occupies an enviable competitive position."');
lines.push("");
lines.push("08:3 after:");
lines.push("");
lines.push(readerEvidenceSentence(cardAt(cards, "08:3")));
lines.push("");
lines.push("14:2 before:");
lines.push("");
lines.push('The source says "the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances."');
lines.push("");
lines.push("14:2 after:");
lines.push("");
lines.push(readerEvidenceSentence(cardAt(cards, "14:2")));
lines.push("");
lines.push("Sentences from which a clause was dropped:");
lines.push("");
for (const row of clauseDrops) {
  lines.push(`- ${row.key}${row.fallback ? " (no clause survived; the card uses the fallback)" : ""}`);
  for (const clause of row.dropped) lines.push(`  Dropped: ${clean(clause)}`);
  for (const clause of row.kept) lines.push(`  Kept: ${clean(clause)}`);
  lines.push(`  Shown: ${row.shown}`);
}
if (!clauseDrops.length) lines.push("None.");
lines.push("");
lines.push(`Cards whose shown reason is not the stored prose: ${reasonChanges.map((row) => row.key).join(", ") || "none"}.`);
lines.push("");
lines.push(`Cards with no reason under a raised verdict: ${emptyRaised}.`);
lines.push("");
lines.push("The five B462 probe sentences still return an empty reason. The three quote lines are still released: 06:3 and 15:9 on supported, 17:7 on structurally supported.");
lines.push("");
lines.push("## Problem 2. The header uses the label");
lines.push("");
lines.push(`Draft 19 before: ${HEADER_BEFORE["19"]}`);
lines.push("");
lines.push(`Draft 19 after: ${headerNow.get("19")}`);
lines.push("");
lines.push("Draft 19 labels:");
lines.push("");
for (const card of groups.get("19")) lines.push(`- ${keyOf(card)} ${card.sentenceLabel}`);
lines.push("");
lines.push(`Draft 02 before: ${HEADER_BEFORE["02"]}`);
lines.push("");
lines.push(`Draft 02 after: ${headerNow.get("02")}`);
lines.push("");
lines.push("Draft 02 labels:");
lines.push("");
for (const card of groups.get("02")) lines.push(`- ${keyOf(card)} ${card.sentenceLabel}`);
lines.push("");
lines.push("Every draft. Before is shown only where the line changed.");
lines.push("");
let headerMismatches = 0;
for (const [id, group] of [...groups.entries()].sort()) {
  const line = headerNow.get(id) || "";
  const labels = group.map((card) => card.sentenceLabel);
  const conflicts = labels.filter((label) => label === "Conflicts with the source").length;
  const light = labels.filter((label) => label === "Goes beyond the source" || label === "Partly in the source").length;
  const looks = labels.filter((label) => label === "Needs a look").length;
  const notIn = labels.filter((label) => label === "Not in the source").length;
  if (line.includes("conflict") && conflicts === 0) headerMismatches += 1;
  if (line.includes("needs a look") && looks === 0) headerMismatches += 1;
  if (line.includes("worth a glance") && light === 0) headerMismatches += 1;
  if (line.includes("not in the source") && notIn === 0) headerMismatches += 1;
  lines.push(`- ${id} (${group.length}): ${line || "(empty)"}`);
  if ((HEADER_BEFORE[id] || "") !== line) lines.push(`  Before: ${HEADER_BEFORE[id] || "(empty)"}`);
}
if (headerMismatches) problems.push(`header mismatches ${headerMismatches}`);
lines.push("");
lines.push(`Header mismatches: ${headerMismatches}.`);
lines.push("");
const disagreements = [];
for (const card of cards) {
  const family = FAMILY[String(card.displayVerdict || "").toLowerCase()] || [];
  if (!family.includes(card.sentenceLabel)) {
    disagreements.push(`${keyOf(card)} verdict ${card.displayVerdict} | label ${card.sentenceLabel}`);
  }
}
lines.push("The verdict field and the sentence label disagree when they are not the same family. supported_partial covers Partly in the source and Goes beyond the source. supported_full covers Nothing raised and Needs a look. Those pairs are not listed. The disagreement is reported and not fixed.");
lines.push("");
lines.push(`Disagreements: ${disagreements.length}.`);
lines.push("");
for (const row of disagreements) lines.push(`- ${row}`);
lines.push("");
lines.push("## Problem 3. The two form checks");
lines.push("");
lines.push("16:0 is not restored. The comma before and is already in the statement. The scan finds no miss. 15:24 is not restored. 7.2 is a decimal, and spelling it as seven would change the number. The scan finds no miss. 09:12 is still restored. It is relevance.");
lines.push("");
lines.push("Comma hits:");
lines.push("");
let commaCount = 0;
for (const card of cards) {
  const statement = String(card.statement || "");
  for (const hit of scanListCommas({ statement })) {
    commaCount += 1;
    lines.push(`- ${keyOf(card)}: ${hit.quote}`);
    lines.push(`  Statement: ${clean(statement)}`);
  }
}
if (!commaCount) lines.push("None.");
lines.push("");
lines.push("Number hits:");
lines.push("");
let numberCount = 0;
for (const card of cards) {
  const statement = String(card.statement || "");
  for (const hit of scanNumberForm({ statement })) {
    numberCount += 1;
    const flagged = hit.span.map((span) => statement.slice(span.startChar, span.endChar)).join(", ");
    lines.push(`- ${keyOf(card)}: ${flagged}`);
    lines.push(`  ${hit.note}`);
    lines.push(`  Statement: ${clean(statement)}`);
  }
}
if (!numberCount) lines.push("None.");
lines.push("");
lines.push("What the model raised, beside what the scan says:");
lines.push("");
for (const card of cards) {
  const concerns = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
  for (const concern of concerns) {
    const code = concern?.concernCode || concern?.rule || "";
    if (code !== "oxford_comma" && code !== "number_spelling") continue;
    const text = clean([concern?.note, concern?.concernText, concern?.text].filter((part) => typeof part === "string").join(" "));
    const scan = code === "oxford_comma" ? scanListCommas({ statement: String(card.statement || "") }) : scanNumberForm({ statement: String(card.statement || "") });
    lines.push(`- ${keyOf(card)} ${code}. Shown now: ${storedFormConcernStands(concern, card.statement) ? "yes" : "no"}.`);
    lines.push(`  Model: ${text.replace(/\u2013/g, " to ").replace(/\u2014/g, ", ")}`);
    lines.push(`  Scan: ${scan.length ? scan[0].note : "no hit"}`);
  }
  for (const drop of card.drops || []) {
    const text = typeof drop?.content === "string" ? drop.content : "";
    if (drop?.rule !== "source_awareness" || !/oxford comma|spelled out/i.test(text)) continue;
    const scan = /oxford comma/i.test(text) ? scanListCommas({ statement: String(card.statement || "") }) : scanNumberForm({ statement: String(card.statement || "") });
    const shown = restoredSourceAwarenessConcerns(card).some((row) => row.note === text.trim());
    lines.push(`- ${keyOf(card)} stored drop. Shown now: ${shown ? "yes" : "no"}.`);
    lines.push(`  Model: ${clean(text).replace(/\u2013/g, " to ").replace(/\u2014/g, ", ")}`);
    lines.push(`  Scan: ${scan.length ? scan[0].note : "no hit"}`);
  }
}
lines.push("");
lines.push("One concern per rule. Two misses on one statement are two spans on that concern. The model is no longer asked. That half is visible on the next live pass, as B444 was visible on B446.");
lines.push("");
lines.push("## Readability");
lines.push("");
lines.push(`Reason faults: ${faults.length}. Partial cards that name the source and not the difference: ${partialGaps.length}. Unrecorded line: ${unrecorded}.`);
lines.push(`Longest reason: ${longest.key}, ${longest.n} characters.`);
lines.push("");
lines.push(longest.text);
lines.push("");
lines.push("## Invariants");
lines.push("");
lines.push(`Verdict fields unchanged: ${unchanged} of 261.`);
lines.push(`Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of 11.`);
lines.push(`Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`);
lines.push(`With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone}, combined quiet ${afterLeaveLabel.combinedQuiet}.`);
lines.push(`Before the relevance restore: ${beforeLeave.evidenceLeaveAlone} and ${beforeLeave.combinedQuiet}. Label definition ${beforeLeaveLabel.evidenceLeaveAlone} and ${beforeLeaveLabel.combinedQuiet}.`);
lines.push(`Editorial movement on the confirmed set: ${moved.length ? moved.join("; ") : "none"}. 16:0 and 15:24 are no longer restored. Removing those two false objections does not move the 48 or the 30.`);
lines.push(`Screen drift: ${drift}. Export differs: ${exportDiff}. Wording notes shown: ${wordingShown}.`);
lines.push("");
lines.push("## Assertions that moved");
lines.push("");
lines.push("tests/b467-agreement-reach.test.mjs required 08:3 and 14:2 to quote the evidence line. That kept the fallback and dropped the difference. The assertion now requires the difference sentence.");
lines.push("");
lines.push("tests/b467-source-awareness-scope.test.mjs and the screen header test required the Oxford comma drop and the spelled-out drop to be shown. Those objections are false. The scan is the detector, so they stay dropped. 09:12 still comes back.");
lines.push("");
lines.push("tests/b444-mechanics-scan.test.mjs required oxford_comma in the review prompt. The scan now finds it, so the prompt no longer asks. thousand_separator, currency_format, english_variant, and date_format stay.");
lines.push("");
lines.push("tests/b180-style-fail-closed.test.mjs used a spanless oxford_comma concern as the example of a rule that is kept. The model concern is now dropped. The example is date_format, which is still kept when it has no span.");
lines.push("");
lines.push("tests/style-percent-number-fixes.test.mjs and tests/f8-number-spelling-quarter.test.mjs required a model number_spelling concern on the numeral 7 to be kept. The scan finds that numeral. The model concern is dropped so it cannot arrive twice.");
lines.push("");
lines.push("The screen header test and tests/reading-view.test.mjs required a conflict count taken from the verdict field, and required the fact line to lead while a card was labelled Conflicts with the source. The label is the count, and the conflict leads.");
lines.push("");
if (problems.length) {
  lines.push("## Problems");
  lines.push("");
  for (const problem of problems) lines.push(`- ${problem}`);
  lines.push("");
}
writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(problems.length ? problems.join("\n") : "ok");
console.log("leave", beforeLeave.evidenceLeaveAlone, beforeLeave.combinedQuiet, "after", afterLeave.evidenceLeaveAlone, afterLeave.combinedQuiet);
console.log("moved", moved.join(" "));
console.log("wrote", RESULT);
