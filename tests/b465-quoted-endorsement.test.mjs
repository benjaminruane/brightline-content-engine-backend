/**
 * B465. A banned phrase inside a verbatim source quotation does not withhold the line.
 * The same phrase in the product's own voice still does.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { releaseReaderProse } from "../lib/qc/reader-prose-guard.mjs";
import { sourceCorpus } from "../lib/qc/quoted-span.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

const PROBES = [
  "The source states revenue of EUR 318 million, so the figure is verified.",
  "The passage is supported by the source for this period.",
  "The source states the headcount, aligning with the sentence.",
  "The statement treats the pilot as a programme.",
  "The sentence is stated without supporting context in the passage.",
];

function cardOf(key) {
  const [fixtureId, index] = key.split(":");
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixtureId && row.index === Number(index));
}

test("the three evidence lines that quote the source are shown", () => {
  for (const key of ["06:3", "15:9", "17:7"]) {
    const card = cardOf(key);
    const raw = card.silences.find((row) => row.field === "evidenceSummary").content[0];
    const released = releaseReaderProse(raw, sourceCorpus(card));
    assert.equal(released.withheld, false, key);
    assert.equal(released.text, raw);
  }
});

test("the five probes are still withheld, and a graded clause beside a quotation is still withheld", () => {
  for (const text of PROBES) {
    const card = {
      sentenceState: "not_in_source",
      displayVerdict: "not_supported",
      displayedEvidenceProse: text,
      statement: "Revenue was EUR 318 million.",
    };
    assert.equal(readerEvidenceSentence(card), "");
  }
  const mixed = 'The file states "supported by structural demand", so the figure is verified.';
  const released = releaseReaderProse(mixed, ["supported by structural demand in the source passage"]);
  assert.equal(released.withheld, true);
  assert.equal(released.phrase, "verified");
});

test("a banned word in a quotation that is not the source is still withheld", () => {
  const text = 'The file states "supported by structural demand".';
  const released = releaseReaderProse(text, ["a passage that does not contain that sentence"]);
  assert.equal(released.withheld, true);
  assert.equal(released.phrase, "supported");
});
