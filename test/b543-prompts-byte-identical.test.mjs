/**
 * B543. The 80 investment briefs that existed before General stay byte-identical
 * when house style is omitted and when it is Ben's current pair.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { BEN_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";

const golden = JSON.parse(readFileSync(new URL("../tests/fixtures/b543/prompts-80.json", import.meta.url), "utf8"));

describe("B543 prompt bytes", () => {
  test("all 80 existing briefs match the snapshot for Ben's house style", () => {
    assert.equal(Object.keys(golden).length, 80);
    for (const [key, expected] of Object.entries(golden)) {
      const [eventType, outputType, visibility] = key.split("|");
      const omitted = buildBasePrompt({ eventType, outputType, visibility }).basePromptText;
      const ben = buildBasePrompt({
        eventType,
        outputType,
        visibility,
        houseStyle: BEN_HOUSE_STYLE,
      }).basePromptText;
      assert.equal(omitted, expected, key);
      assert.equal(ben, expected, `${key} ben`);
    }
  });
});
