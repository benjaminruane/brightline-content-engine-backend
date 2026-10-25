import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDraftMarks } from "../lib/qc/draft-marks.mjs";
import { locatedDisputes, settleFacts } from "../lib/qc/reading-contract.mjs";

const statement = "Elsewhere, Fortysouth delivered 16 new towers during the period and is actively progressing additional co-location opportunities, both of which are expected to support continued growth in EBITDA and valuation gains.";
const note = {
  bucket: "beyond",
  text: "The source says the new towers and co-location opportunities are expected to support continued EBITDA growth in line with HICL's valuation assumption. The statement adds \"and valuation gains,\" which the source does not assert.",
};

test("the mark covers the phrase the note quotes, not a matched fact the note only mentions", () => {
  const facts = [
    { kind: "name", surface: "Fortysouth", status: "matched", start: statement.indexOf("Fortysouth"), end: statement.indexOf("Fortysouth") + "Fortysouth".length },
    { kind: "name", surface: "EBITDA", status: "matched", start: statement.indexOf("EBITDA"), end: statement.indexOf("EBITDA") + "EBITDA".length },
  ];
  const first = settleFacts(facts, { ...note, disputedIndices: [1] });
  const second = settleFacts(facts, { ...note, disputedIndices: [0] });
  assert.equal(first[0].status, "matched");
  assert.equal(first[1].status, "matched");
  assert.equal(second[0].status, "matched");
  assert.equal(second[1].status, "matched");
  const spans = locatedDisputes(statement, note);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].surface, "and valuation gains");
  const draft = statement;
  const built = buildDraftMarks({
    draft,
    statements: [{ index: 0, id: "0", text: statement, note, facts }],
    entries: [],
  });
  assert.equal(built.marks.some((mark) => mark.surface === "EBITDA" || mark.surface === "Fortysouth"), false);
  assert.equal(built.marks.some((mark) => mark.surface === "and valuation gains"), true);
  const again = buildDraftMarks({
    draft,
    statements: [{ index: 0, id: "0", text: statement, note, facts }],
    entries: [],
  });
  assert.deepEqual(again.marks.map((mark) => mark.surface), built.marks.map((mark) => mark.surface));
});

test("a beyond note with no locatable quote produces no dispute mark", () => {
  const quiet = { bucket: "beyond", text: "The source does not carry the added judgement." };
  assert.deepEqual(locatedDisputes("The fund returned 4% for the year.", quiet), []);
});
