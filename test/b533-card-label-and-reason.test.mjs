/**
 * B533. The label matches the state the card stores.
 * A dropped gross or net word is described as dropped.
 * A stale completion note is ordinary prose.
 * Built from the B532 Harbourline review.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { speakStatusNote } from "../lib/qc/supersession.mjs";

const quietNote = { bucket: "none", text: "", completion: "none" };

function quietCard(statement, matches) {
  return applyReadingContract({
    statement,
    displayVerdict: "conflict",
    dealStatus: "Signed or agreed",
    matchExplanations: matches,
  }, { facts: [], note: quietNote });
}

test("a status-cleared sentence is not labelled Needs a look", () => {
  const letter = quietCard(
    "This letter is about Harbourline Foods and the partial sale Kestrel has agreed with Northshore Consumer Partners.",
    [{ classification: "confirmed" }, { classification: "confirmed" }, { classification: "confirmed" }],
  );
  const agreed = quietCard(
    "On 17 June 2026 Kestrel agreed to sell a 60 percent stake in Harbourline Foods to Northshore Consumer Partners at an enterprise value of GBP 420 million.",
    [{ classification: "confirmed" }, { classification: "partially_confirmed" }, { classification: "confirmed" }],
  );
  for (const card of [letter, agreed]) {
    assert.equal(card.sentenceState, "nothing_raised");
    assert.equal(card.sentenceLabel, "Nothing raised");
    assert.equal(card.tier, "quiet");
    assert.equal(card.combinedVerdict.tone, "none");
    assert.equal(String(card.displayedEvidenceProse || "").trim(), "");
  }
});

test("a dropped net qualifier says the draft dropped net and does not call the wording equivalent", () => {
  const card = applyReadingContract({
    statement: "The fund reports an IRR of 15.9 percent.",
    displayVerdict: "supported_full",
    complianceVerdict: "soft_concern",
    complianceConcerns: [{
      concernCode: "return_figure_gross_net_qualifier_missing",
      note: "The statement presents a return figure without a gross-or-net qualifier.",
      severity: "soft_concern",
    }],
  }, {
    facts: [],
    note: {
      bucket: "none",
      escalate: "gross_net",
      text: "The Q2 2026 quarterly report gives a Net IRR of 15.9% at 30 June 2026. The statement calls it an IRR rather than Net IRR, which is the same figure in other words.",
      documentValues: [{ document: "Kestrel Partners Fund IV quarterly report, Q2 2026", value: "Net IRR 15.9%" }],
    },
  });
  assert.equal(card.sentenceState, "note_withheld");
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.equal(card.tier, "light");
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.match(card.displayedEvidenceProse, /net/i);
  assert.match(card.displayedEvidenceProse, /drops/);
  assert.equal(/other words|equivalent|same figure|rather than/i.test(card.displayedEvidenceProse), false);
});

test("a stale completion note is two sentences and does not paste the source", () => {
  const machine = "The current source Kestrel Partners Fund IV distribution notice dated 8 October 2026 disagrees with the statement: On 30 September 2026 the Fund completed the sale of a 60% shareholding in Harbourline Foods Limited to Northshore Consumer Partners. An earlier source Kestrel Partners Fund IV quarterly report, Q2 2026 dated 22 July 2026 agrees with the statement: On 17 June we agreed the sale of a 60% stake to Northshore Consumer Partners, valuing Harbourline at an enterprise value of GBP 420 million; completion is expected in the third quarter, subject to regulatory approvals.";
  const statement = "The sale is expected to complete in the third quarter.";
  const spoken = speakStatusNote(machine, statement);
  const card = applyReadingContract({
    statement,
    displayVerdict: "supported_partial",
    supersededSourceNotes: [machine],
    matchExplanations: [
      { classification: "confirmed", passage: "completion is expected in the third quarter" },
      { classification: "conflicting", passage: "On 30 September 2026 the Fund completed the sale" },
    ],
  }, { facts: [], note: { bucket: "none", text: "" } });
  for (const reason of [spoken, card.displayedEvidenceProse]) {
    assert.equal(card.sentenceState, "note_withheld");
    assert.equal(card.tier, "light");
    assert.equal(/Kestrel Partners Fund IV/.test(reason), false);
    assert.equal(/disagrees with the statement:/.test(reason), false);
    assert.match(reason, /October distribution notice/);
    assert.match(reason, /completed on 30 September 2026/);
    assert.match(reason, /expected to complete/);
    assert.match(reason, /July report/);
  }
});
