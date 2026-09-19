#!/usr/bin/env node
/**
 * B225/B226 CHECK: regenerate Meridian assessment (empty vs filled payload)
 * and generate constructive feedback on the four B226 fixtures.
 *
 * Usage: node scripts/diagnostic/delivery-check/b226-check.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { default: synthesizeReview } = await import("../../../api/synthesize-review.js");
const { default: constructiveFeedback } = await import("../../../api/constructive-feedback.js");
const {
  checkConstructiveFeedbackPiece,
  collectMarginNotes,
  wordCount,
} = await import("../../../lib/qc/constructive-feedback.mjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b226-check-output");
mkdirSync(OUT_DIR, { recursive: true });

function loadJson(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
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

function findingFromCard(card) {
  const summary = typeof card?.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const reasoning = typeof card?.reasoningParagraph === "string" ? card.reasoningParagraph.trim() : "";
  if (summary && reasoning && summary !== reasoning) return `${summary}\n${reasoning}`;
  return summary || reasoning || "";
}

function concernItems(row, listKey) {
  const statement = String(row?.text ?? "");
  const list = Array.isArray(row?.qcCard?.[listKey]) ? row.qcCard[listKey] : [];
  const items = [];
  for (const concern of list) {
    if (!concern || typeof concern !== "object") continue;
    const note = typeof concern.note === "string" ? concern.note.trim() : "";
    const suggested = typeof concern.suggestedDirection === "string" ? concern.suggestedDirection.trim() : "";
    const text = note || suggested;
    if (text) items.push({ statement, concern: text });
  }
  if (items.length === 0) items.push({ statement, concern: "" });
  return items;
}

function meridianPayload(emptyFindings) {
  const fixture = loadJson("tests/fixtures/b226/1-meridian-reporting.json");
  const rows = fixture.statements;
  const notSupportedStatements = [];
  const conflictingStatements = [];
  const partialStatements = [];
  for (const row of rows) {
    const item = {
      statement: String(row.text ?? ""),
      evidenceFinding: emptyFindings ? "" : findingFromCard(row.qcCard),
    };
    const evidence = row.qcCard?.summaryClass?.evidence;
    if (evidence === "conflicting") conflictingStatements.push(item);
    else if (evidence === "partial") partialStatements.push(item);
    else if (evidence === "notSupported") notSupportedStatements.push(item);
  }
  const editorialConcerns = emptyFindings
    ? rows
        .filter((row) => {
          const cls = row.qcCard?.summaryClass?.editorial;
          return cls === "concern" || cls === "hardConcern";
        })
        .map((row) => ({ statement: String(row.text ?? ""), concern: "" }))
    : rows
        .filter((row) => {
          const cls = row.qcCard?.summaryClass?.editorial;
          return cls === "concern" || cls === "hardConcern";
        })
        .flatMap((row) => concernItems(row, "editorialConcerns"));
  return {
    draftText: fixture.draftText,
    context: "assess",
    reviewOptions: fixture.reviewOptions,
    qcSummary: {
      totalStatements: fixture.expectedReviewSummary.statements,
      confirmed: fixture.expectedReviewSummary.evidence.confirmed,
      partial: fixture.expectedReviewSummary.evidence.partial,
      conflicting: fixture.expectedReviewSummary.evidence.conflicting,
      notSupported: fixture.expectedReviewSummary.evidence.notSupported,
      editorialFlagCount: fixture.expectedReviewSummary.editorial.concerns,
      complianceFlagCount: fixture.expectedReviewSummary.compliance.concerns,
      notChecked: fixture.expectedReviewSummary.notChecked,
      readiness: fixture.expectedReviewSummary.readiness,
    },
    notSupportedStatements,
    conflictingStatements,
    partialStatements,
    editorialConcerns,
    complianceConcerns: [],
  };
}

const FEEDBACK_FIXTURES = [
  {
    file: "tests/fixtures/b226/1-meridian-reporting.json",
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

const report = { assessments: [], feedback: [] };

console.log("=== B225 assessment regen ===");
for (const [label, emptyFindings] of [
  ["before_empty_findings", true],
  ["after_filled_findings", false],
]) {
  const payload = meridianPayload(emptyFindings);
  const result = await callHandler(synthesizeReview, payload);
  const narrative = result.body?.narrative || "";
  const words = wordCount(narrative);
  console.log(`\n--- ${label}  words=${words}  ok=${result.body?.ok} ---`);
  console.log(narrative);
  report.assessments.push({ label, words, ok: result.body?.ok, narrative });
  writeFileSync(path.join(OUT_DIR, `${label}.txt`), narrative);
}

console.log("\n=== B226 constructive feedback ===");
for (const spec of FEEDBACK_FIXTURES) {
  const fixture = loadJson(spec.file);
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
    const entry = {
      attempt,
      words: wordCount(text),
      ok: result.body?.ok,
      checksOk: checked.ok,
      failures: checked.failures,
      text,
    };
    attempts.push(entry);
    console.log(
      `\n--- ${spec.file} attempt ${attempt}  words=${entry.words}  checks=${checked.ok ? "PASS" : checked.failures.join(", ")} ---`
    );
    console.log(text);
    if (checked.ok) passed = true;
  }
  report.feedback.push({ file: spec.file, passed, attempts });
}

writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
console.log(`\nWrote ${path.relative(ROOT, OUT_DIR)}`);
