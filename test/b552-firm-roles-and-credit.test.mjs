/**
 * B552. "the firm" and "we" mean only the user's firm.
 * Another manager's views are credited. LinkedIn posts say we.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EVENT_TYPE } from "../lib/event-type.js";
import { OUTPUT_TYPE } from "../lib/output-intent.js";
import { NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { HOUSE_VOICE_TABLE } from "../lib/prompt-library/house-voice.mjs";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";

function brief(eventType, outputType) {
  return buildBasePrompt({ eventType, outputType, visibility: "complete" }).basePromptText;
}

describe("B552 firm roles, credit, and LinkedIn voice", () => {
  test("LinkedIn posts say we, and a LinkedIn draft keeps we", () => {
    const linkedin = HOUSE_VOICE_TABLE.find((row) => row.slug === "linkedin_post");
    assert.equal(linkedin.person, "first person plural");
    const text = brief(EVENT_TYPE.GENERAL, OUTPUT_TYPE.LINKEDIN_POST);
    assert.equal(text.includes("Write as the firm, in the first person plural (we, our)."), true);
    assert.equal(text.includes("Investor letters and LinkedIn posts use we for the firm throughout."), true);
    assert.equal(
      applyDraftHouseStyle("We reported the quarter.", {
        outputType: "linkedin_post",
        houseStyle: NEW_ACCOUNT_HOUSE_STYLE,
      }),
      "We reported the quarter."
    );
  });

  test("the firm means only the user's firm, and the fund roles are named", () => {
    const commentary = brief(EVENT_TYPE.FUND_DISTRIBUTION, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const call = brief(EVENT_TYPE.FUND_CAPITAL_CALL, OUTPUT_TYPE.REPORTING_COMMENTARY);
    const letter = brief(EVENT_TYPE.SPECIAL_TOPIC, OUTPUT_TYPE.INVESTOR_LETTER);
    for (const text of [commentary, call, letter]) {
      assert.equal(text.includes("The words the firm and we mean only the user's own firm."), true);
      assert.equal(text.includes("Every other company, fund, manager or general partner is called by its name."), true);
      assert.equal(
        text.includes("When the source is another manager's or author's commentary, credit that person by name"),
        true
      );
      assert.equal(text.includes("Do not promise a section the draft does not deliver."), true);
    }
    assert.equal(commentary.includes("The fund distributes. Do not name a recipient."), true);
    assert.equal(call.includes("The fund calls. Do not name a payer."), true);
    assert.equal(commentary.includes("The fund distributes and the firm receives."), false);
    assert.equal(call.includes("The fund calls and the firm pays."), false);
    assert.equal(commentary.includes("Third-person by default (the firm, the company, it, they)."), true);
    assert.equal(letter.includes("Write as the firm, in the first person plural (we, our)."), true);
  });
});
