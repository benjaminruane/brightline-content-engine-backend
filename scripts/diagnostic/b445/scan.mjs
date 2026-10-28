/**
 * B445. No model call.
 *   node scripts/diagnostic/b445/scan.mjs
 *
 * Scores scripts/diagnostic/b441/pass-1.json as stored, then again after the
 * mechanics scan replaces the model's house-style concerns.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import {
  applyMechanicsScan,
  isScannedHouseStyle,
  layerSpoken,
  quietOf,
  tallyLeaveAlone,
} from "../lib/leave-alone.mjs";
import { scanMechanics } from "../../../lib/qc/mechanics-scan.mjs";
import {
  flattenStatements,
  joinKey,
  mapGroupA,
} from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b441/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

function show(text) {
  return String(text || "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function linesOf(tally) {
  const codes = Object.keys(tally.houseStyleMentions).sort();
  const rows = codes.length
    ? codes.map((code) => (
      `- ${code}: ${tally.houseStyleMentions[code]} mentions on ${tally.houseStyleStatements[code] || 0} statements.`
    ))
    : ["- none."];
  return [
    `Evidence leave-alone: ${tally.evidenceLeaveAlone} of ${tally.n}.`,
    `House-style mentions:`,
    ...rows,
    `Combined quiet: ${tally.combinedQuiet} of ${tally.n}.`,
  ];
}

function catchOf(byKey, design, mapped) {
  const misses = [];
  let raised = 0;
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const spoke = layers ? Object.values(layers).some((layer) => layer.raised) : false;
    if (spoke) raised += 1;
    else misses.push(fault.id);
  }
  return { raised, n: design.faults.length, misses };
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = Array.isArray(pass.cards) ? pass.cards : null;
if (!cards) throw new Error("b445: pass-1.json has no cards");
if (cards.length !== 261) throw new Error(`b445: expected 261 cards, found ${cards.length}`);

const fixtures = await loadAllFixtures();
const typeById = new Map();
for (const fixture of fixtures) {
  const id = String(fixture.data?.id ?? "").padStart(2, "0");
  const outputType = fixture.data?.config?.outputType;
  if (!id || id === "00") continue;
  if (!outputType) throw new Error(`b445: fixture ${id} has no output type`);
  typeById.set(id, outputType);
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

const byKey = new Map();
for (const card of cards) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);

const confirmed = [];
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byKey.get(key);
  if (!card) throw new Error(`b445: confirmed label has no card (${key})`);
  confirmed.push(card);
}
if (confirmed.length !== 74) throw new Error(`b445: expected 74 confirmed statements, found ${confirmed.length}`);

const stored = tallyLeaveAlone(confirmed);
const storedCatch = catchOf(byKey, design, mapped);

const voiceTexts = [];
for (const card of confirmed) {
  for (const concern of card.editorialConcerns || []) {
    if (concern?.concernCode !== "voice_consistency") continue;
    voiceTexts.push({
      house: isScannedHouseStyle(concern),
      text: show(concern.text || concern.note || concern.quote || ""),
      fixtureId: card.fixtureId,
      index: card.index,
    });
  }
}

let notReviewed = 0;
const predictedCards = confirmed.map((card) => {
  const fixtureId = String(card.fixtureId || "").padStart(2, "0");
  const outputType = typeById.get(fixtureId);
  if (!outputType) throw new Error(`b445: fixture ${fixtureId} has no output type`);
  if (card.editorialVerdict === "not_reviewed") notReviewed += 1;
  return applyMechanicsScan(card, outputType);
});
const predictedByKey = new Map(byKey);
for (let i = 0; i < confirmed.length; i += 1) {
  const card = confirmed[i];
  predictedByKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), predictedCards[i]);
}
const predicted = tallyLeaveAlone(predictedCards);
const predictedCatch = catchOf(predictedByKey, design, mapped);

let confirmedWithPercentOrDash = 0;
let quietLostToScan = 0;
let quietLostOnPercentOrDash = 0;
for (let i = 0; i < confirmed.length; i += 1) {
  const card = confirmed[i];
  const fixtureId = String(card.fixtureId || "").padStart(2, "0");
  const outputType = typeById.get(fixtureId);
  const raised = scanMechanics({ statement: card.statement, outputType });
  const style = raised.filter((row) => row.concernCode === "percentage_notation" || row.concernCode === "em_dash");
  if (style.length) confirmedWithPercentOrDash += 1;
  if (quietOf(card) && !quietOf(predictedCards[i])) {
    quietLostToScan += 1;
    if (style.length) quietLostOnPercentOrDash += 1;
  }
}

const fixture19 = cards.find((card) => String(card.fixtureId || "").padStart(2, "0") === "19" && card.index === 11);
if (!fixture19 || typeof fixture19.statement !== "string") {
  throw new Error("b445: fixture 19 statement 11 is missing");
}
const fixture19Rows = scanMechanics({ statement: fixture19.statement, outputType: typeById.get("19") });
const fixture19Percent = fixture19Rows.find((row) => row.concernCode === "percentage_notation");
if (!fixture19Percent || fixture19Percent.span.length !== 4) {
  throw new Error("b445: fixture 19 statement 11 did not group four percentage spans");
}

const body = [
  "# B445",
  "",
  "No model call. The 261 stored statements are `scripts/diagnostic/b441/pass-1.json`. Labels were not edited. Catch uses the same definition as B441: a planted fault is caught when any of the six layers spoke.",
  "",
  "## Reasoning",
  "",
  "The occurrence list lives on `span`. That array is already the list of offsets a click walks, and it is already the list stage 7 counts. A new field would have been a second copy of the same offsets. `quote` stays the exact text of the first occurrence, which is the whole quote when the statement has one. The prose fields `text`, `note`, `concernText`, and `suggestedDirection` name every occurrence. One occurrence is the same object the scan produced before this grouping. The editorial count on the card is `editorialConcerns.length`, so one concern per rule makes that count a count of rules.",
  "",
  "The detectors, the quotation exemption, and the house-voice lookup are unchanged. A match inside paired double quotes is still skipped. The country abbreviation US is still skipped. Investor letters and LinkedIn posts still raise no first-person concern.",
  "",
  "A draft mark is built from every span on the concern. One span still produces one mark. The click highlighter already walked the whole `span` array, so the frontend did not change.",
  "",
  "Evidence leave-alone is the B441 quiet test with the scanned house-style concerns taken out of the editorial layer. Those codes are `percentage_notation`, `em_dash`, and `first_person_plural`. `voice_consistency` counts as that same first-person fault only when the concern text says first person or speaking as we. A voice switch that is not that fault still counts as editorial speech. The other five layers are unchanged, so a wrong factual challenge still removes the statement. House-style mentions are counted beside that number, one mention per concern, with the rule named. On the stored file a mention is an occurrence, because that file raised one concern per occurrence. After the scan, a mention is one rule on one statement.",
  "",
  "The combined number is still B441 `quietOf`: quiet only when no layer spoke, house style included. The series back to B437 keeps that number. The split is `scripts/diagnostic/lib/leave-alone.mjs`. The B437, B440, and B441 score scripts were not rewritten. The next pass imports this module.",
  "",
  "## As stored",
  "",
  ...linesOf(stored),
  `Catch: ${storedCatch.raised} of ${storedCatch.n}.${storedCatch.misses.length ? ` Misses: ${storedCatch.misses.join(", ")}.` : ""}`,
  "",
  "Confirmed `voice_consistency` concerns, and whether this split treats them as the first-person fault:",
  ...(voiceTexts.length
    ? voiceTexts.map((row) => `- fixture ${row.fixtureId} index ${row.index}: ${row.house ? "house style" : "still editorial"}. ${row.text}`)
    : ["- none."]),
  "",
  "## After the scan",
  "",
  "The model's scanned house-style concerns are removed and the scan is added. A card whose editorial verdict is `not_reviewed` is left as stored, because the live path does not scan that card either.",
  `Confirmed cards left as not reviewed: ${notReviewed}.`,
  ...linesOf(predicted),
  `Catch: ${predictedCatch.raised} of ${predictedCatch.n}.${predictedCatch.misses.length ? ` Misses: ${predictedCatch.misses.join(", ")}.` : ""}`,
  "",
  `As stored, ${stored.evidenceLeaveAlone - stored.combinedQuiet} confirmed statements are out of the combined number only because a house-style concern spoke. After the scan, that gap is ${predicted.evidenceLeaveAlone - predicted.combinedQuiet}.`,
  `${confirmedWithPercentOrDash} of the 74 confirmed statements contain a spelled percentage or a long dash outside quotation marks. ${quietLostOnPercentOrDash} of those were quiet as stored. ${quietLostToScan} confirmed statements were quiet as stored and are not quiet once the scan is applied. ${quietLostOnPercentOrDash === quietLostToScan ? "A first-person concern did not remove any further quiet statement." : `${quietLostToScan - quietLostOnPercentOrDash} further quiet statements were removed by a first-person concern.`}`,
  `Combined quiet moves from ${stored.combinedQuiet} to ${predicted.combinedQuiet}. Evidence leave-alone stays ${stored.evidenceLeaveAlone}.`,
  `Fixture 19 statement 11 is not in the confirmed 74. The stored card has no editorial concern. The grouped scan raises one percentage concern with ${fixture19Percent.span.length} spans. ${show(fixture19Percent.text)} The editorial count for that sentence is 1.`,
  "",
  "Cost: USD 0.",
  "",
].join("\n");

writeFileSync(OUT, body);
process.stdout.write(body);
process.stdout.write(`\nWrote ${OUT}\n`);
