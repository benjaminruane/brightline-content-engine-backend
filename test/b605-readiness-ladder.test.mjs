/**
 * B605. The overall label grades what it takes to fix the draft:
 * a decision from outside the tool, rewrites, quick fixes, or polish.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { exportBlocks } from "../lib/export/export-blocks.mjs";

const ON = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };
const card = (index, sentenceState, extra = {}) => ({
  index,
  statement: `Sentence ${index}.`,
  stampAuthority: "b596",
  sentenceState,
  statementVerdict: { state: sentenceState },
  editorialVerdict: "clean",
  complianceVerdict: "clean",
  ...extra,
});
const quiet = (index) => card(index, "nothing_raised");
const wrongFigure = (index) => card(index, "conflicts", {
  primaryRefTitle: "Brief",
  readingFacts: [{ kind: "figure", surface: "USD 59", status: "not_found" }],
});
const disagree = (index) => card(index, "conflicts", {
  primaryRefTitle: "Quarterly report",
  conflictExcerpt: { sourceLabel: "Fact sheet" },
  readingFacts: [{ kind: "figure", surface: "11.2%", status: "matched" }],
});

test("one wrong figure the tool can correct is Needs work, with a reason", () => {
  const s = summariseReview([quiet(0), wrongFigure(1), quiet(2)], ON);
  assert.equal(s.readiness, "Needs work");
  assert.equal(s.readinessReason, "1 figure to correct.");
});

test("sources that disagree are significant work, even for one sentence", () => {
  const s = summariseReview([quiet(0), disagree(1)], ON);
  assert.equal(s.readiness, "Needs significant work");
  assert.equal(s.readinessReason, "The sources disagree on 1 sentence.");
});

test("an unsupported opening claim is significant work", () => {
  const s = summariseReview([card(0, "beyond"), quiet(1)], ON);
  assert.equal(s.readiness, "Needs significant work");
  assert.match(s.readinessReason, /opening claim/);
});

test("a figure plus a claim to cut (Lumio, Northwharf) is Needs work", () => {
  const s = summariseReview([quiet(0), wrongFigure(1), card(2, "beyond")], ON);
  assert.equal(s.readiness, "Needs work");
  assert.equal(s.readinessReason, "1 claim to reword or support and 1 figure to correct.");
});

test("a status to confirm is Needs work", () => {
  const s = summariseReview([card(0, "note_withheld"), quiet(1)], ON);
  assert.equal(s.readiness, "Needs work");
  assert.equal(s.readinessReason, "1 point to confirm.");
});

test("three claims to reword or support tip into significant work", () => {
  const s = summariseReview([quiet(0), card(1, "beyond"), card(2, "not_in_source"), card(3, "beyond")], ON);
  assert.equal(s.readiness, "Needs significant work");
});

test("five fixes of any kind are significant work", () => {
  const s = summariseReview([quiet(0), wrongFigure(1), wrongFigure(2), wrongFigure(3), wrongFigure(4), wrongFigure(5)], ON);
  assert.equal(s.readiness, "Needs significant work");
});

test("the export shows the reason under the pill and in the summary box for Needs significant work", () => {
  const blocks = exportBlocks({
    title: { name: "Review", verdict: "Needs significant work", verdictReason: "The sources disagree on 1 sentence.", sourceNames: ["Brief"] },
    summary: { readiness: "Needs significant work", readinessReason: "The sources disagree on 1 sentence.", facts: "9 of 10", counts: [] },
    draft: [], fullDraft: "", cards: [], sources: [], disclaimer: "d",
    howToRead: { title: "How", labels: [], lineNote: "x", disclaimer: "d" },
  }, { draft: false, reviewSummary: true });
  const all = JSON.stringify(blocks);
  assert.match(all, /"kind":"titleLine","text":"The sources disagree on 1 sentence\."/);
  const summary = blocks.find((block) => block.kind === "summary");
  assert.deepEqual(summary.rows.slice(0, 2), ["Needs significant work", "The sources disagree on 1 sentence."]);
});
