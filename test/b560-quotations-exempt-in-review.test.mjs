/**
 * B560. Quotation ranges are taken on the whole draft.
 * A later sentence of the Chief Executive's quotation is still inside it.
 * Evidence is not this exemption.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { draftQuotationRanges, statementInsideDraftQuotation } from "../lib/qc/mechanics-scan.mjs";

const DRAFT = [
  "Chief Executive Simon Borrows said: 'FY2025 was another successful year for 3i, continuing our track record of consistently delivering strong shareholder returns.",
  "Our FY2025 result was underpinned by the powerful compounding growth from our long-term hold assets Action and Royal Sanders.",
  "We remain confident in our ability to compound.'",
  "The Group generated strong gross investment return.",
].join(" ");

test("later sentences of the quotation stay inside it, and the sentence after it does not", () => {
  const ranges = draftQuotationRanges(DRAFT);
  assert.equal(ranges.length, 1);
  const second = "Our FY2025 result was underpinned by the powerful compounding growth from our long-term hold assets Action and Royal Sanders.";
  const third = "We remain confident in our ability to compound.";
  const after = "The Group generated strong gross investment return.";
  const at = (sentence) => {
    const start = DRAFT.indexOf(sentence);
    return statementInsideDraftQuotation(DRAFT, start, start + sentence.length);
  };
  assert.equal(at(second), true);
  assert.equal(at(third), true);
  assert.equal(at(after), false);
  const opening = DRAFT.indexOf("Chief Executive");
  const firstEnd = DRAFT.indexOf(second);
  assert.equal(statementInsideDraftQuotation(DRAFT, opening, firstEnd), true);
});
