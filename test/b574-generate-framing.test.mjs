/**
 * B574. Drafting guidance for investor letters and comparisons. No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { renderDraftingInstructions } from "../lib/style-guide/render.mjs";
import { principleById } from "../lib/style-guide/principles.mjs";

test("an investor letter from someone else's research opens in the firm's voice", () => {
  const text = principleById("speak_for_the_firm").text;
  assert.match(text, /investor letter is the firm writing to its investors/i);
  assert.match(text, /third-party research/);
  assert.match(text, /open in the firm's voice/);
  assert.match(text, /credit the author's views as theirs/);
  const prompt = renderDraftingInstructions({ outputType: "investor_letter", eventType: "GENERAL" });
  assert.match(prompt, /third-party research/);
});

test("a comparison keeps what the source compared", () => {
  const text = principleById("keep_the_figures").text;
  assert.match(text, /comparison from the source keeps what is compared with what/);
  assert.match(text, /75% larger than Fund III/);
  assert.match(text, /do not apply that 75% to a different fund/);
});
