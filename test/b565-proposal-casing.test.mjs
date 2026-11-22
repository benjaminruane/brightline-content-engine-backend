/**
 * B565. A proposal that rewrites part of a sentence keeps sentence case.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { draftSideProposal } from "../lib/qc/draft-side-proposal.mjs";

const REVIEW = JSON.parse(readFileSync("/Users/benjaminruane/ce-diagnostics/b565/clearpoint-pdf-review.json", "utf8"));

test("the ClearPoint active-voice proposal stays lower case after the comma", () => {
  const card = REVIEW.statements[7].qcCard;
  const concern = card.editorialConcerns[0];
  const offer = draftSideProposal({ concern, statementText: card.statement });
  assert.equal(offer.offered, true);
  assert.match(offer.resultingSentence, /^Notably, the company received FDA clearance/);
  assert.equal(offer.resultingSentence.includes("Notably, The"), false);
});

test("a proper noun stays capital, and a sentence start stays capital", () => {
  const mid = "After the close, the buyer completed the step.";
  const phrase = "the buyer completed the step";
  const start = mid.indexOf(phrase);
  const offer = draftSideProposal({
    concern: {
      span: [{ startChar: start, endChar: start + phrase.length }],
      suggestedDirection: "Change 'the buyer completed the step' to 'FDA completed the step'.",
    },
    statementText: mid,
  });
  assert.equal(offer.resultingSentence, "After the close, FDA completed the step.");

  const opening = "The buyer completed the step yesterday.";
  const opened = draftSideProposal({
    concern: {
      span: [{ startChar: 0, endChar: opening.length - 1 }],
      suggestedDirection: "Change 'The buyer completed the step yesterday' to 'The company completed the step yesterday'.",
    },
    statementText: opening,
  });
  assert.equal(opened.resultingSentence, "The company completed the step yesterday.");
});
