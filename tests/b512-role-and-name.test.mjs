import assert from "node:assert/strict";
import { test } from "vitest";
import { extractElements } from "../lib/qc/b394-elements.mjs";
import { shownState, shownTrace } from "../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";
import { roleForSingleSource } from "../lib/source-summary.mjs";

function card(matches) {
  return {
    statement: "The firm agreed the purchase.",
    statementVerdict: { state: "conflicts", setBy: { source: "note", bucket: "conflicts" } },
    readingNote: { bucket: "conflicts", text: "The documents differ on whether the purchase is agreed." },
    matchExplanations: matches,
  };
}

test("a facts source that supports the statement clears a context-only conflict", () => {
  const row = card([
    { sourceLabel: "call notice", role: "facts", classification: "confirmed", explanation: "The notice agrees." },
    { sourceLabel: "press release", role: "context", classification: "conflicting", explanation: "The release differs." },
  ]);
  assert.equal(shownState(row), "nothing_raised");
  assert.equal(shownTrace(row).setBy.branch, "statementVerdict");
  assert.equal(shownTrace(row).setBy.sourceName, "call notice");
  assert.equal(shownTrace(row).setBy.role, "facts");
});

test("no facts source speaking to the statement is needs a look", () => {
  const row = card([
    { sourceLabel: "press release", role: "context", classification: "conflicting", explanation: "The release differs." },
  ]);
  assert.equal(shownState(row), "note_withheld");
  assert.equal(shownTrace(row).setBy.sourceName, "press release");
  assert.equal(shownTrace(row).setBy.role, "context");
});

test("a facts source that disagrees stays a conflict", () => {
  const row = card([
    { sourceLabel: "call notice", role: "facts", classification: "conflicting", explanation: "The notice differs." },
    { sourceLabel: "press release", role: "context", classification: "conflicting", explanation: "The release differs." },
  ]);
  assert.equal(shownState(row), "conflicts");
  assert.equal(shownTrace(row).setBy.sourceName, "call notice");
  assert.equal(shownTrace(row).setBy.role, "facts");
});

test("one source suggests facts without a model", () => {
  assert.deepEqual(roleForSingleSource(1), {
    suggestedRole: "facts",
    roleReason: "This run has one source, so the role is facts.",
  });
  assert.equal(roleForSingleSource(2), null);
  assert.equal(roleForSingleSource(undefined), null);
});

test("a sentence-opening capital is not a name unless that form appears mid-sentence in the source", () => {
  const statement = "Strategically, the plant adds capacity.";
  const source = "The plant adds capacity in a city already served.";
  const names = extractElements(statement, statement, source).filter((row) => row.kind === "name");
  assert.equal(names.some((row) => row.surface === "Strategically"), false);
});

test("a headline keeps only a capitalised run that appears in the source", () => {
  const statement = "Partners Group Agrees To Sell atNorth";
  const source = "Partners Group has agreed to sell atNorth.";
  const names = extractElements(statement, statement, source).filter((row) => row.kind === "name");
  assert.equal(names.some((row) => row.surface === "Partners Group Agrees To Sell"), false);
  assert.equal(names.some((row) => row.surface === "Partners Group"), false);
});

test("a name miss does not set not in the source when the note quotes the claim", () => {
  const verdict = statementVerdict({
    facts: [{ status: "not_found", kind: "name", surface: "Labor" }],
    note: { bucket: "none", text: 'The memo states "labour and energy costs in Brno are below those in Switzerland."' },
    entries: [],
    statement: "Labor and energy costs in Brno are below those in Switzerland.",
  });
  assert.equal(verdict.state, "nothing_raised");
});

test("a missing figure still sets not in the source", () => {
  const verdict = statementVerdict({
    facts: [{ status: "not_found", kind: "figure", surface: "14" }],
    note: { bucket: "none", text: 'The memo states "about fourteen weeks."' },
    entries: [],
    statement: "Lead times are about 14 weeks.",
  });
  assert.equal(verdict.state, "not_in_source");
});
