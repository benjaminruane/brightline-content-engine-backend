/**
 * B606 C1. Needs-a-look cards get a deterministic net/gross qualifier proposal.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyExitGate } from "../lib/qc/exit-gate.mjs";
import { attachQualifierProposal, insertQualifierBeforeMetric } from "../lib/qc/b606-card-rules.mjs";

test("insertQualifierBeforeMetric fixes article agreement", () => {
  assert.equal(
    insertQualifierBeforeMetric("The fund reports an IRR of 15.9 percent.", "net"),
    "The fund reports a net IRR of 15.9 percent.",
  );
  assert.equal(
    insertQualifierBeforeMetric("Returns include a MOIC of 2.1x.", "gross"),
    "Returns include a gross MOIC of 2.1x.",
  );
});

test("S13 net IRR case proposes the qualified sentence", () => {
  const card = {
    statement: "The fund reports an IRR of 15.9 percent.",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    shownReason: "The draft drops the gross or net qualifier on the figure, so a reader cannot tell whether it is gross or net.",
    primaryExcerpt: "Net IRR for the period was 15.9 percent.",
    complianceConcerns: [{ concernCode: "return_figure_gross_net_qualifier_missing" }],
  };
  const out = applyExitGate(card);
  assert.equal(out.sentenceState, "note_withheld");
  assert.equal(out.evidenceProposal?.resultingSentence, "The fund reports a net IRR of 15.9 percent.");
});

test("gross case proposes the qualified sentence", () => {
  const card = {
    statement: "The fund reports an IRR of 18 percent.",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    shownReason: "The draft drops the gross or net qualifier on the figure.",
    primaryExcerpt: "Gross IRR stood at 18 percent.",
    complianceConcerns: [{ concernCode: "return_figure_gross_net_qualifier_missing" }],
  };
  const out = attachQualifierProposal(card);
  assert.equal(out.evidenceProposal?.resultingSentence, "The fund reports a gross IRR of 18 percent.");
});

test("no proposal when the sentence already has the qualifier", () => {
  const card = {
    statement: "The fund reports a net IRR of 15.9 percent.",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    primaryExcerpt: "Net IRR for the period was 15.9 percent.",
  };
  const out = attachQualifierProposal(card);
  assert.equal(out.evidenceProposal, undefined);
});
