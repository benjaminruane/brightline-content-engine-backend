import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import {
  STYLE_GUIDE_LAYER_2_CLIENT,
  formatStyleGuideRulesForPrompt,
  resolveStyleGuide,
} from "../lib/qc/style-guide.mjs";
import {
  AUTHORING_ORGANISATION_ENV,
  AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER,
  DEFAULT_AUTHORING_ORGANISATION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
  applyViewMarkerSubjectBounds,
  boundViewMarkerSubjectDirection,
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
  "Every judgement keeps an owner",
  "redundant rather than protective",
  "A first-person fix which makes a claim more confident is a failure of the rule, not a bonus",
  "leave the first-person wording in place",
  "Never infer one",
  "already been confirmed to appear in the draft",
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

function withUnsetHouseEnv(fn) {
  return withHouseEnv("", () => {
    delete process.env[AUTHORING_ORGANISATION_ENV];
    return fn();
  });
}

describe("authoring organisation configuration", () => {
  test("unset env and no argument resolves to null, and the prompt block is the not-identified fallback", () => {
    withUnsetHouseEnv(() => {
      assert.equal(DEFAULT_AUTHORING_ORGANISATION, null);
      assert.equal(resolveAuthoringOrganisationName(), null);
      assert.equal(resolveAuthoringOrganisationName(""), null);
      assert.equal(resolveAuthoringOrganisationName("   "), null);
      const block = formatAuthoringOrganisationPromptBlock(
        "We believe the fund should deliver returns broadly in line with its predecessor."
      );
      assert.match(block, /not identified in this draft/);
      assert.match(block, /leave the first-person wording unchanged/);
      assert.doesNotMatch(block, /Partners Group/);
      assert.doesNotMatch(block, new RegExp(FICTIONAL_HOUSE));
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

  test("request-supplied name beats env; explicit argument beats request", () => {
    withHouseEnv("Env House", () => {
      assert.equal(resolveAuthoringOrganisationName("Request House"), "Request House");
      assert.equal(resolveAuthoringOrganisationName(), "Env House");
      const draft = "Env House, Request House, and Explicit House all appear in this draft.";
      assert.equal(identifyAuthoringOrganisation(draft), "Env House");
      assert.equal(
        identifyAuthoringOrganisation(draft, resolveAuthoringOrganisationName("Request House")),
        "Request House"
      );
      assert.equal(identifyAuthoringOrganisation(draft, "Explicit House"), "Explicit House");
      const requestBlock = formatAuthoringOrganisationPromptBlock(
        draft,
        resolveAuthoringOrganisationName("Request House")
      );
      assert.match(requestBlock, /AUTHORING ORGANISATION: Request House/);
      const explicitBlock = formatAuthoringOrganisationPromptBlock(draft, "Explicit House");
      assert.match(explicitBlock, /AUTHORING ORGANISATION: Explicit House/);
      assert.doesNotMatch(explicitBlock, /Request House/);
      assert.doesNotMatch(explicitBlock, /Env House/);
    });
  });
});

describe("first-person actor identification", () => {
  test("a supplied name present in the draft identifies and produces the substitution block naming it", () => {
    const draft = `In June 2025, ${FICTIONAL_HOUSE} made a commitment to Meridian Capital Partners V.`;
    assert.equal(identifyAuthoringOrganisation(draft, FICTIONAL_HOUSE), FICTIONAL_HOUSE);
    const named = formatAuthoringOrganisationPromptBlock(draft, FICTIONAL_HOUSE);
    assert.match(named, new RegExp(`AUTHORING ORGANISATION: ${FICTIONAL_HOUSE}`));
    assert.match(named, new RegExp(`substitute "${FICTIONAL_HOUSE}"`));
  });

  test("invariant: a supplied name absent from the draft returns null and takes the fallback", () => {
    const draft =
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.";
    assert.equal(identifyAuthoringOrganisation(draft, FICTIONAL_HOUSE), null);
    const unnamed = formatAuthoringOrganisationPromptBlock(draft, FICTIONAL_HOUSE);
    assert.match(unnamed, /not identified in this draft/);
    assert.match(unnamed, /leave the first-person wording unchanged/);
    assert.doesNotMatch(unnamed, new RegExp(FICTIONAL_HOUSE));
    assert.doesNotMatch(unnamed, /Partners Group/);
  });

  test("a draft that mentions a firm which was not supplied does not identify it", () => {
    withUnsetHouseEnv(() => {
      const named =
        "In June 2025, Partners Group made a commitment to Meridian Capital Partners V.";
      assert.equal(identifyAuthoringOrganisation(named), null);
      assert.equal(identifyAuthoringOrganisation("partners group committed to Meridian."), null);
      const block = formatAuthoringOrganisationPromptBlock(named);
      assert.match(block, /not identified in this draft/);
      assert.doesNotMatch(block, /Partners Group/);
    });
  });

  test("does not treat the investment name as the authoring organisation", () => {
    const meridianOnly =
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.";
    assert.equal(identifyAuthoringOrganisation(meridianOnly, FICTIONAL_HOUSE), null);
    assert.equal(
      identifyAuthoringOrganisation("Meridian Capital Partners V has a thin pipeline.", FICTIONAL_HOUSE),
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
    assert.match(
      fictional,
      /Halden Group was attracted to X on the strength of a track record that is exceptional/
    );
    assert.match(fictional, /The pipeline is, in Halden Group's view, thin/);
    assert.doesNotMatch(fictional, /Partners Group/);

    const unset = withUnsetHouseEnv(() => buildFirstPersonActorInstruction());
    assert.match(
      unset,
      new RegExp(`${AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER} was attracted to X`)
    );
    assert.doesNotMatch(unset, /Partners Group/);
    assert.doesNotMatch(unset, new RegExp(FICTIONAL_HOUSE));
  });

  test("style prompt formatting uses the placeholder when no house name is resolved", () => {
    const formatted = formatStyleGuideRulesForPrompt(
      STYLE_GUIDE_LAYER_2_CLIENT.filter((r) => r.id === "first_person_plural")
    );
    assert.match(
      formatted,
      new RegExp(`${AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER} was attracted to Meridian`)
    );
    assert.match(formatted, new RegExp(`available to ${AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER}`));
    assert.match(formatted, /available to us/);
    assert.match(formatted, /fixDirection:/);
    assert.doesNotMatch(formatted, /Partners Group was attracted/);
  });

  test("resolveStyleGuide interpolates a supplied house into first_person_plural examples", () => {
    const rules = resolveStyleGuide({
      outputType: "reporting_commentary",
      authoringOrganisation: FICTIONAL_HOUSE,
    });
    const styleRule = ruleById(rules, "first_person_plural");
    assert.ok(styleRule);
    assert.match(styleRule.correct_example, /Halden Group was attracted to Meridian/);
    assert.match(styleRule.correct_example, /Halden Group believes the fund should deliver/);
    assert.match(styleRule.description, /Halden Group was attracted to X/);
  });

  test("correct examples name the actor; incorrect examples keep first person", () => {
    const styleRule = ruleById(STYLE_GUIDE_LAYER_2_CLIENT, "first_person_plural");
    assert.match(
      styleRule.correct_example,
      new RegExp(`${AUTHORING_ORGANISATION_EXAMPLE_PLACEHOLDER} believes the fund should deliver`)
    );
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

describe("view-marker subject after first-person substitution", () => {
  test("combined first-person subject plus view marker deletes the marker", () => {
    const statement =
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.";
    const converted =
      `Replace 'We were attracted' with '${FICTIONAL_HOUSE} was attracted' and 'in our view' with 'in ${FICTIONAL_HOUSE}'s view'.`;
    const bounded = boundViewMarkerSubjectDirection(statement, converted, FICTIONAL_HOUSE);
    assert.match(bounded, /Halden Group was attracted/);
    assert.match(bounded, /delete 'in our view'/i);
    assert.doesNotMatch(bounded, /in Halden Group's view/);

    const concerns = applyViewMarkerSubjectBounds(
      [
        {
          concernCode: "voice_consistency",
          note: "First-person plural in reporting commentary.",
          suggestedDirection: converted,
        },
      ],
      statement,
      FICTIONAL_HOUSE
    );
    assert.match(concerns[0].suggestedDirection, /delete 'in our view'/i);
    assert.doesNotMatch(concerns[0].suggestedDirection, /in Halden Group's view/);
  });

  test("a view marker whose sentence subject is not the actor stays converted", () => {
    const statement = "The pipeline is, in our view, thin.";
    const direction = `Change 'in our view' to 'in ${FICTIONAL_HOUSE}'s view'.`;
    assert.equal(boundViewMarkerSubjectDirection(statement, direction, FICTIONAL_HOUSE), direction);
  });
});
