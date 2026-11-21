/**
 * B536. Every assembled drafting brief has one instruction on audience, voice,
 * greeting, fund figures, and length. Press and LinkedIn stay public.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EVENT_TYPE } from "../lib/event-type.js";
import { OUTPUT_TYPE, getPromptGuidance, visibilityForDraft } from "../lib/output-intent.js";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { writerFeedbackInstructions } from "../lib/qc/reading-review.mjs";

const TEXT_TYPES = Object.values(EVENT_TYPE).filter((id) => id !== "GENERAL");
const OUTPUT_TYPES = Object.values(OUTPUT_TYPE).filter((id) => id !== "GENERAL_TEXT");
const VERSIONS = ["complete", "public"];

const AUDIENCE = {
  [OUTPUT_TYPE.PRESS_RELEASE]: "Written for the media and the public.",
  [OUTPUT_TYPE.LINKEDIN_POST]: "Written for a professional network.",
};
const CLIENTS = "Written for the firm's clients and investors.";

function brief(eventType, outputType, visibility, maxWords) {
  return buildBasePrompt({ eventType, outputType, visibility, maxWords }).basePromptText;
}

describe("B536 assembled prompts", () => {
  test("all 88 briefs agree with themselves, and each has one length line", () => {
    assert.equal(TEXT_TYPES.length * OUTPUT_TYPES.length * VERSIONS.length, 88);
    for (const eventType of TEXT_TYPES) {
      for (const outputType of OUTPUT_TYPES) {
        for (const visibility of VERSIONS) {
          const text = brief(eventType, outputType, visibility);
          const name = `${eventType} ${outputType} ${visibility}`;
          assert.equal((text.match(/Length:/g) || []).length, 1, name);
          assert.equal(text.includes("leave out the least important point"), false, name);
          assert.equal(text.includes("Call it that"), false, name);
          assert.equal(text.includes("Do not give it another name"), false, name);
          assert.equal(text.includes("Dear valued"), false, name);
          const audience = AUDIENCE[outputType] || CLIENTS;
          assert.equal(text.includes(audience), true, name);
          for (const other of [CLIENTS, ...Object.values(AUDIENCE)]) {
            if (other !== audience) assert.equal(text.includes(other), false, name);
          }
          const we = text.includes("Write as the firm, in the first person plural (we, our).");
          const firmVoice = outputType === OUTPUT_TYPE.INVESTOR_LETTER || outputType === OUTPUT_TYPE.LINKEDIN_POST;
          assert.equal(we, firmVoice, name);
          if (!firmVoice) assert.equal(/third[- ]person/i.test(text), true, name);
          if (outputType === OUTPUT_TYPE.INVESTOR_LETTER) {
            assert.equal(text.includes("Dear Investors,"), true, name);
          } else {
            assert.equal(text.includes("Dear Investors,"), false, name);
          }
          if (outputType === OUTPUT_TYPE.PRESS_RELEASE || outputType === OUTPUT_TYPE.LINKEDIN_POST) {
            assert.equal(text.includes("full internal brief"), false, name);
            assert.equal(text.includes("Use publicly safe wording"), true, name);
          }
          if (outputType === OUTPUT_TYPE.PRESS_RELEASE) {
            assert.equal(text.includes("[City], [Date]"), true, name);
          }
        }
      }
    }
  });

  test("a typed limit is the only length, and LinkedIn and press stay public", () => {
    const typed = brief(EVENT_TYPE.NEW_PRIMARY_COMMITMENT, OUTPUT_TYPE.REPORTING_COMMENTARY, "complete", 250);
    assert.equal((typed.match(/Length:/g) || []).length, 1);
    assert.equal(typed.includes("Length: no more than 250 words."), true);
    assert.equal(typed.includes("100 to 150"), false);
    assert.equal(visibilityForDraft(OUTPUT_TYPE.LINKEDIN_POST, "complete"), "PUBLIC");
    assert.equal(visibilityForDraft(OUTPUT_TYPE.PRESS_RELEASE, "complete"), "PUBLIC");
    const linkedIn = getPromptGuidance(OUTPUT_TYPE.LINKEDIN_POST, "complete");
    assert.equal(linkedIn.includes("full internal brief"), false);
    const press = getPromptGuidance(OUTPUT_TYPE.PRESS_RELEASE, "complete");
    assert.equal(press.includes("[City], [Date]"), true);
    assert.equal(press.includes("full internal brief"), false);
  });

  test("the reviewer's note names the text and may refer to it naturally", () => {
    const note = writerFeedbackInstructions({
      eventType: EVENT_TYPE.NEW_PRIMARY_COMMITMENT,
      outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
      visibility: "complete",
    });
    assert.equal(note.includes("Reporting commentary"), true);
    assert.equal(note.includes("New fund commitment"), true);
    assert.equal(note.includes("Refer to it naturally"), true);
    assert.equal(note.includes("Never call it something it is not"), true);
    assert.equal(note.includes("Call it that. Do not give it another name."), false);
  });
});
