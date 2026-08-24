import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { STYLE_GUIDE_LAYER_1 } from "../lib/qc/style-guide.mjs";
import {
  EVALUATIVE_LANGUAGE_FIX_DIRECTION,
  EVALUATIVE_LANGUAGE_INSTRUCTION,
} from "../lib/qc/evaluative-language.mjs";

const REQUIRED = [
  "Never substitute a milder evaluative word",
  "remaining clause still tell a reader something",
  "origination that is proprietary",
  "The franchise is exceptionally strong.",
  "must not become \"strong\"",
];

describe("evaluative language contract", () => {
  test("marketing_language_excess and hyperbole_vs_qualitative share the delete-or-keep instruction", () => {
    const marketing = editorialRules.find((r) => r.id === "marketing_language_excess");
    const hyperbole = STYLE_GUIDE_LAYER_1.find((r) => r.id === "hyperbole_vs_qualitative");
    assert.ok(marketing);
    assert.ok(hyperbole);
    assert.equal(marketing.description.includes(EVALUATIVE_LANGUAGE_INSTRUCTION), true);
    assert.equal(hyperbole.description.includes(EVALUATIVE_LANGUAGE_INSTRUCTION), true);
    assert.equal(marketing.fixDirection, EVALUATIVE_LANGUAGE_FIX_DIRECTION);
    assert.equal(hyperbole.fixDirection, EVALUATIVE_LANGUAGE_FIX_DIRECTION);
    for (const phrase of REQUIRED) {
      const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      assert.match(marketing.description, re);
      assert.match(hyperbole.description, re);
    }
    assert.match(EVALUATIVE_LANGUAGE_FIX_DIRECTION, /^Apply the remaining-clause test/);
    assert.match(EVALUATIVE_LANGUAGE_FIX_DIRECTION, /Never begin with Replace/);
  });
});
