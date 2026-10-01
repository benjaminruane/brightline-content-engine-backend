/**
 * B359 Part 1. Exact and normalised recovery are not clipped. Hitting the
 * window bound is a logged miss, never a truncated match.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  recoverExcerptFromSource,
  MAX_WINDOW_POINTER_CHARS,
} from "../lib/qc/excerpt-from-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

function sourceOf(payload) {
  return payload.sources[0]?.text || "";
}

describe("B359 recovery bound", () => {
  test("S7 stored span of both payloads recovers €3.1 billion and €14 million", () => {
    for (const payload of [CLEAN, DOC]) {
      const span = payload.statements[7].qcCard.supportSpans[0];
      assert.equal(span.passage.length, 654);
      const recovered = recoverExcerptFromSource({
        pointer: span.passage,
        sourceText: sourceOf(payload),
        statementIndex: 7,
      });
      assert.equal(recovered.miss, false);
      assert.equal(recovered.step, "exact");
      assert.match(recovered.passage, /€3\.1 billion/);
      assert.match(recovered.passage, /€14 million/);
      assert.equal(recovered.passage.includes(span.passage.slice(0, 80)), true);
    }
  });

  test("a pointer longer than the window bound that is not in the source misses honestly and logs", () => {
    const source = sourceOf(CLEAN);
    const pointer = `Completely unrelated zebra pendulums circled the atrium. ${"x".repeat(450)}`;
    assert.equal(pointer.length > MAX_WINDOW_POINTER_CHARS, true);
    const warnings = [];
    const orig = console.warn;
    console.warn = (...args) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const recovered = recoverExcerptFromSource({
        pointer,
        sourceText: source,
        statementIndex: 7,
      });
      assert.equal(recovered.miss, true);
      assert.equal(recovered.reason, "window_bound");
      assert.equal(recovered.passage == null || recovered.passage === "", true);
      const hit = warnings.find((w) => w.includes("window_bound"));
      assert.ok(hit);
      assert.match(hit, /statementIndex=7/);
      assert.match(hit, new RegExp(`length=${pointer.length}`));
    } finally {
      console.warn = orig;
    }
  });

  test("exact search is not clipped at 400 characters", () => {
    const source = `${"a".repeat(50)} UNIQUE_TOKEN_B359 ${"b".repeat(500)} the tail figure €9.9 million.`;
    const pointer = source;
    assert.equal(pointer.length > 400, true);
    const recovered = recoverExcerptFromSource({
      pointer,
      sourceText: source,
      statementIndex: 0,
    });
    assert.equal(recovered.miss, false);
    assert.equal(recovered.step, "exact");
    assert.match(recovered.passage, /€9\.9 million/);
    assert.match(recovered.passage, /UNIQUE_TOKEN_B359/);
  });
});
