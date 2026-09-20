/**
 * B277. Scheduler is derived from the work in front of the stage. No constant pool.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { beginRequestBudget, getRequestBudget } from "../lib/qc/request-budget.mjs";
import {
  formatScheduleLog,
  planFromLiveBudget,
  planStageConcurrency,
} from "../lib/qc/stage-schedule.mjs";
import { tpmDefaultForModel } from "../lib/qc/token-estimate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIPELINE_SRC = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/index.mjs"), "utf8");

describe("B277 Stage 5/6 scheduler", () => {
  test("a 4-statement review is not paced when the window can hold it", () => {
    const plan = planStageConcurrency({
      statementCount: 4,
      tokensPerStatement: 12_000,
      remainingTokens: 2_000_000,
      tpmLimit: 2_000_000,
    });
    assert.equal(plan.concurrency, 4);
    assert.equal(plan.waves, 1);
    assert.equal(plan.why, "fits_remaining_one_wave");
  });

  test("a 25-statement review is one wave against a full gpt-4o window", () => {
    const plan = planStageConcurrency({
      statementCount: 25,
      tokensPerStatement: 12_000,
      remainingTokens: 2_000_000,
      tpmLimit: 2_000_000,
    });
    assert.equal(plan.concurrency, 25);
    assert.equal(plan.waves, 1);
  });

  test("a 185-statement review bursts inside remaining, not a constant 4", () => {
    const per = 18_000;
    const remaining = 2_000_000;
    const plan = planStageConcurrency({
      statementCount: 185,
      tokensPerStatement: per,
      remainingTokens: remaining,
      tpmLimit: 2_000_000,
    });
    assert.equal(plan.concurrency, Math.floor(remaining / per));
    assert.equal(plan.concurrency > 4, true);
    assert.equal(plan.waves, 2);
    assert.equal(plan.why, "burst_inside_remaining_window");
  });

  test("the same inputs produce the same plan", () => {
    const args = {
      statementCount: 40,
      tokensPerStatement: 15_000,
      remainingTokens: 500_000,
      tpmLimit: 2_000_000,
    };
    assert.deepEqual(planStageConcurrency(args), planStageConcurrency(args));
  });

  test("live remaining from a header changes the burst", () => {
    const tight = beginRequestBudget({ tpmLimit: 2_000_000 }, () => {
      const store = getRequestBudget();
      store.remainingTokens = 40_000;
      store.remainingSource = "header";
      return planFromLiveBudget({ statementCount: 10, tokensPerStatement: 18_000, stage: "stage6" });
    });
    assert.equal(tight.concurrency, 2);
    assert.equal(tight.remainingSource, "header");
  });

  test("the log line names statements, tokens, budget, concurrency, and why", () => {
    const plan = planStageConcurrency({
      statementCount: 25,
      tokensPerStatement: 12_000,
      remainingTokens: 2_000_000,
      tpmLimit: tpmDefaultForModel("gpt-4o-2024-08-06"),
    });
    const line = formatScheduleLog(plan, { stage: "stage6", remainingSource: "assumed_full" });
    assert.equal(/statements=25/.test(line), true);
    assert.equal(/tokensPerCall=12000/.test(line), true);
    assert.equal(/budgetTpm=2000000/.test(line), true);
    assert.equal(/concurrency=25/.test(line), true);
    assert.equal(/why=fits_remaining_one_wave/.test(line), true);
  });

  test("the pipeline no longer exports a Stage 6 constant of 4", () => {
    assert.equal(PIPELINE_SRC.includes("export const STAGE6_CONCURRENCY"), false);
    assert.equal(PIPELINE_SRC.includes("export const STAGE5_CONCURRENCY"), false);
    assert.equal(PIPELINE_SRC.includes("planAndLogStage"), true);
    assert.equal(PIPELINE_SRC.includes("mapPoolPaced"), true);
  });
});
