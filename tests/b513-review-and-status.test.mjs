import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { shownTrace } from "../lib/qc/shown-verdict.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { readingNoteSystem } from "../lib/qc/reading-review.mjs";
import { leaveOutItems } from "../lib/prompt-library/compose.mjs";
import { SUMMARIZE_SYSTEM_PROMPT, roleForSingleSource } from "../lib/source-summary.mjs";
import { dealStatusDraftLine } from "../lib/deal-status.mjs";
import { completionEffect } from "../lib/qc/shown-verdict.mjs";
import { transactionShift } from "../lib/qc/transaction-state.mjs";

function displayCard({ statement, role, classification, displayVerdict, noteText, quote, sourceName }) {
  return {
    statement,
    displayVerdict,
    primaryRefTitle: sourceName,
    sourceQuote: quote,
    statementVerdict: { state: "nothing_raised", setBy: null },
    readingNote: noteText ? { text: noteText, bucket: "wording" } : { text: "", bucket: "none" },
    matchExplanations: [
      {
        sourceLabel: sourceName,
        role,
        classification,
        writtenFor: "candidate",
        explanation: noteText,
      },
    ],
  };
}

describe("B513 context rule on the evidence check", () => {
  test("a context-only display conflict with a supporting note raises nothing", () => {
    const card = displayCard({
      statement: "The loss was not service-related, and other contracts renewed as planned.",
      role: "context",
      classification: "not_found",
      displayVerdict: "conflict",
      noteText: "The Q3 report restates this.",
      quote: "Other contracts renewed as planned.",
      sourceName: "35_kestrel_q2_2026_report.txt",
    });
    const traced = shownTrace(card);
    assert.equal(traced.state, "nothing_raised");
    assert.equal(traced.setBy.cleared, "readingNote");
  });

  test("a facts display conflict with a supporting note needs a look", () => {
    const card = displayCard({
      statement: "Strong expansion continued.",
      role: "facts",
      classification: "not_found",
      displayVerdict: "conflict",
      noteText: "The report restates this.",
      quote: "Growth was 4%.",
      sourceName: "34_kestrel_q3_2026_report.txt",
    });
    const traced = shownTrace(card);
    assert.equal(traced.state, "note_withheld");
    assert.equal(traced.setBy.branch, "checksDisagree");
    assert.equal(traced.setBy.from, "evidenceDisplay");
    assert.equal(traced.setBy.role, "facts");
    assert.equal(traced.setBy.sourceName, "34_kestrel_q3_2026_report.txt");
  });

  test("a facts source that supports the statement clears a context disagreement", () => {
    const card = displayCard({
      statement: "Other contracts renewed as planned.",
      role: "context",
      classification: "conflicting",
      displayVerdict: "conflict",
      quote: "Renewals slipped.",
      sourceName: "q2.txt",
    });
    card.matchExplanations.push({
      sourceLabel: "q3.txt",
      role: "facts",
      classification: "confirmed",
      writtenFor: "candidate",
      explanation: "The Q3 report states the renewals.",
    });
    assert.equal(shownTrace(card).state, "nothing_raised");
  });
});

