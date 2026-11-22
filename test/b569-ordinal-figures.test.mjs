/**
 * B569. 30th is the number 30 for figure presence.
 * That match does not by itself make the card green.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract, buildFacts } from "../lib/qc/reading-contract.mjs";
import { toneForStatementVerdict } from "../lib/qc/statement-verdict.mjs";

const STATEMENT = "marks 30 years";
const PASSAGE = "30th anniversary";

test("30th counts as 30, and the card is not red and not green", () => {
  const facts = buildFacts({ statement: STATEMENT, draft: STATEMENT, sourceText: PASSAGE });
  const figure = facts.find((fact) => fact.kind === "figure" && fact.surface === "30");
  assert.ok(figure);
  assert.equal(figure.status, "matched");
  assert.equal(figure.ordinalOnly, true);

  const card = applyReadingContract({ statement: STATEMENT }, {
    facts,
    note: null,
    sourceText: PASSAGE,
  });
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse : "";
  assert.equal(prose.includes("30 does not appear"), false);
  assert.equal(card.statementVerdict.state, "note_withheld");
  const tone = toneForStatementVerdict(card.statementVerdict);
  assert.notEqual(tone, "red");
  assert.notEqual(tone, "green");
});
