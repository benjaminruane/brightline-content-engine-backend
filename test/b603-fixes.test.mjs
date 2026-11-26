/**
 * B603. Encoding, Rule B, Northwharf empty excerpt, F64 status dates,
 * growth periods, Generate value-creation / terms / periods.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { decodeTextBytes, detectTextEncoding } from "../lib/ingest/text-encoding.mjs";
import { applyExitGateToResponse } from "../lib/qc/exit-gate.mjs";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { findGrowthPeriodNotes } from "../lib/qc/growth-period-check.mjs";
import { composeBasePrompt } from "../lib/prompt-library/compose.mjs";
import { textTypeModule } from "../lib/prompt-library/text-types/index.mjs";
import { conflictingFigureInstruction } from "../lib/prompt-library/methodology-note.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

function gate(body, extra = {}) {
  return applyExitGateToResponse(restampAnalyseResponse(body), extra);
}

test("F65 shopify-cp1252.txt decodes curly quotes with no replacement characters", () => {
  const buf = readFileSync(path.join(ROOT, "fixtures/b603/shopify-cp1252.txt"));
  assert.equal(detectTextEncoding(buf), "windows-1252");
  const text = decodeTextBytes(buf);
  assert.doesNotMatch(text, /\uFFFD/);
  assert.match(text, /[\u2018\u2019\u201C\u201D]/); // curly quotes / apostrophes
});

test("A1 Harbourline S7 Rule B greens when 2020 is on the shown line", () => {
  const out = gate(load("fixtures/b602/harbourline.json"), {
    dealStatus: "Signed or agreed",
    subject: "Harbourline Foods",
    eventType: "EXIT_OR_REALISATION",
  });
  const s7 = out.statements[6].qcCard;
  assert.equal(s7.sentenceState, "nothing_raised");
  assert.equal(s7.sentenceLabel, "Nothing raised");
  assert.equal(s7.statusDependent, false);
  assert.match(String(s7.statement || out.statements[6].text), /2020/);
});

test("A2 Northwharf S2 shows Nothing in the source addresses this with no excerpt", () => {
  const out = gate(load("fixtures/b602/northwharf.json"));
  const s2 = out.statements[1].qcCard;
  assert.equal(s2.emptyEvidenceCopy, "Nothing in the source addresses this.");
  assert.equal(s2.excerptAbsent, true);
  assert.equal(String(s2.primaryExcerptText || s2.primaryExcerpt || ""), "");
  assert.doesNotMatch(String(s2.shownReason || ""), /closest passage|document title/i);
});

test("F64 Shopify S1 Completed names both dates and hides status buttons", () => {
  const out = gate(load("fixtures/b603/shopify.json"), { dealStatus: "Completed" });
  const s1 = out.statements[0].qcCard;
  assert.equal(s1.sentenceState, "conflicts");
  assert.match(s1.shownReason, /memo is dated 12 October 2010/i);
  assert.match(s1.shownReason, /November 2026/);
  assert.equal(s1.statusDependent, false);
  assert.equal(s1.statusNeedsConfirm, false);
  assert.doesNotMatch(s1.shownReason, /\sfor\.\s*$/);
});

test("F62 growth figure without a period raises an editorial note", () => {
  const notes = findGrowthPeriodNotes("Revenue grew 151% and the team is expanding.");
  assert.ok(notes.length >= 1);
  assert.match(notes[0].message, /period/i);
  const withPeriod = findGrowthPeriodNotes("Revenue grew 151% in the 12 months to October 2010.");
  assert.equal(withPeriod.length, 0);
});

test("F61 Generate covers value creation for new direct and add-on", () => {
  for (const id of ["NEW_DIRECT_INVESTMENT", "ADD_ON_DIRECT_INVESTMENT"]) {
    const mod = textTypeModule(id);
    const blob = [...(mod.essential || []), ...(mod.mustCover || []), mod.guidance || "", ...(mod.exclude || [])].join("\n");
    assert.match(blob, /value creation|grow the business/i);
    assert.match(blob, /100-day plan/i);
  }
});

test("F62 Generate writes growth figures with their period", () => {
  const mod = textTypeModule("NEW_DIRECT_INVESTMENT");
  assert.match(mod.guidance, /growth figure.*period|period.*growth figure|12 months to October 2010/i);
});

test("F63 Generate keeps one version of the terms and names it in Methodology", () => {
  assert.match(conflictingFigureInstruction(), /one version/i);
  assert.match(conflictingFigureInstruction(), /Do not combine figures/i);
  const prompt = composeBasePrompt({
    eventType: "NEW_DIRECT_INVESTMENT",
    outputType: "reporting_commentary",
    visibility: "complete",
    maxWords: 150,
    sources: [],
  });
  assert.match(prompt.basePromptText, /one version|Do not combine figures|Methodology Note names/i);
});

test("Ostara S4 rounding note is green after exit gate", () => {
  const out = gate(load("fixtures/b602/ostara.json"));
  const s4 = out.statements[3].qcCard;
  assert.equal(s4.sentenceState, "nothing_raised");
  assert.match(s4.shownReason, /1\.25.*rounded to.*1\.3/i);
});
