import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  applyPeriodGateBackstop,
  applyRoundingToleranceBackstop,
  classifyNumericRelationship,
  hasEgregiousMagnitudeGap,
  inferPeriodRole,
  isProceduralCloserStatement,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("B48 rounding and magnitude backstop", () => {
  test("rounding 18.6 → approximately 19 is within_rounding and lifts conflicting to confirmed", () => {
    const statement =
      "Revenue grew to GBP 312 million for the year, a compound annual growth rate of approximately 19 percent.";
    const passage =
      "Revenue has grown from GBP 187 million to GBP 312 million representing a compound annual growth rate of 18.6 percent.";
    assert.equal(classifyNumericRelationship(statement, passage), "within_rounding");
    const out = applyRoundingToleranceBackstop(
      { classification: "conflicting", passage, explanation: "CAGR differs." },
      { statementText: statement }
    );
    assert.equal(out.classification, "confirmed");
  });

  test("identical figures with a modal conflict stay conflicting (not lifted)", () => {
    const statement = "We have invested EUR 158 million for a 60% controlling stake.";
    const passage = "We recommend an investment of EUR 158 million for a 60% controlling stake.";
    assert.equal(classifyNumericRelationship(statement, passage), "identical");
    const out = applyRoundingToleranceBackstop(
      { classification: "conflicting", passage, explanation: "Recommended, not completed." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("precise proceeds gap 18.4bn vs 12.8bn stays mutually exclusive / conflicting", () => {
    const statement = "The exit closed at SEK 18.4 billion and generated a 3.56x gross MOIC.";
    const passage = "The exit generated gross proceeds of SEK 12.8 billion to Fund IV.";
    assert.equal(classifyNumericRelationship(statement, passage), "mutually_exclusive");
    const out = applyRoundingToleranceBackstop(
      { classification: "partially_confirmed", passage, explanation: "Proceeds differ." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("magnitude 40 vs 18 on the same reversion metric forces conflicting", () => {
    const statement =
      "Our plan rests on capturing the embedded reversion as approximately 40 percent of leases roll.";
    const passage = "Embedded reversion is estimated at approximately 18 percent as leases roll.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
    const out = applyRoundingToleranceBackstop(
      { classification: "partially_confirmed", passage, explanation: "Lease roll mentioned." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("apostrophe thousands separators do not look like an egregious money gap", () => {
    const statement =
      "Monthly recurring revenue has grown from USD 164'000 to USD 438'000 over the same period.";
    const passage =
      "Monthly recurring revenue has grown from USD 164,000 to USD 438,000 over the same period.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
  });

  test("near numbers 20 vs 18.6 are not an egregious forced conflict", () => {
    const statement = "Revenue grew at approximately 20 percent.";
    const passage = "Revenue grew at 18.6 percent.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
  });
});

describe("B48 period-frame gate", () => {
  test("same-metric period clash on confirmed is forced conflicting", () => {
    const out = applyPeriodGateBackstop(
      {
        classification: "confirmed",
        passage: "Revenue for FY2025 was GBP 312 million.",
        explanation: "Revenue matches.",
        periodAssessment: {
          statementPeriod: "FY2024",
          sourcePeriod: "FY2025",
          statementPeriodRole: "figure_period",
          sourcePeriodRole: "figure_period",
        },
      },
      { statementText: "Revenue for FY2024 was GBP 312 million." }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("vintage vs operating year does not force conflicting; remaps conflicting to partial", () => {
    const statement =
      "Drift Logistics, our 2024 third-party logistics investment, faces a softer parcel volume environment.";
    const passage = "Drift Logistics had a mixed 2025. European parcel volumes down approximately 3%.";
    assert.equal(inferPeriodRole(statement, "2024"), "entity_vintage");
    assert.equal(inferPeriodRole(passage, "2025"), "figure_period");
    const out = applyPeriodGateBackstop(
      {
        classification: "conflicting",
        passage,
        explanation: "2024 vs 2025.",
        periodAssessment: {
          statementPeriod: "2024",
          sourcePeriod: "2025",
        },
      },
      { statementText: statement }
    );
    assert.equal(out.classification, "partially_confirmed");
  });
});

describe("B48 procedural closer", () => {
  test("We recommend approval is a procedural closer and becomes no_support", () => {
    assert.equal(isProceduralCloserStatement("We recommend approval."), true);
    const out = applyRoundingToleranceBackstop(
      {
        classification: "conflicting",
        passage: "We seek IC approval for the investment.",
        explanation: "Recommendation vs approval.",
      },
      { statementText: "We recommend approval." }
    );
    assert.equal(out.classification, "no_support");
  });
});

describe("B48 prompt anchors", () => {
  test("stage2_v4.md contains modality, magnitude, framing, CDS, and procedural examples", async () => {
    const prompt = await readFile(
      path.join(__dirname, "../lib/qc/pipeline-v4/prompts/stage2_v4.md"),
      "utf8"
    );
    assert.match(prompt, /Status \/ modality — definite completed action → conflicting/);
    assert.match(prompt, /Cover \/ opener sentence — not a modality conflict/);
    assert.match(prompt, /Checkable fact matches → confirmed/);
    assert.match(prompt, /We have invested EUR 720 million/);
    assert.match(prompt, /a new investment in Helvetia Precision Components/);
    assert.match(prompt, /We have committed USD 10 million/);
    assert.match(prompt, /Do not fire modality-conflict on "committed"/);
    assert.match(prompt, /Magnitude beyond rounding → conflicting/);
    assert.match(prompt, /Extra framing, same claim → confirmed/);
    assert.match(prompt, /Related but narrower product → partially_confirmed/);
    assert.match(prompt, /digital health products/);
    assert.match(prompt, /CDS software/);
    assert.match(prompt, /Procedural closer → no_support/);
    assert.match(prompt, /Ownership \/ context swap → conflicting/);
    assert.match(prompt, /We have invested EUR 720 million/);
  });
});
