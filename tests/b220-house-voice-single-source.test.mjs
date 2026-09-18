/**
 * B220: one house-voice table. Failure names the frontend mirror.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { getPromptGuidance, OUTPUT_TYPE } from "../lib/output-intent.js";
import { STYLE_GUIDE_LAYER_2_CLIENT } from "../lib/qc/style-guide.mjs";
import { outputTypeGuidance } from "../lib/prompt-library/outputTypeGuidance.js";
import {
  FIRST_PERSON_HOUSE_VOICE_SLUGS,
  THIRD_PERSON_HOUSE_VOICE_SLUGS,
  houseVoiceIsThirdPerson,
} from "../lib/qc/first-person-actor.mjs";
import {
  HOUSE_VOICE_TABLE,
  FIRST_PERSON_HOUSE_VOICE_SLUGS as TABLE_FIRST,
  THIRD_PERSON_HOUSE_VOICE_SLUGS as TABLE_THIRD,
} from "../lib/prompt-library/house-voice.mjs";

const DRIFT =
  "HOUSE_VOICE_TABLE must match frontend src/constants/houseVoice.js";

const EXPECTED_TABLE = [
  { slug: "reporting_commentary", person: "third person" },
  { slug: "investor_letter", person: "first person plural" },
  { slug: "linkedin_post", person: "first person plural" },
  { slug: "press_release", person: "third person" },
];

describe("B220 house voice single source", () => {
  test("table is the D1 ruling, verbatim", () => {
    assert.deepEqual(HOUSE_VOICE_TABLE, EXPECTED_TABLE, DRIFT);
  });

  test("press_release is third person, not first-person plural", () => {
    assert.equal(houseVoiceIsThirdPerson("press_release"), true, DRIFT);
    assert.equal(THIRD_PERSON_HOUSE_VOICE_SLUGS.includes("press_release"), true, DRIFT);
    assert.equal(FIRST_PERSON_HOUSE_VOICE_SLUGS.includes("press_release"), false, DRIFT);
  });

  test("first-person-actor re-exports the same lists as house-voice.mjs", () => {
    assert.deepEqual(FIRST_PERSON_HOUSE_VOICE_SLUGS, TABLE_FIRST, DRIFT);
    assert.deepEqual(THIRD_PERSON_HOUSE_VOICE_SLUGS, TABLE_THIRD, DRIFT);
  });

  test("editorial voice_consistency description does not call press releases first-person plural", () => {
    const rule = editorialRules.find((r) => r.id === "voice_consistency");
    assert.ok(rule);
    const text = String(rule.description || "");
    assert.equal(
      /press releases.{0,40}first-person plural/i.test(text),
      false,
      DRIFT
    );
    assert.match(text, /third-person/i);
  });

  test("style-guide first_person_plural description does not list press_release as acceptable", () => {
    const rule = STYLE_GUIDE_LAYER_2_CLIENT.find((r) => r.id === "first_person_plural");
    assert.ok(rule);
    const text = String(rule.description || "");
    assert.equal(/is acceptable in[^.]*press_release/i.test(text), false, DRIFT);
    assert.deepEqual(rule.applies_to, ["reporting_commentary"]);
  });

  test("getPromptGuidance states third person for a press release", () => {
    const text = getPromptGuidance(OUTPUT_TYPE.PRESS_RELEASE, "COMPLETE");
    assert.match(text, /third-person/i, DRIFT);
  });

  test("outputTypeGuidance press release tone is third person", () => {
    const tone = outputTypeGuidance[OUTPUT_TYPE.PRESS_RELEASE].toneVoice.join(" ");
    assert.match(tone, /third-person/i, DRIFT);
    assert.equal(/first-person plural for the GP/i.test(tone), false, DRIFT);
  });
});
