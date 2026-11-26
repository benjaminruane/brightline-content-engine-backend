/**
 * B601. Differing figures red; status settles status only; US spelling notes;
 * cause/support clauses checked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { applyExitGateToResponse } from "../lib/qc/exit-gate.mjs";
import { findSpellingNotes } from "../lib/qc/house-spelling-check.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(path.join(ROOT, "fixtures/b601", name), "utf8"));
}

function face(card) {
  const q = card?.qcCard || card || {};
  return {
    label: q.sentenceLabel || q.combinedVerdict?.label || "",
    reason: q.shownReason || "",
    state: q.sentenceState || q.statementVerdict?.state || "",
    statusNeedsConfirm: q.statusNeedsConfirm === true,
    statusDependent: q.statusDependent === true,
    house: Array.isArray(q.houseStyleConcerns) ? q.houseStyleConcerns : [],
    branch: q.setBy?.branch || q.statementVerdict?.setBy?.branch || "",
  };
}

test("F32 R30 S4 differing figure is red; R31 S5 stays red", () => {
  const r30 = restampAnalyseResponse(load("kestrel-call-r30.json"));
  const s4 = face(r30.statements[3]);
  assert.equal(s4.label, "Conflicts with the source");
  assert.equal(s4.state, "conflicts");
  assert.match(s4.reason, /20%/);

  const r31 = restampAnalyseResponse({
    ...load("helvetia-r31.json"),
    meta: { ...(load("helvetia-r31.json").meta || {}), houseStyle: { spelling: "US" } },
  });
  const s5 = face(r31.statements[4]);
  assert.equal(s5.label, "Conflicts with the source");
  assert.match(s5.reason, /0\.6|0\.8/);
});

test("F33 R30 S3 red with pending reason and no buttons; Aldermoor S1 amber with buttons", () => {
  const r30 = restampAnalyseResponse(load("kestrel-call-r30.json"));
  const s3 = face(r30.statements[2]);
  assert.equal(s3.label, "Conflicts with the source");
  assert.equal(s3.statusNeedsConfirm, false);
  assert.match(
    s3.reason,
    /signed on 18 September 2026 and completion was expected on or around 2 October 2026/i,
  );

  const ald = JSON.parse(
    readFileSync(path.join(ROOT, "fixtures/b600/aldermoor-live-b599.json"), "utf8"),
  );
  const out = applyExitGateToResponse(restampAnalyseResponse(ald), {
    subject: "Aldermoor Capital Fund VI",
    eventType: "NEW_PRIMARY_COMMITMENT",
  });
  const s1 = face(out.statements[0]);
  assert.equal(s1.label, "Needs a look");
  assert.equal(s1.statusNeedsConfirm, true);
  assert.match(s1.reason, /Confirm its status below/i);
});

test("F17 R31 gets favourable and programme notes; US draft stays zero", () => {
  const r31 = restampAnalyseResponse({
    ...load("helvetia-r31.json"),
    meta: {
      ...(load("helvetia-r31.json").meta || {}),
      houseStyle: { spelling: "US" },
      scenario: "DIRECT_INVESTMENT_REVALUATION",
    },
  });
  const words = r31.statements.flatMap((row) =>
    (row.qcCard?.houseStyleConcerns || [])
      .filter((c) => c.kind === "house_spelling" || c.ruleId === "english_variant")
      .map((c) => String(c.surface || "").toLowerCase()),
  );
  assert.ok(words.includes("favourable"), `expected favourable, got ${words.join(",")}`);
  assert.ok(words.includes("programme"), `expected programme, got ${words.join(",")}`);

  // R09-style: US draft, British source words only in quotes/source → zero draft notes.
  const usDraft = "The organization will organize the program in favor of the center.";
  assert.equal(findSpellingNotes(usDraft, "US").length, 0);
});

test("F34 R32 S3 amber names underlying performance; R31 S1 stays beyond", () => {
  const r32 = restampAnalyseResponse({
    ...load("vale-r32.json"),
    meta: {
      ...(load("vale-r32.json").meta || {}),
      dealStatus: "Approved",
      scenario: "NEW_SECONDARY_INVESTMENT",
    },
  });
  const s3 = face(r32.statements[2]);
  assert.equal(s3.label, "Goes beyond the source");
  assert.match(s3.reason, /underlying performance/i);
  assert.equal(s3.branch, "attributionClause");

  const r31 = restampAnalyseResponse(load("helvetia-r31.json"));
  const s1 = face(r31.statements[0]);
  assert.equal(s1.label, "Goes beyond the source");
});
