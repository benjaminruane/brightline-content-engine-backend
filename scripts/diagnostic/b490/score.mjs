/**
 * B490. Score the pass. No further model call.
 * B486 gates plus the B488 replay gates. Cards match by fixture and index.
 *
 *   node scripts/diagnostic/b490/score.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { endorsementHit } from "../../../lib/qc/endorsement-phrases.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../../../lib/qc/quoted-span.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { plainReaderText } from "../../../lib/qc/reader-plain.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { shownLabel, shownState, shownTier, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { layerSpoken, tallyLeaveAlone } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "pass-1.json");
const PASS2 = path.join(__dirname, "pass-2.json");
const PRIOR = path.join(__dirname, "../b486/pass-1.json");
const RESULT = path.join(__dirname, "RESULT.md");
const ACCURACY = path.join(__dirname, "../accuracy");
const FRONT_HEADER = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js");
const FRONT_REASON = path.resolve(__dirname, "../../../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js");
const FAULTY = new Set(["conflicting", "no_support"]);
const RAISED = new Set(["beyond", "conflicts", "not_in_source", "partial"]);
const LOUD = [["08", 0], ["08", 2], ["18", 0], ["18", 2], ["23", 0], ["25", 0], ["25", 2], ["15", 2]];
const LIGHT = [["04", 0], ["04", 1], ["15", 0], ["17", 0]];
const NAMED = [...LOUD, ...LIGHT, ["18", 4], ["25", 4]];
const INTERNAL = /\brungs?\b|\bmodality\b/i;

function pad(id) {
  return String(id).padStart(2, "0");
}

function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
}

function cardOf(cards, id, index) {
  const want = Number(index);
  return cards.find((card) => pad(card.fixtureId) === pad(id) && Number(card.index) === want);
}

function loadCards(file) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  if (!cards.length) throw new Error(`b490 score: no cards in ${file}`);
  return cards;
}

function corpusOnly(cards) {
  return cards.filter((card) => Number(pad(card.fixtureId)) <= 20);
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

function raised(card) {
  return Object.values(layerSpoken(card)).some((layer) => layer.raised);
}

function readingSourceBody(sources) {
  const list = Array.isArray(sources) ? sources : null;
  if (!list || list.length === 0) throw new Error("b490 score: source text is missing");
  const texts = list.map((source, index) => {
    if (typeof source === "string") return source;
    if (!source || typeof source.text !== "string") throw new Error(`b490 score: source ${index} has no text`);
    return source.text;
  });
  if (texts.every((text) => text.trim() === "")) throw new Error("b490 score: source text is missing");
  return texts.join("\n");
}

function quietOnCorrect(card, label) {
  if (FAULTY.has(label) || label === "partially_confirmed") return false;
  return card.displayVerdict === "supported_full"
    && (card.sentenceState === "nothing_raised" || card.sentenceState === "nothing_to_raise");
}

function introducedDash(text, corpus) {
  let left = String(text || "");
  if (!/[\u2014\u2013]/.test(left)) return false;
  for (const piece of corpus) {
    if (typeof piece === "string" && piece && left.includes(piece)) left = left.split(piece).join("");
  }
  return /[\u2014\u2013]/.test(left);
}

function countIn(line, pattern) {
  const match = String(line || "").match(pattern);
  return match ? Number(match[1]) : 0;
}

function headerMismatches(cards, attentionHeader) {
  const by = new Map();
  for (const card of cards) {
    const id = pad(card.fixtureId);
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(card);
  }
  const bad = [];
  for (const [id, rows] of by) {
    const line = attentionHeader(rows) || "";
    let conflicts = 0;
    let looks = 0;
    let light = 0;
    let facts = 0;
    let across = 0;
    let absent = 0;
    for (const row of rows) {
      const label = shownLabel(row);
      if (label === "Conflicts with the source") conflicts += 1;
      if (label === "Needs a look") looks += 1;
      if (label === "Goes beyond the source" || label === "Partly in the source") light += 1;
      if (label !== "Not in the source") continue;
      const list = Array.isArray(row.facts) ? row.facts : (Array.isArray(row.readingFacts) ? row.readingFacts : []);
      const missing = list.filter((fact) => fact?.status === "not_found").length;
      if (missing > 0) {
        facts += missing;
        across += 1;
      } else absent += 1;
    }
    const problems = [];
    if (countIn(line, /(\d+) statements? conflict/) !== conflicts) problems.push("conflict");
    if (countIn(line, /(\d+) statements? needs? a look/) !== looks) problems.push("look");
    if (countIn(line, /(\d+) worth a glance/) !== light) problems.push("glance");
    if (countIn(line, /(\d+) facts? (?:is|are) not in the source/) !== facts) problems.push("facts");
    if (countIn(line, /(\d+) statements? (?:is|are) not in the source/) !== absent) problems.push("absent");
    if (line.includes("across") && countIn(line, /across (\d+) of your/) !== across) problems.push("across");
    if (line.includes("not in the source") && absent + facts === 0) problems.push("phantom");
    if (problems.length) bad.push(`${id} ${problems.join(",")}`);
  }
  return bad;
}

function paint(card) {
  const state = shownState(card);
  return {
    label: shownLabel(card) || "",
    tier: shownTier(state) || "",
    reason: readerEvidenceSentence(card) || "",
    note: card.readingNote?.text || "",
    completion: card.readingNote?.completion || "",
  };
}

const cards = loadCards(PASS);
const priorCards = loadCards(PRIOR);
const priorByKey = new Map(priorCards.map((card) => [keyOf(card), card]));
const { attentionHeader } = await import(pathToFileURL(FRONT_HEADER).href);
const screen = await import(pathToFileURL(FRONT_REASON).href);

const corpusCards = corpusOnly(cards);
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
const judged = corpusCards.map((card) => ({ card, after: afterOf(card) }));
const afterByJoin = new Map(judged.map((row) => [joinKey(row.card.fixtureId, row.card.statement, row.card.occurrence), row]));

let faultyN = 0;
let faultyRaised = 0;
const faultyKeys = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (!FAULTY.has(row.label)) continue;
  faultyN += 1;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  const card = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (card && raised(card)) faultyRaised += 1;
  if (card) faultyKeys.push(keyOf(card));
}
let groupRaised = 0;
const groupKeys = [];
for (const fault of design.faults) {
  const mappedRow = mapped.mapping.find((item) => item.id === fault.id);
  const key = mappedRow?.keys?.[0] || null;
  const judgedRow = key ? afterByJoin.get(key) : null;
  const afterCard = judgedRow ? { ...judgedRow.card, displayVerdict: judgedRow.after.display } : null;
  if (afterCard && raised(afterCard)) groupRaised += 1;
  if (afterCard) groupKeys.push(keyOf(afterCard));
}

const fixtures = await loadAllFixtures();
const sourcesByFixture = new Map();
for (const fixture of fixtures) {
  const id = padFixtureId(fixture.data.id);
  if (Number(id) > 20) continue;
  sourcesByFixture.set(id, await loadPipelineSources(fixture.data.sources || []));
}
const confirmedAfter = [];
for (const row of labels) {
  if (row.kind && row.kind !== "statement") continue;
  if (row.label !== "confirmed") continue;
  const judgedRow = afterByJoin.get(joinKey(row.fixtureId, row.statementText, row.occurrence));
  if (!judgedRow) continue;
  const sources = sourcesByFixture.get(pad(judgedRow.card.fixtureId));
  if (!sources) throw new Error(`b490 score: no sources for ${judgedRow.card.fixtureId}`);
  const facts = buildFacts({
    statement: judgedRow.card.statement,
    draft: judgedRow.card.statement,
    sourceText: readingSourceBody(sources),
  });
  const verdict = verdictOf(judgedRow.card, facts, judgedRow.after.display);
  confirmedAfter.push({
    ...judgedRow.card,
    displayVerdict: judgedRow.after.display,
    sentenceState: verdict.state,
    tier: verdict.tier,
    statementVerdict: verdict,
  });
}
const leave = tallyLeaveAlone(confirmedAfter);

let quietCorrect = 0;
for (const card of corpusCards) {
  const label = labelByJoin.get(joinKey(card.fixtureId, card.statement, card.occurrence));
  if (quietOnCorrect(card, label)) quietCorrect += 1;
}

let endorsement = 0;
let dashes = 0;
let internal = 0;
for (const card of corpusCards) {
  const reason = readerEvidenceSentence(card) || "";
  const corpus = sourceCorpus(card);
  const examined = corpus.length ? maskVerbatimQuotes(reason, corpus) : reason;
  if (endorsementHit(examined)) endorsement += 1;
  const pieces = [card.statement, ...excerptsOf(card), card.sourceQuote];
  const note = card.readingNote && (card.readingNote.bucket === "beyond" || card.readingNote.bucket === "conflicts")
    ? plainReaderText(card.readingNote.text || "")
    : "";
  for (const text of [shownLabel(card) || "", shownTier(shownState(card)) || "", reason, note]) {
    if (introducedDash(text, pieces)) dashes += 1;
    if (INTERNAL.test(text)) internal += 1;
  }
}

let parity = 0;
for (const card of cards) {
  if ((readerEvidenceSentence(card) || "") !== (screen.readerEvidenceSentence(card) || "")) parity += 1;
}

const empty = [];
const unrecorded = [];
for (const card of cards) {
  const state = shownState(card);
  const reason = readerEvidenceSentence(card) || "";
  if (RAISED.has(state) && !reason) empty.push(keyOf(card));
  if (reason.includes("Which part was not recorded")) unrecorded.push(keyOf(card));
}
const headers = headerMismatches(cards, attentionHeader);

const lines = [];
lines.push("gates");
lines.push(`catch: ${faultyRaised}/${faultyN} (B464 13/13, B488 13/13)`);
lines.push(`group A: ${groupRaised}/${design.faults.length} (B464 11/11, B488 11/11)`);
lines.push(`leave-alone: ${leave.evidenceLeaveAlone}/${leave.n} (B464 48/74, B488 53/74)`);
lines.push(`combined quiet: ${leave.combinedQuiet}/${leave.n} (B464 30/74, B488 34/74)`);
lines.push(`quiet on correct: ${quietCorrect} (B464 148, B488 182)`);
lines.push(`endorsement: ${endorsement} (B464 0, B488 0)`);
lines.push(`dashes: ${dashes} (B464 0, B488 0)`);
lines.push(`internal words: ${internal} (B464 not scored, B488 0)`);
lines.push(`parity: ${parity} (B464 not scored, B488 0)`);
lines.push(`raised cards with an empty reason: ${empty.length} (B488 0)`);
if (empty.length) for (const key of empty) lines.push(key);
lines.push(`cards showing "Which part was not recorded": ${unrecorded.length} (B488 0)`);
if (unrecorded.length) for (const key of unrecorded) lines.push(key);
lines.push(`headers not matching the shown labels: ${headers.length} (B488 0)`);
if (headers.length) for (const row of headers) lines.push(row);
lines.push("");
lines.push("fixture 18 revision sentences");
for (const index of [3, 4, 5]) {
  const card = cardOf(cards, "18", index);
  lines.push(`18:${index}: ${card ? (readerEvidenceSentence(card) || "") : "missing"}`);
}
lines.push("");
lines.push("named cards");
const expectedLoud = new Set(LOUD.map(([id, index]) => `${id}:${index}`));
const expectedLight = new Set(LIGHT.map(([id, index]) => `${id}:${index}`));
const differed = [];
for (const [id, index] of NAMED) {
  const card = cardOf(cards, id, index);
  const key = `${id}:${index}`;
  if (!card) {
    lines.push(`${key} missing`);
    continue;
  }
  const view = paint(card);
  lines.push(key);
  lines.push(`label: ${view.label}`);
  lines.push(`tier: ${view.tier}`);
  lines.push(`reason: ${view.reason}`);
  lines.push(`reading note: ${view.note}`);
  lines.push(`status field: ${view.completion}`);
  const wantLoud = expectedLoud.has(key);
  const wantLight = expectedLight.has(key);
  if (wantLoud && (view.label !== "Conflicts with the source" || view.tier !== "demands")) differed.push(key);
  if (wantLight && (view.label !== "Goes beyond the source" || view.tier !== "light")) differed.push(key);
}
lines.push("");
lines.push(`status cards that landed differently: ${differed.length}`);
if (!differed.length) lines.push("none");
for (const key of differed) lines.push(key);
lines.push("");
lines.push("label changes from the B488 replay of B486");
const changes = [];
for (const card of cards) {
  const old = priorByKey.get(keyOf(card));
  if (!old) continue;
  const before = shownLabel(old) || "";
  const after = shownLabel(card) || "";
  if (before !== after) changes.push(`${keyOf(card)}\t${before}\t${after}\t${card.statement || ""}`);
}
lines.push(String(changes.length));
if (!changes.length) lines.push("none");
for (const row of changes) lines.push(row);
lines.push("");

function quietTier(card) {
  const tier = shownTier(shownState(card)) || "";
  return tier === "quiet";
}

let second = [];
try {
  second = loadCards(PASS2);
} catch (err) {
  if (!err || err.code !== "ENOENT") {
    if (!(err instanceof Error) || !/no cards|ENOENT/.test(err.message)) throw err;
  }
  second = [];
}

if (second.length) {
  const secondByKey = new Map(second.map((card) => [keyOf(card), card]));
  const labelDiff = [];
  const tierDiff = [];
  const flip = [];
  const byFixture = new Map();
  for (const card of cards) {
    const other = secondByKey.get(keyOf(card));
    if (!other) continue;
    const left = paint(card);
    const right = paint(other);
    const id = pad(card.fixtureId);
    if (!byFixture.has(id)) byFixture.set(id, 0);
    if (left.label !== right.label || left.tier !== right.tier || quietTier(card) !== quietTier(other)) byFixture.set(id, byFixture.get(id) + 1);
    if (left.label !== right.label) labelDiff.push(`${keyOf(card)}\t${left.label}\t${right.label}`);
    if (left.tier !== right.tier) tierDiff.push(`${keyOf(card)}\t${left.tier}\t${right.tier}`);
    if (quietTier(card) !== quietTier(other)) {
      flip.push(`${keyOf(card)}\t${quietTier(card) ? "quiet" : "raised"}\t${quietTier(other) ? "quiet" : "raised"}`);
    }
  }
  function wentQuiet(list, pool) {
    const out = [];
    for (const key of list) {
      const first = cardOf(cards, ...key.split(":"));
      const next = cardOf(pool, ...key.split(":"));
      if (first && !raised(first)) out.push(`${key} pass 1`);
      if (next && !raised(next)) out.push(`${key} pass 2`);
    }
    return out;
  }
  lines.push("stability");
  lines.push(`label differs: ${labelDiff.length}`);
  if (!labelDiff.length) lines.push("none");
  for (const row of labelDiff) lines.push(row);
  lines.push(`tier differs: ${tierDiff.length}`);
  if (!tierDiff.length) lines.push("none");
  for (const row of tierDiff) lines.push(row);
  lines.push(`quiet and raised flips: ${flip.length}`);
  if (!flip.length) lines.push("none");
  for (const row of flip) lines.push(row);
  lines.push("per fixture");
  for (const [id, count] of [...byFixture.entries()].sort()) lines.push(`${id}: ${count}`);
  const faultyQuiet = wentQuiet(faultyKeys, second);
  const groupQuiet = wentQuiet(groupKeys, second);
  lines.push(`labelled faulty went quiet: ${faultyQuiet.length}`);
  if (!faultyQuiet.length) lines.push("none");
  for (const row of faultyQuiet) lines.push(row);
  lines.push(`group A went quiet: ${groupQuiet.length}`);
  if (!groupQuiet.length) lines.push("none");
  for (const row of groupQuiet) lines.push(row);
  lines.push("status cards");
  for (const [id, index] of [...LOUD, ...LIGHT]) {
    const first = cardOf(cards, id, index);
    const next = cardOf(second, id, index);
    const a = first ? paint(first) : null;
    const b = next ? paint(next) : null;
    lines.push(`${id}:${index} pass 1 ${a ? `${a.label} ${a.tier}` : "missing"} pass 2 ${b ? `${b.label} ${b.tier}` : "missing"}`);
  }
  lines.push("differing cards");
  const seen = new Set();
  for (const card of cards) {
    const other = secondByKey.get(keyOf(card));
    if (!other) continue;
    const left = paint(card);
    const right = paint(other);
    if (left.label === right.label && left.tier === right.tier && left.reason === right.reason) continue;
    seen.add(keyOf(card));
    lines.push(keyOf(card));
    lines.push(`statement: ${card.statement || ""}`);
    lines.push(`pass 1 reason: ${left.reason}`);
    lines.push(`pass 2 reason: ${right.reason}`);
  }
  if (!seen.size) lines.push("none");
  lines.push("");
}

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(lines.filter((line) => (
  line.startsWith("catch") || line.startsWith("group") || line.startsWith("leave")
  || line.startsWith("combined") || line.startsWith("quiet on") || line.startsWith("endorsement")
  || line.startsWith("dashes") || line.startsWith("internal") || line.startsWith("parity")
  || line.startsWith("raised cards") || line.startsWith("cards showing") || line.startsWith("headers")
  || line.startsWith("status cards that") || line.startsWith("label differs") || line.startsWith("tier differs")
  || line.startsWith("quiet and raised") || line.startsWith("labelled faulty") || line.startsWith("group A went")
)).join("\n"));
if (faultyRaised < 13 || groupRaised < 11) {
  console.error(`STOP catch ${faultyRaised}/${faultyN} group A ${groupRaised}/${design.faults.length}`);
  process.exitCode = 2;
}
