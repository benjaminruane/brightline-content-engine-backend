import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { draftFromStatementSpans, buildDraftMarks } from "../lib/qc/draft-marks.mjs";
import { locateStatementAt, locateStatements } from "../lib/qc/locate-statement.mjs";
import { collapse } from "../lib/revise-actions/verify.mjs";

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function textsOf(review) {
  return review.statements.map((row) => row.qcCard?.statement || row.text);
}

function storedMatches(review, draft) {
  return review.statements.filter((row) => {
    const span = row.draftSpan;
    const text = row.qcCard?.statement || row.text;
    return draft.slice(span.startChar, span.endChar) === text;
  }).length;
}

const HICL = {
  doctored: load("tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"),
  clean: load("tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"),
};

test("a repeated sentence is the next unused occurrence, and a missing one is null", () => {
  const draft = "Alpha stayed. Beta stayed. Alpha stayed.";
  const spans = locateStatements(draft, ["Alpha stayed.", "Beta stayed.", "Alpha stayed.", "Gamma."]);
  assert.deepEqual(spans, [
    { start: 0, end: 13 },
    { start: 14, end: 26 },
    { start: 27, end: 40 },
    null,
  ]);
  assert.equal(locateStatementAt(draft, "Gamma.", []), null);
});

test("whitespace collapses, and the slice is that statement", () => {
  const draft = "Alpha\nstayed.\n\nBeta stayed.";
  const spans = locateStatements(draft, ["Alpha stayed.", "Beta stayed."]);
  assert.equal(spans.filter(Boolean).length, 2);
  for (const [index, span] of spans.entries()) {
    const statement = index === 0 ? "Alpha stayed." : "Beta stayed.";
    assert.equal(collapse(draft.slice(span.start, span.end)), collapse(statement));
  }
  assert.equal(draft.slice(spans[0].start, spans[0].end), "Alpha\nstayed.");
});

test("HICL statements locate in the reader draft and in the single-newline join", () => {
  for (const arm of ["doctored", "clean"]) {
    const review = HICL[arm];
    const texts = textsOf(review);
    const reader = draftFromStatementSpans(review.statements);
    const joined = texts.join("\n");
    const inReader = locateStatements(reader, texts);
    const inJoined = locateStatements(joined, texts);
    assert.equal(inReader.filter(Boolean).length, 8, `${arm} reader`);
    assert.equal(inJoined.filter(Boolean).length, 8, `${arm} joined`);
    assert.equal(storedMatches(review, reader), 8, `${arm} stored span on the reader draft`);
    assert.equal(storedMatches(review, joined), 2, `${arm} stored span on the joined draft`);
    inReader.forEach((span, index) => {
      assert.equal(reader.slice(span.start, span.end), texts[index]);
      assert.equal(span.start, review.statements[index].draftSpan.startChar);
      assert.equal(span.end, review.statements[index].draftSpan.endChar);
    });
    inJoined.forEach((span, index) => {
      assert.equal(collapse(joined.slice(span.start, span.end)), collapse(texts[index]));
    });
  }
});

test("word marks on the eight stored runs still drop none, and do not move on the reader draft", () => {
  const runs = [
    ["3i", "clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json", "tests/fixtures/real-runs-2026-09-29/clean-actions.json"],
    ["3i", "doctored", "tests/fixtures/real-runs-2026-09-29/doc-review.json", "tests/fixtures/real-runs-2026-09-29/doc-actions.json"],
    ["HICL", "clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json"],
    ["HICL", "doctored", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", "tests/fixtures/real-runs-2026-10-04-hicl/doc-actions.json"],
    ["GPI", "clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-actions.json"],
    ["GPI", "doctored", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", "tests/fixtures/real-runs-2026-10-06-gpi/doc-actions.json"],
    ["ClearPoint", "clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-actions.json"],
    ["ClearPoint", "doctored", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-actions.json"],
  ];
  for (const [doc, arm, reviewPath, actionsPath] of runs) {
    const review = load(reviewPath);
    const actions = load(actionsPath);
    const draft = draftFromStatementSpans(review.statements);
    const statements = review.statements.map((row, index) => ({
      index: row.qcCard?.index ?? index,
      id: String(row.id),
      text: row.qcCard?.statement || row.text,
      draftSpan: row.draftSpan,
      facts: [],
    }));
    const built = buildDraftMarks({ draft, statements, entries: actions.entries });
    assert.equal(built.droppedCount, 0, `${doc} ${arm} dropped ${built.droppedCount}`);
    const texts = statements.map((row) => row.text);
    const spans = locateStatements(draft, texts);
    spans.forEach((span, index) => {
      const stored = review.statements[index].draftSpan;
      assert.equal(span.start, stored.startChar, `${doc} ${arm} S${index} start`);
      assert.equal(span.end, stored.endChar, `${doc} ${arm} S${index} end`);
    });
  }
});
