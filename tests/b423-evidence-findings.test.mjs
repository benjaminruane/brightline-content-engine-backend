import assert from "node:assert/strict";
import { test } from "vitest";
import { cardEvidenceFindings, displayedEvidenceProse } from "../lib/qc/evidence-findings.mjs";

const causal = {
  id: "S1:editorial:overreach_unsupported_causal:0",
  rule: "overreach_unsupported_causal",
  thing1: { quote: "EBITDA growth driven by capital expenditure" },
  thing2: "The draft implies a cause the source does not establish.",
};

const partial = {
  id: "S6:evidence:partial:0",
  rule: "partial",
  kind: "evidence",
  thing1: { quote: "which will lead to a reduction in debt servicing costs" },
  thing2: "The source supports part of this statement.",
};

test("a finding the headline already states is left off, and the others are returned", () => {
  const stated = cardEvidenceFindings(
    { statementVerdict: { state: "beyond", setBy: { source: "action", rule: "overreach_unsupported_causal" } } },
    [causal, partial],
  );
  assert.equal(stated.some((row) => row.rule === "overreach_unsupported_causal"), false);
  assert.equal(stated.length, 1);
  assert.equal(stated[0].ref, partial.id);
  assert.equal(stated[0].quote, partial.thing1.quote);
  assert.equal(stated[0].note, partial.thing2);

  const extra = cardEvidenceFindings(
    { statementVerdict: { state: "not_in_source", setBy: { source: "fact", status: "not_found" } } },
    [causal],
  );
  assert.equal(extra.length, 1);
  assert.equal(extra[0].rule, "overreach_unsupported_causal");
});

test("beyond, conflicts, and not_in_source prose is the note, unless the note asserts support", () => {
  const note = "The statement adds a gain the source does not assert.";
  const budgets = "The source says EBITDA is delivered in line with expectations, not in line with budgets.";
  assert.equal(displayedEvidenceProse("beyond", note), note);
  assert.equal(displayedEvidenceProse("conflicts", "The source confirms the figure as stated."), "");
  assert.equal(displayedEvidenceProse("conflicts", "The draft aligns with a different company."), "");
  assert.equal(displayedEvidenceProse("nothing_raised", "The source confirms this."), null);
  assert.equal(displayedEvidenceProse("not_in_source", "The source confirms this."), "");
  assert.equal(displayedEvidenceProse("not_in_source", ""), "");
  assert.equal(displayedEvidenceProse("not_in_source", budgets), budgets);
});
