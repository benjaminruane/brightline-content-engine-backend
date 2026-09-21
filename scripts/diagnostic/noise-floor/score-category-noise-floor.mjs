/**
 * Pure scoring for B195 category noise floor.
 * Counts come from raw card fields. reviewSummary is recorded, not trusted
 * for the null-compliance column.
 */

import { classifyCard, summariseReview } from "../../../lib/qc/review-summary.mjs";
import { asReviewOptions } from "../../../lib/qc/review-options.mjs";

export const CATEGORY_KEYS = [
  "all",
  "confirmed",
  "partial",
  "conflicting",
  "notSupported",
  "editorial",
  "compliance",
  "notChecked",
  "complianceNullOn",
  "needsAttention",
  "readiness",
];

export const CATEGORY_LABELS = {
  all: "All",
  confirmed: "Confirmed",
  partial: "Partial",
  conflicting: "Conflicting",
  notSupported: "No support",
  editorial: "Editorial",
  compliance: "Compliance",
  notChecked: "Not checked",
  complianceNullOn: "compliance null with compliance on",
  needsAttention: "Needs attention",
  readiness: "readiness label",
};

function reviewFlags(meta) {
  return asReviewOptions(meta?.reviewOptions);
}

function statementText(stmt) {
  if (typeof stmt?.text === "string" && stmt.text.trim()) return stmt.text;
  const card = stmt?.qcCard;
  if (typeof card?.statement === "string" && card.statement.trim()) return card.statement;
  return "";
}

function emptyCounts() {
  return {
    all: 0,
    confirmed: 0,
    partial: 0,
    conflicting: 0,
    notSupported: 0,
    editorial: 0,
    compliance: 0,
    notChecked: 0,
    complianceNullOn: 0,
    needsAttention: 0,
  };
}

export function countsFromCards(cards, reviewOptions) {
  const opts = asReviewOptions(reviewOptions);
  const counts = emptyCounts();
  const list = Array.isArray(cards) ? cards : [];
  for (const card of list) {
    if (!card || typeof card !== "object") continue;
    const cls = classifyCard(card, opts);
    if (!cls.counted) continue;
    counts.all += 1;
    if (cls.evidence === "confirmed") counts.confirmed += 1;
    if (cls.evidence === "partial") counts.partial += 1;
    if (cls.evidence === "conflicting") counts.conflicting += 1;
    if (cls.evidence === "notSupported") counts.notSupported += 1;
    if (cls.editorial === "concern" || cls.editorial === "hardConcern") counts.editorial += 1;
    if (cls.compliance === "concern" || cls.compliance === "hardConcern") counts.compliance += 1;
    if (cls.editorial === "notChecked" || cls.compliance === "notChecked") counts.notChecked += 1;
    if (opts.complianceEnabled && card.complianceVerdict === null) counts.complianceNullOn += 1;
    if (cls.needsAttention) counts.needsAttention += 1;
  }
  return counts;
}

/**
 * Pull the D6 fields from an analyse-statements JSON body.
 * extras: wallTimeMs, costUsd, costSource, log
 */
export function extractRunFromResponse(payload, extras = {}) {
  const data = payload && typeof payload === "object" ? payload : {};
  const statements = Array.isArray(data.statements) ? data.statements : [];
  const meta = data.meta && typeof data.meta === "object" ? data.meta : {};
  const reviewOptions = reviewFlags(meta);
  const cards = [];
  for (const stmt of statements) {
    const qcCard = stmt?.qcCard && typeof stmt.qcCard === "object" ? stmt.qcCard : {};
    const text = statementText(stmt);
    const cls = classifyCard(qcCard, reviewOptions);
    cards.push({
      text,
      displayVerdict: qcCard.displayVerdict ?? null,
      editorialVerdict: Object.prototype.hasOwnProperty.call(qcCard, "editorialVerdict")
        ? qcCard.editorialVerdict
        : undefined,
      complianceVerdict: Object.prototype.hasOwnProperty.call(qcCard, "complianceVerdict")
        ? qcCard.complianceVerdict
        : undefined,
      summaryClass: qcCard.summaryClass ?? cls,
    });
  }
  const qcCards = statements.map((stmt) => stmt?.qcCard).filter((card) => card && typeof card === "object");
  const counts = countsFromCards(qcCards, reviewOptions);
  const reviewSummary =
    meta.reviewSummary && typeof meta.reviewSummary === "object"
      ? meta.reviewSummary
      : summariseReview(qcCards, reviewOptions);
  const log =
    extras.log && typeof extras.log === "object"
      ? extras.log
      : {
          cacheHits: 0,
          cacheMisses: 0,
          stage1Hits: 0,
          stage1bHits: 0,
          stage2Hits: 0,
          summaryLogged: false,
          editorialSchemaFailures: 0,
          complianceParseFailures: 0,
        };
  return {
    statementCount: counts.all,
    cards,
    counts,
    readiness: typeof reviewSummary?.readiness === "string" ? reviewSummary.readiness : null,
    reviewSummary,
    reviewOptions,
    modelConfig: meta.modelConfig ?? null,
    traceId: typeof meta.traceId === "string" ? meta.traceId : null,
    wallTimeMs: Number.isFinite(extras.wallTimeMs) ? extras.wallTimeMs : null,
    costUsd: Number.isFinite(extras.costUsd) ? extras.costUsd : null,
    costSource: typeof extras.costSource === "string" ? extras.costSource : null,
    log,
  };
}

