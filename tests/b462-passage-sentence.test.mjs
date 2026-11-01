/**
 * B462. A reason written from a stored passage quotes one sentence,
 * on one line, with one full stop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { bearingSentence, collapseWhitespace, evidenceLine } from "../lib/qc/evidence-line.mjs";
import { readerEvidenceAccount } from "../lib/qc/reader-reason.mjs";

const pass = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b456/pass-1.json");
const cards = JSON.parse(readFileSync(pass, "utf8")).cards;

function keyOf(card) {
  return `${String(card.fixtureId).padStart(2, "0")}:${card.index}`;
}

function byKey(key) {
  const card = cards.find((row) => keyOf(row) === key);
  if (!card) throw new Error(`missing ${key}`);
  return card;
}

function quoted(text) {
  const match = String(text || "").match(/"([^"]*)"/);
  return match ? match[1] : "";
}

describe("B462 passage sentence", () => {
  test("17:2, 17:4, and 17:6 quote a sentence that contains the figure", () => {
    const card2 = byKey("17:2");
    const card4 = byKey("17:4");
    const card6 = byKey("17:6");
    const line2 = readerEvidenceAccount(card2).text;
    const line4 = readerEvidenceAccount(card4).text;
    const line6 = readerEvidenceAccount(card6).text;
    assert.match(line2, /89,000 sqm/);
    assert.match(line4, /96% occupied/);
    assert.match(line4, /6\.8 years/);
    assert.match(line6, /18%/);
    for (const card of [card2, card4, card6]) {
      const passage = card.sourceQuote || card.primaryExcerpt || "";
      const body = quoted(readerEvidenceAccount(card).text);
      assert.equal(collapseWhitespace(passage).includes(body), true);
      assert.equal(bearingSentence(passage, card.statement), body);
    }
  });

  test("no reason on the pass has a line break or a doubled full stop", () => {
    for (const card of cards) {
      const text = readerEvidenceAccount(card)?.text || "";
      assert.equal(/[\n\r]/.test(text), false, keyOf(card));
      assert.equal(/\."\./.test(text), false, keyOf(card));
    }
  });

  test("a quote that already ends keeps that one stop", () => {
    const line = evidenceLine({
      fileName: "note.pdf",
      quote: "Urban last-mile logistics is supported.",
      statement: "Urban last-mile logistics is supported.",
    });
    assert.equal(line, 'note states "Urban last-mile logistics is supported."');
  });
});
