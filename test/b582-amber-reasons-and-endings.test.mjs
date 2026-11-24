import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { cardReason, GREEN_CLOSINGS, greenEndingIndex } from "../lib/qc/card-reason.mjs";

const dir = path.join(process.cwd(), "test/fixtures/b582");
const gem = JSON.parse(fs.readFileSync(path.join(dir, "gemspring-dirty-after-b581.json"), "utf8"));
const pat = JSON.parse(fs.readFileSync(path.join(dir, "patria-clean-after-b581.json"), "utf8"));
const source = pat.sources[0].text;

const AGREEMENT = /supports the statement|in line with the statement|as the statement says|consistent with the statement|matching the statement/i;

function reason(doc, index, text = "") {
  const cards = doc.statements;
  return cardReason(cards[index].qcCard, {
    sourceText: text,
    endingIndex: greenEndingIndex(cards, index),
  });
}

test("amber cards name the point in question and do not end in agreement", () => {
  const gem1 = reason(gem, 0);
  assert.match(gem1, /does not explicitly state that the market has become more selective/);
  assert.doesNotMatch(gem1, /speed of the raise/);
  assert.doesNotMatch(gem1, AGREEMENT);

  const gem4 = reason(gem, 3);
  assert.match(gem4, /single close at hard cap/);
  assert.match(gem4, /does not mention 'realized distributions'/);
  assert.doesNotMatch(gem4, AGREEMENT);

  const pat1 = reason(pat, 0, source);
  assert.match(pat1, /NAV total return of 3\.1%/);
  assert.match(pat1, /does not use the words 'Middle East'/);
  assert.match(pat1, /military operations against Iran/);
  assert.doesNotMatch(pat1, AGREEMENT);

  const pat4 = reason(pat, 3, source);
  assert.match(pat4, /does not explicitly state that these figures reflect 'continued but slower M&A activity'/);
  assert.doesNotMatch(pat4, /£125\.6 million/);
  assert.doesNotMatch(pat4, AGREEMENT);
});

test("green cards keep an agreement ending, and consecutive ones do not repeat it", () => {
  const closings = [];
  pat.statements.forEach((row, index) => {
    const ending = greenEndingIndex(pat.statements, index);
    if (ending == null) return;
    const text = reason(pat, index, source);
    const closing = GREEN_CLOSINGS[ending];
    assert.match(text, new RegExp(`${closing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.$`));
    closings.push(closing);
  });
  assert.deepEqual(closings, GREEN_CLOSINGS.slice(0, closings.length));
  assert.equal(new Set(closings).size, closings.length);
});
