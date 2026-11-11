/**
 * B490. The completion field sets label and tier. A loud card stays loud.
 * Synthetic fields on the stored B486 pass. No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b486/pass-1.json"),
  "utf8",
));

function card(id, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === id && entry.index === index);
  if (!row) throw new Error(`missing ${id}:${index}`);
  return row;
}

function withCompletion(row, completion) {
  return { ...row, readingNote: { ...(row.readingNote || {}), completion } };
}

test("pending gives demands and predates gives light", () => {
  const pending = withCompletion(card("04", 0), "pending");
  assert.equal(shownState(pending), "conflicts");
  assert.equal(shownLabel(pending), "Conflicts with the source");
  assert.equal(shownTier(shownState(pending)), "demands");
  const predates = withCompletion(card("04", 0), "predates");
  assert.equal(shownState(predates), "beyond");
  assert.equal(shownLabel(predates), "Goes beyond the source");
  assert.equal(shownTier(shownState(predates)), "light");
});

test("a card loud for another reason stays loud", () => {
  const row = withCompletion(card("18", 4), "predates");
  assert.equal(shownLabel(card("18", 4)), "Conflicts with the source");
  assert.equal(shownState(row), "conflicts");
  assert.equal(shownTier(shownState(row)), "demands");
});
