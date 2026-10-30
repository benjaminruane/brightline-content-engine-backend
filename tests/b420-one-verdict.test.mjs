import assert from "node:assert/strict";
import { test } from "vitest";
import { evidenceDisplayVerdictLabel } from "../lib/qc/evidence-display-verdict.mjs";
import { applyReadingContract, noteEndorses, sentenceState } from "../lib/qc/reading-contract.mjs";
import { classifyCard } from "../lib/qc/review-summary.mjs";
import {
  CAUSAL_EVIDENCE_RULE,
  editorialVerdictWithoutCausal,
  statementVerdict,
  toneForStatementVerdict,
} from "../lib/qc/statement-verdict.mjs";
import { inventoryStatements } from "../lib/revise-actions/inventory.mjs";

function fact(status, surface = "budgets") {
  return { status, surface, kind: "benchmark" };
}

test("a missing fact is not_in_source and beats a quieter note", () => {
  const verdict = statementVerdict({
    facts: [fact("matched", "EBITDA"), fact("not_found", "budgets")],
    note: { bucket: "none", text: "" },
    entries: [],
  });
  assert.equal(verdict.state, "not_in_source");
  assert.equal(verdict.tier, "demands");
  assert.equal(verdict.setBy.source, "fact");
  assert.equal(verdict.setBy.surface, "budgets");
  assert.equal(evidenceDisplayVerdictLabel(verdict.state), "Not in the source");
  assert.notEqual(evidenceDisplayVerdictLabel(verdict.state), "Nothing raised");
});

test("conflicts, beyond, and a wording note", () => {
  const conflicts = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "conflicts", text: "The source states a different period." },
    entries: [],
  });
  assert.equal(conflicts.state, "conflicts");
  assert.equal(conflicts.tier, "demands");
  assert.equal(conflicts.setBy.source, "note");
  const beyond = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "beyond", text: "The source does not carry the valuation claim." },
    entries: [],
  });
  assert.equal(beyond.state, "beyond");
  assert.equal(beyond.tier, "light");
  const wording = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "wording", text: "Same point, other words." },
    entries: [],
  });
  assert.equal(wording.state, "nothing_raised");
  assert.equal(wording.tier, "quiet");
  assert.equal(wording.setBy, null);
});

test("a refused note is needs a look", () => {
  const verdict = statementVerdict({
    facts: [fact("matched")],
    note: { refused: true, bucket: "conflicts", text: "The source confirms the statement." },
    entries: [],
  });
  assert.equal(verdict.state, "note_withheld");
  assert.equal(verdict.tier, "demands");
  assert.equal(sentenceState([fact("matched")], { refused: true }), "note_withheld");
});

test("the causal action contributes beyond and a marketing action does not", () => {
  const causal = statementVerdict({
    facts: [fact("matched", "refinancing")],
    note: { bucket: "none", text: "" },
    entries: [{ concernCode: CAUSAL_EVIDENCE_RULE, note: "The source reports both and links neither." }],
  });
  assert.equal(causal.state, "beyond");
  assert.deepEqual(causal.setBy, { source: "action", rule: CAUSAL_EVIDENCE_RULE });
  const marketing = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "none", text: "" },
    entries: [{ concernCode: "marketing_language_excess", note: "Promotional." }],
  });
  assert.equal(marketing.state, "nothing_raised");
  assert.equal(toneForStatementVerdict(causal), "amber");
  assert.equal(toneForStatementVerdict(marketing), "green");
});

test("a missing fact beats the causal action", () => {
  const verdict = statementVerdict({
    facts: [fact("not_found", "budgets")],
    note: { bucket: "beyond", text: "The source does not carry this." },
    entries: [{ rule: CAUSAL_EVIDENCE_RULE }],
  });
  assert.equal(verdict.state, "not_in_source");
  assert.equal(verdict.setBy.source, "fact");
});

test("the card edge follows the statement verdict, not the evidence class", () => {
  const card = applyReadingContract(
    {
      statement: "Growth continues in line with budgets.",
      displayVerdict: "supported_full",
      editorialVerdict: "hard_concern",
      editorialConcerns: [],
    },
    {
      facts: [fact("not_found", "budgets")],
      note: { bucket: "none", text: "" },
    },
  );
  assert.equal(card.displayVerdict, "supported_full");
  assert.equal(card.statementVerdict.state, "not_in_source");
  assert.equal(card.sentenceState, "not_in_source");
  const classified = classifyCard(card, {
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
  });
  assert.equal(classified.cardTone, "red");
  assert.equal(evidenceDisplayVerdictLabel(card.statementVerdict.state, card), "Not in the source");
});

test("the causal concern leaves the editorial signal and enters the action list as evidence", () => {
  const concerns = [
    { concernCode: CAUSAL_EVIDENCE_RULE, severity: "hard_concern", note: "The source does not link them." },
    { concernCode: "marketing_language_excess", severity: "soft_concern", note: "Promotional." },
  ];
  assert.equal(editorialVerdictWithoutCausal(concerns, "hard_concern"), "concern");
  assert.equal(editorialVerdictWithoutCausal([concerns[0]], "hard_concern"), "clean");
  const rows = inventoryStatements([
    {
      id: "0",
      text: "The refinancing will lead to lower costs.",
      qcCard: {
        statement: "The refinancing will lead to lower costs.",
        editorialConcerns: [concerns[0]],
        index: 0,
      },
    },
  ]);
  const causal = rows.find((row) => row.rule === CAUSAL_EVIDENCE_RULE);
  assert.ok(causal);
  assert.equal(causal.kind, "evidence");
});

test("a note may not justify a finding by what the draft establishes", () => {
  assert.equal(noteEndorses("The draft does not establish a causal link."), true);
  assert.equal(noteEndorses("The statement treats the two events as a cause."), true);
  assert.equal(noteEndorses("The claim is made without supporting context."), true);
  assert.equal(noteEndorses("The source reports both and links neither."), false);
});

test("statementVerdict refuses a missing fact list and a missing action list", () => {
  assert.throws(() => statementVerdict({ note: null, entries: [] }), /facts are missing/);
  assert.throws(() => statementVerdict({ facts: [], note: null }), /action entries are missing/);
});
