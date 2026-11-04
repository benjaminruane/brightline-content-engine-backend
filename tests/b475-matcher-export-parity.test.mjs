/**
 * B475. The two stage-2 matcher files are not merged. This pins the names
 * each one exports, and the names exported by both. A new shared name, or
 * a shared name removed from one file, fails here until this list is updated.
 * The functions themselves are not required to match. They have already drifted.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import * as v4 from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import * as v3 from "../lib/qc/pipeline-v3/stage2-match-sources.mjs";

const V4_EXPORTS = [
  "SPAN_ELICIT_CLASSIFICATIONS",
  "STAGE2_CONCURRENCY",
  "STAGE2_SEED",
  "applyEmptyConfirmationRefusal",
  "applyPeriodGateBackstop",
  "applyRoundingToleranceBackstop",
  "applyUnsupportedSpanValidation",
  "buildUnsupportedSpans",
  "classifyNumericRelationship",
  "collectBackstopFigures",
  "fingerprintFromCompletion",
  "getStage2SpanElicitPromptForTest",
  "getStage2SystemPromptForTest",
  "getStage2UnsupportedSpanMultiOccurrenceCount",
  "getStage2UnsupportedSpanRejectionCount",
  "getStage2UnsupportedSpanWholeCount",
  "hasEgregiousMagnitudeGap",
  "inferPeriodRole",
  "isProceduralCloserStatement",
  "isSpanElicitEligible",
  "isStage2SpanEnabled",
  "matchAllSources",
  "matchClaimSourcePairs",
  "normalizePassageForComparison",
  "normalizePeriodToken",
  "normalizeValidResponse",
  "periodsDoNotOverlap",
  "resetStage2PromptCache",
  "resetStage2UnsupportedSpanRejectionCount",
  "resetStage2UnsupportedSpanStats",
  "resolvePassageAgainstSource",
  "validatePassageAgainstSource",
  "validateUnsupportedSpan",
];

const V3_EXPORTS = ["matchAllSources"];

const SHARED = ["matchAllSources"];

function exportNames(mod) {
  return Object.keys(mod).filter((name) => name !== "default").sort();
}

describe("B475 matcher export names", () => {
  test("each file exports the names recorded here, and the shared set is matchAllSources", () => {
    const fromV4 = exportNames(v4);
    const fromV3 = exportNames(v3);
    const shared = fromV4.filter((name) => fromV3.includes(name));
    assert.deepEqual(fromV4, V4_EXPORTS);
    assert.deepEqual(fromV3, V3_EXPORTS);
    assert.deepEqual(shared, SHARED);
  });
});
