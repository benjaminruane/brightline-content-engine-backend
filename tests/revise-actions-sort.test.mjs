/**
 * Primary control for the per-finding action list.
 * S1 marketing and S3 overreach must stay ACKNOWLEDGE (conflict-free partials).
 * If they come back ACTION, the slice is wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { buildSortedEntries, NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

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

function row(entries, statementId, kind, rule) {
  return entries.find(
    (e) =>
      String(e.statementId) === String(statementId) &&
      e.kind === kind &&
      String(e.rule) === String(rule)
  );
}

describe("revise-actions sort (r10-review1)", () => {
  const entries = buildSortedEntries(loadStatements());

  test("S1 marketing is ACKNOWLEDGE policy_forbids", () => {
    const found = row(entries, "1", "editorial", "marketing_language_excess");
    assert.ok(found, "S1 marketing finding must exist");
    assert.equal(found.disposition, "ACKNOWLEDGE");
    assert.equal(found.sort?.reasonCode, "partial_policy");
  });

  test("S3 overreach is ACKNOWLEDGE policy_forbids", () => {
    const found = row(entries, "3", "editorial", "overreach_unsupported_causal");
    assert.ok(found, "S3 overreach finding must exist");
    assert.equal(found.disposition, "ACKNOWLEDGE");
    assert.equal(found.sort?.reasonCode, "partial_policy");
  });

  test("S1 voice is ACTION", () => {
    const found = row(entries, "1", "editorial", "voice_consistency");
    assert.ok(found, "S1 voice finding must exist");
    assert.equal(found.disposition, "ACTION");
  });

  test("S4 evidence is ACTION", () => {
    const found = row(entries, "4", "evidence", "conflicting");
    assert.ok(found, "S4 evidence finding must exist");
    assert.equal(found.disposition, "ACTION");
  });

  test("a non-closable conflict fill is ACKNOWLEDGE conflict_unaddressed", async () => {
    const found = row(entries, "4", "evidence", "conflicting");
    assert.ok(found, "S4 evidence finding must exist");
    let called = 0;
    const result = await fillAction(
      {
        ...found,
        statement: "We are writing to confirm completion of the transaction.",
        primaryExcerpt: "We recommend an investment of EUR 158 million.",
        thing2: "",
      },
      {
        callModel: async () => {
          called += 1;
          return { text: "{}" };
        },
      }
    );
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.noProposalReason, NO_PROPOSAL.conflict_unaddressed);
  });

  test("S7 voice is ACTION", () => {
    const found = row(entries, "7", "editorial", "voice_consistency");
    assert.ok(found, "S7 voice finding must exist");
    assert.equal(found.disposition, "ACTION");
  });

  test("S8 first_person is ACTION", () => {
    const found = row(entries, "8", "editorial", "first_person_plural");
    assert.ok(found, "S8 first_person finding must exist");
    assert.equal(found.disposition, "ACTION");
  });

  test("S1 evidence is ACKNOWLEDGE silence_no_edit", () => {
    const found = row(entries, "1", "evidence", "partial");
    assert.ok(found, "S1 evidence finding must exist");
    assert.equal(found.disposition, "ACKNOWLEDGE");
    assert.equal(found.sort?.reasonCode, "partial_no_edit");
  });

  test("S1 evidence copy is the partial_no_edit sentence", () => {
    const found = row(entries, "1", "evidence", "partial");
    assert.ok(found, "S1 evidence finding must exist");
    assert.equal(
      found.noProposalReason,
      "A source supports part of this statement, not all of it. Nothing is proposed and the wording is yours."
    );
    assert.equal(found.noProposalReason, NO_PROPOSAL.partial_no_edit);
  });
});
