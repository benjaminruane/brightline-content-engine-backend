/**
 * B407. Furniture is flagged. The stored text is the original text.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  clipKeepingFurniture,
  htmlToReadableText,
  isPageFurnitureSentence,
  markPageFurniture,
} from "../lib/extract-boilerplate.mjs";
import { missingBenchmarkCard, suppressReassurance } from "../lib/qc/reading-contract.mjs";
import { buildFacts } from "../lib/qc/reading-contract.mjs";

const BODY =
  "The company reported record revenue for the quarter and confirmed the outlook remains intact.";

describe("B407 furniture flag", () => {
  test("the marker returns the original text and the head indexes", () => {
    const text = ["Log In", "Sign Up", BODY, "Newsroom"].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.deepEqual(marked.furnitureLineIndexes, [0, 1]);
  });

  test("a currency line and a year line in the head are not flagged", () => {
    const text = ["Revenue $12 million", "Results for 2025", BODY].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.deepEqual(marked.furnitureLineIndexes, []);
  });

  test("isPageFurnitureSentence still skips a navigation sentence", () => {
    assert.equal(isPageFurnitureSentence("Log In Sign Up Newsroom"), true);
    assert.equal(isPageFurnitureSentence(BODY), false);
  });

  test("the clip keeps furniture inside the span and counts only body characters", () => {
    const tail = "y".repeat(40);
    const text = ["Log In", BODY, tail].join("\n");
    const clipped = clipKeepingFurniture(text, BODY.length);
    assert.ok(clipped.startsWith("Log In\n"));
    assert.ok(clipped.includes(BODY));
    assert.equal(clipped.includes(tail), false);
    assert.equal(clipped, `Log In\n${BODY}`);
  });

  test("html keeps newlines so the marker can see a furniture line", () => {
    const html = `<nav>Log In</nav><div>Sign Up</div><p>${BODY}</p>`;
    const text = htmlToReadableText(html);
    assert.ok(text.includes("\n"));
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.ok(marked.furnitureLineIndexes.includes(0));
  });

  test("a reassuring sentence is dropped when a fact is not_found", () => {
    const note = { bucket: "wording", text: "The HCIL typo does not change the claim." };
    const dropped = suppressReassurance(note, [{ status: "not_found" }]);
    assert.equal(dropped.text, "");
    assert.equal(dropped.bucket, "wording");
    const mixed = suppressReassurance(
      { bucket: "wording", text: "The source spells the name HICL. The typo does not change the claim." },
      [{ status: "not_found" }]
    );
    assert.equal(mixed.text, "The source spells the name HICL.");
    const matched = suppressReassurance(note, [{ status: "matched" }]);
    assert.equal(matched.text, note.text);
  });

  test("benchmark words keep their counts and only the earliest line has an extract", () => {
    const source = [
      "A target was set out in the opening paragraph of the update.",
      "EBITDA finished in line with expectations for the period.",
      "Management forecast a further rise in the second half.",
    ].join("\n");
    const facts = buildFacts({
      statement: "EBITDA in line with budgets.",
      draft: "EBITDA in line with budgets.",
      sourceText: source,
    });
    const budgets = facts.find((row) => row.kind === "benchmark");
    const card = missingBenchmarkCard(budgets);
    assert.deepEqual(card.source.map((row) => row.word), ["target", "expectations", "forecast"]);
    assert.ok(card.source.every((row) => row.occurrenceCount >= 1));
    const withExtract = card.source.filter((row) => row.extract);
    assert.equal(withExtract.length, 1);
    assert.equal(withExtract[0].word, "target");
    assert.equal(withExtract[0].lineId, "L1");
    assert.equal(card.source.find((row) => row.word === "expectations").lineId, null);
    assert.equal(card.source.find((row) => row.word === "forecast").extract, "");
  });
});
