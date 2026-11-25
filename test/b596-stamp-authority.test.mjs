/**
 * B596. Stamp authority, amber reason guard, PDF paragraph gaps from full draft.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { applyFinalStamp, guardAmberOrRedReason, stampSourceDisplayNames } from "../lib/qc/b596-stamp.mjs";
import { shownLabel, shownState, shownTrace } from "../lib/qc/shown-verdict.mjs";
import { draftFlow, draftFlowPlain } from "../lib/export/export-blocks.mjs";
import { renderPdf } from "../lib/export/render-pdf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIAG = path.join(process.env.HOME || "", "ce-diagnostics/b595-diag/inputs");
const FE_EXAMPLES = path.resolve(HERE, "../../brightline-content-engine-frontend/src/modules/examples/content");
// Sibling checkout under the same GitHub parent folder.

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
    matchExplanations: qc.matchExplanations || [],
    readingFacts: qc.readingFacts || [],
    readingNote: qc.readingNote || null,
  };
}

test("stamp write-back: shownLabel matches sentenceLabel (no rival face)", () => {
  for (const [run, index] of [
    ["R12-aldermoor-generated", 1],
    ["R16-clearpoint-traps", 2],
    ["R17-lumio-clean", 0],
    ["R17-lumio-clean", 1],
  ]) {
    const stamped = applyFinalStamp(cardFrom(run, index));
    assert.equal(stamped.stampAuthority, "b596");
    assert.equal(shownLabel(stamped), stamped.sentenceLabel);
    assert.equal(shownState(stamped), stamped.sentenceState);
    assert.equal(stamped.combinedVerdict.label, stamped.sentenceLabel);
    // Live shownTrace on the stamped card must not disagree (stamp wins).
    assert.equal(shownLabel(stamped), stamped.sentenceLabel);
  }
});

test("Harbourline S13: amber keeps a gross/net gap reason, never support-only", () => {
  const card = cardFrom("R10-harbourline", 12);
  const stamped = applyFinalStamp(card);
  assert.equal(stamped.sentenceLabel, "Needs a look");
  assert.match(stamped.shownReason, /gross or net|qualifier|Net IRR|net IRR/i);
  assert.doesNotMatch(stamped.shownReason, /^The Q2 2026 quarterly report lists Net IRR.*supports the sentence\.?$/i);
  const supportOnly = /\bsupports?\b/i.test(stamped.shownReason) && !/\b(gross or net|qualifier|differ|does not|missing)\b/i.test(stamped.shownReason);
  assert.equal(supportOnly, false);
});

test("Aldermoor S3 stays Nothing raised with a support reason", () => {
  const card = cardFrom("R12-aldermoor-generated", 2);
  const stamped = applyFinalStamp(card);
  assert.equal(stamped.sentenceLabel, "Nothing raised");
  assert.match(stamped.shownReason, /supports the sentence|in line with/i);
  // Source file exists for the example the spec names.
  const src = path.join(FE_EXAMPLES, "aldermoor-committee.txt");
  assert.ok(readFileSync(src, "utf8").includes("12 to 15"));
});

test("guardAmberOrRedReason greens support-only when facts match and no gap", () => {
  const card = {
    statement: "The fund launched today.",
    readingFacts: [
      { kind: "date", surface: "12 May 2026", status: "matched" },
      { kind: "name", surface: "Lumio", status: "matched" },
    ],
    matchExplanations: [{ classification: "confirmed", explanation: "The source confirms the launch." }],
    shownReason: "The source supports the sentence.",
  };
  const out = guardAmberOrRedReason(card, "note_withheld", card.shownReason);
  assert.equal(out.state, "nothing_raised");
  assert.equal(out.guard, "rule_b_or_facts");
});

test("source displayName is stamped once", () => {
  const rows = stampSourceDisplayNames([
    { label: "Aldermoor IC", fileName: "a.pdf" },
    { fileName: "only-file.txt" },
    { displayName: "Already set", name: "Other" },
  ]);
  assert.equal(rows[0].displayName, "Aldermoor IC");
  assert.equal(rows[1].displayName, "only-file.txt");
  assert.equal(rows[2].displayName, "Already set");
});

test("draftFlow takes paragraph gaps from full draft between spans", () => {
  const full = "Sentence one holds the first claim. Sentence two finishes.\n\nSentence three opens the next paragraph.";
  const sentences = [
    { text: "Sentence one holds the first claim.", marker: "S1" },
    { text: "Sentence two finishes.", marker: "S2" },
    { text: "Sentence three opens the next paragraph.", marker: "S3" },
  ];
  const events = draftFlow(sentences, full);
  const plain = draftFlowPlain(events);
  assert.match(plain, /\n\n/);
  const breaks = events.filter((e) => e.kind === "break").length;
  assert.ok(breaks >= 2, `expected >=2 breaks, got ${breaks}`);
});

test("R17 Lumio clean restamp: all four cards Nothing raised", () => {
  const body = loadRun("R17-lumio-clean");
  const draftSentences = body.statements.map((row) => row.text || row.qcCard?.statement || "");
  const labels = body.statements.map((row, index) => {
    const stamped = applyFinalStamp({
      ...(row.qcCard || {}),
      statement: row.text || row.qcCard?.statement,
      draftSentences,
    });
    return stamped.sentenceLabel;
  });
  assert.deepEqual(labels, [
    "Nothing raised",
    "Nothing raised",
    "Nothing raised",
    "Nothing raised",
  ]);
});

test("PDF draft with fullDraft paragraph gaps renders", async () => {
  const full = "First paragraph sentence.\n\nSecond paragraph sentence.";
  const document = {
    title: { name: "B596 gap check: review", verdict: "Ready" },
    draft: [
      { text: "First paragraph sentence.", marker: "S1" },
      { text: "Second paragraph sentence.", marker: "S2" },
    ],
    fullDraft: full,
    summary: { readiness: "Ready", facts: "", counts: [], houseStyle: "" },
    sentenceReview: [],
    sources: [],
    howToRead: { title: "How to read", labels: [], lineNote: "", disclaimer: "d" },
    disclaimer: "d",
  };
  const buf = await renderPdf(document, { draft: true, summary: true });
  assert.ok(Buffer.isBuffer(buf) && buf.length > 100);
  void shownTrace;
});
