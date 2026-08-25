import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import {
  computeCoverageUnion,
  coverageWindow,
  shouldPromoteCoverageUnion,
  supportedIntervalsFromUnsupportedSpan,
  unionCoversWindow,
  unionIntervals,
} from "../lib/qc/coverage-union.mjs";

afterEach(() => {
  delete process.env.QC_MULTISOURCE_COVERAGE;
  delete process.env.QC_STAGE2_SPAN;
});

describe("supportedIntervalsFromUnsupportedSpan", () => {
  test("middle span yields two supported intervals", () => {
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, 3, 7), [
      [0, 3],
      [7, 10],
    ]);
  });

  test("prefix span yields the suffix", () => {
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, 0, 4), [[4, 10]]);
  });

  test("suffix span yields the prefix", () => {
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, 6, 10), [[0, 6]]);
  });

  test("WHOLE span yields an empty complement", () => {
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, 0, 10), []);
  });

  test("null offsets yield nothing", () => {
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, null, null), []);
    assert.deepEqual(supportedIntervalsFromUnsupportedSpan(10, 0, null), []);
  });
});

describe("unionIntervals and coverageComplete", () => {
  test("abutting intervals merge and cover the window", () => {
    const union = unionIntervals([
      [0, 5],
      [5, 12],
    ]);
    assert.deepEqual(union, [[0, 12]]);
    assert.equal(unionCoversWindow(union, 0, 12), true);
  });

  test("a gap leaves coverage incomplete", () => {
    const union = unionIntervals([
      [0, 4],
      [7, 12],
    ]);
    assert.equal(unionCoversWindow(union, 0, 12), false);
  });

  test("coverage window ignores leading whitespace and a trailing period", () => {
    const statement = "  Hello world.";
    const window = coverageWindow(statement);
    assert.equal(statement.slice(window.start, window.end), "Hello world");
    assert.equal(unionCoversWindow([[2, 13]], window.start, window.end), true);
  });
});

describe("computeCoverageUnion", () => {
  const statement = "Alpha supported and beta unsupported.";

  test("two partial sources whose complements cover the statement", () => {
    const beta = "beta unsupported";
    const alpha = "Alpha supported";
    const matches = [
      {
        sourceIndex: 0,
        sourceLabel: "A",
        classification: "partially_confirmed",
        unsupportedSpan: beta,
        unsupportedSpanStart: statement.indexOf(beta),
        unsupportedSpanEnd: statement.indexOf(beta) + beta.length,
      },
      {
        sourceIndex: 1,
        sourceLabel: "B",
        classification: "partially_confirmed",
        unsupportedSpan: alpha,
        unsupportedSpanStart: statement.indexOf(alpha),
        unsupportedSpanEnd: statement.indexOf(alpha) + alpha.length,
      },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.coverageComplete, true);
    assert.equal(coverage.hasConflicting, false);
    assert.equal(coverage.contributingSourceCount, 2);
    assert.equal(shouldPromoteCoverageUnion({ verdict: "partially_confirmed", coverage }), true);
  });

  test("a WHOLE span contributes an empty complement", () => {
    const matches = [
      {
        sourceIndex: 0,
        classification: "partially_confirmed",
        unsupportedSpan: statement,
        unsupportedSpanStart: 0,
        unsupportedSpanEnd: statement.length,
        unsupportedSpanWhole: true,
      },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.wholeContributingPairs, 1);
    assert.equal(coverage.coverageComplete, false);
    assert.deepEqual(coverage.union, []);
  });

  test("null offsets contribute nothing", () => {
    const matches = [
      {
        sourceIndex: 0,
        classification: "partially_confirmed",
        unsupportedSpan: "supported",
        unsupportedSpanStart: null,
        unsupportedSpanEnd: null,
      },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.nullOffsetPartialPairs, 1);
    assert.deepEqual(coverage.union, []);
  });

  test("a conflicting pair is recorded and blocks promotion", () => {
    const beta = "beta unsupported";
    const alpha = "Alpha supported";
    const matches = [
      {
        sourceIndex: 0,
        classification: "partially_confirmed",
        unsupportedSpan: beta,
        unsupportedSpanStart: statement.indexOf(beta),
        unsupportedSpanEnd: statement.indexOf(beta) + beta.length,
      },
      {
        sourceIndex: 1,
        classification: "partially_confirmed",
        unsupportedSpan: alpha,
        unsupportedSpanStart: statement.indexOf(alpha),
        unsupportedSpanEnd: statement.indexOf(alpha) + alpha.length,
      },
      { sourceIndex: 2, classification: "conflicting" },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.coverageComplete, true);
    assert.equal(coverage.hasConflicting, true);
    assert.equal(shouldPromoteCoverageUnion({ verdict: "partially_confirmed", coverage }), false);
  });

  test("a no_support pair does not block promotion", () => {
    const beta = "beta unsupported";
    const alpha = "Alpha supported";
    const matches = [
      {
        sourceIndex: 0,
        classification: "partially_confirmed",
        unsupportedSpan: beta,
        unsupportedSpanStart: statement.indexOf(beta),
        unsupportedSpanEnd: statement.indexOf(beta) + beta.length,
      },
      {
        sourceIndex: 1,
        classification: "partially_confirmed",
        unsupportedSpan: alpha,
        unsupportedSpanStart: statement.indexOf(alpha),
        unsupportedSpanEnd: statement.indexOf(alpha) + alpha.length,
      },
      { sourceIndex: 2, classification: "no_support" },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.hasNoSupport, true);
    assert.equal(shouldPromoteCoverageUnion({ verdict: "partially_confirmed", coverage }), true);
  });

  test("a single contributing source is not a coverage union", () => {
    const beta = "beta unsupported";
    const matches = [
      {
        sourceIndex: 0,
        classification: "partially_confirmed",
        unsupportedSpan: beta,
        unsupportedSpanStart: statement.indexOf(beta),
        unsupportedSpanEnd: statement.indexOf(beta) + beta.length,
      },
    ];
    const coverage = computeCoverageUnion({ statementText: statement, matches });
    assert.equal(coverage.contributingSourceCount, 1);
    assert.equal(shouldPromoteCoverageUnion({ verdict: "partially_confirmed", coverage }), false);
  });
});
