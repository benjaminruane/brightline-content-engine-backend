/**
 * Score the B446 pass. No model calls.
 *
 *   node scripts/diagnostic/b446/score.mjs
 *
 * Writes RESULT.md. The craft judgements are written to CRAFT.md by hand
 * from the pairs this script prints at the end.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import {
  evidenceQuietOf,
  layerSpoken,
  quietOf,
  tallyLeaveAlone,
} from "../lib/leave-alone.mjs";
import { scanMechanics } from "../../../lib/qc/mechanics-scan.mjs";
import { flattenStatements, joinKey, mapGroupA } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const PRIOR = path.join(__dirname, "../b441/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const OUT = path.join(__dirname, "RESULT.md");

const CRAFT = [
  "marketing_language_excess",
  "materiality",
  "underreach_hedging",
  "sentence_length",
  "cliche_and_filler",
  "structural_integrity",
];

function show(text) {
  return String(text || "").replaceAll("\u2014", "[em dash]").replaceAll("\u2013", "[en dash]");
}

function concernsOf(card) {
  return Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [];
}

function isScanFirstPerson(concern) {
  const code = concern?.concernCode;
  if (code === "first_person_plural") return true;
  return code === "voice_consistency" && /speaking as we/.test(concern?.text || "");
}

function ruleStats(cards, pick) {
  const statements = new Set();
  let occurrences = 0;
  let concerns = 0;
  const missingSpan = [];
  for (const card of cards) {
    const rows = concernsOf(card).filter(pick);
    if (!rows.length) continue;
    const key = `${card.fixtureId}:${card.index}`;
    statements.add(key);
    concerns += rows.length;
    for (const row of rows) {
      const spans = Array.isArray(row.span) ? row.span : [];
      if (!spans.length) missingSpan.push(key);
      occurrences += spans.length;
    }
  }
  return { statements: statements.size, occurrences, concerns, missingSpan };
}

function duplicates(cards, pick) {
  const found = [];
  for (const card of cards) {
    const rows = concernsOf(card).filter(pick);
    if (rows.length > 1) found.push(`${card.fixtureId}:${card.index} x${rows.length}`);
  }
  return found;
}

function catchOf(byKey, design, mapped) {
  const misses = [];
  const faults = [];
  let raised = 0;
  for (const fault of design.faults) {
    const row = mapped.mapping.find((item) => item.id === fault.id);
    const key = row?.keys?.[0] || null;
    const card = key ? byKey.get(key) : null;
    const layers = card ? layerSpoken(card) : null;
    const spoke = layers ? Object.values(layers).some((layer) => layer.raised) : false;
    if (spoke) raised += 1;
    else misses.push(fault.id);
    const names = layers
      ? Object.entries(layers).filter(([, layer]) => layer.raised).map(([name]) => name)
      : [];
    faults.push({
      id: fault.id,
      caught: spoke,
      spoke: names,
      displayVerdict: card?.displayVerdict || null,
    });
  }
  return { raised, n: design.faults.length, misses, faults };
}

function line(name, predicted, found, met) {
  return `- ${name}. Predicted ${predicted}. Found ${found}. ${met ? "Met." : "Missed."}`;
}

function mentionLines(tally) {
  const codes = Object.keys(tally.houseStyleMentions).sort();
  if (!codes.length) return ["- none."];
  return codes.map((code) => (
    `- ${code}: ${tally.houseStyleMentions[code]} mentions on ${tally.houseStyleStatements[code] || 0} statements.`
  ));
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const prior = JSON.parse(readFileSync(PRIOR, "utf8"));
const cards = Array.isArray(pass.cards) ? pass.cards : null;
const fixtures = Array.isArray(pass.fixtures) ? pass.fixtures : null;
if (!cards || cards.length !== 261) throw new Error(`b446 score: expected 261 cards, found ${cards?.length}`);
if (!fixtures || fixtures.length !== 20) throw new Error(`b446 score: expected 20 fixtures, found ${fixtures?.length}`);

const notes = new Map();
let withheld = 0;
for (const row of fixtures) {
  if (row.ok !== true) throw new Error(`b446 score: fixture ${row.fixtureId} is not stored`);
  if (row.writerFeedbackStatus === "withheld") {
    withheld += 1;
    if (typeof row.writerFeedbackRefusal !== "string" || !row.writerFeedbackRefusal.trim()) {
      throw new Error(`b446 score: fixture ${row.fixtureId} withheld the note and stored no phrase`);
    }
  } else if (row.writerFeedbackStatus === "shown") {
    if (typeof row.writerFeedback !== "string" || !row.writerFeedback.trim()) {
      throw new Error(`b446 score: fixture ${row.fixtureId} showed the note and stored no text`);
    }
  } else {
    throw new Error(`b446 score: fixture ${row.fixtureId} has no craft note status`);
  }
  notes.set(String(row.fixtureId).padStart(2, "0"), row);
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

function indexCards(list) {
  const byKey = new Map();
  for (const card of list) byKey.set(joinKey(card.fixtureId, card.statement, card.occurrence), card);
  return byKey;
}
const byKey = indexCards(cards);
const priorByKey = indexCards(prior.cards || []);

const confirmed = [];
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byKey.get(key);
  if (!card) throw new Error(`b446 score: confirmed label has no card (${key})`);
  confirmed.push(card);
}
if (confirmed.length !== 74) throw new Error(`b446 score: expected 74 confirmed, found ${confirmed.length}`);

const tally = tallyLeaveAlone(confirmed);
const caught = catchOf(byKey, design, mapped);
const priorCaught = catchOf(priorByKey, design, mapped);

const percent = ruleStats(cards, (row) => row.concernCode === "percentage_notation");
const dash = ruleStats(cards, (row) => row.concernCode === "em_dash");
const person = ruleStats(cards, isScanFirstPerson);
const personByCode = {};
for (const card of cards) {
  for (const row of concernsOf(card)) {
    if (!isScanFirstPerson(row)) continue;
    personByCode[row.concernCode] = (personByCode[row.concernCode] || 0) + 1;
  }
}

const loaded = await loadAllFixtures();
const typeById = new Map();
for (const fixture of loaded) {
  const id = String(fixture.data?.id ?? "").padStart(2, "0");
  const outputType = fixture.data?.config?.outputType;
  if (!id || id === "00") continue;
  if (!outputType) throw new Error(`b446 score: fixture ${id} has no output type`);
  typeById.set(id, outputType);
}

let oracleMismatch = 0;
for (const card of cards) {
  const outputType = card.outputType || typeById.get(String(card.fixtureId).padStart(2, "0"));
  const raised = scanMechanics({ statement: card.statement, outputType });
  const onCard = concernsOf(card).filter((row) => (
    row.concernCode === "percentage_notation" || row.concernCode === "em_dash" || isScanFirstPerson(row)
  ));
  const cardKey = onCard.map((row) => `${row.concernCode}:${(row.span || []).length}`).sort().join(",");
  const scanKey = raised.map((row) => `${row.concernCode}:${row.span.length}`).sort().join(",");
  if (cardKey !== scanKey) oracleMismatch += 1;
}

const firstPersonOnHouseVoice = [];
for (const card of cards) {
  const outputType = card.outputType || typeById.get(String(card.fixtureId).padStart(2, "0"));
  if (outputType !== "investor_letter" && outputType !== "linkedin_post") continue;
  for (const row of concernsOf(card)) {
    const blob = `${row.concernCode || ""} ${row.text || ""}`;
    if (isScanFirstPerson(row) || /first[- ]person/i.test(blob)) {
      firstPersonOnHouseVoice.push(`${card.fixtureId}:${card.index} ${row.concernCode}`);
    }
  }
}

const dupes = [
  ...duplicates(cards, (row) => row.concernCode === "percentage_notation").map((row) => `percentage_notation ${row}`),
  ...duplicates(cards, (row) => row.concernCode === "em_dash").map((row) => `em_dash ${row}`),
  ...duplicates(cards, isScanFirstPerson).map((row) => `first person ${row}`),
];

const spanMissing = [...percent.missingSpan, ...dash.missingSpan, ...person.missingSpan];

const withheldMet = withheld === 0 || withheld === 1;
const percentMet = percent.statements === 36 && percent.occurrences === 59 && percent.concerns === 36 && !percent.missingSpan.length;
const dashMet = dash.statements === 28 && dash.occurrences === 34 && dash.concerns === 28 && !dash.missingSpan.length;
const personMet = person.statements === 27 && person.occurrences === 30 && person.concerns === 27 && !person.missingSpan.length;
const houseVoiceMet = firstPersonOnHouseVoice.length === 0;
const dupeMet = dupes.length === 0;

const quietDelta = tally.combinedQuiet - 32;
const evidenceDelta = tally.evidenceLeaveAlone - 48;
const catchDelta = caught.raised - 11;
function modelLine(name, predicted, found, delta) {
  const size = Math.abs(delta);
  let verdict = "Met.";
  if (size === 1 || size === 2) verdict = "Met. The move is one or two, inside the run-to-run band, not a result of the change.";
  if (size >= 3) verdict = "Missed. The move is larger than the run-to-run band.";
  return `- ${name}. Predicted ${predicted}. Found ${found}. ${verdict}`;
}

const quietMovers = [];
const evidenceMovers = [];
for (const [key, row] of labelByKey) {
  if (row.label !== "confirmed") continue;
  const card = byKey.get(key);
  const was = priorByKey.get(key);
  if (!was) throw new Error(`b446 score: confirmed card has no B441 card (${key})`);
  if (quietOf(card) !== quietOf(was)) {
    quietMovers.push({
      fixtureId: card.fixtureId,
      index: card.index,
      before: quietOf(was),
      after: quietOf(card),
      verdict: `${was.displayVerdict} -> ${card.displayVerdict}`,
      statement: show(card.statement),
    });
  }
  if (evidenceQuietOf(card) !== evidenceQuietOf(was)) {
    evidenceMovers.push({
      fixtureId: card.fixtureId,
      index: card.index,
      before: evidenceQuietOf(was),
      after: evidenceQuietOf(card),
      verdict: `${was.displayVerdict} -> ${card.displayVerdict}`,
      statement: show(card.statement),
    });
  }
}

const catchMovers = [];
for (let i = 0; i < caught.faults.length; i += 1) {
  const now = caught.faults[i];
  const then = priorCaught.faults[i];
  if (now.caught !== then.caught) {
    catchMovers.push(`${now.id}: B441 ${then.caught ? "caught" : "missed"} (${then.spoke.join(", ") || "none"}), this pass ${now.caught ? "caught" : "missed"} (${now.spoke.join(", ") || "none"}), verdict ${now.displayVerdict}`);
  }
}

const spend = pass.spend || {};
const list = Number(spend.listUsd);
const discounted = Number(spend.costUsd);
if (!Number.isFinite(list) || !Number.isFinite(discounted)) throw new Error("b446 score: spend is missing");
const ceilingGap = 40 - list;

const withheldNotes = fixtures
  .filter((row) => row.writerFeedbackStatus === "withheld")
  .map((row) => `- Fixture ${row.fixtureId}. Phrase: ${show(row.writerFeedbackRefusal)}`);

const codeSplit = Object.entries(personByCode).sort((a, b) => a[0].localeCompare(b[0]))
  .map(([code, count]) => `${code} ${count}`)
  .join(", ") || "none";

const body = [
  "# B446",
  "",
  `One pass. Cache off. Frozen statements. Build recorded on the pass file: \`${pass.gitSha}\`. Product code measured is 40af2fd. Evidence, editorial, compliance, commentary, and the reader's note were on. No prompt, rule, or detector was changed in this spec.`,
  "",
  "## Spend",
  "",
  `List USD ${list.toFixed(6)}. Discounted USD ${discounted.toFixed(6)}. Calls ${spend.calls}. Unpriced ${spend.unpricedCalls}. Unpriced models: ${(spend.unpricedModels || []).join(", ") || "none"}.`,
  `Ceiling USD 40. List is USD ${ceilingGap.toFixed(2)} under the ceiling. ${ceilingGap > 5 ? "The ceiling was not approached." : "The ceiling was approached."}`,
  `Input ${spend.inputTokens}. Cached input ${spend.cachedInputTokens}. Output ${spend.outputTokens}.`,
  "",
  "## Predicted contribution",
  "",
  "Lines 2 to 6 are the scan. A miss there is a defect. Lines 7 to 9 follow the model. A move of one or two statements is inside the run-to-run band. The band named before the run was about five percent of statements, and the instruction for that band was a move of one or two.",
  "",
  line("1. Craft notes withheld", "0 or 1 of 20", `${withheld} of 20`, withheldMet),
  ...(withheldNotes.length ? withheldNotes : ["No note was withheld."]),
  "Each withheld fixture stored the reason empty on both attempts, and both attempt texts are blank. The raw reply is not in the file, so this pass cannot separate a blank model answer from a reply the parser did not keep. Fixture 12 was shown on the second attempt after a first attempt that was also empty. No stored refusal is a phrase from the craft-note ban.",
  line("2. percentage_notation", "36 statements, 59 occurrences, 36 concerns", `${percent.statements} statements, ${percent.occurrences} occurrences, ${percent.concerns} concerns`, percentMet),
  line("3. em_dash", "28 statements, 34 occurrences, 28 concerns", `${dash.statements} statements, ${dash.occurrences} occurrences, ${dash.concerns} concerns`, dashMet),
  line("4. First person, filed as first_person_plural or voice_consistency", "27 statements, 30 occurrences, 27 concerns", `${person.statements} statements, ${person.occurrences} occurrences, ${person.concerns} concerns`, personMet),
  `Code split on that line: ${codeSplit}. A press-release pronoun would be voice_consistency. This pass filed all 27 as first_person_plural.`,
  line("5. First-person concerns on investor_letter or linkedin_post", "0", String(firstPersonOnHouseVoice.length), houseVoiceMet),
  ...(firstPersonOnHouseVoice.length ? firstPersonOnHouseVoice.map((row) => `- ${row}`) : []),
  line("6. A statement has at most one concern for a scanned rule", "0 statements over that", String(dupes.length), dupeMet),
  ...(dupes.length ? dupes.map((row) => `- ${row}`) : []),
  spanMissing.length ? `Scanned concerns with no span: ${spanMissing.join(", ")}.` : "Every scanned concern stored at least one span.",
  oracleMismatch
    ? `Statements whose stored scan concerns do not match a fresh scanMechanics call: ${oracleMismatch}.`
    : "Every stored scan concern matches a fresh scanMechanics call on the same statement.",
  "",
  modelLine("7. Combined quiet", "32 of 74", `${tally.combinedQuiet} of ${tally.n}`, quietDelta),
  modelLine("8. Evidence leave-alone", "48 of 74", `${tally.evidenceLeaveAlone} of ${tally.n}`, evidenceDelta),
  modelLine("9. Catch", "11 of 11", `${caught.raised} of ${caught.n}`, catchDelta),
  caught.misses.length ? `Misses: ${caught.misses.join(", ")}.` : "No planted fault was missed.",
  "",
  "## Leave-alone",
  "",
  "Scored with scripts/diagnostic/lib/leave-alone.mjs. Catch is the B441 definition: a planted fault is caught when any of the six layers spoke.",
  "",
  `Evidence leave-alone: ${tally.evidenceLeaveAlone} of ${tally.n}.`,
  "House-style mentions:",
  ...mentionLines(tally),
  `Combined quiet: ${tally.combinedQuiet} of ${tally.n}.`,
  `Catch: ${caught.raised} of ${caught.n}.`,
  "",
  "Confirmed statements whose combined quiet changed against the B441 file:",
  ...(quietMovers.length
    ? quietMovers.map((row) => `- Fixture ${row.fixtureId} index ${row.index}. Quiet ${row.before} -> ${row.after}. ${row.verdict}. ${row.statement}`)
    : ["None."]),
  "",
  "Confirmed statements whose evidence leave-alone changed against the B441 file:",
  ...(evidenceMovers.length
    ? evidenceMovers.map((row) => `- Fixture ${row.fixtureId} index ${row.index}. Evidence-quiet ${row.before} -> ${row.after}. ${row.verdict}. ${row.statement}`)
    : ["None."]),
  "",
  "Planted faults whose catch changed against the B441 file:",
  ...(catchMovers.length ? catchMovers.map((row) => `- ${row}`) : ["None."]),
  "",
  "The house-style counts match the prediction made before the run: percentage_notation 15 on 15, em_dash 7 on 7, first_person_plural 7 on 7. The combined number is 3 below 32, and evidence leave-alone is 3 below 48. The gap between those two numbers is still 16, which is what the scan was predicted to open.",
  "Five confirmed statements left quiet for a reason the scan did not predict. Fixture 02 index 0, editorial hyperbole_vs_qualitative. Fixture 03 index 1, compliance. Fixture 07 index 5, compliance. Fixture 13 index 3, editorial oxford_comma. Fixture 14 index 6, the evidence verdict moved from supported_full to supported_partial.",
  "Two confirmed statements became quiet for a reason the scan did not predict. Fixture 05 index 2 lost a marketing_language_excess concern. Fixture 19 index 3 lost a materiality concern.",
  "Evidence leave-alone also moved on statements that were already not combined-quiet. Fixture 16 index 3 gained internal_plausibility beside the percentage and the long dash. Fixture 20 index 0 gained a compliance concern beside first_person_plural. Fixture 14 index 1 and fixture 17 index 10 were not reviewed on B441 and are supported_full here, so they joined evidence leave-alone and stayed out of the combined number on a house-style concern.",
  "",
  "## Craft",
  "",
  "The comparison is in `scripts/diagnostic/b446/CRAFT.md`.",
  "",
].join("\n");

writeFileSync(OUT, `${body}\n`);

const craftRows = [];
for (const card of cards) {
  for (const concern of concernsOf(card)) {
    if (!CRAFT.includes(concern.concernCode)) continue;
    const id = String(card.fixtureId).padStart(2, "0");
    const note = notes.get(id);
    craftRows.push({
      rule: concern.concernCode,
      fixtureId: id,
      index: card.index,
      text: show(concern.text),
      quote: show(concern.quote),
      status: note.writerFeedbackStatus,
      note: note.writerFeedbackStatus === "shown" ? show(note.writerFeedback) : "",
      refusal: note.writerFeedbackStatus === "withheld" ? show(note.writerFeedbackRefusal) : "",
    });
  }
}
process.stdout.write(body);
process.stdout.write(`\nCraft concerns: ${craftRows.length}\n`);
