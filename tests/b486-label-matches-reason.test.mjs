/**
 * B486. A reason that sets two figures against each other is a conflict label.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { addedQualifierConcern } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel } from "../lib/qc/shown-verdict.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const pass = JSON.parse(readFileSync(path.join(root, "../scripts/diagnostic/b485/pass-1.json"), "utf8"));

function card(id, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === id && row.index === index);
}

test("a figures disagreement is not labelled Goes beyond the source", () => {
  for (const [id, index] of [["18", 8], ["25", 8]]) {
    const row = card(id, index);
    const reason = readerEvidenceSentence(row) || "";
    assert.match(reason, /2\.6x MOIC and 21% IRR/);
    assert.match(reason, /2\.8x MOIC and 23% IRR/);
    assert.equal(shownLabel(row), "Conflicts with the source");
    assert.notEqual(shownLabel(row), "Goes beyond the source");
  }
});

test("compliance raises 23% gross IRR against a source that says 23% IRR", () => {
  const concern = addedQualifierConcern(
    "The base case generates 2.8x MOIC and 23% gross IRR.",
    [{ label: "memo", text: "The base case generates a 2.8x MOIC and 23% IRR." }],
  );
  assert.equal(concern.concernCode, "return_figure_gross_net_qualifier_missing");
  assert.match(concern.note, /23% gross IRR/);
  assert.match(concern.note, /23% IRR/);
  assert.equal(addedQualifierConcern(
    "The base case generates 2.8x MOIC and 23% gross IRR.",
    [{ text: "The base case generates a 2.8x MOIC and 23% gross IRR." }],
  ), null);
});
