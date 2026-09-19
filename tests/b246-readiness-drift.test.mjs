/**
 * B246: backend and frontend summariseReview must agree on readiness and counts.
 * Does not merge the modules. Sibling frontend is required.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, test } from "vitest";
import { cardsFromAnalyseResult, summariseReview as backendSummarise } from "../lib/qc/review-summary.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function frontendRoot() {
  const fromEnv = String(process.env.CE_FRONTEND_ROOT || "").trim();
  if (fromEnv) return fromEnv;
  return path.resolve(backendRoot, "../brightline-content-engine-frontend");
}

function frontendSummarisePath() {
  return path.join(frontendRoot(), "src/utils/summariseReview.js");
}

function frontendCasesPath() {
  return path.join(frontendRoot(), "tests/fixtures/review-summary-cases.json");
}

function countsForCompare(summary) {
  return {
    readiness: summary?.readiness ?? null,
    statements: summary?.statements ?? 0,
    evidence: summary?.evidence ?? null,
    editorial: summary?.editorial ?? null,
    compliance: summary?.compliance ?? null,
    signalConcerns: summary?.signalConcerns ?? 0,
    notChecked: summary?.notChecked ?? 0,
    needsAttention: summary?.needsAttention ?? 0,
  };
}

function assertSameSummary(label, cards, reviewOptions, frontendSummarise) {
  const backend = countsForCompare(backendSummarise(cards, reviewOptions));
  const frontend = countsForCompare(frontendSummarise(cards, reviewOptions));
  assert.deepEqual(
    frontend,
    backend,
    `${label}: frontend ${JSON.stringify(frontend)} !== backend ${JSON.stringify(backend)}`
  );
}

function loadCases(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8")).cases;
}

const frontendModule = await import(pathToFileURL(frontendSummarisePath()).href);
const frontendSummarise = frontendModule.summariseReview;

describe("B246 readiness calculations cannot drift", () => {
  test("sibling frontend summariseReview is present", () => {
    assert.equal(existsSync(frontendSummarisePath()), true, frontendSummarisePath());
  });

  test("review-summary cases agree on both copies of the fixture", () => {
    const backendCases = loadCases(path.join(backendRoot, "tests/fixtures/review-summary-cases.json"));
    assert.ok(backendCases.length > 0);
    for (const testCase of backendCases) {
      assertSameSummary(
        `backend cases/${testCase.name}`,
        testCase.cards,
        testCase.reviewOptions,
        frontendSummarise
      );
    }
    const copied = frontendCasesPath();
    assert.equal(existsSync(copied), true, copied);
    const frontendCases = loadCases(copied);
    for (const testCase of frontendCases) {
      assertSameSummary(
        `frontend cases/${testCase.name}`,
        testCase.cards,
        testCase.reviewOptions,
        frontendSummarise
      );
    }
  });

  test("recorded Meridian review agrees", () => {
    const payload = JSON.parse(
      readFileSync(
        path.join(backendRoot, "tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json"),
        "utf8"
      )
    );
    const cards = cardsFromAnalyseResult(payload);
    assert.ok(cards.length > 0);
    assertSameSummary("meridian-live", cards, payload?.meta?.reviewOptions, frontendSummarise);
  });
});
