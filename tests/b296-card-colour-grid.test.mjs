/**
 * B296. Card colour from classifyCard. Every requested / off / miss / clean / concern combo.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { classifyCard } from "../lib/qc/review-summary.mjs";

const EVIDENCE = [
  { id: "off", enabled: false, displayVerdict: "Not reviewed", cls: null },
  { id: "miss", enabled: true, displayVerdict: "Not reviewed", cls: "notChecked" },
  { id: "clean", enabled: true, displayVerdict: "supported_full", cls: "confirmed" },
  { id: "concern", enabled: true, displayVerdict: "supported_partial", cls: "partial" },
  { id: "hard", enabled: true, displayVerdict: "not_supported", cls: "notSupported" },
  { id: "conflict", enabled: true, displayVerdict: "conflict", cls: "conflicting" },
];

const SIGNAL = [
  { id: "off", enabled: false, verdict: "not_reviewed", cls: null },
  { id: "miss", enabled: true, verdict: "not_reviewed", cls: "notChecked" },
  { id: "clean", enabled: true, verdict: "clean", cls: "clean" },
  { id: "concern", enabled: true, verdict: "concern", cls: "concern" },
  { id: "hard", enabled: true, verdict: "hard_concern", cls: "hardConcern" },
];

function expectedTone(evidenceCls, editorialCls, complianceCls) {
  const requested = [evidenceCls, editorialCls, complianceCls].filter((s) => s != null);
  if (requested.length === 0) return "neutral";
  const red = new Set(["notSupported", "conflicting", "hardConcern"]);
  const amber = new Set(["partial", "concern", "notChecked"]);
  const green = new Set(["confirmed", "clean"]);
  if (requested.some((s) => red.has(s))) return "red";
  if (requested.some((s) => amber.has(s))) return "amber";
  if (requested.every((s) => green.has(s))) return "green";
  return "neutral";
}

const GRID = [];
for (const evidence of EVIDENCE) {
  for (const editorial of SIGNAL) {
    for (const compliance of SIGNAL) {
      GRID.push({ evidence, editorial, compliance });
    }
  }
}

describe("B296 card colour grid", () => {
  test("enumerates every combination of the three checks", () => {
    assert.equal(GRID.length, EVIDENCE.length * SIGNAL.length * SIGNAL.length);
  });

  for (const cell of GRID) {
    const name = `evidence=${cell.evidence.id} editorial=${cell.editorial.id} compliance=${cell.compliance.id}`;
    test(name, () => {
      const opts = {
        evidenceEnabled: cell.evidence.enabled,
        editorialEnabled: cell.editorial.enabled,
        complianceEnabled: cell.compliance.enabled,
      };
      const card = {
        displayVerdict: cell.evidence.displayVerdict,
        editorialVerdict: cell.editorial.verdict,
        complianceVerdict: cell.compliance.verdict,
      };
      const cls = classifyCard(card, opts);
      assert.equal(cls.evidence, cell.evidence.cls, "evidence class");
      assert.equal(cls.editorial, cell.editorial.cls, "editorial class");
      assert.equal(cls.compliance, cell.compliance.cls, "compliance class");
      const expected = expectedTone(cell.evidence.cls, cell.editorial.cls, cell.compliance.cls);
      assert.equal(cls.cardTone, expected);
      if (cls.editorial === null || cls.compliance === null || cls.evidence === null) {
        assert.notEqual(cls.cardTone === "green" && cls.evidence === "notChecked", true);
      }
      if (cell.evidence.id === "miss" || cell.editorial.id === "miss" || cell.compliance.id === "miss") {
        assert.notEqual(cls.cardTone, "green");
      }
      if (cell.evidence.id === "clean" && cell.editorial.id === "off" && cell.compliance.id === "off") {
        assert.equal(cls.cardTone, "green");
      }
    });
  }
});
