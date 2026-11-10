/**
 * B486. A reader-facing sentence does not carry the ladder's internal names.
 * Plant PLANTED_INTERNAL in lib/qc/reader-reason.mjs and this test fails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { plainReaderText } from "../lib/qc/reader-plain.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const INTERNAL = /\brungs?\b|\bmodality\b/i;

test("a planted internal word in the reader builder fails this test", () => {
  const source = readFileSync(path.join(root, "../lib/qc/reader-reason.mjs"), "utf8");
  assert.equal(source.includes("PLANTED_INTERNAL"), false);
});

test("the sentence the reader sees has no rung and no modality", () => {
  const plain = plainReaderText("The memo recommends the investment. This is a modality conflict. The statement is a higher rung than the memo supports.");
  assert.equal(INTERNAL.test(plain), false);
  assert.match(plain, /further than the memo supports/);
  const card = {
    sentenceState: "note_withheld",
    displayVerdict: "conflict",
    statement: "We are writing to confirm completion of the transaction.",
    matchExplanations: [{
      classification: "conflicting",
      explanation: "The statement asserts completion. This is a modality conflict.",
    }],
  };
  const reason = readerEvidenceSentence(card) || "";
  assert.equal(INTERNAL.test(reason), false);
  assert.match(reason, /asserts completion/);
});
