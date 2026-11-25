/**
 * B595. Card colour rules, one reason, PDF draft overlap, table-row ellipsis,
 * and US/UK spelling.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  checksDisagreeGoesGreen,
  datelineColour,
  finaliseShownReason,
  isDatelineSentence,
  matcherNamedGaps,
  relativeTimeConflictResolved,
  scrubUserReason,
} from "../lib/qc/b595-card-rules.mjs";
import { shownLabel, shownTrace } from "../lib/qc/shown-verdict.mjs";
import { applyAccountSpelling } from "../lib/qc/account-spelling.mjs";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";
import { cutLineEllipsis, passageWithLineRef } from "../lib/export/passage-cut.mjs";
import { draftFlow } from "../lib/export/export-blocks.mjs";
import { renderPdf } from "../lib/export/render-pdf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIAG = path.join(process.env.HOME || "", "ce-diagnostics/b595-diag/inputs");

function loadRun(name) {
  if (name.startsWith("R10") || name.startsWith("R11")) {
    const file = name.startsWith("R10")
      ? "ce-run-R10-harbourline.json"
      : "ce-run-R11-ostara.json";
    return JSON.parse(readFileSync(path.join(DIAG, file), "utf8"));
  }
  const bundled = JSON.parse(readFileSync(path.join(DIAG, "ce-test-runs-2026-11-25.json"), "utf8"));
  return bundled[name];
}

function cardFrom(runName, index) {
  const body = loadRun(runName);
  const statements = body.statements;
  const draftSentences = statements.map((row) => row.text || row.qcCard?.statement || "");
  const statement = statements[index];
  const qc = statement.qcCard || {};
  return {
    ...qc,
    statement: statement.text || qc.statement,
    draftSentences,
    displayVerdict: qc.displayVerdict,
    readingNote: qc.readingNote,
    matchExplanations: qc.matchExplanations || [],
    readingFacts: qc.readingFacts || [],
    statementVerdict: qc.statementVerdict,
    setBy: qc.setBy || qc.statementVerdict?.setBy,
    classificationRewrites: qc.classificationRewrites,
    stage2SourceFingerprints: qc.stage2SourceFingerprints,
  };
}

test("Rule B: R12 S2 and R16 S3 go green; R10 S8 stays amber", () => {
  const r12 = cardFrom("R12-aldermoor-generated", 1);
  assert.equal(checksDisagreeGoesGreen(r12), true);
  assert.equal(shownLabel(r12), "Nothing raised");

  const r16 = cardFrom("R16-clearpoint-traps", 2);
  assert.equal(checksDisagreeGoesGreen(r16), true);
  assert.equal(shownLabel(r16), "Nothing raised");

  const r10 = cardFrom("R10-harbourline", 7);
  assert.equal(checksDisagreeGoesGreen(r10), false);
  assert.equal(shownLabel(r10), "Needs a look");
  assert.ok(matcherNamedGaps(r10).length > 0);
});

test("dateline sentence is green on matching facts, never amber for broader", () => {
  assert.equal(isDatelineSentence("Portland, 12 May 2026."), true);
  const r17s1 = cardFrom("R17-lumio-clean", 0);
  assert.equal(datelineColour(r17s1), "nothing_raised");
  assert.equal(shownLabel(r17s1), "Nothing raised");
  assert.equal(shownTrace(r17s1).branch, "datelineFacts");
});

test("today resolves to the draft dateline before comparison", () => {
  const r17s2 = cardFrom("R17-lumio-clean", 1);
  assert.equal(relativeTimeConflictResolved(r17s2, r17s2.draftSentences), true);
  assert.equal(shownLabel(r17s2), "Nothing raised");
  assert.equal(shownTrace(r17s2).branch, "relativeTimeResolved");
});

test("one stamped reason; scrub drops the statement and internal noise", () => {
  assert.equal(scrubUserReason("The statement is broader than the source."), "The sentence is broader than the source.");
  assert.equal(scrubUserReason("The evidence check stopped short. The date matches."), "The date matches.");
  const face = finaliseShownReason({
    evidenceSummary: "The statement conflicts with the source on the date.",
    matchExplanations: [{ explanation: "The source supports the sentence." }],
  }, "nothing_raised");
  assert.equal(face.shownReason, face.evidenceSummary);
  assert.doesNotMatch(face.shownReason, /conflict/i);
  assert.doesNotMatch(face.shownReason, /\bthe statement\b/i);
});

test("amber reason keeps the gap; green never states a conflict", () => {
  const amber = finaliseShownReason({
    evidenceSummary: "The sentence and the source differ on the Irish listings.",
  }, "note_withheld");
  assert.match(amber.shownReason, /Irish listings|differ/i);
  const green = finaliseShownReason({
    evidenceSummary: "The sentence conflicts with the launch date.",
  }, "nothing_raised");
  assert.doesNotMatch(green.shownReason, /conflict/i);
});

test("table rows and bare figures skip ellipsis; line ref has a leading space", () => {
  assert.equal(cutLineEllipsis("NAV Per Share | 862.5p | 845.5p", "Next row"), "NAV Per Share | 862.5p | 845.5p");
  assert.equal(cutLineEllipsis("Net asset value (EUR m) 678 652", "Next row"), "Net asset value (EUR m) 678 652");
  assert.equal(
    cutLineEllipsis("The portfolio includes three holdings that", "remain under review."),
    "The portfolio includes three holdings that …"
  );
  assert.equal(passageWithLineRef("678 652", "L48"), "678 652 (line 48)");
  assert.match(passageWithLineRef("678 652", "L48"), / \(line 48\)$/);
});

test("draftFlow paragraph gaps stay as two breaks; PDF draft renders without throw", async () => {
  const sentences = [
    { text: "Sentence one holds the first claim.", marker: "S1" },
    { text: " Sentence two finishes the first paragraph.\n\n", marker: "S2" },
    { text: "Sentence three opens the second paragraph.", marker: "S3" },
    { text: " Sentence four closes it.\n\n", marker: "S4" },
    { text: "Read more here: www.sample-link.com", marker: "" },
  ];
  const events = draftFlow(sentences);
  const breaks = events.filter((event) => event.kind === "break").length;
  assert.ok(breaks >= 4);
  const buf = await renderPdf({
    title: { name: "Patria draft" },
    draft: sentences,
    cards: [],
    sources: [],
    howToRead: {
      title: "How to read this review",
      labels: ["Green — nothing raised"],
      lineNote: "Line numbers point into the source.",
      disclaimer: "This is one reader's view of the draft against the sources supplied.",
    },
    disclaimer: "This is one reader's view of the draft against the sources supplied.",
  }, { draft: true });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 100);
  assert.equal(buf.slice(0, 4).toString(), "%PDF");
});

test("US spelling rewrites programme/neighbours; UK reverses; quotes kept", () => {
  const us = applyAccountSpelling(
    'The neighbours joined the programme. He said "our neighbours programme".',
    "US"
  );
  assert.match(us, /neighbors joined the program/);
  assert.match(us, /"our neighbours programme"/);
  const uk = applyAccountSpelling("The neighbors joined the program.", "UK");
  assert.match(uk, /neighbours joined the programme/);
  assert.equal(
    applyDraftHouseStyle("The realisations surprised the neighbours.", { houseStyle: { spelling: "US" } }),
    "The realizations surprised the neighbors."
  );
  assert.equal(
    applyDraftHouseStyle("The realizations surprised the neighbors.", { houseStyle: { spelling: "UK" } }),
    "The realisations surprised the neighbours."
  );
});
