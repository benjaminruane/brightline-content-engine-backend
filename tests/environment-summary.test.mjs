import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { AUTHORING_ORGANISATION_ENV } from "../lib/qc/first-person-actor.mjs";
import { isReviseActionListEnabled, readEnvironmentSummary } from "../api/_lib/env-flags.js";

describe("readEnvironmentSummary", () => {
  test("v4 with house name is ok", () => {
    const summary = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      [AUTHORING_ORGANISATION_ENV]: "Brightline",
    });
    assert.equal(summary.pipelineRoute, "v4");
    assert.equal(summary.authoringOrganisation, "Brightline");
    assert.equal(summary.ok, true);
    assert.equal(summary.reviseActionList, false);
  });

  test("unset QC_PIPELINE_V4 falls back to v3 and is not ok", () => {
    const summary = readEnvironmentSummary({
      [AUTHORING_ORGANISATION_ENV]: "Brightline",
    });
    assert.equal(summary.pipelineRoute, "v3");
    assert.equal(summary.authoringOrganisation, "Brightline");
    assert.equal(summary.ok, false);
  });

  test("v4 without house name is not ok and name is null", () => {
    const summary = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
    });
    assert.equal(summary.pipelineRoute, "v4");
    assert.equal(summary.authoringOrganisation, null);
    assert.equal(summary.ok, false);
  });

  test("whitespace house name trims to null", () => {
    const summary = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      [AUTHORING_ORGANISATION_ENV]: "   ",
    });
    assert.equal(summary.authoringOrganisation, null);
    assert.equal(summary.ok, false);
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
});
