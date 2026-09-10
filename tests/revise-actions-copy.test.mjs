/**
 * User-facing action-list copy must not carry internal vocabulary.
 * RED against the current acknowledge strings before the copy rewrite.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { findBannedUserCopy } from "../lib/revise-actions/user-copy.mjs";
import { buildSortedEntries, NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_PATH = path.join(
  __dirname,
  "..",
  "scripts",
  "diagnostic",
  "revise",
  "suggest-after-r10-review1.json"
);

function loadStatements() {
  const json = JSON.parse(readFileSync(REVIEW_PATH, "utf8"));
  return json?.payload?.statements ?? [];
}

describe("revise-actions user-facing copy", () => {
  test("acknowledge reasons contain no banned internal vocabulary", () => {
    const entries = buildSortedEntries(loadStatements());
    const hits = [];
    for (const entry of entries) {
      if (entry.disposition !== "ACKNOWLEDGE") continue;
      for (const term of findBannedUserCopy(entry.noProposalReason)) {
        hits.push({ id: entry.id, term, text: entry.noProposalReason });
      }
    }
    assert.deepEqual(hits, []);
  });

  test("a model explanation that names a silent card is flagged", () => {
    const hits = findBannedUserCopy(
      "This preserves the original claim exactly as written while replacing first-person plural, as required by the policy for silent cards."
    );
    assert.ok(hits.length > 0, "expected banned terms in the fixture explanation");
  });

  test("the rule is flagged when found in live copy", () => {
    const hits = findBannedUserCopy("in line with the rule that only first-person references may be altered");
    assert.ok(hits.includes("the rule"));
  });

  test("plain acknowledge wording is clean", () => {
    assert.deepEqual(
      findBannedUserCopy(
        "This concern stands. No source speaks to the claim, so changing the wording is yours to decide, not the product's."
      ),
      []
    );
  });

  test("unnamed first-person acknowledge wording is clean", () => {
    assert.deepEqual(findBannedUserCopy(NO_PROPOSAL.first_person_unnamed), []);
    assert.equal(
      NO_PROPOSAL.first_person_unnamed,
      "This sentence is written in the first person, which reporting commentary does not allow. Nothing is proposed. Rewrite it in the third person in the draft."
    );
  });

  test("partial_no_edit and partial_policy contain no silence claim", () => {
    const silenceClaims = [
      "no source speaks",
      "no supplied source",
      "no source spoke",
      "speaks to this claim",
      "speaks to the claim",
    ];
    for (const text of [NO_PROPOSAL.partial_no_edit, NO_PROPOSAL.partial_policy]) {
      const lowered = text.toLowerCase();
      for (const claim of silenceClaims) {
        assert.equal(lowered.includes(claim), false, `${text} must not contain "${claim}"`);
      }
      assert.deepEqual(findBannedUserCopy(text), []);
    }
    assert.equal(
      NO_PROPOSAL.partial_no_edit,
      "A source supports part of this statement, not all of it. Nothing is proposed and the wording is yours."
    );
    assert.equal(
      NO_PROPOSAL.partial_policy,
      "This concern stands. Nothing is proposed. The wording is yours."
    );
  });

  test("true-silence acknowledge strings are unchanged", () => {
    assert.equal(
      NO_PROPOSAL.silence_no_edit,
      "No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours."
    );
    assert.equal(
      NO_PROPOSAL.policy_forbids,
      "This concern stands. No source speaks to the claim, so changing the wording is yours to decide, not the product's."
    );
  });
});
