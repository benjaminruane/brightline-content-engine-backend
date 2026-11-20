import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EVENT_TYPE, getEventTypeLabel } from "../lib/event-type.js";
import { OUTPUT_TYPE, getOutputTypeLabel, visibilityForDraft } from "../lib/output-intent.js";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { generalMethodologyNoteInstruction } from "../lib/prompt-library/methodology-note.mjs";
import { cautionRulesForRun } from "../lib/qc/general-caution.mjs";
import { combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { writerFeedbackInstructions } from "../lib/qc/reading-review.mjs";

describe("B543 General text type", () => {
  test("General and General text are registered, and press and LinkedIn stay public", () => {
    assert.equal(getEventTypeLabel(EVENT_TYPE.GENERAL), "General");
    assert.equal(getOutputTypeLabel(OUTPUT_TYPE.GENERAL_TEXT), "General text");
    assert.equal(visibilityForDraft(OUTPUT_TYPE.GENERAL_TEXT, "complete"), "COMPLETE");
    assert.equal(visibilityForDraft(OUTPUT_TYPE.PRESS_RELEASE, "complete"), "PUBLIC");
    assert.equal(visibilityForDraft(OUTPUT_TYPE.LINKEDIN_POST, "complete"), "PUBLIC");
  });

  test("a General brief has no investment framing and keeps a general Methodology Note", () => {
    const text = buildBasePrompt({
      eventType: EVENT_TYPE.GENERAL,
      outputType: OUTPUT_TYPE.GENERAL_TEXT,
      visibility: "complete",
    }).basePromptText;
    assert.equal(text.includes("Do not invent facts"), true);
    assert.equal(text.includes("transaction commentary"), false);
    assert.equal(text.includes("portfolio company"), false);
    assert.equal(text.includes("The firm has received approval"), false);
    assert.equal(text.includes(generalMethodologyNoteInstruction()), true);
    assert.equal(text.includes("Write the transaction commentary first."), false);
  });

  test("the six cautions are soft, the public-only rule drops on Complete, and a caution card is grey", () => {
    const publicRules = cautionRulesForRun("PUBLIC");
    assert.equal(publicRules.length, 6);
    assert.equal(publicRules.every((rule) => rule.severity === "soft_concern"), true);
    assert.equal(cautionRulesForRun("COMPLETE").some((rule) => rule.id === "caution_private_detail"), false);
    const caution = combinedVerdict({
      verdict: { state: "nothing_raised" },
      editorialConcerns: [],
      complianceVerdict: "soft_concern",
      complianceConcerns: [{ rule: "caution_absolute" }],
    });
    assert.equal(caution.state, "caution");
    assert.equal(caution.tone, "grey");
    assert.equal(caution.label, "Caution");
    const hard = combinedVerdict({
      verdict: { state: "nothing_raised" },
      editorialConcerns: [],
      complianceVerdict: "hard_concern",
      complianceConcerns: [{ rule: "promissory_or_guaranteed_language" }],
    });
    assert.equal(hard.state, "compliance_risk");
    assert.equal(hard.tone, "red");
  });

  test("the reviewer's note for General reads the general brief and does not call it an investment note", () => {
    const note = writerFeedbackInstructions({
      eventType: EVENT_TYPE.GENERAL,
      outputType: OUTPUT_TYPE.GENERAL_TEXT,
      visibility: "complete",
    });
    assert.equal(note.includes("General text"), true);
    assert.equal(note.includes("The text type is General."), true);
    assert.equal(note.includes("Never call it an investment note."), true);
    assert.equal(note.includes("Do not invent facts"), true);
    assert.equal(note.includes("portfolio company"), false);
  });
});
