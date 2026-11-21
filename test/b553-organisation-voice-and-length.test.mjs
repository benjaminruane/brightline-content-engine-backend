/**
 * B553. "we" and "the firm" mean the authoring organisation.
 * Another author's views stay credited, and the model is told the top of the range.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { EVENT_TYPE } from "../lib/event-type.js";
import { OUTPUT_TYPE } from "../lib/output-intent.js";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { HOUSE_VOICE_TABLE } from "../lib/prompt-library/house-voice.mjs";
import { authoringOrganisationText } from "../lib/prompt-library/house-rules.mjs";
import {
  lengthAllowanceWords,
  lengthInstruction,
  modelLengthLimit,
} from "../lib/prompt-library/outputTypeGuidance.js";

function brief(eventType, outputType, authoringOrganisation) {
  return buildBasePrompt({
    eventType,
    outputType,
    visibility: "complete",
    authoringOrganisation,
  }).basePromptText;
}

describe("B553 organisation voice and length", () => {
  test("an unnamed organisation is loud, and a named one is the only we", () => {
    assert.equal(
      authoringOrganisationText(""),
      "No authoring organisation was named. Do not speak as a company, fund or manager in the sources."
    );
    assert.equal(authoringOrganisationText(null).startsWith("No authoring organisation was named."), true);
    const unnamed = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.LINKEDIN_POST, "");
    assert.equal(unnamed.includes("No authoring organisation was named."), true);
    assert.equal(
      unnamed.includes("name the subject and write about it in the third person, in every output type, including an investor letter and a LinkedIn post."),
      true
    );
    assert.equal(unnamed.includes("Do not use we or the firm for that subject."), true);
    const named = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.LINKEDIN_POST, "ClearPoint Neuro");
    assert.equal(named.includes("The authoring organisation is ClearPoint Neuro."), true);
    assert.equal(named.includes("The words the firm and we mean only ClearPoint Neuro."), true);
    assert.equal(named.includes("Speak as ClearPoint Neuro only when the source is about ClearPoint Neuro."), true);
    assert.equal(named.includes("No authoring organisation was named."), false);
    const linkedin = HOUSE_VOICE_TABLE.find((row) => row.slug === "linkedin_post");
    assert.equal(linkedin.person, "first person plural");
    assert.equal(named.includes("Write as the firm, in the first person plural (we, our)."), true);
    assert.equal(named.includes("LinkedIn posts and investor letters use we only when they speak as the authoring organisation."), true);
  });

  test("another author's views stay credited, and the firm is not given a portfolio", () => {
    const letter = brief(EVENT_TYPE.SPECIAL_TOPIC, OUTPUT_TYPE.INVESTOR_LETTER, "");
    const press = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.PRESS_RELEASE, "3i Group plc");
    for (const text of [letter, press]) {
      assert.equal(text.includes("The credit carries through the draft, as in Marks argues or in Oaktree's view."), true);
      assert.equal(
        text.includes("Do not state the firm's own actions, holdings, positioning or decisions unless the source states them as the firm's."),
        true
      );
      assert.equal(text.includes("If the source gives no firm positioning, do not invent one."), true);
      assert.equal(text.includes("The draft may end on the author's conclusion, credited to that author."), true);
      assert.equal(text.includes("Do not describe another author's views as the firm's."), true);
      assert.equal(text.includes("The fund distributes and the firm receives.") || text.includes("who paid, who received, who bought and who sold"), true);
    }
    assert.equal(letter.includes("The fund distributes and the firm receives."), false);
    const distribution = brief(EVENT_TYPE.FUND_DISTRIBUTION, OUTPUT_TYPE.REPORTING_COMMENTARY, "");
    assert.equal(distribution.includes("The fund distributes and the firm receives."), true);
  });

  test("the model is told the top of the range, and the allowance stays a trim", () => {
    assert.equal(modelLengthLimit("REPORTING_COMMENTARY"), 150);
    assert.equal(modelLengthLimit("INVESTOR_LETTER"), 300);
    assert.equal(modelLengthLimit("GENERAL_TEXT"), 250);
    assert.equal(modelLengthLimit("REPORTING_COMMENTARY", 80), 80);
    assert.equal(lengthAllowanceWords(150), 165);
    assert.equal(lengthAllowanceWords(300), 330);
    const line = lengthInstruction("REPORTING_COMMENTARY");
    assert.equal(line.includes("Length: no more than 150 words."), true);
    assert.equal(line.includes("165"), false);
    assert.equal(line.includes("10%"), false);
    const letter = brief(EVENT_TYPE.NEW_DIRECT_INVESTMENT, OUTPUT_TYPE.INVESTOR_LETTER, "");
    assert.equal(letter.includes("The top of the length range is the limit."), true);
    assert.equal(letter.includes("Words up to the ceiling are tolerance, not a target."), false);
    assert.equal(letter.includes("cover that point before the draft stops short of the range."), true);
    assert.equal(letter.includes("Length: no more than 300 words."), true);
    assert.equal(letter.includes("330"), false);
    const generate = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
    assert.equal(generate.includes("Hard length ceiling: ${modelLimit} words."), true);
    assert.equal(generate.includes("at most ${modelLimit} words"), true);
    assert.equal(generate.includes("fitToWordCeiling(currentDraftText, ceilingWords)"), true);
    assert.equal(generate.includes("const ceilingWords = lengthAllowanceWords(effectiveMaxWords);"), true);
    assert.equal(generate.includes("fitToWordCeiling(currentDraftText, modelLimit)"), false);
  });
});
