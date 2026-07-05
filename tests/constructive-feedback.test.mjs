import assert from "node:assert/strict";
import {
  selectConstructiveFeedbackBundles,
  normalizeConstructiveFeedbackPlainText,
  normalizeConstructiveFeedbackCraftText,
  splitCardFeedbackSections,
  assembleConstructiveFeedbackText,
  stripCraftPreamble,
  extractNumberedPointBlocks,
  renumberPointBlocks,
  assembleCraftAndCardFeedback,
  buildConstructiveFeedbackCraftSystemPrompt,
  buildConstructiveFeedbackCraftUserPayload,
  buildConstructiveFeedbackCraftOutputTypeGuidance,
  buildConstructiveFeedbackUserPayload,
  isCardFullyClean,
  CLEAN_DRAFT_FEEDBACK_TEXT,
  CONSTRUCTIVE_FEEDBACK_EDITOR_REGISTER,
  CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY,
  CONSTRUCTIVE_FEEDBACK_CRAFT_NONE,
  CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT,
  CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE,
  resolveConstructiveFeedbackCraftOutputType,
} from "../lib/qc/constructive-feedback.mjs";
import { OUTPUT_TYPE } from "../lib/output-intent.js";
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

assert.equal(normalizeConstructiveFeedbackCraftText(CONSTRUCTIVE_FEEDBACK_CRAFT_NONE), "");
assert.equal(normalizeConstructiveFeedbackCraftText("  none  "), "");
assert.equal(
  normalizeConstructiveFeedbackCraftText("The opening buries the lede in paragraph two."),
  "The opening buries the lede in paragraph two."
);

const split = splitCardFeedbackSections(
  "This draft needs work.\n\n1. Fix the returns claim.\n\n2. Soften the forward-looking line.\n\nTighten and resubmit."
);
assert.equal(split.opening, "This draft needs work.");
assert.ok(split.cardPoints.includes("1. Fix the returns claim."));
assert.ok(split.cardPoints.includes("2. Soften the forward-looking line."));
assert.equal(split.closing, "Tighten and resubmit.");

const assembled = assembleConstructiveFeedbackText({
  opening: "This draft needs work.",
  craftSection: "The register drifts promotional in the back half.",
  cardPoints: "1. Fix the returns claim.",
  closing: "Tighten and resubmit.",
});
assert.ok(assembled.indexOf("This draft needs work.") === 0);
assert.ok(assembled.includes("The register drifts promotional"));
assert.ok(assembled.includes("1. Fix the returns claim."));
assert.ok(assembled.endsWith("Tighten and resubmit."));

assert.equal(
  stripCraftPreamble(
    "The draft needs significant work to improve its document-level craft.\n\n1. Structure: the lede is buried.\n\n2. Register drifts promotional."
  ),
  "1. Structure: the lede is buried.\n\n2. Register drifts promotional."
);

const craftBlocks = extractNumberedPointBlocks("1. Craft one.\n\n2. Craft two.");
const cardBlocks = extractNumberedPointBlocks("1. Card one.\n\n2. Card two.");
assert.equal(renumberPointBlocks([...craftBlocks, ...cardBlocks], 1), "1. Craft one.\n\n2. Craft two.\n\n3. Card one.\n\n4. Card two.");

const combined = assembleCraftAndCardFeedback({
  opening: "This draft needs work.",
  craftSection:
    "The draft needs significant work.\n\n1. Structure: lede buried.\n\n2. Register drifts.",
  cardPoints: "1. Fix returns.\n\n2. Soften forward-looking line.",
  closing: "Tighten and resubmit.",
});
assert.ok(combined.startsWith("This draft needs work."));
assert.ok(!combined.includes("The draft needs significant work."));
assert.ok(combined.includes("1. Structure: lede buried."));
assert.ok(combined.includes("2. Register drifts."));
assert.ok(combined.includes("3. Fix returns."));
assert.ok(combined.includes("4. Soften forward-looking line."));
assert.ok(combined.endsWith("Tighten and resubmit."));

assert.ok(!CONSTRUCTIVE_FEEDBACK_CRAFT_REGISTER_OBSERVATIONS_ONLY.includes("Opening frames the read honestly"));

assert.ok(CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE.includes("~8–10 words"));
assert.ok(CONSTRUCTIVE_FEEDBACK_SYSTEM_PROMPT.includes(CONSTRUCTIVE_FEEDBACK_QUOTE_DISCIPLINE));

const cardPayload = buildConstructiveFeedbackUserPayload({
  draftText: "Draft text.",
  signoffVerdict: "Needs targeted revision",
  isReady: false,
  feedbackBundles: [{ cardIndex: 0, statementText: "Returns reached 15%.", compliance: [], editorial: [] }],
  craftHandledSeparately: true,
  craftSectionContext: "1. Internal coherence: $48 vs $50 on revenue.",
});
assert.ok(cardPayload.instructions.some((line) => line.includes("reconciles against the source")));
assert.equal(
  cardPayload.craftSectionForFigureDedupe,
  "1. Internal coherence: $48 vs $50 on revenue."
);

// B26.2.4-test — craft output-type fallback coverage
const CRAFT_PER_TYPE_MARKER = "Output type calibration";

assert.equal(resolveConstructiveFeedbackCraftOutputType(undefined), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType(null), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType(""), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType("not_a_type"), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType("unknown_format"), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType(123), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType({}), null);
assert.equal(resolveConstructiveFeedbackCraftOutputType("linkedin_post"), OUTPUT_TYPE.LINKEDIN_POST);

assert.equal(buildConstructiveFeedbackCraftOutputTypeGuidance(null), null);
assert.equal(buildConstructiveFeedbackCraftOutputTypeGuidance(undefined), null);

const genericCraftPrompt = buildConstructiveFeedbackCraftSystemPrompt(false, null);
assert.ok(!genericCraftPrompt.includes(CRAFT_PER_TYPE_MARKER));
assert.ok(
  !genericCraftPrompt.includes(
    "Judge each dimension against the norms of the given output type"
  )
);

const linkedinCraftPrompt = buildConstructiveFeedbackCraftSystemPrompt(false, "linkedin_post");
assert.ok(linkedinCraftPrompt.includes("Output type calibration (LinkedIn post)"));

const nullTypePayload = buildConstructiveFeedbackCraftUserPayload({
  analysedDraftText: "Draft body.",
  signoffVerdict: "Needs targeted revision",
  isReady: false,
  includeOpeningClosing: false,
  outputType: null,
});
assert.ok(!nullTypePayload.instructions.some((line) => line.includes(CRAFT_PER_TYPE_MARKER)));
assert.equal(nullTypePayload.outputType, undefined);

const investorLetterPayload = buildConstructiveFeedbackCraftUserPayload({
  analysedDraftText: "Dear Investors,\n\nWe are pleased to update you.",
  signoffVerdict: "Needs targeted revision",
  isReady: false,
  includeOpeningClosing: false,
  outputType: "investor_letter",
});
assert.equal(investorLetterPayload.outputType, OUTPUT_TYPE.INVESTOR_LETTER);
assert.ok(
  investorLetterPayload.instructions.some((line) => line.includes("Output type calibration (Investor letter)"))
);

console.log("constructive-feedback tests: PASS");
console.log("clean draft message:", CLEAN_DRAFT_FEEDBACK_TEXT);
