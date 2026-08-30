import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  classifyDirection,
  extractQuotedSpans,
  scoreDirectiveFollow,
} from "../scripts/diagnostic/revise/directive-follow-scorer.mjs";

/**
 * The 14 stored directions from author-confusion-sweep.json after.rows,
 * with the original statement each was scored against.
 */
const STORED = [
  {
    id: "r10-review1 S1 marketing_language_excess",
    file: "suggest-after-r10-review1.json",
    statementIndex: 1,
    rule: "marketing_language_excess",
    direction:
      "Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.",
    statementText:
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    follow:
      "We were attracted to Meridian on the strength of a track record that is, in our view.",
  },
  {
    id: "r10-review1 S1 voice_consistency",
    file: "suggest-after-r10-review1.json",
    statementIndex: 1,
    rule: "voice_consistency",
    direction:
      "Replace 'We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional' with 'Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional'.",
    statementText:
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    follow:
      "Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional.",
  },
  {
    id: "r10-review1 S3 overreach_unsupported_causal",
    file: "suggest-after-r10-review1.json",
    statementIndex: 3,
    rule: "overreach_unsupported_causal",
    direction:
      "Replace 'means key-person risk is limited' with 'suggests key-person risk may be limited'.",
    statementText:
      "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
    follow:
      "The team's stability, with no senior departures across the last three fund cycles, suggests key-person risk may be limited.",
  },
  {
    id: "r10-review1 S7 voice_consistency",
    file: "suggest-after-r10-review1.json",
    statementIndex: 7,
    rule: "voice_consistency",
    direction:
      "Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.",
    statementText:
      "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.",
    follow:
      "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.",
  },
  {
    id: "r10-review1 S8 first_person_plural",
    file: "suggest-after-r10-review1.json",
    statementIndex: 8,
    rule: "first_person_plural",
    direction: "Replace 'available to us' with 'available to Halden Group'.",
    statementText:
      "The GP provided access to co-investments that would not otherwise have been available to us.",
    follow:
      "The GP provided access to co-investments that would not otherwise have been available to Halden Group.",
  },
  {
    id: "r10-review2 S1 voice_consistency",
    file: "suggest-after-r10-review2.json",
    statementIndex: 1,
    rule: "voice_consistency",
    direction:
      "Replace 'We were attracted to Meridian' with 'Halden Group was attracted to Meridian'.",
    statementText:
      "We were attracted to Meridian on the strength of a track record of 2.4x realised gross MOIC and 21% gross IRR across 17 fully realised exits.",
    follow:
      "Halden Group was attracted to Meridian on the strength of a track record of 2.4x realised gross MOIC and 21% gross IRR across 17 fully realised exits.",
  },
  {
    id: "r10-review2 S3 structural_integrity",
    file: "suggest-after-r10-review2.json",
    statementIndex: 3,
    rule: "structural_integrity",
    direction:
      "Rewrite the sentence to include a main clause, such as 'The team's stability is demonstrated by no senior departures across the last three fund cycles.'",
    statementText:
      "The team's stability, with no senior departures across the last three fund cycles.",
    follow:
      "The team's stability is demonstrated by no senior departures across the last three fund cycles.",
  },
  {
    id: "r10-review2 S7 voice_consistency",
    file: "suggest-after-r10-review2.json",
    statementIndex: 7,
    rule: "voice_consistency",
    direction: "Replace 'recommends' with 'Halden Group recommends'.",
    statementText:
      "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.",
    follow:
      "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and Halden Group recommends the commitment.",
  },
  {
    id: "condition-b S1 marketing_language_excess",
    file: "condition-b-review.json",
    statementIndex: 1,
    rule: "marketing_language_excess",
    direction:
      "Delete 'genuinely exceptional' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.",
    statementText:
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    follow:
      "We were attracted to Meridian on the strength of a track record that is, in our view.",
  },
  {
    id: "condition-b S1 voice_consistency",
    file: "condition-b-review.json",
    statementIndex: 1,
    rule: "voice_consistency",
    direction:
      "Replace 'We were attracted' with 'Halden Group was attracted' and delete 'in our view'.",
    statementText:
      "We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.",
    follow:
      "Halden Group was attracted to Meridian on the strength of a track record that is genuinely exceptional.",
  },
  {
    id: "condition-b S7 voice_consistency",
    file: "condition-b-review.json",
    statementIndex: 7,
    rule: "voice_consistency",
    direction:
      "Replace 'we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment' with 'Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment'.",
    statementText:
      "On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.",
    follow:
      "On balance, Halden Group believes the fund should deliver returns broadly in line with its predecessor and recommends the commitment.",
  },
  {
    id: "condition-b S8 voice_consistency",
    file: "condition-b-review.json",
    statementIndex: 8,
    rule: "voice_consistency",
    direction: "Replace 'available to us' with 'available to Halden Group'.",
    statementText:
      "The GP provided access to co-investments that would not otherwise have been available to us.",
    follow:
      "The GP provided access to co-investments that would not otherwise have been available to Halden Group.",
  },
  {
    id: "coverage-gap S3 marketing_language_excess",
    file: "coverage-gap-review.json",
    statementIndex: 3,
    rule: "marketing_language_excess",
    direction:
      "Delete 'highly regarded' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.",
    statementText:
      "Partners Group was attracted to this investment given Meridian Capital's strong track record on its prior vintage funds, coupled with its well-established and highly regarded investment team and operational approach to value creation.",
    follow:
      "Partners Group was attracted to this investment given Meridian Capital's strong track record on its prior vintage funds, coupled with its well-established investment team and operational approach to value creation.",
  },
  {
    id: "coverage-gap S5 overreach_unsupported_causal",
    file: "coverage-gap-review.json",
    statementIndex: 5,
    rule: "overreach_unsupported_causal",
    direction:
      "Replace 'enabled deep insight during the diligence phase' with a more neutral statement that does not imply causation.",
    statementText: "This relationship enabled deep insight during the diligence phase.",
    follow: "This relationship provided insight during the diligence phase.",
  },
];

