import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { normalizePgHouseStyleCharacters } from "../lib/prompt-library/house-characters.mjs";

describe("house characters", () => {
  test("converts smart quotes and dashes", () => {
    const out = normalizePgHouseStyleCharacters("\u201Cquoted\u201D \u2014 dash");
    assert.equal(out, "\"quoted\" - dash");
  });
});
