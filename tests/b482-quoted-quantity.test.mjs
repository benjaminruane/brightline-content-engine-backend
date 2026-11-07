/**
 * B482. A quoted value is the quantity, and a disagreement with no quantity
 * says which document disagrees and which agrees.
 * lib/qc/quantity-reading.mjs is the span. lib/qc/supersession.mjs is the sentence.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

function dated(raw, iso) {
  return { date: new Date(iso), raw, cue: "Date: label" };
}

const ordered = {
  0: dated("15 April 2025", "2025-04-15T00:00:00Z"),
  1: dated("28 May 2025", "2025-05-28T00:00:00Z"),
};

function note(earlier, later) {
  return resolveSupersession({
    statement: earlier,
    aggregateVerdict: "conflicting",
    sourceMatches: [
      { sourceIndex: 0, sourceLabel: "alpha memo", classification: "confirmed", passage: earlier },
      { sourceIndex: 1, sourceLabel: "beta memo", classification: "conflicting", passage: later },
    ],
    asOfBySourceIndex: ordered,
    sources: [{ label: "alpha memo" }, { label: "beta memo" }],
  }).supersededNotes[0];
}

function quoted(sentence) {
  return [...sentence.matchAll(/gives ([^.]+)\./g)].map((match) => match[1]);
}

const VERB = /\b(is|are|was|were|be|been|being|has|have|had)\b/i;

describe("B482 quoted quantity", () => {
  test("the quoted values are the quantities, with no verb inside them", () => {
    const arr = note("cleaned ARR of EUR 35 million", "EUR 38 million");
    assert.equal(
      arr,
      "The later source beta memo dated 28 May 2025 gives EUR 38 million. The earlier source alpha memo dated 15 April 2025 gives EUR 35 million."
    );
    const total = note("The total is 142", "The total is 167");
    assert.equal(
      total,
      "The later source beta memo dated 28 May 2025 gives 167. The earlier source alpha memo dated 15 April 2025 gives 142."
    );
    for (const value of [...quoted(arr), ...quoted(total)]) {
      assert.equal(VERB.test(value), false, value);
    }
  });

  test("a disagreement with no quantity names which document disagrees and which agrees", () => {
    const sentence = note("The board approved the terms circulated.", "The board rejected the terms circulated.");
    assert.equal(
      sentence,
      "The later source beta memo dated 28 May 2025 disagrees with the statement. The earlier source alpha memo dated 15 April 2025 agrees with it."
    );
    assert.equal(/\bconfirmed\b/i.test(sentence), false);
    assert.equal(/\bverified\b/i.test(sentence), false);
    assert.equal(/\bcorrect\b/i.test(sentence), false);
    assert.match(sentence, /beta memo dated 28 May 2025 disagrees with the statement/);
    assert.match(sentence, /alpha memo dated 15 April 2025 agrees with it/);
  });
});
