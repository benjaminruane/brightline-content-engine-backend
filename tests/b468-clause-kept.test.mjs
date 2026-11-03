/**
 * B468. A sentence that may not be shown does not take the sentence that may.
 * lib/qc/reader-reason.mjs readerSentences is the cut.
 * src/modules/drafting/readerReason.js is the other copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { readerEvidenceSentence, readerSentences } from "../lib/qc/reader-reason.mjs";
import { releaseReaderProse } from "../lib/qc/reader-prose-guard.mjs";
import { sourceCorpus } from "../lib/qc/quoted-span.mjs";
import { assertsAgreement } from "../lib/qc/source-account.mjs";
import { readerEvidenceSentence as screenSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

const PROBES = [
  "The source states revenue of EUR 318 million, so the figure is verified.",
  "The passage is supported by the source for this period.",
  "The source states the headcount, aligning with the sentence.",
  "The statement treats the pilot as a programme.",
  "The sentence is stated without supporting context in the passage.",
];

describe("B468 clause kept", () => {
  test("08:3 and 14:2 state the difference and drop the agreement", () => {
    const one = readerEvidenceSentence(card("08", 3));
    const two = readerEvidenceSentence(card("14", 2));
    assert.equal(one, "However, 'exceptional' is a broader evaluative claim that the source does not state.");
    assert.equal(two, "However, 'matured' implies a broader conclusion about the regulatory environment that the source does not state.");
    assert.equal(screenSentence(card("08", 3)), one);
    assert.equal(screenSentence(card("14", 2)), two);
    assert.equal(assertsAgreement(one), false);
    assert.equal(assertsAgreement(two), false);
  });

  test("the cut keeps the second sentence of the stored prose", () => {
    const prose = card("08", 3).displayedEvidenceProse;
    const parts = readerSentences(prose);
    assert.equal(parts.length, 2);
    assert.match(parts[0], /\bsupports\b/);
    assert.equal(parts[1], readerEvidenceSentence(card("08", 3)));
  });

  test("the B462 probes are still an empty reason", () => {
    for (const text of PROBES) {
      const row = {
        sentenceState: "not_in_source",
        displayVerdict: "not_supported",
        displayedEvidenceProse: text,
        statement: "Revenue was EUR 318 million.",
      };
      assert.equal(readerEvidenceSentence(row), "");
      assert.equal(screenSentence(row), "");
    }
  });

  test("the three quote lines are still shown", () => {
    for (const key of ["06:3", "15:9", "17:7"]) {
      const [fixture, index] = key.split(":");
      const row = card(fixture, Number(index));
      const raw = row.silences.find((item) => item.field === "evidenceSummary").content[0];
      const released = releaseReaderProse(raw, sourceCorpus(row));
      assert.equal(released.withheld, false, key);
      assert.match(released.text, key === "17:7" ? /structurally supported/ : /supported/, key);
    }
    const partial = readerEvidenceSentence(card("15", 9));
    assert.match(partial, /supported/);
    assert.match(partial, /does not explicitly state/);
  });
});
