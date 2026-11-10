/**
 * B486. A reader-facing sentence has no em dash and no en dash.
 * Plant PLANTED_DASH in lib/qc/reader-plain.mjs and this test fails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { plainReaderText } from "../lib/qc/reader-plain.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const DASH = /[\u2014\u2013]/;

test("a planted dash in the reader builder fails this test", () => {
  const source = readFileSync(path.join(root, "../lib/qc/reader-plain.mjs"), "utf8");
  assert.equal(source.includes("PLANTED_DASH"), false);
});

test("an em dash and an en dash become a hyphen before the reader sees them", () => {
  const plain = plainReaderText("Completion is subject to clearance \u2014 a commitment, not a completed investment. The range is 2\u20133 years.");
  assert.equal(DASH.test(plain), false);
  assert.match(plain, /clearance - a commitment/);
  assert.match(plain, /2 - 3 years/);
  const card = {
    sentenceState: "conflicts",
    displayVerdict: "conflict",
    statement: "The fund has invested.",
    readingNote: { bucket: "conflicts", text: "The update says completion is subject to clearance \u2014 a commitment." },
    displayedEvidenceProse: "The update says completion is subject to clearance \u2014 a commitment.",
  };
  const reason = readerEvidenceSentence(card) || "";
  assert.equal(DASH.test(reason), false);
});
