import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { STYLE_GUIDE_LAYER_1 } from "../lib/qc/style-guide.mjs";
import {
  EVALUATIVE_DELETION_REWRITE_NEEDED_TAIL,
  EVALUATIVE_LANGUAGE_FIX_DIRECTION,
  EVALUATIVE_LANGUAGE_INSTRUCTION,
  applyEvaluativeDeletionBounds,
  applyEvaluativeDeletionDirection,
  boundEvaluativeDeletionDirection,
  evaluativeDeletionRefusalDirection,
  extractEvaluativeAssertionSpans,
  getEvaluativeRestatementDiscardCount,
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
  "rewrite the sentence so that it reads naturally without it",
  "Do not substitute a milder word for the deleted text",
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
        "Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text."
      )?.kind,
      "rewrite_needed"
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

const EUR_CLAUSE =
  "The manager has a track record that is genuinely exceptional: EUR 2.8 billion deployed across Funds I to IV across 41 platform investments and has realised a gross MOIC of 2.4x and a gross IRR of 23% on the seventeen deals it has exited to date.";

const BROKEN_EUR_RESTATEMENT =
  "Delete 'genuinely exceptional'. The phrase becomes 'a track record of 2.8 billion across 41 platform investments and has realised a gross MOIC of 2.4x and a gross IRR of 23% on the seventeen deals it has exited to date...'";