describe("B513 the reason follows the colour", () => {
  test("a supporting note shows both views, and a conflicts note does not say the statement matches", () => {
    const supported = displayCard({
      statement: "The firm has agreed to acquire a portfolio of five limited partnership interests.",
      role: "facts",
      classification: "not_found",
      displayVerdict: "conflict",
      noteText: "The statement says the firm has agreed to acquire on these terms, which restates the recommended transaction in other words.",
      quote: "The team recommends approval of the acquisition.",
      sourceName: "28_secondary_lp_portfolio_ic.txt",
    });
    const supportedReason = readerEvidenceSentence(supported);
    assert.equal(shownTrace(supported).state, "note_withheld");
    assert.equal(supportedReason.includes("The reading of the whole claim found it supported"), false);
    const card = displayCard({
      statement: "The firm has agreed to acquire a portfolio of five limited partnership interests.",
      role: "facts",
      classification: "not_found",
      displayVerdict: "conflict",
      noteText: "The source is still recommending approval.",
      quote: "The team recommends approval of the acquisition.",
      sourceName: "28_secondary_lp_portfolio_ic.txt",
    });
    card.readingNote = { text: card.readingNote.text, bucket: "conflicts", refused: false };
    card.statementVerdict = { state: "conflicts", setBy: { source: "note", bucket: "conflicts" } };
    const reason = readerEvidenceSentence(card);
    assert.equal(shownTrace(card).state, "conflicts");
    assert.match(reason, /recommend/);
    assert.doesNotMatch(reason, /restates|in other words|matches/i);
  });

  test("a context look with no supporting note names the context document", () => {
    const card = displayCard({
      statement: "The loss was not service-related.",
      role: "context",
      classification: "not_found",
      displayVerdict: "conflict",
      quote: "The loss was not service-related.",
      sourceName: "35_kestrel_q2_2026_report.txt",
    });
    card.readingNote = null;
    const reason = readerEvidenceSentence(card);
    assert.match(reason, /Needs a look/);
    assert.match(reason, /35_kestrel_q2_2026_report\.txt/);
    assert.match(reason, /context/);
  });
});

describe("B513 review knows the leave-out list", () => {
  test("the reading prompt carries the text type exclude list and no other list", () => {
    const items = leaveOutItems("NEW_PRIMARY_COMMITMENT");
    assert.ok(items.includes("the commitment amount"));
    const prompt = readingNoteSystem("Document: memo\nRole: facts\nDate: no date\n\nThe firm recommends the fund.", "NEW_PRIMARY_COMMITMENT");
    assert.match(prompt, /The writer was told to leave out the items below\. Do not raise a statement for leaving them out\./);
    for (const item of items) assert.match(prompt, new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const plain = readingNoteSystem("Document: memo\nRole: facts\nDate: no date\n\nBody.", "SPECIAL_TOPIC");
    assert.doesNotMatch(plain, /leave out the items below/);
  });
});

describe("B513 one document has no role in the summary prompt", () => {
  test("the summary prompt does not ask for a role and one document is facts", () => {
    assert.doesNotMatch(SUMMARIZE_SYSTEM_PROMPT, /suggestedRole/);
    assert.doesNotMatch(SUMMARIZE_SYSTEM_PROMPT, /roleReason/);
    assert.deepEqual(roleForSingleSource(1), {
      suggestedRole: "facts",
      roleReason: "This run has one source, so the role is facts.",
    });
    assert.equal(roleForSingleSource(2), null);
  });
});

describe("B513 deal status", () => {
  test("drafting adds the confirmation only when the writer set one", () => {
    assert.equal(dealStatusDraftLine(""), "");
    assert.equal(dealStatusDraftLine("As the source states"), "");
    assert.match(dealStatusDraftLine("Approved"), /The writer confirms the transaction status is: Approved/);
    assert.throws(() => dealStatusDraftLine("Closed"), /not a known option/);
  });

  test("a draft status at or before the confirmation is supported and a later one is raised", () => {
    const covered = {
      statement: "The firm has committed USD 40 million.",
      dealStatus: "Signed or agreed",
      statementVerdict: { state: "nothing_raised" },
      sourceQuote: "we recommend the commitment.",
    };
    assert.equal(transactionShift(covered), null);
    const beyond = {
      statement: "The firm has invested USD 40 million.",
      dealStatus: "Signed or agreed",
      statementVerdict: { state: "nothing_raised" },
      readingNote: { completion: "pending" },
      sourceQuote: "we recommend the commitment.",
    };
    assert.equal(completionEffect(beyond), "conflicts");
    assert.ok(transactionShift(beyond));
    const done = {
      ...beyond,
      dealStatus: "Completed",
    };
    assert.equal(transactionShift(done), null);
    assert.equal(completionEffect(done), "");
  });
});
