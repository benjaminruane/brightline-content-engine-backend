/**
 * B486. When the matcher and the note both say the statement is supported,
 * a span vote does not raise the card.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { bothReadingsSupport, shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const pass = JSON.parse(readFileSync(path.join(root, "../scripts/diagnostic/b485/pass-1.json"), "utf8"));
const row = pass.cards.find((card) => String(card.fixtureId).padStart(2, "0") === "11" && card.index === 7);

test("fixture 11 card 7 stays quiet", () => {
  assert.equal(bothReadingsSupport(row), true);
  assert.equal(shownState(row), "nothing_raised");
  assert.equal(shownLabel(row), "Nothing raised");
  assert.equal(shownTier(shownState(row)), "quiet");
});
