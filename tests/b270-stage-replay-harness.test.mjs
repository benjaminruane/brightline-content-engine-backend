/**
 * B270: stage-replay harness, no model calls.
 * Subset pick, neighbour reconstruction, and run diff.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  concernCodes,
  diffRuns,
  editorialSucceeded,
  honestyAgainstStored,
  loadReviewStatements,
  neighbourTexts,
  reconstructDraft,
  selectSubset,
} from "../scripts/diagnostic/stage-replay/lib.mjs";
import { STAGE6_CONCURRENCY } from "../lib/qc/pipeline-v4/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(ROOT, "tests/fixtures/b247/shopify-messy-full-after.json");

describe("B270 stage-replay harness", () => {
  test("uses the pipeline Stage 6 pool (B268 lowered it to 4)", () => {
    assert.equal(STAGE6_CONCURRENCY, 4);
  });

  test("reconstructs draft and neighbours from the recorded memo", () => {
    const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const all = loadReviewStatements(payload);
    const draft = reconstructDraft(payload);
    assert.equal(draft.length, 22163);
    assert.equal(all.length, 186);
    const mid = neighbourTexts(all, 10);
    assert.equal(mid.previousStatementText, all[9].text);
    assert.equal(mid.nextStatementText, all[11].text);
    const first = neighbourTexts(all, 0);
    assert.equal(first.previousStatementText, null);
    const last = neighbourTexts(all, all.length - 1);
    assert.equal(last.nextStatementText, null);
  });

  test("selects 40 succeeded editorial cards spread across the memo", () => {
    const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const all = loadReviewStatements(payload);
    const succeeded = all.filter((s) => editorialSucceeded(s.qcCard));
    assert.equal(succeeded.length > 40, true);
    const indexes = selectSubset(all, 40, "editorial");
    assert.equal(indexes.length, 40);
    assert.equal(new Set(indexes).size, 40);
    assert.equal(indexes[0] < indexes[39], true);
    assert.equal(
      indexes.every((i) => editorialSucceeded(all.find((s) => s.index === i).qcCard)),
      true
    );
    assert.equal(indexes[39] - indexes[0] > 80, true);
    const again = selectSubset(all, 40, "editorial");
    assert.deepEqual(again, indexes);
  });

  test("diffRuns counts only statements that succeeded in both runs", () => {
    const a = {
      statements: [
        { index: 0, verdict: "concern", codes: ["date_format"], succeeded: true },
        { index: 1, verdict: "clean", codes: [], succeeded: true },
        { index: 2, verdict: "not_reviewed", codes: [], succeeded: false },
      ],
    };
    const b = {
      statements: [
        { index: 0, verdict: "concern", codes: ["date_format"], succeeded: true },
        { index: 1, verdict: "concern", codes: ["voice_consistency"], succeeded: true },
        { index: 2, verdict: "clean", codes: [], succeeded: true },
      ],
    };
    const diff = diffRuns(a, b, "editorial");
    assert.equal(diff.bothSucceeded, 2);
    assert.equal(diff.codesDiffer, 1);
    assert.equal(diff.verdictDiffer, 1);
  });

  test("honestyAgainstStored ignores cards whose stored check did not succeed", () => {
    const all = [
      {
        index: 0,
        qcCard: {
          editorialVerdict: "concern",
          editorialConcerns: [{ concernCode: "date_format" }],
        },
      },
      {
        index: 1,
        qcCard: { editorialVerdict: "not_reviewed", editorialConcerns: [] },
      },
    ];
    const replay = {
      statements: [
        { index: 0, verdict: "concern", codes: ["date_format"], succeeded: true },
        { index: 1, verdict: "clean", codes: [], succeeded: true },
      ],
    };
    const honesty = honestyAgainstStored(replay, all, "editorial");
    assert.equal(honesty.storedSucceeded, 1);
    assert.equal(honesty.matched, 1);
    assert.equal(honesty.mismatched, 0);
    assert.deepEqual(concernCodes(all[0].qcCard, "editorial"), ["date_format"]);
  });

  test("run.mjs does not import Stage 1, Stage 2, or Stage 5", () => {
    const src = readFileSync(path.join(ROOT, "scripts/diagnostic/stage-replay/run.mjs"), "utf8");
    assert.equal(src.includes("stage1-extract"), false);
    assert.equal(src.includes("stage2-match"), false);
    assert.equal(src.includes("stage5-generate"), false);
    assert.equal(src.includes("runEditorialComplianceReview"), true);
  });
});
