/**
 * B548. A rebuilt table row carries its column headings. The table is emitted
 * once. A figure the check cannot place, which the reader confirms from that
 * table, is amber with the table note. A conflict in the table keeps the
 * reader's reason. The evidence line is not a compliance note. The excerpt is
 * the row that bears on the statement. "This check did not run" stays only
 * when nothing judged the statement.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { assemblePage } from "../lib/extract-pdf-direct.mjs";
import { stripChartGlyphs } from "../lib/pdf-table-rows.mjs";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { TABLE_FIGURE_NOTE } from "../lib/qc/table-figure-note.mjs";
import { evidenceCheckDidNotRunLine } from "../../brightline-content-engine-frontend/src/modules/drafting/notCheckedReason.js";

const EMPTY_MATCH = "This check did not run, because the match came back empty.";
const GROSS_NET = "The statement presents a return figure without a gross-or-net qualifier.";
const CONFLICT = "The report's monthly return table shows Class A returned 2.83% in May 2025, not 1.95%. The 1.95% figure corresponds to June 2025 for Class A.";

function item(str, x, y, extras = {}) {
  return { str, x, y, width: extras.width ?? Math.max(8, String(str).length * 4.5), fontSize: extras.fontSize ?? 9 };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function headerAt(y) {
  const cells = [item("Year", 68, y, { width: 20 })];
  MONTHS.forEach((name, index) => cells.push(item(name, 106 + index * 32, y, { width: 16 })));
  cells.push(item("Total", 494, y, { width: 22 }));
  return cells;
}

function figuresAt(year, y, values) {
  const cells = [item(String(year), 68, y, { width: 20 })];
  values.forEach((value, index) => {
    const last = index === values.length - 1 && values.length < 13;
    cells.push(item(value, last ? 494 : 106 + index * 32, y, { width: 18 }));
  });
  return cells;
}

const CLASS_A_2025 = ["N/A", "N/A", "N/A", "1.03%", "2.83%", "1.95%", "-0.31%", "0.75%", "-0.17%", "-0.98%", "0.92%", "-0.17%", "5.95%"];
const CLASS_A_2026 = ["-1.06%", "-0.32%", "-1.09%", "-2.45%"];

function hpifPage() {
  return assemblePage([
    item("Performance", 40, 640, { width: 70 }),
    item("for", 116, 640, { width: 18 }),
    item("the", 140, 640, { width: 20 }),
    item("period.", 166, 640, { width: 40 }),
    item("\u25A0", 220, 640, { width: 8 }),
    item("Legend\u25A0", 240, 640, { width: 40 }),
    ...headerAt(560),
    ...figuresAt(2025, 520, CLASS_A_2025),
    item("A", 35, 500, { width: 8 }),
    ...figuresAt(2026, 480, CLASS_A_2026),
    ...figuresAt(2025, 440, CLASS_A_2025),
    item("D", 35, 420, { width: 8 }),
    ...figuresAt(2026, 400, ["-0.99%", "-0.27%", "-1.03%", "-2.27%"]),
  ]);
}

const page = hpifPage();
const source = page.text;

function complianceCard(statement, note, facts) {
  return applyReadingContract({
    statement,
    displayVerdict: "not reviewed",
    evidenceNotReviewedReason: "empty_confirmation_refused",
    primaryExcerpt: `${"\u25A0".repeat(8)} Performance commentary at the top of the report. `.repeat(12),
    complianceConcerns: [{
      concernCode: "return_figure_gross_net_qualifier_missing",
      note: GROSS_NET,
      severity: "soft_concern",
    }],
  }, { facts, note, sourceText: source });
}

test("a monthly return row keeps its month, and the class letter attaches to that class", () => {
  const classA = source.split("\n").filter((line) => line.startsWith("A | 2025 |"));
  assert.equal(classA.length, 1);
  assert.match(classA[0], /May: 2\.83%/);
  assert.match(classA[0], /Jun: 1\.95%/);
  assert.match(classA[0], /Jan: N\/A/);
  assert.match(source, /A \| 2026 \| Jan: -1\.06%/);
  assert.match(source, /Total: -2\.45%/);
  assert.equal(source.includes("Dec: -2.45%"), false);
  assert.equal(source.split("\n").some((line) => line.trim() === "A"), false);
  assert.equal(source.split("\n").some((line) => /^Year \| Jan \|/.test(line)), false);
});

test("the same table is not also emitted as a flattened line", () => {
  const hits = source.split("\n").filter((line) => line.includes("2.83%"));
  assert.equal(hits.length, 2);
  assert.equal(hits.every((line) => line.includes(" | ") && line.includes("May: 2.83%")), true);
  assert.equal(/\b2025\s+N\/A\s+N\/A/.test(source), false);
  assert.match(source, /Performance for the period\./);
  assert.equal(source.includes("\u25A0"), false);
  assert.equal(stripChartGlyphs("Legend\u25A0"), "Legend");
});

test("a reader who confirms a table figure gets the amber table note", () => {
  const card = complianceCard(
    "HPIF Class A shares returned 2.83% in May 2025.",
    { bucket: "none", text: "Class A May 2025 return: 2.83%", documentValues: [{ document: "HPIF", value: "Class A May 2025 return: 2.83%" }] },
    [{ kind: "figure", surface: "2.83%", status: "not_found" }],
  );
  assert.equal(card.sentenceState, "note_withheld");
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.equal(card.displayedEvidenceProse, TABLE_FIGURE_NOTE);
  assert.equal(card.complianceConcerns[0].note, GROSS_NET);
  assert.equal(card.displayedEvidenceProse.includes("gross"), false);
  assert.match(card.primaryExcerpt, /A \| 2025 \|/);
  assert.match(card.primaryExcerpt, /May: 2\.83%/);
  assert.equal(card.primaryExcerpt.length <= 400, true);
  assert.equal(card.primaryExcerpt.includes("\u25A0"), false);
  assert.equal(String(readerEvidenceSentence(card) || "").includes("did not run"), false);
  assert.equal(evidenceCheckDidNotRunLine(card, false), "");
});

test("a reader conflict in the table keeps the reader's reason", () => {
  const card = complianceCard(
    "HPIF Class A shares returned 1.95% in May 2025.",
    { bucket: "conflicts", text: CONFLICT },
    [{ kind: "figure", surface: "1.95%", status: "not_found" }],
  );
  assert.equal(card.sentenceState, "conflicts");
  assert.equal(card.sentenceLabel, "Conflicts with the source");
  assert.equal(card.displayedEvidenceProse, CONFLICT);
  assert.equal(card.displayedEvidenceProse.includes("gross"), false);
  assert.equal(card.complianceConcerns[0].note, GROSS_NET);
  assert.match(card.primaryExcerpt, /Jun: 1\.95%/);
  assert.equal(String(readerEvidenceSentence(card) || "").includes("did not run"), false);
});

test("a matched table figure with an unplaced month is the amber table note", () => {
  const card = complianceCard(
    "HPIF Class A shares returned 2.83% in May 2025.",
    { bucket: "none", text: "", documentValues: [{ document: "HPIF", value: "Class A May 2025: 2.83%" }] },
    [
      { kind: "figure", surface: "2.83%", status: "matched" },
      { kind: "date", surface: "May 2025", status: "not_found" },
    ],
  );
  assert.equal(card.sentenceState, "note_withheld");
  assert.equal(card.displayedEvidenceProse, TABLE_FIGURE_NOTE);
  assert.equal(card.displayedEvidenceProse.includes("gross"), false);
});

test("a figure that is absent from the source stays not in the source", () => {
  const card = complianceCard(
    "HPIF Class A shares returned 9.99% in May 2025.",
    { bucket: "none", text: "No such figure." },
    [{ kind: "figure", surface: "9.99%", status: "not_found" }],
  );
  assert.equal(card.sentenceState, "not_in_source");
  assert.equal(card.complianceConcerns[0].note, GROSS_NET);
  assert.notEqual(card.displayedEvidenceProse, GROSS_NET);
  assert.match(card.displayedEvidenceProse, /No such figure/);
});

test("the empty-match line stays when nothing judged the statement", () => {
  const missed = {
    statement: "Revenue grew.",
    displayVerdict: "not reviewed",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    evidenceNotReviewedReason: "empty_confirmation_refused",
  };
  assert.equal(evidenceCheckDidNotRunLine(missed, false), EMPTY_MATCH);
  assert.equal(readerEvidenceSentence(missed), EMPTY_MATCH);
  const judged = {
    ...missed,
    readingNote: { bucket: "none", text: "Class A May 2025 return: 2.83%", refused: false },
    displayedEvidenceProse: TABLE_FIGURE_NOTE,
  };
  assert.equal(evidenceCheckDidNotRunLine(judged, true), "");
  assert.equal(String(readerEvidenceSentence(judged) || "").includes("did not run"), false);
});
