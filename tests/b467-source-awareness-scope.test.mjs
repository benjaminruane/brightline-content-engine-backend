/**
 * B467. Source awareness decides borrowed or overstated language.
 * House style, number form, and relevance stay.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  applyEditorialSourceAwareness,
  restoredSourceAwarenessConcerns,
} from "../lib/qc/editorial-source-awareness.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

describe("B467 source awareness scope", () => {
  test("an Oxford comma in the source is kept", () => {
    const after = applyEditorialSourceAwareness({
      statement: "The list covers hormonal balance, energy and recovery, skin and hair health, and pregnancy.",
      concerns: [{
        concernCode: "oxford_comma",
        note: "The list is missing an Oxford comma before the last item.",
        suggestedDirection: "Add the Oxford comma.",
      }],
      passages: ["hormonal balance, energy and recovery, skin and hair health, and pregnancy"],
      editorialVerdict: "concern",
    });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
    assert.equal(after.editorialVerdict, "concern");
  });

  test("an evaluative word that is the source's own word still drops", () => {
    const after = applyEditorialSourceAwareness({
      statement: "The firm has an exceptional position.",
      concerns: [{
        concernCode: "hyperbole_vs_qualitative",
        note: "The word 'exceptional' is a distinction-claim.",
        suggestedDirection: "Delete 'exceptional'.",
      }],
      passages: ["an exceptional position in the market"],
      editorialVerdict: "concern",
    });
    assert.equal(after.dropped.length, 1);
    assert.equal(after.concerns.length, 0);
  });

  test("the three stored drops are shown again", () => {
    const keys = ["16:0", "15:24", "09:12"];
    for (const key of keys) {
      const [fixture, index] = key.split(":");
      const restored = restoredSourceAwarenessConcerns(card(fixture, Number(index)));
      assert.equal(restored.length, 1, key);
      assert.equal(card(fixture, Number(index)).editorialVerdict, "clean");
    }
    const hyperbole = card("04", 6);
    assert.equal(restoredSourceAwarenessConcerns(hyperbole).length, 0);
  });
});
