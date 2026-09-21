/**
 * B286. Every api/ handler that calls the model must open a request budget
 * before the first callLLM. A new endpoint that forgets fails this test.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(ROOT, "api");

const SPEC_ELEVEN = [
  "adapt.js",
  "constructive-feedback.js",
  "generate.js",
  "query-sources.js",
  "query.js",
  "rewrite.js",
  "suggest-revision.js",
  "summarize-rewrite-label.js",
  "summarize-source-usage.js",
  "summarize-source.js",
  "synthesize-review.js",
];

function callLlmIndex(src) {
  return src.search(/\bcallLLM\s*\(/);
}

function budgetIndex(src) {
  return src.search(/\bbeginRequestBudget\s*\(/);
}

describe("B286 every model-calling endpoint opens a request budget", () => {
  const files = readdirSync(API_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort();

  const modelCalling = files.filter((name) => {
    const src = readFileSync(path.join(API_DIR, name), "utf8");
    return callLlmIndex(src) >= 0;
  });

  test("the eleven listed endpoints are exactly the callLLM handlers in api/", () => {
    assert.deepEqual(modelCalling, [...SPEC_ELEVEN].sort());
  });

  test("each model-calling handler opens a budget before its first callLLM", () => {
    const missing = [];
    for (const name of modelCalling) {
      const src = readFileSync(path.join(API_DIR, name), "utf8");
      const budgetAt = budgetIndex(src);
      const llmAt = callLlmIndex(src);
      if (budgetAt < 0 || llmAt < 0 || budgetAt > llmAt) missing.push(name);
    }
    assert.deepEqual(missing, [], `missing or late beginRequestBudget: ${missing.join(", ")}`);
  });

  test("a new api/ file that calls the model without a budget fails this scan", () => {
    const listed = modelCalling.join("\n");
    assert.equal(modelCalling.length, 11, `model-calling api/ files:\n${listed}`);
    for (const name of SPEC_ELEVEN) {
      assert.equal(modelCalling.includes(name), true, listed);
    }
  });

  test("synthesize-review still returns an honest empty narrative on throw", () => {
    const src = readFileSync(path.join(API_DIR, "synthesize-review.js"), "utf8");
    assert.equal(src.includes("ASSESSMENT_REASONS.CALL_FAILED"), true);
    assert.equal(src.includes('narrative: ""'), true);
    assert.equal(/narrative:\s*["'][^"']{8,}/.test(src), false);
  });
});
