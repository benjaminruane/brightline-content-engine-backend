/**
 * B219: voice_consistency pronoun backstop is scoped to third-person
 * output types. A first-person output type keeps a finding on a
 * third-person span.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";

function firstPersonMisuseFinding(statement) {
  return {
    concernCode: "voice_consistency",
    rule: "voice_consistency",
    category: "editorial",
    note: "The statement uses first-person plural without identifying the authoring organisation.",
    suggestedDirection: "Replace the first-person wording with the named organisation.",
    concernText: "The statement uses first-person plural; name the organisation instead.",
    span: [{ startChar: 0, endChar: statement.length }],
  };
}

function thirdPersonShouldBeFirstFinding(statement) {
  return {
    concernCode: "voice_consistency",
    rule: "voice_consistency",
    category: "editorial",
    note: "The statement uses third-person instead of the first-person plural voice appropriate for an investor letter.",
    suggestedDirection: "Rewrite in first-person plural.",
    concernText: "Use first-person plural for the GP voice.",
    span: [{ startChar: 0, endChar: statement.length }],
  };
}

describe("B219 voice_consistency pronoun backstop", () => {
  test("third-person output type: first-person-misuse finding with no pronoun is dropped", () => {
    const stmt = "Halden Group was attracted to Meridian on the strength of the track record.";
    const out = applyDeterministicStyleFilters(
      [firstPersonMisuseFinding(stmt)],
      stmt,
      stmt,
      { outputType: "reporting_commentary" }
    );
    assert.equal(out.length, 0);
  });

  test("third-person output type: first-person-misuse finding with a pronoun is kept", () => {
    const stmt = "We were attracted to Meridian on the strength of the track record.";
    const out = applyDeterministicStyleFilters(
      [firstPersonMisuseFinding(stmt)],
      stmt,
      stmt,
      { outputType: "reporting_commentary" }
    );
    assert.equal(out.length, 1);
  });

  test("first-person output type: a finding on a third-person span is kept", () => {
    const stmt = "Halden Group was attracted to Meridian on the strength of the track record.";
    const out = applyDeterministicStyleFilters(
      [thirdPersonShouldBeFirstFinding(stmt)],
      stmt,
      stmt,
      { outputType: "investor_letter" }
    );
    assert.equal(out.length, 1);
  });
});
