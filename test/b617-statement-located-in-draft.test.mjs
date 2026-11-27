/**
 * B617. Every statement that appears in the draft gets a real span.
 * Never emit {0,0} when the text is findable; normalised locate recovers
 * whitespace and quote variants.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  applyEnsuredSpans,
  ensureDraftSpans,
  locateStatements,
  normalizeLocateText,
} from "../lib/qc/locate-statement.mjs";
import { formatAgeFromDates } from "../lib/qc/source-recency.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const R249D = JSON.parse(
  readFileSync(path.join(ROOT, "../scripts/diagnostic/b617/R-249D-review.json"), "utf8"),
);

const DRAFT = [
  "In November 2026, we agreed to invest in Shopify, a SaaS platform that enables small and mid-sized businesses to set up and run online stores in a few hours.",
  "",
  "Shopify combines simple, self-serve onboarding with a recurring subscription model and transaction fees, serving over 1,000,000 merchants and adding roughly 10,000 paying customers a week. The platform's open API and App Store, with strong adoption by both merchants and developers, extend functionality without adding product complexity.",
  "",
  "Our investment thesis centers on: (i) strong organic growth, with monthly recurring revenue up 151% in the twelve months to October 2010, (ii) attractive customer acquisition economics, with payback in 7-9 months, and (iii) exposure to two long-term themes: the consumerization of enterprise software and the continued growth of e-commerce among SMBs.",
].join("\n");

const STATEMENTS = R249D.statements.map((row) => row.text);

test("R-249D Shopify sentence is located after the paragraph break", () => {
  const spans = locateStatements(DRAFT, STATEMENTS);
  assert.ok(spans[1]);
  assert.equal(DRAFT.slice(spans[1].start, spans[1].end), STATEMENTS[1]);
  assert.ok(spans[1].start > 0);
  assert.ok(spans[1].end > spans[1].start);
});

test("ensureDraftSpans repairs a zero span when the text is in the draft", () => {
  const broken = STATEMENTS.map((text, i) => ({
    text,
    startChar: i === 1 ? 0 : undefined,
    endChar: i === 1 ? 0 : undefined,
  }));
  const spans = ensureDraftSpans(DRAFT, broken);
  assert.ok(spans[1]);
  assert.notEqual(spans[1].start, 0);
  assert.ok(spans[1].end > spans[1].start);
  const applied = applyEnsuredSpans(DRAFT, broken);
  assert.equal(applied[1].draftSpan.startChar, spans[1].start);
  assert.equal(applied[1].draftSpan.endChar, spans[1].end);
  assert.notDeepEqual(applied[1].draftSpan, { startChar: 0, endChar: 0 });
});

test("normalised locate recovers curly quotes and non-breaking spaces", () => {
  const curly = DRAFT.replace("platform's", "platform\u2019s").replace("1,000,000", "1,000,000");
  const needle = STATEMENTS[2].replace("platform's", "platform\u2019s");
  const spans = locateStatements(curly, [STATEMENTS[0], STATEMENTS[1], needle, STATEMENTS[3]]);
  assert.ok(spans[2]);
  assert.equal(
    normalizeLocateText(curly.slice(spans[2].start, spans[2].end)).replace(/\s+/g, " "),
    normalizeLocateText(needle).replace(/\s+/g, " "),
  );
});

test("formatAgeFromDates does not throw when today is missing", () => {
  const from = new Date(Date.UTC(2010, 9, 12));
  assert.equal(formatAgeFromDates(from, undefined).length > 0, true);
  assert.doesNotThrow(() => formatAgeFromDates(from, null));
});
