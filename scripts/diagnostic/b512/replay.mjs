/**
 * B512 Part F. Replay the name rules and statementVerdict on the stored B503 cards.
 * No model call.
 *
 *   node scripts/diagnostic/b512/replay.mjs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFacts } from "../../../lib/qc/reading-contract.mjs";
import { shownState } from "../../../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../../../lib/qc/statement-verdict.mjs";
import { joinKey, padFixtureId } from "../accuracy/lib.mjs";
import { loadGateContext } from "../b496/replay.mjs";
import { SOURCES_DIR } from "../lib/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b503/pass-1.json");
const DRAFTING = path.join(__dirname, "../drafting/fixtures");
const OUT = path.join(__dirname, "replay.json");
const QUIET = new Set(["nothing_raised", "nothing_to_raise", ""]);
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
      const file = source.file;
      try {
        const resolved = resolveDraftingFile(file);
        rows.push({ fixture: name, file, role: source.role, bytes: resolved.text.length, ok: resolved.text.length > 0 });
        if (!resolved.text.length) rows[rows.length - 1].error = "empty";
      } catch (error) {
        rows.push({ fixture: name, file, role: source.role, ok: false, error: error.message });
      }
    }
  }
  return rows;
}

function verdictOf(card, sourceText) {
  const facts = buildFacts({
    statement: card.statement,
    draft: card.statement,
    sourceText,
  });
  const verdict = statementVerdict({
    facts,
    note: card.readingNote ?? null,
    entries: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    statement: card.statement,
  });
  return { facts, verdict };
}

export async function replay() {
  const files = fixtureFiles();
  const missing = files.filter((row) => !row.ok);
  const doc = JSON.parse(readFileSync(PASS, "utf8"));
  const cards = Array.isArray(doc.cards) ? doc.cards : [];
  if (!cards.length) throw new Error("b512 replay: B503 cards are missing");
  const ctx = await loadGateContext();
  const groupKeys = new Set();
  for (const fault of ctx.design.faults || []) {
    const mapped = ctx.mapped.mapping.find((item) => item.id === fault.id);
    if (mapped?.keys?.[0]) groupKeys.add(mapped.keys[0]);
  }

  const changes = [];
  const lost = [];
  let beforeNotInSource = 0;
  let afterNotInSource = 0;
  let afterShownNotInSource = 0;
  let errored = 0;

  for (const card of cards) {
    const id = padFixtureId(card.fixtureId);
    const sources = ctx.sourcesByFixture.get(id);
    if (!sources) continue;
    const before = card.sentenceState || "";
    if (before === "not_in_source") beforeNotInSource += 1;
    let after = "";
    let shown = "";
    try {
      const { verdict } = verdictOf(card, sourceTextOf(sources));
      after = verdict.state;
      shown = shownState({ ...card, statementVerdict: { state: after, setBy: verdict.setBy } });
    } catch (error) {
      errored += 1;
      changes.push({
        fixtureId: id,
        index: card.index,
        statement: card.statement,
        error: error.message,
      });
      continue;
    }
    if (after === "not_in_source") afterNotInSource += 1;
    if (shown === "not_in_source") afterShownNotInSource += 1;
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
      label,
      trueProblem,
      noteBucket: card.readingNote?.bucket || "",
    };
    changes.push(row);
    if (trueProblem && raisedState(before) && !raisedState(shown)) lost.push(row);
  }

  const result = {
    fixtureFiles: files,
    missingFiles: missing,
    cards: cards.length,
    beforeNotInSource,
    afterNotInSource,
    afterShownNotInSource,
    changed: changes.filter((row) => !row.error).length,
    errored,
    changes,
    lostTrueProblems: lost,
    gate: lost.length === 0 && missing.length === 0 && errored === 0 ? "pass" : "fail",
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  return result;
}

function line(text) {
  return text.replace(/[\u2013\u2014]/g, "-");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await replay();
  const lines = [
    "# B512 replay",
    "",
    `Fixture files: ${result.fixtureFiles.length}. Missing: ${result.missingFiles.length}.`,
    `Cards: ${result.cards}. Not in the source before: ${result.beforeNotInSource}. Statement verdict after: ${result.afterNotInSource}. Shown after: ${result.afterShownNotInSource}.`,
    `Cards whose statement verdict changed: ${result.changed}. Errors: ${result.errored}.`,
    `Labelled true problems that stop being raised: ${result.lostTrueProblems.length}.`,
    `Gate: ${result.gate}.`,
    "",
  ];
  if (result.missingFiles.length) {
    lines.push("## Missing fixture files", "");
    for (const row of result.missingFiles) lines.push(`- ${row.fixture} ${row.file}: ${row.error}`);
    lines.push("");
  }
  lines.push("## Cards that change", "");
  const changed = result.changes.filter((row) => !row.error);
  if (!changed.length) lines.push("None.");
  for (const row of changed) {
    lines.push(`- ${row.fixtureId} #${row.index} stored ${row.before}, verdict ${row.after}, shown ${row.shown} label ${row.label || "(none)"}${row.trueProblem ? " TRUE PROBLEM" : ""}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("", "## Labelled true problems that stop being raised", "");
  if (!result.lostTrueProblems.length) lines.push("None.");
  for (const row of result.lostTrueProblems) {
    lines.push(`- ${row.fixtureId} #${row.index} stored ${row.before}, verdict ${row.after}, shown ${row.shown} label ${row.label}`);
    lines.push(`  ${line(row.statement)}`);
  }
  lines.push("");
  process.stdout.write(`${lines.join("\n")}\n`);
  if (result.gate !== "pass") process.exitCode = 2;
}
