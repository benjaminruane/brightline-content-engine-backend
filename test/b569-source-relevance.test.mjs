/**
 * B569. Generate can see when a source does not mention the subject.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  methodologyWithSourceUse,
  sourcesMissingSubject,
  textMentionsSubject,
} from "../lib/source-relevance.mjs";

test("a legal suffix still counts as the name, and an empty name skips the check", () => {
  const gp = { id: "gp", name: "GP Industries release.pdf", text: "GP Industries reported a higher margin." };
  const clear = { id: "cp", name: "ClearPoint release.pdf", text: "ClearPoint Neuro reported first quarter results." };
  assert.equal(textMentionsSubject(gp.text, "GP Industries Ltd"), true);
  assert.equal(textMentionsSubject(clear.text, "gp industries plc"), false);
  assert.deepEqual(sourcesMissingSubject([gp, clear], "GP Industries Ltd").map((source) => source.id), ["cp"]);
  assert.deepEqual(sourcesMissingSubject([gp, clear], "  "), []);
  assert.deepEqual(sourcesMissingSubject([{ id: "bare", name: "file.pdf", text: "" }], "GP Industries"), []);
});

test("the methodology note names sources used and sources left out", () => {
  const note = methodologyWithSourceUse("The draft uses the latest margin.", [
    { name: "GP Industries release.pdf" },
  ], [
    { name: "ClearPoint release.pdf" },
  ]);
  assert.match(note, /The draft uses the latest margin\./);
  assert.match(note, /Sources used: GP Industries release\.pdf\. Left out: ClearPoint release\.pdf\./);
});
