#!/usr/bin/env node
/**
 * One production Meridian Review (B226 CHECK), then local assessment + feedback
 * from those cards.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b226-check-output");
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
  options: {
    pipelineRoute: "v4",
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
    outputType: "reporting_commentary",
    authoringOrganisation: "Partners Group",
  },
  sources: [
    {
      text: sourceText,
      label: "Meridian Fund V summary",
      name: "meridian_production_source.txt",
      title: "Meridian Fund V summary",
      sourceType: "uploaded",
      publicationState: "restricted",
    },
  ],
};

console.log(`POST ${PRODUCTION_URL}/api/analyse-statements`);
const t0 = Date.now();
const res = await fetch(`${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(reviewBody),
});
const payload = await res.json();
const ms = Date.now() - t0;
const statements = Array.isArray(payload?.statements) ? payload.statements : [];
const summary = payload?.meta?.reviewSummary || null;
console.log(`http=${res.status} ms=${ms} statements=${statements.length} readiness=${summary?.readiness}`);
console.log(`pipeline=${payload?.meta?.pipelineVersion} trace=${payload?.meta?.traceId}`);
writeFileSync(path.join(OUT_DIR, "production-review.json"), JSON.stringify(payload, null, 2));

const { default: synthesizeReview } = await import("../../../api/synthesize-review.js");
const { default: constructiveFeedback } = await import("../../../api/constructive-feedback.js");
const { wordCount } = await import("../../../lib/qc/constructive-feedback.mjs");

function callHandler(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { method: "POST", headers: { origin: "http://localhost" }, body };
    const resObj = {
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
    Promise.resolve(handler(req, resObj)).catch(reject);
  });
}

function findingFromCard(card) {
  const summaryText = typeof card?.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const reasoning = typeof card?.reasoningParagraph === "string" ? card.reasoningParagraph.trim() : "";
  if (summaryText && reasoning && summaryText !== reasoning) return `${summaryText}\n${reasoning}`;
  return summaryText || reasoning || "";
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

const counted = statements.filter((row) => row?.qcCard?.summaryClass?.counted === true);
const notSupportedStatements = [];
const conflictingStatements = [];
const partialStatements = [];
for (const row of counted) {
  const item = { statement: String(row.text ?? ""), evidenceFinding: findingFromCard(row.qcCard) };
  const evidence = row.qcCard?.summaryClass?.evidence;
  if (evidence === "conflicting") conflictingStatements.push(item);
  else if (evidence === "partial") partialStatements.push(item);
  else if (evidence === "notSupported") notSupportedStatements.push(item);
}
const editorialConcerns = counted
  .filter((row) => {
    const cls = row.qcCard?.summaryClass?.editorial;
    return cls === "concern" || cls === "hardConcern";
  })
  .flatMap((row) => concernItems(row, "editorialConcerns"));
const complianceConcerns = counted
  .filter((row) => {
    const cls = row.qcCard?.summaryClass?.compliance;
    return cls === "concern" || cls === "hardConcern";
  })
  .flatMap((row) => concernItems(row, "complianceConcerns"));

const synth = await callHandler(synthesizeReview, {
  draftText: fixture.draftText,
  context: "assess",
  reviewOptions: fixture.reviewOptions,
  qcSummary: {
    totalStatements: summary?.statements ?? 0,
    confirmed: summary?.evidence?.confirmed ?? 0,
    partial: summary?.evidence?.partial ?? 0,
    conflicting: summary?.evidence?.conflicting ?? 0,
    notSupported: summary?.evidence?.notSupported ?? 0,
    editorialFlagCount: summary?.editorial?.concerns ?? 0,
    complianceFlagCount: summary?.compliance?.concerns ?? 0,
    notChecked: summary?.notChecked ?? 0,
    readiness: summary?.readiness,
  },
  notSupportedStatements,
  conflictingStatements,
  partialStatements,
  editorialConcerns,
  complianceConcerns,
});

const feedback = await callHandler(constructiveFeedback, {
  draftText: fixture.draftText,
  outputType: "reporting_commentary",
  reviewOptions: fixture.reviewOptions,
  statements: statements.map((row) => ({
    text: String(row?.text ?? ""),
    qcCard: row?.qcCard ?? {},
  })),
});

const out = {
  httpStatus: res.status,
  ms,
  pipelineVersion: payload?.meta?.pipelineVersion ?? null,
  traceId: payload?.meta?.traceId ?? null,
  readiness: summary?.readiness ?? null,
  summary,
  assessment: synth.body?.narrative || "",
  assessmentWords: wordCount(synth.body?.narrative || ""),
  feedback: feedback.body?.feedbackText || "",
  feedbackWords: wordCount(feedback.body?.feedbackText || ""),
  editorialNotes: editorialConcerns,
  notSupportedStatements,
  partialStatements,
};
writeFileSync(path.join(OUT_DIR, "production-triple.txt"), JSON.stringify(out, null, 2));
console.log("\n=== BADGE ===");
console.log(`v4  ${summary?.readiness}`);
console.log("\n=== ASSESSMENT ===");
console.log(out.assessment);
console.log("\n=== FEEDBACK ===");
console.log(out.feedback);
