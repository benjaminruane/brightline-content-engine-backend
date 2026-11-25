import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { EXPORT_STYLE } from "../lib/export/export-style.mjs";
import { exportLines } from "../lib/export/export-blocks.mjs";
import { renderPdf } from "../lib/export/render-pdf.mjs";
import { reviewReference } from "../lib/export/review-reference.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pdfText(buffer) {
  const raw = buffer.toString("latin1");
  const parts = [];
  for (const match of raw.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = match[1].replace(/\s+/g, "");
    if (hex.length < 2 || hex.length % 2 !== 0) continue;
    let text = "";
    for (let i = 0; i < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    if (/[A-Za-z]/.test(text)) parts.push(text);
  }
  return parts.join("");
}

function sampleDocument() {
  return {
    title: {
      name: "Reporting commentary review",
      verdict: "Needs work",
      detail: "Reporting commentary · Complete · v5 · 120 words (80 to 160 range)",
      writingFor: "Writing for Patria",
      reviewed: "Reviewed 24/11/2026, 15:30 GMT+8 · Ref R-7F3A",
      sourceNames: ["Half-year report"],
      exported: "Exported 24/11/2026, 15:45 GMT+8 by Ada · Content Engine 0.9.8",
    },
    summary: {
      readiness: "Needs work",
      facts: "23 of 24 figures, dates and names appear in the source",
      counts: ["2 sentences need a look"],
      houseStyle: "House style: 1 note, applied",
      editorial: "Editorial and caution: nothing raised",
    },
    draft: [{ text: "The trust returned 3.1%.", marker: "S1" }],
    cards: [{
      heading: "S1 · Needs a look",
      tone: "amber",
      attention: true,
      sentence: "The trust returned 3.1%.",
      reason: "The source states a total return of 3.1% and does not state the period in the same words.",
      passages: [{ text: "NAV Total Return for the six months was 3.1%.", lines: "L12" }],
      also: null,
      concerns: [],
    }, {
      heading: "S2 · Nothing raised",
      tone: "green",
      sentence: "The dividend is 18.4 pence.",
      reason: "The source states the dividend.",
      passages: [{ text: "Proposed Dividend Per Share 18.4 pence.", lines: "L14" }],
      concerns: [],
    }],
    needsAttention: [],
    nothingRaised: [],
    reviewerNote: "The draft is close to the source.",
    sources: [{ name: "Half-year report", publication: "Published externally", fileType: "PDF", description: "The interim report." }],
    disclaimer: "This is one reader's view of the draft against the sources supplied.",
    header: "Reporting commentary review · v5 · R-7F3A",
    properties: {
      title: "Reporting commentary review v5",
      subject: "Reporting commentary review R-7F3A",
      author: "Ada",
      keywords: "Content Engine, R-7F3A, v5",
      creator: "Content Engine 0.9.8",
    },
  };
}

const ALL = { reviewSummary: true, draft: true, cards: true, note: true, sources: true };

test("a review reference stays with its id and changes when the id changes", () => {
  const first = reviewReference("analysis_1");
  assert.equal(reviewReference("analysis_1"), first);
  assert.match(first, /^R-[0-9A-F]{4}$/);
  assert.notEqual(reviewReference("analysis_2"), first);
  assert.throws(() => reviewReference(""), /review id is missing/);
});

test("pdf prints the shared sections from the shared style", async () => {
  const file = "lib/export/render-pdf.mjs";
  const src = readFileSync(path.join(ROOT, file), "utf8");
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(src), false, file);
  assert.equal(/Helvetica/.test(src), false, file);
  assert.equal(/fontSize\(\s*\d/.test(src), false, file);
  assert.equal(src.includes("EXPORT_STYLE"), true, file);
  assert.equal(EXPORT_STYLE.font.family, "Helvetica");
  const document = sampleDocument();
  const lines = exportLines(document, ALL);
  const pdf = pdfText(await renderPdf(document, ALL));
  for (const heading of ["Reporting commentary review", "Review summary", "Needs work", "Draft", "Sentence review", "S1 · Needs a look", "S2 · Nothing raised", "Reviewer's note", "Sources", "Half-year report", "How to read this review"]) {
    assert.equal(pdf.includes(heading), true, heading);
  }
  const order = ["Draft", "Sources", "Review summary", "Reviewer's note", "Sentence review", "How to read this review"];
  let cursor = -1;
  for (const heading of order) {
    const at = lines.indexOf(heading);
    assert.equal(at > cursor, true, heading);
    cursor = at;
  }
  const attention = exportLines(document, { ...ALL, attentionOnly: true });
  assert.equal(attention.includes("S2 · Nothing raised"), false);
  assert.equal(attention.includes("S1 · Needs a look"), true);
  assert.equal(pdf.includes("evidence concern"), false);
  assert.equal(lines.join("\n").includes("|"), false);
});

test("the live export file does not rebuild a verdict or an excerpt", () => {
  const src = readFileSync(path.join(ROOT, "api/export.js"), "utf8");
  assert.equal(src.includes("buildReviewData"), false);
  assert.equal(src.includes("primaryExcerpt"), false);
  assert.equal(src.includes("evidenceConcernSuffix"), false);
  assert.equal(src.includes("renderDocx"), false);
  assert.equal(src.includes("Choose a format and try again."), true);
});
