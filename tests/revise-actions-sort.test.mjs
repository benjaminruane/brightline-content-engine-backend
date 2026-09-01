/**
 * Primary control for the per-finding action list.
 * S1 marketing and S3 overreach must be ACKNOWLEDGE policy_forbids.
 * If they come back ACTION, the slice is wrong.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { buildSortedEntries } from "../lib/revise-actions/sort.mjs";

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
    assert.equal(found.sort?.reasonCode, "policy_forbids");
  });

  test("S3 overreach is ACKNOWLEDGE policy_forbids", () => {
    const found = row(entries, "3", "editorial", "overreach_unsupported_causal");
    assert.ok(found, "S3 overreach finding must exist");
    assert.equal(found.disposition, "ACKNOWLEDGE");
    assert.equal(found.sort?.reasonCode, "policy_forbids");
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
    assert.equal(found.sort?.reasonCode, "silence_no_edit");
  });
});
