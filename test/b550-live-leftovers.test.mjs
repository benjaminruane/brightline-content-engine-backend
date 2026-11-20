/**
 * B550. The live card, not only the quiet unit fixture.
 * A found table figure keeps the table note as its evidence, and the
 * gross or net line stays on its own line. A same-source disagreement
 * fills conflictExcerpt, which is the second passage the screen shows.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { TABLE_FIGURE_NOTE } from "../lib/qc/table-figure-note.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";

const ROW = "A | 2025 | Jan: N/A | Feb: N/A | Mar: N/A | Apr: 1.03% | May: 2.83% | Jun: 1.95% | Total: 5.95%";
const SOURCE = `${ROW}\nThe report was published in 2025.\n`;
const GROSS = "The statement presents a return figure without specifying whether it is gross or net of fees.";

const SHOPIFY = [
  "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
  "",
  "Deal",
  "This is a deal for BVP to invest $5mm at $25mm pre-money, with a 13.5% option pool.",
].join("\n");
const SHOPIFY_DRAFT = "The team recommended investing in the Series A at a minority stake, with the round priced at a USD 20 million pre-money valuation and BVP expected to own around 20% on a fully diluted basis.";

test("a found table figure keeps the table note when a gross or net concern is also raised", () => {
  const statement = "HPIF Class A shares returned 2.83% in May 2025.";
  const card = applyReadingContract({
    statement,
    primaryExcerpt: "Performance commentary.",
    complianceConcerns: [{
      concernCode: "return_figure_gross_net_qualifier_missing",
      note: GROSS,
    }],
  }, {
    facts: [
      { kind: "figure", surface: "2.83%", status: "matched" },
      { kind: "date", surface: "May 2025", status: "matched" },
      { kind: "name", surface: "HPIF", status: "matched" },
    ],
    note: { bucket: "none", text: "Class A May 2025: 2.83%." },
    sourceText: SOURCE,
  });
  assert.equal(card.statementVerdict.state === "not_in_source", false);
  assert.equal(card.displayedEvidenceProse.startsWith(TABLE_FIGURE_NOTE), true);
  assert.equal(card.displayedEvidenceProse === GROSS, false);
  assert.equal(card.tableFigureNote, TABLE_FIGURE_NOTE);
  assert.match(card.displayedEvidenceProse, /gross or net/);
  assert.equal(card.complianceConcerns[0].note, GROSS);
});

test("the live conflict card carries the second passage on conflictExcerpt", () => {
  const card = applyReadingContract({
    statement: SHOPIFY_DRAFT,
    primaryExcerpt: "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
    conflictExcerpt: null,
    conflictExcerptEmptyReason: "no_distinct_passage",
  }, {
    facts: [
      { kind: "figure", surface: "$20 million", status: "matched" },
      { kind: "figure", surface: "20%", status: "matched" },
    ],
    note: {
      bucket: "conflicts",
      text: "The memo's Deal section states the round is priced at a $25mm pre-money valuation, not $20mm.",
    },
    sourceText: SHOPIFY,
  });
  assert.equal(card.statementVerdict.state, "conflicts");
  assert.equal(card.conflictExcerptEmptyReason, null);
  assert.equal(typeof card.conflictExcerpt, "object");
  assert.match(card.conflictExcerpt.passage, /\$25mm pre-money/);
  assert.match(card.primaryExcerptText, /\$20mm pre-money/);
  assert.match(card.primaryExcerptText, /Also in the source/);
});

test("a new direct investment is written as the firm, without a title", () => {
  const { basePromptText } = buildBasePrompt({
    eventType: "NEW_DIRECT_INVESTMENT",
    outputType: "reporting_commentary",
    visibility: "complete",
  });
  assert.match(basePromptText, /Do not write a title or a heading line unless the special instructions ask for one/);
  assert.match(basePromptText, /When the source supports a wider theme, include how the investment fits it/);
  assert.match(basePromptText, /Do not refer to the memo or the source document/);
  assert.match(basePromptText, /In the commentary, never write the word memo or memorandum/);
  assert.match(basePromptText, /The Methodology Note still names which figure was used when the sources give two/);
  assert.match(basePromptText, /The firm's own investment amount may be stated/);
  assert.match(basePromptText, /priorities, not a checklist/);
  assert.match(basePromptText, /The memo gives two pre-money valuations/);
});
