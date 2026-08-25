import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import {
  applyUnsupportedSpanValidation,
  getStage2SpanElicitPromptForTest,
  getStage2SystemPromptForTest,
  getStage2UnsupportedSpanMultiOccurrenceCount,
  getStage2UnsupportedSpanRejectionCount,
  getStage2UnsupportedSpanWholeCount,
  isSpanElicitEligible,
  isStage2SpanEnabled,
  resetStage2PromptCache,
  resetStage2UnsupportedSpanStats,
  validateUnsupportedSpan,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { hashPromptContent } from "../lib/qc/llm-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  delete process.env.QC_STAGE2_SPAN;
  resetStage2PromptCache();
  resetStage2UnsupportedSpanStats();
});

describe("isStage2SpanEnabled default OFF", () => {
  test("unset env is off; 1/true/yes/on is on; option overrides", () => {
    const prev = process.env.QC_STAGE2_SPAN;
    try {
      delete process.env.QC_STAGE2_SPAN;
      assert.equal(isStage2SpanEnabled(), false);
      process.env.QC_STAGE2_SPAN = "0";
      assert.equal(isStage2SpanEnabled(), false);
      process.env.QC_STAGE2_SPAN = "off";
      assert.equal(isStage2SpanEnabled(), false);
      process.env.QC_STAGE2_SPAN = "1";
      assert.equal(isStage2SpanEnabled(), true);
      process.env.QC_STAGE2_SPAN = "true";
      assert.equal(isStage2SpanEnabled(), true);
      assert.equal(isStage2SpanEnabled({ stage2SpanEnabled: false }), false);
      assert.equal(isStage2SpanEnabled({ stage2SpanEnabled: true }), true);
    } finally {
      if (prev === undefined) delete process.env.QC_STAGE2_SPAN;
      else process.env.QC_STAGE2_SPAN = prev;
    }
  });
});

describe("isSpanElicitEligible", () => {
  test("only partially_confirmed and conflicting are eligible", () => {
    assert.equal(isSpanElicitEligible("partially_confirmed"), true);
    assert.equal(isSpanElicitEligible("conflicting"), true);
    assert.equal(isSpanElicitEligible("confirmed"), false);
    assert.equal(isSpanElicitEligible("no_support"), false);
    assert.equal(isSpanElicitEligible(""), false);
    assert.equal(isSpanElicitEligible(null), false);
  });
});

describe("validateUnsupportedSpan", () => {
  const statement = "The fund generated 2.4x gross MOIC and is unusually collegiate.";

  test("absent empty and non-string become null without rejection", () => {
    const empty = {
      span: null,
      returned: false,
      rejected: false,
      whole: false,
      multiOccurrence: false,
      start: null,
      end: null,
    };
    assert.deepEqual(validateUnsupportedSpan(undefined, statement), empty);
    assert.deepEqual(validateUnsupportedSpan("", statement), empty);
    assert.deepEqual(validateUnsupportedSpan(12, statement), empty);
  });

  test("exact unique substring validates with statement offsets", () => {
    const span = "is unusually collegiate";
    const start = statement.indexOf(span);
    assert.deepEqual(validateUnsupportedSpan(span, statement), {
      span,
      returned: true,
      rejected: false,
      whole: false,
      multiOccurrence: false,
      start,
      end: start + span.length,
    });
    assert.equal(statement.slice(start, start + span.length), span);
  });

  test("entire statement is kept and flagged WHOLE, not rejected", () => {
    assert.deepEqual(validateUnsupportedSpan(statement, statement), {
      span: statement,
      returned: true,
      rejected: false,
      whole: true,
      multiOccurrence: false,
      start: 0,
      end: statement.length,
    });
  });

  test("multi-occurrence keeps text and nulls offsets", () => {
    const statement = "The fund and the team and the board agreed.";
    const span = "and";
    assert.deepEqual(validateUnsupportedSpan(span, statement), {
      span,
      returned: true,
      rejected: false,
      whole: false,
      multiOccurrence: true,
      start: null,
      end: null,
    });
  });

  test("near miss is a rejection: trim case-fold and paraphrase all fail", () => {
    const statement = "The fund generated 2.4x gross MOIC and is unusually collegiate";
    assert.equal(validateUnsupportedSpan("is unusually collegiate.", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("is unusually collegiate ", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("Is unusually collegiate", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("unusually collegial", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("is unusually collegiate.", statement).span, null);
    assert.equal(validateUnsupportedSpan("is unusually collegiate.", statement).start, null);
  });
});

describe("Stage 2 classification prompt is unchanged by the span flag", () => {
  test("OFF and ON primary prompts are byte-identical to stage2_v4.md", async () => {
    const file = (await readFile(path.join(__dirname, "../lib/qc/pipeline-v4/prompts/stage2_v4.md"), "utf8")).trim();
    const off = await getStage2SystemPromptForTest(false);
    const on = await getStage2SystemPromptForTest(true);
    assert.equal(off, file);
    assert.equal(on, file);
    assert.equal(hashPromptContent(off), hashPromptContent(file));
    assert.equal(hashPromptContent(on), hashPromptContent(off));
  });

  test("elicit prompt is a separate file and a different hash", async () => {
    const elicitFile = (
      await readFile(path.join(__dirname, "../lib/qc/pipeline-v4/prompts/stage2_v4_span_elicit.md"), "utf8")
    ).trim();
    const elicit = await getStage2SpanElicitPromptForTest();
    const primary = await getStage2SystemPromptForTest();
    assert.equal(elicit, elicitFile);
    assert.notEqual(hashPromptContent(elicit), hashPromptContent(primary));
    assert.match(elicit, /already decided/);
    assert.match(elicit, /Do not change it/);
  });
});

describe("validation counters", () => {
  test("rejection increments only on non-substring strings; WHOLE and multi are counted separately", () => {
    const statement = "Alpha beta gamma beta.";
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    applyUnsupportedSpanValidation("beta", statement);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    assert.equal(getStage2UnsupportedSpanMultiOccurrenceCount(), 1);
    assert.equal(getStage2UnsupportedSpanWholeCount(), 0);
    applyUnsupportedSpanValidation("", statement);
    applyUnsupportedSpanValidation(null, statement);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    applyUnsupportedSpanValidation("Beta", statement);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 1);
    applyUnsupportedSpanValidation("betta", statement);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 2);
    applyUnsupportedSpanValidation(statement, statement);
    assert.equal(getStage2UnsupportedSpanWholeCount(), 1);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 2);
  });
});
