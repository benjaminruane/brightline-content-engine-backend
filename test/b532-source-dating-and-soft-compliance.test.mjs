/**
 * B532. A forward-looking date is not the document's date.
 * A soft compliance note stays grey unless it drops gross or net.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

const quiet = { state: "nothing_raised", tier: "quiet", setBy: null };

test("an older report that mentions a later expected date does not outrank a newer notice", () => {
  const out = resolveSupersession({
    statement: "The sale has completed.",
    aggregateVerdict: "conflicting",
    asOfBySourceIndex: {},
    sources: [
      {
        label: "Q2 report",
        text: "22 July 2026\nCompletion is expected by 31 December 2026, subject to approvals.",
      },
      {
        label: "distribution notice",
        text: "Date: 8 October 2026\nOn 30 September 2026 the Fund completed the sale.",
      },
    ],
    sourceMatches: [
      {
        sourceIndex: 0,
        sourceLabel: "Q2 report",
        classification: "conflicting",
        passage: "Completion is expected by 31 December 2026, subject to approvals.",
      },
      {
        sourceIndex: 1,
        sourceLabel: "distribution notice",
        classification: "confirmed",
        passage: "On 30 September 2026 the Fund completed the sale.",
      },
    ],
  });
  assert.equal(out.verdictOverride, "partially_confirmed");
  assert.match(out.supersededNotes[0], /distribution notice dated 8 October 2026 agrees/);
  assert.match(out.supersededNotes[0], /Q2 report dated 22 July 2026/);
  assert.equal(/dated 31 December/.test(out.supersededNotes[0]), false);
});

test("a source dated only by a forward-looking mention does not overrule, and the note still names both sides", () => {
  const out = resolveSupersession({
    statement: "The sale has completed.",
    aggregateVerdict: "conflicting",
    asOfBySourceIndex: {},
    sources: [
      {
        label: "Q2 report",
        text: "Completion is expected by 31 December 2026.",
      },
      {
        label: "distribution notice",
        text: "Date: 8 October 2026\nOn 30 September 2026 the Fund completed the sale.",
      },
    ],
    sourceMatches: [
      {
        sourceIndex: 0,
        sourceLabel: "Q2 report",
        classification: "conflicting",
        passage: "Completion is expected by 31 December 2026.",
      },
      {
        sourceIndex: 1,
        sourceLabel: "distribution notice",
        classification: "confirmed",
        passage: "On 30 September 2026 the Fund completed the sale.",
      },
    ],
  });
  assert.equal(out.verdictOverride, null);
  assert.equal(out.demotedSourceIndices.length, 0);
  assert.match(out.supersededNotes[0], /expected/);
  assert.match(out.supersededNotes[0], /completed/);
  assert.equal(out.supersededNotes[0].startsWith("The current source"), false);
});

test("a soft compliance note that is not gross or net stays grey and visible", () => {
  const note = "Promissory language without a qualifier.";
  const concern = { concernCode: "promissory_language", note, severity: "soft_concern" };
  const combined = combinedVerdict({
    verdict: quiet,
    editorialConcerns: [],
    complianceVerdict: "soft_concern",
    complianceConcerns: [concern],
  });
  assert.equal(combined.state, "wording");
  assert.equal(combined.tone, "grey");
  assert.equal(combined.label, "Craft or compliance notes");
  const card = applyReadingContract({
    statement: "Investors will see strong returns.",
    displayVerdict: "supported_full",
    complianceVerdict: "soft_concern",
    complianceConcerns: [concern],
    editorialConcerns: [],
  }, { facts: [], note: { bucket: "none", text: "" } });
  assert.equal(card.sentenceState, "nothing_raised");
  assert.equal(card.combinedVerdict.tone, "grey");
  assert.equal(card.complianceConcerns[0].note, note);
});

test("a dropped gross or net qualifier is amber even when the reader did not escalate it", () => {
  const concern = {
    concernCode: "return_figure_gross_net_qualifier_missing",
    note: "The statement presents IRR of 15.9 percent without a gross or net qualifier.",
    severity: "soft_concern",
  };
  const card = applyReadingContract({
    statement: "The fund reports an IRR of 15.9 percent.",
    displayVerdict: "supported_full",
    complianceVerdict: "soft_concern",
    complianceConcerns: [concern],
    editorialConcerns: [],
  }, { facts: [], note: { bucket: "none", text: "" } });
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.equal(card.sentenceState, "note_withheld");
  assert.equal(card.tier, "light");
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.match(card.displayedEvidenceProse, /gross or net/);
  assert.equal(card.complianceConcerns.length, 1);
});
