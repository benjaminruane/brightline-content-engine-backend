import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_HEADLINE_REASON, cardEvidenceFindings, displayedEvidenceProse } from "../lib/qc/evidence-findings.mjs";

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

test("a causal finding stays with the card, and a partial finding is returned beside it", () => {
  const stated = cardEvidenceFindings(
    { statementVerdict: { state: "beyond", setBy: { source: "action", rule: "overreach_unsupported_causal" } } },
    [causal, partial],
  );
  assert.equal(stated.some((row) => row.rule === "overreach_unsupported_causal"), true);
  assert.equal(stated.some((row) => row.rule === "partial"), true);

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
  assert.equal(displayedEvidenceProse("conflicts", "The source confirms the figure as stated."), EMPTY_HEADLINE_REASON);
  assert.equal(displayedEvidenceProse("conflicts", "The draft aligns with a different company."), EMPTY_HEADLINE_REASON);
  assert.equal(displayedEvidenceProse("nothing_raised", "The source confirms this."), null);
  assert.equal(displayedEvidenceProse("not_in_source", "The source confirms this."), EMPTY_HEADLINE_REASON);
  assert.equal(displayedEvidenceProse("not_in_source", ""), EMPTY_HEADLINE_REASON);
  assert.equal(displayedEvidenceProse("not_in_source", budgets), budgets);
});
