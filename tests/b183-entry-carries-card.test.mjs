/**
 * B183: the proposal step must see card.supportSpans on the live path.
 * These tests go through buildSortedEntries and runActionList. Calling the
 * locator with a hand-built card is not coverage of the product.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { runActionList } from "../lib/revise-actions/run.mjs";
import { buildSortedEntries } from "../lib/revise-actions/sort.mjs";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

const F24_FPS = [
  { sourceIndex: 0, sourceLabel: "24a_synth_peer_factsheet.txt" },
  { sourceIndex: 1, sourceLabel: "24b_synth_peer_performance_report.txt" },
];

const PUBLIC_ENTRY_KEYS = new Set([
  "id",
  "disposition",
  "statementId",
  "statement",
  "kind",
  "rule",
  "thing1",
  "thing1State",
  "thing2",
  "sort",
  "explanation",
  "explainCode",
  "governancePair",
  "confirmingPassage",
  "confirmingPassageLabel",
  "noProposalReason",
  "proposedChange",
  "resultingSentence",
  "why",
  "verification",
]);

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

const CROSS_SOURCE = statementRow(1, "Net IRR since inception stood at 11.2 percent as at 31 March 2025.", {
  primaryExcerpt: "Net IRR since inception was 12.4%.",
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
});

const SELF_DISAGREEMENT = statementRow(
  7,
  "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.",
  {
    primaryExcerpt:
      "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
    supportSpans: [
      {
        sourceRefId: 0,
        classification: "confirmed",
        statementId: "7",
        passage:
          "CloudPivot employs 320 people across offices in London (headquarters), Hamburg, Lisbon, and Bangalore.",
        start: 1662,
        end: 1764,
      },
      {
        sourceRefId: 0,
        classification: "conflicting",
        statementId: "7",
        passage:
          "The total team of 285 people is split approximately as follows: engineering 110, customer success and implementation 75, sales 55, customer support 35, and general & administrative 10.",
        start: 6559,
        end: 6743,
      },
    ],
    sourceMatches: [{ classification: "confirmed", sourceIndex: 0 }],
  }
);

const CONFIRMING_STATEMENT =
  "The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.";
const CONFLICTING =
  "The Company currently serves 412 property management companies, not 380 as stated in our initial memo.";
const CONFIRMING = "The platform collectively manages more than 240'000 residential units across the Nordics.";

const CONFIRMING_PASSAGE = statementRow(3, CONFIRMING_STATEMENT, {
  primaryExcerpt: { passage: CONFLICTING, sourceRefId: 1, sourceLabel: "18b_synth_cross_source_pair_update.txt" },
  supportSpans: [
    {
      sourceRefId: 1,
      classification: "conflicting",
      passage: CONFLICTING,
    },
    {
      sourceRefId: 1,
      classification: "confirmed",
      passage: CONFIRMING,
    },
  ],
});

describe("B183 entry carries card on the live path", () => {
  test("T1 every buildSortedEntries row still has card.supportSpans", () => {
    const sorted = buildSortedEntries([CROSS_SOURCE]);
    assert.ok(sorted.length > 0);
    for (const entry of sorted) {
      assert.equal(entry.card, CROSS_SOURCE.qcCard, entry.id);
      assert.ok(Array.isArray(entry.card.supportSpans), entry.id);
      assert.equal(entry.card.supportSpans.length, 2, entry.id);
    }
  });

  test("T2 cross-source disagreement asks and does not propose", async () => {
    let called = false;
    const result = await runActionList([CROSS_SOURCE], {
      callModel: async () => {
        called = true;
        throw new Error("rewrite model must not be called on contradicted evidence");
      },
    });
    assert.equal(called, false);
    const entry = result.entries.find((row) => row.kind === "evidence");
    assert.ok(entry);
    assert.equal(entry.disposition, "ACKNOWLEDGE");
    assert.equal(entry.explainCode, "sources_disagree");
    assert.equal(entry.proposedChange, undefined);
    assert.equal(entry.resultingSentence, undefined);
  });

  test("T3 self-disagreement declines and does not propose", async () => {
    let called = false;
    const result = await runActionList([SELF_DISAGREEMENT], {
      callModel: async () => {
        called = true;
        throw new Error("rewrite model must not be called on contradicted evidence");
      },
    });
    assert.equal(called, false);
    const entry = result.entries.find((row) => row.kind === "evidence");
    assert.ok(entry);
    assert.equal(entry.disposition, "ACKNOWLEDGE");
    assert.equal(entry.explainCode, "self_disagreement");
    assert.equal(entry.proposedChange, undefined);
    assert.equal(entry.resultingSentence, undefined);
  });

  test("T4 confirming passage reaches the public entry", async () => {
    let called = false;
    const result = await runActionList([CONFIRMING_PASSAGE], {
      callModel: async () => {
        called = true;
        throw new Error("rewrite model must not be called on contradicted evidence");
      },
    });
    assert.equal(called, false);
    const entry = result.entries.find((row) => row.kind === "evidence");
    assert.ok(entry);
    assert.equal(entry.disposition, "ACTION");
    assert.equal(entry.confirmingPassage, CONFIRMING);
    assert.equal(entry.confirmingPassageLabel, "Confirmed excerpt");
  });

  test("T5 public entries expose only publicEntry keys", async () => {
    let called = false;
    const result = await runActionList([CROSS_SOURCE, SELF_DISAGREEMENT, CONFIRMING_PASSAGE], {
      callModel: async () => {
        called = true;
        throw new Error("rewrite model must not be called on contradicted evidence");
      },
    });
    assert.equal(called, false);
    assert.ok(result.entries.length > 0);
    for (const entry of result.entries) {
      const keys = Object.keys(entry);
      assert.deepEqual(
        keys.filter((key) => !PUBLIC_ENTRY_KEYS.has(key)),
        [],
        `${entry.id} leaked ${keys.filter((key) => !PUBLIC_ENTRY_KEYS.has(key)).join(", ")}`
      );
      assert.equal("card" in entry, false, entry.id);
      assert.equal("supportSpans" in entry, false, entry.id);
      assert.equal("primaryExcerpt" in entry, false, entry.id);
      assert.equal("suggestedDirection" in entry, false, entry.id);
    }
  });

  test("T6 callModel stub is never invoked", async () => {
    const result = await runActionList([CROSS_SOURCE, SELF_DISAGREEMENT, CONFIRMING_PASSAGE], {
      callModel: throwingModel(),
    });
    assert.equal(result.ok, true);
    assert.equal(result.entries.length, 3);
  });
});
