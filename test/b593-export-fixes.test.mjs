/**
 * B593. PDF-only export; footer-only pages; source names; draft paragraphs;
 * one line ref per piece; house style once; how-to-read meanings; verdict in header;
 * footnote wording; sentence wording in prompts.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  cutLineEllipsis,
  exportBlocks,
  exportLines,
  HOW_TO_READ_LABELS,
  HOW_TO_READ_LINE_NOTE,
  lineRefLabel,
  passageWithLineRef,
  sourceDisplayName,
  summaryRows,
} from "../lib/export/export-blocks.mjs";
import { renderPdf, renderPdfPageCount } from "../lib/export/render-pdf.mjs";
import { FOOTNOTE, READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("endpoint is PDF-only and Word renderer is gone", () => {
  const exportApi = readFileSync(path.join(ROOT, "api/export.js"), "utf8");
  assert.equal(exportApi.includes("renderDocx"), false);
  assert.equal(exportApi.includes("docx"), false);
  assert.match(exportApi, /Choose a format and try again\./);
  assert.equal(existsSync(path.join(ROOT, "lib/export/render-docx.mjs")), false);
});

test("source name fallback order is name, label, fileName, sourceName, title", () => {
  assert.equal(sourceDisplayName({ name: "Named", label: "Label", fileName: "file.pdf" }), "Named");
  assert.equal(sourceDisplayName({ label: "Label", fileName: "file.pdf" }), "Label");
  assert.equal(sourceDisplayName({ fileName: "file.pdf", sourceName: "src", title: "Title" }), "file.pdf");
  assert.equal(sourceDisplayName({ sourceName: "src", title: "Title" }), "src");
  assert.equal(sourceDisplayName({ title: "Title" }), "Title");
  assert.equal(sourceDisplayName({}), "");
});

test("line refs are one per piece, use to, and ellipsis only mid-sentence", () => {
  assert.equal(lineRefLabel("L3"), "(line 3)");
  assert.equal(lineRefLabel("L6–L7"), "(lines 6 to 7)");
  assert.equal(lineRefLabel("6-7"), "(lines 6 to 7)");
  assert.equal(lineRefLabel("(line 3)"), "(line 3)");
  assert.doesNotMatch(lineRefLabel("L6–L7"), /\u2013/);
  assert.equal(cutLineEllipsis("The return was 3.1%."), "The return was 3.1%.");
  assert.equal(cutLineEllipsis("NAV total return of 3.1% (31"), "NAV total return of 3.1% (31 …");
  assert.equal(
    passageWithLineRef("NAV total return of 3.1% (31 (line 3)", "L3"),
    "NAV total return of 3.1% (31 … (line 3)"
  );
  assert.equal(
    passageWithLineRef("The return was 3.1%. (line 3)", "L3"),
    "The return was 3.1%. (line 3)"
  );
  const once = passageWithLineRef("Share price return of 5.5% (31", "L6–L7");
  assert.equal((once.match(/\(lines? /g) || []).length, 1);
  assert.match(once, /\(lines 6 to 7\)$/);
  assert.doesNotMatch(once, /\u2013/);
});

test("house style appears once; how-to-read lines; verdict in header; draft paragraphs", () => {
  const document = {
    title: {
      name: "Harbourline: review",
      verdict: "Needs significant work",
      sourceNames: ["Harbourline memo"],
    },
    summary: {
      readiness: "Needs significant work",
      facts: "2 of 3 figures appear in the source",
      counts: ["House style: 2 notes", "1 sentence needs a look"],
      houseStyle: "House style: 2 notes",
      editorial: "Editorial notes and cautions: none",
    },
    draft: [{ text: "First paragraph.\n\nSecond paragraph keeps its break.", marker: "S1" }],
    cards: [{
      heading: "S1 · Needs a look",
      tone: "amber",
      attention: true,
      sentence: "First paragraph.",
      reason: "The source does not state the period.",
      passages: [{ text: "NAV total return of 3.1% (31", lines: "L15" }],
      concerns: [],
    }],
    reviewerNote: "Keep periods close to the source.",
    sources: [{
      name: "",
      label: "Harbourline memo",
      description: "Board pack for Q2.",
      publication: "Published externally",
      fileType: "PDF",
    }],
    howToRead: {
      title: "How to read this review",
      labels: HOW_TO_READ_LABELS.slice(),
      lineNote: HOW_TO_READ_LINE_NOTE,
      disclaimer: "This is one reader's view of the draft against the sources supplied.",
    },
    disclaimer: "This is one reader's view of the draft against the sources supplied.",
  };

  const rows = summaryRows(document.summary);
  assert.equal(rows.filter((row) => /house style/i.test(row)).length, 1);

  const lines = exportLines(document, {
    draft: true,
    sources: true,
    reviewSummary: true,
    note: true,
    cards: true,
  });
  assert.equal(lines.includes("Needs significant work"), true);
  assert.equal(lines.indexOf("Needs significant work") < lines.indexOf("Draft"), true);
  assert.equal(lines.includes("Harbourline memo"), true);
  assert.equal(lines.includes("Board pack for Q2."), true);
  assert.equal(lines.includes("Untitled source"), false);
  assert.equal(lines.filter((line) => line === "House style: 2 notes").length, 1);
  for (const label of HOW_TO_READ_LABELS) {
    assert.equal(lines.includes(label), true, label);
  }
  assert.equal(lines.includes(HOW_TO_READ_LINE_NOTE), true);
  assert.ok(lines.some((line) => /First paragraph/.test(line)));
  assert.ok(lines.some((line) => /Second paragraph keeps its break/.test(line)));

  const blocks = exportBlocks(document, { draft: true, cards: true });
  const draft = blocks.find((block) => block.kind === "draft");
  assert.match(draft.sentences[0].text, /\n\n/);
  const passage = blocks.find((block) => block.kind === "passage");
  assert.equal((String(passage.inline).match(/\(line /g) || []).length, 1);
  assert.match(passage.inline, /\(line 15\)$/);
});

test("footer writing does not create footer-only pages", async () => {
  const cards = Array.from({ length: 18 }, (_, index) => ({
    heading: `S${index + 1} · Needs a look`,
    tone: "amber",
    attention: true,
    sentence: `Sentence ${index + 1} says the fund returned ${index + 1}.1 percent in the half year.`,
    reason: `The source does not state the period for sentence ${index + 1} in the same words as the draft.`,
    passages: [{
      text: `NAV total return of ${index + 1}.1% for the six months ended 30 September`,
      lines: `L${index + 10}`,
    }],
    concerns: [],
  }));
  const document = {
    title: { name: "Long review", verdict: "Needs significant work" },
    summary: {
      readiness: "Needs significant work",
      facts: "0 of 0 figures appear in the source",
      counts: ["18 sentences need a look"],
      houseStyle: "",
      editorial: "Editorial notes and cautions: none",
    },
    draft: cards.map((card) => ({ text: card.sentence + " ", marker: card.heading.split(" · ")[0] })),
    cards,
    reviewerNote: "A longer note so the review spans several pages when every card is printed.",
    sources: [{ name: "Source pack", description: "Many pages of numbers.", publication: "Internal", fileType: "PDF" }],
    disclaimer: "This is one reader's view of the draft against the sources supplied.",
    header: "Long review · R-1D84",
  };
  const counted = await renderPdfPageCount(document, {
    draft: true,
    sources: true,
    reviewSummary: true,
    note: true,
    cards: true,
  });
  assert.equal(counted.footerOnlyPages, 0);
  assert.equal(counted.pageCount, counted.contentPages);
  assert.ok(counted.pageCount >= 2);
  const buffer = await renderPdf(document, {
    draft: true, sources: true, reviewSummary: true, note: true, cards: true,
  });
  assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
});

test("footnote and prompts say sources / the sentence", () => {
  assert.equal(
    FOOTNOTE,
    "Every figure, date and name is checked against your sources. Everything else is an assessment of what those sources support."
  );
  assert.match(READING_NOTE_PROMPT, /which supports the sentence/);
  assert.match(READING_NOTE_PROMPT, /in line with the sentence/);
  assert.match(READING_NOTE_PROMPT, /as the sentence says/);
  assert.doesNotMatch(READING_NOTE_PROMPT, /supports the statement/);
  const stage2 = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md"), "utf8");
  assert.match(stage2, /refer to the draft as the sentence, not the statement/);
  const matchSources = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/stage2-match-sources.mjs"), "utf8");
  assert.match(matchSources, /while the sentence claims/);
});
