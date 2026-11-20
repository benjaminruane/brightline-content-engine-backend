import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  PLACEHOLDER_GUARD_MESSAGE,
  applyPlaceholderGuard,
  isExpectedPlaceholderStatement,
  omitExpectedPlaceholderStatements,
  unexpectedPlaceholders,
} from "../lib/prompt-library/placeholder-guard.mjs";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { scanMechanics } from "../lib/qc/mechanics-scan.mjs";
import {
  cautionFindingsForStatement,
  deterministicCautionConcerns,
} from "../lib/qc/general-caution.mjs";
import { lengthFloorWords, sourcesCannotSupportLength } from "../lib/prompt-library/outputTypeGuidance.js";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";

const QUOTE = "[QUOTE: Insert quote from [Speaker Name], [Title]]";
const BOILER = "[BOILERPLATE: About [Firm Name]]";
const PRESS = `[City], [Date].\n${QUOTE}\n${BOILER}`;
const LUMIO = "Lumio is the only kettle that will transform every kitchen.";
const LUMIO_SOURCE = "Lumio is one of several kettles. It costs USD 49. Portland, 12 May 2026. It boils in four minutes.";

describe("B544 expected placeholders", () => {
  test("the brief's placeholders pass, and an invented bracket still fails", () => {
    const allowed = applyPlaceholderGuard(PRESS, "", "Generate");
    assert.equal(allowed.accepted, true);
    assert.equal(allowed.text, PRESS);
    assert.deepEqual(unexpectedPlaceholders(PRESS), []);
    for (const action of ["Generate", "Rewrite", "Adapt"]) {
      const refused = applyPlaceholderGuard("Signed on [transaction date].", "Kept.", action);
      assert.equal(refused.accepted, false);
      assert.equal(refused.text, "Kept.");
      assert.equal(
        refused.message,
        `The ${action} came back with a placeholder in it, so your draft has not changed. Add the missing detail to the draft, or try again.`
      );
    }
    const invented = applyPlaceholderGuard("The [investment name] closed.", "Kept.");
    assert.equal(invented.accepted, false);
    assert.equal(invented.message, PLACEHOLDER_GUARD_MESSAGE);
    assert.equal(applyPlaceholderGuard("In March 2026 it closed.", "Kept.", "Generate").accepted, true);
  });

  test("a placeholder statement is not a claim, and house style ignores it", () => {
    assert.equal(isExpectedPlaceholderStatement(QUOTE), true);
    assert.equal(isExpectedPlaceholderStatement("[City], [Date]."), true);
    assert.equal(isExpectedPlaceholderStatement("Lumio launched in Portland."), false);
    const stage = omitExpectedPlaceholderStatements({
      statements: [{ text: QUOTE }, { text: "Lumio launched in Portland." }, { text: BOILER }],
      droppedNonClaims: [],
    });
    assert.deepEqual(stage.statements.map((row) => row.text), ["Lumio launched in Portland."]);
    assert.equal(stage.droppedNonClaims.length, 2);
    const kept = applyDeterministicStyleFilters(
      [{ concernCode: "english_variant", note: "colour", span: [{ startChar: 0, endChar: 6 }] }],
      "[City], [Date].",
      "[City], [Date].",
      { outputType: "press_release" }
    );
    assert.equal(kept.length, 0);
    const flagged = scanMechanics({
      statement: "We announced 50 per cent in [City].",
      outputType: "press_release",
    });
    assert.equal(flagged.some((row) => row.concernCode === "percentage_notation"), true);
  });
});

