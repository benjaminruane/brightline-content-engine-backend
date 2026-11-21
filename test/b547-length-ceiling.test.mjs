/**
 * B547. Length is a ceiling. The dateline placeholder stays only when the
 * source lacks the city or the date. Drafting follows the account's spelling.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { lengthInstruction } from "../lib/prompt-library/outputTypeGuidance.js";
import { lengthNote, shownWordCountLine } from "../lib/qc/constructive-feedback-v2.mjs";
import { omitDatelineWhenSourceHasBoth } from "../lib/press-dateline.mjs";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";

describe("B547 length ceiling", () => {
  test("the lower end is not a target and a short draft is not called short", () => {
    const line = lengthInstruction("GENERAL_TEXT");
    assert.equal(line.includes("no more than 250 words"), true);
    assert.equal(line.includes("275"), false);
    assert.equal(line.includes("10%"), false);
    assert.equal(line.includes("150 to 250"), false);
    assert.equal(line.includes("Do not add a sentence the sources do not support to reach a length."), true);
    assert.equal(line.includes("Do not drop an essential point."), true);
    const generate = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
    assert.equal(generate.includes("at least ${floor} words"), false);
    assert.equal(lengthNote({
      draftText: "One two three four five.",
      outputType: "PRESS_RELEASE",
      outputTypeLabel: "Press release",
      wordLimit: null,
    }), null);
    assert.equal(shownWordCountLine({
      draftText: "One two three four five.",
      outputType: "PRESS_RELEASE",
      outputTypeLabel: "Press release",
      wordLimit: null,
    }), "5 words");
    assert.match(lengthNote({
      draftText: "word ".repeat(340),
      outputType: "PRESS_RELEASE",
      outputTypeLabel: "Press release",
      wordLimit: null,
    }), /^340 words, above the 200 to 300 word range/);
  });

  test("the dateline placeholder is removed only when the source has a city and a date", () => {
    const lead = "[City], [Date] Lumio will launch a fund in Portland on 12 May 2026.";
    const both = omitDatelineWhenSourceHasBoth(lead, "Lumio will launch a fund in Portland on 12 May 2026.");
    assert.equal(both.startsWith("Lumio will launch"), true);
    assert.equal(both.includes("[City]"), false);
    const noCity = omitDatelineWhenSourceHasBoth(lead, "Lumio will launch a fund on 12 May 2026.");
    assert.equal(noCity.includes("[City], [Date]"), true);
    const noDate = omitDatelineWhenSourceHasBoth(lead, "Lumio will launch a fund in Portland.");
    assert.equal(noDate.includes("[City], [Date]"), true);
  });

  test("a US account does not keep the source's UK spelling", () => {
    const draft = "The neighbours organised a collection.";
    const us = applyDraftHouseStyle(draft, { houseStyle: { spelling: "US", thousands: "comma" } });
    assert.equal(us, "The neighbors organized a collection.");
    assert.equal(applyDraftHouseStyle("one litre", { houseStyle: { spelling: "US", thousands: "comma" } }), "one liter");
    const uk = applyDraftHouseStyle("The neighbors organized a collection.", { houseStyle: { spelling: "UK", thousands: "apostrophe" } });
    assert.equal(uk, "The neighbours organised a collection.");
  });
});
