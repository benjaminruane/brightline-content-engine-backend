/**
 * B560. A percentage range is the same figure however it is written.
 * The row 02 draft says 60-70%. The Shopify memo says 60%-70%.
 * A damaged dash, as in 65ñ70%, is the same kind of range.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { elementFound, extractElements } from "../lib/qc/b394-elements.mjs";

const DRAFT = "We are backing founder and CEO Tobi Lutke and his Ottawa-based team, who have built a strong product and engineering culture while recruiting talent at 60-70% of Silicon Valley cost levels.";

function percentFigures(text) {
  return extractElements(text, text, text).filter((element) => element.kind === "figure" && element.unit === "percent");
}

test("60-70% matches 60%-70%, 60% to 70%, 60 to 70 percent, and a damaged dash", () => {
  const figures = percentFigures(DRAFT);
  assert.deepEqual(figures.map((figure) => figure.written), [60, 70]);
  for (const source of [
    "recruit talent in Ottawa at 60%-70% of the cost of similar talent in Silicon Valley",
    "recruit talent at 60% to 70% of the cost",
    "recruit talent at 60 to 70 percent of the cost",
    "recruit talent at 60\u00f170% of the cost",
  ]) {
    for (const figure of figures) {
      assert.equal(elementFound(figure, source), true, source);
    }
  }
});
