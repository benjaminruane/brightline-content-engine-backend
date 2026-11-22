/**
 * B565. House-style forms match the source, in both directions.
 * A new fact-rewriting guide entry without an equivalence fails this file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { applyNamedTransform } from "../lib/style-guide/auto-fix.mjs";
import { STYLE_GUIDE } from "../lib/style-guide/guide.mjs";
import { elementFound, extractElements } from "../lib/qc/b394-elements.mjs";
import { EQUIVALENCE_PAIRS, guideEquivalences } from "../lib/qc/figure-equivalence.mjs";

const CHOICES = {
  magnitude: "billions",
  dates: "month_day",
  periods: "abbreviated",
  numberWords: "up_to_twelve",
  legalIdentifiers: "omit",
};

function elementsOf(text) {
  return extractElements(text, text, text).filter((element) => (
    element.kind === "figure" || element.kind === "date" || element.kind === "name"
  ));
}

function asStatement(text) {
  if (elementsOf(text).length) return text;
  return `Results include ${text} this year.`;
}

function matches(statement, source) {
  const written = asStatement(statement);
  const against = asStatement(source);
  const elements = elementsOf(written);
  assert.ok(elements.length, written);
  for (const element of elements) {
    assert.equal(elementFound(element, against), true, `${element.surface} in ${against}`);
  }
}

test("every fact-rewriting guide entry has an equivalence, and both forms match", () => {
  const rows = guideEquivalences();
  assert.ok(rows.length >= 8);
  for (const row of rows) {
    for (const [left, right] of row.pairs) {
      matches(left, right);
      matches(right, left);
    }
  }
});

test("a transform that rewrites a fact still matches, and a new one must name an equivalence", () => {
  const samples = Object.values(EQUIVALENCE_PAIRS).flat();
  for (const entry of STYLE_GUIDE) {
    const id = entry.enforcement?.transformId;
    if (!id) continue;
    let changed = false;
    for (const [left, right] of samples) {
      for (const sample of [left, right]) {
        if (applyNamedTransform(id, sample, { styleChoices: CHOICES }) !== sample) changed = true;
      }
    }
    if (changed) assert.ok(entry.equivalence, `${entry.id} rewrites a fact and has no equivalence`);
    if (!entry.equivalence) continue;
    for (const [left, right] of EQUIVALENCE_PAIRS[entry.equivalence] || []) {
      for (const [sample, other] of [[left, right], [right, left]]) {
        const next = applyNamedTransform(id, sample, { styleChoices: CHOICES });
        if (next === sample) continue;
        matches(next, other);
      }
    }
  }
});

test("USD 5.9 million matches the ClearPoint passage", () => {
  const review = JSON.parse(readFileSync("/Users/benjaminruane/ce-diagnostics/b565/clearpoint-pdf-review.json", "utf8"));
  const source = review.sources.map((item) => item.text || "").join("\n");
  const statement = review.statements[3].text;
  const figure = elementsOf(statement).find((element) => element.surface === "USD 5.9 million");
  assert.ok(figure);
  assert.equal(elementFound(figure, source), true);
});

test("a bare dollar is not USD when the source uses another dollar", () => {
  const statement = "The price was USD 5 million.";
  const source = "The price was C$ 4 million and also $5 million.";
  const figure = elementsOf(statement).find((element) => element.kind === "figure");
  assert.equal(elementFound(figure, source), false);
});
