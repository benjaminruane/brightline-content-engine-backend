/**
 * B355 Part 1. The objectionable term comes from the concern, not the quote.
 * Strings from tests/fixtures/real-runs-2026-09-29/clean-review.json.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  applyEditorialSourceAwareness,
  EDITORIAL_PHRASE_IN_SOURCE,
  matchedPassagesFromCard,
} from "../lib/qc/editorial-source-awareness.mjs";
import { objectionableTerms } from "../lib/qc/objectionable-term.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLEAN = JSON.parse(
  readFileSync(path.join(ROOT, "tests/fixtures/real-runs-2026-09-29/clean-review.json"), "utf8")
);

function cardAt(index) {
  return CLEAN.statements[index].qcCard;
}

function passagesOf(card) {
  return matchedPassagesFromCard({
    primaryExcerpt: card.primaryExcerpt,
    supportSpans: card.supportSpans,
  });
}

describe("B355 objectionable term from the concern", () => {
  test("S12 DROPS: causal connective driven primarily by is in the matched passage", () => {
    const card = cardAt(12);
    const concern = card.editorialConcerns[0];
    assert.equal(concern.concernCode, "overreach_unsupported_causal");
    const derived = objectionableTerms(concern, card.statement);
    assert.equal(derived.family, "causal");
    assert.deepEqual(derived.terms, ["driven primarily by"]);
    assert.equal(passagesOf(card).some((p) => /driven primarily by/i.test(p)), true);
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages: passagesOf(card),
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
    assert.equal(after.dropped[0].slug, EDITORIAL_PHRASE_IN_SOURCE);
    assert.equal(after.dropped[0].family, "causal");
    assert.equal(after.editorialVerdict, "clean");
  });

  test("S3 DROPS: evaluative term record year is in the matched passage", () => {
    const card = cardAt(3);
    const concern = card.editorialConcerns[0];
    assert.equal(concern.concernCode, "marketing_language_excess");
    assert.match(concern.suggestedDirection, /^Delete 'record year' and rewrite/);
    const derived = objectionableTerms(concern, card.statement);
    assert.equal(derived.family, "evaluative");
    assert.deepEqual(derived.terms, ["record year"]);
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages: passagesOf(card),
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped[0].family, "evaluative");
  });

  test("S8 SURVIVES because significant is not in that card's matched passage", () => {
    const card = cardAt(8);
    const concern = card.editorialConcerns[0];
    assert.equal(concern.concernCode, "marketing_language_excess");
    assert.match(concern.suggestedDirection, /^Delete 'significant'\./);
    const derived = objectionableTerms(concern, card.statement);
    assert.equal(derived.family, "evaluative");
    assert.deepEqual(derived.terms, ["significant"]);
    const passages = passagesOf(card);
    assert.equal(passages.every((p) => !/\bsignificant\b/i.test(p)), true);
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages,
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });

  test("S8 sibling: the same one-word term DROPS when it is in the matched passage", () => {
    const card = cardAt(8);
    const concern = card.editorialConcerns[0];
    const derived = objectionableTerms(concern, card.statement);
    assert.deepEqual(derived.terms, ["significant"]);
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages: ["a significant valuation uplift in TCR"],
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
    assert.equal(after.dropped[0].family, "evaluative");
  });

  test("ROT SURVIVES: causal concern with no recognised connective has empty terms", () => {
    const statement = "The fund delivered returns of 14% across the entire portfolio.";
    const concern = {
      concernCode: "overreach_unsupported_causal",
      note: "The phrase 'returns of 14% across the entire portfolio' is not established.",
    };
    const passage = "the infrastructure asset portfolio delivered returns of 14% for the period";
    const derived = objectionableTerms(concern, statement);
    assert.equal(derived.family, "causal");
    assert.deepEqual(derived.terms, []);
    const after = applyEditorialSourceAwareness({
      statement,
      concerns: [concern],
      passages: [passage],
      editorialVerdict: "concern",
    });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });
});
