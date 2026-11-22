/**
 * B568. A period-placement note names the period and the thing it describes.
 * No stock example. No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { scanPeriodForm, scanPeriodPlacement } from "../lib/style-guide/period-placement.mjs";
import { renderDraftStyleSection } from "../lib/style-guide/render.mjs";

const SENTENCE = "FY2025 gross margin for batteries rose to 25%.";

test("the placement note names both parts and shows the sentence in spelled form", () => {
  const [hit] = scanPeriodPlacement({ statement: SENTENCE });
  assert.equal(hit.concernCode, "period_placement");
  assert.match(hit.note, /FY2025 describes gross margin for batteries/);
  assert.match(hit.note, /Gross margin for batteries rose to 25% in financial year 2025\./);
  assert.equal(hit.note.includes("revenue for the first quarter of 2026"), false);
  assert.equal(hit.note.includes("FY2025 gross"), false);
});

test("an abbreviated account shows the short form in the same sentence", () => {
  const [hit] = scanPeriodPlacement({ statement: SENTENCE, periods: "abbreviated" });
  assert.match(hit.note, /Gross margin for batteries rose to 25% in FY2025\./);
  assert.equal(hit.note.includes("financial year 2025"), false);
});

test("a sentence that cannot be rebuilt names both parts and gives no stock example", () => {
  const [hit] = scanPeriodPlacement({ statement: "See the FY2025 gross margin in the appendix." });
  assert.match(hit.note, /FY2025 describes/);
  assert.match(hit.note, /Write the period after that noun/);
  assert.equal(hit.note.includes("revenue for the first quarter"), false);
  assert.equal(hit.note.includes("Write it as '"), false);
});

test("a spelled account flags a short form that is not sitting before a noun", () => {
  const [hit] = scanPeriodForm({ statement: "Results arrived in FY2025." });
  assert.equal(hit.concernCode, "period_form");
  assert.match(hit.note, /Write FY2025 as financial year 2025/);
});

test("an abbreviated account flags a mix of forms in one draft", () => {
  const [hit] = scanPeriodForm({
    statement: "Revenue rose in financial year 2025.",
    draftText: "FY2025 gross margin rose. Revenue rose in financial year 2025.",
    periods: "abbreviated",
  });
  assert.match(hit.note, /financial year 2025/);
  assert.match(hit.note, /FY2025/);
  assert.match(hit.note, /Use one form/);
});

test("the draft instruction tells a spelled account not to write FY", () => {
  const section = renderDraftStyleSection({});
  assert.match(section, /Do not write Q3, H1, or FY/);
  assert.equal(section.includes("leave the text unchanged"), false);
});
