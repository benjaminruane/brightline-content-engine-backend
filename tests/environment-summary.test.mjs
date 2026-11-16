import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { isReviseActionListEnabled, readEnvironmentSummary } from "../api/_lib/env-flags.js";

describe("readEnvironmentSummary", () => {
  test("v4 with editorial review on is ok, and the house name is not in the summary", () => {
    const summary = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      BRIGHTLINE_EDITORIAL_REVIEW: "1",
    });
    assert.equal(summary.pipelineRoute, "v4");
    assert.equal(Object.hasOwn(summary, "authoringOrganisation"), false);
    assert.equal(summary.ok, true);
    assert.equal(summary.reviseActionList, false);
  });

  test("there is one route, and the summary is not ok without the editorial switch", () => {
    const summary = readEnvironmentSummary({});
    assert.equal(summary.pipelineRoute, "v4");
    assert.equal(Object.hasOwn(summary, "authoringOrganisation"), false);
    assert.equal(summary.ok, false);
  });

  test("v4 with editorial review on is ok with no house name configured", () => {
    const summary = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      BRIGHTLINE_EDITORIAL_REVIEW: "1",
    });
    assert.equal(summary.pipelineRoute, "v4");
    assert.equal(summary.ok, true);
  });

  test("reviseActionList is true for each accepted value", () => {
    for (const value of ["1", "true", "yes", "on", "YES", " True ", "ON"]) {
      const summary = readEnvironmentSummary({ REVISE_ACTION_LIST: value });
      assert.equal(summary.reviseActionList, true, value);
      assert.equal(isReviseActionListEnabled({ REVISE_ACTION_LIST: value }), true, value);
    }
  });

  test("reviseActionList is false for 0, empty, and undefined", () => {
    assert.equal(readEnvironmentSummary({ REVISE_ACTION_LIST: "0" }).reviseActionList, false);
    assert.equal(readEnvironmentSummary({ REVISE_ACTION_LIST: "" }).reviseActionList, false);
    assert.equal(readEnvironmentSummary({}).reviseActionList, false);
    assert.equal(isReviseActionListEnabled({ REVISE_ACTION_LIST: "0" }), false);
    assert.equal(isReviseActionListEnabled({ REVISE_ACTION_LIST: "" }), false);
    assert.equal(isReviseActionListEnabled({}), false);
  });

  test("editorialReview is true only when BRIGHTLINE_EDITORIAL_REVIEW is 1", () => {
    const on = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      BRIGHTLINE_EDITORIAL_REVIEW: "1",
    });
    assert.equal(on.editorialReview, true);
    assert.equal(on.ok, true);

    const off = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      BRIGHTLINE_EDITORIAL_REVIEW: "0",
    });
    assert.equal(off.editorialReview, false);
    assert.equal(off.ok, false);

    const missing = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
    });
    assert.equal(missing.editorialReview, false);
    assert.equal(missing.ok, false);
  });
});
