import assert from "node:assert/strict";
import { test } from "vitest";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { HOUSE_RULES_TEXT } from "../lib/prompt-library/house-rules.mjs";
import {
  METHODOLOGY_DELIMITER,
  methodologyNoteInstruction,
  splitMethodologyOutput,
} from "../lib/prompt-library/methodology-note.mjs";
import { LAYER_ORDER } from "../lib/prompt-library/compose.mjs";
import { OUTPUT_TYPE_LENGTH, wordLimitLine } from "../lib/prompt-library/outputTypeGuidance.js";
import { UNCONFIRMED_STATUS_LINE, dealStatusDraftLine, statusPromptLine } from "../lib/deal-status.mjs";
import { stage2PromptWithStatus } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { floorState } from "../lib/qc/contradiction-floor.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownTrace } from "../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";
import { transactionDemand } from "../lib/qc/transaction-state.mjs";
import { countWords } from "../lib/qc/token-estimate.mjs";

function view(over = {}) {
  return {
    statement: "The company serves small businesses.",
    displayVerdict: "conflict",
    statementVerdict: { state: "nothing_raised", setBy: null },
    readingNote: { bucket: "none", text: "The claim is supported.", refused: false },
    displayedEvidenceProse: "The memo states the company serves enterprises.",
    primaryRefTitle: "memo.txt",
    matchExplanations: [{
      sourceLabel: "memo.txt",
      role: "facts",
      classification: "conflicting",
      writtenFor: "candidate",
      explanation: "The memo states the company serves enterprises.",
    }],
    ...over,
  };
}

test("A1 an accepted supporting note turns a closest-passage conflict amber", () => {
  const traced = shownTrace(view());
  assert.equal(traced.state, "note_withheld");
  assert.equal(traced.setBy.branch, "checksDisagree");
  assert.equal(traced.setBy.from, "evidenceDisplay");
  assert.equal(traced.setBy.note, "readingNote");
  const reason = readerEvidenceSentence(view());
  assert.match(reason, /serves enterprises/);
  assert.equal(reason.includes("The reading of the whole claim found it supported"), false);
  assert.equal(reason.includes("\u2014"), false);
  const partial = shownTrace(view({ displayVerdict: "supported_partial" }));
  assert.equal(partial.state, "note_withheld");
  assert.equal(partial.setBy.branch, "checksDisagree");
});

test("A2 a conflicts note stays red, and a figure or date miss stays red", () => {
  const conflicts = shownTrace(view({
    readingNote: { bucket: "conflicts", text: "The claim conflicts.", refused: false },
    statementVerdict: { state: "conflicts", setBy: { source: "note", bucket: "conflicts" } },
  }));
  assert.equal(conflicts.state, "conflicts");
  assert.notEqual(conflicts.setBy.branch, "checksDisagree");

  const figure = statementVerdict({
    facts: [{ kind: "figure", status: "not_found", surface: "88%" }],
    note: { bucket: "none", text: "Supported." },
    entries: [],
    statement: "The price was 88% of NAV.",
  });
  assert.equal(figure.state, "not_in_source");
  const dated = statementVerdict({
    facts: [{ kind: "date", status: "not_found", surface: "2026" }],
    note: { bucket: "wording", text: "Same claim." },
    entries: [],
    statement: "The close was in 2026.",
  });
  assert.equal(dated.state, "not_in_source");
  const shown = shownTrace(view({
    statement: "The price was 88% of NAV.",
    readingFacts: [{ kind: "figure", status: "not_found", surface: "88%" }],
    statementVerdict: figure,
    readingNote: { bucket: "none", text: "Supported.", refused: false },
  }));
  assert.equal(shown.state, "conflicts");
  assert.notEqual(shown.setBy.branch, "checksDisagree");
});

