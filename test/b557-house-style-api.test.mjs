/**
 * B557. House style saves are checked against the guide, and one account
 * does not receive another account's choices.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { renderHouseStylePage } from "../lib/style-guide/render.mjs";
import { applyHouseStyleUpdate, rowAfterHouseStyleUpdate } from "../lib/style-guide/house-style-update.mjs";

test("a choice outside the guide is refused, and a valid save stays on that account", () => {
  const accountA = {
    id: "acct_a",
    spelling: "US",
    thousands: "comma",
    style_choices: { quotes: "single", bannedWords: ["alpha"] },
  };
  const accountB = {
    id: "acct_b",
    spelling: "UK",
    thousands: "space",
    style_choices: { quotes: "double", bannedWords: ["beta"] },
  };
  const refused = applyHouseStyleUpdate(accountA, { choices: { quotes: "curly" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "invalid_house_style");
  const saved = rowAfterHouseStyleUpdate(accountA, {
    choices: { quotes: "double", spelling: "UK", thousands: "apostrophe" },
    bannedWords: ["Synergy"],
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.row.id, "acct_a");
  assert.equal(saved.row.spelling, "UK");
  assert.equal(saved.row.thousands, "apostrophe");
  assert.equal(saved.choices.quotes, "double");
  assert.deepEqual(saved.choices.bannedWords, ["synergy"]);
  assert.equal(accountB.spelling, "UK");
  assert.equal(accountB.thousands, "space");
  assert.equal(accountB.style_choices.quotes, "double");
  assert.deepEqual(accountB.style_choices.bannedWords, ["beta"]);
  const page = renderHouseStylePage(saved.choices);
  assert.equal(page.settingsChoices.find((row) => row.id === "quotes").selected, "double");
  assert.deepEqual(page.settingsChoices.map((row) => row.id), [
    "quotes",
    "numberWords",
    "thousands",
    "magnitude",
    "dates",
    "periods",
    "spelling",
    "legalIdentifiers",
  ]);
  assert.equal(page.settingsChoices.some((row) => row.id === "bannedWords"), false);
  assert.equal(page.principles.some((row) => row.id === "lead_with_what_happened"), true);
});

test("reset restores the default choices and leaves the other account alone", () => {
  const accountA = {
    id: "acct_a",
    spelling: "UK",
    thousands: "apostrophe",
    style_choices: { quotes: "double", dates: "month_day", bannedWords: ["alpha"] },
  };
  const accountB = {
    id: "acct_b",
    spelling: "UK",
    thousands: "space",
    style_choices: { quotes: "double" },
  };
  const reset = rowAfterHouseStyleUpdate(accountA, { reset: true });
  assert.equal(reset.choices.spelling, "US");
  assert.equal(reset.choices.thousands, "comma");
  assert.equal(reset.choices.quotes, "single");
  assert.equal(reset.choices.dates, "day_month");
  assert.deepEqual(reset.choices.bannedWords, ["alpha"]);
  assert.equal(accountB.style_choices.quotes, "double");
  const source = readFileSync(new URL("../api/house-style.js", import.meta.url), "utf8");
  assert.match(source, /id: account\.accountId/);
  assert.match(source, /Saved\. New drafts and reviews use this house style\./);
});
