/**
 * B245: export canonical text and prose-writer payloads from the shared fixture.
 * Re-bless the golden only with UPDATE_EXPORT_GOLDEN=meridian-2026-09-18
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { renderCanonicalExportText } from "../lib/qc/export-review-data.mjs";
import { collectMarginNotes } from "../lib/qc/constructive-feedback.mjs";
import { buildSortedEntries } from "../lib/revise-actions/sort.mjs";
import { synthesisPayloadHasBlankFinding } from "../lib/qc/blank-finding-guard.mjs";
import {
  fixtureDraftText,
  loadMeridianLiveFixture,
} from "./helpers/loadMeridianLiveFixture.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = path.join(ROOT, "tests/fixtures/b245");
const GOLDEN_PATH = path.join(GOLDEN_DIR, "meridian-2026-09-18.export.txt");
const GOLDEN_BLESS_TOKEN = "meridian-2026-09-18";
const DISCLAIMER =
  "Compliance flags are based on commonly-observed principles and are not jurisdiction-specific or a substitute for legal counsel. Editorial and Evidence flags are guidance for the reviewer's judgment. All flags require human confirmation before publication.";
const EDITORIAL_NOTE_FRAGMENT = "first-person plural";

function qualityReviewSummary() {
  return {
    readiness: "Needs work",
    bullets: [
      "2 claims have no source behind them. Remove them or find supporting evidence before this draft is final.",
      "3 claims have only partial support from the cited sources. Strengthen the evidence where you can.",
      "1 claim has editorial notes. Work through the cards below before this draft is ready.",
      "The draft is 9 words over the 150 word limit.",
    ],
  };
}

function exportTextFrom(payload) {
  const draft = fixtureDraftText(payload);
  return renderCanonicalExportText({
    qcResult: payload,
    qualityReviewSummary: qualityReviewSummary(),
    sources: (payload.sources || []).map((row) => ({
      name: row.label || row.name,
      fileType: "txt",
    })),
    draft,
    meta: { reviewDisclaimerText: DISCLAIMER },
    reviewOptions: payload?.meta?.reviewOptions,
  });
}

function cloneFixture() {
  return JSON.parse(JSON.stringify(loadMeridianLiveFixture()));
}

describe("B245 export golden and prose payloads", () => {
  test("canonical export matches the committed golden file", () => {
    const payload = loadMeridianLiveFixture();
    const actual = exportTextFrom(payload);
    if (process.env.UPDATE_EXPORT_GOLDEN === GOLDEN_BLESS_TOKEN) {
      mkdirSync(GOLDEN_DIR, { recursive: true });
      writeFileSync(GOLDEN_PATH, actual);
    }
    assert.equal(existsSync(GOLDEN_PATH), true, `missing golden at ${GOLDEN_PATH}`);
    const expected = readFileSync(GOLDEN_PATH, "utf8");
    assert.equal(actual, expected);
  });

  test("re-blessing the golden requires the fixture token", () => {
    const src = readFileSync(path.join(ROOT, "tests/b245-export-and-payloads.test.mjs"), "utf8");
    assert.equal(src.includes("GOLDEN_BLESS_TOKEN"), true);
    assert.equal(src.includes('process.env.UPDATE_EXPORT_GOLDEN === GOLDEN_BLESS_TOKEN'), true);
  });

  test("constructive feedback margin notes come from the cards", () => {
    const payload = loadMeridianLiveFixture();
    const notes = collectMarginNotes(
      payload.statements,
      payload.meta.reviewOptions,
      fixtureDraftText(payload)
    );
    assert.equal(notes.length, 6);
    assert.equal(notes.filter((note) => note.kind === "evidence").length, 5);
    const editorial = notes.find((note) => note.kind === "editorial");
    assert.equal(Boolean(editorial), true);
    assert.equal(String(editorial.cardNote).includes(EDITORIAL_NOTE_FRAGMENT), true);
    assert.equal(String(editorial.statementText).includes("We recommend approval"), true);
  });

  test("revise action list is sorted from the cards without a model call", () => {
    const payload = loadMeridianLiveFixture();
    const entries = buildSortedEntries(payload.statements);
    assert.equal(entries.length, 6);
    assert.equal(
      entries.every((entry) => entry.disposition === "ACTION" || entry.disposition === "ACKNOWLEDGE"),
      true
    );
    const editorial = entries.find((entry) => entry.kind === "editorial");
    assert.equal(editorial.disposition, "ACTION");
    assert.equal(editorial.rule, "voice_consistency");
    assert.equal(String(editorial.statement).includes("We recommend approval"), true);
  });

  test("export.js uses the shared builder and does not keep a local copy", () => {
    const src = readFileSync(path.join(ROOT, "api/export.js"), "utf8");
    assert.equal(src.includes('from "../lib/qc/export-review-data.mjs"'), true);
    assert.equal(/function buildReviewData\(/.test(src), false);
    assert.equal(src.includes("qcResult?.meta?.reviewOptions"), true);
  });
});

describe("B245 corruptions", () => {
  test("i unrecognised displayVerdict is not Confirmed in the file", () => {
    const payload = cloneFixture();
    payload.statements[0].qcCard.displayVerdict = "not_a_real_slug";
    const text = exportTextFrom(payload);
    const card0Slice = text.split(`"${payload.statements[0].qcCard.statement}"`)[1].slice(0, 400);
    assert.equal(card0Slice.includes("Verdict: Confirmed"), false);
    assert.equal(card0Slice.includes("Verdict: Unverifiable"), true);
    assert.equal(text.includes("Verdict: Confirmed"), true);
  });

  test("ii editorialEnabled false does not describe editorial as checked", () => {
    const payload = cloneFixture();
    payload.meta.reviewOptions.editorialEnabled = false;
    const flipped = exportTextFrom(payload);
    assert.equal(flipped.includes(EDITORIAL_NOTE_FRAGMENT), false);
    const editorialLines = flipped
      .split("\n")
      .filter((line) => line.startsWith("Editorial note:"));
    assert.equal(
      editorialLines.every((line) => !line.includes(EDITORIAL_NOTE_FRAGMENT)),
      true
    );
    assert.equal(editorialLines.some((line) => /Editorial note: (?!Not checked\.).+/.test(line)), false);
  });

  test("iii empty editorial note is a blank finding the assessment guard refuses", () => {
    const payload = cloneFixture();
    payload.statements[6].qcCard.editorialConcerns[0].note = "";
    const guard = synthesisPayloadHasBlankFinding({
      editorialConcerns: [
        { statement: payload.statements[6].text, concern: payload.statements[6].qcCard.editorialConcerns[0].note },
      ],
      complianceConcerns: [],
      notSupportedStatements: [],
      conflictingStatements: [],
      partialStatements: [],
    });
    assert.equal(guard, true);
  });
});
