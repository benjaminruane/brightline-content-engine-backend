/**
 * Stated action vs resulting sentence. A quoted delete that is still present
 * is a mismatch. Uncheckable claims are unverified, not asserted.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { verifyAction } from "../lib/revise-actions/verify.mjs";

describe("revise-actions verify", () => {
  test("quoted delete still present is mismatch", () => {
    const result = verifyAction({
      proposedChange: "Delete 'genuinely exceptional'",
      why: "The phrase is evaluative, so this removes 'genuinely exceptional' rather than substituting a milder word.",
      resultingSentence:
        "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    });
    assert.equal(result.status, "mismatch");
  });

  test("quoted delete absent is checked", () => {
    const result = verifyAction({
      proposedChange: "Delete 'genuinely exceptional'",
      why: "The evaluative adverb is not backed, so dropping it is the permitted repair rather than a synonym.",
      resultingSentence:
        "We were attracted to Meridian on the strength of a track record that is, in our view, strong.",
    });
    assert.equal(result.status, "checked");
  });

  test("no checkable quote is unverified", () => {
    const result = verifyAction({
      proposedChange: "Soften the causal verb",
      why: "A modal is the available alternative to a deleted cause.",
      resultingSentence: "The team's stability suggests key-person risk may be limited.",
    });
    assert.equal(result.status, "unverified");
  });
});