describe("extractQuotedSpans possessive apostrophe", () => {
  test("structural_integrity direction does not truncate to The team", () => {
    const si = STORED.find((d) => d.rule === "structural_integrity");
    const spans = extractQuotedSpans(si.direction);
    assert.ok(spans.length >= 1, "expected at least one quoted span");
    assert.notEqual(spans[0], "The team");
    assert.equal(
      spans[0],
      "The team's stability is demonstrated by no senior departures across the last three fund cycles."
    );
  });
});

describe("r10-review2 S7 replacement that contains its source", () => {
  test("scores a follow when Halden Group recommends is inserted", () => {
    const row = STORED.find((d) => d.id === "r10-review2 S7 voice_consistency");
    const got = scoreDirectiveFollow({
      direction: row.direction,
      statementText: row.statementText,
      revised: row.follow,
    });
    assert.equal(got.followed, true, got.reason);
    assert.equal(got.shape, "replace");
  });
});

describe("classifyDirection covers every stored shape", () => {
  test("no stored direction is unscored", () => {
    for (const row of STORED) {
      const c = classifyDirection(row.direction);
      assert.notEqual(c.shape, "unscored", `${row.id}: ${c.reason}`);
    }
  });

  test("coverage-gap S5 is replace_unquoted, not forced into replace", () => {
    const row = STORED.find((d) => d.id === "coverage-gap S5 overreach_unsupported_causal");
    assert.equal(classifyDirection(row.direction).shape, "replace_unquoted");
  });

  test("condition-b S1 voice is replace_and_delete", () => {
    const row = STORED.find((d) => d.id === "condition-b S1 voice_consistency");
    const c = classifyDirection(row.direction);
    assert.equal(c.shape, "replace_and_delete");
    assert.equal(c.src, "We were attracted");
    assert.equal(c.dst, "Halden Group was attracted");
    assert.deepEqual(c.alsoDelete, ["in our view"]);
  });
});

describe("14 stored directions, follow and no-op", () => {
  test("there are 14 stored directions", () => {
    assert.equal(STORED.length, 14);
  });

  for (const row of STORED) {
    test(`${row.id} FOLLOW scores followed`, () => {
      const got = scoreDirectiveFollow({
        direction: row.direction,
        statementText: row.statementText,
        revised: row.follow,
      });
      assert.equal(got.followed, true, `${row.id} FOLLOW: ${got.reason} shape=${got.shape}`);
    });

    test(`${row.id} NO-OP scores not-followed`, () => {
      const got = scoreDirectiveFollow({
        direction: row.direction,
        statementText: row.statementText,
        revised: row.statementText,
      });
      assert.equal(got.followed, false, `${row.id} NO-OP: ${got.reason} shape=${got.shape}`);
    });
  }
});
