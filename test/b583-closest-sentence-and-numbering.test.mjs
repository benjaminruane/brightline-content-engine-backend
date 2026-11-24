/**
 * B583. An amber card shows the source sentence it names, and blank lines
 * are not numbered. No model call.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { passageForCard } from "../lib/qc/passage-trim.mjs";
import { factPassage } from "../lib/qc/fact-passages.mjs";
import { sourceLineIndex } from "../lib/qc/source-lines.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const pat = JSON.parse(fs.readFileSync(path.join(root, "fixtures/b582/patria-clean-after-b581.json"), "utf8"));
const gem = JSON.parse(fs.readFileSync(path.join(root, "fixtures/b581/gemspring-dirty-after-b580.json"), "utf8"));

test("patria S1 shows the Iran sentence under Also relevant", () => {
  const source = pat.sources[0].text;
  const shown = passageForCard(pat.statements[0].qcCard, source);
  assert.equal(shown.alsoHeading, "Also relevant");
  assert.match(shown.also, /military operations against Iran/);
  const line = sourceLineIndex(source).find((row) => row.text.includes("military operations against Iran"));
  assert.equal(line.id.length > 0, true);
  assert.deepEqual(shown.alsoLineIds, [line.id]);
  assert.equal(shown.passage.toLowerCase().includes("military operations against iran"), false);
});

test("gemspring numbers only the five paragraphs, and the card refs match", () => {
  const source = gem.sources[0].text;
  const rows = sourceLineIndex(source);
  assert.deepEqual(rows.map((row) => row.id).filter(Boolean), ["L1", "L2", "L3", "L4", "L5"]);
  assert.equal(rows.filter((row) => row.empty).every((row) => row.id === ""), true);
  assert.equal(rows.find((row) => row.text.includes("$3.5 billion")).id, "L1");
  assert.equal(rows.find((row) => row.text.includes("$3 billion target")).id, "L2");
  assert.equal(rows.find((row) => row.text.includes("speed of the raise")).id, "L5");
  const s2 = factPassage(gem.statements[1].qcCard, source);
  assert.deepEqual(s2.pieces.map((piece) => piece.lineIds[0]), ["L1", "L2"]);
  const speed = factPassage(gem.statements[4].qcCard, source);
  assert.equal(speed.pieces[0].lineIds[0], "L3");
  const shown = passageForCard(gem.statements[1].qcCard, source);
  assert.deepEqual(shown.lineIds, ["L1", "L2"]);
});
