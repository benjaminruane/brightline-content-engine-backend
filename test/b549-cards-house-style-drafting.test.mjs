/**
 * B549. A month and a year on the same rebuilt row count as found for the
 * figure in that cell. A card shows the reader's note, or names the missing
 * element, instead of a stand-in. Two figures in one source stay red and
 * both passages are shown. An introductory comma and a name the source
 * writes are not Oxford-comma flags. The note names the comma and the fix.
 * The Reviewer's note has no salutation. A new direct investment weighs
 * the company, the thesis, the valuation and the stake, and says which
 * figure it chose.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { assemblePage } from "../lib/extract-pdf-direct.mjs";
import { buildFacts, applyReadingContract, WRITER_FEEDBACK_PROMPT } from "../lib/qc/reading-contract.mjs";
import { shownEvidenceProse } from "../lib/qc/evidence-findings.mjs";
import { scanListCommas } from "../lib/qc/list-comma-scan.mjs";
import { stripSalutation, writerFeedbackInstructions } from "../lib/qc/reading-review.mjs";
import { composeLayers } from "../lib/prompt-library/compose.mjs";
import { TABLE_FIGURE_NOTE } from "../lib/qc/table-figure-note.mjs";

function item(str, x, y, extras = {}) {
  return { str, x, y, width: extras.width ?? Math.max(8, String(str).length * 4.5), fontSize: 9 };
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

const ROW = ["N/A", "N/A", "N/A", "1.03%", "2.83%", "1.95%", "-0.31%", "0.75%", "-0.17%", "-0.98%", "0.92%", "-0.17%", "5.95%"];
const source = assemblePage([
  ...headerAt(560),
  ...figuresAt(2025, 520, ROW),
  item("A", 35, 500, { width: 8 }),
  ...figuresAt(2026, 480, ["-1.06%", "-0.32%", "-1.09%", "-2.45%"]),
]).text;

const SHOPIFY = [
  "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
  "",
  "Deal",
  "This is a deal for BVP to invest $5mm at $25mm pre-money, with a 13.5% option pool.",
].join("\n");

const SHOPIFY_DRAFT = "The team recommended investing in the Series A at a minority stake, with the round priced at a USD 20 million pre-money valuation and BVP expected to own around 20% on a fully diluted basis.";

test("a month heading and the row's year count as that date for the figure in the cell", () => {
  const statement = "HPIF Class A shares returned 2.83% in May 2025.";
  const facts = buildFacts({ statement, draft: statement, sourceText: source });
  const date = facts.find((fact) => fact.kind === "date" && fact.surface === "May 2025");
  const figure = facts.find((fact) => fact.kind === "figure" && String(fact.surface).includes("2.83"));
  assert.equal(date.status, "matched");
  assert.equal(figure.status, "matched");
  const card = applyReadingContract({ statement, primaryExcerpt: "Performance commentary." }, {
    facts,
    note: { bucket: "none", text: "" },
    sourceText: source,
  });
  assert.equal(card.statementVerdict.state, "note_withheld");
  assert.equal(card.displayedEvidenceProse, TABLE_FIGURE_NOTE);
  const withYearInProse = `${source}\nThe report was issued in 2025.`;
  const yearCard = applyReadingContract({ statement, primaryExcerpt: "Performance commentary." }, {
    facts,
    note: { bucket: "none", text: "" },
    sourceText: withYearInProse,
  });
  assert.equal(yearCard.displayedEvidenceProse, TABLE_FIGURE_NOTE);

  const wrong = "HPIF Class A shares returned 1.95% in May 2025.";
  const wrongFacts = buildFacts({ statement: wrong, draft: wrong, sourceText: source });
  const wrongDate = wrongFacts.find((fact) => fact.kind === "date");
  assert.equal(wrongDate.status, "not_found");

  const qualified = applyReadingContract({
    statement,
    complianceConcerns: [{ concernCode: "return_figure_gross_net_qualifier_missing", note: "The draft drops the gross or net qualifier on this return." }],
  }, {
    facts,
    note: { bucket: "none", text: "" },
    sourceText: source,
  });
  assert.equal(qualified.statementVerdict.state, "note_withheld");
  assert.equal(qualified.displayedEvidenceProse.includes(TABLE_FIGURE_NOTE), true);
  assert.equal(qualified.displayedEvidenceProse.includes("gross or net"), true);
});

test("a reader's note replaces a stand-in, and a missing date is named", () => {
  const note = "The source says biologics and drug delivery revenue increased slightly to $4.8 million from $4.7 million, which is the same claim as broadly flat year-over-year.";
  const shown = shownEvidenceProse(
    { statement: "Biologics and drug delivery revenue was broadly flat.", readingFacts: [] },
    "partial",
    note,
  );
  assert.equal(shown, note);
  assert.equal(shown.includes("Which part was not recorded"), false);

  const missing = applyReadingContract({
    statement: "HPIF Class A shares returned 2.83% in May 2025.",
  }, {
    facts: [
      { kind: "figure", surface: "2.83%", status: "matched" },
      { kind: "date", surface: "May 2025", status: "not_found" },
    ],
    note: null,
    sourceText: "The report discusses 2024 only.",
  });
  assert.equal(missing.displayedEvidenceProse, "May 2025 does not appear in the source.");
  assert.equal(missing.displayedEvidenceProse.includes("reason was not recorded"), false);

  const recorded = "The statement is a forward-looking claim without hedging language.";
  const flagged = applyReadingContract({
    statement: "Kestrel will retain a 40 percent stake.",
    complianceConcerns: [{ concernCode: "forward_looking_statement_without_qualifier", note: recorded }],
  }, {
    facts: [{ kind: "name", surface: "Kestrel", status: "matched" }],
    note: { bucket: "conflicts", text: "" },
    sourceText: "Kestrel Partners Fund IV will retain a 40% stake.",
  });
  assert.equal(flagged.displayedEvidenceProse.includes(recorded), true);
  assert.equal(flagged.displayedEvidenceProse.includes("reason was not recorded"), false);
});

test("two figures in one source stay red and both passages are shown", () => {
  const facts = buildFacts({ statement: SHOPIFY_DRAFT, draft: SHOPIFY_DRAFT, sourceText: SHOPIFY });
  const card = applyReadingContract({
    statement: SHOPIFY_DRAFT,
    primaryExcerpt: "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
  }, {
    facts,
    note: {
      bucket: "conflicts",
      text: "The memo's Deal section states the round is priced at a $25mm pre-money valuation, not $20mm.",
    },
    sourceText: SHOPIFY,
  });
  assert.equal(card.statementVerdict.state, "conflicts");
  assert.match(card.displayedEvidenceProse, /\$20mm/);
  assert.match(card.displayedEvidenceProse, /\$25mm/);
  assert.match(card.displayedEvidenceProse, /Check which is final/);
  assert.match(card.primaryExcerptText, /\$20mm pre-money/);
  assert.match(card.primaryExcerptText, /Also in the source/);
  assert.match(card.primaryExcerptText, /\$25mm pre-money/);
});

test("an introductory comma and a name the source writes are not Oxford comma flags", () => {
  assert.equal(scanListCommas({
    statement: "Meanwhile, biologics and drug delivery revenue increased slightly.",
  }).length, 0);
  const named = "ClearPoint Neuro's neurosurgery navigation, therapy and access division grew.";
  const sourceName = "The neurosurgery navigation, therapy and access division is the company's business.";
  assert.equal(scanListCommas({ statement: named, sourceText: sourceName }).length, 0);
  const real = scanListCommas({ statement: "The fund owns ships, trains and planes." });
  assert.equal(real.length, 1);
  assert.equal(
    real[0].note,
    'Oxford comma: add a comma before "and" in this list (ships, trains, and planes).',
  );
  assert.match(real[0].note, /Oxford comma/);
  assert.match(real[0].note, /"and"/);
});

test("the Reviewer's note has no salutation and does not demand blank instructions", () => {
  assert.equal(stripSalutation("Colleague, the opening is thin."), "the opening is thin.");
  assert.equal(WRITER_FEEDBACK_PROMPT.includes("Speak as a senior editor talking to a colleague"), false);
  assert.match(WRITER_FEEDBACK_PROMPT, /No salutation and no form of address/);
  assert.match(WRITER_FEEDBACK_PROMPT, /do not mention a deal team unless the draft does/);
  assert.match(WRITER_FEEDBACK_PROMPT, /When special instructions are blank/);
  const instructions = writerFeedbackInstructions({
    eventType: "SPECIAL_TOPIC",
    outputType: "reporting_commentary",
  });
  assert.match(instructions, /do not demand them/);
  assert.match(instructions, /what it evidently sets out to do/);
});

test("a new direct investment weighs the company, the valuation and the stake", () => {
  const layers = composeLayers({
    eventType: "NEW_DIRECT_INVESTMENT",
    outputType: "reporting_commentary",
    visibility: "COMPLETE",
  });
  const prompt = layers.map((layer) => layer.text).join("\n\n");
  assert.match(prompt, /priorities, not a checklist/);
  assert.match(prompt, /what the company is and does/);
  assert.match(prompt, /the valuation and the stake acquired/);
  assert.match(prompt, /liquidation preferences/);
  assert.match(prompt, /The draft uses \$25mm from the Deal section/);
  assert.equal(prompt.includes("Do not state the equity amount or the valuation multiple"), false);
  const addon = composeLayers({
    eventType: "ADD_ON_DIRECT_INVESTMENT",
    outputType: "reporting_commentary",
    visibility: "COMPLETE",
  }).map((layer) => layer.text).join("\n\n");
  assert.match(addon, /the valuation and the stake acquired/);
  assert.match(addon, /The draft uses \$25mm from the Deal section/);
});
