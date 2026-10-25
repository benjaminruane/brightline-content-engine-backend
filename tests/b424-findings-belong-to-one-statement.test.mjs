import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardEvidenceFindings, findingsByStatement } from "../lib/qc/evidence-findings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const review = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"), "utf8"));
const actions = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json"), "utf8"));
const entries = actions.entries;
const refinancingNote = "not the entire company";

function cardAt(index) {
  const row = review.statements.find((item) => item.qcCard.index === index);
  return { ...row.qcCard, statement: row.qcCard.statement };
}

test("the refinancing finding is on its own card and the growth and Fortysouth cards have none", () => {
  const growth = cardEvidenceFindings(cardAt(2), entries);
  const fortysouth = cardEvidenceFindings(cardAt(5), entries);
  const refinancing = cardEvidenceFindings(cardAt(6), entries);
  assert.equal(growth.length, 0);
  assert.equal(fortysouth.length, 0);
  assert.equal(refinancing.length, 1);
  assert.equal(refinancing[0].rule, "partial");
  assert.match(refinancing[0].note, /not the entire company/);
  assert.equal(refinancing[0].statementId, "6");
});

test("a saved card with no statement verdict still shows only its own finding", () => {
  const saved = {
    index: 6,
    statement: cardAt(6).statement,
    evidenceFindings: [],
  };
  const shown = cardEvidenceFindings(saved, entries);
  assert.equal(shown.length, 1);
  assert.match(shown[0].note, new RegExp(refinancingNote));
  const other = cardEvidenceFindings({ ...saved, index: 2, statement: cardAt(2).statement }, entries);
  assert.equal(other.length, 0);
});

test("a concern already on the card is kept, and the inventory map does not copy it onto the other cards", () => {
  const local = cardEvidenceFindings(
    { index: 1, statement: "EBITDA growth driven by capital expenditure is the claim." },
    [{ concernCode: "overreach_unsupported_causal", note: "The draft implies a cause.", span: [{ startChar: 0, endChar: 43 }] }],
  );
  assert.equal(local.length, 1);
  assert.equal(local[0].quote, "EBITDA growth driven by capital expenditure");

  const mapped = findingsByStatement(review.statements, entries);
  assert.equal(mapped["2"].length, 0);
  assert.equal(mapped["5"].length, 0);
  assert.equal(mapped["6"].length, 1);
  assert.match(mapped["6"][0].note, /not the entire company/);
  const copies = Object.entries(mapped).filter(([, rows]) => rows.some((row) => row.note.includes(refinancingNote)));
  assert.deepEqual(copies.map(([key]) => key), ["6"]);
});
