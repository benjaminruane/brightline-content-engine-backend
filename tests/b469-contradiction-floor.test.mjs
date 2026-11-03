/**
 * B469. A disagreement is not shown as absence or as a light item.
 * lib/qc/contradiction-floor.mjs is the floor.
 * src/modules/drafting/contradictionFloor.js is the other copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { absenceOverQuotedFact, backedAbsence, floorState } from "../lib/qc/contradiction-floor.mjs";
import { reasonFault } from "../lib/qc/partial-reason.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { floorState as screenFloor } from "../../brightline-content-engine-frontend/src/modules/drafting/contradictionFloor.js";
import { statementVerdictState } from "../../brightline-content-engine-frontend/src/modules/drafting/displayVerdictLabels.js";
import { readerEvidenceSentence as screenSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b464/pass-1.json"),
  "utf8",
));

function card(fixture, index) {
  return pass.cards.find((row) => String(row.fixtureId).padStart(2, "0") === fixture && row.index === index);
}

function keyOf(row) {
  return `${String(row.fixtureId).padStart(2, "0")}:${row.index}`;
}

const WEIGHT = {
  "Conflicts with the source": 4,
  "Not in the source": 3,
  "Needs a look": 3,
  "Partly in the source": 2,
  "Goes beyond the source": 2,
  "Nothing raised": 1,
  "Nothing to raise": 1,
};

describe("B469 contradiction floor", () => {
  test("05:0, 19:2 and 18:8 are shown as a disagreement, and not in the lightest tier", () => {
    const one = card("05", 0);
    const two = card("19", 2);
    const three = card("18", 8);
    assert.equal(one.sentenceLabel, "Not in the source");
    assert.equal(two.sentenceLabel, "Not in the source");
    assert.equal(three.sentenceLabel, "Goes beyond the source");
    assert.equal(three.tier, "light");
    for (const row of [one, two, three]) {
      assert.equal(shownLabel(row), "Conflicts with the source");
      assert.equal(shownTier(shownState(row)), "demands");
      assert.equal(statementVerdictState(row), "conflicts");
      assert.equal(floorState(row), screenFloor(row));
    }
    assert.match(readerEvidenceSentence(one), /Westhaven Capital is the acquirer/);
    assert.match(readerEvidenceSentence(one), /Halden Group/);
    assert.match(readerEvidenceSentence(two), /SEK 12\.8 billion/);
    assert.match(readerEvidenceSentence(two), /SEK 18\.4 billion/);
    assert.match(readerEvidenceSentence(three), /2\.6x MOIC and 21% IRR/);
    assert.match(readerEvidenceSentence(three), /2\.8x MOIC and 23% IRR/);
    assert.equal(readerEvidenceSentence(three), screenSentence(three));
  });

  test("19:4 stays quiet and 19:13 stays a light addition", () => {
    const repaired = card("19", 4);
    const quarters = card("19", 13);
    assert.equal(repaired.sentenceLabel, "Nothing raised");
    assert.equal(shownLabel(repaired), "Nothing raised");
    assert.equal(shownTier(shownState(repaired)), "quiet");
    assert.equal(floorState(repaired), "");
    assert.equal(quarters.sentenceLabel, "Goes beyond the source");
    assert.equal(shownLabel(quarters), "Goes beyond the source");
    assert.equal(shownTier(shownState(quarters)), "light");
    assert.equal(floorState(quarters), "");
  });

  test("no absence headline quotes the source stating the draft", () => {
    const quoted = card("19", 7);
    assert.equal(shownLabel(quoted), "Not in the source");
    assert.equal(readerEvidenceSentence(quoted), "14, not in the source.");
    assert.equal(readerEvidenceSentence(card("01", 0)), "Canadian, not in the source.");
    assert.equal(pass.cards.filter((row) => backedAbsence(row)).length, 1);
    assert.equal(pass.cards.filter((row) => absenceOverQuotedFact(row, readerEvidenceSentence(row) || "")).length, 0);
  });

  test("a label does not become lighter, and the screen state matches", () => {
    let heavier = 0;
    let lighter = 0;
    for (const row of pass.cards) {
      const shown = shownLabel(row);
      assert.equal(statementVerdictState(row), shownState(row), keyOf(row));
      assert.equal(floorState(row), screenFloor(row), keyOf(row));
      assert.equal(screenSentence(row) || "", readerEvidenceSentence(row) || "", keyOf(row));
      const before = WEIGHT[row.sentenceLabel] || 0;
      const after = WEIGHT[shown] || 0;
      if (after > before) heavier += 1;
      if (after < before) lighter += 1;
      const reason = readerEvidenceSentence(row) || "";
      if (reason) assert.equal(reasonFault(reason), "", keyOf(row));
    }
    assert.equal(heavier, 3);
    assert.equal(lighter, 0);
  });
});
