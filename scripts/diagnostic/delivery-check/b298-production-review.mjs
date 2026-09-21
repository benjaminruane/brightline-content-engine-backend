#!/usr/bin/env node
/**
 * One evidence-only production Meridian Review (B298).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b298-runs");
mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const fixture = JSON.parse(
  readFileSync(path.join(ROOT, "tests/fixtures/b226/1-meridian-reporting.json"), "utf8")
);
const sourceText = readFileSync(
  path.join(ROOT, "scripts/diagnostic/revise/fixtures/meridian_production_source.txt"),
  "utf8"
);

const reviewBody = {
  draftText: fixture.draftText,
  outputType: "reporting_commentary",
  requiredVersion: "complete",
  authoringOrganisation: "Partners Group",
  evidenceEnabled: true,
  editorialEnabled: false,
  complianceEnabled: false,
  options: {
    pipelineRoute: "v4",
    evidenceEnabled: true,
    editorialEnabled: false,
    complianceEnabled: false,
    outputType: "reporting_commentary",
    authoringOrganisation: "Partners Group",
  },
  sources: [
    {
      text: sourceText,
      label: "Meridian test source.txt",
      name: "Meridian test source.txt",
      title: "Meridian test source.txt",
      sourceType: "uploaded",
      publicationState: "restricted",
    },
  ],
};

const url = `${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`;
console.log(`POST ${url}`);
const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(reviewBody),
});
const payload = await res.json();
const ms = Date.now() - t0;
const statements = Array.isArray(payload?.statements) ? payload.statements : [];
const summary = payload?.meta?.reviewSummary || null;
const options = payload?.meta?.reviewOptions || null;
const lines = [
  ...new Set(
    statements
      .map((row) => row?.qcCard?.summaryClass?.turnedOffLine)
      .filter((line) => typeof line === "string" && line.trim())
  ),
];
const furthermore = statements.find((row) =>
  String(row?.text || "").startsWith("Furthermore, Partners Group")
);
const extract = {
  http: res.status,
  ms,
  ok: payload?.ok === true,
  pipelineVersion: payload?.meta?.pipelineVersion ?? null,
  traceId: payload?.meta?.traceId ?? null,
  reviewOptions: options,
  reviewSummary: summary,
  statementCount: statements.length,
  turnedOffLines: lines,
  furthermore: furthermore
    ? {
        displayVerdict: furthermore.qcCard?.displayVerdict ?? null,
        summaryClass: furthermore.qcCard?.summaryClass ?? null,
        editorialVerdict: furthermore.qcCard?.editorialVerdict ?? null,
        complianceVerdict: furthermore.qcCard?.complianceVerdict ?? null,
        editorialNotReviewedReason: furthermore.qcCard?.editorialNotReviewedReason ?? null,
        complianceNotReviewedReason: furthermore.qcCard?.complianceNotReviewedReason ?? null,
      }
    : null,
  llmSpend: payload?.meta?.llmSpend ?? null,
  error: payload?.error ?? payload?.meta?.fatal ?? null,
};

console.log(JSON.stringify(extract, null, 2));
writeFileSync(path.join(OUT_DIR, "production-extract.json"), JSON.stringify(extract, null, 2));
writeFileSync(path.join(OUT_DIR, "production-review.json"), JSON.stringify(payload, null, 2));
