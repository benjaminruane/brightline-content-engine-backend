/**
 * B519. A label override is recorded on the card. The shown label does not change.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { labelOverrideSilences, shownLabel } from "../lib/qc/shown-verdict.mjs";

test("applyContextRole records the label it changes", () => {
  const card = {
    statement: "The firm agreed the purchase.",
    statementVerdict: { state: "conflicts" },
    readingNote: { bucket: "conflicts", text: "The documents differ on whether the purchase is agreed." },
    matchExplanations: [
      { sourceLabel: "press release", role: "context", classification: "conflicting", explanation: "The release differs." },
    ],
  };
  const before = shownLabel(card);
  const rows = labelOverrideSilences(card);
  assert.equal(shownLabel(card), before);
  const row = rows.find((item) => item.rule === "applyContextRole");
  assert.ok(row);
  assert.equal(row.id, "label_override");
  assert.equal(row.from, "Conflicts with the source");
  assert.equal(row.to, "Needs a look");
});

test("applyReaderDecides records the label it changes", () => {
  const card = {
    statement: "The remaining portfolio is concentrated in one sector.",
    displayVerdict: "supported_partial",
    sentenceState: "nothing_raised",
    statementVerdict: { state: "nothing_raised" },
    readingNote: { bucket: "none", text: "" },
    displayedEvidenceProse: "The source covers the portfolio and leaves the outlook unstated.",
  };
  const rows = labelOverrideSilences(card);
  const row = rows.find((item) => item.rule === "applyReaderDecides");
  assert.ok(row);
  assert.equal(row.id, "label_override");
  assert.equal(row.from, "Goes beyond the source");
  assert.equal(row.to, "Needs a look");
  assert.equal(shownLabel(card), "Needs a look");
});

test("a label that does not move records nothing", () => {
  const card = {
    statement: "Revenue grew.",
    statementVerdict: { state: "nothing_raised" },
    displayVerdict: "supported_full",
    readingNote: { bucket: "none", text: "The source states the same figure." },
  };
  assert.deepEqual(labelOverrideSilences(card), []);
});
