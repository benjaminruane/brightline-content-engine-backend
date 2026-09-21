#!/usr/bin/env node
/**
 * B301 Q3. Reconstruct the reviewer-assessment payload from the B298
 * evidence-only production Review and POST synthesize-review.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { synthesisPayloadHasBlankFinding } from "../../../lib/qc/blank-finding-guard.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const payload = JSON.parse(
  readFileSync(path.join(ROOT, "scripts/diagnostic/delivery-check/b298-runs/production-review.json"), "utf8")
);

function cardNote(value) {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceFindingFromCard(card) {
  const summary = cardNote(card?.evidenceSummary);
  const reasoning = cardNote(card?.reasoningParagraph);
  if (summary && reasoning && summary !== reasoning) return `${summary}\n${reasoning}`;
  return summary || reasoning || "";
}

const statements = Array.isArray(payload.statements) ? payload.statements : [];
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
const summary = summariseReview(cards, payload?.meta?.reviewOptions);
const reviewOptions = payload?.meta?.reviewOptions || {};

const synthBody = {
  draftText: statements.map((row) => row.text).join(" "),
  context: "assess",
  reviewOptions: {
    evidenceEnabled: reviewOptions.evidenceEnabled === true,
    editorialEnabled: reviewOptions.editorialEnabled === true,
    complianceEnabled: reviewOptions.complianceEnabled === true,
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

const guard = synthesisPayloadHasBlankFinding(synthBody);
const blankPartial = partialStatements.filter((row) => !row.evidenceFinding.trim()).length;
const blankUnsupported = notSupportedStatements.filter((row) => !row.evidenceFinding.trim()).length;

const url = `${PRODUCTION_URL.replace(/\/$/, "")}/api/synthesize-review`;
console.log(`POST ${url}`);
console.log(
  JSON.stringify(
    {
      readiness: summary.readiness,
      partial: partialStatements.length,
      notSupported: notSupportedStatements.length,
      blankPartial,
      blankUnsupported,
      guardTrips: guard,
      reviewOptions: synthBody.reviewOptions,
    },
    null,
    2
  )
);

const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(synthBody),
});
const body = await res.json().catch(() => ({}));
const ms = Date.now() - t0;
const narrative = typeof body?.narrative === "string" ? body.narrative.trim() : "";
const out = {
  http: res.status,
  ms,
  ok: body?.ok === true,
  narrativeLength: narrative.length,
  narrativePreview: narrative.slice(0, 280),
  reason: body?.reason ?? null,
  guardTrips: guard,
  blankPartial,
  blankUnsupported,
  readiness: summary.readiness,
};
console.log(JSON.stringify(out, null, 2));
writeFileSync(
  path.join(ROOT, "scripts/diagnostic/delivery-check/b298-runs/b301-q3-synthesize.json"),
  JSON.stringify({ ...out, narrative }, null, 2)
);
