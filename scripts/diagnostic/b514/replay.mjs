/**
 * B514 Part F. Replay A and D on the stored B503 cards and the B512 cards.
 * No model call.
 *
 *   node scripts/diagnostic/b514/replay.mjs
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { shownTrace } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { joinKey, padFixtureId } from "../accuracy/lib.mjs";
import { loadGateContext } from "../b496/replay.mjs";
import { SOURCES_DIR } from "../lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b503/pass-1.json");
const STORED = path.join(__dirname, "../b512/run.json");
const DRAFTING = path.join(__dirname, "../drafting/fixtures");
const OUT = path.join(__dirname, "replay.json");
const RESULT = path.join(__dirname, "RESULT.md");
const QUIET = new Set(["nothing_raised", "nothing_to_raise", ""]);
const RED = new Set(["conflicts", "not_in_source"]);
const FAULTY = new Set(["conflicting", "no_support"]);

function raisedState(state) {
  return !QUIET.has(state);
}

function sourceTextOf(sources) {
  return (sources || []).map((source) => source.text).join("\n\n");
}

function resolveDraftingFile(file) {
  const base = path.basename(file);
  const draftingPath = path.join(SOURCES_DIR, "drafting", base);
  const legacyPath = path.join(SOURCES_DIR, base);
  const filePath = existsSync(draftingPath) ? draftingPath : legacyPath;
  if (!existsSync(filePath)) throw new Error(`source file is missing: ${base}`);
  return { text: readFileSync(filePath, "utf8"), filePath };
}

function fixtureFiles() {
  const names = readdirSync(DRAFTING).filter((name) => name.endsWith(".json")).sort();
  const rows = [];
  for (const name of names) {
    const fixture = JSON.parse(readFileSync(path.join(DRAFTING, name), "utf8"));
    const files = Array.isArray(fixture.sources) ? fixture.sources : [];
    for (const source of files) {
      try {
        const resolved = resolveDraftingFile(source.file);
        rows.push({ fixture: name, file: source.file, role: source.role, bytes: resolved.text.length, ok: resolved.text.length > 0 });
        if (!resolved.text.length) rows[rows.length - 1].error = "empty";
      } catch (error) {
        rows.push({ fixture: name, file: source.file, role: source.role, ok: false, error: error.message });
      }
    }
  }
  return rows;
}

function line(text) {
  return String(text || "").replace(/[\u2013\u2014]/g, "-");
}

function reconstruct(card) {
  const role = card.sourceRole === "context" ? "context" : "facts";
  const branch = card.setBy?.branch || "";
  const displayByState = {
    conflicts: "conflict",
    partial: "supported_partial",
    not_in_source: "not_supported",
  };
  const statementState = branch === "floorState"
    ? "note_withheld"
    : branch === "statementVerdict" || branch === "completionEffect" || branch === "uncheckedLook" || branch === "refusedReading"
      ? card.state
      : "nothing_raised";
  return {
    statement: card.statement,
    displayVerdict: branch === "evidenceDisplay" ? (displayByState[card.state] || "") : "",
    primaryRefTitle: card.sourceName || "",
    sourceName: card.sourceName || "",
    sourceQuote: card.quote || "",
    statementVerdict: { state: statementState },
    readingNote: card.noteBucket
      ? { text: typeof card.noteText === "string" ? card.noteText : "", bucket: card.noteBucket }
      : null,
    matchExplanations: card.sourceName
      ? [{
          sourceLabel: card.sourceName,
          role,
          classification: branch === "floorState" ? "conflicting" : "not_found",
          writtenFor: "candidate",
          explanation: card.noteText || "",
        }]
      : [],
  };
}

export async function replay() {
  const files = fixtureFiles();
  const missing = files.filter((row) => !row.ok);
  const doc = JSON.parse(readFileSync(PASS, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  if (!cards.length) throw new Error("b514 replay: B503 cards are missing");
  const ctx = await loadGateContext();
  const groupKeys = new Set();
  for (const fault of ctx.design.faults || []) {
    const mapped = ctx.mapped.mapping.find((item) => item.id === fault.id);
    if (mapped?.keys?.[0]) groupKeys.add(mapped.keys[0]);
  }

  const changes = [];
  const lost = [];
  const dropped = [];
  let errored = 0;

  for (const card of cards) {
    const id = padFixtureId(card.fixtureId);
    const sources = ctx.sourcesByFixture.get(id);
    if (!sources) continue;
    const before = card.sentenceState || "";
    let after = "";
    let shown = "";
    let branch = "";
    try {
      const facts = buildFacts({ statement: card.statement, draft: card.statement, sourceText: sourceTextOf(sources) });
      const verdict = statementVerdict({
        facts,
        note: card.readingNote ?? null,
        entries: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
        statement: card.statement,
      });
      after = verdict.state;
      const traced = shownTrace({ ...card, readingFacts: facts, statementVerdict: verdict });
      shown = traced.state;
      branch = traced.setBy?.branch || "";
    } catch (error) {
      errored += 1;
      changes.push({ fixtureId: id, index: card.index, statement: card.statement, error: error.message });
      continue;
    }
    if (before === after && before === shown) continue;
    const key = joinKey(card.fixtureId, card.statement, card.occurrence);
    const label = ctx.labelByJoin.get(key) || "";
    const trueProblem = FAULTY.has(label) || groupKeys.has(key);
    const row = {
      fixtureId: id,
      index: card.index,
      occurrence: card.occurrence,
      statement: card.statement,
      before,
      after,
      shown,
      branch,
      label,
      trueProblem,
      noteBucket: card.readingNote?.bucket || "",
    };
    changes.push(row);
    if (trueProblem && raisedState(before) && !raisedState(shown)) lost.push(row);
    if (trueProblem && RED.has(before) && shown === "note_withheld") dropped.push(row);
  }

  const stored = JSON.parse(readFileSync(STORED, "utf8"));
  const storedChanges = [];
  for (const fixture of stored.fixtures || []) {
    for (const card of fixture.raised || []) {
      const rebuilt = reconstruct(card);
      const facts = [];
      const verdict = statementVerdict({
        facts,
        note: rebuilt.readingNote,
        entries: [],
        statement: card.statement,
      });
      const traced = shownTrace({ ...rebuilt, statementVerdict: verdict.state ? { ...verdict, state: rebuilt.statementVerdict.state } : verdict });
      if (traced.state === card.state) continue;
      storedChanges.push({
        textType: fixture.textType,
        statement: card.statement,
        before: card.state,
        after: traced.state,
        branch: traced.setBy?.branch || "",
        noteBucket: card.noteBucket || "",
      });
    }
  }

  const result = {
    fixtureFiles: files,
    missingFiles: missing,
    cards: cards.length,
    changed: changes.filter((row) => !row.error).length,
    errored,
    changes,
    lostTrueProblems: lost,
    redToAmber: dropped,
    storedChanges,
    gate: lost.length === 0 && missing.length === 0 && errored === 0 ? "pass" : "fail",
  };
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function render(result) {
  const lines = [
    "# B514 replay",
    "",
    `Fixture files: ${result.fixtureFiles.length}. Missing: ${result.missingFiles.length}.`,
    `B503 cards: ${result.cards}. Cards that change: ${result.changed}. Errors: ${result.errored}.`,
    `Labelled true problems that stop being raised: ${result.lostTrueProblems.length}.`,
    `Labelled true problems that drop from red to amber: ${result.redToAmber.length}.`,
    `Gate: ${result.gate}.`,
    "",
    "## Cards that change",
    "",
  ];
  const changed = result.changes.filter((row) => !row.error);
  if (!changed.length) lines.push("None.");
  for (const row of changed) {
    lines.push(`- ${row.fixtureId} #${row.index} stored ${row.before}, verdict ${row.after}, shown ${row.shown} (${row.branch}) label ${row.label || "(none)"}${row.trueProblem ? " TRUE PROBLEM" : ""} bucket ${row.noteBucket || "(none)"}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("", "## Labelled true problems that stop being raised", "");
  if (!result.lostTrueProblems.length) lines.push("None.");
  for (const row of result.lostTrueProblems) {
    lines.push(`- ${row.fixtureId} #${row.index} stored ${row.before}, shown ${row.shown} label ${row.label}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("", "## Labelled true problems that drop from red to amber", "");
  if (!result.redToAmber.length) lines.push("None.");
  for (const row of result.redToAmber) {
    lines.push(`- ${row.fixtureId} #${row.index} stored ${row.before}, shown ${row.shown} label ${row.label}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("", "## B512 stored cards whose state changes", "");
  if (!result.storedChanges.length) lines.push("None.");
  for (const row of result.storedChanges) {
    lines.push(`- ${row.textType} ${row.before} -> ${row.after} (${row.branch}) bucket ${row.noteBucket || "(none)"}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await replay();
  mkdirSync(__dirname, { recursive: true });
  const text = render(result);
  writeFileSync(RESULT, text);
  process.stdout.write(text);
  if (result.gate !== "pass") process.exitCode = 2;
}
