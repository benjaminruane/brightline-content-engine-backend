/**
 * B458. Replay the committed B456 pass. No model call.
 *
 *   node scripts/diagnostic/b458/replay.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { elementFound, extractElements } from "../../../lib/qc/b394-elements.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { evidenceLine, isEquivalenceSentence, quoteIsVerbatim, sentencesOf } from "../../../lib/qc/evidence-line.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b456/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");
const FAULTY = new Set(["conflicting", "no_support"]);

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}

function noteRefused(card) {
  return (Array.isArray(card.silences) ? card.silences : []).some((row) => row?.id === "note_refused");
}

function citingSource(quote, sources) {
  const text = typeof quote === "string" ? quote : "";
  if (!text.trim()) return null;
  return (sources || []).find((source) => typeof source?.text === "string" && source.text.includes(text)) || null;
}

function passageOf(card, sources) {
  const quote = typeof card.sourceQuote === "string" && card.sourceQuote.trim()
    ? card.sourceQuote
    : (typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : "");
  const verbatim = quote.trim() ? quoteIsVerbatim(quote, sources) : false;
  const cited = citingSource(quote, sources);
  return {
    quote: verbatim ? quote : "",
    fileName: cited?.label || sources[0]?.label || "",
  };
}

function factsWithoutHedge(statement, sourceText) {
  return extractElements(statement, statement, sourceText).map((element) => {
    const bare = { ...element, hedge: "" };
    return { ...bare, status: elementFound(bare, sourceText) ? "matched" : "not_found" };
  });
}

function verdictOf(card, facts) {
  const refused = noteRefused(card);
  const note = card.readingNote
    ? { bucket: card.readingNote.bucket, text: card.readingNote.text, refused }
    : null;
  return shownVerdict(statementVerdict({ facts, note, entries: [] }), card.displayVerdict);
}

function lineOf(card, sources, bucket) {
  const refused = noteRefused(card);
  const stored = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  const passage = passageOf(card, sources);
  return evidenceLine({
    fileName: passage.fileName,
    quote: passage.quote,
    noteText: refused ? "" : stored,
    noteBucket: bucket,
  });
}

function priorLine(card, sources) {
  const refused = noteRefused(card);
  const stored = typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  if (stored && !refused) return stored;
  return lineOf(card, sources, "");
}

function hasEquivalence(text) {
  return sentencesOf(text).some((sentence) => isEquivalenceSentence(sentence));
}

function block(text) {
  return String(text || "").split("\n").map((line) => `> ${line}`).join("\n");
}

function withSentence(card, verdict) {
  return { ...card, sentenceState: verdict.state, tier: verdict.tier, statementVerdict: verdict };
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
if (!Array.isArray(cards) || cards.length !== 261) {
  throw new Error(`b458 replay: expected 261 cards, found ${cards?.length}`);
}

const labelsDoc = JSON.parse(readFileSync(path.join(ACCURACY, "labels.json"), "utf8"));
const design = JSON.parse(readFileSync(path.join(ACCURACY, "group-a-design.json"), "utf8"));
const statements = JSON.parse(readFileSync(path.join(ACCURACY, "statements.json"), "utf8"));
const labels = normalizeLabelsDoc({ labels: labelsDoc.labels });
const mapped = mapGroupA(flattenStatements(statements), design);
const labelByKey = new Map();
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  labelByKey.set(joinKey(row.fixtureId, row.statementText, row.occurrence), row);
}
const byJoin = indexCards(cards);

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  sourcesByFixture.set(padFixtureId(fixture.data.id), await loadPipelineSources(fixture.data.sources || []));
}

const rows = [];
for (const card of cards) {
  const sources = sourcesByFixture.get(pad(card.fixtureId));
  if (!sources) throw new Error(`b458 replay: no sources for fixture ${card.fixtureId}`);
  const sourceText = readingSourceText(sources);
  const beforeFacts = factsWithoutHedge(card.statement, sourceText);
  const afterFacts = buildFacts({ statement: card.statement, draft: card.statement, sourceText });
  const beforeVerdict = verdictOf(card, beforeFacts);
  const afterVerdict = verdictOf(card, afterFacts);
  const bucket = noteRefused(card) ? "" : (card.readingNote?.bucket || "");
  const before = priorLine(card, sources);
  const after = lineOf(card, sources, bucket);
  const hedges = extractElements(card.statement, card.statement, sourceText)
    .filter((element) => element.kind === "figure" && element.hedge);
  const unmatchedBefore = beforeFacts.filter((fact) => fact.status === "not_found").map((fact) => `${fact.kind}:${fact.surface}`);
  const unmatchedAfter = afterFacts.filter((fact) => fact.status === "not_found").map((fact) => `${fact.kind}:${fact.surface}`);
  rows.push({
    key: keyOf(card),
    card,
    beforeVerdict,
    afterVerdict,
    before,
    after,
    hedges,
    unmatchedBefore,
    unmatchedAfter,
    beforeLabel: shownLabel({ statementVerdict: beforeVerdict, displayVerdict: card.displayVerdict }),
    afterLabel: shownLabel({ statementVerdict: afterVerdict, displayVerdict: card.displayVerdict }),
  });
}

const beforeEquiv = rows.filter((row) => hasEquivalence(row.before));
const afterEquiv = rows.filter((row) => hasEquivalence(row.after));
const empty = rows.filter((row) => !row.after);
const hedged = rows.filter((row) => row.hedges.length);

let faultyRaised = 0;
let faultyN = 0;
const faultyMisses = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const card = byJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const spoke = card ? Object.values(layerSpoken(card)).some((layer) => layer.raised) : false;
  if (spoke) faultyRaised += 1;
  else faultyMisses.push(`${pad(row.fixtureId)} ${row.label}`);
}
let groupRaised = 0;
const groupMisses = [];
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const card = key ? byJoin.get(key) : null;
  const spoke = card ? Object.values(layerSpoken(card)).some((layer) => layer.raised) : false;
  if (spoke) groupRaised += 1;
  else groupMisses.push(fault.id);
}

const confirmedStored = [];
const confirmedB457 = [];
const confirmedB458 = [];
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byJoin.get(key);
  if (!card) throw new Error(`b458 replay: confirmed label has no card (${key})`);
  const replay = rows.find((item) => item.card === card);
  confirmedStored.push(card);
  confirmedB457.push(withSentence(card, replay.beforeVerdict));
  confirmedB458.push(withSentence(card, replay.afterVerdict));
}

const oldStored = tallyLeaveAlone(confirmedStored);
const newStored = tallyLeaveAloneWithLabel(confirmedStored);
const oldB457 = tallyLeaveAlone(confirmedB457);
const newB457 = tallyLeaveAloneWithLabel(confirmedB457);
const oldB458 = tallyLeaveAlone(confirmedB458);
const newB458 = tallyLeaveAloneWithLabel(confirmedB458);

const full = hedged.filter((row) => row.card.displayVerdict === "supported_full").length;
const examples = rows.filter((row) => {
  if (row.before === row.after || !hasEquivalence(row.before)) return false;
  return !/[—–]/.test(`${row.card.statement}\n${row.before}\n${row.after}`);
}).slice(0, 5);

const lines = [];
lines.push("# B458. Drop the equivalence sentence, honour a hedged figure, and let the measure see the label.");
lines.push("");
lines.push("Replay of `scripts/diagnostic/b456/pass-1.json`. No model call. USD 0.");
lines.push("");
lines.push("## Equivalence sentences");
lines.push("");
lines.push(`Cards whose evidence line contains a sentence explaining that two forms are equivalent: ${beforeEquiv.length} before, ${afterEquiv.length} after.`);
if (afterEquiv.length) {
  for (const row of afterEquiv) lines.push(`- ${row.key}: ${row.after}`);
}
lines.push("");
lines.push("## Hedged figures");
lines.push("");
lines.push("A hedge is a qualifier sitting immediately in front of the figure. `over the period` and `under its ownership` are not hedges. `more than`, `less than`, `over`, and `under` require the source number to sit strictly on that side. An equal number does not satisfy them, unless the source uses the same hedge on that number. A far larger number does satisfy `more than`, because the words are true of it. `modestly above` requires the source number to be greater and no more than 15 percent above. `nearly` requires the source number to be under the draft number: within 5 percent for a round amount, or one percentage point for a whole-number percent. `approximately`, `around`, `roughly`, and `about` use that band on either side. A bare count of 20 or less may be one either side. A figure written with a decimal stays within 1 percent, so a nearby but different percentage in the same source does not count.");
lines.push("");
lines.push(`Hedged statements: ${hedged.length}. Fully backed among them: ${full}. The brief counted 24. The table is every statement where the code finds a qualifier immediately in front of a figure, so the extra ones are visible rather than dropped to hit 24.`);
lines.push("");
lines.push("| Card | Display verdict | Sentence before | Sentence after | Hedged figure unmatched before | After |");
lines.push("|---|---|---|---|---|---|");
for (const row of hedged) {
  const surfaces = row.hedges.map((element) => `${element.hedge} ${element.surface}`).join(", ");
  const missBefore = row.unmatchedBefore.filter((item) => row.hedges.some((element) => item.endsWith(element.surface))).join(", ") || "-";
  const missAfter = row.unmatchedAfter.filter((item) => row.hedges.some((element) => item.endsWith(element.surface))).join(", ") || "-";
  lines.push(`| ${row.key} | ${row.card.displayVerdict} | ${row.beforeLabel} | ${row.afterLabel} | ${missBefore} (${surfaces}) | ${missAfter} |`);
}
lines.push("");
lines.push("The display verdict is not an input to the figure check, so it does not move. The sentence label moves only when the hedge was the reason the figure was unmatched and no louder note remains. 06:5 stays Conflicts with the source. The source already states both EUR 218 million and EUR 196 million, so the hedge is satisfied and the conflict is not an unmatched figure. The other conflicts in the table did not move either.");
lines.push("");
lines.push("## Catch");
lines.push("");
lines.push(`Labelled faulty statements: ${faultyRaised} of ${faultyN}.`);
if (faultyMisses.length) lines.push(`Misses: ${faultyMisses.join(", ")}.`);
lines.push(`Group A design faults: ${groupRaised} of ${design.faults.length}.`);
if (groupMisses.length) lines.push(`Misses: ${groupMisses.join(", ")}.`);
lines.push("Catch uses the original six layers. The new sentence layer is not part of it.");
lines.push("");
lines.push("## Leave-alone");
lines.push("");
lines.push("The old definition is the one the series back to B437 uses. It reads the display verdict, the note bucket, and whether a concern is present. The new definition also reads the sentence label and the tier.");
lines.push("");
lines.push("| Corpus | Old evidence leave-alone | Old combined quiet | New evidence leave-alone | New combined quiet |");
lines.push("|---|---:|---:|---:|---:|");
lines.push(`| B456 stored pass | ${oldStored.evidenceLeaveAlone} of ${oldStored.n} | ${oldStored.combinedQuiet} of ${oldStored.n} | ${newStored.evidenceLeaveAlone} of ${newStored.n} | ${newStored.combinedQuiet} of ${newStored.n} |`);
lines.push(`| B457 replay, form match, no hedge | ${oldB457.evidenceLeaveAlone} of ${oldB457.n} | ${oldB457.combinedQuiet} of ${oldB457.n} | ${newB457.evidenceLeaveAlone} of ${newB457.n} | ${newB457.combinedQuiet} of ${newB457.n} |`);
lines.push(`| B458 replay, hedge honoured | ${oldB458.evidenceLeaveAlone} of ${oldB458.n} | ${oldB458.combinedQuiet} of ${oldB458.n} | ${newB458.evidenceLeaveAlone} of ${newB458.n} | ${newB458.combinedQuiet} of ${newB458.n} |`);
lines.push("");
function newlySeen(storedList, seenList) {
  const out = [];
  for (let i = 0; i < storedList.length; i += 1) {
    const key = `${pad(storedList[i].fixtureId)}:${storedList[i].index}`;
    const wasEvidence = tallyLeaveAlone([storedList[i]]).evidenceLeaveAlone === 1;
    const nowEvidence = tallyLeaveAloneWithLabel([seenList[i]]).evidenceLeaveAlone === 1;
    if (wasEvidence && !nowEvidence) out.push(`${key} ${seenList[i].sentenceState}`);
  }
  return out;
}
const withheld = confirmedStored.filter((card) => card.sentenceState === "note_withheld").map((card) => `${pad(card.fixtureId)}:${card.index}`);
lines.push(`Confirmed cards the new measure sees and the old one calls evidence-quiet, on the stored pass: ${newlySeen(confirmedStored, confirmedStored).join(", ") || "none"}.`);
lines.push(`Confirmed cards whose stored sentence is Needs a look: ${withheld.join(", ") || "none"}.`);
const outside = cards.filter((card) => card.sentenceState === "note_withheld").map((card) => `${pad(card.fixtureId)}:${card.index}`);
lines.push(`Needs a look outside that 74, on the stored pass: ${outside.join(", ") || "none"}. Both were evidence-quiet under the old definition. The new definition sees the label, so they are not quiet. They are not in the 74, which is why B453 did not move 49 or 32.`);
lines.push(`On the B457 replay: ${newlySeen(confirmedB457, confirmedB457).join(", ") || "none"}.`);
lines.push(`On the B458 replay: ${newlySeen(confirmedB458, confirmedB458).join(", ") || "none"}.`);
lines.push("");
lines.push("## Evidence lines");
lines.push("");
lines.push(`Cards with no evidence line: ${empty.length}.`);
if (empty.length) lines.push(empty.map((row) => row.key).join(", "));
lines.push("");
lines.push("## Five cards");
lines.push("");
for (const row of examples) {
  lines.push(`### ${row.key}`);
  lines.push("");
  lines.push(`Verdict: ${row.card.displayVerdict}. Sentence: ${row.afterLabel}.`);
  lines.push("");
  lines.push(block(row.card.statement));
  lines.push("");
  lines.push("Before:");
  lines.push("");
  lines.push(block(row.before));
  lines.push("");
  lines.push("After:");
  lines.push("");
  lines.push(block(row.after));
  lines.push("");
}
lines.push("## Design");
lines.push("");
lines.push("The evidence line keeps a sentence that says what the source says. It drops a sentence whose job is to say the draft's wording is the same claim, including a thousands separator, a restatement, or a figures-match. On a wording note, a clause that turns to what the statement says is cut, because that clause is the comparison. If nothing about the source remains, the line names the file and quotes the passage. A conflict note that names two different figures is left as it is. A refused note is still not explained.");
lines.push("");
lines.push("`more than 150%` is matched by 151% and is not matched by 150% or 149%. `nearly 10,000` is matched by 9,700 and is not matched by 9,400 or by 10,400. `modestly above EUR 196 million` is matched by EUR 218 million and is not matched by EUR 400 million or by a number below 196. Callers of `elementFound` are `buildFacts`, `proposal-check`, and the diagnostic scripts that re-export the extractor. A hedged figure can now be found. `displayVerdict` is not one of those callers, so the class does not move.");
lines.push("");
lines.push("`layerSpoken`, `quietOf`, `evidenceQuietOf`, and `tallyLeaveAlone` are unchanged. `layerSpokenWithLabel` adds the sentence label and tier. A confirmed card whose headline says Not in the source, or Needs a look, is no longer quiet.");
lines.push("");
lines.push("## Files");
lines.push("");
lines.push("- `lib/qc/evidence-line.mjs`. Drops the equivalence sentence. Already composed the line.");
lines.push("- `lib/qc/b394-elements.mjs`. A hedge is part of the figure, and a source number that satisfies it counts as found.");
lines.push("- `scripts/diagnostic/lib/leave-alone.mjs`. The new tally. The old tally stays, so B437 onward can still be read.");
lines.push("- `tests/b458-hedge-and-label.test.mjs`. Locks the bands, the dropped sentence, and that the old tally does not grow a seventh key.");
lines.push("- `scripts/diagnostic/b458/replay.mjs`. Replays the pass. No model call.");
lines.push("- `tests/b457-form-and-line.test.mjs`. The note test now expects the source sentence without the separator sentence. The 150 test now expects 151 to satisfy more than 150, and 150 and 149 to fail. No exemption was added.");
lines.push("");
lines.push("`Claude outputs/` is already in `.gitignore`, from `139fd54`. The HTML preview stays on disk and does not dirty the tree.");
lines.push("");

writeFileSync(OUT, lines.join("\n"));
console.log(lines.slice(0, 22).join("\n"));
console.log("hedged", hedged.length, "full", full);
console.log("examples", examples.map((row) => row.key).join(", "));
console.log("empty", empty.length, "after equiv", afterEquiv.length);
