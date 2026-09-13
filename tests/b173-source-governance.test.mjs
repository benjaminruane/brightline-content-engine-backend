/**
 * B173: when two sources disagree, ask which governs.
 * Findings follow fixture 24 planted cards. No diagnostic file read.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyConflictProposal } from "../lib/revise-actions/conflict-engagement.mjs";
import { detectSourceDisagreement } from "../lib/revise-actions/source-governance.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

const F24_FPS = [
  { sourceIndex: 0, sourceLabel: "24a_synth_peer_factsheet.txt" },
  { sourceIndex: 1, sourceLabel: "24b_synth_peer_performance_report.txt" },
];

const P1 = {
  statement: "Net IRR since inception stood at 11.2 percent as at 31 March 2025.",
  primaryExcerpt: "Net IRR since inception was 12.4%.",
  card: {
    stage2SourceFingerprints: F24_FPS,
    supportSpans: [
      {
        sourceRefId: 0,
        classification: "confirmed",
        passage: "Net IRR since inception                              11.2%",
      },
      {
        sourceRefId: 1,
        classification: "conflicting",
        passage: "Net IRR since inception was 12.4%.",
      },
    ],
  },
};

const P2_AGREE = {
  statement: "The fund is a 2019 vintage.",
  primaryExcerpt: "Ostara European Mid-Market Fund II is a 2019 vintage European mid-market buyout fund.",
  card: {
    stage2SourceFingerprints: F24_FPS,
    supportSpans: [
      {
        sourceRefId: 0,
        classification: "confirmed",
        passage: "Ostara European Mid-Market Fund II (\"Ostara II\" or \"the Fund\") is a 2019 vintage buyout fund",
      },
      {
        sourceRefId: 1,
        classification: "confirmed",
        passage: "Ostara European Mid-Market Fund II is a 2019 vintage European mid-market buyout fund.",
      },
    ],
  },
};

const P3 = {
  statement: "Total commitments were EUR 1.3 billion.",
  primaryExcerpt: "Total commitments                                    EUR 1.2 billion",
  card: {
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
  },
};

const P5_ONE_SOURCE = {
  statement: "Realised proceeds in the quarter were EUR 48 million, driven by the partial exit of Helvetic Components.",
  primaryExcerpt: "Realised proceeds in the quarter were EUR 48 million, driven by the partial exit of Helvetic Components AG.",
  card: {
    stage2SourceFingerprints: F24_FPS,
    supportSpans: [
      {
        sourceRefId: 1,
        classification: "confirmed",
        passage:
          "Realised proceeds in the quarter were EUR 48 million, driven by the partial exit of Helvetic Components AG.",
      },
    ],
  },
};

const NO_IDENTITY = {
  statement: "Net IRR since inception stood at 11.2 percent as at 31 March 2025.",
  primaryExcerpt: "Net IRR since inception was 12.4%.",
  card: {
    stage2SourceFingerprints: F24_FPS,
    supportSpans: [
      {
        sourceRefId: 1,
        classification: "conflicting",
        passage: "Net IRR since inception was 12.4%.",
      },
      {
        sourceRefId: 0,
        classification: "confirmed",
        passage: "The Fund held 34 portfolio companies as at 31 March 2025.",
      },
    ],
  },
};

function conflictEntry(id, fixture) {
  return {
    id,
    disposition: "ACTION",
    statementId: "1",
    statement: fixture.statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "",
    primaryExcerpt: fixture.primaryExcerpt,
    card: fixture.card,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
  };
}

function pairFrom(finding) {
  const outcome = applyConflictProposal(finding, null, {
    sourceRulings: [{ a: 0, b: 1, governs: 1 }],
  });
  return outcome.pairs?.[0] || null;
}

describe("B173 detection", () => {
  test("T1 detection fires when another source confirms the draft figure", () => {
    const finding = conflictEntry("p1", P1);
    const pair = pairFrom(finding) || {
      from: { raw: "11.2 percent", value: 11.2, kind: "percentage" },
      to: { raw: "12.4%", value: 12.4, kind: "percentage" },
    };
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId: 1,
      statement: P1.statement,
      pair,
      excerpt: P1.primaryExcerpt,
    });
    assert.ok(hit);
    assert.equal(hit.pairingSourceId, 1);
    assert.equal(hit.otherSourceId, 0);
    assert.equal(hit.otherMatchesDraft, true);
    assert.match(String(hit.pairingFigureRaw), /12\.4/);
    assert.match(String(hit.otherFigureRaw), /11\.2/);
  });

  test("T2 detection fires when two sources state different values and neither matches the draft", () => {
    const finding = conflictEntry("p3", P3);
    const outcome = applyConflictProposal(finding, null, {
      sourceRulings: [{ a: 0, b: 1, governs: 0 }],
    });
    const pair = outcome.pairs?.[0];
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId: 0,
      statement: P3.statement,
      pair: pair || {
        from: { raw: "EUR 1.3 billion", value: 1.3, kind: "money", scale: "billion", currency: "EUR" },
        to: { raw: "EUR 1.2 billion", value: 1.2, kind: "money", scale: "billion", currency: "EUR" },
      },
      excerpt: P3.primaryExcerpt,
    });
    assert.ok(hit);
    assert.equal(hit.otherMatchesDraft, false);
    assert.match(String(hit.pairingFigureRaw), /1\.2/);
    assert.match(String(hit.otherFigureRaw), /1\.25/);
  });

  test("T3 detection does not fire when the two sources agree", () => {
    const finding = conflictEntry("p4", P2_AGREE);
    const draftYear = { raw: "2019", value: 2019, kind: "date", year: 2019 };
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId: 0,
      statement: P2_AGREE.statement,
      pair: { from: draftYear, to: draftYear },
      excerpt: P2_AGREE.primaryExcerpt,
    });
    assert.equal(hit, null);
  });

  test("T4 detection does not fire when only one source speaks", () => {
    const finding = conflictEntry("p5", P5_ONE_SOURCE);
    const from = { raw: "EUR 48 million", value: 48, kind: "money", scale: "million", currency: "EUR" };
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId: 1,
      statement: P5_ONE_SOURCE.statement,
      pair: { from, to: from },
      excerpt: P5_ONE_SOURCE.primaryExcerpt,
    });
    assert.equal(hit, null);
  });

  test("T5 detection does not fire when same-quantity identity cannot be established", () => {
    const finding = conflictEntry("noid", NO_IDENTITY);
    const pair = pairFrom(finding);
    const hit = detectSourceDisagreement({
      finding,
      pairingSourceId: 1,
      statement: NO_IDENTITY.statement,
      pair: pair || {
        from: { raw: "11.2 percent", value: 11.2, kind: "percentage" },
        to: { raw: "12.4%", value: 12.4, kind: "percentage" },
      },
      excerpt: NO_IDENTITY.primaryExcerpt,
    });
    assert.equal(hit, null);
  });
});

describe("B173 rulings", () => {
  test("T6 no ruling: unaddressed, sources_disagree, copy names both figures and labels", async () => {
    const result = await fillAction(conflictEntry("p1", P1), { callModel: throwingModel() });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, "sources_disagree");
    assert.match(result.explanation, /11\.2/);
    assert.match(result.explanation, /12\.4/);
    assert.match(result.explanation, /24a_synth_peer_factsheet\.txt/);
    assert.match(result.explanation, /24b_synth_peer_performance_report\.txt/);
    assert.equal(result.resultingSentence, undefined);
  });

  test("T7 ruling governs pairing source: proposal identical to today", async () => {
    const finding = conflictEntry("p1", P1);
    const today = applyConflictProposal(
      {
        ...finding,
        card: {
          ...P1.card,
          supportSpans: P1.card.supportSpans.filter((span) => span.sourceRefId === 1),
        },
      }
    );
    const withRuling = applyConflictProposal(finding, null, {
      sourceRulings: [{ a: 0, b: 1, governs: 1 }],
    });
    assert.equal(today.status, "replace");
    assert.equal(withRuling.status, "replace");
    assert.equal(withRuling.proposal.resultingSentence, today.proposal.resultingSentence);
    const result = await fillAction(finding, {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: 1 }],
    });
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.resultingSentence, today.proposal.resultingSentence);
  });

  test("T8 ruling governs the other source and it matches the draft: sources_agreed_kept", async () => {
    const result = await fillAction(conflictEntry("p1", P1), {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: 0 }],
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, "sources_agreed_kept");
    assert.equal(result.resultingSentence, undefined);
    assert.match(result.explanation, /24a_synth_peer_factsheet\.txt/);
    assert.match(result.explanation, /11\.2/);
    assert.match(result.explanation, /12\.4/);
  });

  test("T9 ruling governs the other source and it differs: proposal carries that source figure", async () => {
    const result = await fillAction(conflictEntry("p3", P3), {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: 1 }],
    });
    assert.equal(result.disposition, "ACTION");
    assert.match(result.resultingSentence, /1\.25/);
    assert.equal(result.resultingSentence.includes("1.3"), false);
  });

  test("T10 ruling null: sources_disagree_neither, no proposal", async () => {
    const result = await fillAction(conflictEntry("p1", P1), {
      callModel: throwingModel(),
      sourceRulings: [{ a: 0, b: 1, governs: null }],
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, "sources_disagree_neither");
    assert.equal(result.resultingSentence, undefined);
    assert.match(result.explanation, /neither supersedes/);
    assert.match(result.explanation, /11\.2/);
    assert.match(result.explanation, /12\.4/);
  });

  test("T11 the R1 same-source veto still wins when both apply", async () => {
    const fixture = {
      statement: "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.",
      primaryExcerpt:
        "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
      card: {
        stage2SourceFingerprints: F24_FPS,
        supportSpans: [
          {
            sourceRefId: 0,
            classification: "confirmed",
            passage:
              "CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.",
          },
          {
            sourceRefId: 0,
            classification: "conflicting",
            passage:
              "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
          },
          {
            sourceRefId: 1,
            classification: "confirmed",
            passage: "Headcount at quarter end was 298 people.",
          },
        ],
      },
    };
    const result = await fillAction(conflictEntry("r1", fixture), { callModel: throwingModel() });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, "self_disagreement");
    assert.match(result.explanation, /same source/);
  });

  test("T12 a malformed sourceRulings entry is ignored and does not throw", async () => {
    const result = await fillAction(conflictEntry("p1", P1), {
      callModel: throwingModel(),
      sourceRulings: [{ a: "x" }, null, 12, { a: 1, b: 0, governs: 1 }, { a: 0 }],
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, "sources_disagree");
  });
});
