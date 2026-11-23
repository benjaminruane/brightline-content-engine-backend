/**
 * B577. A card reason is the model's explanation of what the source says.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardReason } from "../lib/qc/card-reason.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const review = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b577/gemspring-dirty-after-b574.json"), "utf8"));
const title = review.sources[0].label;

const S3 = "The source says Fund IV reached its hard cap in less than three months, not under two months, and the source gives no June 2026 close date.";
const S5 = "The source says Gemspring's team is Fund IV's largest single investor, not the second-largest as the statement claims.";

function reasonAt(index) {
  const card = review.statements[index].qcCard;
  const note = review.reading.sentences[index]?.note?.text || "";
  return cardReason(card, { notes: note ? [note] : [] });
}

test("S3 and S5 use the model's full explanation", () => {
  assert.equal(reasonAt(2), S3);
  assert.equal(reasonAt(4), S5);
});

test("no reason is a placeholder, a title, or a file name", () => {
  for (let index = 0; index < review.statements.length; index += 1) {
    const reason = reasonAt(index);
    assert.ok(reason.length > 20, `S${index + 1} is empty`);
    assert.doesNotMatch(reason, /a different value/, `S${index + 1}`);
    assert.doesNotMatch(reason, /states "/, `S${index + 1}`);
    assert.doesNotMatch(reason, /; the draft says /, `S${index + 1}`);
    assert.equal(reason.includes(title), false, `S${index + 1} names the file`);
    assert.doesNotMatch(reason, /\.(html?|pdf|docx?|txt)\b/i, `S${index + 1}`);
    assert.match(reason, /[.!?]$/, `S${index + 1} ends mid-word`);
    assert.ok(reason.split(/(?<=[.!?])\s+/).length <= 3, `S${index + 1} is more than three sentences`);
  }
});
