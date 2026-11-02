/**
 * B465. A partial reason is the compliant account plus the difference clause.
 * A cut that is not clean is not forced.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { PARTIAL_UNRECORDED, partialSentence } from "../lib/qc/partial-sentence.mjs";
import { partialReason, partialReasonDetail } from "../lib/qc/partial-reason.mjs";
import { endorsementHit } from "../lib/qc/endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "../lib/qc/quoted-span.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function cardOf(key) {
  const [fixtureId, index] = key.split(":");
  const card = pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixtureId && row.index === Number(index));
  if (!card) throw new Error(`missing ${key}`);
  return card;
}

function quotesIn(text) {
  return [...String(text).matchAll(/"([^"]+)"|'([^']+)'/g)].map((match) => match[1] ?? match[2]);
}

test("08:10 joins the compliant account to the difference the explanation already wrote", () => {
  const card = cardOf("08:10");
  const detail = partialReasonDetail(card);
  const reason = partialReason(card);
  assert.equal(reason, detail.reason);
  assert.match(reason, /^The source states base case revenue growth of 9% CAGR/);
  assert.match(reason, /years\. Does not specifically attribute this growth to structural exposure to medical implants and aerospace build rate increases\.$/);
  assert.equal(reason.includes(". but"), false);
  assert.equal(endorsementHit(maskVerbatimQuotes(reason, sourceCorpus(card))), null);
  const explanation = card.matchExplanations.map((row) => row.explanation).join(" ");
  for (const quote of quotesIn(reason)) {
    const host = `${card.evidenceLine} ${explanation} ${card.primaryExcerpt || ""} ${card.sourceQuote || ""}`;
    assert.equal(host.replace(/\s+/g, " ").includes(quote.replace(/\s+/g, " ")), true, quote);
  }
});

test("a card with no compliant account keeps the explanation it had", () => {
  const said = partialSentence({
    statement: "Revenue grew.",
    matchExplanations: [{
      classification: "partially_confirmed",
      explanation: "The source supports the position but does not mention 'unit economics'.",
    }],
  });
  assert.match(said, /does not mention 'unit economics'/);
  assert.equal(partialSentence({ displayVerdict: "supported_partial" }), PARTIAL_UNRECORDED);
});

test("a difference that still grades the statement is not forced", () => {
  const card = cardOf("14:3");
  const detail = partialReasonDetail(card);
  assert.equal(detail.reason, "");
  assert.match(detail.why, /supported/);
  assert.equal(partialSentence(card).includes("The source confirms"), true);
});