test("A3 a missing or refused note leaves the closest-passage conflict red", () => {
  const missing = shownTrace(view({ readingNote: null }));
  assert.equal(missing.state, "conflicts");
  assert.equal(missing.setBy.branch, "evidenceDisplay");
  const refused = shownTrace(view({
    readingNote: { bucket: "none", text: "", refused: true },
    statementVerdict: { state: "note_withheld", setBy: { source: "note", refused: true } },
  }));
  assert.equal(refused.state, "conflicts");
  assert.notEqual(refused.setBy.branch, "checksDisagree");
});

test("A4 a supporting note clears a context-only disagreement", () => {
  const traced = shownTrace(view({
    primaryRefTitle: "context.txt",
    matchExplanations: [{
      sourceLabel: "context.txt",
      role: "context",
      classification: "conflicting",
      writtenFor: "candidate",
      explanation: "The context file describes a different period.",
    }],
  }));
  assert.equal(traced.state, "nothing_raised");
  assert.equal(traced.setBy.cleared, "readingNote");
  const refused = shownTrace(view({
    readingNote: { bucket: "none", text: "", refused: true },
    statementVerdict: { state: "nothing_raised", setBy: null },
    primaryRefTitle: "context.txt",
    matchExplanations: [{
      sourceLabel: "context.txt",
      role: "context",
      classification: "conflicting",
      writtenFor: "candidate",
      explanation: "The context file describes a different period.",
    }],
  }));
  assert.equal(refused.state, "note_withheld");
});

test("B1 a covered status is supported in the floor, the demand, and the stage 2 prompt", () => {
  const statement = "The firm has agreed the transaction.";
  const card = view({
    statement,
    dealStatus: "Signed or agreed",
    readingNote: null,
    statementVerdict: { state: "nothing_raised", setBy: null },
  });
  const traced = shownTrace(card);
  assert.equal(traced.state, "nothing_raised");
  assert.equal(traced.setBy.cleared, "status");
  const floored = floorState({
    statement,
    dealStatus: "Signed or agreed",
    statementVerdict: { state: "note_withheld" },
    displayVerdict: "conflict",
    matchExplanations: [{ classification: "conflicting", writtenFor: "candidate", explanation: "The source is still recommending the investment." }],
  });
  assert.equal(floored, "");
  const demand = transactionDemand({
    statement,
    dealStatus: "Signed or agreed",
    statementVerdict: { state: "nothing_raised" },
    sourceQuote: "We recommend the investment.",
  });
  assert.equal(demand, null);
  const line = statusPromptLine("Signed or agreed");
  assert.match(line, /The firm has agreed the transaction\./);
  assert.match(line, /A status claim at or before this confirmed status is supported/);
  const prompt = stage2PromptWithStatus("Match the statement.", "Approved");
  assert.match(prompt, /The firm has received approval for the transaction\./);
  assert.equal(stage2PromptWithStatus("Match the statement.", ""), "Match the statement.");
  const figure = shownTrace(view({
    statement: "The firm has agreed the transaction at 88% of NAV.",
    dealStatus: "Signed or agreed",
    readingFacts: [{ kind: "figure", status: "not_found", surface: "88%" }],
    statementVerdict: { state: "not_in_source", setBy: { source: "fact" } },
    readingNote: { bucket: "none", text: "Supported.", refused: false },
  }));
  assert.equal(figure.state, "conflicts");
  assert.notEqual(figure.setBy.branch, "checksDisagree");
  assert.notEqual(figure.setBy.cleared, "status");
});

test("C1 an unconfirmed status on a deal text type tells the writer to stay with the source", () => {
  assert.equal(dealStatusDraftLine("", "NEW_DIRECT_INVESTMENT"), UNCONFIRMED_STATUS_LINE);
  assert.equal(dealStatusDraftLine("As the source states", "NEW_PRIMARY_COMMITMENT"), UNCONFIRMED_STATUS_LINE);
  assert.equal(dealStatusDraftLine("", "SPECIAL_TOPIC"), "");
  assert.match(dealStatusDraftLine("Approved", "NEW_DIRECT_INVESTMENT"), /The writer confirms the deal status is: Approved/);
  const { basePromptText } = buildBasePrompt({
    outputType: "investor_letter",
    visibility: "complete",
    eventType: "NEW_SECONDARY_INVESTMENT",
    dealStatus: "As the source states",
  });
  assert.match(basePromptText, /The writer has not confirmed the deal status/);
  assert.match(basePromptText, /not that it was approved, agreed or completed/);
});

