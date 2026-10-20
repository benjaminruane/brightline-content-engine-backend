/**
 * B405. Page furniture is stripped from the head of a source only.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { stripLeadingPageFurniture } from "../lib/extract-boilerplate.mjs";

const BODY =
  "The company reported record revenue for the quarter and confirmed the outlook remains intact.";
const REST =
  "A further paragraph confirms the dividend, the outlook, and the board recommendation to shareholders in full.";

describe("B405 page furniture", () => {
  test("a head of navigation is removed and the press release is unchanged", () => {
    const text = ["Log In", "Sign Up", "Products Pricing", "Customer Stories", BODY, REST].join("\n");
    const out = stripLeadingPageFurniture(text);
    assert.equal(out, `${BODY}\n${REST}`);
  });

  test("furniture after the first real sentence is left in place", () => {
    const text = [BODY, "Log In", "Sign Up", "Products Pricing"].join("\n");
    assert.equal(stripLeadingPageFurniture(text), text);
  });

  test("a head line with a percentage or a dollar figure is kept", () => {
    const text = ["Products Pricing $12", "Revenue rose 12%", BODY].join("\n");
    const out = stripLeadingPageFurniture(text);
    assert.ok(out.startsWith("Products Pricing $12\nRevenue rose 12%\n"));
    assert.ok(out.endsWith(BODY));
    assert.equal(out.slice(out.indexOf(BODY)), BODY);
  });

  test("a document that is half navigation is returned unchanged", () => {
    const nav = Array.from({ length: 30 }, () => "Log In").join("\n");
    const text = `${nav}\n${BODY}`;
    const removed = nav.length + 1;
    assert.ok(removed / text.length > 0.3);
    assert.equal(stripLeadingPageFurniture(text), text);
  });

  test("1 MONTH AGO on its own line in the head is removed", () => {
    const text = ["1 MONTH AGO", BODY].join("\n");
    assert.equal(stripLeadingPageFurniture(text), BODY);
  });
});
