#!/usr/bin/env node
/**
 * B277 Part D. One production Review of a sized fixture with a realistic source.
 * Usage: node scripts/diagnostic/delivery-check/b277-production-review.mjs run1-150
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/b277");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/delivery-check/b277-runs");
mkdirSync(OUT_DIR, { recursive: true });

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const id = String(process.argv[2] || "").trim();
if (!id) {
  console.error("usage: b277-production-review.mjs <run1-150|run2-500|run3-1500|run4-memo>");
  process.exit(1);
}

const draftText = readFileSync(path.join(FIXTURE_DIR, `${id}.draft.txt`), "utf8");
const sourceText = readFileSync(path.join(FIXTURE_DIR, `${id}.source.txt`), "utf8");
const manifest = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "manifest.json"), "utf8"));
const fixture = (manifest.fixtures || []).find((row) => row.id === id) || { id };

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
  sources: [
    {
      text: sourceText,
      label: "Shopify source extract",
      name: "Shopify source extract",
      title: "Shopify source extract",
      sourceType: "uploaded",
    },
  ],
};

function countVerdict(cards, field, value) {
  return cards.filter((c) => c?.[field] === value).length;
}

console.log(`POST ${PRODUCTION_URL}/api/analyse-statements id=${id}`);
console.log(
  `draftWords=${fixture.draftWordCount} draftChars=${draftText.length} ` +
    `sourceWords=${fixture.sourceWordCount} sourceChars=${sourceText.length}`
);
const t0 = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 320_000);
let res;
let payload;
try {
  res = await fetch(`${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reviewBody),
    signal: controller.signal,
  });
  payload = await res.json();
} finally {
  clearTimeout(timer);
}
const ms = Date.now() - t0;
const statements = Array.isArray(payload?.statements) ? payload.statements : [];
const cards = statements.map((row) => row?.qcCard).filter((c) => c && typeof c === "object");
const summary = payload?.meta?.reviewSummary || null;
const spend = payload?.meta?.llmSpend || null;
const editorialNotReviewed = countVerdict(cards, "editorialVerdict", "not_reviewed");
const complianceNotReviewed = countVerdict(cards, "complianceVerdict", "not_reviewed");
const commentaryNotReviewed = cards.filter((c) => c.commentaryNotReviewed === true).length;
const editorialDone = cards.length - editorialNotReviewed;
const complianceDone = cards.length - complianceNotReviewed;

const extract = {
  id,
  http: res?.status ?? null,
  ok: payload?.ok ?? null,
  error: payload?.error ?? null,
  wallMs: ms,
  traceId: payload?.meta?.traceId ?? null,
  pipelineVersion: payload?.meta?.pipelineVersion ?? null,
  fixture,
  cards: cards.length,
  editorialCompleted: editorialDone,
  editorialNotReviewed,
  complianceCompleted: complianceDone,
  complianceNotReviewed,
  commentaryNotReviewed,
  notChecked: summary?.notChecked ?? null,
  rateLimitBoundHits: payload?.meta?.rateLimitBoundHits ?? summary?.rateLimitBoundHits ?? null,
  rateLimitLastWait: payload?.meta?.rateLimitLastWait ?? null,
  stageSchedules: payload?.meta?.stageSchedules ?? null,
  llmSpend: spend,
  reviewSummary: summary,
  preflight: payload?.meta?.preflight ?? null,
};

writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(payload));
writeFileSync(path.join(OUT_DIR, `${id}-extract.json`), JSON.stringify(extract, null, 2));
console.log(JSON.stringify(extract, null, 2));