function textsOf(run) {
  return (Array.isArray(run?.cards) ? run.cards : []).map((card) => String(card?.text ?? ""));
}

function categoryValue(run, key) {
  if (key === "readiness") return run?.readiness ?? null;
  return Number(run?.counts?.[key]) || 0;
}

function numericRange(values) {
  const nums = values.map((v) => Number(v) || 0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, range: max - min, values: nums };
}

function labelRange(values) {
  const labels = values.map((v) => (v == null ? "" : String(v)));
  const unique = [...new Set(labels)];
  return {
    min: unique[0] ?? "",
    max: unique[unique.length - 1] ?? "",
    range: Math.max(0, unique.length - 1),
    values: labels,
  };
}

const FLIP_FIELDS = [
  ["displayVerdict", "displayVerdict"],
  ["editorialVerdict", "editorialVerdict"],
  ["complianceVerdict", "complianceVerdict"],
  ["evidenceClass", "summaryClass.evidence"],
  ["editorialClass", "summaryClass.editorial"],
  ["complianceClass", "summaryClass.compliance"],
  ["needsAttention", "summaryClass.needsAttention"],
];

function fieldValue(card, path) {
  if (path === "displayVerdict") return card?.displayVerdict ?? null;
  if (path === "editorialVerdict") return card?.editorialVerdict ?? null;
  if (path === "complianceVerdict") return card?.complianceVerdict ?? null;
  if (path === "summaryClass.evidence") return card?.summaryClass?.evidence ?? null;
  if (path === "summaryClass.editorial") return card?.summaryClass?.editorial ?? null;
  if (path === "summaryClass.compliance") return card?.summaryClass?.compliance ?? null;
  if (path === "summaryClass.needsAttention") return card?.summaryClass?.needsAttention ?? null;
  return null;
}

function sameValue(a, b) {
  return Object.is(a, b) || (a == null && b == null);
}

/**
 * D7 table. If the statement split differs, flips are empty and splitChanged is true.
 */
export function scoreFixtureRuns(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const split = list.map((run, index) => ({
    runIndex: index + 1,
    statementCount: Number(run?.statementCount) || 0,
    texts: textsOf(run),
  }));
  const splitChanged =
    split.length > 1 &&
    split.slice(1).some((row) => JSON.stringify(row.texts) !== JSON.stringify(split[0].texts));

  const categories = CATEGORY_KEYS.map((key) => {
    const values = list.map((run) => categoryValue(run, key));
    const stats = key === "readiness" ? labelRange(values) : numericRange(values);
    return {
      key,
      label: CATEGORY_LABELS[key],
      ...stats,
    };
  });

  const flips = [];
  if (!splitChanged && list.length > 1) {
    const texts = split[0].texts;
    for (const text of texts) {
      if (!text) continue;
      const series = list.map((run) => (run.cards || []).find((card) => card.text === text) || null);
      for (const [field, path] of FLIP_FIELDS) {
        let previous = fieldValue(series[0], path);
        for (let i = 1; i < series.length; i++) {
          const current = fieldValue(series[i], path);
          if (!sameValue(previous, current)) {
            flips.push({
              text,
              field,
              from: previous,
              to: current,
              fromRun: i,
              toRun: i + 1,
            });
          }
          previous = current;
        }
      }
    }
  }

  return { splitChanged, split, categories, flips };
}

export function formatScoreTable(scored) {
  const rows = Array.isArray(scored?.categories) ? scored.categories : [];
  const lines = ["category | min | max | range", "--- | --- | --- | ---"];
  for (const row of rows) {
    lines.push(`${row.label} | ${row.min} | ${row.max} | ${row.range}`);
  }
  return lines.join("\n");
}
