/**
 * B139 — reconcile the reviser-prompt contradiction. Text gate. No model calls.
 * Does not claim Suggest behaviour changes. None was measured.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { gatherConcerns, buildRevisionPrompt } from "../lib/build-revision-prompt.mjs";
import { EVALUATIVE_LANGUAGE_INSTRUCTION } from "../lib/qc/evaluative-language.mjs";
import { formatStyleGuideRulesForPrompt, resolveStyleGuide } from "../lib/qc/style-guide.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = path.join(__dirname, "..", "scripts", "diagnostic", "revise");

const DELETE_INSTRUCTION =
  "If yes, delete the evaluative word and any intensifier attached only to it";

const UNQUALIFIED_ENTIRE_DRAFT_HYPERBOLE =
  "first_person_plural where it applies to this output type, and hyperbole_vs_qualitative";

const RULE_B_FORBID =
  "Still forbidden on a silent card: deleting evaluative language (marketing_language_excess, kind soften)";

const MARKETING_LOCKS = [
  "suggest-after-r10-review1.json::1::marketing_language_excess",
  "condition-b-review.json::1::marketing_language_excess",
  "coverage-gap-review.json::3::marketing_language_excess",
];

const B134_CLOSER = "suggest-after-r10-review1.json::7::voice_consistency";
const B138_PRIMARY = "coverage-gap-review.json::5::overreach_unsupported_causal";

function loadReview(file) {
  return JSON.parse(readFileSync(path.join(REVISE_DIR, file), "utf8"));
}

function statementsOf(json) {
  return json?.payload?.statements ?? [];
}

function reviserKeys(file, statements) {
  const keys = new Set();
  for (const item of gatherConcerns(statements, null)) {
    for (const c of item.editorial || []) {
      const rule = String(c.rule || "").trim();
      if (rule) keys.add(`${file}::${item.statementIndex}::${rule}`);
    }
  }
  return keys;
}

describe("B139 hyperbole reconciliation", () => {
  test("PRIMARY: silent card has no global delete instruction; contract still has it (was capable of moving)", () => {
    const json = loadReview("b139-silent-hyperbole.json");
    const statements = statementsOf(json);
    const [item] = gatherConcerns(statements, null);
    assert.equal(
      (item?.editorial || []).some((c) => /hyperbole|marketing_language/i.test(c.rule || "")),
      false,
      "fixture must not carry a hype concern in gatherConcerns"
    );

    const prompt = buildRevisionPrompt(statements[0].qcCard.statement, gatherConcerns(statements, null), {});

    assert.match(
      EVALUATIVE_LANGUAGE_INSTRUCTION,
      new RegExp(DELETE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "PRIMARY had no surface to move from if the contract itself lacks the delete instruction"
    );
    assert.doesNotMatch(prompt, new RegExp(DELETE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(prompt, /hyperbole_vs_qualitative/);
    assert.match(prompt, /best-in-class/, "listed word remains in the draft text");
  });

  test("NEGATIVE: unqualified entire-draft hyperbole obligation is gone, not qualified", () => {
    const json = loadReview("b139-silent-hyperbole.json");
    const prompt = buildRevisionPrompt(
      statementsOf(json)[0].qcCard.statement,
      gatherConcerns(statementsOf(json), null),
      {}
    );
    assert.doesNotMatch(prompt, new RegExp(UNQUALIFIED_ENTIRE_DRAFT_HYPERBOLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(
      prompt,
      /The ENTIRE revised draft must comply with HOUSE STYLE RULES below \(not only the flagged statements\)/
    );
    assert.doesNotMatch(prompt, /except on silent/);
    assert.doesNotMatch(prompt, /does not apply on silence/i);
  });

  test("five locks: rule (b), three marketing directions, B134 closer, mechanical house style, B138 withhold", () => {
    const silent = loadReview("b139-silent-hyperbole.json");
    const silentPrompt = buildRevisionPrompt(
      statementsOf(silent)[0].qcCard.statement,
      gatherConcerns(statementsOf(silent), null),
      {}
    );

    assert.match(silentPrompt, new RegExp(RULE_B_FORBID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(silentPrompt, /currency_format/);
    assert.match(silentPrompt, /thousand_separator/);
    assert.match(silentPrompt, /first_person_plural/);

    const r10 = loadReview("suggest-after-r10-review1.json");
    const conditionB = loadReview("condition-b-review.json");
    const coverage = loadReview("coverage-gap-review.json");

    const r10Keys = reviserKeys("suggest-after-r10-review1.json", statementsOf(r10));
    const conditionKeys = reviserKeys("condition-b-review.json", statementsOf(conditionB));
    const coverageKeys = reviserKeys("coverage-gap-review.json", statementsOf(coverage));
    const allKeys = new Set([...r10Keys, ...conditionKeys, ...coverageKeys]);

    const missingMarketing = MARKETING_LOCKS.filter((k) => !allKeys.has(k));
    assert.deepEqual(missingMarketing, [], `marketing locks missing: ${missingMarketing.join(", ")}`);
    assert.equal(r10Keys.has(B134_CLOSER), true, "B134 silent closer must still reach");
    assert.equal(coverageKeys.has(B138_PRIMARY), false, "B138 PRIMARY must stay withheld");

    const coverageCard = statementsOf(coverage).find((s) => String(s?.id ?? s?.qcCard?.index) === "5");
    const s5Codes = (coverageCard?.qcCard?.editorialConcerns || []).map((c) => c.concernCode);
    assert.equal(s5Codes.includes("overreach_unsupported_causal"), true, "B138 card still carries the withheld flag");
  });

  test("Review still receives the evaluative-language contract", () => {
    const reviewBlock = formatStyleGuideRulesForPrompt(
      resolveStyleGuide({ outputType: "reporting_commentary" })
    );
    assert.match(reviewBlock, /hyperbole_vs_qualitative/);
    assert.match(reviewBlock, new RegExp(DELETE_INSTRUCTION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});
