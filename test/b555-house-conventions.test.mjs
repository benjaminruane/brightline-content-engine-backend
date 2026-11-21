/**
 * B555. Product owner rulings and house-style forms the matcher accepts.
 * Decisions 3, 4, and 5.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyGuideAutoFix, dealWordHits } from "../lib/style-guide/auto-fix.mjs";
import { renderReviewStyleRules, resolveStyleChoices } from "../lib/style-guide/render.mjs";
import { elementFound, extractElements } from "../lib/qc/b394-elements.mjs";

const HOUSE = resolveStyleChoices(null);

function fixed(text, choices = HOUSE) {
  return applyGuideAutoFix(text, { outputType: "reporting_commentary", authoringOrganisation: "Halden Group", styleChoices: choices }).text;
}

function found(draft, source) {
  return extractElements(draft, draft, [source]).filter((element) => element.kind !== "benchmark").every((element) => elementFound(element, source));
}

describe("B555 house conventions", () => {
  test("counts, dates, titles, and press voice follow the rulings", () => {
    assert.equal(fixed("The firm backed 3 funds over nine months."), "The firm backed three funds over nine months.");
    assert.equal(fixed("The plant is 5 kilometers from the port and produces 6 MW."), "The plant is 5 kilometers from the port and produces 6 MW.");
    assert.equal(fixed("Returns were 2.5x."), "Returns were 2.5x.");
    assert.equal(fixed("The range is 2-3 funds and a 7-9 month payback."), "The range is 2-3 funds and a 7-9 month payback.");
    assert.equal(fixed("That is 8 of 15 funds."), "That is 8 of 15 funds.");
    assert.equal(fixed("Fund 2 closed on September 30, 2026."), "Fund 2 closed on 30 September 2026.");
    const press = renderReviewStyleRules(HOUSE, { outputType: "press_release" }).find((rule) => rule.id === "first_person_plural");
    assert.match(press.description, /quoted speech/);
    const titles = renderReviewStyleRules(HOUSE, { all: true }).find((rule) => rule.id === "job_titles");
    assert.match(titles.description, /lower case when it is generic/);
    assert.equal(fixed("'We are pleased,' said the partner. We committed.").includes("'We are pleased,'"), true);
    assert.equal(fixed("'We are pleased,' said the partner. We committed.").includes("Halden Group committed"), true);
  });

  test("the account conventions are applied, and the opposite choice is left", () => {
    assert.equal(fixed("Fjordline Software AS raised a fund."), "Fjordline Software raised a fund.");
    assert.equal(fixed("Fjordline Software AS raised a fund.", { ...HOUSE, legalIdentifiers: "keep" }).includes("AS"), true);
    assert.equal(fixed("Revenue rose year-over-year and year over year growth followed."), "Revenue rose year on year and year-on-year growth followed.");
    assert.equal(fixed("The U.S. fund and the U.K. manager."), "The US fund and the UK manager.");
    assert.equal(fixed("GBP 5,049 million was invested."), "GBP 5.0 billion was invested.");
    assert.equal(fixed("GBP 5.0 billion was invested.", { ...HOUSE, magnitude: "millions" }).includes("million"), true);
    assert.equal(fixed('The partner said "growth remains on track".'), "The partner said 'growth remains on track'.");
    assert.equal(fixed("The partner said 'growth remains on track'.", { ...HOUSE, quotes: "double" }), 'The partner said "growth remains on track".');
    assert.equal(fixed("The general partner called capital."), "The manager called capital.");
    assert.equal(fixed("Results arrived in Q3 2026, the first half was H1 2026, and FY2025 is closed."), "Results arrived in the third quarter of 2026, the first half was the first half of 2026, and financial year 2025 is closed.");
    assert.equal(fixed("The holding ran from 2016 to 2019 and also 2010 to 2012."), "The holding ran from 2016 to 2019 and also 2010-2012.");
    assert.equal(fixed("The paper used listed comparables."), "The paper used public market comparables.");
    assert.equal(dealWordHits("The deal closed.").length, 1);
    const dates = renderReviewStyleRules({ ...HOUSE, dates: "month_day" }, { all: true }).find((rule) => rule.id === "date_format");
    assert.match(dates.description, /September 30, 2026/);
  });

  test("house-style forms match the source", () => {
    assert.equal(found("GBP 5.0 billion", "GBP 5,049 million"), true);
    assert.equal(found("third quarter of 2026", "Q3 2026"), true);
    assert.equal(found("Fjordline Software", "Fjordline Software AS"), true);
    assert.equal(found("7-9 month", "seven to nine months"), true);
    assert.equal(found("three funds", "3 funds"), true);
  });
});
