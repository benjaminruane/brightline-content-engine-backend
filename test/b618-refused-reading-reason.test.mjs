/**
 * B618. When the second look is refused and the card stays amber, the reason
 * must state the gap. Never leave a support-style restatement as the only reason.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyExitGate, REFUSED_READING_REASON } from "../lib/qc/exit-gate.mjs";

const STATEMENT =
  "Shopify combines simple, self-serve onboarding with a recurring subscription model and transaction fees, serving over 1,000,000 merchants and adding roughly 10,000 paying customers a week.";

const PARTIAL_EXPLANATION =
  "The source confirms the number of merchants and the rate of adding new customers. However, it does not address the onboarding process or the subscription and transaction fee model, making the support partial.";

const SUPPORT_RESTATEMENT =
  "The source says Shopify continues to add 10,000 paying customers a week, with over 1,000,000 total customers and growing.";

function shopifyRefusedCard(overrides = {}) {
  return {
    statement: STATEMENT,
    sentenceState: "note_withheld",
    supportState: "partial",
    statementVerdict: {
      state: "note_withheld",
      setBy: { branch: "refusedReading", source: "reading" },
    },
    setBy: { branch: "refusedReading", source: "reading" },
    readingNote: { refused: true, text: "" },
    shownReason: SUPPORT_RESTATEMENT,
    evidenceSummary: SUPPORT_RESTATEMENT,
    matchExplanations: [
      {
        classification: "partially_confirmed",
        explanation: PARTIAL_EXPLANATION,
      },
    ],
    readingFacts: [
      { kind: "figure", status: "matched", surface: "1,000,000" },
      { kind: "figure", status: "matched", surface: "10,000" },
    ],
    primaryExcerpt:
      "Shopify continues to add 10,000 paying customers a week, with over 1,000,000 total customers and growing.",
    ...overrides,
  };
}

test("B618 Shopify S2 shape: refused amber uses the partial gap, not the support restatement", () => {
  const out = applyExitGate(shopifyRefusedCard());
  const reason = String(out.shownReason || "");
  assert.equal(out.sentenceState, "note_withheld");
  assert.match(reason, /does not address/i);
  assert.match(reason, /onboarding|subscription|transaction fee/i);
  assert.doesNotMatch(reason, /^The source says Shopify continues to add/i);
  assert.notEqual(reason, SUPPORT_RESTATEMENT);
});

test("B618 refused amber with no match gap falls back to the refused-reading sentence", () => {
  const out = applyExitGate(
    shopifyRefusedCard({
      matchExplanations: [
        {
          classification: "confirmed",
          explanation: "The source supports the merchant count.",
        },
      ],
      readingFacts: [
        { kind: "figure", status: "matched", surface: "1,000,000" },
        { kind: "figure", status: "unmatched", surface: "self-serve onboarding" },
      ],
    }),
  );
  const reason = String(out.shownReason || "");
  assert.notEqual(out.sentenceState, "nothing_raised");
  assert.ok(
    reason === REFUSED_READING_REASON
      || /does not support|disagree|does not address|onboarding/i.test(reason),
    `expected a gap or refused sentence, got: ${reason}`,
  );
  assert.doesNotMatch(reason, /^The source says Shopify continues to add/i);
});
