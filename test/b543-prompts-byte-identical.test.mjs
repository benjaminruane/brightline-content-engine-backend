/**
 * B543, B555. The 80 investment briefs are snapshotted twice.
 * An omitted house style is the new-account default. Ben's pair is the apostrophe.
 * Decisions 2 and 6.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { BEN_HOUSE_STYLE, NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";

const golden = JSON.parse(readFileSync(new URL("../tests/fixtures/b543/prompts-80.json", import.meta.url), "utf8"));

describe("B543 prompt bytes", () => {
  test("all 80 existing briefs match the snapshot for the new-account default and for Ben's pair", () => {
    assert.equal(Object.keys(golden.omitted).length, 80);
    assert.equal(Object.keys(golden.ben).length, 80);
    for (const key of Object.keys(golden.omitted)) {
      const [eventType, outputType, visibility] = key.split("|");
      const omitted = buildBasePrompt({ eventType, outputType, visibility, houseStyle: NEW_ACCOUNT_HOUSE_STYLE }).basePromptText;
      const bare = buildBasePrompt({ eventType, outputType, visibility }).basePromptText;
      const ben = buildBasePrompt({ eventType, outputType, visibility, houseStyle: BEN_HOUSE_STYLE }).basePromptText;
      assert.equal(omitted, golden.omitted[key], key);
      assert.equal(bare, golden.omitted[key], `${key} omitted`);
      assert.equal(ben, golden.ben[key], `${key} ben`);
      assert.equal(omitted === ben, false, key);
    }
  });
});
