import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { computeCardMateriality, scoreFinding } from "../lib/qc/materiality.mjs";

describe("B13 materiality refinements", () => {
  test("craft findings stay minor even when the sentence has named-entity features", () => {
    const statement = "The team, led by founder-CEO Mr. Lütke, has demonstrated strong product instincts.";
    const scored = scoreFinding({
      statement,
      findingKind: "editorial",
      concernCode: "voice_consistency",
      concernCategory: "editorial",
    });
    assert.equal(scored.level, "minor");
    assert.equal(scored.findingType, "editorial_craft");
  });

  test("procedural closer evidence finding is minor not material", () => {
    const scored = scoreFinding({
      statement: "We recommend approval.",
      findingKind: "evidence_no_support",
    });
    assert.equal(scored.level, "minor");
    assert.ok(scored.reasons.includes("procedural_closer"));
  });

  test("compliance promotional/regulatory is material; editorial marketing is minor", () => {
    const stmt = "The business is genuinely exceptional and best-in-class.";
    const compliance = scoreFinding({
      statement: stmt,
      findingKind: "compliance",
      concernCode: "regulatory_prohibited_language",
    });
    const marketing = scoreFinding({
      statement: stmt,
      findingKind: "editorial",
      concernCode: "marketing_language_excess",
      concernCategory: "editorial",
    });
    assert.equal(compliance.level, "material");
    assert.equal(marketing.level, "minor");
  });

  test("card rollup: voice on a named sentence does not become material", () => {
    const card = computeCardMateriality({
      statement: "Alejandro Lafarga, currently CEO, will join the board.",
      evidenceVerdict: "confirmed",
      editorialConcerns: [{ concernCode: "voice_consistency", category: "editorial" }],
      complianceConcerns: [],
    });
    assert.equal(card.level, "minor");
    assert.ok(card.features.includes("named_person_entity_attribution"));
  });

  test("card rollup: We recommend approval with no_support is minor", () => {
    const card = computeCardMateriality({
      statement: "We recommend approval.",
      evidenceVerdict: "not_supported",
      editorialConcerns: [],
      complianceConcerns: [],
    });
    assert.equal(card.level, "minor");
  });

  test("style stays mechanical; compliance on same sentence is material", () => {
    const statement = "We continue to expect base case returns of 2.4x MOIC and 19 percent IRR.";
    const style = computeCardMateriality({
      statement,
      evidenceVerdict: "confirmed",
      editorialConcerns: [{ concernCode: "percentage_notation", category: "style_guide" }],
      complianceConcerns: [],
    });
    const both = computeCardMateriality({
      statement,
      evidenceVerdict: "confirmed",
      editorialConcerns: [{ concernCode: "percentage_notation", category: "style_guide" }],
      complianceConcerns: [{ concernCode: "return_figure_gross_net_qualifier_missing" }],
    });
    assert.equal(style.level, "mechanical");
    assert.equal(both.level, "material");
  });

  test("source_recency is material (time-sensitive claim presented as current)", () => {
    const scored = scoreFinding({
      statement: "The company has 24 employees.",
      findingKind: "source_recency",
      concernCode: "source_recency",
      concernCategory: "source_recency",
    });
    assert.equal(scored.level, "material");
    assert.equal(scored.findingType, "source_recency");
    const card = computeCardMateriality({
      statement: "The company has 24 employees.",
      evidenceVerdict: "confirmed",
      editorialConcerns: [],
      complianceConcerns: [],
      sourceRecencyConcerns: [
        { concernCode: "source_recency", category: "source_recency", note: "stale" },
      ],
    });
    assert.equal(card.level, "material");
  });
});
