import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import {
  STYLE_GUIDE_LAYER_2_CLIENT,
  formatStyleGuideRulesForPrompt,
} from "../lib/qc/style-guide.mjs";
import {
  AUTHORING_ORGANISATION_ENV,
  DEFAULT_AUTHORING_ORGANISATION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
  buildFirstPersonActorInstruction,
  droppedModalityHedges,
  formatAuthoringOrganisationPromptBlock,
  identifyAuthoringOrganisation,
  isAgentlessFirstPersonRecast,
  isFirstPersonActorRule,
  isLeaveFirstPersonInPlaceDirection,
  resolveAuthoringOrganisationName,
} from "../lib/qc/first-person-actor.mjs";

const FICTIONAL_HOUSE = "Halden Group";

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

function withHouseEnv(name, fn) {
  const prev = process.env[AUTHORING_ORGANISATION_ENV];
  process.env[AUTHORING_ORGANISATION_ENV] = name;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[AUTHORING_ORGANISATION_ENV];
    else process.env[AUTHORING_ORGANISATION_ENV] = prev;
  }
}

describe("authoring organisation configuration", () => {
  test("defaults to the production house name when env is unset", () => {
    withHouseEnv("", () => {
      delete process.env[AUTHORING_ORGANISATION_ENV];
      assert.equal(resolveAuthoringOrganisationName(), DEFAULT_AUTHORING_ORGANISATION);
      assert.equal(DEFAULT_AUTHORING_ORGANISATION, "Partners Group");
    });
  });

  test("env override is the only name that matches, and fixtures can pass a name without env", () => {
    withHouseEnv(FICTIONAL_HOUSE, () => {
      assert.equal(resolveAuthoringOrganisationName(), FICTIONAL_HOUSE);
      assert.equal(
        identifyAuthoringOrganisation(`In June 2025, ${FICTIONAL_HOUSE} made a commitment.`),
        FICTIONAL_HOUSE
      );
      assert.equal(
        identifyAuthoringOrganisation("Partners Group made a commitment."),
        null
      );
    });
    assert.equal(
      identifyAuthoringOrganisation(
        `${FICTIONAL_HOUSE} made a commitment.`,
        FICTIONAL_HOUSE
      ),
      FICTIONAL_HOUSE
    );
    assert.equal(
      identifyAuthoringOrganisation("Partners Group made a commitment.", FICTIONAL_HOUSE),
      null
    );
  });
});

describe("first-person actor identification", () => {
  test("names the default house only when that exact name is already in the draft", () => {
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
      `${FICTIONAL_HOUSE} made a commitment to Meridian.`,
      FICTIONAL_HOUSE
    );
    assert.match(named, new RegExp(`AUTHORING ORGANISATION: ${FICTIONAL_HOUSE}`));
    assert.match(named, new RegExp(`substitute "${FICTIONAL_HOUSE}"`));

    const unnamed = formatAuthoringOrganisationPromptBlock(
      "We believe the fund should deliver returns broadly in line with its predecessor.",
      FICTIONAL_HOUSE
    );
    assert.match(unnamed, /not identified/);
    assert.match(unnamed, /leave the first-person wording unchanged/);
    assert.doesNotMatch(unnamed, new RegExp(FICTIONAL_HOUSE));
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

  test("instruction builder substitutes the configured house into the same example slots", () => {
    const fictional = buildFirstPersonActorInstruction(FICTIONAL_HOUSE);
    assert.match(fictional, /Halden Group was attracted to X/);
    assert.match(fictional, /Halden Group believes the fund should Y/);
    assert.match(fictional, /available to Halden Group/);
    assert.match(fictional, /in Halden Group's view/);
    assert.doesNotMatch(fictional, /Partners Group/);
  });

  test("style prompt formatting includes worked subject and object examples under the production default", () => {
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
        `${FICTIONAL_HOUSE} believes the fund should deliver returns broadly in line with its predecessor`
      ),
      false
    );
  });

  test("flags a first-person fix that drops should", () => {
    const original =
      "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.";
    const strengthened =
      `${FICTIONAL_HOUSE} expects the fund to deliver returns broadly in line with its predecessor and ${FICTIONAL_HOUSE} recommends the commitment.`;
    assert.deepEqual(droppedModalityHedges(original, strengthened), ["should"]);
    const preserved =
      `${FICTIONAL_HOUSE} believes the fund should deliver returns broadly in line with its predecessor and ${FICTIONAL_HOUSE} recommends the commitment.`;
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
        `Replace 'we believe' with '${FICTIONAL_HOUSE} believes'`
      ),
      false
    );
  });
});
