/**
 * B469. The clause that says what the source contains stays.
 * The clause that says the source supports the statement does not.
 * lib/qc/reader-reason.mjs is the cut. src/modules/drafting/readerReason.js is the other copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { reasonFault } from "../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { readerEvidenceSentence as screenSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

describe("B469 clause kept", () => {
  test("08:3 and 14:2 name the source and the difference", () => {
    const one = readerEvidenceSentence(card("08", 3));
    const two = readerEvidenceSentence(card("14", 2));
    assert.equal(
      one,
      "The source describes the company's competitive position as 'enviable' in a specific vertical. However, 'exceptional' is a broader evaluative claim that the source does not state.",
    );
    assert.equal(
      two,
      "The source states that the regulatory pathway under EU MDR is now well-understood and incumbents have built up significant clearances. However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.",
    );
    assert.equal(screenSentence(card("08", 3)), one);
    assert.equal(screenSentence(card("14", 2)), two);
    assert.equal(reasonFault(one), "");
    assert.equal(reasonFault(two), "");
    assert.doesNotMatch(one, /\bsupports\b/i);
    assert.doesNotMatch(two, /\bsupports\b/i);
  });

  test("a difference with no source clause, and a dangling connective, are refused", () => {
    assert.equal(
      reasonFault("'exceptional' is a broader evaluative claim that the source does not state."),
      "the difference is named and what the source says is not",
    );
    assert.equal(
      reasonFault("However, 'exceptional' is a broader evaluative claim that the source does not state."),
      "a reason opens with a connective",
    );
  });

  test("no shown reason opens with a dangling connective", () => {
    const open = [];
    for (const row of pass.cards) {
      const reason = readerEvidenceSentence(row) || "";
      if (/^(?:However|But|Although)\b/.test(reason)) {
        open.push(`${String(row.fixtureId).padStart(2, "0")}:${row.index}`);
      }
    }
    assert.deepEqual(open, []);
  });
});
