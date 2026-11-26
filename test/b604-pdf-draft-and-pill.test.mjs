/**
 * B604. Aldermoor PDF: an S-marker that wraps to a new line no longer draws that
 * line over the one above, the block after the draft starts below it, and the
 * Assessment pill takes the screen colour when no tone is sent.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { exportBlocks } from "../lib/export/export-blocks.mjs";
import { renderPdf } from "../lib/export/render-pdf.mjs";

const sentences = [
  "In October 2026, Halden Group committed to Aldermoor Capital Fund VI, a European mid-market buyout fund managed by Aldermoor Capital. ",
  "The fund will continue Aldermoor's strategy of control investments in healthcare, business services, and industrial technology companies in the DACH region, the Benelux, and the Nordics, typically backing founder-owned and family-owned businesses. ",
  "Aldermoor plans to build a portfolio of 12-15 portfolio companies with enterprise values of EUR 150-500 million, using an operational value creation model supported by a nine-person portfolio team focused on pricing, procurement, digital, and finance. ",
  "The investment fits Halden Group's primary program focus on European mid-market managers with distinctive sourcing and operational capabilities and maintains exposure to preferred sectors. ",
  "Halden Group has invested with Aldermoor since 2015 across Funds III, IV, and V, and has completed two co-investments alongside the manager.",
];
const document = {
  title: { name: "Reporting commentary: review", verdict: "Needs work", sourceNames: ["Commitment"] },
  summary: { readiness: "Needs work", facts: "22 of 23", counts: [] },
  draft: sentences.map((text, i) => ({ text, marker: `S${i + 1}` })),
  fullDraft: sentences.join(""),
  cards: [],
  sources: [],
  disclaimer: "One reader's view.",
  howToRead: { title: "How to read this review", labels: [], lineNote: "Line numbers.", disclaimer: "One reader's view." },
};

function hasPdftotext() {
  try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; }
}

test("the Assessment pill is amber for Needs work and red for Needs significant work", () => {
  const pill = (verdict) => exportBlocks({ ...document, title: { ...document.title, verdict } }, { draft: true })
    .flatMap((block) => block.lines || [block]).find((line) => line?.kind === "assessmentPill");
  assert.equal(pill("Needs work")?.tone, "amber");
  assert.equal(pill("Needs significant work")?.tone, "red");
});

test.runIf(hasPdftotext())("no two draft lines share a baseline band, and the next block starts below the draft", async () => {
  const dir = mkdtempSync(join(tmpdir(), "b604-"));
  const file = join(dir, "draft.pdf");
  writeFileSync(file, await renderPdf(document, { draft: true }));
  const xml = execFileSync("pdftotext", ["-bbox", "-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
  const words = [...xml.matchAll(/yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">([^<]+)</g)]
    .map((m) => ({ top: Number(m[1]), bottom: Number(m[2]), text: m[3] }));
  const tops = [...new Set(words.filter((w) => w.bottom - w.top > 8).map((w) => Math.round(w.top)))].sort((a, b) => a - b);
  for (let i = 1; i < tops.length; i += 1) assert.ok(tops[i] - tops[i - 1] >= 10, `lines at ${tops[i - 1]} and ${tops[i]} overlap`);
  const manager = words.find((w) => w.text === "manager.");
  const how = words.find((w) => w.text === "How");
  assert.ok(manager && how && how.top > manager.bottom, "the block after the draft starts below its last line");
});

test.runIf(hasPdftotext())("every draft paragraph starts at the same left edge", async () => {
  const paragraphs = ["First paragraph of the draft.\n\n", "Second paragraph.\n\n", "Third paragraph."];
  const doc = { ...document, draft: paragraphs.map((text, i) => ({ text, marker: `S${i + 1}` })), fullDraft: paragraphs.join("") };
  const dir = mkdtempSync(join(tmpdir(), "b604-"));
  const file = join(dir, "paras.pdf");
  writeFileSync(file, await renderPdf(doc, { draft: true }));
  const xml = execFileSync("pdftotext", ["-bbox", "-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
  const left = (word) => Number(xml.match(new RegExp(`xMin="([\\d.]+)"[^>]*>${word}<`))[1]);
  assert.ok(Math.abs(left("First") - left("Second")) < 1);
  assert.ok(Math.abs(left("First") - left("Third")) < 1);
});
