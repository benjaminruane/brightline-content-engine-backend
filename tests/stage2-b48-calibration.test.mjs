import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { splitDraftIntoCandidatesV2 } from "../lib/extract-statements.mjs";
import {
  applyPeriodGateBackstop,
  applyRoundingToleranceBackstop,
  classifyNumericRelationship,
  collectBackstopFigures,
  hasEgregiousMagnitudeGap,
  inferPeriodRole,
  isProceduralCloserStatement,
  periodsDoNotOverlap,
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

  test("extracts two-word British 'per cent' as percent figures", () => {
    const figs = collectBackstopFigures(
      "Utilisation is 88 per cent and net IRR stands at 14 per cent."
    );
    const percents = figs.filter((f) => f.kind === "percent").map((f) => f.value);
    assert.deepEqual(percents, [88, 14]);
  });

  test("magnitude 40 per cent vs 18 per cent forces conflicting", () => {
    const statement = "Embedded reversion is approximately 40 per cent as leases roll.";
    const passage = "Embedded reversion is estimated at approximately 18 per cent as leases roll.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
    const out = applyRoundingToleranceBackstop(
      { classification: "partially_confirmed", passage, explanation: "Lease roll mentioned." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("does not force conflict when percent figures have no overlapping metric keys", () => {
    const statement = "The EBITDA margin is approximately 19 per cent.";
    const passage = "Contracted revenue represents approximately 70 per cent of total revenue.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
    const out = applyRoundingToleranceBackstop(
      { classification: "partially_confirmed", passage, explanation: "Partial." },
      { statementText: statement }
    );
    assert.equal(out.classification, "partially_confirmed");
  });
});

describe("period overlap", () => {
  test("FY2019 vs FY2025 do not overlap", () => {
    assert.equal(
      periodsDoNotOverlap({ statementPeriod: "FY2025", sourcePeriod: "FY2019" }),
      true
    );
  });

  test("Q1 vs Q2 in the same year do not overlap", () => {
    assert.equal(
      periodsDoNotOverlap({ statementPeriod: "Q1 2025", sourcePeriod: "Q2 2025" }),
      true
    );
  });

  test("Q1 2025 overlaps the year 2025", () => {
    assert.equal(
      periodsDoNotOverlap({ statementPeriod: "Q1 2025", sourcePeriod: "FY2025" }),
      false
    );
  });

  test("unparseable periods fail closed (treat as overlapping)", () => {
    assert.equal(
      periodsDoNotOverlap({ statementPeriod: "January 2026", sourcePeriod: "FY2019" }),
      false
    );
    assert.equal(periodsDoNotOverlap(null), false);
  });

  test("magnitude backstop does not force when periods do not overlap", () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const passage = "Revenue for FY2019 was EUR 100 million, up from EUR 82 million the prior year.";
    const periodAssessment = {
      statementPeriod: "FY2025",
      sourcePeriod: "FY2019",
      statementPeriodRole: "figure_period",
      sourcePeriodRole: "figure_period",
    };
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
    assert.equal(hasEgregiousMagnitudeGap(statement, passage, { periodAssessment }), false);
    const out = applyRoundingToleranceBackstop(
      {
        classification: "no_support",
        passage,
        explanation: "Different years.",
        periodAssessment,
      },
      { statementText: statement }
    );
    assert.equal(out.classification, "no_support");
    assert.match(out.explanation, /FY2019/);
    assert.match(out.explanation, /FY2025/);
  });
});

describe("B48 period-frame gate", () => {
  test("non-overlapping same-metric periods rewrite confirmed to no_support", () => {
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
    assert.equal(out.classification, "no_support");
    assert.match(out.explanation, /FY2025/);
    assert.match(out.explanation, /FY2024/);
  });

  test("non-overlapping periods rewrite model conflicting to no_support", () => {
    const out = applyPeriodGateBackstop(
      {
        classification: "conflicting",
        passage: "Revenue for FY2019 was EUR 100 million.",
        explanation: "200 vs 100.",
        periodAssessment: {
          statementPeriod: "FY2025",
          sourcePeriod: "FY2019",
          statementPeriodRole: "figure_period",
          sourcePeriodRole: "figure_period",
        },
      },
      { statementText: "Revenue for FY2025 was EUR 200 million." }
    );
    assert.equal(out.classification, "no_support");
  });

  test("overlapping quarter vs year still downgrades confirmed to conflicting", () => {
    const out = applyPeriodGateBackstop(
      {
        classification: "confirmed",
        passage: "Revenue for 2025 was GBP 312 million.",
        explanation: "Revenue matches.",
        periodAssessment: {
          statementPeriod: "Q1 2025",
          sourcePeriod: "FY2025",
          statementPeriodRole: "figure_period",
          sourcePeriodRole: "figure_period",
        },
      },
      { statementText: "Revenue for Q1 2025 was GBP 312 million." }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("vintage vs operating year with non-overlapping years becomes no_support", () => {
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
    assert.equal(out.classification, "no_support");
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

describe("B60 money metric ids (longest-first, fail-closed guard)", () => {
  function moneyMetric(text) {
    const f = collectBackstopFigures(text).find((x) => x.kind === "money");
    return f ? f.metric : undefined;
  }

  test("longest-first: annual recurring revenue resolves to arr, not revenue", () => {
    assert.equal(moneyMetric("Annual recurring revenue was EUR 95 million."), "arr");
  });

  test("collision: recurring revenue vs revenue are different ids", () => {
    assert.equal(moneyMetric("Recurring revenue was EUR 95 million."), "arr");
    assert.equal(moneyMetric("Revenue was EUR 155 million."), "revenue");
  });

  test("collision: ARR vs combined annual revenue are different ids", () => {
    assert.equal(moneyMetric("ARR reached EUR 95 million."), "arr");
    assert.equal(moneyMetric("Combined annual revenue stands at EUR 155 million."), "revenue");
  });

  test("collision: ARR vs combined revenue are different ids", () => {
    assert.equal(moneyMetric("ARR reached EUR 95 million."), "arr");
    assert.equal(moneyMetric("Combined revenue has surged to $155m."), "revenue");
  });

  test("collision: annual recurring revenue vs revenue are different ids", () => {
    assert.equal(moneyMetric("Annual recurring revenue reached EUR 95 million."), "arr");
    assert.equal(moneyMetric("Revenue reached EUR 155 million."), "revenue");
  });

  test("combined annual revenue and sales canonicalize to revenue", () => {
    assert.equal(moneyMetric("Combined annual revenue: EUR 155 million."), "revenue");
    assert.equal(moneyMetric("Combined revenue stands at EUR 155 million."), "revenue");
    assert.equal(moneyMetric("Sales were EUR 155 million."), "revenue");
  });

  test("collision under naive tokens: gross proceeds and proceeds share an id per the pinned list", () => {
    assert.equal(moneyMetric("Gross proceeds were SEK 12.8 billion."), "proceeds");
    assert.equal(moneyMetric("Proceeds were SEK 12.8 billion."), "proceeds");
  });

  test("collision: enterprise value vs equity are different ids", () => {
    assert.equal(moneyMetric("Enterprise value was EUR 400 million."), "enterprise_value");
    assert.equal(moneyMetric("Equity was EUR 180 million."), "equity");
  });

  test("word boundary: ebitda does not match ebit, and ebit is unrecognised", () => {
    assert.equal(moneyMetric("EBITDA was EUR 45 million."), "ebitda");
    assert.equal(moneyMetric("EBIT was EUR 45 million."), undefined);
  });

  test("aum / gmv / net debt canonicalize", () => {
    assert.equal(moneyMetric("Assets under management were USD 2 billion."), "aum");
    assert.equal(moneyMetric("AUM was USD 2 billion."), "aum");
    assert.equal(moneyMetric("Gross merchandise value was USD 80 million."), "gmv");
    assert.equal(moneyMetric("GMV was USD 80 million."), "gmv");
    assert.equal(moneyMetric("Net debt was EUR 20 million."), "debt");
    assert.equal(moneyMetric("Debt was EUR 20 million."), "debt");
  });

  test("metric phrase after the figure in the same sentence still resolves", () => {
    const after = "x".repeat(36);
    const text = `Booked EUR 95 million${after} arr trailing.`;
    assert.equal(moneyMetric(text), "arr");
  });

  test("ARR 95 vs combined annual revenue 155 does not force when the phrase is inside the sentence", () => {
    const statement = "ARR reached EUR 95 million.";
    const passage = "Combined annual revenue: EUR 155 million.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
    const out = applyRoundingToleranceBackstop(
      { classification: "no_support", passage, explanation: "Does not address ARR." },
      { statementText: statement }
    );
    assert.equal(out.classification, "no_support");
  });

  test("fail closed: unrecognised money metric still forces against revenue", () => {
    const statement = "The widget price was EUR 95 million.";
    const passage = "Combined annual revenue: EUR 155 million.";
    assert.equal(moneyMetric(statement), undefined);
    assert.equal(moneyMetric(passage), "revenue");
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
  });

  test("same-metric revenue 200 vs 100 still forces", () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const passage = "Revenue for FY2019 was EUR 100 million.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
  });

  test("18.4bn close vs 12.8bn gross proceeds still forces (fail closed on the close figure)", () => {
    const statement = "The exit closed at SEK 18.4 billion and generated a 3.56x gross MOIC.";
    const passage = "The exit generated gross proceeds of SEK 12.8 billion to Fund IV.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
  });

  test("count 720 vs 640 still forces; count carries no metric", () => {
    const statement = "The company employs 720 people.";
    const passage = "The underlying businesses employed 640 people in aggregate.";
    const figs = collectBackstopFigures(statement).filter((f) => f.kind === "count");
    assert.equal(figs[0]?.metric, undefined);
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
  });
});

describe("B70 money scale (plain m as million)", () => {
  function moneyValues(text) {
    return collectBackstopFigures(text)
      .filter((f) => f.kind === "money")
      .map((f) => f.value);
  }

  test("$155m parses as 155 million", () => {
    assert.deepEqual(moneyValues("combined revenue has surged to $155m"), [155e6]);
  });

  test("$155M parses as 155 million (case-insensitive)", () => {
    assert.deepEqual(moneyValues("combined revenue has surged to $155M"), [155e6]);
  });

  test("EUR 155m parses as 155 million", () => {
    assert.deepEqual(moneyValues("ARR reached EUR 155m."), [155e6]);
  });

  test("155m with no currency does not parse as money", () => {
    assert.deepEqual(moneyValues("headcount reached 155m this year."), []);
  });

  test("155 m with no currency does not parse as money", () => {
    assert.deepEqual(moneyValues("the reading was 155 m on the gauge."), []);
  });

  test("existing currency units still parse at the right scale", () => {
    assert.deepEqual(moneyValues("USD 2 million"), [2e6]);
    assert.deepEqual(moneyValues("EUR 3mm"), [3e6]);
    assert.deepEqual(moneyValues("GBP 4 billion"), [4e9]);
    assert.deepEqual(moneyValues("AUD 5bn"), [5e9]);
    assert.deepEqual(moneyValues("CAD 6 thousand"), [6e3]);
    assert.deepEqual(moneyValues("$7k"), [7e3]);
  });

  test("bare million/billion without currency still parse", () => {
    assert.deepEqual(moneyValues("closed at 18.4 billion"), [18.4e9]);
    assert.deepEqual(moneyValues("gross proceeds of 12.8 billion"), [12.8e9]);
    assert.deepEqual(moneyValues("ticket of 50 million"), [50e6]);
    assert.deepEqual(moneyValues("check of 2 mm against the tape"), [2e6]);
    assert.deepEqual(moneyValues("raise of 1.2 bn"), [1.2e9]);
  });

  test("$155m versus EUR 155 million is not an egregious money gap", () => {
    const statement =
      "Following our acquisition of Baltic ColdCo, combined revenue has surged to $155m, of which virtually all is locked in under long-term contracts.";
    const passage = "Combined annual revenue for the enlarged group stands at approximately EUR 155 million.";
    assert.deepEqual(moneyValues(statement), [155e6]);
    assert.deepEqual(moneyValues(passage), [155e6]);
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
  });
});

describe("B60.1 sentence-scoped money metric", () => {
  function moneyFigs(text) {
    return collectBackstopFigures(text).filter((f) => f.kind === "money");
  }

  test("combined annual revenue 71 characters before the figure resolves to revenue", () => {
    const statement = "ARR reached EUR 95 million.";
    const passage =
      "Combined annual revenue for the enlarged group stands at approximately EUR 155 million";
    const src = moneyFigs(passage)[0];
    assert.equal(src?.metric, "revenue");
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
    const out = applyRoundingToleranceBackstop(
      { classification: "no_support", passage, explanation: "Does not address ARR." },
      { statementText: statement }
    );
    assert.equal(out.classification, "no_support");
  });

  test("both ARR figures in one sentence resolve to arr, not revenue", () => {
    const statement =
      "Our base case envisages ARR growth from EUR 38 million to approximately EUR 95 million over a five-year hold.";
    const passage =
      "Annual recurring revenue at end of April was EUR 35 million, not EUR 38 million as stated in our initial memo.";
    const src35 = moneyFigs(passage).find((f) => f.value === 35e6);
    const src38 = moneyFigs(passage).find((f) => f.value === 38e6);
    assert.equal(src35?.metric, "arr");
    assert.equal(src38?.metric, "arr");
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
    const out = applyRoundingToleranceBackstop(
      { classification: "no_support", passage, explanation: "Does not address the base case." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });

  test("two-metric sentence assigns each figure the nearest phrase", () => {
    const text = "Revenue was EUR 200 million and EBITDA was EUR 45 million.";
    const figs = moneyFigs(text);
    assert.equal(figs.find((f) => f.value === 200e6)?.metric, "revenue");
    assert.equal(figs.find((f) => f.value === 45e6)?.metric, "ebitda");
  });

  test("EUR 1.3 million does not split at the decimal point", () => {
    const { candidates } = splitDraftIntoCandidatesV2("The ticket was EUR 1.3 million.");
    assert.equal(candidates.length, 1);
    assert.match(candidates[0], /EUR 1\.3 million/);
    assert.deepEqual(
      moneyFigs("The ticket was EUR 1.3 million.").map((f) => f.value),
      [1.3e6]
    );
  });

  test("no metric phrase in the sentence is unknown and the force is held", () => {
    const statement = "The widget price was EUR 95 million.";
    const passage = "The comparable ticket was EUR 155 million.";
    assert.equal(moneyFigs(statement)[0]?.metric, undefined);
    assert.equal(moneyFigs(passage)[0]?.metric, undefined);
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
    const out = applyRoundingToleranceBackstop(
      { classification: "no_support", passage, explanation: "No overlap." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
  });
});

describe("B72 percent canonical ids (sentence scope, prefix collisions)", () => {
  function percentMetric(text) {
    const f = collectBackstopFigures(text).find((x) => x.kind === "percent");
    return f ? f.metric : undefined;
  }

  function percentFigs(text) {
    return collectBackstopFigures(text).filter((f) => f.kind === "percent");
  }

  test("prefix: gross margin vs margin", () => {
    assert.equal(percentMetric("gross margin of 45 per cent"), "gross_margin");
    assert.equal(percentMetric("margin of 45 per cent"), "margin_unspecified");
  });

  test("prefix: ebitda margin vs margin", () => {
    assert.equal(percentMetric("EBITDA margin of 19 per cent"), "ebitda_margin");
    assert.equal(percentMetric("margin of 19 per cent"), "margin_unspecified");
  });

  test("prefix: operating margin vs margin", () => {
    assert.equal(percentMetric("operating margin of 22 per cent"), "operating_margin");
  });

  test("prefix: net margin vs margin", () => {
    assert.equal(percentMetric("net margin of 12 per cent"), "net_margin");
  });

  test("prefix: revenue growth vs growth", () => {
    assert.equal(percentMetric("revenue growth of 30 per cent"), "revenue_growth");
    assert.equal(percentMetric("growth of 30 per cent"), "growth_unspecified");
  });

  test("prefix: arr growth vs growth", () => {
    assert.equal(percentMetric("ARR growth of 40 per cent"), "arr_growth");
  });

  test("prefix: ebitda growth vs growth", () => {
    assert.equal(percentMetric("EBITDA growth of 15 per cent"), "ebitda_growth");
  });

  test("prefix: net irr vs irr (same canonical id)", () => {
    assert.equal(percentMetric("net IRR of 18 per cent"), "irr");
    assert.equal(percentMetric("IRR of 18 per cent"), "irr");
  });

  test("leases and lease share lease; stake and ownership share ownership", () => {
    assert.equal(percentMetric("leases roll at 40 per cent"), "lease");
    assert.equal(percentMetric("lease roll at 40 per cent"), "lease");
    assert.equal(percentMetric("ownership of 60 per cent"), "ownership");
    assert.equal(percentMetric("stake of 60 per cent"), "ownership");
  });

  test("remaining singleton phrases resolve", () => {
    assert.equal(percentMetric("CAGR of 19 per cent"), "cagr");
    assert.equal(percentMetric("MOIC of 3.5 per cent"), "moic");
    assert.equal(percentMetric("embedded reversion of 40 per cent"), "reversion");
    assert.equal(percentMetric("proceeds of 12 per cent"), "proceeds");
    assert.equal(percentMetric("headcount of 8 per cent"), "headcount");
    assert.equal(percentMetric("composite of 11 per cent"), "composite");
  });

  test("unspecified margin does not match a specific margin; force is suppressed", () => {
    const statement = "The margin of 45 per cent underpins the case.";
    const passage = "EBITDA margin of 19 per cent.";
    assert.equal(percentMetric(statement), "margin_unspecified");
    assert.equal(percentMetric(passage), "ebitda_margin");
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
  });

  test("b72 probe: gross margin 45 vs EBITDA margin 19 does not force", () => {
    const statement = "The company's gross margin of 45 per cent underpins the investment case.";
    const passage = "Reported EBITDA margin of 19 per cent. The business is otherwise in line with plan.";
    assert.equal(percentMetric(statement), "gross_margin");
    assert.equal(percentMetric(passage), "ebitda_margin");
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), false);
    const out = applyRoundingToleranceBackstop(
      { classification: "no_support", passage, explanation: "Different margin." },
      { statementText: statement }
    );
    assert.equal(out.classification, "no_support");
  });

  test("same unspecified margin 45 vs 19 still forces", () => {
    const statement = "The margin of 45 per cent underpins the case.";
    const passage = "The margin of 19 per cent is reported.";
    assert.equal(hasEgregiousMagnitudeGap(statement, passage), true);
  });

  test("two-metric percent sentence assigns each figure the nearest phrase", () => {
    const text = "Gross margin was 45 per cent and EBITDA margin was 19 per cent.";
    const figs = percentFigs(text);
    assert.equal(figs.find((f) => f.value === 45)?.metric, "gross_margin");
    assert.equal(figs.find((f) => f.value === 19)?.metric, "ebitda_margin");
  });

  test("model conflicting on a mismatched-margin pair is left standing", () => {
    const statement = "The company's gross margin of 45 per cent underpins the investment case.";
    const passage = "Reported EBITDA margin of 19 per cent.";
    const out = applyRoundingToleranceBackstop(
      { classification: "conflicting", passage, explanation: "Model found a contradiction." },
      { statementText: statement }
    );
    assert.equal(out.classification, "conflicting");
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
