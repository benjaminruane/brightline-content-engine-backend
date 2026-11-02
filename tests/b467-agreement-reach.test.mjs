/**
 * B467. Agreement is the whole sentence, and a possessive is not a quotation.
 * A sentence that only reports what the source contains is kept.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { agreementPatternRecords, assertsAgreement } from "../lib/qc/source-account.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { agreementPatternRecords as screenRecords } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

const LONG = "The source describes the company's competitive position as 'enviable' in a specific vertical, which supports the statement's claim of an 'exceptional' competitive position.";

describe("B467 agreement reach", () => {
  test("the screen uses the same agreement patterns", () => {
    assert.deepEqual(screenRecords(), agreementPatternRecords());
  });

  test("a long clause that says the source supports the statement is agreement", () => {
    assert.equal(assertsAgreement(LONG), true);
    assert.equal(assertsAgreement("The source confirms the statement."), true);
    assert.equal(assertsAgreement("This matches the statement."), true);
    assert.equal(assertsAgreement("The source does not confirm the statement."), false);
    assert.equal(assertsAgreement("The source describes a market that supports growth. The statement adds a date."), false);
    assert.equal(assertsAgreement('The passage quotes "supported by the board" and the statement adds a date.'), false);
  });

  test("08:3 and 14:2 no longer assert agreement", () => {
    const one = readerEvidenceSentence(card("08", 3));
    const two = readerEvidenceSentence(card("14", 2));
    assert.equal(assertsAgreement(one), false);
    assert.equal(assertsAgreement(two), false);
    assert.match(one, /enviable competitive position/);
    assert.match(two, /regulatory pathway under EU MDR/);
    assert.doesNotMatch(one, /\bsupports\b/i);
    assert.doesNotMatch(two, /\bsupports\b/i);
  });
});
