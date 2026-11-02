/**
 * B467. A check that did not run says why. The slug is not the sentence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test } from "vitest";
import { endorsementHit } from "../lib/qc/endorsement-phrases.mjs";
import { NOT_CHECKED_SENTENCES, notCheckedReasonSentence } from "../lib/qc/not-reviewed-reason.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const screen = await import(pathToFileURL(path.join(
  root,
  "../brightline-content-engine-frontend/src/modules/drafting/notCheckedReason.js",
)).href);
const pass = JSON.parse(readFileSync(path.join(root, "scripts/diagnostic/b464/pass-1.json"), "utf8"));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

describe("B467 not checked reason", () => {
  test("the screen map matches lib/qc/not-reviewed-reason.mjs", () => {
    assert.deepEqual(screen.NOT_CHECKED_SENTENCES, NOT_CHECKED_SENTENCES);
  });

  test("11:9 and 15:12 show a sentence, and an empty reason stays empty", () => {
    for (const key of ["11:9", "15:12"]) {
      const [fixture, index] = key.split(":");
      const row = card(fixture, Number(index));
      const sentence = notCheckedReasonSentence(row.evidenceNotReviewedReason);
      assert.equal(sentence, "This check did not run, because the match came back empty.");
      assert.equal(sentence.includes("empty_confirmation_refused"), false);
      assert.equal(endorsementHit(sentence), null);
      assert.equal(screen.notCheckedReasonSentence(row.evidenceNotReviewedReason), sentence);
    }
    assert.equal(notCheckedReasonSentence(""), "");
    assert.equal(notCheckedReasonSentence(null), "");
  });
});
