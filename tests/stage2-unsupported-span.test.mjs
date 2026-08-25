import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import {
  attachUnsupportedSpanFields,
  getStage2SystemPromptForTest,
  getStage2UnsupportedSpanRejectionCount,
  isStage2SpanEnabled,
  resetStage2PromptCache,
  resetStage2UnsupportedSpanRejectionCount,
  validateUnsupportedSpan,
} from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { hashPromptContent } from "../lib/qc/llm-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  delete process.env.QC_STAGE2_SPAN;
  resetStage2PromptCache();
  resetStage2UnsupportedSpanRejectionCount();
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

describe("validateUnsupportedSpan", () => {
  const statement = "The fund generated 2.4x gross MOIC and is unusually collegiate.";

  test("absent empty and non-string become null without rejection", () => {
    assert.deepEqual(validateUnsupportedSpan(undefined, statement), {
      span: null,
      returned: false,
      rejected: false,
    });
    assert.deepEqual(validateUnsupportedSpan("", statement), {
      span: null,
      returned: false,
      rejected: false,
    });
    assert.deepEqual(validateUnsupportedSpan(12, statement), {
      span: null,
      returned: false,
      rejected: false,
    });
  });

  test("exact substring validates", () => {
    const span = "is unusually collegiate";
    assert.deepEqual(validateUnsupportedSpan(span, statement), {
      span,
      returned: true,
      rejected: false,
    });
  });

  test("entire statement validates", () => {
    assert.deepEqual(validateUnsupportedSpan(statement, statement), {
      span: statement,
      returned: true,
      rejected: false,
    });
  });

  test("near miss is a rejection: trim case-fold and paraphrase all fail", () => {
    const statement = "The fund generated 2.4x gross MOIC and is unusually collegiate";
    assert.equal(validateUnsupportedSpan("is unusually collegiate.", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("is unusually collegiate ", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("Is unusually collegiate", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("unusually collegial", statement).rejected, true);
    assert.equal(validateUnsupportedSpan("is unusually collegiate.", statement).span, null);
  });
});

describe("Stage 2 span prompt is appended only when the flag is on", () => {
  test("OFF prompt is byte-identical to stage2_v4.md", async () => {
    const file = (await readFile(path.join(__dirname, "../lib/qc/pipeline-v4/prompts/stage2_v4.md"), "utf8")).trim();
    const off = await getStage2SystemPromptForTest(false);
    assert.equal(off, file);
    assert.equal(hashPromptContent(off), hashPromptContent(file));
  });

  test("ON prompt is the OFF prompt plus the span instruction", async () => {
    const extra = (
      await readFile(path.join(__dirname, "../lib/qc/pipeline-v4/prompts/stage2_v4_unsupported_span.md"), "utf8")
    ).trim();
    const off = await getStage2SystemPromptForTest(false);
    const on = await getStage2SystemPromptForTest(true);
    assert.equal(on, `${off}\n\n${extra}`);
    assert.notEqual(hashPromptContent(on), hashPromptContent(off));
  });
});

describe("rejection counter", () => {
  test("starts at 0 after reset and increments only on non-substring strings", () => {
    const statement = "Alpha beta gamma.";
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    attachUnsupportedSpanFields({ unsupportedSpan: "beta" }, statement, true);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    attachUnsupportedSpanFields({ unsupportedSpan: "" }, statement, true);
    attachUnsupportedSpanFields({ unsupportedSpan: null }, statement, true);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 0);
    attachUnsupportedSpanFields({ unsupportedSpan: "Beta" }, statement, true);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 1);
    attachUnsupportedSpanFields({ unsupportedSpan: "betta" }, statement, true);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 2);
    attachUnsupportedSpanFields({ unsupportedSpan: "beta" }, statement, false);
    assert.equal(getStage2UnsupportedSpanRejectionCount(), 2);
  });

  test("OFF attach returns no span fields", () => {
    assert.deepEqual(attachUnsupportedSpanFields({ unsupportedSpan: "x" }, "x", false), {});
  });
});
