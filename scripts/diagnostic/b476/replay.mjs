/**
 * B476. Replay the stored B464 pass after the legacy route is removed. No model call.
 *
 *   node scripts/diagnostic/b476/replay.mjs
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { readingSourceText } from "../../../lib/qc/reading-review.mjs";
import { shownLabel, shownState, shownTier, shownVerdict } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
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
const B475_HASH = "e494cda55a7b26a512ea54d925220a849c8eb151513b1a8f774e866041930e6e";
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
function search(args) {
  try {
    return execSync(args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (err) {
    if (err.status === 1) return "";
    return `search failed: ${err.message}`;
  }
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
if (projection !== B475_HASH) problems.push("projection hash differs from B475");

const folderHits = search("rg -n pipeline-v3 lib api");
if (folderHits) problems.push("lib or api still names the older folder");

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
const storedSame = rows.filter((row) => {
  const card = cardAt(cards, row.key);
  return card.displayVerdict === row.displayVerdict
    && card.sentenceState === row.sentenceState
    && card.sentenceLabel === row.sentenceLabel
    && card.tier === row.tier;
}).length;

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

const diff = search("git diff HEAD --numstat");
let added = 0;
let deleted = 0;
for (const line of diff.split("\n")) {
  if (!line.trim()) continue;
  const [a, d] = line.split("\t");
  added += Number(a) || 0;
  deleted += Number(d) || 0;
}

let health = { reached: false, error: "not read" };
try {
  const res = await fetch(HEALTH, { signal: AbortSignal.timeout(20000) });
  const body = await res.json();
  health = {
    reached: res.ok,
    status: res.status,
    serverTs: typeof body?.ts === "string" ? body.ts : "",
    pipelineRoute: body?.environment?.pipelineRoute ?? "",
    build: body?.build?.commit ?? "",
    readAt: new Date().toISOString(),
  };
  if (!res.ok) health.error = `HTTP ${res.status}`;
} catch (err) {
  health = { reached: false, error: err instanceof Error ? err.message : String(err), readAt: new Date().toISOString() };
}
if (!health.reached || health.pipelineRoute !== "v4") problems.push("health did not report v4");

const lines = [];
lines.push("# B476. The legacy route is retired");
lines.push("");
lines.push("Measured on scripts/diagnostic/b464/pass-1.json. No model call. USD 0.");
lines.push("");
lines.push(`Problems: ${problems.length ? problems.join("; ") : "none"}.`);
lines.push("");
lines.push("## The handler");
lines.push("");
lines.push("Before, `api/analyse-statements.js` chose a route:");
lines.push("");
lines.push("```");
lines.push("const useV4 =");
lines.push('  process.env.QC_PIPELINE_V4 === "1" || (body?.options && body.options.pipelineRoute === "v4");');
lines.push("const pipelineResult = useV4");
lines.push("  ? await runPipelineV4(draftText, v3Sources, pipelineOptions)");
lines.push("  : await runPipelineV3(draftText, v3Sources, pipelineOptions);");
lines.push("```");
lines.push("");
lines.push("After, the handler calls one pipeline. There is no flag and no branch:");
lines.push("");
lines.push("```");
lines.push("const pipelineResult = await runPipelineV4(draftText, v3Sources, pipelineOptions);");
lines.push("```");
lines.push("");
lines.push("Preflight, which used to run only on the v4 branch, now runs on the only path. The response stamps pipelineVersion v4.");
lines.push("");
lines.push("## Search");
lines.push("");
lines.push("Search of lib and api for pipeline-v3:");
lines.push("");
lines.push(folderHits ? folderHits : "nothing.");
lines.push("");
lines.push("## Files deleted");
lines.push("");
lines.push("Consumer counts are imports found before deletion. A file inside the folder importing another is an inside consumer.");
lines.push("");
lines.push("| File | Lines | Consumers outside the folder | Consumers inside the folder |");
lines.push("| --- | --- | --- | --- |");
lines.push("| lib/qc/pipeline-v3/qc-pipeline-v3.mjs | 164 | 1, api/analyse-statements.js | 0 |");
lines.push("| lib/qc/pipeline-v3/stage1-extract-statements.mjs | 169 | 0 | 1, the entry file |");
lines.push("| lib/qc/pipeline-v3/stage2-match-sources.mjs | 359 | 1, tests/b475-matcher-export-parity.test.mjs, deleted with it. scripts/diagnostic/b475/replay.mjs also imports it and is not in the suite. | 1, the entry file |");
lines.push("| lib/qc/pipeline-v3/stage3-aggregate-verdict.mjs | 48 | 0 | 1, the entry file |");
lines.push("| lib/qc/pipeline-v3/stage4-select-excerpts.mjs | 84 | 0 | 1, the entry file |");
lines.push("| lib/qc/pipeline-v3/stage5-generate-commentary.mjs | 175 | 0 | 1, the entry file |");
lines.push("");
lines.push("The comment in lib/qc/pipeline-v4/stage2-match-sources.mjs that said to keep the two matchers in sync by hand is removed with the file it named.");
lines.push("");
lines.push("tests/b475-matcher-export-parity.test.mjs is deleted with the matcher whose export names it pinned.");
lines.push("");
lines.push("## The mini-eval");
lines.push("");
lines.push("tests/r1_2_mini_eval/stage2_eval_mirror.mjs keeps its pasted prompt. It now says, in one line, that the prompt is a frozen historical prompt dated 2026-05-03. That is the date of the commit that put this text in the file. It was not pointed at lib/qc/pipeline-v4/prompts/stage2_v4.md. The live prompt is a later contract, with period assessment and a different modality rule. The scored results in this folder were produced against the pasted text. Reading the live file would make a later eval measure a different prompt from the one those results record. The folder is not part of npm test or verify:ship.");
lines.push("");
lines.push("## Historical scripts");
lines.push("");
lines.push("scripts/diagnostic is not executed by npm test or by verify:ship. vitest includes tests/**/*.test.mjs only. Those scripts were left as they are, including scripts/diagnostic/b475/replay.mjs, which still imports the deleted matcher. Running that replay will fail. It was not updated.");
lines.push("");
lines.push("## Cards");
lines.push("");
lines.push(`Cards read: ${cards.length}.`);
lines.push("");
lines.push(`B475 recorded sha256 ${B475_HASH}.`);
lines.push("");
lines.push(`This reading: ${projection}.`);
lines.push("");
lines.push(`Same hash: ${projection === B475_HASH ? "yes" : "no"}.`);
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
lines.push("## Tests");
lines.push("");
lines.push("Deleted: tests/b475-matcher-export-parity.test.mjs. It imported the matcher this spec deletes. Its assertion was the export list of that file.");
lines.push("");
lines.push("Changed: tests/environment-summary.test.mjs, the test that asserted an unset QC_PIPELINE_V4 selects v3. That assertion described the selector, not a card. The selector is removed, so an unset variable is not a route, and the summary's only route is v4. The summary is still not ok when the editorial switch is off, which is what the rest of that test checks. No card test changed an assertion.");
lines.push("");
lines.push("## The deployed service");
lines.push("");
if (health.reached && health.pipelineRoute) {
  lines.push(`GET ${HEALTH} returned HTTP ${health.status}. environment.pipelineRoute is ${health.pipelineRoute}. The response ts is ${health.serverTs}. This replay read it at ${health.readAt}. The build commit on the response is ${health.build || "absent"}.`);
} else {
  lines.push(`GET ${HEALTH} could not be read. ${health.error || "no body"}. Read attempted at ${health.readAt || "unknown"}.`);
}
lines.push("");
lines.push("## Size");
lines.push("");
lines.push(`git diff HEAD --numstat: ${deleted} lines deleted, ${added} lines added.`);
lines.push("");
lines.push("The browser was not opened. There is no screen change.");
lines.push("");

writeFileSync(RESULT, `${lines.join("\n")}\n`);
console.log(problems.length ? problems.join("\n") : "none");
console.log(`hash ${projection === B475_HASH ? "match" : "DIFF"} catch ${faultyRaised}/${faultyN} leave ${afterLeave.evidenceLeaveAlone}/${afterLeave.combinedQuiet}`);
console.log(`deleted ${deleted} added ${added} health ${health.reached ? health.pipelineRoute : "unreachable"}`);
if (problems.length) process.exit(1);
