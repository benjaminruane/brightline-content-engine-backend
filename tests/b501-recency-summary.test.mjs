/**
 * B501. A saved recency concern keeps its date in the note.
 * The summary recovers that date, and it does not invent a source name.
 * The analyse response passes the summary through.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { recencySummary, sourceDateLine } from "../lib/qc/recency-summary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SAVED = "This claim rests on a source dated 14 March 2025 (1.7 years old) and is presented as current.";

test("a concern that stores the date in its note still produces a line when the name is known", () => {
  const summary = recencySummary([
    {
      index: 3,
      sourceRecencyConcerns: [{ sourceName: "08_synth_industrial_buyout_memo.txt", text: SAVED }],
    },
    {
      index: 7,
      sourceRecencyConcerns: [{ sourceName: "08_synth_industrial_buyout_memo.txt", text: SAVED }],
    },
  ]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].date, "14 March 2025");
  assert.equal(summary[0].age, "1.7 years");
  assert.deepEqual(summary[0].statementIndices, [3, 7]);
  assert.equal(
    sourceDateLine(summary[0]),
    "2 sentences rest on 08_synth_industrial_buyout_memo.txt, dated 14 March 2025 (1.7 years). Check they are still accurate."
  );
  assert.equal(
    sourceDateLine({ name: "IC memo", date: "14 March 2025", age: "1.7 years", statementIndices: [1] }),
    "1 sentence rests on IC memo, dated 14 March 2025 (1.7 years). Check they are still accurate."
  );
});

test("a concern with no source name does not invent one", () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const summary = recencySummary([{ index: 1, sourceRecencyConcerns: [{ text: SAVED }] }]);
    assert.equal(summary.length, 0);
  } finally {
    console.warn = original;
  }
  assert.ok(warnings.some((message) => message.includes("source name")));
});

test("the analyse response passes recencySummary", () => {
  const source = readFileSync(path.join(root, "api/analyse-statements.js"), "utf8");
  assert.match(source, /recencySummary: Array\.isArray\(pipelineResult\?\.recencySummary\)/);
});
