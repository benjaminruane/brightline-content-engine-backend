#!/usr/bin/env node
/**
 * B240 CHECK: regenerate constructive feedback on the four fixtures
 * plus the captured production payload. No new Review.
 *
 * Usage: CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT=1 node scripts/diagnostic/delivery-check/b240-check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
process.env.CONSTRUCTIVE_FEEDBACK_DEBUG_CRAFT = "1";

const { default: constructiveFeedback } = await import("../../../api/constructive-feedback.js");
const {
  checkConstructiveFeedbackPiece,
  checkGrouping,
  collectMarginNotes,
  splitFeedbackParagraphs,
  wordCount,
} = await import("../../../lib/qc/constructive-feedback.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b240-check-output");
mkdirSync(OUT_DIR, { recursive: true });

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

function normalizeFixture(raw) {
  if (typeof raw.draftText === "string" && raw.reviewOptions && Array.isArray(raw.statements)) {
    return raw;
  }
  const statements = Array.isArray(raw.statements) ? raw.statements : [];
  return {
    ...raw,
    draftText: statements.map((row) => row.text).join(" "),
    reviewOptions: raw.reviewOptions || raw.meta?.reviewOptions || {},
  };
}

function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", headers: { origin: "http://localhost" }, body };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        resolve({ status: this.statusCode, body: obj });
      },
      end() {
        resolve({ status: this.statusCode, body: null });
      },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

const FEEDBACK_FIXTURES = [
  {
    file: "tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json",
    outputType: "reporting_commentary",
    requiredFacts: ["June 2026", "Q3 2026"],
    readiness: "Needs work",
  },
  {
    file: "tests/fixtures/b226/2-linkedin-post.json",
    outputType: "linkedin_post",
    requiredFacts: ["40 percent"],
    readiness: "Minor points to address",
  },
  {
    file: "tests/fixtures/b226/3-press-release.json",
    outputType: "press_release",
    requiredFacts: ["EUR 2 billion"],
    readiness: "Minor points to address",
  },
  {
    file: "tests/fixtures/b226/4-internal-inconsistency.json",
    outputType: "reporting_commentary",
    requiredFacts: ["EUR 84 million", "EUR 81 million"],
    readiness: "Needs work",
  },
];

const report = { feedback: [], production: null };

console.log("=== B240 constructive feedback ===");
for (const spec of FEEDBACK_FIXTURES) {
  const fixture = normalizeFixture(loadJson(spec.file));
  const notes = collectMarginNotes(fixture.statements, fixture.reviewOptions, fixture.draftText);
  const attempts = [];
  let passed = false;
  for (let attempt = 1; attempt <= 4 && !passed; attempt++) {
    const result = await callHandler(constructiveFeedback, {
      draftText: fixture.draftText,
      outputType: spec.outputType,
      reviewOptions: fixture.reviewOptions,
      statements: fixture.statements,
    });
    const text = result.body?.feedbackText || "";
    const checked = checkConstructiveFeedbackPiece(text, {
      readiness: spec.readiness,
      notes,
      requiredFacts: spec.requiredFacts,
      forbidInventedCraft: true,
    });
    const grouping = checkGrouping(text, notes);
    const entry = {
      attempt,
      words: wordCount(text),
      paragraphs: splitFeedbackParagraphs(text).length,
      notes: notes.length,
      ok: result.body?.ok,
      checksOk: checked.ok,
      failures: checked.failures,
      grouping,
      text,
    };
    attempts.push(entry);
    console.log(
      `\n--- ${spec.file} attempt ${attempt}  words=${entry.words}  paras=${entry.paragraphs}  notes=${notes.length}  grouping=${grouping.ok}  checks=${checked.ok ? "PASS" : checked.failures.join(", ")} ---`
    );
    console.log(text);
    if (checked.ok) passed = true;
  }
  report.feedback.push({ file: spec.file, passed, attempts });
}

console.log("\n=== B240 production payload regeneration ===");
const production = normalizeFixture(
  loadJson("scripts/diagnostic/delivery-check/b226-check-output/production-review.json")
);
const productionNotes = collectMarginNotes(
  production.statements,
  production.reviewOptions,
  production.draftText
);
const prodAttempts = [];
let prodPassed = false;
for (let attempt = 1; attempt <= 4 && !prodPassed; attempt++) {
  const result = await callHandler(constructiveFeedback, {
    draftText: production.draftText,
    outputType: "reporting_commentary",
    reviewOptions: production.reviewOptions,
    statements: production.statements,
  });
  const text = result.body?.feedbackText || "";
  const checked = checkConstructiveFeedbackPiece(text, {
    readiness: "Needs work",
    notes: productionNotes,
    requiredFacts: ["June 2026", "Q3 2026"],
    forbidInventedCraft: true,
  });
  const grouping = checkGrouping(text, productionNotes);
  const entry = {
    attempt,
    words: wordCount(text),
    paragraphs: splitFeedbackParagraphs(text).length,
    notes: productionNotes.length,
    ok: result.body?.ok,
    checksOk: checked.ok,
    failures: checked.failures,
    grouping,
    text,
  };
  prodAttempts.push(entry);
  console.log(
    `\n--- production-review.json attempt ${attempt}  words=${entry.words}  paras=${entry.paragraphs}  notes=${productionNotes.length}  grouping=${grouping.ok}  checks=${checked.ok ? "PASS" : checked.failures.join(", ")} ---`
  );
  console.log(text);
  if (checked.ok) prodPassed = true;
}
report.production = { passed: prodPassed, attempts: prodAttempts };

writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, OUT_DIR)}`);
