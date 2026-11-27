/**
 * B607. Rounding checks every facts source, not only the cited one.
 * Ostara S4: model cites only the fact sheet's EUR 1.2 billion, but the
 * quarterly report's EUR 1.25 billion rounds to the draft's EUR 1.3 billion.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { applyMultiSourceFigures } from "../lib/qc/b602-card-rules.mjs";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/b602/ostara.json"), "utf8"),
);

const sourceCorpus = (fixture.sources || [])
  .map((row) => row.text || "")
  .filter(Boolean)
  .join("\n\n");

test("Ostara S4 cites only fact sheet but rounding still greens from quarterly 1.25", () => {
  const card = {
    statement: "Total commitments were EUR 1.3 billion.",
    sentenceState: "conflicts",
    statementVerdict: { state: "conflicts" },
    // Model cites only the fact sheet.
    shownReason: "The fact sheet states total commitments as EUR 1.2 billion, while the sentence says EUR 1.3 billion.",
    sourceCorpus,
    conflictProposal: {
      proposedChange: "Replace 'EUR 1.3 billion' with 'EUR 1.2 billion'.",
      resultingSentence: "Total commitments were EUR 1.2 billion.",
    },
    suggestedImprovement: "Total commitments were EUR 1.2 billion.",
    evidenceSuggestedDirection: "Replace 'EUR 1.3 billion' with 'EUR 1.2 billion'.",
  };
  const out = applyMultiSourceFigures(card);
  assert.equal(out.sentenceState, "nothing_raised");
  assert.match(out.shownReason || "", /1\.25 billion.*rounded to EUR 1\.3 billion/i);
  assert.equal(out.conflictProposal, null);
  assert.equal(out.suggestedImprovement, null);
  assert.equal(out.evidenceSuggestedDirection, null);
});

test("when one source supports by rounding, never propose the other source figure", () => {
  const card = {
    statement: "Total commitments were EUR 1.3 billion.",
    sentenceState: "conflicts",
    statementVerdict: { state: "conflicts" },
    shownReason: "The fact sheet gives EUR 1.2 billion and the quarterly report gives EUR 1.25 billion.",
    sourceCorpus,
    suggestedImprovement: "Total commitments were EUR 1.2 billion.",
    conflictProposal: {
      proposedChange: "Replace 'EUR 1.3 billion' with 'EUR 1.2 billion'.",
      resultingSentence: "Total commitments were EUR 1.2 billion.",
    },
  };
  const out = applyMultiSourceFigures(card);
  assert.equal(out.sentenceState, "nothing_raised");
  assert.doesNotMatch(String(out.suggestedImprovement || ""), /1\.2 billion/);
  assert.equal(out.conflictProposal, null);
});
