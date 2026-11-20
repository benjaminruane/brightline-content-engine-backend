/**
 * B538. Drafts spell small numbers with the same house style rule the review scans.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { applyNumberSpelling, numberSpellingPolicy } from "../lib/qc/number-spelling.mjs";
import { scanNumberForm } from "../lib/qc/number-form-scan.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";

describe("B538 number spelling in drafts", () => {
  test("small counts are spelled, and the listed carve-outs stay numerals", () => {
    assert.equal(applyNumberSpelling("a 9-person team"), "a nine-person team");
    assert.equal(applyNumberSpelling("2 co-investments"), "two co-investments");
    assert.equal(applyNumberSpelling("12 to 15 portfolio companies"), "12 to 15 portfolio companies");
    assert.equal(applyNumberSpelling("a 12% discount"), "a 12% discount");
    assert.equal(applyNumberSpelling("EUR 9 million"), "EUR 9 million");
    assert.equal(applyNumberSpelling("19 January 2026"), "19 January 2026");
    assert.equal(applyNumberSpelling("8 October 2026"), "8 October 2026");
    assert.equal(applyNumberSpelling("a 9-year-old founder"), "a 9-year-old founder");
    assert.equal(applyNumberSpelling("Fund III"), "Fund III");
    assert.equal(applyNumberSpelling("Fund 2"), "Fund 2");
    assert.equal(applyNumberSpelling("Q3"), "Q3");
    assert.equal(applyNumberSpelling("iPhone 12"), "iPhone 12");
    assert.equal(applyNumberSpelling("ticker AAPL 12"), "ticker AAPL 12");
  });

  test("a draft that follows the rule is not flagged for number spelling", () => {
    for (const sentence of [
      "The firm has a nine-person team and completed two co-investments.",
      "The manager expects 12 to 15 portfolio companies.",
      "The closing was on 8 October 2026 at a 12% discount of EUR 9 million.",
      "Fund 2 and Fund III report in Q3.",
    ]) {
      assert.equal(scanNumberForm({ statement: sentence }).length, 0, sentence);
    }
    const flagged = scanNumberForm({ statement: "The firm has a 9-person team." });
    assert.equal(flagged.length, 1);
    assert.match(flagged[0].note, /nine/);
  });

  test("the ceiling is the configured rule, and a guide without the rule spells nothing", () => {
    const rule = resolveStyleGuide({}).find((row) => row.id === "number_spelling");
    assert.equal(rule.spellThrough, 12);
    assert.equal(numberSpellingPolicy(rule).spellThrough, 12);
    const tighter = { ...rule, spellThrough: 2 };
    assert.equal(applyNumberSpelling("2 co-investments and a 9-person team", { styleRules: [tighter] }), "two co-investments and a 9-person team");
    assert.equal(applyNumberSpelling("a 9-person team", { styleRules: [] }), "a 9-person team");
    assert.equal(scanNumberForm({ statement: "a 9-person team", styleRules: [] }).length, 0);
    assert.throws(() => numberSpellingPolicy({ id: "number_spelling" }), /spellThrough is not configured/);
  });

  test("generate, rewrite, and adapt spell the draft before it is returned", () => {
    const helper = readFileSync(new URL("../lib/qc/draft-house-style.mjs", import.meta.url), "utf8");
    assert.equal(helper.includes("applyNumberSpelling"), true);
    for (const file of ["api/generate.js", "api/rewrite.js", "api/adapt.js"]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.equal(source.includes("applyDraftHouseStyle"), true, file);
    }
  });
});
