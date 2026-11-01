/**
 * B460. A figure that is already in the passage is not a contradiction.
 * A pair the rounding rule calls equivalent is not a contradiction.
 * A conflict the model already wrote is left alone.
 * A change of class records the rule and the evidence.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  confirmingPassageVerdict,
  demoteConfirmedClassifications,
} from "../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { applyIntraSourceReducer } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { normalizeValidResponse } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

describe("B460 figure pair", () => {
  test("gross margin and EBITDA margin are not one quantity", () => {
    const verdict = confirmingPassageVerdict(
      "Gross margin was 71.4%.",
      "Gross margin was 71.4% and EBITDA margin was 32.8%."
    );
    assert.equal(verdict.demoteTo, null);
  });

  test("60 percent of cost and 24 employees are not one quantity", () => {
    const verdict = confirmingPassageVerdict(
      "The plan covers 60% of Silicon Valley cost and 24 employees.",
      "60% of the Silicon Valley cost base. The Ottawa team is 24 employees."
    );
    assert.equal(verdict.demoteTo, null);
  });

  test("17 percent against 17.1 percent is the rounding the rule already allows", () => {
    const verdict = confirmingPassageVerdict(
      "The compound annual rate was 17%.",
      "The compound annual growth rate was 17.1%."
    );
    assert.equal(verdict.demoteTo, null);
  });

  test("14 percent against 14.2 percent is the same rounding", () => {
    const verdict = confirmingPassageVerdict(
      "Revenue was EUR 218 million with margins around 14 percent.",
      "Revenue was EUR 218 million with a margin of 14.2 percent."
    );
    assert.equal(verdict.demoteTo, null);
  });

  test("12 percent against 9 percent still conflicts and records the pair", () => {
    const statement = "Like-for-like sales growth reached 12% for the period.";
    const passage = "Like-for-like sales growth reached 9% for the period.";
    const verdict = confirmingPassageVerdict(statement, passage);
    assert.equal(verdict.rule, "b");
    assert.equal(verdict.demoteTo, "conflicting");
    const out = demoteConfirmedClassifications({
      statementText: statement,
      sourceMatches: [{ sourceIndex: 0, classification: "confirmed", passage, explanation: "The figures match." }],
      supportSpans: [],
    });
    const match = out.sourceMatches[0];
    assert.equal(match.classification, "conflicting");
    assert.equal(match.classificationRewrites.length, 1);
    assert.equal(match.classificationRewrites[0].rule, "figure_pair");
    assert.equal(match.classificationRewrites[0].from, "confirmed");
    assert.equal(match.classificationRewrites[0].to, "conflicting");
    assert.match(match.classificationRewrites[0].evidence, /12%/);
    assert.match(match.classificationRewrites[0].evidence, /9%/);
  });

  test("320 against 285 still conflicts when 320 is not in the passage", () => {
    const verdict = confirmingPassageVerdict(
      "The company employs 320 people.",
      "The company employs 285 people."
    );
    assert.equal(verdict.demoteTo, "conflicting");
    assert.match(verdict.evidence, /320/);
    assert.match(verdict.evidence, /285/);
  });

  test("a conflict the model already wrote is not rewritten", () => {
    const out = demoteConfirmedClassifications({
      statementText: "We have invested EUR 380 million.",
      sourceMatches: [{
        sourceIndex: 0,
        classification: "conflicting",
        passage: "The figure is not 380. It is EUR 412 million.",
        explanation: "The sentence says invested. The source gives a different figure.",
      }],
      supportSpans: [],
    });
    assert.equal(out.sourceMatches[0].classification, "conflicting");
    assert.equal(out.sourceMatches[0].classificationRewrites, undefined);
  });

  test("a span that outvotes the pair records the span passage and class", () => {
    const spanPassage = "EBITDA margin was 32.8%.";
    const reduced = applyIntraSourceReducer({
      statementText: "Gross margin was 71.4%.",
      sourceMatches: [{
        sourceIndex: 0,
        classification: "confirmed",
        passage: "Gross margin was 71.4%.",
      }],
      supportSpans: [{ sourceIndex: 0, classification: "conflicting", passage: spanPassage }],
      sources: [{ text: `Gross margin was 71.4%. ${spanPassage}` }],
    });
    assert.equal(reduced[0].classification, "conflicting");
    const rewrite = reduced[0].classificationRewrites.at(-1);
    assert.equal(rewrite.rule, "span_outvote");
    assert.equal(rewrite.from, "confirmed");
    assert.equal(rewrite.to, "conflicting");
    assert.match(rewrite.evidence, /^conflicting: /);
    assert.match(rewrite.evidence, /32\.8%/);
  });

  test("an empty confirmation records the refusal", () => {
    const normalized = normalizeValidResponse(
      { classification: "confirmed", passage: "Not in the source at all.", explanation: "A number." },
      "The company raised EUR 59 million in 2024.",
      { sourceLabel: "memo", statementText: "The company raised EUR 95 million in 2024." }
    );
    assert.equal(normalized.classification, "not_reviewed");
    assert.equal(normalized.emptyConfirmationRefused, true);
    assert.equal(normalized.classificationRewrites.at(-1).rule, "empty_confirmation");
    assert.equal(normalized.classificationRewrites.at(-1).from, "confirmed");
    assert.equal(normalized.classificationRewrites.at(-1).to, "not_reviewed");
  });
});