describe("evaluative deletion restatement bound", () => {
  test("short correct restatement passes through unchanged", () => {
    const statement = "The manager's origination is genuinely proprietary.";
    const direction = "Delete 'genuinely'. The phrase becomes 'origination is proprietary'.";
    assert.equal(boundEvaluativeDeletionDirection(statement, direction), direction);
  });

  test("restatement that repairs a stranded colon passes", () => {
    const statement =
      "Meridian has a track record that is genuinely exceptional: 2.4x gross MOIC and 21% gross IRR.";
    const direction =
      "Delete 'genuinely exceptional'. The phrase becomes 'a track record that is 2.4x gross MOIC and 21% gross IRR'.";
    assert.equal(boundEvaluativeDeletionDirection(statement, direction), direction);
  });

  test("restatement materially longer than clause-minus-span is discarded and replaced by the refusal form", () => {
    const statement = "The manager's origination is genuinely proprietary.";
    const direction =
      "Delete 'genuinely'. The phrase becomes 'The manager's origination is proprietary and the team is widely regarded as among the most disciplined operators in the market with a track record spanning two decades'.";
    const bounded = boundEvaluativeDeletionDirection(statement, direction);
    assert.equal(bounded, evaluativeDeletionRefusalDirection("genuinely"));
    assert.equal(
      bounded,
      "Delete 'genuinely' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text."
    );
  });

  test("restatement that drops a currency unit is discarded", () => {
    const bounded = boundEvaluativeDeletionDirection(EUR_CLAUSE, BROKEN_EUR_RESTATEMENT);
    assert.equal(bounded, evaluativeDeletionRefusalDirection("genuinely exceptional"));
    assert.doesNotMatch(bounded, /The phrase becomes/);
    assert.match(EUR_CLAUSE, /EUR 2\.8 billion/);
    assert.doesNotMatch(BROKEN_EUR_RESTATEMENT, /EUR 2\.8 billion/);
  });

  test("restatement that drops a scope qualifier is discarded", () => {
    const bounded = boundEvaluativeDeletionDirection(EUR_CLAUSE, BROKEN_EUR_RESTATEMENT);
    assert.equal(bounded, evaluativeDeletionRefusalDirection("genuinely exceptional"));
    assert.match(EUR_CLAUSE, /across Funds I to IV/);
    assert.doesNotMatch(BROKEN_EUR_RESTATEMENT, /across Funds I to IV/);
  });

  test("the refusal form is emitted verbatim and is stable", () => {
    const form = evaluativeDeletionRefusalDirection("genuinely exceptional");
    assert.equal(
      form,
      "Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text."
    );
    assert.equal(form, `Delete 'genuinely exceptional' ${EVALUATIVE_DELETION_REWRITE_NEEDED_TAIL}`);
    assert.equal(
      parseEvaluativeDeletionDirection(form)?.kind,
      "rewrite_needed"
    );
    assert.equal(evaluativeDeletionRefusalDirection("genuinely exceptional"), form);
  });

  test("attach-time bound rewrites the concern direction and drops a rewrite that applied the discarded restatement", () => {
    const concerns = applyEvaluativeDeletionBounds(
      [
        {
          concernCode: "marketing_language_excess",
          note: "Unsupported evaluative language.",
          suggestedDirection: BROKEN_EUR_RESTATEMENT,
          suggestedRewrite: "a track record of 2.8 billion across 41 platform investments",
        },
      ],
      EUR_CLAUSE
    );
    assert.equal(concerns[0].suggestedDirection, evaluativeDeletionRefusalDirection("genuinely exceptional"));
    assert.equal("suggestedRewrite" in concerns[0], false);
  });

  test("discard path emits the actionable form and leaves no discarded restatement anywhere in the concern", () => {
    const discardedResult =
      "a track record of 2.8 billion across 41 platform investments and has realised a gross MOIC of 2.4x and a gross IRR of 23% on the seventeen deals it has exited to date...";
    const before = getEvaluativeRestatementDiscardCount();
    const input = {
      concernCode: "marketing_language_excess",
      note:
        "'genuinely exceptional' is hyperbolic language without substantiation. " +
        BROKEN_EUR_RESTATEMENT,
      suggestedDirection: BROKEN_EUR_RESTATEMENT,
      suggestedRewrite: discardedResult,
    };
    const concerns = applyEvaluativeDeletionBounds([{ ...input }], EUR_CLAUSE);
    const form = evaluativeDeletionRefusalDirection("genuinely exceptional");
    assert.equal(concerns[0].suggestedDirection, form);
    assert.match(concerns[0].note, /hyperbolic language without substantiation/);
    assert.match(concerns[0].note, /and rewrite the sentence so that it reads naturally without it/);
    assert.doesNotMatch(JSON.stringify(concerns[0]), /The phrase becomes/);
    assert.doesNotMatch(JSON.stringify(concerns[0]), /a track record of 2\.8 billion/);
    assert.equal("suggestedRewrite" in concerns[0], false);
    assert.equal(getEvaluativeRestatementDiscardCount(), before + 1);
  });

  test("pass-through restatement survives in both note and direction", () => {
    const statement = "The manager's origination is genuinely proprietary.";
    const direction = "Delete 'genuinely'. The phrase becomes 'origination is proprietary'.";
    const note =
      "Intensifier on a substantive word. Delete 'genuinely'. The phrase becomes 'origination is proprietary'.";
    const input = {
      concernCode: "hyperbole_vs_qualitative",
      note,
      suggestedDirection: direction,
    };
    const before = getEvaluativeRestatementDiscardCount();
    const concerns = applyEvaluativeDeletionBounds([{ ...input }], statement);
    assert.deepEqual(concerns[0], input);
    assert.equal(getEvaluativeRestatementDiscardCount(), before);
  });

  test("the discard counter still fires when only note carries the restatement", () => {
    const before = getEvaluativeRestatementDiscardCount();
    const form = evaluativeDeletionRefusalDirection("genuinely exceptional");
    const concerns = applyEvaluativeDeletionBounds(
      [
        {
          concernCode: "marketing_language_excess",
          note: `'genuinely exceptional' is hyperbolic language without substantiation. ${BROKEN_EUR_RESTATEMENT}`,
          suggestedDirection: form,
        },
      ],
      EUR_CLAUSE
    );
    assert.equal(concerns[0].suggestedDirection, form);
    assert.doesNotMatch(JSON.stringify(concerns[0]), /The phrase becomes/);
    assert.doesNotMatch(JSON.stringify(concerns[0]), /a track record of 2\.8 billion/);
    assert.match(concerns[0].note, /hyperbolic language without substantiation/);
    assert.match(concerns[0].note, /and rewrite the sentence so that it reads naturally without it/);
    assert.equal(getEvaluativeRestatementDiscardCount(), before + 1);
  });
});

describe("extractEvaluativeAssertionSpans", () => {
  test("locates the two known false-green exhibits", () => {
    const leverage = extractEvaluativeAssertionSpans(
      "these returns have been generated without recourse to aggressive leverage"
    );
    assert.ok(leverage.some((a) => /aggressive leverage/i.test(a.text)));
    assert.ok(leverage.every((a) => a.kind === "evaluative"));
    const regarded = extractEvaluativeAssertionSpans(
      "widely regarded as among the most disciplined operators in the European lower-mid-market"
    );
    assert.ok(regarded.some((a) => /widely regarded/i.test(a.text) || /most disciplined/i.test(a.text)));
  });

  test("does not flag working vocabulary from the instruction", () => {
    const spans = extractEvaluativeAssertionSpans(
      "The franchise is strong, high-quality, leading, well-positioned, robust, defensible, compelling, and solid."
    );
    assert.equal(spans.length, 0);
  });
});
