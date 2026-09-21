#!/usr/bin/env node
/**
 * One evidence-only production Meridian Review, then synthesize-review (B301-B303).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { synthesisPayloadHasBlankFinding } from "../../../lib/qc/blank-finding-guard.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b301-runs");
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

function cardNote(value) {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceFindingFromCard(card) {
  const summary = cardNote(card?.evidenceSummary);
  const reasoning = cardNote(card?.reasoningParagraph);
  if (summary && reasoning && summary !== reasoning) return `${summary}\n${reasoning}`;
  return summary || reasoning || "";
}

const analyseUrl = `${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`;
console.log(`POST ${analyseUrl}`);
const t0 = Date.now();
const analyseRes = await fetch(analyseUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(reviewBody),
});
const payload = await analyseRes.json();
const analyseMs = Date.now() - t0;
writeFileSync(path.join(OUT_DIR, "production-review.json"), JSON.stringify(payload, null, 2));

const statements = Array.isArray(payload?.statements) ? payload.statements : [];
const summaryStamped = payload?.meta?.reviewSummary || null;
const options = payload?.meta?.reviewOptions || null;
const extract = {
  http: analyseRes.status,
  ms: analyseMs,
  ok: payload?.ok === true,
  pipelineVersion: payload?.meta?.pipelineVersion ?? null,
  traceId: payload?.meta?.traceId ?? null,
  reviewOptions: options,
  reviewSummary: summaryStamped,
  statementCount: statements.length,
  llmSpend: payload?.meta?.llmSpend ?? null,
  error: payload?.error ?? payload?.meta?.fatal ?? null,
};
console.log(JSON.stringify(extract, null, 2));
writeFileSync(path.join(OUT_DIR, "production-extract.json"), JSON.stringify(extract, null, 2));

const rows = statements.filter((row) => row?.qcCard?.summaryClass?.counted === true);
const notSupportedStatements = [];
const conflictingStatements = [];
const partialStatements = [];
for (const row of rows) {
  const item = {
    statement: String(row?.text ?? ""),
    evidenceFinding: evidenceFindingFromCard(row?.qcCard),
  };
  const evidence = row?.qcCard?.summaryClass?.evidence;
  if (evidence === "conflicting") conflictingStatements.push(item);
  else if (evidence === "partial") partialStatements.push(item);
  else if (evidence === "notSupported") notSupportedStatements.push(item);
}

const cards = rows.map((row) => row.qcCard).filter((card) => card && typeof card === "object");
const summary = summariseReview(cards, options);
const synthBody = {
  draftText: fixture.draftText,
  context: "assess",
  reviewOptions: {
    evidenceEnabled: options?.evidenceEnabled === true,
    editorialEnabled: options?.editorialEnabled === true,
    complianceEnabled: options?.complianceEnabled === true,
  },
  qcSummary: {
    totalStatements: summary.statements ?? 0,
    confirmed: summary.evidence?.confirmed ?? 0,
    partial: summary.evidence?.partial ?? 0,
    conflicting: summary.evidence?.conflicting ?? 0,
    notSupported: summary.evidence?.notSupported ?? 0,
    editorialFlagCount: summary.editorial?.concerns ?? 0,
    complianceFlagCount: summary.compliance?.concerns ?? 0,
    notChecked: summary.notChecked ?? 0,
    readiness: summary.readiness,
  },
  notSupportedStatements,
  conflictingStatements,
  partialStatements,
  editorialConcerns: [],
  complianceConcerns: [],
};

const synthUrl = `${PRODUCTION_URL.replace(/\/$/, "")}/api/synthesize-review`;
console.log(`POST ${synthUrl}`);
const s0 = Date.now();
const synthRes = await fetch(synthUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(synthBody),
});
const synthJson = await synthRes.json().catch(() => ({}));
const synthMs = Date.now() - s0;
const narrative = typeof synthJson?.narrative === "string" ? synthJson.narrative.trim() : "";
const synthOut = {
  http: synthRes.status,
  ms: synthMs,
  ok: synthJson?.ok === true,
  reason: synthJson?.reason ?? null,
  narrativeLength: narrative.length,
  narrativePreview: narrative.slice(0, 400),
  guardTrips: synthesisPayloadHasBlankFinding(synthBody),
  partial: partialStatements.length,
  notSupported: notSupportedStatements.length,
};
console.log(JSON.stringify(synthOut, null, 2));
writeFileSync(
  path.join(OUT_DIR, "production-synthesize.json"),
  JSON.stringify({ ...synthOut, narrative }, null, 2)
);
