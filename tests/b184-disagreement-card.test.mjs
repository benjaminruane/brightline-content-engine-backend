/**
 * B184: disagreement cards carry both passages and keep the ruling.
 * T1–T4 go through runActionList. T5–T7 exercise the editorial backstop.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { suppressEvidenceLanguageConcerns } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { runActionList } from "../lib/revise-actions/run.mjs";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

const F24_FPS = [
  { sourceIndex: 0, sourceLabel: "24a_synth_peer_factsheet.txt" },
  { sourceIndex: 1, sourceLabel: "24b_synth_peer_performance_report.txt" },
];

function statementRow(id, statement, cardExtras = {}) {
  const { primaryExcerpt, ...rest } = cardExtras;
  return {
    id: String(id),
    text: statement,
    qcCard: {
      index: Number(id),
      statement,
      supportState: "conflicting",
      displayVerdict: "conflict",
      hasConflict: true,
      primaryExcerpt:
        primaryExcerpt ||
        (Array.isArray(rest.supportSpans) ? rest.supportSpans[0]?.passage : undefined),
      ...rest,
    },
  };
}

const COMMITMENTS = statementRow(3, "Total commitments were EUR 1.3 billion.", {
  primaryExcerpt: "Total commitments                                    EUR 1.2 billion",
  stage2SourceFingerprints: F24_FPS,
  supportSpans: [
    {
      sourceRefId: 0,
      classification: "conflicting",
      passage: "Total commitments                                    EUR 1.2 billion",
    },
    {
      sourceRefId: 1,
      classification: "conflicting",
      passage: "Total commitments stood at EUR 1.25 billion.",
    },
  ],
});

const COMPANIES = statementRow(2, "The fund held 36 portfolio companies at quarter end.", {
  primaryExcerpt: "The Fund held 34 portfolio companies as at 31 March 2025.",
  stage2SourceFingerprints: F24_FPS,
  supportSpans: [
    {
      sourceRefId: 0,
      classification: "conflicting",
      passage: "The Fund held 34 portfolio companies as at 31 March 2025.",
    },
    {
      sourceRefId: 1,
      classification: "confirmed",
      passage: "The fund held 36 portfolio companies at quarter end.",
    },
  ],
});

const SINGLE_SOURCE = statementRow(5, "The fund has delivered a net IRR of 18.4% since inception.", {
  primaryExcerpt: "The net IRR since inception is 11.2%.",
  supportSpans: [
    {
      sourceRefId: 0,
      classification: "conflicting",
      passage: "The net IRR since inception is 11.2%.",
    },
  ],
});

function evidenceEntry(result) {
  return result.entries.find((row) => row.kind === "evidence");
}

describe("B184 disagreement card", () => {
  test("T1 no ruling: both passages, both labels, neither governing", async () => {
    const result = await runActionList([COMMITMENTS], { callModel: throwingModel() });
    const entry = evidenceEntry(result);
    assert.ok(entry);
    assert.equal(entry.explainCode, "sources_disagree");
    assert.ok(Array.isArray(entry.disagreementPassages));
    assert.equal(entry.disagreementPassages.length, 2);
    assert.equal(entry.disagreementPassages[0].sourceId, 0);
    assert.equal(entry.disagreementPassages[0].label, "24a_synth_peer_factsheet.txt");
    assert.match(entry.disagreementPassages[0].passage, /EUR 1\.2 billion/);
    assert.equal(entry.disagreementPassages[0].governs, false);
    assert.equal(entry.disagreementPassages[1].sourceId, 1);
    assert.equal(entry.disagreementPassages[1].label, "24b_synth_peer_performance_report.txt");
    assert.match(entry.disagreementPassages[1].passage, /EUR 1\.25 billion/);
    assert.equal(entry.disagreementPassages[1].governs, false);
  });

  test("T2 other source governs: proposal figure is in the governing passage", async () => {
    const result = await runActionList([COMMITMENTS], {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: 1 }],
    });
    const entry = evidenceEntry(result);
    assert.ok(entry);
    assert.equal(entry.disposition, "ACTION");
    assert.match(String(entry.resultingSentence), /1\.25/);
    const governing = entry.disagreementPassages.find((row) => row.governs === true);
    const other = entry.disagreementPassages.find((row) => row.governs !== true);
    assert.ok(governing);
    assert.ok(other);
    assert.equal(governing.sourceId, 1);
    assert.match(governing.passage, /1\.25/);
    assert.equal(entry.disagreementPassages.filter((row) => row.governs === true).length, 1);
  });

  test("T3 pairing source governs and no pairs: governancePair still present", async () => {
    const result = await runActionList([COMPANIES], {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: 0 }],
    });
    const entry = evidenceEntry(result);
    assert.ok(entry);
    assert.equal(entry.disposition, "ACKNOWLEDGE");
    assert.equal(entry.resultingSentence, undefined);
    assert.ok(entry.governancePair && typeof entry.governancePair === "object");
    assert.equal(entry.governancePair.a, 0);
    assert.equal(entry.governancePair.b, 1);
    assert.equal(entry.governancePair.governs, 0);
  });

  test("T4 no disagreement: no disagreementPassages", async () => {
    const result = await runActionList([SINGLE_SOURCE], { callModel: throwingModel() });
    const entry = evidenceEntry(result);
    assert.ok(entry);
    assert.equal("disagreementPassages" in entry, false);
  });

  test("T5 overreach_unsupported_causal evidence language is dropped", () => {
    const dropped = suppressEvidenceLanguageConcerns([
      {
        concernCode: "overreach_unsupported_causal",
        note: "implies a causal relationship that is not established in the draft without supporting evidence",
        suggestedDirection: "Remove the causal claim.",
      },
    ]);
    assert.equal(dropped.length, 0);
    const kept = suppressEvidenceLanguageConcerns([
      {
        concernCode: "overreach_unsupported_causal",
        note: "The current statement asserts a causal link the surrounding draft does not establish.",
        suggestedDirection: "State the two facts without the causal connective.",
      },
    ]);
    assert.equal(kept.length, 1);
  });

  test("T6 underreach_hedging behaves the same way", () => {
    const dropped = suppressEvidenceLanguageConcerns([
      {
        concernCode: "underreach_hedging",
        note: "The sentence is hedged where the source is clear.",
        suggestedDirection: "Drop the hedge.",
      },
    ]);
    assert.equal(dropped.length, 0);
    const kept = suppressEvidenceLanguageConcerns([
      {
        concernCode: "underreach_hedging",
        note: "Two hedges do the work of one in this sentence.",
        suggestedDirection: "Keep one hedge.",
      },
    ]);
    assert.equal(kept.length, 1);
  });

  test("T7 a different editorial rule mentioning evidence is not dropped", () => {
    const out = suppressEvidenceLanguageConcerns([
      {
        concernCode: "marketing_language_excess",
        note: "This claim is not supported by the evidence in the draft.",
        suggestedDirection: "Tone down the exceptionality.",
      },
    ]);
    assert.equal(out.length, 1);
    const causal = editorialRules.find((row) => row.id === "overreach_unsupported_causal");
    const hedge = editorialRules.find((row) => row.id === "underreach_hedging");
    assert.match(causal.description, /Do not use the words evidence, source, supported, unsupported or substantiated/);
    assert.match(hedge.description, /Do not use the words evidence, source, supported, unsupported or substantiated/);
  });
});
