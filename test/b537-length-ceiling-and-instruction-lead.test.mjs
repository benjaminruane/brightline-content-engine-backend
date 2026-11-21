/**
 * B537. The length line states a numbered ceiling. Other update leads with its
 * instruction. Generate, rewrite and adapt straighten quotes and dashes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { normalizePgHouseStyleCharacters } from "../lib/prompt-library/house-characters.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { lengthAllowanceWords, lengthInstruction } from "../lib/prompt-library/outputTypeGuidance.js";

describe("B537 length ceiling and Other update", () => {
  test("the range stays, and the ceiling is a number rather than a percentage", () => {
    assert.equal(lengthAllowanceWords(150), 165);
    assert.equal(lengthAllowanceWords(300), 330);
    assert.equal(lengthAllowanceWords(250), 275);
    const range = lengthInstruction("REPORTING_COMMENTARY");
    assert.equal((range.match(/Length:/g) || []).length, 1);
    assert.equal(range.includes("Length: no more than 150 words."), true);
    assert.equal(range.includes("165"), false);
    assert.equal(range.includes("100 to 150"), false);
    assert.equal(range.includes("Do not add a sentence the sources do not support to reach a length."), true);
    assert.equal(range.includes("10%"), false);
    assert.equal(range.includes("leave out the least important point"), false);
    const typed = lengthInstruction("REPORTING_COMMENTARY", 250);
    assert.equal(typed.includes("Length: no more than 250 words."), true);
    assert.equal(typed.includes("275"), false);
    assert.equal(typed.includes("100 to 150"), false);
  });

  test("optional points wait until the essentials are covered", () => {
    const exit = buildBasePrompt({
      eventType: "DIRECT_INVESTMENT_EXIT",
      outputType: "investor_letter",
      visibility: "complete",
    });
    assert.equal(
      exit.basePromptText.includes(
        "Where space allows. These points are optional. Include one only when the essentials are covered and room remains. Omit every one of them if including it would pass 300 words. Do not write a section called where space allows."
      ),
      true
    );
    const direct = buildBasePrompt({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "investor_letter",
      visibility: "complete",
    });
    assert.equal(direct.basePromptText.includes("priorities, not a checklist"), true);
    assert.equal(direct.basePromptText.includes("Where space allows."), false);
    assert.equal(direct.basePromptText.includes("Do not drop an essential point."), true);
  });

  test("Other update leads with the special instructions and leaves out the rest", () => {
    const asked = "Summarise the semiconductor segment outlook for clients.";
    const { basePromptText } = buildBasePrompt({
      eventType: "SPECIAL_TOPIC",
      outputType: "reporting_commentary",
      visibility: "complete",
      specialInstructions: asked,
    });
    assert.equal(basePromptText.includes(`Special instructions: ${asked}`), true);
    assert.equal(basePromptText.includes("These instructions define the subject and the lead."), true);
    assert.equal(basePromptText.includes("Leave out source material that does not serve that purpose."), true);
    assert.equal(basePromptText.includes("cover what happened, implications, and actions"), false);
    const missing = buildBasePrompt({
      eventType: "SPECIAL_TOPIC",
      outputType: "reporting_commentary",
      visibility: "complete",
    });
    assert.equal(
      missing.basePromptText.includes("Special instructions were not provided. Do not choose a subject, and do not write a general update."),
      true
    );
  });

  test("a draft is straightened before generate, rewrite, or adapt returns it", () => {
    const raw = "The firm\u2019s view \u2014 growth of 5\u20136% \u201Cthis year\u201D.";
    assert.equal(normalizePgHouseStyleCharacters(raw), "The firm's view - growth of 5-6% \"this year\".");
    const helper = readFileSync(new URL("../lib/qc/draft-house-style.mjs", import.meta.url), "utf8");
    assert.equal(helper.includes("normalizePgHouseStyleCharacters"), true);
    for (const file of ["api/generate.js", "api/rewrite.js", "api/adapt.js"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.equal(source.includes("applyDraftHouseStyle"), true, file);
    }
  });
});
