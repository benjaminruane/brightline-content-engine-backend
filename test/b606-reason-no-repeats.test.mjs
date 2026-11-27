/**
 * B606 C3. Card reasons do not repeat the same point across sentences.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { dedupeJoinedReason } from "../lib/qc/note-card-consistency.mjs";
import { applyB606CardRules } from "../lib/qc/b606-card-rules.mjs";

const OSTARA_S1 = [
  "The source addresses earnings for the period but it does not specifically address the claim that results were ahead of plan.",
  "The source provides mixed earnings results for the period and does not establish that results were ahead of plan.",
  "The draft should soften or drop the ahead-of-plan claim.",
].join(" ");

test("Ostara S1 shape drops repeated support sentences", () => {
  const out = dedupeJoinedReason(OSTARA_S1);
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.ok(sentences.length <= 2, `expected at most 2 sentences, got ${sentences.length}: ${out}`);
  assert.match(out, /ahead of plan/i);
  assert.doesNotMatch(out, /provides mixed earnings results[\s\S]*does not establish/);
});

test("applyB606CardRules dedupes the stamped reason", () => {
  const card = {
    statement: "Results were ahead of plan.",
    sentenceState: "beyond",
    statementVerdict: { state: "beyond" },
    shownReason: OSTARA_S1,
  };
  const out = applyB606CardRules(card);
  const sentences = String(out.shownReason || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.ok(sentences.length <= 2);
});
