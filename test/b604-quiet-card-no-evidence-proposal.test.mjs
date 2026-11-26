import assert from "node:assert/strict";
import { test } from "vitest";
import { inventoryStatements } from "../lib/revise-actions/inventory.mjs";

const statement = "Aldermoor plans to build a portfolio of 12-15 companies with enterprise values of EUR 150-500 million.";

test("a card the review ended quiet gets no evidence proposal (Aldermoor S3)", () => {
  const rows = [{ id: "2", text: statement, qcCard: { statement, supportState: "conflicting", displayVerdict: "conflict", sentenceState: "nothing_raised", sentenceLabel: "Nothing raised" } }];
  assert.equal(inventoryStatements(rows).some((row) => row.kind === "evidence"), false);
});

test("a raised conflict still gets one", () => {
  const rows = [{ id: "2", text: statement, qcCard: { statement, supportState: "conflicting", displayVerdict: "conflict", sentenceState: "conflicts", sentenceLabel: "Conflicts with the source" } }];
  assert.equal(inventoryStatements(rows).some((row) => row.kind === "evidence"), true);
});