describe("B544 caution on General texts", () => {
  test("the planted absolute is a Caution finding, and a supported word is not", () => {
    const rows = deterministicCautionConcerns(LUMIO, [{ text: LUMIO_SOURCE }], { visibility: "public" });
    assert.equal(rows.some((row) => row.concernCode === "caution_absolute"), true);
    assert.match(rows.find((row) => row.concernCode === "caution_absolute").note, /only/);
    const supported = deterministicCautionConcerns(
      "It is the only kettle in every kitchen.",
      [{ text: "This is the only kettle, and it belongs in every kitchen." }]
    );
    assert.equal(supported.some((row) => row.concernCode === "caution_absolute"), false);
  });

  test("the six rules fire on General writing and stay off for an investment run", () => {
    const sources = [{ text: "The product costs USD 49." }];
    const codes = (sentence, visibility) => deterministicCautionConcerns(sentence, sources, { visibility })
      .map((row) => row.concernCode);
    assert.ok(codes("We guarantee a full refund.").includes("caution_promise"));
    assert.ok(codes("The launch is certain to succeed.").includes("caution_prediction"));
    assert.ok(codes("You should buy this kettle.").includes("caution_advice"));
    assert.equal(codes("You should buy this kettle if you need one.").includes("caution_advice"), false);
    assert.ok(codes("The confidential terms are attached.", "public").includes("caution_private_detail"));
    assert.equal(codes("The confidential terms are attached.", "complete").includes("caution_private_detail"), false);
    assert.ok(codes("Harbourline Foods is corrupt.").includes("caution_damaging_claim"));
    assert.deepEqual(cautionFindingsForStatement(LUMIO, sources, null), []);
    assert.equal(
      cautionFindingsForStatement(LUMIO, sources, { caution: true, visibility: "public" })
        .some((row) => row.concernCode === "caution_absolute"),
      true
    );
    const reviewer = readFileSync(new URL("../lib/qc/editorial-compliance-reviewer.mjs", import.meta.url), "utf8");
    assert.match(reviewer, /cautionFindingsForStatement/);
    assert.match(reviewer, /caution: true/);
  });
});

describe("B544 general length", () => {
  test("the floor is the range or the typed limit, and a short source waives below-range", () => {
    assert.equal(lengthFloorWords("GENERAL_TEXT", null), 150);
    assert.equal(lengthFloorWords("GENERAL_TEXT", 80), 80);
    assert.equal(sourcesCannotSupportLength(40, 150), true);
    assert.equal(sourcesCannotSupportLength(150, 150), false);
    assert.equal(sourcesCannotSupportLength(400, 150), false);
    const generate = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
    assert.doesNotMatch(generate, /writing-generate-lengthen/);
    assert.match(generate, /sourcesCannotSupportLength/);
  });
});

describe("B544 house style for a new account", () => {
  test("US comma writes 5,500 and US spelling, and UK writes UK spelling, in the brief and the check", () => {
    const brief = buildBasePrompt({
      eventType: "GENERAL",
      outputType: "GENERAL_TEXT",
      visibility: "public",
      houseStyle: { spelling: "US", thousands: "comma" },
    }).basePromptText;
    assert.match(brief, /5,500/);
    assert.match(brief, /US English/);
    assert.equal(brief.includes("Use the apostrophe"), false);
    const ukBrief = buildBasePrompt({
      eventType: "GENERAL",
      outputType: "GENERAL_TEXT",
      visibility: "public",
      houseStyle: { spelling: "UK", thousands: "comma" },
    }).basePromptText;
    assert.match(ukBrief, /UK English/);
    assert.equal(ukBrief.includes("Write in US English throughout."), false);
    const commaRules = resolveStyleGuide({
      outputType: "GENERAL_TEXT",
      houseStyle: { spelling: "US", thousands: "comma" },
    });
    assert.match(commaRules.find((rule) => rule.id === "thousand_separator").description, /5,500/);
    assert.match(commaRules.find((rule) => rule.id === "english_variant").description, /US English/);
    const ukRules = resolveStyleGuide({
      outputType: "GENERAL_TEXT",
      houseStyle: { spelling: "UK", thousands: "apostrophe" },
    });
    assert.match(ukRules.find((rule) => rule.id === "english_variant").description, /UK English/);
  });
});
