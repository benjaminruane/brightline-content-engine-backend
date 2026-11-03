import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { absentElementLine, sentenceFault } from "../lib/qc/absent-element-line.mjs";
import { reasonFault } from "../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("B470: an absent element is a sentence about that element", () => {
  const canadian = card("01", 0);
  const fourteen = card("19", 7);
  const name = canadian.readingFacts.find((fact) => fact.surface === "Canadian");
  const figure = fourteen.readingFacts.find((fact) => fact.surface === "14");
  assert.equal(absentElementLine(name, canadian.statement), "The source does not describe the company as Canadian.");
  assert.equal(absentElementLine(figure, fourteen.statement), "The source does not give the 14 percent figure.");
  assert.equal(readerEvidenceSentence(canadian), "The source does not describe the company as Canadian.");
  assert.equal(readerEvidenceSentence(fourteen), "The source does not give the 14 percent figure.");
  assert.equal(sentenceFault("Canadian, not in the source."), "a reason opens with a bare element");
  assert.equal(sentenceFault(readerEvidenceSentence(canadian)), "");
  assert.equal(reasonFault(readerEvidenceSentence(fourteen)), "");
});

test("B470: a comma inside a quotation is not a fragment", () => {
  const quoted = '12_synth_linkedin_post states "After eighteen months of work, the sale closed."';
  assert.equal(sentenceFault(quoted), "");
});
