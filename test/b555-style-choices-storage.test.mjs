/**
 * B555. Banned words and house style are read from the account.
 * An omitted house style uses the stored style, not a personal pair. Decision 2.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { choicesFromAccountRow, renderDraftStyleSection, resolveStyleChoices } from "../lib/style-guide/render.mjs";
import { isBenHouseStyle, houseStyleForRow, NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { styleForRequest } from "../lib/style-guide/request-style.mjs";

describe("B555 style choices on the account", () => {
  test("an omitted house style is the new-account default, not a personal pair", () => {
    assert.equal(isBenHouseStyle(null), false);
    assert.deepEqual(houseStyleForRow({}, true), NEW_ACCOUNT_HOUSE_STYLE);
    assert.deepEqual(resolveStyleChoices(null).thousands, "comma");
    assert.equal(renderDraftStyleSection(null).includes("comma"), true);
    assert.equal(renderDraftStyleSection(null).includes("single quotation"), true);
  });

  test("banned words and choices are read from the account row", () => {
    const choices = choicesFromAccountRow({
      spelling: "UK",
      thousands: "apostrophe",
      style_choices: { bannedWords: ["Synergy", "synergy"], quotes: "double", magnitude: "millions" },
    });
    assert.deepEqual(choices.bannedWords, ["synergy"]);
    assert.equal(choices.spelling, "UK");
    assert.equal(choices.thousands, "apostrophe");
    assert.equal(choices.quotes, "double");
    assert.equal(choices.magnitude, "millions");
    const text = renderDraftStyleSection(choices);
    assert.match(text, /synergy/);
    assert.match(text, /UK English/);
    assert.match(text, /double quotation/);
  });

  test("a request with no account does not apply a browser banned list", async () => {
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.join(" "));
    try {
      const choices = await styleForRequest({ accountId: null }, { bannedWords: ["leverage"], houseStyle: { spelling: "UK", thousands: "space" } });
      assert.deepEqual(choices.bannedWords, []);
      assert.equal(choices.spelling, "UK");
      assert.equal(choices.thousands, "space");
      assert.equal(errors.some((line) => line.includes("banned words were sent without an account")), true);
    } finally {
      console.error = original;
    }
  });
});
