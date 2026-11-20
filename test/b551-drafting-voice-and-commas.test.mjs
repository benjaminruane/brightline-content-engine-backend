/**
 * B551. A serial comma is only added to a list of three or more.
 * Drafts state the decision as made, and only new direct and add-on
 * drop the ban on the firm's own investment amount.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EVENT_TYPE } from "../lib/event-type.js";
import { OUTPUT_TYPE } from "../lib/output-intent.js";
import { NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { applyListCommas } from "../lib/qc/list-comma-scan.mjs";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";

const US = {
  outputType: "reporting_commentary",
  houseStyle: NEW_ACCOUNT_HOUSE_STYLE,
};

function unchanged(sentence) {
  assert.equal(applyListCommas(sentence), sentence);
  assert.equal(applyDraftHouseStyle(sentence, US), sentence);
}

function brief(eventType, outputType) {
  return buildBasePrompt({
    eventType,
    outputType,
    visibility: "complete",
  }).basePromptText;
}

describe("B551 commas and drafting voice", () => {
  test("two-item phrases stay unchanged, and a three-item list gains its comma", () => {
    unchanged("The transaction values Harbourline, a UK and Irish chilled prepared foods producer, at an enterprise value of GBP 420 million.");
    unchanged("Operationally, medical and aerospace demand remains solid and in line with the original investment case.");
    unchanged("This commentary was created from the Q3 2026 Fund IV report, extracting and synthesizing only supported facts.");
    unchanged("While logo churn is typical for SMB-focused models, cohort behavior and rising ARPU support attractive unit economics.");
    const both = "We view intrinsic value as stemming from an asset's earning power, both current and potential.";
    assert.equal(applyListCommas(both), both);
    assert.equal(applyDraftHouseStyle(both, { outputType: "investor_letter", houseStyle: NEW_ACCOUNT_HOUSE_STYLE }), both);
    assert.equal(
      applyListCommas("The fund focuses on the DACH region, the Benelux and the Nordics."),
      "The fund focuses on the DACH region, the Benelux, and the Nordics."
    );
    assert.equal(
      applyDraftHouseStyle("We invested USD 5 million. The firm views the themes.", US),
      "The firm invested USD 5 million. The firm views the themes."
    );
    assert.equal(
      applyDraftHouseStyle("We invested USD 5 million.", { outputType: "investor_letter", houseStyle: NEW_ACCOUNT_HOUSE_STYLE }),
      "We invested USD 5 million."
    );
    assert.equal(
      applyDraftHouseStyle('"We will keep the plant," the chief executive said.', { outputType: "press_release", houseStyle: NEW_ACCOUNT_HOUSE_STYLE }),
      '"We will keep the plant," the chief executive said.'
    );

    const three = "The fund owns ships, trains and planes.";
    assert.equal(applyDraftHouseStyle(three, US), "The fund owns ships, trains, and planes.");
    assert.equal(
      applyListCommas("The deal team included legal, tax and operations advisers."),
      "The deal team included legal, tax, and operations advisers."
    );
  });

  test("the shared instruction states the decision as made, and the voices do not mix", () => {
    const commentary = brief(EVENT_TYPE.NEW_PRIMARY_COMMITMENT, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const letter = brief(EVENT_TYPE.NEW_PRIMARY_COMMITMENT, OUTPUT_TYPE.INVESTOR_LETTER);
    const linkedin = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.LINKEDIN_POST);
    const press = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.PRESS_RELEASE);
    for (const text of [commentary, letter, linkedin, press]) {
      assert.equal(text.includes("State the firm's decision as made"), true);
      assert.equal(text.includes("Do not write recommended, proposed, seek approval, or is recommended to."), true);
      assert.equal(text.includes("Do not add a closing sentence that only repeats points already made."), true);
      assert.equal(text.includes("Words up to the ceiling are tolerance, not a target."), true);
      assert.equal(text.includes("cover that point before the draft stops short of the range."), true);
      assert.equal(text.includes("Describe only what the draft actually contains."), true);
    }
    assert.equal(commentary.includes("Third-person by default (the firm, the company, it, they)."), true);
    assert.equal(commentary.includes("Write as the firm, in the first person plural (we, our)."), false);
    assert.equal(letter.includes("Write as the firm, in the first person plural (we, our)."), true);
    assert.equal(letter.includes("Dear Investors,"), true);
    assert.equal(linkedin.includes("Write as the firm, in the first person plural (we, our)."), true);
    assert.equal(linkedin.includes("Third-person throughout (the firm). Do not use we."), false);
    assert.equal(press.includes("third-person"), true);
    assert.equal(commentary.includes("Dear Investors,"), false);
  });

  test("only new direct and add-on drop the ban on the firm's own investment amount", () => {
    const ban = "or the size of the firm's own investment";
    const direct = brief(EVENT_TYPE.NEW_DIRECT_INVESTMENT, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const addon = brief(EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const fund = brief(EVENT_TYPE.NEW_PRIMARY_COMMITMENT, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const call = brief(EVENT_TYPE.FUND_CAPITAL_CALL, OUTPUT_TYPE.INVESTOR_LETTER);
    assert.equal(direct.includes(ban), false);
    assert.equal(addon.includes(ban), false);
    assert.equal(direct.includes("The firm's own investment amount may be stated."), true);
    assert.equal(fund.includes(ban), true);
    assert.equal(call.includes(ban), true);
    assert.equal(
      fund.includes("Do not state cash amounts that were committed, called, distributed, or invested, or the size of the firm's own investment, unless the special instructions ask for them."),
      true
    );
  });
});
