import assert from "node:assert/strict";
import {
  selectConstructiveFeedbackPoints,
  normalizeConstructiveFeedbackPlainText,
  isCardFullyClean,
  CLEAN_DRAFT_FEEDBACK_TEXT,
} from "../lib/qc/constructive-feedback.mjs";
import { computeSignoffVerdict, isReadyForSignoff } from "../lib/qc/signoff-verdict.mjs";

const cleanCard = {
  qcCard: {
    index: 0,
    statement: "Revenue grew 12%.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const evidenceIssueCard = {
  qcCard: {
    index: 1,
    statement: "Returns reached 15%.",
    supportState: "partial",
    displayVerdict: "supported_partial",
    evidenceSummary: "Sources do not fully support the figure.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

assert.equal(isCardFullyClean(cleanCard.qcCard, {}), true);
assert.equal(isCardFullyClean(evidenceIssueCard.qcCard, {}), false);

const points = selectConstructiveFeedbackPoints([cleanCard, evidenceIssueCard], {});
assert.equal(points.length, 1);
assert.equal(points[0].signal, "evidence");
assert.equal(points[0].statementText, "Returns reached 15%.");

const complianceCard = {
  qcCard: {
    index: 2,
    statement: "We expect strong growth.",
    supportState: "supported",
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    complianceVerdict: "soft_concern",
    complianceConcerns: [
      {
        note: "Forward-looking claim lacks qualifier.",
        suggestedDirection: "Add hedging such as 'may' or 'could'.",
        suggestedRewrite: "We may see strong growth.",
      },
    ],
  },
};

const mixedPoints = selectConstructiveFeedbackPoints(
  [evidenceIssueCard, complianceCard],
  {}
);
assert.equal(mixedPoints.length, 2);
assert.equal(mixedPoints[0].signal, "evidence");
assert.equal(mixedPoints[1].signal, "compliance");
assert.equal(
  JSON.stringify(mixedPoints[1].inputs),
  JSON.stringify([
    {
      note: "Forward-looking claim lacks qualifier.",
      suggestedDirection: "Add hedging such as 'may' or 'could'.",
    },
  ])
);

const stripped = normalizeConstructiveFeedbackPlainText(
  "## Summary\n\n**1.** The claim about *returns* isn't supported.\n\n- Consider softening it."
);
assert.ok(!stripped.includes("**"));
assert.ok(!stripped.includes("##"));
assert.ok(!stripped.includes("- Consider"));

const readyVerdict = computeSignoffVerdict([cleanCard]);
assert.equal(readyVerdict, "Ready for signoff");
assert.equal(isReadyForSignoff(readyVerdict), true);

const notReady = computeSignoffVerdict([evidenceIssueCard]);
assert.equal(notReady, "Needs targeted revision");

console.log("constructive-feedback tests: PASS");
console.log("clean draft message:", CLEAN_DRAFT_FEEDBACK_TEXT);
