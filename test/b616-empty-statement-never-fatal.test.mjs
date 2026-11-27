/**
 * B616. A statement with no letters or digits is dropped as a non-claim.
 * attachReadingView never throws for one empty card.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  hasLettersOrDigits,
  partitionClaimStatements,
} from "../lib/qc/pipeline-v4/stage1-extract-statements.mjs";
import { attachReadingView } from "../lib/qc/reading-review.mjs";

const PARA_1 =
  "In November 2026, we agreed to invest in Shopify, a SaaS platform that enables small and mid-sized businesses to set up and run online stores in a few hours.";
const PARA_2 =
  "Shopify combines simple, self-serve onboarding with a recurring subscription model and transaction fees, serving over 1,000,000 merchants and adding roughly 10,000 paying customers a week. The platform's open API and App Store, with strong adoption by both merchants and developers, extend functionality without adding product complexity.";
const PARA_3 =
  "Our investment thesis centers on: (i) strong organic growth, with monthly recurring revenue up 151% in the twelve months to October 2010, (ii) attractive customer acquisition economics, with payback in 7-9 months, and (iii) exposure to two long-term themes: the consumerization of enterprise software and the continued growth of e-commerce among SMBs.";

const HASHTAG_ONLY = "###";
const EMOJI_ONLY = "🚀";
const SOURCE = `${PARA_1}\n\n${PARA_2}\n\n${PARA_3}`;

function noneNote() {
  return JSON.stringify({ bucket: "none", note: "", disputedIndices: [] });
}

test("statements with no letters or digits are dropped as non-claims", () => {
  assert.equal(hasLettersOrDigits(HASHTAG_ONLY), false);
  assert.equal(hasLettersOrDigits(EMOJI_ONLY), false);
  assert.equal(hasLettersOrDigits("   "), false);
  assert.equal(hasLettersOrDigits("#Shopify"), true);
  const split = partitionClaimStatements([
    { text: PARA_1, charStart: 0, charEnd: PARA_1.length, isClaim: true },
    { text: HASHTAG_ONLY, charStart: 10, charEnd: 13, isClaim: true },
    { text: EMOJI_ONLY, charStart: 20, charEnd: 21, isClaim: true },
    { text: PARA_2, charStart: 30, charEnd: 30 + PARA_2.length, isClaim: true },
  ]);
  assert.deepEqual(split.statements.map((row) => row.text), [PARA_1, PARA_2]);
  const byText = Object.fromEntries(split.droppedNonClaims.map((row) => [row.text, row]));
  assert.equal(byText[HASHTAG_ONLY].reason, "not_a_claim");
  assert.equal(byText[HASHTAG_ONLY].reasonText, "Not checked as a claim (no letters or digits).");
  assert.equal(byText[EMOJI_ONLY].reason, "not_a_claim");
});

test("the Shopify draft shape keeps its prose claims", () => {
  const split = partitionClaimStatements([
    { text: PARA_1, isClaim: true },
    { text: PARA_2, isClaim: true },
    { text: PARA_3, isClaim: true },
    { text: HASHTAG_ONLY, isClaim: true },
    { text: EMOJI_ONLY, isClaim: true },
  ]);
  assert.deepEqual(split.statements.map((row) => row.text), [PARA_1, PARA_2, PARA_3]);
  assert.equal(split.droppedNonClaims.length, 2);
});

test("attachReadingView passes an empty card through and finishes", async () => {
  const previous = process.env.QC_READING_VIEW;
  delete process.env.QC_READING_VIEW;
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => {
    errors.push(args.map(String).join(" "));
  };
  try {
    let calls = 0;
    const attached = await attachReadingView({
      cards: [
        { statement: PARA_1, displayVerdict: "confirmed", sentenceState: "nothing_raised" },
        { statement: "   ", displayVerdict: "confirmed", sentenceState: "nothing_raised" },
        { statement: PARA_2, displayVerdict: "confirmed", sentenceState: "nothing_raised" },
      ],
      sources: [{ text: SOURCE, label: "Shopify (text).txt" }],
      draftText: `${PARA_1}\n\n${PARA_2}\n\n${PARA_3}`,
      complete: async () => {
        calls += 1;
        return calls <= 2 ? noneNote() : JSON.stringify({ note: "The draft stays close to the source." });
      },
    });
    assert.equal(attached.cards.length, 3);
    assert.equal(attached.cards[1].statement, "   ");
    assert.equal(attached.cards[1].readingFacts, undefined);
    assert.equal(attached.reading.sentences[1].text, "");
    assert.equal(attached.reading.sentences[0].text, PARA_1);
    assert.ok(errors.some((line) => line.includes("a card is missing its statement")));
  } finally {
    console.error = originalError;
    if (previous == null) delete process.env.QC_READING_VIEW;
    else process.env.QC_READING_VIEW = previous;
  }
});
