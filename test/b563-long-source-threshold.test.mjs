/**
 * B563. The long-source warning starts above 15,000 words, and a diagnostic
 * run stops above its cost cap or a 6,000-word Review source.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LONG_SOURCE_WORDS, reviewCostWarning } from "../lib/qc/review-cost-warning.mjs";
import {
  DIAGNOSTIC_COST_CAP_USD,
  REVIEW_SOURCE_WORD_CAP,
  guardDiagnosticRequest,
} from "../scripts/diagnostic/lib/cost-guard.mjs";

test("the shared threshold is 15,000 words", () => {
  assert.equal(LONG_SOURCE_WORDS, 15000);
  assert.equal(reviewCostWarning({ sourceWords: 15000, statementCount: 4 }), null);
  const warning = reviewCostWarning({ sourceWords: 15001, statementCount: 4 });
  assert.match(warning.message, /15,001 words of source/);
});

test("a diagnostic run prints the estimate and refuses a cost over USD 3", async () => {
  const lines = [];
  const log = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const under = await guardDiagnosticRequest({
      kind: "review",
      sources: [{ name: "note.txt", text: "alpha beta" }],
      statementCount: 2,
      argv: [],
    });
    assert.equal(under.costUsd < DIAGNOSTIC_COST_CAP_USD, true);
    assert.match(lines.at(-1), /Estimated cost USD/);
    await assert.rejects(
      () => guardDiagnosticRequest({
        kind: "review",
        sources: [{ name: "note.txt", text: "alpha beta" }],
        statementCount: 101,
        argv: [],
      }),
      /above the USD 3 cap/,
    );
    const allowed = await guardDiagnosticRequest({
      kind: "review",
      sources: [{ name: "note.txt", text: "alpha beta" }],
      statementCount: 101,
      argv: ["--allow-over-cap"],
    });
    assert.equal(allowed.costUsd > DIAGNOSTIC_COST_CAP_USD, true);
  } finally {
    console.log = log;
  }
});

test("Review refuses a source over 6,000 words, and the 3i FY2025 PDF in every case", async () => {
  const longText = "word ".repeat(REVIEW_SOURCE_WORD_CAP + 1);
  await assert.rejects(
    () => guardDiagnosticRequest({
      kind: "review",
      sources: [{ name: "memo.txt", text: longText }],
      statementCount: 1,
      argv: ["--allow-over-cap"],
    }),
    /refuse a source over 6,000 words/,
  );
  const allowed = await guardDiagnosticRequest({
    kind: "generate",
    sources: [{ name: "memo.txt", text: longText }],
    statementCount: 1,
    argv: ["--allow-over-cap"],
  });
  assert.equal(allowed.sourceWords > REVIEW_SOURCE_WORD_CAP, true);
  await assert.rejects(
    () => guardDiagnosticRequest({
      kind: "review",
      sources: [{ name: "3i-press-release-fy2025.pdf" }],
      statementCount: 1,
      argv: ["--allow-over-cap", "--allow-long-source"],
    }),
    /3i FY2025 PDF is never run through Review/,
  );
});

test("a missing source or statement count is loud", async () => {
  await assert.rejects(
    () => guardDiagnosticRequest({ kind: "review", draftText: "A sentence.", argv: [] }),
    /sources are missing/,
  );
  await assert.rejects(
    () => guardDiagnosticRequest({
      kind: "review",
      sources: [{ name: "memo.pdf" }],
      argv: [],
    }),
    /source word count is missing/,
  );
});
