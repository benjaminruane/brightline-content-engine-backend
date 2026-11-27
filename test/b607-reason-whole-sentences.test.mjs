/**
 * B607. Reasons are only shortened by dropping whole sentences, never mid-word.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  capAtSentenceBoundary,
  dedupeJoinedReason,
  wholeSentencesOnly,
} from "../lib/qc/note-card-consistency.mjs";
import { matcherNamedGaps } from "../lib/qc/b595-card-rules.mjs";

const OSTARA_S1_FULL = [
  "The source confirms that the remaining value is compounding earnings, but it does not address whether this is in line with the manager's long-term underwriting.",
  "The source provides mixed earnings results for the portfolio, which partially supports the statement about compounding in line with long-term underwriting.",
  "However, it does not confirm the statement's claim about compounding in line with underwriting.",
].join(" ");

const MID_WORD_STUMP =
  "The source confirms that the remaining value is compounding earnings but does not specifically address compounding in li.";

test("Ostara S1 full model text yields whole sentences only", () => {
  const capped = capAtSentenceBoundary(OSTARA_S1_FULL, 120);
  assert.match(capped, /[.!]"?$/);
  assert.doesNotMatch(capped, /\bli\./i);
  const words = capped.replace(/[.!?]"?$/, "").split(/\s+/);
  const last = words[words.length - 1] || "";
  assert.ok(last.length >= 3 || /^(a|an|as|at|be|by|do|if|in|is|it|me|my|no|of|on|or|so|to|up|us|we)$/i.test(last));
  // Every kept sentence ends in a full stop.
  for (const sentence of capped.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    assert.match(sentence.trim(), /[.!?]"?$/);
  }
});

test("mid-word stump is dropped, not kept as a sentence", () => {
  const out = wholeSentencesOnly(MID_WORD_STUMP);
  assert.equal(out, "");
  const withPrior = wholeSentencesOnly(
    `The source confirms that the remaining value is compounding earnings. ${MID_WORD_STUMP}`,
  );
  assert.equal(withPrior, "The source confirms that the remaining value is compounding earnings.");
});

test("dedupeJoinedReason never leaves a mid-word stump", () => {
  const out = dedupeJoinedReason(
    `${OSTARA_S1_FULL} ${MID_WORD_STUMP}`,
  );
  assert.doesNotMatch(out, /\bli\./);
  assert.match(out, /[.!]"?$/);
});

test("matcherNamedGaps does not slice mid-word under the old 120 cap", () => {
  const card = {
    matchExplanations: [
      {
        classification: "partially_confirmed",
        explanation: OSTARA_S1_FULL,
      },
    ],
  };
  const gaps = matcherNamedGaps(card);
  assert.ok(gaps.length >= 1);
  for (const gap of gaps) {
    assert.doesNotMatch(gap, /\bli\./);
    if (/[.!?]/.test(gap)) assert.match(gap, /[.!?]"?$/);
  }
});
