/**
 * B496. House style leaves the card.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { HOUSE_STYLE_CODES, HOUSE_STYLE_HEADINGS, splitHouseStyle } from "../lib/qc/house-style.mjs";
import { shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { HOUSE_STYLE_CODES as screenCodes, HOUSE_STYLE_HEADINGS as screenHeadings } from "../../brightline-content-engine-frontend/src/modules/reading/houseStyleSection.js";

const root = path.dirname(fileURLToPath(import.meta.url));

function quietCard(concerns) {
  return {
    statement: "Revenue grew 12 percent.",
    sentenceState: "nothing_raised",
    statementVerdict: { state: "nothing_raised", tier: "quiet" },
    displayVerdict: "supported_full",
    tier: "quiet",
    editorialVerdict: "concern",
    editorialConcerns: concerns,
    complianceConcerns: [{ concernCode: "forward_looking_statement_without_qualifier", text: "Add a hedge." }],
  };
}

test("a percentage notation concern leaves the card and does not change the tier", () => {
  const before = quietCard([{ concernCode: "percentage_notation", text: "Use the % symbol." }]);
  const split = splitHouseStyle(before.editorialConcerns);
  const after = { ...before, editorialConcerns: split.editorial, houseStyleConcerns: split.houseStyle };
  assert.equal(after.editorialConcerns.length, 0);
  assert.equal(after.houseStyleConcerns.length, 1);
  assert.equal(after.houseStyleConcerns[0].concernCode, "percentage_notation");
  assert.equal(shownState(after), "nothing_raised");
  assert.equal(shownTier(shownState(after)), shownTier(shownState(before)));
  assert.equal(combinedVerdict({
    verdict: before.statementVerdict,
    editorialConcerns: before.editorialConcerns,
    complianceConcerns: [],
  }).state, "nothing_raised");
});

test("materiality stays on the card and an em dash moves", () => {
  const split = splitHouseStyle([
    { concernCode: "materiality", text: "The figure is not material." },
    { concernCode: "em_dash", text: "Replace the long dash." },
  ]);
  assert.deepEqual(split.editorial.map((row) => row.concernCode), ["materiality"]);
  assert.deepEqual(split.houseStyle.map((row) => row.concernCode), ["em_dash"]);
});

test("compliance concerns are not house style input", () => {
  const compliance = [
    { concernCode: "percentage_notation", text: "This is a compliance row and stays." },
    { concernCode: "forward_looking_statement_without_qualifier", text: "Add a hedge." },
  ];
  const split = splitHouseStyle([]);
  assert.equal(split.houseStyle.length, 0);
  assert.deepEqual(compliance.map((row) => row.concernCode), [
    "percentage_notation",
    "forward_looking_statement_without_qualifier",
  ]);
});

test("oxford comma moves off the card into house style", () => {
  const split = splitHouseStyle([
    { concernCode: "oxford_comma", text: "The list is missing a comma before and." },
    { concernCode: "materiality", text: "The figure is not material." },
  ]);
  assert.deepEqual(split.editorial.map((row) => row.concernCode), ["materiality"]);
  assert.deepEqual(split.houseStyle.map((row) => row.concernCode), ["oxford_comma"]);
});

test("backend and frontend house style lists match", () => {
  assert.deepEqual(screenCodes, HOUSE_STYLE_CODES);
  assert.deepEqual(screenHeadings, HOUSE_STYLE_HEADINGS);
  const source = readFileSync(path.join(root, "../lib/qc/house-style.mjs"), "utf8");
  assert.equal(source.includes("oxford_comma"), true);
});
