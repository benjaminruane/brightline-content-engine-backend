/**
 * B578. A prediction flag follows the document date whatever its code.
 * The passage is the sentence the reason relies on. No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { dropDatedForwardLooking, documentReferenceDate } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { passageForCard } from "../lib/qc/passage-trim.mjs";
import { CHECK_DISPLAY_NAMES, CHECK_SHORT_NAMES } from "../lib/qc/review-summary.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const gem = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b574/gemspring-dirty.json"), "utf8"));
const source = gem.sources.map((row) => row.text || "").join("\n");
const card = (index) => gem.statements[index].qcCard;
const JUNE = "The fund was oversubscribed and reached its hard cap in under two months, with a single close for all institutional commitments in June 2026.";

test("S1 shows the speed of the raise sentence, and S2, S3 and S5 stay", () => {
  const s1 = passageForCard(card(0), source).passage;
  assert.match(s1, /The speed of the raise stands out/);
  assert.doesNotMatch(s1, /Westport/);
  assert.equal(
    passageForCard(card(1), source).passage,
    "Gemspring Capital Management, the Westport, Connecticut-based middle-market private equity firm, has closed Gemspring Capital Fund IV at $3.5 billion."
  );
  assert.equal(
    passageForCard(card(2), source).passage,
    "The firm said the fund was oversubscribed and reached its hard cap in less than three months, holding a single close for all institutional limited partner commitments."
  );
  assert.equal(
    passageForCard(card(4), source).passage,
    "Consistent with prior vintages, Gemspring’s team made a substantial commitment of its own and is Fund IV’s largest single investor."
  );
});

test("a prediction on or before the document date is dropped, whatever its code", () => {
  const referenceDate = "November 2026";
  assert.equal(documentReferenceDate("Date: November 2026\n\nThe fund closed.", []), "November 2026");
  const prediction = dropDatedForwardLooking([
    { concernCode: "caution_prediction", note: "a prediction stated as a fact without hedging language" },
  ], { statementText: JUNE, referenceDate });
  assert.equal(prediction.concerns.length, 0);
  assert.equal(prediction.dropped.length, 1);
  const byMeaning = dropDatedForwardLooking([
    { concernCode: "soft_claim", note: "This is a prediction stated as a fact." },
  ], { statementText: JUNE, referenceDate });
  assert.equal(byMeaning.concerns.length, 0);
  const onTheCard = dropDatedForwardLooking(card(2).complianceConcerns, {
    statementText: card(2).statement,
    referenceDate,
  });
  assert.equal(onTheCard.concerns.length, 0);
});

test("a later date or a hedge-worthy verb is kept, and a past event is not given a hedge", () => {
  const referenceDate = "November 2026";
  const later = dropDatedForwardLooking([
    { concernCode: "caution_prediction", note: "a prediction stated as a fact without hedging language" },
  ], { statementText: "A single close for all institutional commitments in December 2027.", referenceDate });
  assert.equal(later.concerns.length, 1);
  for (const verb of ["will", "expect", "forecast"]) {
    const kept = dropDatedForwardLooking([
      { concernCode: "caution_prediction", note: "a prediction stated as a fact without hedging language" },
    ], { statementText: `The firm ${verb} a single close in June 2026.`, referenceDate });
    assert.equal(kept.concerns.length, 1, verb);
  }
  const hedged = dropDatedForwardLooking([
    {
      concernCode: "clarity",
      note: "Name the close.",
      suggestedRewrite: "The close is expected to happen in June 2026.",
      suggestedDirection: "Add hedging language such as may.",
    },
  ], { statementText: JUNE, referenceDate });
  assert.equal(hedged.concerns.length, 1);
  assert.equal(hedged.concerns[0].suggestedRewrite, undefined);
  assert.equal(hedged.concerns[0].suggestedDirection, undefined);
});

test("the category name on the summary is Caution", () => {
  assert.equal(CHECK_SHORT_NAMES.compliance, "Caution");
  assert.equal(CHECK_DISPLAY_NAMES.compliance, "Caution review");
  assert.equal(/\bCompliance\b/.test(JSON.stringify(CHECK_SHORT_NAMES)), false);
  assert.equal(/\bCompliance\b/.test(JSON.stringify(CHECK_DISPLAY_NAMES)), false);
});
