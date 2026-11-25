/**
 * B503. The reader instructions, the fixed reading-note form, and a refused reply kept on the card.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { REQUIRED_HEDGING_LINE, buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { STAGE1_SYSTEM_PROMPT } from "../lib/qc/pipeline-v4/stage1-extract-statements.mjs";
import { READING_NOTE_PROMPT, acceptNote, noteEndorses } from "../lib/qc/reading-contract.mjs";
import { noteDraft, writerJsonSchemaForSpan } from "../lib/qc/reading-review.mjs";
import editorialRules from "../lib/rulebook/editorialRules.js";

const DEAL = "Set pending or predates only when the sentence itself says or implies the transaction has happened: a new investment, money invested or committed to the transaction, a completed or closed transaction, a stake the fund holds. A sentence about terms, price, valuation, people, timing, plans or later activity such as add-on acquisitions is none, even in a letter about a transaction that is still pending. A sentence that says the transaction is agreed, signed, or expected to close describes a pending transaction correctly, and is none.";
const QUALIFIER = "A dropped or added qualifier that changes what a figure or claim means is beyond, not wording: gross or net, pro forma, like-for-like, annualised, a rank, a geographic or portfolio scope, a time period. The note names the word and what it changes.";
const SIGN_OFF = "a sign-off or closing courtesy, including a closing line that only expresses the writer's thanks or confidence in the team or the opportunity and says further updates will follow, with no figure, date, action, timing or outcome";

test("the reading note, the hedging rule, and stage 1 carry the new instructions", () => {
  assert.equal(READING_NOTE_PROMPT.includes(DEAL), true);
  assert.equal(READING_NOTE_PROMPT.includes(QUALIFIER), true);
  assert.equal(READING_NOTE_PROMPT.includes("Adding the closing document will clear this."), false);
  assert.equal(REQUIRED_HEDGING_LINE, "A belief or expectation marker (we believe, we expect, in our view) on a sentence about future returns, performance or outcomes is required hedging, not redundant. Never propose removing it.");
  const rule = editorialRules.find((row) => row.id === "underreach_hedging");
  const prompt = buildEditorialStyleSystemPrompt({
    outputTypeLabel: "Investor letter",
    editorialRules: [rule],
    structuredStyleRules: [],
    outputSlug: "investor_letter",
    outputType: "investor_letter",
    houseName: "the firm",
  });
  assert.equal(prompt.includes(REQUIRED_HEDGING_LINE), true);
  assert.equal(STAGE1_SYSTEM_PROMPT.includes(SIGN_OFF), true);
  assert.equal(STAGE1_SYSTEM_PROMPT.includes("Yours sincerely"), false);
});

test("the reading-note schema has the bucket and completion enums", () => {
  const schema = writerJsonSchemaForSpan("b404-note");
  assert.deepEqual(schema, writerJsonSchemaForSpan("b404-note-retry"));
  assert.deepEqual(schema.properties.bucket.enum, ["conflicts", "beyond", "wording", "none"]);
  assert.deepEqual(schema.properties.completion.enum, ["pending", "predates", "none"]);
  assert.equal(schema.properties.note.type, "string");
  assert.equal(schema.properties.disputedIndices.type, "array");
  assert.equal(schema.properties.disputedIndices.items.type, "integer");
  assert.equal(schema.properties.documentValues.items.properties.document.type, "string");
  assert.equal(schema.properties.documentValues.items.properties.value.type, "string");
  assert.deepEqual(schema.required, ["bucket", "note", "completion", "disputedIndices", "documentValues"]);
});

test("a quote of the statement is not an endorsement, and the note's own voice still is", () => {
  const statement = "The position is structurally supported by the cash flows.";
  const quoted = 'The memo describes the cash flows. The statement calls the position "structurally supported".';
  assert.equal(noteEndorses(quoted, [statement]), false);
  const accepted = acceptNote({
    bucket: "beyond",
    text: quoted,
    completion: "none",
    disputedIndices: [],
  }, [], [statement]);
  assert.equal(accepted.ok, true);
  assert.equal(noteEndorses("The statement is supported.", [statement]), true);
  const refused = acceptNote({
    bucket: "beyond",
    text: "The statement is supported.",
    completion: "none",
    disputedIndices: [],
  }, [], [statement]);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "endorsing_language");
});

test("a refused reading note stores the raw reply", async () => {
  const reply = JSON.stringify({
    bucket: "beyond",
    note: "The statement is supported.",
    completion: "none",
    disputedIndices: [],
    documentValues: [],
  });
  const { notes } = await noteDraft({
    statements: ["Revenue grew last year."],
    draft: "Revenue grew last year.",
    sourceText: "Revenue grew last year.",
    complete: async () => reply,
  });
  const silence = (notes[0].silences || []).find((row) => row.id === "note_refused");
  assert.ok(silence);
  assert.equal(silence.reason, "endorsing_language");
  assert.equal(silence.rawReply, reply);
});
