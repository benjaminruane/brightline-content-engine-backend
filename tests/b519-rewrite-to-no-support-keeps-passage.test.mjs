/**
 * B519. A backstop that rewrites a class to no_support records the rewrite,
 * and Stage 4 keeps that match's passage. A model no_support stays empty.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applyPeriodGateBackstop,
  applyRoundingToleranceBackstop,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const PASSAGE = "Revenue for FY2025 was GBP 312 million.";
const SOURCE = `Opening line. ${PASSAGE} Closing line.`;

test("the period gate records a rewrite to no_support", () => {
  const out = applyPeriodGateBackstop(
    {
      classification: "confirmed",
      passage: PASSAGE,
      explanation: "Revenue matches.",
      periodAssessment: {
        statementPeriod: "FY2024",
        sourcePeriod: "FY2025",
        statementPeriodRole: "figure_period",
        sourcePeriodRole: "figure_period",
      },
    },
    { statementText: "Revenue for FY2024 was GBP 312 million." }
  );
  assert.equal(out.classification, "no_support");
  assert.equal(out.preBackstopClassification, "confirmed");
  const row = (out.classificationRewrites || []).find((item) => item.to === "no_support");
  assert.ok(row, "period gate did not record the rewrite");
  assert.equal(row.rule, "period_non_overlap");
  assert.equal(row.from, "confirmed");
  assert.equal(row.to, "no_support");
});

test("a procedural closer records a rewrite to no_support", () => {
  const out = applyRoundingToleranceBackstop(
    {
      classification: "confirmed",
      passage: "Yours sincerely",
      explanation: "Closing line.",
    },
    { statementText: "Kind regards" }
  );
  assert.equal(out.classification, "no_support");
  assert.equal(out.preBackstopClassification, "confirmed");
  const row = (out.classificationRewrites || []).find((item) => item.rule === "procedural_closer");
  assert.ok(row);
  assert.equal(row.from, "confirmed");
  assert.equal(row.to, "no_support");
});

test("Stage 4 keeps the passage only when no_support was rewritten", () => {
  const sources = [{ label: "Memo", text: SOURCE }];
  const kept = selectExcerpts({
    verdict: "not_supported",
    hasConflict: false,
    statementMatches: [{
      sourceIndex: 0,
      sourceLabel: "Memo",
      classification: "no_support",
      preBackstopClassification: "confirmed",
      passage: PASSAGE,
    }],
    supportSpans: [],
    sources,
    statementText: "Revenue for FY2024 was GBP 312 million.",
  });
  assert.equal(typeof kept.primaryExcerpt?.passage, "string");
  assert.equal(kept.primaryExcerpt.passage.includes("FY2025"), true);

  const dropped = selectExcerpts({
    verdict: "not_supported",
    hasConflict: false,
    statementMatches: [{
      sourceIndex: 0,
      sourceLabel: "Memo",
      classification: "no_support",
      passage: PASSAGE,
    }],
    supportSpans: [],
    sources,
    statementText: "Revenue for FY2024 was GBP 312 million.",
  });
  assert.equal(dropped.primaryExcerpt, null);

  const confirmed = selectExcerpts({
    verdict: "confirmed",
    hasConflict: false,
    statementMatches: [{
      sourceIndex: 0,
      sourceLabel: "Memo",
      classification: "confirmed",
      passage: PASSAGE,
    }],
    supportSpans: [],
    sources,
    statementText: "Revenue for FY2025 was GBP 312 million.",
  });
  assert.equal(typeof confirmed.primaryExcerpt?.passage, "string");
});
