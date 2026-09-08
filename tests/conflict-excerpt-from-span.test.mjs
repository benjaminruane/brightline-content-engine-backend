import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const SPAN_PASSAGE = "The total team of 285 people is split across offices.";
const SOURCE_LABEL = "IC memo";

describe("conflict excerpt from the span that caused the verdict", () => {
  test("if the pair is conflicting and no conflicting single-pick exists, the span is the conflict excerpt", () => {
    const out = selectExcerpts({
      statementMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "confirmed",
          passage: "The Company employs 320 people in London.",
        },
      ],
      verdict: "conflicting",
      hasConflict: true,
      supportSpans: [
        {
          sourceRefId: 0,
          classification: "conflicting",
          passage: SPAN_PASSAGE,
        },
      ],
      sources: [{ text: SPAN_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(out.conflictExcerpt?.passage, SPAN_PASSAGE);
    assert.equal(out.conflictExcerpt?.sourceLabel, SOURCE_LABEL);
    assert.equal(out.primaryExcerpt?.passage, SPAN_PASSAGE);
  });

  test("a conflicting single-pick is still preferred over a span", () => {
    const pickPassage = "Westhaven Capital agrees to acquire Norwell from Bridgepoint.";
    const out = selectExcerpts({
      statementMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "conflicting",
          passage: pickPassage,
        },
      ],
      verdict: "conflicting",
      hasConflict: true,
      supportSpans: [
        {
          sourceRefId: 0,
          classification: "conflicting",
          passage: SPAN_PASSAGE,
        },
      ],
      sources: [{ text: pickPassage, label: SOURCE_LABEL }],
    });
    assert.equal(out.primaryExcerpt?.passage, pickPassage);
    assert.equal(out.conflictExcerpt, null);
  });

  test("an empty span passage is not used as the excerpt", () => {
    const out = selectExcerpts({
      statementMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "confirmed",
          passage: "The Company employs 320 people in London.",
        },
      ],
      verdict: "conflicting",
      hasConflict: true,
      supportSpans: [
        {
          sourceRefId: 0,
          classification: "conflicting",
          passage: "",
        },
      ],
      sources: [{ text: SPAN_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(out.conflictExcerpt, null);
    assert.equal(out.primaryExcerpt, null);
  });
});
