import { describe, test } from "vitest";
import assert from "node:assert/strict";
import {
  enforcePgCommentaryWordLimit,
  getPgCommentaryWordLimit,
  splitPgDraftOutput,
} from "../lib/prompt-library/pg-word-limit.mjs";
import { PG_METHODOLOGY_DELIMITER } from "../lib/prompt-library/pg-commentary-cleanup.mjs";
import { PG_WRITING_EVENT } from "../lib/prompt-library/pg-writing-prompts.mjs";
import { VISIBILITY } from "../lib/output-intent.js";

describe("pg-word-limit", () => {
  test("getPgCommentaryWordLimit returns limits for PG demo types only", () => {
    assert.equal(getPgCommentaryWordLimit(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.COMPLETE), 150);
    assert.equal(getPgCommentaryWordLimit(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.PUBLIC), 80);
    assert.equal(getPgCommentaryWordLimit("SPECIAL_TOPIC", VISIBILITY.COMPLETE), null);
  });

  test("splitPgDraftOutput separates commentary and methodology", () => {
    const raw = `First paragraph.\n\nSecond paragraph.\n${PG_METHODOLOGY_DELIMITER}\nMethodology text here.`;
    const { commentary, methodologyNote } = splitPgDraftOutput(raw);
    assert.equal(commentary, "First paragraph.\n\nSecond paragraph.");
    assert.equal(methodologyNote, "Methodology text here.");
  });

  test("enforcePgCommentaryWordLimit logs canary but does not truncate over-limit commentary", () => {
    const over = `${"token ".repeat(155)}End.\n${PG_METHODOLOGY_DELIMITER}\nNote body.`;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));

    try {
      const result = enforcePgCommentaryWordLimit(over, {
        eventType: PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT,
        visibility: VISIBILITY.COMPLETE,
        requestId: "test-rid",
      });
      assert.equal(result.enforced, false);
      assert.equal(result.limitExceeded, true);
      assert.ok(result.wordCount > 150);
      assert.match(result.draftText, /token/);
      assert.match(result.draftText, /End\./);
      assert.match(result.draftText, /Note body\./);
      assert.ok(warnings.some((w) => w.includes("pg_word_limit_exceeded")));
    } finally {
      console.warn = originalWarn;
    }
  });

  test("enforcePgCommentaryWordLimit is a no-op for non-PG event types", () => {
    const text = "word ".repeat(200);
    const result = enforcePgCommentaryWordLimit(text, {
      eventType: "SPECIAL_TOPIC",
      visibility: VISIBILITY.COMPLETE,
    });
    assert.equal(result.enforced, false);
    assert.equal(result.draftText, text);
  });

  test("fund commitment trims at sentence boundary when over limit after exclusion filter", () => {
    const sentences = [];
    for (let i = 0; i < 40; i += 1) {
      sentences.push(`Sentence ${i} adds neutral fund commentary about strategy and merits.`);
    }
    const over = `${sentences.join(" ")}\n\n${sentences.slice(20).join(" ")}`;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));

    try {
      const result = enforcePgCommentaryWordLimit(over, {
        eventType: PG_WRITING_EVENT.NEW_FUND_COMMITMENT,
        visibility: VISIBILITY.COMPLETE,
        requestId: "trim-test",
      });
      assert.equal(result.trimmed, true);
      assert.ok(result.wordCount <= 150);
      assert.ok(!warnings.some((w) => w.includes("pg_word_limit_exceeded")));
    } finally {
      console.warn = originalWarn;
    }
  });

  test("fund commitment logs pg_word_limit_exceeded when one sentence alone exceeds limit", () => {
    const over = `${"token ".repeat(155)}End.`;
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));

    try {
      const result = enforcePgCommentaryWordLimit(over, {
        eventType: PG_WRITING_EVENT.NEW_FUND_COMMITMENT,
        visibility: VISIBILITY.COMPLETE,
        requestId: "untrim-test",
      });
      assert.equal(result.limitExceeded, true);
      assert.equal(result.trimmed, false);
      assert.ok(warnings.some((w) => w.includes("pg_word_limit_exceeded")));
      assert.match(warnings.find((w) => w.includes("pg_word_limit_exceeded")) || "", /untrimmable":true/);
    } finally {
      console.warn = originalWarn;
    }
  });
});
