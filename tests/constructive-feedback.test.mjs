import assert from "node:assert/strict";
import {
  selectConstructiveFeedbackBundles,
  normalizeConstructiveFeedbackPlainText,
  isCardFullyClean,
  CLEAN_DRAFT_FEEDBACK_TEXT,
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
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

const bundles = selectConstructiveFeedbackBundles([cleanCard, evidenceIssueCard], {});
assert.equal(bundles.length, 1);
assert.equal(bundles[0].cardIndex, 1);
assert.equal(bundles[0].statementText, "Returns reached 15%.");
assert.equal(bundles[0].evidence, "Sources do not fully support the figure.");
assert.deepEqual(bundles[0].compliance, []);
assert.deepEqual(bundles[0].editorial, []);

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

const conflictCard = {
  qcCard: {
    index: 3,
    statement: "Revenue doubled.",
    supportState: "conflicting",
    displayVerdict: "conflict",
    evidenceSummary: "Sources contradict the figure.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  },
};

const mixedBundles = selectConstructiveFeedbackBundles(
  [evidenceIssueCard, complianceCard, conflictCard],
  {}
);
assert.equal(mixedBundles.length, 3);
assert.equal(mixedBundles[0].cardIndex, 3);
assert.equal(mixedBundles[1].cardIndex, 2);
assert.equal(mixedBundles[2].cardIndex, 1);

const duplicateTextCardA = {
  qcCard: {
    index: 10,
    statement: "Same sentence text.",
    editorialVerdict: "concern",
    editorialConcerns: [{ note: "First editorial issue.", suggestedDirection: "Tighten phrasing." }],
    complianceVerdict: "clean",
    supportState: "supported",
    displayVerdict: "supported_full",
  },
};

const duplicateTextCardB = {
  qcCard: {
    index: 11,
    statement: "Same sentence text.",
    editorialVerdict: "concern",
    editorialConcerns: [{ note: "Second editorial issue.", suggestedDirection: "Shorten the clause." }],
    complianceVerdict: "clean",
    supportState: "supported",
    displayVerdict: "supported_full",
  },
};

const duplicateTextBundles = selectConstructiveFeedbackBundles(
  [duplicateTextCardA, duplicateTextCardB],
  {}
);
assert.equal(duplicateTextBundles.length, 2);
assert.equal(duplicateTextBundles[0].cardIndex, 10);
assert.equal(duplicateTextBundles[1].cardIndex, 11);
assert.equal(duplicateTextBundles[0].editorial[0].note, "First editorial issue.");
assert.equal(duplicateTextBundles[1].editorial[0].note, "Second editorial issue.");

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

assert.ok(CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER.includes("No praise-sandwich"));

console.log("constructive-feedback tests: PASS");
console.log("clean draft message:", CLEAN_DRAFT_FEEDBACK_TEXT);
