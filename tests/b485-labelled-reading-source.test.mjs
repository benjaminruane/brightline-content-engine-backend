/**
 * B485. Each source the note sees is a named block with that document's date.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { readingSourceText } from "../lib/qc/reading-review.mjs";

const ORDER = /\b(later|earlier|newer|older|newest|oldest)\b/i;

function headers(text) {
  return text
    .split("\n\n")
    .filter((block) => block.startsWith("Document:"))
    .map((block) => block.split("\n").slice(0, 2).join("\n"));
}

describe("B485 labelled reading source", () => {
  test("an undated document is named and marked no date", () => {
    const text = "The company employs 142 people.";
    const out = readingSourceText([{ label: "alpha memo", text }]);
    assert.equal(out, `Document: alpha memo\nDate: no date\n\n${text}`);
  });

  test("a same-day pair and a one-dated pair present no order", () => {
    const same = readingSourceText([
      { label: "alpha memo", text: "Date: 15 April 2025\nThe total is 10." },
      { label: "beta memo", text: "Date: 15 April 2025\nThe total is 12." },
    ]);
    assert.equal(ORDER.test(headers(same).join("\n")), false);
    assert.equal((headers(same).join("\n").match(/^Date: 15 April 2025$/gm) || []).length, 2);

    const one = readingSourceText([
      { label: "alpha memo", text: "Date: 28 May 2025\nHeadcount is 10." },
      { label: "beta memo", text: "Headcount is 12." },
    ]);
    assert.equal(ORDER.test(headers(one).join("\n")), false);
    assert.match(one, /^Document: alpha memo\nDate: 28 May 2025$/m);
    assert.match(one, /^Document: beta memo\nDate: no date$/m);
  });

  test("a single source is the same text with a label", () => {
    const text = "Revenue was EUR 10 million in the year.";
    const out = readingSourceText([{ label: "only memo", text }]);
    assert.equal(out.endsWith(text), true);
    assert.equal(out.slice(0, out.length - text.length), "Document: only memo\nDate: no date\n\n");
  });
});
