/**
 * B230: Implement Changes does not call the model when the finding has no text.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { fillAction } from "../lib/revise-actions/run.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

describe("B230 blank finding ACKNOWLEDGE", () => {
  test("empty thing2 and suggestedDirection skip the model", async () => {
    let called = 0;
    const result = await fillAction(
      {
        id: "e1",
        kind: "editorial",
        rule: "marketing_language_excess",
        statement: "This is an outstanding opportunity.",
        thing2: "",
        suggestedDirection: "  ",
        disposition: "ACTION",
        sort: {
          policyPermit: true,
          silenceOnCard: false,
          rule: "marketing_language_excess",
          reasonCode: "permitted",
        },
      },
      {
        callModel: async () => {
          called += 1;
          return { text: "{\"proposedChange\":\"x\",\"resultingSentence\":\"y\",\"why\":\"z\"}" };
        },
      }
    );
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.noProposalReason, NO_PROPOSAL.visible_signal);
  });
});
