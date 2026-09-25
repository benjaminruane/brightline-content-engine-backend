/**
 * B277. Pre-flight refuses a review that cannot finish inside one Function.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { PREFLIGHT_REFUSAL_TEXT, preflightReview } from "../lib/qc/preflight-guard.mjs";
import { FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";

const SHORT_DRAFT = "Revenue grew to EUR 92 million in FY2024. Costs fell. Cash was positive.";
const SHORT_SOURCE = "The company reported EUR 92 million of revenue in FY2024. Costs declined year on year.";

function hugeDraft(words) {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

function hugeSource(words) {
  return Array.from({ length: words }, (_, i) => `source${i}`).join(" ");
}

describe("B277 pre-flight guard", () => {
  test("a real 150-word-scale draft is not refused", () => {
    const gate = preflightReview({
      draftText: SHORT_DRAFT.repeat(20),
      sources: [{ text: SHORT_SOURCE.repeat(40), label: "source" }],
      editorialSystemTokens: 9088,
      complianceSystemTokens: 3000,
      stage2SystemTokens: 4000,
      stage5SystemTokens: 1600,
    });
    assert.equal(gate.refuse, false);
    assert.equal(gate.message, null);
    assert.equal(gate.capMs, FUNCTION_MAX_DURATION_MS);
  });

  test("the 3698-word memo with a realistic source is not refused", () => {
    const gate = preflightReview({
      draftText: hugeDraft(3698),
      sources: [{ text: hugeSource(3558), label: "source" }],
      editorialSystemTokens: 9088,
      complianceSystemTokens: 3000,
      stage2SystemTokens: 4000,
      stage5SystemTokens: 1600,
    });
    assert.equal(gate.refuse, false);
  });

  test("an impossible document is refused before any model call, in plain language", () => {
    const gate = preflightReview({
      draftText: hugeDraft(80_000),
      sources: [{ text: hugeSource(80_000), label: "source" }],
      editorialSystemTokens: 9088,
      complianceSystemTokens: 3000,
      stage2SystemTokens: 4000,
      stage5SystemTokens: 1600,
    });
    assert.equal(gate.refuse, true);
    assert.equal(gate.message, PREFLIGHT_REFUSAL_TEXT);
    assert.equal(/token/i.test(gate.message), false);
    assert.equal(/tier/i.test(gate.message), false);
    assert.equal(/concurren/i.test(gate.message), false);
    assert.equal(gate.estimate.tpmFloorMs > gate.capMs, true);
  });
});
