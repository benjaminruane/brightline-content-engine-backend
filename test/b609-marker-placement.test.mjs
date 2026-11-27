/**
 * B609. PDF draft S-markers sit right after their own sentence, before trailing space.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { draftFlow, draftFlowPlain } from "../lib/export/export-blocks.mjs";

test("draftFlow places S1 before the trailing space after the sentence", () => {
  const events = draftFlow([
    { text: "A one. ", marker: "S1" },
    { text: "B two.", marker: "S2" },
  ]);
  assert.deepEqual(events, [
    { kind: "text", text: "A one." },
    { kind: "marker", text: "S1" },
    { kind: "text", text: " " },
    { kind: "text", text: "B two." },
    { kind: "marker", text: "S2" },
  ]);
  assert.equal(draftFlowPlain(events), "A one. B two.");
});

test("last sentence of a paragraph keeps its marker before paragraph breaks", () => {
  const events = draftFlow([
    { text: "Fund IV.", marker: "S1" },
    { text: " This letter ends the paragraph.\n\n", marker: "S2" },
  ]);
  const s2 = events.findIndex((event) => event.kind === "marker" && event.text === "S2");
  assert.ok(s2 > 0);
  assert.equal(events[s2 - 1].kind, "text");
  assert.match(events[s2 - 1].text, /paragraph\.$/);
  assert.equal(events[s2 + 1].kind, "break");
  assert.equal(events[s2 + 2].kind, "break");
});
