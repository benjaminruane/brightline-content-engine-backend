/**
 * B405 asserted that a navigation head was deleted. B407 keeps the text
 * and records the line indexes instead. The 30% valve applied only to
 * deletion, so a document that is half navigation is now flagged.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { markPageFurniture, stripLeadingPageFurniture } from "../lib/extract-boilerplate.mjs";

const BODY =
  "The company reported record revenue for the quarter and confirmed the outlook remains intact.";
const REST =
  "A further paragraph confirms the dividend, the outlook, and the board recommendation to shareholders in full.";

describe("B405 page furniture", () => {
  test("a head of navigation is flagged and the text is unchanged", () => {
    const text = ["Log In", "Sign Up", "Products Pricing", "Customer Stories", BODY, REST].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.equal(stripLeadingPageFurniture(text), text);
    assert.deepEqual(marked.furnitureLineIndexes, [0, 1, 2, 3]);
  });

  test("furniture after the first real sentence is not flagged", () => {
    const text = [BODY, "Log In", "Sign Up", "Products Pricing"].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.deepEqual(marked.furnitureLineIndexes, []);
  });

  test("a head line with a percentage or a dollar figure is not flagged", () => {
    const text = ["Products Pricing $12", "Revenue rose 12%", BODY].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.deepEqual(marked.furnitureLineIndexes, []);
  });

  test("a document that is half navigation is flagged, not hidden", () => {
    const nav = Array.from({ length: 30 }, () => "Log In").join("\n");
    const text = `${nav}\n${BODY}`;
    const removed = nav.length + 1;
    assert.ok(removed / text.length > 0.3);
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.equal(marked.furnitureLineIndexes.length, 30);
  });

  test("1 MONTH AGO on its own line in the head is flagged", () => {
    const text = ["1 MONTH AGO", BODY].join("\n");
    const marked = markPageFurniture(text);
    assert.equal(marked.text, text);
    assert.deepEqual(marked.furnitureLineIndexes, [0]);
  });
});
