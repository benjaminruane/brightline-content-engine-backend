/**
 * B383. Items on one band with a sub-0.12em gap and a lowercase
 * fragment are one word. A real gap, a capital label, and an
 * overlapping number stay spaced. Ordinals and footnote markers
 * keep their own rules.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { assemblePdfPageItems, extractPdfDirect } from "../lib/extract-pdf-direct.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLEARPOINT = path.join(
  __dirname,
  "fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026.pdf"
);

function item(str, x, width, fontSize = 16) {
  return { str, x, y: 400, width, fontSize };
}

describe("B383 intra-word join", () => {
  test("a zero gap lowercase fragment is one word", () => {
    const text = assemblePdfPageItems([item("IRRA", 0, 40), item("flow", 40, 32)]);
    assert.equal(text, "IRRAflow");
  });

  test("a quarter-em gap stays two words", () => {
    const text = assemblePdfPageItems([item("IRRA", 0, 40), item("flow", 44, 32)]);
    assert.equal(text, "IRRA flow");
  });

  test("a nearby capital label is not glued", () => {
    const text = assemblePdfPageItems([item("2.5x", 0, 30), item("nTVPI", 31.28, 40)]);
    assert.equal(text, "2.5x nTVPI");
  });

  test("overlapping numbers stay apart", () => {
    const text = assemblePdfPageItems([item("52", 0, 20), item("56", 0, 20)]);
    assert.equal(text, "52 56");
  });

  test("an ordinal still joins ahead of the gap rule", () => {
    const text = assemblePdfPageItems([item("31", 0, 16), item("st", 40, 12)]);
    assert.equal(text, "31st");
  });

  test("a footnote marker still takes a space", () => {
    const text = assemblePdfPageItems([item("billion", 0, 48), item("1", 48, 6, 8)]);
    assert.equal(text, "billion 1");
  });

  test("ClearPoint spells IRRAflow as one word", async () => {
    const text = (await extractPdfDirect(await readFile(CLEARPOINT))).text;
    assert.equal(text.split("IRRAflow").length - 1, 10);
    assert.equal(text.split("IRRA flow").length - 1, 0);
    assert.match(text, /million of IRRAflow\nrevenue, representing 43% overall growth/);
  });
});
