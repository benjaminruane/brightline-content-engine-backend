/**
 * B356. The clause that says a claim checks out sits before a trailing
 * reviewer instruction, as one sentence, never "The source also states".
 * Recorded comments from tests/fixtures/real-runs-2026-09-29/.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  appendSourceStatedClauses,
  buildClaimInventory,
} from "../lib/qc/commentary-inventory.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

function confirmingPassagesFromCard(card) {
  const out = [];
  const primary =
    typeof card.primaryExcerpt?.passage === "string"
      ? card.primaryExcerpt.passage
      : typeof card.primaryExcerpt === "string"
        ? card.primaryExcerpt
        : "";
  if (primary.trim()) out.push(primary);
  for (const span of card.supportSpans || []) {
    if (typeof span?.passage === "string" && span.passage.trim()) out.push(span.passage);
  }
  return out;
}

function applyRecorded(payload, index) {
  const stmt = payload.statements[index];
  const card = stmt.qcCard;
  return appendSourceStatedClauses({
    commentary: card.evidenceSummary,
    inventory: buildClaimInventory(stmt.text),
    confirmingPassages: confirmingPassagesFromCard(card),
  });
}

function assertOldWordingGone(text) {
  assert.equal(/The source also states/.test(text), false);
}

describe("B356 commentary clause placement", () => {
  test("clean statement 0: 13% sits before the reviewer instruction", () => {
    const recorded = CLEAN.statements[0].qcCard.evidenceSummary;
    const result = applyRecorded(CLEAN, 0);
    assert.equal(recorded.includes("The reviewer should reconcile the timeframes or remove the claim."), true);
    assert.equal(
      result.commentary.includes(
        "13% matches the source. The reviewer should reconcile the timeframes or remove the claim."
      ),
      true
    );
    assert.equal(result.commentary.endsWith("13% matches the source."), false);
    assert.equal(result.commentary.endsWith("The reviewer should reconcile the timeframes or remove the claim."), true);
    assert.deepEqual(result.appended, ["13%"]);
    assertOldWordingGone(result.commentary);
  });

  test("doctored statement 0: same shape", () => {
    const result = applyRecorded(DOC, 0);
    assert.equal(
      result.commentary.includes(
        "13% matches the source. The reviewer should reconcile these discrepancies or remove the claim."
      ),
      true
    );
    assert.equal(result.commentary.endsWith("13% matches the source."), false);
    assert.equal(result.commentary.endsWith("The reviewer should reconcile these discrepancies or remove the claim."), true);
    assert.deepEqual(result.appended, ["13%"]);
    assertOldWordingGone(result.commentary);
  });

  test("doctored statement 5: same shape, item 6.3%", () => {
    const result = applyRecorded(DOC, 5);
    assert.equal(
      result.commentary.includes(
        "6.3% matches the source. The reviewer should reconcile these discrepancies or remove the claim."
      ),
      true
    );
    assert.equal(result.commentary.endsWith("6.3% matches the source."), false);
    assert.equal(result.commentary.endsWith("The reviewer should reconcile these discrepancies or remove the claim."), true);
    assert.deepEqual(result.appended, ["6.3%"]);
    assertOldWordingGone(result.commentary);
  });

  test("a comment with no reviewer instruction: the sentence goes last", () => {
    const recorded = CLEAN.statements[2].qcCard.evidenceSummary;
    assert.equal(/\breviewer should\b/i.test(recorded), false);
    const result = appendSourceStatedClauses({
      commentary: recorded,
      inventory: ["13%"],
      confirmingPassages: confirmingPassagesFromCard(CLEAN.statements[0].qcCard),
    });
    assert.equal(result.commentary.startsWith(recorded), true);
    assert.equal(result.commentary.endsWith("13% matches the source."), true);
    assertOldWordingGone(result.commentary);
  });

  test("two qualifying items in one comment: one sentence, match not matches", () => {
    const recorded = CLEAN.statements[2].qcCard.evidenceSummary;
    const result = appendSourceStatedClauses({
      commentary: recorded,
      inventory: ["13%", "6.3%"],
      confirmingPassages: ["13% on opening shareholders funds and like-for-like sales growth of 6.3%."],
    });
    assert.deepEqual(result.appended, ["13%", "6.3%"]);
    assert.equal(result.commentary.includes("13% and 6.3% match the source."), true);
    assert.equal(/13% matches the source/.test(result.commentary), false);
    assert.equal(/6\.3% matches the source/.test(result.commentary), false);
    assert.equal((result.commentary.match(/match(?:es)? the source\./g) || []).length, 1);
    assertOldWordingGone(result.commentary);
  });

  test("a comment whose last sentence contains a decimal figure is not cut mid-figure", () => {
    const commentary =
      "The source confirms the 2.2% stake. The reviewer should check the 2.2% figure.";
    const result = appendSourceStatedClauses({
      commentary,
      inventory: ["13%"],
      confirmingPassages: ["Total return of 13% on opening shareholders funds."],
    });
    assert.equal(
      result.commentary.includes("13% matches the source. The reviewer should check the 2.2% figure."),
      true
    );
    assert.equal(result.commentary.includes("2. 2%"), false);
    assert.equal(result.commentary.endsWith("The reviewer should check the 2.2% figure."), true);
    assert.equal(result.commentary.includes("2.2%"), true);
    assertOldWordingGone(result.commentary);
  });

  test("the string The source also states appears nowhere in the output", () => {
    const comments = [
      applyRecorded(CLEAN, 0).commentary,
      applyRecorded(DOC, 0).commentary,
      applyRecorded(DOC, 5).commentary,
    ];
    for (const text of comments) {
      assertOldWordingGone(text);
    }
  });
});
