/**
 * B441. A second value for the same quantity is not a confirmation.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { findSecondValue, secondValueSpans } from "../lib/qc/pipeline-v4/second-value.mjs";
import { applyIntraSourceReducer } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memoPath = path.join(__dirname, "../scripts/diagnostic/sources/13_synth_internal_inconsistency_memo.txt");

const EBITDA = "EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million.";
const HEADCOUNT = "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.";

test("the margin the source states twice is not a confirmation", async () => {
  const source = await readFile(memoPath, "utf8");
  const hit = findSecondValue(EBITDA, source);
  assert.ok(hit);
  assert.equal(hit.statementRaw, "11.1%");
  assert.equal(hit.sourceRaw, "13%");
  assert.match(hit.passage, /approximately 13%/);
  assert.doesNotMatch(hit.passage, /28%/);
  assert.match(hit.line, /approximately 13%/);

  const matches = [{
    sourceIndex: 0,
    classification: "confirmed",
    sourceLabel: "Memo",
    passage: "Trailing twelve months revenue stands at EUR 76 million, with EBITDA of EUR 8.4 million representing an EBITDA margin of 11.1%.",
  }];
  const added = secondValueSpans({
    statementText: EBITDA,
    sourceMatches: matches,
    supportSpans: [],
    sources: [{ text: source, label: "Memo" }],
  });
  assert.equal(added.spans.length, 1);
  assert.equal(added.spans[0].classification, "conflicting");
  const reduced = applyIntraSourceReducer({
    sourceMatches: matches,
    supportSpans: added.spans,
    sources: [{ text: source }],
    statementText: EBITDA,
  });
  assert.equal(reduced[0].classification, "conflicting");
  const excerpts = selectExcerpts({
    statementMatches: matches,
    verdict: "conflicting",
    hasConflict: true,
    supportSpans: added.spans,
    sources: [{ text: source, label: "Memo" }],
    statementText: EBITDA,
  });
  const shown = `${excerpts.primaryExcerpt?.passage || ""} ${excerpts.conflictExcerpt?.passage || ""}`;
  assert.match(shown, /13%/);
});

test("a forecast, a different subject, and an existing conflict are not a second value", async () => {
  const source = await readFile(memoPath, "utf8");
  const margin = findSecondValue(EBITDA, source);
  assert.doesNotMatch(margin.passage, /28%/);
  const people = findSecondValue(HEADCOUNT, source);
  assert.ok(people);
  assert.match(people.passage, /285/);
  const already = secondValueSpans({
    statementText: HEADCOUNT,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", passage: "CloudPivot employs 320 people." }],
    supportSpans: [{ sourceIndex: 0, sourceRefId: 0, classification: "conflicting", passage: "The total team of 285 people." }],
    sources: [{ text: source }],
  });
  assert.equal(already.spans.length, 0);
  assert.equal(
    findSecondValue(
      "Period revenue of EUR 318 million was 4 percent above plan, and EBITDA of EUR 58 million was 7 percent above plan with margins of 18.3 percent.",
      "For full-year 2025, we expect revenue of approximately EUR 625 million and EBITDA of approximately EUR 113 million."
    ),
    null
  );
  assert.equal(
    findSecondValue(
      "Absolute Scope 1 and Scope 2 emissions reduced 8 percent during 2025 despite portfolio revenue growth of approximately 12 percent.",
      "The Company is performing in line with our underwriting, with annual recurring\nrevenue growth of 28% and good progression on EBITDA margin."
    ),
    null
  );
});
