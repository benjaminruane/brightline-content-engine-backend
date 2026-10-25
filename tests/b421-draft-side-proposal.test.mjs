import assert from "node:assert/strict";
import { test } from "vitest";
import { draftSideProposal, tallyDraftSide } from "../lib/qc/draft-side-proposal.mjs";
import { dropForwardLookingInExcerpt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { applyDecisions } from "../lib/revise-actions/apply.mjs";
import { inventoryStatements } from "../lib/revise-actions/inventory.mjs";
import { buildSortedEntries } from "../lib/revise-actions/sort.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

const SENTENCE = "The company also recently copleted an oversubscribed refinancing, which will lead to a reduction in debt servicing costs.";

function span(text, phrase) {
  const start = text.indexOf(phrase);
  return [{ startChar: start, endChar: start + phrase.length }];
}

test("copleted offers completed and a phrase that is not the span is refused", async () => {
  const concern = {
    concernCode: "structural_integrity",
    span: span(SENTENCE, "copleted"),
    suggestedDirection: "Replace 'copleted' with 'completed'.",
  };
  const offer = draftSideProposal({ concern, statementText: SENTENCE });
  assert.equal(offer.offered, true);
  assert.equal(offer.substitution.replacement, "completed");
  assert.ok(offer.resultingSentence.includes("recently completed an"));
  assert.equal(offer.resultingSentence.includes("copleted"), false);

  const curly = draftSideProposal({
    concern: {
      ...concern,
      suggestedDirection: "Change \u2018copleted\u2019 to \u2018completed\u2019.",
    },
    statementText: SENTENCE,
  });
  assert.equal(curly.offered, true);

  const tally = tallyDraftSide([
    concern,
    { concernCode: "structural_integrity", suggestedDirection: "Replace 'copleted' with 'completed'." },
    { concernCode: "structural_integrity", span: [{ startChar: 0, endChar: 0 }], suggestedDirection: "Replace 'x' with 'y'." },
    { concernCode: "structural_integrity", span: span(SENTENCE, "copleted"), suggestedDirection: "Please fix the typo." },
    { concernCode: "structural_integrity", span: span(SENTENCE, "copleted"), suggestedDirection: "Replace 'completed' with 'finished'." },
    { concernCode: "structural_integrity", span: span(SENTENCE, "copleted"), suggestedDirection: "Replace 'copleted' with 'copleted'." },
  ], SENTENCE);
  assert.equal(tally.offered, 1);
  assert.equal(tally.a, 1);
  assert.equal(tally.b, 1);
  assert.equal(tally.c, 1);
  assert.equal(tally.d, 1);
  assert.equal(tally.e, 1);

  const card = {
    statement: SENTENCE,
    editorialConcerns: [concern],
    complianceConcerns: [],
    displayVerdict: "supported_full",
    factualBadge: true,
  };
  const finding = inventoryStatements([{ id: "6", text: SENTENCE, qcCard: card }])[0];
  assert.equal(finding.draftSide, true);
  const sorted = buildSortedEntries([{ id: "6", text: SENTENCE, qcCard: card }]);
  const entry = sorted.find((row) => row.draftSide === true);
  assert.equal(entry.disposition, "ACTION");
  const filled = await fillAction(entry, { draftText: SENTENCE, authoringOrganisation: "Brightline" });
  assert.equal(filled.disposition, "ACTION");
  assert.equal(filled.resultingSentence.includes("completed"), true);
  assert.equal(filled.provenance, "derived");
});

test("two substitutions on one statement are still one write", () => {
  const text = "The deal was copleted and wil close.";
  const first = draftSideProposal({
    concern: {
      span: span(text, "copleted"),
      suggestedDirection: "Replace 'copleted' with 'completed'.",
    },
    statementText: text,
  });
  const second = draftSideProposal({
    concern: {
      span: span(text, "wil"),
      suggestedDirection: "Change 'wil' to 'will'.",
    },
    statementText: text,
  });
  const entries = [
    {
      id: "a",
      statementId: "0",
      statement: text,
      disposition: "ACTION",
      substitution: first.substitution,
      resultingSentence: first.resultingSentence,
    },
    {
      id: "b",
      statementId: "0",
      statement: text,
      disposition: "ACTION",
      substitution: second.substitution,
      resultingSentence: second.resultingSentence,
    },
  ];
  const applied = applyDecisions({
    draft: text,
    statements: [{ id: "0", text }],
    entries,
    decisions: [
      { id: "a", choice: "accept" },
      { id: "b", choice: "accept" },
    ],
  });
  assert.equal(applied.text, "The deal was completed and will close.");
  assert.equal(applied.notices.length, 0);
});

test("forward looking is dropped only when the span is already in an excerpt", () => {
  const text = "The refinancing will lead to a reduction in debt servicing costs.";
  const phrase = "will lead to a reduction in debt servicing costs";
  const start = text.indexOf(phrase);
  const concern = {
    concernCode: "forward_looking_statement_without_qualifier",
    span: [{ startChar: start, endChar: start + phrase.length }],
  };
  const hic = dropForwardLookingInExcerpt([concern], {
    statementText: text,
    primaryExcerpt: "enabled a step-down in the cost of debt earlier than forecast",
    conflictExcerpt: "",
  });
  assert.equal(hic.dropped.length, 0);
  assert.equal(hic.concerns.length, 1);

  const same = dropForwardLookingInExcerpt([concern], {
    statementText: text,
    primaryExcerpt: "The source says this will lead to a reduction in debt servicing costs.",
    conflictExcerpt: null,
  });
  assert.equal(same.dropped.length, 1);
  assert.equal(same.concerns.length, 0);
});
