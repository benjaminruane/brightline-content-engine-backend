/**
 * B559. The tidy removes a heading on the first line.
 * A press release, a supplied title, and a letter greeting stay.
 * Decision 2.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";

const HEADING = "HarbourVest Private Investments Fund (HPIF)\n\nIn the first quarter of 2026, the fund's software holdings fell.";

test("a heading on the first line is removed, and the exceptions stay", () => {
  const removed = applyGuideAutoFix(HEADING, { outputType: "reporting_commentary" });
  assert.equal(removed.text.startsWith("In the first quarter of 2026"), true);
  assert.equal(removed.text.includes("HarbourVest Private Investments Fund (HPIF)"), false);
  assert.equal(removed.fired.includes("title_line"), true);

  const press = applyGuideAutoFix("FOR IMMEDIATE RELEASE\n\n3i Group Reports the year\n\n3i Group today announced results.", {
    outputType: "press_release",
  }).text;
  assert.match(press, /^FOR IMMEDIATE RELEASE/);
  assert.match(press, /3i Group Reports the year/);

  const greeting = applyGuideAutoFix("Dear Investors,\n\nIn October 2026, the fund called capital.", {
    outputType: "investor_letter",
  }).text;
  assert.match(greeting, /^Dear Investors,/);

  const titled = applyGuideAutoFix(HEADING, {
    outputType: "reporting_commentary",
    title: "HPIF quarterly commentary",
  }).text;
  assert.match(titled, /^HarbourVest Private Investments Fund \(HPIF\)/);

  const sentence = applyGuideAutoFix("In September 2026, the fund called capital.\n\nThe call funded one investment.", {
    outputType: "reporting_commentary",
  }).text;
  assert.match(sentence, /^In September 2026, the fund called capital\./);
});
