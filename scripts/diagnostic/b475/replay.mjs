/**
 * B475. Replay the stored B464 pass after the assembly move. No model call.
 *
 *   node scripts/diagnostic/b475/replay.mjs
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as assemble from "../../../lib/qc/assemble-card.mjs";
import * as v4 from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import * as v3 from "../../../lib/qc/pipeline-v3/stage2-match-sources.mjs";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownState, shownTier } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { confirmingPassageVerdict } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { readerEvidenceSentence } from "../../../lib/qc/reader-reason.mjs";
import { layerSpoken, tallyLeaveAlone, tallyLeaveAloneWithLabel } from "../lib/leave-alone.mjs";
import { loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { flattenStatements, joinKey, mapGroupA, padFixtureId } from "../accuracy/lib.mjs";
import { normalizeLabelsDoc } from "../accuracy/load-labels.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");
const PASS = path.join(__dirname, "../b464/pass-1.json");
const ACCURACY = path.join(__dirname, "../accuracy");
const RESULT = path.join(__dirname, "RESULT.md");
const HEALTH = "https://brightline-content-engine-backend.vercel.app/api/health";

const PROJECTION_BEFORE = "e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e";
const ASSEMBLE_FN_BEFORE = "dc48e4734e12b96f0af1a0aa6924d6d2ec212bab2aecf344ba1c26a75e7b3e0a";
const LOGIC_BEFORE = "e2542c930202f3d96ef97da592b9b994962206e66c247c9fad123e3338fd8151";

const FAULTY = new Set(["conflicting", "no_support"]);
const SIX = {
  "05:0": "Conflicts with the source",
  "19:2": "Conflicts with the source",
  "18:8": "Conflicts with the source",
  "11:9": "Needs a look",
  "15:12": "Needs a look",
  "04:1": "Conflicts with the source",
};

function pad(id) {
  return String(id).padStart(2, "0");
}
function keyOf(card) {
  return `${pad(card.fixtureId)}:${card.index}`;
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
function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}
function logicBody(src) {
  const lines = src.split(/(?<=\n)/);
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("import ")) {
      while (i < lines.length && !lines[i].includes(";")) i += 1;
      i += 1;
      continue;
    }
    kept.push(lines[i]);
    i += 1;
  }
  return kept.join("");
}
function exportNames(mod) {
  return Object.keys(mod).filter((name) => name !== "default").sort();
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = pass.cards;
const problems = [];

const rows = cards.map((card) => ({
  key: keyOf(card),
  displayVerdict: card.displayVerdict ?? null,
  sentenceState: card.sentenceState ?? null,
  sentenceLabel: card.sentenceLabel ?? null,
  tier: card.tier ?? null,
  shownState: shownState(card),
  shownLabel: shownLabel(card),
  shownTier: shownTier(shownState(card)),
  reason: readerEvidenceSentence(card),
}));
rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
const projection = sha256(JSON.stringify(rows));
const assembleFn = sha256(String(assemble.assembleCard));
const logic = sha256(logicBody(readFileSync(path.join(ROOT, "lib/qc/assemble-card.mjs"), "utf8")));
if (projection !== PROJECTION_BEFORE) problems.push("projection hash differs");
if (assembleFn !== ASSEMBLE_FN_BEFORE) problems.push("assembleCard source differs");
if (logic !== LOGIC_BEFORE) problems.push("assembly logic body differs");

let oldPath = "";
try {
  oldPath = execSync(
    "rg -l --glob '!node_modules/**' --glob '!.git/**' --glob '!scripts/diagnostic/b475/**' stage7-assemble-card",
    { cwd: ROOT, encoding: "utf8" }
  ).trim();
} catch (err) {
  oldPath = err.status === 1 ? "" : `search failed: ${err.message}`;
}
if (oldPath) problems.push(`old path still referenced: ${oldPath}`);

const storedSame = rows.filter((row) => {
  const card = cardAt(cards, row.key);
  return card.displayVerdict === row.displayVerdict
    && card.sentenceState === row.sentenceState
    && card.sentenceLabel === row.sentenceLabel
    && card.tier === row.tier;
}).length;

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
const afterLeave = tallyLeaveAlone(confirmed);
const afterLeaveLabel = tallyLeaveAloneWithLabel(confirmed);

if (faultyRaised !== 13 || faultyN !== 13) problems.push(`catch ${faultyRaised} of ${faultyN}`);
if (groupRaised !== 11) problems.push(`group A ${groupRaised}`);
if (afterLeave.evidenceLeaveAlone !== 48 || afterLeave.combinedQuiet !== 30) {
  problems.push(`leave-alone ${afterLeave.evidenceLeaveAlone} ${afterLeave.combinedQuiet}`);
}
if (afterLeaveLabel.evidenceLeaveAlone !== 48 || afterLeaveLabel.combinedQuiet !== 30) {
  problems.push(`leave-alone label ${afterLeaveLabel.evidenceLeaveAlone} ${afterLeaveLabel.combinedQuiet}`);
}
if (storedSame !== cards.length) problems.push(`stored fields ${storedSame} of ${cards.length}`);
for (const [key, label] of Object.entries(SIX)) {
  const got = shownLabel(cardAt(cards, key));
  if (got !== label) problems.push(`${key} ${got}`);
}

const fromV4 = exportNames(v4);
const fromV3 = exportNames(v3);
const shared = fromV4.filter((name) => fromV3.includes(name));
const v3Fn = String(v3.matchAllSources);
const v4Fn = String(v4.matchAllSources);

let health = { reached: false, error: "not read" };
try {
  const res = await fetch(HEALTH, { signal: AbortSignal.timeout(20000) });
  const body = await res.json();
  health = {
    reached: res.ok,
    status: res.status,
    serverTs: typeof body?.ts === "string" ? body.ts : "",
    pipelineRoute: body?.environment?.pipelineRoute ?? "",
    readAt: new Date().toISOString(),
  };
  if (!res.ok) health.error = `HTTP ${res.status}`;
} catch (err) {
  health = { reached: false, error: err instanceof Error ? err.message : String(err), readAt: new Date().toISOString() };
}

const lines = [];
lines.push("# B475. The shared card assembly leaves the version folder");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0. The assembly was not run again, because that call can ask a model to judge a duplicate. The comparison is the card reading taken before the move against the same reading after it, plus the assembly function source.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push("## The move");
lines.push("");
lines.push("`lib/qc/pipeline-v3/stage7-assemble-card.mjs` is now `lib/qc/assemble-card.mjs`. Export names are unchanged: assembleCard, factualBadgeForStatement, statementIsFactualResidue, isRecoveryMayNotGreenEnabled, isUnbadgedResidueEnabled, RECOVERY_MAY_NOT_GREEN_FLAG, UNBADGED_RESIDUE_FLAG.");
lines.push("");
lines.push("The relative imports inside the file were retargeted because the file moved up one directory. `../../observability.js` is now `../observability.js`. The other imports, which pointed at `lib/qc/`, now point at the same directory. No other line changed.");
lines.push("");
lines.push(`Assembly logic body, imports removed, sha256 before and after: ${LOGIC_BEFORE}. Match: ${logic === LOGIC_BEFORE ? "yes" : "no"}.`);
lines.push("");
lines.push(`assembleCard function source sha256 before and after: ${ASSEMBLE_FN_BEFORE}. Match: ${assembleFn === ASSEMBLE_FN_BEFORE ? "yes" : "no"}.`);
lines.push("");
lines.push("## Cards");
lines.push("");
lines.push(`Cards read: ${cards.length}.`);
lines.push("");
lines.push(`The reading of displayVerdict, sentenceState, sentenceLabel, tier, the shown state, the shown label, the shown tier, and the reason, sorted by card, sha256 before the move: ${PROJECTION_BEFORE}.`);
lines.push("");
lines.push(`The same reading after the move: ${projection}.`);
lines.push("");
lines.push(`Byte-identical: ${projection === PROJECTION_BEFORE ? "yes" : "no"}.`);
lines.push("");
lines.push(`Stored displayVerdict, sentenceState, sentenceLabel, and tier still equal the pass on ${storedSame} of ${cards.length}.`);
lines.push("");
lines.push(`Catch: ${faultyRaised} of ${faultyN}. Group A: ${groupRaised} of ${design.faults.length}.`);
lines.push("");
lines.push(`Evidence leave-alone ${afterLeave.evidenceLeaveAlone} of ${afterLeave.n}. Combined quiet ${afterLeave.combinedQuiet} of ${afterLeave.n}.`);
lines.push("");
lines.push(`With the sentence label: evidence leave-alone ${afterLeaveLabel.evidenceLeaveAlone} of ${afterLeaveLabel.n}. Combined quiet ${afterLeaveLabel.combinedQuiet} of ${afterLeaveLabel.n}.`);
lines.push("");
lines.push("The six labels raised by B469, B470, and B473:");
lines.push("");
for (const [key, label] of Object.entries(SIX)) {
  lines.push(`- ${key}: ${shownLabel(cardAt(cards, key))}. Required: ${label}.`);
}
lines.push("");
lines.push(`Outside this report, a search for the old filename finds: ${oldPath ? oldPath : "nothing"}. This report names the old path because that is the path that was moved.`);
lines.push("");
lines.push("## The two matcher files");
lines.push("");
lines.push("Neither file was edited. Neither imports the other. The comment in `lib/qc/pipeline-v4/stage2-match-sources.mjs` still says to keep the file in sync with `lib/qc/pipeline-v3/stage2-match-sources.mjs` by hand.");
lines.push("");
lines.push("| File | Exports |");
lines.push("| --- | --- |");
lines.push(`| lib/qc/pipeline-v4/stage2-match-sources.mjs | ${fromV4.join(", ")} |`);
lines.push(`| lib/qc/pipeline-v3/stage2-match-sources.mjs | ${fromV3.join(", ")} |`);
lines.push("");
lines.push(`Shared names: ${shared.join(", ") || "none"}.`);
lines.push("");
lines.push("The shared export has already drifted. v3 `matchAllSources(statement, sources, options)` takes one statement string and returns an array of per-source results. v4 `matchAllSources({ statements, sources, traceId, stage2SpanEnabled })` takes many statements and returns `{ matches }`. The function source is not the same text: v3 is " + v3Fn.length + " characters and v4 is " + v4Fn.length + " characters. v4 reads `prompts/stage2_v4.md`. v3 keeps its prompt in the file. The gap was left open.");
lines.push("");
lines.push("`tests/b475-matcher-export-parity.test.mjs` fails if either file's export names change, or if the shared set changes.");
lines.push("");
lines.push("## The deployed route");
lines.push("");
if (health.reached && health.pipelineRoute) {
  lines.push(`GET ${HEALTH} returned HTTP ${health.status}. environment.pipelineRoute is ${health.pipelineRoute}. The response ts is ${health.serverTs}. This replay read it at ${health.readAt}.`);
} else {
  lines.push(`GET ${HEALTH} could not be read. ${health.error || "no body"}. Read attempted at ${health.readAt || "unknown"}. The deployed route is still an open question.`);
}
lines.push("");
lines.push("The browser was not opened. There is no screen change.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(`projection ${projection === PROJECTION_BEFORE ? "match" : "DIFF"} catch ${faultyRaised}/${faultyN} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet}`);
console.log(`health ${health.reached ? health.pipelineRoute : "unreachable"} ${health.serverTs || ""}`);
if (problems.length) process.exit(1);
