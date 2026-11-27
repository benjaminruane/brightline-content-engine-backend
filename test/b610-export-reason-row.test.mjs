/**
 * B610. Export reason under the pill and in the summary box only for
 * Needs significant work.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { exportBlocks } from "../lib/export/export-blocks.mjs";

const howToRead = { title: "How", labels: [], lineNote: "x", disclaimer: "d" };

test("Needs work: no reason under the pill or in the summary rows", () => {
  const blocks = exportBlocks({
    title: { name: "Harbourline: review", verdict: "Needs work", verdictReason: "", sourceNames: ["Brief"], detail: "investor letter · v1" },
    summary: { readiness: "Needs work", readinessReason: "", facts: "35 of 36 figures, dates and names match the source", counts: ["2 sentences need a look"] },
    draft: [], fullDraft: "", cards: [], sources: [], disclaimer: "d",
    howToRead,
  }, { draft: false, reviewSummary: true });
  const lines = JSON.stringify(blocks);
  assert.doesNotMatch(lines, /2 points to confirm/);
  assert.doesNotMatch(lines, /"kind":"titleLine","text":"Needs work"/);
  const summary = blocks.find((block) => block.kind === "summary");
  assert.deepEqual(summary.rows.slice(0, 3), [
    "Needs work",
    "35 of 36 figures, dates and names match the source",
    "2 sentences need a look",
  ]);
  const pillAt = blocks.findIndex((block) => block.kind === "assessmentPill");
  assert.equal(blocks[pillAt + 1].kind, "titleLine");
  assert.equal(blocks[pillAt + 1].text, "investor letter · v1");
});

test("Needs significant work: reason under the pill and as the second summary row", () => {
  const reason = "The sources disagree on 2 sentences.";
  const blocks = exportBlocks({
    title: { name: "Ostara: review", verdict: "Needs significant work", verdictReason: reason, sourceNames: ["Fact sheet"], detail: "reporting commentary · v1" },
    summary: { readiness: "Needs significant work", readinessReason: reason, facts: "8 of 10 figures, dates and names match the sources.", counts: [] },
    draft: [], fullDraft: "", cards: [], sources: [], disclaimer: "d",
    howToRead,
  }, { draft: false, reviewSummary: true });
  const pillAt = blocks.findIndex((block) => block.kind === "assessmentPill");
  assert.equal(blocks[pillAt + 1].kind, "titleLine");
  assert.equal(blocks[pillAt + 1].text, reason);
  assert.equal(blocks[pillAt + 2].kind, "titleLine");
  assert.equal(blocks[pillAt + 2].text, "reporting commentary · v1");
  const summary = blocks.find((block) => block.kind === "summary");
  assert.deepEqual(summary.rows.slice(0, 3), [
    "Needs significant work",
    reason,
    "8 of 10 figures, dates and names match the sources.",
  ]);
});
