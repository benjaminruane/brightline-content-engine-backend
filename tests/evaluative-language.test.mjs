import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { STYLE_GUIDE_LAYER_1 } from "../lib/qc/style-guide.mjs";
import {
  EVALUATIVE_LANGUAGE_FIX_DIRECTION,
  EVALUATIVE_LANGUAGE_INSTRUCTION,
  applyEvaluativeDeletionDirection,
  hasStrandedEvaluativeScaffolding,
  parseEvaluativeDeletionDirection,
} from "../lib/qc/evaluative-language.mjs";

const REQUIRED = [
  "Never substitute a milder evaluative word",
  "remaining clause still tell a reader something",
  "origination that is proprietary",
  "The franchise is exceptionally strong.",
  "must not become \"strong\"",
  "The phrase becomes",
  "cannot be repaired without rewriting the sentence",
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
    assert.match(EVALUATIVE_LANGUAGE_FIX_DIRECTION, /The phrase becomes/);
  });

  test("Delete directions parse the removed text and the resulting phrase", () => {
    const parsed = parseEvaluativeDeletionDirection(
      "Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.4x gross MOIC and 21% gross IRR across seventeen exits'."
    );
    assert.equal(parsed?.kind, "delete_becomes");
    assert.equal(parsed?.removed, "genuinely exceptional");
    assert.match(parsed?.result || "", /a track record of 2\.4x/);
    assert.equal(
      parseEvaluativeDeletionDirection("Delete 'genuinely exceptional'.")?.kind,
      "delete_incomplete"
    );
    assert.equal(
      parseEvaluativeDeletionDirection(
        "Delete 'genuinely exceptional'. The remainder cannot be repaired without rewriting the sentence."
      )?.kind,
      "rewrite_needed"
    );
    assert.equal(parseEvaluativeDeletionDirection("Keep 'genuine differentiator' and flag it."), null);
  });

  test("literal apply of a Delete direction leaves grammatical prose", () => {
    const a =
      "Meridian has a track record that is genuinely exceptional: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits.";
    const appliedA = applyEvaluativeDeletionDirection(
      a,
      "Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.4x gross MOIC and 21% gross IRR on seventeen exits'."
    );
    assert.equal(appliedA.ok, true);
    assert.equal(
      appliedA.applied,
      "Meridian has a track record of 2.4x gross MOIC and 21% gross IRR on seventeen exits."
    );
    assert.equal(hasStrandedEvaluativeScaffolding(appliedA.applied), false);

    const c = "The manager's origination is genuinely proprietary.";
    const appliedC = applyEvaluativeDeletionDirection(
      c,
      "Delete 'genuinely'. The phrase becomes 'origination is proprietary'."
    );
    assert.equal(appliedC.ok, true);
    assert.equal(appliedC.applied, "The manager's origination is proprietary.");
    assert.equal(hasStrandedEvaluativeScaffolding(appliedC.applied), false);
  });

  test("a Delete without a resulting phrase is incomplete, not applied", () => {
    const statement =
      "Meridian has a track record that is genuinely exceptional: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits.";
    const applied = applyEvaluativeDeletionDirection(statement, "Delete 'genuinely exceptional'.");
    assert.equal(applied.ok, false);
    assert.equal(applied.applied, statement);
    assert.equal(hasStrandedEvaluativeScaffolding("a track record that is : across Funds"), true);
    assert.equal(
      hasStrandedEvaluativeScaffolding(
        "Meridian has a track record that is Meridian has a track record: across Funds I to IV."
      ),
      true
    );
  });

  test("a resulting phrase that restates the sentence start replaces the sentence", () => {
    const a =
      "Meridian has a track record that is genuinely exceptional: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits.";
    const appliedA = applyEvaluativeDeletionDirection(
      a,
      "Delete 'genuinely exceptional'. The phrase becomes 'Meridian has a track record: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits'."
    );
    assert.equal(appliedA.ok, true);
    assert.equal(
      appliedA.applied,
      "Meridian has a track record: across Funds I to IV the manager realised 2.4x gross MOIC and 21% gross IRR on seventeen exits."
    );
    assert.equal(hasStrandedEvaluativeScaffolding(appliedA.applied), false);

    const c = "The manager's origination is genuinely proprietary.";
    const appliedC = applyEvaluativeDeletionDirection(
      c,
      "Delete 'genuinely'. The phrase becomes 'The manager's origination is proprietary'."
    );
    assert.equal(appliedC.ok, true);
    assert.equal(appliedC.applied, "The manager's origination is proprietary.");
  });
});
