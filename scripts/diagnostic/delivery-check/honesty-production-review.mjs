#!/usr/bin/env node
/**
 * One production Review of the Shopify messy full memo (honesty spec proof).
 * All three checks on. Writes the payload and a short extract.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/honesty-proof");
mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const fixture = JSON.parse(
  readFileSync(path.join(ROOT, "tests/fixtures/b247/shopify-messy-full-after.json"), "utf8")
);

const draftText = typeof fixture._auditDraft === "string" ? fixture._auditDraft : "";
const sources = Array.isArray(fixture.sources)
  ? fixture.sources.map((s) => ({
      text: typeof s.text === "string" ? s.text : "",
      label: s.label || "B1 Shopify source",
      name: s.name || s.label || "B1 Shopify source",
      title: s.title || s.label || "B1 Shopify source",
      sourceType: "uploaded",
    }))
  : [];

const reviewBody = {
  draftText,
  outputType: "reporting_commentary",
  requiredVersion: "complete",
  options: {
    pipelineRoute: "v4",
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
    outputType: "reporting_commentary",
  },
  sources,
};

console.log(`POST ${PRODUCTION_URL}/api/analyse-statements`);
console.log(`draftChars=${draftText.length} sources=${sources.length} sourceChars=${sources[0]?.text?.length ?? 0}`);
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
const coverage = payload?.meta?.draftCoverage || null;
const dateCard = statements.find((row) => String(row?.qcCard?.statement ?? "").startsWith("Date: October 12"));

const extract = {
  http: res.status,
  wallMs: ms,
  traceId: payload?.meta?.traceId ?? null,
  pipelineVersion: payload?.meta?.pipelineVersion ?? null,
  cards: statements.length,
  reviewSummary: summary,
  notChecked: summary?.notChecked ?? null,
  draftCoverage: coverage,
  sourceIngestionWarning: payload?.meta?.sourceIngestionWarning ?? null,
  dateCard: dateCard
    ? {
        statement: dateCard.qcCard?.statement ?? null,
        displayVerdict: dateCard.qcCard?.displayVerdict ?? null,
        primaryExcerpt: dateCard.qcCard?.primaryExcerpt ?? null,
        excerptNotLocatable: dateCard.qcCard?.excerptNotLocatable ?? null,
        hasRealExcerpt: dateCard.qcCard?.hasRealExcerpt ?? null,
        primaryRefTitle: dateCard.qcCard?.primaryRefTitle ?? null,
      }
    : null,
  b1QuoteCards: statements.filter((row) =>
    String(row?.qcCard?.primaryExcerpt ?? "").includes("evaluating an investment of up to $7,000,000")
  ).length,
  locatableHoles: statements.filter((row) => row?.qcCard?.excerptNotLocatable === true).length,
};

writeFileSync(path.join(OUT_DIR, "production-review.json"), JSON.stringify(payload));
writeFileSync(path.join(OUT_DIR, "production-extract.json"), JSON.stringify(extract, null, 2));
console.log(JSON.stringify(extract, null, 2));
