import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildFacts } from "../lib/qc/reading-contract.mjs";
import { decisionsAfterRecheck, recheckStatements, statementChanges } from "../lib/qc/reading-review.mjs";
import {
  buildDraftMarks,
  classAProposal,
  classBProposal,
  draftFromStatementSpans,
  proposalForFact,
  resolveMarkPrecedence,
} from "../lib/qc/draft-marks.mjs";

const RUNS = [
  ["3i", "clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json", "tests/fixtures/real-runs-2026-09-29/clean-actions.json", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["3i", "doctored", "tests/fixtures/real-runs-2026-09-29/doc-review.json", "tests/fixtures/real-runs-2026-09-29/doc-actions.json", "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt"],
  ["HICL", "clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["HICL", "doctored", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/doc-actions.json", "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt"],
  ["GPI", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-actions.json", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["GPI", "doctored", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/doc-actions.json", "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt"],
  ["ClearPoint", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-actions.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
  ["ClearPoint", "doctored", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-actions.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt"],
];

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function marksForRun(reviewPath, actionsPath, sourcePath) {
  const review = load(reviewPath);
  const actions = load(actionsPath);
  const source = readFileSync(sourcePath, "utf8");
  const draft = draftFromStatementSpans(review.statements);
  const statements = review.statements.map((row, index) => {
    const text = row.qcCard?.statement || row.text;
    return {
      index: row.qcCard?.index ?? index,
      id: String(row.id),
      text,
      draftSpan: row.draftSpan,
      facts: buildFacts({ statement: text, draft, sourceText: source }),
    };
  });
  return buildDraftMarks({ draft, statements, entries: actions.entries });
}

test("missing wins over a concern, and a shorter span wins over the longer one that contains it", () => {
  const resolved = resolveMarkPrecedence([
    { start: 0, end: 20, severity: "concern", surface: "long", origin: "action", ref: "a", statementIndex: 0 },
    { start: 2, end: 6, severity: "concern", surface: "short", origin: "action", ref: "b", statementIndex: 0 },
    { start: 2, end: 6, severity: "missing", surface: "short", origin: "fact", ref: "c", statementIndex: 0 },
    { start: 30, end: 34, severity: "concern", surface: "other", origin: "action", ref: "d", statementIndex: 1 },
  ]);
  const refs = resolved.map((mark) => mark.ref).sort();
  assert.deepEqual(refs, ["c", "d"]);
});

test("a mark whose surface is not the draft slice is dropped", () => {
  const built = buildDraftMarks({
    draft: "HICL paid a dividend.",
    statements: [{
      index: 0,
      id: "0",
      text: "HICL paid a dividend.",
      draftSpan: { startChar: 0, endChar: 21 },
      facts: [{ kind: "name", surface: "HCIL", start: 0, end: 4, status: "not_found" }],
    }],
    entries: [],
  });
  assert.equal(built.marks.length, 0);
  assert.equal(built.droppedCount, 1);
});

test("eight stored runs drop no mark on the surface check", () => {
  for (const [doc, arm, reviewPath, actionsPath, sourcePath] of RUNS) {
    const built = marksForRun(reviewPath, actionsPath, sourcePath);
    assert.equal(built.droppedCount, 0, `${doc} ${arm} dropped ${built.droppedCount}`);
    for (const mark of built.marks) {
      assert.equal(mark.origin === "fact" || mark.origin === "action", true);
      assert.equal(mark.severity === "missing" || mark.severity === "concern", true);
    }
  }
});

test("a changed statement is found by its text, and its decision is cleared", () => {
  const draft = "Alpha stayed. Beta moved here. Gamma stayed.";
  const previous = [
    { index: 0, text: "Alpha stayed.", sentenceState: "nothing_to_raise", facts: [] },
    { index: 1, text: "Beta was here.", sentenceState: "nothing_to_raise", facts: [] },
    { index: 2, text: "Gamma stayed.", sentenceState: "nothing_to_raise", facts: [] },
  ];
  const aligned = statementChanges(previous, draft);
  assert.deepEqual(aligned.changes.map((row) => row.index), [1]);
  assert.equal(aligned.changes[0].text, "Beta moved here.");
  const decisions = decisionsAfterRecheck(
    { "S1:editorial:0": { choice: "accept" }, "S0:editorial:0": { choice: "reject" } },
    [{ id: "S1:editorial:0", statementId: "1" }, { id: "S0:editorial:0", statementId: "0" }],
    [1]
  );
  assert.deepEqual(decisions.cleared, ["S1:editorial:0"]);
  assert.equal(decisions.kept["S0:editorial:0"].choice, "reject");
});

test("adjacent changes are refused rather than guessed", () => {
  assert.throws(
    () => statementChanges(
      [{ index: 0, text: "One." }, { index: 1, text: "Two." }],
      "Changed. Also."
    ),
    /Run Review/
  );
});

test("recheck calls the note once for the changed statement and clears its decision", async () => {
  let calls = 0;
  const result = await recheckStatements({
    draft: "Alpha stayed. Beta moved.",
    statements: [
      { index: 0, text: "Alpha stayed.", facts: [], note: null, sentenceState: "nothing_to_raise" },
      { index: 1, text: "Beta was.", facts: [], note: null, sentenceState: "nothing_to_raise" },
    ],
    sources: [{ text: "Alpha stayed. The source says nothing else." }],
    entries: [
      { id: "changed", statementId: "1" },
      { id: "kept", statementId: "0" },
    ],
    decisions: {
      changed: { choice: "accept" },
      kept: { choice: "reject" },
    },
    complete: async () => {
      calls += 1;
      return JSON.stringify({ bucket: "none", note: "", disputedIndices: [] });
    },
    reviewStatement: async () => ({
      editorialConcerns: [],
      editorialVerdict: "clean",
      complianceConcerns: [],
      complianceVerdict: "clean",
    }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.stale, [1]);
  assert.equal(result.sentences[0].text, "Alpha stayed.");
  assert.equal(result.sentences[0].facts.length, 0);
  assert.equal(result.sentences[1].text, "Beta moved.");
  assert.deepEqual(result.clearedDecisionIds, ["changed"]);
  assert.equal(result.decisions.kept.choice, "reject");
  assert.equal(typeof result.header.numbers, "string");
});

test("a proposal is not produced for a fact the source already has", () => {
  const source = "HICL delivered towers in line with expectations.";
  assert.equal(proposalForFact({ kind: "name", status: "matched", surface: "HICL" }, source), null);
  assert.equal(classAProposal({ kind: "benchmark", status: "matched", surface: "expectations" }, source), null);
  const name = classBProposal({ kind: "name", status: "not_found", surface: "HCIL" }, source);
  assert.equal(name?.to, "HICL");
  assert.equal(classBProposal({ kind: "name", status: "not_found", surface: "St. Germain" }, source), null);
});
