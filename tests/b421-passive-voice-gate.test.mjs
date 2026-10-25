import assert from "node:assert/strict";
import { test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { spanIsPassive } from "../lib/qc/passive-voice-gate.mjs";

function concern(text, phrase) {
  const start = text.indexOf(phrase);
  return {
    concernCode: "active_voice_preference",
    span: [{ startChar: start, endChar: start + phrase.length }],
  };
}

function kept(text, phrase) {
  const filtered = applyDeterministicStyleFilters([concern(text, phrase)], text, text, {});
  return filtered.length === 1;
}

test("a span is passive only with an auxiliary and a participle", () => {
  assert.equal(spanIsPassive("will lead to a reduction in debt servicing costs"), false);
  assert.equal(spanIsPassive("A majority stake was acquired by the Fund"), true);
  assert.equal(spanIsPassive("The assets are being revalued"), true);
  assert.equal(spanIsPassive("The Fund acquired a stake"), false);
});

test("active voice concerns are dropped before the card", () => {
  assert.equal(kept(
    "The refinancing will lead to a reduction in debt servicing costs.",
    "will lead to a reduction in debt servicing costs",
  ), false);
  assert.equal(kept(
    "A majority stake was acquired by the Fund.",
    "A majority stake was acquired by the Fund",
  ), true);
  assert.equal(kept("The assets are being revalued.", "The assets are being revalued"), true);
  assert.equal(kept("The Fund acquired a stake.", "The Fund acquired a stake"), false);
});
