/**
 * B547. Table rows are rebuilt from positions, footnote markers stay off
 * figures, a table run is detected, and a table-only figure is not green.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { detectTableRowIndexes, isFootnoteMarker, rebuildTableRow } from "../lib/pdf-table-rows.mjs";
import { applyTableFigureCaution, confirmedOnlyByTable, TABLE_FIGURE_NOTE } from "../lib/qc/table-figure-note.mjs";
import { assemblePage } from "../lib/extract-pdf-direct.mjs";

function item(str, x, y, extras = {}) {
  return { str, x, y, width: extras.width ?? str.length * 5, fontSize: extras.fontSize ?? 10 };
}

describe("B547 PDF table rows", () => {
  test("a row keeps its label and figures in order", () => {
    const row = [
      item("Revenues", 40, 700, { width: 50 }),
      item("2,563", 160, 700, { width: 30 }),
      item("2,136", 240, 700, { width: 30 }),
      item("20%", 320, 700, { width: 20 }),
    ];
    assert.equal(rebuildTableRow(row), "Revenues | 2,563 | 2,136 | 20%");
  });

  test("a small raised digit next to a figure is left off", () => {
    const row = [
      item("Revenues", 40, 700, { width: 50 }),
      item("2", 92, 706, { width: 6, fontSize: 6 }),
      item("2'563", 160, 700, { width: 30 }),
      item("2'136", 240, 700, { width: 30 }),
    ];
    assert.equal(isFootnoteMarker(row[1], row), true);
    assert.equal(rebuildTableRow(row).includes(" | 2 | "), false);
    assert.equal(rebuildTableRow(row).startsWith("Revenues | 2'563"), true);
  });

  test("two tabular rows are a table, and a prose page is not rewritten", () => {
    const table = [
      [item("Revenues", 40, 700, { width: 50 }), item("2,563", 160, 700, { width: 30 }), item("2,136", 240, 700, { width: 30 })],
      [item("Fees", 40, 680, { width: 40 }), item("1,744", 160, 680, { width: 30 }), item("1,625", 240, 680, { width: 30 })],
    ];
    assert.deepEqual(detectTableRowIndexes(table), [true, true]);
    const split = [
      [item("Revenues", 40, 700, { width: 50 }), item("2,563", 160, 700, { width: 30 }), item("2,136", 240, 700, { width: 30 })],
      [item("3", 90, 690, { width: 4, fontSize: 6 })],
      [item("Fees", 40, 680, { width: 40 }), item("1,744", 160, 680, { width: 30 }), item("1,625", 240, 680, { width: 30 })],
    ];
    const picked = detectTableRowIndexes(split);
    assert.equal(picked[0] && picked[2], true);
    const prose = [item("The fund returned 8 percent after fees.", 40, 700, { width: 200 })];
    const page = assemblePage(prose);
    assert.equal(page.tables.length, 0);
    assert.equal(page.text.includes(" | "), false);
    assert.equal(page.text.includes("The fund returned 8 percent after fees."), true);
  });

  test("a figure confirmed only in a table is amber, and a prose figure is not", () => {
    const source = "The narrative mentions growth.\nRevenues | 2,563 | 2,136 | 20%";
    assert.equal(confirmedOnlyByTable("Revenues were 2,563.", source), true);
    assert.equal(confirmedOnlyByTable("Growth was 20 percent in the narrative.", "Growth was 20 percent in the narrative."), false);
    const card = applyTableFigureCaution(
      { statement: "Revenues were 2,563.", sentenceState: "nothing_raised", statementVerdict: { state: "nothing_raised" } },
      source
    );
    assert.equal(card.sentenceState, "note_withheld");
    assert.equal(card.statementVerdict.tier, "amber");
    assert.equal(card.displayedEvidenceProse, TABLE_FIGURE_NOTE);
    const txt = readFileSync(new URL("../lib/extract-text-from-source.mjs", import.meta.url), "utf8");
    assert.equal(txt.includes("assemblePage"), false);
  });
});
