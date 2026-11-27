/**
 * B617. A dated memo header is always detected into recencySummary, even when
 * no sentence fires a source-recency concern.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { extractSourceAsOfDate } from "../lib/qc/source-recency.mjs";
import { recencySummary, sourceDateLine, sourceDateRowsFromSources } from "../lib/qc/recency-summary.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const R249D = JSON.parse(
  readFileSync(path.join(ROOT, "../scripts/diagnostic/b617/R-249D-review.json"), "utf8"),
);

const TODAY = new Date(Date.UTC(2026, 10, 27));

test("Date: October 12, 2010 memo header is detected with CRLF line endings", () => {
  const asOf = extractSourceAsOfDate(R249D.sources[0].text);
  assert.ok(asOf);
  assert.equal(asOf.cue, "Date: label");
  assert.equal(asOf.raw, "October 12, 2010");
});

test("recencySummary includes the document-level source date row for R-249D", () => {
  const cards = R249D.statements.map((row) => ({
    ...(row.qcCard || {}),
    index: Number(row.id),
    sourceRecencyConcerns: [],
  }));
  const summary = recencySummary(cards, R249D.sources, { today: TODAY });
  assert.ok(summary.length >= 1);
  assert.equal(summary[0].name, "Shopify (text).txt");
  assert.equal(summary[0].date, "October 12, 2010");
  assert.match(summary[0].age, /16 years/);
  assert.match(
    sourceDateLine(summary[0]),
    /Shopify \(text\)\.txt is dated October 12, 2010 \(16 years ago\)/,
  );
});

test("sourceDateRowsFromSources alone yields the B612 Assessment row shape", () => {
  const rows = sourceDateRowsFromSources(R249D.sources, { today: TODAY });
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { name: rows[0].name, date: rows[0].date, age: rows[0].age },
    { name: "Shopify (text).txt", date: "October 12, 2010", age: "16 years" },
  );
});
