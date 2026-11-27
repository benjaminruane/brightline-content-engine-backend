/**
 * B606 C2. Amber/red reasons must state the issue, not read as support.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyExitGate } from "../lib/qc/exit-gate.mjs";

test("Harbourline S5 shape: support-only reason is replaced by later-completion reason", () => {
  const card = {
    statement: "The sale is expected to complete in the third quarter.",
    sentenceState: "note_withheld",
    statementVerdict: {
      state: "note_withheld",
      setBy: { branch: "supersession", source: "later" },
    },
    shownReason: "The distribution notice reads as the sentence says, so there is no conflict.",
    readingNote: {
      text: "The distribution notice reports completion on 30 September 2026.",
    },
    matchExplanations: [
      {
        classification: "conflicting",
        explanation: "A later source says the sale completed on 30 September 2026, while the sentence still says expected to complete in the third quarter.",
      },
    ],
    primaryExcerpt: "The sale completed on 30 September 2026.",
    readingFacts: [
      { kind: "date", status: "matched", surface: "third quarter" },
    ],
  };
  const out = applyExitGate(card);
  const reason = String(out.shownReason || "");
  assert.match(reason, /completed|completion/i);
  assert.match(reason, /30 September 2026/i);
  assert.doesNotMatch(reason, /reads as the sentence says/i);
  assert.doesNotMatch(reason, /no conflict/i);
  assert.notEqual(out.sentenceState, "nothing_raised");
});

test("support-only amber with no deterministic issue goes quiet", () => {
  const card = {
    statement: "Revenue grew in the period.",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld", setBy: { branch: "statementVerdict" } },
    shownReason: "The source supports the sentence and reads as the sentence says, so there is no conflict.",
    readingFacts: [
      { kind: "name", status: "matched", surface: "Revenue" },
    ],
    matchExplanations: [{ classification: "confirmed", explanation: "The source supports the sentence." }],
  };
  const out = applyExitGate(card);
  assert.equal(out.sentenceState, "nothing_raised");
});
