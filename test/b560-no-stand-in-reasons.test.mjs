/**
 * B560. The stand-in "Which part was not recorded" does not appear on a card.
 * Row 13 stored it after a confirming sentence was withheld.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { sealReaderCard } from "../lib/qc/reader-prose-guard.mjs";

const STAND_IN = "Which part was not recorded";

function places(value, path, found) {
  if (typeof value === "string") {
    if (value.includes(STAND_IN)) found.push(path);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => places(item, `${path}[${index}]`, found));
    return;
  }
  for (const key of Object.keys(value)) places(value[key], `${path}.${key}`, found);
}

test("a confirming partial does not put the stand-in on the card", () => {
  const statement = "3i Group today announced results for the year to 31 March 2025, delivering a total return of GBP 5.0 billion, or 25% on opening shareholders' funds.";
  const confirming = "The source confirms the statement by reporting the same total return of GBP 5.0 billion, or 25% on opening shareholders' funds.";
  const card = applyReadingContract({
    statement,
    displayVerdict: "supported_partial",
    evidenceSummary: confirming,
    primaryExcerpt: "Total return of £5,049 million or 25% on opening shareholders' funds",
    matchExplanations: [{
      classification: "partially_confirmed",
      writtenFor: "partially_confirmed",
      explanation: confirming,
    }],
  }, {
    facts: [],
    note: { bucket: "none", text: confirming },
    sourceText: "Total return of £5,049 million or 25% on opening shareholders' funds (2024: £3,839 million, 23%).",
  });
  const found = [];
  places(card, "card", found);
  assert.deepEqual(found, []);
});

test("sealing a card does not write the stand-in onto a concern or the reason", () => {
  const sealed = sealReaderCard({
    statement: "Revenue grew and the margin widened.",
    displayVerdict: "supported_partial",
    sentenceState: "partial",
    statementVerdict: { state: "partial" },
    evidenceSummary: "The source confirms that revenue grew.",
    editorialConcerns: [{ concernCode: "materiality", text: "The claim is supported by the draft." }],
  });
  const found = [];
  places(sealed, "card", found);
  assert.deepEqual(found, []);
});
