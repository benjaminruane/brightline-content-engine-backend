/**
 * B560. A recommendation stated as a decision is amber, with one reason.
 * A figure conflict in the same sentence stays red. A claimed completion stays as it was.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { DECISION_AS_MADE_REASON } from "../lib/qc/decision-as-made.mjs";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { shownState } from "../lib/qc/shown-verdict.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const REASON = "The source recommends this; confirm the decision was taken.";

function review(statement, source, note) {
  return applyReadingContract({
    statement,
    primaryExcerpt: source.split("\n")[0],
  }, {
    facts: [],
    note: note || { bucket: "conflicts", text: "The source recommends the step and the draft states it as decided." },
    sourceText: source,
  });
}

test("Halden Group committed, from a paper that recommends, is amber", () => {
  const card = review(
    "In October 2026, Halden Group committed to Aldermoor Capital Fund VI, a European mid-market buyout fund targeting EUR 1.1 billion.",
    "The team recommends that the Committee approve a commitment of EUR 65 million to Aldermoor Capital Fund VI. Halden Group has invested with Aldermoor since Fund III in 2015 and committed to Funds III, IV and V."
  );
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.equal(card.combinedVerdict.label, "Needs a look");
  assert.notEqual(card.combinedVerdict.tone, "red");
  assert.equal(card.displayedEvidenceProse, REASON);
  assert.equal(DECISION_AS_MADE_REASON, REASON);
  const withConflict = {
    ...card,
    matchExplanations: [{ classification: "conflicting", explanation: "The paper recommends the commitment and the draft states it as made." }],
  };
  assert.equal(shownState(withConflict), "note_withheld");
  assert.equal(readerEvidenceSentence(withConflict), REASON);
  const withDate = {
    ...withConflict,
    readingFacts: [{ kind: "date", status: "matched_disputed", surface: "October 2026" }],
  };
  assert.equal(shownState(withDate), "note_withheld");
  const withFigure = {
    ...withConflict,
    readingFacts: [{ kind: "figure", status: "matched_disputed", surface: "EUR 65 million" }],
  };
  assert.equal(shownState(withFigure), "conflicts");
});

test("agreed to invest and agreed to acquire from a recommendation are the same amber", () => {
  const invest = review(
    "In October 2010, Bessemer Venture Partners agreed to invest USD 5 million in the Series A financing of Shopify.",
    "We plan to invest $5mm and thereby own 20% on a fully-diluted basis."
  );
  assert.equal(invest.combinedVerdict.tone, "amber");
  assert.equal(invest.displayedEvidenceProse, REASON);
  const acquire = review(
    "In November 2026, Helvetia Precision Components agreed to acquire 100% of Morava Precision for EUR 42 million.",
    "The team recommends that the Committee approve the acquisition by Helvetia Precision Components AG of 100% of Morava Precision s.r.o. for EUR 42 million."
  );
  assert.equal(acquire.combinedVerdict.tone, "amber");
  assert.equal(acquire.displayedEvidenceProse, REASON);
});

test("a pre-money conflict stays red, and a claimed completion is not this amber", () => {
  const priced = review(
    "The round is priced at a USD 20 million pre-money valuation.",
    "The round is priced at a $20mm pre-money valuation ($18.7mm EV).\n\nDeal\nThis is a deal for BVP to invest $5mm at $25mm pre-money.",
    { bucket: "conflicts", text: "The Deal section states $25mm pre-money, not $20mm." }
  );
  assert.equal(priced.combinedVerdict.tone, "red");
  assert.notEqual(priced.displayedEvidenceProse, REASON);
  const completed = review(
    "In November 2026, Helvetia completed the acquisition of Morava Precision.",
    "The team recommends that the Committee approve the acquisition of Morava Precision."
  );
  assert.notEqual(completed.displayedEvidenceProse, REASON);
});