test("D1 a supported reading does not mark a missing name as not in the source", () => {
  const name = statementVerdict({
    facts: [{ kind: "name", status: "not_found", surface: "Harbourline" }],
    note: { bucket: "none", text: "" },
    entries: [],
    statement: "Harbourline completed the sale.",
  });
  assert.equal(name.state, "nothing_raised");
  const missingNote = statementVerdict({
    facts: [{ kind: "name", status: "not_found", surface: "Harbourline" }],
    note: null,
    entries: [],
    statement: "Harbourline completed the sale.",
  });
  assert.equal(missingNote.state, "not_in_source");
  const figure = statementVerdict({
    facts: [{ kind: "figure", status: "not_found", surface: "12%" }],
    note: { bucket: "none", text: "The quote states the statement." },
    entries: [],
    statement: "The discount was 12%.",
  });
  assert.equal(figure.state, "not_in_source");
});

test("E1 to E3 length ranges, the word-limit line, and commentary-only counting", () => {
  assert.deepEqual(OUTPUT_TYPE_LENGTH.REPORTING_COMMENTARY, { min: 100, max: 150 });
  assert.deepEqual(OUTPUT_TYPE_LENGTH.INVESTOR_LETTER, { min: 200, max: 300 });
  assert.deepEqual(OUTPUT_TYPE_LENGTH.PRESS_RELEASE, { min: 200, max: 300 });
  assert.deepEqual(OUTPUT_TYPE_LENGTH.LINKEDIN_POST, { min: 80, max: 150 });
  const { basePromptText } = buildBasePrompt({
    outputType: "press_release",
    visibility: "public",
    eventType: "SPECIAL_TOPIC",
  });
  assert.match(basePromptText, /Length: no more than 300 words\./);
  assert.equal(wordLimitLine(150), "Length: no more than 150 words. Say what the sources support, as briefly as that takes, up to that limit. Do not add a sentence the sources do not support to reach a length. Do not drop an essential point.");
  assert.equal(wordLimitLine(150).includes("Methodology"), false);
  const split = splitMethodologyOutput("One two three.\n---METHODOLOGY---\nFour five.");
  assert.equal(countWords(split.commentary), 3);
  assert.equal(countWords(split.methodologyNote), 2);
});

test("H1 to H4 the Methodology Note is a final layer and stays out of the draft", () => {
  assert.equal(LAYER_ORDER.at(-1), "methodology-note");
  assert.equal(LAYER_ORDER.at(-2), "this-run");
  const instruction = methodologyNoteInstruction();
  assert.match(instruction, /1 paragraph, as concise as possible and never more than 80 words/);
  assert.equal(instruction.includes("COMMENTARY ONLY"), false);
  assert.match(instruction, /---METHODOLOGY---/);
  assert.equal(METHODOLOGY_DELIMITER, "---METHODOLOGY---");
  assert.match(HOUSE_RULES_TEXT, /In the commentary, do not write about how this text was prepared or which sources it used; that belongs only in the Methodology Note\./);
  for (const visibility of ["complete", "public"]) {
    const { basePromptText } = buildBasePrompt({
      outputType: "linkedin_post",
      visibility,
      eventType: "SPECIAL_TOPIC",
    });
    assert.match(basePromptText, /---METHODOLOGY---/);
    assert.ok(basePromptText.lastIndexOf("---METHODOLOGY---") > basePromptText.indexOf("Output type:"));
  }
  const split = splitMethodologyOutput("The commentary stands alone.\n---METHODOLOGY---\nSources were read together.");
  assert.equal(split.commentary.includes(METHODOLOGY_DELIMITER), false);
  assert.equal(split.methodologyNote, "Sources were read together.");
  assert.equal(splitMethodologyOutput("No note here.").methodologyNote, "");
});
