import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { CLEAN_DRAFT_FEEDBACK_TEXT } from "../lib/qc/constructive-feedback.mjs";

describe("B241 clean-draft copy", () => {
  test("CLEAN_DRAFT_FEEDBACK_TEXT has no em dash or en dash", () => {
    assert.equal(CLEAN_DRAFT_FEEDBACK_TEXT.includes("\u2014"), false);
    assert.equal(CLEAN_DRAFT_FEEDBACK_TEXT.includes("\u2013"), false);
    assert.equal(CLEAN_DRAFT_FEEDBACK_TEXT, "No changes are needed. The draft is ready for signoff.");
  });
});
