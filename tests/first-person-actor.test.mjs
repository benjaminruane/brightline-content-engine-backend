import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import {
  STYLE_GUIDE_LAYER_2_CLIENT,
  formatStyleGuideRulesForPrompt,
} from "../lib/qc/style-guide.mjs";
import {
  FIRST_PERSON_ACTOR_INSTRUCTION,
  droppedModalityHedges,
  formatAuthoringOrganisationPromptBlock,
  identifyAuthoringOrganisation,
  isAgentlessFirstPersonRecast,
  isFirstPersonActorRule,
  isLeaveFirstPersonInPlaceDirection,
} from "../lib/qc/first-person-actor.mjs";

const REQUIRED_PHRASES = [
  "Never delete the actor",
  "was attractive",
  "is considered",
  "is expected to",
  "it is noted that",
  "should deliver",
  "A first-person fix which makes a claim more confident is a failure of the rule, not a bonus",
  "leave the first-person wording in place",
  "illustrative only",
];

function ruleById(rules, id) {
  return rules.find((r) => r.id === id);
}

describe("first-person actor identification", () => {
  test("names Partners Group only when that exact house name is already in the draft", () => {
    const named =
      "In June 2025, Partners Group made a commitment to Meridian Capital Partners V.";
    assert.equal(identifyAuthoringOrganisation(named), "Partners Group");
    assert.equal(
      identifyAuthoringOrganisation("partners group committed to Meridian."),
      "Partners Group"
    );
  });

  test("does not treat the investment name as the authoring organisation", () => {
    const meridianOnly =
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.";
    assert.equal(identifyAuthoringOrganisation(meridianOnly), null);
    assert.equal(
      identifyAuthoringOrganisation("Meridian Capital Partners V has a thin pipeline."),
      null
    );
  });

  test("payload names the actor when present and refuses recast when absent", () => {
    const named = formatAuthoringOrganisationPromptBlock(
      "Partners Group made a commitment to Meridian."
    );
    assert.match(named, /AUTHORING ORGANISATION: Partners Group/);
    assert.match(named, /substitute "Partners Group"/);

    const unnamed = formatAuthoringOrganisationPromptBlock(
      "We believe the fund should deliver returns broadly in line with its predecessor."
    );
    assert.match(unnamed, /not identified/);
    assert.match(unnamed, /leave the first-person wording unchanged/);
    assert.doesNotMatch(unnamed, /Partners Group/);
  });
});

describe("first_person_plural and voice_consistency share the actor contract", () => {
  test("both rule descriptions carry the shared substitution instruction", () => {
    const styleRule = ruleById(STYLE_GUIDE_LAYER_2_CLIENT, "first_person_plural");
    const editorialRule = ruleById(editorialRules, "voice_consistency");
    assert.ok(styleRule);
    assert.ok(editorialRule);
    for (const phrase of REQUIRED_PHRASES) {
      assert.match(styleRule.description, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(
        editorialRule.description,
        new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      );
    }
    assert.equal(styleRule.description.includes(FIRST_PERSON_ACTOR_INSTRUCTION), true);
    assert.equal(editorialRule.description.includes(FIRST_PERSON_ACTOR_INSTRUCTION), true);
  });

  test("style prompt formatting includes worked subject and object examples", () => {
    const formatted = formatStyleGuideRulesForPrompt(
      STYLE_GUIDE_LAYER_2_CLIENT.filter((r) => r.id === "first_person_plural")
    );
    assert.match(formatted, /Partners Group was attracted to Meridian/);
    assert.match(formatted, /available to Partners Group/);
    assert.match(formatted, /available to us/);
    assert.match(formatted, /fixDirection:/);
  });

  test("correct examples name the actor; incorrect examples keep first person", () => {
    const styleRule = ruleById(STYLE_GUIDE_LAYER_2_CLIENT, "first_person_plural");
    assert.match(styleRule.correct_example, /Partners Group believes the fund should deliver/);
    assert.match(styleRule.incorrect_example, /We believe the fund should deliver/);
    assert.match(styleRule.incorrect_example, /available to us/);
  });
});

describe("agentless recast and modality guards", () => {
  test("detects the production agentless recasts", () => {
    assert.equal(
      isAgentlessFirstPersonRecast(
        "Meridian was attractive on the strength of a track record that is, in this analysis, strong"
      ),
      true
    );
    assert.equal(
      isAgentlessFirstPersonRecast(
        "Meridian was attractive due to a track record that is considered strong"
      ),
      true
    );
    assert.equal(
      isAgentlessFirstPersonRecast(
        "the fund is expected to deliver returns broadly in line with its predecessor, and the commitment is recommended"
      ),
      true
    );
    assert.equal(
      isAgentlessFirstPersonRecast(
        "Partners Group believes the fund should deliver returns broadly in line with its predecessor"
      ),
      false
    );
  });

  test("flags a first-person fix that drops should", () => {
    const original =
      "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.";
    const strengthened =
      "Partners Group expects the fund to deliver returns broadly in line with its predecessor and Partners Group recommends the commitment.";
    assert.deepEqual(droppedModalityHedges(original, strengthened), ["should"]);
    const preserved =
      "Partners Group believes the fund should deliver returns broadly in line with its predecessor and Partners Group recommends the commitment.";
    assert.deepEqual(droppedModalityHedges(original, preserved), []);
  });

  test("isFirstPersonActorRule matches both routing codes", () => {
    assert.equal(isFirstPersonActorRule("first_person_plural", "style_guide"), true);
    assert.equal(isFirstPersonActorRule("voice_consistency", null), true);
    assert.equal(isFirstPersonActorRule("marketing_language_excess", "marketing_language_excess"), false);
  });

  test("leave-in-place directions are not treated as recasts", () => {
    assert.equal(
      isLeaveFirstPersonInPlaceDirection(
        "Leave the first-person wording unchanged as the actor could not be named."
      ),
      true
    );
    assert.equal(
      isLeaveFirstPersonInPlaceDirection(
        "Replace 'we believe' with 'Partners Group believes'"
      ),
      false
    );
  });
});
