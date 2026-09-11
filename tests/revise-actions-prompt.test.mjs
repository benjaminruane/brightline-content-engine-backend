/**
 * First-person-only lead is silent cards and first-person findings only.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildFindingPrompt } from "../lib/revise-actions/prompt.mjs";

const FIRST_PERSON_LEAD = "One operation is then permitted, and only this operation";

describe("revise-actions finding prompt", () => {
  test("speaking evidence prompt does not lead with first-person-only", () => {
    const prompt = buildFindingPrompt(
      {
        kind: "evidence",
        rule: "conflicting",
        statement: "The Company employs 142 people.",
        primaryExcerpt: "The Company employs 167 people.",
        thing2: "Headcount conflict.",
      },
      { authoringOrganisation: "Halden Group", silenceOnCard: false }
    );
    assert.equal(prompt.includes(FIRST_PERSON_LEAD), false);
    assert.match(prompt, /A source in the pack speaks to this claim\. Follow the finding/);
    assert.match(prompt, /Do not invent a value the source does not state/);
  });

  test("silent prompt still leads with first-person-only", () => {
    const prompt = buildFindingPrompt(
      {
        kind: "editorial",
        rule: "voice_consistency",
        statement: "On balance, we are supportive of the commitment.",
        suggestedDirection: "Replace 'we' with the named organisation.",
      },
      {
        authoringOrganisation: "Halden Group",
        silenceOnCard: true,
        draftText:
          "In June 2025, Halden Group made a commitment.\nOn balance, we are supportive of the commitment.",
      }
    );
    assert.equal(prompt.includes(FIRST_PERSON_LEAD), true);
    assert.match(prompt, /No source in the pack speaks to this claim/);
  });

  test("first-person editorial prompt on a speaking card still leads with first-person-only", () => {
    const prompt = buildFindingPrompt(
      {
        kind: "editorial",
        rule: "voice_consistency",
        statement: "We are writing to confirm completion of the transaction.",
        suggestedDirection: "Replace 'We are writing' with 'Halden Group is writing'.",
      },
      {
        authoringOrganisation: "Halden Group",
        silenceOnCard: false,
        draftText:
          "Halden Group completed screening in May.\nWe are writing to confirm completion of the transaction.",
      }
    );
    assert.equal(prompt.includes(FIRST_PERSON_LEAD), true);
    assert.match(prompt, /A source in the pack speaks to this claim\. Follow the finding/);
  });

  test("unresolved house is not interpolated as Authoring organisation: the authoring organisation", () => {
    const prompt = buildFindingPrompt(
      {
        kind: "editorial",
        rule: "voice_consistency",
        statement: "We are writing to confirm completion of the transaction.",
        suggestedDirection:
          "Replace 'We are writing' with 'The authoring organisation is writing'.",
      },
      { authoringOrganisation: null, silenceOnCard: true, draftText: "We are writing to confirm completion of the transaction." }
    );
    assert.doesNotMatch(prompt, /Authoring organisation:\s*the authoring organisation/i);
    assert.equal(prompt.includes(FIRST_PERSON_LEAD), false);
    assert.match(prompt, /Authoring organisation: \(none\)/);
  });
});
